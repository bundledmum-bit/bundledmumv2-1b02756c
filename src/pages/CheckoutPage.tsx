import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCart, fmt, cartItemImage } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useShippingZones, calculateDeliveryFee, type ShippingZone } from "@/hooks/useShippingZones";
import { useDeliverableStates } from "@/hooks/useDeliverableStates";
import { useSiteSettings, useAllProducts } from "@/hooks/useSupabaseData";
import { useSpendThresholds, getSpendPrompt } from "@/hooks/useSpendThresholds";
import { trackEvent, getSessionId, getAttribution, markSessionConverted } from "@/lib/analytics";
import { track as pixelTrack, moneyPayload as pixelMoney } from "@/lib/metaPixel";
import { syncOrderToSheets } from "@/lib/googleSheets";
import { analytics, trackEcommerce } from "@/lib/ga";

interface FormData {
  firstName: string; lastName: string; phone: string; email: string;
  address: string; city: string; state: string; notes: string;
  lga?: string;
}

type SavedOrderResult = { id: string; orderNumber: string | null };

/** Item in the `stock_issues` array returned by the place-order edge
 *  function when one or more cart items are unavailable (HTTP 409). */
interface StockIssue {
  brand_id?: string;
  brand_name?: string;
  product_name?: string;
  available?: number;
  requested?: number;
  message?: string;
}

/** True when a cart item matches one of the stock-issue entries — by
 *  brand id (preferred) or brand_name / product_name substring (fallback). */
function cartItemHasIssue(item: any, issues: StockIssue[]): boolean {
  if (!issues.length) return false;
  const brandId = item.selectedBrand?.id;
  const brandLabel = (item.selectedBrand?.label || "").toLowerCase();
  const productName = String(item.name || "").toLowerCase();
  return issues.some(iss => {
    if (iss.brand_id && brandId && iss.brand_id === brandId) return true;
    const hay = (iss.brand_name || iss.product_name || "").toLowerCase();
    if (!hay) return false;
    return brandLabel.includes(hay) || hay.includes(brandLabel) || productName.includes(hay) || hay.includes(productName);
  });
}

export default function CheckoutPage() {
  const { cart, subtotal, clearCart, totalItems } = useCart();
  const { isLoggedIn, loading: authLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>({ firstName: "", lastName: "", phone: "", email: "", address: "", city: "", state: "Lagos", notes: "", lga: "" });
  const [payment, setPayment] = useState<"card" | "transfer" | "ussd">("card");
  const [giftWrap, setGiftWrap] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [stockIssues, setStockIssues] = useState<StockIssue[]>([]);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [mobileOrderOpen, setMobileOrderOpen] = useState(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{ id: string; code: string; discount_type: string; discount_value: number; discount_amount: number } | null>(null);

  // Referral state
  const [referralCode, setReferralCode] = useState("");
  const [referralLoading, setReferralLoading] = useState(false);
  const [appliedReferral, setAppliedReferral] = useState<{ id: string; code: string; discount_amount: number } | null>(null);

  // Dynamic settings from DB
  const { data: settings } = useSiteSettings();
  const { data: zones } = useShippingZones();
  const { data: thresholds } = useSpendThresholds();
  const { data: deliverableStates, isLoading: statesLoading } = useDeliverableStates(true);
  const { data: allProducts } = useAllProducts();

  // Currently-selected delivery zone (null when the selected state has
  // no zones, or the user hasn't picked a zone yet).
  const [selectedZone, setSelectedZone] = useState<ShippingZone | null>(null);
  // Name of the currently-selected LGA within the zone. Empty until the
  // user picks one (or auto-selected when the zone has only one LGA).
  const [selectedLga, setSelectedLga] = useState<string>("");
  const zonesForState = (zones || []).filter(z => (z.states || []).includes(form.state));
  // Zone availability is now driven by the DB's deliverable_states
  // table: a state only shows the zone cascade when admins have flagged
  // has_zones = true AND an active ShippingZone row references it.
  const activeState = (deliverableStates || []).find(s => s.name === form.state);
  const stateHasZones = activeState?.has_zones === true && zonesForState.length > 0;
  const lgasForZone = selectedZone?.lgas || [];
  const areasForLga = selectedZone?.lgas?.find(l => l.lga === selectedLga)?.areas || [];

  // Once deliverable states load, set the form's state to the first
  // active state if the current form.state isn't in the list.
  // Meta Pixel InitiateCheckout — fires once on mount when the cart
  // has contents. Guarded via sessionStorage so refreshes don't double-
  // count.
  useEffect(() => {
    if (totalItems === 0) return;
    try {
      const k = "bm_meta_initiate_checkout_fired";
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch { /* ignore */ }
    pixelTrack("InitiateCheckout", pixelMoney(subtotal, {
      num_items: totalItems,
      content_ids: cart.map((c: any) => c.id),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalItems > 0]);

  useEffect(() => {
    if (!deliverableStates || deliverableStates.length === 0) return;
    const stillValid = deliverableStates.some(s => s.name === form.state);
    if (!stillValid) {
      setForm(p => ({ ...p, state: deliverableStates[0].name }));
      setSelectedZone(null);
      setSelectedLga("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverableStates]);

  // When a zone with exactly one LGA is selected, auto-fill the LGA.
  useEffect(() => {
    if (selectedZone && selectedZone.lgas && selectedZone.lgas.length === 1 && !selectedLga) {
      setSelectedLga(selectedZone.lgas[0].lga);
    }
  }, [selectedZone, selectedLga]);

  // When the chosen LGA has exactly one area, auto-fill form.city.
  useEffect(() => {
    if (!selectedLga || !selectedZone) return;
    const lga = selectedZone.lgas?.find(l => l.lga === selectedLga);
    if (lga && lga.areas.length === 1 && form.city !== lga.areas[0]) {
      setForm(p => ({ ...p, city: lga.areas[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLga, selectedZone]);

  // Payment method toggles from site_settings
  const [enabledPayments, setEnabledPayments] = useState<Record<string, boolean>>({ card: true, transfer: true, ussd: true });
  useEffect(() => {
    supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["payment_method_card_enabled", "payment_method_transfer_enabled", "payment_method_ussd_enabled"])
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, boolean> = { card: true, transfer: true, ussd: true };
        for (const row of data) {
          const val = row.value === true || row.value === "true" || row.value === "1";
          if (row.key === "payment_method_card_enabled") map.card = val;
          if (row.key === "payment_method_transfer_enabled") map.transfer = val;
          if (row.key === "payment_method_ussd_enabled") map.ussd = val;
        }
        setEnabledPayments(map);
        const enabled = Object.entries(map).filter(([, v]) => v).map(([k]) => k);
        if (enabled.length === 1) setPayment(enabled[0] as any);
        else if (enabled.length > 0 && !map[payment]) setPayment(enabled[0] as any);
      });
  }, []);

  useEffect(() => {
    document.title = "Secure Checkout | BundledMum";
    trackEvent("checkout_started", { item_count: totalItems, subtotal });
  }, []);

  useEffect(() => {
    if (cart.length === 0 && !processing) navigate("/cart");
  }, [cart, processing]);

  // Returning-customer pre-fill: if the shopper is authenticated, pull
  // their saved name / phone / address from customer_account_view (the
  // view is RLS-gated to the caller's own row, so no params needed).
  // No phone lookup — the old `get-order-confirmation` endpoint now
  // returns 410 and is no longer called.
  const [customerPrefilled, setCustomerPrefilled] = useState(false);
  useEffect(() => {
    if (authLoading || !isLoggedIn || customerPrefilled) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("customer_account_view")
        .select("full_name, phone, whatsapp_number, delivery_address, delivery_area, delivery_state")
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) return;
      const [first, ...rest] = String(data.full_name || "").split(" ");
      setForm(prev => ({
        ...prev,
        firstName: prev.firstName || first || "",
        lastName: prev.lastName || rest.join(" ") || "",
        phone: prev.phone || data.phone || "",
        address: prev.address || data.delivery_address || "",
        city: prev.city || data.delivery_area || "",
        state: prev.state || data.delivery_state || prev.state,
      }));
      setCustomerPrefilled(true);
      toast.success("Welcome back! We've pre-filled your details.");
    })();
    return () => { cancelled = true; };
  }, [authLoading, isLoggedIn, customerPrefilled]);

  // Robust to either jsonb boolean or string "true"/"false" — see
  // CartPage for the same parsing rationale.
  // ── Settings coercers — site_settings.value is jsonb that may arrive
  // as native types or quoted strings depending on how the row was
  // seeded. Tolerate both, default on miss.
  const asBool = (v: unknown, def = false): boolean =>
    v === true || v === "true" ? true : v === false || v === "false" ? false : def;
  const asInt = (v: unknown, def: number): number =>
    typeof v === "number" ? Math.trunc(v) : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : def;
  const asString = (v: unknown, def: string): string =>
    typeof v === "string" && v.trim().length > 0 ? v : def;

  // The six admin-controlled Express Order settings.
  const expressEnabled     = asBool(settings?.express_order_enabled, false);
  const expressMinSubtotal = asInt(settings?.express_order_min_subtotal_naira, 150000);
  const minEnforced        = asBool(settings?.express_order_min_subtotal_enforced, true);
  const expressSlaHours    = asInt(settings?.express_order_sla_hours, 24);
  const expressDisplayName = asString(settings?.express_order_display_name, "Express Order");
  const expressAckText     = asString(settings?.express_order_acknowledgment_text, "");
  // Free Nationwide Delivery — admin-controlled threshold that waives the
  // courier-quote and reads custom marketing copy. Express still wins.
  const nationwideEnabled   = asBool(settings?.free_delivery_nationwide_enabled, true);
  const nationwideThreshold = asInt(settings?.free_delivery_nationwide_threshold_naira, 500000);
  const nationwideLabel     = asString(settings?.free_delivery_nationwide_label, "FREE Nationwide Delivery 🎉");
  const nationwideHelper    = asString(settings?.free_delivery_nationwide_helper_text, "");
  const nationwideMarketing = asString(settings?.free_delivery_nationwide_marketing_copy, "");
  const slaLabel = `within ${expressSlaHours} hour${expressSlaHours === 1 ? "" : "s"}`;
  const whatsappNumber = String(settings?.whatsapp_number || "").replace(/^"|"$/g, "").replace(/\D/g, "");

  const sfEnabledRaw = settings?.service_fee_enabled;
  const serviceFeeEnabled =
    sfEnabledRaw !== false && sfEnabledRaw !== "false" && sfEnabledRaw !== 0 && sfEnabledRaw !== "0";
  const serviceFee = serviceFeeEnabled ? (parseInt(String(settings?.service_fee ?? "0"), 10) || 0) : 0;
  const serviceFeeLabel = settings?.service_fee_label || "Service & Packaging";

  const defaultDeliveryFee = parseInt(settings?.default_delivery_fee) || 0;
  const defaultFreeThreshold = parseInt(settings?.default_free_threshold) || 0;
  const giftWrapPrice = parseInt(settings?.gift_wrapping_price) || 0;

  const bankName = settings?.bank_name || "";
  const bankAccountName = settings?.bank_account_name || "";
  const bankAccountNumber = settings?.bank_account_number || "";

  // Total cart weight (kg) — used for weight-based delivery pricing via
  // the get_courier_assignment RPC. Look up each cart item's weight_kg
  // on the live product record; fall back to a conservative 0.5 kg per
  // item when a product has no weight set so the fee is never 0.
  const cartWeightKg = (() => {
    if (!cart?.length) return 0;
    const byId = new Map<string, number>();
    (allProducts || []).forEach((p: any) => {
      const w = Number(p?.weight_kg);
      if (p?.id != null && isFinite(w) && w > 0) byId.set(String(p.id), w);
    });
    return cart.reduce((sum, item) => {
      const w = byId.get(String(item.id)) ?? 0.5;
      return sum + w * (item.qty || 0);
    }, 0);
  })();

  // Bundle tier (for the RPC) — try to read from the saved quiz first.
  const budgetTier = (() => {
    try {
      const saved = localStorage.getItem("bm-saved-bundle");
      if (saved) {
        const p = JSON.parse(saved);
        if (p?.answers?.budget) return String(p.answers.budget);
      }
    } catch {}
    return "standard";
  })();

  // Zone-based fallback (used before the RPC responds, and for the
  // zoneName label / estimated days).
  const zoneCalc = zones?.length
    ? calculateDeliveryFee(subtotal, form.city, form.state, zones, serviceFee, defaultDeliveryFee, defaultFreeThreshold, cartWeightKg)
    : { fee: defaultFreeThreshold && subtotal >= defaultFreeThreshold ? 0 : defaultDeliveryFee, isFree: defaultFreeThreshold > 0 && subtotal >= defaultFreeThreshold, zoneName: "Standard", daysMin: 1, daysMax: 3, freeThreshold: defaultFreeThreshold, isInterstate: false as const };

  // ---- Live courier quote ---------------------------------------------------
  // Calls get_courier_assignment whenever the shipping inputs change,
  // debounced to 300 ms so rapid typing doesn't spam the RPC. The
  // result drives the customer-visible delivery fee.
  const [courierQuote, setCourierQuote] = useState<{
    customerRateKobo: number;
    partnerCostKobo: number;
    bookings: number;
    weightKg: number;
    partner: string | null;
    note: string | null;
    deliverable: boolean;
    zone: string | null;
    isFreeDelivery: boolean;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  useEffect(() => {
    // Gate: wait until we have enough location + a weight to quote.
    // For Lagos/zone-backed states we accept zone / LGA / city; for
    // other states, state alone is enough.
    const locationReady = stateHasZones
      ? Boolean(form.state && (selectedZone || selectedLga || form.city))
      : Boolean(form.state);
    if (!locationReady || cartWeightKg <= 0) {
      setCourierQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await (supabase.rpc as any)("get_courier_assignment", {
          p_delivery_city: form.city,
          p_delivery_state: form.state,
          p_bundle_tier: budgetTier,
          p_order_day: new Date().toLocaleDateString("en-US", { weekday: "long" }),
          p_daily_order_count: 1,
          p_order_weight_kg: cartWeightKg,
          p_order_subtotal: subtotal,
        });
        if (cancelled) return;
        if (error) {
          setCourierQuote(null);
          setQuoteError("Could not calculate delivery fee right now — please try again.");
        } else {
          const r = data || {};
          setCourierQuote({
            customerRateKobo: Number(r.customer_rate || 0),
            partnerCostKobo: Number(r.partner_cost || 0),
            bookings: Number(r.bookings || 0),
            weightKg: Number(r.order_weight_kg ?? cartWeightKg),
            partner: r.partner || null,
            note: r.note || null,
            deliverable: r.deliverable !== false,
            zone: r.zone || null,
            isFreeDelivery: r.is_free_delivery === true,
          });
          setQuoteError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setCourierQuote(null);
          setQuoteError("Could not calculate delivery fee right now — please try again.");
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.city, form.state, selectedZone?.id, selectedLga, stateHasZones, cartWeightKg, budgetTier, subtotal]);

  // Use the courier quote when we have one; otherwise fall back to the
  // zone flat-rate calc (used only while the quote is loading or when
  // cart has no resolvable weight).
  const hasQuote = courierQuote != null && courierQuote.deliverable;
  const deliveryCalc = {
    ...zoneCalc,
    // surface the interstate-style breakdown using the RPC's numbers
    isInterstate: zoneCalc.isInterstate,
    weightKg: courierQuote?.weightKg ?? (zoneCalc as any).weightKg,
    bookingsNeeded: courierQuote?.bookings ?? (zoneCalc as any).bookingsNeeded,
  };

  // Gate: don't show / charge delivery until we have enough location to
  // quote. For zone-backed states (Lagos) that's when any of the zone,
  // LGA, or city/area selectors has a value — the customer doesn't
  // have to traverse the whole cascade for us to route. For states
  // without zones, state alone is sufficient.
  const deliveryReady = stateHasZones
    ? Boolean(form.state && (selectedZone || selectedLga || form.city))
    : Boolean(form.state);

  // ── Express Order ─────────────────────────────────────────────
  // Customer pays for products only at checkout; delivery is quoted by
  // the admin within the SLA hours via WhatsApp and paid via a second
  // Paystack link. The six admin-controlled keys above gate this:
  //   - expressEnabled       — master switch (default false)
  //   - expressMinSubtotal   — cart floor (default 150000)
  //   - minEnforced          — should the floor be applied? (default true)
  //   - expressSlaHours      — quote SLA shown to customer (default 24)
  //   - expressDisplayName   — label shown on every Express-related UI
  //   - expressAckText       — checkbox copy
  // Server-side place-order v35 enforces the first three.
  const cartMeetsMinimum = !minEnforced || subtotal >= expressMinSubtotal;
  // Express-Only states (e.g. Cross River) waive the floor: standard
  // couriers don't reach them, so any cart size has to go through Express.
  const stateRequiresExpress = activeState?.is_express_only === true;
  const expressEligible = expressEnabled && (stateRequiresExpress || cartMeetsMinimum);
  const [isExpressOrder, setIsExpressOrder] = useState(false);
  const [expressAcknowledged, setExpressAcknowledged] = useState(false);
  // When a customer picks an Express-Only state, force the toggle ON so
  // Force-on effect for express-only states has moved below the
  // qualifiesForNationwideFree declaration so it can gate on the Free
  // Nationwide override without hitting a TDZ on render.
  // Auto-disable + warn if the subtotal drops below the floor while
  // express is enabled (e.g. customer trims a line item). Skip when the
  // state itself requires express — floor is waived.
  useEffect(() => {
    // Only auto-disable when the floor is actually being enforced AND the
    // current state isn't on the Express-Only allowlist.
    if (isExpressOrder && !expressEligible && !stateRequiresExpress && minEnforced) {
      setIsExpressOrder(false);
      setExpressAcknowledged(false);
      toast.error(`${expressDisplayName} requires ₦${expressMinSubtotal.toLocaleString("en-NG")}+. Standard delivery selected.`);
    }
  }, [isExpressOrder, expressEligible, stateRequiresExpress, minEnforced]);

  // Auto-check / auto-uncheck the acknowledgment to match the current
  // Express Order state. Customer can still untick manually to block
  // submit (existing validation), but the friction of finding the
  // checkbox is gone when they've already opted in via the toggle or
  // landed in an express-only state.
  useEffect(() => {
    setExpressAcknowledged(isExpressOrder);
  }, [isExpressOrder]);

  const computedDelivery = !deliveryReady ? 0 : (hasQuote ? Math.round((courierQuote!.customerRateKobo) / 100) : zoneCalc.fee);
  // Free nationwide delivery beats the courier-quote when the cart is at
  // or above the admin-set threshold. Express still beats that.
  const qualifiesForNationwideFree = nationwideEnabled && subtotal >= nationwideThreshold;
  // Lagos / zone-level free delivery — surfaced by get_courier_assignment.
  // Using the RPC's flag (not a hardcoded ₦200k) so any threshold change
  // propagates automatically.
  const qualifiesForFreeLagos = courierQuote?.isFreeDelivery === true;
  const alreadyHasFreeDelivery = qualifiesForFreeLagos || qualifiesForNationwideFree;
  // Express card is hidden when the customer already has free delivery —
  // toggling Express would void the free shipping with no benefit.
  // Express-only states still force the card on regardless (mandatory).
  // Express card visibility — express-only states force the card on,
  // BUT a cart that already qualifies for Free Nationwide overrides
  // that and reverts to the regular free-delivery flow (place-order
  // v36 has the matching server-side override).
  const showExpressCard = (stateRequiresExpress && !qualifiesForNationwideFree)
    || (expressEligible && !alreadyHasFreeDelivery);

  // Force the toggle ON when the customer's state requires Express AND
  // they don't qualify for the Free Nationwide override. Lives here
  // (after qualifiesForNationwideFree is declared) so the deps array
  // doesn't trip the TDZ rule that blanked /checkout on b9c74b0.
  useEffect(() => {
    if (stateRequiresExpress && !qualifiesForNationwideFree && !isExpressOrder) {
      setIsExpressOrder(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateRequiresExpress, qualifiesForNationwideFree]);

  // If the cart crosses into a free-delivery tier mid-checkout while
  // Express was previously toggled ON, snap it back off — keeping it on
  // would silently waive the free delivery the customer just earned.
  // Also covers the new Free-Nationwide-beats-express-only-state case.
  // Must live AFTER alreadyHasFreeDelivery's const declaration above —
  // React evaluates the deps array inline during render, and referencing
  // a const before its declaration in the same function scope throws a
  // TDZ ReferenceError (that bug blanked /checkout on b9c74b0).
  useEffect(() => {
    if (isExpressOrder && alreadyHasFreeDelivery) {
      setIsExpressOrder(false);
      setExpressAcknowledged(false);
      toast.success("You now qualify for free delivery — Express Order turned off.");
    }
  }, [isExpressOrder, alreadyHasFreeDelivery]);
  const delivery = isExpressOrder ? 0 : qualifiesForNationwideFree ? 0 : computedDelivery;
  const notDeliverable = !isExpressOrder && deliveryReady && courierQuote != null && courierQuote.deliverable === false;

  // Spend threshold discount
  const spendPrompt = thresholds?.length ? getSpendPrompt(subtotal, thresholds) : null;
  const spendDiscount = spendPrompt?.appliedDiscount || 0;

  // Coupon discount — already calculated server-side by validate_coupon RPC
  const couponDiscount = appliedCoupon?.discount_amount || 0;
  // Referral discount
  const referralDiscount = appliedReferral?.discount_amount || 0;

  const giftWrapFee = giftWrap ? giftWrapPrice : 0;
  const grand = Math.max(0, subtotal + delivery + serviceFee + giftWrapFee - couponDiscount - referralDiscount - spendDiscount);

  // ── GA4 funnel instrumentation ───────────────────────────────────────
  // Cart-shaped item list reused by add_shipping_info / add_payment_info.
  const gaItems = () => cart.map((item: any) => {
    const brand = item.selectedBrand;
    const unitPrice = Number(brand?.price ?? item.price ?? 0);
    return {
      item_id: String(item.id),
      item_name: item.name,
      item_brand: brand?.label ?? "",
      item_variant: brand?.sku ?? "",
      item_category: item.category ?? "",
      item_category2: item.subcategory ?? "",
      price: unitPrice,
      quantity: Number(item.qty ?? 1),
    };
  });

  // checkout_step 2 (delivery) fires once on CheckoutPage mount.
  useEffect(() => {
    if (!cart || cart.length === 0) return;
    try {
      analytics.push({ event: "checkout_step", checkout_step: 2, checkout_step_name: "delivery" });
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // add_shipping_info + checkout_step 3 (payment) — fire once when the
  // delivery section becomes "ready" (state + zone/city are filled in).
  // This is the moment in a single-page checkout where the customer has
  // effectively "submitted" delivery info and moved on to payment.
  const shippingInfoFiredRef = useRef(false);
  useEffect(() => {
    if (shippingInfoFiredRef.current) return;
    if (!deliveryReady || !cart || cart.length === 0) return;
    shippingInfoFiredRef.current = true;
    try {
      trackEcommerce("add_shipping_info", {
        currency: "NGN",
        value: grand,
        shipping_tier: form.city || form.state || "",
        items: gaItems(),
      });
      analytics.push({ event: "checkout_step", checkout_step: 3, checkout_step_name: "payment" });
    } catch (e) {
      console.warn("[ga] add_shipping_info failed:", e);
    }
  }, [deliveryReady, cart.length, grand, form.city, form.state]);

  // add_payment_info — fire each time the user changes payment method.
  // Wrap setPayment so the event fires alongside the state update.
  const lastPaymentFiredRef = useRef<string | null>(null);
  const selectPayment = (method: "card" | "transfer" | "ussd") => {
    setPayment(method);
    if (!cart || cart.length === 0) return;
    if (lastPaymentFiredRef.current === method) return;
    lastPaymentFiredRef.current = method;
    try {
      trackEcommerce("add_payment_info", {
        currency: "NGN",
        value: grand,
        payment_type: method,
        items: gaItems(),
      });
    } catch (e) {
      console.warn("[ga] add_payment_info failed:", e);
    }
  };

  // Delivery date estimate
  const now = new Date();
  const fromDate = new Date(now); fromDate.setDate(fromDate.getDate() + deliveryCalc.daysMin);
  const toDate = new Date(now); toDate.setDate(toDate.getDate() + deliveryCalc.daysMax);
  const fmtDate = (d: Date) => d.toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" });

  const applyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) { toast.error("Enter a coupon code"); return; }
    setCouponLoading(true);
    try {
      const { data, error } = await supabase.rpc("validate_coupon", {
        coupon_code: code,
        order_amount: subtotal,
      });
      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (!result?.valid) {
        toast.error(result?.message || "Invalid coupon code");
        try {
          analytics.push({
            event: "coupon_failed",
            coupon_code: code,
            error_reason: result?.message || "invalid",
          });
        } catch { /* ignore */ }
        setCouponLoading(false);
        return;
      }
      setAppliedCoupon({
        id: result.coupon_id,
        code,
        discount_type: result.discount_type,
        discount_value: result.discount_value || 0,
        discount_amount: result.discount_amount || 0,
      });
      toast.success(result.message || `Coupon "${code}" applied!`);
      try {
        analytics.push({
          event: "coupon_applied",
          coupon_code: code,
          coupon_type: "promo",
          discount_amount: Number(result.discount_amount) || 0,
        });
      } catch { /* ignore */ }
    } catch {
      toast.error("Failed to validate coupon");
      try {
        analytics.push({
          event: "coupon_failed",
          coupon_code: code,
          error_reason: "network_error",
        });
      } catch { /* ignore */ }
    } finally {
      setCouponLoading(false);
    }
  };

  const applyReferral = async () => {
    const code = referralCode.trim().toUpperCase();
    if (!code) { toast.error("Enter a referral code"); return; }
    if (!form.email) { toast.error("Enter your email first — we need it to validate the referral"); return; }
    setReferralLoading(true);
    try {
      const { data, error } = await supabase.rpc("validate_referral_code", {
        p_code: code,
        p_order_amount: subtotal,
        p_redeemer_email: form.email,
        p_redeemer_phone: form.phone,
      });
      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (!result?.valid) {
        toast.error(result?.message || "Invalid referral code");
        try {
          analytics.push({
            event: "coupon_failed",
            coupon_code: code,
            error_reason: result?.message || "invalid_referral",
          });
        } catch { /* ignore */ }
        setReferralLoading(false);
        return;
      }
      setAppliedReferral({
        id: result.referral_code_id,
        code,
        discount_amount: result.discount_amount || 0,
      });
      toast.success(result.message || `Referral code "${code}" applied — saving ${fmt(result.discount_amount)}!`);
      try {
        analytics.push({
          event: "referral_applied",
          referral_code: code,
          referrer_credit: Number(result.referrer_credit) || 0,
          discount_amount: Number(result.discount_amount) || 0,
        });
      } catch { /* ignore */ }
    } catch {
      toast.error("Failed to validate referral code");
    } finally {
      setReferralLoading(false);
    }
  };

  const update = (key: keyof FormData, val: string) => {
    setForm(p => ({ ...p, [key]: val }));
    if (errors[key]) setErrors(p => ({ ...p, [key]: undefined }));
  };

  const validateField = (key: keyof FormData): string | undefined => {
    const val = form[key].trim();
    if (key === "firstName" && !val) return "First name is required";
    if (key === "lastName" && !val) return "Last name is required";
    if (key === "phone") {
      const digits = val.replace(/\D/g, "");
      if (!digits || digits.length < 10) return "Valid phone required";
      if (!/^0[789][01]\d{8}$/.test(digits) && digits.length < 10) return "Enter a valid Nigerian phone (e.g. 08012345678)";
    }
    if (key === "email") {
      if (!val) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return "Enter a valid email address";
    }
    if (key === "address" && !val) return "Street address is required";
    // City is only required when the selected state has mapped zones
    // (today: Lagos). Other states can leave city blank since there's
    // no zone-backed list to pick from.
    if (key === "city" && !val && stateHasZones) return "City is required";
    return undefined;
  };

  const handleBlur = (key: keyof FormData) => {
    const error = validateField(key);
    setErrors(p => ({ ...p, [key]: error }));
  };

  const saveAbandonedCart = async () => {
    if (!form.email?.includes("@") || cart.length === 0) return;
    try {
      await (supabase as any).from("abandoned_carts").upsert(
        {
          email: form.email.toLowerCase().trim(),
          phone: form.phone || null,
          // Richer per-item payload so the send-abandoned-cart edge
          // function can surface product images + deep-link to the
          // product page. The edge function falls back to name+qty
          // +price for legacy thin rows, so we don't need a schema
          // migration to roll this forward.
          cart_items: cart.map((i: any) => {
            const img = cartItemImage(i);
            return {
              product_id: i.id != null ? String(i.id) : null,
              brand_id: i.selectedBrand?.id || null,
              name: i.name,
              qty: i.qty,
              price: i.price,
              slug: i.slug || null,
              image_url: img && img !== "/placeholder.svg" ? img : null,
              size: i.selectedSize || null,
              color: i.selectedColor || null,
            };
          }),
          cart_total: subtotal,
          recovered: false,
        },
        { onConflict: "email" }
      );
    } catch (e) {
      // Silent fail — never block checkout
    }
  };

  // Human-friendly labels used in the "please complete …" toast so the
  // customer knows exactly which fields are blocking checkout.
  const FIELD_LABELS: Record<keyof FormData, string> = {
    firstName: "First Name",
    lastName: "Last Name",
    phone: "Phone Number",
    email: "Email Address",
    address: "Street Address",
    city: "City / Town",
    state: "State",
    notes: "Delivery Notes",
    lga: "LGA",
  };

  const validate = () => {
    const fields: (keyof FormData)[] = ["firstName", "lastName", "phone", "email", "address", "city"];
    const e: Partial<FormData> = {};
    const missing: string[] = [];   // fields that are simply empty
    const invalid: string[] = [];   // fields with a format problem
    fields.forEach(key => {
      const err = validateField(key);
      if (!err) return;
      e[key] = err;
      const val = (form[key] || "").trim();
      (val ? invalid : missing).push(FIELD_LABELS[key]);
    });
    setErrors(e);

    if (Object.keys(e).length) {
      const parts: string[] = [];
      if (missing.length) parts.push(`Please complete: ${missing.join(", ")}`);
      if (invalid.length) parts.push(`Fix: ${invalid.join(", ")}`);
      toast.error(parts.join(" · "), { duration: 6000 });

      // Scroll to the first offending field so the customer sees it
      // without hunting for the red outline.
      const firstKey = fields.find(k => e[k]);
      if (firstKey) {
        // Try an explicit id first (set by InputField via label-for), then
        // fall back to a name attribute.
        const el = document.querySelector<HTMLElement>(`[data-field="${firstKey}"], [name="${firstKey}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        (el as HTMLInputElement)?.focus?.();
      }
    }
    return !Object.keys(e).length;
  };

  // Paystack fee per Nigerian card pricing:
  //   1.5% of order total + ₦100 (only for orders > ₦2,500)
  //   capped at ₦2,000.
  const computePaystackFee = (orderTotalNaira: number): number => {
    const base = Math.round(orderTotalNaira * 0.015) + (orderTotalNaira > 2500 ? 100 : 0);
    return Math.min(base, 2000);
  };

  const buildOrderData = (cartItems: typeof cart, paystackRef?: string, paystackStatus?: string) => ({
    timestamp: new Date().toISOString(),
    customerName: `${form.firstName} ${form.lastName}`,
    email: form.email, phone: form.phone, address: form.address, city: form.city, state: form.state,
    deliveryNotes: form.notes,
    items: cartItems,
    itemsSummary: cartItems.map(i => `${i.name} x${i.qty}`).join(", "),
    subtotal, deliveryFee: delivery, serviceFee, giftWrapFee,
    total: grand,
    paymentMethod: payment,
    paymentStatus: payment === "transfer" ? "PENDING_TRANSFER" : "PAID",
    paystackRef: paystackRef || null,
    paystackStatus: paystackStatus || null,
    giftWrap, notes: "",
  });

  const saveOrderToDb = async (orderData: ReturnType<typeof buildOrderData>, cartItems: typeof cart): Promise<SavedOrderResult | null> => {
    try {
      // Get quiz answers from localStorage saved bundle if available
      let quizAnswers: any = null;
      try {
        const savedBundle = localStorage.getItem("bm-saved-bundle");
        if (savedBundle) {
          const parsed = JSON.parse(savedBundle);
          if (parsed.answers) {
            quizAnswers = {
              hospital_type: parsed.answers.hospitalType || null,
              delivery_method: parsed.answers.deliveryMethod || null,
              baby_gender: parsed.answers.gender || null,
              budget_tier: parsed.answers.budget || null,
            };
          }
        }
      } catch {}

      // Check if this is a quiz order
      const sessionId = getSessionId();
      let isQuizOrder = false;
      try {
        const { data: quizMatch } = await supabase
          .from("quiz_customers")
          .select("id")
          .eq("session_id", sessionId)
          .limit(1)
          .maybeSingle();
        isQuizOrder = !!quizMatch;
      } catch {}

      // Get traffic attribution
      const attribution = getAttribution();

      // Use edge function to place order (bypasses RLS SELECT restriction)
      const quizSessionId = localStorage.getItem("bm_quiz_session_id");

      // Build items array and validate before sending. Source priority:
      //   1. cartItems snapshot passed in by placeOrder (already from
      //      localStorage via getLiveCart at button-click time)
      //   2. orderData.items if it carried more rows (defensive)
      //   3. localStorage 'bm-cart' as a final source-of-truth fallback
      let sourceItems: typeof cartItems =
        cartItems && cartItems.length ? cartItems : (orderData.items as typeof cartItems) || [];
      if (!sourceItems.length) {
        try {
          const raw = localStorage.getItem("bm-cart");
          const parsed = raw ? JSON.parse(raw) : null;
          if (Array.isArray(parsed) && parsed.length) sourceItems = parsed;
        } catch {
          // ignore
        }
      }

      const orderItemsPayload = sourceItems
        .filter((item: any) => {
          const productId = item?.id;
          const brandId = item?.selectedBrand?.id;
          if (!productId || !brandId) {
            console.warn("[checkout] item missing productId/brandId, skipping:", item);
            return false;
          }
          return true;
        })
        .map((item: any) => ({
          name: item.name,
          brandName: item.selectedBrand?.label || "Standard",
          brandId: item.selectedBrand?.id,
          productId: item.id,
          qty: Number(item.qty) || 1,
          price: Number(item.price) || 0,
          size: item.selectedSize || null,
          color: item.selectedColor || null,
          bundleName: item.bundleName || null,
        }));

      if (!orderItemsPayload.length) {
        console.error(
          "[checkout] items array is empty after filter — cart snapshot:",
          cartItems,
          "orderData.items:",
          orderData.items,
        );
        toast.error("Could not process cart items. Please refresh and try again.");
        return null;
      }

      console.log(
        `[checkout] sending ${orderItemsPayload.length} items to place-order`,
        orderItemsPayload,
      );

      const { data: result, error: fnError } = await supabase.functions.invoke("place-order", {
        body: {
          order: {
            customer_name: `${form.firstName} ${form.lastName}`,
            customer_email: form.email,
            customer_phone: form.phone,
            delivery_address: form.address,
            delivery_city: form.city,
            delivery_state: form.state,
            delivery_notes: form.notes || null,
            subtotal: orderData.subtotal,
            delivery_fee: orderData.deliveryFee,
            service_fee: orderData.serviceFee,
            total: orderData.total,
            discount: 0,
            discount_amount: couponDiscount > 0 ? couponDiscount : 0,
            coupon_id: appliedCoupon?.id || null,
            referral_code_used: appliedReferral?.code || null,
            spend_discount_amount: spendDiscount > 0 ? spendDiscount : 0,
            spend_discount_percent: spendPrompt?.currentDiscount?.discount_percent || null,
            payment_reference: orderData.paystackRef,
            payment_status: orderData.paymentStatus === "PAID" ? "paid" : "pending",
            payment_method: orderData.paymentMethod,
            order_status: "confirmed",
            gift_wrapping: orderData.giftWrap,
            estimated_delivery_start: fromDate.toISOString().split("T")[0],
            estimated_delivery_end: toDate.toISOString().split("T")[0],
            quiz_answers: quizAnswers,
            is_quiz_order: isQuizOrder,
            is_bundle_order: cart.some(i => !!i.bundleName),
            utm_source: attribution.utm_source,
            utm_medium: attribution.utm_medium,
            utm_campaign: attribution.utm_campaign,
            utm_content: attribution.utm_content,
            utm_term: attribution.utm_term,
            traffic_source: attribution.traffic_source,
            referrer: attribution.referrer,
            landing_page: attribution.landing_page,
            // Financial fields — give the finance dashboard data from
            // the moment the order is placed. Kobo → naira for partner_cost.
            // Express orders defer delivery to a second Paystack link, so
            // every delivery-cost field is nulled and the server side
            // double-enforces this.
            partner_cost: isExpressOrder ? 0 : Math.round((courierQuote?.partnerCostKobo || 0) / 100),
            actual_courier_partner: isExpressOrder ? null : (courierQuote?.partner || null),
            delivery_partner: isExpressOrder ? null : undefined,
            paystack_fee: computePaystackFee(orderData.total),
            packaging_cost: 0,
            // Express Order flags — server enforces subtotal floor and
            // acknowledgment, but the client matches for UX.
            is_express_order: isExpressOrder,
            express_acknowledged: isExpressOrder ? expressAcknowledged : false,
          },
          items: orderItemsPayload,
          customer: {
            email: form.email,
            name: `${form.firstName} ${form.lastName}`,
            phone: form.phone,
            address: form.address,
            city: form.city,
            state: form.state,
          },
          quiz: {
            sessionId: quizSessionId || sessionId,
          },
          referral: appliedReferral ? {
            referral_code_id: appliedReferral.id,
            discount_amount: appliedReferral.discount_amount,
            redeemer_email: form.email,
            redeemer_phone: form.phone,
          } : null,
        },
      });

      if (fnError || !result?.id) {
        console.error("place-order failed:", fnError, result);
        // HTTP 409 — the edge function rejected the order because one
        // or more items are out of stock. Surface each issue inline
        // and highlight the affected cart items so the customer can
        // fix their cart and retry. We DO NOT clear the cart here.
        try {
          const anyErr = fnError as any;
          // supabase-js wraps non-2xx errors in FunctionsHttpError;
          // the raw response is on error.context. Also accept the
          // issues on the parsed `result` body when the status is
          // surfaced via data rather than error.
          const bodyFromCtx = anyErr?.context?.status === 409
            ? await anyErr.context.clone().json().catch(() => null)
            : null;
          const payload = bodyFromCtx || result || null;
          const issues: StockIssue[] = Array.isArray(payload?.stock_issues) ? payload.stock_issues : [];
          if (issues.length > 0) {
            setStockIssues(issues);
            toast.error("Please update your cart before continuing.");
            return null;
          }
        } catch (e) {
          console.warn("[checkout] unable to parse stock-error body", e);
        }
        toast.error(`Order failed: ${fnError?.message || result?.error || "Unknown error"}`);
        return null;
      }

      // Mark session as converted
      markSessionConverted();

      // Track order_placed event
      trackEvent("order_placed", {
        order_id: result.id,
        order_number: result.order_number,
        total: orderData.total,
        item_count: cart.length,
      });

      // Belt-and-braces financial fields write — in case the edge
      // function dropped the new keys, we stamp them directly on the
      // order row so the finance dashboard has data immediately.
      try {
        const partnerCostNaira = Math.round((courierQuote?.partnerCostKobo || 0) / 100);
        const fee = computePaystackFee(orderData.total);
        await (supabase.from("orders") as any).update({
          partner_cost: partnerCostNaira,
          actual_courier_partner: courierQuote?.partner || null,
          paystack_fee: fee,
          packaging_cost: 0,
        }).eq("id", result.id);
      } catch (err) {
        console.warn("Financial fields backfill skipped:", err);
      }

      // Persist the courier assignment derived from the live checkout
      // quote — partner + internal routing note. If we happen not to
      // have a cached quote (e.g. the customer placed the order before
      // it returned) we refetch once here so the order record is still
      // complete.
      try {
        let partner = courierQuote?.partner || null;
        let note = courierQuote?.note || null;
        if (!partner || !note) {
          const { data } = await (supabase.rpc as any)("get_courier_assignment", {
            p_delivery_city: form.city,
            p_delivery_state: form.state,
            p_bundle_tier: quizAnswers?.budget_tier || "standard",
            p_order_day: new Date().toLocaleDateString("en-US", { weekday: "long" }),
            p_daily_order_count: 1,
            p_order_weight_kg: cartWeightKg,
            p_order_subtotal: orderData.subtotal,
          });
          partner = partner || data?.partner || null;
          note = note || data?.note || null;
        }
        if (partner || note) {
          await (supabase.from("orders") as any).update({
            delivery_partner: partner,
            courier_note: note,
          }).eq("id", result.id);
        }
      } catch (err) {
        console.warn("Courier assignment skipped:", err);
      }

      return { id: result.id, orderNumber: result.order_number };
    } catch (e) {
      console.error("DB save failed:", e);
      return null;
    }
  };

  // Source-of-truth cart read at call time — defends against React state
  // batching / async timing where `cart` may not yet reflect the most
  // recent add. localStorage is written eagerly in CartProvider's effect,
  // so it's always at least as fresh as React state. We prefer whichever
  // has more items.
  const getLiveCart = (): typeof cart => {
    let lsItems: typeof cart = [];
    try {
      const raw = localStorage.getItem("bm-cart");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) lsItems = parsed;
      }
    } catch {
      // ignore parse errors; fall back to React state
    }
    if (lsItems.length >= cart.length && lsItems.length > 0) return lsItems;
    return [...cart];
  };

  const placeOrder = async () => {
    const cartSnapshot = getLiveCart();
    if (!cartSnapshot.length) {
      toast.error("Your cart is empty. Please add items before checking out.");
      navigate("/cart");
      return;
    }
    if (!validate()) return;
    if (notDeliverable) {
      toast.error(`Sorry, we don't currently deliver to ${form.city || "this area"}. Please contact us on WhatsApp.`);
      return;
    }
    setStockIssues([]);
    setProcessing(true);

    if (payment === "transfer") {
      const orderData = buildOrderData(cartSnapshot);
      const savedOrder = await saveOrderToDb(orderData, cartSnapshot);
      if (!savedOrder) {
        setProcessing(false);
        toast.error("We couldn't place your order. Please try again.");
        return;
      }
      await syncOrderToSheets({
        orderId: savedOrder.id,
        orderNumber: savedOrder.orderNumber,
        fallbackData: orderData,
      });
      clearCart();
      navigate(`/order-confirmed?order=${encodeURIComponent(savedOrder.orderNumber || "")}`);
      return;
    }

    // Read + validate the Paystack public key BEFORE the try/catch below —
    // the catch falls back to a DEMO order on any error, which would
    // silently mask a misconfigured environment and produce a fake paid
    // order. Throwing up here stops the flow and surfaces the misconfig.
    const paystackKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
    if (!paystackKey) {
      setProcessing(false);
      toast.error("Paystack public key is not configured. Contact support.");
      throw new Error("Paystack public key is not configured. Set VITE_PAYSTACK_PUBLIC_KEY in your environment variables.");
    }

    try {
      const PaystackPop = (await import("@paystack/inline-js")).default;
      const popup = new PaystackPop();
      pixelTrack("AddPaymentInfo", pixelMoney(grand));
      popup.newTransaction({
        key: paystackKey,
        email: form.email, amount: grand * 100, currency: "NGN",
        ref: `BM-${Date.now()}`, firstname: form.firstName, lastname: form.lastName,
        channels: payment === "ussd" ? ["ussd"] : ["card", "bank_transfer", "ussd", "qr", "mobile_money", "bank"],
        onSuccess: async (transaction: { reference: string; status: string }) => {
          const orderData = buildOrderData(cartSnapshot, transaction.reference, "pending");
          const savedOrder = await saveOrderToDb(orderData, cartSnapshot);
          if (!savedOrder) {
            setProcessing(false);
            toast.error("We couldn't place your order. Please try again.");
            return;
          }

          const { data: verification, error: verifyError } = await supabase.functions.invoke("process-payment", {
            body: { reference: transaction.reference, order_id: savedOrder.orderNumber },
          });

          if (verifyError || !verification?.verified) {
            setProcessing(false);
            toast.error("Payment verification failed. Please contact support.");
            return;
          }

          await syncOrderToSheets({
            orderId: savedOrder.id,
            orderNumber: savedOrder.orderNumber,
            fallbackData: orderData,
          });
          clearCart();
          navigate(`/order-confirmed?order=${encodeURIComponent(savedOrder.orderNumber || "")}`);
        },
        onCancel: () => { setProcessing(false); toast.error("Payment cancelled"); },
      });
    } catch {
      const orderData = buildOrderData(cartSnapshot, "DEMO-" + Date.now(), "success");
      const savedOrder = await saveOrderToDb(orderData, cartSnapshot);
      if (!savedOrder) {
        setProcessing(false);
        toast.error("We couldn't place your order. Please try again.");
        return;
      }
      await syncOrderToSheets({
        orderId: savedOrder.id,
        orderNumber: savedOrder.orderNumber,
        fallbackData: orderData,
      });
      clearCart();
      navigate(`/order-confirmed?order=${encodeURIComponent(savedOrder.orderNumber || "")}`);
    }
  };

  if (processing) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "transparent" }}>
        <div className="text-center animate-fade-up">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <BMLoadingAnimation size={180} />
          </div>
          <p className="pf text-lg text-forest">Confirming your order...</p>
          <p className="font-body text-sm text-text-med mt-1">Please don't close this page 🔒</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-[calc(1rem+64px)] md:pb-0">
      <div className="pt-20" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
        <div className="max-w-[1100px] mx-auto px-4 md:px-10 py-8 md:py-10">
          <Link to="/cart" className="text-primary-foreground/50 text-xs hover:text-primary-foreground/70 transition-colors">← Back to Cart</Link>
          <h1 className="pf text-2xl md:text-4xl text-primary-foreground mt-2">🔒 Secure Checkout</h1>
          <p className="text-primary-foreground/50 text-xs mt-2 font-body">Guest Checkout — no account needed. We only use your details to deliver your order.</p>
          <div className="flex items-center gap-2 mt-3">
            {["Delivery Details", "Payment"].map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground ${i === 0 ? "bg-coral" : "bg-primary-foreground/25"}`}>{i + 1}</div>
                <span className="text-primary-foreground/75 text-xs">{s}</span>
                {i < 1 && <span className="text-primary-foreground/30 ml-1">›</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 md:px-10 py-6 md:py-10">
        {/* Mobile order summary toggle */}
        <div className="lg:hidden mb-4">
          <button onClick={() => setMobileOrderOpen(!mobileOrderOpen)} className="w-full bg-card rounded-card shadow-card p-4 flex justify-between items-center">
            <span className="font-body font-semibold text-sm">{totalItems} items · {fmt(grand)}</span>
            <span className="flex items-center gap-1 text-forest text-xs font-semibold">
              {mobileOrderOpen ? "Hide" : "View details"} {mobileOrderOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          </button>
          {mobileOrderOpen && (
            <div className="bg-card rounded-b-card shadow-card p-4 -mt-1 animate-fade-in space-y-2">
              {cart.map(item => {
                const flagged = cartItemHasIssue(item, stockIssues);
                return (
                  <div key={item._key} className={`flex items-center justify-between gap-2 text-xs ${flagged ? "border border-destructive/40 bg-destructive/5 rounded-md p-1.5" : ""}`}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {(() => {
                        const url = cartItemImage(item);
                        if (url !== "/placeholder.svg") {
                          return <img src={url} alt={item.name} loading="lazy" className="w-12 h-12 rounded-md object-cover border border-border bg-warm-cream flex-shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }} />;
                        }
                        return (item.img && item.img.startsWith("http"))
                          ? <img src={item.img} alt={item.name} loading="lazy" className="w-12 h-12 rounded-md object-cover border border-border bg-warm-cream flex-shrink-0" />
                          : <span className="text-2xl w-12 h-12 flex items-center justify-center rounded-md bg-warm-cream border border-border flex-shrink-0">{item.img || "📦"}</span>;
                      })()}
                      <span className="truncate">{item.bundleName ? `[${item.bundleName}] ` : ""}{item.name} ×{item.qty}</span>
                      {flagged && <span className="text-[9px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-pill flex-shrink-0">Out of stock</span>}
                    </div>
                    <span className="font-bold">{fmt(item.price * item.qty)}</span>
                  </div>
                );
              })}
              <div className="border-t border-border pt-2 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-text-med">Subtotal</span><span>{fmt(subtotal)}</span></div>
                {isExpressOrder ? (
                  <div className="flex justify-between items-baseline">
                    <span className="text-text-med">Delivery</span>
                    <span className="italic text-text-light text-[13px]">Will be communicated to you</span>
                  </div>
                ) : qualifiesForNationwideFree ? (
                  <div className="flex justify-between items-start">
                    <span className="text-text-med">
                      Delivery
                      {nationwideHelper && (
                        <span className="block text-[10px] text-forest mt-0.5 font-medium">{nationwideHelper}</span>
                      )}
                    </span>
                    <span className="text-forest font-semibold whitespace-nowrap">{nationwideLabel}</span>
                  </div>
                ) : deliveryReady ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-text-med">
                        Delivery ({deliveryCalc.zoneName})
                        {quoteLoading ? null : (courierQuote?.isFreeDelivery) ? (
                          <span className="block text-[10px] text-forest mt-0.5 font-semibold">
                            🎉 Free delivery on orders over ₦200,000
                          </span>
                        ) : (hasQuote && (deliveryCalc as any).bookingsNeeded) ? (
                          <span className="block text-[10px] text-text-light mt-0.5">
                            ~{Number((deliveryCalc as any).weightKg).toFixed(1)}kg order · {(deliveryCalc as any).bookingsNeeded} booking{(deliveryCalc as any).bookingsNeeded === 1 ? "" : "s"} · {deliveryCalc.daysMin}–{deliveryCalc.daysMax} business days
                          </span>
                        ) : null}
                      </span>
                      <span className={delivery === 0 ? "text-forest" : ""}>
                        {courierQuote?.isFreeDelivery ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-forest/10 text-forest text-[10px] font-bold uppercase tracking-wide">Free Delivery</span>
                        ) : quoteLoading ? (
                          <span className="text-text-light italic">Calculating…</span>
                        ) : (delivery === 0 ? "FREE 🎉" : fmt(delivery))}
                      </span>
                    </div>
                    {notDeliverable && (
                      <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-2 py-1.5 mt-1">
                        Sorry, we don't currently deliver to {form.city || "this area"}. Please contact us on WhatsApp for assistance.
                      </div>
                    )}
                    {quoteError && !quoteLoading && !notDeliverable && (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1">
                        {quoteError}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[11px] text-text-med bg-muted/40 rounded-lg px-2 py-1.5">
                    📍 Delivery fee will appear once you {stateHasZones ? "select your zone, LGA or area" : "enter your state"}.
                  </div>
                )}
                <div className="flex justify-between"><span className="text-text-med">{serviceFeeLabel}</span><span>{fmt(serviceFee)}</span></div>
                {giftWrap && <div className="flex justify-between"><span className="text-text-med">Gift Wrapping</span><span>{fmt(giftWrapPrice)}</span></div>}
                {couponDiscount > 0 && <div className="flex justify-between text-forest"><span>🏷️ Coupon ({appliedCoupon?.code})</span><span>-{fmt(couponDiscount)}</span></div>}
                {referralDiscount > 0 && <div className="flex justify-between text-forest"><span>🎁 Referral ({appliedReferral?.code})</span><span>-{fmt(referralDiscount)}</span></div>}
                {spendDiscount > 0 && <div className="flex justify-between text-forest"><span>🎉 Spend Discount</span><span>-{fmt(spendDiscount)}</span></div>}
                <div className="flex justify-between font-bold text-sm pt-1"><span>Total</span><span className="text-forest">{fmt(grand)}</span></div>
                <div className="text-[10px] text-text-light mt-1">🚚 Est. {fmtDate(fromDate)} – {fmtDate(toDate)}</div>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {/* Free nationwide nudge — only when the shopper is in the
                70–100% window and the master switch is on. */}
            {nationwideEnabled && !stateRequiresExpress && nationwideMarketing && subtotal < nationwideThreshold && subtotal >= nationwideThreshold * 0.7 && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                <p className="text-emerald-900 text-sm font-medium">{nationwideMarketing}</p>
                <p className="text-emerald-700 text-xs mt-1">
                  Add ₦{(nationwideThreshold - subtotal).toLocaleString("en-NG")} more to qualify!
                </p>
              </div>
            )}

            {/* Delivery Details */}
            <div className="bg-card rounded-card shadow-card p-4 md:p-8">
              <h2 className="pf text-lg mb-4">📍 Delivery Details</h2>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col md:flex-row gap-3">
                  <InputField name="firstName" label="First Name" value={form.firstName} onChange={v => update("firstName", v)} onBlur={() => handleBlur("firstName")} error={errors.firstName} />
                  <InputField name="lastName" label="Last Name" value={form.lastName} onChange={v => update("lastName", v)} onBlur={() => handleBlur("lastName")} error={errors.lastName} />
                </div>
                <div className="flex flex-col md:flex-row gap-3">
                  <InputField name="phone" label="Phone Number" value={form.phone} onChange={v => update("phone", v)} onBlur={() => handleBlur("phone")} error={errors.phone} type="tel" placeholder="08012345678" />
                  <InputField name="email" label="Email Address" value={form.email} onChange={v => update("email", v)} onBlur={() => { handleBlur("email"); saveAbandonedCart(); }} error={errors.email} type="email" placeholder="you@example.com" />
                </div>
                <InputField name="address" label="Street Address" value={form.address} onChange={v => update("address", v)} onBlur={() => handleBlur("address")} error={errors.address} />

                {/* State → Zone → LGA → City cascade */}
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-med uppercase tracking-wide">State</label>
                    {statesLoading ? (
                      <div className="w-full h-[42px] rounded-[10px] border-[1.5px] border-border bg-muted/40 animate-pulse" aria-label="Loading states" />
                    ) : (
                      <select
                        value={form.state}
                        onChange={e => {
                          const nextState = e.target.value;
                          update("state", nextState);
                          setSelectedZone(null);
                          setSelectedLga("");
                          update("city", "");
                          setForm(p => ({ ...p, lga: "" }));
                        }}
                        className="w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none transition-colors"
                      >
                        {(deliverableStates || []).map(s => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {stateHasZones && (
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs font-semibold text-text-med uppercase tracking-wide">Delivery Zone</label>
                      <select
                        value={selectedZone?.id || ""}
                        onChange={e => {
                          const zone = zonesForState.find(z => z.id === e.target.value) || null;
                          setSelectedZone(zone);
                          setSelectedLga("");
                          update("city", "");
                          setForm(p => ({ ...p, lga: "" }));
                        }}
                        className="w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none transition-colors"
                      >
                        <option value="">Select your delivery zone</option>
                        {zonesForState.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* LGA — only when a zone is selected */}
                {stateHasZones && selectedZone && lgasForZone.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-text-med uppercase tracking-wide">Local Government Area</label>
                    <select
                      value={selectedLga}
                      onChange={e => {
                        const next = e.target.value;
                        setSelectedLga(next);
                        update("city", "");
                        setForm(p => ({ ...p, lga: next }));
                      }}
                      className="w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none transition-colors"
                    >
                      <option value="">Select your LGA</option>
                      {lgasForZone.map(l => <option key={l.lga} value={l.lga}>{l.lga}</option>)}
                    </select>
                  </div>
                )}

                {/* City / Town — only when an LGA is selected */}
                {stateHasZones && selectedZone && selectedLga && (
                  areasForLga.length === 1 ? (
                    <InputField label="City / Town" value={form.city} onChange={() => {}} disabled />
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-text-med uppercase tracking-wide">City / Town</label>
                      <select
                        name="city"
                        data-field="city"
                        value={form.city}
                        onChange={e => update("city", e.target.value)}
                        onBlur={() => handleBlur("city")}
                        className={`w-full rounded-[10px] border-[1.5px] px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none transition-colors ${errors.city ? "border-destructive" : "border-border"}`}
                      >
                        <option value="">Select your area</option>
                        {areasForLga.map(area => <option key={area} value={area}>{area}</option>)}
                      </select>
                      {errors.city && <p className="text-destructive text-[11px]">{errors.city}</p>}
                    </div>
                  )
                )}

                {/* Non-Lagos states — free-text city/town fallback */}
                {!stateHasZones && (
                  <InputField name="city" label="City / Town" value={form.city} onChange={v => update("city", v)} onBlur={() => handleBlur("city")} error={errors.city} />
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-text-med uppercase tracking-wide">Delivery Notes (Optional)</label>
                  <textarea value={form.notes} onChange={e => update("notes", e.target.value)} className="w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body resize-y h-20 focus:border-forest outline-none" placeholder="E.g. Landmark, gate colour..." />
                </div>

                {/* Gift Wrapping */}
                <div onClick={() => setGiftWrap(g => !g)} className={`mt-1 flex items-center gap-3.5 p-4 rounded-[14px] border-2 cursor-pointer transition-all ${giftWrap ? "border-[#FFD54F] bg-[#FFF8E1]" : "border-border bg-warm-cream"}`}>
                  <span className="text-3xl flex-shrink-0">🎀</span>
                  <div className="flex-1">
                    <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                      Add Gift Wrapping
                      <span className="bg-[#FFD54F] text-[#7B5E00] text-[10px] px-2 py-0.5 rounded-[10px] font-bold">+{fmt(giftWrapPrice)}</span>
                    </div>
                    <div className="text-text-med text-xs mt-0.5">Premium gift box · satin ribbon · handwritten card · branded tissue paper</div>
                  </div>
                  <div className={`w-5 h-5 rounded-md flex-shrink-0 border-2 flex items-center justify-center transition-all ${giftWrap ? "border-[#F9A825] bg-[#F9A825]" : "border-border bg-card"}`}>
                    {giftWrap && <span className="text-primary-foreground text-xs font-bold">✓</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Express Order — only surfaces for carts at the floor or
                above. When enabled, the address-driven delivery quote is
                ignored and replaced with a "to be quoted" placeholder in
                the order summary; the server enforces both rules. */}
            {/* Master OFF + Express-Only state — the customer's state
                requires Express, but admin has disabled the feature. No
                standard couriers either; block submit and surface the
                WhatsApp CTA. */}
            {!expressEnabled && stateRequiresExpress && (
              <div className="bg-red-50 border border-red-300 rounded-card p-4 md:p-5">
                <p className="text-base font-bold text-red-900">
                  Delivery to {activeState?.name} is currently unavailable
                </p>
                <p className="text-sm text-red-800 mt-1.5">
                  We're not accepting {expressDisplayName} orders right now. Please contact us on WhatsApp to discuss your order.
                </p>
                {whatsappNumber && (
                  <a
                    href={`https://wa.me/${whatsappNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 bg-[#25D366] text-white text-sm font-bold px-6 py-2.5 rounded-full hover:opacity-90"
                  >
                    Chat on WhatsApp
                  </a>
                )}
              </div>
            )}

            {showExpressCard && (
              <div className="bg-card rounded-card shadow-card p-4 md:p-6 border-l-4 border-amber-400">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h2 className="pf text-lg flex items-center gap-2">
                      ⚡ {expressDisplayName}
                      {!stateRequiresExpress && minEnforced && (
                        <span className="text-[11px] font-semibold text-text-light">(₦{expressMinSubtotal.toLocaleString("en-NG")}+ orders)</span>
                      )}
                    </h2>
                    <p className="text-text-med text-xs mt-1 max-w-[520px] leading-relaxed">
                      Get your order shipped fast. We will quote your delivery fee {slaLabel} via WhatsApp after you complete payment.
                    </p>
                    {/* Eligibility helper line — adapts to whether the
                        floor is enforced and whether the state forces
                        Express. */}
                    <p className="text-[11px] font-semibold mt-2 text-text-light">
                      {stateRequiresExpress
                        ? `${expressDisplayName} is required for delivery to ${form.state}.`
                        : minEnforced
                        ? `Minimum cart size of ₦${expressMinSubtotal.toLocaleString("en-NG")} required for ${expressDisplayName}.`
                        : `${expressDisplayName} available for any order size.`}
                    </p>
                  </div>
                  <label className={`inline-flex items-center gap-2 select-none ${stateRequiresExpress ? "cursor-not-allowed opacity-90" : "cursor-pointer"}`}>
                    <span className="text-xs font-semibold text-text-med">{isExpressOrder ? "ON" : "OFF"}</span>
                    <input
                      type="checkbox"
                      checked={isExpressOrder}
                      disabled={stateRequiresExpress}
                      onChange={(e) => {
                        setIsExpressOrder(e.target.checked);
                        if (!e.target.checked) setExpressAcknowledged(false);
                      }}
                      className="sr-only peer"
                    />
                    <span className="w-11 h-6 rounded-full bg-muted peer-checked:bg-amber-500 peer-disabled:opacity-80 transition relative before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-5 before:h-5 before:rounded-full before:bg-white before:transition peer-checked:before:translate-x-5" />
                  </label>
                </div>

                {stateRequiresExpress && (
                  <div className="mt-4 rounded-xl border border-blue-300 bg-blue-50 p-3 text-blue-900 text-[13px] leading-relaxed">
                    <p className="font-semibold flex items-center gap-1.5">ℹ️ Delivery to {form.state} is available via {expressDisplayName} only.</p>
                    <p className="mt-1">
                      Standard couriers don't deliver to this area. Our team will send your delivery quote {slaLabel} via WhatsApp after you complete payment.
                    </p>
                  </div>
                )}

                {isExpressOrder && (
                  <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">⚠️ IMPORTANT — Please read before continuing</p>
                    {expressAckText && (
                      <div
                        className="mt-2 text-[13px] text-amber-900 leading-relaxed"
                        style={{ whiteSpace: "pre-line" }}
                      >
                        {expressAckText}
                      </div>
                    )}
                    <label className="mt-3 flex items-start gap-2 cursor-pointer min-h-[44px]">
                      <input
                        type="checkbox"
                        checked={expressAcknowledged}
                        onChange={(e) => setExpressAcknowledged(e.target.checked)}
                        className="mt-0.5 w-5 h-5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm font-semibold text-amber-900">I understand and accept these terms</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Coupon Code */}
            <div className="bg-card rounded-card shadow-card p-4 md:p-8">
              <h2 className="pf text-lg mb-4">🏷️ Have a Coupon?</h2>
              {appliedReferral ? (
                <div className="text-text-light text-xs">Cannot combine with referral code. Remove your referral code to use a coupon.</div>
              ) : appliedCoupon ? (
                <div className="flex items-center justify-between bg-forest-light rounded-[10px] p-3">
                  <div>
                    <span className="text-forest font-bold text-sm">{appliedCoupon.code}</span>
                    <span className="text-forest text-xs ml-2">— saving {fmt(couponDiscount)}</span>
                  </div>
                  <button onClick={() => { setAppliedCoupon(null); setCouponCode(""); }} className="text-destructive text-xs font-semibold hover:underline">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} placeholder="Enter coupon code"
                    className="flex-1 rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none uppercase" />
                  <button onClick={applyCoupon} disabled={couponLoading}
                    className="rounded-[10px] bg-forest px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-forest-deep disabled:opacity-50 font-body">
                    {couponLoading ? "..." : "Apply"}
                  </button>
                </div>
              )}
            </div>

            {/* Referral Code */}
            <div className="bg-card rounded-card shadow-card p-4 md:p-8">
              <h2 className="pf text-lg mb-4">🎁 Referral Code</h2>
              {appliedCoupon ? (
                <div className="text-text-light text-xs">Cannot combine with coupon. Remove your coupon to use a referral code.</div>
              ) : appliedReferral ? (
                <div className="flex items-center justify-between bg-forest-light rounded-[10px] p-3">
                  <div>
                    <span className="text-forest font-bold text-sm">{appliedReferral.code}</span>
                    <span className="text-forest text-xs ml-2">— saving {fmt(referralDiscount)}</span>
                  </div>
                  <button onClick={() => { setAppliedReferral(null); setReferralCode(""); }} className="text-destructive text-xs font-semibold hover:underline">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={referralCode} onChange={e => setReferralCode(e.target.value.toUpperCase())} placeholder="Enter referral code"
                    className="flex-1 rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none uppercase" />
                  <button onClick={applyReferral} disabled={referralLoading}
                    className="rounded-[10px] bg-forest px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-forest-deep disabled:opacity-50 font-body">
                    {referralLoading ? "..." : "Apply"}
                  </button>
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="bg-card rounded-card shadow-card p-4 md:p-8">
              <h2 className="pf text-lg mb-4">💳 Payment Method</h2>
              <div className="flex flex-col gap-2.5">
                {(() => {
                  const allMethods = [
                    { id: "card" as const, icon: "💳", label: "Card Payment", sub: "Visa, Mastercard, Verve — instant" },
                    { id: "transfer" as const, icon: "🏦", label: "Bank Transfer", sub: "Pay directly to our account" },
                    { id: "ussd" as const, icon: "📱", label: "USSD / Mobile Money", sub: "*737#, *901# and more" },
                  ];
                  const visible = allMethods.filter(m => enabledPayments[m.id]);
                  if (visible.length === 0) return (
                    <div className="bg-[#FFF4D6] border border-[#F59E0B]/40 rounded-xl p-4 text-center text-sm text-[#78350F]">
                      Payment is temporarily unavailable. Please contact us on <a href={`https://wa.me/${settings?.whatsapp_number || "2347040667424"}`} target="_blank" rel="noopener noreferrer" className="font-bold underline">WhatsApp</a>.
                    </div>
                  );
                  return visible.map(m => (
                    <button key={m.id} onClick={() => selectPayment(m.id)} className={`flex items-center gap-3.5 p-4 rounded-[14px] border-2 text-left transition-all font-body ${payment === m.id ? "border-forest bg-forest-light" : "border-border bg-card"}`}>
                      <span className="text-xl">{m.icon}</span>
                      <div className="flex-1">
                        <div className="font-bold text-sm">{m.label}</div>
                        <div className="text-text-med text-xs mt-0.5">{m.sub}</div>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${payment === m.id ? "border-forest" : "border-border"}`}>
                        {payment === m.id && <div className="w-2 h-2 rounded-full bg-forest" />}
                      </div>
                    </button>
                  ));
                })()}
              </div>
              {payment === "card" && (
                <div className="mt-3 bg-warm-cream rounded-lg p-3.5 animate-fade-in">
                  <div className="text-text-med text-[13px] flex items-center gap-1.5 mb-2"><span>🔒</span> You'll be redirected to Paystack's secure checkout.</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {["Visa", "Mastercard", "Verve"].map(c => (
                      <span key={c} className="bg-card border border-border px-2 py-0.5 rounded-md text-[11px] text-text-med">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {payment === "transfer" && bankName && bankAccountNumber && (
                <div className="mt-3 bg-warm-cream rounded-lg p-3.5 animate-fade-in">
                  <div className="font-semibold text-[13px] mb-2">Bank Transfer Details</div>
                  {[["Bank", bankName], ["Account Name", bankAccountName], ["Account Number", bankAccountNumber]].map(([k, v]) => (
                    <div key={k} className="flex gap-2 mb-1"><span className="text-text-light text-xs min-w-[90px]">{k}:</span><span className="text-xs font-semibold">{v}</span></div>
                  ))}
                  <div className="mt-2.5 text-coral text-xs">⚠️ Send exact amount, use your phone number as reference.</div>
                </div>
              )}
            </div>

            {stockIssues.length > 0 && (
              <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs">
                <p className="font-semibold text-destructive mb-2">Some items are no longer available:</p>
                <ul className="space-y-1 text-destructive/90">
                  {stockIssues.map((iss, i) => {
                    const who = iss.brand_name || iss.product_name || "This item";
                    if (iss.available != null && iss.requested != null) {
                      return <li key={i}>• Only {iss.available} unit{iss.available === 1 ? "" : "s"} of {who} available (you have {iss.requested} in your cart).</li>;
                    }
                    return <li key={i}>• {iss.message || `${who} is out of stock.`}</li>;
                  })}
                </ul>
                <Link to="/cart" className="inline-block mt-2 text-destructive font-semibold underline">Update your cart →</Link>
              </div>
            )}

            <button
              onClick={placeOrder}
              disabled={
                processing
                || (!expressEnabled && stateRequiresExpress)
                || (isExpressOrder
                    ? !expressAcknowledged
                    : (notDeliverable || quoteLoading || !deliveryReady))
              }
              className="w-full rounded-pill bg-forest py-4 text-center font-body font-semibold text-primary-foreground hover:bg-forest-deep interactive text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing
                ? "Processing…"
                : isExpressOrder
                ? <>Place {expressDisplayName} — {fmt(grand)} 🔒</>
                : !deliveryReady
                ? (stateHasZones ? "Select your delivery area to continue" : "Enter your state to continue")
                : notDeliverable
                ? "Delivery unavailable to this area"
                : quoteLoading
                ? "Calculating delivery…"
                : <>Place Order — {fmt(grand)} 🔒</>}
            </button>
            {isExpressOrder && !expressAcknowledged && (
              <p className="text-center text-amber-700 text-[12px] mt-2">
                Please accept the {expressDisplayName} terms above to continue.
              </p>
            )}
            <div className="text-center text-text-light text-[11px]">By placing your order, you agree to our <Link to="/terms" className="underline">Terms of Service</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link></div>
          </div>

          {/* Order Summary Sidebar */}
          <div className="hidden lg:block">
            <div className="bg-card rounded-card shadow-card p-6 sticky top-24">
              <h2 className="pf text-lg mb-4">Order Summary</h2>
              <div className="max-h-[260px] overflow-y-auto mb-4 space-y-3">
                {cart.map(item => (
                  <div key={item._key} className="flex items-center gap-3 pb-3 border-b border-border/50">
                    <div className="w-12 h-12 bg-warm-cream rounded-md flex items-center justify-center text-xl flex-shrink-0 overflow-hidden border border-border">
                      {(() => {
                        const url = cartItemImage(item);
                        if (url !== "/placeholder.svg") {
                          return <img src={url} alt={item.name} loading="lazy" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }} />;
                        }
                        return (item.img && item.img.startsWith("http"))
                          ? <img src={item.img} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                          : (item.img || "📦");
                      })()}
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.bundleName && <div className="text-[9px] font-bold text-coral mb-0.5 truncate">📦 {item.bundleName}</div>}
                      <div className="text-xs font-semibold leading-tight truncate">{item.name}</div>
                      {item.selectedBrand && <div className="text-forest text-[10px] mt-0.5">{item.selectedBrand.label} · Qty {item.qty}</div>}
                    </div>
                    <div className="font-bold text-[13px] flex-shrink-0">{fmt(item.price * item.qty)}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2 font-body text-[13px]">
                <div className="flex justify-between"><span className="text-text-med">Subtotal ({totalItems} items)</span><span>{fmt(subtotal)}</span></div>
                {isExpressOrder ? (
                  <div className="flex justify-between items-baseline">
                    <span className="text-text-med">Delivery</span>
                    <span className="italic text-text-light text-[13px]">Will be communicated to you</span>
                  </div>
                ) : qualifiesForNationwideFree ? (
                  <div className="flex justify-between items-start">
                    <span className="text-text-med">
                      Delivery
                      {nationwideHelper && (
                        <span className="block text-[10px] text-forest mt-0.5 font-medium">{nationwideHelper}</span>
                      )}
                    </span>
                    <span className="text-forest font-semibold whitespace-nowrap">{nationwideLabel}</span>
                  </div>
                ) : deliveryReady ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-text-med">
                        Delivery ({deliveryCalc.zoneName})
                        {quoteLoading ? null : (courierQuote?.isFreeDelivery) ? (
                          <span className="block text-[10px] text-forest mt-0.5 font-semibold">
                            🎉 Free delivery on orders over ₦200,000
                          </span>
                        ) : (hasQuote && (deliveryCalc as any).bookingsNeeded) ? (
                          <span className="block text-[10px] text-text-light mt-0.5">
                            ~{Number((deliveryCalc as any).weightKg).toFixed(1)}kg order · {(deliveryCalc as any).bookingsNeeded} booking{(deliveryCalc as any).bookingsNeeded === 1 ? "" : "s"} · {deliveryCalc.daysMin}–{deliveryCalc.daysMax} business days
                          </span>
                        ) : null}
                      </span>
                      <span className={delivery === 0 ? "text-forest" : ""}>
                        {courierQuote?.isFreeDelivery ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-forest/10 text-forest text-[10px] font-bold uppercase tracking-wide">Free Delivery</span>
                        ) : quoteLoading ? (
                          <span className="text-text-light italic">Calculating…</span>
                        ) : (delivery === 0 ? "FREE 🎉" : fmt(delivery))}
                      </span>
                    </div>
                    {notDeliverable && (
                      <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-2 py-1.5 mt-1">
                        Sorry, we don't currently deliver to {form.city || "this area"}. Please contact us on WhatsApp for assistance.
                      </div>
                    )}
                    {quoteError && !quoteLoading && !notDeliverable && (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1">
                        {quoteError}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[11px] text-text-med bg-muted/40 rounded-lg px-2 py-1.5">
                    📍 Delivery fee will appear once you {stateHasZones ? "select your zone, LGA or area" : "enter your state"}.
                  </div>
                )}
                <div className="flex justify-between"><span className="text-text-med flex items-center gap-1">📦 {serviceFeeLabel}</span><span>{fmt(serviceFee)}</span></div>
                {giftWrap && <div className="flex justify-between"><span className="text-text-med">🎀 Gift Wrapping</span><span className="text-[#7B5E00]">{fmt(giftWrapPrice)}</span></div>}
                {couponDiscount > 0 && <div className="flex justify-between text-forest"><span className="font-semibold">🏷️ Coupon ({appliedCoupon?.code})</span><span className="font-bold">-{fmt(couponDiscount)}</span></div>}
                {referralDiscount > 0 && <div className="flex justify-between text-forest"><span className="font-semibold">🎁 Referral ({appliedReferral?.code})</span><span className="font-bold">-{fmt(referralDiscount)}</span></div>}
                {spendDiscount > 0 && <div className="flex justify-between text-forest"><span className="font-semibold">🎉 Spend Discount ({spendPrompt?.currentDiscount?.discount_percent}%)</span><span className="font-bold">-{fmt(spendDiscount)}</span></div>}
                <div className="flex justify-between pt-2.5 border-t-2 border-border mt-0.5">
                  <span className="pf font-semibold">Total</span>
                  <span className="pf font-bold text-lg text-forest">{fmt(grand)}</span>
                </div>
                <div className="mt-2 bg-forest-light rounded-lg p-2.5">
                  <p className="text-forest text-xs font-body font-semibold">🚚 Est. delivery: {fmtDate(fromDate)} – {fmtDate(toDate)} ({deliveryCalc.daysMin}–{deliveryCalc.daysMax} days)</p>
                </div>
                {!deliveryCalc.isFree && deliveryCalc.freeThreshold && (
                  <div className="mt-2 bg-warm-cream rounded-lg p-2 text-center">
                    <p className="text-text-med text-[11px]">Free delivery is available on qualifying orders that meet the threshold.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky mobile Place Order bar — checkout has no MobileBottomNav, so pin to bottom */}
      <div
        className="fixed left-0 right-0 bottom-0 z-40 bg-card border-t border-border md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="flex-shrink-0">
            <div className="text-[10px] text-text-light font-semibold uppercase tracking-wide">Total</div>
            <div className="text-sm font-bold text-forest tabular-nums">{fmt(grand)}</div>
          </div>
          <button
            onClick={placeOrder}
            disabled={
              processing
              || (!expressEnabled && stateRequiresExpress)
              || (isExpressOrder
                  ? !expressAcknowledged
                  : (notDeliverable || quoteLoading || !deliveryReady))
            }
            className="flex-1 rounded-pill bg-forest text-primary-foreground py-2.5 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing
              ? "Processing…"
              : isExpressOrder
              ? (expressAcknowledged ? <>Place {expressDisplayName} →</> : "Accept terms above")
              : !deliveryReady
              ? (stateHasZones ? "Select delivery area" : "Enter your state")
              : notDeliverable
              ? "Unavailable"
              : quoteLoading
              ? "Calculating…"
              : <>Place Order →</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, onBlur, error, type = "text", placeholder, disabled, name }: { label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; error?: string; type?: string; placeholder?: string; disabled?: boolean; name?: string }) {
  return (
    <div className="flex-1 flex flex-col gap-1">
      <label className="text-xs font-semibold text-text-med uppercase tracking-wide">{label}</label>
      <input name={name} data-field={name} type={type} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} disabled={disabled}
        className={`w-full rounded-[10px] border-[1.5px] px-3 py-2.5 text-sm bg-card font-body outline-none transition-colors ${error ? "border-destructive" : "border-border focus:border-forest"} ${disabled ? "opacity-70 cursor-not-allowed bg-muted/40" : ""}`} />
      {error && <p className="text-destructive text-[11px]">{error}</p>}
    </div>
  );
}
