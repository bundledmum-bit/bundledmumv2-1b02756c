import { useState } from "react";
import { X, ZoomIn, Undo2 } from "lucide-react";
import ImageZoomModal from "@/components/ImageZoomModal";
import { getBrandImage } from "@/lib/brandImage";
import type { BundleEditApi } from "@/hooks/useBundleItemsEdit";

// Editable items grid for /products/maternity-bundle-* pages.
//
// Consumes a BundleEditApi from the parent, so this surface and the
// "Or customise this bundle →" mounted BundleCustomiser edit the same
// composition. Per-card controls:
//   - Tap image → ImageZoomModal opens (full-screen)
//   - Tap × overlay → toggleInclude (default items) / removeCustomItem
//     (added items)
//   - Brand select → selectBrand
//   - Gender pills → setItemGender (only when products.gender_relevant)
//
// Replaces the old MaternityBundleItemsGrid, which was pure read-only.
// Layout: 2 cards per row (<md), 3 (md), 4 (lg+). Card gap: 16/24px.

export default function MaternityBundleItemsEditor({ editApi }: { editApi: BundleEditApi }) {
  const {
    isLoading,
    bundleItems,
    genderMap,
    selectBrand,
    setItemGender,
    toggleInclude,
    removeCustomItem,
    itemRequiresAttention,
  } = editApi;

  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  if (isLoading) {
    return (
      <div className="text-text-light text-sm py-6">Loading bundle items…</div>
    );
  }
  if (!bundleItems.length) return null;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {bundleItems.map((item) => {
          const selectedBrandImg = getBrandImage(item.selected_brand) || null;
          const gender = genderMap[item.product_id];
          const colorOptions = gender?.gender_relevant && gender.gender_colors
            ? Object.entries(gender.gender_colors).map(([key, color]) => ({
                key,
                label: key === "boy" ? "Boy" : key === "girl" ? "Girl" : "Neutral",
                color,
              }))
            : [];
          const hasBrandChoice = (item.available_brands || []).length > 1;
          const excluded = !item.is_included;
          const needsAttention = itemRequiresAttention ? itemRequiresAttention(item) : false;

          return (
            <div
              key={item.product_id}
              id={`bundle-item-${item.product_id}`}
              className={`group flex flex-col transition-opacity ${excluded ? "opacity-40" : ""} ${
                needsAttention ? "ring-2 ring-coral ring-offset-2 ring-offset-background rounded-sm" : ""
              }`}
            >
              {/* Image — tap zone for zoom. The × overlay sits inside but
                  stops propagation so it never triggers zoom.
                  Mobile order: image sits BELOW the name; desktop keeps
                  image-first. Margin lives on the name (mobile) /
                  image (desktop) instead of always-bottom. */}
              <div className="relative aspect-[3/4] overflow-hidden bg-warm-cream order-2 md:order-1 mb-0 md:mb-3">
                <button
                  type="button"
                  onClick={() => selectedBrandImg && setZoom({ src: selectedBrandImg, alt: item.product_name })}
                  className="absolute inset-0 w-full h-full block focus:outline-none focus-visible:ring-2 focus-visible:ring-forest"
                  aria-label={`View ${item.product_name} image`}
                >
                  {selectedBrandImg ? (
                    <img
                      src={selectedBrandImg}
                      alt={item.product_name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-light text-[11px] text-center px-2">
                      No image
                    </div>
                  )}
                  {/* Subtle zoom hint on hover */}
                  {selectedBrandImg && (
                    <span className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ZoomIn className="w-3 h-3 text-foreground" />
                    </span>
                  )}
                </button>

                {/* × overlay — top-right. Default items toggle; custom items remove. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.is_default) toggleInclude(item.product_id);
                    else removeCustomItem(item.product_id);
                  }}
                  aria-label={item.is_default ? (excluded ? "Re-include item" : "Exclude item") : "Remove item"}
                  className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    excluded
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-background/80 backdrop-blur-sm text-foreground hover:bg-background"
                  }`}
                >
                  {excluded ? <Undo2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
                </button>
              </div>

              {/* Product name */}
              <p className="text-foreground text-sm leading-snug line-clamp-2 mb-2 md:mb-1.5 order-1 md:order-2">
                {item.product_name}
                {!item.is_default && (
                  <span className="ml-1.5 text-[9px] uppercase tracking-wider text-coral font-semibold align-middle">
                    Added
                  </span>
                )}
              </p>

              {/* Brand block — hint above, then picker. order-3 keeps
                  it last on both axes. The hint only renders when there
                  are multiple brands to choose from (it would mislead
                  on single-brand items). */}
              <div className="order-3">
                {hasBrandChoice && !excluded && (
                  <p className="text-[10px] uppercase tracking-[0.18em] text-text-light/80 mb-0.5">
                    Tap to choose brand
                  </p>
                )}
                {hasBrandChoice ? (
                  <select
                    value={item.selected_brand.id}
                    onChange={(e) => {
                      const next = item.available_brands.find((b) => b.id === e.target.value);
                      if (next) selectBrand(item.product_id, next);
                    }}
                    disabled={excluded}
                    className="block w-full text-text-light text-xs bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none focus:ring-0 py-1 disabled:cursor-not-allowed"
                    aria-label={`Choose brand for ${item.product_name}`}
                  >
                    {item.available_brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.brand_name}{b.size_variant ? ` — ${b.size_variant}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-text-light text-xs line-clamp-1">
                    {item.selected_brand.brand_name || "—"}
                  </p>
                )}
              </div>

              {/* Gender pills — only when products.gender_relevant. */}
              {colorOptions.length > 0 && !excluded && (
                <div className="flex flex-wrap gap-1 mt-2 order-4">
                  {colorOptions.map((opt) => {
                    const selected = item.selected_gender === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setItemGender(item.product_id, opt.key)}
                        className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${
                          selected
                            ? "border-forest bg-forest-light text-forest font-semibold"
                            : "border-border bg-card text-text-med"
                        }`}
                        aria-pressed={selected}
                      >
                        <span
                          className="inline-block rounded-full border border-border"
                          style={{ width: 8, height: 8, backgroundColor: opt.color }}
                        />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Validation hint — coral micro-label when the item still
                  needs a required selection. Driven by editApi so future
                  required axes (size, colour) light up the same UI. */}
              {needsAttention && (
                <p className="order-5 mt-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-coral">
                  Please choose
                </p>
              )}
            </div>
          );
        })}
      </div>

      <ImageZoomModal
        src={zoom?.src ?? null}
        alt={zoom?.alt}
        onClose={() => setZoom(null)}
      />
    </>
  );
}
