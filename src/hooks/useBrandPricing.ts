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
