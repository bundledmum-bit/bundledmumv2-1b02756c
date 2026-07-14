import { useState, useEffect, useRef, useMemo } from "react";
import Seo from "@/components/Seo";
import ImageZoomModal from "@/components/ImageZoomModal";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adaptProduct, isProductOOS, isProductShoppable, type Product, type Brand } from "@/lib/supabaseAdapters";
import { useCart, fmt, getBrandForBudget, cartItemKey } from "@/lib/cart";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { useBrandPromo, useBrandPromoDisplay } from "@/hooks/useBrandPricing";
import { useCountdown } from "@/components/home/FlashDeals";
import KlumpAdBanner from "@/components/KlumpAdBanner";
import { brandOptionName } from "@/lib/brandOptions";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { trackEcommerce } from "@/lib/ga";
import ProductImage from "@/components/ProductImage";
import QtyControl from "@/components/QtyControl";
import { Star, ShoppingBag, ChevronLeft, ZoomIn, X, Share2, Truck, Shield, Package, Repeat, MessageCircle, Minus, Plus, Lock, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscriptionSettings } from "@/hooks/useSubscription";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { getBrandImage } from "@/lib/brandImage";
import { track as pixelTrack, moneyPayload as pixelMoney } from "@/lib/metaPixel";
import { diaperBadges } from "@/lib/diaperBrand";
import BundleCustomiser from "@/components/BundleCustomiser";
import MaternityBundleItemsEditor from "@/components/MaternityBundleItemsEditor";
import type { MaternityBundleSnapshotItem } from "@/components/MaternityBundleItemsGrid";
import { useBundleItemsEdit } from "@/hooks/useBundleItemsEdit";
import { buildWhatsAppOrderHref, buildProductOrderWhatsAppHref } from "@/lib/whatsapp";
import whatsappLogo from "@/assets/whatsapp-logo.svg";
import BrandSelect from "@/components/BrandSelect";
import Breadcrumb from "@/components/Breadcrumb";
import { useProductCategories } from "@/hooks/useProductCategories";

function useProduct(slug: string) {
  return useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      let { data, error } = await supabase
        .from("products")
        .select("*, brands:brands_public!brands_product_id_fkey(id, product_id, brand_name, price, tier, is_default_for_tier, size_variant, in_stock, stock_quantity, display_order, image_url, stored_image_url, thumbnail_url, logo_url, compare_at_price, weight_range_kg, pack_count, diaper_type, sku, variant_type, description), product_sizes(*), product_colors(*), product_tags(*), product_images(*)")
        .eq("slug", slug)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();

      if (!data) {
        const res = await supabase
          .from("products")
          .select("*, brands:brands_public!brands_product_id_fkey(id, product_id, brand_name, price, tier, is_default_for_tier, size_variant, in_stock, stock_quantity, display_order, image_url, stored_image_url, thumbnail_url, logo_url, compare_at_price, weight_range_kg, pack_count, diaper_type, sku, variant_type, description), product_sizes(*), product_colors(*), product_tags(*), product_images(*)")
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
export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = useProduct(slug || "");
  const product = data?.adapted || null;
  const raw = data?.raw;




  // Customise editor toggle for the maternity-bundle redesign. Local
  // session state — resets on navigation.
  const [customiseOpenBundle, setCustomiseOpenBundle] = useState(false);
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
  // Re-derive slug here so the maternity-bundle scope gate (added in
  // commit 4eefb74) can reference it. ProductPage's slug isn't passed
  // as a prop to ProductPageContent, so useParams is the cleanest pickup.
  const { slug } = useParams<{ slug: string }>();
  const skuParam = searchParams.get("sku");

  // Maternity-bundle snapshot query + customise toggle (moved from
  // ProductPage so refs inside this component resolve).
  const isMaternityBundleProductForQuery =
    raw?.is_gift_box === true && /^maternity-bundle-/i.test(slug || "");
  const maternitySnapshotQuery = useQuery({
    queryKey: ["maternity-bundle-snapshot", raw?.id],
    enabled: isMaternityBundleProductForQuery && !!raw?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("maternity_bundle_snapshots")
        .select("items_snapshot, item_count, sell_price")
        .eq("bundle_id", raw.id)
        .order("snapped_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { items_snapshot?: MaternityBundleSnapshotItem[]; item_count?: number; sell_price?: number } | null;
    },
  });
  const [customiseOpenBundle, setCustomiseOpenBundle] = useState(false);
  const { data: categories = [] } = useProductCategories();

  // ── Variant axis (age_range / size) ─────────────────────────────────
  // Eligible products (baby bouncer ages, bedding-set sizes, etc.) ship
  // multiple brands grouped by an age or size axis. We surface a variant
  // selector ABOVE the brand selector, filter brands to the selected
  // variant, and hide the whole row for products with variant_type = null
  // (i.e. behave exactly as before).
  const hasVariants = product.brands.some(b => !!b.variantType);
  const variantType = product.brands.find(b => !!b.variantType)?.variantType || null;
  const allVariants = (() => {
    if (!hasVariants) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of product.brands) {
      if (!b.variantType || !b.sizeVariant) continue;
      if (seen.has(b.sizeVariant)) continue;
      seen.add(b.sizeVariant);
      out.push(b.sizeVariant);
    }
    return out;
  })();
  const variantLabel = variantType === "age_range" ? "Age Range"
    : variantType === "size" ? "Size"
    : "Variant";

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

  // Seed selectedVariant from the sku-matched brand (if any) or the first
  // axis value, so the variant pill and brand selector land in sync on
  // first render. Products without a variant axis pass through as null.
  const [selectedVariant, setSelectedVariant] = useState<string | null>(() => {
    if (!hasVariants || allVariants.length === 0) return null;
    if (skuParam) {
      const m = product.brands.find(b => b.sku === skuParam);
      if (m?.sizeVariant && m.variantType) return m.sizeVariant;
    }
    // Default to the variant that the initial selected brand belongs to,
    // so we never start with a mismatch between the two selectors.
    const seed = resolveBrand(product.brands, null);
    if (seed?.sizeVariant && seed.variantType) return seed.sizeVariant;
    return allVariants[0];
  });

  // Brands shown to the user, filtered by the active variant axis value.
  // Products without a variant axis are passed through unchanged.
  const filteredBrands = (() => {
    if (!hasVariants || !selectedVariant) return product.brands;
    return product.brands.filter(b => b.sizeVariant === selectedVariant);
  })();

  // ── Colour / gender selector ────────────────────────────────────────
  // Products with gender_relevant=true and a gender_colors map surface a
  // colour pill row. The chosen key is persisted into the cart payload so
  // ops can pack the right tone (boy/girl/neutral).
  const hasGenderOptions = product.genderRelevant === true
    && !!product.genderColors
    && Object.keys(product.genderColors).length > 0;
  const genderOptions = hasGenderOptions
    ? (Object.entries(product.genderColors as Record<string, string>) as [string, string][])
      .filter(([, c]) => !!c)
      .map(([key, color]) => ({
        key,
        label: key === "boy" ? "Boy" : key === "girl" ? "Girl" : "Neutral",
        color,
      }))
    : [];
  const [selectedGender, setSelectedGender] = useState<string | null>(() => {
    if (!hasGenderOptions || genderOptions.length === 0) return null;
    const neutral = genderOptions.find(o => o.key === "neutral");
    return (neutral?.key ?? genderOptions[0].key) || null;
  });

  // ── Age-range badge (read-only, no variant selector) ────────────────
  // For products that DON'T expose a variant selector but DO have a single
  // consistent size_variant across every brand, surface that age range as
  // a subtle informational badge beneath the title. Skip when the age
  // appears verbatim inside the product name (e.g. "Onesies (0-3 months)")
  // so we don't duplicate the same hint twice on the page.
  const ageBadgeText = (() => {
    if (hasVariants) return null;
    const unique = Array.from(new Set(
      product.brands.map(b => (b.sizeVariant || "").trim()).filter(Boolean),
    ));
    if (unique.length !== 1) return null;
    const age = unique[0];
    // Only surface as an age badge when the value actually LOOKS like an
    // age range. Packaging sizes ('500ml', '100g', 'Cot') also live in
    // size_variant — they should not show up as "Suitable for:".
    const looksLikeAge = /(\d+\s*(months?|weeks?|years?|m|w|y)\b)|all ages|newborn|infant|toddler/i.test(age);
    if (!looksLikeAge) return null;
    if (product.name.toLowerCase().includes(age.toLowerCase())) return null;
    return age;
  })();

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
    // If the resolved brand sits on a different variant axis value than
    // what's currently active, pull the variant pill into alignment too.
    if (next?.sizeVariant && next.variantType && next.sizeVariant !== selectedVariant) {
      setSelectedVariant(next.sizeVariant);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.brands, skuParam]);

  // When the user switches variant axis manually, snap the selected brand
  // to the best in-stock option within that axis value. Keeps the brand
  // selector and price/image display in sync without a stale brand carrying
  // over from the previous variant.
  const selectVariant = (variant: string) => {
    setSelectedVariant(variant);
    try {
      const pool = product.brands.filter(b => b.sizeVariant === variant);
      const next = resolveBrand(pool, null);
      if (next) {
        setSelectedBrand(next);
        if (next.sku) {
          const sp = new URLSearchParams(searchParams);
          sp.set("sku", next.sku);
          navigate(`?${sp.toString()}`, { replace: true });
        }
      } else {
        // No brands at all for this variant — leave selectedBrand alone;
        // the JSX below renders an "out of stock" / unavailable panel.
        setSelectedBrand(undefined);
      }
    } catch (e) {
      console.warn("[product] selectVariant failed:", e);
    }
  };

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
  // Sizes are NEVER pre-selected — the customer must explicitly tap a
  // chip before Add to Cart unlocks. is_default rows on product_sizes
  // are intentionally ignored client-side. Empty string == "unselected".
  const [selectedSize, setSelectedSize] = useState<string>("");
  // Reset the size when the route lands on a different product (the
  // route change keeps the component mounted via the same slug param
  // pattern; without this, switching products would carry an irrelevant
  // size selection across).
  useEffect(() => { setSelectedSize(""); }, [product.id]);
  // Catalogue colour (product_colors, e.g. Nylon Bag Black/Red) — separate from
  // the gender selector. Never pre-selected; must be explicitly chosen.
  const [selectedColorName, setSelectedColorName] = useState<string>("");
  useEffect(() => { setSelectedColorName(""); }, [product.id]);
  // Data-driven attribute requirements: require an attribute ONLY when the
  // product actually has rows for it.
  const requiresSizeChoice = !!(product.sizes && product.sizes.length > 0);
  const requiresColorChoice = !!(product.colors && product.colors.length > 0);
  const sizeMissing = requiresSizeChoice && !selectedSize;
  const colorMissing = requiresColorChoice && !selectedColorName;
  const attrMissing = sizeMissing || colorMissing;
  const { cart, addToCart, updateQty } = useCart();
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // Variant-aware: button state must reflect the CURRENTLY SELECTED brand /
  // size / color / variant combo, not "any line item of this product". The
  // key formula mirrors what addToCart() computes — see lib/cart.tsx
  // cartItemKey(). Computed inline so it re-runs every render the selection
  // changes.
  const currentVariantKey = cartItemKey(
    product.id,
    selectedBrand?.id,
    selectedSize || (hasVariants ? selectedVariant : selectedBrand?.sizeVariant) || null,
    selectedColorName || selectedGender || null,
    hasVariants ? selectedVariant : null,
  );
  const cartItem = cart.find(c => c._key === currentVariantKey);
  const isInCart = !!cartItem;
  const deliveryText = settings?.delivery_text || "Delivery: 1–3 business days";

  const isOutOfStock = isProductOOS(product) || !selectedBrand?.inStock;
  const isLowStock = !isOutOfStock && selectedBrand?.stockQuantity != null && selectedBrand.stockQuantity > 0 && selectedBrand.stockQuantity <= 5;
  // Brand-wide promotion (single source of truth). When live, the effective
  // price + strike-through + label + countdown all come from the RPC so the same
  // price shows here, on shop, in search and on /deals.
  const promo = useBrandPromo(selectedBrand?.id);
  const promoLive = !!promo?.promoLabel;
  const effectivePrice = promoLive ? promo!.unitPrice : selectedBrand?.price;
  // DISPLAY promo (get_brand_promo_display) — makes the offer legible BEFORE the
  // decision: the plain-English detail, and for a gift the actual giveaway
  // product. Null when there's no live promo or an out-of-stock gift. The
  // countdown reads its promo_ends_at so a gift (no price change) still counts down.
  const promoDisplay = useBrandPromoDisplay(selectedBrand?.id);
  const promoCountdown = useCountdown(promoDisplay?.promoEndsAt ?? promo?.promoEndsAt);
  const showSalePrice = promoLive
    ? (promo!.compareAt ?? promo!.listPrice) > (promo!.unitPrice ?? 0)
    : selectedBrand?.compareAtPrice && selectedBrand.compareAtPrice > selectedBrand.price;
  const strikePrice = promoLive ? (promo!.compareAt ?? promo!.listPrice) : selectedBrand?.compareAtPrice;
  const savings = showSalePrice ? (strikePrice! - (effectivePrice ?? 0)) : 0;
  const savingsPercent = showSalePrice && strikePrice ? Math.round((savings / strikePrice) * 100) : 0;

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
    // Data-driven: only require attributes the product actually has.
    if (requiresSizeChoice && !selectedSize) {
      toast.error("Please select a size.");
      return;
    }
    if (requiresColorChoice && !selectedColorName) {
      toast.error("Please select a color.");
      return;
    }
    // Persist all three variant axes onto the cart item so the cart UI,
    // checkout, place-order edge function, and admin order detail can
    // surface the customer's exact selection:
    //   - selectedColor → order_items.color  (gender choice: boy/girl/neutral)
    //   - selectedSize  → order_items.size   (age range or size variant)
    // If the product also exposes the legacy product.sizes axis, that value
    // wins for selectedSize (it's the size the engine cares about) and the
    // variant axis is preserved as `selectedVariant` for display only.
    const sizeForCart = selectedSize || (hasVariants ? selectedVariant : selectedBrand.sizeVariant) || null;
    addToCart({
      ...product,
      selectedBrand,
      price: selectedBrand.price,
      name: `${product.name} (${selectedBrand.label})`,
      selectedSize: sizeForCart,
      // Catalogue colour wins over the gender axis (they never co-occur today);
      // both map to order_items.color.
      selectedColor: selectedColorName || selectedGender || null,
      selectedVariant: hasVariants ? selectedVariant : null,
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

  const seoTitle = `${product.name} | BundledMum`.slice(0, 70);
  const seoDescription = (product.description || `Shop ${product.name} on BundledMum — curated maternity and baby essentials delivered across Nigeria.`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 158);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: seoDescription,
    image: (product.brands || [])
      .map(b => b.imageUrl)
      .filter(Boolean) as string[],
    sku: selectedBrand?.sku || product.id,
    brand: { "@type": "Brand", name: selectedBrand?.label || "BundledMum" },
    offers: (product.brands || []).filter(b => b.price > 0).map(b => ({
      "@type": "Offer",
      url: `https://bundledmum.com/products/${product.slug || product.id}${b.sku ? `?sku=${b.sku}` : ""}`,
      priceCurrency: "NGN",
      price: b.price,
      availability: b.inStock === false
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
    })),
  };

  // ───────────────────────────────────────────────────────────────
  // Maternity-bundle product scope gate (premium minimalist design).
  // Fires for /products/maternity-bundle-* slugs only. Postpartum
  // kits and Baby Shower gift boxes (also is_gift_box=true) keep the
  // current generic ProductPage rendering until their copy/images
  // ship.
  // ───────────────────────────────────────────────────────────────
  const isMaternityBundleProduct =
    raw?.is_gift_box === true && /^maternity-bundle-/i.test(slug || "");
  const isPostpartumBundleProduct =
    raw?.is_gift_box === true && /^postpartum-recovery-kit-/i.test(slug || "");
  // Trailing dash is load-bearing: it ensures only the suffixed
  // -basic / -standard / -premium slugs match. The parent
  // "baby-shower-gift-box" slug (is_gift_box=false, 0 items) stays on
  // the legacy generic ProductPage.
  const isBabyShowerBundleProduct =
    raw?.is_gift_box === true && /^baby-shower-gift-box-/i.test(slug || "");
  // Single flag for any bundle that opts into the new minimalist
  // design + inline editor. Hero image and Why-we-built-this copy
  // still vary per category (driven by the specific flags above).
  const isInlineEditableBundle =
    isMaternityBundleProduct || isPostpartumBundleProduct || isBabyShowerBundleProduct;

  // Group-page mode: a multi-brand product opened without a specific brand
  // (?sku). We show the "choose your brand" grid instead of a single-brand
  // detail, so the full PDP body and sticky buy bar are suppressed here and
  // the shopper either adds a brand from the grid or opens its detail page.
  const isGroupView = !isInlineEditableBundle && product.brands.length > 1 && !skuParam;

  // Bundle-edit state — single source of truth for the inline grid AND
  // the customiser-toggle mount below. Called unconditionally per React
  // hook rules; queries inside are gated by productId so non-bundle
  // products incur zero data cost beyond the hook call. React Query
  // dedupes by key with BundleCustomiser's internal call (same product)
  // so a single network fetch backs both.
  const editApi = useBundleItemsEdit(product.id, product.name);

  const prodShopLabel = product.category === "baby" ? "Baby Shop" : product.category === "mum" ? "Mum Shop" : "Shop";
  const prodShopHref = product.category === "baby" ? "/shop/baby" : product.category === "mum" ? "/shop/mum" : "/shop";
  const prodSubcat = categories.find(c => c.slug === product.subcategory);
  const productBreadcrumbs = [
    { label: prodShopLabel, href: prodShopHref },
    ...(prodSubcat ? [{ label: prodSubcat.name, href: `${prodShopHref}/${prodSubcat.slug}` }] : []),
    { label: product.name },
  ];

  return (
    <div className="min-h-screen pb-24 md:pb-8 pt-20 md:pt-24">
      <Seo
        title={seoTitle}
        description={seoDescription}
        type="product"
        image={product.brands?.[0]?.imageUrl || undefined}
        jsonLd={productJsonLd}
      />
      {zoomImage && <ImageZoomModal src={zoomImage} alt={product.name} onClose={() => setZoomImage(null)} />}

      {!isInlineEditableBundle && (
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-2">
          <Breadcrumb items={productBreadcrumbs} />
        </div>
      )}

      {/* PREMIUM MINIMALIST BUNDLE PAGE — fires for maternity-bundle-*
          AND postpartum-recovery-kit-*. Baby-Shower gift boxes fall
          through to the legacy block below until their copy/images
          land. The hero image and Why-we-built-this copy still vary
          per category (specific flags below). */}
      {isInlineEditableBundle && (() => {
        // Hero price + WhatsApp + cart all read from editApi so any
        // inline-card or customiser edit propagates instantly (fixes the
        // 4eefb74 cart-shape bug where color was always null).
        const fallbackHeroPrice = selectedBrand?.price ?? maternitySnapshotQuery.data?.sell_price ?? 0;
        const heroPrice = editApi.currentTotalPrice > 0 ? editApi.currentTotalPrice : fallbackHeroPrice;

        // Unified hero-image source for every bundle category:
        //   1. product_images flagged is_primary (ordered by display_order)
        //   2. first product_images by display_order
        //   3. products.image_url
        //   4. null → type-only hero (the deliberate Postpartum
        //      treatment before product_images existed for these SKUs).
        // raw.product_images is already loaded as part of the existing
        // product query — no new fetch needed.
        const allProductImages: any[] = (raw?.product_images || [])
          .slice()
          .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));
        const primaryImage = allProductImages.find((i) => i.is_primary && i.image_url);
        const firstImage = allProductImages.find((i) => i.image_url);
        const bundleHeroImage: string | null =
          primaryImage?.image_url ?? firstImage?.image_url ?? raw?.image_url ?? null;
        const tierFromSlug = (slug || "").replace(/^maternity-bundle-/i, "").trim();
        const whatsappHref = buildWhatsAppOrderHref({
          title: product.name,
          tier: tierFromSlug,
          currentItems: editApi.includedItems.map((it) => ({
            name: it.product_name,
            brand: it.selected_brand?.brand_name || null,
          })),
          currentTotalPrice: heroPrice,
        });

        // Build the cart row from the live editApi composition. Same
        // shape BundleCustomiser.handleProceedToCheckout produces, so
        // both surfaces yield identical cart rows.
        const handleAddMaternityBundleToCart = () => {
          if (editApi.includedItems.length === 0) {
            toast.error("Bundle items not loaded yet — please try again in a moment.");
            return;
          }
          // Variant-validation gate. Today the only required selection
          // is gender on gender_relevant items; the predicate lives in
          // useBundleItemsEdit so other surfaces (customiser checkout)
          // stay in lockstep without duplicating logic.
          if (editApi.hasUnmetRequirements) {
            const unmet = editApi.unmetRequirementItems;
            const n = unmet.length;
            const anyGender = unmet.some((i) => editApi.itemNeedsGender(i));
            const anySize = unmet.some((i) => editApi.itemNeedsSize(i));
            const anyColor = unmet.some((i) => editApi.itemNeedsColor(i));
            const fieldCopy =
              anySize && anyGender && anyColor ? "options"
              : anySize && anyGender ? "size and gender"
              : anySize && anyColor ? "size and colour"
              : anyGender && anyColor ? "gender and colour"
              : anySize ? "size"
              : anyColor ? "colour"
              : anyGender ? "gender"
              : "options";
            toast.error(
              `Please choose ${fieldCopy} for ${n} item${n === 1 ? "" : "s"} before adding to cart.`
            );
            const firstId = unmet[0]?.product_id;
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
            id: product.id,
            bundleId: product.id,
            bundleName: product.name,
            bundleLabel: raw?.bundle_label || "",
            bundleSku: selectedBrand?.sku || "",
            bundlePrice: editApi.currentTotalPrice,
            price: editApi.currentTotalPrice,
            name: product.name,
            bundleItems: editApi.includedItems.map((i) => ({
              productId: i.product_id,
              productName: i.product_name,
              brandId: i.selected_brand.id,
              brandName: i.selected_brand.brand_name,
              sku: i.selected_brand.sku ?? null,
              price: i.selected_brand.price,
              quantity: i.quantity,
              lineTotal: i.selected_brand.price * i.quantity,
              isDefault: i.is_default,
              // Cart row carries explicit selections from the new
              // product_sizes / product_colors pickers first; falls
              // back to the legacy axes (selected_gender / brand
              // size_variant) so older cart rows still parse.
              color: i.selected_color_name ?? i.selected_gender ?? null,
              size: i.selected_size_label ?? i.selected_brand.size_variant ?? null,
            })),
            removedDefaultCount: editApi.removedDefaultCount,
          } as any);
          toast.success(`✓ ${product.name} added to cart!`, {
            action: { label: "View Cart →", onClick: () => navigate("/cart") },
          });
        };

        const revealCustomiser = () => {
          setCustomiseOpenBundle(true);
          requestAnimationFrame(() => {
            document.getElementById("customise-bundle")?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        };

        return (
          <>
            {/* Quiet utility row */}
            <div className="px-6 md:px-12 lg:px-16 pt-8 md:pt-10">
              <div className="max-w-[1120px] mx-auto flex items-center justify-between">
                <Link
                  to="/bundles"
                  className="text-text-med text-xs uppercase tracking-[0.18em] hover:text-foreground transition-colors inline-flex items-center gap-1.5"
                >
                  <ChevronLeft className="h-3 w-3" /> All bundles
                </Link>
                <button
                  onClick={handleShare}
                  className="text-text-med hover:text-foreground transition-colors p-2 -m-2"
                  aria-label="Share bundle"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* HERO — two-column with carton on the right for Maternity
                bundles; type-only single-column for Postpartum (image_url
                is intentionally NULL for that category). Extra top/bottom
                padding when type-only so the absence of the image reads
                as deliberate rather than a missing asset. */}
            <section
              className={
                bundleHeroImage
                  ? "px-6 md:px-12 lg:px-16 pt-10 md:pt-16 pb-10 md:pb-16"
                  : "px-6 md:px-12 lg:px-16 pt-12 md:pt-24 pb-12 md:pb-24"
              }
            >
              <div
                className={
                  bundleHeroImage
                    ? "max-w-[1120px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14 lg:gap-16 items-center"
                    : "max-w-[720px] mx-auto"
                }
              >
                <div>
                  <h1 className="pf text-[40px] md:text-6xl lg:text-7xl font-light leading-[1.05] text-foreground tracking-tight mb-6">
                    {product.name}
                  </h1>
                  {product.description && (
                    <p className="text-text-med text-base md:text-lg leading-relaxed mb-8 max-w-[42ch]">
                      {product.description}
                    </p>
                  )}
                  <p className="text-foreground text-base mb-8">
                    <span className="font-medium">{fmt(heroPrice)}</span>
                  </p>
                  <button
                    onClick={handleAddMaternityBundleToCart}
                    className="bg-coral text-primary-foreground px-8 py-4 text-sm font-medium hover:bg-coral-dark transition-colors"
                  >
                    Add bundle to cart
                  </button>
                  <div className="mt-5 flex flex-col gap-2.5 items-start">
                    <button
                      onClick={revealCustomiser}
                      className="text-text-med text-sm hover:text-foreground underline underline-offset-4 decoration-text-light/60"
                    >
                      Or customise this bundle →
                    </button>
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-med text-sm hover:text-foreground underline underline-offset-4 decoration-text-light/60 inline-flex items-center gap-1.5"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Order Via WhatsApp
                    </a>
                  </div>
                </div>

                {/* Hero image — driven by the unified bundleHeroImage
                    resolver above. Maternity hits products.image_url,
                    Postpartum + Baby Shower hit product_images. If
                    nothing resolves we drop the image block entirely
                    (the parent grid collapses to single column) so the
                    layout still reads deliberate. */}
                {bundleHeroImage && (
                <div className="aspect-[4/5] md:aspect-square overflow-hidden bg-warm-cream order-first md:order-last">
                  <img
                    src={bundleHeroImage}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                )}
              </div>
            </section>

            {/* Inline editable items grid — shares editApi state with
                the customiser-toggle mount below. */}
            <section className="px-6 md:px-12 lg:px-16 py-10 md:py-16 border-t border-border/40">
              <div className="max-w-[1120px] mx-auto">
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-med mb-8 md:mb-10">
                  What&rsquo;s inside — tap to customise
                </p>
                <MaternityBundleItemsEditor editApi={editApi} />
              </div>
            </section>

            {/* CTA REPEAT */}
            <section className="px-6 py-10 md:py-16 text-center">
              <p className="pf text-2xl md:text-3xl font-light text-foreground mb-8">
                Ready when you are.
              </p>
              <button
                onClick={handleAddMaternityBundleToCart}
                className="bg-coral text-primary-foreground px-8 py-4 text-sm font-medium hover:bg-coral-dark transition-colors"
              >
                Add bundle to cart
              </button>
              <div className="mt-5 flex flex-col gap-2.5 items-center">
                <button
                  onClick={revealCustomiser}
                  className="text-text-med text-sm hover:text-foreground underline underline-offset-4 decoration-text-light/60"
                >
                  Or customise this bundle →
                </button>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-med text-sm hover:text-foreground underline underline-offset-4 decoration-text-light/60 inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Order Via WhatsApp
                </a>
              </div>
            </section>

            {/* WHY WE BUILT THIS — locked editorial copy (sentence case) */}
            <section className="px-6 pt-10 md:pt-16 pb-16 md:pb-24">
              <div className="max-w-[640px] mx-auto text-center">
                <div className="h-px w-12 bg-border mx-auto mb-8" />
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-med mb-8">
                  Why we built this
                </p>
                {(isMaternityBundleProduct
                  ? [
                      "The Maternity + Baby Items Bundle covers every item a Nigerian mum actually uses in her first six weeks. Curated by mums. Quality-checked. Delivered before you go into labour.",
                      "We started BundledMum after watching too many friends spend their last trimester googling whether “maternity pad” and “sanitary pad” are the same thing (they’re not). They shouldn’t have to. You shouldn’t have to.",
                      "Pick the price that fits your budget. The bundle scales — more items, better brands, every comfort — but the philosophy stays the same. Considered. Quality-checked. Nothing for show.",
                    ]
                  : isPostpartumBundleProduct
                    ? [
                        "The first six weeks after a baby is born aren’t on Instagram. They’re at home, on a couch, with a bag of frozen peas and a list of things you wish someone had told you to buy.",
                        "We built the Postpartum Recovery Kit for that period. Sitz bath, belly band, the right pads, the cream that actually helps. Everything in one box, delivered when you need it most.",
                        "You don’t have to figure this out alone.",
                      ]
                    : isBabyShowerBundleProduct
                      ? [
                          "Every mum has the same list of items she wished someone had bought her instead of another stuffed animal. We built the Baby Shower Gift Box from that list.",
                          "Inside: the things she'll actually reach for. Diapers, wipes, soft onesies, a receiving blanket. Curated by mums, picked carefully, wrapped well.",
                          "The gift that says you paid attention.",
                        ]
                      : []
                ).map((para, i, arr) => (
                  <p
                    key={i}
                    className={`text-text-med text-base leading-[1.7]${i < arr.length - 1 ? " mb-6" : ""}`}
                  >
                    {para}
                  </p>
                ))}
              </div>
            </section>

            {/* Customise — hidden by default; toggled by the customise
                links. Reuses BundleCustomiser unchanged. */}
            {customiseOpenBundle && (
              <section
                id="customise-bundle"
                className="px-6 md:px-12 lg:px-16 py-10 md:py-16 border-t border-border bg-warm-cream/30 animate-in fade-in duration-500"
              >
                <div className="max-w-[1120px] mx-auto">
                  <div className="flex items-center justify-between mb-6 md:mb-8">
                    <h2 className="pf text-2xl md:text-3xl font-light">Customise your bundle</h2>
                    <button
                      onClick={() => setCustomiseOpenBundle(false)}
                      className="text-text-med text-sm hover:text-foreground underline underline-offset-4"
                    >
                      Done
                    </button>
                  </div>
                  <BundleCustomiser
                    productId={product.id}
                    productName={product.name}
                    bundleLabel={raw?.bundle_label || null}
                    bundleSku={selectedBrand?.sku || null}
                    editApi={editApi}
                  />
                </div>
              </section>
            )}

            {/* Mobile sticky CTA — bundle-specific, since the page-level
                sticky CTA is gated to non-bundles. */}
            <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-0 inset-x-0 z-40 md:hidden bg-background border-t border-border px-4 py-3">
              <button
                onClick={handleAddMaternityBundleToCart}
                className="w-full bg-coral text-primary-foreground py-3 text-sm font-medium hover:bg-coral-dark transition-colors"
              >
                Add bundle — {fmt(heroPrice)}
              </button>
            </div>
          </>
        );
      })()}

      {/* Product group view: shown for multi-brand products when no specific
          brand is pre-selected via ?sku=. Users can add to cart directly or
          click View Details to reach the full per-brand detail below. */}
      {isGroupView && (
        <div className="max-w-6xl mx-auto px-4 pb-10">
          <div className="mb-5">
            <h1 className="pf text-[26px] md:text-[34px] font-bold leading-[1.1] mb-2">{product.name}</h1>
            {product.description && (
              <p className="text-muted-foreground text-sm md:text-[15px] max-w-[640px] mb-4">
                {product.description}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-forest-light text-forest text-xs font-semibold px-3 py-1.5">
                {product.brands.length} brands to choose from
              </span>
              <span className="text-muted-foreground text-xs">Tap a brand to add it, or open its full details.</span>
            </div>
          </div>
          <h2 className="pf text-lg md:text-xl font-bold mb-3">Choose your brand</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {product.brands.map(brand => {
              const img = brand.imageUrl || product.imageUrl || null;
              const isOos = brand.inStock === false || (brand.stockQuantity !== null && brand.stockQuantity <= 0);
              const onSale = brand.compareAtPrice != null && brand.compareAtPrice > brand.price;
              // Match the key addToCart() computes for this brand so the card
              // can flip to a quantity stepper once it is in the cart.
              const cartKey = cartItemKey(product.id, brand.id, brand.sizeVariant || null, null, brand.sizeVariant || null);
              const cartRow = cart.find(i => i._key === cartKey);
              return (
                <div key={brand.id} className="flex flex-col rounded-[14px] border border-border bg-card overflow-hidden">
                  <Link to={`/products/${slug}?sku=${brand.sku}`} className="relative block aspect-square bg-warm-cream overflow-hidden group">
                    <ProductImage
                      imageUrl={img}
                      emoji={brand.img || product.baseImg}
                      alt={`${product.name} ${brand.label}`}
                      className="w-full h-full"
                      emojiClassName="text-5xl"
                    />
                    {isOos ? (
                      <span className="absolute top-2 left-2 rounded-pill bg-midnight/80 text-primary-foreground text-[10px] font-bold px-2 py-0.5">Sold out</span>
                    ) : onSale ? (
                      <span className="absolute top-2 left-2 rounded-pill bg-coral text-primary-foreground text-[10px] font-bold px-2 py-0.5">Sale</span>
                    ) : null}
                  </Link>
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">{brandOptionName(brand, product.brands)}</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono-price text-forest font-bold text-[15px]">{fmt(brand.price)}</span>
                      {onSale && (
                        <span className="font-mono-price text-muted-foreground text-[10px] line-through">{fmt(brand.compareAtPrice!)}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 mt-auto pt-1">
                      {cartRow ? (
                        <div className="w-full flex justify-center py-0.5">
                          <QtyControl
                            qty={cartRow.qty}
                            onUpdate={(n) => updateQty(cartKey, n)}
                            size="sm"
                            accentColor="coral"
                            maxQty={brand.stockQuantity ?? undefined}
                          />
                        </div>
                      ) : (
                        <button
                          disabled={isOos}
                          onClick={() => {
                            if (isOos) return;
                            addToCart({
                              ...product,
                              selectedBrand: brand,
                              price: brand.price,
                              name: `${product.name} (${brand.label})`,
                              selectedSize: brand.sizeVariant || null,
                              selectedColor: null,
                              selectedVariant: brand.sizeVariant || null,
                            });
                            toast.success(`${brand.label} added to cart`, {
                              action: { label: "View Cart", onClick: () => window.location.href = "/cart" },
                            });
                          }}
                          className="w-full rounded-pill bg-coral text-primary-foreground text-[12px] font-bold py-2 min-h-[38px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-coral-dark transition-colors"
                        >
                          {isOos ? "Sold out" : "Add to cart"}
                        </button>
                      )}
                      <Link
                        to={`/products/${slug}?sku=${brand.sku}`}
                        className="w-full rounded-pill border border-border text-[12px] font-semibold text-muted-foreground py-2 min-h-[38px] flex items-center justify-center hover:border-forest hover:text-forest transition-colors"
                      >
                        Full details
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isInlineEditableBundle && !isGroupView && (
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12">
          {/* LEFT: Image Gallery */}
          <div className="md:sticky md:top-[80px] md:self-start">
            {/* Main Image */}
            <div
              className="relative aspect-square rounded-2xl overflow-hidden cursor-zoom-in group bg-[#f5f5f5]"
              onClick={() => displayImage && setZoomImage(displayImage)}
            >
              {isProductOOS(product) ? (
                <span className="absolute top-3 left-3 bg-[#E53935] text-white text-[10px] font-bold px-2.5 py-1 rounded-pill uppercase z-10">Out of Stock</span>
              ) : product.badge ? (
                <span className="absolute top-3 left-3 bg-coral text-white text-[10px] font-bold px-2.5 py-1 rounded-pill uppercase z-10">{product.badge}</span>
              ) : null}
              {showSalePrice && !isProductOOS(product) && (
                <span className="absolute top-3 right-3 bg-destructive text-white text-[10px] font-bold px-2 py-1 rounded-pill z-10">
                  -{savingsPercent}%
                </span>
              )}
              <ProductImage imageUrl={displayImage} emoji={selectedBrand.img || product.baseImg} alt={product.name} className="w-full h-full object-contain p-6" emojiClassName="text-8xl" />
              {/^Maternity( \+ Baby Items)? Bundle/i.test(product.name) && (selectedBrand?.price ?? 0) > 0 && (
                <span
                  className="absolute bottom-3 left-3 z-10"
                  style={{
                    background: "#F4845F",
                    color: "#FFFFFF",
                    fontFamily: "Nunito, sans-serif",
                    fontWeight: 900,
                    fontSize: 18,
                    padding: "6px 16px",
                    borderRadius: 100,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    letterSpacing: "0.3px",
                  }}
                >
                  ₦{Math.round(selectedBrand.price / 1000)}k
                </span>
              )}
              {displayImage && (
                <div className="absolute bottom-3 right-3 bg-white/80 rounded-full p-2 opacity-60 group-hover:opacity-100 transition-opacity pointer-events-none shadow-sm">
                  <ZoomIn className="h-4 w-4 text-foreground" />
                </div>
              )}
            </div>

            {/* Thumbnail Gallery */}
            {brandImages.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {brandImages.map((img, i) => (
                  <button key={i} onClick={() => {
                    setActiveImageIdx(i);
                    if (img.brandId) {
                      const brand = product.brands.find(b => b.id === img.brandId);
                      if (brand) selectBrand(brand);
                    }
                  }}
                    className={`w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all ${activeImageIdx === i ? "border-forest shadow-sm" : "border-transparent hover:border-border"}`}>
                    <img src={img.url} alt={img.alt} className="w-full h-full object-contain bg-muted/30 p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Product Info */}
          <div className="flex flex-col">
            {/* Category breadcrumb pill */}
            {prodSubcat && (
              <Link to={`${prodShopHref}?category=${prodSubcat.slug}`}
                className="inline-flex items-center gap-1 mb-3 self-start rounded-pill border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:border-forest hover:text-forest transition-colors">
                {prodSubcat.icon && <span>{prodSubcat.icon}</span>}
                {prodSubcat.name}
              </Link>
            )}

            <h1 className="pf text-[22px] md:text-[28px] font-bold leading-tight mb-2">{product.name}</h1>

            {ageBadgeText && (
              <span className="inline-flex items-center gap-1 mb-3 self-start rounded-pill bg-forest-light text-forest text-[11px] font-semibold px-2.5 py-1">
                Suitable for: {ageBadgeText}
              </span>
            )}

            {/* Rating */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`h-4 w-4 ${s <= Math.round(product.rating) ? "text-coral fill-coral" : "text-border"}`} />
                ))}
              </div>
              <span className="text-sm font-semibold">{product.rating}</span>
              <span className="text-muted-foreground text-xs">({product.reviews} reviews)</span>
            </div>

            {/* Price block */}
            <div className="mb-1 pb-4 border-b border-border">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-mono-price text-[28px] md:text-[34px] font-bold text-forest leading-none">{fmt(effectivePrice ?? selectedBrand.price)}</span>
                {showSalePrice && (
                  <span className="font-mono-price text-muted-foreground text-lg line-through">{fmt(strikePrice!)}</span>
                )}
                {showSalePrice && (
                  <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-0.5 rounded-pill">-{savingsPercent}%</span>
                )}
              </div>
              {promoDisplay && (
                <div className="mt-2.5 rounded-xl border border-coral/40 bg-coral/5 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-pill bg-coral text-white text-[11px] font-bold px-2 py-0.5">{promoDisplay.headline}</span>
                    {promoCountdown && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-coral">
                        <span className="font-mono-price">Ends in {promoCountdown.d > 0 ? `${promoCountdown.d}d ` : ""}{promoCountdown.h}h {promoCountdown.m}m {promoCountdown.s}s</span>
                      </span>
                    )}
                  </div>
                  {/* Plain-English explanation. For a BOGO this is the explicit
                      "Add N to your cart and one is free" instruction. */}
                  <p className="text-[13px] text-foreground/80 mt-1.5 leading-snug">{promoDisplay.detail}</p>

                  {/* BOGO — make the required action unmissable using bogo_add_qty. */}
                  {promoDisplay.promoType === "bogo" && promoDisplay.bogoAddQty != null && (
                    <p className="text-[12px] font-bold text-coral mt-1.5">
                      👉 Add {promoDisplay.bogoAddQty} to your cart to unlock this offer.
                    </p>
                  )}

                  {/* GIFT — SHOW the giveaway itself so the customer sees what
                      they get: image, name and its strike-through list price. */}
                  {promoDisplay.promoType === "gift" && (
                    <div className="mt-2.5 flex items-center gap-3 rounded-lg bg-card border border-border p-2">
                      <div className="w-14 h-14 rounded-md overflow-hidden border border-border bg-warm-cream flex-shrink-0">
                        <img
                          src={promoDisplay.giftImageUrl || "/placeholder.svg"}
                          alt={promoDisplay.giftProductName || "Gift"}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold text-coral uppercase tracking-wide">
                          {promoDisplay.giftPromoPrice === 0 ? "Free gift" : "Gift"}
                        </div>
                        <div className="text-[13px] font-semibold leading-tight truncate">
                          {promoDisplay.giftProductName}{promoDisplay.giftBrandName ? ` (${promoDisplay.giftBrandName})` : ""}
                        </div>
                        <div className="flex items-baseline gap-1.5 mt-0.5">
                          <span className="font-mono-price text-coral font-bold text-sm">
                            {promoDisplay.giftPromoPrice === 0 ? "FREE" : fmt(promoDisplay.giftPromoPrice ?? 0)}
                          </span>
                          {promoDisplay.giftListPrice != null && promoDisplay.giftListPrice > (promoDisplay.giftPromoPrice ?? 0) && (
                            <span className="font-mono-price text-muted-foreground text-[11px] line-through">
                              was {fmt(promoDisplay.giftListPrice)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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

            {/* Colour / Gender selector — pill row with a colour dot per
                option. Only shown for products that admins have flagged
                as gender-relevant AND that ship a gender_colors mapping. */}
            {hasGenderOptions && genderOptions.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Colour
                </p>
                <div className="flex flex-wrap gap-2">
                  {genderOptions.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setSelectedGender(opt.key)}
                      className={`min-h-[44px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] transition-all font-body inline-flex items-center gap-1.5 ${selectedGender === opt.key ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}
                    >
                      <span
                        className="inline-block rounded-full border border-border"
                        style={{ width: 12, height: 12, backgroundColor: opt.color }}
                      />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Variant Selector — age range / size pills.
                Only shown for products whose brands carry variant_type. */}
            {hasVariants && allVariants.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {variantLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {allVariants.map(v => (
                    <button
                      key={v}
                      onClick={() => { selectVariant(v); setActiveImageIdx(0); }}
                      className={`min-h-[44px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] transition-all font-body ${selectedVariant === v ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Brand Selector — dropdown (scales to many brands). Wires onSelect
                to the SAME selectBrand state the pills used. */}
            <BrandSelect
              brands={filteredBrands}
              value={selectedBrand?.id}
              productOos={product.isOutOfStock}
              label={hasVariants ? "Brand" : "Choose Brand"}
              onSelect={(b) => { selectBrand(b as Brand); setActiveImageIdx(0); }}
            />

            {/* Brand Details — the selected brand's own description (brands.description).
                Updates with brand selection; hidden when the brand has none. */}
            {selectedBrand?.description && selectedBrand.description.trim() && (
              <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Brand Details</p>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{selectedBrand.description}</p>
              </div>
            )}

            {/* Size Selector — no auto-pick; customer must tap a chip. */}
            {requiresSizeChoice && (
              <div className="mb-4">
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

            {/* Colour Selector (product_colors) — no auto-pick. */}
            {requiresColorChoice && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Select Color {colorMissing && <span className="text-coral normal-case tracking-normal">— required</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.colors!.map(c => (
                    <button key={c.name} onClick={() => setSelectedColorName(c.name)}
                      className={`min-h-[44px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] transition-all font-body inline-flex items-center gap-1.5 ${selectedColorName === c.name ? "border-forest bg-forest text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-forest/40"}`}>
                      {c.hex && <span className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: c.hex }} />}
                      {c.name}
                    </button>
                  ))}
                </div>
                {colorMissing && (
                  <p className="text-[11px] text-muted-foreground mt-2">Select a color to continue.</p>
                )}
              </div>
            )}

            {isLowStock && (
              <p className="text-[#E65100] text-xs font-semibold mb-3">🔥 Only {selectedBrand.stockQuantity} left!</p>
            )}

            {/* Add to Cart — hidden for bundle products since
                BundleCustomiser owns its own customise + add-to-cart CTA */}
            {!raw?.is_gift_box && (
            <div className="mb-6 space-y-3">
              {isOutOfStock ? (
                <button className="w-full rounded-pill bg-muted text-muted-foreground text-sm font-semibold py-4 min-h-[52px] cursor-not-allowed">
                  Out of Stock
                </button>
              ) : isInCart && cartItem ? (
                <div className="flex items-center gap-4">
                  <QtyControl qty={cartItem.qty} onUpdate={(newQty) => updateQty(cartItem._key, newQty)} size="md" maxQty={selectedBrand.stockQuantity ?? undefined} />
                  <Link to="/cart" className="text-forest text-sm font-semibold hover:underline font-body">View Cart →</Link>
                  <button onClick={handleShare} className="ml-auto rounded-full border border-border p-2.5 hover:bg-muted transition-colors" aria-label="Share">
                    <Share2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              ) : attrMissing ? (
                <button
                  disabled
                  className="w-full rounded-pill bg-muted text-muted-foreground text-sm font-semibold py-4 min-h-[52px] cursor-not-allowed"
                >
                  {sizeMissing && colorMissing ? "Select Size & Color" : sizeMissing ? "Select a Size" : "Select a Color"}
                </button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={handleAdd} className="flex-1 rounded-pill text-sm font-semibold text-white font-body flex items-center gap-2 min-h-[52px] justify-center transition-colors hover:opacity-90" style={{ backgroundColor: "#F4845F" }}>
                    <ShoppingBag className="h-5 w-5" /> Add to Cart
                  </button>
                  <button onClick={handleShare} className="rounded-full border border-border p-3 hover:bg-muted transition-colors flex-shrink-0" aria-label="Share">
                    <Share2 className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>
            )}

            {/* Order via WhatsApp — MOBILE ONLY secondary option below Add to
                Cart. Outlined WhatsApp-green; Add to Cart stays the dominant
                coral CTA. Does not touch cart/variant logic. */}
            {!raw?.is_gift_box && selectedBrand && (
              <a
                href={buildProductOrderWhatsAppHref({
                  name: product.name,
                  priceLabel: fmt(selectedBrand.price),
                  url: `https://bundledmum.com/products/${product.slug || product.id}`,
                  variant: [selectedBrand.label, selectedSize, selectedColorName].filter(Boolean).join(", "),
                  whatsappNumber: settings?.whatsapp_number,
                })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { try { trackEvent("product_whatsapp_order", { product_id: product.id, source: "pdp" }); } catch { /* fire-and-forget */ } }}
                className="md:hidden -mt-3 mb-6 w-full flex items-center justify-center gap-2 rounded-pill border h-[42px] text-sm font-semibold"
                style={{ borderColor: "#25D366", color: "#0F6E56" }}
              >
                <img src={whatsappLogo} alt="" className="h-5 w-5" /> Order via WhatsApp
              </a>
            )}

            {/* Klump "pay later" info banner — directly under the WhatsApp CTA.
                Passive (not a payment button); self-hides when Klump is off, the
                key is missing, or price is 0. Reads the same site_settings source
                as checkout (klump_public_key / payment_method_klump_enabled). */}
            {selectedBrand && (
              <KlumpAdBanner
                price={Math.round(Number(selectedBrand.price) || 0)}
                publicKey={typeof settings?.klump_public_key === "string" ? settings.klump_public_key : ""}
                enabled={settings?.payment_method_klump_enabled === true || settings?.payment_method_klump_enabled === "true" || settings?.payment_method_klump_enabled === "1"}
              />
            )}

            <SubscribeInline
              productName={product.name}
              isSubscribable={raw?.is_subscribable === true}
              selectedBrand={selectedBrand}
              quantity={cartItem?.qty ?? 1}
            />

            {/* Trust badges */}
            <div className="flex gap-3 mb-6 py-3 border-y border-border">
              <div className="flex-1 flex items-center gap-2">
                <Truck className="h-4 w-4 text-forest flex-shrink-0" />
                <span className="text-[11px] text-muted-foreground font-medium">Fast Delivery</span>
              </div>
              <div className="flex-1 flex items-center gap-2">
                <Shield className="h-4 w-4 text-forest flex-shrink-0" />
                <span className="text-[11px] text-muted-foreground font-medium">Quality Assured</span>
              </div>
              <div className="flex-1 flex items-center gap-2">
                <Package className="h-4 w-4 text-forest flex-shrink-0" />
                <span className="text-[11px] text-muted-foreground font-medium">Secure Packing</span>
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
        <div className="mt-12 space-y-10 max-w-4xl mx-auto">
          {/* Product Details */}
          <section>
            <h2 className="pf text-xl font-bold mb-4 pb-3 border-b border-border">Product Details</h2>
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

          {/* Bundle customisation — replaces the static What's Inside
              panel for is_gift_box products. Customer can include/exclude
              items, swap brands, add catalogue products, reset to default,
              and add the customised bundle to cart from inside this
              component. The stock Add-to-Cart button above is hidden for
              bundles so there's a single source-of-truth control. */}
          {/* Legacy mount: ONLY for gift boxes that are NOT on the new
              minimalist design (currently Baby-Shower only). Bundles on
              the new design own their own customiser mount above with
              editApi; gating here prevents a double-mount that would
              break state sharing. */}
          {raw?.is_gift_box && !isInlineEditableBundle && (
            <BundleCustomiser
              productId={product.id}
              productName={product.name}
              bundleLabel={raw?.bundle_label || null}
              bundleSku={selectedBrand?.sku || null}
            />
          )}

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
      )}

      {/* Other subscribable products — only on subscribable product pages */}
      {raw?.is_subscribable === true && (
        <OtherSubscribableProducts currentId={product.id} category={product.category ?? null} subcategory={product.subcategory ?? null} />
      )}

      {/* Sticky mobile CTA — hidden for bundles (BundleCustomiser owns its own)
          and on the group page (each brand card has its own add button). */}
      {!raw?.is_gift_box && !isGroupView && (
      <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 bg-card border-t border-border p-3 flex items-center justify-between gap-4 z-40 md:hidden">
        <div>
          <p className="font-mono-price text-lg font-bold text-forest">{fmt(selectedBrand.price)}</p>
          {showSalePrice && <p className="font-mono-price text-muted-foreground text-[10px] line-through">{fmt(selectedBrand.compareAtPrice!)}</p>}
        </div>
        {isOutOfStock ? (
          <span className="text-sm text-muted-foreground font-semibold">Out of Stock</span>
        ) : isInCart && cartItem ? (
          <div className="flex items-center gap-3">
            <QtyControl qty={cartItem.qty} onUpdate={(newQty) => updateQty(cartItem._key, newQty)} size="md" maxQty={selectedBrand.stockQuantity ?? undefined} />
            <Link to="/cart" className="text-forest text-sm font-semibold">Cart →</Link>
          </div>
        ) : sizeMissing ? (
          <button
            disabled
            className="rounded-pill bg-border px-6 py-3 text-sm font-semibold text-muted-foreground cursor-not-allowed min-h-[44px]"
          >
            Select a Size
          </button>
        ) : (
          <button onClick={handleAdd} className="rounded-pill px-6 py-3 text-sm font-semibold text-primary-foreground font-body flex items-center gap-2 min-h-[44px]" style={{ backgroundColor: "#F4845F" }}>
            <ShoppingBag className="h-4 w-4" /> Add to Cart
          </button>
        )}
      </div>
      )}
    </div>
  );
}

function ProductPageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 pt-8">
      <Skeleton className="h-4 w-48 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
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
// Inline subscription panel — shown on subscribable products when the feature
// is enabled. Configures frequency + delivery day using the page's already-
// selected brand + quantity, then writes a one-item SubscriptionDraft and
// proceeds straight to /subscriptions/checkout (SubscriptionCheckout reads the
// draft). Subscriptions are a separate flow from the cart.
// ---------------------------------------------------------------------------
// Product-page entry into the monthly-BOX subscription. A single product can no
// longer BE a subscription (a subscription is 2+ boxes of ₦50,000 each), so this
// no longer builds a per-product recurring draft. It states the real terms up
// front and funnels the shopper into the box builder with this brand pre-loaded
// into Box 1 (/subscriptions?brand_id=<uuid>).
function SubscribeInline({ productName, isSubscribable, selectedBrand, quantity }: {
  productName: string;
  isSubscribable: boolean;
  selectedBrand: Brand | undefined;
  quantity: number;
}) {
  const { data: settings } = useSubscriptionSettings();
  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  // Default-hidden until the programme is confirmed on.
  if (!isSubscribable || settings?.subscription_enabled !== true) return null;

  const qty = Math.max(1, quantity || 1);

  // For a signed-in shopper we create the 2-month draft with this item already
  // in Box 1 via subscribe_to_product, then land her in the builder at STEP 2
  // (?sid=). Logged-out shoppers pass the intent through (?brand_id=&qty=) and
  // the builder collects an email at STEP 1 before calling subscribe_to_product.
  const goToBuilder = async () => {
    if (!selectedBrand || starting) return;
    const email = user?.email;
    if (!email) {
      navigate(`/subscriptions?brand_id=${encodeURIComponent(selectedBrand.id)}&qty=${qty}`);
      return;
    }
    setStarting(true);
    try {
      const { data, error } = await (supabase as any).rpc("subscribe_to_product", {
        p_customer_email: email, p_brand_id: selectedBrand.id, p_quantity: qty,
      });
      if (error || !data?.success || !data?.subscription_id) {
        toast.error(error?.message || data?.error || "Couldn't start your subscription. Please try again.");
        return;
      }
      navigate(`/subscriptions?sid=${encodeURIComponent(data.subscription_id)}`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't start your subscription. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="bg-forest/5 border border-forest/20 rounded-card p-4 mb-6 space-y-3">
      <div className="flex items-center gap-2">
        <Repeat className="w-5 h-5 text-forest flex-shrink-0" />
        <h3 className="font-bold text-sm">Get this every month</h3>
      </div>

      {/* The REAL terms, stated BEFORE she clicks — no surprise on the next page. */}
      <p className="text-[13px] text-text-med">
        Build a monthly box from <span className="font-semibold text-foreground">₦50,000</span>. {settings.discount_pct}% off, free delivery, and today's prices locked in. Minimum 2 months.
      </p>
      <div className="flex items-start gap-1.5 text-[12px] text-forest bg-forest/10 rounded-lg px-2.5 py-2">
        <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>The prices you see today are locked in for every box, even if prices rise later.</span>
      </div>

      <button
        type="button"
        onClick={goToBuilder}
        disabled={!selectedBrand || starting}
        className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 text-sm font-bold min-h-[48px] hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {starting ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</> : <><Repeat className="w-4 h-4" /> Add {productName} to a monthly box</>}
      </button>
      {!selectedBrand && (
        <p className="text-[11px] text-text-light text-center">Pick a brand above to continue</p>
      )}
    </div>
  );
}


// "Other products you can subscribe to" — compact horizontal scroll row at the
// bottom of a subscribable product page. Compact cards use the cheapest in-stock
// brand (no brand picker). If a draft exists, tapping Subscribe appends at the
// session's cadence; if not, a small sheet collects frequency + day, creates the
// draft, and goes to checkout.
function OtherSubscribableProducts({ currentId, category, subcategory }: { currentId: string; category: string | null; subcategory: string | null }) {
  const { data: settings } = useSubscriptionSettings();
  const navigate = useNavigate();

  // Related products: prefer the same subcategory; backfill from the same
  // category up to 8. `related` is true when at least one same-subcategory
  // match exists (drives the heading copy).
  const SELECT = "id, slug, name, reorder_days, reorder_label, brands:brands_public!brands_product_id_fkey(id, brand_name, price, in_stock, image_url, stored_image_url, images)";
  const { data: result } = useQuery({
    queryKey: ["other-subscribable", currentId, category, subcategory],
    enabled: settings?.subscription_enabled === true && !!currentId,
    queryFn: async () => {
      let items: any[] = [];
      if (subcategory) {
        const { data, error } = await supabase
          .from("products").select(SELECT)
          .eq("is_subscribable", true).eq("is_active", true)
          .eq("subcategory", subcategory).neq("id", currentId)
          .order("display_order", { ascending: true }).limit(8);
        if (error) throw error;
        items = data || [];
      }
      const related = items.length > 0;
      if (items.length < 4 && category) {
        const seen = items.map((p) => p.id);
        let q = supabase
          .from("products").select(SELECT)
          .eq("is_subscribable", true).eq("is_active", true)
          .eq("category", category).neq("id", currentId);
        if (seen.length) q = q.not("id", "in", `(${seen.join(",")})`);
        const { data, error } = await q.order("display_order", { ascending: true }).limit(8 - items.length);
        if (error) throw error;
        items = [...items, ...((data || []) as any[])];
      }
      return { items, related };
    },
    staleTime: 60_000,
  });

  const products = result?.items ?? [];
  if (settings?.subscription_enabled !== true || products.length === 0) return null;

  const cheapest = (p: any) => {
    const inStock = (p.brands || []).filter((b: any) => b.in_stock !== false);
    const list = inStock.length ? inStock : (p.brands || []);
    return [...list].sort((a: any, b: any) => (a.price || 0) - (b.price || 0))[0] || null;
  };

  // Funnel the shopper into the box builder with this product's cheapest brand
  // pre-loaded into Box 1 — a single product is no longer a subscription on its
  // own, so we never build a per-product draft here.
  const addToBox = (p: any) => {
    const b = cheapest(p);
    if (!b) return;
    navigate(`/subscriptions?brand_id=${encodeURIComponent(b.id)}`);
  };

  return (
    <section className="max-w-[1200px] mx-auto px-4 md:px-10 py-8">
      <h2 className="pf text-xl font-bold mb-1">{result?.related ? "Related products for a monthly box" : "More products for a monthly box"}</h2>
      <p className="text-[12px] text-text-med mb-4">Add any of these to a box. Each box is filled your way and clears ₦50,000 on its own.</p>
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
        {products.map((p: any) => {
          const b = cheapest(p);
          const img = b ? (getBrandImage(b) || b.images?.[0] || null) : null;
          const cadence = p.reorder_label || (p.reorder_days ? `Every ${p.reorder_days} days` : null);
          return (
            <div key={p.id} className="snap-start flex-shrink-0 w-[180px] bg-card border border-border rounded-card p-3 flex flex-col">
              <Link to={`/products/${p.slug}`} className="block">
                <div className="aspect-square rounded-lg overflow-hidden bg-warm-cream mb-2">
                  {img && <img src={img} alt={p.name} loading="lazy" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
                </div>
                <div className="font-semibold text-xs leading-snug text-foreground line-clamp-2">{p.name}</div>
              </Link>
              {b?.price != null && <div className="text-sm text-forest font-bold mt-1">From <span className="font-mono-price">{fmt(Number(b.price))}</span></div>}
              {cadence && <div className="text-[10px] text-text-light">{cadence}</div>}
              <button type="button" onClick={() => addToBox(p)} disabled={!b}
                className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded-pill border border-forest text-forest min-h-9 text-xs font-semibold hover:bg-forest/10 disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" /> Add to a box
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
