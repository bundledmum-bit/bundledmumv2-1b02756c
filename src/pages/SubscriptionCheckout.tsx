import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Lock, Loader2, Minus, Plus, ArrowLeft, Repeat, ShieldCheck, Calendar, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useShippingZones } from "@/hooks/useShippingZones";
import { useDeliverableStates } from "@/hooks/useDeliverableStates";
import {
  readDraft, clearDraft, removeFromDraft, writeDraft, fmtN,
  DELIVERY_COUNT_LIMITS, FREQUENCY_LABEL, useSubscriptionSettings,
  WEEKDAY_LABEL, projectCycleEnd,
  RESULT_KEY, type Frequency, type SubscriptionDraft,
} from "@/hooks/useSubscription";
import { track as pixelTrack, moneyPayload as pixelMoney } from "@/lib/metaPixel";

// First delivery = the next occurrence of the chosen weekday that is at least
// `minLead` days from today. Mirrors the create-subscription server rule so the
// pre-payment estimate matches the confirmation email.
function computeFirstDeliveryDate(deliveryDay: string, minLead: number): Date {
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = dayMap[deliveryDay.toLowerCase()] ?? today.getDay();
  let daysAhead = target - today.getDay();
  if (daysAhead <= 0) daysAhead += 7;
  while (daysAhead < minLead) daysAhead += 7;
  const d = new Date(today);
  d.setDate(d.getDate() + daysAhead);
  return d;
}

// Form styling matched to CheckoutPage's address form (InputField).
const fieldInputCls = "w-full rounded-[10px] border-[1.5px] px-3 py-2.5 text-sm bg-card font-body outline-none transition-colors min-h-[44px]";
const fieldLabelCls = "text-xs font-semibold text-text-med uppercase tracking-wide";

interface ContactForm {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  zoneId: string;
  city: string;     // free-text fallback for states without zones
  notes: string;
}
type FormKey = keyof ContactForm;

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

  // Per-item frequency / delivery-day editing in the order summary.
  const handleItemFrequencyChange = (productId: string, brandId: string, value: string) => {
    const existing = readDraft();
    if (!existing) return;
    const idx = existing.items.findIndex(i => i.product_id === productId && i.brand_id === brandId);
    if (idx < 0) return;
    existing.items[idx].frequency = value as Frequency;
    writeDraft(existing);
    setDraft(readDraft());
  };
  const handleItemDeliveryDayChange = (productId: string, brandId: string, value: string) => {
    const existing = readDraft();
    if (!existing) return;
    const idx = existing.items.findIndex(i => i.product_id === productId && i.brand_id === brandId);
    if (idx < 0) return;
    existing.items[idx].delivery_day = value;
    writeDraft(existing);
    setDraft(readDraft());
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

  // States + shipping zones — the same sources CheckoutPage uses, so the
  // delivery form behaves identically (State → Zone cascade).
  const { data: deliverableStates = [], isLoading: statesLoading } = useDeliverableStates(true);
  const { data: zones = [] } = useShippingZones();
  const { data: settings } = useSubscriptionSettings();

  // Subscription-only delivery rules (subscription_settings). Subscriptions
  // ship to a limited set of states and need a minimum lead time before the
  // first delivery — both enforced server-side; mirrored here for display.
  const [allowedStates, setAllowedStates] = useState<string[]>(["Lagos"]);
  const [minLeadDays, setMinLeadDays] = useState(3);
  useEffect(() => {
    (supabase as any).from("subscription_settings")
      .select("setting_value").eq("setting_key", "subscription_allowed_states").single()
      .then(({ data }: any) => {
        const v = data?.setting_value;
        if (typeof v === "string" && v.trim()) {
          const list = v.split(",").map((s: string) => s.trim()).filter(Boolean);
          if (list.length) setAllowedStates(list);
        }
      });
    (supabase as any).from("subscription_settings")
      .select("setting_value").eq("setting_key", "min_lead_days").single()
      .then(({ data }: any) => {
        const n = parseInt(data?.setting_value, 10);
        if (Number.isFinite(n) && n >= 0) setMinLeadDays(n);
      });
  }, []);

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
    firstName: "", lastName: "", phone: "", email: "",
    address: "", state: "Lagos", zoneId: "", city: "", notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<FormKey, string>>>({});
  const [processing, setProcessing] = useState(false);

  // State options = deliverable states ∩ subscription-allowed states
  // (case-insensitive). Falls back to the allowed list if none of them are in
  // the deliverable set, so the selector is never empty.
  const stateOptions = useMemo(() => {
    const inter = deliverableStates
      .filter(s => allowedStates.some(a => a.toLowerCase() === s.name.toLowerCase()))
      .map(s => s.name);
    return inter.length ? inter : allowedStates;
  }, [deliverableStates, allowedStates]);

  // State → Zone cascade (mirrors CheckoutPage).
  const activeState = deliverableStates.find(s => s.name === form.state);
  const zonesForState = (zones || []).filter(z => (z.states || []).includes(form.state));
  const stateHasZones = activeState?.has_zones === true && zonesForState.length > 0;
  const selectedZone = zonesForState.find(z => z.id === form.zoneId) || null;

  // Keep `state` valid once options resolve (fallback to the first allowed state).
  useEffect(() => {
    if (!stateOptions.length) return;
    if (!stateOptions.some(n => n.toLowerCase() === form.state.toLowerCase())) {
      setForm(p => ({ ...p, state: stateOptions[0] }));
    }
  }, [stateOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill contact + delivery from customer_account_view when signed in.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("customer_account_view")
        .select("full_name, phone, delivery_address, delivery_state")
        .maybeSingle();
      if (cancelled || !data) return;
      const [first, ...rest] = String(data.full_name || "").split(" ");
      setForm(prev => ({
        ...prev,
        firstName: prev.firstName || first || "",
        lastName:  prev.lastName  || rest.join(" ") || "",
        email:     prev.email     || user.email || "",
        phone:     prev.phone     || data.phone || "",
        address:   prev.address   || data.delivery_address || "",
        state:     prev.state     || data.delivery_state || prev.state,
      }));
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Dates — first delivery = next occurrence of the chosen weekday that is at
  // least min_lead_days from today (mirrors the create-subscription server
  // rule, so the customer sees the correct date before paying). First cycle
  // end = first delivery + frequency_days × (count − 1).
  const safeDeliveryDay = draft?.delivery_day || "monday";

  const firstDelivery = useMemo(() => {
    if (!draft) return null;
    return computeFirstDeliveryDate(safeDeliveryDay, minLeadDays);
  }, [draft, safeDeliveryDay, minLeadDays]);
  const cycleEnd = useMemo(() => {
    if (!firstDelivery || !draft) return null;
    return projectCycleEnd(firstDelivery, safeFrequency, count);
  }, [firstDelivery, draft, safeFrequency, count]);

  const fmtLongDate = (d: Date | null) => d
    ? d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })
    : "—";
  const fmtFirstDelivery = (d: Date | null) => d
    ? d.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "—";

  const firstPayment = (draft?.total_per_delivery ?? 0) * count;

  if (!hydrated || !draft) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-text-light">Loading…</div>;
  }

  // Validation — mirrors CheckoutPage (required fields + phone/email format).
  const phoneDigits = form.phone.replace(/\D/g, "");
  const validateField = (key: FormKey): string | undefined => {
    const val = (form[key] || "").trim();
    if (key === "firstName" && !val) return "First name is required";
    if (key === "lastName" && !val) return "Last name is required";
    if (key === "phone") {
      const d = val.replace(/\D/g, "");
      if (!d || d.length < 10) return "Valid phone required";
    }
    if (key === "email") {
      if (!val) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return "Enter a valid email address";
    }
    if (key === "address" && !val) return "Street address is required";
    if (key === "zoneId" && stateHasZones && !val) return "Delivery zone is required";
    if (key === "city" && !stateHasZones && !val) return "City / Town is required";
    return undefined;
  };
  const handleBlur = (key: FormKey) => setErrors(p => ({ ...p, [key]: validateField(key) }));
  const updateField = (key: FormKey, val: string) => {
    setForm(p => ({ ...p, [key]: val }));
    if (errors[key]) setErrors(p => ({ ...p, [key]: undefined }));
  };
  const requiredFields: FormKey[] = ["firstName", "lastName", "phone", "email", "address", stateHasZones ? "zoneId" : "city"];
  const validate = () => {
    const e: Partial<Record<FormKey, string>> = {};
    requiredFields.forEach(k => { const err = validateField(k); if (err) e[k] = err; });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const canPay =
    !!form.firstName.trim() && !!form.lastName.trim() &&
    phoneDigits.length >= 10 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    !!form.address.trim() && !!form.state.trim() &&
    (stateHasZones ? !!form.zoneId : !!form.city.trim()) &&
    !processing;

  const deliveryCity = stateHasZones ? (selectedZone?.name || "") : form.city.trim();

  const pay = async () => {
    if (!validate() || !canPay) { toast.error("Please complete all contact and delivery fields."); return; }

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
        firstname: form.firstName,
        lastname: form.lastName,
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
                customer_name: `${form.firstName} ${form.lastName}`.trim(),
                customer_phone: form.phone.trim(),
                delivery_address: form.address.trim(),
                delivery_city: deliveryCity,
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

        {/* First delivery — applies the minimum lead time (matches the server). */}
        <section className="bg-forest/5 border border-forest/20 rounded-card p-4 flex items-start gap-3">
          <Calendar className="w-5 h-5 text-forest flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-forest">Your first delivery</div>
            <div className="text-sm font-bold">{fmtFirstDelivery(firstDelivery)}</div>
            <p className="text-[11px] text-text-light mt-0.5">
              Chosen {WEEKDAY_LABEL[safeDeliveryDay] || safeDeliveryDay}, at least {minLeadDays} days from today so we can prepare your box.
            </p>
          </div>
        </section>

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
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Frequency:</span>
                      {/* Picker only when more than one frequency is enabled;
                          otherwise a fixed label (monthly-only). */}
                      {(settings?.weekly_enabled || settings?.biweekly_enabled) ? (
                        <select
                          value={it.frequency || draft.frequency || "monthly"}
                          onChange={e => handleItemFrequencyChange(it.product_id, it.brand_id, e.target.value)}
                          className="text-xs border border-border rounded-md px-2 py-1 bg-card focus:border-forest outline-none"
                          aria-label="Item frequency"
                        >
                          {settings?.weekly_enabled && <option value="weekly">Every week</option>}
                          {settings?.biweekly_enabled && <option value="biweekly">Every 2 weeks</option>}
                          {settings?.monthly_enabled && <option value="monthly">Every month</option>}
                        </select>
                      ) : (
                        <span className="text-xs font-semibold text-text-dark">Every month</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Delivers:</span>
                      <select
                        value={it.delivery_day || draft.delivery_day || ""}
                        onChange={e => handleItemDeliveryDayChange(it.product_id, it.brand_id, e.target.value)}
                        className="text-xs border border-border rounded-md px-2 py-1 bg-card focus:border-forest outline-none"
                        aria-label="Item delivery day"
                      >
                        <option value="" disabled>Choose day</option>
                        {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(day => (
                          <option key={day} value={day.toLowerCase()}>{day}</option>
                        ))}
                      </select>
                    </div>
                  </div>
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
            <Row label="First delivery" v={fmtFirstDelivery(firstDelivery)} />
            <Row label="First cycle ends around" v={fmtLongDate(cycleEnd)} />
          </dl>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
            <div className="font-bold mb-0.5 flex items-center gap-1"><Repeat className="w-3.5 h-3.5" /> Auto-renewing subscription</div>
            Your card will be charged <b>{fmtN(firstPayment)}</b> every {count} deliveries. Prices at renewal reflect current product prices at that time. Cancel any time from your account — takes effect after your current paid cycle ends.
          </div>
        </section>

        {/* Contact + delivery — replica of CheckoutPage's address form */}
        <section className="bg-card border border-border rounded-card p-4">
          <h2 className="pf text-base font-bold mb-4">📍 Delivery Details</h2>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col md:flex-row gap-3">
              <CoField label="First Name" value={form.firstName} onChange={v => updateField("firstName", v)} onBlur={() => handleBlur("firstName")} error={errors.firstName} />
              <CoField label="Last Name" value={form.lastName} onChange={v => updateField("lastName", v)} onBlur={() => handleBlur("lastName")} error={errors.lastName} />
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <CoField label="Phone Number" type="tel" placeholder="08012345678" value={form.phone} onChange={v => updateField("phone", v)} onBlur={() => handleBlur("phone")} error={errors.phone} />
              <CoField label="Email Address" type="email" placeholder="you@example.com" value={form.email} onChange={v => updateField("email", v)} onBlur={() => handleBlur("email")} error={errors.email} />
            </div>
            <CoField label="Street Address" value={form.address} onChange={v => updateField("address", v)} onBlur={() => handleBlur("address")} error={errors.address} />

            {/* State → Zone cascade */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 flex flex-col gap-1">
                <label className={fieldLabelCls}>State</label>
                {statesLoading ? (
                  <div className="w-full h-[44px] rounded-[10px] border-[1.5px] border-border bg-muted/40 animate-pulse" aria-label="Loading states" />
                ) : (
                  <select
                    value={form.state}
                    onChange={e => { setForm(p => ({ ...p, state: e.target.value, zoneId: "", city: "" })); setErrors(p => ({ ...p, zoneId: undefined, city: undefined })); }}
                    className={`${fieldInputCls} border-border focus:border-forest`}
                  >
                    {stateOptions.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                )}
                <p className="text-[11px] text-text-light">Subscriptions are currently available in: {allowedStates.join(", ")}.</p>
              </div>

              {stateHasZones && (
                <div className="flex-1 flex flex-col gap-1">
                  <label className={fieldLabelCls}>Delivery Zone</label>
                  <select
                    value={form.zoneId}
                    onChange={e => updateField("zoneId", e.target.value)}
                    onBlur={() => handleBlur("zoneId")}
                    className={`${fieldInputCls} ${errors.zoneId ? "border-destructive" : "border-border focus:border-forest"}`}
                  >
                    <option value="">Select your delivery zone</option>
                    {zonesForState.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                  {errors.zoneId && <p className="text-destructive text-[11px]">{errors.zoneId}</p>}
                </div>
              )}
            </div>

            {/* Free-text City — states without mapped zones */}
            {!stateHasZones && (
              <CoField label="City / Town" value={form.city} onChange={v => updateField("city", v)} onBlur={() => handleBlur("city")} error={errors.city} />
            )}

            <div className="flex flex-col gap-1">
              <label className={fieldLabelCls}>Delivery Notes (Optional)</label>
              <textarea value={form.notes} onChange={e => updateField("notes", e.target.value)} className="w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body resize-y h-20 focus:border-forest outline-none" placeholder="E.g. Landmark, gate colour..." />
            </div>
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

function CoField({ label, value, onChange, onBlur, error, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  error?: string; type?: string; placeholder?: string;
}) {
  return (
    <div className="flex-1 flex flex-col gap-1">
      <label className={fieldLabelCls}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`${fieldInputCls} ${error ? "border-destructive" : "border-border focus:border-forest"}`}
      />
      {error && <p className="text-destructive text-[11px]">{error}</p>}
    </div>
  );
}
function Row({ label, v, muted }: { label: string; v: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${muted ? "text-text-light" : "text-text-med"}`}>{label}</span>
      <span className="text-xs font-semibold tabular-nums">{v}</span>
    </div>
  );
}

