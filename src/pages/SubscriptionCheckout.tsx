import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Loader2, Minus, Plus, ArrowLeft, Repeat, ShieldCheck, Calendar, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import {
  readDraft, clearDraft, removeFromDraft, writeDraft, fmtN,
  DELIVERY_COUNT_LIMITS, FREQUENCY_LABEL,
  WEEKDAY_LABEL, nextDeliveryDate, projectCycleEnd,
  RESULT_KEY, type Frequency, type SubscriptionDraft,
} from "@/hooks/useSubscription";
import { track as pixelTrack, moneyPayload as pixelMoney } from "@/lib/metaPixel";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

interface ContactForm {
  full_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
}

export default function SubscriptionCheckout() {
  const navigate = useNavigate();
  const { user } = useCustomerAuth();

  // Load draft exactly once on mount; if it's missing, send the user
  // back to build their box first.
  const [draft, setDraft] = useState<SubscriptionDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const d = readDraft();
    setDraft(d);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated && (!draft || draft.items.length === 0)) {
      navigate("/subscriptions", { replace: true });
    }
  }, [hydrated, draft, navigate]);

  // Remove a line item from the draft (pre-payment — sessionStorage only).
  // Re-read the draft so the summary + totals re-render; the effect above
  // handles the empty-basket redirect back to /subscriptions.
  const handleRemoveItem = (productId: string, brandId: string) => {
    removeFromDraft(productId, brandId);
    setDraft(readDraft());
  };

  // Adjust a line item's quantity (+1 / -1). Dropping to 0 removes the line.
  // Recompute totals and re-read so the summary re-renders; empty → redirect.
  const handleQuantityChange = (productId: string, brandId: string, delta: number) => {
    const existing = readDraft();
    if (!existing) return;
    const idx = existing.items.findIndex(i => i.product_id === productId && i.brand_id === brandId);
    if (idx < 0) return;
    const newQty = existing.items[idx].quantity + delta;
    if (newQty <= 0) {
      removeFromDraft(productId, brandId);
    } else {
      existing.items[idx].quantity = newQty;
      const subtotal = existing.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
      existing.subtotal_per_delivery = subtotal;
      existing.total_per_delivery = Math.round(subtotal * (1 - existing.discount_pct / 100));
      writeDraft(existing);
    }
    const updated = readDraft();
    if (!updated || updated.items.length === 0) navigate("/subscriptions");
    else setDraft(updated);
  };

  // Meta Pixel InitiateCheckout + Schedule once the draft loads.
  useEffect(() => {
    if (!hydrated || !draft || draft.items.length === 0) return;
    try {
      const k = "bm_meta_sub_initiate_fired";
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch { /* ignore */ }
    pixelTrack("InitiateCheckout", pixelMoney(draft.total_per_delivery, {
      num_items: draft.items.reduce((s, i) => s + i.quantity, 0),
      content_ids: draft.items.map(i => i.product_id),
      content_type: "subscription",
    }));
    pixelTrack("Schedule", {
      delivery_day: draft.delivery_day,
      frequency: draft.frequency,
    });
  }, [hydrated, draft?.items.length]);

  // Deliverable states for the dropdown. The column is `name` (not
  // `state_name`); order by display_order then name for a stable list.
  const { data: states = [] } = useQuery({
    queryKey: ["deliverable-states"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("deliverable_states")
        .select("name, display_order, is_active")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) return [];
      return (data || []) as Array<{ name: string; display_order: number; is_active: boolean }>;
    },
    staleTime: 5 * 60_000,
  });

  // Delivery count state, clamped by frequency.
  const [count, setCount] = useState(4);
  const safeFrequency: Frequency = draft?.frequency && draft.frequency in DELIVERY_COUNT_LIMITS
    ? (draft.frequency as Frequency)
    : "monthly";
  const limits = DELIVERY_COUNT_LIMITS[safeFrequency];
  useEffect(() => {
    if (!draft) return;
    const lim = DELIVERY_COUNT_LIMITS[safeFrequency];
    setCount(c => Math.min(lim.max, Math.max(lim.min, c || lim.min)));
  }, [draft, safeFrequency]);

  const [form, setForm] = useState<ContactForm>({
    full_name: "", email: "", phone: "",
    address: "", city: "", state: "",
  });
  const [processing, setProcessing] = useState(false);

  // Pre-fill contact + delivery from customer_account_view when signed in.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("customer_account_view")
        .select("full_name, phone, delivery_address, delivery_area, delivery_state")
        .maybeSingle();
      if (cancelled || !data) return;
      setForm(prev => ({
        full_name: prev.full_name || data.full_name || "",
        email:     prev.email     || user.email || "",
        phone:     prev.phone     || data.phone || "",
        address:   prev.address   || data.delivery_address || "",
        city:      prev.city      || data.delivery_area || "",
        state:     prev.state     || data.delivery_state || prev.state,
      }));
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Dates — first delivery = next occurrence of draft.delivery_day after today,
  // first cycle end = first delivery + frequency_days × (count − 1).
  const safeDeliveryDay = draft?.delivery_day || "monday";

  const firstDelivery = useMemo(() => {
    if (!draft) return null;
    return nextDeliveryDate(safeDeliveryDay);
  }, [draft, safeDeliveryDay]);
  const cycleEnd = useMemo(() => {
    if (!firstDelivery || !draft) return null;
    return projectCycleEnd(firstDelivery, safeFrequency, count);
  }, [firstDelivery, draft, safeFrequency, count]);

  const fmtLongDate = (d: Date | null) => d
    ? d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  const firstPayment = (draft?.total_per_delivery ?? 0) * count;

  if (!hydrated || !draft) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-text-light">Loading…</div>;
  }

  const canPay =
    !!form.full_name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    !!form.phone.trim() && !!form.address.trim() && !!form.city.trim() && !!form.state.trim() &&
    !processing;

  const pay = async () => {
    if (!canPay) { toast.error("Please complete all contact and delivery fields."); return; }

    setProcessing(true);
    try {
      const PaystackPop = (await import("@paystack/inline-js")).default;
      const popup = new PaystackPop();
      const paystackKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
      if (!paystackKey) {
        throw new Error("Paystack public key is not configured. Set VITE_PAYSTACK_PUBLIC_KEY in your environment variables.");
      }
      const reference = `sub_${Date.now()}`;
      const amountKobo = Math.max(0, firstPayment) * 100;

      pixelTrack("AddPaymentInfo", pixelMoney(firstPayment, { content_type: "subscription" }));

      popup.newTransaction({
        key: paystackKey,
        email: form.email.trim(),
        amount: amountKobo,
        currency: "NGN",
        ref: reference,
        firstname: form.full_name.split(" ")[0] || form.full_name,
        lastname: form.full_name.split(" ").slice(1).join(" "),
        phone: form.phone.trim(),
        channels: ["card"],
        metadata: { type: "subscription" } as any,
        onSuccess: async (tx: { reference: string; status: string }) => {
          try {
            const { data, error } = await supabase.functions.invoke("create-subscription", {
              body: {
                reference: tx.reference,
                items: draft.items,
                frequency: safeFrequency,
                delivery_day: safeDeliveryDay,
                number_of_deliveries: count,
                customer_name: form.full_name.trim(),
                customer_phone: form.phone.trim(),
                delivery_address: form.address.trim(),
                delivery_city: form.city.trim(),
                delivery_state: form.state.trim(),
              },
            });

            if (error || !(data as any)?.success) {
              toast.error("Subscription setup failed. Please contact us on WhatsApp with reference: " + tx.reference);
              setProcessing(false);
              return;
            }

            sessionStorage.setItem(RESULT_KEY, JSON.stringify({
              ...(data as any),
              items: draft.items,
              cycle_size: count,
              total_per_delivery: draft.total_per_delivery,
              total_paid: firstPayment,
              first_delivery_date: firstDelivery?.toISOString().slice(0, 10) ?? null,
              last_delivery_date: cycleEnd?.toISOString().slice(0, 10) ?? null,
              customer_email: form.email.trim(),
            }));
            clearDraft();
            navigate("/subscriptions/thank-you");
          } catch (e: any) {
            toast.error(e?.message || "Subscription setup failed.");
            setProcessing(false);
          }
        },
        onCancel: () => { setProcessing(false); },
      } as any);
    } catch (e: any) {
      setProcessing(false);
      toast.error(e?.message || "Couldn't open payment. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8F4] pt-20 md:pt-24 pb-24">
      <div className="max-w-[720px] mx-auto px-4 py-4 space-y-4">
        <header className="flex items-center gap-2">
          <Link to="/subscriptions" className="w-9 h-9 rounded-full hover:bg-muted inline-flex items-center justify-center" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Link>
          <div>
            <h1 className="pf text-xl font-bold">Confirm &amp; pay</h1>
            <p className="text-[11px] text-text-light">{FREQUENCY_LABEL[safeFrequency]} · {WEEKDAY_LABEL[safeDeliveryDay] || safeDeliveryDay}</p>
          </div>
        </header>

        {/* Order summary */}
        <section className="bg-card border border-border rounded-card p-4 space-y-2">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med">Order summary · per delivery</h2>
          <ul className="divide-y divide-border/40">
            {draft.items.map((it, i) => (
              <li key={i} className="py-2 flex items-center gap-3">
                {it.image_url && <img src={it.image_url} alt={it.product_name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{it.product_name}</div>
                  <div className="text-[11px] text-text-light">{it.brand_name} · {fmtN(it.unit_price)} each</div>
                  {it.delivery_day && <div className="text-[11px] text-forest font-medium">Delivers {WEEKDAY_LABEL[it.delivery_day] || it.delivery_day}</div>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(it.product_id, it.brand_id, -1)}
                      className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-sm hover:bg-muted transition-colors"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-sm font-medium w-4 text-center tabular-nums">{it.quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(it.product_id, it.brand_id, 1)}
                      className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-sm hover:bg-muted transition-colors"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="text-xs font-semibold tabular-nums">{fmtN(it.unit_price * it.quantity)}</div>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(it.product_id, it.brand_id)}
                  aria-label={`Remove ${it.product_name}`}
                  className="text-text-light hover:text-coral p-1 -mr-1 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
          <dl className="text-xs space-y-0.5 pt-1">
            <Row label="Subtotal" v={fmtN(draft.subtotal_per_delivery)} />
            {draft.discount_pct > 0 && (
              <Row muted label={`Discount (${draft.discount_pct}%)`} v={`−${fmtN(draft.subtotal_per_delivery - draft.total_per_delivery)}`} />
            )}
            <Row label="Delivery" v={<span className="text-emerald-700">FREE</span>} />
            <div className="flex items-center justify-between pt-1 border-t border-border/60">
              <span className="text-xs uppercase tracking-widest font-semibold text-text-med">Total per delivery</span>
              <span className="font-bold tabular-nums">{fmtN(draft.total_per_delivery)}</span>
            </div>
          </dl>
        </section>

        {/* Subscribe to more products */}
        <section className="bg-card border border-border rounded-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-bold text-sm flex items-center gap-1.5"><Plus className="w-4 h-4 text-forest" /> Subscribe to more products</h2>
              <p className="text-[11px] text-text-light mt-0.5">Browse everything you can subscribe to and add another from its product page.</p>
            </div>
            <Link
              to="/subscriptions"
              className="inline-flex items-center justify-center rounded-pill border border-forest text-forest px-4 min-h-9 text-xs font-semibold hover:bg-forest/10 whitespace-nowrap flex-shrink-0"
            >
              Browse
            </Link>
          </div>
        </section>

        {/* Delivery count */}
        <section className="bg-card border border-border rounded-card p-4 space-y-3">
          <div>
            <h2 className="font-bold text-sm flex items-center gap-1.5"><Calendar className="w-4 h-4 text-forest" /> How many deliveries per cycle?</h2>
            <p className="text-[11px] text-text-light mt-0.5">Your subscription renews automatically after each cycle completes. Minimum {limits.min} deliveries per cycle.</p>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setCount(c => Math.max(limits.min, c - 1))} disabled={count <= limits.min} className="w-10 h-10 rounded-full border border-input inline-flex items-center justify-center disabled:opacity-40"><Minus className="w-4 h-4" /></button>
            <div className="text-3xl font-black tabular-nums w-16 text-center">{count}</div>
            <button onClick={() => setCount(c => Math.min(limits.max, c + 1))} disabled={count >= limits.max} className="w-10 h-10 rounded-full border border-input inline-flex items-center justify-center disabled:opacity-40"><Plus className="w-4 h-4" /></button>
          </div>
          <p className="text-[10px] text-text-light text-center">Min {limits.min} · Max {limits.max} for {FREQUENCY_LABEL[safeFrequency].toLowerCase()} delivery</p>

          <dl className="text-xs space-y-1 pt-2 border-t border-border/60">
            <Row label="First payment today" v={<b className="text-forest">{fmtN(firstPayment)}</b>} />
            <p className="text-[11px] text-text-light">Covers {count} deliveries — then auto-renews at the same amount per cycle.</p>
            <Row label="First cycle ends around" v={fmtLongDate(cycleEnd)} />
          </dl>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
            <div className="font-bold mb-0.5 flex items-center gap-1"><Repeat className="w-3.5 h-3.5" /> Auto-renewing subscription</div>
            Your card will be charged <b>{fmtN(firstPayment)}</b> every {count} deliveries. Prices at renewal reflect current product prices at that time. Cancel any time from your account — takes effect after your current paid cycle ends.
          </div>
        </section>

        {/* Contact + delivery forms */}
        <section className="bg-card border border-border rounded-card p-4 space-y-3">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med">Contact details</h2>
          <Field label="Full name *"><input className={inputCls} value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} /></Field>
          <Field label="Email address *"><input type="email" inputMode="email" className={inputCls} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></Field>
          <Field label="Phone number *"><input inputMode="tel" className={inputCls} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></Field>
        </section>

        <section className="bg-card border border-border rounded-card p-4 space-y-3">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med">Delivery details</h2>
          <Field label="Delivery address *"><input className={inputCls} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="City *"><input className={inputCls} value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></Field>
            <Field label="State *">
              <select className={inputCls} value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))}>
                <option value="">Select…</option>
                {states.map(s => (
                  <option key={s.name} value={s.name}>
                    {s.name}{s.is_active === false ? " (coming soon)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* Price locked notice */}
        <section className="bg-emerald-50 border-2 border-emerald-600 rounded-card p-4 text-sm space-y-1">
          <h3 className="font-bold text-emerald-800 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Price locked for this cycle</h3>
          <p className="text-xs text-emerald-900/80">
            You will be charged <b>{fmtN(draft.total_per_delivery)}</b> per delivery for all {count} deliveries in this cycle. When your cycle renews, we charge current product prices at that time.
          </p>
        </section>

        <button
          onClick={pay}
          disabled={!canPay}
          className="w-full rounded-pill py-3 text-sm font-semibold text-primary-foreground min-h-[48px] inline-flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ backgroundColor: "#2D6A4F" }}
        >
          {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          {processing ? "Processing…" : `Start Subscription — ${fmtN(firstPayment)} now`}
        </button>
        <p className="text-[11px] text-text-light text-center">Secure payment powered by Paystack.</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>;
}
function Row({ label, v, muted }: { label: string; v: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${muted ? "text-text-light" : "text-text-med"}`}>{label}</span>
      <span className="text-xs font-semibold tabular-nums">{v}</span>
    </div>
  );
}

