import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMarketplaceWhatsAppNumber, waHref, waContextHref } from "../lib/whatsapp";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { cdb, formatNaira, verifyPayment, getOrderContact, resendOrderConfirmation, sellerWhatsAppLink, sellerCallLink, type OrderContact } from "./orders";
import MarketplaceSeo from "../components/MarketplaceSeo";
import ProtectionBadge from "../components/ProtectionBadge";

/**
 * Payment return, where Paystack sends the buyer back with ?reference=. It
 * verifies the payment and shows one of: verifying, succeeded (with the seller
 * contact block), failed or cancelled, or mismatch. Idempotent, so a refresh
 * (already: true) still lands on the paid state.
 */
export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const reference = params.get("reference") || params.get("trxref") || "";
  const navigate = useNavigate();

  const verifyQ = useQuery({
    queryKey: ["mkt-verify", reference],
    enabled: !!reference,
    retry: 1,
    staleTime: Infinity,
    queryFn: () => verifyPayment(reference),
  });

  const status = verifyQ.data?.status;
  const orderId = verifyQ.data && "order_id" in verifyQ.data ? verifyQ.data.order_id : undefined;

  // VERIFYING
  if (!reference) {
    return <ResultShell tone="fail" title="We could not read your payment" body="The payment reference is missing. If you were charged, message us and we will sort it out." wa="I returned from Paystack without a reference" onBack={() => navigate("/")} />;
  }
  if (verifyQ.isLoading || !status) {
    return (
      <div className="mkt-result">
        <MarketplaceSeo noindex title="Checking your payment" />
        <div className="mkt-spinner" />
        <h1>Checking your payment</h1>
        <p>A few seconds while Paystack confirms it with us. Please stay on this page and do not pay again.</p>
      </div>
    );
  }

  // SUCCEEDED
  if (status === "paid") {
    return <PaidState orderId={orderId} reference={reference} onSeeOrder={() => navigate("/")} onBrowse={() => navigate("/")} />;
  }

  // MISMATCH, do not say failed
  if (status === "mismatch") {
    return <ResultShell tone="check" title="We are checking your payment" body="Something about this payment needs a closer look, so a person at BundledMum is verifying it now and will be in touch. Please do not pay again." wa={`I need help with my payment, reference ${reference}`} onBack={() => navigate("/")} />;
  }

  // FAILED or ABANDONED or error
  return <FailedState orderId={orderId} reference={reference} onBrowse={() => navigate("/")} />;
}

/** Generic centred result shell for the non-success calm states. */
function ResultShell({ tone, title, body, wa, onBack }: { tone: "fail" | "check"; title: string; body: string; wa: string; onBack: () => void }) {
  const waNumber = useMarketplaceWhatsAppNumber();
  return (
    <div className="mkt-result">
      <MarketplaceSeo noindex title={title} />
      <div className={tone === "fail" ? "mkt-result-icon fail" : "mkt-result-icon check"}>{tone === "fail" ? "!" : "✓"}</div>
      <h1>{title}</h1>
      <p>{body}</p>
      <a className="mkt-wa" href={waHref(waNumber, "Hello. " + wa + ".")} target="_blank" rel="noreferrer"><span className="ic">✆</span>Chat to BundledMum</a>
      <button className="mkt-secondary" onClick={onBack}>Back to browsing</button>
    </div>
  );
}

function FailedState({ orderId, reference, onBrowse }: { orderId?: string; reference: string; onBrowse: () => void }) {
  const navigate = useNavigate();
  const waNumber = useMarketplaceWhatsAppNumber();
  // Fetch the listing id for this order so retry returns to its checkout.
  const { data: listingId } = useQuery({
    queryKey: ["mkt-order-listing", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data } = await cdb.from("marketplace_orders").select("listing_id").eq("id", orderId as string).maybeSingle();
      return (data as { listing_id: string } | null)?.listing_id ?? null;
    },
  });

  return (
    <div className="mkt-sell-body" style={{ paddingTop: 24 }}>
      <MarketplaceSeo noindex title="Payment did not go through" />
      <div className="mkt-result-icon fail" style={{ alignSelf: "flex-start" }}>!</div>
      <h1 style={{ font: "900 26px/1.12 Nunito, sans-serif", letterSpacing: "-0.03em", margin: 0 }}>That payment did not go through</h1>
      <p style={{ font: "300 15px/1.6 Lato, sans-serif", color: "var(--mkt-muted)", margin: 0 }}>You were not charged, so nothing has left your account. Cards get declined for all sorts of reasons and it is rarely anything you did wrong.</p>
      <div className="mkt-errbox"><span className="m">!</span><span>If your bank did send an alert, an uncleared hold falls off on its own. Message us and we will check it against Paystack for you.</span></div>
      <div className="mkt-card2">
        <div className="mkt-card2-label">Worth trying</div>
        <span style={{ font: "400 13px/1.5 Lato, sans-serif", color: "#3D3936" }}>Check you have enough in the account and that your card is enabled for online payments, then try again. On Paystack you can also pay by transfer or USSD instead of card.</span>
      </div>
      <a className="mkt-wa" href={waContextHref(waNumber, "payment_problem", { reference })} target="_blank" rel="noreferrer"><span className="ic">✆</span>Failed more than once? Chat to us</a>
      <button className="mkt-primary" disabled={!listingId} onClick={() => listingId && navigate(`/checkout/${listingId}`, { replace: true })}>
        {listingId ? "Try paying again" : "Back to browsing"}
      </button>
      <button className="mkt-secondary" onClick={onBrowse}>Back to browsing</button>
    </div>
  );
}

function PaidState({ orderId, reference, onBrowse }: { orderId?: string; reference: string; onSeeOrder?: () => void; onBrowse: () => void }) {
  const { isLoggedIn, loading: authLoading } = useCustomerAuth();

  // Seller contact needs a session (the RPC requires it), so only fetch it when
  // signed in. A guest never sees seller details here, by design.
  const { data: contact, isLoading } = useQuery({
    queryKey: ["mkt-order-contact", orderId],
    enabled: !!orderId && isLoggedIn,
    queryFn: () => getOrderContact(orderId as string),
  });

  if (authLoading) {
    return <div className="mkt-result"><MarketplaceSeo noindex title="Confirming your payment" /><div className="mkt-spinner" /><h1>Confirming your payment</h1></div>;
  }

  return (
    <div className="mkt-success">
      <MarketplaceSeo noindex title="Payment received" />
      <div className="inner" style={{ justifyContent: "flex-start", paddingTop: 26 }}>
        <div className="check">✓</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="mkt-pill-held">Held by us</span>
          <h1>Paid, and your money is safe with us</h1>
          <p>{isLoggedIn && contact ? `${formatNaira(contact.amount_naira)} went through. ` : ""}We are holding your money and will only release it to your seller once you confirm the item arrived as described.</p>
        </div>

        {/* White, borderless, full width against this page's solid green
            background, so it still separates from its surroundings — the
            one context-specific override, per ProtectionBadge.tsx. */}
        <ProtectionBadge style={{ background: "#fff", border: "none", width: "100%", boxSizing: "border-box" }} />

        {isLoggedIn
          ? <SellerContact contact={contact} loading={isLoading} reference={reference} />
          : <GuestPaid orderId={orderId} reference={reference} />}

        <button className="mkt-primary" onClick={onBrowse}>Keep browsing</button>
      </div>
    </div>
  );
}

/**
 * Paid state for a guest (not signed in). No seller details, by design. Shows the
 * order reference as proof and explains the confirmation email carries a one-time
 * sign-in link that opens their order. The email is sent SERVER SIDE during
 * verification, never here; this only offers a rate-limited resend.
 */
function GuestPaid({ orderId, reference }: { orderId?: string; reference: string }) {
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function resend() {
    if (!orderId || cooldown > 0 || busy) return;
    setBusy(true);
    const ok = await resendOrderConfirmation(orderId);
    setBusy(false);
    setSent(ok);
    setCooldown(60); // rate limit in the UI so it cannot be spammed
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="mkt-brk">
        <div className="line"><span>Your order reference</span><b>{reference}</b></div>
        <div className="sub" style={{ marginTop: 2 }}>Keep this as proof of payment.</div>
      </div>

      <div className="mkt-heldbox">
        <div className="hb-title">Check your email</div>
        <div className="hb-line"><span className="hb-tick">✓</span>We are sending a confirmation with a button that opens your order and signs you in, so you can get the seller's contact and track delivery.</div>
        <div className="hb-line"><span className="hb-tick">✓</span>That link works once and expires. After that you can sign in from the marketplace any time using the same email.</div>
      </div>

      <div className="mkt-help" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ font: "400 12px/1.5 'Lato', sans-serif", color: "var(--mkt-muted)" }}>
          {sent ? "Sent again. Give it a minute and check your spam folder too." : "Did not get the email?"}
        </span>
        <button className="mkt-secondary" disabled={!orderId || cooldown > 0 || busy} onClick={resend}>
          {busy ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend the email"}
        </button>
        <Link className="mkt-talk-label" style={{ textAlign: "center", textDecoration: "none", color: "var(--mkt-green)" }} to="/login?returnTo=%2Forders">Already have an account? Sign in</Link>
      </div>
    </div>
  );
}

function SellerContact({ contact, loading, reference }: { contact: OrderContact | null | undefined; loading: boolean; reference: string }) {
  const name = contact?.seller_display_name || "your seller";
  const item = contact?.listing_title || "your item";
  const whatsapp = contact?.seller_whatsapp || "";
  const phone = contact?.seller_phone || "";
  const canCall = !!contact?.can_call;
  // Blank line after the greeting is a real \n\n, not literal text — wa.me
  // encodes it via encodeURIComponent inside sellerWhatsAppLink, so it
  // survives as %0A%0A and renders as two paragraphs in WhatsApp.
  const msg = `Hello ${name},\n\nI placed an order for the ${item} you listed on BundledMum Marketplace. My order ${reference}.`;
  const waNumber = useMarketplaceWhatsAppNumber();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div className="mkt-talk-label">Talk to your seller</div>
      <div className="mkt-talk-card">
        <div className="mkt-talk-head">
          <div className="mkt-talk-name">{loading ? "Loading..." : name}</div>
          {item && !loading ? <div className="mkt-talk-item">{item}</div> : null}
        </div>
        {whatsapp ? (
          <>
            <div className="mkt-talk-prefill">Message them to agree whether you'll collect it in person or have it sent, who covers the cost if sent, and roughly when. You can also ask them for more pictures, videos and details about the item.</div>
            <div className="mkt-talk-actions">
              <a className="mkt-wa" style={{ flex: 1 }} href={sellerWhatsAppLink(whatsapp, msg)} target="_blank" rel="noreferrer"><span className="ic">✆</span>WhatsApp</a>
              {canCall && <a className="mkt-call" href={sellerCallLink(phone)}>Call</a>}
            </div>
          </>
        ) : !loading ? (
          <>
            <div className="mkt-talk-prefill">We could not load the seller's number just now. Message BundledMum and we will connect you.</div>
            <a className="mkt-wa" href={waContextHref(waNumber, "seller_contact_missing", { reference, item })} target="_blank" rel="noreferrer"><span className="ic">✆</span>Chat to BundledMum</a>
          </>
        ) : null}
      </div>
    </div>
  );
}
