import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { cdb, formatNaira } from "./orders";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

interface OrderRow { id: string; amount_naira: number; order_status: string; payment_status: string; created_at: string; paystack_transaction_reference: string; listing_id: string }

/**
 * Awaiting payment confirmation (design T2, with the T2b "waiting too long"
 * variant). Reads the order back from marketplace_orders by its reference (buyers
 * can SELECT their own orders), so this state survives a refresh and is reachable
 * again later. A person at BundledMum verifies the transfer by hand.
 */
export default function AwaitingPaymentPage() {
  const { reference } = useParams<{ reference: string }>();
  const navigate = useNavigate();
  const { isLoggedIn, loading: authLoading } = useCustomerAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) sendToMarketplaceLogin(`/checkout/awaiting/${reference}`, "payment");
  }, [authLoading, isLoggedIn, reference]);

  const { data, isLoading } = useQuery({
    queryKey: ["mkt-order", reference],
    enabled: !!reference && isLoggedIn,
    queryFn: async () => {
      const { data: order } = await cdb.from("marketplace_orders")
        .select("id, amount_naira, order_status, payment_status, created_at, paystack_transaction_reference, listing_id")
        .eq("paystack_transaction_reference", reference as string)
        .maybeSingle();
      if (!order) return { order: null as OrderRow | null, listing: null };
      const { data: listing } = await cdb.from("marketplace_listings")
        .select("title, image_url").eq("id", (order as OrderRow).listing_id).maybeSingle();
      return { order: order as OrderRow, listing: (listing as { title: string; image_url: string | null } | null) };
    },
    refetchOnMount: "always",
  });

  const waMsg = (extra: string) => `${WHATSAPP_BASE}?text=${encodeURIComponent(`Hello BundledMum, ${extra} (order ${reference}).`)}`;

  if (authLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!isLoggedIn) return null;

  const order = data?.order ?? null;
  const listing = data?.listing ?? null;

  if (!order) {
    return (
      <>
        <div className="mkt-sell-head"><div className="inner"><h1>We could not find this order</h1><p className="sub">If you have just sent a transfer, give it a moment and refresh. If it still does not show, message us and we will help.</p></div></div>
        <div className="mkt-sell-body">
          <a className="mkt-wa" href={waMsg("I sent a transfer but cannot see my order")}><span className="ic">✆</span>Chat to BundledMum</a>
          <button className="mkt-secondary" onClick={() => navigate("/")}>Back to browsing</button>
        </div>
      </>
    );
  }

  const ageHours = (Date.now() - new Date(order.created_at).getTime()) / 3.6e6;
  const delayed = order.payment_status === "pending" && ageHours > 12;
  const sentAt = new Date(order.created_at).toLocaleString("en-NG", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

  return (
    <>
      <div className="mkt-sell-head">
        <div className="inner">
          <span className="mkt-pill-sent">Sent, awaiting check</span>
          <h1>{delayed ? "This one is taking longer than usual" : "Thank you, we are looking for your transfer"}</h1>
          <p className="sub">
            {delayed
              ? "It has been over 12 hours since you told us you sent it. Most transfers clear well before this, so let us check it together."
              : "A person on our team matches every transfer by hand, so nobody gets paid on a payment that never landed. We will let you know the moment it clears."}
          </p>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-co-summary" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <b className="nun" style={{ font: "800 15px/1 Nunito, sans-serif" }}>{formatNaira(order.amount_naira)}</b>
            <span className="s">sent {sentAt}</span>
          </div>
          <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
            <div className="th">{listing?.image_url && <img src={listing.image_url} alt="" />}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t">{listing?.title || "Your item"}</div>
              <div className="s">Order {order.paystack_transaction_reference}</div>
            </div>
          </div>
        </div>

        {delayed ? (
          <>
            <div className="mkt-card2">
              <div className="mkt-card2-label">Two things it is usually</div>
              <div className="mkt-step"><div className="mkt-step-num">1</div><span>The reference {order.paystack_transaction_reference} was left out of the narration, so we cannot match it.</span></div>
              <div className="mkt-step"><div className="mkt-step-num">2</div><span>The transfer is still pending on your bank's side, this happens with some banks overnight.</span></div>
            </div>
            <a className="mkt-wa" href={waMsg("here is my transfer receipt")}><span className="ic">✆</span>Send us your receipt on WhatsApp</a>
          </>
        ) : (
          <div className="mkt-next">
            <div className="mkt-card2-label">What happens next</div>
            <div className="step"><div className="dot now" /><div><b>We match your transfer</b><span>Usually the same working day. Slower late at night and on Sundays.</span></div></div>
            <div className="step todo"><div className="dot todo" /><div><b>Your money is held safely</b><span>The seller is told to pack the item.</span></div></div>
            <div className="step todo"><div className="dot todo" /><div><b>You get the seller's contact details</b><span>Then you two arrange delivery.</span></div></div>
          </div>
        )}

        <div className="mkt-reassure" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div className="mkt-reassure-tick">✓</div>
          <div className="mkt-reassure-text">Your order is open and the item is reserved for you. Nothing is lost while we sort this out. You can close this and come back to it any time.</div>
        </div>
      </div>

      <div className="mkt-sell-foot">
        {delayed
          ? <a className="mkt-secondary" style={{ textAlign: "center", textDecoration: "none", display: "block", borderColor: "var(--mkt-error)", color: "var(--mkt-error)" }} href={waMsg("I did not send the transfer, please cancel this order")}>I did not send it, message us to cancel</a>
          : <button className="mkt-secondary" onClick={() => navigate("/")}>Back to browsing</button>}
      </div>
    </>
  );
}
