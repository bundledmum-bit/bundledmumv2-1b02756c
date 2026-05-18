import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShoppingBag, X, RotateCcw, Plus } from "lucide-react";
import { fmt, useCart } from "@/lib/cart";
import { analytics } from "@/lib/ga";

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
  brand_sku?: string | null;
  brand_image_url?: string | null;
  brand_size_variant?: string | null;
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
  const navigate = useNavigate();

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
      const { data, error } = await (supabase as any)
        .rpc("get_gift_box_price", { p_gift_box_id: productId });
      if (error) throw error;
      const raw = data as any;
      const items: DefaultItem[] = (Array.isArray(raw?.items) ? raw.items : []).map((it: any) => ({
        product_id: String(it.product_id),
        product_name: it.product_name,
        brand_id: it.brand_id,
        brand_name: it.brand_name,
        brand_sku: it.brand_sku ?? null,
        // get_gift_box_price emits image_url + size_variant on the
        // item row when the brand row carries them, but older callers
        // emit them nested under brand. Cover both shapes.
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
      // brands has no anon SELECT policy — read via the public view
      // (same pattern ProductPage / BundleSections use).
      const { data, error } = await (supabase as any)
        .from("brands_public")
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
    // Gate on BOTH the bundle defaults AND the brand pool resolving so
    // each item's selected_brand inherits the real brand row (with
    // image_url, size_variant, etc.) instead of the synthetic
    // fallback. Otherwise the thumbnail + brand-switcher both miss data
    // when brandsQuery resolves a tick later than defaultsQuery.
    if (initialised) return;
    if (!buildInitialItems) return;
    if (productIds.length > 0 && !brandsQuery.data) return;
    setBundleItems(buildInitialItems);
    setInitialised(true);
  }, [buildInitialItems, initialised, brandsQuery.data, productIds.length]);

  // ── Live price ──────────────────────────────────────────────────────
  const bundlePrice = useMemo(() => bundleItems
    .filter(i => i.is_included)
    .reduce((sum, i) => sum + (i.selected_brand.price * i.quantity), 0),
    [bundleItems]);

  // ── WhatsApp order link ────────────────────────────────────────────
  // Reactive to every customiser tweak (qty +/-, brand swap, include/
  // exclude, gender) so the pre-filled message always reflects what
  // the customer sees on screen.
  const whatsappUrl = useMemo(() => {
    const included = bundleItems.filter(i => i.is_included);
    const lines = included.map(item => {
      const rawBrand = item.selected_brand?.brand_name || "";
      const brand = rawBrand && rawBrand !== "BundledMum" && rawBrand !== "Generic"
        ? ` (${rawBrand})`
        : "";
      const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
      const colour = item.selected_gender
        ? ` — ${item.selected_gender === "boy" ? "Boy (Blue)" : item.selected_gender === "girl" ? "Girl (Pink)" : "Neutral (White)"}`
        : "";
      return `  • ${item.product_name}${brand}${qty}${colour}`;
    }).join("\n");
    const priceFormatted = `₦${bundlePrice.toLocaleString("en-NG")}`;
    const labelSuffix = bundleLabel ? ` — ${bundleLabel}` : "";
    const message = `Hi BundledMum! 👋

I'd like to order the *${productName}*${labelSuffix}

*Bundle Price:* ${priceFormatted}
*Items included (${included.length}):*
${lines}

Please let me know the next steps to complete my order. Thank you! 🛍️`;
    return `https://wa.me/2347040667424?text=${encodeURIComponent(message)}`;
  }, [productName, bundleLabel, bundlePrice, bundleItems]);

  const trackWhatsAppClick = () => {
    try {
      analytics.push({
        event: "whatsapp_click",
        click_location: "bundle_product_page",
        click_type: "bundle_order",
      });
    } catch { /* ignore */ }
  };

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
  // ── Per-item image zoom ────────────────────────────────────────────
  const [zoomImage, setZoomImage] = useState<{ url: string; name: string } | null>(null);
  const openImageZoom = (url: string | null | undefined, name: string) => {
    if (!url) return;
    setZoomImage({ url, name });
  };
  const closeImageZoom = () => setZoomImage(null);
  useEffect(() => {
    if (!zoomImage) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeImageZoom(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [zoomImage]);

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

  // ── Proceed to checkout ─────────────────────────────────────────────
  // Bundle CTA goes straight to /checkout instead of staying on the
  // page — the customer has already specified everything they need on
  // the customiser, so the intermediate /cart trip is friction.
  const handleProceedToCheckout = () => {
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
    navigate("/checkout");
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
                {/* Thumbnail — reactive to selected_brand so swapping
                    brand variants updates the image. Click opens a
                    full-size zoom lightbox. */}
                <button
                  type="button"
                  onClick={() => openImageZoom(item.selected_brand.image_url, item.product_name)}
                  aria-label={`View ${item.product_name} image`}
                  className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border border-border hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-forest"
                >
                  {item.selected_brand.image_url ? (
                    <img
                      src={item.selected_brand.image_url}
                      alt={item.product_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center text-text-light text-[9px] text-center px-1 leading-tight">
                      No image
                    </div>
                  )}
                </button>
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
        onClick={handleProceedToCheckout}
        className="w-full rounded-pill bg-coral px-6 py-3 font-body font-semibold text-primary-foreground hover:bg-coral-dark inline-flex items-center justify-center gap-2"
      >
        <ShoppingBag className="w-4 h-4" />
        Proceed to Checkout — {fmt(bundlePrice)}
      </button>

      {/* WhatsApp order — opens wa.me with a pre-filled message that
          mirrors the current customisation state. Reactive via the
          whatsappUrl memo, so brand swaps / qty changes / item toggles
          propagate before the customer taps the link. */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={trackWhatsAppClick}
        className="mt-2 w-full rounded-pill bg-[#25D366] hover:bg-[#20BA5A] text-white font-semibold py-3 px-6 inline-flex items-center justify-center gap-2 transition-colors text-sm"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.849L0 24l6.335-1.51A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.373l-.36-.213-3.72.977.993-3.634-.234-.374A9.818 9.818 0 1112 21.818z"/>
        </svg>
        Order via WhatsApp
      </a>

      {/* Image zoom lightbox — backdrop click + Escape close. */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={closeImageZoom}
        >
          <div
            className="relative max-w-lg w-full bg-card rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closeImageZoom}
              aria-label="Close image"
              className="absolute top-3 right-3 z-10 bg-card/80 rounded-full p-1.5 hover:bg-card transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={zoomImage.url}
              alt={zoomImage.name}
              className="w-full h-auto max-h-[70vh] object-contain bg-muted"
            />
            <div className="px-4 py-3 text-center">
              <p className="text-sm font-medium text-foreground">{zoomImage.name}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
