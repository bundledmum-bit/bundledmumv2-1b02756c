import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import {
  formatNaira, relativeTimeAgo, fetchPendingPayments, fetchPaymentFailureContext,
  resolvePendingPaymentMessage, logPendingPaymentContact, undoPendingPaymentContact,
  superAdminMarkOrderPaid, type PendingPaymentRow,
} from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill } from "./opsUi";

/**
 * People who reached the payment page and did not finish.
 *
 * A sibling of MarketplaceAbandonedCheckouts, deliberately built to the same
 * shape (same card, same ContactActions layout, same mark-as-sent-with-undo)
 * rather than newly invented — but a genuinely different list: those people
 * never reached payment, these ones did. Everyone here had already decided
 * to buy.
 *
 * STRUGGLED is the whole point. True at two or more attempts, which means
 * something stopped them rather than them wandering off, so it leads the
 * sort and gets its own treatment.
 */

const QUERY_KEY = ["mkt-pending-payments"];
const MKT_SITE = "https://bundledmum.com/marketplace";

/** digits-only, Nigerian-number-aware — same helper the abandoned screen
 * and MarketplaceBuyers.tsx each keep locally, for the reason they state:
 * the shared one lives in the customer-facing tree, not admin. */
function toIntlPhone(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return "234" + digits.slice(1);
  return "234" + digits;
}

export default function MarketplacePendingPayments() {
  const { data: rows, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    staleTime: 15000,
    queryFn: fetchPendingPayments,
  });

  const { working, contacted, totalNaira, struggledCount } = useMemo(() => {
    const all = rows ?? [];
    // Struggled first, then by attempts, then by how recent. Someone who
    // tried three times today matters more than someone who half-started a
    // week ago, and that ordering is the screen's entire argument.
    const sort = (a: PendingPaymentRow, b: PendingPaymentRow) => {
      if (a.struggled !== b.struggled) return a.struggled ? -1 : 1;
      if (a.payment_attempt_count !== b.payment_attempt_count) return b.payment_attempt_count - a.payment_attempt_count;
      return a.hours_since - b.hours_since;
    };
    // Split on contacted_at, the same signal MarketplaceAbandonedCheckouts
    // uses, rather than on times_contacted. Marking someone sent moves them
    // across into the toggled group; it never hides or deletes them.
    const w = all.filter((r) => !r.contacted_at).sort(sort);
    const c = all.filter((r) => !!r.contacted_at).sort(sort);
    return {
      working: w,
      contacted: c,
      totalNaira: all.reduce((s, r) => s + (r.amount_naira || 0), 0),
      struggledCount: all.filter((r) => r.struggled).length,
    };
  }, [rows]);

  const [showContacted, setShowContacted] = useState(false);

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  if (!rows || rows.length === 0) {
    return (
      <div>
        <OpsHeader title="Did not finish paying" subtitle="Everyone who reached the payment page and stopped." />
        <OpsEmpty title="Nobody is stuck right now" body="Someone who opens Paystack and does not complete appears here, with how many times they tried." />
      </div>
    );
  }

  return (
    <div>
      <OpsHeader
        title="Did not finish paying"
        subtitle="Everyone who reached the payment page and stopped. They had already decided to buy."
      />

      <div className="rounded-2xl border p-3.5 mb-4 flex flex-wrap gap-x-6 gap-y-2"
        style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
        <Stat label="Waiting on a message" value={String(working.length)} />
        <Stat label="Something stopped them" value={String(struggledCount)} tone="warn" />
        <Stat label="Sitting there" value={formatNaira(totalNaira)} />
      </div>

      <div className="flex flex-col gap-2.5">
        {working.map((r) => <Row key={r.order_id} r={r} />)}
      </div>

      {contacted.length > 0 && (
        <div className="mt-5">
          <button onClick={() => setShowContacted((v) => !v)}
            className="font-heading font-extrabold text-[12px] underline" style={{ color: "#6B5B54" }}>
            {showContacted ? "Hide" : "Show"} {contacted.length} already messaged
          </button>
          {showContacted && (
            <div className="flex flex-col gap-2.5 mt-2.5">
              {contacted.map((r) => <Row key={r.order_id} r={r} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * When this record disappears. Quiet by default, since it is background
 * information rather than a task: an unpaid order is deleted 60 days after
 * it was created by a scheduled job, and nothing paid is ever deleted at
 * any age.
 *
 * Under a week it stops being background and becomes the last chance to
 * speak to that buyer, so it turns red and says so.
 */
const REMOVAL_SOON_DAYS = 7;

function RemovalNotice({ days }: { days: number | null }) {
  if (days == null) return null;
  if (days <= 0) {
    return <div className="text-[10.5px] font-heading font-extrabold" style={{ color: "#C0392B" }}>Removed any time now</div>;
  }
  const soon = days <= REMOVAL_SOON_DAYS;
  return (
    <div className={soon ? "text-[10.5px] font-heading font-extrabold" : "text-[10.5px]"}
      style={{ color: soon ? "#C0392B" : "#8A7A72" }}>
      {soon
        ? `Removed in ${days} ${days === 1 ? "day" : "days"}, last chance`
        : `Removed in ${days} days`}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <div className="font-heading font-black text-lg tabular-nums" style={{ color: tone === "warn" ? "#C0392B" : "#1A1A1A" }}>{value}</div>
      <div className="text-[11px] text-text-med">{label}</div>
    </div>
  );
}

function Row({ r }: { r: PendingPaymentRow }) {
  const { isSuperAdmin } = usePermissions();
  const intlPhone = toIntlPhone(r.buyer_phone);
  const name = r.buyer_name || "Someone";
  const item = r.listing_title || "an item";

  // The sentence already matched to how many times they tried, and the
  // sequenced message that carries it. Both per order, not per person.
  const { data: failureContext } = useQuery({
    queryKey: ["mkt-pp-context", r.order_id],
    staleTime: 60000,
    queryFn: () => fetchPaymentFailureContext(r.order_id),
  });
  const resumeLink = r.listing_id ? `${MKT_SITE}/checkout/${r.listing_id}?resume_order=${r.order_id}` : MKT_SITE;
  const { data: waHref } = useQuery({
    queryKey: ["mkt-pp-msg", r.order_id, r.buyer_id, r.times_contacted, failureContext],
    enabled: !!r.buyer_id && !!intlPhone,
    staleTime: 30000,
    queryFn: () => resolvePendingPaymentMessage({
      orderId: r.order_id, buyerId: r.buyer_id as string, wa: intlPhone,
      name, item, link: resumeLink, extra: failureContext ?? null,
    }),
  });

  const mailHref = r.buyer_email
    ? `mailto:${r.buyer_email}?subject=${encodeURIComponent(`Your ${item} on BundledMum`)}&body=${encodeURIComponent(
        `Hello ${name},\n\nYou started buying the ${item} but the payment did not go through.` +
        (failureContext ? `\n\n${failureContext}` : "") +
        `\n\nNothing has been taken from you. If you would still like it, you can finish here:\n${resumeLink}`)}`
    : null;

  return (
    <div className="rounded-2xl border p-3.5 flex gap-3 items-start"
      style={{ borderColor: r.struggled ? "#C0392B" : "#F0DDD2", background: "#fff" }}>
      <div className="w-14 h-14 rounded-lg flex-none overflow-hidden"
        style={{ background: "repeating-linear-gradient(135deg,#FDE8DF 0 6px,#FFF8F4 6px 12px)" }}>
        {r.image_url && <img src={r.image_url} alt="" className="w-full h-full object-cover" />}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="font-heading font-black text-sm text-foreground truncate">{name}</div>
            <div className="text-[11.5px] text-text-med truncate">{item}</div>
          </div>
          <div className="text-right flex-none">
            <div className="font-heading font-black text-sm text-foreground tabular-nums">
              {r.amount_naira != null ? formatNaira(r.amount_naira) : "—"}
            </div>
            <div className="text-[10.5px] text-text-med">{relativeTimeAgo(r.updated_at)}</div>
            <RemovalNotice days={r.days_until_removed} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {/* The attempt count says the whole story at a glance. */}
          <StatusPill
            tone={r.struggled ? "negative" : "neutral"}
            label={r.payment_attempt_count === 1 ? "Tried once" : `Tried ${r.payment_attempt_count} times`}
          />
          {r.listing_status && r.listing_status !== "live" && (
            <StatusPill tone="neutral" label={`Listing ${r.listing_status}`} />
          )}
          {r.latest_reference && <span className="text-[10.5px] text-text-med">{r.latest_reference}</span>}
        </div>

        {failureContext && (
          <div className="rounded-lg px-2.5 py-2 text-[11.5px]"
            style={{ background: "#FDE8DF", color: "#8C4A34" }}>{failureContext}</div>
        )}

        <div className="flex flex-wrap gap-3 text-[11.5px] text-text-med">
          {r.buyer_email && <span className="truncate">{r.buyer_email}</span>}
          {r.buyer_phone && <span>{r.buyer_phone}</span>}
          {!r.buyer_email && !r.buyer_phone && <span>No contact details captured</span>}
        </div>

        <ContactActions r={r} waHref={waHref ?? null} mailHref={mailHref} />

        {/* Super admin only. A non super admin sees nothing here at all,
            rather than a control that would fail when tapped. */}
        {isSuperAdmin && <MarkPaidByHand r={r} />}
      </div>
    </div>
  );
}

/** Contacted line + Mark as sent/Undo, matching the abandoned-checkouts and
 * outreach layouts exactly: WhatsApp and Mark as sent are two separate
 * actions on purpose, since opening a chat is not proof a message went. */
function ContactActions({ r, waHref, mailHref }: { r: PendingPaymentRow; waHref: string | null; mailHref: string | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markSent() {
    if (!r.buyer_id) return;
    setBusy(true); setError(null);
    try {
      const ok = await logPendingPaymentContact(r.buyer_id, r.order_id);
      if (!ok) throw new Error("not saved");
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
    } catch { setError("Could not save, try again."); } finally { setBusy(false); }
  }

  async function undo() {
    if (!r.buyer_id) return;
    setBusy(true); setError(null);
    try {
      const ok = await undoPendingPaymentContact(r.buyer_id, r.order_id);
      if (!ok) throw new Error("not saved");
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
    } catch { setError("Could not undo, try again."); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <div className="flex items-center gap-2 flex-wrap">
        {r.times_contacted > 0 ? (
          <span className="text-[11px] text-text-med">
            Messaged {r.times_contacted === 1 ? "once" : `${r.times_contacted} times`}
          </span>
        ) : (
          <span className="font-heading font-extrabold text-[11px]" style={{ color: "#D4613C" }}>Not yet contacted</span>
        )}
        {r.times_contacted > 0 && (
          <button onClick={undo} disabled={busy} className="text-[11px] underline" style={{ color: "#8A7A72" }}>Undo</button>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {waHref ? (
          <a href={waHref} target="_blank" rel="noreferrer"
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]"
            style={{ background: "#25D366", color: "#fff" }}>Message on WhatsApp</a>
        ) : (
          <span className="flex-1 min-w-[140px] flex items-center justify-center rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]"
            style={{ background: "#EDE6E1", color: "#8A7A72" }}>
            {r.times_contacted >= 3 ? "All 3 messages sent" : "No number on file"}
          </span>
        )}
        {mailHref && (
          <a href={mailHref}
            className="flex-none flex items-center justify-center rounded-lg py-2.5 px-3 font-heading font-extrabold text-[12.5px] border"
            style={{ borderColor: "#E3D4CB", color: "#3D3936", background: "#fff" }}>Email</a>
        )}
        {r.times_contacted < 3 && (
          <button onClick={markSent} disabled={busy || !r.buyer_id}
            className="flex-1 min-w-[120px] flex items-center justify-center rounded-lg py-2.5 font-heading font-extrabold text-[12.5px] border"
            style={{ borderColor: "#2D6A4F", color: "#2D6A4F", background: "#fff" }}>
            {busy ? "Saving..." : "Mark as sent"}
          </button>
        )}
      </div>
      {error && <span className="text-[11px]" style={{ color: "#C0392B" }}>{error}</span>}
    </div>
  );
}

/**
 * Recording that money arrived some other way. Deliberately not a button:
 * this releases the item to the seller and commits us to paying them on one
 * person's word, so it is a short form with real fields and someone has to
 * think before submitting.
 */
function MarkPaidByHand({ r }: { r: PendingPaymentRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount.replace(/[^\d]/g, ""));
  const reasonOk = reason.trim().length >= 10;
  const ready = amountNum > 0 && method.trim() !== "" && reasonOk;

  async function submit() {
    setBusy(true); setError(null);
    const res = await superAdminMarkOrderPaid({
      orderId: r.order_id, amountReceivedNaira: amountNum,
      method: method.trim(), reason: reason.trim(),
    });
    setBusy(false);
    if (!res.ok) { setError(res.message ?? "Could not record that. Please try again."); return; }
    setOpen(false);
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="self-start text-[11px] underline mt-0.5" style={{ color: "#8A7A72" }}>
        Money reached us another way
      </button>
    );
  }

  return (
    <div className="rounded-xl border p-3 mt-1 flex flex-col gap-2.5" style={{ borderColor: "#C0392B", background: "#FFF8F4" }}>
      <div className="font-heading font-black text-[13px]">Record a payment that reached us another way</div>

      {/* The reconcile sweep settles anything Paystack calls paid every 5
          minutes, so a row still sitting here means Paystack has nothing.
          Said plainly so nobody records something the system would have
          settled by itself. */}
      <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FCEBE9", color: "#8C2A1F" }}>
        Paystack has no successful payment for this, so only mark it paid if money reached you another way.
        This releases the item to {r.seller_name || "the seller"} and commits us to paying them.
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>How much actually reached us</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric"
          placeholder={r.amount_naira != null ? `Order was ${formatNaira(r.amount_naira)}` : "Amount in naira"}
          className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
        <span className="text-[10.5px] text-text-med">Type what landed, not what the order says. They can differ.</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>How did it reach us</span>
        <input value={method} onChange={(e) => setMethod(e.target.value)}
          placeholder="Bank transfer, cash, or however it came"
          className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>What happened</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
          placeholder="Write what happened. This is kept forever as the record of why."
          className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
        <span className="text-[10.5px]" style={{ color: reasonOk ? "#8A7A72" : "#C0392B" }}>
          {reasonOk ? "Kept with your name against it." : "At least a sentence, so this makes sense to whoever reads it later."}
        </span>
      </label>

      {error && <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FCEBE9", color: "#8C2A1F" }}>{error}</div>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={!ready || busy}
          className="flex-1 rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]"
          style={ready && !busy ? { background: "#C0392B", color: "#fff" } : { background: "#EDD9D2", color: "#B5806E" }}>
          {busy ? "Recording..." : "Record this payment"}
        </button>
        <button onClick={() => { setOpen(false); setError(null); }} disabled={busy}
          className="flex-none rounded-lg py-2.5 px-3 font-heading font-extrabold text-[12.5px] border"
          style={{ borderColor: "#E3D4CB", color: "#6B5B54", background: "#fff" }}>Cancel</button>
      </div>
    </div>
  );
}
