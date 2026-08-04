import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useListing } from "../data/useListings";
import { cdb, formatNaira, createMarketplaceOrder, initializePayment, CheckoutError } from "./orders";
import { fetchBuyerOffer } from "../offers";

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
  const { isLoggedIn, loading: authLoading } = useCustomerAuth();

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
  const [phoneInput, setPhoneInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [committed, setCommitted] = useState(false);
  const [touched, setTouched] = useState(false);

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
  const phoneDigits = phoneInput.replace(/\D/g, "");
  const phoneValid = /^(0\d{10}|234\d{10}|\d{10})$/.test(phoneDigits);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim().toLowerCase());
  const detailsValid = (!needName || nameValid) && (!needPhone || phoneValid) && (!needEmail || emailValid);

  const showDetailsForm = !authLoading && profileLoaded && needAnyDetail && !committed;
  const canCreateOrder = isLoggedIn ? (profileLoaded && (!needAnyDetail || committed)) : committed;

  function commitDetails() {
    setTouched(true);
    if (detailsValid) setCommitted(true);
  }

  const { data: settings } = useQuery({
    queryKey: ["mkt-checkout-settings"],
    queryFn: async () => {
      const { data } = await cdb.from("site_settings").select("key, value")
        .in("key", ["marketplace_service_fee_naira", "marketplace_payment_paystack_enabled", "marketplace_payment_transfer_enabled", "marketplace_bank_name", "marketplace_bank_account_name", "marketplace_bank_account_number"]);
      const m: Record<string, unknown> = {};
      for (const r of (data ?? []) as Array<{ key: string; value: unknown }>) m[r.key] = r.value;
      return m;
    },
    staleTime: 60000,
  });
  const settingsLoaded = settings !== undefined;
  const paystackEnabled = settings?.marketplace_payment_paystack_enabled === true;
  const transferEnabled = settings?.marketplace_payment_transfer_enabled === true;
  const serviceFee = Number(settings?.marketplace_service_fee_naira ?? 750) || 0;
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
      phone: needPhone ? phoneInput.trim() : undefined,
      offerId,
    }),
  });
  const order = orderQ.data?.order;
  // The one place this is verified rather than trusted: if we arrived from
  // a negotiated offer, the order the server actually created must charge
  // that price. It will not, until create-marketplace-order is updated to
  // read offer_id (see orders.ts and handoff-marketplace.md) — surfacing
  // that plainly here rather than silently letting checkout continue on a
  // number that does not match what was promised.
  const offerPriceMismatch = negotiatedPrice != null && order != null && Number(order.item_price_naira) !== negotiatedPrice;

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
  const paymentFee = Number(payQ.data?.paystack_fee_naira ?? 0);
  const paystackTotal = Number(payQ.data?.amount_naira ?? 0);
  // Paystack adds its own fee at payment time (dashboard fee-passing is on), so the
  // fee and total are estimates. When it is off, the total is exact.
  const feeAdded = payQ.data ? payQ.data.fee_added_by_paystack !== false : true;
  const transferTotal = itemPrice + serviceFee;

  async function copy(text: string, tag: string) {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(null), 1600); } catch { /* clipboard blocked */ }
  }

  if (authLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  const ownListing = createCode === "You cannot buy your own listing";
  const listingGone = !listing || createCode === "This item is no longer available" || payCode === "This item is no longer available";
  const paymentsDown = settingsLoaded && !paystackEnabled && !transferEnabled;
  const paymentNotConfigured = payCode === "Payment is not configured";

  // P1b, listing gone
  if (listingGone) {
    return (
      <div className="mkt-center">
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
        <div className="mkt-empty-title">We cannot take payments right now</div>
        <div className="mkt-empty-sub">Our payment partner is having a moment. This is on our side, not yours, and nothing has been charged.</div>
        <a className="mkt-wa" style={{ maxWidth: 260 }} href={WHATSAPP_BASE} target="_blank" rel="noreferrer"><span className="ic">✆</span>Chat to BundledMum</a>
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
        <div className="mkt-empty-title">We need to sort this out first</div>
        <div className="mkt-empty-sub">Your negotiated price could not be applied to this order. Nothing has been charged. Please message us and we will get this fixed for you.</div>
        <a className="mkt-wa" style={{ maxWidth: 260 }} href={WHATSAPP_BASE} target="_blank" rel="noreferrer"><span className="ic">✆</span>Chat to BundledMum</a>
        <button className="mkt-secondary" style={{ maxWidth: 240 }} onClick={() => navigate(`/listing/${listingId}`)}>Back to the listing</button>
      </div>
    );
  }

  return (
    <>
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

        {paystackEnabled ? (
          <>
            <div className="mkt-brk">
              <div className="line"><span>Item price</span><b>{formatNaira(itemPrice)}</b></div>
              <div className="line"><div><span>Service fee</span><div className="sub">Non refundable</div></div><b>{formatNaira(serviceFee)}</b></div>
              {showDetailsForm ? (
                <>
                  <div className="line"><div><span>Payment fee</span><div className="sub">Shown at the next step</div></div><b>...</b></div>
                  <div className="rule" />
                  <div className="total"><span>Total</span><b>...</b></div>
                </>
              ) : !payQ.data ? (
                <>
                  <div className="line"><div><span>Payment fee</span><div className="sub">Working it out</div></div><b>...</b></div>
                  <div className="rule" />
                  <div className="total"><span>Total</span><b>...</b></div>
                </>
              ) : feeAdded ? (
                <>
                  <div className="line"><div><span>Payment fee</span><div className="sub">Estimated, added by Paystack</div></div><b>about {formatNaira(paymentFee)}</b></div>
                  <div className="rule" />
                  <div className="total"><span>You will be charged</span><b>about {formatNaira(paystackTotal)}</b></div>
                </>
              ) : (
                <>
                  <div className="rule" />
                  <div className="total"><span>Total</span><b>{formatNaira(paystackTotal)}</b></div>
                </>
              )}
            </div>

            {!showDetailsForm && payQ.data && feeAdded && (
              <div className="mkt-help" style={{ display: "flex", gap: 8 }}>
                <span>ℹ️</span>
                <span>Paystack adds its fee at the point of payment, so the amount on the next page may differ by a naira or two. That is normal.</span>
              </div>
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
                    <span className="mkt-uplabel">Phone number</span>
                    <input
                      className={touched && !phoneValid ? "mkt-input error" : "mkt-input"}
                      type="tel" inputMode="tel" autoComplete="tel"
                      value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="e.g. 0803 123 4567"
                    />
                    {touched && !phoneValid && <span style={{ font: "400 11px/1.4 'Lato', sans-serif", color: "var(--mkt-error-ink)" }}>Enter a valid Nigerian phone number, for example 0803 123 4567.</span>}
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
              <div className="hb-line"><span className="hb-tick">✓</span>You get the seller's contact once you sign in, to arrange delivery.</div>
              <div className="hb-line"><span className="hb-tick">✓</span>They are only paid once you confirm the item arrived as described.</div>
              <div className="hb-line"><span className="hb-tick">✓</span>Not as described? Send it back and get refunded the same day it arrives with the seller.</div>
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
              <div className="mkt-errbox"><span className="m">!</span><span>We could not start your payment just now. Please try again, or <a href={WHATSAPP_BASE} target="_blank" rel="noreferrer" style={{ color: "var(--mkt-error-ink)", fontWeight: 700 }}>message us</a>.</span></div>
            )}
          </>
        ) : (
          /* Bank transfer fallback, only rendered when the admin transfer toggle
             is on and paystack is off. Kept intact for that case. */
          <TransferFallback
            bankReady={bankReady} bankName={bankName} acctName={acctName} acctNumber={acctNumber}
            reference={order?.paystack_transaction_reference || ""} total={transferTotal}
            itemPrice={itemPrice} serviceFee={serviceFee} copied={copied} copy={copy}
            onSent={() => setConfirmOpen(true)}
          />
        )}
      </div>

      {/* Details step: commit name/phone/email, which lets the order be created. */}
      {paystackEnabled && showDetailsForm && (
        <div className="mkt-sell-foot">
          <button className="mkt-primary" onClick={commitDetails}>
            Continue to payment
          </button>
          <div className="helper">No account needed, this is so the seller can reach you</div>
        </div>
      )}

      {/* Paystack pay button */}
      {paystackEnabled && !showDetailsForm && canCreateOrder && !payCode && (
        <div className="mkt-sell-foot">
          <button className="mkt-primary" disabled={!payQ.data || redirecting}
            onClick={() => { if (payQ.data) { setRedirecting(true); window.location.assign(payQ.data.authorization_url); } }}>
            {payQ.data ? (redirecting ? "Opening Paystack..." : `Pay ${feeAdded ? "about " : ""}${formatNaira(paystackTotal)}`) : "Preparing your payment..."}
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
  reference: string; total: number; itemPrice: number; serviceFee: number;
  copied: string | null; copy: (t: string, tag: string) => void; onSent: () => void;
}) {
  const { bankReady, bankName, acctName, acctNumber, reference, total, itemPrice, serviceFee, copied, copy, onSent } = props;
  return (
    <>
      <div className="mkt-brk">
        <div className="line"><span>Item price</span><b>{formatNaira(itemPrice)}</b></div>
        <div className="line"><div><span>Service fee</span><div className="sub">Non refundable</div></div><b>{formatNaira(serviceFee)}</b></div>
        <div className="rule" />
        <div className="total"><span>Transfer exactly</span><b>{formatNaira(total)}</b></div>
      </div>
      {!bankReady ? (
        <div className="mkt-errbox"><span className="m">!</span><div><b>Payment details are not set up yet</b><span>Please message us on WhatsApp to complete your purchase.</span></div></div>
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
