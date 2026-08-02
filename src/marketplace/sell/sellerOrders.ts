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
  buyer_phone: string | null;
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

/** Groups seller orders by what the seller must do. */
export function groupSellerOrders(orders: SellerOrder[]) {
  return {
    needsAction: orders.filter((o) => o.order_status === "awaiting_dispatch"),
    inProgress: orders.filter((o) => o.order_status === "awaiting_confirmation"),
    complete: orders.filter((o) => o.order_status === "completed"),
  };
}
