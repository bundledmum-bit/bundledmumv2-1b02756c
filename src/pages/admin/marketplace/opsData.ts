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
 * than scoped to one seller. Suspended sellers are excluded server side. */
export interface OutreachRow {
  person_type: "seller" | "buyer";
  person_id: string;
  person_name: string | null;
  stage_key: string;
  label: string;
  urgency: number;
  context: string | null;
  whatsapp_link: string;
}

export async function fetchOutreachQueue(): Promise<OutreachRow[]> {
  const { data, error } = await adb.rpc("get_outreach_queue");
  if (error) throw error;
  return (data ?? []) as unknown as OutreachRow[];
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
