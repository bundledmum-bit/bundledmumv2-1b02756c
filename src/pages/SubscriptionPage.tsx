import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Minus, X, Search, Check, Copy, Loader2, Lock,
  AlertTriangle, CalendarDays, ArrowLeft, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getBrandImage } from "@/lib/brandImage";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import {
  useSubscriptionSettings, fmtN, BOX_WEEKDAYS, formatBoxDate,
} from "@/hooks/useSubscription";
import bmLogoCoral from "@/assets/logos/BM-LOGO-CORAL.svg";

// ===========================================================================
// Monthly-BOX subscription builder.
//
// The mum commits to N months = N boxes, each filled independently and each
// clearing ₦50,000 on its own. ONE payment up front covers every box; prices
// are locked at subscribe time; 5% off + free delivery per box. All money
// (subtotal / discount / total / the 50k floor / grand total) is owned by the
// DB — this page only READS it and never computes a discount or fee itself.
//
// Flow: STEP 1 months → STEP 2 weekday + contact (calls start_subscription,
// which creates the draft subscription AND all boxes) → STEP 3 fill the boxes
// (add_item_to_subscription_box, copy-box, live subscription_ready_to_pay
// gating) → STEP 4 pay once via Paystack, then activate-subscription (NO
// amount — the edge fn asks Paystack what was actually paid).
// ===========================================================================

// Persist the in-progress subscription so an accidental reload mid-build doesn't
// orphan the draft rows the server already created.
const ACTIVE_KEY = "bm_active_box_subscription";

interface StartedBox { box_id: string; box_number: number; scheduled_date: string }
interface Started {
  subscription_id: string;
  months: number;
  delivery_day: string;
  first_delivery: string;
  email: string;
  boxes: StartedBox[];
}

interface BoxItem {
  id: string; brand_id: string; product_name: string | null; brand_name: string | null;
  quantity: number; unit_price: number; line_total: number;
}
interface BoxRow {
  id: string; box_number: number; scheduled_date: string; status: string;
  subtotal: number; discount_amount: number; total: number;
  subscription_box_items: BoxItem[];
}
interface ReadyRow {
  ready: boolean; box_count: number; min_boxes: number; min_box_value: number;
  grand_total: number; failing_boxes: Array<{ box_number: number; subtotal: number; short_by: number }>;
  message: string;
}

const PRICE_LOCK_LINE =
  "The prices you see today are locked in for every box, even if prices rise later.";

export default function SubscriptionPage() {
  const { data: settings } = useSubscriptionSettings();
  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preloadBrandId = searchParams.get("brand_id");

  const [started, setStarted] = useState<Started | null>(() => {
    try { const raw = sessionStorage.getItem(ACTIVE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const subscriptionId = started?.subscription_id || null;

  // Box + payment state, all read from the DB.
  const { data: boxes = [], refetch: refetchBoxes, isFetching: boxesFetching } = useQuery({
    queryKey: ["sub-boxes", subscriptionId],
    enabled: !!subscriptionId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("subscription_boxes")
        .select("id, box_number, scheduled_date, status, subtotal, discount_amount, total, subscription_box_items(id, brand_id, product_name, brand_name, quantity, unit_price, line_total)")
        .eq("subscription_id", subscriptionId)
        .order("box_number", { ascending: true });
      if (error) throw error;
      return (data || []) as BoxRow[];
    },
  });

  const { data: ready, refetch: refetchReady } = useQuery({
    queryKey: ["sub-ready", subscriptionId],
    enabled: !!subscriptionId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("subscription_ready_to_pay", { p_subscription_id: subscriptionId });
      if (error) throw error;
      return ((data && data[0]) || null) as ReadyRow | null;
    },
  });

  const refresh = () => { refetchBoxes(); refetchReady(); };

  if (!settings) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-text-light">Loading…</div>;
  }
  if (!settings.subscription_enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center bg-[#FFF8F4] pt-20 md:pt-24">
        <div className="max-w-md">
          <h1 className="pf text-2xl font-bold mb-2">Subscriptions — Coming Soon</h1>
          <p className="text-text-med text-sm">We're putting the final touches on BundledMum monthly boxes. Check back shortly.</p>
        </div>
      </div>
    );
  }

  const minBoxValue = ready?.min_box_value ?? 50000;

  return (
    <div className="min-h-screen bg-[#FFF8F4] pb-24 pt-20 md:pt-24">
      <header className="relative px-4 md:px-8 py-8 text-primary-foreground" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
        <div className="max-w-[820px] mx-auto text-center space-y-2.5">
          <img src={bmLogoCoral} alt="BundledMum" className="h-8 mx-auto" />
          <h1 className="pf text-2xl md:text-3xl font-bold leading-tight">Build your monthly boxes</h1>
          <p className="text-sm text-primary-foreground/85 max-w-xl mx-auto">
            One box a month, filled your way. Pay once up front — 5% off and free delivery on every box.
          </p>
          <div className="inline-flex items-start gap-1.5 bg-white/15 rounded-lg px-3 py-2 text-[12px] text-left max-w-md">
            <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{PRICE_LOCK_LINE}</span>
          </div>
        </div>
      </header>

      <main className="max-w-[820px] mx-auto px-4 md:px-8 py-6">
        {!started ? (
          <StartStep
            defaultEmail={user?.email || ""}
            minBoxValue={minBoxValue}
            onStarted={(s) => {
              setStarted(s);
              try { sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
            }}
            preloadBrandId={preloadBrandId}
          />
        ) : (
          <FillAndPay
            started={started}
            boxes={boxes}
            ready={ready}
            boxesFetching={boxesFetching}
            onRefresh={refresh}
            onDone={() => {
              try { sessionStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
              navigate("/account/subscriptions?new=true");
            }}
            onStartOver={() => {
              try { sessionStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
              setStarted(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

// -------------------------------------------------------------------------
// STEP 1 + 2 — months, weekday, contact → start_subscription
// -------------------------------------------------------------------------
function StartStep({
  defaultEmail, minBoxValue, onStarted, preloadBrandId,
}: {
  defaultEmail: string;
  minBoxValue: number;
  onStarted: (s: Started) => void;
  preloadBrandId: string | null;
}) {
  const [months, setMonths] = useState(2);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("Lagos");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (defaultEmail && !email) setEmail(defaultEmail); }, [defaultEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canStart = months >= 2 && weekday !== null && emailOk && !!address.trim() && !busy;

  const start = async () => {
    if (weekday === null) { toast.error("Pick a delivery day."); return; }
    if (months < 2) { toast.error("A subscription is at least 2 months (2 boxes)."); return; }
    if (!emailOk) { toast.error("Enter a valid email so we can send your confirmation."); return; }
    if (!address.trim()) { toast.error("Enter a delivery address."); return; }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("start_subscription", {
        p_customer_email: email.trim(),
        p_months: months,
        p_delivery_weekday: weekday,
        p_customer_name: name.trim() || null,
        p_customer_phone: phone.trim() || null,
        p_delivery_address: address.trim() || null,
        p_delivery_city: city.trim() || null,
        p_delivery_state: stateName.trim() || "Lagos",
      });
      if (error) { toast.error(`Could not start your subscription: ${error.message || "unknown error"}`); return; }
      if (!data?.success) { toast.error(data?.error || "Could not start your subscription."); return; }
      const startedObj: Started = {
        subscription_id: data.subscription_id,
        months: data.months ?? months,
        delivery_day: data.delivery_day || "",
        first_delivery: data.first_delivery || "",
        email: email.trim(),
        boxes: (data.boxes || []) as StartedBox[],
      };
      // Pre-load the item from the product page into Box 1, then reveal the boxes.
      if (preloadBrandId && startedObj.boxes[0]) {
        try {
          const { error: addErr } = await (supabase as any).rpc("add_item_to_subscription_box", {
            p_box_id: startedObj.boxes[0].box_id, p_brand_id: preloadBrandId, p_quantity: 1,
          });
          if (addErr) toast.error(`Couldn't pre-fill Box 1: ${addErr.message || "please add it manually"}`);
          else toast.success("Added your item to Box 1 — keep filling until every box clears the minimum.");
        } catch (e: any) { toast.error(`Couldn't pre-fill Box 1: ${e?.message || "add it manually"}`); }
      }
      onStarted(startedObj);
    } catch (e: any) {
      toast.error(`Could not start your subscription: ${e?.message || "unexpected error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* STEP 1 — months */}
      <section className="bg-card border border-border rounded-card p-4 md:p-5">
        <StepHead n={1} title="How many months?" />
        <p className="text-sm text-text-med mb-3">
          You commit to a box a month. <span className="font-semibold text-foreground">{months} months = {months} boxes</span>, one per month. Minimum 2.
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMonths(m => Math.max(2, m - 1))} disabled={months <= 2}
            aria-label="Fewer months" className="w-11 h-11 rounded-full border border-input inline-flex items-center justify-center disabled:opacity-40">
            <Minus className="w-4 h-4" />
          </button>
          <div className="text-3xl font-bold tabular-nums w-12 text-center">{months}</div>
          <button type="button" onClick={() => setMonths(m => Math.min(12, m + 1))} disabled={months >= 12}
            aria-label="More months" className="w-11 h-11 rounded-full border border-input inline-flex items-center justify-center disabled:opacity-40">
            <Plus className="w-4 h-4" />
          </button>
          <div className="flex flex-wrap gap-1.5 ml-2">
            {[2, 3, 6, 12].map(m => (
              <button key={m} type="button" onClick={() => setMonths(m)}
                className={`rounded-pill px-3 py-1.5 text-xs font-semibold border ${months === m ? "border-forest bg-forest/10 text-forest" : "border-border text-text-med"}`}>
                {m} mo
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* STEP 2 — weekday */}
      <section className="bg-card border border-border rounded-card p-4 md:p-5">
        <StepHead n={2} title="Which day do you want your deliveries?" />
        <p className="text-sm text-text-med mb-3">Every box lands on this weekday, 28 days apart.</p>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {BOX_WEEKDAYS.map(d => (
            <button key={d.int} type="button" onClick={() => setWeekday(d.int)}
              className={`rounded-lg px-2 py-2.5 text-sm font-semibold border ${weekday === d.int ? "border-forest bg-forest/10 text-forest" : "border-border text-text-med hover:bg-muted"}`}>
              {d.short}
            </button>
          ))}
        </div>
      </section>

      {/* STEP 2 (cont.) — contact + delivery, needed to create + ship the subscription */}
      <section className="bg-card border border-border rounded-card p-4 md:p-5 space-y-3">
        <StepHead n={3} title="Where should the boxes go?" />
        <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className={inputCls} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name (optional)"><input value={name} onChange={e => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="Phone (optional)"><input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Delivery address"><input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, area" className={inputCls} /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="City / area (optional)"><input value={city} onChange={e => setCity(e.target.value)} className={inputCls} /></Field>
          <Field label="State"><input value={stateName} onChange={e => setStateName(e.target.value)} className={inputCls} /></Field>
        </div>
      </section>

      <div className="flex items-start gap-1.5 text-[12px] text-forest bg-forest/5 border border-forest/20 rounded-lg px-3 py-2">
        <Lock className="w-4 h-4 flex-shrink-0 mt-px" />
        <span>{PRICE_LOCK_LINE} Each box also gets 5% off and free delivery. Every box must reach {fmtN(minBoxValue)} before you can pay.</span>
      </div>

      <button type="button" onClick={start} disabled={!canStart}
        className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating your boxes…</> : <>Create my {months} boxes <ArrowRight className="w-4 h-4" /></>}
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// STEP 3 + 4 — fill boxes, copy, pay
// -------------------------------------------------------------------------
function FillAndPay({
  started, boxes, ready, boxesFetching, onRefresh, onDone, onStartOver,
}: {
  started: Started;
  boxes: BoxRow[];
  ready: ReadyRow | null;
  boxesFetching: boolean;
  onRefresh: () => void;
  onDone: () => void;
  onStartOver: () => void;
}) {
  const [addTarget, setAddTarget] = useState<BoxRow | null>(null);
  const [copyTarget, setCopyTarget] = useState<BoxRow | null>(null);
  const [paying, setPaying] = useState(false);
  const [fatal, setFatal] = useState<{ reference: string; message: string } | null>(null);

  const minBoxValue = ready?.min_box_value ?? 50000;
  const grandTotal = ready?.grand_total ?? boxes.reduce((s, b) => s + Number(b.total || 0), 0);
  const failingByNumber = new Map((ready?.failing_boxes || []).map(f => [f.box_number, f]));

  const pay = async () => {
    if (!ready?.ready || paying) return;
    setPaying(true);
    setFatal(null);
    try {
      const PaystackPop = (await import("@paystack/inline-js")).default;
      const paystackKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
      if (!paystackKey) throw new Error("Payment is not configured (missing Paystack key).");
      const popup = new PaystackPop();
      const reference = `subbox_${started.subscription_id.slice(0, 8)}_${Date.now()}`;
      popup.newTransaction({
        key: paystackKey,
        email: started.email || "",
        amount: Math.max(0, grandTotal) * 100, // kobo; DB-owned grand total
        currency: "NGN",
        ref: reference,
        metadata: { type: "box_subscription", subscription_id: started.subscription_id } as any,
        onSuccess: async (tx: { reference: string }) => {
          try {
            // NO amount is sent — activate-subscription asks Paystack what was
            // actually paid using the secret key.
            const { data, error } = await supabase.functions.invoke("activate-subscription", {
              body: { subscription_id: started.subscription_id, reference: tx.reference },
            });
            let body: any = data;
            if (error) {
              const ctx = (error as any)?.context;
              const status = ctx?.status;
              let parsed: any = null;
              if (ctx && typeof ctx.clone === "function") {
                try { parsed = await ctx.clone().json(); } catch { /* ignore */ }
              }
              if (status === 409 && parsed?.paid_but_not_activated) {
                setFatal({ reference: tx.reference, message: parsed?.error || "Your payment went through but the boxes could not be activated." });
                setPaying(false);
                return;
              }
              toast.error(`Activation failed: ${parsed?.error || error.message || "unknown error"}. Reference: ${tx.reference}`);
              setPaying(false);
              return;
            }
            if (!body?.success) {
              if (body?.paid_but_not_activated) {
                setFatal({ reference: tx.reference, message: body?.error || "Your payment went through but the boxes could not be activated." });
              } else {
                toast.error(`Activation failed: ${body?.error || "unknown error"}. Reference: ${tx.reference}`);
              }
              setPaying(false);
              return;
            }
            toast.success("Subscription active — your boxes are booked.");
            onDone();
          } catch (e: any) {
            toast.error(`Activation failed: ${e?.message || "unexpected error"}. Reference: ${tx.reference}`);
            setPaying(false);
          }
        },
        onCancel: () => setPaying(false),
      } as any);
    } catch (e: any) {
      setPaying(false);
      toast.error(e?.message || "Couldn't open payment. Please try again.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="pf text-xl font-bold">Fill your boxes</h2>
          <p className="text-sm text-text-med">
            {started.months} boxes · deliveries on {started.delivery_day ? started.delivery_day[0].toUpperCase() + started.delivery_day.slice(1) : "your chosen day"} · first on {formatBoxDate(started.first_delivery)}
          </p>
        </div>
        <button type="button" onClick={onStartOver} className="text-xs text-text-med hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Start over
        </button>
      </div>

      <div className="flex items-start gap-1.5 text-[12px] text-forest bg-forest/5 border border-forest/20 rounded-lg px-3 py-2">
        <Lock className="w-4 h-4 flex-shrink-0 mt-px" />
        <span>{PRICE_LOCK_LINE}</span>
      </div>

      {fatal && (
        <div className="rounded-card border-2 border-red-400 bg-red-50 p-4">
          <div className="flex items-start gap-2 text-red-800">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold">Your payment was taken but your boxes are not active.</p>
              <p className="mt-1">{fatal.message}</p>
              <p className="mt-1">Please contact us right away with reference <span className="font-mono font-semibold">{fatal.reference}</span> so we can fix or refund it. Do not pay again.</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {boxes.map(box => {
          const fail = failingByNumber.get(box.box_number);
          const subtotal = Number(box.subtotal || 0);
          const shortBy = fail ? Number(fail.short_by) : Math.max(0, minBoxValue - subtotal);
          const clears = shortBy <= 0;
          const pct = Math.min(100, minBoxValue > 0 ? Math.round((subtotal / minBoxValue) * 100) : 0);
          const otherBoxesWithItems = boxes.filter(b => b.id !== box.id && (b.subscription_box_items?.length || 0) > 0);
          return (
            <section key={box.id} className={`bg-card border rounded-card p-4 ${clears ? "border-forest/40" : "border-border"}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-bold text-sm">Box {box.box_number}</h3>
                  <p className="text-[11px] text-text-med inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {formatBoxDate(box.scheduled_date)}</p>
                </div>
                <span className={`text-[11px] font-semibold inline-flex items-center gap-1 ${clears ? "text-forest" : "text-amber-700"}`}>
                  {clears ? <><Check className="w-3.5 h-3.5" /> Clears {fmtN(minBoxValue)}</> : `${fmtN(shortBy)} to go`}
                </span>
              </div>

              {/* Items */}
              {(box.subscription_box_items?.length || 0) === 0 ? (
                <p className="text-[13px] text-text-light py-2">Empty — add products to reach {fmtN(minBoxValue)}.</p>
              ) : (
                <ul className="divide-y divide-border/60 mb-2">
                  {box.subscription_box_items.map(it => (
                    <li key={it.id} className="flex items-center justify-between py-1.5 text-[13px]">
                      <span className="min-w-0 truncate">{it.quantity}× {it.product_name || "Item"} <span className="text-text-light">· {it.brand_name}</span></span>
                      <span className="font-semibold tabular-nums">{fmtN(it.line_total)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Progress against the DB-owned minimum */}
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${clears ? "bg-forest" : "bg-coral"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[12px]">
                <span className="text-text-med">Subtotal <span className="font-semibold text-foreground tabular-nums">{fmtN(subtotal)}</span></span>
                {Number(box.discount_amount) > 0 && <span className="text-forest font-semibold">−{fmtN(box.discount_amount)} (5% off)</span>}
                <span className="text-forest font-semibold">Free delivery</span>
              </div>
              {!clears && <p className="text-[12px] text-amber-700 mt-1 font-medium">Add {fmtN(shortBy)} more to this box.</p>}

              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={() => setAddTarget(box)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:bg-forest-deep">
                  <Plus className="w-3.5 h-3.5" /> Add products
                </button>
                {otherBoxesWithItems.length > 0 && (
                  <button type="button" onClick={() => setCopyTarget(box)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                    <Copy className="w-3.5 h-3.5" /> Copy another box into this one
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* STEP 4 — pay */}
      <section className="bg-card border border-border rounded-card p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Pay once for all {boxes.length} boxes</h3>
          <span className="text-lg font-bold tabular-nums">{fmtN(grandTotal)}</span>
        </div>
        {!ready?.ready && ready?.message && (
          <div className="flex items-start gap-1.5 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
            <span>{ready.message}</span>
          </div>
        )}
        <button type="button" onClick={pay} disabled={!ready?.ready || paying || boxesFetching}
          className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">
          {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening payment…</> : ready?.ready ? <>Pay {fmtN(grandTotal)} now</> : "Every box must reach the minimum first"}
        </button>
        <p className="text-[11px] text-text-light text-center">One payment. No stored card, no renewals — you're paying for all your boxes up front.</p>
      </section>

      {addTarget && (
        <AddProductsModal
          box={addTarget}
          onClose={() => setAddTarget(null)}
          onAdded={onRefresh}
        />
      )}
      {copyTarget && (
        <CopyBoxModal
          target={copyTarget}
          sources={boxes.filter(b => b.id !== copyTarget.id && (b.subscription_box_items?.length || 0) > 0)}
          onClose={() => setCopyTarget(null)}
          onCopied={onRefresh}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Add-products modal — pick any active in-stock brand into the target box.
// Price is LOCKED server-side by add_item_to_subscription_box.
// -------------------------------------------------------------------------
interface CatalogBrand { brand_id: string; label: string; price: number; image: string | null }

function AddProductsModal({ box, onClose, onAdded }: { box: BoxRow; onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["box-catalog"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brands:brands_public!brands_product_id_fkey(id, brand_name, price, in_stock, image_url, stored_image_url, images, size_variant)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const flat: CatalogBrand[] = [];
      for (const p of (data || []) as any[]) {
        for (const b of (p.brands || [])) {
          if (b.in_stock === false) continue;
          flat.push({
            brand_id: b.id,
            label: `${p.name} · ${b.brand_name}${b.size_variant ? ` (${b.size_variant})` : ""}`,
            price: Number(b.price) || 0,
            image: getBrandImage(b) || b.images?.[0] || null,
          });
        }
      }
      return flat;
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? options.filter(o => o.label.toLowerCase().includes(s)) : options;
    return list.slice(0, 60);
  }, [q, options]);

  const add = async (o: CatalogBrand) => {
    if (addingId) return;
    setAddingId(o.brand_id);
    try {
      const { error } = await (supabase as any).rpc("add_item_to_subscription_box", {
        p_box_id: box.id, p_brand_id: o.brand_id, p_quantity: 1,
      });
      if (error) { toast.error(error.message || "Couldn't add that item."); return; }
      toast.success(`Added to Box ${box.box_number}.`);
      onAdded();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't add that item.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-foreground/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-[560px] rounded-t-2xl md:rounded-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-bold text-sm">Add products to Box {box.box_number}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search products…" className="w-full pl-9 pr-3 py-2.5 border border-input rounded-lg text-sm bg-background" />
          </div>
        </div>
        <div className="overflow-y-auto p-2">
          {isLoading ? (
            <p className="text-sm text-text-light text-center py-8">Loading products…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-text-light text-center py-8">No products match “{q}”.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {filtered.map(o => (
                <li key={o.brand_id} className="flex items-center gap-3 py-2 px-2">
                  <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                    {o.image && <img src={o.image} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <span className="flex-1 min-w-0 text-[13px] truncate">{o.label}</span>
                  <span className="text-[13px] font-semibold tabular-nums">{fmtN(o.price)}</span>
                  <button type="button" onClick={() => add(o)} disabled={addingId === o.brand_id}
                    className="inline-flex items-center gap-1 rounded-lg bg-forest text-primary-foreground px-2.5 py-1.5 text-xs font-semibold hover:bg-forest-deep disabled:opacity-50">
                    {addingId === o.brand_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-3 border-t border-border">
          <button type="button" onClick={onClose} className="w-full rounded-lg border border-border py-2.5 text-sm font-semibold hover:bg-muted">Done</button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Copy-box modal — replicate another box's contents into this one so a mum
// buying the same box for N months builds it once.
// -------------------------------------------------------------------------
function CopyBoxModal({ target, sources, onClose, onCopied }: {
  target: BoxRow; sources: BoxRow[]; onClose: () => void; onCopied: () => void;
}) {
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const copyFrom = async (src: BoxRow) => {
    if (copyingId) return;
    setCopyingId(src.id);
    try {
      let ok = 0;
      for (const it of src.subscription_box_items) {
        const { error } = await (supabase as any).rpc("add_item_to_subscription_box", {
          p_box_id: target.id, p_brand_id: it.brand_id, p_quantity: it.quantity,
        });
        if (error) { toast.error(`Stopped copying: ${error.message || "an item could not be added"}`); break; }
        ok += 1;
      }
      if (ok > 0) { toast.success(`Copied ${ok} item${ok === 1 ? "" : "s"} into Box ${target.box_number}.`); onCopied(); onClose(); }
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-foreground/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-[460px] rounded-t-2xl md:rounded-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-bold text-sm">Copy a box into Box {target.box_number}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 space-y-2">
          <p className="text-[12px] text-text-med px-1">Its items are added on top of anything already in Box {target.box_number}. Prices lock at today's prices.</p>
          {sources.map(src => (
            <button key={src.id} type="button" onClick={() => copyFrom(src)} disabled={!!copyingId}
              className="w-full text-left rounded-lg border border-border p-3 hover:bg-muted disabled:opacity-50">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">Box {src.box_number}</span>
                <span className="text-[12px] text-text-med">{src.subscription_box_items.length} item{src.subscription_box_items.length === 1 ? "" : "s"} · {fmtN(src.subtotal)}</span>
              </div>
              <p className="text-[12px] text-text-light truncate mt-0.5">{src.subscription_box_items.map(i => i.product_name).filter(Boolean).join(", ")}</p>
              {copyingId === src.id && <p className="text-[11px] text-forest mt-1 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Copying…</p>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Small shared bits
// -------------------------------------------------------------------------
const inputCls = "w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none transition-colors min-h-[44px]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-text-med uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function StepHead({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-6 h-6 rounded-full bg-forest text-primary-foreground text-xs font-bold inline-flex items-center justify-center flex-shrink-0">{n}</span>
      <h2 className="font-bold text-base">{title}</h2>
    </div>
  );
}
