import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
// The merchandising tables aren't in the generated types yet; cast the
// client so TS doesn't reject the new table names. Behaviour is unchanged.
const supabase = supabaseTyped as any;
import { adaptProducts, type Product } from "@/lib/supabaseAdapters";
import { getBrandImage } from "@/lib/brandImage";

const STALE_5MIN = 5 * 60 * 1000;
const STALE_60SEC = 60 * 1000;

/** Product with overrides surfaced from the merchandising pin row. */
export type MerchPinnedProduct = Product & {
  _pinDisplayLabel?: string | null;
  _pinDefaultBrandId?: string | null;
};

/** Shape returned by section/category pinned-product hooks (and the
 *  fallback variants), so consumers can treat both arrays uniformly. */
export interface SectionPinnedProduct {
  product: Product;
  displayLabel: string | null;
  defaultBrandId: string | null;
}

const BRAND_COLS =
  "id, product_id, brand_name, price, tier, is_default_for_tier, size_variant, in_stock, stock_quantity, display_order, image_url, stored_image_url, thumbnail_url, logo_url, compare_at_price, images, weight_range_kg, pack_count, diaper_type";

// Admin variant — includes `cost_price` and `sku` which aren't exposed via
// the public `brands_public` view. Used only by admin section/category hooks.
const ADMIN_BRAND_COLS = `${BRAND_COLS}, cost_price, sku`;

// Storefront PRODUCT_COLS: aliased embed (`brands:brands_public!brands_product_id_fkey(...)`) keeps
// the JSON key as `brands` so adapters/consumers don't need to change.
const PRODUCT_COLS =
  `*, brands:brands_public!brands_product_id_fkey(${BRAND_COLS}), product_sizes(*), product_colors(*), product_tags(*), product_images(*)`;

export type ShopVariant = "all" | "baby" | "mum";

// ----------------------------------------------------------------------------
// NEW flat-grid ranking — get_merchandised_products(scope, seed)
// ----------------------------------------------------------------------------

/** One RPC row: the resolved brand + effective promo price for the card. */
export interface MerchRankRow {
  product_id: string;
  name: string;
  slug: string;
  category: string | null;
  subcategory: string | null;
  brand_id: string | null;
  brand_name: string | null;
  sku: string | null;
  price: number | null;
  compare_at_price: number | null;
  promo_type: string | null;
  promo_label: string | null;
  promo_ends_at: string | null;
  image_url: string | null;
  rank_position: number | null;
  is_pinned: boolean;
}

/**
 * The single-source storefront ranking for a scope. The RPC applies the
 * active/in-stock/bundle rules, promo pricing, the pinned 1..25 order and the
 * SEEDED daily shuffle for the tail — the frontend renders what it returns, in
 * the order it returns.
 *
 * SEED: we pass p_seed = null, so the DB uses today's Lagos date. The full
 * ordered list for the scope is fetched ONCE (react-query cached by scope) and
 * pagination is client-side slicing of that single list — so the order is
 * identical across every "page" (no per-request seed, no page-2 duplicates).
 */
export function useMerchandisedRanking(scope: string | null | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ["merchandised-ranking", scope],
    enabled: !!scope,
    // Stable for the session: today's Lagos date drives the shuffle server-side.
    staleTime: STALE_5MIN,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_merchandised_products", { p_scope: scope, p_seed: null });
      if (error) throw error;
      return (data || []) as MerchRankRow[];
    },
  });
  const rows = data ?? [];
  // Memoised so consumers can depend on these maps without re-running effects
  // every render.
  const orderIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.product_id, i));
    return m;
  }, [data]);
  const brandByProduct = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => { if (r.brand_id) m.set(r.product_id, r.brand_id); });
    return m;
  }, [data]);
  return { rows, orderIndex, brandByProduct, ready: !!data, isLoading };
}

export interface MerchSection {
  id: string;
  shop: ShopVariant;
  category_slug: string;
  section_order: number;
  is_active: boolean;
  section_label: string | null;
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    stage_order: number | null;
  } | null;
}

export interface MerchSectionProductRow {
  id: string;
  shop: ShopVariant;
  category_slug: string;
  product_id: string;
  product_order: number;
  is_active: boolean;
}

/**
 * Sections for a given shop variant, joined to the category for icon/name.
 * Ordered by section_order. Inactive sections are filtered out for the
 * storefront — admin reads should pass `includeInactive=true`.
 */
export function useShopSections(shop: ShopVariant, includeInactive = false) {
  return useQuery({
    queryKey: ["merch_shop_sections", shop, includeInactive],
    queryFn: async () => {
      let q = supabase
        .from("merch_shop_sections")
        .select(
          "id, shop, category_slug, section_order, is_active, section_label, " +
          "product_categories!merch_shop_sections_category_slug_fkey(id, name, slug, icon, stage_order)"
        )
        .eq("shop", shop)
        .order("section_order");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        category: row.product_categories || null,
      })) as MerchSection[];
    },
    staleTime: STALE_5MIN,
  });
}

/**
 * Curated product list for a section. Returns adapted Product[]. Caller
 * should fall back to useFallbackSectionProducts when this returns empty.
 */
export function useSectionProducts(shop: ShopVariant, categorySlug: string, limit = 10) {
  return useQuery({
    queryKey: ["merch_section_products", shop, categorySlug, limit],
    queryFn: async () => {
      // products!inner forces PostgREST to drop curated rows whose joined
      // product is missing/filtered, and the embedded `.eq/.is` filters push
      // is_active/deleted_at down to the joined table BEFORE limit applies.
      // Without this, an inactive product would still consume one of the
      // `limit` slots and we'd silently render fewer cards.
      const { data: rows, error } = await supabase
        .from("merch_section_products")
        .select(`id, product_id, product_order, is_active, display_label, default_brand_id, products!inner(${PRODUCT_COLS})`)
        .eq("shop", shop)
        .eq("category_slug", categorySlug)
        .eq("is_active", true)
        .eq("products.is_active", true)
        .is("products.deleted_at", null)
        .order("product_order")
        .limit(limit);
      if (error) throw error;
      // JS-side belt-and-braces: even if the embedded filter were ever
      // bypassed, never let an inactive product through. Pair each adapted
      // Product with the pin's display_label / default_brand_id so the
      // storefront can apply overrides without the legacy `_pin*` fields.
      const safeRows = (rows || [])
        .filter((r: any) => r.products && r.products.is_active !== false && !r.products.deleted_at);
      const productRows = safeRows.map((r: any) => r.products);
      const adapted = adaptProducts(productRows) as Product[];
      const out: SectionPinnedProduct[] = adapted.map((product, i) => ({
        product,
        displayLabel: safeRows[i]?.display_label ?? null,
        defaultBrandId: safeRows[i]?.default_brand_id ?? null,
      }));
      return out;
    },
    staleTime: STALE_5MIN,
    enabled: !!shop && !!categorySlug,
  });
}

/**
 * Fallback when the curated list is empty — most-recent products in the
 * subcategory, capped at 10. Returns the SectionPinnedProduct shape with
 * displayLabel/defaultBrandId always null so callers can treat curated +
 * fallback uniformly.
 */
export function useFallbackSectionProducts(categorySlug: string, limit = 10) {
  return useQuery({
    queryKey: ["merch_fallback_products", categorySlug, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_COLS)
        .eq("subcategory", categorySlug)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const adapted = adaptProducts(data || []) as Product[];
      const out: SectionPinnedProduct[] = adapted.map(product => ({
        product,
        displayLabel: null,
        defaultBrandId: null,
      }));
      return out;
    },
    staleTime: STALE_5MIN,
    enabled: !!categorySlug,
  });
}

/**
 * Popularity-ranked categories for a shop variant.
 *
 * Popularity = SUM(order_items.quantity) per products.subcategory over the
 * last 180 days. Categories with zero active products are filtered out.
 * Tie-break is `stage_order` ASC. Returned shape matches what the section
 * renderer needs (slug, name, icon, parent_category, stage_order).
 *
 * The query is intentionally client-side aggregated — keeps us off RPCs
 * that may not exist yet, and the dataset (orders × items) is small enough
 * for that to be fine. Cached 5 min via TanStack Query.
 */
export interface PopularCategory {
  slug: string;
  name: string;
  icon: string | null;
  parent_category: string | null;
  stage_order: number | null;
  popularity: number;
}

export function usePopularCategories(shop: ShopVariant) {
  return useQuery<PopularCategory[]>({
    queryKey: ["popular_categories", shop],
    queryFn: async () => {
      const sinceIso = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch order items in the window. Paginate defensively in 1000-row pages.
      const orderItems: Array<{ product_id: string; quantity: number }> = [];
      const PAGE = 1000;
      let from = 0;
      // Hard cap to avoid runaway loops on bad data.
      for (let i = 0; i < 50; i++) {
        const { data, error } = await supabase
          .from("order_items")
          .select("product_id, quantity, created_at")
          .gte("created_at", sinceIso)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data || [];
        orderItems.push(...rows.map((r: any) => ({ product_id: r.product_id, quantity: Number(r.quantity) || 0 })));
        if (rows.length < PAGE) break;
        from += PAGE;
      }

      // All active products → product_id → subcategory map.
      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, subcategory, is_active, deleted_at")
        .eq("is_active", true)
        .is("deleted_at", null);
      if (pErr) throw pErr;
      const productSubcat = new Map<string, string>();
      const subcatActiveCount = new Map<string, number>();
      for (const p of (products || []) as any[]) {
        if (!p.subcategory) continue;
        productSubcat.set(p.id, p.subcategory);
        subcatActiveCount.set(p.subcategory, (subcatActiveCount.get(p.subcategory) || 0) + 1);
      }

      // Aggregate popularity per subcategory.
      const popularity = new Map<string, number>();
      for (const oi of orderItems) {
        const slug = productSubcat.get(oi.product_id);
        if (!slug) continue;
        popularity.set(slug, (popularity.get(slug) || 0) + oi.quantity);
      }

      // All active categories.
      const { data: cats, error: cErr } = await supabase
        .from("product_categories")
        .select("slug, name, icon, parent_category, stage_order, is_active")
        .eq("is_active", true);
      if (cErr) throw cErr;

      let filtered = (cats || []) as any[];
      if (shop === "baby") {
        filtered = filtered.filter(c => c.parent_category === "baby" || c.parent_category === "both");
      } else if (shop === "mum") {
        filtered = filtered.filter(c => c.parent_category === "mum" || c.parent_category === "both");
      }
      // Skip empty categories.
      filtered = filtered.filter(c => (subcatActiveCount.get(c.slug) || 0) > 0);

      const ranked: PopularCategory[] = filtered.map(c => ({
        slug: c.slug,
        name: c.name,
        icon: c.icon ?? null,
        parent_category: c.parent_category ?? null,
        stage_order: c.stage_order ?? null,
        popularity: popularity.get(c.slug) || 0,
      }));

      ranked.sort((a, b) => {
        if (b.popularity !== a.popularity) return b.popularity - a.popularity;
        const sa = a.stage_order ?? 9999;
        const sb = b.stage_order ?? 9999;
        return sa - sb;
      });

      return ranked;
    },
    staleTime: STALE_5MIN,
  });
}

/**
 * Admin-only: every row in merch_section_products for a shop+slug, with
 * the joined product. Used by the merchandising admin to render the
 * editable list (so removing one product doesn't require optimistic UI).
 */
// ----------------------------------------------------------------------------
// Category-page pins — drives /shop/[category-slug]
// ----------------------------------------------------------------------------

const CATEGORY_PINS_KEY = (categorySlug: string) => ["merch_category_page_pins", categorySlug] as const;
const CATEGORY_PINS_ADMIN_KEY = (categorySlug: string) => ["merch_category_page_pins_admin", categorySlug] as const;

/**
 * Storefront: pinned products for a category page, ordered. Mirrors the
 * `useSectionProducts` join pattern with embedded filters on the products
 * row plus a JS belt-and-braces filter so an inactive product can never
 * leak through.
 */
export function useCategoryPagePins(categorySlug: string) {
  return useQuery({
    queryKey: CATEGORY_PINS_KEY(categorySlug),
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("merch_category_products")
        .select(`id, product_id, product_order, is_active, display_label, default_brand_id, products!inner(${PRODUCT_COLS})`)
        .eq("category_slug", categorySlug)
        .eq("is_active", true)
        .eq("products.is_active", true)
        .is("products.deleted_at", null)
        .order("product_order");
      if (error) throw error;
      const safeRows = (rows || [])
        .filter((r: any) => r.products && r.products.is_active !== false && !r.products.deleted_at);
      const productRows = safeRows.map((r: any) => r.products);
      const adapted = adaptProducts(productRows) as Product[];
      const out: SectionPinnedProduct[] = adapted.map((product, i) => ({
        product,
        displayLabel: safeRows[i]?.display_label ?? null,
        defaultBrandId: safeRows[i]?.default_brand_id ?? null,
      }));
      return out;
    },
    staleTime: STALE_5MIN,
    enabled: !!categorySlug,
  });
}

/**
 * Admin variant: every row regardless of `is_active` so admins see
 * deactivated pins too. (Currently used by the merchandising admin tab.)
 */
export function useCategoryPagePinsAdmin(categorySlug: string, enabled = true) {
  return useQuery({
    queryKey: CATEGORY_PINS_ADMIN_KEY(categorySlug),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merch_category_products")
        .select(`id, product_id, product_order, is_active, display_label, default_brand_id, products(id, name, emoji, image_url, subcategory, is_active, deleted_at, brands!brands_product_id_fkey(${ADMIN_BRAND_COLS}))`)
        .eq("category_slug", categorySlug)
        .order("product_order");
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
    enabled: enabled && !!categorySlug,
  });
}

// ---- Helper: surfaced brand picker (single source of truth) ----------------

/**
 * Pick which brand to surface on a product card. If `defaultBrandId` is set
 * and matches one of the product's brands, that brand wins. Otherwise we
 * fall back to the cheapest in-stock brand (sorted by tier ASC), which is
 * the legacy behaviour used across the storefront.
 */
export function pickSurfacedBrand(product: Product, defaultBrandId: string | null) {
  if (defaultBrandId) {
    const match = product.brands.find(b => b.id === defaultBrandId);
    if (match) return match;
  }
  const sorted = product.brands.slice().sort((a, b) => a.tier - b.tier);
  const inStock = sorted.filter(b => b.inStock !== false);
  return inStock[0] || sorted[0] || null;
}

function invalidateCategoryPins(qc: ReturnType<typeof useQueryClient>, categorySlug: string) {
  qc.invalidateQueries({ queryKey: CATEGORY_PINS_KEY(categorySlug) });
  qc.invalidateQueries({ queryKey: CATEGORY_PINS_ADMIN_KEY(categorySlug) });
}

export function useAddCategoryPagePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categorySlug, productId, productOrder,
    }: { categorySlug: string; productId: string; productOrder: number }) => {
      const { error } = await supabase.from("merch_category_products").insert({
        category_slug: categorySlug,
        product_id: productId,
        product_order: productOrder,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateCategoryPins(qc, vars.categorySlug),
  });
}

export function useRemoveCategoryPagePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; categorySlug: string }) => {
      const { error } = await supabase.from("merch_category_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateCategoryPins(qc, vars.categorySlug),
  });
}

export function useToggleCategoryPagePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean; categorySlug: string }) => {
      const { error } = await supabase
        .from("merch_category_products")
        .update({ is_active: isActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateCategoryPins(qc, vars.categorySlug),
  });
}

/**
 * Reorder pins by swapping a pair. Two-step swap pattern (write -1 first)
 * to avoid the (category_slug, product_order) — well, there isn't a unique
 * on order, but we mirror the pattern used elsewhere for safety.
 *
 * Accepts `[a, b]` — the two rows to swap orders for.
 */
export function useReorderCategoryPagePins() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      a, b,
    }: { a: { id: string; product_order: number }; b: { id: string; product_order: number }; categorySlug: string }) => {
      const { error: e1 } = await supabase.from("merch_category_products").update({ product_order: -1 }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("merch_category_products").update({ product_order: a.product_order }).eq("id", b.id);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from("merch_category_products").update({ product_order: b.product_order }).eq("id", a.id);
      if (e3) throw e3;
    },
    onSuccess: (_d, vars) => invalidateCategoryPins(qc, vars.categorySlug),
  });
}

export function useAdminSectionProducts(shop: ShopVariant, categorySlug: string, enabled = true) {
  return useQuery({
    queryKey: ["admin_merch_section_products", shop, categorySlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merch_section_products")
        .select(`id, product_id, product_order, is_active, display_label, default_brand_id, products(id, name, emoji, image_url, subcategory, is_active, deleted_at, brands!brands_product_id_fkey(${ADMIN_BRAND_COLS}))`)
        .eq("shop", shop)
        .eq("category_slug", categorySlug)
        .order("product_order");
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
    enabled,
  });
}

// ----------------------------------------------------------------------------
// Pin override mutations — display_label + default_brand_id + page heading
// ----------------------------------------------------------------------------

function invalidateSectionPins(
  qc: ReturnType<typeof useQueryClient>,
  shop: ShopVariant,
  categorySlug: string,
) {
  qc.invalidateQueries({ queryKey: ["admin_merch_section_products", shop, categorySlug] });
  qc.invalidateQueries({ queryKey: ["merch_section_products", shop, categorySlug] });
}

export function useUpdateSectionPinLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pinId, label,
    }: { pinId: string; label: string | null; shop: ShopVariant; categorySlug: string }) => {
      const { error } = await supabase
        .from("merch_section_products")
        .update({ display_label: label })
        .eq("id", pinId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateSectionPins(qc, vars.shop, vars.categorySlug),
  });
}

export function useUpdateSectionPinBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pinId, brandId,
    }: { pinId: string; brandId: string | null; shop: ShopVariant; categorySlug: string }) => {
      const { error } = await supabase
        .from("merch_section_products")
        .update({ default_brand_id: brandId })
        .eq("id", pinId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateSectionPins(qc, vars.shop, vars.categorySlug),
  });
}

export function useUpdateCategoryPinLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pinId, label,
    }: { pinId: string; label: string | null; categorySlug: string }) => {
      const { error } = await supabase
        .from("merch_category_products")
        .update({ display_label: label })
        .eq("id", pinId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateCategoryPins(qc, vars.categorySlug),
  });
}

export function useUpdateCategoryPinBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pinId, brandId,
    }: { pinId: string; brandId: string | null; categorySlug: string }) => {
      const { error } = await supabase
        .from("merch_category_products")
        .update({ default_brand_id: brandId })
        .eq("id", pinId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateCategoryPins(qc, vars.categorySlug),
  });
}

export function useUpdateCategoryPageLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categorySlug, label,
    }: { categorySlug: string; label: string | null }) => {
      const { error } = await supabase
        .from("product_categories")
        .update({ merch_page_label: label })
        .eq("slug", categorySlug);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-categories"] });
    },
  });
}

// ----------------------------------------------------------------------------
// Section Brands — per-(category, product, brand) overrides for the brand
// swiper rendered on /shop/[category-slug] product sections.
// ----------------------------------------------------------------------------

export interface SectionBrandOverrideRow {
  id: string;
  category_slug: string;
  product_id: string;
  brand_id: string;
  brand_order: number | null;
  display_label: string | null;
  is_active: boolean;
}

const OVERRIDES_KEY = (categorySlug: string) => ["merch_category_section_brands", categorySlug] as const;
const SECTION_BRANDS_KEY = (categorySlug: string, productId: string) =>
  ["section_brands", categorySlug, productId] as const;

export type SectionBrandOverrideMap = Map<
  string,
  { brand_order: number | null; display_label: string | null; is_active: boolean }
>;

/** Storefront: all override rows for a category page. Returned as a Map
 *  keyed by `${product_id}|${brand_id}` so the swiper renderer can do an
 *  O(1) lookup per brand without iterating the row list. */
export function useCategorySectionBrandOverrides(categorySlug: string) {
  return useQuery({
    queryKey: OVERRIDES_KEY(categorySlug),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merch_category_section_brands")
        .select("id, category_slug, product_id, brand_id, brand_order, display_label, is_active")
        .eq("category_slug", categorySlug);
      if (error) throw error;
      const map: SectionBrandOverrideMap = new Map();
      for (const r of (data || []) as SectionBrandOverrideRow[]) {
        map.set(`${r.product_id}|${r.brand_id}`, {
          brand_order: r.brand_order,
          display_label: r.display_label,
          is_active: r.is_active,
        });
      }
      return map;
    },
    staleTime: STALE_60SEC,
    enabled: !!categorySlug,
  });
}

/** Admin shape: brand row + its override (if any) + computed effective
 *  fields, sorted using the same rule the storefront applies. */
export interface SectionBrandRow {
  brand: {
    id: string;
    brand_name: string;
    image_url: string | null;
    price: number | null;
    cost_price: number | null;
    in_stock: boolean | null;
    display_order: number | null;
  };
  override: SectionBrandOverrideRow | null;
  effectiveOrder: number | null;
  effectiveLabel: string;
  effectiveActive: boolean;
  isOverridden: boolean;
}

function compareSectionBrands(a: SectionBrandRow, b: SectionBrandRow) {
  // brand_order ASC NULLS LAST → price ASC NULLS LAST → display_order ASC NULLS LAST → id ASC
  const ao = a.override?.brand_order;
  const bo = b.override?.brand_order;
  if (ao != null || bo != null) {
    if (ao == null) return 1;
    if (bo == null) return -1;
    if (ao !== bo) return ao - bo;
  }
  const ap = a.brand.price;
  const bp = b.brand.price;
  if (ap != null || bp != null) {
    if (ap == null) return 1;
    if (bp == null) return -1;
    if (ap !== bp) return ap - bp;
  }
  const ad = a.brand.display_order;
  const bd = b.brand.display_order;
  if (ad != null || bd != null) {
    if (ad == null) return 1;
    if (bd == null) return -1;
    if (ad !== bd) return ad - bd;
  }
  return a.brand.id.localeCompare(b.brand.id);
}

/** Storefront-aligned sort applied to a list of brands annotated with the
 *  current override row. Exported so CategoryPage can apply identical
 *  ordering without re-querying. */
export function sortBrandsWithOverrides<B extends {
  id: string; price: number | null; display_order: number | null;
}>(
  brands: B[],
  overrideForBrand: (brandId: string) => { brand_order: number | null } | null,
): B[] {
  const wrapped = brands.map(brand => ({
    brand,
    override: overrideForBrand(brand.id),
  }));
  wrapped.sort((a, b) => {
    const ao = a.override?.brand_order;
    const bo = b.override?.brand_order;
    if (ao != null || bo != null) {
      if (ao == null) return 1;
      if (bo == null) return -1;
      if (ao !== bo) return ao - bo;
    }
    const ap = a.brand.price;
    const bp = b.brand.price;
    if (ap != null || bp != null) {
      if (ap == null) return 1;
      if (bp == null) return -1;
      if (ap !== bp) return ap - bp;
    }
    const ad = a.brand.display_order;
    const bd = b.brand.display_order;
    if (ad != null || bd != null) {
      if (ad == null) return 1;
      if (bd == null) return -1;
      if (ad !== bd) return ad - bd;
    }
    return a.brand.id.localeCompare(b.brand.id);
  });
  return wrapped.map(w => w.brand);
}

/** Admin: all brands of a product joined with their override row for the
 *  given category page. Sorted using the storefront rule. */
export function useSectionBrands(categorySlug: string, productId: string, enabled = true) {
  return useQuery({
    queryKey: SECTION_BRANDS_KEY(categorySlug, productId),
    queryFn: async () => {
      const { data: brandRows, error: bErr } = await supabase
        .from("brands")
        .select("id, product_id, brand_name, image_url, stored_image_url, price, cost_price, in_stock, display_order")
        .eq("product_id", productId);
      if (bErr) throw bErr;

      const { data: overrideRows, error: oErr } = await supabase
        .from("merch_category_section_brands")
        .select("id, category_slug, product_id, brand_id, brand_order, display_label, is_active")
        .eq("category_slug", categorySlug)
        .eq("product_id", productId);
      if (oErr) throw oErr;

      const overrideByBrand = new Map<string, SectionBrandOverrideRow>();
      for (const o of (overrideRows || []) as SectionBrandOverrideRow[]) {
        overrideByBrand.set(o.brand_id, o);
      }

      const out: SectionBrandRow[] = (brandRows || []).map((b: any) => {
        const override = overrideByBrand.get(b.id) || null;
        const effectiveLabel = (override?.display_label?.trim() || b.brand_name || "") as string;
        const effectiveActive = override ? override.is_active : true;
        return {
          brand: {
            id: b.id,
            brand_name: b.brand_name,
            image_url: getBrandImage(b),
            price: b.price ?? null,
            cost_price: b.cost_price ?? null,
            in_stock: b.in_stock ?? null,
            display_order: b.display_order ?? null,
          },
          override,
          effectiveOrder: override?.brand_order ?? null,
          effectiveLabel,
          effectiveActive,
          isOverridden: !!override,
        };
      });
      out.sort(compareSectionBrands);
      return out;
    },
    staleTime: STALE_60SEC,
    enabled: enabled && !!categorySlug && !!productId,
  });
}

function invalidateSectionBrandQueries(
  qc: ReturnType<typeof useQueryClient>,
  categorySlug: string,
  productId?: string,
) {
  qc.invalidateQueries({ queryKey: OVERRIDES_KEY(categorySlug) });
  if (productId) qc.invalidateQueries({ queryKey: SECTION_BRANDS_KEY(categorySlug, productId) });
  else qc.invalidateQueries({ queryKey: ["section_brands", categorySlug] });
}

export function useUpsertSectionBrandOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categorySlug, productId, brandId, fields,
    }: {
      categorySlug: string;
      productId: string;
      brandId: string;
      fields: Partial<{ brand_order: number | null; display_label: string | null; is_active: boolean }>;
    }) => {
      const payload: any = {
        category_slug: categorySlug,
        product_id: productId,
        brand_id: brandId,
        ...fields,
      };
      const { error } = await supabase
        .from("merch_category_section_brands")
        .upsert(payload, { onConflict: "category_slug,product_id,brand_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Saved");
      invalidateSectionBrandQueries(qc, vars.categorySlug, vars.productId);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save"),
  });
}

export function useToggleSectionBrandActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categorySlug, productId, brandId, nextActive,
    }: { categorySlug: string; productId: string; brandId: string; nextActive: boolean }) => {
      const { error } = await supabase
        .from("merch_category_section_brands")
        .upsert(
          {
            category_slug: categorySlug,
            product_id: productId,
            brand_id: brandId,
            is_active: nextActive,
          },
          { onConflict: "category_slug,product_id,brand_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Saved");
      invalidateSectionBrandQueries(qc, vars.categorySlug, vars.productId);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save"),
  });
}

export function useReorderSectionBrands() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categorySlug, productId, brandIdsInOrder,
    }: { categorySlug: string; productId: string; brandIdsInOrder: string[] }) => {
      if (brandIdsInOrder.length === 0) return;
      const rows = brandIdsInOrder.map((brandId, i) => ({
        category_slug: categorySlug,
        product_id: productId,
        brand_id: brandId,
        brand_order: i + 1,
      }));
      const { error } = await supabase
        .from("merch_category_section_brands")
        .upsert(rows, { onConflict: "category_slug,product_id,brand_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Saved");
      invalidateSectionBrandQueries(qc, vars.categorySlug, vars.productId);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save"),
  });
}

export function useResetSectionBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categorySlug, productId, brandId,
    }: { categorySlug: string; productId: string; brandId: string }) => {
      const { data, error } = await supabase
        .from("merch_category_section_brands")
        .delete()
        .eq("category_slug", categorySlug)
        .eq("product_id", productId)
        .eq("brand_id", brandId)
        .select("id");
      if (error) throw error;
      return (data || []).length as number;
    },
    onSuccess: (count, vars) => {
      if (count === 0) {
        toast.message("Already at default");
      } else {
        toast.success("Reset to default");
      }
      invalidateSectionBrandQueries(qc, vars.categorySlug, vars.productId);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to reset"),
  });
}

export function useResetAllSectionBrands() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categorySlug, productId,
    }: { categorySlug: string; productId: string }) => {
      const { error } = await supabase
        .from("merch_category_section_brands")
        .delete()
        .eq("category_slug", categorySlug)
        .eq("product_id", productId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("All brands reset to default");
      invalidateSectionBrandQueries(qc, vars.categorySlug, vars.productId);
    },
    onError: (e: any) => toast.error(e?.message || "Failed to reset"),
  });
}
