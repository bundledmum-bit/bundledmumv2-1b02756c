import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { getBrandImage } from "@/lib/brandImage";
// brands.updated_at and a few admin filters aren't in the generated types yet;
// cast the supabase client to any so TS doesn't reject the new columns. Same
// pattern as src/hooks/useMerchandising.ts.
const supabase = supabaseTyped as any;

const STALE_60S = 60 * 1000;

export type BundleTier = "starter" | "standard" | "premium";

export interface BrandMarginRow {
  id: string;
  productId: string;
  productName: string;
  brandName: string;
  imageUrl: string | null;
  category: string | null;
  subcategory: string | null;
  inStock: boolean;
  isActive: boolean;          // products.is_active
  tier: BundleTier | null;    // brands.tier (nullable on some rows)
  costPrice: number | null;
  retailPrice: number;
  bundleTiers: BundleTier[];
}

export interface BrandMarginFilters {
  category?: string;
  subcategory?: string;
  inStock?: "all" | "in" | "out";
  bundle?: "all" | "in" | "out" | BundleTier;
  missingCostOnly?: boolean;
}

/**
 * Returns one row per brand of an active product, with the brand's bundle-tier
 * membership rolled up. Filtering is applied client-side — the dataset is
 * small enough (low thousands of rows max) that this is cheaper than chaining
 * filters in PostgREST.
 */
export function useBrandMargins(filters?: BrandMarginFilters) {
  return useQuery<BrandMarginRow[]>({
    queryKey: ["brand-margins"],
    queryFn: async () => {
      // 1. brands joined to products (inner). We no longer filter to
      // is_active=true here so the page's Active/Inactive filter can
      // toggle between them. is_active and tier are exposed on the row.
      // Supabase's implicit 1000-row cap was silently clipping the SKU
      // table (1,358 brands existed; only 1,000 were rendered). 9999 is
      // the PostgREST single-call max and gives ~7x headroom; if the
      // catalog ever exceeds that, this becomes a paginate-or-virtualize
      // problem.
      const { data: brandRows, error: be } = await supabase
        .from("brands")
        .select(
          // products!inner is now AMBIGUOUS: a reverse FK
          // products.hospital_list_default_brand_id -> brands.id was added, so
          // PostgREST sees two brands<->products relationships (PGRST201). Pin
          // the intended one by its FK name.
          "id, product_id, brand_name, image_url, stored_image_url, price, cost_price, in_stock, tier, products!brands_product_id_fkey!inner(id, name, category, subcategory, is_active)",
        )
        .range(0, 9999);
      if (be) throw be;

      // 2. Bundle membership map: product_id → set of tiers.
      const { data: bundleRows, error: bre } = await supabase
        .from("bundles")
        .select("id, tier, is_active");
      if (bre) throw bre;
      const activeBundleIdToTier = new Map<string, BundleTier>();
      for (const b of (bundleRows || []) as any[]) {
        if (b.is_active && (b.tier === "starter" || b.tier === "standard" || b.tier === "premium")) {
          activeBundleIdToTier.set(b.id, b.tier);
        }
      }

      const { data: itemRows, error: ie } = await supabase
        .from("bundle_items")
        .select("bundle_id, product_id");
      if (ie) throw ie;
      const productTiers = new Map<string, Set<BundleTier>>();
      for (const it of (itemRows || []) as any[]) {
        const tier = activeBundleIdToTier.get(it.bundle_id);
        if (!tier) continue;
        if (!productTiers.has(it.product_id)) productTiers.set(it.product_id, new Set());
        productTiers.get(it.product_id)!.add(tier);
      }

      const rows: BrandMarginRow[] = (brandRows || []).map((b: any) => {
        const tiers = Array.from(productTiers.get(b.product_id) || []);
        // Stable order: starter, standard, premium.
        tiers.sort((a, b) => {
          const order = { starter: 0, standard: 1, premium: 2 } as const;
          return order[a] - order[b];
        });
        const rawTier = typeof b.tier === "string" ? b.tier.toLowerCase() : "";
        const normalisedTier: BundleTier | null =
          rawTier === "starter" || rawTier === "standard" || rawTier === "premium"
            ? (rawTier as BundleTier)
            : null;
        return {
          id: b.id,
          productId: b.product_id,
          productName: b.products?.name || "Unknown product",
          brandName: b.brand_name || "",
          imageUrl: getBrandImage(b),
          category: b.products?.category ?? null,
          subcategory: b.products?.subcategory ?? null,
          inStock: b.in_stock !== false,
          isActive: b.products?.is_active !== false,
          tier: normalisedTier,
          costPrice: b.cost_price == null ? null : Number(b.cost_price),
          retailPrice: Number(b.price) || 0,
          bundleTiers: tiers,
        };
      });

      // Client-side filtering.
      let filtered = rows;
      if (filters?.category) {
        filtered = filtered.filter(r => r.category === filters.category);
      }
      if (filters?.subcategory) {
        filtered = filtered.filter(r => r.subcategory === filters.subcategory);
      }
      if (filters?.inStock && filters.inStock !== "all") {
        filtered = filtered.filter(r => (filters.inStock === "in" ? r.inStock : !r.inStock));
      }
      if (filters?.bundle && filters.bundle !== "all") {
        if (filters.bundle === "in") {
          filtered = filtered.filter(r => r.bundleTiers.length > 0);
        } else if (filters.bundle === "out") {
          filtered = filtered.filter(r => r.bundleTiers.length === 0);
        } else {
          filtered = filtered.filter(r => r.bundleTiers.includes(filters.bundle as BundleTier));
        }
      }
      if (filters?.missingCostOnly) {
        filtered = filtered.filter(r => r.costPrice == null);
      }
      return filtered;
    },
    staleTime: STALE_60S,
  });
}

// ---------------------------------------------------------------------------
// Single-row update.
// ---------------------------------------------------------------------------

// One admin_save_brand_price result (returns TABLE(...) -> array of one row).
export interface SaveBrandPriceResult {
  saved: boolean;
  needs_confirmation: boolean;
  floor_price: number | null;
  resulting_markup: number | null;
  message: string | null;
}

// Turn a raw floor/permission error into a human message.
export function friendlyPriceError(e: any): string {
  const msg = String(e?.message || e || "");
  if (/super\s*admin|not\s*authoris|permission|only a super/i.test(msg)) {
    return "Only a super admin can price below the markup floor.";
  }
  return msg || "Save failed";
}

// Inline single-brand price save. NEVER writes brands.price directly — routes
// through admin_save_brand_price so the floor + super-admin guard apply. Returns
// the RPC row; the caller shows the confirm dialog when needs_confirmation and
// re-calls with confirm=true.
export function useUpdateBrandPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ brandId, cost, newPrice, confirm }: {
      brandId: string; cost: number; newPrice: number; confirm?: boolean;
    }): Promise<SaveBrandPriceResult> => {
      const { data, error } = await supabase.rpc("admin_save_brand_price", {
        p_brand_id: brandId,
        p_cost_price: Math.trunc(cost),
        p_price: Math.trunc(newPrice),
        p_confirm_below_floor: !!confirm,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) as SaveBrandPriceResult;
    },
    onSuccess: (res) => {
      if (res?.saved) {
        qc.invalidateQueries({ queryKey: ["brand-margins"] });
        qc.invalidateQueries({ queryKey: ["bundle-tier-rollup"] });
        qc.invalidateQueries({ queryKey: ["bundle-staleness"] });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Bulk apply margin %.
// ---------------------------------------------------------------------------

// One below-floor row surfaced by the bulk dry run for the summary dialog.
export interface BulkBelowFloorItem {
  brandId: string;
  brandName: string;
  price: number;                    // proposed retail
  cost: number;
  resultingMarkup: number | null;
  floorPrice: number | null;
}

export interface BulkDryRunResult {
  updated: number;                  // at/above floor — SAVED on this pass
  skippedNoCost: number;            // no cost_price — cannot be priced by the RPC
  belowFloor: BulkBelowFloorItem[]; // NOT saved; need explicit confirmation
}

// PHASE 1 — dry run: call admin_save_brand_price(confirm=false) for every
// costed brand. At/above-floor rows save immediately; below-floor rows come back
// needs_confirmation (unsaved) and are collected for the single summary dialog.
// Brands with no cost_price are skipped cleanly (the RPC requires a cost).
async function dryRunApplyMargin(brandIds: string[], marginPct: number): Promise<BulkDryRunResult> {
  if (brandIds.length === 0) return { updated: 0, skippedNoCost: 0, belowFloor: [] };

  const { data: rows, error } = await supabase
    .from("brands")
    .select("id, brand_name, cost_price")
    .in("id", brandIds);
  if (error) throw error;

  const planned = ((rows || []) as any[])
    .map((r) => ({ id: r.id, brandName: r.brand_name || "", cost: r.cost_price == null ? null : Number(r.cost_price) }))
    .filter((r) => r.cost != null && (r.cost as number) > 0) as { id: string; brandName: string; cost: number }[];
  const skippedNoCost = (rows || []).length - planned.length;

  const outcomes = await Promise.all(planned.map(async (p) => {
    const price = Math.trunc(p.cost * (1 + marginPct / 100));
    const { data, error: se } = await supabase.rpc("admin_save_brand_price", {
      p_brand_id: p.id, p_cost_price: Math.trunc(p.cost), p_price: price, p_confirm_below_floor: false,
    });
    if (se) throw se;
    const res = (Array.isArray(data) ? data[0] : data) as SaveBrandPriceResult;
    return { p, price, res };
  }));

  let updated = 0;
  const belowFloor: BulkBelowFloorItem[] = [];
  for (const o of outcomes) {
    if (o.res?.needs_confirmation) {
      belowFloor.push({
        brandId: o.p.id, brandName: o.p.brandName, price: o.price, cost: o.p.cost,
        resultingMarkup: o.res.resulting_markup, floorPrice: o.res.floor_price,
      });
    } else if (o.res?.saved) {
      updated += 1;
    }
  }
  return { updated, skippedNoCost, belowFloor };
}

// PHASE 2 — force the collected below-floor rows with confirm=true. Only a super
// admin can complete this; a non-super-admin throws (surfaced by the caller).
async function forceApplyBelowFloor(items: BulkBelowFloorItem[]): Promise<number> {
  let forced = 0;
  for (const it of items) {
    const { error } = await supabase.rpc("admin_save_brand_price", {
      p_brand_id: it.brandId, p_cost_price: Math.trunc(it.cost), p_price: Math.trunc(it.price), p_confirm_below_floor: true,
    });
    if (error) throw error;
    forced += 1;
  }
  return forced;
}

export function useForceApplyBelowFloor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: BulkBelowFloorItem[]) => forceApplyBelowFloor(items),
    onSuccess: () => invalidateAll(qc),
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["brand-margins"] });
  qc.invalidateQueries({ queryKey: ["bundle-tier-rollup"] });
  qc.invalidateQueries({ queryKey: ["bundle-staleness"] });
}

export function useBulkApplyMargin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ brandIds, marginPct }: { brandIds: string[]; marginPct: number }) =>
      dryRunApplyMargin(brandIds, marginPct),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useBulkApplyMarginByCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ category, marginPct }: { category: string; marginPct: number }) => {
      // In-stock brands of active products in that category.
      const { data, error } = await supabase
        .from("brands")
        .select("id, products!brands_product_id_fkey!inner(category, is_active)")
        .eq("in_stock", true)
        .eq("products.is_active", true)
        .eq("products.category", category);
      if (error) throw error;
      const ids = ((data || []) as any[]).map(r => r.id);
      return dryRunApplyMargin(ids, marginPct);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useBulkApplyMarginByBundleTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tier, marginPct }: { tier: BundleTier; marginPct: number }) => {
      const { data: bundles, error: be } = await supabase
        .from("bundles")
        .select("id")
        .eq("tier", tier)
        .eq("is_active", true);
      if (be) throw be;
      const bundleIds = ((bundles || []) as any[]).map(b => b.id);
      if (bundleIds.length === 0) return { updated: 0, skippedNoCost: 0, belowFloor: [] };

      const { data: items, error: ie } = await supabase
        .from("bundle_items")
        .select("product_id")
        .in("bundle_id", bundleIds);
      if (ie) throw ie;
      const productIds = Array.from(new Set(((items || []) as any[]).map(i => i.product_id)));
      if (productIds.length === 0) return { updated: 0, skippedNoCost: 0, belowFloor: [] };

      const { data: brands, error: bre } = await supabase
        .from("brands")
        .select("id, products!brands_product_id_fkey!inner(is_active)")
        .eq("in_stock", true)
        .eq("products.is_active", true)
        .in("product_id", productIds);
      if (bre) throw bre;
      const brandIds = ((brands || []) as any[]).map(b => b.id);
      return dryRunApplyMargin(brandIds, marginPct);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

// ---------------------------------------------------------------------------
// Bundle tier rollup: per-tier item explosion using the cheapest in-stock
// brand for each product in the bundle.
// ---------------------------------------------------------------------------

export interface TierRollupItem {
  productId: string;
  productName: string;
  qty: number;
  brandName: string;
  costPrice: number | null;
  retailPrice: number;
  marginPct: number;
}

export interface TierRollup {
  tier: BundleTier;
  bundleId: string | null;
  bundleSlug: string | null;
  bundlePrice: number | null;
  productCount: number;
  totalCost: number;
  totalRetail: number;
  marginNaira: number;
  marginPct: number;
  productsWithoutCost: number;
  expandedItems: TierRollupItem[];
}

const TIERS: BundleTier[] = ["starter", "standard", "premium"];

async function fetchTierRollup(tier: BundleTier): Promise<TierRollup> {
  // Pick the active bundle for that tier — first by created_at (oldest first
  // for deterministic ordering when multiple exist).
  const { data: bundles, error: be } = await supabase
    .from("bundles")
    .select("id, slug, name, tier, price, is_active, created_at")
    .eq("tier", tier)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);
  if (be) throw be;
  const bundle = (bundles || [])[0] as any | undefined;
  if (!bundle) {
    return {
      tier,
      bundleId: null,
      bundleSlug: null,
      bundlePrice: null,
      productCount: 0,
      totalCost: 0,
      totalRetail: 0,
      marginNaira: 0,
      marginPct: 0,
      productsWithoutCost: 0,
      expandedItems: [],
    };
  }

  const { data: items, error: ie } = await supabase
    .from("bundle_items")
    .select("product_id, quantity, products(id, name)")
    .eq("bundle_id", bundle.id);
  if (ie) throw ie;

  const productIds = Array.from(new Set(((items || []) as any[]).map(i => i.product_id)));
  // Cheapest in-stock brand per product. Fetch all in-stock brands for those
  // products, then pick the min-price brand client-side per product id.
  const { data: brandRows, error: bre } = await supabase
    .from("brands")
    .select("id, product_id, brand_name, price, cost_price, in_stock")
    .in("product_id", productIds.length === 0 ? ["__none__"] : productIds)
    .eq("in_stock", true);
  if (bre) throw bre;

  const cheapestByProduct = new Map<string, any>();
  for (const b of (brandRows || []) as any[]) {
    const cur = cheapestByProduct.get(b.product_id);
    const price = Number(b.price) || 0;
    if (!cur || price < (Number(cur.price) || 0)) {
      cheapestByProduct.set(b.product_id, b);
    }
  }

  const expandedItems: TierRollupItem[] = [];
  let totalCost = 0;
  let totalRetail = 0;
  let productsWithoutCost = 0;
  for (const it of (items || []) as any[]) {
    const qty = Number(it.quantity) || 0;
    const productName = it.products?.name || "Unknown product";
    const brand = cheapestByProduct.get(it.product_id);
    const cost = brand?.cost_price == null ? null : Number(brand.cost_price);
    const retail = Number(brand?.price) || 0;
    if (cost == null) productsWithoutCost += 1;
    totalCost += qty * (cost ?? 0);
    totalRetail += qty * retail;
    const marginPct = cost != null && cost > 0 ? ((retail - cost) / cost) * 100 : 0;
    expandedItems.push({
      productId: it.product_id,
      productName,
      qty,
      brandName: brand?.brand_name || "—",
      costPrice: cost,
      retailPrice: retail,
      marginPct,
    });
  }

  const marginNaira = totalRetail - totalCost;
  const marginPct = totalCost > 0 ? (marginNaira / totalCost) * 100 : 0;

  return {
    tier,
    bundleId: bundle.id,
    bundleSlug: bundle.slug || null,
    bundlePrice: Number(bundle.price) || 0,
    productCount: (items || []).length,
    totalCost,
    totalRetail,
    marginNaira,
    marginPct,
    productsWithoutCost,
    expandedItems,
  };
}

export function useBundleTierRollup() {
  return useQuery<{ starter: TierRollup; standard: TierRollup; premium: TierRollup }>({
    queryKey: ["bundle-tier-rollup"],
    queryFn: async () => {
      const [starter, standard, premium] = await Promise.all(TIERS.map(fetchTierRollup));
      return { starter, standard, premium };
    },
    staleTime: STALE_60S,
  });
}

// ---------------------------------------------------------------------------
// Bundle staleness: compare bundle.price to sum(item retail).
// ---------------------------------------------------------------------------

export interface TierStaleness {
  bundlePrice: number | null;
  computedTotal: number;
  diff: number;
  isStale: boolean;
  bundleSlug: string | null;
}

export function useBundleStaleness() {
  return useQuery<{ starter: TierStaleness; standard: TierStaleness; premium: TierStaleness }>({
    queryKey: ["bundle-staleness"],
    queryFn: async () => {
      const out: Record<BundleTier, TierStaleness> = {} as any;
      const rollups = await Promise.all(TIERS.map(fetchTierRollup));
      for (const r of rollups) {
        const computed = r.totalRetail;
        const bundlePrice = r.bundlePrice ?? 0;
        const diff = bundlePrice - computed;
        out[r.tier] = {
          bundlePrice: r.bundlePrice,
          computedTotal: computed,
          diff,
          isStale: r.bundleId != null && Math.abs(diff) > 100,
          bundleSlug: r.bundleSlug,
        };
      }
      return out as { starter: TierStaleness; standard: TierStaleness; premium: TierStaleness };
    },
    staleTime: STALE_60S,
  });
}
