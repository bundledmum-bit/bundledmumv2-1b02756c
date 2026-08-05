import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useMarketplaceWhatsAppNumber, waContextHref } from "../lib/whatsapp";
import { useSeller } from "./useSeller";
import { formatNaira, maskAccount } from "./sellData";
import { fetchSellerOrders, groupSellerOrders, type SellerOrder } from "./sellerOrders";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

/**
 * Payouts (design O5). Shows only the seller's own payout figures
 * (seller_share_naira), grouped by whether the money is waiting on the buyer,
 * waiting on the seller to dispatch, or already paid. Honest that payouts are
 * sent by hand, not instantly.
 */
export default function SellerPayoutsPage() {
  const navigate = useNavigate();
  const { seller, loading, isLoggedIn } = useSeller();
  const waNumber = useMarketplaceWhatsAppNumber();

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) sendToMarketplaceLogin("/sell/payouts", "seller");
  }, [loading, isLoggedIn]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["seller-orders", seller?.id],
    enabled: !!seller?.id,
    queryFn: () => fetchSellerOrders(seller!.id),
  });

  if (loading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;
  if (!seller) { navigate("/sell", { replace: true }); return null; }

  const { needsAction, inProgress, complete } = groupSellerOrders(orders);
  const owed = [...needsAction, ...inProgress].reduce((s, o) => s + Number(o.seller_share_naira || 0), 0);
  const bankLine = `${seller.bank_name || "your bank"} ${maskAccount(seller.bank_account_number)}`;

  const Row = ({ o, coral }: { o: SellerOrder; coral?: boolean }) => (
    <button className={coral ? "mkt-lrow" : "mkt-lrow"} style={coral ? { borderColor: "var(--mkt-coral)", borderWidth: "1.5px" } : undefined} onClick={() => navigate(`/sell/orders/${o.id}`)}>
      <div className="th">{o.listing?.image_url && <img src={o.listing.image_url} alt="" />}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.listing?.title || "Item"}</div>
        <div className="meta">{o.paystack_transaction_reference || ""}</div>
      </div>
      {/* Desktop-only 4th column, a payout history reads like a table with
          room to spare (design 18a, screen D11); hidden on mobile by default. */}
      <span className="mkt-payout-date">{new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
      <span className="mkt-payout-to">{bankLine}</span>
      <b className="nun tnum" style={{ font: "900 15px/1 Nunito, sans-serif" }}>{formatNaira(o.seller_share_naira)}</b>
    </button>
  );

  return (
    <div className="mkt-payouts-page">
      <div className="mkt-sell-head">
        <div className="inner">
          <div className="row"><button className="mkt-sell-back" onClick={() => navigate("/sell/dashboard")} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>Your payouts</h1></div>
          <div className="mkt-payout" style={{ marginTop: 4 }}>
            <div style={{ flex: 1 }}>
              <div className="lbl">Owed to you</div>
              <div className="acct" style={{ fontSize: 24 }}>{formatNaira(owed)}</div>
              <div className="lbl" style={{ marginTop: 4 }}>to {bankLine}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-debit" style={{ background: "var(--mkt-coral-light)" }}>
          <span className="m">i</span>
          <span>We send payouts by hand, not automatically. Once a buyer confirms, your money usually goes out the same working day, so no need to keep refreshing.</span>
        </div>

        {orders.length === 0 && <div className="mkt-empty"><div className="box"></div><h3>No payouts yet</h3><p>When you make a sale and dispatch it, your payout will show here.</p></div>}

        {orders.length > 0 && (
          <div className="mkt-payout-thead">
            <span>Date</span><span>Order</span><span>To</span><span style={{ textAlign: "right" }}>Amount</span>
          </div>
        )}

        {inProgress.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="mkt-group-title">Waiting on a buyer</div>
            {inProgress.map((o) => <Row key={o.id} o={o} />)}
          </div>
        )}
        {needsAction.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="mkt-group-title">Waiting on you to send</div>
            {needsAction.map((o) => <Row key={o.id} o={o} coral />)}
          </div>
        )}
        {complete.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="mkt-group-title">Already paid</div>
            {complete.map((o) => <Row key={o.id} o={o} />)}
          </div>
        )}

        <div className="mkt-card2" style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <span style={{ flex: 1, font: "400 12px/1.45 Lato, sans-serif", color: "var(--mkt-muted)" }}>Money should have landed and has not? Talk to us.</span>
          <a className="mkt-wa" style={{ width: "auto", padding: "9px 12px" }} href={waContextHref(waNumber, "payout_not_received")} target="_blank" rel="noreferrer"><span className="ic">✆</span>Chat</a>
        </div>
      </div>
    </div>
  );
}
