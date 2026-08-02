import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Checkout data helpers. marketplace_orders deliberately has NO public INSERT or
 * UPDATE policy: only admin and the service role can write, so a buggy or
 * compromised client cannot forge an order or a payment state. Order creation
 * goes through the deployed edge function `create-marketplace-order`.
 *
 * SECURITY: the payment reference is generated SERVER SIDE, not by the client.
 * If the client chose it, a buyer could submit a reference matching another
 * buyer's order, and the awaiting screen (which looks up an order by reference)
 * would then leak that stranger's order. So the client sends ONLY { listing_id }
 * and reads the reference back from the created order's
 * paystack_transaction_reference.
 */
export const cdb = supabase as unknown as SupabaseClient;

export function formatNaira(value: number | null | undefined): string {
  const n = Number(value);
  if (!isFinite(n)) return "₦0";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

export interface OrderRow {
  id: string;
  paystack_transaction_reference: string;
  amount_naira: number;
  [k: string]: unknown;
}

/** Carries the edge function's server error string so the UI can map it to a
 * friendly, human message. */
export class CheckoutError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** Pulls the { error } string out of a failed functions.invoke response. */
async function invokeErrorCode(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      return (body as { error?: string })?.error || "";
    }
  } catch { /* body was not JSON */ }
  return "";
}

/**
 * Creates (or reuses) the pending order via the edge function (verify_jwt is
 * FALSE, so guests are accepted). A logged-in buyer's session is used silently
 * and any email is ignored; a guest MUST pass a valid email, from which the
 * function finds or creates a customer record. The function computes every money
 * field from the listing and site_settings and generates the reference. May
 * return { reused: true } for an existing pending order.
 * Errors: 'A valid email address is required' 400, 'This item is no longer
 * available' 409, 'You cannot buy your own listing' 400.
 */
export async function createMarketplaceOrder(input: { listingId: string; email?: string }): Promise<{ order: OrderRow; email?: string; reused?: boolean }> {
  const body: { listing_id: string; email?: string } = { listing_id: input.listingId };
  if (input.email) body.email = input.email;
  const { data, error } = await cdb.functions.invoke("create-marketplace-order", { body });
  if (error) throw new CheckoutError((await invokeErrorCode(error)) || "unknown");
  return data as { order: OrderRow; email?: string; reused?: boolean };
}

/**
 * Resends the buyer's order-confirmation email (the one carrying the one-time
 * sign-in link that opens /marketplace/orders/{order_id}). The normal send
 * happens SERVER SIDE during payment verification; this is only for a "did not
 * get the email, resend" action, so it forces a resend. Returns true on success.
 */
export async function resendOrderConfirmation(orderId: string): Promise<boolean> {
  const { error } = await cdb.functions.invoke("send-marketplace-order-confirmation", {
    body: { order_id: orderId, force: true },
  });
  return !error;
}

export interface InitPayment {
  authorization_url: string;
  reference: string;
  amount_naira: number;
  paystack_fee_naira: number;
}

/**
 * Initialises the Paystack transaction server-side and returns the hosted
 * payment page URL plus the authoritative fee and total. The client shows those
 * figures (so client and server never disagree) and redirects the browser to
 * authorization_url. Errors: 'This is not your order' (403), 'This order is
 * already paid' (409), 'This item is no longer available' (409), 'Payment is not
 * configured' (500).
 */
export async function initializePayment(input: { orderId: string; callbackUrl: string }): Promise<InitPayment> {
  const { data, error } = await cdb.functions.invoke("marketplace-initialize-payment", {
    body: { order_id: input.orderId, callback_url: input.callbackUrl },
  });
  if (error) throw new CheckoutError((await invokeErrorCode(error)) || "unknown");
  return data as InitPayment;
}

export interface VerifyResult {
  status: "paid" | "failed" | "abandoned" | "mismatch";
  order_id: string;
  already?: boolean;
}

/**
 * Verifies a Paystack transaction by its reference and returns the resolved
 * status. Idempotent server-side. verify_jwt is off for this function. A
 * transport error is surfaced as status 'error' so the return screen can show a
 * calm failure rather than crashing.
 */
export async function verifyPayment(reference: string): Promise<VerifyResult | { status: "error"; order_id?: string }> {
  const { data, error } = await cdb.functions.invoke("marketplace-verify-payment", {
    body: { reference },
  });
  if (error) return { status: "error" };
  return data as VerifyResult;
}

export interface OrderContact {
  order_id: string;
  listing_title: string;
  amount_naira: number;
  seller_display_name: string | null;
  seller_phone: string | null;
}

/**
 * Reveals the seller's contact for a PAID order the caller bought. The RPC
 * returns at most one row, and nothing unless the caller is the buyer and the
 * order is paid. This is the only place the seller phone is exposed.
 */
export async function getOrderContact(orderId: string): Promise<OrderContact | null> {
  const { data, error } = await cdb.rpc("get_marketplace_order_contact", { p_order_id: orderId });
  if (error) return null;
  const rows = (data ?? []) as OrderContact[];
  return rows[0] ?? null;
}

/** Normalises a Nigerian number to international digits, e.g. 08012345678 to
 * 2348012345678, without double-prefixing an already-international number. */
export function toIntlNumber(phone: string | null | undefined): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return "234" + digits.slice(1);
  return "234" + digits;
}

/** wa.me link to a seller with a pre-filled, context-carrying message. */
export function sellerWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${toIntlNumber(phone)}?text=${encodeURIComponent(message)}`;
}

/** tel: link in international form. */
export function sellerCallLink(phone: string): string {
  return `tel:+${toIntlNumber(phone)}`;
}
