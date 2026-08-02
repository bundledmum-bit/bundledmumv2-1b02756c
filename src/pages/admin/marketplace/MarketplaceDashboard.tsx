import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira, fetchPayoutQueue, isUnsettled } from "./opsData";
import { OpsHeader } from "./opsUi";

/**
 * Marketplace dashboard, the daily operating picture. Held funds leads, it is the
 * money the business holds on behalf of buyers and sellers. Every other tile is a
 * count that links straight into its queue. Held funds is buyer money, never a
 * seller-specific figure.
 */
export default function MarketplaceDashboard() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["mkt-dashboard"],
    staleTime: 15000,
    queryFn: async () => {
      // Held funds: paid orders not yet settled.
      const { data: held } = await adb.from("marketplace_orders")
        .select("amount_naira, settlement_status")
        .eq("payment_status", "paid").neq("settlement_status", "settled");
      const heldRows = (held ?? []) as Array<{ amount_naira: number }>;
      const heldTotal = heldRows.reduce((s, o) => s + Number(o.amount_naira || 0), 0);

      // Refunds pending: refunded but not yet settled (paid back).
      const { data: refunds } = await adb.from("marketplace_orders")
        .select("amount_naira")
        .eq("order_status", "refunded").neq("settlement_status", "settled");
      const refundRows = (refunds ?? []) as Array<{ amount_naira: number }>;
      const refundsTotal = refundRows.reduce((s, o) => s + Number(o.amount_naira || 0), 0);

      // Payouts due today: eligible, unsettled.
      const queue = await fetchPayoutQueue();
      const due = queue.filter((r) => r.is_eligible && isUnsettled(r.settlement_status));
      const dueTotal = due.reduce((s, r) => s + Number(r.seller_share_naira || 0), 0);

      // Listings awaiting review.
      const { count: reviewCount } = await adb.from("marketplace_listings")
        .select("id", { count: "exact", head: true }).eq("status", "pending_review");

      // Open disputes and amount at stake.
      const { data: disputes } = await adb.from("marketplace_disputes")
        .select("id, order_id").is("outcome", null);
      const dRows = (disputes ?? []) as Array<{ id: string; order_id: string }>;
      let atStake = 0;
      if (dRows.length) {
        const { data: dOrders } = await adb.from("marketplace_orders")
          .select("amount_naira").in("id", dRows.map((d) => d.order_id));
        atStake = ((dOrders ?? []) as Array<{ amount_naira: number }>).reduce((s, o) => s + Number(o.amount_naira || 0), 0);
      }

      return {
        heldTotal, heldCount: heldRows.length,
        refundsTotal, refundsCount: refundRows.length,
        dueTotal, dueCount: due.length,
        reviewCount: reviewCount ?? 0,
        disputeCount: dRows.length, atStake,
      };
    },
  });

  const today = new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  if (isLoading || !data) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  return (
    <div>
      <OpsHeader title="Dashboard" subtitle={`Today at a glance, ${today}`} />

      {/* Held funds hero */}
      <button
        onClick={() => navigate("/admin/marketplace/money-owed")}
        className="mt-5 w-full text-left rounded-2xl p-5 sm:p-6 flex flex-col gap-1"
        style={{ background: "#1A4A33", color: "#FFF8F4" }}
      >
        <div className="text-[10px] font-heading font-extrabold uppercase tracking-widest" style={{ color: "#D8EFE5" }}>Held funds, buyer money not yet released</div>
        <div className="font-heading font-black text-4xl tracking-tight tabular-nums">{formatNaira(data.heldTotal)}</div>
        <div className="text-sm" style={{ color: "#D8EFE5" }}>Across {data.heldCount} {data.heldCount === 1 ? "order" : "orders"}, held safely until payout or refund. View money owed out ›</div>
      </button>

      {/* Tiles */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Tile label="Payouts due today" value={formatNaira(data.dueTotal)} note={`${data.dueCount} ${data.dueCount === 1 ? "order" : "orders"} eligible`} action="Pay out" onClick={() => navigate("/admin/marketplace/payouts")} />
        <Tile label="Listings awaiting review" value={String(data.reviewCount)} note={data.reviewCount ? "Waiting for a decision" : "Nothing waiting"} action="Review" onClick={() => navigate("/admin/marketplace/review")} />
        <Tile label="Open disputes" value={String(data.disputeCount)} note={`${formatNaira(data.atStake)} at stake`} action="Rule now" tone={data.disputeCount ? "work" : undefined} onClick={() => navigate("/admin/marketplace/disputes")} />
        <Tile label="Refunds pending" value={formatNaira(data.refundsTotal)} note={`${data.refundsCount} ${data.refundsCount === 1 ? "buyer" : "buyers"} waiting`} action="Pay out" tone={data.refundsCount ? "negative" : undefined} onClick={() => navigate("/admin/marketplace/money-owed")} />
      </div>
    </div>
  );
}

function Tile({ label, value, note, action, onClick, tone }: { label: string; value: string; note: string; action: string; onClick: () => void; tone?: "work" | "negative" }) {
  const accent = tone === "negative" ? "#C0392B" : tone === "work" ? "#D4613C" : "#2D6A4F";
  return (
    <button onClick={onClick} className="text-left rounded-2xl border p-4 bg-white flex flex-col gap-1" style={{ borderColor: "#F0DDD2" }}>
      <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">{label}</div>
      <div className="font-heading font-black text-2xl tracking-tight tabular-nums text-foreground">{value}</div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="text-xs text-text-med">{note}</span>
        <span className="font-heading font-extrabold text-xs" style={{ color: accent }}>{action} ›</span>
      </div>
    </button>
  );
}
