import { cdb } from "./orders";

/**
 * Buyer order data. THE MONEY RULE: a buyer sees only what THEY paid, amount_naira
 * and its breakdown (item_price_naira, service_fee_naira, paystack_fee_naira). We
 * never SELECT seller_share_naira, platform_share_naira or the listing's
 * price_naira, even though the "Buyer reads own orders" RLS policy would allow the
 * order columns. Seller contact comes only from the get_marketplace_order_contact
 * RPC (see ./orders).
 */

/** Safe order columns for the buyer. No seller-payout columns. */
export const BUYER_ORDER_SELECT =
  "id, listing_id, order_status, payment_status, amount_naira, item_price_naira, service_fee_naira, paystack_fee_naira, paystack_transaction_reference, dispatch_photo_url, dispatch_confirmed_at, buyer_confirmation_status, buyer_confirmed_at, created_at";

export interface BuyerOrder {
  id: string;
  listing_id: string;
  order_status: string;
  payment_status: string;
  amount_naira: number;
  item_price_naira: number;
  service_fee_naira: number;
  paystack_fee_naira: number;
  paystack_transaction_reference: string | null;
  dispatch_photo_url: string | null;
  dispatch_confirmed_at: string | null;
  buyer_confirmation_status: string | null;
  buyer_confirmed_at: string | null;
  created_at: string;
  listing?: { title: string | null; image_url: string | null } | null;
}

async function attachListings(orders: BuyerOrder[]): Promise<BuyerOrder[]> {
  const ids = Array.from(new Set(orders.map((o) => o.listing_id).filter(Boolean)));
  if (ids.length === 0) return orders;
  const { data } = await cdb.from("marketplace_listings").select("id, title, image_url").in("id", ids);
  const map = new Map((data ?? []).map((l: { id: string; title: string | null; image_url: string | null }) => [l.id, l]));
  for (const o of orders) o.listing = (map.get(o.listing_id) as BuyerOrder["listing"]) ?? null;
  return orders;
}

/** All paid orders this buyer placed, newest first, with their listing attached. */
export async function fetchBuyerOrders(buyerId: string): Promise<BuyerOrder[]> {
  const { data, error } = await cdb
    .from("marketplace_orders")
    .select(BUYER_ORDER_SELECT)
    .eq("buyer_id", buyerId)
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachListings((data ?? []) as unknown as BuyerOrder[]);
}

/** One order by id, with its listing attached. */
export async function fetchBuyerOrder(orderId: string): Promise<BuyerOrder | null> {
  const { data, error } = await cdb
    .from("marketplace_orders")
    .select(BUYER_ORDER_SELECT)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [withListing] = await attachListings([data as unknown as BuyerOrder]);
  return withListing;
}

/** Groups buyer orders by what the buyer needs to know. A refunded order
 * (a resolved dispute, with or without a return) sits alongside an open
 * dispute here, never invisible: previously "refunded" matched no bucket at
 * all and silently vanished from My orders. */
export function groupBuyerOrders(orders: BuyerOrder[]) {
  return {
    actionNeeded: orders.filter((o) => o.order_status === "awaiting_confirmation"),
    problem: orders.filter((o) => o.order_status === "disputed" || o.order_status === "refunded"),
    inProgress: orders.filter((o) => o.order_status === "awaiting_dispatch"),
    complete: orders.filter((o) => o.order_status === "completed"),
  };
}

/**
 * The confirm/dispute window in days, read from site_settings
 * (marketplace_dispute_window_days). Never hardcoded. Falls back to 3 only if the
 * setting cannot be read.
 */
export async function getDisputeWindowDays(): Promise<number> {
  const { data } = await cdb.from("site_settings").select("value").eq("key", "marketplace_dispute_window_days").maybeSingle();
  const raw = (data as { value?: unknown } | null)?.value;
  const n = Number(raw);
  return isFinite(n) && n > 0 ? n : 3;
}

/** The confirm-by deadline, measured from dispatch_confirmed_at + windowDays. */
export function confirmDeadline(dispatchConfirmedAt: string | null, windowDays: number): Date | null {
  if (!dispatchConfirmedAt) return null;
  const t = new Date(dispatchConfirmedAt).getTime();
  if (!isFinite(t)) return null;
  return new Date(t + windowDays * 24 * 60 * 60 * 1000);
}

/** Whole days remaining until the deadline, floored at 0. */
export function daysLeft(deadline: Date | null): number {
  if (!deadline) return 0;
  const ms = deadline.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Confirms receipt. Returns true when it worked. False means the order was not in
 * a confirmable state or is not this buyer's; the caller must NOT show success on
 * false. Cannot touch payment or money columns by design.
 */
export async function confirmReceipt(orderId: string): Promise<boolean> {
  const { data, error } = await cdb.rpc("confirm_marketplace_order_receipt", { p_order_id: orderId });
  if (error) return false;
  return data === true;
}

export interface DisputeResult {
  ok: boolean;
  disputeId?: string;
  message?: string;
}

/**
 * Raises a dispute. p_reason must be at least 10 characters (validate client-side
 * first for a friendly message). p_evidence is an array of photo URLs or null.
 * The RPC raises on an un-disputable order or an already-open dispute; we surface
 * that as human copy rather than a raw error.
 */
export async function raiseDispute(orderId: string, reason: string, evidence: string[]): Promise<DisputeResult> {
  const { data, error } = await cdb.rpc("raise_marketplace_dispute", {
    p_order_id: orderId,
    p_reason: reason,
    p_evidence: evidence.length ? evidence : null,
  });
  if (error) {
    const raw = String((error as { message?: string }).message || "");
    let message = "We could not open this problem report. Please refresh and try again.";
    if (/already/i.test(raw)) message = "There is already an open problem on this order. We are on it, no need to send another.";
    else if (/cannot|not.*disput|state/i.test(raw)) message = "This order cannot be reported right now. If you think that is wrong, message us on WhatsApp.";
    return { ok: false, message };
  }
  return { ok: true, disputeId: data as string };
}

// ─── Returns (design 20a) ──────────────────────────────────────────────────
// A dispute the admin ruled on. return_required decides whether a return is
// part of that ruling at all; when it is, return_sent_at / return_received_at
// / refund_paid_at mark the three stages a buyer's order moves through.
export interface OrderDispute {
  id: string;
  order_id: string;
  outcome: string | null;
  resolved_at: string | null;
  return_required: boolean;
  return_shipping_payer: string | null;
  return_proof_url: string | null;
  return_shipping_cost_naira: number | null;
  return_sent_at: string | null;
  return_received_at: string | null;
  refund_bank_name: string | null;
  refund_account_name: string | null;
  refund_account_number: string | null;
  refund_paid_at: string | null;
}

const DISPUTE_SELECT =
  "id, order_id, outcome, resolved_at, return_required, return_shipping_payer, return_proof_url, return_shipping_cost_naira, return_sent_at, return_received_at, refund_bank_name, refund_account_name, refund_account_number, refund_paid_at";

/** The dispute tied to this order, for the buyer who raised it. Null when
 * there is none, or it is not yet resolved (nothing to show a buyer about a
 * return until the admin has ruled). */
export async function fetchOrderDispute(orderId: string): Promise<OrderDispute | null> {
  const { data, error } = await cdb.from("marketplace_disputes")
    .select(DISPUTE_SELECT)
    .eq("order_id", orderId)
    .not("outcome", "is", null)
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as OrderDispute) ?? null;
}

/** The days a seller (or BundledMum, on their behalf) has to confirm a
 * returned item before it counts as overdue, read from site_settings
 * (marketplace_return_confirm_days). Never hardcoded. Falls back to 4 only
 * if the setting cannot be read, matching the database view's own default. */
export async function getReturnConfirmDays(): Promise<number> {
  const { data } = await cdb.from("site_settings").select("value").eq("key", "marketplace_return_confirm_days").maybeSingle();
  const n = Number((data as { value?: unknown } | null)?.value);
  return isFinite(n) && n > 0 ? n : 4;
}

/**
 * Marks a return sent: proof of posting, the bank details the refund should
 * go to, and an optional shipping cost. All of proof, bank name, account
 * name and account number are required by the database; the two specific
 * rejections it can raise are mapped to human copy here rather than shown
 * raw. Returns a message either way, since a false result with no thrown
 * error (already sent, or not a return-required dispute) still needs
 * something to show.
 */
export async function buyerMarkReturnSent(input: {
  disputeId: string;
  proofUrl: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  shippingCostNaira?: number | null;
}): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await cdb.rpc("buyer_mark_return_sent", {
    p_dispute_id: input.disputeId,
    p_return_proof_url: input.proofUrl,
    p_bank_name: input.bankName,
    p_account_name: input.accountName,
    p_account_number: input.accountNumber,
    p_return_shipping_cost_naira: input.shippingCostNaira ?? null,
  });
  if (error) {
    const raw = String((error as { message?: string }).message || "");
    let message = "We could not save this. Please check your connection and try again.";
    if (/proof of sending/i.test(raw)) message = "Please add a photo of your proof of posting.";
    else if (/bank details/i.test(raw)) message = "Please add your bank name, account name and account number so we can send your refund.";
    return { ok: false, message };
  }
  if (data !== true) return { ok: false, message: "This could not be saved. Refresh and check the order is still awaiting your return." };
  return { ok: true };
}
