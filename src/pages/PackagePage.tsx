import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, ShoppingBag, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCart, fmt, cartItemKey, type CartItem } from "@/lib/cart";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { getBrandImage } from "@/lib/brandImage";
import { setLandingOrigin } from "@/lib/landingOrigin";
import QuoteItemsCard from "@/components/quote/QuoteItemsCard";
import QuoteTotalsCard from "@/components/quote/QuoteTotalsCard";

interface LandingPageRow {
  id: string;
  slug: string;
  title: string;
  intro_text: string | null;
  subtotal: number;
  service_fee: number;
  estimated_delivery_fee: number;
  total: number;
  is_active: boolean;
}

interface LandingItemRow {
  id: string;
  product_id: string | null;
  brand_id: string | null;
  product_name: string;
  brand_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  display_order: number | null;
  section: string | null;
}

/** Public marketing landing page at /package/:slug. Renders like a quote page
 *  (reusing the shared quote cards) but with the sitewide header, no customer
 *  block, and a WhatsApp "customize this" CTA instead of Download PDF. */
export default function PackagePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setCart } = useCart();
  const { data: settings } = useSiteSettings();

  const whatsappNumber = String(settings?.whatsapp_number ?? "").replace(/^"|"$/g, "").replace(/\D/g, "");
  const klumpEnabled =
    settings?.payment_method_klump_enabled === true ||
    settings?.payment_method_klump_enabled === "true" ||
    settings?.payment_method_klump_enabled === "1";
  const urlPayKlump = searchParams.get("pay") === "klump";

  // ── Fetch the active landing page by slug ──────────────────────────
  const pageQ = useQuery({
    queryKey: ["landing-page", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_pages")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return (data as LandingPageRow) || null;
    },
  });
  const page = pageQ.data;

  const itemsQ = useQuery({
    queryKey: ["landing-page-items", page?.id],
    enabled: !!page?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_page_items")
        .select("*")
        .eq("landing_page_id", page!.id)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data as LandingItemRow[]) || [];
    },
  });
  const items: LandingItemRow[] = itemsQ.data || [];

  // ── Resolve item images (brand image first, product image fallback) ─
  // No PostgREST embeds here: we query brands/products by id directly, so
  // the two products<->brands FKs can never make the embed ambiguous.
  const brandIds = useMemo(
    () => [...new Set(items.map((it) => it.brand_id).filter(Boolean))] as string[],
    [items],
  );
  const productIds = useMemo(
    () => [...new Set(items.map((it) => it.product_id).filter(Boolean))] as string[],
    [items],
  );

  const imagesQ = useQuery({
    queryKey: ["landing-item-images", brandIds.slice().sort().join(","), productIds.slice().sort().join(",")],
    enabled: items.length > 0,
    queryFn: async () => {
      const [brandsRes, productsRes] = await Promise.all([
        brandIds.length
          ? (supabase as any).from("brands").select("id, image_url, stored_image_url").in("id", brandIds)
          : Promise.resolve({ data: [] }),
        productIds.length
          ? (supabase as any).from("products").select("id, image_url").in("id", productIds)
          : Promise.resolve({ data: [] }),
      ]);
      const brandMap = new Map<string, string | null>();
      (brandsRes.data || []).forEach((b: any) => brandMap.set(b.id, getBrandImage(b) || null));
      const productMap = new Map<string, string | null>();
      (productsRes.data || []).forEach((p: any) => productMap.set(p.id, p.image_url || null));
      return { brandMap, productMap };
    },
  });

  const imageFor = (it: LandingItemRow): string | null => {
    const brandImg = it.brand_id ? imagesQ.data?.brandMap.get(it.brand_id) : null;
    const productImg = it.product_id ? imagesQ.data?.productMap.get(it.product_id) : null;
    return brandImg || productImg || null;
  };

  useEffect(() => {
    document.title = page?.title ? `${page.title} · BundledMum` : "Package · BundledMum";
  }, [page?.title]);

  // ── Add to cart (mirrors the quote page) ───────────────────────────
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [loadingCart, setLoadingCart] = useState(false);
  const [pendingPayKlump, setPendingPayKlump] = useState(false);

  const handleAddToCart = (payKlump = false) => {
    if (!page || items.length === 0) return;
    setPendingPayKlump(payKlump);
    setConfirmReplace(true);
  };

  const confirmAndCheckout = () => {
    if (!page) return;
    setLoadingCart(true);
    try {
      const next: CartItem[] = items
        .filter((it) => it.product_id)
        .map((it) => ({
          id: String(it.product_id),
          _key: cartItemKey(String(it.product_id), it.brand_id || undefined, it.size || undefined, it.color || undefined),
          name: it.product_name,
          price: Number(it.unit_price || 0),
          qty: Math.max(1, Number(it.quantity || 1)),
          imageUrl: imageFor(it) || undefined,
          selectedBrand: it.brand_id
            ? {
                id: it.brand_id,
                label: it.brand_name || undefined,
                price: Number(it.unit_price || 0),
                imageUrl: imageFor(it) || undefined,
              }
            : undefined,
          selectedSize: it.size || undefined,
          selectedColor: it.color || undefined,
        }) as CartItem);
      setCart(next);
      // Tag the cart's landing-page origin so checkout can create a funnel
      // quote once the visitor enters their details. Never creates a quote here.
      setLandingOrigin(page.id, next.map((i) => String(i.id)));
      setConfirmReplace(false);
      setLoadingCart(false);
      const preselectKlump = pendingPayKlump || urlPayKlump;
      navigate(preselectKlump ? "/checkout?pay=klump" : "/checkout");
    } catch (e: any) {
      console.error("[package] cart replace failed:", e);
      toast.error("Could not load these items into your cart.");
      setLoadingCart(false);
    }
  };

  // ── WhatsApp "customize this" CTA ──────────────────────────────────
  const waHref = useMemo(() => {
    if (!whatsappNumber) return null;
    const pageUrl = `${window.location.origin}/package/${slug}`;
    const msg = `Hi BundledMum, I want to customize this package. Page URL: ${pageUrl}`;
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;
  }, [whatsappNumber, slug]);

  // ── Loading / not found ────────────────────────────────────────────
  if (pageQ.isLoading) {
    return (
      <div className="min-h-screen bg-background pt-[84px] pb-10 px-4">
        <div className="max-w-[820px] mx-auto">
          <div className="h-8 w-56 bg-muted rounded animate-pulse mb-3" />
          <div className="h-4 w-72 bg-muted rounded animate-pulse mb-10" />
          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <div className="h-5 w-1/2 bg-muted rounded animate-pulse" />
            <div className="h-5 w-2/3 bg-muted rounded animate-pulse" />
            <div className="h-5 w-1/3 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen bg-background py-16 px-4 flex items-center justify-center">
        <div className="max-w-[480px] text-center">
          <AlertCircle className="w-12 h-12 text-text-light mx-auto mb-3" />
          <h1 className="pf text-2xl font-bold mb-2">Package not found</h1>
          <p className="text-text-med text-sm">
            This page is unavailable or has been removed. If you think this is a mistake, reach us on WhatsApp.
          </p>
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 bg-[#25D366] text-white px-5 py-2 rounded-pill text-sm font-bold"
            >
              <MessageCircle className="w-4 h-4" /> Message us on WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  }

  const viewItems = items.map((it) => ({
    id: it.id,
    product_name: it.product_name,
    brand_name: it.brand_name,
    size: it.size,
    color: it.color,
    quantity: it.quantity,
    unit_price: it.unit_price,
    line_total: it.line_total,
    section: it.section,
    display_order: it.display_order,
    image_url: imageFor(it),
  }));

  return (
    <div className="min-h-screen bg-background pt-[84px] pb-8 px-4">
      <div className="max-w-[820px] mx-auto">
        {/* Heading: page title + intro, no customer block */}
        <div className="mb-6">
          <h1 className="pf text-2xl md:text-3xl font-bold text-foreground">{page.title}</h1>
          {page.intro_text && (
            <p className="text-text-med text-sm md:text-base mt-2 leading-relaxed whitespace-pre-wrap">
              {page.intro_text}
            </p>
          )}
        </div>

        {/* Items */}
        <QuoteItemsCard items={viewItems} />

        {/* Totals */}
        <QuoteTotalsCard
          subtotal={page.subtotal}
          serviceFee={page.service_fee}
          delivery={
            <span className={page.estimated_delivery_fee === 0 ? "text-right" : "text-right"}>
              {page.estimated_delivery_fee === 0 ? "FREE" : fmt(page.estimated_delivery_fee)}
            </span>
          }
          total={page.total}
        />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <button
            onClick={() => handleAddToCart(false)}
            disabled={loadingCart || items.length === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-coral text-primary-foreground px-6 py-3 rounded-pill text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            <ShoppingBag className="w-4 h-4" />
            Add to Cart & Checkout
          </button>
          {klumpEnabled && (
            <button
              onClick={() => handleAddToCart(true)}
              disabled={loadingCart || items.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-forest text-primary-foreground px-6 py-3 rounded-pill text-sm font-bold hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
            >
              🛍️ Buy Now, Pay Later with Klump
            </button>
          )}
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border border-border px-6 py-3 rounded-pill text-sm font-semibold hover:bg-muted min-h-[48px]"
            >
              <MessageCircle className="w-4 h-4 text-[#25D366]" /> WhatsApp Us to Customize this
            </a>
          )}
        </div>

        {/* WhatsApp contact strip */}
        {whatsappNumber && (
          <div className="text-center text-xs text-text-med">
            Questions? <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="text-forest font-semibold hover:underline">Chat with us on WhatsApp</a>
          </div>
        )}
      </div>

      {/* Confirmation modal (mirrors the quote page) */}
      {confirmReplace && (
        <div
          className="fixed inset-0 bg-foreground/60 z-[150] flex items-center justify-center p-4 max-md:items-end max-md:p-0"
          onClick={() => !loadingCart && setConfirmReplace(false)}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-[420px] p-5 max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base mb-1">Replace your cart?</h3>
            <p className="text-xs text-text-med leading-relaxed">
              This will clear anything currently in your cart and replace it with this package. You'll still be able to edit quantities at checkout.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setConfirmReplace(false)}
                disabled={loadingCart}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={confirmAndCheckout}
                disabled={loadingCart}
                className="flex-1 px-4 py-2 bg-coral text-primary-foreground rounded-lg text-xs font-bold hover:bg-coral-dark disabled:opacity-40"
              >
                {loadingCart ? "Loading…" : "Yes, Replace Cart"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
