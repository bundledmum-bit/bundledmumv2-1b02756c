import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { formatNaira } from "./sellData";
import { fetchSellerOffer, sellerRespondToOffer, isLapsed } from "../offers";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

/**
 * Seller's own view of an incoming offer (design 23a O6 incoming, O7
 * counter, O8 waiting + outcomes). Own numbers only, at every step: this
 * page never fetches or renders buyer_price_naira / buyer_discount_naira /
 * counter_buyer_price_naira, or anything a seller could work the platform
 * markup back out from. Countering sends the seller's OWN number, what
 * they would accept — the buyer price is computed server side.
 */
export default function SellerOfferPage() {
  const { offerId } = useParams<{ offerId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { seller, loading: sellerLoading, isLoggedIn } = useSeller();

  // BUG FIX: this page read isLoggedIn but never actually sent a logged-out
  // visitor to sign in, it silently fell through to "Offer not found"
  // instead. Every other seller gate redirects, this one now does too.
  useEffect(() => {
    if (sellerLoading) return;
    if (!isLoggedIn) sendToMarketplaceLogin(`/sell/offers/${offerId}`, "seller");
  }, [sellerLoading, isLoggedIn, offerId]);

  const [counterOpen, setCounterOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: offer, isLoading } = useQuery({
    queryKey: ["seller-offer", offerId],
    enabled: !!offerId && isLoggedIn,
    queryFn: () => fetchSellerOffer(offerId as string),
  });

  async function act(action: "accept" | "decline") {
    if (!offer) return;
    setBusy(true); setError(null);
    const res = await sellerRespondToOffer(offer.id, action);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    qc.invalidateQueries({ queryKey: ["seller-offer", offerId] });
    qc.invalidateQueries({ queryKey: ["seller-offers-attention", seller?.id] });
  }

  async function sendCounter() {
    if (!offer) return;
    const amountNum = Number(counterAmount);
    if (!isFinite(amountNum) || amountNum <= 0) { setError("Enter what you would take."); return; }
    setBusy(true); setError(null);
    const res = await sellerRespondToOffer(offer.id, "counter", amountNum);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    setCounterOpen(false);
    qc.invalidateQueries({ queryKey: ["seller-offer", offerId] });
    qc.invalidateQueries({ queryKey: ["seller-offers-attention", seller?.id] });
  }

  if (sellerLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!offer) {
    return (
      <div className="mkt-center">
        <div className="mkt-empty-title">Request not found</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button>
      </div>
    );
  }

  const lapsed = isLapsed(offer);
  const openForResponse = offer.status === "pending" && !lapsed;

  return (
    <div className="mkt-seller-order-page">
      <div className="mkt-sell-head">
        <div className="inner"><div className="row"><button className="mkt-sell-back" onClick={() => navigate("/sell/dashboard")} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>{openForResponse ? "Someone asked for a lower price" : "Their request"}</h1></div></div>
      </div>

      <div className="mkt-sell-body">
        {openForResponse && (
          <>
            <div className="mkt-offer-counter">
              <span style={{ font: "400 13.5px/1.4 'Lato', sans-serif", color: "var(--mkt-green-dark)" }}>Would you take</span>
              <span className="amt">{formatNaira(offer.seller_amount_naira)}</span>
              <span className="sub">instead of your usual asking price?</span>
            </div>
            <p style={{ textAlign: "center", font: "400 12px/1.4 'Lato', sans-serif", color: "var(--mkt-muted)" }}>You can accept, say no, or suggest a number in between. Whatever you decide is fine, you're doing them a favour either way.</p>
            {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
            <button className="mkt-primary" style={{ background: "var(--mkt-green)" }} onClick={() => act("accept")} disabled={busy}>Accept {formatNaira(offer.seller_amount_naira)}</button>
            <div style={{ display: "flex", gap: 9 }}>
              <button className="mkt-secondary" style={{ flex: 1 }} onClick={() => { setError(null); setCounterAmount(""); setCounterOpen(true); }} disabled={busy}>Counter</button>
              <button className="mkt-secondary" style={{ flex: 1, borderColor: "var(--mkt-error)", color: "var(--mkt-error)" }} onClick={() => act("decline")} disabled={busy}>Decline</button>
            </div>
          </>
        )}

        {offer.status === "pending" && lapsed && (
          <div className="mkt-heldbox"><div className="hb-title">This request has closed</div><div className="hb-line"><span className="hb-tick">✓</span>The window passed with no reply. Nothing for you to do here.</div></div>
        )}

        {offer.status === "countered" && (
          <div className="mkt-heldbox">
            <div className="hb-title">Waiting on the buyer</div>
            <div className="hb-line"><span className="hb-tick">✓</span>You suggested {formatNaira(offer.counter_seller_amount_naira ?? 0)}. They'll accept or decline, no further back and forth either way.</div>
          </div>
        )}

        {(offer.status === "accepted" || offer.status === "counter_accepted") && (
          <div className="mkt-heldbox">
            <div className="hb-title">They accepted {formatNaira(offer.status === "counter_accepted" ? (offer.counter_seller_amount_naira ?? 0) : offer.seller_amount_naira)}</div>
            <div className="hb-line"><span className="hb-tick">✓</span>It's sold at that price. You'll see the order shortly with dispatch steps to follow.</div>
          </div>
        )}

        {(offer.status === "declined" || offer.status === "counter_declined") && (
          <div className="mkt-empty">
            <div className="box" />
            <h3>They said no</h3>
            <p>That's fine, plenty do at full price too. Your listing is unaffected and still live.</p>
          </div>
        )}
      </div>

      {counterOpen && (
        <div className="mkt-sheet-overlay" onClick={() => !busy && setCounterOpen(false)}>
          <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>What would you take?</h3>
            <p>They asked for {formatNaira(offer.seller_amount_naira)}. If they say no to your number, it ends there, no more back and forth.</p>
            <div className="mkt-field">
              <span className="mkt-uplabel">You'd receive</span>
              <input className="mkt-input" value={counterAmount} onChange={(e) => setCounterAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="e.g. 43,000" inputMode="numeric" />
            </div>
            {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
            <button className="mkt-primary" style={{ background: "var(--mkt-green)" }} onClick={sendCounter} disabled={busy}>{busy ? "Sending..." : "Send my counter"}</button>
            <button className="back" onClick={() => setCounterOpen(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
