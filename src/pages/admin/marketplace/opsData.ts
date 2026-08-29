import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadWithProgress } from "@/marketplace/lib/uploadWithProgress";
import { adb, formatNaira } from "./data";
import { isTestAccountId } from "@/lib/testAccounts";

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

/** Nigerian local/international digits to wa.me digits: 08012345678,
 * 2348012345678 and +2348012345678 all become 2348012345678. The shared
 * home for this, so it stops drifting across screens that each wrote their
 * own copy (MarketplaceBuyers.tsx, MarketplaceAbandonedCheckouts.tsx).
 * marketplace/lib/phone.ts has the fuller, multi-country version, not
 * imported here since it lives in the customer-facing marketplace tree,
 * not admin.
 *
 * ONLY valid for a number guaranteed Nigerian — a seller/buyer's `phone`
 * field, which the marketplace's own signup rules require to be Nigerian
 * (it's what arranges delivery within Nigeria). Never apply this to a
 * `whatsapp_number`: that field can belong to any country and is already
 * stored fully international at signup (marketplace/lib/phone.ts's
 * toInternationalDigits — dial code plus the trunk zero stripped), so
 * blindly prepending "234" to it here would corrupt a non-Nigerian
 * seller's number. */
export function toIntlPhone(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return "234" + digits.slice(1);
  return digits;
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
  // The QA accounts are real sellers and buyers to the database, so they
  // reach this queue like anyone else. Dropped here so nobody is ever asked
  // to chase a test account.
  const rows = ((data ?? []) as unknown as OutreachRow[])
    .filter((r) => !isTestAccountId(r.person_id));

  // get_outreach_queue builds its `context` in a SQL CASE that has no arm
  // for missing_delivery_prefs, so those rows arrive with context null.
  // outreach_context() exists for exactly this and returns the line an
  // operator needs ("4 listings in Lagos, buyers cannot tell if she would
  // send to them"), so it is filled in here rather than left blank.
  // Fetched only for the rows that need it, in parallel, and a failure on
  // any one of them just leaves that row's context null — an operator
  // still gets the row and the WhatsApp link, which is the part that
  // matters.
  const needContext = rows.filter((r) => r.stage_key === "missing_delivery_prefs" && !r.context);
  if (needContext.length === 0) return rows;
  const contexts = await Promise.all(
    needContext.map(async (r) => {
      const { data: ctx } = await adb.rpc("outreach_context", {
        p_stage: "missing_delivery_prefs",
        p_seller_id: r.person_id,
      });
      return [r.person_id, (ctx as string | null) ?? null] as const;
    }),
  );
  const byPerson = new Map(contexts);
  return rows.map((r) =>
    r.stage_key === "missing_delivery_prefs" && !r.context
      ? { ...r, context: byPerson.get(r.person_id) ?? r.context }
      : r,
  );
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

/**
 * Reverses a mis-tap of "mark as sent": removes the most recent contact
 * record for this exact (person, outreach type).
 *
 * p_subject_id is passed explicitly as null rather than omitted. There is
 * only one version of this function now, so omitting it would resolve
 * fine, but naming every parameter is what made the earlier overload
 * ambiguity impossible to hit and costs nothing to keep.
 *
 * Null means "the most recent one, whatever it was about", which is this
 * screen's intended behaviour: the function's own guard is
 * `(p_subject_id is null or subject_id = p_subject_id)`.
 *
 * The boolean is meaningful, not a formality: false means there was
 * nothing to undo, so it must be checked rather than assumed.
 */
export async function undoOutreachContact(personId: string, stageKey: string): Promise<boolean> {
  const { data, error } = await adb.rpc("undo_outreach_contact", {
    p_person_id: personId, p_stage_key: stageKey, p_subject_id: null,
  });
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
  // Urgency 0, and the RPC emits it second, directly after the unanswered
  // question — so it sits high here too. A buyer asking to see an item
  // working is the strongest buying signal on the marketplace, which is
  // why it outranks an unanswered offer.
  { key: "video_request_pending", chipLabel: "A buyer asked for a video", urgency: 0 },
  { key: "sale_awaiting_dispatch", chipLabel: "Awaiting dispatch", urgency: 0 },
  { key: "return_awaiting_confirmation", chipLabel: "Return unconfirmed", urgency: 0 },
  { key: "offer_awaiting_response", chipLabel: "Offer unanswered", urgency: 1 },
  { key: "no_listings", chipLabel: "Never listed", urgency: 1 },
  { key: "rejected_not_resubmitted", chipLabel: "Rejected, unfixed", urgency: 2 },
  { key: "incomplete_setup", chipLabel: "Bank incomplete", urgency: 2 },
  // Returned by get_seller_nudge_suggestions with urgency 2. It was
  // reaching the queue all along and rendering under "All" via the label
  // fallback, but with no entry here it had no chip and no count, so it
  // could not be filtered to or measured. Urgency matches the RPC's own.
  { key: "missing_delivery_prefs", chipLabel: "Buyers cannot tell if they will send", urgency: 2 },
  // Both returned by get_seller_nudge_suggestions. 214 live listings have
  // no video across 87 sellers; 56 sit in the 15 categories where a photo
  // cannot answer the buyer's real question, which is what separates these
  // two.
  { key: "missing_video_required", chipLabel: "Needs a video, buyers cannot tell it works", urgency: 2 },
  { key: "listed_no_sales", chipLabel: "Live, no sale", urgency: 3 },
  { key: "missing_video_optional", chipLabel: "Could use a video", urgency: 3 },
  // Urgency 4, the RPC's lowest, so it sits last. Same bug as
  // missing_delivery_prefs had: returned by the RPC all along and visible
  // under "All" via the label fallback, but with no entry here it had no
  // chip and no count, so it could not be filtered to or measured.
  { key: "seller_no_review", chipLabel: "Has not left feedback", urgency: 4 },
];

/** Two types now, not the one the source design was built against (its own
 * note reads "buyers is currently a single empty type" — no longer true).
 * Given a chip filter, not a chip-less toggle, once there's more than one
 * type to distinguish, the same reasoning that put chips on the seller
 * side. */
export const BUYER_OUTREACH_STAGES: Array<{ key: string; chipLabel: string; urgency: number }> = [
  { key: "order_awaiting_delivery", chipLabel: "Awaiting delivery", urgency: 0 },
  // The three below were found by diffing get_buyer_nudge_suggestions'
  // stage keys against this list, rather than by anyone noticing them
  // missing. All three were reaching the queue and rendering under "All"
  // via the label fallback, with no chip and no count, so they could
  // neither be filtered to nor measured. Same bug as missing_delivery_prefs
  // and seller_no_review each had.
  { key: "abandoned_at_payment", chipLabel: "Left at the payment page", urgency: 1 },
  { key: "abandoned_before_payment", chipLabel: "Left before paying", urgency: 2 },
  { key: "answered_question_no_purchase", chipLabel: "Waiting to buy", urgency: 2 },
  { key: "buyer_no_review", chipLabel: "Has not left feedback", urgency: 4 },
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

/* ── Pending payments (reached Paystack, never completed) ─────────────── */

export interface PendingPaymentRow {
  order_id: string;
  cart_reference: string | null;
  reference: string | null;
  latest_reference: string | null;
  payment_attempt_count: number;
  amount_naira: number | null;
  created_at: string;
  updated_at: string;
  buyer_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  seller_name: string | null;
  listing_id: string | null;
  listing_title: string | null;
  image_url: string | null;
  listing_status: string | null;
  /** True at two or more attempts: something stopped them rather than them
   * wandering off. This is the field that decides the sort. */
  struggled: boolean;
  hours_since: number;
  times_contacted: number;
  /** When this specific ORDER was last messaged, null if never. The split
   * between the working list and the already-messaged group keys on this,
   * not on times_contacted, so it matches the abandoned-checkouts screen. */
  contacted_at: string | null;
  /** An unpaid order is deleted this many days from now, by the scheduled
   * purge_old_pending_orders job (60 days from creation, from
   * site_settings.marketplace_pending_payment_purge_days). Nothing paid is
   * ever deleted at any age: that job filters on payment_status='pending'
   * and additionally refuses anything settled, paid out, or disputed. */
  days_until_removed: number | null;
  /** Paystack's own word for what happened. 'failed' means they entered
   * details and were declined. NULL means the reconcile sweep has not
   * labelled it yet, which is NOT the same as a failure and must never be
   * shown as one. The view admits only these two: anything Paystack calls
   * 'abandoned' belongs to marketplace_stopped_at_payment instead. */
  paystack_status: string | null;
}

export async function fetchPendingPayments(): Promise<PendingPaymentRow[]> {
  const { data, error } = await adb.from("marketplace_pending_payments").select("*");
  if (error) throw error;
  return (data ?? []) as PendingPaymentRow[];
}

/* ── Stopped at the payment page (Paystack "abandoned") ───────────────── */

/**
 * People who saw the payment page and left without entering anything.
 *
 * A different person from the one in PendingPaymentRow, and the distinction
 * is the point: nothing was attempted and nothing was declined, so no
 * message to these people may say their payment failed or did not go
 * through. Saying so could make them think money moved.
 *
 * They share the payment_not_completed outreach stage with the declined
 * list, and its three messages already open with "you got as far as the
 * payment page and stopped", so the sequence is correct for them as it
 * stands. Every action the declined list has works here.
 */
export interface StoppedAtPaymentRow {
  order_id: string;
  cart_reference: string | null;
  reference: string | null;
  latest_reference: string | null;
  amount_naira: number | null;
  /** How many times the payment page was OPENED, not how many payments were
   * attempted. Nobody in this list attempted one, so this never reads as
   * "tried" anywhere in the UI. */
  payment_attempt_count: number;
  created_at: string;
  updated_at: string;
  hours_since: number;
  buyer_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  seller_name: string | null;
  listing_id: string | null;
  listing_title: string | null;
  image_url: string | null;
  listing_status: string | null;
  /** Two or more openings of the payment page. They kept coming back and
   * still never entered anything, so something about paying was putting
   * them off. Leads the sort, exactly as it does for the declined list. */
  struggled: boolean;
  times_contacted: number;
  contacted_at: string | null;
  days_until_removed: number | null;
}

export async function fetchStoppedAtPayment(): Promise<StoppedAtPaymentRow[]> {
  const { data, error } = await adb.from("marketplace_stopped_at_payment").select("*");
  if (error) throw error;
  return (data ?? []) as StoppedAtPaymentRow[];
}

/** The sentence to open with, already matched to how many times they tried:
 * nine attempts gets "That is on us, not you", two gets a gentler version. */
export async function fetchPaymentFailureContext(orderId: string): Promise<string | null> {
  const { data, error } = await adb.rpc("payment_failure_context", { p_order_id: orderId });
  if (error) return null;
  return (data as string | null) || null;
}

/** The next message in the three-message sequence for THIS order. Subject
 * aware, unlike resolve_outreach_message: a buyer with two stalled orders
 * gets message one for each, not message one then message two. Returns null
 * once the sequence for that order is exhausted. */
export async function resolvePendingPaymentMessage(input: {
  orderId: string; buyerId: string; wa: string; name: string; item: string; link: string; extra: string | null;
}): Promise<string | null> {
  const { data, error } = await adb.rpc("resolve_outreach_message_for", {
    p_stage: "payment_not_completed",
    p_person_id: input.buyerId,
    p_subject_id: input.orderId,
    p_wa: input.wa,
    p_name: input.name,
    p_item: input.item,
    p_link: input.link,
    p_extra: input.extra,
  });
  if (error) return null;
  return (data as string | null) || null;
}

/** Marks this ORDER contacted, not just this person. The pending-payments
 * view counts times_contacted on subject_id, so the 4-argument overload is
 * required — the 3-argument one used elsewhere writes no subject and would
 * leave the count stuck at zero. */
export async function logPendingPaymentContact(buyerId: string, orderId: string): Promise<boolean> {
  const { data, error } = await adb.rpc("log_outreach_contact", {
    p_person_type: "buyer",
    p_person_id: buyerId,
    p_stage_key: "payment_not_completed",
    p_subject_id: orderId,
  });
  if (error) throw error;
  return data === true;
}

/**
 * Reverses a mis-tap, for THIS order specifically. Passing the order id as
 * the subject is what makes that precise: Azunna Peace has three stalled
 * orders right now, and without it the undo removed whichever message was
 * most recent for her, which was frequently the wrong one.
 *
 * Returns false when there was nothing to undo for this order, which the
 * caller surfaces rather than reporting a success that did not happen.
 */
export async function undoPendingPaymentContact(buyerId: string, orderId: string): Promise<boolean> {
  const { data, error } = await adb.rpc("undo_outreach_contact", {
    p_person_id: buyerId, p_stage_key: "payment_not_completed", p_subject_id: orderId,
  });
  if (error) throw error;
  return data === true;
}

/** Super admin only. Deliberately takes every field the function demands
 * rather than defaulting any of them: the amount ACTUALLY received (never
 * assumed from the order), how it arrived, and why. */
export async function superAdminMarkOrderPaid(input: {
  orderId: string; amountReceivedNaira: number; method: string; reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await adb.rpc("super_admin_mark_order_paid", {
    p_order_id: input.orderId,
    p_amount_received_naira: input.amountReceivedNaira,
    p_method: input.method,
    p_reason: input.reason,
  });
  // The function's own messages are written for a person and already say
  // what to do, so they surface verbatim rather than being reworded.
  if (error) return { ok: false, message: error.message || "Could not record that. Please try again." };
  return { ok: true };
}

/* ── Awaiting buyer confirmation ──────────────────────────────────────── */

export interface AwaitingConfirmationRow {
  order_id: string;
  amount_naira: number | null;
  /** What the seller actually receives, and the figure at stake here. Not
   * the order total, which includes our fee. */
  seller_share_naira: number | null;
  dispatch_confirmed_at: string;
  days_since_sent: number;
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_email: string | null;
  seller_name: string | null;
  seller_phone: string | null;
  listing_title: string | null;
  image_url: string | null;
  nudged_once: boolean;
  nudged_twice: boolean;
  /** A dispute is the opposite of being happy. The RPC refuses outright
   * when this is true; the UI hides the control entirely so nobody tries. */
  has_open_dispute: boolean;
}

export async function fetchAwaitingConfirmation(): Promise<AwaitingConfirmationRow[]> {
  const { data, error } = await adb.from("marketplace_awaiting_confirmation").select("*");
  if (error) throw error;
  return (data ?? []) as AwaitingConfirmationRow[];
}

/**
 * Records that the buyer confirmed receipt, when they told us some other
 * way and never tapped confirm.
 *
 * This does NOT release a payout and is deliberately not a second route to
 * one. It fills in the MISSING CONFIRMATION; the payout then follows the
 * normal path entirely unchanged, proof screenshot and all. Two routes to
 * money leaving the business would drift apart and one would end up with
 * weaker guards.
 *
 * Writing confirmed_on_behalf_by also fires trg_z_confirmed_on_behalf_emails,
 * which emails the buyer and the seller immediately. That is a database
 * trigger, not something the caller opts into, so the form says so plainly.
 *
 * The function's own messages are written for a person and already say what
 * to do, so they surface verbatim rather than being reworded.
 */
export async function superAdminConfirmReceiptOnBehalf(input: {
  orderId: string; reason: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await adb.rpc("super_admin_confirm_receipt_on_behalf", {
    p_order_id: input.orderId, p_reason: input.reason,
  });
  if (error) return { ok: false, message: error.message || "Could not record that. Please try again." };
  return { ok: true };
}

/* ── Answering in the seller's name ───────────────────────────────────────
 *
 * Sellers answer WhatsApp far more readily than they open the app, so a
 * buyer can sit waiting while a seller who has ALREADY replied to us
 * ignores a notification. These let an operator record that reply where the
 * nudge for the same person already lives.
 *
 * The buyer is never told an admin typed it, because the seller genuinely
 * said it. That is exactly why every one of these demands a note saying
 * where, stored permanently beside who did it, and why the UI insists on
 * the seller's ACTUAL words rather than a tidied up version.
 *
 * get_outreach_queue returns no subject id, only (person_id, stage_key), so
 * a seller with three unanswered questions cannot be resolved from the
 * queue row alone. These fetchers resolve the pending items for that seller
 * directly from tables an admin can already read.
 */

export interface PendingQuestion {
  id: string; listing_id: string; question: string; created_at: string;
}
export interface PendingVideoRequest {
  id: string; listing_id: string; note: string | null; created_at: string;
}
export interface PendingOffer {
  id: string; listing_id: string; buyer_price_naira: number | null;
  seller_amount_naira: number | null; status: string; created_at: string;
}

export async function fetchSellerPendingQuestions(sellerId: string): Promise<PendingQuestion[]> {
  const { data, error } = await adb.from("marketplace_listing_questions")
    .select("id, listing_id, question, created_at")
    .eq("seller_id", sellerId).is("answer", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PendingQuestion[];
}

export async function fetchSellerPendingVideoRequests(sellerId: string): Promise<PendingVideoRequest[]> {
  const { data, error } = await adb.from("marketplace_video_requests")
    .select("id, listing_id, note, created_at")
    .eq("seller_id", sellerId).is("video_path", null).is("declined_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PendingVideoRequest[];
}

export async function fetchSellerPendingOffers(sellerId: string): Promise<PendingOffer[]> {
  const { data, error } = await adb.from("marketplace_offers")
    .select("id, listing_id, buyer_price_naira, seller_amount_naira, status, created_at")
    .eq("seller_id", sellerId).eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PendingOffer[];
}

/**
 * These RPCs signal failure by RAISING, which PostgREST surfaces as `error`,
 * and on success return a plain jsonb payload carrying a human `note`. They
 * do NOT return an `ok` flag.
 *
 * This previously checked `d.ok === true`, which no version of any of them
 * has ever set, so every SUCCESSFUL call reported "that could not be saved"
 * to the operator while the write had in fact gone through. Exactly the
 * shape of the log_outreach_contact void-versus-boolean bug: worse than
 * failing, because the obvious response is to press again and do it twice.
 * The only correct check is the absence of an error.
 */
function readRpcResult(error: { message?: string } | null, data: unknown): { ok: boolean; message?: string } {
  if (error) return { ok: false, message: error.message || "That could not be saved. Please try again." };
  const d = (data ?? {}) as Record<string, unknown>;
  return { ok: true, message: typeof d.note === "string" ? d.note : undefined };
}

export async function adminAnswerQuestionForSeller(input: {
  questionId: string; answer: string; note: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await adb.rpc("admin_answer_question_for_seller", {
    p_question_id: input.questionId, p_answer: input.answer, p_note: input.note,
  });
  return readRpcResult(error, data);
}

export async function adminAttachVideoForSeller(input: {
  requestId: string; videoPath: string; note: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await adb.rpc("admin_attach_video_for_seller", {
    p_request_id: input.requestId, p_video_path: input.videoPath, p_note: input.note,
  });
  return readRpcResult(error, data);
}

export async function adminAnswerOfferForSeller(input: {
  offerId: string; decision: "accepted" | "declined" | "countered";
  counterPriceNaira: number | null; note: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await adb.rpc("admin_answer_offer_for_seller", {
    p_offer_id: input.offerId, p_decision: input.decision,
    p_counter_price_naira: input.counterPriceNaira, p_note: input.note,
  });
  return readRpcResult(error, data);
}

/**
 * Upload a video an admin was sent on WhatsApp, then attach it.
 *
 * SIZE ONLY, exactly as the seller's own path does. No compression, no
 * canvas, no <video> element, nothing that reads the file beyond
 * `file.size`. Reading a video hangs on iPhone and that is what killed the
 * public video feature (handoff sections 87 to 92), so this follows
 * sellerUploadVideoForRequest byte for byte and differs only in the client
 * and the path prefix.
 *
 * The bucket's admin INSERT policy checks the bucket and the permission
 * only, with no path prefix rule, so `admin/` is a provenance convention
 * rather than a requirement.
 */
export async function adminUploadVideoForSeller(input: {
  requestId: string; file: File; note: string; onProgress: (pct: number) => void;
}): Promise<{ ok: boolean; message?: string }> {
  const ext = (input.file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `admin/request-${input.requestId}-${Date.now()}.${ext}`;
  try {
    await uploadWithProgress(adb as unknown as SupabaseClient, "marketplace-request-videos", path, input.file, input.onProgress);
  } catch {
    return { ok: false, message: "The upload did not finish. Check the connection and try again." };
  }
  return adminAttachVideoForSeller({ requestId: input.requestId, videoPath: path, note: input.note });
}

/**
 * A video the seller sent on WhatsApp now goes on the LISTING and closes
 * the request, exactly as the seller's own upload does.
 *
 * Replaces adminUploadVideoForSeller for NEW requests. That function stays
 * for nothing: the four legacy private_only videos are already sent, so no
 * request that could reach this is one of them, and the RPC refuses any
 * request that already has an uploaded_at.
 *
 * SIZE ONLY, as everywhere in this feature. The staging bucket's admin
 * policy checks the bucket and the permission with no path prefix rule, so
 * `admin/` is a provenance convention.
 */
export async function adminFulfilRequestWithListingVideo(input: {
  requestId: string; file: File; note: string; onProgress: (pct: number) => void;
}): Promise<{ ok: boolean; message?: string }> {
  const ext = (input.file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `admin/${input.requestId}-${Date.now()}.${ext}`;
  try {
    await uploadWithProgress(adb as unknown as SupabaseClient, "listing-video-staging", path, input.file, input.onProgress);
  } catch {
    return { ok: false, message: "The upload did not finish. Check the connection and try again." };
  }
  const { data, error } = await adb.rpc("admin_fulfil_request_with_listing_video", {
    p_request_id: input.requestId, p_storage_path: path, p_note: input.note,
  });
  return readRpcResult(error, data);
}

/* ── Listings with no video ───────────────────────────────────────────────
 * 214 live listings have none, across 87 sellers. 56 are in the 15
 * categories where a photo cannot answer "does it still work".
 */

export interface ListingNeedingVideoRow {
  listing_id: string;
  title: string | null;
  image_url: string | null;
  final_price_naira: number | null;
  view_count: number | null;
  created_at: string;
  days_listed: number | null;
  seller_id: string;
  seller_name: string | null;
  seller_phone: string | null;
  category_name: string | null;
  video_required: boolean;
  /** What the seller should actually film for THIS kind of item, so an
   * operator knows what to ask for before asking. */
  video_guidance: string | null;
  youtube_status: string | null;
  contacted_at: string | null;
}

export async function fetchListingsNeedingVideo(): Promise<ListingNeedingVideoRow[]> {
  const { data, error } = await adb.from("marketplace_listings_needing_video").select("*");
  if (error) throw error;
  // Same reason as the outreach queue: a QA listing is a real listing, and
  // it must not show up as work for someone to do.
  return ((data ?? []) as ListingNeedingVideoRow[])
    .filter((r) => !isTestAccountId(r.seller_id));
}

export async function adminAddListingVideo(input: {
  listingId: string; storagePath: string; note: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await adb.rpc("admin_add_listing_video", {
    p_listing_id: input.listingId, p_storage_path: input.storagePath, p_note: input.note,
  });
  if (error) return { ok: false, message: error.message };
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === true) return { ok: true };
  const msg = typeof d.error === "string" ? d.error : typeof d.message === "string" ? d.message : undefined;
  return { ok: false, message: msg || "That could not be saved. Refresh and check it still has no video." };
}

/**
 * Uploads a video a seller sent on WhatsApp, then records it against the
 * listing. Same staging bucket and same shape as the seller's own path.
 *
 * SIZE IS NEVER READ TO REJECT. Nothing here decodes the file, creates a
 * video element, touches a canvas or reads a duration: that is what hung on
 * iPhone and killed this feature twice.
 */
export async function adminUploadListingVideo(input: {
  listingId: string; file: File; note: string; onProgress: (pct: number) => void;
}): Promise<{ ok: boolean; message?: string }> {
  const ext = (input.file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `admin/listing-${input.listingId}-${Date.now()}.${ext}`;
  try {
    await uploadWithProgress(adb as unknown as SupabaseClient, "listing-video-staging", path, input.file, input.onProgress);
  } catch {
    return { ok: false, message: "The upload did not finish. Check the connection and try again." };
  }
  return adminAddListingVideo({ listingId: input.listingId, storagePath: path, note: input.note });
}

/* ── Videos that reached YouTube unreviewed ───────────────────────────────
 * These go public without a gate, deliberately: at three sales a day,
 * speed matters more than a queue. This is a list to check them AFTER the
 * fact, not a gate in front of them.
 */
export interface VideoToReviewRow {
  listing_id: string;
  title: string | null;
  youtube_video_id: string | null;
  watch_link: string | null;
  youtube_uploaded_at: string | null;
  seller_name: string | null;
  listing_status: string | null;
}

export async function fetchVideosToReview(): Promise<VideoToReviewRow[]> {
  const { data, error } = await adb.from("marketplace_videos_to_review").select("*");
  if (error) throw error;
  return (data ?? []) as VideoToReviewRow[];
}

/* ── What buyers searched for ─────────────────────────────────────────────
 * The empty ones are the point: demand we could serve and do not.
 */
export interface SearchDemandRow {
  term: string;
  times_searched: number;
  times_found_nothing: number;
  pct_empty: number | null;
  last_searched: string | null;
  distinct_people: number | null;
}

export async function fetchSearchDemand(): Promise<SearchDemandRow[]> {
  // No client-side sort: the view already orders empty searches first, and
  // re-sorting here would just be a second opinion that could drift.
  const { data, error } = await adb.from("marketplace_search_demand").select("*");
  if (error) throw error;
  return (data ?? []) as SearchDemandRow[];
}
