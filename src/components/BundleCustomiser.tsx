import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShoppingBag, X, RotateCcw, Plus } from "lucide-react";
import { fmt, useCart } from "@/lib/cart";

/**
 * Interactive customisation UI for bundle product pages.
 *
 * - Loads the default bundle item list (gift-box RPC or maternity
 *   snapshot depending on product name).
 * - Loads all in-stock brand options for every item product so the
 *   customer can switch variants.
 * - Lets the customer uncheck items, swap brands, add catalogue
 *   products, and reset to the original bundle. Price recomputes
 *   live, client-side, from the included items.
 * - Adds the customised result to the cart as a single bundle row.
 *
 * Customised state is React-only — nothing is persisted to the DB
 * until checkout writes it through the order_items pipeline.
 */
interface BundleCustomiserProps {
  productId: string;
  productName: string;
  bundleLabel: string | null;
  bundleSku: string | null;
}

interface BrandRow {
  id: string;
  product_id?: string;
  sku?: string | null;
  brand_name: string;
  price: number;
  tier: string | null;
  image_url?: string | null;
  size_variant: string | null;
  variant_type?: string | null;
  in_stock: boolean;
}

interface DefaultItem {
  product_id: string;
  product_name: string;
  brand_id: string | null;
  brand_name: string | null;
  unit_price: number;
  quantity: number;
  is_enabled?: boolean;
}

interface BundleItem {
  product_id: string;
  product_name: string;
  selected_brand: BrandRow;
  available_brands: BrandRow[];
  quantity: number;
  is_included: boolean;
  is_default: boolean;
  // Optional gender axis — only populated for products where
  // gender_relevant === true. Stored per-item so the cart payload can
  // carry the choice through to the order.
  selected_gender: string | null;
}

interface GenderInfo {
  gender_relevant: boolean;
  gender_colors: Record<string, string> | null;
}

export default function BundleCustomiser({ productId, productName, bundleLabel, bundleSku }: BundleCustomiserProps) {
  const isMaternityBundle = /^Maternity Bundle/i.test(productName || "");
  const { addToCart } = useCart();

  // ── Load default items + the original "sell price" reference ──────
  const defaultsQuery = useQuery({
    queryKey: ["bundle-customiser-defaults", productId],
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
        const items: DefaultItem[] = ((snap?.items_snapshot || []) as any[]).map(it => ({
          product_id: String(it?.product_id ?? ""),
          product_name: it?.name || "—",
          brand_id: it?.brand?.id ?? null,
          brand_name: it?.brand?.brand_name ?? null,
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
      const { data, error } = await (supabase as any)
        .rpc("get_gift_box_price", { p_gift_box_id: productId });
      if (error) throw error;
      const raw = data as any;
      const items: DefaultItem[] = (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => ({
        product_id: String(it.product_id),
        product_name: it.product_name,
        brand_id: it.brand_id,
        brand_name: it.brand_name,
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

  const productIds = (defaultsQuery.data?.items || []).map(i => i.product_id);
  const productIdsKey = productIds.join(",");

  // ── Load gender flags for every item product ──────────────────────
  const genderQuery = useQuery({
    queryKey: ["bundle-customiser-gender", productIdsKey],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, gender_relevant, gender_colors")
        .in("id", productIds);
      if (error) throw error;
      const map: Record<string, GenderInfo> = {};
      ((data || []) as any[]).forEach(p => {
        map[p.id] = {
          gender_relevant: !!p.gender_relevant,
          gender_colors: p.gender_colors || null,
        };
      });
      return map;
    },
    staleTime: 60_000,
  });

  // ── Load available brands for every item product ──────────────────
  const brandsQuery = useQuery({
    queryKey: ["bundle-customiser-brands", productIdsKey],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brands")
        .select("id, product_id, sku, brand_name, price, tier, image_url, size_variant, variant_type, in_stock")
        .in("product_id", productIds)
        .eq("in_stock", true)
        .gt("price", 0)
        .order("price");
      if (error) throw error;
      const map: Record<string, BrandRow[]> = {};
      ((data || []) as BrandRow[]).forEach(b => {
        const k = (b as any).product_id as string;
        if (!map[k]) map[k] = [];
        map[k].push(b);
      });
      return map;
    },
    staleTime: 60_000,
  });

  // ── Build initial bundle state once data is ready ─────────────────
  const [bundleItems, setBundleItems] = useState<BundleItem[]>([]);
  const [initialised, setInitialised] = useState(false);

  const buildInitialItems = useMemo(() => {
    if (!defaultsQuery.data) return null;
    const brandsMap = brandsQuery.data || {};
    const genderMap = genderQuery.data || {};
    return defaultsQuery.data.items
      .filter(it => it.is_enabled !== false)
      .map<BundleItem>(it => {
        const pool = brandsMap[it.product_id] || [];
        const seeded: BrandRow = pool.find(b => b.id === it.brand_id) || {
          id: it.brand_id || `${it.product_id}-default`,
          brand_name: it.brand_name || "—",
          price: it.unit_price,
          tier: null,
          size_variant: null,
          in_stock: true,
        };
        const gender = genderMap[it.product_id];
        const seedGender = gender?.gender_relevant && gender?.gender_colors
          ? (Object.keys(gender.gender_colors).find(k => k === "neutral") || Object.keys(gender.gender_colors)[0] || null)
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
    if (!initialised && buildInitialItems) {
      setBundleItems(buildInitialItems);
      setInitialised(true);
    }
  }, [buildInitialItems, initialised]);

  // ── Live price ──────────────────────────────────────────────────────
  const bundlePrice = useMemo(() => bundleItems
    .filter(i => i.is_included)
    .reduce((sum, i) => sum + (i.selected_brand.price * i.quantity), 0),
    [bundleItems]);

  const defaultPrice = defaultsQuery.data?.sell_price || 0;
  const priceDelta = bundlePrice - defaultPrice;

  // ── Item mutations ──────────────────────────────────────────────────
  const toggleInclude = (productId: string) => {
    setBundleItems(items => items.map(i => i.product_id === productId ? { ...i, is_included: !i.is_included } : i));
  };
  const selectBrand = (productId: string, brand: BrandRow) => {
    setBundleItems(items => items.map(i => i.product_id === productId ? { ...i, selected_brand: brand } : i));
  };
  const setItemGender = (productId: string, key: string) => {
    setBundleItems(items => items.map(i => i.product_id === productId ? { ...i, selected_gender: key } : i));
  };
  // Min qty 1; no upper bound. bundlePrice recomputes via useMemo.
  const updateQuantity = (productId: string, newQty: number) => {
    if (newQty < 1) return;
    setBundleItems(items => items.map(i => i.product_id === productId ? { ...i, quantity: newQty } : i));
  };
  const removeCustomItem = (productId: string) => {
    setBundleItems(items => items.filter(i => !(i.product_id === productId && !i.is_default)));
  };
  const resetToDefault = () => {
    if (buildInitialItems) setBundleItems(buildInitialItems);
  };

  // ── Add-from-catalogue search ───────────────────────────────────────
  const [addSearch, setAddSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(addSearch.trim()), 300);
    return () => clearTimeout(id);
  }, [addSearch]);

  const searchQuery = useQuery({
    queryKey: ["bundle-customiser-add-search", debouncedSearch],
    enabled: debouncedSearch.length >= 2,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select(`id, name, brands ( id, sku, brand_name, price, tier, in_stock, size_variant )`)
        .ilike("name", `%${debouncedSearch}%`)
        .eq("is_active", true)
        .eq("is_gift_box", false)
        .order("name")
        .limit(10);
      if (error) throw error;
      return (data || []) as { id: string; name: string; brands: BrandRow[] }[];
    },
    staleTime: 30_000,
  });

  const addCatalogueProduct = (p: { id: string; name: string; brands: BrandRow[] }) => {
    const shoppable = (p.brands || []).filter(b => b.in_stock && b.price > 0);
    if (shoppable.length === 0) { toast.error("This product has no shoppable brands."); return; }
    const existing = bundleItems.find(i => i.product_id === p.id);
    if (existing) {
      // Just re-check it
      if (!existing.is_included) toggleInclude(p.id);
      else toast("Already in your bundle.");
      setAddSearch("");
      return;
    }
    const cheapest = shoppable[0];
    setBundleItems(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      selected_brand: cheapest,
      available_brands: shoppable,
      quantity: 1,
      is_included: true,
      is_default: false,
      selected_gender: null,
    }]);
    setAddSearch("");
  };

  // ── Add to cart ─────────────────────────────────────────────────────
  const handleAddToCart = () => {
    const included = bundleItems.filter(i => i.is_included);
    if (included.length === 0) {
      toast.error("Bundle is empty — include at least one item.");
      return;
    }
    addToCart({
      type: "bundle",
      id: productId,
      bundleId: productId,
      bundleName: productName,
      bundleLabel: bundleLabel || "",
      bundleSku: bundleSku || "",
      bundlePrice,
      // Cart context expects price + qty for subtotal sums. The bundle
      // row is a single line at the customised price.
      price: bundlePrice,
      name: `${productName}${bundleLabel ? ` — ${bundleLabel}` : ""}`,
      bundleItems: included.map(i => ({
        productId: i.product_id,
        productName: i.product_name,
        brandId: i.selected_brand.id,
        brandName: i.selected_brand.brand_name,
        sku: i.selected_brand.sku ?? null,
        price: i.selected_brand.price,
        quantity: i.quantity,
        lineTotal: i.selected_brand.price * i.quantity,
        isDefault: i.is_default,
        color: i.selected_gender ?? null,
        size: i.selected_brand.size_variant ?? null,
      })),
      removedDefaultCount: bundleItems.filter(i => i.is_default && !i.is_included).length,
    } as any);
    toast.success(`✓ ${productName} added to cart`, {
      action: { label: "View Cart →", onClick: () => window.location.href = "/cart" },
    });
  };

  if (defaultsQuery.isLoading || (productIds.length > 0 && brandsQuery.isLoading && !initialised)) {
    return (
      <section className="mt-8 bg-card border border-border rounded-card p-5">
        <div className="text-sm text-text-light">Loading bundle contents…</div>
      </section>
    );
  }
  if (!defaultsQuery.data || defaultsQuery.data.items.length === 0) return null;

  const includedCount = bundleItems.filter(i => i.is_included).length;
  const removedDefaultCount = bundleItems.filter(i => i.is_default && !i.is_included).length;

  return (
    <section className="mt-8 bg-card border border-border rounded-card p-5 md:p-6">
      <div className="flex items-end justify-between mb-3 flex-wrap gap-1">
        <h2 className="pf text-xl md:text-2xl font-bold">What's Inside — customise</h2>
        <p className="text-text-med text-sm">{includedCount} item{includedCount === 1 ? "" : "s"} included</p>
      </div>

      {/* Price summary */}
      <div className="bg-forest-light/40 border border-forest/20 rounded-lg p-3 mb-4 flex flex-wrap gap-x-6 gap-y-1 items-baseline">
        <div className="text-sm">
          <span className="text-text-med">Default bundle: </span>
          <span className="font-semibold">{fmt(defaultPrice)}</span>
        </div>
        <div className="text-base">
          <span className="text-text-med">Your bundle: </span>
          <span className="pf font-bold text-forest">{fmt(bundlePrice)}</span>
        </div>
        {priceDelta < 0 && (
          <span className="text-xs font-semibold text-emerald-700">You saved {fmt(Math.abs(priceDelta))}</span>
        )}
        {priceDelta > 0 && (
          <span className="text-xs font-semibold text-coral">+{fmt(priceDelta)} added</span>
        )}
        <button
          onClick={resetToDefault}
          className="ml-auto inline-flex items-center gap-1 text-xs text-text-med hover:text-foreground font-semibold"
        >
          <RotateCcw className="w-3 h-3" /> Reset to default
        </button>
      </div>

      {/* Items list */}
      <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden mb-4">
        {bundleItems.map(item => {
          const lineTotal = item.selected_brand.price * item.quantity;
          // ── Level 1: variant axis (age range / size) ───────────────
          const hasVariants = item.available_brands.some(b => !!b.variant_type);
          const variantOptions = hasVariants
            ? Array.from(new Set(item.available_brands.filter(b => !!b.size_variant).map(b => b.size_variant as string)))
            : [];
          const variantLabel = item.available_brands.find(b => b.variant_type === "age_range")
            ? "Age Range"
            : item.available_brands.find(b => b.variant_type === "size")
              ? "Size"
              : "Variant";
          // ── Level 2: brand pool filtered by selected variant ───────
          const brandsToShow = hasVariants
            ? item.available_brands.filter(b => b.size_variant === item.selected_brand.size_variant)
            : item.available_brands;
          const hasBrandChoice = brandsToShow.length > 1;
          const useDropdown = brandsToShow.length > 3;
          // ── Level 3: gender / colour ───────────────────────────────
          const gender = genderQuery.data?.[item.product_id];
          const colorOptions = gender?.gender_relevant && gender.gender_colors
            ? Object.entries(gender.gender_colors).map(([key, color]) => ({
                key,
                label: key === "boy" ? "Boy" : key === "girl" ? "Girl" : "Neutral",
                color,
              }))
            : [];
          return (
            <li key={item.product_id} className={`px-3 py-2.5 ${item.is_included ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                {item.is_default ? (
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 flex-shrink-0"
                    checked={item.is_included}
                    onChange={() => toggleInclude(item.product_id)}
                  />
                ) : (
                  <button
                    onClick={() => removeCustomItem(item.product_id)}
                    title="Remove"
                    className="mt-0.5 p-0.5 rounded hover:bg-destructive/10 text-destructive flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold ${item.is_included ? "" : "line-through"}`}>
                    {item.product_name}
                    {!item.is_default && <span className="ml-2 text-[10px] uppercase tracking-wider text-coral font-bold">Added</span>}
                  </div>

                  {item.is_included && (
                    <div className="mt-1 space-y-1.5">
                      {/* Level 1 — Age Range / Size */}
                      {hasVariants && variantOptions.length > 1 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light mb-0.5">{variantLabel}</div>
                          <div className="flex flex-wrap gap-1">
                            {variantOptions.map(v => (
                              <button
                                key={v}
                                onClick={() => {
                                  // Snap brand to first match for the new variant
                                  const firstMatch = item.available_brands.find(b => b.size_variant === v);
                                  if (firstMatch) selectBrand(item.product_id, firstMatch);
                                }}
                                className={`text-[11px] px-2 py-0.5 rounded-pill border ${item.selected_brand.size_variant === v ? "border-forest bg-forest-light text-forest font-semibold" : "border-border bg-card text-text-med"}`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Level 2 — Brand (filtered by selected variant) */}
                      {hasBrandChoice ? (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light mb-0.5">Brand</div>
                          {useDropdown ? (
                            <select
                              value={item.selected_brand.id}
                              onChange={e => {
                                const b = item.available_brands.find(x => x.id === e.target.value);
                                if (b) selectBrand(item.product_id, b);
                              }}
                              className="text-[11px] border border-input rounded-md px-2 py-1 bg-background w-full"
                            >
                              {brandsToShow.map(b => (
                                <option key={b.id} value={b.id}>
                                  {b.brand_name} — {fmt(b.price)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {brandsToShow.map(b => (
                                <button
                                  key={b.id}
                                  onClick={() => selectBrand(item.product_id, b)}
                                  className={`text-[11px] px-2 py-0.5 rounded-pill border ${b.id === item.selected_brand.id ? "border-forest bg-forest-light text-forest font-semibold" : "border-border bg-card text-text-med"}`}
                                >
                                  {b.brand_name} — {fmt(b.price)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        // Single-brand product — show the name as static text
                        <div className="text-[11px] text-text-med">{item.selected_brand.brand_name || "—"}</div>
                      )}

                      {/* Level 3 — Colour / Gender */}
                      {colorOptions.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light mb-0.5">Colour</div>
                          <div className="flex flex-wrap gap-1">
                            {colorOptions.map(opt => (
                              <button
                                key={opt.key}
                                onClick={() => setItemGender(item.product_id, opt.key)}
                                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-pill border ${item.selected_gender === opt.key ? "border-forest bg-forest-light text-forest font-semibold" : "border-border bg-card text-text-med"}`}
                              >
                                <span
                                  className="inline-block rounded-full border border-border"
                                  style={{ width: 10, height: 10, backgroundColor: opt.color }}
                                />
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {/* Quantity stepper — disabled when item is excluded. */}
                  <div className={`inline-flex items-center gap-1 ${item.is_included ? "" : "opacity-50"}`}>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                      disabled={!item.is_included || item.quantity <= 1}
                      aria-label="Decrease quantity"
                      className="h-6 w-6 rounded-full bg-warm-cream flex items-center justify-center text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-warm-cream/80"
                    >
                      −
                    </button>
                    <span className="text-xs font-bold tabular-nums w-5 text-center">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                      disabled={!item.is_included}
                      aria-label="Increase quantity"
                      className="h-6 w-6 rounded-full bg-warm-cream flex items-center justify-center text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-warm-cream/80"
                    >
                      +
                    </button>
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${item.is_included ? "" : "text-muted-foreground"}`}>
                    {item.is_included ? fmt(lineTotal) : fmt(0)}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Add-from-catalogue */}
      <div className="border-t border-dashed border-border pt-3 mb-4">
        <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light mb-2">Add another product</div>
        <input
          type="text"
          value={addSearch}
          onChange={e => setAddSearch(e.target.value)}
          placeholder="Search products by name…"
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
        />
        {debouncedSearch.length >= 2 && (
          <div className="mt-2 border border-border rounded-lg max-h-56 overflow-y-auto bg-background shadow-sm">
            {searchQuery.isLoading ? (
              <div className="px-3 py-2 text-xs text-text-light">Searching…</div>
            ) : (searchQuery.data || []).length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-light">No products match.</div>
            ) : (
              (searchQuery.data || []).map(p => {
                const shoppable = (p.brands || []).filter(b => b.in_stock && b.price > 0).sort((a, b) => a.price - b.price);
                const cheapest = shoppable[0];
                return (
                  <button
                    key={p.id}
                    onClick={() => addCatalogueProduct(p)}
                    disabled={!cheapest}
                    className="flex items-center justify-between w-full text-left px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] text-forest font-semibold">
                      {cheapest ? <>{fmt(cheapest.price)} <Plus className="w-3 h-3" /></> : "OOS"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {removedDefaultCount > 0 && (
        <p className="text-[11px] text-text-light mb-2">
          {removedDefaultCount} default item{removedDefaultCount === 1 ? "" : "s"} removed from your bundle
        </p>
      )}

      <button
        onClick={handleAddToCart}
        className="w-full rounded-pill bg-coral px-6 py-3 font-body font-semibold text-primary-foreground hover:bg-coral-dark inline-flex items-center justify-center gap-2"
      >
        <ShoppingBag className="w-4 h-4" />
        Add bundle to cart — {fmt(bundlePrice)}
      </button>
    </section>
  );
}
