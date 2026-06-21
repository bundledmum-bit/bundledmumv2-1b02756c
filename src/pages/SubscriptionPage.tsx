import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Package, Coins, Repeat, ShieldCheck, Plus, Minus, X } from "lucide-react";
import { toast } from "sonner";
import ImageZoomModal from "@/components/ImageZoomModal";
import { supabase } from "@/integrations/supabase/client";
import { getBrandImage } from "@/lib/brandImage";
import {
  useSubscriptionSettings, prettySubcategory, writeDraft, addToDraft, removeFromDraft,
  decrementDraftItem, useSubscriptionDraft,
  WEEKDAYS, fmtN, type Frequency, type SubscriptionDraftItem, type SubscriptionSettings,
} from "@/hooks/useSubscription";
import SubscriptionBasketBar from "@/components/SubscriptionBasketBar";
import bmLogoCoral from "@/assets/logos/BM-LOGO-CORAL.svg";

// -------------------------------------------------------------------------
// Interactive discovery catalog of subscribable products. Each card lets you
// pick a brand, size/colour (when the product has them), frequency, and a
// delivery day (Mon–Sat) and add it straight to the subscription draft — no
// navigation to the product page required. The first add creates the draft
// (owns the default frequency/day); subsequent adds append per-item, each
// carrying its own delivery day.
// -------------------------------------------------------------------------

interface Brand {
  id: string;
  brand_name: string;
  price: number;            // NAIRA
  size_variant: string | null;
  in_stock: boolean | null;
  image_url: string | null;
  stored_image_url?: string | null;
  images?: string[] | null;
}
interface Size {
  id: string;
  size_label: string;
  size_code: string | null;
  in_stock: boolean | null;
  display_order: number | null;
}
interface Color {
  id: string;
  color_name: string;
  color_hex: string | null;
  in_stock: boolean | null;
  display_order: number | null;
}
interface SubProduct {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  reorder_days: number | null;
  reorder_label: string | null;
  why_included: string | null;
  is_consumable: boolean | null;
  brands: Brand[];
  product_sizes: Size[];
  product_colors: Color[];
}

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

export default function SubscriptionPage() {
  const { data: settings } = useSubscriptionSettings();
  const [searchParams] = useSearchParams();
  const targetSlug = searchParams.get("product");
  // Slug of the card to visually highlight after a deep-link scroll. Cleared
  // after a few seconds so the emphasis is a one-shot, not a permanent style.
  const [highlightSlug, setHighlightSlug] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["subscribable-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id, slug, name, category, subcategory, reorder_days, reorder_label,
          why_included, is_consumable,
          brands:brands_public(id, brand_name, price, size_variant, in_stock, image_url, stored_image_url, images),
          product_sizes(id, size_label, size_code, in_stock, display_order),
          product_colors(id, color_name, color_hex, in_stock, display_order)
        `)
        .eq("is_subscribable", true)
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("subcategory", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as SubProduct[];
    },
    staleTime: 60_000,
  });

  // Grouped products for rendering.
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, SubProduct[]>>();
    for (const p of products) {
      const cat = (p.category || "other").toLowerCase();
      const sub = p.subcategory || "other";
      if (!map.has(cat)) map.set(cat, new Map());
      const inner = map.get(cat)!;
      if (!inner.has(sub)) inner.set(sub, []);
      inner.get(sub)!.push(p);
    }
    return map;
  }, [products]);

  // Deep-link: ?product=<slug> scrolls to + briefly highlights that card.
  // Runs only once the product list is loaded and the matching card exists in
  // the DOM; a missing/deactivated slug is a no-op (page loads normally).
  useEffect(() => {
    if (!targetSlug || products.length === 0) return;
    if (!products.some(p => p.slug === targetSlug)) return;
    // Wait for the grouped cards to be in the DOM, then scroll. The delay also
    // lets the global ScrollToTop finish its mount-time resets first.
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`sub-product-${targetSlug}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightSlug(targetSlug);
      // Re-assert next frame to win any race with ScrollToTop's post-data rAF
      // reset (it re-pins tall pages back to the top once data loads).
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    }, 250);
    const clearTimer = setTimeout(() => setHighlightSlug(null), 3000);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [targetSlug, products]);

  if (!settings) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-text-light">Loading…</div>;
  }
  if (!settings.subscription_enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center bg-[#FFF8F4] pt-20 md:pt-24">
        <div className="max-w-md">
          <h1 className="pf text-2xl font-bold mb-2">Subscriptions — Coming Soon</h1>
          <p className="text-text-med text-sm">We're putting the final touches on BundledMum subscriptions. Check back shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF8F4] pb-16 pt-20 md:pt-24">
      {/* Hero */}
      <header className="relative px-4 md:px-8 py-8 md:py-12 text-primary-foreground" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
        <div className="max-w-[880px] mx-auto text-center space-y-3">
          <img src={bmLogoCoral} alt="BundledMum" className="h-8 mx-auto" />
          <h1 className="pf text-2xl md:text-4xl font-bold leading-tight">{settings.subscription_page_heading}</h1>
          <p className="text-sm md:text-base text-primary-foreground/80 max-w-xl mx-auto">{settings.subscription_page_subtext}</p>

          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <Pill icon={<Package className="w-3.5 h-3.5" />}>Free delivery every time</Pill>
            <Pill icon={<Coins className="w-3.5 h-3.5" />}>Save {settings.discount_pct}% on every order</Pill>
            <Pill icon={<ShieldCheck className="w-3.5 h-3.5" />}>Minimum {settings.min_deliveries} deliveries</Pill>
            <Pill icon={<Repeat className="w-3.5 h-3.5" />}>Cancel anytime after that</Pill>
          </div>
        </div>
      </header>

      <main className="max-w-[880px] mx-auto px-4 md:px-8 py-6 space-y-6">
        <div>
          <h2 className="pf text-xl md:text-2xl font-bold">Products you can subscribe to</h2>
          <p className="text-sm text-text-med mt-1">
            Save {settings.discount_pct}% and get free delivery on everything you need regularly. Each product can have its own delivery day.
          </p>
        </div>

        {isLoading && <p className="text-sm text-text-light text-center py-12">Loading products…</p>}
        {!isLoading && products.length === 0 && (
          <p className="text-sm text-text-light text-center py-12">No subscribable products available right now.</p>
        )}

        {Array.from(grouped.entries()).map(([cat, subs]) => (
          <section key={cat} className="space-y-4">
            <h2 className="pf text-xl font-bold">{cat === "mum" ? "For Mum" : cat === "baby" ? "For Baby" : prettySubcategory(cat)}</h2>
            {Array.from(subs.entries()).map(([sub, items]) => (
              <div key={sub} className="space-y-3">
                <h3 className="text-xs uppercase tracking-widest font-semibold text-text-med">{prettySubcategory(sub)}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map(p => <SubscribableProductCard key={p.id} product={p} settings={settings} highlight={p.slug === highlightSlug} />)}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>

      <SubscriptionBasketBar className="bottom-[calc(72px+env(safe-area-inset-bottom))] md:bottom-6" />
    </div>
  );
}

// -------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------

function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-pill px-3 py-1.5 text-xs font-semibold">
      {icon}{children}
    </span>
  );
}

// Native-select styling matched to the CheckoutPage address form, with a 44px
// min tap target for mobile.
const selectCls = "w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none transition-colors min-h-[44px]";
const FREQ_OPT: Record<Frequency, string> = { weekly: "Every week", biweekly: "Every 2 weeks", monthly: "Every month" };

// Fully interactive subscription card. The shopper chooses brand, size/colour
// (when the product has them), frequency, and delivery day (Mon–Sat) via
// dropdowns — nothing is pre-selected — then adds straight to the draft. The
// first add creates it; later adds append per-item with their own delivery day.
function SubscribableProductCard({ product, settings, highlight = false }: { product: SubProduct; settings: SubscriptionSettings; highlight?: boolean }) {
  const draft = useSubscriptionDraft();
  const [zoomed, setZoomed] = useState(false);

  // In-stock brands first, then OOS — so the dropdown lists available options up top.
  const orderedBrands = useMemo(
    () => [...product.brands].sort((a, b) => (a.in_stock === false ? 1 : 0) - (b.in_stock === false ? 1 : 0)),
    [product.brands],
  );
  const sizes = [...(product.product_sizes || [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const colors = [...(product.product_colors || [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  // Cheapest in-stock brand drives the "From ₦X" + the default image only.
  const cheapest = [...product.brands]
    .filter(b => b.in_stock !== false)
    .sort((a, b) => (a.price || 0) - (b.price || 0))[0]
    || [...product.brands].sort((a, b) => (a.price || 0) - (b.price || 0))[0]
    || null;
  const cadence = product.reorder_label || (product.reorder_days ? `Restocks every ${product.reorder_days} days` : null);

  // Frequencies offered are driven entirely by the *_enabled settings, so
  // disabling weekly/biweekly (or re-enabling later) needs no code change.
  const enabledFreqs: Frequency[] = useMemo(() => {
    const list: Frequency[] = [];
    if (settings.weekly_enabled) list.push("weekly");
    if (settings.biweekly_enabled) list.push("biweekly");
    if (settings.monthly_enabled) list.push("monthly");
    return list;
  }, [settings.weekly_enabled, settings.biweekly_enabled, settings.monthly_enabled]);
  const onlyFreq = enabledFreqs.length === 1 ? enabledFreqs[0] : null;

  const [brandId, setBrandId] = useState<string>("");
  const [sizeId, setSizeId] = useState<string>("");
  const [colorId, setColorId] = useState<string>("");
  const [frequency, setFrequency] = useState<Frequency | "">("");
  const [deliveryDay, setDeliveryDay] = useState<string>("");

  // When only one frequency is enabled, preselect it (no picker is shown).
  useEffect(() => {
    if (onlyFreq && !frequency) setFrequency(onlyFreq);
  }, [onlyFreq, frequency]);

  const brand = orderedBrands.find(b => b.id === brandId) || null;
  const size = sizes.find(s => s.id === sizeId) || null;
  const color = colors.find(c => c.id === colorId) || null;
  // Image: the chosen brand's, else the cheapest brand's (for display + zoom).
  const displayBrand = brand || cheapest;
  const img = displayBrand ? (getBrandImage(displayBrand) || displayBrand.images?.[0] || null) : null;

  const needsSize = sizes.length > 0;
  const needsColor = colors.length > 0;

  // Items already in the draft for THIS product (reactive via useSubscriptionDraft).
  const subscribedItems = draft?.items.filter(i => i.product_id === product.id) ?? [];
  const hasSubscribed = subscribedItems.length > 0;

  const resetSelection = () => {
    setBrandId(""); setSizeId(""); setColorId(""); setFrequency(""); setDeliveryDay("");
  };

  const missing: string[] = [];
  if (!brand) missing.push("brand");
  if (needsSize && !size) missing.push("size");
  if (needsColor && !color) missing.push("colour");
  if (!frequency) missing.push("frequency");
  if (!deliveryDay) missing.push("delivery day");
  const canSubscribe = missing.length === 0;

  const handleSubscribe = () => {
    if (!brand || !frequency || !deliveryDay) return;
    const item: SubscriptionDraftItem = {
      product_id: product.id,
      brand_id: brand.id,
      quantity: 1,
      frequency,
      unit_price: Number(brand.price) || 0,
      product_name: product.name,
      brand_name: brand.brand_name,
      image_url: getBrandImage(brand) || brand.images?.[0] || null,
      size_variant: size?.size_label ?? brand.size_variant ?? null,
      color: color?.color_name ?? null,
      delivery_day: deliveryDay,
    };
    if (draft && draft.items.length > 0) {
      addToDraft(item);
    } else {
      writeDraft({
        items: [item],
        frequency,
        delivery_day: deliveryDay,
        subtotal_per_delivery: item.unit_price,
        discount_pct: settings.discount_pct,
        total_per_delivery: Math.round(item.unit_price * (1 - settings.discount_pct / 100)),
      });
    }
    toast.success(`Added ${product.name} to your subscription`);
    resetSelection();
  };

  return (
    <div
      id={`sub-product-${product.slug}`}
      className={`bg-card border rounded-card overflow-hidden flex flex-col scroll-mt-24 transition-all duration-500 ${highlight ? "border-coral ring-2 ring-coral ring-offset-2 shadow-lg" : "border-border"}`}
    >
      {/* Image — bigger, click to zoom */}
      <button
        type="button"
        onClick={() => img && setZoomed(true)}
        className="block w-full aspect-[4/3] md:aspect-square bg-warm-cream overflow-hidden"
        aria-label={`Zoom ${product.name} image`}
      >
        {img && (
          <img src={img} alt={product.name} loading="lazy" className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        )}
      </button>

      <div className="p-3 flex flex-col">
        <div className="font-semibold text-sm leading-snug text-foreground line-clamp-2">{product.name}</div>
        {cadence && <div className="text-[11px] text-text-light mt-0.5">{cadence}</div>}
        {displayBrand?.price != null && <div className="text-sm text-forest font-bold mt-1">From {fmtN(displayBrand.price)}</div>}
        <Link to={`/products/${product.slug}`} className="text-xs text-muted-foreground underline hover:text-foreground transition-colors mt-1 self-start">
          View product
        </Link>

        {/* State B — subscribed items for this product + "add another brand" */}
        {hasSubscribed && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-text-med mb-1.5">In your subscription</div>
            <ul className="space-y-2">
              {subscribedItems.map(item => (
                <li key={item.brand_id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{item.brand_name}</div>
                    {item.size_variant && <div className="text-xs text-muted-foreground truncate">{item.size_variant}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button type="button" onClick={() => decrementDraftItem(item.product_id, item.brand_id)}
                      className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors" aria-label="Decrease quantity">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-sm font-medium w-4 text-center tabular-nums">{item.quantity}</span>
                    <button type="button" onClick={() => addToDraft({ ...item, quantity: 1 })}
                      className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors" aria-label="Increase quantity">
                      <Plus className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => removeFromDraft(item.product_id, item.brand_id)}
                      className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-coral transition-colors" aria-label={`Remove ${item.brand_name}`}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border my-3" />
            <button type="button" onClick={resetSelection}
              className="text-sm text-forest underline hover:opacity-80 transition-opacity flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" /> Subscribe to another brand
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2 mt-3">
          {/* Brand */}
          <select className={selectCls} value={brandId} onChange={e => setBrandId(e.target.value)} aria-label="Choose Brand">
            <option value="">Choose Brand</option>
            {orderedBrands.map(b => (
              <option key={b.id} value={b.id}>
                {b.brand_name} — {fmtN(b.price)}{b.in_stock === false ? " (Out of Stock)" : ""}
              </option>
            ))}
          </select>

          {/* Size */}
          {needsSize && (
            <select className={selectCls} value={sizeId} onChange={e => setSizeId(e.target.value)} aria-label="Choose Size">
              <option value="">Choose Size</option>
              {sizes.map(s => (
                <option key={s.id} value={s.id} disabled={s.in_stock === false}>
                  {s.size_label}{s.in_stock === false ? " (Out of Stock)" : ""}
                </option>
              ))}
            </select>
          )}

          {/* Colour */}
          {needsColor && (
            <select className={selectCls} value={colorId} onChange={e => setColorId(e.target.value)} aria-label="Choose Color">
              <option value="">Choose Color</option>
              {colors.map(c => (
                <option key={c.id} value={c.id} disabled={c.in_stock === false}>
                  {c.color_name}{c.in_stock === false ? " (Out of Stock)" : ""}
                </option>
              ))}
            </select>
          )}

          {/* Frequency — a picker only when there's a genuine choice; a
              fixed label when a single frequency is enabled (monthly-only). */}
          {onlyFreq ? (
            <div className={`${selectCls} flex items-center text-text-dark`} aria-label="Delivery frequency">
              {FREQ_OPT[onlyFreq]}
            </div>
          ) : (
            <select className={selectCls} value={frequency} onChange={e => setFrequency(e.target.value as Frequency)} aria-label="Choose Frequency">
              <option value="">Choose Frequency</option>
              {enabledFreqs.map(f => <option key={f} value={f}>{FREQ_OPT[f]}</option>)}
            </select>
          )}

          {/* Delivery day — Mon–Sat */}
          <select className={selectCls} value={deliveryDay} onChange={e => setDeliveryDay(e.target.value)} aria-label="Choose Delivery Day">
            <option value="">Choose Delivery Day</option>
            {WEEKDAYS.slice(0, 6).map(d => <option key={d.v} value={d.v}>{d.long}</option>)}
          </select>
        </div>

        <button type="button" onClick={handleSubscribe} disabled={!canSubscribe}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 text-sm font-bold min-h-[44px] hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" /> {hasSubscribed ? "Add another brand" : "Add to subscription"}
        </button>
        {!canSubscribe && (
          <p className="text-[11px] text-text-light mt-1.5 text-center">Please choose {missing.join(", ")} to continue</p>
        )}
      </div>

      {/* Zoom lightbox — constrained, tap-out scrim (shared component). */}
      {zoomed && img && (
        <ImageZoomModal src={img} alt={product.name} onClose={() => setZoomed(false)} />
      )}
    </div>
  );
}
