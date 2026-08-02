import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira, fetchPayoutQueue, markRefundPaid, isUnsettled } from "./opsData";
import { OpsHeader, OpsCard, StatusPill, ConfirmDialog } from "./opsUi";

interface RefundRow { id: string; reference: string; amount_naira: number; buyer_id: string | null; buyer_name?: string | null }

/**
 * Money owed out, the safety net. Every outstanding obligation in one place:
 * payouts pending (eligible, unsettled) and refunds pending (refunded, not yet
 * paid back), with amounts and who they are owed to, and a total that should
 * always reconcile against held funds on the dashboard. Refund rows carry their
 * own mark-refund-paid action, since a person pays those by hand too.
 */
export default function MarketplaceMoneyOwed() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["mkt-money-owed"],
    staleTime: 10000,
    queryFn: async () => {
      const queue = await fetchPayoutQueue();
      const payouts = queue.filter((r) => r.is_eligible && isUnsettled(r.settlement_status) && r.settlement_status !== "payout_failed");
      const payoutsTotal = payouts.reduce((s, r) => s + Number(r.seller_share_naira || 0), 0);

      const { data: refundsRaw } = await adb.from("marketplace_orders")
        .select("id, paystack_transaction_reference, amount_naira, buyer_id")
        .eq("order_status", "refunded").neq("settlement_status", "settled");
      const refunds: RefundRow[] = ((refundsRaw ?? []) as Array<{ id: string; paystack_transaction_reference: string | null; amount_naira: number; buyer_id: string | null }>)
        .map((o) => ({ id: o.id, reference: o.paystack_transaction_reference || "", amount_naira: Number(o.amount_naira || 0), buyer_id: o.buyer_id }));
      const buyerIds = Array.from(new Set(refunds.map((r) => r.buyer_id).filter(Boolean))) as string[];
      if (buyerIds.length) {
        const { data: buyers } = await adb.from("customers").select("id, full_name").in("id", buyerIds);
        const map = new Map((buyers ?? []).map((b: { id: string; full_name: string | null }) => [b.id, b.full_name]));
        for (const r of refunds) r.buyer_name = r.buyer_id ? (map.get(r.buyer_id) as string) ?? null : null;
      }
      const refundsTotal = refunds.reduce((s, r) => s + r.amount_naira, 0);

      // Held funds, for the reconciliation line.
      const { data: held } = await adb.from("marketplace_orders").select("amount_naira").eq("payment_status", "paid").neq("settlement_status", "settled");
      const heldTotal = ((held ?? []) as Array<{ amount_naira: number }>).reduce((s, o) => s + Number(o.amount_naira || 0), 0);

      return { payouts, payoutsTotal, refunds, refundsTotal, heldTotal, owedTotal: payoutsTotal + refundsTotal };
    },
  });

  const [refundTarget, setRefundTarget] = useState<RefundRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmRefundPaid() {
    if (!refundTarget) return;
    setBusy(true); setError(null);
    try {
      const ok = await markRefundPaid(refundTarget.id);
      if (!ok) { setError("This could not be recorded. Refresh and check the order state."); setBusy(false); return; }
      setRefundTarget(null); setBusy(false); await refetch();
    } catch (e) { setBusy(false); setError((e as { message?: string })?.message || "Something went wrong."); }
  }

  if (isLoading || !data) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  const buffer = data.heldTotal - data.owedTotal;
  const reconciles = buffer >= 0;

  return (
    <div>
      <OpsHeader title="Money owed out" subtitle="Every obligation shows here until it is paid. Nothing drops off on its own." />

      {/* reconciliation */}
      <div className="mt-5 rounded-2xl p-5 flex flex-col gap-1" style={{ background: "#1A4A33", color: "#FFF8F4" }}>
        <div className="text-[10px] font-heading font-extrabold uppercase tracking-widest" style={{ color: "#D8EFE5" }}>Total owed out</div>
        <div className="font-heading font-black text-3xl tracking-tight tabular-nums">{formatNaira(data.owedTotal)}</div>
        <div className="text-sm flex items-center gap-2 flex-wrap" style={{ color: "#D8EFE5" }}>
          <span>reconciles against {formatNaira(data.heldTotal)} held</span>
          <span className="font-heading font-extrabold px-2 py-0.5 rounded-md" style={{ background: reconciles ? "#D8EFE5" : "#C0392B", color: reconciles ? "#1A4A33" : "#fff" }}>
            {reconciles ? `✓ ${formatNaira(buffer)} buffer` : `short by ${formatNaira(-buffer)}`}
          </span>
        </div>
      </div>

      {/* payouts pending */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-black text-base text-foreground">Payouts pending</h2>
          <span className="font-heading font-extrabold tabular-nums" style={{ color: "#2D6A4F" }}>{formatNaira(data.payoutsTotal)}</span>
        </div>
        {data.payouts.length === 0 ? (
          <p className="text-sm text-text-med mt-1">No payouts owed right now.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {data.payouts.map((r) => (
              <OpsCard key={r.order_id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-heading font-bold text-sm text-foreground">{r.seller_name || "Seller"}</div>
                    <div className="text-[11px] text-text-med">Payout {r.order_reference}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-heading font-black tabular-nums">{formatNaira(r.seller_share_naira)}</span>
                    <StatusPill tone="work" label="Pending" />
                  </div>
                </div>
              </OpsCard>
            ))}
          </div>
        )}
      </div>

      {/* refunds pending */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-black text-base text-foreground">Refunds pending</h2>
          <span className="font-heading font-extrabold tabular-nums" style={{ color: "#C0392B" }}>{formatNaira(data.refundsTotal)}</span>
        </div>
        {data.refunds.length === 0 ? (
          <p className="text-sm text-text-med mt-1">No refunds owed right now.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {data.refunds.map((r) => (
              <OpsCard key={r.id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-heading font-bold text-sm text-foreground">{r.buyer_name || "Buyer"}</div>
                    <div className="text-[11px] text-text-med">Refund {r.reference}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-heading font-black tabular-nums" style={{ color: "#C0392B" }}>{formatNaira(r.amount_naira)}</span>
                    <button onClick={() => { setError(null); setRefundTarget(r); }} className="font-heading font-extrabold text-xs rounded-lg px-3 py-2 text-white" style={{ background: "#2D6A4F" }}>Mark refund paid</button>
                  </div>
                </div>
              </OpsCard>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={refundTarget !== null}
        title="Did you send this refund?"
        body="This only records that you transferred the refund back to the buyer. It cannot be reversed from here, so check it against your bank app first."
        kv={refundTarget ? [{ label: "Amount", value: formatNaira(refundTarget.amount_naira) }, { label: "To", value: refundTarget.buyer_name || "buyer" }, { label: "Order", value: refundTarget.reference }] : []}
        confirmLabel={refundTarget ? `Yes, I refunded ${formatNaira(refundTarget.amount_naira)}` : "Confirm"}
        busy={busy} error={error}
        onConfirm={confirmRefundPaid} onCancel={() => !busy && setRefundTarget(null)}
      />
    </div>
  );
}
