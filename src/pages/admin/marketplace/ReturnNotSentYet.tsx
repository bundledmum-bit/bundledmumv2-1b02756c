import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  formatNaira, fetchReturnsNotYetSent, adminMarkReturnSentForBuyer, type ReturnNotYetSentRow,
} from "./opsData";
import {
  NoteField, noteReady, OnBehalfErr, OnBehalfDone, OnBehalfPanel,
  onBehalfBtn, useOnBehalfSubmit, NOTE_MIN_HEAVY,
} from "./onBehalf";

/**
 * The step between a ruling and a return coming back, which had no screen.
 *
 * Disputes shows only OPEN disputes, so a dispute leaves that screen the
 * moment it is ruled on. Returns then picks it up at return_sent_at, which
 * only the BUYER can set. So a buyer who posted the item back and told us
 * on WhatsApp instead of tapping anything left the whole thing frozen: the
 * seller had nothing to confirm and the refund could not start.
 *
 * That is why this is here rather than in the dispute view the brief
 * suggested. This is the screen you already open to work a return.
 */
export default function ReturnNotSentYet() {
  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["mkt-returns-not-yet-sent"],
    queryFn: fetchReturnsNotYetSent,
    staleTime: 10000,
  });

  if (isLoading || !rows || rows.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="font-heading font-black text-sm text-foreground">Waiting for the buyer to post it back</div>
      <div className="text-xs text-text-med mt-0.5">
        Ruled as needing the item back, and the buyer has not said they sent it yet. Nothing can move until they do.
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {rows.map((r) => <Row key={r.dispute_id} r={r} onDone={() => void refetch()} />)}
      </div>
    </div>
  );
}

function Row({ r, onDone }: { r: ReturnNotYetSentRow; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [cost, setCost] = useState("");
  const { busy, error, done, submit } = useOnBehalfSubmit();

  const ready = noteReady(note, NOTE_MIN_HEAVY);
  const costNum = cost.trim() ? Number(cost.replace(/[^0-9]/g, "")) : null;

  async function go() {
    const ok = await submit(
      () => adminMarkReturnSentForBuyer({
        disputeId: r.dispute_id, note,
        proofUrl: proofUrl.trim() || null,
        shippingCostNaira: costNum && costNum > 0 ? costNum : null,
      }),
      "Recorded as sent back.",
    );
    if (ok) onDone();
  }

  return (
    <div className="rounded-2xl border p-4 bg-white flex flex-col gap-3" style={{ borderColor: "#F0DDD2" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-heading font-black text-[14px] text-foreground">{r.listing_title || "Item"}</div>
          <div className="text-[11px] text-text-med">
            {r.order_reference || "No reference"} · {r.buyer_name || "Buyer"}
          </div>
        </div>
        <div className="font-heading font-extrabold text-[14px] tabular-nums">{formatNaira(r.amount_naira)}</div>
      </div>

      {done ? <OnBehalfDone msg={done} /> : !open ? (
        <button onClick={() => setOpen(true)} className="self-start text-[11px] underline" style={{ color: "#2D6A4F" }}>
          They told me they posted it back
        </button>
      ) : (
        <OnBehalfPanel
          title="Mark it as posted back, for the buyer"
          foot="The seller is then asked to confirm it arrived, and the refund follows from there."
        >
          <NoteField
            value={note} onChange={setNote} min={NOTE_MIN_HEAVY}
            prompt="How do you know they posted it back?"
            placeholder="For example: she sent a photo of the courier receipt on WhatsApp this morning"
          />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>A link to the receipt, if you have one</span>
              <input value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} placeholder="Optional"
                className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>What the return postage cost</span>
              <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional, in naira" inputMode="numeric"
                className="rounded-lg border px-2.5 py-2 text-[13px] tabular-nums" style={{ borderColor: "#E3D4CB" }} />
            </label>
          </div>
          <OnBehalfErr msg={error} />
          <button
            type="button" disabled={!ready || busy} onClick={go}
            className="self-start font-heading font-extrabold text-[12px] rounded-lg px-3 py-2"
            style={onBehalfBtn(ready && !busy)}
          >
            {busy ? "Working..." : "Mark as posted back"}
          </button>
        </OnBehalfPanel>
      )}
    </div>
  );
}
