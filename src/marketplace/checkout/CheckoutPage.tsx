import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useMarketplaceWhatsAppNumber, waContextHref } from "../lib/whatsapp";
import { isValidNigerianPhone, isValidWhatsappNumber, toInternationalDigits } from "../lib/phone";
import CountryCodePicker from "../components/CountryCodePicker";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { track } from "@/lib/metaPixel";
import { useListing } from "../data/useListings";
import { cdb, formatNaira, createMarketplaceOrder, initializePayment, CheckoutError } from "./orders";
import { fetchBuyerOffer } from "../offers";
import { sendMarketplaceConversionEvent } from "../lib/metaConversion";
import MarketplaceSeo from "../components/MarketplaceSeo";
import ProtectionBadge from "../components/ProtectionBadge";

/**
 * Checkout. Payment is by Paystack: the order is created (or reused) on load, the
 * transaction is initialised server-side (so the payment fee and total are the
 * server's figures), and one button redirects to Paystack's hosted page. The
 * older bank-transfer flow is kept but only renders when paystack is off and the
 * admin transfer toggle is on (marketplace_payment_transfer_enabled).
 *
 * The buyer never sees price_naira or the seller's share.
 */
/** Maps create-marketplace-order (v4) server errors to warm, human copy. The
 * listing-gone and own-listing codes are handled by their own screens. */
function friendlyCreateError(code: string): string {
  switch (code) {
    case "A valid email address is required": return "Please enter a valid email address.";
    case "Please give your name so the seller knows who to send to": return "Please enter your name so the seller knows who to send to.";
    case "A valid Nigerian phone number is required so the seller can reach you": return "Please enter a valid Nigerian phone number so the seller can reach you.";
    default: return "We could not start your order just now. Please check your details and try again.";
  }
}

export default function CheckoutPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const [searchParams] = useSearchParams();
  const offerId = searchParams.get("offer") || undefined;
  const navigate = useNavigate();
  const { isLoggedIn, loading: authLoading, user } = useCustomerAuth();
  const waNumber = useMarketplaceWhatsAppNumber();

  // Resuming an abandoned checkout from a WhatsApp link (§79's outreach).
  // Two shapes, mutually exclusive: ?resume_order for someone whose order
  // already exists, ?resume for someone who only typed details. Neither ever
  // carries a name/email/phone itself, only an opaque id — the actual
  // details are fetched server side, never round-tripped through the URL.
  // Both RPCs return zero rows for the same two reasons collapsed into one
  // WHERE clause (older than marketplace_resume_link_days, OR the listing
  // is no longer live — confirmed by reading both functions' deployed SQL),
  // genuinely indistinguishable from the result alone. Not needed here
  // though: this page's own listingGone check below already renders its
  // own "this one has just gone" screen and returns before any of this
  // ever reaches the buyer, using the exact same listingId. So by the time
  // an empty resume result would actually be shown, the listing is already
  // known to be live — leaving link expiry as the only honest explanation
  // left standing, not a guess.
  const resumeOrderId = searchParams.get("resume_order") || undefined;
  const resumeAttemptId = searchParams.get("resume") || undefined;
  const resumeQ = useQuery({
    queryKey: ["mkt-checkout-resume", resumeOrderId, resumeAttemptId],
    enabled: !!(resumeOrderId || resumeAttemptId),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const { data, error } = resumeOrderId
        ? await cdb.rpc("get_order_resume_data", { p_order_id: resumeOrderId })
        : await cdb.rpc("get_checkout_resume_data", { p_attempt_id: resumeAttemptId });
      if (error) throw error;
      const rows = (data ?? []) as Array<{ listing_id: string; full_name: string | null; email: string | null; phone: string | null }>;
      return rows[0] ?? null;
    },
  });
  // null (not undefined) is the real "link expired" signal — undefined just
  // means the query hasn't resolved yet, and must not be treated the same.
  const resumeExpired = resumeQ.isFetched && resumeQ.data === null;

  const { data: listing, isLoading } = useListing(listingId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Checking out from an accepted offer (design 23a). create-marketplace-order
  // does not yet read offer_id at all (see orders.ts) — it always prices from
  // the listing row — so the negotiated price is shown here for what it
  // SHOULD be, then verified below against what the server actually charged
  // once the order exists, rather than trusted blindly.
  const { data: offer } = useQuery({
    queryKey: ["mkt-checkout-offer", offerId],
    enabled: !!offerId && isLoggedIn,
    queryFn: () => fetchBuyerOffer(offerId as string),
  });
  const negotiatedPrice = offer && (offer.status === "accepted" || offer.status === "counter_accepted")
    ? (offer.status === "counter_accepted" ? offer.counter_buyer_price_naira! : offer.buyer_price_naira)
    : null;

  // Checkout details. The seller arranges delivery directly, so we need the buyer's
  // name and phone, not just an email. A guest gives all three; a logged-in buyer
  // is asked only for whatever their account is missing. We commit the details
  // before creating the order so a logged-out (or not-yet-loaded) page view never
  // creates an ownerless order.
  const [nameInput, setNameInput] = useState("");
  // phoneInput is asked for as the buyer's WhatsApp number (the primary
  // framing, since that's what every downstream WhatsApp link assumes is
  // genuinely reachable). differentWhatsapp defaults to false (assume the
  // same), and only then does altPhoneInput (their actual phone, if it
  // genuinely differs) appear and get collected.
  const [phoneInput, setPhoneInput] = useState("");
  const [waDialCode, setWaDialCode] = useState("234");
  const [differentWhatsapp, setDifferentWhatsapp] = useState(false);
  const [altPhoneInput, setAltPhoneInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [committed, setCommitted] = useState(false);
  const [touched, setTouched] = useState(false);
  const [detailsRestored, setDetailsRestored] = useState(false);

  // Pre-fill from a resume link once, the moment the data arrives. Guarded
  // so it can never re-run and stomp over something the person has since
  // typed themselves — this only ever fires the first time real data shows
  // up, exactly like every other once-only effect in this file.
  const resumePrefilled = useRef(false);
  useEffect(() => {
    if (!resumeQ.data || resumePrefilled.current) return;
    resumePrefilled.current = true;
    if (resumeQ.data.full_name) setNameInput(resumeQ.data.full_name);
    if (resumeQ.data.email) setEmailInput(resumeQ.data.email);
    if (resumeQ.data.phone) setPhoneInput(resumeQ.data.phone);
    setDetailsRestored(true);
  }, [resumeQ.data]);

  // A logged-in buyer's existing name/phone, to know what (if anything) to ask for.
  const profileQ = useQuery({
    queryKey: ["mkt-buyer-profile"],
    enabled: isLoggedIn,
    staleTime: 60000,
    queryFn: async () => {
      const { data: auth } = await cdb.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return { full_name: "", phone: "" };
      const { data } = await cdb.from("customers").select("full_name, phone").eq("auth_user_id", uid).maybeSingle();
      const row = (data as { full_name: string | null; phone: string | null } | null);
      return { full_name: row?.full_name ?? "", phone: row?.phone ?? "" };
    },
  });
  const profileLoaded = !isLoggedIn || profileQ.data !== undefined;
  const hasName = !!profileQ.data?.full_name?.trim();
  const hasPhone = !!profileQ.data?.phone?.trim();

  // Which fields to collect. A guest needs all three; a logged-in buyer only the
  // gaps (guarded by profileLoaded so an incomplete profile is never skipped).
  const needName = isLoggedIn ? (profileLoaded && !hasName) : true;
  const needPhone = isLoggedIn ? (profileLoaded && !hasPhone) : true;
  const needEmail = !isLoggedIn;
  const needAnyDetail = needName || needPhone || needEmail;

  const nameValid = nameInput.trim().length >= 2;
  const phoneValid = isValidWhatsappNumber(waDialCode, phoneInput);
  // The Nigerian phone field is genuinely optional: an empty value is fine
  // (someone with only an international WhatsApp number must still be able
  // to check out), a filled-in one still has to be a real Nigerian number.
  const altPhoneValid = altPhoneInput.trim() === "" || isValidNigerianPhone(altPhoneInput);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim().toLowerCase());
  // A non-Nigerian WhatsApp country still surfaces the Nigerian phone field
  // as a helpful option (a local number genuinely helps with delivery), but
  // it no longer forces it open in a way the buyer can't dismiss by simply
  // leaving it blank, and it never blocks submission.
  const impliedDifferent = waDialCode !== "234";
  const showAltPhone = differentWhatsapp || impliedDifferent;
  const hasAltPhone = showAltPhone && altPhoneInput.trim() !== "";
  const detailsValid = (!needName || nameValid) && (!needPhone || (phoneValid && altPhoneValid)) && (!needEmail || emailValid);

  const showDetailsForm = !authLoading && profileLoaded && needAnyDetail && !committed;
  const canCreateOrder = isLoggedIn ? (profileLoaded && (!needAnyDetail || committed)) : committed;

  // Marks genuine checkout intent for InitiateCheckout below — set the
  // instant "Continue to payment" is actually clicked. Never used to gate
  // the ORDER itself (that's committed/canCreateOrder, untouched); this is
  // tracking-only.
  const checkoutIntent = useRef(false);
  function commitDetails() {
    setTouched(true);
    if (detailsValid) { setCommitted(true); checkoutIntent.current = true; }
  }

  // Capture-as-they-type: someone who fills in a name and email and then
  // leaves, before ever clicking "Continue to payment", currently vanishes
  // entirely — no order, no record. One attempt id per visit to this page,
  // reused for every call so record_checkout_attempt's upsert updates the
  // same row rather than creating a new one per keystroke. Debounced 1.2s
  // (long enough that a normal typing pause doesn't fire mid-word, short
  // enough to still catch someone who leaves shortly after). Fire and
  // forget, same shape as sendMarketplaceConversionEvent: never awaited,
  // wrapped in try/catch, a failure is invisible to the buyer. Only runs
  // while there's an actual form to type into (showDetailsForm) — a
  // signed-in buyer with everything already on file skips straight to
  // order creation, which is the 'order' source the abandoned-checkouts
  // view already covers.
  const attemptId = useRef<string>(crypto.randomUUID());
  const attemptRecorded = useRef(false);
  useEffect(() => {
    if (!showDetailsForm || !listingId) return;
    const name = nameInput.trim();
    const email = emailInput.trim();
    const phone = (hasAltPhone ? altPhoneInput : phoneInput).trim();
    if (!name && !email && !phone) return;
    const t = setTimeout(() => {
      try {
        cdb.rpc("record_checkout_attempt", {
          p_attempt_id: attemptId.current,
          p_listing_id: listingId,
          p_full_name: name || undefined,
          p_email: email || undefined,
          p_phone: phone || undefined,
        }).then(() => { attemptRecorded.current = true; }, () => { /* best effort */ });
      } catch {
        /* tracking is best-effort only, must never be visible to the buyer */
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [showDetailsForm, listingId, nameInput, emailInput, phoneInput, altPhoneInput, hasAltPhone]);
  const attemptLinked = useRef(false);

  const { data: settings } = useQuery({
    queryKey: ["mkt-checkout-settings"],
    queryFn: async () => {
      const { data } = await cdb.from("site_settings").select("key, value")
        .in("key", ["marketplace_service_fee_threshold_naira", "marketplace_service_fee_below_naira", "marketplace_service_fee_at_or_above_naira", "marketplace_payment_paystack_enabled", "marketplace_payment_transfer_enabled", "marketplace_bank_name", "marketplace_bank_account_name", "marketplace_bank_account_number"]);
      const m: Record<string, unknown> = {};
      for (const r of (data ?? []) as Array<{ key: string; value: unknown }>) m[r.key] = r.value;
      return m;
    },
    staleTime: 60000,
  });
  const settingsLoaded = settings !== undefined;
  const paystackEnabled = settings?.marketplace_payment_paystack_enabled === true;
  const transferEnabled = settings?.marketplace_payment_transfer_enabled === true;
  const feeThreshold = Number(settings?.marketplace_service_fee_threshold_naira) || 0;
  const feeBelow = Number(settings?.marketplace_service_fee_below_naira) || 0;
  const feeAtOrAbove = Number(settings?.marketplace_service_fee_at_or_above_naira) || 0;
  const bankName = String(settings?.marketplace_bank_name ?? "").trim();
  const acctName = String(settings?.marketplace_bank_account_name ?? "").trim();
  const acctNumber = String(settings?.marketplace_bank_account_number ?? "").trim();
  const bankReady = !!(bankName && acctName && acctNumber);

  // Create (or reuse) the order once we may (logged in, or a guest who has given a
  // valid email) and a payment method is enabled. Gating on canCreateOrder is what
  // stops a logged-out page view from minting an ownerless order.
  const orderQ = useQuery({
    queryKey: ["mkt-create-order", listingId, isLoggedIn ? "auth" : "guest", committed],
    enabled: !!listingId && canCreateOrder && !!listing && settingsLoaded && (paystackEnabled || transferEnabled),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: () => createMarketplaceOrder({
      listingId: listingId as string,
      email: isLoggedIn ? undefined : emailInput.trim().toLowerCase(),
      full_name: needName ? nameInput.trim() : undefined,
      // phoneInput is what we asked for as "your WhatsApp number": when the
      // picker is on Nigeria and they never said otherwise, it genuinely is
      // also their phone, sent as phone with phone_is_whatsapp true. The
      // separate Nigerian phone field is optional — filled in, it's sent as
      // phone and phoneInput becomes whatsapp_number instead; left blank
      // (including for a buyer with only an international number and no
      // Nigerian line at all), no phone is sent, matching exactly how
      // create-marketplace-order already reads these three fields.
      phone: needPhone ? (hasAltPhone ? altPhoneInput.trim() : (waDialCode === "234" && !differentWhatsapp ? phoneInput.trim() : undefined)) : undefined,
      whatsappNumber: needPhone && !(waDialCode === "234" && !differentWhatsapp) ? toInternationalDigits(waDialCode, phoneInput) : undefined,
      phoneIsWhatsapp: needPhone ? (waDialCode === "234" && !differentWhatsapp) : undefined,
      offerId,
    }),
  });
  const order = orderQ.data?.order;

  // Once a real order exists, fold the attempt into it so the same person
  // never shows up as two separate stalled rows (a typed-then-abandoned
  // attempt and, if they come back and pay, an unrelated order). No-ops
  // harmlessly if nothing was ever recorded (attemptRecorded false — e.g. a
  // signed-in buyer who never saw the form at all).
  useEffect(() => {
    if (!order || !attemptRecorded.current || attemptLinked.current) return;
    attemptLinked.current = true;
    try {
      cdb.rpc("link_checkout_attempt_to_order", { p_attempt_id: attemptId.current, p_order_id: order.id }).then(() => {}, () => {
        /* best effort */
      });
    } catch {
      /* tracking is best-effort only, must never be visible to the buyer */
    }
  }, [order]);

  // True when the server found this buyer's accepted price had passed its
  // 24-hour deadline by the time the order was actually created — a real,
  // expected outcome (the listing page's own countdown can reach the buyer
  // slightly stale), not a bug. Charged at the normal price either way; this
  // is what tells the buyer clearly why, instead of leaving it silent.
  const offerExpired = !!orderQ.data?.offer_expired;
  // Verified rather than trusted: if we arrived from a negotiated offer, the
  // order the server actually created should charge that price. A genuine
  // disagreement (not the expected, already-explained offerExpired case)
  // means something is wrong — stop here rather than let the buyer pay a
  // number that does not match what they were promised.
  const offerPriceMismatch = !offerExpired && negotiatedPrice != null && order != null && Number(order.item_price_naira) !== negotiatedPrice;

  // Initialise the Paystack transaction to get the authoritative fee, total and
  // hosted page URL. Only when paystack is the active method.
  const payQ = useQuery({
    queryKey: ["mkt-init-pay", order?.id],
    enabled: !!order && paystackEnabled,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: () => initializePayment({
      orderId: order!.id,
      callbackUrl: `${window.location.origin}/marketplace/checkout/return`,
    }),
  });

  const createCode = orderQ.error instanceof CheckoutError ? orderQ.error.code : orderQ.error ? "unknown" : null;
  const payCode = payQ.error instanceof CheckoutError ? payQ.error.code : payQ.error ? "unknown" : null;

  // Already paid: jump to the return screen so it shows the paid state.
  useEffect(() => {
    if (payCode === "This order is already paid" && order?.paystack_transaction_reference) {
      navigate(`/checkout/return?reference=${encodeURIComponent(order.paystack_transaction_reference)}`, { replace: true });
    }
  }, [payCode, order, navigate]);

  // Prefer the actual order's price once it exists (authoritative); before
  // that, show the negotiated price if we have one, otherwise the listing's.
  const itemPrice = order ? Number(order.item_price_naira ?? 0) : negotiatedPrice ?? Number(listing?.final_price_naira ?? 0);
  // Tiered, not flat: the same threshold logic create-marketplace-order already
  // charges from, applied here to the same itemPrice, so the line shown here
  // never disagrees with what the server actually charged.
  const serviceFee = itemPrice >= feeThreshold ? feeAtOrAbove : feeBelow;
  const paymentFee = Number(payQ.data?.paystack_fee_naira ?? 0);
  const paystackTotal = Number(payQ.data?.amount_naira ?? 0);
  // Whether Paystack's own fee is passed to the buyer (dashboard fee-passing
  // is on) or absorbed by BundledMum. Figures are server-computed either way
  // and verified to match what Paystack actually charges, not an estimate.
  const feeAdded = payQ.data ? payQ.data.fee_added_by_paystack !== false : true;
  const transferTotal = itemPrice + serviceFee;

  // InitiateCheckout, fired on the "Continue to payment" CLICK, not on page
  // load — checkoutIntent (set above, in commitDetails) is the click signal.
  // A buyer whose profile already has everything needed never sees that
  // button at all (showDetailsForm is false from the very first render for
  // them), so !showDetailsForm stands in as their equivalent: there was
  // nothing to click through, they arrived already committed by definition,
  // same concept canCreateOrder already uses to skip the form for them.
  // Either way, the actual firing still waits for a real order and its
  // authoritative total (paystackTotal once Paystack has priced it, or
  // transferTotal on the bank fallback) — never a value computed separately
  // here, never fired just because data happened to become ready. Guarded by
  // a ref, not sessionStorage, since this only needs to not re-fire within
  // this one page load. Fire and forget: never blocks render, failures are
  // swallowed.
  const checkoutTotal = paystackEnabled ? paystackTotal : transferTotal;
  const totalReady = paystackEnabled ? !!payQ.data : true;
  const checkoutIntentReady = checkoutIntent.current || !showDetailsForm;
  const initiateCheckoutFired = useRef(false);
  useEffect(() => {
    if (!order || !totalReady || !checkoutIntentReady || initiateCheckoutFired.current) return;
    initiateCheckoutFired.current = true;
    const eventId = crypto.randomUUID();
    const email = isLoggedIn ? (user?.email ?? undefined) : (emailInput.trim() || undefined);
    const phone = isLoggedIn ? (profileQ.data?.phone || undefined) : (phoneInput.trim() || undefined);
    track("InitiateCheckout", { content_ids: [listingId], num_items: 1, value: checkoutTotal, currency: "NGN" }, eventId);
    sendMarketplaceConversionEvent({
      event_name: "InitiateCheckout",
      event_id: eventId,
      event_source_url: window.location.href,
      content_id: listingId as string,
      num_items: 1,
      value: checkoutTotal,
      email,
      phone,
    });
  }, [order, totalReady, checkoutTotal, checkoutIntentReady]);

  // AddPaymentInfo, fired on the Pay click itself, right before the redirect
  // to Paystack — same authoritative paystackTotal already shown on the
  // button, never recomputed. window.location.assign is a full page
  // navigation, which CAN cancel an in-flight tracking request the instant
  // it fires, unlike the client-side navigate() Buy now uses. That's an
  // accepted, explicitly sanctioned tradeoff here: both calls are fired
  // synchronously and neither is awaited, so the redirect never waits on
  // them — losing an occasional event to the navigation is fine, delaying
  // someone's payment by even one network round trip is not.
  function handlePay() {
    if (!payQ.data) return;
    const eventId = crypto.randomUUID();
    const email = isLoggedIn ? (user?.email ?? undefined) : (emailInput.trim() || undefined);
    const phone = isLoggedIn ? (profileQ.data?.phone || undefined) : (phoneInput.trim() || undefined);
    track("AddPaymentInfo", { content_ids: [listingId], value: paystackTotal, currency: "NGN" }, eventId);
    sendMarketplaceConversionEvent({
      event_name: "AddPaymentInfo",
      event_id: eventId,
      event_source_url: window.location.href,
      content_id: listingId as string,
      value: paystackTotal,
      email,
      phone,
    });
    setRedirecting(true);
    window.location.assign(payQ.data.authorization_url);
  }

  async function copy(text: string, tag: string) {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(null), 1600); } catch { /* clipboard blocked */ }
  }

  // settingsLoaded is included here, not just below on paymentsDown: without
  // it, paystackEnabled defaults to false while site_settings is still in
  // flight, so the render further down would briefly pick the transfer-
  // fallback branch (and its "payment details are not set up yet" message)
  // even when Paystack is genuinely on. "Not loaded yet" must never render
  // as "loaded and unavailable" — same fix shape as the stale numeric
  // fallbacks removed in §8.
  if (authLoading || isLoading || !settingsLoaded) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  const ownListing = createCode === "You cannot buy your own listing";
  const listingGone = !listing || createCode === "This item is no longer available" || payCode === "This item is no longer available";
  const paymentsDown = settingsLoaded && !paystackEnabled && !transferEnabled;
  const paymentNotConfigured = payCode === "Payment is not configured";

  // P1b, listing gone
  if (listingGone) {
    return (
      <div className="mkt-center">
        <MarketplaceSeo noindex title="This item has gone" />
        <div className="mkt-empty-title">This one has just gone</div>
        <div className="mkt-empty-sub">Someone paid for it while you were here. Nothing has left your account. There is plenty more to see.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/")}>Back to browsing</button>
      </div>
    );
  }

  // Seller tried to buy their own item.
  if (ownListing) {
    return (
      <div className="mkt-center">
        <MarketplaceSeo noindex title="Checkout" />
        <div className="mkt-empty-title">This is your own listing</div>
        <div className="mkt-empty-sub">You cannot buy an item you are selling. Nothing has been charged.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/")}>Back to browsing</button>
      </div>
    );
  }

  // P1c, payments unavailable
  if (paymentsDown || paymentNotConfigured) {
    return (
      <div className="mkt-center">
        <MarketplaceSeo noindex title="Payments unavailable" />
        <div className="mkt-empty-title">We cannot take payments right now</div>
        <div className="mkt-empty-sub">Our payment partner is having a moment. This is on our side, not yours, and nothing has been charged.</div>
        <a className="mkt-wa" style={{ maxWidth: 260 }} href={waContextHref(waNumber, "payment_problem")} target="_blank" rel="noreferrer"><span className="ic">✆</span>Chat to BundledMum</a>
        <button className="mkt-secondary" style={{ maxWidth: 240 }} onClick={() => navigate("/")}>Back to browsing</button>
      </div>
    );
  }

  // The order the server actually created does not charge the negotiated
  // price it should — create-marketplace-order does not read offer_id yet.
  // Stop here rather than let the buyer pay a number that does not match
  // what they were promised; nothing has been charged at this point.
  if (offerPriceMismatch) {
    return (
      <div className="mkt-center">
        <MarketplaceSeo noindex title="Checkout" />
        <div className="mkt-empty-title">We need to sort this out first</div>
        <div className="mkt-empty-sub">The price you agreed with the seller could not be applied to this order. Nothing has been charged. Please message us and we will get this fixed for you.</div>
        <a className="mkt-wa" style={{ maxWidth: 260 }} href={waContextHref(waNumber, "order_help", { reference: order?.paystack_transaction_reference })} target="_blank" rel="noreferrer"><span className="ic">✆</span>Chat to BundledMum</a>
        <button className="mkt-secondary" style={{ maxWidth: 240 }} onClick={() => navigate(`/listing/${listingId}`)}>Back to the listing</button>
      </div>
    );
  }

  return (
    <>
      <MarketplaceSeo noindex title="Checkout" />
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row"><button className="mkt-sell-back" onClick={() => navigate(`/listing/${listing.id}`)} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>Checkout</h1></div>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-co-summary">
          <div className="th">{listing.image_url && <img src={listing.image_url} alt="" />}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{listing.title}</div>
            <div className="s">Sold by {listing.seller?.display_name || "BundledMum seller"}</div>
          </div>
        </div>

        {/* The agreed price's own 24-hour deadline passed between the buyer
            seeing it on the listing and the order actually being created
            here — a real, expected outcome, so it's explained plainly
            rather than the total just quietly coming out higher than what
            they last saw (see offerExpired in orders.ts/CheckoutPage.tsx). */}
        {order && offerExpired && (
          <div className="mkt-errbox">
            <span className="m">!</span>
            <span>The lower price you agreed with the seller has run out, so this order is at the normal price of {formatNaira(itemPrice)}. Nothing has been charged yet.</span>
          </div>
        )}

        {paystackEnabled ? (
          <>
            <div className="mkt-brk">
              <div className="line"><span>Item price</span><b>{formatNaira(itemPrice)}</b></div>
              {!settingsLoaded ? (
                <>
                  <div className="line"><div><span>Service &amp; Paystack fee</span><div className="sub">Working it out</div></div><b>...</b></div>
                  <div className="rule" />
                  <div className="total"><span>Total</span><b>...</b></div>
                </>
              ) : showDetailsForm ? (
                <>
                  <div className="line"><div><span>Service &amp; Paystack fee</span><div className="sub">Shown at the next step</div></div><b>...</b></div>
                  <div className="rule" />
                  <div className="total"><span>Total</span><b>...</b></div>
                </>
              ) : !payQ.data ? (
                <>
                  <div className="line"><div><span>Service &amp; Paystack fee</span><div className="sub">Working it out</div></div><b>...</b></div>
                  <div className="rule" />
                  <div className="total"><span>Total</span><b>...</b></div>
                </>
              ) : feeAdded ? (
                <>
                  <div className="line"><div><span>Service &amp; Paystack fee</span><div className="sub">Non refundable</div></div><b>{formatNaira(serviceFee + paymentFee)}</b></div>
                  <div className="rule" />
                  <div className="total"><span>Total</span><b>{formatNaira(paystackTotal)}</b></div>
                </>
              ) : (
                <>
                  <div className="line"><div><span>Service fee</span><div className="sub">Non refundable</div></div><b>{formatNaira(serviceFee)}</b></div>
                  <div className="rule" />
                  <div className="total"><span>Total</span><b>{formatNaira(paystackTotal)}</b></div>
                </>
              )}
            </div>

            {!showDetailsForm && payQ.data && feeAdded && (
              <div className="mkt-help">This fee is set by Paystack, not BundledMum, so it may change if their rates do.</div>
            )}

            {/* Buyer details, required before we create the order and take payment.
                The seller arranges delivery directly, so they need name + phone. */}
            {showDetailsForm && (
              <div className="mkt-field" style={{ gap: 14 }}>
                <div>
                  <div style={{ font: "800 15px/1.2 'Nunito', sans-serif", marginBottom: 4 }}>{needEmail ? "Where do we send this, and how does the seller reach you?" : "One more thing before you pay"}</div>
                  <span style={{ font: "400 12px/1.5 'Lato', sans-serif", color: "var(--mkt-muted)" }}>
                    The seller arranges delivery with you directly, so they need your name and number.{needEmail ? " Your receipt and order link go to your email." : ""} This is not an account, no password needed.
                  </span>
                </div>

                {/* Restored from a resume link — said plainly so it doesn't
                    read as unexplained browser autofill. Only ever shown
                    once, right where the fields it filled actually are. */}
                {detailsRestored && (
                  <div style={{ background: "var(--mkt-green-light)", borderRadius: 10, padding: "10px 12px", font: "400 12.5px/1.5 'Lato', sans-serif", color: "var(--mkt-green-dark)" }}>
                    Welcome back. We've filled in what you told us before, have a look and change anything you need to.
                  </div>
                )}
                {/* No row for this link (and the listing is confirmed live,
                    or we'd already have returned above) — the honest
                    explanation left is that it's simply had its time. */}
                {resumeExpired && (
                  <div style={{ background: "var(--mkt-cream)", border: "1px solid var(--mkt-error-ink)", borderRadius: 10, padding: "10px 12px", font: "400 12.5px/1.5 'Lato', sans-serif", color: "var(--mkt-error-ink)" }}>
                    That link has had its time and no longer works. No problem, just pop your details in below and carry on.
                  </div>
                )}

                {needName && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span className="mkt-uplabel">Your name</span>
                    <input
                      className={touched && !nameValid ? "mkt-input error" : "mkt-input"}
                      type="text" autoComplete="name" autoCapitalize="words"
                      value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                      placeholder="e.g. Amaka Okafor"
                    />
                    {touched && !nameValid && <span style={{ font: "400 11px/1.4 'Lato', sans-serif", color: "var(--mkt-error-ink)" }}>Please enter your name so the seller knows who to send to.</span>}
                  </div>
                )}

                {needPhone && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span className="mkt-uplabel">Your WhatsApp number</span>
                    <div className="mkt-cc-row">
                      <CountryCodePicker dialCode={waDialCode} onChange={setWaDialCode} />
                      <input
                        className={touched && !phoneValid ? "mkt-input error" : "mkt-input"}
                        type="tel" inputMode="numeric" autoComplete="tel"
                        value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="e.g. 0803 123 4567"
                      />
                    </div>
                    <span style={{ font: "400 11.5px/1.4 'Lato', sans-serif", color: "var(--mkt-muted)" }}>This is how the seller reaches you, so please make sure it's really on WhatsApp. Any country is fine.</span>
                    {touched && !phoneValid && <span style={{ font: "400 11px/1.4 'Lato', sans-serif", color: "var(--mkt-error-ink)" }}>Enter a valid WhatsApp number, any country is fine, for example 0803 123 4567 or +44 7911 123456.</span>}

                    {/* Only relevant when the WhatsApp field is itself Nigerian:
                        for any other country the phone field below is already
                        offered unconditionally, so this checkbox would just be
                        a redundant, confusing control sitting beside it. */}
                    {waDialCode === "234" && (
                      <label className="mkt-chk">
                        <input type="checkbox" checked={differentWhatsapp} onChange={(e) => setDifferentWhatsapp(e.target.checked)} />
                        <span>My phone number is different from my WhatsApp</span>
                      </label>
                    )}

                    {showAltPhone && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
                        <span className="mkt-uplabel">Your Nigerian phone number, optional</span>
                        <input
                          className={touched && !altPhoneValid ? "mkt-input error" : "mkt-input"}
                          type="tel" inputMode="numeric" autoComplete="tel"
                          value={altPhoneInput} onChange={(e) => setAltPhoneInput(e.target.value)}
                          placeholder="e.g. 0803 123 4567"
                        />
                        {touched && !altPhoneValid && <span style={{ font: "400 11px/1.4 'Lato', sans-serif", color: "var(--mkt-error-ink)" }}>Enter a valid Nigerian phone number, for example 0803 123 4567.</span>}
                        <span style={{ font: "400 11px/1.4 'Lato', sans-serif", color: "var(--mkt-muted)" }}>Not required, but a Nigerian number genuinely helps with delivery.</span>
                      </div>
                    )}
                  </div>
                )}

                {needEmail && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span className="mkt-uplabel">Email</span>
                    <input
                      className={touched && !emailValid ? "mkt-input error" : "mkt-input"}
                      type="email" inputMode="email" autoComplete="email"
                      value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitDetails(); }}
                      placeholder="you@example.com"
                    />
                    {touched && !emailValid && <span style={{ font: "400 11px/1.4 'Lato', sans-serif", color: "var(--mkt-error-ink)" }}>Please enter a valid email address.</span>}
                  </div>
                )}
              </div>
            )}

            {committed && !isLoggedIn && (
              <div className="mkt-help" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>✉️</span>
                <span style={{ flex: 1 }}>Receipt goes to {emailInput.trim().toLowerCase()}.</span>
                <button style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "700 12px/1 'Lato', sans-serif", color: "var(--mkt-green)" }} onClick={() => setCommitted(false)}>Change</button>
              </div>
            )}

            <div className="mkt-heldbox">
              <div className="hb-title">Your money is held, not sent</div>
              <div className="hb-line"><span className="hb-tick">✓</span>We hold your money the moment you pay, the seller does not get it yet.</div>
              <div className="hb-line"><span className="hb-tick">✓</span>You get the seller's contact once you sign in, to collect it yourself or agree a send and who covers it.</div>
              <div className="hb-line"><span className="hb-tick">✓</span>They are only paid once you confirm the item arrived as described.</div>
            </div>

            {!showDetailsForm && (
              <div className="mkt-help" style={{ display: "flex", gap: 8 }}>
                <span>🔒</span>
                <span>The next step opens Paystack's secure page to take your payment. We never see or store your card details, and you come straight back here when it is done.</span>
              </div>
            )}

            {createCode && createCode !== "unknown" && !listingGone && !ownListing && (
              <div className="mkt-errbox"><span className="m">!</span><span>{friendlyCreateError(createCode)}</span></div>
            )}

            {payCode && payCode !== "This order is already paid" && (
              <div className="mkt-errbox"><span className="m">!</span><span>We could not start your payment just now. Please try again, or <a href={waContextHref(waNumber, "payment_problem", { reference: order?.paystack_transaction_reference })} target="_blank" rel="noreferrer" style={{ color: "var(--mkt-error-ink)", fontWeight: 700 }}>message us</a>.</span></div>
            )}
          </>
        ) : (
          /* Bank transfer fallback, only rendered when the admin transfer toggle
             is on and paystack is off. Kept intact for that case. */
          <TransferFallback
            bankReady={bankReady} bankName={bankName} acctName={acctName} acctNumber={acctNumber}
            reference={order?.paystack_transaction_reference || ""} total={transferTotal}
            itemPrice={itemPrice} serviceFee={serviceFee} settingsLoaded={settingsLoaded} copied={copied} copy={copy}
            waHelpHref={waContextHref(waNumber, "payment_problem", { reference: order?.paystack_transaction_reference })}
            onSent={() => setConfirmOpen(true)}
          />
        )}
      </div>

      {/* Details step: commit name/phone/email, which lets the order be created. */}
      {paystackEnabled && showDetailsForm && (
        <div className="mkt-sell-foot">
          {/* Same badge as the pay step below — this is also a moment of
              committing (their contact details go to a stranger), so the
              same reassurance belongs here too. See ProtectionBadge.tsx. */}
          <ProtectionBadge variant="card-row" />
          <button className="mkt-primary" onClick={commitDetails}>
            Continue to payment
          </button>
          <div className="helper">No account needed, this is so the seller can reach you</div>
        </div>
      )}

      {/* Paystack pay button */}
      {paystackEnabled && !showDetailsForm && canCreateOrder && !payCode && (
        <div className="mkt-sell-foot">
          {/* Same protection promise as the payment confirmation page, word
              for word — right before the money actually moves. card-row is
              the compact size variant for this tight footer. See
              ProtectionBadge.tsx. */}
          <ProtectionBadge variant="card-row" />
          <button className="mkt-primary" disabled={!payQ.data || redirecting}
            onClick={handlePay}>
            {payQ.data ? (redirecting ? "Opening Paystack..." : `Pay ${formatNaira(paystackTotal)}`) : "Preparing your payment..."}
          </button>
          <div className="helper">Card, transfer or USSD on Paystack</div>
        </div>
      )}

      {/* Transfer confirm sheet (fallback flow) */}
      {confirmOpen && order?.paystack_transaction_reference && (
        <div className="mkt-sheet-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>Have you really sent {formatNaira(transferTotal)}?</h3>
            <p>Tapping yes tells our team to go looking for your transfer. If it has not left your bank yet, go back and send it first.</p>
            <div className="kv">
              <div className="r"><span>Amount</span><b>{formatNaira(transferTotal)}</b></div>
              <div className="r"><span>To</span><b>{bankName} {acctNumber}</b></div>
              <div className="r"><span>Reference used</span><b>{order.paystack_transaction_reference}</b></div>
            </div>
            <button className="mkt-primary" onClick={() => navigate(`/checkout/awaiting/${order.paystack_transaction_reference}`, { replace: true })}>Yes, I have sent it</button>
            <button className="back" onClick={() => setConfirmOpen(false)}>Not yet, take me back</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Bank-transfer checkout body, retained behind the transfer toggle. */
function TransferFallback(props: {
  bankReady: boolean; bankName: string; acctName: string; acctNumber: string;
  reference: string; total: number; itemPrice: number; serviceFee: number; settingsLoaded: boolean;
  copied: string | null; copy: (t: string, tag: string) => void; onSent: () => void; waHelpHref: string;
}) {
  const { bankReady, bankName, acctName, acctNumber, reference, total, itemPrice, serviceFee, settingsLoaded, copied, copy, onSent, waHelpHref } = props;
  return (
    <>
      <div className="mkt-brk">
        <div className="line"><span>Item price</span><b>{formatNaira(itemPrice)}</b></div>
        {settingsLoaded ? (
          <>
            <div className="line"><div><span>Service fee</span><div className="sub">Non refundable</div></div><b>{formatNaira(serviceFee)}</b></div>
            <div className="rule" />
            <div className="total"><span>Transfer exactly</span><b>{formatNaira(total)}</b></div>
          </>
        ) : (
          <>
            <div className="line"><div><span>Service fee</span><div className="sub">Working it out</div></div><b>...</b></div>
            <div className="rule" />
            <div className="total"><span>Transfer exactly</span><b>...</b></div>
          </>
        )}
      </div>
      {!bankReady ? (
        <div className="mkt-errbox"><span className="m">!</span><div><b>Payment details are not set up yet</b><span>Please <a href={waHelpHref} target="_blank" rel="noreferrer" style={{ color: "var(--mkt-error-ink)", fontWeight: 700 }}>message us on WhatsApp</a> to complete your purchase.</span></div></div>
      ) : (
        <>
          <div className="mkt-ref">
            <div className="lbl">Put this reference in the narration</div>
            <div className="row"><div className="code">{reference || "..."}</div>{reference && <button className="mkt-copy" onClick={() => copy(reference, "ref")}>{copied === "ref" ? "Copied" : "Copy"}</button>}</div>
            <div className="note">Without it we cannot tell which order your money belongs to. Type it in the narration box in your bank app.</div>
          </div>
          <div className="mkt-bank">
            <div className="lbl">Send to</div>
            <div className="row"><div style={{ flex: 1, minWidth: 0 }}><div className="num">{acctNumber}</div><div className="who">{bankName} · {acctName}</div></div><button className="mkt-copy outline" onClick={() => copy(acctNumber, "acct")}>{copied === "acct" ? "Copied" : "Copy"}</button></div>
          </div>
          <div className="mkt-heldbox"><div className="hb-title">Your money is held, not sent</div><div className="hb-line"><span className="hb-tick">✓</span>We hold your money, the seller is only paid after you confirm the item arrived as described.</div></div>
          {reference && <button className="mkt-primary" style={{ marginTop: 4 }} onClick={onSent}>I have sent the transfer</button>}
        </>
      )}
    </>
  );
}
