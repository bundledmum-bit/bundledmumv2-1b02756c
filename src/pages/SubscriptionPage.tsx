import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Minus, X, Search, Check, Copy, CopyPlus, Loader2, Lock,
  AlertTriangle, CalendarDays, ArrowLeft, ArrowRight, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getBrandImage } from "@/lib/brandImage";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useSubscriptionSettings, fmtN, formatBoxDate } from "@/hooks/useSubscription";
import DeliveryDetailsForm, { type DeliveryDetails } from "@/components/checkout/DeliveryDetailsForm";
import bmLogoCoral from "@/assets/logos/BM-LOGO-CORAL.svg";

// ===========================================================================
// Monthly-BOX subscription builder.  Flow order (exact):
//   STEP 1 MONTHS  → start_subscription(email, months)  [or subscribe_to_product
//                    when arriving from a product page — box 1 pre-filled]
//   STEP 2 BUILD   → fill each box (add/remove/qty, copy-box) until every box
//                    clears the DB minimum
//   STEP 3 DATE    → pick the first delivery date (min today+2); schedule is
//                    first + 28*(n-1)
//   STEP 4 ADDRESS → the shared checkout DeliveryDetailsForm →
//                    finalise_subscription_schedule(date + details)
//   PAY            → Paystack grand_total once → activate-subscription (no amount)
//
// All money (5% off, totals, the 50k floor, grand total) is owned by the DB —
// this page only READS subtotal/discount/total from subscription_boxes.
// ===========================================================================

const ACTIVE_KEY = "bm_active_box_subscription";
const MS_DAY = 86_400_000;

interface StartedBox { box_id: string; box_number: number; scheduled_date: string }
interface Started { subscription_id: string; months: number; email: string; boxes: StartedBox[] }

// Every id we send to the box RPCs must be a real UUID. A stale/corrupt blob in
// sessionStorage with a fragment box_id (e.g. "fb1") would otherwise be passed
// as p_box_id and blow up with `invalid input syntax for type uuid`.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

// A stored subscription is only usable if start_subscription actually returned a
// UUID subscription_id, a month count (>= 2) AND a non-empty boxes array whose
// box_ids are all UUIDs. Anything less (a partial/legacy blob, a half-failed
// start, or leftover test state) must NOT land the user on STEP 2 — it renders
// the empty "0 boxes" screen or sends a truncated id to the RPC.
function isValidStarted(s: any): s is Started {
  return !!s
    && isUuid(s.subscription_id)
    && typeof s.months === "number" && s.months >= 2
    && Array.isArray(s.boxes) && s.boxes.length > 0
    && s.boxes.every((b: any) => b && isUuid(b.box_id));
}

interface BoxItem { id: string; brand_id: string; product_name: string | null; brand_name: string | null; quantity: number; unit_price: number; line_total: number }
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

type Step = "months" | "build" | "date" | "address" | "review";
const PRICE_LOCK_LINE = "The prices you see today are locked in for every box, even if prices rise later.";

export default function SubscriptionPage() {
  const { data: settings } = useSubscriptionSettings();
  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sidParam = searchParams.get("sid");
  const preloadBrandId = searchParams.get("brand_id");
  const preloadQty = Math.max(1, parseInt(searchParams.get("qty") || "1", 10) || 1);

  const [started, setStarted] = useState<Started | null>(() => {
    try {
      const raw = sessionStorage.getItem(ACTIVE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (isValidStarted(parsed)) return parsed;
      if (raw) sessionStorage.removeItem(ACTIVE_KEY); // drop stale/corrupt state
      return null;
    } catch { return null; }
  });
  const [step, setStep] = useState<Step>(started ? "build" : "months");
  const [firstDate, setFirstDate] = useState<string>("");
  // Delivery details she entered in STEP 4, shown back on the review screen.
  const [details, setDetails] = useState<DeliveryDetails | null>(null);

  const persist = (s: Started | null) => {
    setStarted(s);
    try { s ? sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(s)) : sessionStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
  };

  // Resume an existing subscription passed by ?sid= (product-page entry for a
  // logged-in shopper). Load its boxes and land at STEP 2.
  useEffect(() => {
    if (!sidParam || (started && started.subscription_id === sidParam)) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("subscription_boxes")
        .select("id, box_number, scheduled_date")
        .eq("subscription_id", sidParam)
        .order("box_number", { ascending: true });
      if (error || !data?.length) { toast.error("Couldn't load that subscription. Start a new one below."); return; }
      persist({
        subscription_id: sidParam,
        months: data.length,
        email: user?.email || "",
        boxes: data.map((b: any) => ({ box_id: b.id, box_number: b.box_number, scheduled_date: b.scheduled_date })),
      });
      setStep("build");
    })();
  }, [sidParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const subscriptionId = started?.subscription_id || null;

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

  // Never sit on a post-STEP-1 screen without a real subscription (refresh with
  // cleared state, a bad product-page entry, a half-failed start). Send her back
  // to STEP 1 instead of rendering an empty "0 boxes" screen. Skipped while a
  // ?sid= resume is still in flight (that effect persists then sets the step).
  useEffect(() => {
    if (step === "months" || sidParam) return;
    if (!isValidStarted(started)) setStep("months");
  }, [step, started, sidParam]);

  if (!settings) return <div className="min-h-screen flex items-center justify-center text-sm text-text-light">Loading…</div>;
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

  return (
    <div className="min-h-screen bg-[#FFF8F4] pb-24 pt-20 md:pt-24">
      <header className="relative px-4 md:px-8 py-8 text-primary-foreground" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
        <div className="max-w-[820px] mx-auto text-center space-y-2.5">
          <img src={bmLogoCoral} alt="BundledMum" className="h-8 mx-auto" />
          <h1 className="pf text-2xl md:text-3xl font-bold leading-tight">Build your monthly boxes</h1>
          <p className="text-sm text-primary-foreground/85 max-w-xl mx-auto">One box a month, filled your way. Pay once up front — 5% off and free delivery on every box.</p>
          <div className="inline-flex items-start gap-1.5 bg-white/15 rounded-lg px-3 py-2 text-[12px] text-left max-w-md">
            <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{PRICE_LOCK_LINE}</span>
          </div>
        </div>
      </header>

      <main className="max-w-[820px] mx-auto px-4 md:px-8 py-6">
        <StepTrail step={step} />
        {step === "months" ? (
          <MonthsStep
            defaultEmail={user?.email || ""}
            emailLocked={!!user?.email}
            preloadBrandId={preloadBrandId}
            preloadQty={preloadQty}
            existing={started}
            onStarted={(s) => { persist(s); setStep("build"); }}
          />
        ) : !started ? (
          <p className="text-sm text-text-light text-center py-12">Loading your boxes…</p>
        ) : step === "build" ? (
          <BuildStep
            started={started}
            boxes={boxes}
            ready={ready}
            boxesFetching={boxesFetching}
            onRefresh={refresh}
            onBackToMonths={() => setStep("months")}
            onContinue={() => setStep("date")}
          />
        ) : step === "date" ? (
          <DateStep
            months={started.months}
            firstDate={firstDate}
            setFirstDate={setFirstDate}
            onBack={() => setStep("build")}
            onContinue={() => setStep("address")}
          />
        ) : step === "address" ? (
          <AddressStep
            started={started}
            firstDate={firstDate}
            onBack={() => setStep("date")}
            onFinalised={(d) => { setDetails(d); refresh(); setStep("review"); }}
          />
        ) : (
          <ReviewStep
            started={started}
            boxes={boxes}
            ready={ready}
            details={details}
            grandTotal={ready?.grand_total ?? boxes.reduce((s, b) => s + Number(b.total || 0), 0)}
            onBack={() => setStep("address")}
            onDone={() => { persist(null); navigate("/account/subscriptions?new=true"); }}
          />
        )}
      </main>
    </div>
  );
}

// -------------------------------------------------------------------------
function StepTrail({ step }: { step: Step }) {
  const order: Step[] = ["months", "build", "date", "address", "review"];
  const labels: Record<Step, string> = { months: "Months", build: "Build boxes", date: "Delivery date", address: "Delivery details", review: "Review & pay" };
  const idx = order.indexOf(step);
  return (
    <ol className="flex items-center gap-1.5 mb-5 text-[11px] overflow-x-auto">
      {order.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-1 font-semibold ${i === idx ? "bg-forest text-primary-foreground" : i < idx ? "bg-forest/10 text-forest" : "bg-muted text-text-light"}`}>
            {i < idx && <Check className="w-3 h-3" />}{i + 1}. {labels[s]}
          </span>
          {i < order.length - 1 && <span className="text-text-light">›</span>}
        </li>
      ))}
    </ol>
  );
}

// -------------------------------------------------------------------------
// STEP 1 — months (creates the subscription + boxes)
// -------------------------------------------------------------------------
function MonthsStep({
  defaultEmail, emailLocked, preloadBrandId, preloadQty, existing, onStarted,
}: {
  defaultEmail: string;
  emailLocked: boolean;
  preloadBrandId: string | null;
  preloadQty: number;
  existing: Started | null;
  onStarted: (s: Started) => void;
}) {
  const [months, setMonths] = useState(existing?.months ?? 2);
  // When signed in, the subscription MUST be created under the account email —
  // the box-read RLS only returns rows to the authenticated owner, so a
  // different email would leave STEP 2 unable to see its own boxes.
  const [email, setEmail] = useState(emailLocked ? defaultEmail : (existing?.email || defaultEmail));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (emailLocked && defaultEmail) setEmail(defaultEmail); else if (defaultEmail && !email) setEmail(defaultEmail); }, [defaultEmail, emailLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Read the items currently in each box so a month change can replay them into
  // the fresh box set (by box_number) rather than losing them.
  const captureExistingItems = async (subId: string): Promise<Map<number, Array<{ brand_id: string; quantity: number }>>> => {
    const map = new Map<number, Array<{ brand_id: string; quantity: number }>>();
    const { data } = await (supabase as any)
      .from("subscription_boxes")
      .select("box_number, subscription_box_items(brand_id, quantity)")
      .eq("subscription_id", subId);
    for (const b of (data || []) as any[]) {
      map.set(b.box_number, (b.subscription_box_items || []).map((i: any) => ({ brand_id: i.brand_id, quantity: i.quantity })));
    }
    return map;
  };

  const start = async () => {
    if (months < 2) { toast.error("A subscription is at least 2 months (2 boxes)."); return; }
    if (!emailOk) { toast.error("Enter a valid email so we can send your confirmation."); return; }
    setBusy(true);
    try {
      // Changing months on an already-started subscription: re-create the box
      // set and replay existing items by box number.
      const prevItems = existing ? await captureExistingItems(existing.subscription_id) : null;

      let subId: string; let boxes: StartedBox[]; let realMonths = months;
      if (preloadBrandId && !existing) {
        // Product-page entry (logged-out path): create a 2-month draft with the
        // item already in box 1, then honour the chosen month count if > 2.
        const { data, error } = await (supabase as any).rpc("subscribe_to_product", {
          p_customer_email: email.trim(), p_brand_id: preloadBrandId, p_quantity: preloadQty,
        });
        if (error || !data?.success) { toast.error(error?.message || data?.error || "Could not start your subscription."); return; }
        subId = data.subscription_id;
        boxes = (data.boxes || []) as StartedBox[];
        realMonths = data.months ?? 2;
        if (months > realMonths) {
          // Grow to the chosen count via start_subscription, replaying box 1's item.
          const grown = await (supabase as any).rpc("start_subscription", { p_customer_email: email.trim(), p_months: months });
          if (!grown.error && grown.data?.success) {
            const item = (data.boxes?.[0]) ? { brand_id: preloadBrandId, quantity: preloadQty } : null;
            subId = grown.data.subscription_id; boxes = grown.data.boxes; realMonths = grown.data.months ?? months;
            if (item && boxes[0]) await (supabase as any).rpc("add_item_to_subscription_box", { p_box_id: boxes[0].box_id, p_brand_id: item.brand_id, p_quantity: item.quantity });
          }
        }
      } else {
        const { data, error } = await (supabase as any).rpc("start_subscription", { p_customer_email: email.trim(), p_months: months });
        if (error || !data?.success) { toast.error(error?.message || data?.error || "Could not start your subscription."); return; }
        subId = data.subscription_id; boxes = (data.boxes || []) as StartedBox[]; realMonths = data.months ?? months;
        // Replay items from the previous (superseded) draft.
        if (prevItems) {
          for (const box of boxes) {
            for (const it of (prevItems.get(box.box_number) || [])) {
              await (supabase as any).rpc("add_item_to_subscription_box", { p_box_id: box.box_id, p_brand_id: it.brand_id, p_quantity: it.quantity });
            }
          }
          const dropped = Array.from(prevItems.keys()).filter(n => n > realMonths).length;
          if (dropped > 0) toast.message(`Fewer months — the last ${dropped} box${dropped === 1 ? "" : "es"} of items were dropped.`);
        }
      }
      // Never advance to STEP 2 on a malformed success (no id, or no boxes) —
      // that is exactly what produced the empty "0 boxes" screen.
      if (!subId || !Array.isArray(boxes) || boxes.length === 0) {
        toast.error("We couldn't set up your boxes. Please try again.");
        return;
      }
      onStarted({ subscription_id: subId, months: realMonths || boxes.length, email: email.trim(), boxes });
    } catch (e: any) {
      toast.error(`Could not start your subscription: ${e?.message || "unexpected error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="bg-card border border-border rounded-card p-4 md:p-5">
        <StepHead n={1} title="How many months?" />
        <p className="text-sm text-text-med mb-3">You commit to a box a month. <span className="font-semibold text-foreground">{months} months = {months} boxes</span>, one per month. Minimum 2.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={() => setMonths(m => Math.max(2, m - 1))} disabled={months <= 2} aria-label="Fewer months" className="w-11 h-11 rounded-full border border-input inline-flex items-center justify-center disabled:opacity-40"><Minus className="w-4 h-4" /></button>
          <div className="text-3xl font-bold tabular-nums w-12 text-center">{months}</div>
          <button type="button" onClick={() => setMonths(m => Math.min(12, m + 1))} disabled={months >= 12} aria-label="More months" className="w-11 h-11 rounded-full border border-input inline-flex items-center justify-center disabled:opacity-40"><Plus className="w-4 h-4" /></button>
          <div className="flex flex-wrap gap-1.5 ml-1">
            {[2, 3, 6, 12].map(m => (
              <button key={m} type="button" onClick={() => setMonths(m)} className={`rounded-pill px-3 py-1.5 text-xs font-semibold border ${months === m ? "border-forest bg-forest/10 text-forest" : "border-border text-text-med"}`}>{m} mo</button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-card border border-border rounded-card p-4 md:p-5">
        <label className="block">
          <span className="text-xs font-semibold text-text-med uppercase tracking-wide">Email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" readOnly={emailLocked}
            className={`mt-1 w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm font-body outline-none min-h-[44px] ${emailLocked ? "bg-muted/50 text-text-med" : "bg-card focus:border-forest"}`} />
        </label>
        <p className="text-[11px] text-text-light mt-1.5">
          {emailLocked ? "Your boxes are saved to your account so you can manage them anytime." : "We'll email your confirmation here."} You'll add your delivery date and address after building your boxes.
        </p>
      </section>

      <div className="flex items-start gap-1.5 text-[12px] text-forest bg-forest/5 border border-forest/20 rounded-lg px-3 py-2">
        <Lock className="w-4 h-4 flex-shrink-0 mt-px" />
        <span>{PRICE_LOCK_LINE} Each box gets 5% off and free delivery, and must reach ₦50,000 before you can pay.</span>
      </div>

      <button type="button" onClick={start} disabled={busy || months < 2 || !emailOk}
        className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up your boxes…</> : <>{existing ? "Update" : "Build"} my {months} boxes <ArrowRight className="w-4 h-4" /></>}
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// STEP 2 — build the boxes
// -------------------------------------------------------------------------
function BuildStep({
  started, boxes, ready, boxesFetching, onRefresh, onBackToMonths, onContinue,
}: {
  started: Started;
  boxes: BoxRow[];
  ready: ReadyRow | null;
  boxesFetching: boolean;
  onRefresh: () => void;
  onBackToMonths: () => void;
  onContinue: () => void;
}) {
  const [addTarget, setAddTarget] = useState<BoxRow | null>(null);
  const [copyTarget, setCopyTarget] = useState<BoxRow | null>(null);
  const [dupBusy, setDupBusy] = useState(false);

  const minBoxValue = ready?.min_box_value ?? 50000;
  const failingByNumber = new Map((ready?.failing_boxes || []).map(f => [f.box_number, f]));

  // Source of truth for WHICH boxes exist = started.boxes (returned by
  // start_subscription). Live item/total data is merged in from the
  // subscription_boxes query by box_id when it has loaded; until then (or if the
  // read is empty) each box still renders with its date + an empty picker, so
  // STEP 2 is never a blank "0 boxes" screen.
  const displayBoxes: BoxRow[] = useMemo(() => {
    const live = new Map(boxes.map(b => [b.id, b]));
    return [...started.boxes]
      .sort((a, b) => a.box_number - b.box_number)
      .map(sb => live.get(sb.box_id) ?? {
        id: sb.box_id, box_number: sb.box_number, scheduled_date: sb.scheduled_date,
        status: "draft", subtotal: 0, discount_amount: 0, total: 0, subscription_box_items: [],
      });
  }, [started.boxes, boxes]);

  const boxCount = started.months || displayBoxes.length;
  const box1 = displayBoxes.find(b => b.box_number === 1) || null;

  // Copy Box 1 into every other box.
  const duplicateBox1 = async () => {
    if (!box1 || dupBusy) return;
    if (!box1.subscription_box_items?.length) { toast.error("Add items to Box 1 first."); return; }
    setDupBusy(true);
    try {
      let count = 0;
      for (const box of displayBoxes) {
        if (box.id === box1.id) continue;
        for (const it of box1.subscription_box_items) {
          const { error } = await (supabase as any).rpc("add_item_to_subscription_box", { p_box_id: box.id, p_brand_id: it.brand_id, p_quantity: it.quantity });
          if (error) { toast.error(`Stopped: ${error.message || "an item couldn't be added"}`); setDupBusy(false); onRefresh(); return; }
          count += 1;
        }
      }
      toast.success(`Copied Box 1 into ${displayBoxes.length - 1} other box${displayBoxes.length - 1 === 1 ? "" : "es"}. Add any unique items next.`);
      onRefresh();
    } finally {
      setDupBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="pf text-xl font-bold">Fill your {boxCount} boxes</h2>
          <p className="text-sm text-text-med">Each box is filled its own way and must reach {fmtN(minBoxValue)}.</p>
        </div>
        <button type="button" onClick={onBackToMonths} className="text-xs text-text-med hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Change months</button>
      </div>

      <div className="flex items-start gap-1.5 text-[12px] text-forest bg-forest/5 border border-forest/20 rounded-lg px-3 py-2">
        <Lock className="w-4 h-4 flex-shrink-0 mt-px" /><span>{PRICE_LOCK_LINE}</span>
      </div>

      {box1 && (box1.subscription_box_items?.length || 0) > 0 && displayBoxes.length > 1 && (
        <button type="button" onClick={duplicateBox1} disabled={dupBusy}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-forest bg-forest/5 text-forest px-4 py-2.5 text-sm font-semibold hover:bg-forest/10 disabled:opacity-50">
          {dupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CopyPlus className="w-4 h-4" />} Copy Box 1 into every other box
        </button>
      )}

      <div className="space-y-4">
        {displayBoxes.map(box => {
          const fail = failingByNumber.get(box.box_number);
          const subtotal = Number(box.subtotal || 0);
          const shortBy = fail ? Number(fail.short_by) : Math.max(0, minBoxValue - subtotal);
          const clears = shortBy <= 0 && (box.subscription_box_items?.length || 0) > 0;
          const pct = Math.min(100, minBoxValue > 0 ? Math.round((subtotal / minBoxValue) * 100) : 0);
          const otherFilled = displayBoxes.filter(b => b.id !== box.id && (b.subscription_box_items?.length || 0) > 0);
          return (
            <section key={box.id} className={`bg-card border rounded-card p-4 ${clears ? "border-forest/40" : "border-border"}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-bold text-sm">Box {box.box_number}</h3>
                  <p className="text-[11px] text-text-med inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {formatBoxDate(box.scheduled_date)} <span className="text-text-light">(provisional)</span></p>
                </div>
                <span className={`text-[11px] font-semibold inline-flex items-center gap-1 ${clears ? "text-forest" : "text-amber-700"}`}>
                  {clears ? <><Check className="w-3.5 h-3.5" /> Clears {fmtN(minBoxValue)}</> : `${fmtN(shortBy)} to go`}
                </span>
              </div>

              {(box.subscription_box_items?.length || 0) === 0 ? (
                <p className="text-[13px] text-text-light py-2">Empty — add products to reach {fmtN(minBoxValue)}.</p>
              ) : (
                <ul className="divide-y divide-border/60 mb-2">
                  {box.subscription_box_items.map(it => (
                    <BoxItemRow key={it.id} item={it} onChanged={onRefresh} />
                  ))}
                </ul>
              )}

              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${clears ? "bg-forest" : "bg-coral"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[12px] flex-wrap gap-x-3">
                <span className="text-text-med">Subtotal <span className="font-semibold text-foreground tabular-nums">{fmtN(subtotal)}</span></span>
                <span className="text-text-med">Box total <span className="font-semibold text-foreground tabular-nums">{fmtN(box.total)}</span></span>
              </div>
              {/* Value line — reads discount_amount from subscription_boxes (never
                  computed here). Shown on every box; names the saving when set. */}
              <p className="mt-1.5 text-[12px] text-forest font-semibold inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Free delivery and 5% off this box{Number(box.discount_amount) > 0 ? ` — you save ${fmtN(box.discount_amount)}` : ""}.
              </p>
              {!clears && <p className="text-[12px] text-amber-700 mt-1 font-medium">Add {fmtN(shortBy)} more to this box.</p>}

              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={() => setAddTarget(box)} className="inline-flex items-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:bg-forest-deep"><Plus className="w-3.5 h-3.5" /> Add products</button>
                {otherFilled.length > 0 && (
                  <button type="button" onClick={() => setCopyTarget(box)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Copy className="w-3.5 h-3.5" /> Copy another box in</button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Continue is gated on the DB: every box must clear the minimum. */}
      <section className="bg-card border border-border rounded-card p-4 space-y-3">
        {!ready?.ready && ready?.message && (
          <div className="flex items-start gap-1.5 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" /><span>{ready.message}</span>
          </div>
        )}
        <button type="button" onClick={onContinue} disabled={!ready?.ready || boxesFetching}
          className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">
          {ready?.ready ? <>Continue to delivery date <ArrowRight className="w-4 h-4" /></> : "Every box must reach the minimum first"}
        </button>
      </section>

      {addTarget && <AddProductsModal box={addTarget} onClose={() => setAddTarget(null)} onAdded={onRefresh} />}
      {copyTarget && <CopyBoxModal target={copyTarget} sources={displayBoxes.filter(b => b.id !== copyTarget.id && (b.subscription_box_items?.length || 0) > 0)} onClose={() => setCopyTarget(null)} onCopied={onRefresh} />}
    </div>
  );
}

// Item row with editable qty + remove (direct subscription_box_items ops).
function BoxItemRow({ item, onChanged }: { item: BoxItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  const setQty = async (next: number) => {
    if (busy) return;
    if (next < 1) { await remove(); return; }
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("subscription_box_items").update({ quantity: next }).eq("id", item.id);
      if (error) { toast.error(error.message || "Couldn't update quantity."); return; }
      onChanged();
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("subscription_box_items").delete().eq("id", item.id);
      if (error) { toast.error(error.message || "Couldn't remove item."); return; }
      onChanged();
    } finally { setBusy(false); }
  };

  return (
    <li className="flex items-center gap-2 py-1.5 text-[13px]">
      <span className="min-w-0 flex-1 truncate">{item.product_name || "Item"} <span className="text-text-light">· {item.brand_name}</span><br /><span className="text-[11px] text-text-light">{fmtN(item.unit_price)} each · price locked</span></span>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button type="button" onClick={() => setQty(item.quantity - 1)} disabled={busy} aria-label="Decrease" className="w-7 h-7 rounded-full border border-input inline-flex items-center justify-center disabled:opacity-40"><Minus className="w-3 h-3" /></button>
        <span className="w-6 text-center tabular-nums font-semibold">{item.quantity}</span>
        <button type="button" onClick={() => setQty(item.quantity + 1)} disabled={busy} aria-label="Increase" className="w-7 h-7 rounded-full border border-input inline-flex items-center justify-center disabled:opacity-40"><Plus className="w-3 h-3" /></button>
      </div>
      <span className="w-20 text-right font-semibold tabular-nums flex-shrink-0">{fmtN(item.line_total)}</span>
      <button type="button" onClick={remove} disabled={busy} aria-label="Remove item" className="w-7 h-7 rounded-full hover:bg-muted inline-flex items-center justify-center flex-shrink-0 text-text-light hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
    </li>
  );
}

// -------------------------------------------------------------------------
// STEP 3 — first delivery date
// -------------------------------------------------------------------------
function DateStep({
  months, firstDate, setFirstDate, onBack, onContinue,
}: {
  months: number;
  firstDate: string;
  setFirstDate: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  // Minimum selectable date = today + 2 days (matches the RPC's rule).
  const minDate = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setTime(d.getTime() + 2 * MS_DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const valid = !!firstDate && firstDate >= minDate;
  const schedule = useMemo(() => {
    if (!valid) return [];
    const [y, m, d] = firstDate.split("-").map(Number);
    const base = new Date(y, (m || 1) - 1, d || 1);
    return Array.from({ length: months }, (_, i) => {
      const dt = new Date(base); dt.setDate(dt.getDate() + 28 * i);
      return { n: i + 1, date: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}` };
    });
  }, [firstDate, months, valid]);

  return (
    <div className="space-y-5">
      <section className="bg-card border border-border rounded-card p-4 md:p-5 space-y-3">
        <StepHead n={3} title="When should your first box arrive?" />
        <label className="block">
          <span className="text-xs font-semibold text-text-med uppercase tracking-wide">First delivery date</span>
          <input type="date" value={firstDate} min={minDate} onChange={e => setFirstDate(e.target.value)}
            className="mt-1 w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none min-h-[44px]" />
        </label>
        <p className="text-[12px] text-text-med">Earliest is {formatBoxDate(minDate)} — deliveries need at least 2 days' notice. Every other box follows every 4 weeks on the same weekday.</p>
      </section>

      {schedule.length > 0 && (
        <section className="bg-card border border-border rounded-card p-4">
          <h3 className="font-bold text-sm mb-2">Your delivery schedule</h3>
          <ul className="space-y-1.5">
            {schedule.map(s => (
              <li key={s.n} className="flex items-center justify-between text-[13px]">
                <span className="text-text-med">Box {s.n}</span>
                <span className="font-semibold inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-forest" /> {formatBoxDate(s.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="rounded-pill border border-border px-4 min-h-[52px] text-sm font-semibold hover:bg-muted inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
        <button type="button" onClick={onContinue} disabled={!valid}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">
          Continue to delivery details <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// STEP 4 — delivery details (shared checkout form) → finalise
// -------------------------------------------------------------------------
function AddressStep({
  started, firstDate, onBack, onFinalised,
}: {
  started: Started;
  firstDate: string;
  onBack: () => void;
  onFinalised: (details: DeliveryDetails) => void;
}) {
  const [busy, setBusy] = useState(false);

  const submit = async (d: DeliveryDetails) => {
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("finalise_subscription_schedule", {
        p_subscription_id: started.subscription_id,
        p_first_delivery_date: firstDate,
        p_customer_name: `${d.firstName} ${d.lastName}`.trim(),
        p_customer_phone: d.phone,
        p_delivery_address: d.address,
        p_delivery_city: d.city,
        p_delivery_state: d.state || "Lagos",
      });
      if (error || !data?.success) { toast.error(error?.message || data?.error || "Couldn't save your delivery details. Check the date and address."); return; }
      toast.success("Delivery details saved.");
      onFinalised(d);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save your delivery details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-card border border-border rounded-card p-4 md:p-5">
        <StepHead n={4} title="Where should the boxes go?" />
        <DeliveryDetailsForm defaultEmail={started.email} submitting={busy} submitLabel="Save & continue to payment" onSubmit={submit} />
      </section>
      <button type="button" onClick={onBack} className="text-xs text-text-med hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back to delivery date</button>
    </div>
  );
}

// -------------------------------------------------------------------------
// STEP 5 — REVIEW & CONFIRM (the ONLY screen with the pay button)
// She sees the full breakdown FIRST; Paystack does not open until she confirms.
// -------------------------------------------------------------------------
function ReviewStep({
  started, boxes, ready, details, grandTotal, onBack, onDone,
}: {
  started: Started;
  boxes: BoxRow[];
  ready: ReadyRow | null;
  details: DeliveryDetails | null;
  grandTotal: number;
  onBack: () => void;
  onDone: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const [fatal, setFatal] = useState<{ reference: string; message: string } | null>(null);

  const pay = async () => {
    if (paying) return;
    if (!ready?.ready) { toast.error(ready?.message || "Every box must reach the minimum before you can pay."); return; }
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
            // NO amount — activate-subscription asks Paystack what was paid.
            const { data, error } = await supabase.functions.invoke("activate-subscription", {
              body: { subscription_id: started.subscription_id, reference: tx.reference },
            });
            if (error) {
              const ctx = (error as any)?.context;
              let parsed: any = null;
              if (ctx && typeof ctx.clone === "function") { try { parsed = await ctx.clone().json(); } catch { /* ignore */ } }
              if (ctx?.status === 409 && parsed?.paid_but_not_activated) { setFatal({ reference: tx.reference, message: parsed?.error || "Your payment went through but the boxes could not be activated." }); setPaying(false); return; }
              toast.error(`Activation failed: ${parsed?.error || error.message || "unknown error"}. Reference: ${tx.reference}`); setPaying(false); return;
            }
            if (!(data as any)?.success) {
              if ((data as any)?.paid_but_not_activated) setFatal({ reference: tx.reference, message: (data as any)?.error || "Your payment went through but the boxes could not be activated." });
              else toast.error(`Activation failed: ${(data as any)?.error || "unknown error"}. Reference: ${tx.reference}`);
              setPaying(false); return;
            }
            toast.success("Subscription active — your boxes are booked.");
            onDone();
          } catch (e: any) {
            toast.error(`Activation failed: ${e?.message || "unexpected error"}. Reference: ${tx.reference}`); setPaying(false);
          }
        },
        onCancel: () => setPaying(false),
      } as any);
    } catch (e: any) {
      setPaying(false);
      toast.error(e?.message || "Couldn't open payment. Please try again.");
    }
  };

  const addressLine = details
    ? [details.address, details.city, details.state].filter(Boolean).join(", ")
    : "";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="pf text-xl font-bold">Review &amp; confirm</h2>
        <p className="text-sm text-text-med">Check everything below. You'll only be charged after you press Pay.</p>
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

      {/* Every box, in full: date, items (name/qty/unit price), subtotal, 5%
          saving, box total. All figures read from the DB. */}
      <div className="space-y-3">
        {boxes.map(box => (
          <section key={box.id} className="bg-card border border-border rounded-card p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-bold text-sm">Box {box.box_number}</h3>
              <span className="text-[12px] text-text-med inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-forest" /> {formatBoxDate(box.scheduled_date)}</span>
            </div>
            <ul className="divide-y divide-border/60 mb-2">
              {box.subscription_box_items.map(it => (
                <li key={it.id} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">{it.quantity}× {it.product_name || "Item"} <span className="text-text-light">· {it.brand_name}</span><br /><span className="text-[11px] text-text-light">{fmtN(it.unit_price)} each</span></span>
                  <span className="font-semibold tabular-nums">{fmtN(it.line_total)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-border pt-2 space-y-0.5 text-[13px]">
              <div className="flex items-center justify-between"><span className="text-text-med">Subtotal</span><span className="tabular-nums">{fmtN(box.subtotal)}</span></div>
              <div className="flex items-center justify-between text-forest"><span>5% saving</span><span className="tabular-nums">−{fmtN(box.discount_amount)}</span></div>
              <div className="flex items-center justify-between text-forest"><span>Delivery</span><span>Free</span></div>
              <div className="flex items-center justify-between font-bold"><span>Box total</span><span className="tabular-nums">{fmtN(box.total)}</span></div>
            </div>
          </section>
        ))}
      </div>

      {/* Delivery address she just entered. */}
      {details && (
        <section className="bg-card border border-border rounded-card p-4 text-[13px]">
          <h3 className="font-bold text-sm mb-1">Delivering to</h3>
          <p className="text-foreground">{`${details.firstName} ${details.lastName}`.trim()}</p>
          <p className="text-text-med">{addressLine}</p>
          <p className="text-text-med">{details.phone}{details.email ? ` · ${details.email}` : ""}</p>
          {details.notes && <p className="text-text-light mt-1">Note: {details.notes}</p>}
        </section>
      )}

      {/* Grand total + the plain-language statement + the ONLY pay button. */}
      <section className="bg-card border-2 border-forest/40 rounded-card p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold">Grand total</span>
          <span className="text-2xl font-bold tabular-nums text-forest">{fmtN(grandTotal)}</span>
        </div>
        <div className="flex items-start gap-1.5 text-[13px] text-forest bg-forest/5 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 flex-shrink-0 mt-px" />
          <span>You are paying once, today, for all {boxes.length} boxes. Delivery is free. These prices are locked in for every box.</span>
        </div>
        {!ready?.ready && ready?.message && (
          <div className="flex items-start gap-1.5 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" /><span>{ready.message}</span></div>
        )}
        <button type="button" onClick={pay} disabled={!ready?.ready || paying}
          className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">
          {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening payment…</> : <>Pay {fmtN(grandTotal)} now</>}
        </button>
        <p className="text-[11px] text-text-light text-center">No stored card, no renewals — one payment for all your boxes.</p>
      </section>

      <button type="button" onClick={onBack} className="text-xs text-text-med hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back to delivery details</button>
    </div>
  );
}

// -------------------------------------------------------------------------
// Add-products modal
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
          flat.push({ brand_id: b.id, label: `${p.name} · ${b.brand_name}${b.size_variant ? ` (${b.size_variant})` : ""}`, price: Number(b.price) || 0, image: getBrandImage(b) || b.images?.[0] || null });
        }
      }
      return flat;
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? options.filter(o => o.label.toLowerCase().includes(s)) : options).slice(0, 60);
  }, [q, options]);

  const add = async (o: CatalogBrand) => {
    if (addingId) return;
    // Never send a non-UUID id to the RPC (guards against stale/corrupt state).
    if (!isUuid(box.id) || !isUuid(o.brand_id)) { toast.error("This subscription is out of date. Please start again."); return; }
    setAddingId(o.brand_id);
    try {
      const { error } = await (supabase as any).rpc("add_item_to_subscription_box", { p_box_id: box.id, p_brand_id: o.brand_id, p_quantity: 1 });
      if (error) { toast.error(error.message || "Couldn't add that item."); return; }
      toast.success(`Added to Box ${box.box_number}.`);
      onAdded();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't add that item.");
    } finally { setAddingId(null); }
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
                  <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex-shrink-0">{o.image && <img src={o.image} alt="" className="w-full h-full object-cover" />}</div>
                  <span className="flex-1 min-w-0 text-[13px] truncate">{o.label}</span>
                  <span className="text-[13px] font-semibold tabular-nums">{fmtN(o.price)}</span>
                  <button type="button" onClick={() => add(o)} disabled={addingId === o.brand_id} className="inline-flex items-center gap-1 rounded-lg bg-forest text-primary-foreground px-2.5 py-1.5 text-xs font-semibold hover:bg-forest-deep disabled:opacity-50">
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

// Per-pair copy: replicate a source box's contents into the target box.
function CopyBoxModal({ target, sources, onClose, onCopied }: { target: BoxRow; sources: BoxRow[]; onClose: () => void; onCopied: () => void }) {
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const copyFrom = async (src: BoxRow) => {
    if (copyingId) return;
    setCopyingId(src.id);
    try {
      let ok = 0;
      for (const it of src.subscription_box_items) {
        const { error } = await (supabase as any).rpc("add_item_to_subscription_box", { p_box_id: target.id, p_brand_id: it.brand_id, p_quantity: it.quantity });
        if (error) { toast.error(`Stopped copying: ${error.message || "an item could not be added"}`); break; }
        ok += 1;
      }
      if (ok > 0) { toast.success(`Copied ${ok} item${ok === 1 ? "" : "s"} into Box ${target.box_number}.`); onCopied(); onClose(); }
    } finally { setCopyingId(null); }
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
            <button key={src.id} type="button" onClick={() => copyFrom(src)} disabled={!!copyingId} className="w-full text-left rounded-lg border border-border p-3 hover:bg-muted disabled:opacity-50">
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
function StepHead({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-6 h-6 rounded-full bg-forest text-primary-foreground text-xs font-bold inline-flex items-center justify-center flex-shrink-0">{n}</span>
      <h2 className="font-bold text-base">{title}</h2>
    </div>
  );
}
