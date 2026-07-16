import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { MessageCircle, ShoppingBag, AlertCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCart, fmt, cartItemKey, type CartItem } from "@/lib/cart";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { getBrandImage } from "@/lib/brandImage";
import { setLandingOrigin } from "@/lib/landingOrigin";
import QuoteItemsCard, { QUOTE_ITEM_SECTIONS } from "@/components/quote/QuoteItemsCard";
import QuoteTotalsCard from "@/components/quote/QuoteTotalsCard";
import ShareRow from "@/components/ShareRow";

// A local, editable copy of a package line. `key` is a browser-only id for React
// keys and edits; it never touches the DB.
interface WorkItem {
  key: string;
  product_id: string | null;
  brand_id: string | null;
  product_name: string;
  brand_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  section: string | null;
  display_order: number;
  // Image known at add-time (from the picker result); falls back to the batch
  // image query when absent (e.g. items seeded from the template).
  image_url?: string | null;
}

function newKey(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `k_${Math.random().toString(36).slice(2)}`;
}

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

  // Service fee: read the same default the quote uses, from the anon-callable
  // RPC (integer naira). Never hardcoded; may legitimately be 0.
  const serviceFeeQ = useQuery({
    queryKey: ["default-service-fee"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_default_service_fee");
      if (error) throw error;
      return Number(data) || 0;
    },
  });
  const serviceFee = serviceFeeQ.data ?? 0;

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

  // ── Editable working copy ──────────────────────────────────────────
  // The package is a template; the customer edits a per-visitor copy that lives
  // only in the browser until it is added to cart. The landing_page rows are
  // never modified here. Initialised once when the items load.
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const seededForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!page?.id || !itemsQ.data) return;
    if (seededForRef.current === page.id) return;
    seededForRef.current = page.id;
    setWorkItems(
      (itemsQ.data as LandingItemRow[]).map((it) => ({
        key: newKey(),
        product_id: it.product_id,
        brand_id: it.brand_id,
        product_name: it.product_name,
        brand_name: it.brand_name,
        size: it.size,
        color: it.color,
        quantity: Math.max(1, Number(it.quantity) || 1),
        unit_price: Number(it.unit_price) || 0,
        line_total: (Number(it.unit_price) || 0) * Math.max(1, Number(it.quantity) || 1),
        section: it.section,
        display_order: it.display_order ?? 0,
      })),
    );
  }, [page?.id, itemsQ.data]);

  // Sections the page offers (canonical order), so an emptied section stays
  // addable. Derived from the original template, not the mutable working copy.
  const addSections = useMemo(() => {
    const present = new Set((items.map((it) => it.section).filter(Boolean)) as string[]);
    const known = QUOTE_ITEM_SECTIONS.filter((s) => present.has(s.key)).map((s) => ({ key: s.key as string | null, label: s.label }));
    return known.length > 0 ? known : [{ key: null, label: "Items" }];
  }, [items]);

  // ── Resolve item images + available sizes for the working copy ─
  // No PostgREST embeds: query brands/products/product_sizes by id directly, so
  // the two products<->brands FKs can never make an embed ambiguous.
  const brandIds = useMemo(
    () => [...new Set(workItems.map((it) => it.brand_id).filter(Boolean))] as string[],
    [workItems],
  );
  const productIds = useMemo(
    () => [...new Set(workItems.map((it) => it.product_id).filter(Boolean))] as string[],
    [workItems],
  );

  const imagesQ = useQuery({
    queryKey: ["landing-item-images", brandIds.slice().sort().join(","), productIds.slice().sort().join(",")],
    enabled: brandIds.length + productIds.length > 0,
    // Keep the previous image map while refetching after an add/remove so item
    // images never blank out (noticeable on slow mobile networks).
    placeholderData: keepPreviousData,
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

  // Available sizes per product, for the editable size selector.
  const sizesQ = useQuery({
    queryKey: ["landing-item-sizes", productIds.slice().sort().join(",")],
    enabled: productIds.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_sizes")
        .select("product_id, size_label, in_stock")
        .in("product_id", productIds)
        .order("display_order", { ascending: true });
      if (error) throw error;
      const map = new Map<string, string[]>();
      (data || []).forEach((s: any) => {
        if (s.in_stock === false) return;
        if (!map.has(s.product_id)) map.set(s.product_id, []);
        map.get(s.product_id)!.push(s.size_label);
      });
      return map;
    },
  });

  const imageForIds = (productId: string | null, brandId: string | null): string | null => {
    const brandImg = brandId ? imagesQ.data?.brandMap.get(brandId) : null;
    const productImg = productId ? imagesQ.data?.productMap.get(productId) : null;
    return brandImg || productImg || null;
  };

  useEffect(() => {
    document.title = page?.title ? `${page.title} · BundledMum` : "Package · BundledMum";
  }, [page?.title]);

  const sizeOptionsFor = (productId: string | null): string[] =>
    (productId && sizesQ.data?.get(productId)) || [];

  // ── Editing handlers (mutate the browser-only working copy) ────────
  const recalc = (it: WorkItem): WorkItem => ({ ...it, line_total: it.unit_price * it.quantity });

  const changeQty = (key: string, qty: number) =>
    setWorkItems((prev) => prev.map((it) => (it.key === key ? recalc({ ...it, quantity: Math.max(1, qty) }) : it)));
  const changeSize = (key: string, size: string | null) =>
    setWorkItems((prev) => prev.map((it) => (it.key === key ? { ...it, size } : it)));
  const removeItem = (key: string) =>
    setWorkItems((prev) => prev.filter((it) => it.key !== key));

  // ── Per-section product picker ─────────────────────────────────────
  const [pickerSection, setPickerSection] = useState<string | null | undefined>(undefined); // undefined = closed
  const [pickerSearch, setPickerSearch] = useState("");
  const pickerOpen = pickerSection !== undefined;

  const openPicker = (sectionKey: string | null) => { setPickerSection(sectionKey); setPickerSearch(""); };
  const closePicker = () => setPickerSection(undefined);

  const trimmedPicker = pickerSearch.trim();
  const { data: pickerResults = [], isFetching: pickerSearching } = useQuery({
    queryKey: ["package-picker-search", trimmedPicker],
    enabled: pickerOpen && trimmedPicker.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      // Same pinned-FK query the admin builder uses, plus image fields so the
      // result cards can show a product image.
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, image_url, brands!brands_product_id_fkey!inner(id, brand_name, price, in_stock, image_url, stored_image_url)")
        .eq("is_active", true)
        .eq("brands.in_stock", true)
        .gt("brands.price", 0)
        .ilike("name", `%${trimmedPicker}%`)
        .limit(20);
      if (error) throw error;
      const rows: Array<{ productId: string; productName: string; brandId: string; brandName: string; price: number; image: string | null }> = [];
      (data || []).forEach((p: any) => {
        (p.brands || []).forEach((b: any) => {
          rows.push({
            productId: p.id, productName: p.name,
            brandId: b.id, brandName: b.brand_name, price: b.price,
            image: getBrandImage(b) || p.image_url || null,
          });
        });
      });
      return rows;
    },
  });

  // Add a searched product into the section the picker was opened from. Adding
  // the same product+brand (same size, here always null on add) in that section
  // increments its quantity instead of stacking a duplicate line.
  const addProduct = (row: { productId: string; productName: string; brandId: string; brandName: string; price: number; image?: string | null }) => {
    const section = pickerSection ?? null;
    setWorkItems((prev) => {
      const idx = prev.findIndex(
        (it) => it.product_id === row.productId && it.brand_id === row.brandId && (it.section ?? null) === section && !it.size,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = recalc({ ...next[idx], quantity: next[idx].quantity + 1 });
        return next;
      }
      const maxOrder = prev.reduce((m, it) => Math.max(m, it.display_order || 0), 0);
      return [
        ...prev,
        recalc({
          key: newKey(),
          product_id: row.productId,
          brand_id: row.brandId,
          product_name: row.productName,
          brand_name: row.brandName,
          size: null,
          color: null,
          quantity: 1,
          unit_price: Number(row.price) || 0,
          line_total: 0,
          section,
          display_order: maxOrder + 1,
          image_url: row.image ?? null, // known from the picker; instant + stable
        }),
      ];
    });
    toast.success("Added to your package");
  };

  // ── Add to cart (mirrors the quote page, using the edited copy) ────
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [loadingCart, setLoadingCart] = useState(false);
  const [pendingPayKlump, setPendingPayKlump] = useState(false);

  const handleAddToCart = (payKlump = false) => {
    if (!page || workItems.length === 0) return;
    setPendingPayKlump(payKlump);
    setConfirmReplace(true);
  };

  const confirmAndCheckout = () => {
    if (!page) return;
    setLoadingCart(true);
    try {
      // Map the EDITED working copy (not the original template) to the cart.
      const next: CartItem[] = workItems
        .filter((it) => it.product_id)
        .map((it) => {
          const img = imageForIds(it.product_id, it.brand_id) || undefined;
          return {
            id: String(it.product_id),
            _key: cartItemKey(String(it.product_id), it.brand_id || undefined, it.size || undefined, it.color || undefined),
            name: it.product_name,
            price: Number(it.unit_price || 0),
            qty: Math.max(1, Number(it.quantity || 1)),
            imageUrl: img,
            selectedBrand: it.brand_id
              ? {
                  id: it.brand_id,
                  label: it.brand_name || undefined,
                  price: Number(it.unit_price || 0),
                  imageUrl: img,
                }
              : undefined,
            selectedSize: it.size || undefined,
            selectedColor: it.color || undefined,
          } as CartItem;
        });
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

  const viewItems = workItems.map((it) => ({
    id: it.key,
    product_id: it.product_id,
    product_name: it.product_name,
    brand_name: it.brand_name,
    size: it.size,
    color: it.color,
    quantity: it.quantity,
    unit_price: it.unit_price,
    line_total: it.line_total,
    section: it.section,
    display_order: it.display_order,
    image_url: it.image_url ?? imageForIds(it.product_id, it.brand_id),
  }));

  // Live totals from the edited working copy. Service fee comes from the RPC
  // (same as the quote). Delivery is quoted later, so it shows a message and
  // contributes 0 to the total unless a real fee (> 0) was set by the admin.
  const liveSubtotal = workItems.reduce((s, it) => s + it.line_total, 0);
  const deliveryFee = page.estimated_delivery_fee;
  const hasDeliveryFee = deliveryFee != null && deliveryFee > 0;
  const liveTotal = Math.max(0, liveSubtotal + serviceFee + (hasDeliveryFee ? deliveryFee : 0));

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
          <p className="text-[12px] text-text-light mt-2">
            Make it yours: change sizes and quantities, remove what you do not need, or add more with the buttons below.
          </p>
        </div>

        {/* Items (editable working copy) */}
        <QuoteItemsCard
          items={viewItems}
          editable
          addSections={addSections}
          sizeOptions={(it) => sizeOptionsFor(it.product_id ?? null)}
          onQtyChange={changeQty}
          onSizeChange={changeSize}
          onRemove={removeItem}
          onAddToSection={openPicker}
        />

        {/* Totals — recompute live from the working copy */}
        <QuoteTotalsCard
          subtotal={liveSubtotal}
          serviceFee={serviceFee}
          delivery={
            hasDeliveryFee ? (
              <span className="text-right">{fmt(deliveryFee)}</span>
            ) : (
              <span className="text-right text-xs text-text-med">Will be communicated</span>
            )
          }
          total={liveTotal}
        />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <button
            onClick={() => handleAddToCart(false)}
            disabled={loadingCart || workItems.length === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-coral text-primary-foreground px-6 py-3 rounded-pill text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            <ShoppingBag className="w-4 h-4" />
            Add to Cart & Checkout
          </button>
          {klumpEnabled && (
            <button
              onClick={() => handleAddToCart(true)}
              disabled={loadingCart || workItems.length === 0}
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

        {/* Share row */}
        <ShareRow
          message={`Check out this ${page.title} ${window.location.origin}/package/${slug}`}
          url={`${window.location.origin}/package/${slug}`}
        />

        {/* WhatsApp contact strip */}
        {whatsappNumber && (
          <div className="text-center text-xs text-text-med">
            Questions? <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="text-forest font-semibold hover:underline">Chat with us on WhatsApp</a>
          </div>
        )}
      </div>

      {/* Per-section product picker */}
      {pickerOpen && (
        <div
          className="fixed inset-0 bg-foreground/60 z-[160] flex items-end sm:items-center justify-center sm:p-4"
          onClick={closePicker}
        >
          <div
            className="bg-card w-full sm:max-w-[520px] sm:rounded-2xl rounded-t-2xl max-h-[85dvh] flex flex-col overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h3 className="font-bold text-sm">
                Add products
                {pickerSection && (
                  <span className="text-text-light font-normal"> to {QUOTE_ITEM_SECTIONS.find((s) => s.key === pickerSection)?.label || "this section"}</span>
                )}
              </h3>
              <button onClick={closePicker} aria-label="Close" className="w-11 h-11 grid place-items-center rounded-full hover:bg-muted -mr-2">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-text-light absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search all products by name"
                  className="w-full border border-input rounded-lg pl-9 pr-3 min-h-[44px] text-sm bg-background"
                />
              </div>
            </div>
            {/* Mobile/iOS: a direct, resolvable max-height (auto content height,
                not flex:1 which iOS collapses to 0 in a max-height-only column).
                Desktop keeps flex:1 to fill the sheet. */}
            <div className="min-h-0 max-h-[60vh] sm:max-h-none sm:flex-1 px-4 pb-4 overflow-y-auto overscroll-contain">
              {trimmedPicker.length < 2 ? (
                <p className="text-xs text-text-light text-center py-8">Type at least 2 characters to search.</p>
              ) : pickerSearching ? (
                <p className="text-xs text-text-light text-center py-8">Searching…</p>
              ) : pickerResults.length === 0 ? (
                <p className="text-xs text-text-light text-center py-8">No products found.</p>
              ) : (
                <div className="space-y-2">
                  {pickerResults.map((row, i) => (
                    <div key={`${row.productId}-${row.brandId}-${i}`} className="flex items-center gap-3 border border-border rounded-xl p-2.5">
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 border border-border">
                        {row.image ? (
                          // Explicit px size (not w-full/h-full) so iOS Safari
                          // renders it (see the item-row thumbnail note).
                          <img src={row.image} alt={row.productName} className="block w-12 h-12 object-cover" />
                        ) : (
                          <div className="w-12 h-12 grid place-items-center text-text-light"><ShoppingBag className="w-4 h-4" /></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{row.productName}</p>
                        <p className="text-[11px] text-text-med">{row.brandName} · {fmt(row.price)}</p>
                      </div>
                      <button
                        onClick={() => addProduct(row)}
                        className="shrink-0 inline-flex items-center justify-center gap-1 min-h-[44px] px-4 rounded-pill bg-coral text-white text-sm font-bold hover:bg-coral-dark"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-border shrink-0">
              <button onClick={closePicker} className="w-full min-h-[44px] rounded-pill border border-border text-sm font-semibold hover:bg-muted">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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
