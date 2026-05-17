import { useState, useEffect, useRef } from "react";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adaptProduct, isProductOOS, isProductShoppable, type Product, type Brand } from "@/lib/supabaseAdapters";
import { useCart, fmt, getBrandForBudget } from "@/lib/cart";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { trackEcommerce } from "@/lib/ga";
import ProductImage from "@/components/ProductImage";
import QtyControl from "@/components/QtyControl";
import { Star, ShoppingBag, ChevronLeft, ZoomIn, X, Share2, Truck, Shield, Package, Repeat } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscriptionSettings } from "@/hooks/useSubscription";
import { track as pixelTrack, moneyPayload as pixelMoney } from "@/lib/metaPixel";
import { diaperBadges, packCountLabel } from "@/lib/diaperBrand";

function useProduct(slug: string) {
  return useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      let { data, error } = await supabase
        .from("products")
        .select("*, brands:brands_public(id, product_id, brand_name, price, tier, is_default_for_tier, size_variant, in_stock, stock_quantity, display_order, image_url, thumbnail_url, logo_url, compare_at_price, weight_range_kg, pack_count, diaper_type, sku), product_sizes(*), product_colors(*), product_tags(*), product_images(*)")
        .eq("slug", slug)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();

      if (!data) {
        const res = await supabase
          .from("products")
          .select("*, brands:brands_public(id, product_id, brand_name, price, tier, is_default_for_tier, size_variant, in_stock, stock_quantity, display_order, image_url, thumbnail_url, logo_url, compare_at_price, weight_range_kg, pack_count, diaper_type, sku), product_sizes(*), product_colors(*), product_tags(*), product_images(*)")
          .eq("id", slug)
          .eq("is_active", true)
          .is("deleted_at", null)
          .maybeSingle();
        data = res.data;
        error = res.error;
      }

      if (error) throw error;
      if (!data) return null;
      return { adapted: adaptProduct(data), raw: data };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!slug,
  });
}

/* ── Image Zoom Modal ── */
function ImageZoomModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center animate-fade-in" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 z-[210] bg-card rounded-full p-2 shadow-lg hover:bg-muted transition-colors" aria-label="Close zoom">
        <X className="h-6 w-6 text-foreground" />
      </button>
      <img src={src} alt={alt} className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = useProduct(slug || "");
  const product = data?.adapted || null;
  const raw = data?.raw;
  const { data: settings } = useSiteSettings();

  useEffect(() => {
    if (product) {
      trackEvent("product_page_viewed", { product_id: product.id, product_name: product.name });
      const defaultBrand = product.brands?.[0];
      pixelTrack("ViewContent", pixelMoney(Number(defaultBrand?.price ?? 0), {
        content_ids: [product.id],
        content_name: product.name,
        content_type: "product",
      }));
    }
  }, [product?.id]);

  if (isLoading) return <ProductPageSkeleton />;
  if (!product) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="pf text-2xl font-bold">Product not found</h1>
      <Link to="/shop" className="text-forest font-semibold hover:underline">← Back to Shop</Link>
    </div>
  );
  // Direct-URL safety net — the query already filters is_active=true and
  // deleted_at IS NULL, but a customer arriving at a deep link to a product
  // whose every brand was deactivated would otherwise see an empty page.
  // Surface a friendly "no longer available" state so SEO/email traffic
  // never lands on a broken-looking detail screen.
  if (!isProductShoppable(product)) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="pf text-2xl font-bold">Currently unavailable</h1>
      <p className="text-muted-foreground max-w-md">
        {product.name} is temporarily out of stock. Browse our other items or chat with us on WhatsApp to be notified when it's back.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link to="/shop" className="rounded-pill bg-forest text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-forest-deep">Browse products</Link>
        <a href="https://wa.me/+2347040667424" target="_blank" rel="noopener noreferrer" className="rounded-pill border border-forest text-forest px-5 py-2.5 text-sm font-semibold hover:bg-forest-light">WhatsApp us</a>
      </div>
    </div>
  );

  return <ProductPageContent product={product} raw={raw} settings={settings} />;
}

function ProductPageContent({ product, raw, settings }: { product: Product; raw: any; settings: any }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const skuParam = searchParams.get("sku");

  // Resolve which brand variant should be active given the current
  // `?sku=` param and the brand list. Priority order:
  //   1. ?sku= match (if present)
  //   2. In-stock brand with lowest display_order (nulls last), tie-break on price
  //   3. If everything is OOS, first brand overall so the page still renders
  //   4. undefined if the product has zero brands (handled below)
  const resolveBrand = (brands: Brand[], sku: string | null): Brand | undefined => {
    if (!brands || brands.length === 0) return undefined;
    if (sku) {
      const match = brands.find(b => b.sku === sku);
      if (match) return match;
    }
    const inStock = brands.filter(b => b.inStock !== false);
    const pool = inStock.length > 0 ? inStock : brands;
    return [...pool].sort((a, b) => {
      const aHas = a.displayOrder != null;
      const bHas = b.displayOrder != null;
      if (aHas && bHas) {
        if (a.displayOrder! !== b.displayOrder!) return a.displayOrder! - b.displayOrder!;
        return (a.price || 0) - (b.price || 0);
      }
      if (aHas) return -1;
      if (bHas) return 1;
      return (a.price || 0) - (b.price || 0);
    })[0];
  };

  // Seed state on first render so the JSX has a defined brand to read.
  const [selectedBrand, setSelectedBrand] = useState<Brand | undefined>(
    () => resolveBrand(product.brands, skuParam),
  );

  // GA4 view_item — fire once per product. Switching brand variants on the
  // same product must NOT re-fire (per spec). We key the ref on product.id
  // so navigating to a different product page re-arms the effect.
  const viewedProductRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedBrand) return;
    if (viewedProductRef.current === product.id) return;
    viewedProductRef.current = product.id;
    trackEcommerce("view_item", {
      currency: "NGN",
      value: selectedBrand.price,
      items: [{
        item_id: product.id,
        item_name: product.name,
        item_brand: selectedBrand.label,
        item_variant: selectedBrand.sku ?? "",
        item_category: product.category ?? "",
        item_category2: product.subcategory ?? "",
        price: selectedBrand.price,
        quantity: 1,
      }],
    });
  }, [product.id, selectedBrand?.id]);

  // Re-resolve whenever brands or the ?sku= param change. Both deps matter:
  //   - brands: brands may load/refresh asynchronously
  //   - skuParam: user can paste a different SKU URL in the same SPA session
  // Without re-resolving on brands change, the page could stay blank after a
  // refetch returns a different variant list.
  useEffect(() => {
    const next = resolveBrand(product.brands, skuParam);
    if (next && next.id !== selectedBrand?.id) setSelectedBrand(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.brands, skuParam]);

  // Wrap brand selection so the URL stays in sync — keeps the SKU
  // shareable when a customer switches variants manually.
  const selectBrand = (b: Brand) => {
    setSelectedBrand(b);
    if (b.sku) {
      const next = new URLSearchParams(searchParams);
      next.set("sku", b.sku);
      navigate(`?${next.toString()}`, { replace: true });
    }
  };
  const [selectedSize, setSelectedSize] = useState(product.sizes?.[0] || "");
  const { cart, addToCart, updateQty } = useCart();
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  const cartItem = cart.find(c => c.id === product.id);
  const isInCart = !!cartItem;
  const deliveryText = settings?.delivery_text || "Delivery: 1–3 business days";

  const isOutOfStock = isProductOOS(product) || !selectedBrand?.inStock;
  const isLowStock = !isOutOfStock && selectedBrand?.stockQuantity != null && selectedBrand.stockQuantity > 0 && selectedBrand.stockQuantity <= 5;
  const showSalePrice = selectedBrand?.compareAtPrice && selectedBrand.compareAtPrice > selectedBrand.price;
  const savings = showSalePrice ? selectedBrand.compareAtPrice! - selectedBrand.price : 0;
  const savingsPercent = showSalePrice ? Math.round((savings / selectedBrand.compareAtPrice!) * 100) : 0;

  // Build image gallery from brand images (each brand with an image = one slide)
  const brandImages: { url: string; alt: string; brandId: string }[] = [];
  product.brands.forEach(b => {
    if (b.imageUrl) {
      brandImages.push({ url: b.imageUrl, alt: `${product.name} - ${b.label}`, brandId: b.id });
    }
  });
  // Fallback: if no brand images, use product-level images
  if (brandImages.length === 0) {
    const productImages = (raw?.product_images || []).sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));
    productImages.forEach((img: any) => {
      if (img.image_url) brandImages.push({ url: img.image_url, alt: img.alt_text || product.name, brandId: "" });
    });
    if (product.imageUrl) brandImages.push({ url: product.imageUrl, alt: product.name, brandId: "" });
  }

  // Sync active image to selected brand
  useEffect(() => {
    if (!selectedBrand) return;
    const idx = brandImages.findIndex(img => img.brandId === selectedBrand.id);
    if (idx >= 0) setActiveImageIdx(idx);
  }, [selectedBrand?.id]);

  const displayImage = brandImages[activeImageIdx]?.url || selectedBrand?.imageUrl || product.imageUrl;
  const longDescription = raw?.long_description || "";
  const howToUse = raw?.how_to_use || "";
  const videoUrl = raw?.video_url || "";

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

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: product.name, url }); } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied!");
      } catch {
        // Fallback for non-secure contexts
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        toast.success("Link copied!");
      }
    }
  };

  // Guard: if the product has no brands at all, render an "unavailable"
  // state instead of crashing on selectedBrand.X reads below. This is
  // a defensive backstop — the data path should always include at least
  // one brand variant — but the page must never go blank.
  if (!selectedBrand) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 pt-24">
        <h1 className="pf text-2xl font-bold">{product.name}</h1>
        <p className="text-muted-foreground text-sm">This product is currently unavailable.</p>
        <Link to="/shop" className="text-forest font-semibold hover:underline">← Back to Shop</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-8 pt-20 md:pt-24">
      {zoomImage && <ImageZoomModal src={zoomImage} alt={product.name} onClose={() => setZoomImage(null)} />}

      {/* Breadcrumb */}
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-2">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span>/</span>
          <Link to="/shop" className="hover:text-foreground">Shop</Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">{product.name}</span>
        </nav>
      </div>

      <div className="max-w-6xl mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-6 md:gap-10">
          {/* LEFT: Image Gallery */}
          <div>
            {/* Main Image */}
            <div
              className="relative aspect-square rounded-2xl overflow-hidden cursor-zoom-in group"
              style={{ backgroundColor: displayImage ? '#f5f5f5' : (selectedBrand.color || "#F0F7F4") }}
              onClick={() => displayImage && setZoomImage(displayImage)}
            >
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
              <ProductImage imageUrl={displayImage} emoji={selectedBrand.img || product.baseImg} alt={product.name} className="w-full h-full object-contain p-6" emojiClassName="text-8xl" />
              {displayImage && (
                <div className="absolute bottom-3 right-3 bg-card/80 rounded-full p-2 opacity-60 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <ZoomIn className="h-5 w-5 text-foreground" />
                </div>
              )}
            </div>

            {/* Thumbnail Gallery */}
            {brandImages.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {brandImages.map((img, i) => (
                  <button key={i} onClick={() => {
                    setActiveImageIdx(i);
                    // Auto-select brand when clicking its image
                    if (img.brandId) {
                      const brand = product.brands.find(b => b.id === img.brandId);
                      if (brand) selectBrand(brand);
                    }
                  }}
                    className={`w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${activeImageIdx === i ? "border-forest" : "border-transparent hover:border-border"}`}>
                    <img src={img.url} alt={img.alt} className="w-full h-full object-contain bg-muted/30 p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Product Info */}
          <div className="flex flex-col">
            <h1 className="pf text-2xl md:text-3xl font-bold mb-2">{product.name}</h1>

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

            {/* Price */}
            <div className="flex items-baseline gap-3 mb-1">
              <span className="pf text-2xl md:text-3xl font-bold text-forest">{fmt(selectedBrand.price)}</span>
              {showSalePrice && (
                <span className="text-muted-foreground text-lg line-through">{fmt(selectedBrand.compareAtPrice!)}</span>
              )}
              {showSalePrice && (
                <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-0.5 rounded-pill">-{savingsPercent}%</span>
              )}
            </div>
            <div className="mb-4" />

            <p className="text-muted-foreground text-sm leading-relaxed mb-4">{product.description}</p>

            {/* Diaper attribute pills */}
            {(() => {
              const badges = diaperBadges(selectedBrand);
              return badges.length > 0 ? (
                <div className="flex flex-wrap gap-1 mb-4">
                  {badges.map(b => (
                    <span key={b} className="text-[12px] font-medium rounded-full px-2.5 py-1" style={{ backgroundColor: "#F0F0F0", color: "#555" }}>
                      {b}
                    </span>
                  ))}
                </div>
              ) : null;
            })()}

            {/* Brand Details — cream card, updates with the brand selector */}
            {(() => {
              const rows: Array<[string, string]> = [];
              rows.push(["Brand", selectedBrand.label]);
              if (selectedBrand.packCount && selectedBrand.packCount > 0) {
                const unit = selectedBrand.diaperType === "Pant" ? "pants"
                  : selectedBrand.diaperType === "Underlay" ? "sheets"
                  : "nappies";
                rows.push(["Pack Count", `${selectedBrand.packCount} ${unit}`]);
              }
              const trimmed = (v: unknown) => (v == null ? "" : String(v).trim());
              const diaperType = trimmed(selectedBrand.diaperType);
              const weightRange = trimmed(selectedBrand.weightRangeKg);
              const sizeVariant = trimmed(selectedBrand.sizeVariant);
              const sku = trimmed(selectedBrand.sku);
              if (diaperType) rows.push(["Type", diaperType]);
              if (weightRange) rows.push(["Weight Range", weightRange]);
              if (sizeVariant) rows.push(["Size", sizeVariant]);
              if (sku) rows.push(["SKU", sku]);
              if (rows.length <= 1) return null; // only Brand row, nothing extra to surface
              return (
                <section
                  className="rounded-xl p-3 mb-4 space-y-1"
                  style={{ backgroundColor: "#FFF8F4" }}
                >
                  <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#7A7A7A" }}>Brand Details</div>
                  <dl className="text-sm">
                    {rows.map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between py-0.5">
                        <dt className="text-[12px]" style={{ color: "#7A7A7A" }}>{k}:</dt>
                        <dd className="text-[14px] font-bold" style={{ color: "#1A1A1A" }}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })()}

            {/* Delivery */}
            <div className="flex items-center gap-2 bg-forest-light rounded-lg px-3 py-2 text-xs text-forest font-semibold mb-4">
              <Truck className="h-4 w-4" /> {deliveryText}
            </div>

            {/* Brand Selector */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Choose Brand</p>
              <div className="flex flex-wrap gap-2">
                {product.brands.map(b => {
                  const brandOos = !b.inStock || product.isOutOfStock;
                  const pcLabel = packCountLabel(b);
                  return (
                    <button key={b.id} onClick={() => { selectBrand(b); setActiveImageIdx(0); }}
                      className={`min-h-[44px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] transition-all font-body flex items-center gap-1.5 ${brandOos ? "opacity-50" : ""} ${selectedBrand.id === b.id ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                      {b.logoUrl && <img src={b.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span>{b.label}{pcLabel ? ` ${pcLabel}` : ""} — {fmt(b.price)}{brandOos ? " (out of stock)" : ""}</span>
                      {b.compareAtPrice && b.compareAtPrice > b.price && !brandOos && (
                        <span className="line-through text-muted-foreground text-[10px]">{fmt(b.compareAtPrice)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Size Selector */}
            {product.sizes && product.sizes.length > 0 && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Select Size</p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map(s => (
                    <button key={s} onClick={() => setSelectedSize(s)}
                      className={`min-h-[44px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] transition-all font-body ${selectedSize === s ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isLowStock && (
              <p className="text-[#E65100] text-xs font-semibold mb-3">🔥 Only {selectedBrand.stockQuantity} left!</p>
            )}

            {/* Add to Cart */}
            <div className="flex items-center gap-4 mb-6">
              {isOutOfStock ? (
                <button className="rounded-pill bg-border px-8 py-3.5 text-sm font-semibold text-muted-foreground cursor-not-allowed min-h-[48px] flex-1">
                  Out of Stock
                </button>
              ) : isInCart && cartItem ? (
                <div className="flex items-center gap-4 flex-1">
                  <QtyControl qty={cartItem.qty} onUpdate={(newQty) => updateQty(cartItem._key, newQty)} size="md" maxQty={selectedBrand.stockQuantity ?? undefined} />
                  <Link to="/cart" className="text-forest text-sm font-semibold hover:underline font-body">View Cart →</Link>
                </div>
              ) : (
                <button onClick={handleAdd} className="rounded-pill px-8 py-3.5 text-sm font-semibold text-primary-foreground font-body interactive flex items-center gap-2 min-h-[48px] flex-1 justify-center" style={{ backgroundColor: "#F4845F" }}>
                  <ShoppingBag className="h-5 w-5" /> Add to Cart
                </button>
              )}
              <button onClick={handleShare} className="rounded-full border border-border p-3 hover:bg-muted transition-colors" aria-label="Share">
                <Share2 className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <SubscribeAndSaveBadge productId={raw?.id} isSubscribable={raw?.is_subscribable === true} />

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="flex flex-col items-center gap-1 text-center">
                <Truck className="h-5 w-5 text-forest" />
                <span className="text-[10px] text-muted-foreground font-medium">Fast Delivery</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-center">
                <Shield className="h-5 w-5 text-forest" />
                <span className="text-[10px] text-muted-foreground font-medium">Quality Assured</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-center">
                <Package className="h-5 w-5 text-forest" />
                <span className="text-[10px] text-muted-foreground font-medium">Secure Packaging</span>
              </div>
            </div>

            {/* Why mums love this */}
            {getWhyText() && (
              <div className="bg-forest-light rounded-xl p-4 text-sm text-forest mb-4">
                <span className="font-semibold">💡 Why mums love this: </span>{getWhyText()}
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom Sections ── */}
        <div className="mt-10 space-y-8 max-w-4xl mx-auto">
          {/* Product Details */}
          <section>
            <h2 className="pf text-lg font-bold mb-4 border-b border-border pb-2">Product Details</h2>
            <div className="space-y-3">
              {product.packInfo && (
                <div className="flex items-start gap-3 bg-warm-cream rounded-lg px-4 py-3 text-sm">
                  <span className="font-semibold">📦</span><span>{product.packInfo}</span>
                </div>
              )}
              {product.material && (
                <div className="flex items-start gap-3 bg-warm-cream rounded-lg px-4 py-3 text-sm">
                  <span className="font-semibold">🧵</span><span>Material: {product.material}</span>
                </div>
              )}
              {product.contents && product.contents.length > 0 && (
                <div className="flex items-start gap-3 bg-warm-cream rounded-lg px-4 py-3 text-sm">
                  <span className="font-semibold">📋</span><span>Includes: {product.contents.join(" · ")}</span>
                </div>
              )}
              {product.safetyInfo && (
                <div className="flex items-start gap-3 bg-warm-cream rounded-lg px-4 py-3 text-sm">
                  <span className="font-semibold">🛡️</span><span>{product.safetyInfo}</span>
                </div>
              )}
              {product.allergenInfo && (
                <div className="flex items-start gap-3 bg-warm-cream rounded-lg px-4 py-3 text-sm">
                  <span className="font-semibold">⚠️</span><span>Allergen info: {product.allergenInfo}</span>
                </div>
              )}
            </div>
          </section>

          {/* Long Description */}
          {longDescription && (
            <section>
              <h2 className="pf text-lg font-bold mb-4 border-b border-border pb-2">About This Product</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-line">{longDescription}</div>
            </section>
          )}

          {/* How to Use */}
          {howToUse && (
            <section>
              <h2 className="pf text-lg font-bold mb-4 border-b border-border pb-2">How to Use</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-line">{howToUse}</div>
            </section>
          )}

          {/* Video */}
          {videoUrl && (
            <section>
              <h2 className="pf text-lg font-bold mb-4 border-b border-border pb-2">Watch & Learn</h2>
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                {videoUrl.includes("youtube") || videoUrl.includes("youtu.be") ? (
                  <iframe
                    src={videoUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")}
                    className="w-full h-full"
                    allowFullScreen
                    title={`${product.name} video`}
                  />
                ) : (
                  <video src={videoUrl} controls className="w-full h-full object-contain" />
                )}
              </div>
            </section>
          )}

          {/* Reviews placeholder */}
          <section>
            <h2 className="pf text-lg font-bold mb-4 border-b border-border pb-2">Customer Reviews</h2>
            <div className="flex items-center gap-4 mb-6">
              <div className="text-center">
                <p className="pf text-4xl font-bold text-forest">{product.rating}</p>
                <div className="flex justify-center mt-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`h-4 w-4 ${s <= Math.round(product.rating) ? "text-coral fill-coral" : "text-border"}`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{product.reviews} reviews</p>
              </div>
              <div className="flex-1 space-y-1">
                {[5, 4, 3, 2, 1].map(star => {
                  const pct = star === Math.round(product.rating) ? 60 : star === Math.round(product.rating) - 1 ? 25 : star === Math.round(product.rating) + 1 ? 10 : 5;
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-3">{star}</span>
                      <Star className="h-3 w-3 text-coral fill-coral" />
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-coral rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-center py-6 text-sm text-muted-foreground">
              <p>Reviews are verified from real BundledMum customers.</p>
            </div>
          </section>
        </div>
      </div>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-[56px] md:bottom-0 left-0 right-0 bg-card border-t border-border p-3 flex items-center justify-between gap-4 z-40 md:hidden safe-area-bottom">
        <div>
          <p className="pf text-lg font-bold text-forest">{fmt(selectedBrand.price)}</p>
          {showSalePrice && <p className="text-muted-foreground text-[10px] line-through">{fmt(selectedBrand.compareAtPrice!)}</p>}
        </div>
        {isOutOfStock ? (
          <span className="text-sm text-muted-foreground font-semibold">Out of Stock</span>
        ) : isInCart && cartItem ? (
          <div className="flex items-center gap-3">
            <QtyControl qty={cartItem.qty} onUpdate={(newQty) => updateQty(cartItem._key, newQty)} size="md" maxQty={selectedBrand.stockQuantity ?? undefined} />
            <Link to="/cart" className="text-forest text-sm font-semibold">Cart →</Link>
          </div>
        ) : (
          <button onClick={handleAdd} className="rounded-pill px-6 py-3 text-sm font-semibold text-primary-foreground font-body flex items-center gap-2 min-h-[44px]" style={{ backgroundColor: "#F4845F" }}>
            <ShoppingBag className="h-4 w-4" /> Add to Cart
          </button>
        )}
      </div>
    </div>
  );
}

function ProductPageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 pt-8">
      <Skeleton className="h-4 w-48 mb-6" />
      <div className="grid md:grid-cols-2 gap-10">
        <Skeleton className="aspect-square rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscribe & Save badge — shown on subscribable products when the feature
// is enabled in admin settings. Links to /subscriptions with the product
// id pre-seeded so the landing page auto-ticks and scrolls to it.
// ---------------------------------------------------------------------------
function SubscribeAndSaveBadge({ productId, isSubscribable }: { productId?: string; isSubscribable: boolean }) {
  const { data: settings } = useSubscriptionSettings();
  // Default-hidden: only render once we've confirmed the programme is on.
  // While the settings query is loading, the badge stays out.
  if (!isSubscribable || settings?.subscription_enabled !== true) return null;
  return (
    <div className="bg-forest/5 border border-forest/20 rounded-card px-4 py-3 mb-6 flex items-center gap-3">
      <Repeat className="w-5 h-5 text-forest flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-bold text-sm">{settings.subscription_badge_label}</div>
        <div className="text-xs text-text-med">Save {settings.discount_pct}% + Free delivery</div>
      </div>
      <Link
        to={`/subscriptions?product=${productId || ""}`}
        className="rounded-pill border border-forest text-forest px-3 py-2 text-xs font-semibold hover:bg-forest/10 whitespace-nowrap"
      >
        Subscribe →
      </Link>
    </div>
  );
}
