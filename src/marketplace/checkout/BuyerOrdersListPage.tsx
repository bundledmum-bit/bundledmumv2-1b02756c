import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { formatNaira } from "./orders";
import { fetchBuyerOrders, groupBuyerOrders, type BuyerOrder } from "./buyerOrders";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import MarketplaceSeo from "../components/MarketplaceSeo";

/**
 * My orders (design H2 menu link + the buyer order flow). Grouped by what the
 * buyer needs to know, action needed first. Every figure is what the buyer paid,
 * never the seller's payout. Rows link to the order detail.
 */
export default function BuyerOrdersListPage() {
  const navigate = useNavigate();
  const { user, loading, isLoggedIn } = useCustomerAuth();

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) sendToMarketplaceLogin("/orders", "orders");
  }, [loading, isLoggedIn]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["buyer-orders", user?.id],
    enabled: !!user?.id,
    queryFn: () => fetchBuyerOrders(user!.id),
  });

  if (loading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  const { actionNeeded, problem, inProgress, complete } = groupBuyerOrders(orders);

  const Row = ({ o, pill, cls, coral }: { o: BuyerOrder; pill: string; cls: string; coral?: boolean }) => (
    <button className={coral ? "mkt-lrow cta" : "mkt-lrow"} style={coral ? { borderColor: "var(--mkt-coral)", borderWidth: "1.5px" } : undefined} onClick={() => navigate(`/orders/${o.id}`)}>
      <div className="th">{o.listing?.image_url && <img src={o.listing.image_url} alt="" />}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.listing?.title || "Item"}</div>
        <div className="meta">Paid {formatNaira(o.amount_naira)} · {o.paystack_transaction_reference || ""}</div>
      </div>
      <span className={`mkt-st ${cls}`}>{pill}</span>
    </button>
  );

  return (
    <div className="mkt-myorders-page">
      <MarketplaceSeo noindex title="My orders" />
      <div className="mkt-sell-head">
        <div className="inner"><div className="row"><h1 style={{ flex: 1 }}>My orders</h1></div></div>
      </div>

      <div className="mkt-sell-body">
        {orders.length === 0 ? (
          <div className="mkt-empty">
            <div className="box"></div>
            <h3>No orders yet</h3>
            <p>When you buy something, it lands here so you can track it, talk to the seller and confirm it reached you.</p>
            <button className="mkt-primary" style={{ maxWidth: 240, marginTop: 4 }} onClick={() => navigate("/")}>Browse the marketplace</button>
          </div>
        ) : (
          <>
            {actionNeeded.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="mkt-group-title">Needs your action</div>
                {actionNeeded.map((o) => <Row key={o.id} o={o} pill="Confirm receipt" cls="pending" coral />)}
              </div>
            )}
            {problem.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="mkt-group-title">Being looked into</div>
                {problem.map((o) => <Row key={o.id} o={o} pill="Problem" cls="rejected" />)}
              </div>
            )}
            {inProgress.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="mkt-group-title">On the way</div>
                {inProgress.map((o) => <Row key={o.id} o={o} pill="Being sent" cls="live" />)}
              </div>
            )}
            {complete.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="mkt-group-title">Complete</div>
                {complete.map((o) => <Row key={o.id} o={o} pill="Complete" cls="sold" />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
