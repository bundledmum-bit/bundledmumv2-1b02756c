import { sdb } from "./sellData";

/**
 * Seller order data. THE MONEY RULE: a seller sees only their own payout,
 * seller_share_naira. We never SELECT item_price_naira, amount_naira,
 * platform_share_naira, service_fee_naira or paystack_fee_naira, even though the
 * "Seller reads own orders" RLS policy would technically allow it. Buyer contact
 * comes only from the get_marketplace_seller_order_contact RPC.
 */

/** Safe order columns for the seller. No buyer-total columns. */
export const SELLER_ORDER_SELECT =
  "id, order_status, payment_status, seller_share_naira, paystack_transaction_reference, created_at, dispatch_photo_url, listing_id";

export interface SellerOrder {
  id: string;
  order_status: string;
  payment_status: string;
  seller_share_naira: number;
  paystack_transaction_reference: string | null;
  created_at: string;
  dispatch_photo_url: string | null;
  listing_id: string;
  listing?: { title: string | null; image_url: string | null } | null;
}

async function attachListings(orders: SellerOrder[]): Promise<SellerOrder[]> {
  const ids = Array.from(new Set(orders.map((o) => o.listing_id).filter(Boolean)));
  if (ids.length === 0) return orders;
  const { data } = await sdb.from("marketplace_listings").select("id, title, image_url").in("id", ids);
  const map = new Map((data ?? []).map((l: { id: string; title: string | null; image_url: string | null }) => [l.id, l]));
  for (const o of orders) o.listing = (map.get(o.listing_id) as SellerOrder["listing"]) ?? null;
  return orders;
}

/** All paid orders for this seller, newest first, with their listing attached. */
export async function fetchSellerOrders(sellerId: string): Promise<SellerOrder[]> {
  const { data, error } = await sdb
    .from("marketplace_orders")
    .select(SELLER_ORDER_SELECT)
    .eq("seller_id", sellerId)
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachListings((data ?? []) as unknown as SellerOrder[]);
}

/** One order by id, with its listing attached. */
export async function fetchSellerOrder(orderId: string): Promise<SellerOrder | null> {
  const { data, error } = await sdb
    .from("marketplace_orders")
    .select(SELLER_ORDER_SELECT)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [withListing] = await attachListings([data as unknown as SellerOrder]);
  return withListing;
}

export interface SellerOrderContact {
  order_id: string;
  listing_title: string;
  order_reference: string;
  seller_share_naira: number;
  buyer_name: string | null;
  buyer_whatsapp: string | null;
  buyer_phone: string | null;
  can_call: boolean;
}

/**
 * Buyer contact for a PAID order the caller sold. Returns nothing unless the
 * caller is the seller and the order is paid. buyer_phone may be null.
 */
export async function getSellerOrderContact(orderId: string): Promise<SellerOrderContact | null> {
  const { data, error } = await sdb.rpc("get_marketplace_seller_order_contact", { p_order_id: orderId });
  if (error) return null;
  const rows = (data ?? []) as SellerOrderContact[];
  return rows[0] ?? null;
}

/**
 * Marks the order dispatched with the given public photo url. Returns true on
 * success. False means the order was not dispatchable or is not this seller's.
 * Cannot change payment or settlement status by design.
 */
export async function markDispatched(orderId: string, photoUrl: string): Promise<boolean> {
  const { data, error } = await sdb.rpc("mark_marketplace_order_dispatched", {
    p_order_id: orderId,
    p_dispatch_photo_url: photoUrl,
  });
  if (error) return false;
  return data === true;
}

/** Groups seller orders by what the seller must do. A refunded order (a
 * resolved dispute, possibly with a return still in progress) sits
 * alongside orders in progress, never invisible: previously "refunded"
 * matched no bucket at all and silently vanished from the dashboard. */
export function groupSellerOrders(orders: SellerOrder[]) {
  return {
    needsAction: orders.filter((o) => o.order_status === "awaiting_dispatch"),
    inProgress: orders.filter((o) => o.order_status === "awaiting_confirmation" || o.order_status === "disputed" || o.order_status === "refunded"),
    complete: orders.filter((o) => o.order_status === "completed"),
  };
}

// ─── Returns (design 20a) ──────────────────────────────────────────────────
export interface OrderDispute {
  id: string;
  order_id: string;
  outcome: string | null;
  resolved_at: string | null;
  return_required: boolean;
  return_proof_url: string | null;
  return_sent_at: string | null;
  return_received_at: string | null;
  refund_paid_at: string | null;
}

const DISPUTE_SELECT =
  "id, order_id, outcome, resolved_at, return_required, return_proof_url, return_sent_at, return_received_at, refund_paid_at";

/** The dispute tied to this order, for the seller who sold it. Only their
 * own order-side columns, no buyer bank details (those are never a
 * seller's business, and RLS would not permit them anyway). */
export async function fetchOrderDispute(orderId: string): Promise<OrderDispute | null> {
  const { data, error } = await sdb.from("marketplace_disputes")
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
  const { data } = await sdb.from("site_settings").select("value").eq("key", "marketplace_return_confirm_days").maybeSingle();
  const n = Number((data as { value?: unknown } | null)?.value);
  return isFinite(n) && n > 0 ? n : 4;
}

/**
 * Confirms a returned item arrived back with the seller. THIS RELEASES THE
 * BUYER'S REFUND, so it sits behind a confirm step at the call site. Only
 * works once the buyer has marked it sent and only for the seller's own
 * order. Returns false (never throws a raw error to show) when the dispute
 * was not in a confirmable state.
 */
export async function sellerConfirmReturnReceived(disputeId: string): Promise<boolean> {
  const { data, error } = await sdb.rpc("seller_confirm_return_received", { p_dispute_id: disputeId });
  if (error) return false;
  return data === true;
}
