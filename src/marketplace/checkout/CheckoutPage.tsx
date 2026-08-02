import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useListing } from "../data/useListings";
import { cdb, formatNaira, createMarketplaceOrder, initializePayment, CheckoutError } from "./orders";

/**
 * Checkout. Payment is by Paystack: the order is created (or reused) on load, the
 * transaction is initialised server-side (so the payment fee and total are the
 * server's figures), and one button redirects to Paystack's hosted page. The
 * older bank-transfer flow is kept but only renders when paystack is off and the
 * admin transfer toggle is on (marketplace_payment_transfer_enabled).
 *
 * The buyer never sees price_naira or the seller's share.
 */
export default function CheckoutPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const { isLoggedIn, loading: authLoading } = useCustomerAuth();

  const { data: listing, isLoading } = useListing(listingId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Guest checkout: a logged-out buyer gives an email for their receipt and order
  // link, then pays. We commit the email before creating the order so a logged-out
  // page view never creates an ownerless order.
  const [emailInput, setEmailInput] = useState("");
  const [committedEmail, setCommittedEmail] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim().toLowerCase());
  const needEmail = !authLoading && !isLoggedIn && !committedEmail;
  const canCreateOrder = isLoggedIn || !!committedEmail;

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
    queryKey: ["mkt-create-order", listingId, isLoggedIn ? "auth" : committedEmail],
    enabled: !!listingId && canCreateOrder && !!listing && settingsLoaded && (paystackEnabled || transferEnabled),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: () => createMarketplaceOrder({ listingId: listingId as string, email: isLoggedIn ? undefined : committedEmail || undefined }),
  });
  const order = orderQ.data?.order;

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

  const itemPrice = Number(listing?.final_price_naira ?? 0);
  const paymentFee = Number(payQ.data?.paystack_fee_naira ?? 0);
  const paystackTotal = Number(payQ.data?.amount_naira ?? 0);
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
              {needEmail ? (
                <div className="line"><div><span>Payment fee</span><div className="sub">Shown at the next step</div></div><b>...</b></div>
              ) : (
                <div className="line"><div><span>Payment fee</span><div className="sub">Paystack's charge for the payment</div></div><b>{payQ.data ? formatNaira(paymentFee) : "..."}</b></div>
              )}
              <div className="rule" />
              <div className="total"><span>Total</span><b>{needEmail ? "..." : (payQ.data ? formatNaira(paystackTotal) : "...")}</b></div>
            </div>

            {/* Guest email, required before we create the order and take payment */}
            {needEmail && (
              <div className="mkt-field">
                <span className="mkt-uplabel">Your email</span>
                <input
                  className={emailTouched && !emailValid ? "mkt-input error" : "mkt-input"}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  onKeyDown={(e) => { if (e.key === "Enter" && emailValid) setCommittedEmail(emailInput.trim().toLowerCase()); }}
                  placeholder="you@example.com"
                />
                <span style={{ font: "400 12px/1.5 'Lato', sans-serif", color: "var(--mkt-muted)" }}>
                  We send your receipt and a link to your order here. No account or password needed, and you can sign in later with this same email.
                </span>
                {emailTouched && !emailValid && <span style={{ font: "400 11px/1.4 'Lato', sans-serif", color: "var(--mkt-error-ink)" }}>Please enter a valid email address.</span>}
              </div>
            )}

            {committedEmail && !isLoggedIn && (
              <div className="mkt-help" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>✉️</span>
                <span style={{ flex: 1 }}>Receipt goes to {committedEmail}.</span>
                <button style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "700 12px/1 'Lato', sans-serif", color: "var(--mkt-green)" }} onClick={() => { setCommittedEmail(null); setEmailInput(committedEmail); }}>Change</button>
              </div>
            )}

            <div className="mkt-heldbox">
              <div className="hb-title">Your money is held, not sent</div>
              <div className="hb-line"><span className="hb-tick">✓</span>We hold your money the moment you pay, the seller does not get it yet.</div>
              <div className="hb-line"><span className="hb-tick">✓</span>You get the seller's contact once you sign in, to arrange delivery.</div>
              <div className="hb-line"><span className="hb-tick">✓</span>They are only paid once you confirm the item reached you.</div>
            </div>

            {!needEmail && (
              <div className="mkt-help" style={{ display: "flex", gap: 8 }}>
                <span>🔒</span>
                <span>The next step opens Paystack's secure page to take your payment. We never see or store your card details, and you come straight back here when it is done.</span>
              </div>
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

      {/* Guest email step: commit the email, which lets the order be created. */}
      {paystackEnabled && needEmail && (
        <div className="mkt-sell-foot">
          <button className="mkt-primary" disabled={!emailValid}
            onClick={() => { setEmailTouched(true); if (emailValid) setCommittedEmail(emailInput.trim().toLowerCase()); }}>
            Continue to payment
          </button>
          <div className="helper">No account needed, just an email for your receipt</div>
        </div>
      )}

      {/* Paystack pay button */}
      {paystackEnabled && !needEmail && !payCode && (
        <div className="mkt-sell-foot">
          <button className="mkt-primary" disabled={!payQ.data || redirecting}
            onClick={() => { if (payQ.data) { setRedirecting(true); window.location.assign(payQ.data.authorization_url); } }}>
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
          <div className="mkt-heldbox"><div className="hb-title">Your money is held, not sent</div><div className="hb-line"><span className="hb-tick">✓</span>We hold your money, the seller is only paid after you confirm the item reached you.</div></div>
          {reference && <button className="mkt-primary" style={{ marginTop: 4 }} onClick={onSent}>I have sent the transfer</button>}
        </>
      )}
    </>
  );
}
