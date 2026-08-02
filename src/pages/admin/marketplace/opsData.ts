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
