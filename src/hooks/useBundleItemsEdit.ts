import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Shared bundle-edit state for gift-box products.
//
// Lifted out of BundleCustomiser so the maternity-bundle product page
// can render an inline editable grid AND mount BundleCustomiser behind
// a toggle, both editing the same composition. The Postpartum / Baby
// Shower legacy mounts pass no editApi and the customiser falls back
// to calling this hook internally (uncontrolled mode).
//
// Data sources (mirrors what BundleCustomiser used to do internally):
//   - For maternity bundles (product name matches the regex below),
//     defaults come from the latest maternity_bundle_snapshots row.
//   - For other gift boxes, defaults come from the get_gift_box_price
//     RPC.
//   - Available brand options come from brands_public (in_stock,
//     price > 0).
//   - gender_relevant + gender_colors come from products.

export interface BrandRow {
  id: string;
  product_id?: string;
  sku?: string | null;
  brand_name: string;
  price: number;
  tier: string | null;
  image_url?: string | null;
  stored_image_url?: string | null;
  size_variant: string | null;
  variant_type?: string | null;
  in_stock: boolean;
}

export interface DefaultItem {
  product_id: string;
  product_name: string;
  brand_id: string | null;
  brand_name: string | null;
  brand_sku?: string | null;
  brand_image_url?: string | null;
  brand_size_variant?: string | null;
  unit_price: number;
  quantity: number;
  is_enabled?: boolean;
}

export interface BundleItem {
  product_id: string;
  product_name: string;
  selected_brand: BrandRow;
  available_brands: BrandRow[];
  quantity: number;
  is_included: boolean;
  is_default: boolean;
  // Gender axis — only populated when products.gender_relevant === true
  // for this item. Carried through to cart for order fulfilment.
  selected_gender: string | null;
}

export interface GenderInfo {
  gender_relevant: boolean;
  gender_colors: Record<string, string> | null;
}

export interface BundleEditApi {
  isLoading: boolean;
  bundleItems: BundleItem[];
  includedItems: BundleItem[];
  currentTotalPrice: number;
  defaultPrice: number;            // original snapshot/RPC sell_price
  retailTotal: number;             // original retail sum for savings calc
  removedDefaultCount: number;     // default items the customer excluded
  genderMap: Record<string, GenderInfo>;
  // Mutators
  toggleInclude: (productId: string) => void;
  selectBrand: (productId: string, brand: BrandRow) => void;
  setItemGender: (productId: string, key: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  removeCustomItem: (productId: string) => void;
  resetToDefault: () => void;
  addCatalogItem: (p: { id: string; name: string; brands: BrandRow[] }) => "ok" | "already" | "no-brands";
}

export function useBundleItemsEdit(productId: string, productName: string): BundleEditApi {
  const isMaternityBundle = /^Maternity( \+ Baby Items)? Bundle/i.test(productName || "");

  // ── Load default items + the original "sell price" reference ──────
  const defaultsQuery = useQuery({
    queryKey: ["bundle-items-edit", productId],
    enabled: !!productId,
    queryFn: async () => {
      if (isMaternityBundle) {
        const { data, error } = await (supabase as any)
          .from("maternity_bundle_snapshots")
          .select("items_snapshot, retail_total, sell_price")
          .eq("bundle_id", productId)
          .order("snapped_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        const snap = data as any;
        const items: DefaultItem[] = ((snap?.items_snapshot || []) as any[]).map((it) => ({
          product_id: String(it?.product_id ?? ""),
          product_name: it?.name || "—",
          brand_id: it?.brand?.id ?? null,
          brand_name: it?.brand?.brand_name ?? null,
          brand_sku: it?.brand?.sku ?? null,
          brand_image_url: it?.brand?.image_url ?? null,
          brand_size_variant: it?.brand?.size_variant ?? null,
          unit_price: Number(it?.brand?.price ?? 0),
          quantity: Number(it?.quantity ?? 1),
          is_enabled: true,
        }));
        return {
          items,
          sell_price: Number(snap?.sell_price ?? 0),
          retail_total: Number(snap?.retail_total ?? 0),
        };
      }
      const { data, error } = await (supabase as any).rpc("get_gift_box_price", { p_gift_box_id: productId });
      if (error) throw error;
      const raw = data as any;
      const items: DefaultItem[] = (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => ({
        product_id: String(it.product_id),
        product_name: it.product_name,
        brand_id: it.brand_id,
        brand_name: it.brand_name,
        brand_sku: it.brand_sku ?? null,
        // get_gift_box_price may emit image_url/size_variant at either level.
        brand_image_url: it.image_url ?? it.brand?.image_url ?? null,
        brand_size_variant: it.size_variant ?? it.brand?.size_variant ?? null,
        unit_price: Number(it.unit_price ?? 0),
        quantity: Number(it.quantity ?? 1),
        is_enabled: it.is_enabled !== false,
      }));
      return {
        items,
        sell_price: Number(raw?.sell_price ?? 0),
        retail_total: Number(raw?.retail_total ?? 0),
      };
    },
    staleTime: 60_000,
  });

  const productIds = (defaultsQuery.data?.items || []).map((i) => i.product_id);
  // Stable key (sorted) so re-orders don't bust the cache.
  const productIdsKey = productIds.slice().sort().join(",");

  // ── Gender info per item product ──────────────────────────────────
  const genderQuery = useQuery({
    queryKey: ["bundle-edit-gender", productIdsKey],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, gender_relevant, gender_colors")
        .in("id", productIds);
      if (error) throw error;
      const map: Record<string, GenderInfo> = {};
      ((data || []) as any[]).forEach((p) => {
        map[p.id] = {
          gender_relevant: !!p.gender_relevant,
          gender_colors: p.gender_colors || null,
        };
      });
      return map;
    },
    staleTime: 60_000,
  });

  // ── Available brand options per item product ──────────────────────
  const brandsQuery = useQuery({
    queryKey: ["bundle-edit-brands", productIdsKey],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brands_public")
        .select("id, product_id, sku, brand_name, price, tier, image_url, stored_image_url, size_variant, variant_type, in_stock")
        .in("product_id", productIds)
        .eq("in_stock", true)
        .gt("price", 0)
        .order("price");
      if (error) throw error;
      const map: Record<string, BrandRow[]> = {};
      ((data || []) as BrandRow[]).forEach((b) => {
        const k = (b as any).product_id as string;
        if (!map[k]) map[k] = [];
        map[k].push(b);
      });
      return map;
    },
    staleTime: 60_000,
  });

  // ── Build initial bundle items state once data resolves ───────────
  const [bundleItems, setBundleItems] = useState<BundleItem[]>([]);
  const [initialised, setInitialised] = useState(false);

  const buildInitialItems = useMemo(() => {
    if (!defaultsQuery.data) return null;
    const brandsMap = brandsQuery.data || {};
    const genderMap = genderQuery.data || {};
    return defaultsQuery.data.items
      .filter((it) => it.is_enabled !== false)
      .map<BundleItem>((it) => {
        const pool = brandsMap[it.product_id] || [];
        const seeded: BrandRow = pool.find((b) => b.id === it.brand_id) || {
          id: it.brand_id || `${it.product_id}-default`,
          sku: it.brand_sku ?? null,
          brand_name: it.brand_name || "—",
          price: it.unit_price,
          tier: null,
          image_url: it.brand_image_url ?? null,
          size_variant: it.brand_size_variant ?? null,
          in_stock: true,
        };
        const gender = genderMap[it.product_id];
        const seedGender = gender?.gender_relevant && gender?.gender_colors
          ? (Object.keys(gender.gender_colors).find((k) => k === "neutral") || Object.keys(gender.gender_colors)[0] || null)
          : null;
        return {
          product_id: it.product_id,
          product_name: it.product_name,
          selected_brand: seeded,
          available_brands: pool,
          quantity: it.quantity || 1,
          is_included: true,
          is_default: true,
          selected_gender: seedGender,
        };
      });
  }, [defaultsQuery.data, brandsQuery.data, genderQuery.data]);

  useEffect(() => {
    // Gate on BOTH defaults AND the brand pool (when there are product
    // ids to look up) so each selected_brand inherits the real brand
    // row instead of the synthetic fallback. Otherwise images / size
    // variants would be missing on first render.
    if (initialised) return;
    if (!buildInitialItems) return;
    if (productIds.length > 0 && !brandsQuery.data) return;
    setBundleItems(buildInitialItems);
    setInitialised(true);
  }, [buildInitialItems, initialised, brandsQuery.data, productIds.length]);

  // ── Derivations ───────────────────────────────────────────────────
  const includedItems = useMemo(
    () => bundleItems.filter((i) => i.is_included),
    [bundleItems],
  );
  const currentTotalPrice = useMemo(
    () => includedItems.reduce((sum, i) => sum + i.selected_brand.price * i.quantity, 0),
    [includedItems],
  );
  const removedDefaultCount = useMemo(
    () => bundleItems.filter((i) => i.is_default && !i.is_included).length,
    [bundleItems],
  );

  // ── Mutators ──────────────────────────────────────────────────────
  const toggleInclude = (pid: string) =>
    setBundleItems((items) => items.map((i) => (i.product_id === pid ? { ...i, is_included: !i.is_included } : i)));

  const selectBrand = (pid: string, brand: BrandRow) =>
    setBundleItems((items) => items.map((i) => (i.product_id === pid ? { ...i, selected_brand: brand } : i)));

  const setItemGender = (pid: string, key: string) =>
    setBundleItems((items) => items.map((i) => (i.product_id === pid ? { ...i, selected_gender: key } : i)));

  const updateQuantity = (pid: string, newQty: number) => {
    if (newQty < 1) return;
    setBundleItems((items) => items.map((i) => (i.product_id === pid ? { ...i, quantity: newQty } : i)));
  };

  const removeCustomItem = (pid: string) =>
    setBundleItems((items) => items.filter((i) => !(i.product_id === pid && !i.is_default)));

  const resetToDefault = () => {
    if (buildInitialItems) setBundleItems(buildInitialItems);
  };

  const addCatalogItem: BundleEditApi["addCatalogItem"] = (p) => {
    const shoppable = (p.brands || []).filter((b) => b.in_stock && b.price > 0);
    if (shoppable.length === 0) return "no-brands";
    const existing = bundleItems.find((i) => i.product_id === p.id);
    if (existing) {
      if (!existing.is_included) toggleInclude(p.id);
      return "already";
    }
    const cheapest = shoppable[0];
    setBundleItems((prev) => [
      ...prev,
      {
        product_id: p.id,
        product_name: p.name,
        selected_brand: cheapest,
        available_brands: shoppable,
        quantity: 1,
        is_included: true,
        is_default: false,
        selected_gender: null,
      },
    ]);
    return "ok";
  };

  return {
    isLoading:
      defaultsQuery.isLoading ||
      (productIds.length > 0 && brandsQuery.isLoading && !initialised),
    bundleItems,
    includedItems,
    currentTotalPrice,
    defaultPrice: defaultsQuery.data?.sell_price || 0,
    retailTotal: defaultsQuery.data?.retail_total || 0,
    removedDefaultCount,
    genderMap: genderQuery.data || {},
    toggleInclude,
    selectBrand,
    setItemGender,
    updateQuantity,
    removeCustomItem,
    resetToDefault,
    addCatalogItem,
  };
}
