import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Minus, X, Search, Check, CopyPlus, Loader2, Lock,
  AlertTriangle, CalendarDays, ArrowLeft, ArrowRight, ZoomIn, Package,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getBrandImage } from "@/lib/brandImage";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useSubscriptionSettings, fmtN, formatBoxDate } from "@/hooks/useSubscription";
import DeliveryDetailsForm, { type DeliveryDetails } from "@/components/checkout/DeliveryDetailsForm";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import {
  startSubscription, getDraft, addItem, setItemQty, duplicateBox, finalise, readiness,
  MIN_BOX_VALUE, type Draft, type DraftBox, type GuestCtx,
} from "@/lib/boxSubscription";
import bmLogoCoral from "@/assets/logos/BM-LOGO-CORAL.svg";

// ===========================================================================
// Monthly-BOX builder. Works for GUESTS (no account) via token RPCs and for
// signed-in customers via the owner RPCs — the src/lib/boxSubscription layer
// hides the difference. Flow: months → build (visual boxes + shop picker) →
// date → delivery details → review → pay → activate-subscription (no amount).
// ===========================================================================

const ACTIVE_KEY = "bm_active_box_subscription";
const MS_DAY = 86_400_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const PRICE_LOCK_LINE = "The prices you see today are locked in for every box, even if prices rise later.";

// site_settings values are jsonb strings; tolerate a double-encoded value.
const coerceSetting = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") {
    if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) { try { return JSON.parse(v); } catch { return v; } }
    return v;
  }
  return String(v);
};

interface Started { subscription_id: string; months: number; guest_token: string | null; email: string }
function isValidStarted(s: any): s is Started {
  return !!s && isUuid(s.subscription_id) && typeof s.months === "number" && s.months >= 2
    && (s.guest_token === null || isUuid(s.guest_token));
}

type Step = "months" | "build" | "date" | "address" | "review";

export default function SubscriptionPage() {
  const { data: settings } = useSubscriptionSettings();
  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preloadBrandId = searchParams.get("brand_id");
  const preloadQty = Math.max(1, parseInt(searchParams.get("qty") || "1", 10) || 1);

  const [started, setStarted] = useState<Started | null>(() => {
    try {
      const raw = sessionStorage.getItem(ACTIVE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (isValidStarted(parsed)) return parsed;
      if (raw) sessionStorage.removeItem(ACTIVE_KEY);
      return null;
    } catch { return null; }
  });
  const [step, setStep] = useState<Step>(started ? "build" : "months");
  const [firstDate, setFirstDate] = useState("");
  const [details, setDetails] = useState<DeliveryDetails | null>(null);

  const persist = (s: Started | null) => {
    setStarted(s);
    try { s ? sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(s)) : sessionStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
  };

  const guest: GuestCtx = { guestToken: started?.guest_token ?? null };
  const subscriptionId = started?.subscription_id || null;

  const { data: draft, refetch: refetchDraft, isFetching } = useQuery({
    queryKey: ["box-draft", subscriptionId, started?.guest_token],
    enabled: !!subscriptionId,
    queryFn: () => getDraft(subscriptionId as string, started?.guest_token ?? null),
  });

  const ready = useMemo(() => readiness(draft?.boxes || []), [draft]);
  const refresh = () => { refetchDraft(); };

  useEffect(() => {
    if (step === "months") return;
    if (!isValidStarted(started)) setStep("months");
  }, [step, started]);

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
        <div className="max-w-[860px] mx-auto text-center space-y-2.5">
          <img src={bmLogoCoral} alt="BundledMum" className="h-8 mx-auto" />
          <h1 className="pf text-2xl md:text-3xl font-bold leading-tight">Build your monthly boxes</h1>
          <p className="text-sm text-primary-foreground/85 max-w-xl mx-auto">One box a month, filled your way. Pay once up front — 5% off and free delivery on every box. No account needed.</p>
          <div className="inline-flex items-start gap-1.5 bg-white/15 rounded-lg px-3 py-2 text-[12px] text-left max-w-md">
            <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{PRICE_LOCK_LINE}</span>
          </div>
        </div>
      </header>

      <main className="max-w-[860px] mx-auto px-4 md:px-8 py-6">
        <StepTrail step={step} />
        {step === "months" ? (
          <MonthsStep
            defaultEmail={user?.email || ""}
            isGuest={!user}
            preloadBrandId={preloadBrandId}
            preloadQty={preloadQty}
            existing={started}
            onStarted={(s) => { persist(s); setStep("build"); }}
          />
        ) : !started || !draft ? (
          <p className="text-sm text-text-light text-center py-12">Loading your boxes…</p>
        ) : step === "build" ? (
          <BuildStep
            guest={guest} draft={draft} ready={ready} isFetching={isFetching}
            onRefresh={refresh}
            onBackToMonths={() => setStep("months")}
            onContinue={() => setStep("date")}
          />
        ) : step === "date" ? (
          <DateStep months={draft.months} firstDate={firstDate} setFirstDate={setFirstDate} onBack={() => setStep("build")} onContinue={() => setStep("address")} />
        ) : step === "address" ? (
          <AddressStep
            guest={guest} started={started} firstDate={firstDate}
            onBack={() => setStep("date")}
            onFinalised={(d) => { setDetails(d); refresh(); setStep("review"); }}
          />
        ) : (
          <ReviewStep
            started={started} draft={draft} ready={ready} details={details}
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
// STEP 1 — months (creates the draft; guest or signed-in)
// -------------------------------------------------------------------------
function MonthsStep({
  defaultEmail, isGuest, preloadBrandId, preloadQty, existing, onStarted,
}: {
  defaultEmail: string; isGuest: boolean;
  preloadBrandId: string | null; preloadQty: number;
  existing: Started | null; onStarted: (s: Started) => void;
}) {
  const [months, setMonths] = useState(existing?.months ?? 2);
  const [email, setEmail] = useState(!isGuest ? defaultEmail : (existing?.email || ""));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!isGuest && defaultEmail) setEmail(defaultEmail); }, [defaultEmail, isGuest]);

  // Guests don't need an email yet (captured at delivery details). Signed-in
  // users are pinned to their account email so their reads/writes are theirs.
  const emailOk = isGuest || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const start = async () => {
    if (months < 2) { toast.error("A subscription is at least 2 months (2 boxes)."); return; }
    if (!emailOk) { toast.error("Enter a valid email."); return; }
    setBusy(true);
    try {
      const res = await startSubscription({ guest: isGuest, email: email.trim(), months });
      if (!isUuid(res.subscription_id) || res.boxes.length === 0) { toast.error("We couldn't set up your boxes. Please try again."); return; }
      const g: GuestCtx = { guestToken: res.guest_token };
      // Pre-load a product into Box 1 when arriving from a product page.
      if (preloadBrandId && isUuid(preloadBrandId) && res.boxes[0]) {
        try { await addItem(g, res.boxes[0].box_id, preloadBrandId, preloadQty); toast.success("Added your item to Box 1."); }
        catch (e: any) { toast.error(`Couldn't pre-fill Box 1: ${e?.message || "add it manually"}`); }
      }
      onStarted({ subscription_id: res.subscription_id, months: res.months || res.boxes.length, guest_token: res.guest_token, email: email.trim() });
    } catch (e: any) {
      toast.error(e?.message || "Could not start your subscription.");
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
            {[2, 3, 6, 12].map(m => <button key={m} type="button" onClick={() => setMonths(m)} className={`rounded-pill px-3 py-1.5 text-xs font-semibold border ${months === m ? "border-forest bg-forest/10 text-forest" : "border-border text-text-med"}`}>{m} mo</button>)}
          </div>
        </div>
      </section>

      {!isGuest && (
        <section className="bg-card border border-border rounded-card p-4 md:p-5">
          <label className="block">
            <span className="text-xs font-semibold text-text-med uppercase tracking-wide">Email</span>
            <input type="email" value={email} readOnly className="mt-1 w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-muted/50 text-text-med font-body outline-none min-h-[44px]" />
          </label>
          <p className="text-[11px] text-text-light mt-1.5">Your boxes are saved to your account. You'll add the delivery date and address after building.</p>
        </section>
      )}

      <div className="flex items-start gap-1.5 text-[12px] text-forest bg-forest/5 border border-forest/20 rounded-lg px-3 py-2">
        <Lock className="w-4 h-4 flex-shrink-0 mt-px" />
        <span>{PRICE_LOCK_LINE} Each box gets 5% off and free delivery, and must reach {fmtN(MIN_BOX_VALUE)} before you can pay.{isGuest ? " No account needed — we'll set one up after payment." : ""}</span>
      </div>

      <button type="button" onClick={start} disabled={busy || months < 2 || !emailOk}
        className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up your boxes…</> : <>Build my {months} boxes <ArrowRight className="w-4 h-4" /></>}
      </button>
    </div>
  );
}

// -------------------------------------------------------------------------
// STEP 2 — visual boxes + shop-style picker
// -------------------------------------------------------------------------
function BuildStep({
  guest, draft, ready, isFetching, onRefresh, onBackToMonths, onContinue,
}: {
  guest: GuestCtx; draft: Draft; ready: ReturnType<typeof readiness>; isFetching: boolean;
  onRefresh: () => void; onBackToMonths: () => void; onContinue: () => void;
}) {
  const [openBoxId, setOpenBoxId] = useState<string | null>(null);
  const [pickerBoxId, setPickerBoxId] = useState<string | null>(null);
  const { data: siteSettings } = useSiteSettings();
  const boxImageUrl = coerceSetting(siteSettings?.["subscription_box_image_url"]).trim();
  const boxes = draft.boxes;
  const failingByNumber = new Map(ready.failing.map(f => [f.box_number, f]));
  // Keep opened/picker box in sync with refreshed draft data.
  const liveOpenBox = openBoxId ? (boxes.find(b => b.box_id === openBoxId) || null) : null;
  const livePickerBox = pickerBoxId ? (boxes.find(b => b.box_id === pickerBoxId) || null) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="pf text-xl font-bold">Fill your {draft.months} boxes</h2>
          <p className="text-sm text-text-med">Tap a box to fill it. Each must reach {fmtN(MIN_BOX_VALUE)}.</p>
        </div>
        <button type="button" onClick={onBackToMonths} className="text-xs text-text-med hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Change months</button>
      </div>

      <div className="flex items-start gap-1.5 text-[12px] text-forest bg-forest/5 border border-forest/20 rounded-lg px-3 py-2">
        <Lock className="w-4 h-4 flex-shrink-0 mt-px" /><span>{PRICE_LOCK_LINE}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {boxes.map(box => {
          const fail = failingByNumber.get(box.box_number);
          const shortBy = fail ? fail.short_by : Math.max(0, MIN_BOX_VALUE - box.subtotal);
          const clears = shortBy <= 0 && box.items.length > 0;
          const pct = Math.min(100, Math.round((box.subtotal / MIN_BOX_VALUE) * 100));
          const itemCount = box.items.reduce((s, i) => s + i.quantity, 0);

          // EMPTY box — no box image; invite her to fill it. The button opens the
          // shop picker directly for this box.
          if (box.items.length === 0) {
            return (
              <div key={box.box_id} className="bg-card border-2 border-dashed border-border rounded-card p-4 flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-bold text-sm">Box {box.box_number}</h3>
                  <span className="rounded-pill bg-muted text-text-med text-[10px] font-bold px-2 py-0.5">Empty</span>
                </div>
                <p className="text-[11px] text-text-med inline-flex items-center gap-1 mb-2"><CalendarDays className="w-3 h-3" /> {formatBoxDate(box.scheduled_date)}</p>
                <p className="text-[13px] text-text-light flex-1">This box is empty. Add products to reach {fmtN(MIN_BOX_VALUE)}.</p>
                <button type="button" onClick={() => setPickerBoxId(box.box_id)}
                  className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-forest text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-forest-deep">
                  <Plus className="w-4 h-4" /> Add items to this box
                </button>
              </div>
            );
          }

          // FILLED box — show the branded box image; tapping opens its contents.
          return (
            <button key={box.box_id} type="button" onClick={() => setOpenBoxId(box.box_id)}
              className={`text-left bg-card border rounded-card overflow-hidden hover:shadow-card transition-shadow ${clears ? "border-forest/50" : "border-border"}`}>
              <div className="relative aspect-[16/10] bg-warm-cream">
                {boxImageUrl ? (
                  <img src={boxImageUrl} alt={`Box ${box.box_number}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-forest/10"><Package className="w-10 h-10 text-forest/50" /></div>
                )}
                <span className="absolute top-2 left-2 rounded-pill bg-white/90 backdrop-blur-sm text-[11px] font-bold px-2 py-0.5">Box {box.box_number}</span>
                <span className={`absolute top-2 right-2 rounded-pill text-[10px] font-bold px-2 py-0.5 ${clears ? "bg-forest text-white" : "bg-coral text-white"}`}>{clears ? "Ready ✓" : `${fmtN(shortBy)} to go`}</span>
              </div>
              <div className="p-3 space-y-1.5">
                <p className="text-[11px] text-text-med inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {formatBoxDate(box.scheduled_date)}</p>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full ${clears ? "bg-forest" : "bg-coral"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-text-med">{itemCount} item{itemCount === 1 ? "" : "s"} · <span className="font-semibold text-foreground tabular-nums">{fmtN(box.subtotal)}</span></span>
                  <span className="text-forest font-semibold">Open →</span>
                </div>
                <p className="text-[11px] text-forest font-semibold inline-flex items-center gap-1"><Check className="w-3 h-3" /> Free delivery and 5% off this box{box.discount_amount > 0 ? ` — save ${fmtN(box.discount_amount)}` : ""}.</p>
              </div>
            </button>
          );
        })}
      </div>

      <section className="bg-card border border-border rounded-card p-4 space-y-3">
        {!ready.ready && (
          <div className="flex items-start gap-1.5 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
            <span>Every box must reach {fmtN(MIN_BOX_VALUE)} before you can pay.{ready.failing.length ? ` Short: ${ready.failing.map(f => `Box ${f.box_number} (${fmtN(f.short_by)})`).join(", ")}.` : ""}</span>
          </div>
        )}
        <button type="button" onClick={onContinue} disabled={!ready.ready || isFetching}
          className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">
          {ready.ready ? <>Continue to delivery date <ArrowRight className="w-4 h-4" /></> : "Every box must reach the minimum first"}
        </button>
      </section>

      {liveOpenBox && (
        <BoxDetailModal guest={guest} draft={draft} box={liveOpenBox} onClose={() => setOpenBoxId(null)} onRefresh={onRefresh} />
      )}
      {/* Shop picker opened directly from an EMPTY box's "Add items" button. */}
      {livePickerBox && (
        <ShopPickerModal guest={guest} box={livePickerBox} onClose={() => setPickerBoxId(null)} onRefresh={onRefresh} />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Box detail — items with steppers/remove, "Add products", duplicate
// -------------------------------------------------------------------------
function BoxDetailModal({ guest, draft, box, onClose, onRefresh }: {
  guest: GuestCtx; draft: Draft; box: DraftBox; onClose: () => void; onRefresh: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dupBusy, setDupBusy] = useState(false);
  const shortBy = Math.max(0, MIN_BOX_VALUE - box.subtotal);
  const clears = shortBy <= 0 && box.items.length > 0;

  const duplicate = async () => {
    if (dupBusy) return;
    if (!box.items.length) { toast.error("Add items to this box first."); return; }
    setDupBusy(true);
    try { await duplicateBox(guest, draft, box.box_id); toast.success("Copied into every other box. You can still customise each one."); onRefresh(); }
    catch (e: any) { toast.error(e?.message || "Couldn't copy the box."); }
    finally { setDupBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-foreground/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-[560px] rounded-t-2xl md:rounded-xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="font-bold text-sm">Box {box.box_number}</h3>
            <p className="text-[11px] text-text-med inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {formatBoxDate(box.scheduled_date)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted inline-flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto p-4 space-y-3 flex-1">
          <div className={`rounded-lg px-3 py-2 text-[12px] font-semibold flex items-center justify-between ${clears ? "bg-forest/10 text-forest" : "bg-amber-50 text-amber-800"}`}>
            <span>{clears ? "This box is ready ✓" : `Add ${fmtN(shortBy)} more`}</span>
            <span className="tabular-nums">{fmtN(box.subtotal)} / {fmtN(MIN_BOX_VALUE)}</span>
          </div>
          <p className="text-[11px] text-forest font-semibold inline-flex items-center gap-1"><Check className="w-3 h-3" /> Free delivery and 5% off this box{box.discount_amount > 0 ? ` — you save ${fmtN(box.discount_amount)}` : ""}.</p>

          {box.items.length === 0 ? (
            <p className="text-[13px] text-text-light py-4 text-center">This box is empty. Add products to reach {fmtN(MIN_BOX_VALUE)}.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {box.items.map(it => <ItemRow key={it.item_id} guest={guest} item={it} onRefresh={onRefresh} />)}
            </ul>
          )}
        </div>

        <div className="p-3 border-t border-border space-y-2">
          <button type="button" onClick={() => setPickerOpen(true)} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-forest-deep"><Plus className="w-4 h-4" /> Add products</button>
          {box.items.length > 0 && draft.boxes.length > 1 && (
            <button type="button" onClick={duplicate} disabled={dupBusy} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-forest text-forest px-4 py-2.5 text-sm font-semibold hover:bg-forest/5 disabled:opacity-50">
              {dupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CopyPlus className="w-4 h-4" />} Use this box for every month
            </button>
          )}
          <button type="button" onClick={onClose} className="w-full rounded-lg border border-border py-2 text-sm font-semibold hover:bg-muted">Done</button>
        </div>
      </div>

      {pickerOpen && <ShopPickerModal guest={guest} box={box} onClose={() => setPickerOpen(false)} onRefresh={onRefresh} />}
    </div>
  );
}

function ItemRow({ guest, item, onRefresh }: { guest: GuestCtx; item: DraftBox["items"][number]; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const change = async (qty: number) => {
    if (busy) return;
    setBusy(true);
    try { await setItemQty(guest, item.item_id, qty); onRefresh(); }
    catch (e: any) { toast.error(e?.message || "Couldn't update the item."); }
    finally { setBusy(false); }
  };
  return (
    <li className="flex items-center gap-2 py-2 text-[13px]">
      <span className="min-w-0 flex-1 truncate">{item.product_name || "Item"} <span className="text-text-light">· {item.brand_name}</span><br /><span className="text-[11px] text-text-light">{fmtN(item.unit_price)} each · price locked</span></span>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button type="button" onClick={() => change(item.quantity - 1)} disabled={busy} aria-label="Decrease" className="w-7 h-7 rounded-full border border-input inline-flex items-center justify-center disabled:opacity-40"><Minus className="w-3 h-3" /></button>
        <span className="w-6 text-center tabular-nums font-semibold">{item.quantity}</span>
        <button type="button" onClick={() => change(item.quantity + 1)} disabled={busy} aria-label="Increase" className="w-7 h-7 rounded-full border border-input inline-flex items-center justify-center disabled:opacity-40"><Plus className="w-3 h-3" /></button>
      </div>
      <span className="w-20 text-right font-semibold tabular-nums flex-shrink-0">{fmtN(item.line_total)}</span>
      <button type="button" onClick={() => change(0)} disabled={busy} aria-label="Remove item" className="w-7 h-7 rounded-full hover:bg-muted inline-flex items-center justify-center flex-shrink-0 text-text-light hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
    </li>
  );
}

// -------------------------------------------------------------------------
// Shop-style picker (like /shop) with deals-page zoom. No route to the PDP.
// -------------------------------------------------------------------------
interface CatalogBrand { brand_id: string; product_name: string; brand_name: string; price: number; image: string | null; description: string | null; size_variant: string | null }

function ShopPickerModal({ guest, box, onClose, onRefresh }: { guest: GuestCtx; box: DraftBox; onClose: () => void; onRefresh: () => void }) {
  const [q, setQ] = useState("");
  const [zoom, setZoom] = useState<CatalogBrand | null>(null);

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["box-catalog"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brands:brands_public!brands_product_id_fkey(id, brand_name, price, in_stock, image_url, stored_image_url, images, size_variant, description)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const flat: CatalogBrand[] = [];
      for (const p of (data || []) as any[]) {
        for (const b of (p.brands || [])) {
          if (b.in_stock === false) continue;
          flat.push({ brand_id: b.id, product_name: p.name, brand_name: b.brand_name, price: Number(b.price) || 0, image: getBrandImage(b) || b.images?.[0] || null, description: b.description || null, size_variant: b.size_variant || null });
        }
      }
      return flat;
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? options.filter(o => `${o.product_name} ${o.brand_name}`.toLowerCase().includes(s)) : options).slice(0, 120);
  }, [q, options]);

  // Current quantity + item_id of each brand in THIS box (from the live draft).
  const inBox = useMemo(() => new Map(box.items.map(i => [i.brand_id, i])), [box.items]);

  return (
    <div className="fixed inset-0 z-[300] bg-foreground/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-[720px] rounded-t-2xl md:rounded-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
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
        <div className="overflow-y-auto p-3">
          {isLoading ? (
            <p className="text-sm text-text-light text-center py-10">Loading products…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-text-light text-center py-10">No products match “{q}”.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map(o => (
                <PickerCard key={o.brand_id} guest={guest} boxId={box.box_id} option={o} existing={inBox.get(o.brand_id)} onZoom={() => setZoom(o)} onRefresh={onRefresh} />
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-border">
          <button type="button" onClick={onClose} className="w-full rounded-lg bg-forest text-primary-foreground py-2.5 text-sm font-semibold hover:bg-forest-deep">Done</button>
        </div>
      </div>

      {zoom && <ZoomModal guest={guest} boxId={box.box_id} option={zoom} existing={inBox.get(zoom.brand_id)} onClose={() => setZoom(null)} onRefresh={onRefresh} />}
    </div>
  );
}

// A shop card. CTA is "Add to box"; after the first add it becomes a stepper
// reflecting the quantity of that brand IN THIS BOX (from the live draft).
function PickerCard({ guest, boxId, option, existing, onZoom, onRefresh }: {
  guest: GuestCtx; boxId: string; option: CatalogBrand; existing?: DraftBox["items"][number]; onZoom: () => void; onRefresh: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-border bg-card overflow-hidden flex flex-col">
      <button type="button" onClick={onZoom} aria-label="Zoom product" className="aspect-square bg-warm-cream relative overflow-hidden w-full group">
        {option.image ? <img src={option.image} alt={option.product_name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">📦</div>}
        <span className="absolute bottom-2 right-2 bg-white/85 backdrop-blur-sm rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><ZoomIn className="w-3 h-3 text-foreground" /></span>
      </button>
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        <p className="font-semibold text-xs text-foreground line-clamp-2 leading-snug">{option.product_name}</p>
        <span className="text-coral text-[11px] font-semibold -mt-0.5 truncate">{option.brand_name}{option.size_variant ? ` · ${option.size_variant}` : ""}</span>
        <span className="font-mono-price text-coral font-bold text-sm">{fmtN(option.price)}</span>
        <div className="mt-auto pt-1">
          <AddToBox guest={guest} boxId={boxId} brandId={option.brand_id} existing={existing} onRefresh={onRefresh} />
        </div>
      </div>
    </div>
  );
}

// "Add to box" ↔ +/- stepper. Drives guest_add_item / guest_set_item_quantity
// (or the signed-in equivalents) via the data layer. Reads its qty from the
// live draft item so the state is always the backend's.
function AddToBox({ guest, boxId, brandId, existing, onRefresh }: {
  guest: GuestCtx; boxId: string; brandId: string; existing?: DraftBox["items"][number]; onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (busy) return; setBusy(true);
    try { await addItem(guest, boxId, brandId, 1); onRefresh(); }
    catch (e: any) { toast.error(e?.message || "Couldn't add that item."); }
    finally { setBusy(false); }
  };
  const setQty = async (qty: number) => {
    if (busy || !existing) return; setBusy(true);
    try { await setItemQty(guest, existing.item_id, qty); onRefresh(); }
    catch (e: any) { toast.error(e?.message || "Couldn't update the item."); }
    finally { setBusy(false); }
  };
  if (!existing) {
    return (
      <button type="button" onClick={add} disabled={busy} className="w-full inline-flex items-center justify-center gap-1.5 rounded-pill bg-coral text-white text-xs font-semibold py-2 hover:bg-coral-dark min-h-[36px] disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add to box
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-pill bg-forest/10 px-1 min-h-[36px]">
      <button type="button" onClick={() => setQty(existing.quantity - 1)} disabled={busy} aria-label="Decrease" className="w-7 h-7 rounded-full bg-card border border-input inline-flex items-center justify-center disabled:opacity-40"><Minus className="w-3 h-3" /></button>
      <span className="text-xs font-bold tabular-nums text-forest">{busy ? "…" : existing.quantity}</span>
      <button type="button" onClick={() => setQty(existing.quantity + 1)} disabled={busy} aria-label="Increase" className="w-7 h-7 rounded-full bg-card border border-input inline-flex items-center justify-center disabled:opacity-40"><Plus className="w-3 h-3" /></button>
    </div>
  );
}

// Deals-page style zoom lightbox — bigger image + more info + Add-to-box.
// Deliberately NO link to the product detail page.
function ZoomModal({ guest, boxId, option, existing, onClose, onRefresh }: {
  guest: GuestCtx; boxId: string; option: CatalogBrand; existing?: DraftBox["items"][number]; onClose: () => void; onRefresh: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-midnight/80 animate-fade-in" onClick={onClose}>
      <div className="relative bg-card rounded-[20px] overflow-hidden shadow-2xl max-w-[400px] w-full" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 bg-card/90 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center shadow"><X className="w-4 h-4 text-foreground" /></button>
        <div className="aspect-square bg-warm-cream overflow-hidden">
          {option.image ? <img src={option.image} alt={option.product_name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-7xl">📦</div>}
        </div>
        <div className="p-4">
          <p className="font-semibold text-sm text-foreground leading-snug">{option.product_name}</p>
          <p className="text-coral text-xs font-semibold mb-1">{option.brand_name}{option.size_variant ? ` · ${option.size_variant}` : ""}</p>
          <div className="flex items-baseline gap-2 mb-2"><span className="font-mono-price text-coral font-bold text-lg">{fmtN(option.price)}</span></div>
          {option.description && <p className="text-[12px] text-text-med mb-3 line-clamp-4">{option.description}</p>}
          <AddToBox guest={guest} boxId={boxId} brandId={option.brand_id} existing={existing} onRefresh={onRefresh} />
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// STEP 3 — first delivery date
// -------------------------------------------------------------------------
function DateStep({ months, firstDate, setFirstDate, onBack, onContinue }: {
  months: number; firstDate: string; setFirstDate: (v: string) => void; onBack: () => void; onContinue: () => void;
}) {
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
          <input type="date" value={firstDate} min={minDate} onChange={e => setFirstDate(e.target.value)} className="mt-1 w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none min-h-[44px]" />
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
        <button type="button" onClick={onContinue} disabled={!valid} className="flex-1 inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">Continue to delivery details <ArrowRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// STEP 4 — delivery details → finalise (captures the real email for guests)
// -------------------------------------------------------------------------
function AddressStep({ guest, started, firstDate, onBack, onFinalised }: {
  guest: GuestCtx; started: Started; firstDate: string; onBack: () => void; onFinalised: (d: DeliveryDetails) => void;
}) {
  const [busy, setBusy] = useState(false);
  const submit = async (d: DeliveryDetails) => {
    setBusy(true);
    try {
      await finalise(guest, started.subscription_id, { date: firstDate, name: `${d.firstName} ${d.lastName}`.trim(), phone: d.phone, email: d.email, address: d.address, city: d.city, state: d.state || "Lagos" });
      toast.success("Delivery details saved.");
      onFinalised(d);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save your delivery details. Check the date and address.");
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <section className="bg-card border border-border rounded-card p-4 md:p-5">
        <StepHead n={4} title="Where should the boxes go?" />
        <DeliveryDetailsForm defaultEmail={started.email} submitting={busy} submitLabel="Save & review order" onSubmit={submit} />
      </section>
      <button type="button" onClick={onBack} className="text-xs text-text-med hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back to delivery date</button>
    </div>
  );
}

// -------------------------------------------------------------------------
// STEP 5 — REVIEW & CONFIRM (the ONLY screen with the pay button)
// -------------------------------------------------------------------------
function ReviewStep({ started, draft, ready, details, onBack, onDone }: {
  started: Started; draft: Draft; ready: ReturnType<typeof readiness>; details: DeliveryDetails | null; onBack: () => void; onDone: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const [fatal, setFatal] = useState<{ reference: string; message: string } | null>(null);
  const grandTotal = ready.grand_total;
  const addressLine = details ? [details.address, details.city, details.state].filter(Boolean).join(", ") : "";
  const payEmail = details?.email || started.email;

  const pay = async () => {
    if (paying) return;
    if (!ready.ready) { toast.error("Every box must reach the minimum before you can pay."); return; }
    setPaying(true); setFatal(null);
    try {
      const PaystackPop = (await import("@paystack/inline-js")).default;
      const paystackKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
      if (!paystackKey) throw new Error("Payment is not configured (missing Paystack key).");
      const popup = new PaystackPop();
      const reference = `subbox_${started.subscription_id.slice(0, 8)}_${Date.now()}`;
      popup.newTransaction({
        key: paystackKey, email: payEmail || "", amount: Math.max(0, grandTotal) * 100, currency: "NGN", ref: reference,
        metadata: { type: "box_subscription", subscription_id: started.subscription_id } as any,
        onSuccess: async (tx: { reference: string }) => {
          try {
            // NO amount — activate-subscription asks Paystack what was paid.
            const { data, error } = await supabase.functions.invoke("activate-subscription", { body: { subscription_id: started.subscription_id, reference: tx.reference } });
            if (error) {
              const ctx = (error as any)?.context; let parsed: any = null;
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
          } catch (e: any) { toast.error(`Activation failed: ${e?.message || "unexpected error"}. Reference: ${tx.reference}`); setPaying(false); }
        },
        onCancel: () => setPaying(false),
      } as any);
    } catch (e: any) { setPaying(false); toast.error(e?.message || "Couldn't open payment. Please try again."); }
  };

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

      <div className="space-y-3">
        {draft.boxes.map(box => (
          <section key={box.box_id} className="bg-card border border-border rounded-card p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-bold text-sm">Box {box.box_number}</h3>
              <span className="text-[12px] text-text-med inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-forest" /> {formatBoxDate(box.scheduled_date)}</span>
            </div>
            <ul className="divide-y divide-border/60 mb-2">
              {box.items.map(it => (
                <li key={it.item_id} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
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

      {details && (
        <section className="bg-card border border-border rounded-card p-4 text-[13px]">
          <h3 className="font-bold text-sm mb-1">Delivering to</h3>
          <p className="text-foreground">{`${details.firstName} ${details.lastName}`.trim()}</p>
          <p className="text-text-med">{addressLine}</p>
          <p className="text-text-med">{details.phone}{details.email ? ` · ${details.email}` : ""}</p>
          {details.notes && <p className="text-text-light mt-1">Note: {details.notes}</p>}
        </section>
      )}

      <section className="bg-card border-2 border-forest/40 rounded-card p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold">Grand total</span>
          <span className="text-2xl font-bold tabular-nums text-forest">{fmtN(grandTotal)}</span>
        </div>
        <div className="flex items-start gap-1.5 text-[13px] text-forest bg-forest/5 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 flex-shrink-0 mt-px" />
          <span>You are paying once, today, for all {draft.boxes.length} boxes. Delivery is free. These prices are locked in for every box.</span>
        </div>
        {!ready.ready && (
          <div className="flex items-start gap-1.5 text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" /><span>Every box must reach {fmtN(MIN_BOX_VALUE)} first.</span></div>
        )}
        <button type="button" onClick={pay} disabled={!ready.ready || paying} className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed">
          {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening payment…</> : <>Pay {fmtN(grandTotal)} now</>}
        </button>
        <p className="text-[11px] text-text-light text-center inline-flex items-center gap-1 justify-center w-full"><Package className="w-3 h-3" /> No stored card, no renewals — one payment for all your boxes. We'll set up your account after payment.</p>
      </section>

      <button type="button" onClick={onBack} className="text-xs text-text-med hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Back to delivery details</button>
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
