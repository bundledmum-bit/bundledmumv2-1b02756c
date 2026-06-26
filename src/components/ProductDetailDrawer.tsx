import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Star, ShoppingBag, X, ZoomIn } from "lucide-react";
import QtyControl from "@/components/QtyControl";
import ImageZoomModal from "@/components/ImageZoomModal";
import { useCart, fmt, getBrandForBudget, cartItemKey } from "@/lib/cart";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import type { Product } from "@/lib/supabaseAdapters";
import { isProductOOS } from "@/lib/supabaseAdapters";
import ProductImage from "@/components/ProductImage";
import { trackEvent } from "@/lib/analytics";
import { diaperBadges } from "@/lib/diaperBrand";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { buildProductOrderWhatsAppHref } from "@/lib/whatsapp";
import whatsappLogo from "@/assets/whatsapp-logo.svg";
import BrandSelect from "@/components/BrandSelect";

interface Props {
  product: Product | null;
  defaultBudget?: string;
  /** When set, the matching brand is pre-selected on mount. */
  selectedBrandId?: string;
  onClose: () => void;
}

export default function ProductDetailDrawer({ product, defaultBudget = "standard", selectedBrandId, onClose }: Props) {
  if (!product) return null;

  // shouldScaleBackground=false prevents vaul from applying inline
  // transform / overflow styles to <body>. The "View Full Product"
  // link inside the drawer closes the drawer and navigates in the
  // same tick — vaul never animates closed and can't strip those body
  // styles, which leaves /products/[slug] mounting inside a transformed
  // body that breaks the mobile layout. Disabling the scale-card effect
  // removes the entire class of bug for this drawer.
  return (
    <Drawer open={!!product} onOpenChange={(open) => { if (!open) onClose(); }} shouldScaleBackground={false}>
      <DrawerContent className="max-h-[92svh] flex flex-col outline-none">
        <DrawerInner product={product} defaultBudget={defaultBudget} selectedBrandId={selectedBrandId} onClose={onClose} />
      </DrawerContent>
    </Drawer>
  );
}

/* ── Image Zoom Modal ── */
function DrawerInner({ product, defaultBudget, selectedBrandId, onClose }: { product: Product; defaultBudget: string; selectedBrandId?: string; onClose: () => void }) {
  const defaultBrand = getBrandForBudget(product, defaultBudget);
  const seedBrand = selectedBrandId
    ? (product.brands.find(b => b.id === selectedBrandId) || defaultBrand)
    : defaultBrand;
  const [selectedBrand, setSelectedBrand] = useState(seedBrand);
  // If selectedBrandId changes after mount (e.g. drawer reopened with a
  // different brand), update the selection to match.
  useEffect(() => {
    if (!selectedBrandId) return;
    const match = product.brands.find(b => b.id === selectedBrandId);
    if (match && match.id !== selectedBrand.id) setSelectedBrand(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrandId, product.id]);
  // Sizes are never pre-selected — customer must explicitly tap a chip
  // before Add to Cart unlocks. Reset on product change so opening a
  // new drawer doesn't carry the previous product's selection.
  const [selectedSize, setSelectedSize] = useState<string>("");
  useEffect(() => { setSelectedSize(""); }, [product.id]);
  const requiresSizeChoice = !!(product.sizes && product.sizes.length > 0);
  const sizeMissing = requiresSizeChoice && !selectedSize;
  const { cart, addToCart, updateQty } = useCart();
  const { data: settings } = useSiteSettings();
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  // Variant-aware: the button must track the CURRENTLY SELECTED brand +
  // size combo, not just whether any variant of the product is in cart.
  // Mirrors the key formula used by addToCart() — see lib/cart.tsx.
  const currentVariantKey = cartItemKey(
    product.id,
    selectedBrand?.id,
    selectedSize || null,
    null,
    null,
  );
  const cartItem = cart.find(c => c._key === currentVariantKey);
  const isInCart = !!cartItem;

  const deliveryText = settings?.delivery_text || "Delivery: 1–3 business days";

  useEffect(() => {
    trackEvent("product_viewed", { product_id: product.id, product_name: product.name });
  }, [product.id, product.name]);

  const displayImage = selectedBrand?.imageUrl || product.imageUrl;

  // Gallery images for the currently-selected brand. Falls back to
  // [selectedBrand.imageUrl] and finally to [product.imageUrl] so
  // older products still render at least one slide.
  const galleryImages = useMemo<string[]>(() => {
    const arr: string[] = [];
    if (Array.isArray(selectedBrand?.images)) arr.push(...selectedBrand.images.filter(Boolean));
    if (arr.length === 0 && selectedBrand?.imageUrl) arr.push(selectedBrand.imageUrl);
    if (arr.length === 0 && product.imageUrl) arr.push(product.imageUrl);
    return arr;
  }, [selectedBrand, product.imageUrl]);
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  // Reset scroll to first slide on brand change.
  useEffect(() => {
    setActiveSlide(0);
    if (galleryRef.current) galleryRef.current.scrollTo({ left: 0, behavior: "auto" });
  }, [selectedBrand?.id]);

  // Update the active dot on scroll using a simple scroll-position
  // divide-by-width — avoids the overhead of an IntersectionObserver.
  const onGalleryScroll = () => {
    const el = galleryRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (idx !== activeSlide) setActiveSlide(idx);
  };
  const isOutOfStock = isProductOOS(product) || !selectedBrand?.inStock;
  const isLowStock = !isOutOfStock && selectedBrand?.stockQuantity != null && selectedBrand.stockQuantity > 0 && selectedBrand.stockQuantity <= 5;
  const showSalePrice = selectedBrand?.compareAtPrice && selectedBrand.compareAtPrice > selectedBrand.price;
  const savings = showSalePrice ? selectedBrand.compareAtPrice! - selectedBrand.price : 0;
  const savingsPercent = showSalePrice ? Math.round((savings / selectedBrand.compareAtPrice!) * 100) : 0;

  const handleAdd = () => {
    if (isOutOfStock) return;
    if (product.sizes && product.sizes.length > 0 && !selectedSize) {
      toast.error("Please select a size.");
      return;
    }
    addToCart({
      ...product,
      selectedBrand,
      price: selectedBrand.price,
      name: `${product.name} (${selectedBrand.label})`,
      selectedSize,
    });
    toast.success(`✓ ${product.name} added to cart`, {
      action: { label: "View Cart →", onClick: () => window.location.href = "/cart" },
    });
  };

  const getWhyText = () => {
    if (!product.whyIncluded) return "";
    if (typeof product.whyIncluded === "string") return product.whyIncluded;
    return Object.values(product.whyIncluded)[0] || "";
  };

  return (
    <>
      {zoomImage && <ImageZoomModal src={zoomImage} alt={product.name} onClose={() => setZoomImage(null)} />}

      {/* ── Close Button – always visible with safe top margin ── */}
      <div className="sticky top-0 z-20 flex justify-end p-3 pb-0 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-foreground/10 hover:bg-foreground/20 transition-colors"
          aria-label="Close product details"
        >
          <X className="h-5 w-5 text-foreground" />
        </button>
      </div>

      <div className="overflow-y-auto flex-1 overscroll-contain touch-pan-y">
        {/* Product gallery — swipeable on mobile, with dot indicators */}
        <div className="relative" style={{ backgroundColor: displayImage ? "#f5f5f5" : (selectedBrand.color || "#F0F7F4") }}>
          {isProductOOS(product) ? (
            <span className="absolute top-3 left-3 bg-[#E53935] text-primary-foreground text-[10px] font-bold px-2.5 py-1 rounded-pill uppercase z-10">Out of Stock</span>
          ) : product.badge ? (
            <span className="absolute top-3 left-3 bg-coral text-primary-foreground text-[10px] font-bold px-2.5 py-1 rounded-pill uppercase z-10">{product.badge}</span>
          ) : null}
          {showSalePrice && !isProductOOS(product) && (
            <span className="absolute top-3 right-3 bg-destructive text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-pill z-10">
              Save {savingsPercent}%
            </span>
          )}

          {galleryImages.length > 0 ? (
            <>
              <div
                ref={galleryRef}
                onScroll={onGalleryScroll}
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none h-52 md:h-64 touch-pan-x"
                style={{ scrollbarWidth: "none" }}
              >
                {galleryImages.map((src, i) => (
                  <button
                    key={`${selectedBrand.id}-${i}`}
                    type="button"
                    onClick={() => setZoomImage(src)}
                    className="snap-start flex-shrink-0 w-full h-full flex items-center justify-center cursor-zoom-in"
                    aria-label={`Product image ${i + 1} of ${galleryImages.length}`}
                  >
                    <img src={src} alt={product.name} className="max-w-full max-h-full object-contain p-4" loading="lazy" />
                  </button>
                ))}
              </div>
              {galleryImages.length > 1 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                  {galleryImages.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const el = galleryRef.current;
                        if (!el) return;
                        el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
                      }}
                      aria-label={`Go to image ${i + 1}`}
                      className={`rounded-full transition-all ${i === activeSlide ? "bg-forest w-2.5 h-2.5" : "bg-forest/30 w-2 h-2"}`}
                    />
                  ))}
                </div>
              )}
              <div className="pointer-events-none absolute bottom-2 right-2 bg-card/80 rounded-full p-1.5 opacity-70">
                <ZoomIn className="h-4 w-4 text-foreground" />
              </div>
            </>
          ) : (
            // Fallback — no image data at all, use the emoji placeholder.
            <div className="h-52 md:h-64 flex items-center justify-center">
              <ProductImage
                imageUrl={null}
                emoji={selectedBrand.img || product.baseImg}
                alt={product.name}
                className="w-full h-full"
                emojiClassName="text-7xl"
              />
            </div>
          )}
        </div>

        <div className="p-5">
          {/* Name & Description */}
          <h2 className="pf text-xl font-bold mb-1">{product.name}</h2>
          {(() => {
            const badges = diaperBadges(selectedBrand);
            return badges.length > 0 ? (
              <div className="flex flex-wrap gap-1 mb-2">
                {badges.map(b => (
                  <span key={b} className="text-[11px] font-medium rounded-full px-2 py-0.5" style={{ backgroundColor: "#F0F0F0", color: "#555" }}>{b}</span>
                ))}
              </div>
            ) : null;
          })()}
          <p className="text-muted-foreground text-sm leading-relaxed mb-3">{product.description}</p>

          {/* Rating */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={`h-4 w-4 ${s <= Math.round(product.rating) ? "text-coral fill-coral" : "text-border"}`} />
              ))}
            </div>
            <span className="text-sm font-semibold">{product.rating}</span>
            <span className="text-muted-foreground text-xs">({product.reviews} reviews)</span>
          </div>

          {/* Delivery Estimate */}
          <div className="bg-forest-light rounded-lg px-3 py-2 text-xs text-forest font-semibold mb-3">
            🚚 {deliveryText}
          </div>

          {/* Product Details */}
          <div className="space-y-2 mb-3">
            {product.packInfo && (
              <div className="bg-warm-cream rounded-lg px-3 py-2 text-xs"><span className="font-semibold">📦 </span>{product.packInfo}</div>
            )}
            {product.material && (
              <div className="bg-warm-cream rounded-lg px-3 py-2 text-xs"><span className="font-semibold">🧵 Material: </span>{product.material}</div>
            )}
            {product.contents && product.contents.length > 0 && (
              <div className="bg-warm-cream rounded-lg px-3 py-2 text-xs">
                <span className="font-semibold">📋 Includes: </span>{product.contents.join(" · ")}
              </div>
            )}
            {product.safetyInfo && (
              <div className="bg-warm-cream rounded-lg px-3 py-2 text-xs"><span className="font-semibold">🛡️ </span>{product.safetyInfo}</div>
            )}
          </div>

          {/* Brand Selector — dropdown (scales to many brands). Same selection
              behaviour as before via setSelectedBrand. */}
          <div className="mb-3">
            <BrandSelect
              brands={product.brands}
              value={selectedBrand.id}
              productOos={product.isOutOfStock}
              label="Choose Brand"
              onSelect={(b) => setSelectedBrand(b as any)}
            />
          </div>

          {/* Size Selector */}
          {requiresSizeChoice && (
            <div className="mb-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Select Size {sizeMissing && <span className="text-coral normal-case tracking-normal">— required</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {product.sizes!.map(s => (
                  <button key={s} onClick={() => setSelectedSize(s)}
                    className={`min-h-[44px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] transition-all font-body ${selectedSize === s ? "border-forest bg-forest text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-forest/40"}`}>
                    {s}
                  </button>
                ))}
              </div>
              {sizeMissing && (
                <p className="text-[11px] text-muted-foreground mt-2">Select a size to continue.</p>
              )}
            </div>
          )}

          {isLowStock && (
            <p className="text-[#E65100] text-xs font-semibold mb-3">🔥 Only {selectedBrand.stockQuantity} left!</p>
          )}

          {/* Why Included */}
          {getWhyText() && (
            <div className="bg-forest-light rounded-lg p-3 text-xs text-forest mb-3">
              <span className="font-semibold">💡 Why mums love this: </span>{getWhyText()}
            </div>
          )}

        </div>
      </div>

      {/* Bottom CTA bar — flex-shrink-0 sibling of the scrollable area
          rather than `sticky bottom-0`. Sticky-inside-flex is brittle
          on iOS Safari and was the root cause of the "Add to Cart
          missing" reports; a fixed-height flex child is always
          visible. Extra bottom padding clears MobileBottomNav. */}
      <div className="flex-shrink-0 bg-card border-t border-border p-4 pb-[calc(1rem+56px)] md:pb-4 z-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="pf text-xl font-bold text-forest">{fmt(selectedBrand.price)}</p>
            {showSalePrice && (
              <p className="text-muted-foreground text-xs line-through">{fmt(selectedBrand.compareAtPrice!)}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOutOfStock ? (
              <button className="rounded-pill bg-border px-6 py-3 text-sm font-semibold text-muted-foreground cursor-not-allowed min-h-[44px]">
                Out of Stock
              </button>
            ) : isInCart && cartItem ? (
              <div className="flex items-center gap-3">
                <QtyControl qty={cartItem.qty} onUpdate={(newQty) => updateQty(cartItem._key, newQty)} size="md" maxQty={selectedBrand.stockQuantity ?? undefined} />
                <Link to="/cart" className="text-forest text-sm font-semibold hover:underline font-body">
                  Cart →
                </Link>
              </div>
            ) : sizeMissing ? (
              <button
                disabled
                className="rounded-pill bg-border px-6 py-3 text-sm font-semibold text-muted-foreground cursor-not-allowed min-h-[44px]"
              >
                Select a Size
              </button>
            ) : (
              <button onClick={handleAdd} className="rounded-pill px-6 py-3 text-sm font-semibold text-primary-foreground font-body interactive flex items-center gap-2 min-h-[44px]" style={{ backgroundColor: "#F4845F" }}>
                <ShoppingBag className="h-4 w-4" /> Add to Cart
              </button>
            )}
            {/* Order via WhatsApp — MOBILE ONLY compact round secondary option.
                flex-shrink-0 so it never crowds the primary Add to Cart. */}
            {!isOutOfStock && (
              <a
                href={buildProductOrderWhatsAppHref({
                  name: product.name,
                  priceLabel: fmt(selectedBrand.price),
                  url: `https://bundledmum.com/products/${product.slug || product.id}`,
                  variant: [selectedBrand.label, selectedSize].filter(Boolean).join(", "),
                  whatsappNumber: settings?.whatsapp_number,
                })}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Order via WhatsApp"
                onClick={() => { try { trackEvent("product_whatsapp_order", { product_id: product.id, source: "slider" }); } catch { /* fire-and-forget */ } }}
                className="md:hidden shrink-0 w-11 h-11 block active:scale-95 transition-transform"
              >
                <img src={whatsappLogo} alt="" className="w-full h-full" />
              </a>
            )}
          </div>
        </div>
        {/* Secondary action — demoted from the in-body block button to a
            ghost link that still gives shoppers a way through to the
            full product page. */}
        {product.slug && (
          <Link
            to={`/products/${product.slug}`}
            onClick={onClose}
            className="block text-center text-forest/80 hover:text-forest font-semibold text-xs mt-3 hover:underline"
          >
            View Full Product →
          </Link>
        )}
      </div>
    </>
  );
}
