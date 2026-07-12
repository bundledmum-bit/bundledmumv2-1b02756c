import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// SINGLE SOURCE OF TRUTH for what a customer pays: the DB function
// get_brand_effective_price(brand_id, qty). Storefront, cart AND place-order all
// price through this — never compute a promo price in the frontend. BOGO is
// handled inside the function (line_total already accounts for free/discounted
// units), so callers must use line_total and never unit_price * qty.

export interface BrandPrice {
  brandId: string;
  qty: number;
  listPrice: number;      // per-unit list price
  unitPrice: number;      // effective per-unit (averaged) price
  lineTotal: number;      // total charge for this qty (BOGO-aware)
  compareAt: number | null;
  promoType: string | null;   // 'discount' | 'bogo' | null
  promoLabel: string | null;  // e.g. "Buy 1, get 1 free"
  promoEndsAt: string | null;
  saving: number;         // listPrice*qty - lineTotal, when positive
}

function toBrandPrice(brandId: string, qty: number, r: any): BrandPrice {
  const listPrice = Number(r.list_price) || 0;
  const lineTotal = Number(r.line_total) || 0;
  return {
    brandId,
    qty,
    listPrice,
    unitPrice: Number(r.unit_price) || 0,
    lineTotal,
    compareAt: r.compare_at != null ? Number(r.compare_at) : null,
    promoType: r.promo_type ?? null,
    promoLabel: r.promo_label ?? null,
    promoEndsAt: r.promo_ends_at ?? null,
    saving: Math.max(0, listPrice * qty - lineTotal),
  };
}

export async function fetchBrandPrice(brandId: string, qty: number): Promise<BrandPrice | null> {
  const { data, error } = await (supabase as any).rpc("get_brand_effective_price", {
    p_brand_id: brandId,
    p_qty: qty,
  });
  if (error || !data || !data[0]) return null;
  return toBrandPrice(brandId, qty, data[0]);
}

// ── Cross-product GIFT promotions ────────────────────────────────────
// get_earned_gifts(cart) is the SINGLE SOURCE OF TRUTH for auto-added gift
// lines: buy N of a trigger brand, get a DIFFERENT brand free (or X% off).
// The RPC already applies the per-order cap and only returns gifts whose brand
// is active AND in stock, so gifts are pure DERIVED STATE — never persisted,
// re-derived from the real cart on every change. Never price a gift in the
// frontend; use gift_unit_price / gift_line_total verbatim.
export interface EarnedGift {
  triggerBrandId: string;
  triggerBrandName: string | null;
  giftBrandId: string;
  giftBrandName: string | null;
  giftSku: string | null;
  giftProductId: string | null;
  giftProductName: string | null;
  giftQty: number;
  giftUnitPrice: number;   // 0 when free
  giftListPrice: number;   // per-unit list price (strike-through)
  giftLineTotal: number;   // what the customer actually pays for the gift line
  giftLineCost: number;    // our cost of the giveaway (for finance)
  giftImageUrl: string | null;
  promoLabel: string | null;
  promoEndsAt: string | null;
  // A stable key so React can list gift rows without colliding with real lines.
  key: string;
}

function toEarnedGift(r: any): EarnedGift {
  return {
    triggerBrandId: r.trigger_brand_id,
    triggerBrandName: r.trigger_brand_name ?? null,
    giftBrandId: r.gift_brand_id,
    giftBrandName: r.gift_brand_name ?? null,
    giftSku: r.gift_sku ?? null,
    giftProductId: r.gift_product_id ?? null,
    giftProductName: r.gift_product_name ?? null,
    giftQty: Number(r.gift_qty) || 0,
    giftUnitPrice: Number(r.gift_unit_price) || 0,
    giftListPrice: Number(r.gift_list_price) || 0,
    giftLineTotal: Number(r.gift_line_total) || 0,
    giftLineCost: Number(r.gift_line_cost) || 0,
    giftImageUrl: r.gift_image_url ?? null,
    promoLabel: r.promo_label ?? null,
    promoEndsAt: r.promo_ends_at ?? null,
    key: `gift:${r.trigger_brand_id}:${r.gift_brand_id}`,
  };
}

// Aggregate cart lines to the {brand_id, qty} shape get_earned_gifts expects
// (multiple size/colour rows of the same brand collapse into one qty).
export function aggregateCartForGifts(
  lines: { brandId?: string | null; qty: number }[],
): { brand_id: string; qty: number }[] {
  const agg = new Map<string, number>();
  for (const l of lines) {
    if (l.brandId && l.qty > 0) agg.set(l.brandId, (agg.get(l.brandId) || 0) + l.qty);
  }
  return Array.from(agg.entries()).map(([brand_id, qty]) => ({ brand_id, qty }));
}

export async function fetchEarnedGifts(
  cart: { brand_id: string; qty: number }[],
): Promise<EarnedGift[]> {
  if (!cart.length) return [];
  const { data, error } = await (supabase as any).rpc("get_earned_gifts", { p_cart: cart });
  if (error || !Array.isArray(data)) return [];
  return data.map(toEarnedGift);
}

// Derive the earned gifts for a cart. Keyed on the brand:qty signature so any
// cart change re-derives; while a new signature is fetching we return [] (never
// a stale gift), so a gift can never survive its trigger being removed.
export function useEarnedGifts(lines: { brandId?: string | null; qty: number }[]) {
  const cart = aggregateCartForGifts(lines);
  const sig = cart.map((c) => `${c.brand_id}:${c.qty}`).sort().join("|");
  const { data } = useQuery({
    queryKey: ["earned-gifts", sig],
    enabled: cart.length > 0,
    staleTime: 30_000,
    queryFn: () => fetchEarnedGifts(cart),
  });
  return data ?? [];
}

// One brand (default qty 1) — for storefront display: promo badge, strike-through
// compare-at, countdown, and the effective price. React-query caches per brand so
// many cards showing the same brand share a single call.
export function useBrandPromo(brandId: string | null | undefined, qty = 1) {
  const { data } = useQuery({
    queryKey: ["brand-effective-price", brandId, qty],
    enabled: !!brandId,
    staleTime: 60_000,
    queryFn: () => fetchBrandPrice(brandId as string, qty),
  });
  return data ?? null;
}

// Price a set of cart lines. Returns a lookup keyed "brandId:qty" plus a
// `priceLine` helper. Lines without a brandId fall back to list price at the
// call site.
export function useCartEffectivePricing(lines: { brandId?: string | null; qty: number }[]) {
  const uniq = Array.from(
    new Map(
      lines
        .filter((l) => !!l.brandId && l.qty > 0)
        .map((l) => [`${l.brandId}:${l.qty}`, { brandId: l.brandId as string, qty: l.qty }]),
    ).values(),
  );
  const sig = uniq.map((u) => `${u.brandId}:${u.qty}`).sort().join("|");

  const { data } = useQuery({
    queryKey: ["cart-effective-pricing", sig],
    enabled: uniq.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const map = new Map<string, BrandPrice>();
      const results = await Promise.all(uniq.map((u) => fetchBrandPrice(u.brandId, u.qty)));
      results.forEach((r, i) => {
        if (r) map.set(`${uniq[i].brandId}:${uniq[i].qty}`, r);
      });
      return map;
    },
  });

  const byKey = data ?? new Map<string, BrandPrice>();
  return {
    priceLine: (brandId?: string | null, qty = 1): BrandPrice | null =>
      (brandId ? byKey.get(`${brandId}:${qty}`) : undefined) ?? null,
    ready: !!data,
  };
}
