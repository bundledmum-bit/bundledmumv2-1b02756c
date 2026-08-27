import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import {
  formatNaira, relativeTimeAgo, fetchAwaitingConfirmation,
  superAdminConfirmReceiptOnBehalf, type AwaitingConfirmationRow,
} from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill } from "./opsUi";

/**
 * Orders the seller has sent that the buyer has never confirmed.
 *
 * The seller is waiting on money for something already delivered. When the
 * buyer has told us some other way that it arrived and they are happy, this
 * records that MISSING CONFIRMATION.
 *
 * It is deliberately NOT a second way to release a payout. Once recorded,
 * the payout follows the normal path entirely unchanged: same proof
 * screenshot, same emails, same three step release on the payout queue.
 * Two routes to money leaving the business would drift apart and one would
 * end up with weaker guards, so there is one route.
 */

const QUERY_KEY = ["mkt-awaiting-confirmation"];

/** Below this, an order is too new to be overriding anyone. The buyer may
 * simply not have opened the app yet. */
const TOO_EARLY_DAYS = 3;

export default function MarketplaceAwaitingConfirmation() {
  const { data: rows, isLoading } = useQuery({
    queryKey: QUERY_KEY, staleTime: 15000, queryFn: fetchAwaitingConfirmation,
  });

  const { sorted, owedTotal } = useMemo(() => {
    const all = rows ?? [];
    // Longest wait first: the seller who has been waiting most is the one
    // most owed an answer.
    const s = [...all].sort((a, b) => b.days_since_sent - a.days_since_sent);
    return { sorted: s, owedTotal: all.reduce((t, r) => t + (r.seller_share_naira || 0), 0) };
  }, [rows]);

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  if (sorted.length === 0) {
    return (
      <div>
        <OpsHeader title="Waiting on the buyer" subtitle="Sent by the seller, not yet confirmed by the buyer." />
        <OpsEmpty title="Everyone has confirmed" body="An order appears here once a seller marks it sent and the buyer has not confirmed receipt yet." />
      </div>
    );
  }

  return (
    <div>
      <OpsHeader
        title="Waiting on the buyer"
        subtitle="Sent by the seller, not yet confirmed by the buyer. Their money is still held."
      />
      <div className="rounded-2xl border p-3.5 mb-4 flex flex-wrap gap-x-6 gap-y-2"
        style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
        <div>
          <div className="font-heading font-black text-lg tabular-nums">{sorted.length}</div>
          <div className="text-[11px] text-text-med">{sorted.length === 1 ? "seller waiting" : "sellers waiting"}</div>
        </div>
        <div>
          <div className="font-heading font-black text-lg tabular-nums">{formatNaira(owedTotal)}</div>
          <div className="text-[11px] text-text-med">Held, not yet payable</div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {sorted.map((r) => <Row key={r.order_id} r={r} />)}
      </div>
    </div>
  );
}

function Row({ r }: { r: AwaitingConfirmationRow }) {
  const { isSuperAdmin } = usePermissions();
  const days = Math.floor(r.days_since_sent);
  const tooEarly = r.days_since_sent < TOO_EARLY_DAYS;

  return (
    <div className="rounded-2xl border p-3.5 flex gap-3 items-start" style={{ borderColor: "#F0DDD2", background: "#fff" }}>
      <div className="w-14 h-14 rounded-lg flex-none overflow-hidden"
        style={{ background: "repeating-linear-gradient(135deg,#FDE8DF 0 6px,#FFF8F4 6px 12px)" }}>
        {r.image_url && <img src={r.image_url} alt="" className="w-full h-full object-cover" />}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="font-heading font-black text-sm text-foreground truncate">{r.listing_title || "An item"}</div>
            <div className="text-[11.5px] text-text-med truncate">
              {r.seller_name || "A seller"} sent it to {r.buyer_name || "the buyer"}
            </div>
          </div>
          <div className="text-right flex-none">
            <div className="font-heading font-black text-sm text-foreground tabular-nums">{formatNaira(r.seller_share_naira)}</div>
            <div className="text-[10.5px] text-text-med">owed to the seller</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <StatusPill
            tone={r.has_open_dispute ? "negative" : tooEarly ? "neutral" : "work"}
            label={days < 1 ? "Sent today" : days === 1 ? "Sent yesterday" : `Waiting ${days} days`}
          />
          {r.nudged_twice ? <StatusPill tone="neutral" label="Nudged twice" />
            : r.nudged_once ? <StatusPill tone="neutral" label="Nudged once" />
            : <StatusPill tone="neutral" label="Not nudged yet" />}
          {r.has_open_dispute && <StatusPill tone="negative" label="Open dispute" />}
        </div>

        <div className="flex flex-wrap gap-3 text-[11.5px] text-text-med">
          {r.buyer_phone && <span>Buyer {r.buyer_phone}</span>}
          {r.seller_phone && <span>Seller {r.seller_phone}</span>}
        </div>

        {/* An open dispute is the opposite of being happy, so the control is
            not offered at all. The RPC refuses regardless. */}
        {r.has_open_dispute ? (
          <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FCEBE9", color: "#8C2A1F" }}>
            This buyer raised a problem. Resolve the dispute first, that is the opposite of confirming they are happy.
          </div>
        ) : isSuperAdmin ? (
          <ConfirmOnBehalf r={r} tooEarly={tooEarly} days={days} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Recording that the buyer confirmed, when they told us some other way.
 *
 * Built to feel like what it is. This sets aside the buyer protection that
 * is the entire promise of this marketplace, so the reason is the substance
 * of the form rather than a box under a button, and what it costs is shown
 * before it can be submitted.
 */
function ConfirmOnBehalf({ r, tooEarly, days }: { r: AwaitingConfirmationRow; tooEarly: boolean; days: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reasonOk = reason.trim().length >= 15;

  async function submit() {
    setBusy(true); setError(null);
    const res = await superAdminConfirmReceiptOnBehalf({ orderId: r.order_id, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) { setError(res.message ?? "Could not record that. Please try again."); return; }
    setDone(true);
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  }

  if (done) {
    return (
      <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#D8EFE5", color: "#1A4A33" }}>
        Recorded, and both of them have been emailed. Nothing has been paid yet: this order now joins the payout
        queue and still needs its proof screenshot before the transfer can be marked sent.
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="self-start text-[11px] underline mt-0.5" style={{ color: "#8A7A72" }}>
        They told me they got it
      </button>
    );
  }

  return (
    <div className="rounded-xl border p-3 mt-1 flex flex-col gap-2.5" style={{ borderColor: "#C0392B", background: "#FFF8F4" }}>
      <div className="font-heading font-black text-[13px]">Record that {r.buyer_name || "the buyer"} confirmed receipt</div>

      {/* Too early is discouraged, loudly, but not prevented: a buyer can
          genuinely tell you on the same day, and only the person holding
          that conversation knows. The judgement stays with them, the
          warning makes sure it is a judgement rather than a reflex. */}
      {tooEarly && (
        <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FCEBE9", color: "#8C2A1F" }}>
          <b className="font-heading font-extrabold">This was only sent {days < 1 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.</b>
          {" "}
          {r.nudged_once || r.nudged_twice
            ? "They have been reminded, but this is still early."
            : "They have not even been reminded yet."}
          {" "}Give them a chance to confirm it themselves first, unless you have genuinely heard from them.
        </div>
      )}

      {/* The substance of the form. */}
      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[12px]">How do you know they received it and are happy?</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
          placeholder="What did they actually say, and where? For example: she sent a photo of it on WhatsApp this morning and said the baby loves it."
          className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
        <span className="text-[10.5px]" style={{ color: reasonOk ? "#8A7A72" : "#C0392B" }}>
          {reasonOk
            ? "Kept forever against your name, as the only record of why their protection was set aside."
            : "At least a sentence. This is the only record of why their protection was set aside."}
        </span>
      </label>

      {/* What it costs, stated before it can be submitted. */}
      <div className="rounded-lg px-2.5 py-2 text-[11.5px] flex flex-col gap-1" style={{ background: "#FDE8DF", color: "#8C4A34" }}>
        <span><b className="font-heading font-extrabold">{formatNaira(r.seller_share_naira)}</b> becomes payable to {r.seller_name || "the seller"}.</span>
        <span>{r.buyer_name || "The buyer"}'s protection on this order ends here. They will no longer be able to report a problem.</span>
        <span><b className="font-heading font-extrabold">Both of them are emailed the moment you press this.</b> The buyer is told we have recorded it, that the seller will be paid, and to tell us today if that is wrong.</span>
      </div>

      {error && <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FCEBE9", color: "#8C2A1F" }}>{error}</div>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={!reasonOk || busy}
          className="flex-1 rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]"
          style={reasonOk && !busy ? { background: "#C0392B", color: "#fff" } : { background: "#EDD9D2", color: "#B5806E" }}>
          {busy ? "Recording..." : "Record their confirmation"}
        </button>
        <button onClick={() => { setOpen(false); setError(null); }} disabled={busy}
          className="flex-none rounded-lg py-2.5 px-3 font-heading font-extrabold text-[12.5px] border"
          style={{ borderColor: "#E3D4CB", color: "#6B5B54", background: "#fff" }}>Cancel</button>
      </div>

      <span className="text-[10.5px] text-text-med">
        This does not pay anyone. The order joins the payout queue and still needs its proof screenshot,
        exactly as every other payout does.
      </span>
    </div>
  );
}
