import { Link } from "react-router-dom";
import { useCart, fmt, formatColor, cartItemImage, cartItemKey, type CartItem } from "@/lib/cart";
import EditCartItemModal from "@/components/EditCartItemModal";
import { useAllProducts, useSiteSettings } from "@/hooks/useSupabaseData";
import { useSpendThresholds, getSpendPrompt } from "@/hooks/useSpendThresholds";
import ProductImage from "@/components/ProductImage";
import SpendMoreBanner from "@/components/SpendMoreBanner";
import { FreeDeliveryNudgeBanner } from "@/components/FreeDeliveryNudgeBanner";
import { useCrossSellRules } from "@/hooks/useHomepage";
import { Minus, Plus, X, ShoppingBag, ArrowLeft, Bookmark, MapPin, Pencil, Share2 } from "lucide-react";
import { encodeCartToUrl, decodeCartFromUrl, buildWhatsappMessage, type SharedCartItem } from "@/lib/cartShareUrl";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageCircle, Copy as CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { analytics, trackEcommerce } from "@/lib/ga";

/**
 * Coerce a cart item's `img` value to a usable <img src>. Accepts:
 *   - absolute URLs: http://… / https://…
 *   - protocol-relative URLs: //…  (Jumia CDN uses these)
 *   - paths:        /images/…  (app-local)
 * Anything else (an emoji, or a stray filename) returns undefined so we
 * fall back to the emoji/placeholder path instead of attempting a fetch.
 */
function resolveImgUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return s;
  return undefined;
}

/**
 * Only pass the raw value through as an emoji fallback if it is short
 * enough to plausibly BE an emoji. A URL or long filename must never
 * end up rendered inside a text span — that's what causes the giant
 * URL-bleed we've seen on broken images.
 */
function resolveEmojiFallback(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (s.length > 4) return undefined;                  // too long to be a single emoji
  if (/[a-zA-Z0-9/.:_\-\\]/.test(s)) return undefined; // looks like a URL / path / filename
  return s;
}

export default function CartPage() {
  const { cart, setCart, subtotal, totalItems, savedItems, saveForLater, moveToCart, removeSaved, removeFromCart } = useCart();
  const { data: settings } = useSiteSettings();
  const { data: thresholds } = useSpendThresholds();
  // Image zoom + Edit modal local state. Both are page-scoped because the
  // line-item map iterator below can't carry React state of its own.
  const [zoomImage, setZoomImage] = useState<{ url: string; alt: string } | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const editingItem = editKey ? cart.find(c => c._key === editKey) : null;
  // Share-cart state — modal toggle + the resolved URL once the user opens
  // the share dialog. We compute the URL lazily so it captures whatever the
  // cart looks like at the moment the user wants to share.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  // When both clipboard tiers fail (very rare — restrictive iframe + old
  // browser), reveal a highlighted, auto-selected input so the user can
  // tap-and-hold to copy manually.
  const [showManualCopy, setShowManualCopy] = useState(false);
  const manualCopyRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (showManualCopy && manualCopyRef.current) {
      manualCopyRef.current.focus();
      manualCopyRef.current.select();
    }
  }, [showManualCopy]);
  // Shared-cart hydration state — true while we're parsing ?items= and
  // fetching product/brand details, so we can suppress the empty-cart flash.
  const [hydrating, setHydrating] = useState(false);

  useEffect(() => { document.title = `Your Cart (${totalItems}) | BundledMum`; }, [totalItems]);

  // ── Shared-cart auto-hydrate ──────────────────────────────────
  // When the page is opened with ?items=<base64>, decode the payload,
  // hydrate against the live products + brands tables to get prices /
  // images / availability, then either drop the rows straight in (cart
  // empty) or queue a confirmation modal so the user can choose to
  // replace, merge, or cancel. Runs exactly once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("items");
    if (!encoded) return;
    let cancelled = false;
    setHydrating(true);
    (async () => {
      try {
        const decoded = decodeCartFromUrl(encoded);
        if (!decoded || decoded.length === 0) {
          if (!cancelled) toast.error("Shared cart is empty or no longer available");
          return;
        }
        // Look up products + brands in two queries; the cart row builder
        // joins them in memory.
        const productIds = Array.from(new Set(decoded.map(d => d.product_id)));
        const brandIds = Array.from(new Set(decoded.map(d => d.brand_id).filter(Boolean) as string[]));
        const [prodRes, brandRes] = await Promise.all([
          supabase.from("products").select("id, name, slug, image_url, is_active").in("id", productIds),
          brandIds.length
            ? (supabase as any).from("brands_public").select("id, brand_name, price, image_url, in_stock, product_id").in("id", brandIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        // Build a cheapest-in-stock fallback brand lookup so rows whose
        // brand_id is missing or stale still hydrate.
        const fallbackRes = await (supabase as any)
          .from("brands_public")
          .select("id, brand_name, price, image_url, in_stock, product_id")
          .in("product_id", productIds)
          .eq("in_stock", true)
          .order("price");
        if (cancelled) return;
        const productsById: Record<string, any> = {};
        (prodRes.data || []).forEach((p: any) => { productsById[p.id] = p; });
        const brandsById: Record<string, any> = {};
        (brandRes.data || []).forEach((b: any) => { brandsById[b.id] = b; });
        const cheapestByProduct: Record<string, any> = {};
        (fallbackRes.data || []).forEach((b: any) => { if (!cheapestByProduct[b.product_id]) cheapestByProduct[b.product_id] = b; });

        const rows: CartItem[] = [];
        let skipped = 0;
        for (const d of decoded) {
          const product = productsById[d.product_id];
          if (!product || product.is_active === false) { skipped++; continue; }
          let brand = d.brand_id ? brandsById[d.brand_id] : null;
          if (!brand) brand = cheapestByProduct[d.product_id] || null;
          // If no brand can be found at all, still surface the product so
          // the customer can resolve it manually rather than dropping it.
          const price = Number(brand?.price ?? 0);
          const name = brand?.brand_name && !/^generic$/i.test(brand.brand_name)
            ? `${product.name} (${brand.brand_name})`
            : product.name;
          rows.push({
            id: product.id,
            _key: cartItemKey(product.id, brand?.id, d.size, d.color, null),
            name,
            price,
            qty: d.quantity,
            imageUrl: product.image_url || undefined,
            selectedBrand: brand ? {
              id: brand.id,
              label: brand.brand_name,
              price: Number(brand.price || 0),
              imageUrl: brand.image_url,
              inStock: brand.in_stock !== false,
            } : undefined,
            selectedSize: d.size || undefined,
            selectedColor: d.color || undefined,
          } as CartItem);
        }
        // Clean ?items= out of the URL so refresh / back-button don't re-fire
        // the hydrate pipeline.
        window.history.replaceState({}, "", window.location.pathname);
        if (rows.length === 0) {
          toast.error("Shared cart is empty or items are no longer available");
          return;
        }
        // Always replace silently — share links are explicit snapshots
        // and the recipient asked for THIS list, not a merge with
        // whatever happened to be in their cart already. URL was
        // already cleaned above, so a refresh won't re-fire this.
        setCart(rows);
        toast.success(
          skipped > 0
            ? `Cart loaded · ${skipped} item${skipped === 1 ? "" : "s"} couldn't be loaded (no longer available)`
            : "Cart loaded from shared link",
        );
      } catch (e) {
        console.warn("[cart-share] hydrate failed:", e);
        if (!cancelled) toast.error("Could not load shared cart");
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GA4 funnel — checkout_step 1 (cart) fires on CartPage mount with items.
  useEffect(() => {
    if (!cart || cart.length === 0) return;
    try {
      analytics.push({ event: "checkout_step", checkout_step: 1, checkout_step_name: "cart" });
    } catch { /* ignore */ }
    // Fire once per mount; cart changes don't re-arm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GA4 view_cart — fire once per CartPage mount when there's at least one
  // item. Ref-gated so qty changes / re-renders don't re-fire. Subsequent
  // visits to the cart (full page mount) will fire again, which is what
  // GA4 expects for "view_cart".
  const viewCartFiredRef = useRef(false);
  useEffect(() => {
    if (viewCartFiredRef.current) return;
    if (!cart || cart.length === 0) return;
    viewCartFiredRef.current = true;
    try {
      trackEcommerce("view_cart", {
        currency: "NGN",
        value: subtotal,
        items: cart.map((item: any) => {
          const brand = item.selectedBrand;
          const unitPrice = Number(brand?.price ?? item.price ?? 0);
          return {
            item_id: String(item.id),
            item_name: item.name,
            item_brand: brand?.label ?? "",
            item_variant: brand?.sku ?? "",
            item_category: item.category ?? "",
            item_category2: item.subcategory ?? "",
            price: unitPrice,
            quantity: Number(item.qty ?? 1),
          };
        }),
      });
    } catch (e) {
      console.warn("[ga] view_cart failed:", e);
    }
  }, [cart, subtotal]);

  // service_fee_enabled lives in jsonb as either a boolean or the string
  // "true"/"false" depending on how the row was seeded vs. saved through
  // the admin UI. Treat both as the off signal so a disabled toggle
  // actually disables the fee.
  const sfEnabledRaw = settings?.service_fee_enabled;
  const serviceFeeEnabled =
    sfEnabledRaw !== false && sfEnabledRaw !== "false" && sfEnabledRaw !== 0 && sfEnabledRaw !== "0";
  const serviceFee = serviceFeeEnabled ? (parseInt(String(settings?.service_fee ?? "0"), 10) || 0) : 0;
  const serviceFeeLabel = settings?.service_fee_label || "Service & Packaging";

  const defaultFreeThreshold = parseInt(settings?.default_free_threshold) || 0;

  // Spend threshold discount
  const spendPrompt = thresholds?.length ? getSpendPrompt(subtotal, thresholds) : null;
  const spendDiscount = spendPrompt?.appliedDiscount || 0;
  // Delivery fee is NOT added in the cart total — it's only known once
  // the customer enters their full location at checkout. See the
  // "Delivery fee calculated at checkout" note in the order summary.
  const total = subtotal + serviceFee - spendDiscount;

  const updateQty = (key: string, newQty: number) => {
    if (newQty <= 0) setCart(prev => prev.filter(i => i._key !== key));
    else setCart(prev => prev.map(i => i._key === key ? { ...i, qty: newQty } : i));
  };

  // Route through context's removeFromCart so the GA remove_from_cart
  // event fires with the item's full details before the row is dropped.
  const removeItem = (key: string) => removeFromCart(key);

  // GA4 begin_checkout — fires on the "Proceed to Checkout" click.
  // Wrapped in try/catch; never blocks navigation.
  const fireBeginCheckout = () => {
    if (!cart || cart.length === 0) return;
    try {
      trackEcommerce("begin_checkout", {
        currency: "NGN",
        value: subtotal,
        coupon: "",
        items: cart.map((item: any) => {
          const brand = item.selectedBrand;
          const unitPrice = Number(brand?.price ?? item.price ?? 0);
          return {
            item_id: String(item.id),
            item_name: item.name,
            item_brand: brand?.label ?? "",
            item_variant: brand?.sku ?? "",
            item_category: item.category ?? "",
            item_category2: item.subcategory ?? "",
            price: unitPrice,
            quantity: Number(item.qty ?? 1),
          };
        }),
      });
    } catch (e) {
      console.warn("[ga] begin_checkout failed:", e);
    }
  };

  const { data: allProductsData } = useAllProducts();
  const ALL_PRODUCTS = allProductsData || [];
  const cartIds = new Set(cart.map(i => i.id));
  const hasBundleItem = cart.some(i => !!i.bundleName);

  // True if any cart line item references a product (or brand variant)
  // that has since been deactivated server-side. We disable the checkout
  // buttons until the customer removes the dead row — otherwise
  // place-order would fail and they'd hit a confusing error at payment.
  // Only meaningful once the live product feed has loaded; while it's
  // still loading we never block (allProductsData is undefined → false).
  const hasUnshoppableCartItem = allProductsData != null && cart.some(item => {
    const live = ALL_PRODUCTS.find(p => p.id === item.id);
    if (!live) return true;
    const brand = live.brands.find(b => b.id === item.selectedBrand?.id);
    if (brand && brand.inStock !== false && (brand.price || 0) > 0) return false;
    return !live.brands.some(b => b.inStock !== false && (b.price || 0) > 0);
  });

  // DB-driven cross-sell: pick the rule that matches the current cart.
  // bundle_item trigger wins when the cart already contains a bundle;
  // otherwise fall back to 'always'. Heading + max_items come from the
  // rule. If the rule specifies product_ids, show those exactly;
  // otherwise use is_bestseller products.
  const { data: crossSellRules } = useCrossSellRules();
  const activeRule = (crossSellRules || []).find(r =>
    hasBundleItem ? r.trigger_type === "bundle_item" : r.trigger_type === "always"
  ) || (crossSellRules || []).find(r => r.trigger_type === "always");

  const crossSellHeading = activeRule?.heading || "You might also like";
  const crossSellMax = activeRule?.max_items ?? 3;
  const crossSell = (() => {
    if (activeRule?.product_ids && activeRule.product_ids.length > 0) {
      return activeRule.product_ids
        .map(id => ALL_PRODUCTS.find(p => p.id === id))
        .filter((p): p is typeof ALL_PRODUCTS[number] => !!p && !cartIds.has(p.id))
        .slice(0, crossSellMax);
    }
    // Fall back to bestsellers, then to the legacy category-swap logic.
    const hasBaby = cart.some(i => ALL_PRODUCTS.find(p => p.id === i.id)?.category === "baby");
    const hasMum = cart.some(i => ALL_PRODUCTS.find(p => p.id === i.id)?.category === "mum");
    return ALL_PRODUCTS
      .filter(p => !cartIds.has(p.id))
      .filter(p => (p as any).is_bestseller || (hasBaby && p.category === "mum") || (hasMum && p.category === "baby") || (!hasBaby && !hasMum))
      .slice(0, crossSellMax);
  })();

  if (!totalItems && savedItems.length === 0) {
    return (
      <div className="min-h-screen bg-background pt-20 pb-20">
        <div className="max-w-[600px] mx-auto px-4 text-center animate-fade-up pt-10">
          <ShoppingBag className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h1 className="pf text-2xl mb-2">Your cart is empty 🛍️</h1>
          <p className="font-body text-muted-foreground mb-6">Start building your perfect hospital bag</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            <Link to="/bundles" className="rounded-pill bg-coral px-8 py-3 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive inline-block min-h-[48px] flex items-center justify-center">
              Browse Bundles →
            </Link>
            <Link to="/quiz" className="rounded-pill border-2 border-forest text-forest px-8 py-3 font-body font-semibold hover:bg-forest/5 interactive inline-block min-h-[48px] flex items-center justify-center">
              Take the Quiz →
            </Link>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-3 justify-center mb-10">
            <div className="bg-forest-light rounded-lg px-4 py-3 text-xs text-forest font-semibold">🚚 Free delivery available on qualifying orders</div>
            <div className="bg-forest-light rounded-lg px-4 py-3 text-xs text-forest font-semibold">🔒 Secure Paystack checkout</div>
            <div className="bg-forest-light rounded-lg px-4 py-3 text-xs text-forest font-semibold">💬 WhatsApp support</div>
          </div>

          {/* Popular items */}
          {ALL_PRODUCTS.length > 0 && (
            <div>
              <h3 className="pf text-lg text-forest mb-4">✨ Popular Items</h3>
              <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
                <div className="flex gap-3" style={{ minWidth: "max-content" }}>
                  {ALL_PRODUCTS.filter(p => p.badge || p.rating >= 4.8).slice(0, 6).map(p => {
                    const brand = p.brands[Math.min(1, p.brands.length - 1)];
                    return (
                      <Link to="/shop" key={p.id} className="bg-card rounded-card shadow-card p-3 text-center min-w-[140px] max-w-[160px]">
                        <ProductImage imageUrl={p.imageUrl} emoji={p.baseImg} alt={p.name} className="h-20 w-full rounded-lg mb-2" emojiClassName="text-3xl" bgColor={brand?.color} />
                        <p className="text-[11px] font-semibold truncate mb-1">{p.name}</p>
                        <p className="text-forest text-xs font-bold">{fmt(brand?.price || 0)}</p>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-24 pb-[calc(1rem+56px+72px)] md:pb-0">
      <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-8">
        <Link to="/shop" className="inline-flex items-center gap-1.5 text-forest text-sm font-semibold font-body mb-4 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Continue Shopping
        </Link>
        <h1 className="pf text-2xl md:text-3xl mb-8">Your Cart ({totalItems})</h1>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="space-y-3">
            <FreeDeliveryNudgeBanner cartSubtotal={subtotal} className="mb-1" />
            <SpendMoreBanner variant="cart" />
            {cart.map(item => {
              // Cross-reference the live ALL_PRODUCTS feed (already filtered
              // by the adapter to active + shoppable) to detect items that
              // have since been deactivated or had every brand variant pulled.
              const liveProduct = ALL_PRODUCTS.find(p => p.id === item.id);
              const liveBrand = liveProduct?.brands.find(b => b.id === item.selectedBrand?.id);
              // Bundle rows aren't validated through the regular ALL_PRODUCTS
              // shoppability check — their child items live in item.bundleItems
              // and were filtered for shoppability when added. Treat them as
              // always shoppable here so they don't render as "no longer
              // available" just because they don't appear in the products feed.
              const stillShoppable = item.type === "bundle"
                ? true
                : !!liveProduct && (
                    (liveBrand && liveBrand.inStock !== false && (liveBrand.price || 0) > 0)
                    || liveProduct.brands.some(b => b.inStock !== false && (b.price || 0) > 0)
                  );
              return (
              <div key={item._key} className={`bg-card rounded-card shadow-card p-3 sm:p-4 ${!stillShoppable ? "opacity-60" : ""}`}>
                {!stillShoppable && (
                  <div className="mb-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive flex items-center justify-between gap-2">
                    <span>This item is no longer available. Remove from cart to proceed to checkout.</span>
                    <button onClick={() => removeItem(item._key)} className="rounded-pill border border-destructive text-destructive px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap hover:bg-destructive hover:text-primary-foreground">Remove</button>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  {(() => {
                    const imgUrl = cartItemImage(item);
                    // For bundle rows the brand/product image lookup misses;
                    // fall through to the legacy emoji/ProductImage path.
                    if (item.type === "bundle" || imgUrl === "/placeholder.svg") {
                      return (
                        <ProductImage
                          imageUrl={resolveImgUrl(item.img)}
                          emoji={resolveEmojiFallback(item.img) || resolveEmojiFallback(item.baseImg)}
                          alt={item.name}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-md bg-warm-cream border border-border"
                          emojiClassName="text-2xl sm:text-3xl"
                        />
                      );
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => setZoomImage({ url: imgUrl, alt: item.name })}
                        className="flex-shrink-0 rounded-md overflow-hidden border border-border bg-warm-cream"
                        aria-label={`Zoom ${item.name}`}
                      >
                        <img
                          src={imgUrl}
                          alt={item.name}
                          loading="lazy"
                          className="w-16 h-16 sm:w-20 sm:h-20 object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }}
                        />
                      </button>
                    );
                  })()}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-body font-semibold text-[13px] sm:text-sm leading-tight line-clamp-2">{item.name}</h3>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                      {item.selectedBrand && <span className="font-body text-[11px] text-forest">{item.selectedBrand.label}</span>}
                      {item.selectedSize && <span className="font-body text-[11px] text-text-light">Size / Age: {item.selectedSize}</span>}
                      {item.selectedColor && <span className="font-body text-[11px] text-text-light">Colour: {formatColor(item.selectedColor)}</span>}
                    </div>
                    <p className="font-body font-bold text-coral text-sm mt-1">{fmt(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => saveForLater(item._key)} className="text-text-light hover:text-forest interactive p-1" title="Save for later">
                      <Bookmark className="h-4 w-4" />
                    </button>
                    <button onClick={() => removeItem(item._key)} className="text-text-light hover:text-destructive interactive p-1">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {item.type === "bundle" && Array.isArray(item.bundleItems) && item.bundleItems.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <ul className="space-y-1">
                      {item.bundleItems.map((bi, idx) => (
                        <li key={`${item._key}-${bi.productId}-${idx}`} className="flex items-start gap-2 text-[12px] text-text-med">
                          <span className="text-text-light flex-shrink-0">↳</span>
                          <span className="flex-1 min-w-0 truncate">
                            {bi.productName}
                            {bi.brandName ? <span className="text-text-light"> — {bi.brandName}</span> : null}
                            {bi.quantity > 1 ? <span className="text-text-light"> × {bi.quantity}</span> : null}
                            {bi.isDefault === false && <span className="ml-1 text-[10px] uppercase tracking-wider text-coral font-bold">added</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {(item.removedDefaultCount ?? 0) > 0 && (
                      <p className="mt-1 text-[11px] text-text-light">
                        {item.removedDefaultCount} item{(item.removedDefaultCount ?? 0) === 1 ? "" : "s"} removed from default
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <Link to={`/products/${liveProduct?.slug || ""}`} className="text-[11px] text-forest font-semibold hover:underline">
                        Edit bundle →
                      </Link>
                      <p className="font-body font-bold text-sm">{fmt(item.price)}</p>
                    </div>
                  </div>
                )}
                {item.type !== "bundle" && (
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQty(item._key, item.qty - 1)} className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-warm-cream flex items-center justify-center interactive">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="font-body font-bold text-sm w-6 text-center">{item.qty}</span>
                    <button onClick={() => updateQty(item._key, item.qty + 1)} className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-warm-cream flex items-center justify-center interactive">
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setEditKey(item._key)}
                      className="ml-1 inline-flex items-center gap-1 rounded-pill border border-border text-text-med hover:text-forest hover:border-forest/60 px-2.5 py-1 text-[11px] font-semibold"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </div>
                  <p className="font-body font-bold text-sm">{fmt(item.price * item.qty)}</p>
                </div>
                )}
              </div>
              );
            })}

            {savedItems.length > 0 && (
              <div className="mt-6">
                <h3 className="pf text-lg mb-3">💾 Saved for Later ({savedItems.length})</h3>
                <div className="space-y-2">
                  {savedItems.map(item => (
                    <div key={item._key} className="bg-warm-cream rounded-card p-3 flex items-center gap-3">
                      <ProductImage imageUrl={resolveImgUrl(item.img)} emoji={resolveEmojiFallback(item.img) || resolveEmojiFallback(item.baseImg)} alt={item.name} className="w-10 h-10 rounded-lg bg-card" emojiClassName="text-xl" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.name}</p>
                        <p className="text-coral text-xs font-bold">{fmt(item.price)}</p>
                      </div>
                      <button onClick={() => moveToCart(item._key)} className="rounded-pill bg-forest px-3 py-1.5 text-[11px] font-semibold text-primary-foreground font-body interactive">Move to Cart</button>
                      <button onClick={() => removeSaved(item._key)} className="text-text-light hover:text-destructive p-1"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {crossSell.length > 0 && totalItems > 0 && (
              <div className="mt-6">
                <h3 className="pf text-lg mb-3">💡 {crossSellHeading}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {crossSell.map(p => {
                    const brand = p.brands[Math.min(1, p.brands.length - 1)];
                    return (
                      <div key={p.id} className="bg-card rounded-card shadow-card p-3 text-center">
                        <ProductImage imageUrl={p.imageUrl} emoji={p.baseImg} alt={p.name} className="h-16 w-full rounded-lg" emojiClassName="text-3xl" bgColor={brand.color} />
                        <p className="text-[11px] font-semibold truncate mb-1">{p.name}</p>
                        <p className="text-forest text-xs font-bold mb-2">{fmt(brand.price)}</p>
                        <Link to="/shop" className="text-forest text-[10px] font-semibold hover:underline">View →</Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="lg:sticky lg:top-24 h-fit">
            <div className="bg-card rounded-card shadow-card p-6">
              <h2 className="pf text-lg mb-4">Order Summary</h2>

              <div className="space-y-2 font-body text-sm">
                <div className="flex justify-between"><span className="text-text-med">Subtotal</span><span>{fmt(subtotal)}</span></div>
                <div className="bg-muted/40 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-text-med">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    Delivery fee calculated at checkout. Enter your delivery
                    location to see the exact fee for your area.
                  </span>
                </div>
                {serviceFeeEnabled && (
                  <div className="flex justify-between">
                    <span className="text-text-med flex items-center gap-1">📦 {serviceFeeLabel}</span>
                    <span>{fmt(serviceFee)}</span>
                  </div>
                )}
                {spendDiscount > 0 && (
                  <div className="flex justify-between text-forest">
                    <span className="font-semibold">🎉 Spend Discount ({spendPrompt?.currentDiscount?.discount_percent}%)</span>
                    <span className="font-bold">-{fmt(spendDiscount)}</span>
                  </div>
                )}
                <div className="border-t border-border pt-3 flex justify-between pf font-semibold text-lg">
                  <span>Total</span>
                  <span className="text-forest">{fmt(total)}</span>
                </div>
              </div>

              {hasUnshoppableCartItem ? (
                <button
                  disabled
                  className="mt-5 block w-full rounded-pill bg-border py-3 text-center font-body font-semibold text-muted-foreground cursor-not-allowed"
                >
                  Remove unavailable items to continue
                </button>
              ) : (
                <Link to="/checkout" onClick={fireBeginCheckout} className="mt-5 block w-full rounded-pill bg-forest py-3 text-center font-body font-semibold text-primary-foreground hover:bg-forest-deep interactive">
                  Proceed to Checkout 🔒
                </Link>
              )}
              <button
                onClick={() => {
                  // Compose the URL lazily so it captures the current cart.
                  const url = encodeCartToUrl(
                    cart.map((it: any): SharedCartItem => ({
                      product_id: String(it.id),
                      brand_id: it.selectedBrand?.id || null,
                      size: it.selectedSize || null,
                      color: it.selectedColor || null,
                      quantity: it.qty || 1,
                    })),
                  );
                  setShareUrl(url);
                  setShareOpen(true);
                }}
                disabled={cart.length === 0}
                className="mt-2 block w-full rounded-pill border-[1.5px] border-forest py-2.5 text-center font-body font-semibold text-forest text-sm hover:bg-forest-light disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-4 h-4" /> Share Cart
              </button>
              <p className="text-center font-body text-xs text-text-light mt-3">Secured by Paystack · All cards accepted</p>
              <div className="flex justify-center gap-3 mt-2 text-xs text-text-light">
                <span>💳 Visa</span><span>💳 Mastercard</span><span>🏦 USSD</span><span>📱 Transfer</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky mobile checkout bar — sits above MobileBottomNav (h-14 + safe-area) */}
      {totalItems > 0 && (
        <div
          className="fixed left-0 right-0 z-40 bg-card border-t border-border md:hidden"
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom))" }}
        >
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="text-[10px] text-text-light font-semibold uppercase tracking-wide">Subtotal</div>
              <div className="text-sm font-bold text-forest tabular-nums">{fmt(subtotal)}</div>
            </div>
            {hasUnshoppableCartItem ? (
              <button
                disabled
                className="flex-1 inline-flex items-center justify-center rounded-pill bg-border text-muted-foreground py-2.5 text-sm font-semibold cursor-not-allowed"
              >
                Remove unavailable items
              </button>
            ) : (
              <Link
                to="/checkout"
                onClick={fireBeginCheckout}
                className="flex-1 inline-flex items-center justify-center rounded-pill bg-forest text-primary-foreground py-2.5 text-sm font-semibold hover:bg-forest-deep"
              >
                Proceed to Checkout →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Image lightbox — full-screen with 80% black overlay, dismiss on
          outside-click or the close button. Native <img loading="lazy"> so
          we never need an image library. */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setZoomImage(null)}
        >
          <button
            onClick={() => setZoomImage(null)}
            className="absolute top-4 right-4 z-[210] bg-card rounded-full p-2 shadow-lg hover:bg-muted"
            aria-label="Close zoom"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
          <img
            src={zoomImage.url}
            alt={zoomImage.alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }}
          />
        </div>
      )}

      {/* Edit variant modal */}
      {editingItem && (
        <EditCartItemModal item={editingItem} onClose={() => setEditKey(null)} />
      )}

      {/* Share-cart modal — WhatsApp deep-link + clipboard copy */}
      {shareOpen && (
        <div
          className="fixed inset-0 bg-foreground/60 z-[150] flex items-center justify-center p-4"
          onClick={() => { setShareOpen(false); setShowManualCopy(false); }}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-[420px] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-forest-light flex items-center justify-center flex-shrink-0">
                <Share2 className="w-5 h-5 text-forest" />
              </div>
              <div>
                <h3 className="font-bold text-base">Share your cart</h3>
                <p className="text-xs text-text-med mt-1">
                  Send this list to family or friends. Anyone with the link can view it.
                </p>
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <button
                onClick={() => {
                  const msg = buildWhatsappMessage(
                    cart.map((it: any) => ({
                      product_name: (it.name || "").replace(/\s*\([^)]*\)\s*$/, ""),
                      brand_label: it.selectedBrand?.label || null,
                      size: it.selectedSize || null,
                      color: it.selectedColor ? formatColor(it.selectedColor) : null,
                      quantity: it.qty || 1,
                      unit_price: it.price || 0,
                    })),
                    shareUrl,
                  );
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
                  toast.success("Opening WhatsApp…");
                  setShareOpen(false);
                }}
                className="w-full inline-flex items-center justify-center gap-2 bg-forest text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-forest-deep"
              >
                <MessageCircle className="w-4 h-4" /> Share via WhatsApp
              </button>
              <button
                onClick={async () => {
                  const ok = await copyToClipboard(shareUrl);
                  if (ok) {
                    toast.success("Link copied to clipboard");
                    setTimeout(() => { setShareOpen(false); setShowManualCopy(false); }, 800);
                  } else {
                    setShowManualCopy(true);
                  }
                }}
                className="w-full inline-flex items-center justify-center gap-2 border border-border px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-muted"
              >
                <CopyIcon className="w-4 h-4" /> Copy link
              </button>
              {showManualCopy ? (
                <div className="rounded-lg border-2 border-coral bg-coral/5 p-2">
                  <p className="text-[11px] font-semibold text-coral mb-1.5">
                    Tap and hold to select, then copy
                  </p>
                  <input
                    ref={manualCopyRef}
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full border border-coral/40 rounded-md px-3 py-2 text-[11px] bg-card font-mono text-foreground"
                  />
                </div>
              ) : (
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full border border-input rounded-lg px-3 py-2 text-[11px] bg-muted/40 font-mono text-text-med"
                />
              )}
              <button
                onClick={() => { setShareOpen(false); setShowManualCopy(false); }}
                className="w-full text-text-med hover:text-foreground text-sm font-semibold py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hydration loading scrim — suppresses the empty-cart flash while
          ?items= is being resolved. */}
      {hydrating && cart.length === 0 && (
        <div className="fixed inset-0 bg-background/80 z-[140] flex items-center justify-center">
          <div className="flex items-center gap-3 text-text-med text-sm">
            <span className="inline-block w-4 h-4 border-2 border-forest border-r-transparent rounded-full animate-spin" />
            Loading shared cart…
          </div>
        </div>
      )}
    </div>
  );
}
