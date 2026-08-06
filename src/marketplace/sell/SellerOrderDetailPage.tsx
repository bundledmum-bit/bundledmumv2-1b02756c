import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useMarketplaceWhatsAppNumber, waContextHref } from "../lib/whatsapp";
import { useSeller } from "./useSeller";
import { formatNaira, maskAccount } from "./sellData";
import { sellerWhatsAppLink, sellerCallLink } from "../checkout/orders";
import { fetchSellerOrder, getSellerOrderContact, fetchOrderDispute, sellerConfirmReturnReceived, getReturnConfirmDays } from "./sellerOrders";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import MarketplaceTitle from "../components/MarketplaceTitle";

/**
 * Seller order detail. Shows only the seller's payout (seller_share_naira),
 * never the buyer's total. Buyer contact comes from the seller-contact RPC.
 * Awaiting dispatch shows the dispatch CTA; awaiting confirmation shows the
 * sent state with the dispatch photo; completed shows the paid state.
 * Disputed/refunded orders (design 20a RT4/RT5) show the return-in-progress
 * state and, once the buyer has posted it back, a confirm action that
 * releases their refund.
 */
export default function SellerOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { seller, loading: sellerLoading, isLoggedIn } = useSeller();
  const waNumber = useMarketplaceWhatsAppNumber();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sellerLoading) return;
    if (!isLoggedIn) sendToMarketplaceLogin(`/sell/orders/${orderId}`, "seller");
  }, [sellerLoading, isLoggedIn, orderId]);

  const { data: order, isLoading } = useQuery({
    queryKey: ["seller-order", orderId],
    enabled: !!orderId && isLoggedIn,
    queryFn: () => fetchSellerOrder(orderId as string),
  });
  const { data: contact } = useQuery({
    queryKey: ["seller-order-contact", orderId],
    enabled: !!orderId && isLoggedIn && order?.payment_status === "paid",
    queryFn: () => getSellerOrderContact(orderId as string),
  });

  const disputedOrRefunded = order?.order_status === "disputed" || order?.order_status === "refunded";
  const { data: dispute } = useQuery({
    queryKey: ["seller-order-dispute", orderId],
    enabled: !!orderId && isLoggedIn && disputedOrRefunded,
    queryFn: () => fetchOrderDispute(orderId as string),
  });
  const { data: returnDays = 4 } = useQuery({
    queryKey: ["return-confirm-days"],
    queryFn: getReturnConfirmDays,
    staleTime: 5 * 60 * 1000,
    enabled: !!dispute?.return_required,
  });

  if (sellerLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!order) {
    return (
      <div className="mkt-center">
        <MarketplaceTitle title="Order not found" />
        <div className="mkt-empty-title">Order not found</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button>
      </div>
    );
  }

  const ref = contact?.order_reference || order.paystack_transaction_reference || "";
  const item = order.listing?.title || contact?.listing_title || "Your item";
  const bankLine = `${seller?.bank_name || "your bank"} ${maskAccount(seller?.bank_account_number)}`;
  const awaitingDispatch = order.order_status === "awaiting_dispatch";
  const awaitingConfirm = order.order_status === "awaiting_confirmation";
  const completed = order.order_status === "completed";
  const disputed = order.order_status === "disputed";
  const refunded = order.order_status === "refunded";

  const returnRequired = !!dispute?.return_required;
  const returnAwaited = refunded && returnRequired && !dispute?.return_sent_at;
  const returnToConfirm = refunded && returnRequired && !!dispute?.return_sent_at && !dispute?.return_received_at;
  const returnDone = refunded && returnRequired && !!dispute?.return_received_at;
  const refundedNoReturn = refunded && dispute != null && !returnRequired;

  const buyerName = contact?.buyer_name || "your buyer";
  const buyerPhone = contact?.buyer_phone || "";
  const waMsg = `Hello ${buyerName}, this is about your BundledMum order ${ref} for ${item}. Let us sort out delivery.`;

  const statusPill = awaitingDispatch ? <span className="mkt-st pending">To send</span>
    : awaitingConfirm ? <span className="mkt-st live">Sent</span>
    : completed ? <span className="mkt-st sold">Paid</span>
    : disputed ? <span className="mkt-st rejected">Problem reported</span>
    : returnAwaited ? <span className="mkt-st rejected">Return required</span>
    : returnToConfirm ? <span className="mkt-st pending">Confirm return</span>
    : returnDone || refundedNoReturn ? <span className="mkt-st sold">Refunded</span>
    : <span className="mkt-st sold">{order.order_status}</span>;

  async function confirmReturn() {
    if (!dispute) return;
    setBusy(true); setError(null);
    const ok = await sellerConfirmReturnReceived(dispute.id);
    setBusy(false);
    if (!ok) {
      setConfirmOpen(false);
      setError("We could not confirm this. It may already be confirmed, or the return has not been marked sent yet. Refresh and check.");
      return;
    }
    setConfirmOpen(false);
    qc.invalidateQueries({ queryKey: ["seller-order", orderId] });
    qc.invalidateQueries({ queryKey: ["seller-order-dispute", orderId] });
    qc.invalidateQueries({ queryKey: ["seller-orders"] });
  }

  return (
    <div className="mkt-seller-order-page">
      <MarketplaceTitle title={ref ? `Order ${ref}` : "Order"} />
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row">
            <button className="mkt-sell-back" onClick={() => navigate("/sell/dashboard")} aria-label="Back">‹</button>
            <h1 style={{ flex: 1 }}>Order {ref}</h1>
            {statusPill}
          </div>
          <p className="sub">
            {awaitingDispatch ? `${buyerName} has paid. Get it to them and mark it dispatched.`
              : awaitingConfirm ? `Nothing more to do. ${buyerName} will confirm receipt.`
              : completed ? "This order is complete and paid out."
              : disputed ? `${buyerName} reported a problem. A person at BundledMum is reviewing it.`
              : returnAwaited ? "The buyer needs to post this back before you can confirm."
              : returnToConfirm ? "Has it come back to you?"
              : returnDone ? "This return is confirmed and refunded."
              : refundedNoReturn ? "This order was refunded, no return needed."
              : ""}
          </p>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-od-left">
          <div className="mkt-co-summary">
            <div className="th">{order.listing?.image_url && <img src={order.listing.image_url} alt="" />}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="t">{item}</div><div className="s">Order {ref}</div></div>
          </div>

          {/* Payout, seller_share only */}
          {!refunded && !disputed && (
            <div className="mkt-payout-box">
              <span className="lbl">You will receive</span>
              <div className="amt">{formatNaira(order.seller_share_naira)}</div>
              <div className="note">
                {completed
                  ? `Paid to ${bankLine}.`
                  : `We are holding the buyer's payment. Once ${buyerName} confirms the item reached them, we transfer this to ${bankLine}.`}
              </div>
            </div>
          )}

          {/* Disputed or refunded: no payout coming, say so plainly */}
          {(disputed || refunded) && (
            <div className="mkt-errbox">
              <span className="m">!</span>
              <span>{disputed ? "This order is on hold while it is reviewed. You are not paid unless the report is rejected." : "This order was refunded to the buyer. You are not paid for this sale."}</span>
            </div>
          )}

          {/* Buyer's proof of posting, once they have sent the return back */}
          {(returnToConfirm || returnDone) && dispute?.return_proof_url && (
            <div className="mkt-card2">
              <div className="mkt-card2-label">{buyerName}'s proof of posting</div>
              <img src={dispute.return_proof_url} alt="Proof of posting" style={{ width: "100%", borderRadius: 10, display: "block" }} />
            </div>
          )}

          {/* Buyer contact, only when we have a paid order still on */}
          {(awaitingDispatch || awaitingConfirm) && (
            <div className="mkt-buyerbox">
              <div className="mkt-buyer-head">
                <div className="av">{(buyerName[0] || "B").toUpperCase()}</div>
                <div><div className="nm">{buyerName}</div><div className="sub">Buyer</div></div>
              </div>
              <div className="mkt-buyer-note">Message them to agree collection or a send, and who covers the cost if you're sending, then mark it dispatched.</div>
              {buyerPhone ? (
                <div className="mkt-buyer-actions">
                  <a className="mkt-wa" style={{ flex: 1 }} href={sellerWhatsAppLink(buyerPhone, waMsg)} target="_blank" rel="noreferrer"><span className="ic">✆</span>WhatsApp</a>
                  <a className="mkt-call" href={sellerCallLink(buyerPhone)}>Call</a>
                </div>
              ) : (
                <a className="mkt-wa" href={waContextHref(waNumber, "cannot_reach_buyer", { reference: ref })} target="_blank" rel="noreferrer"><span className="ic">✆</span>Reach the buyer via BundledMum</a>
              )}
            </div>
          )}
        </div>

        <div className="mkt-od-right">
          {/* Dispatch photo when sent */}
          {(awaitingConfirm || completed) && order.dispatch_photo_url && (
            <div className="mkt-card2">
              <div className="mkt-card2-label">Your dispatch photo</div>
              <img src={order.dispatch_photo_url} alt="Dispatch proof" style={{ width: "100%", borderRadius: 10, display: "block" }} />
            </div>
          )}

          {/* Normal timeline, only while the order is still on its usual path */}
          {!disputed && !refunded && (
            <div className="mkt-next">
              <div className="step"><div className="dot" style={{ background: "var(--mkt-green)" }} /><div><b>Payment held by us</b><span>The buyer has paid, we are holding the money.</span></div></div>
              <div className="step"><div className="dot" style={{ background: awaitingDispatch ? "var(--mkt-coral)" : "var(--mkt-green)" }} /><div><b>{awaitingDispatch ? "Waiting for you to send it" : "You dispatched it"}</b><span>{awaitingDispatch ? "Please dispatch within a few working days." : "Photo saved as your proof."}</span></div></div>
              <div className="step todo"><div className="dot todo" style={{ background: completed ? "var(--mkt-green)" : undefined }} /><div><b className={completed ? "" : "todo"}>{completed ? "Paid to your bank" : "Buyer confirms, we pay you"}</b><span>{completed ? bankLine : `Then we transfer your ${formatNaira(order.seller_share_naira)}.`}</span></div></div>
            </div>
          )}

          {/* Return awaited: buyer has not posted it back yet */}
          {returnAwaited && (
            <div className="mkt-heldbox">
              <div className="hb-title">Waiting on {buyerName}</div>
              <div className="hb-line"><span className="hb-tick">✓</span>They need to post the item back before you can confirm it. We will let you know the moment they mark it sent.</div>
            </div>
          )}

          {/* Return in progress: confirm action, before-you-confirm warning
              (design 20a RT4/RT5) */}
          {returnToConfirm && (
            <>
              <div className="mkt-errbox">
                <span className="m">!</span>
                <div><b>Before you confirm</b><span>This releases {buyerName}'s refund the same day and closes the order. You are not paid for this sale.</span></div>
              </div>
              <div className="mkt-debit">
                <span className="m">!</span>
                <span>{buyerName} posted it back{dispute?.return_sent_at ? ` on ${new Date(dispute.return_sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}. Confirm as soon as it arrives, that is what releases their refund. If you have not confirmed within {returnDays} {returnDays === 1 ? "day" : "days"}, BundledMum will confirm it and release their refund on your behalf.</span>
              </div>
            </>
          )}

          {/* Return confirmed */}
          {returnDone && (
            <div className="mkt-heldbox">
              <div className="hb-title">Return confirmed</div>
              <div className="hb-line"><span className="hb-tick">✓</span>You confirmed this item arrived back with you. {buyerName}'s refund has been released.</div>
            </div>
          )}

          {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}

          {/* Fixed bottom bar on mobile (unaffected, .mkt-od-right is
              display:contents there); becomes the static foot of this sticky
              column on desktop. */}
          {awaitingDispatch && (
            <div className="mkt-sell-foot">
              <button className="mkt-primary" onClick={() => navigate(`/sell/orders/${order.id}/dispatch`)}>Mark as dispatched</button>
            </div>
          )}
          {returnToConfirm && (
            <div className="mkt-sell-foot">
              <button className="mkt-primary" onClick={() => setConfirmOpen(true)} disabled={busy}>Yes, it's arrived, confirm</button>
            </div>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="mkt-sheet-overlay" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>Confirm it's arrived?</h3>
            <p>This releases {buyerName}'s refund the same day and closes the order. You are not paid for this sale. This cannot be undone, so only do it once the item is actually back with you.</p>
            <button className="mkt-primary" onClick={confirmReturn} disabled={busy}>{busy ? "Confirming..." : "Yes, it's arrived"}</button>
            <button className="back" onClick={() => setConfirmOpen(false)} disabled={busy}>Not yet, go back</button>
          </div>
        </div>
      )}
    </div>
  );
}
