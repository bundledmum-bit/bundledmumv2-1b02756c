import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { formatNaira, getOrderContact, sellerWhatsAppLink, sellerCallLink } from "./orders";
import { fetchBuyerOrder, getDisputeWindowDays, confirmDeadline, daysLeft, confirmReceipt, fetchOrderDispute, getReturnConfirmDays } from "./buyerOrders";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

/**
 * Buyer order detail (design T3/T3b tracking + T4 confirm-or-dispute + T4c
 * confirmed). Shows only what the buyer paid, never the seller's payout. Seller
 * contact comes from the order-contact RPC. When the seller has dispatched, the
 * confirm-by deadline is read from site_settings (never hardcoded) and the honest
 * auto-release statement is shown. Confirming releases payment, so it sits behind
 * a confirm step and a false RPC result is surfaced, never faked as success.
 */
export default function BuyerOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, loading: authLoading, isLoggedIn } = useCustomerAuth();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authLoading && !isLoggedIn) {
    sendToMarketplaceLogin(`/orders/${orderId}`);
  }

  const { data: order, isLoading } = useQuery({
    queryKey: ["buyer-order", orderId],
    enabled: !!orderId && isLoggedIn,
    queryFn: () => fetchBuyerOrder(orderId as string),
  });
  const { data: contact } = useQuery({
    queryKey: ["buyer-order-contact", orderId],
    enabled: !!orderId && isLoggedIn && order?.payment_status === "paid",
    queryFn: () => getOrderContact(orderId as string),
  });
  const { data: windowDays = 3 } = useQuery({
    queryKey: ["dispute-window-days"],
    queryFn: getDisputeWindowDays,
    staleTime: 5 * 60 * 1000,
  });

  const disputedOrRefunded = order?.order_status === "disputed" || order?.order_status === "refunded";
  const { data: dispute } = useQuery({
    queryKey: ["buyer-order-dispute", orderId],
    enabled: !!orderId && isLoggedIn && disputedOrRefunded,
    queryFn: () => fetchOrderDispute(orderId as string),
  });
  const { data: returnDays = 4 } = useQuery({
    queryKey: ["return-confirm-days"],
    queryFn: getReturnConfirmDays,
    staleTime: 5 * 60 * 1000,
    enabled: !!dispute?.return_required,
  });

  if (authLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!order) {
    return (
      <div className="mkt-center">
        <div className="mkt-empty-title">Order not found</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/orders")}>Back to my orders</button>
      </div>
    );
  }

  const ref = order.paystack_transaction_reference || "";
  const item = order.listing?.title || contact?.listing_title || "Your item";
  const sellerName = contact?.seller_display_name || "the seller";
  const sellerPhone = contact?.seller_phone || "";

  const awaitingDispatch = order.order_status === "awaiting_dispatch";
  const awaitingConfirm = order.order_status === "awaiting_confirmation";
  const completed = order.order_status === "completed";
  const disputed = order.order_status === "disputed";
  const refunded = order.order_status === "refunded";

  // Return sub-states, only meaningful once refunded and the ruling required
  // a return at all (an outright refund with no return needed skips these).
  const returnRequired = !!dispute?.return_required;
  const returnNeeded = refunded && returnRequired && !dispute?.return_sent_at;
  const returnWaiting = refunded && returnRequired && !!dispute?.return_sent_at && !dispute?.return_received_at;
  const returnReleased = refunded && returnRequired && !!dispute?.return_received_at && !dispute?.refund_paid_at;
  const returnSentBack = refunded && returnRequired && !!dispute?.refund_paid_at;
  const refundedNoReturn = refunded && dispute != null && !returnRequired;

  const deadline = confirmDeadline(order.dispatch_confirmed_at, windowDays);
  const left = daysLeft(deadline);
  const deadlineText = deadline ? deadline.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "";

  const waMsg = `Hello ${sellerName}, this is about my BundledMum order ${ref} for ${item}. Let us sort out delivery.`;

  const statusPill = awaitingConfirm ? <span className="mkt-st pending">Confirm receipt</span>
    : awaitingDispatch ? <span className="mkt-st live">Being sent</span>
    : completed ? <span className="mkt-st sold">Complete</span>
    : disputed ? <span className="mkt-st rejected">Problem</span>
    : returnNeeded ? <span className="mkt-st pending">Return needed</span>
    : returnWaiting ? <span className="mkt-st sold">Returning</span>
    : returnReleased ? <span className="mkt-st live">Refunding</span>
    : refunded ? <span className="mkt-st sold">Refunded</span>
    : <span className="mkt-st sold">{order.order_status}</span>;

  const sub = awaitingConfirm ? `${sellerName} sent it. Once it reaches you, confirm here.`
    : awaitingDispatch ? `Your payment landed and is safe with us. ${sellerName} has been told to pack and send it.`
    : completed ? "This order is complete. Thank you."
    : disputed ? "We are looking into your report. Your money stays with us until it is sorted."
    : returnNeeded ? "Your report was upheld. Post the item back to get your refund."
    : returnWaiting ? `Waiting on ${sellerName} to confirm it arrived.`
    : returnReleased ? "Your refund is released, the transfer is going out."
    : returnSentBack ? "Your refund has been sent."
    : refundedNoReturn ? "This order has been refunded."
    : "";

  async function doConfirm() {
    if (!order) return;
    setBusy(true); setError(null);
    const ok = await confirmReceipt(order.id);
    setBusy(false);
    if (!ok) {
      setConfirmOpen(false);
      setError("We could not confirm this order. It may already be confirmed or no longer awaiting your confirmation. Please refresh and check.");
      return;
    }
    setConfirmOpen(false);
    qc.invalidateQueries({ queryKey: ["buyer-order", orderId] });
    qc.invalidateQueries({ queryKey: ["buyer-orders"] });
  }

  return (
    <div className="mkt-order-detail-page">
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row">
            <button className="mkt-sell-back" onClick={() => navigate("/orders")} aria-label="Back">‹</button>
            <h1 style={{ flex: 1 }}>Order {ref}</h1>
            {statusPill}
          </div>
          {sub && <p className="sub">{sub}</p>}
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-od-left">
          <div className="mkt-co-summary">
            <div className="th">{order.listing?.image_url && <img src={order.listing.image_url} alt="" />}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="t">{item}</div><div className="s">Order {ref}</div></div>
          </div>

          {/* What you paid, buyer figures only */}
          <div className="mkt-brk">
            <div className="line"><span>Item price</span><b>{formatNaira(order.item_price_naira)}</b></div>
            <div className="line"><span>Service fee</span><b>{formatNaira(order.service_fee_naira)}</b></div>
            <div className="line"><span>Payment fee</span><b>{formatNaira(order.paystack_fee_naira)}</b></div>
            <div className="rule" />
            <div className="total"><span>You paid</span><b>{formatNaira(order.amount_naira)}</b></div>
          </div>

          {/* Timeline, replaced by the return timeline once refunded (design
              20a RT2/RT3): the normal confirm-and-pay steps no longer apply. */}
          {!refunded && (
            <div className="mkt-next">
              <div className="step"><div className="dot" style={{ background: "var(--mkt-green)" }} /><div><b>Payment held by us</b><span>Your money is safe with us until you confirm the item arrived as described.</span></div></div>
              <div className={awaitingDispatch ? "step" : "step"}>
                <div className="dot" style={{ background: awaitingDispatch ? "var(--mkt-coral)" : "var(--mkt-green)" }} />
                <div><b>{awaitingDispatch ? `Waiting on ${sellerName} to send it` : `Dispatched by ${sellerName}`}</b><span>{awaitingDispatch ? "We will show the dispatch photo here once it is sent." : "See the dispatch photo below."}</span></div>
              </div>
              <div className={completed ? "step" : "step todo"}>
                <div className={completed ? "dot" : "dot todo"} style={completed ? { background: "var(--mkt-green)" } : undefined} />
                <div><b className={completed ? "" : "todo"}>{completed ? "You confirmed, payment released" : "You confirm, the seller is paid"}</b><span>{completed ? "This order is closed." : "Confirming closes the order and releases the payment."}</span></div>
              </div>
            </div>
          )}

          {(returnWaiting || returnReleased || returnSentBack) && (
            <div className="mkt-next">
              <div className="step">
                <div className="dot" style={{ background: "var(--mkt-green)" }} />
                <div><b>You sent it back</b><span>{dispute?.return_sent_at ? new Date(dispute.return_sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}, with proof of posting</span></div>
              </div>
              <div className={returnWaiting ? "step" : "step"}>
                <div className="dot" style={{ background: returnWaiting ? "var(--mkt-coral)" : "var(--mkt-green)" }} />
                <div><b>{returnWaiting ? `Waiting on ${sellerName} to confirm it arrived` : `${sellerName} confirmed, your refund is released`}</b><span>{returnWaiting ? `They have ${returnDays} ${returnDays === 1 ? "day" : "days"} from when you posted it` : dispute?.return_received_at ? new Date(dispute.return_received_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}</span></div>
              </div>
              <div className={returnWaiting ? "step todo" : "step"}>
                <div className={returnWaiting ? "dot todo" : "dot"} style={!returnWaiting ? { background: returnSentBack ? "var(--mkt-green)" : "var(--mkt-coral)" } : undefined} />
                <div><b className={returnWaiting ? "todo" : ""}>{returnSentBack ? "Refund sent" : "Transfer going out to your account"}</b><span>{returnSentBack ? "Check your account, it should already be there." : returnReleased ? "Sent the same day, usually within hours." : ""}</span></div>
              </div>
            </div>
          )}

          {/* Seller's dispatch photo once sent */}
          {(awaitingConfirm || completed) && order.dispatch_photo_url && (
            <div className="mkt-card2">
              <div className="mkt-card2-label">{sellerName}'s dispatch photo</div>
              <img src={order.dispatch_photo_url} alt="Dispatch proof" style={{ width: "100%", borderRadius: 10, display: "block" }} />
            </div>
          )}
        </div>

        <div className="mkt-od-right">
          {/* Deadline + auto-release honesty, only once dispatched and awaiting confirmation */}
          {awaitingConfirm && deadline && (
            <div className="mkt-debit">
              <span className="m">!</span>
              <span>{left} {left === 1 ? "day" : "days"} left. If you do nothing by {deadlineText}, we release your payment to {sellerName} automatically.</span>
            </div>
          )}

          {/* Seller contact, for live orders */}
          {(awaitingDispatch || awaitingConfirm) && (
            <div className="mkt-buyerbox">
              <div className="mkt-buyer-head">
                <div className="av">{(sellerName[0] || "S").toUpperCase()}</div>
                <div><div className="nm">{sellerName}</div><div className="sub">Seller</div></div>
              </div>
              <div className="mkt-buyer-note">Their details are yours now. Agree where and when it reaches you.</div>
              {sellerPhone ? (
                <div className="mkt-buyer-actions">
                  <a className="mkt-wa" style={{ flex: 1 }} href={sellerWhatsAppLink(sellerPhone, waMsg)} target="_blank" rel="noreferrer"><span className="ic">✆</span>WhatsApp</a>
                  <a className="mkt-call" href={sellerCallLink(sellerPhone)}>Call</a>
                </div>
              ) : (
                <a className="mkt-wa" href={`${WHATSAPP_BASE}?text=${encodeURIComponent(`Hello BundledMum, I need to reach the seller on order ${ref}.`)}`} target="_blank" rel="noreferrer"><span className="ic">✆</span>Reach the seller via BundledMum</a>
              )}
            </div>
          )}

          {/* Completed reassurance */}
          {completed && (
            <div className="mkt-heldbox">
              <div className="hb-title">All done</div>
              <div className="hb-line"><span className="hb-tick">✓</span>Your payment has been released to {sellerName} and the order is closed. Your receipt is in your email.</div>
            </div>
          )}

          {/* Disputed state */}
          {disputed && (
            <div className="mkt-heldbox">
              <div className="hb-title">We are on it</div>
              <div className="hb-line"><span className="hb-tick">✓</span>A person is reviewing your report and the seller's payout is paused. We will contact you. Your money stays with us until it is sorted.</div>
              <a className="mkt-wa" style={{ marginTop: 4 }} href={`${WHATSAPP_BASE}?text=${encodeURIComponent(`Hello BundledMum, about my problem report on order ${ref}.`)}`} target="_blank" rel="noreferrer"><span className="ic">✆</span>Message us about this</a>
            </div>
          )}

          {/* Return needed, not yet sent (design 20a RT1 entry point) */}
          {returnNeeded && (
            <div className="mkt-heldbox">
              <div className="hb-title">Your report was upheld</div>
              <div className="hb-line"><span className="hb-tick">✓</span>Post the item back to {sellerName}, then tell us. Once it is confirmed arrived, your refund goes out the same day.</div>
            </div>
          )}

          {/* Waiting on the seller to confirm the return (design 20a RT2) */}
          {returnWaiting && (
            <>
              <div className="mkt-heldbox">
                <div className="hb-title">Nothing more for you to do</div>
                <div className="hb-line"><span className="hb-tick">✓</span>The moment {sellerName} confirms, {formatNaira(order.amount_naira)} is released and the transfer to your account goes out the same day.</div>
              </div>
              <div className="mkt-debit">
                <span className="m">!</span>
                <span>If they have not confirmed within {returnDays} {returnDays === 1 ? "day" : "days"} of you posting it, BundledMum steps in and confirms it for you, so you are never left waiting on someone else.</span>
              </div>
            </>
          )}

          {/* Refund released, transfer going out (design 20a RT3) */}
          {returnReleased && (
            <div className="mkt-heldbox">
              <div className="hb-title">Refund released</div>
              <div className="hb-line"><span className="hb-tick">✓</span>Released means the decision is made and locked in. Sent is the actual bank transfer landing with you, both happen today.</div>
            </div>
          )}

          {/* Refund sent, fully resolved (design 20a RT3 caption, third state) */}
          {returnSentBack && (
            <div className="mkt-heldbox">
              <div className="hb-title">Refund sent, check your account</div>
              <div className="hb-line"><span className="hb-tick">✓</span>{formatNaira(order.amount_naira)} has been sent to your account for this order.</div>
            </div>
          )}

          {/* Refunded outright, no return needed */}
          {refundedNoReturn && (
            <div className="mkt-heldbox">
              <div className="hb-title">You have been refunded</div>
              <div className="hb-line"><span className="hb-tick">✓</span>{formatNaira(order.amount_naira)} has been refunded for this order. If it has not shown in your account yet, message us and we will check.</div>
            </div>
          )}

          {/* Held reassurance while still awaiting */}
          {(awaitingDispatch || awaitingConfirm) && (
            <p style={{ font: "400 12px/1.5 'Lato', sans-serif", color: "var(--mkt-muted)", textAlign: "center", margin: 0 }}>
              Your money stays with us until you confirm the item arrived as described{awaitingConfirm ? ", or the days run out" : ""}.
            </p>
          )}

          {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}

          {/* Confirm / report actions, only when awaiting confirmation. Fixed
              bottom bar on mobile (unaffected, .mkt-od-right is display:contents
              there); becomes the static foot of this sticky column on desktop. */}
          {awaitingConfirm && (
            <div className="mkt-sell-foot">
              <button className="mkt-primary" onClick={() => setConfirmOpen(true)}>It arrived, confirm receipt</button>
              <button className="mkt-secondary" onClick={() => navigate(`/orders/${order.id}/problem`)}>Something is wrong</button>
              <div className="helper">Confirming releases your payment and cannot be undone</div>
            </div>
          )}

          {returnNeeded && (
            <div className="mkt-sell-foot">
              <button className="mkt-primary" onClick={() => navigate(`/orders/${order.id}/return`)}>Send the item back</button>
            </div>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="mkt-sheet-overlay" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <h3>Release payment to {sellerName}?</h3>
            <p>Confirming tells us the item reached you and is as described. It releases your payment to {sellerName} and closes the order. This cannot be undone, so only do it with the item in front of you.</p>
            <button className="mkt-primary" onClick={doConfirm} disabled={busy}>{busy ? "Confirming..." : "Yes, it arrived"}</button>
            <button className="back" onClick={() => setConfirmOpen(false)} disabled={busy}>Not yet, go back</button>
          </div>
        </div>
      )}
    </div>
  );
}
