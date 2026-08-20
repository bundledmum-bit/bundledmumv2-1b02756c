import { adb, formatNaira } from "./data";

/**
 * Shared data layer for the marketplace operations screens (dashboard, payout
 * queue, disputes, sellers, listings, orders, money owed). Reads go through the
 * admin Supabase client (adb) under the existing "Admin manage" RLS policies and
 * the marketplace_payout_queue view. Every money-moving ACTION is an RPC that
 * merely RECORDS what a person already did at the bank, it never moves money.
 */
export { adb, formatNaira };

/** A seller is suspended at three strikes; two is the "approaching" warning. */
export const STRIKE_THRESHOLD = 3;

/** Full date and time in Africa/Lagos, e.g. "12 August 2026, 3:41 PM" — the
 * operator-facing format for anything where a relative label or date-only
 * would hide exactly when something happened. Shared so the seller and
 * buyer detail panels read identically. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });
  return `${datePart}, ${timePart}`;
}

// ─── Payout queue view row ───────────────────────────────────────────────────
export interface PayoutRow {
  order_id: string;
  order_reference: string;
  seller_share_naira: number;
  settlement_status: string;
  payout_released_at: string | null;
  payout_failed_reason: string | null;
  dispatch_confirmed_at: string | null;
  buyer_confirmed_at: string | null;
  order_status: string;
  listing_title: string | null;
  seller_id: string;
  seller_name: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  outstanding_debit_naira: number;
  eligible_via: "buyer_confirmed" | "timeout_sweep" | null;
  is_eligible: boolean;
}

/** Rows the operator can act on: eligible and not yet settled. */
export async function fetchPayoutQueue(): Promise<PayoutRow[]> {
  const { data, error } = await adb
    .from("marketplace_payout_queue")
    .select("*")
    .order("dispatch_confirmed_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PayoutRow[];
}

export async function markPayoutReleased(orderId: string, note: string): Promise<boolean> {
  const { data, error } = await adb.rpc("admin_mark_payout_released", { p_order_id: orderId, p_note: note });
  if (error) throw error;
  return data === true;
}

export async function markPayoutFailed(orderId: string, reason: string): Promise<boolean> {
  const { data, error } = await adb.rpc("admin_mark_payout_failed", { p_order_id: orderId, p_reason: reason });
  if (error) throw error;
  return data === true;
}

// ─── Payout proof (payment screenshot) ───────────────────────────────────────
// admin_mark_payout_released now REFUSES without proof attached — enforced in
// the database (guard_payout_release_requires_proof or equivalent), not just
// here, so this holds however the RPC is called. The bucket is private
// (admin read/write only, gated by the same has_admin_permission check as
// everything else on this screen), so a proof is only ever shown via a
// short-lived signed URL, never a public one.

export const PAYOUT_PROOF_BUCKET = "payout-proofs";
const PAYOUT_PROOF_MAX_BYTES = 5 * 1024 * 1024;

/** Uploads a payment screenshot for this order. No client-side compression —
 * this is a screenshot out of a banking app, not a photo, and the bucket's
 * own 5MB limit is generous for that; the size check here just catches an
 * oversized file with a clear message before it ever reaches storage.
 * Returns the storage PATH, never a public URL (the bucket is private) —
 * this is exactly what admin_attach_payout_proof stores, and the email side
 * already knows to sign it when sending. */
export async function uploadPayoutProof(orderId: string, file: File): Promise<{ path: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > PAYOUT_PROOF_MAX_BYTES) throw new Error("This image is larger than 5MB, please choose a smaller screenshot.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${orderId}/${Date.now()}.${ext}`;
  const { error } = await adb.storage.from(PAYOUT_PROOF_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) throw error;
  return { path };
}

/** Records the uploaded screenshot against the order. Raises "A payment
 * screenshot is required" if proofPath is empty — the caller surfaces
 * whatever the database says, never a paraphrase. */
export async function attachPayoutProof(orderId: string, proofPath: string): Promise<boolean> {
  const { data, error } = await adb.rpc("admin_attach_payout_proof", { p_order_id: orderId, p_proof_url: proofPath });
  if (error) throw error;
  return data === true;
}

/** A short-lived signed URL to preview a proof screenshot in the admin UI.
 * Never a public URL, the bucket does not allow one by design. */
export async function getPayoutProofSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await adb.storage.from(PAYOUT_PROOF_BUCKET).createSignedUrl(path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Whether this order already has a payout proof attached, read directly
 * from marketplace_orders (payout_proof_url is not one of the columns
 * marketplace_payout_queue exposes) under the same "Admin manage orders"
 * policy that already grants admin read across this whole ops surface.
 * Used only to resume the release flow sensibly if an admin uploaded, then
 * navigated away before releasing — never to widen what a seller or buyer
 * can read, this table's own RLS is untouched. */
export async function fetchPayoutProofState(orderId: string): Promise<{ path: string | null; uploadedAt: string | null }> {
  const { data, error } = await adb.from("marketplace_orders").select("payout_proof_url, payout_proof_uploaded_at").eq("id", orderId).maybeSingle();
  if (error) return { path: null, uploadedAt: null };
  const row = data as { payout_proof_url?: string | null; payout_proof_uploaded_at?: string | null } | null;
  return { path: row?.payout_proof_url ?? null, uploadedAt: row?.payout_proof_uploaded_at ?? null };
}

export async function markRefundPaid(orderId: string): Promise<boolean> {
  const { data, error } = await adb.rpc("admin_mark_refund_paid", { p_order_id: orderId });
  if (error) throw error;
  return data === true;
}

export type DisputeOutcome = "rejected" | "full_refund" | "courier_fault";

export async function resolveDispute(input: {
  disputeId: string;
  outcome: DisputeOutcome;
  notes: string;
  returnRequired?: boolean;
  returnShippingPayer?: string | null;
}): Promise<boolean> {
  const { data, error } = await adb.rpc("admin_resolve_dispute", {
    p_dispute_id: input.disputeId,
    p_outcome: input.outcome,
    p_notes: input.notes,
    p_return_required: input.returnRequired ?? false,
    p_return_shipping_payer: input.returnShippingPayer ?? null,
  });
  if (error) throw error;
  return data === true;
}

/** The three dispute outcomes and the consequence each one triggers. The UI must
 * show the consequence BEFORE the operator commits. */
export const DISPUTE_OUTCOMES: Array<{ key: DisputeOutcome; title: string; tagline: string; consequence: string; danger: boolean }> = [
  {
    key: "rejected",
    title: "Rejected",
    tagline: "Seller gets paid",
    consequence: "Claim not upheld. The order is completed, settlement is unblocked and the held money is released to the seller. No strike.",
    danger: false,
  },
  {
    key: "full_refund",
    title: "Full refund",
    tagline: "Buyer refunded, seller strike",
    consequence: "Seller at fault. The order is refunded to the buyer, the payout is blocked, and the seller gets a strike.",
    danger: true,
  },
  {
    key: "courier_fault",
    title: "Courier fault",
    tagline: "Buyer made whole, no strike",
    consequence: "Nobody at fault. The order is refunded to the buyer and the payout is blocked. No strike to the seller.",
    danger: false,
  },
];

// ─── Money-state pill for an order ───────────────────────────────────────────
export type PillTone = "good" | "work" | "negative" | "neutral";

export interface OrderMoneyRow {
  id: string;
  paystack_transaction_reference: string | null;
  amount_naira: number;
  payment_status: string;
  settlement_status: string;
  order_status: string;
  created_at: string;
  listing_id: string;
  buyer_id: string | null;
  seller_id: string | null;
}

/** One clear money-state per order, derived from payment, settlement and order
 * status. Order of checks matters: dispute and refund win over settlement. */
export function orderMoneyState(o: { payment_status: string; settlement_status: string; order_status: string }): { label: string; tone: PillTone } {
  if (o.order_status === "disputed") return { label: "Disputed", tone: "work" };
  if (o.order_status === "refunded") return { label: "Refunded", tone: "negative" };
  if (o.settlement_status === "settled") return { label: "Payout released", tone: "good" };
  if (o.settlement_status === "payout_failed") return { label: "Payout failed", tone: "negative" };
  if (o.payment_status === "paid") return { label: "Funds held", tone: "work" };
  return { label: "Awaiting payment", tone: "neutral" };
}

/** True when a payout-queue/settlement row counts toward "held funds" or "owed". */
export function isUnsettled(settlementStatus: string): boolean {
  return settlementStatus !== "settled";
}

// ─── Returns (design 20a) ──────────────────────────────────────────────────
export interface ReturnAwaitingRow {
  dispute_id: string;
  order_id: string;
  return_sent_at: string;
  return_proof_url: string | null;
  return_shipping_cost_naira: number | null;
  order_reference: string;
  amount_naira: number;
  listing_title: string | null;
  seller_name: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  is_overdue: boolean;
}

/** Returns the buyer has posted back, not yet confirmed received. From the
 * marketplace_returns_awaiting_confirmation view (admin readable). */
export async function fetchReturnsAwaitingConfirmation(): Promise<ReturnAwaitingRow[]> {
  const { data, error } = await adb.from("marketplace_returns_awaiting_confirmation").select("*").order("return_sent_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ReturnAwaitingRow[];
}

export interface ReturnToPayRow {
  dispute_id: string;
  order_id: string;
  order_reference: string;
  amount_naira: number;
  listing_title: string | null;
  return_received_at: string;
  return_confirmed_by: string | null;
  refund_bank_name: string | null;
  refund_account_name: string | null;
  refund_account_number: string | null;
}

/** Confirmed returns whose refund transfer has not been recorded yet. The
 * awaiting-confirmation view excludes these (return_received_at is set), and
 * it does not carry bank details anyway, so this reads marketplace_disputes
 * directly, the same manual-join pattern the disputes screen already uses. */
export async function fetchReturnsToPay(): Promise<ReturnToPayRow[]> {
  const { data: rows, error } = await adb.from("marketplace_disputes")
    .select("id, order_id, return_received_at, return_confirmed_by, refund_bank_name, refund_account_name, refund_account_number")
    .eq("return_required", true)
    .not("return_received_at", "is", null)
    .is("refund_paid_at", null)
    .order("return_received_at", { ascending: true });
  if (error) throw error;
  const dRows = (rows ?? []) as Array<{ id: string; order_id: string; return_received_at: string; return_confirmed_by: string | null; refund_bank_name: string | null; refund_account_name: string | null; refund_account_number: string | null }>;
  if (!dRows.length) return [];

  const { data: orders } = await adb.from("marketplace_orders").select("id, paystack_transaction_reference, amount_naira, listing_id").in("id", dRows.map((d) => d.order_id));
  const oMap = new Map((orders ?? []).map((o: Record<string, unknown>) => [o.id as string, o]));
  const listingIds = Array.from(new Set((orders ?? []).map((o: Record<string, unknown>) => o.listing_id as string).filter(Boolean)));
  const { data: listings } = listingIds.length ? await adb.from("marketplace_listings").select("id, title").in("id", listingIds) : { data: [] };
  const lMap = new Map((listings ?? []).map((l: { id: string; title: string | null }) => [l.id, l.title]));

  return dRows.map((d) => {
    const o = (oMap.get(d.order_id) ?? {}) as Record<string, unknown>;
    return {
      dispute_id: d.id, order_id: d.order_id,
      order_reference: (o.paystack_transaction_reference as string) || "",
      amount_naira: Number(o.amount_naira || 0),
      listing_title: (lMap.get(o.listing_id as string) as string) || null,
      return_received_at: d.return_received_at, return_confirmed_by: d.return_confirmed_by,
      refund_bank_name: d.refund_bank_name, refund_account_name: d.refund_account_name, refund_account_number: d.refund_account_number,
    };
  });
}

/** Confirms a return on the seller's behalf, at any time, not only when
 * overdue. Releases the buyer's refund, same as the seller doing it
 * themselves. */
export async function adminConfirmReturnReceived(disputeId: string): Promise<boolean> {
  const { data, error } = await adb.rpc("admin_confirm_return_received", { p_dispute_id: disputeId });
  if (error) throw error;
  return data === true;
}

/** Records that the refund bank transfer has actually been sent. Only
 * meaningful once the return itself is confirmed received. */
export async function adminMarkReturnRefundPaid(disputeId: string): Promise<boolean> {
  const { data, error } = await adb.rpc("admin_mark_return_refund_paid", { p_dispute_id: disputeId });
  if (error) throw error;
  return data === true;
}

/** Same-day check for keeping released rows visible (dimmed) for the day. */
export function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Short time like "09:14" for released/failed timestamps. */
export function shortTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

// ─── Outreach queue ─────────────────────────────────────────────────────────

/** One row per person per outreach reason they currently match — the same
 * get_seller_nudge_suggestions / get_buyer_nudge_suggestions the per-seller
 * "Suggested outreach" panel already calls, just run across everyone rather
 * than scoped to one seller. Suspended sellers are excluded server side.
 * last_contacted_at / times_contacted are tracked PER (person, stage_key),
 * not per person — someone contacted about bank details may never have
 * been contacted about an unanswered question, and the two must never be
 * collapsed into one status. */
export interface OutreachRow {
  person_type: "seller" | "buyer";
  person_id: string;
  person_name: string | null;
  stage_key: string;
  label: string;
  urgency: number;
  context: string | null;
  whatsapp_link: string;
  last_contacted_at: string | null;
  times_contacted: number;
}

export async function fetchOutreachQueue(): Promise<OutreachRow[]> {
  const { data, error } = await adb.rpc("get_outreach_queue");
  if (error) throw error;
  return (data ?? []) as unknown as OutreachRow[];
}

/** stage_key → how many times that stage's sequence can be sent before it
 * stops returning that person entirely. Admin-editable in
 * marketplace_outreach_stage_config, read live rather than hardcoded here —
 * a hardcoded copy would silently drift the moment someone changes a
 * ceiling in the table. Read-only for this screen; editing ceilings is a
 * separate future admin surface, not built here. */
export async function fetchOutreachStageCeilings(): Promise<Record<string, number>> {
  const { data, error } = await adb.from("marketplace_outreach_stage_config").select("stage_key, max_attempts");
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { stage_key: string; max_attempts: number }[]) out[row.stage_key] = row.max_attempts;
  return out;
}

/** Records that this exact (person, outreach type) was messaged — a
 * deliberate, explicit admin action, never fired just because the
 * WhatsApp link was tapped (tapping a link is not proof a message was
 * actually sent, and auto-logging on tap would quietly create false
 * records). Returns whether the write succeeded. */
export async function logOutreachContact(personType: "seller" | "buyer", personId: string, stageKey: string): Promise<boolean> {
  const { data, error } = await adb.rpc("log_outreach_contact", { p_person_type: personType, p_person_id: personId, p_stage_key: stageKey });
  if (error) throw error;
  return data === true;
}

/** Reverses a mis-tap of "mark as sent": removes the most recent contact
 * record for this exact (person, outreach type). */
export async function undoOutreachContact(personId: string, stageKey: string): Promise<boolean> {
  const { data, error } = await adb.rpc("undo_outreach_contact", { p_person_id: personId, p_stage_key: stageKey });
  if (error) throw error;
  return data === true;
}

/** Same idea as logOutreachContact/undoOutreachContact, deliberately a
 * separate log (marketplace_abandoned_contact_log, keyed by source+ref_id
 * rather than person_id+stage_key) — most abandoned-checkout rows are
 * guests with no customer record, so the outreach log genuinely could not
 * be reused here. */
export async function logAbandonedContact(source: "order" | "attempt", refId: string): Promise<boolean> {
  const { data, error } = await adb.rpc("log_abandoned_contact", { p_source: source, p_ref_id: refId });
  if (error) throw error;
  return data === true;
}

export async function undoAbandonedContact(source: "order" | "attempt", refId: string): Promise<boolean> {
  const { data, error } = await adb.rpc("undo_abandoned_contact", { p_source: source, p_ref_id: refId });
  if (error) throw error;
  return data === true;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export interface AttemptInfo {
  ordinal: string; // "1st", "2nd"...
  remainingAfter: number; // messages left in the sequence after this one sends
  isFinal: boolean;
  highStakes: boolean; // this stage's ceiling is the highest of any stage — real money/refund territory
}

/** Where a row sits in its stage's message sequence, purely derived from
 * times_contacted (how many times this exact stage has already been sent to
 * this exact person) against that stage's ceiling — never stored, always
 * recomputed from live data so it can't drift from what the backend would
 * actually do next. Returns null when the ceiling isn't known yet (config
 * still loading, or a stage_key the config table doesn't cover) rather than
 * guessing — attempt info silently doesn't render in that case, the rest of
 * the row is unaffected. */
export function getAttemptInfo(row: OutreachRow, ceilings: Record<string, number>): AttemptInfo | null {
  const cap = ceilings[row.stage_key];
  if (!cap) return null;
  const attemptNumber = row.times_contacted + 1; // the message about to go out
  const remainingAfter = cap - attemptNumber;
  const highestCeiling = Math.max(...Object.values(ceilings));
  return {
    ordinal: ordinal(attemptNumber),
    remainingAfter,
    isFinal: remainingAfter <= 0,
    highStakes: cap === highestCeiling,
  };
}

/** "2 days ago" / "Just now" — the operator-facing relative form for
 * last_contacted_at, since a raw timestamp is harder to scan at a glance
 * than "how long ago". */
export function relativeTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

/** The full canonical set of outreach types, always shown as a filter chip
 * even at zero rows (the queue is genuinely lopsided today, six of ten
 * types currently return nothing) — chip label is the short, glanceable
 * wording; each type's row/detail content uses the real label the RPC
 * itself returns, not this one. */
export const SELLER_OUTREACH_STAGES: Array<{ key: string; chipLabel: string; urgency: number }> = [
  { key: "unanswered_question", chipLabel: "Waiting on answer", urgency: -1 },
  { key: "sale_awaiting_dispatch", chipLabel: "Awaiting dispatch", urgency: 0 },
  { key: "return_awaiting_confirmation", chipLabel: "Return unconfirmed", urgency: 0 },
  { key: "offer_awaiting_response", chipLabel: "Offer unanswered", urgency: 1 },
  { key: "no_listings", chipLabel: "Never listed", urgency: 1 },
  { key: "rejected_not_resubmitted", chipLabel: "Rejected, unfixed", urgency: 2 },
  { key: "incomplete_setup", chipLabel: "Bank incomplete", urgency: 2 },
  { key: "listed_no_sales", chipLabel: "Live, no sale", urgency: 3 },
];

/** Two types now, not the one the source design was built against (its own
 * note reads "buyers is currently a single empty type" — no longer true).
 * Given a chip filter, not a chip-less toggle, once there's more than one
 * type to distinguish, the same reasoning that put chips on the seller
 * side. */
export const BUYER_OUTREACH_STAGES: Array<{ key: string; chipLabel: string; urgency: number }> = [
  { key: "order_awaiting_delivery", chipLabel: "Awaiting delivery", urgency: 0 },
  { key: "answered_question_no_purchase", chipLabel: "Waiting to buy", urgency: 2 },
];

/** Pulls the human-readable text out of a wa.me link purely for a read-only
 * preview — the href actually opened is always whatsapp_link itself,
 * completely unchanged. This never builds or re-encodes a link, only reads
 * back text already inside the real, authoritative one. */
export function previewWhatsAppMessage(waLink: string): string | null {
  try {
    // URLSearchParams.get() already fully decodes the value (%0A -> a real
    // newline, %20 -> a space, etc) — a second decodeURIComponent here would
    // double-decode and can throw on a literal "%" the message happens to
    // contain (a price, for instance).
    const url = new URL(waLink);
    return url.searchParams.get("text") || null;
  } catch {
    return null;
  }
}

// ─── Split-draft merge (§53) ─────────────────────────────────────────────────

export interface MergeTarget { listing_id: string; title: string; image_url: string | null; status: string }

/** Valid merge targets for a given draft — always scoped to the same split
 * family (sibling drafts, plus the source itself when p_includeSource),
 * never an arbitrary unrelated listing; enforced server side, this just
 * reads whatever the RPC actually returns. */
export async function fetchMergeTargets(draftId: string, includeSource: boolean): Promise<MergeTarget[]> {
  const { data, error } = await adb.rpc("get_merge_targets", { p_draft_id: draftId, p_include_source: includeSource });
  if (error) return [];
  return (data ?? []) as MergeTarget[];
}

/** Moves the draft's photo into the target's gallery (as the first gallery
 * entry, directly after the target's own main photo) and deletes the draft.
 * Returns the raised message directly on failure, already written for a
 * person to read. */
export async function mergeSplitDraft(draftId: string, targetListingId: string): Promise<{ ok: true; message?: undefined } | { ok: false; message: string }> {
  const { data, error } = await adb.rpc("admin_merge_split_draft", { p_draft_id: draftId, p_target_listing_id: targetListingId });
  if (error) return { ok: false, message: error.message };
  if (data !== true) return { ok: false, message: "This could not be merged. Refresh and try again." };
  return { ok: true };
}
