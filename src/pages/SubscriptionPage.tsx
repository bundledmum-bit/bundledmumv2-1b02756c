import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check, Package, Coins, Repeat, Minus, Plus, ArrowRight,
  CalendarDays, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useSubscriptionSettings, prettySubcategory, writeDraft,
  WEEKDAYS, FREQUENCY_LABEL,
  type Frequency,
} from "@/hooks/useSubscription";
import bmLogoCoral from "@/assets/logos/BM-LOGO-CORAL.svg";

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface Brand {
  id: string;
  brand_name: string;
  price: number;            // NAIRA
  size_variant: string | null;
  in_stock: boolean | null;
  image_url: string | null;
  images?: string[] | null;
}
interface SubProduct {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  reorder_days: number | null;
  reorder_label: string | null;
  why_included: string | null;
  is_consumable: boolean | null;
  brands: Brand[];
}
interface Selection {
  brand_id: string;
  brand_name: string;
  image_url: string | null;
  unit_price: number;
  quantity: number;
  frequency: Frequency;
}
const fmtN = (naira: number) => `₦${Math.round(naira || 0).toLocaleString("en-NG")}`;

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

export default function SubscriptionPage() {
  const { data: settings } = useSubscriptionSettings();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const autoProductId = searchParams.get("product");
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["subscribable-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id, name, category, subcategory, reorder_days, reorder_label,
          why_included, is_consumable,
          brands:brands_public(id, brand_name, price, size_variant, in_stock, image_url, images)
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

  // Which frequencies are enabled this session.
  const enabledFreqs: Frequency[] = useMemo(() => {
    if (!settings) return ["monthly"];
    const list: Frequency[] = [];
    if (settings.weekly_enabled)   list.push("weekly");
    if (settings.biweekly_enabled) list.push("biweekly");
    if (settings.monthly_enabled)  list.push("monthly");
    return list.length ? list : ["monthly"];
  }, [settings]);

  const [globalFrequency, setGlobalFrequency] = useState<Frequency>("monthly");
  useEffect(() => {
    if (!enabledFreqs.includes(globalFrequency)) setGlobalFrequency(enabledFreqs[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledFreqs.join(",")]);

  const [deliveryDay, setDeliveryDay] = useState<string>("monday");
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  // Auto-tick ?product=ID once products arrive. The page intentionally
  // does NOT scroll to the matched product — opening centered mid-list
  // looks like the page loaded at the bottom. The product still appears
  // ticked when the customer scrolls to it normally.
  useEffect(() => {
    if (!autoProductId || products.length === 0) return;
    const target = products.find(p => p.id === autoProductId);
    if (!target) return;
    const inStock = target.brands.filter(b => b.in_stock !== false);
    if (inStock.length === 0) return;
    const first = inStock[0];
    setSelected(prev => prev[target.id] ? prev : {
      ...prev,
      [target.id]: {
        brand_id: first.id,
        brand_name: first.brand_name,
        image_url: first.image_url || first.images?.[0] || null,
        unit_price: Number(first.price) || 0,
        quantity: 1,
        frequency: globalFrequency,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoProductId, products.length]);

  const toggle = (p: SubProduct) => {
    setSelected(prev => {
      const next = { ...prev };
      if (next[p.id]) { delete next[p.id]; return next; }
      const inStock = p.brands.filter(b => b.in_stock !== false);
      if (inStock.length === 0) return prev;
      const first = inStock[0];
      next[p.id] = {
        brand_id: first.id,
        brand_name: first.brand_name,
        image_url: first.image_url || first.images?.[0] || null,
        unit_price: Number(first.price) || 0,
        quantity: 1,
        frequency: globalFrequency,
      };
      return next;
    });
  };

  const patch = (productId: string, update: Partial<Selection>) => {
    setSelected(prev => prev[productId] ? { ...prev, [productId]: { ...prev[productId], ...update } } : prev);
  };

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

  const summary = useMemo(() => {
    const entries = Object.values(selected);
    const count = entries.reduce((s, x) => s + x.quantity, 0);
    const subtotal = entries.reduce((s, x) => s + x.unit_price * x.quantity, 0);
    const pct = settings?.discount_pct ?? 0;
    const discount = Math.round(subtotal * pct / 100);
    const total = subtotal - discount;
    return { count, subtotal, discount, total };
  }, [selected, settings]);

  const canContinue = summary.count > 0 && !!deliveryDay;

  const goToCheckout = () => {
    if (summary.count === 0) {
      setValidationError("Tick at least one product to continue.");
      toast.error("Tick at least one product to continue.");
      return;
    }
    if (!deliveryDay) {
      setValidationError("Choose a delivery day before continuing.");
      toast.error("Choose a delivery day.");
      return;
    }
    setValidationError(null);

    const items = Object.entries(selected).map(([product_id, sel]) => {
      const product = products.find(p => p.id === product_id);
      return {
        product_id,
        brand_id: sel.brand_id,
        product_name: product?.name || "",
        brand_name: sel.brand_name,
        quantity: sel.quantity,
        unit_price: sel.unit_price,
        frequency: sel.frequency,
        image_url: sel.image_url,
      };
    });

    const checkoutFrequency: Frequency = enabledFreqs.includes(globalFrequency)
      ? globalFrequency
      : enabledFreqs[0] ?? "monthly";

    writeDraft({
      items,
      frequency: checkoutFrequency,
      delivery_day: deliveryDay,
      subtotal_per_delivery: summary.subtotal,
      discount_pct: settings?.discount_pct ?? 0,
      total_per_delivery: summary.total,
    });

    navigate("/subscriptions/checkout");
  };

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
    <div className="min-h-screen bg-[#FFF8F4] pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-[140px] pt-20 md:pt-24">
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
        {/* Delivery day */}
        <section className="bg-card border border-border rounded-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className="w-4 h-4 text-forest" />
            <h2 className="font-bold text-sm">Choose your delivery day</h2>
          </div>
          <p className="text-[11px] text-text-light mb-2">Applies to every delivery in this subscription.</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map(d => (
              <button
                key={d.v}
                onClick={() => setDeliveryDay(d.v)}
                className={`px-3 py-2 rounded-pill text-xs font-semibold border min-w-[52px] ${
                  deliveryDay === d.v
                    ? "bg-forest text-primary-foreground border-forest"
                    : "bg-background text-text-med border-input hover:border-forest/60"
                }`}
              >
                {d.short}
              </button>
            ))}
          </div>
        </section>

        {/* Product list */}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map(p => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      enabledFreqs={enabledFreqs}
                      selection={selected[p.id]}
                      onToggle={() => toggle(p)}
                      onPatch={update => patch(p.id, update)}
                      cardRef={el => { cardRefs.current[p.id] = el; }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>

      {/* Inline validation banner */}
      {validationError && summary.count > 0 && (
        <div className="max-w-[880px] mx-auto px-4 md:px-8">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-card px-3 py-2 text-xs">{validationError}</div>
        </div>
      )}

      {/* Sticky summary bar — sits above the mobile bottom nav on phones
          (Home/Quiz/Shop/Cart/Account) and flush to the bottom on desktop. */}
      {summary.count > 0 && (
        <div className="fixed left-0 right-0 z-[95] bg-card border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.06)] bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0">
          <div className="max-w-[880px] mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-xs">
              <div className="font-semibold"><span className="tabular-nums">{summary.count}</span> item{summary.count === 1 ? "" : "s"} · {fmtN(summary.total)} / delivery</div>
              <div className="text-emerald-700 font-semibold">Delivery: FREE</div>
            </div>
            <button
              onClick={goToCheckout}
              disabled={!canContinue}
              className="inline-flex items-center gap-1.5 rounded-pill px-5 py-3 text-sm font-semibold text-primary-foreground min-h-[44px] disabled:opacity-40"
              style={{ backgroundColor: "#2D6A4F" }}
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-primary-foreground/10 text-primary-foreground border border-primary-foreground/20 rounded-pill px-3 py-1.5 text-xs font-semibold">
      {icon} {children}
    </span>
  );
}

// -------------------------------------------------------------------------
// Product card
// -------------------------------------------------------------------------

function ProductCard({
  product, enabledFreqs, selection, onToggle, onPatch, cardRef,
}: {
  product: SubProduct;
  enabledFreqs: Frequency[];
  selection: Selection | undefined;
  onToggle: () => void;
  onPatch: (u: Partial<Selection>) => void;
  cardRef: (el: HTMLElement | null) => void;
}) {
  const isSelected = !!selection;
  const inStockBrands = product.brands.filter(b => b.in_stock !== false);
  const selectedBrand = inStockBrands.find(b => b.id === selection?.brand_id) || inStockBrands[0];
  const qty = selection?.quantity ?? 1;

  const reorderText = product.reorder_label
    || (product.reorder_days ? `Restocks every ${product.reorder_days} days` : null);

  const changeBrand = (brandId: string) => {
    const b = inStockBrands.find(x => x.id === brandId);
    if (!b) return;
    onPatch({
      brand_id: b.id,
      brand_name: b.brand_name,
      image_url: b.image_url || b.images?.[0] || null,
      unit_price: Number(b.price) || 0,
    });
  };

  return (
    <article
      ref={cardRef as any}
      className={`bg-card border rounded-card p-3 transition-colors ${isSelected ? "border-l-4 border-l-forest border-border" : "border-border opacity-85"}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="font-bold text-sm leading-tight">{product.name}</h4>
            {isSelected && (
              <span className="inline-flex items-center gap-0.5 bg-forest/10 text-forest text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-pill">
                <Check className="w-2.5 h-2.5" /> In box
              </span>
            )}
          </div>
          {reorderText && <p className="text-[11px] text-text-light mt-0.5">{reorderText}</p>}
        </div>

        {selectedBrand && (selectedBrand.image_url || selectedBrand.images?.[0]) && (
          <img
            src={selectedBrand.image_url || selectedBrand.images?.[0] || ""}
            alt={product.name}
            className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
          />
        )}
      </div>

      <fieldset disabled={!isSelected} className={`space-y-2 mt-3 ${isSelected ? "" : "opacity-40"}`}>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-0.5">Brand</label>
          <select
            value={selection?.brand_id || inStockBrands[0]?.id || ""}
            onChange={e => changeBrand(e.target.value)}
            className="w-full rounded-lg border border-input px-2 py-1.5 text-xs bg-background"
          >
            {inStockBrands.map(b => (
              <option key={b.id} value={b.id}>{b.brand_name} — {fmtN(Number(b.price))}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-0.5">Frequency</label>
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs w-full">
            {enabledFreqs.map(f => (
              <button
                key={f}
                onClick={() => onPatch({ frequency: f })}
                className={`flex-1 px-2 py-1 rounded-md font-semibold ${selection?.frequency === f ? "bg-card" : "text-text-med"}`}
              >
                {FREQUENCY_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-0.5">Quantity</label>
            <div className="inline-flex items-center gap-1 rounded-lg border border-input px-1 py-0.5 bg-background">
              <button onClick={() => onPatch({ quantity: Math.max(1, qty - 1) })} className="w-7 h-7 inline-flex items-center justify-center text-text-med hover:text-foreground disabled:opacity-40" disabled={!isSelected || qty <= 1}><Minus className="w-3 h-3" /></button>
              <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">{qty}</span>
              <button onClick={() => onPatch({ quantity: Math.min(10, qty + 1) })} className="w-7 h-7 inline-flex items-center justify-center text-text-med hover:text-foreground disabled:opacity-40" disabled={!isSelected || qty >= 10}><Plus className="w-3 h-3" /></button>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-text-light uppercase tracking-widest">Price</div>
            <div className="font-bold tabular-nums">{fmtN((selection?.unit_price ?? Number(selectedBrand?.price) ?? 0) * qty)}</div>
          </div>
        </div>
      </fieldset>

      {/* Explicit per-product action button — toggles selection, sits outside the fieldset so it's always clickable. */}
      <button
        onClick={onToggle}
        aria-label={isSelected ? "Remove from subscription" : "Add to subscription"}
        className={`w-full mt-3 rounded-pill py-2.5 text-xs font-semibold min-h-[40px] inline-flex items-center justify-center gap-1.5 transition-colors ${
          isSelected
            ? "bg-background border border-destructive/50 text-destructive hover:bg-destructive/10"
            : "text-primary-foreground hover:opacity-90"
        }`}
        style={isSelected ? undefined : { backgroundColor: "#F4845F" }}
      >
        {isSelected ? (
          <>Remove from subscription</>
        ) : (
          <><Plus className="w-3.5 h-3.5" /> Add to subscription</>
        )}
      </button>
    </article>
  );
}
