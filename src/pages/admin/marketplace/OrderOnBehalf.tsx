import { useState } from "react";
import {
  formatNaira, adminMarkDispatchedOnBehalf, adminRaiseDisputeForBuyer,
  type AdminOrderDetail,
} from "./opsData";
import {
  NoteField, noteReady, OnBehalfErr, OnBehalfDone, OnBehalfPanel, Blocked,
  onBehalfBtn, useOnBehalfSubmit, NOTE_MIN_HEAVY,
} from "./onBehalf";
import { ConfirmDialog } from "./opsUi";

/**
 * The two things an operator ends up doing for a buyer or a seller who told
 * us on WhatsApp and never opened the app.
 *
 * Both need ten characters of note rather than five, because both are heard
 * by the other side: a dispatch tells a buyer their item is on the way and
 * starts the dispute window, and a dispute tells a seller something is
 * wrong with their item and holds their money. A five character note is not
 * a record of either.
 */

/* ── Mark it as sent ──────────────────────────────────────────────────── */

export function MarkDispatched({ o, onDone }: { o: AdminOrderDetail; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { busy, error, done, submit } = useOnBehalfSubmit();

  if (done) return <OnBehalfDone msg={done} />;

  if (o.payment_status !== "paid") {
    return <Blocked>Nothing has been paid for this order yet, so there is nothing to send.</Blocked>;
  }
  if (o.dispatch_confirmed_at) {
    return <Blocked>Already marked as sent on {new Date(o.dispatch_confirmed_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}.</Blocked>;
  }

  const ready = noteReady(note, NOTE_MIN_HEAVY);

  async function go() {
    const ok = await submit(
      () => adminMarkDispatchedOnBehalf({ orderId: o.id, note, photoUrl: photoUrl.trim() || null }),
      "Recorded as sent.",
    );
    setConfirming(false);
    if (ok) onDone();
  }

  return (
    <OnBehalfPanel
      title="Mark it as sent, for the seller"
      foot="The buyer is told straight away, and the window in which they can raise a problem starts from now."
    >
      <NoteField
        value={note} onChange={setNote} min={NOTE_MIN_HEAVY}
        prompt="How do you know it was sent?"
        placeholder="For example: she sent a photo of the waybill on WhatsApp this morning and gave the courier's name"
      />
      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>
          A link to a photo, if you have one
        </span>
        <input
          value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="Optional"
          className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }}
        />
        {/* Deliberately optional, and said so plainly: a seller who cannot
            get a photo to upload should not leave the buyer stuck waiting.
            The note is the record instead. */}
        <span className="text-[10.5px]" style={{ color: "#8A7A72" }}>
          Not needed. A seller who cannot send a photo should not leave the buyer waiting, so your note is the record instead.
        </span>
      </label>
      <OnBehalfErr msg={error} />
      <button
        type="button" disabled={!ready || busy} onClick={() => setConfirming(true)}
        className="self-start font-heading font-extrabold text-[12px] rounded-lg px-3 py-2"
        style={onBehalfBtn(ready && !busy)}
      >
        Mark as sent
      </button>

      <ConfirmDialog
        open={confirming}
        title="Mark this as sent?"
        body="The buyer is told immediately that it is on its way, and the time they have to report a problem starts running from now."
        kv={[
          { label: "Item", value: o.listing_title || "Item" },
          { label: "Buyer", value: o.buyer_name || "Buyer" },
          { label: "Seller", value: o.seller_name || "Seller" },
        ]}
        confirmLabel="Yes, mark as sent"
        busy={busy} error={error} onConfirm={go} onCancel={() => setConfirming(false)}
      />
    </OnBehalfPanel>
  );
}

/* ── Raise a dispute ──────────────────────────────────────────────────── */

/**
 * The heaviest of the seven, and the reason it is treated differently.
 *
 * Opening a dispute in a buyer's name freezes the seller's money and tells
 * them something is wrong with their item. A buyer whose item arrived
 * broken previously had NO way to have that recorded, so their money sat
 * held with nothing moving, which is worse. But doing it should still feel
 * deliberate, so the order, the seller and the amount held are all shown
 * before the action rather than after it.
 */
export function RaiseDispute({ o, onDone }: { o: AdminOrderDetail; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { busy, error, done, submit } = useOnBehalfSubmit();

  if (done) return <OnBehalfDone msg={done} />;

  if (o.payment_status !== "paid") {
    return <Blocked>No money was taken for this order, so there is nothing held to dispute.</Blocked>;
  }
  if (o.has_open_dispute) {
    return <Blocked>This order already has an open dispute. It is waiting to be ruled on under Disputes.</Blocked>;
  }

  const reasonOk = reason.trim().length >= 5;
  const ready = reasonOk && noteReady(note, NOTE_MIN_HEAVY);

  async function go() {
    const ok = await submit(
      () => adminRaiseDisputeForBuyer({ orderId: o.id, reason, note }),
      "Opened.",
    );
    setConfirming(false);
    if (ok) onDone();
  }

  return (
    <OnBehalfPanel
      title="Raise a dispute, for the buyer"
      foot="Use their words for what is wrong. The seller reads this, and it is what the ruling gets decided on."
    >
      {/* Shown before the action, not after it: this is what the click
          actually does to a real person's money. */}
      <div className="rounded-lg border divide-y" style={{ borderColor: "#F0DDD2", background: "#fff" }}>
        <Line label="Item" value={o.listing_title || "Item"} />
        <Line label="Seller" value={o.seller_name || "Seller"} />
        <Line label="Money held" value={formatNaira(o.amount_naira)} />
      </div>
      <div className="text-[11px]" style={{ color: "#8A5A2B" }}>
        This freezes that money and tells {o.seller_name || "the seller"} something is wrong with their item.
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>What is wrong with the item?</span>
        <textarea
          value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
          placeholder="For example: the steriliser arrived with the lid cracked and it will not close"
          className="rounded-lg border px-2.5 py-2 text-[13px] resize-y" style={{ borderColor: "#E3D4CB" }}
        />
        <span className="text-[10.5px]" style={{ color: reasonOk ? "#8A7A72" : "#C0392B" }}>
          {reasonOk ? "The seller sees this as the buyer's own words." : "Needed. The seller sees this as the buyer's own words."}
        </span>
      </label>

      <NoteField
        value={note} onChange={setNote} min={NOTE_MIN_HEAVY}
        prompt="How do you know, and what did they say?"
        placeholder="For example: she called this afternoon and sent two photos on WhatsApp showing the cracked lid"
      />
      <OnBehalfErr msg={error} />
      <button
        type="button" disabled={!ready || busy} onClick={() => setConfirming(true)}
        className="self-start font-heading font-extrabold text-[12px] rounded-lg px-3 py-2"
        style={ready && !busy ? { background: "#C0392B", color: "#fff" } : onBehalfBtn(false)}
      >
        Raise the dispute
      </button>

      <ConfirmDialog
        open={confirming} danger
        title="Open a dispute in the buyer's name?"
        body="The seller is told there is a problem with their item, and this money stays held until someone rules on it."
        kv={[
          { label: "Item", value: o.listing_title || "Item" },
          { label: "Seller", value: o.seller_name || "Seller" },
          { label: "Buyer", value: o.buyer_name || "Buyer" },
          { label: "Money held", value: formatNaira(o.amount_naira) },
        ]}
        confirmLabel="Yes, open it"
        busy={busy} error={error} onConfirm={go} onCancel={() => setConfirming(false)}
      />
    </OnBehalfPanel>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-[11px] text-text-med">{label}</span>
      <span className="font-heading font-extrabold text-[12.5px] text-foreground tabular-nums text-right">{value}</span>
    </div>
  );
}
