import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { fetchPayoutQueue, formatNaira, markPayoutReleased, markPayoutFailed, isUnsettled, isToday, shortTime, type PayoutRow } from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill, CopyField, ConfirmDialog } from "./opsUi";

const FAIL_REASONS = ["Account closed", "Wrong account number", "Name does not match", "Bank rejected it"];

/**
 * Payout queue, the daily workhorse. The operator sends the transfer at their
 * bank, then records it here, nothing here moves money. Buyer-confirmed rows are
 * higher confidence than timeout-sweep rows. Released rows stay for the day,
 * dimmed. A failed row keeps its red state until a new account is on file, so it
 * can never read as pending.
 */
export default function MarketplacePayouts() {
  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["mkt-payout-queue"],
    queryFn: fetchPayoutQueue,
    staleTime: 10000,
  });

  const [dialog, setDialog] = useState<{ type: "release" | "failed"; row: PayoutRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failReason, setFailReason] = useState<string>("");
  const [failNote, setFailNote] = useState("");

  const groups = useMemo(() => {
    const all = rows ?? [];
    const actionable = all.filter((r) => r.is_eligible && isUnsettled(r.settlement_status) && r.settlement_status !== "payout_failed");
    const failed = all.filter((r) => r.settlement_status === "payout_failed");
    const releasedToday = all.filter((r) => r.settlement_status === "settled" && isToday(r.payout_released_at));
    return { actionable, failed, releasedToday };
  }, [rows]);

  const stillToRelease = groups.actionable.reduce((s, r) => s + Number(r.seller_share_naira || 0), 0);
  const totalToday = groups.actionable.length + groups.failed.length + groups.releasedToday.length;

  function openRelease(row: PayoutRow) { setError(null); setDialog({ type: "release", row }); }
  function openFailed(row: PayoutRow) { setError(null); setFailReason(""); setFailNote(""); setDialog({ type: "failed", row }); }

  async function confirmRelease() {
    if (!dialog) return;
    setBusy(true); setError(null);
    try {
      const ok = await markPayoutReleased(dialog.row.order_id, "Recorded from payout queue");
      if (!ok) { setError("This payout could not be recorded. Refresh and check its state."); setBusy(false); return; }
      setDialog(null); setBusy(false); await refetch();
    } catch (e) { setBusy(false); setError((e as { message?: string })?.message || "Something went wrong."); }
  }

  async function confirmFailed() {
    if (!dialog) return;
    if (!failReason) { setError("Pick a reason so the record is clear."); return; }
    const reason = failNote.trim() ? `${failReason}: ${failNote.trim()}` : failReason;
    setBusy(true); setError(null);
    try {
      const ok = await markPayoutFailed(dialog.row.order_id, reason);
      if (!ok) { setError("This could not be recorded. Refresh and check its state."); setBusy(false); return; }
      setDialog(null); setBusy(false); await refetch();
    } catch (e) { setBusy(false); setError((e as { message?: string })?.message || "Something went wrong."); }
  }

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  const nothing = groups.actionable.length === 0 && groups.failed.length === 0 && groups.releasedToday.length === 0;

  return (
    <div>
      <OpsHeader title="Payout queue" subtitle="Send the transfer at your bank, then record it here. Buyer-confirmed rows are safe to pay first." />

      {nothing ? (
        <OpsEmpty title="Nothing to pay out" body="No payouts are eligible right now. Rows appear here once a buyer confirms receipt, or the dispute window elapses after dispatch." />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-4 items-center">
            <span className="font-heading font-extrabold text-sm text-foreground">{groups.releasedToday.length} of {totalToday} cleared today</span>
            {stillToRelease > 0 && <span className="text-sm text-text-med tabular-nums">{formatNaira(stillToRelease)} still to release</span>}
            {groups.failed.length > 0 && <span className="font-heading font-extrabold text-xs px-2 py-1 rounded-md" style={{ background: "#F9E3E0", color: "#C0392B" }}>{groups.failed.length} failed, retry</span>}
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            {groups.failed.map((r) => <PayoutCard key={r.order_id} row={r} state="failed" />)}
            {groups.actionable.map((r) => <PayoutCard key={r.order_id} row={r} state="actionable" onRelease={() => openRelease(r)} onFailed={() => openFailed(r)} />)}
            {groups.releasedToday.map((r) => <PayoutCard key={r.order_id} row={r} state="released" />)}
          </div>
        </>
      )}

      {/* Release confirm */}
      <ConfirmDialog
        open={dialog?.type === "release"}
        title="Did you send this transfer?"
        body="This only records it. Manual transfers cannot be reversed from here, so check the account number against your bank app first."
        kv={dialog ? [
          { label: "Amount", value: formatNaira(netAmount(dialog.row)) },
          { label: "To", value: dialog.row.bank_account_name || dialog.row.seller_name || "seller" },
          { label: "Bank", value: dialog.row.bank_name || "" },
          { label: "Account", value: dialog.row.bank_account_number || "" },
          { label: "Order", value: dialog.row.order_reference },
        ] : []}
        confirmLabel={dialog ? `Yes, I sent ${formatNaira(netAmount(dialog.row))}` : "Confirm"}
        busy={busy} error={error}
        onConfirm={confirmRelease} onCancel={() => !busy && setDialog(null)}
      />

      {/* Failed reason */}
      <ConfirmDialog
        open={dialog?.type === "failed"}
        title="Why did it bounce?"
        body={dialog ? `${dialog.row.seller_name || "The seller"} stays owed ${formatNaira(dialog.row.seller_share_naira)}. The row turns red and stays until a new account is on file.` : ""}
        confirmLabel="Mark failed"
        danger busy={busy} error={error}
        onConfirm={confirmFailed} onCancel={() => !busy && setDialog(null)}
      >
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {FAIL_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setFailReason(r)}
                className="rounded-lg border px-3 py-2.5 text-[13px] font-heading font-bold text-left"
                style={failReason === r ? { borderColor: "#C0392B", background: "#F9E3E0", color: "#C0392B" } : { borderColor: "#F0DDD2", background: "#fff", color: "#1A1A1A" }}>
                {r}
              </button>
            ))}
          </div>
          <textarea value={failNote} onChange={(e) => setFailNote(e.target.value)} placeholder="Note for the record, optional"
            className="w-full rounded-xl border p-3 text-sm min-h-[60px] resize-y" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }} />
        </div>
      </ConfirmDialog>
    </div>
  );
}

/** Amount to actually transfer, net of any platform debt the seller owes. */
function netAmount(r: PayoutRow): number {
  const debt = Number(r.outstanding_debit_naira || 0);
  return Math.max(0, Number(r.seller_share_naira || 0) - debt);
}

function PayoutCard({ row, state, onRelease, onFailed }: { row: PayoutRow; state: "actionable" | "failed" | "released"; onRelease?: () => void; onFailed?: () => void }) {
  const debt = Number(row.outstanding_debit_naira || 0);
  const net = netAmount(row);
  const border = state === "failed" ? "#C0392B" : "#F0DDD2";
  return (
    <div className="rounded-2xl border bg-white p-4 flex flex-col gap-3" style={{ borderColor: border, borderLeftWidth: state === "failed" ? 4 : 1, opacity: state === "released" ? 0.6 : 1 }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-heading font-black text-base text-foreground">{row.seller_name || "Seller"}</span>
            {debt > 0 && <span className="font-heading font-extrabold text-[11px] px-2 py-0.5 rounded-md" style={{ background: "#F9E3E0", color: "#C0392B" }}>Owes {formatNaira(debt)}</span>}
          </div>
          <div className="text-xs text-text-med">{row.listing_title || "Item"} · order {row.order_reference}</div>
        </div>
        <div className="text-right">
          <div className="font-heading font-black text-lg tabular-nums text-foreground">{formatNaira(row.seller_share_naira)}</div>
          {debt > 0 && state !== "released" && <div className="text-[11px] tabular-nums" style={{ color: "#C0392B" }}>{formatNaira(net)} after debt</div>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Bank for transfer</span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] text-foreground">{row.bank_name || "Bank not set"} · {row.bank_account_name || ""}</span>
            <CopyField value={row.bank_account_number || ""} />
          </div>
        </div>
        {state === "actionable" && row.eligible_via && (
          <StatusPill tone={row.eligible_via === "buyer_confirmed" ? "good" : "neutral"} label={row.eligible_via === "buyer_confirmed" ? "Buyer confirmed" : "Timeout sweep"} />
        )}
        {state === "released" && <StatusPill tone="good" label={`Released ${shortTime(row.payout_released_at)}`} />}
        {state === "failed" && <StatusPill tone="negative" label={`Transfer failed ${shortTime(row.payout_released_at)}`.trim()} />}
      </div>

      {state === "failed" && row.payout_failed_reason && (
        <div className="text-xs" style={{ color: "#C0392B" }}>Reason: {row.payout_failed_reason}. Ask the seller for a new account.</div>
      )}

      {state === "actionable" && (
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button onClick={onFailed} className="order-2 sm:order-1 sm:flex-1 font-heading font-extrabold text-sm rounded-xl py-3 border" style={{ borderColor: "#C0392B", color: "#C0392B", background: "transparent" }}>
            Mark failed
          </button>
          <button onClick={onRelease} className="order-1 sm:order-2 sm:flex-[1.6] font-heading font-extrabold text-sm rounded-xl py-3 text-white" style={{ background: "#2D6A4F" }}>
            Mark payout released
          </button>
        </div>
      )}
    </div>
  );
}
