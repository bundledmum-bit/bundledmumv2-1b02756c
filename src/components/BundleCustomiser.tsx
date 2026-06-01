import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShoppingBag, X, RotateCcw, Plus } from "lucide-react";
import { fmt, useCart } from "@/lib/cart";
import { analytics } from "@/lib/ga";
import { getBrandImage } from "@/lib/brandImage";
import {
  useBundleItemsEdit,
  type BrandRow,
  type BundleEditApi,
} from "@/hooks/useBundleItemsEdit";

/**
 * Interactive customisation UI for bundle product pages.
 *
 * State ownership: bundle-edit state (items, brands, gender, mutators)
 * lives in useBundleItemsEdit. This component is a CONSUMER:
 *
 *   - When the parent passes `editApi`, we use that — the parent and
 *     this component share state. This is how /products/maternity-bundle-*
 *     keeps the inline grid and the customiser in sync.
 *   - When no `editApi` is provided, we call useBundleItemsEdit
 *     internally (uncontrolled mode). This is how legacy Postpartum
 *     and Baby Shower gift-box product pages mount the customiser.
 *
 * Keeps the catalogue-search input, the image-zoom lightbox, the
 * WhatsApp pre-fill, and the "Proceed to Checkout" action local —
 * those are customiser-specific UI.
 */

interface Props {
  productId: string;
  productName: string;
  bundleLabel: string | null;
  bundleSku: string | null;
  /** Provided in controlled mode (maternity-bundle product pages). */
  editApi?: BundleEditApi;
}

export default function BundleCustomiser({ productId, productName, bundleLabel, bundleSku, editApi }: Props) {
  const { addToCart } = useCart();
  const navigate = useNavigate();

  // Hooks must be called unconditionally. When editApi is provided we
  // call useBundleItemsEdit with the same productId/Name — React Query
  // dedupes via shared keys so this is one network fetch, not two.
  // The local result is only used as a fallback when editApi is absent.
  const localApi = useBundleItemsEdit(productId, productName);
  const api: BundleEditApi = editApi ?? localApi;

  const {
    isLoading,
    bundleItems,
    includedItems,
    currentTotalPrice,
    defaultPrice,
    removedDefaultCount,
    genderMap,
    toggleInclude,
    selectBrand,
    setItemGender,
    updateQuantity,
    removeCustomItem,
    resetToDefault,
    addCatalogItem,
  } = api;

  const priceDelta = currentTotalPrice - defaultPrice;

  // ── WhatsApp order link ────────────────────────────────────────────
  // Reactive to every customiser tweak (qty +/-, brand swap, include/
  // exclude, gender) so the pre-filled message always reflects what
  // the customer sees on screen.
  const whatsappUrl = (() => {
    const lines = includedItems.map((item) => {
      const rawBrand = item.selected_brand?.brand_name || "";
      const brand = rawBrand && rawBrand !== "BundledMum" && rawBrand !== "Generic" ? ` (${rawBrand})` : "";
      const qty = item.quantity > 1 ? ` x${item.quantity}` : "";
      const colour = item.selected_gender
        ? ` — ${item.selected_gender === "boy" ? "Boy (Blue)" : item.selected_gender === "girl" ? "Girl (Pink)" : "Neutral (White)"}`
        : "";
      return `  • ${item.product_name}${brand}${qty}${colour}`;
    }).join("\n");
    const priceFormatted = `₦${currentTotalPrice.toLocaleString("en-NG")}`;
    const labelSuffix = bundleLabel ? ` — ${bundleLabel}` : "";
    const message = `Hi BundledMum! 👋

I'd like to order the *${productName}*${labelSuffix}

*Bundle Price:* ${priceFormatted}
*Items included (${includedItems.length}):*
${lines}

Please let me know the next steps to complete my order. Thank you! 🛍️`;
    return `https://wa.me/2347040667424?text=${encodeURIComponent(message)}`;
  })();

  const trackWhatsAppClick = () => {
    try {
      analytics.push({
        event: "whatsapp_click",
        click_location: "bundle_product_page",
        click_type: "bundle_order",
      });
    } catch {
      /* ignore */
    }
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
    const result = addCatalogItem(p);
    if (result === "no-brands") {
      toast.error("This product has no shoppable brands.");
      return;
    }
    if (result === "already") {
      toast("Already in your bundle.");
    }
    setAddSearch("");
  };

  // ── Proceed to checkout ─────────────────────────────────────────────
  // Bundle CTA goes straight to /checkout instead of staying on the
  // page — the customer has already specified everything they need on
  // the customiser, so the intermediate /cart trip is friction.
  const handleProceedToCheckout = () => {
    if (includedItems.length === 0) {
      toast.error("Bundle is empty — include at least one item.");
      return;
    }
    // Same validation gate as the product-page hero CTA. Reads from the
    // shared editApi so a coral-flagged card on the inline grid will
    // also block checkout from the customiser.
    if (api.hasUnmetRequirements) {
      const n = api.unmetRequirementItems.length;
      toast.error(
        `Please choose gender for ${n} item${n === 1 ? "" : "s"} before checking out.`
      );
      const firstId = api.unmetRequirementItems[0]?.product_id;
      if (firstId) {
        requestAnimationFrame(() => {
          document
            .getElementById(`bundle-item-${firstId}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
      return;
    }
    addToCart({
      type: "bundle",
      id: productId,
      bundleId: productId,
      bundleName: productName,
      bundleLabel: bundleLabel || "",
      bundleSku: bundleSku || "",
      bundlePrice: currentTotalPrice,
      // Cart context expects price + qty for subtotal sums. The bundle
      // row is a single line at the customised price.
      price: currentTotalPrice,
      name: `${productName}${bundleLabel ? ` — ${bundleLabel}` : ""}`,
      bundleItems: includedItems.map((i) => ({
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
      removedDefaultCount,
    } as any);
    navigate("/checkout");
  };

  if (isLoading) {
    return (
      <section className="mt-8 bg-card border border-border rounded-card p-5">
        <div className="text-sm text-text-light">Loading bundle contents…</div>
      </section>
    );
  }
  if (bundleItems.length === 0) return null;

  const includedCount = includedItems.length;

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
          <span className="pf font-bold text-forest">{fmt(currentTotalPrice)}</span>
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
        {bundleItems.map((item) => {
          const lineTotal = item.selected_brand.price * item.quantity;
          // ── Level 1: variant axis (age range / size) ───────────────
          const hasVariants = item.available_brands.some((b) => !!b.variant_type);
          const variantOptions = hasVariants
            ? Array.from(new Set(item.available_brands.filter((b) => !!b.size_variant).map((b) => b.size_variant as string)))
            : [];
          const variantLabel = item.available_brands.find((b) => b.variant_type === "age_range")
            ? "Age Range"
            : item.available_brands.find((b) => b.variant_type === "size")
              ? "Size"
              : "Variant";
          // ── Level 2: brand pool filtered by selected variant ───────
          const brandsToShow = hasVariants
            ? item.available_brands.filter((b) => b.size_variant === item.selected_brand.size_variant)
            : item.available_brands;
          const hasBrandChoice = brandsToShow.length > 1;
          const useDropdown = brandsToShow.length > 3;
          // ── Level 3: gender / colour ───────────────────────────────
          const gender = genderMap[item.product_id];
          const colorOptions = gender?.gender_relevant && gender.gender_colors
            ? Object.entries(gender.gender_colors).map(([key, color]) => ({
                key,
                label: key === "boy" ? "Boy" : key === "girl" ? "Girl" : "Neutral",
                color,
              }))
            : [];
          const selectedBrandImage = getBrandImage(item.selected_brand);
          return (
            <li key={item.product_id} className={`px-3 py-2.5 ${item.is_included ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                {/* Thumbnail — reactive to selected_brand so swapping
                    brand variants updates the image. Click opens a
                    full-size zoom lightbox. */}
                <button
                  type="button"
                  onClick={() => openImageZoom(selectedBrandImage, item.product_name)}
                  aria-label={`View ${item.product_name} image`}
                  className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border border-border hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-forest"
                >
                  {selectedBrandImage ? (
                    <img
                      src={selectedBrandImage}
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
                            {variantOptions.map((v) => (
                              <button
                                key={v}
                                onClick={() => {
                                  // Snap brand to first match for the new variant.
                                  const firstMatch = item.available_brands.find((b) => b.size_variant === v);
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
                              onChange={(e) => {
                                const b = item.available_brands.find((x) => x.id === e.target.value);
                                if (b) selectBrand(item.product_id, b);
                              }}
                              className="text-[11px] border border-input rounded-md px-2 py-1 bg-background w-full"
                            >
                              {brandsToShow.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.brand_name} — {fmt(b.price)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {brandsToShow.map((b) => (
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
                        // Single-brand product — show the name as static text.
                        <div className="text-[11px] text-text-med">{item.selected_brand.brand_name || "—"}</div>
                      )}

                      {/* Level 3 — Colour / Gender */}
                      {colorOptions.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light mb-0.5">Colour</div>
                          <div className="flex flex-wrap gap-1">
                            {colorOptions.map((opt) => (
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
          onChange={(e) => setAddSearch(e.target.value)}
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
              (searchQuery.data || []).map((p) => {
                const shoppable = (p.brands || []).filter((b) => b.in_stock && b.price > 0).sort((a, b) => a.price - b.price);
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
        Proceed to Checkout — {fmt(currentTotalPrice)}
      </button>

      {/* WhatsApp order — opens wa.me with a pre-filled message that
          mirrors the current customisation state. */}
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
            onClick={(e) => e.stopPropagation()}
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
