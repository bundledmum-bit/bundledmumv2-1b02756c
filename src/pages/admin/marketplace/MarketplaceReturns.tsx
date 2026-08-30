import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import {
  fetchReturnsAwaitingConfirmation, fetchReturnsToPay, fetchReturnsNotYetSent, adminConfirmReturnReceived, adminMarkReturnRefundPaid,
  formatNaira, type ReturnAwaitingRow, type ReturnToPayRow,
} from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill, CopyField, ConfirmDialog } from "./opsUi";
import ReturnNotSentYet from "./ReturnNotSentYet";

/**
 * Returns queue (design 20a RT6). Two lists: returns the buyer has posted
 * back awaiting a "yes it arrived" (overdue ones surfaced in error red,
 * confirmable any time, not only once overdue), and confirmed returns whose
 * refund transfer has not been recorded yet. Nothing here moves money, same
 * as the payout queue, it only records what the operator already did.
 */
export default function MarketplaceReturns() {
  const { data: awaiting, isLoading: awaitingLoading, refetch: refetchAwaiting } = useQuery({
    queryKey: ["mkt-returns-awaiting"],
    queryFn: fetchReturnsAwaitingConfirmation,
    staleTime: 10000,
  });
  const { data: toPay, isLoading: toPayLoading, refetch: refetchToPay } = useQuery({
    queryKey: ["mkt-returns-to-pay"],
    queryFn: fetchReturnsToPay,
    staleTime: 10000,
  });

  // Same query key as ReturnNotSentYet, so this is the one fetch shared,
  // not a second one. Only needed so the empty state cannot claim there are
  // no returns in progress while one is waiting on the buyer above it.
  const { data: notSentYet } = useQuery({
    queryKey: ["mkt-returns-not-yet-sent"],
    queryFn: fetchReturnsNotYetSent,
    staleTime: 10000,
  });

  const [confirmRow, setConfirmRow] = useState<ReturnAwaitingRow | null>(null);
  const [payRow, setPayRow] = useState<ReturnToPayRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmReceived() {
    if (!confirmRow) return;
    setBusy(true); setError(null);
    try {
      const ok = await adminConfirmReturnReceived(confirmRow.dispute_id);
      if (!ok) { setError("This could not be confirmed. Refresh and check its state."); setBusy(false); return; }
      setConfirmRow(null); setBusy(false); await refetchAwaiting(); await refetchToPay();
    } catch (e) { setBusy(false); setError((e as { message?: string })?.message || "Something went wrong."); }
  }

  async function markTransferSent() {
    if (!payRow) return;
    setBusy(true); setError(null);
    try {
      const ok = await adminMarkReturnRefundPaid(payRow.dispute_id);
      if (!ok) { setError("This could not be recorded. Refresh and check its state."); setBusy(false); return; }
      setPayRow(null); setBusy(false); await refetchToPay();
    } catch (e) { setBusy(false); setError((e as { message?: string })?.message || "Something went wrong."); }
  }

  if (awaitingLoading || toPayLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  const awaitingRows = awaiting ?? [];
  const toPayRows = toPay ?? [];
  const overdueCount = awaitingRows.filter((r) => r.is_overdue).length;
  const nothing = awaitingRows.length === 0 && toPayRows.length === 0 && (notSentYet ?? []).length === 0;

  return (
    <div>
      <OpsHeader title="Returns" subtitle="Confirm a return arrived back with the seller, then record the refund transfer once it is sent." />

      {/* The step BEFORE the two below, and the one that was missing: only a
          buyer can say they posted it back, so a buyer who told us on
          WhatsApp instead left the whole return frozen. Renders nothing when
          there is none, so the screen is unchanged in the normal case. */}
      <ReturnNotSentYet />

      {nothing ? (
        <OpsEmpty title="No returns in progress" body="Rows appear here once a buyer marks a return sent, following a dispute ruling that required one." />
      ) : (
        <>
          {awaitingRows.length > 0 && (
            <>
              <div className="mt-5 flex items-center gap-2 flex-wrap">
                <span className="font-heading font-black text-base text-foreground">Returns awaiting seller confirmation</span>
                {overdueCount > 0 && <StatusPill tone="negative" label={`${overdueCount} overdue`} />}
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                {awaitingRows.map((r) => (
                  <AwaitingCard key={r.dispute_id} row={r} onConfirm={() => { setError(null); setConfirmRow(r); }} />
                ))}
              </div>
              <p className="mt-2 text-xs text-text-med">Admin can confirm any return at any time, obvious cases do not need to wait out the confirm window.</p>
            </>
          )}

          {toPayRows.length > 0 && (
            <>
              <div className="mt-6 text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Refund transfers to record</div>
              <div className="mt-2 flex flex-col gap-2.5">
                {toPayRows.map((r) => (
                  <ToPayCard key={r.dispute_id} row={r} onMarkPaid={() => { setError(null); setPayRow(r); }} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmRow}
        title="Confirm this return on the seller's behalf?"
        body="This releases the buyer's refund the same day and closes the order. The seller is not paid for this sale."
        kv={confirmRow ? [
          { label: "Order", value: confirmRow.order_reference },
          { label: "Amount", value: formatNaira(confirmRow.amount_naira) },
          { label: "Buyer", value: confirmRow.buyer_name || "" },
        ] : []}
        confirmLabel="Yes, confirm it arrived"
        busy={busy} error={error}
        onConfirm={confirmReceived} onCancel={() => !busy && setConfirmRow(null)}
      />

      <ConfirmDialog
        open={!!payRow}
        title="Did you send this transfer?"
        body="This only records it. The transfer itself cannot be reversed from here, so check the account number against your bank app first."
        kv={payRow ? [
          { label: "Amount", value: formatNaira(payRow.amount_naira) },
          { label: "To", value: payRow.refund_account_name || "" },
          { label: "Bank", value: payRow.refund_bank_name || "" },
          { label: "Account", value: payRow.refund_account_number || "" },
          { label: "Order", value: payRow.order_reference },
        ] : []}
        confirmLabel={payRow ? `Yes, I sent ${formatNaira(payRow.amount_naira)}` : "Confirm"}
        busy={busy} error={error}
        onConfirm={markTransferSent} onCancel={() => !busy && setPayRow(null)}
      />
    </div>
  );
}

function AwaitingCard({ row, onConfirm }: { row: ReturnAwaitingRow; onConfirm: () => void }) {
  const days = Math.floor((Date.now() - new Date(row.return_sent_at).getTime()) / 86400000);
  return (
    <div className="rounded-2xl border p-3.5 flex items-center gap-3.5 flex-wrap" style={row.is_overdue ? { borderColor: "#C0392B", borderWidth: 1.5, background: "#FCEBE9" } : { borderColor: "#F0DDD2", background: "#fff" }}>
      <div className="flex-1 min-w-0">
        <div className="font-heading font-black text-sm text-foreground truncate">{row.order_reference}, {row.listing_title || "item"}</div>
        <div className="text-xs mt-0.5" style={{ color: row.is_overdue ? "#8C2A1F" : "#6B5B54" }}>
          {row.buyer_name || "Buyer"} · posted back {days === 0 ? "today" : `${days} ${days === 1 ? "day" : "days"} ago`}{row.is_overdue ? " · overdue" : ""}
        </div>
      </div>
      {row.is_overdue
        ? <StatusPill tone="negative" label="Overdue" />
        : <StatusPill tone="neutral" label="On time" />}
      {row.return_proof_url && (
        <a href={row.return_proof_url} target="_blank" rel="noreferrer" className="text-xs font-heading font-bold underline" style={{ color: "#2D6A4F" }}>Proof</a>
      )}
      <button onClick={onConfirm} className="font-heading font-extrabold text-xs rounded-lg px-3 py-2 whitespace-nowrap text-white" style={{ background: row.is_overdue ? "#2D6A4F" : "transparent", border: row.is_overdue ? undefined : "1px solid #2D6A4F", color: row.is_overdue ? "#fff" : "#2D6A4F" }}>
        {row.is_overdue ? "Confirm on seller's behalf" : "Confirm now"}
      </button>
    </div>
  );
}

function ToPayCard({ row, onMarkPaid }: { row: ReturnToPayRow; onMarkPaid: () => void }) {
  return (
    <div className="rounded-2xl border bg-white p-3.5 flex items-center gap-3.5 flex-wrap" style={{ borderColor: "#F0DDD2" }}>
      <div className="flex-1 min-w-0">
        <div className="font-heading font-black text-sm text-foreground truncate">{row.order_reference}, refund {formatNaira(row.amount_naira)}</div>
        <div className="text-xs text-text-med mt-0.5">Confirmed by {row.return_confirmed_by === "admin" ? "admin" : "seller"}, {new Date(row.return_received_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
        <div className="flex items-center gap-2 flex-wrap mt-1.5">
          <span className="text-[13px] text-foreground">{row.refund_bank_name || "Bank not set"} · {row.refund_account_name || ""}</span>
          <CopyField value={row.refund_account_number || ""} />
        </div>
      </div>
      <button onClick={onMarkPaid} className="font-heading font-extrabold text-xs rounded-lg px-3 py-2 whitespace-nowrap text-white" style={{ background: "#2D6A4F" }}>
        Mark transfer sent
      </button>
    </div>
  );
}
