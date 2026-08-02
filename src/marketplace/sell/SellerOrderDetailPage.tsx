import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import { useSeller } from "./useSeller";
import { formatNaira, maskAccount } from "./sellData";
import { sellerWhatsAppLink, sellerCallLink } from "../checkout/orders";
import { fetchSellerOrder, getSellerOrderContact } from "./sellerOrders";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

/**
 * Seller order detail. Shows only the seller's payout (seller_share_naira),
 * never the buyer's total. Buyer contact comes from the seller-contact RPC.
 * Awaiting dispatch shows the dispatch CTA; awaiting confirmation shows the sent
 * state with the dispatch photo; completed shows the paid state.
 */
export default function SellerOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { seller, loading: sellerLoading, isLoggedIn } = useSeller();

  useEffect(() => {
    if (sellerLoading) return;
    if (!isLoggedIn) sendToMarketplaceLogin(`/sell/orders/${orderId}`);
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

  if (sellerLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!order) {
    return (
      <div className="mkt-center">
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

  const buyerName = contact?.buyer_name || "your buyer";
  const buyerPhone = contact?.buyer_phone || "";
  const waMsg = `Hello ${buyerName}, this is about your BundledMum order ${ref} for ${item}. Let us sort out delivery.`;

  const statusPill = awaitingDispatch ? <span className="mkt-st pending">To send</span>
    : awaitingConfirm ? <span className="mkt-st live">Sent</span>
    : completed ? <span className="mkt-st sold">Paid</span>
    : <span className="mkt-st sold">{order.order_status}</span>;

  return (
    <>
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
              : completed ? "This order is complete and paid out." : ""}
          </p>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-co-summary">
          <div className="th">{order.listing?.image_url && <img src={order.listing.image_url} alt="" />}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div className="t">{item}</div><div className="s">Order {ref}</div></div>
        </div>

        {/* Payout, seller_share only */}
        <div className="mkt-payout-box">
          <span className="lbl">You will receive</span>
          <div className="amt">{formatNaira(order.seller_share_naira)}</div>
          <div className="note">
            {completed
              ? `Paid to ${bankLine}.`
              : `We are holding the buyer's payment. Once ${buyerName} confirms the item reached them, we transfer this to ${bankLine}.`}
          </div>
        </div>

        {/* Buyer contact, only when we have a paid order */}
        {(awaitingDispatch || awaitingConfirm) && (
          <div className="mkt-buyerbox">
            <div className="mkt-buyer-head">
              <div className="av">{(buyerName[0] || "B").toUpperCase()}</div>
              <div><div className="nm">{buyerName}</div><div className="sub">Buyer</div></div>
            </div>
            <div className="mkt-buyer-note">Agree the drop off with them before you send it.</div>
            {buyerPhone ? (
              <div className="mkt-buyer-actions">
                <a className="mkt-wa" style={{ flex: 1 }} href={sellerWhatsAppLink(buyerPhone, waMsg)} target="_blank" rel="noreferrer"><span className="ic">✆</span>WhatsApp</a>
                <a className="mkt-call" href={sellerCallLink(buyerPhone)}>Call</a>
              </div>
            ) : (
              <a className="mkt-wa" href={`${WHATSAPP_BASE}?text=${encodeURIComponent(`Hello BundledMum, I need to reach the buyer on order ${ref}.`)}`} target="_blank" rel="noreferrer"><span className="ic">✆</span>Reach the buyer via BundledMum</a>
            )}
          </div>
        )}

        {/* Dispatch photo when sent */}
        {(awaitingConfirm || completed) && order.dispatch_photo_url && (
          <div className="mkt-card2">
            <div className="mkt-card2-label">Your dispatch photo</div>
            <img src={order.dispatch_photo_url} alt="Dispatch proof" style={{ width: "100%", borderRadius: 10, display: "block" }} />
          </div>
        )}

        {/* Timeline */}
        <div className="mkt-next">
          <div className="step"><div className="dot" style={{ background: "var(--mkt-green)" }} /><div><b>Payment held by us</b><span>The buyer has paid, we are holding the money.</span></div></div>
          <div className="step"><div className="dot" style={{ background: awaitingDispatch ? "var(--mkt-coral)" : "var(--mkt-green)" }} /><div><b>{awaitingDispatch ? "Waiting for you to send it" : "You dispatched it"}</b><span>{awaitingDispatch ? "Please dispatch within a few working days." : "Photo saved as your proof."}</span></div></div>
          <div className="step todo"><div className="dot todo" style={{ background: completed ? "var(--mkt-green)" : undefined }} /><div><b className={completed ? "" : "todo"}>{completed ? "Paid to your bank" : "Buyer confirms, we pay you"}</b><span>{completed ? bankLine : `Then we transfer your ${formatNaira(order.seller_share_naira)}.`}</span></div></div>
        </div>
      </div>

      {awaitingDispatch && (
        <div className="mkt-sell-foot">
          <button className="mkt-primary" onClick={() => navigate(`/sell/orders/${order.id}/dispatch`)}>Mark as dispatched</button>
        </div>
      )}
    </>
  );
}
