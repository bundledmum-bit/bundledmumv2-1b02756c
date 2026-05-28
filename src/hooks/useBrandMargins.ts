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
      // 1. brands joined to active products (inner join).
      const { data: brandRows, error: be } = await supabase
        .from("brands")
        .select(
          "id, product_id, brand_name, image_url, stored_image_url, price, cost_price, in_stock, products!inner(id, name, category, subcategory, is_active)",
        )
        .eq("products.is_active", true);
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
        return {
          id: b.id,
          productId: b.product_id,
          productName: b.products?.name || "Unknown product",
          brandName: b.brand_name || "",
          imageUrl: getBrandImage(b),
          category: b.products?.category ?? null,
          subcategory: b.products?.subcategory ?? null,
          inStock: b.in_stock !== false,
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

export function useUpdateBrandPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ brandId, newPrice }: { brandId: string; newPrice: number }) => {
      const truncated = Math.trunc(newPrice);
      const { error } = await supabase
        .from("brands")
        .update({ price: truncated })
        .eq("id", brandId);
      if (error) throw error;
      return truncated;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-margins"] });
      qc.invalidateQueries({ queryKey: ["bundle-tier-rollup"] });
      qc.invalidateQueries({ queryKey: ["bundle-staleness"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Bulk apply margin %.
// ---------------------------------------------------------------------------

interface BulkResult {
  updated: number;
  skipped: number;
}

async function applyMarginToBrandIds(brandIds: string[], marginPct: number): Promise<BulkResult> {
  if (brandIds.length === 0) return { updated: 0, skipped: 0 };

  // Fetch cost prices in one shot.
  const { data: rows, error } = await supabase
    .from("brands")
    .select("id, cost_price")
    .in("id", brandIds);
  if (error) throw error;

  const updates: Array<{ id: string; price: number }> = [];
  let skipped = 0;
  for (const r of (rows || []) as any[]) {
    if (r.cost_price == null) {
      skipped += 1;
      continue;
    }
    const cost = Number(r.cost_price);
    const newPrice = Math.trunc(cost * (1 + marginPct / 100));
    updates.push({ id: r.id, price: newPrice });
  }

  let updated = 0;
  // Issue parallel single-row updates. We don't use upsert here because
  // brands has required NOT-NULL columns we don't want to round-trip.
  const failures: any[] = [];
  await Promise.all(
    updates.map(async (u) => {
      const { error: ue } = await supabase
        .from("brands")
        .update({ price: u.price })
        .eq("id", u.id);
      if (ue) failures.push(ue);
      else updated += 1;
    }),
  );
  if (failures.length > 0 && updated === 0) {
    // All failed — surface the first error.
    throw failures[0];
  }
  return { updated, skipped };
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
      applyMarginToBrandIds(brandIds, marginPct),
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
        .select("id, products!inner(category, is_active)")
        .eq("in_stock", true)
        .eq("products.is_active", true)
        .eq("products.category", category);
      if (error) throw error;
      const ids = ((data || []) as any[]).map(r => r.id);
      return applyMarginToBrandIds(ids, marginPct);
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
      if (bundleIds.length === 0) return { updated: 0, skipped: 0 };

      const { data: items, error: ie } = await supabase
        .from("bundle_items")
        .select("product_id")
        .in("bundle_id", bundleIds);
      if (ie) throw ie;
      const productIds = Array.from(new Set(((items || []) as any[]).map(i => i.product_id)));
      if (productIds.length === 0) return { updated: 0, skipped: 0 };

      const { data: brands, error: bre } = await supabase
        .from("brands")
        .select("id, products!inner(is_active)")
        .eq("in_stock", true)
        .eq("products.is_active", true)
        .in("product_id", productIds);
      if (bre) throw bre;
      const brandIds = ((brands || []) as any[]).map(b => b.id);
      return applyMarginToBrandIds(brandIds, marginPct);
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
