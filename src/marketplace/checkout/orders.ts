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
 * Creates (or reuses) the pending order via the edge function (v4, verify_jwt is
 * FALSE, so guests are accepted). Because the two parties arrange delivery
 * directly, the seller needs the buyer's NAME and PHONE, not just an email:
 *  - GUEST: email, full_name and phone are all required. The function finds or
 *    creates a customer from them. Errors: 'A valid email address is required',
 *    'Please give your name so the seller knows who to send to', 'A valid Nigerian
 *    phone number is required so the seller can reach you'.
 *  - LOGGED IN: email comes from the account (any sent email is ignored). full_name
 *    and phone are optional; if the customer record is missing either, the sent
 *    value fills the gap, existing values are never overwritten.
 * Phone is normalised SERVER SIDE, so pass whatever the buyer typed. The function
 * computes every money field and generates the reference. May return
 * { reused: true }. Other errors: 'This item is no longer available',
 * 'You cannot buy your own listing'.
 */
export async function createMarketplaceOrder(input: { listingId: string; email?: string; full_name?: string; phone?: string; whatsappNumber?: string; phoneIsWhatsapp?: boolean; offerId?: string }): Promise<{ order: OrderRow; email?: string; reused?: boolean }> {
  const body: { listing_id: string; email?: string; full_name?: string; phone?: string; whatsapp_number?: string; phone_is_whatsapp?: boolean; offer_id?: string } = { listing_id: input.listingId };
  if (input.email) body.email = input.email;
  if (input.full_name) body.full_name = input.full_name;
  if (input.phone) body.phone = input.phone;
  // Both already read by create-marketplace-order: when phone_is_whatsapp is
  // false, whatsapp_number is the number that actually gets saved as the
  // buyer's WhatsApp contact; otherwise phone is used for both.
  if (input.whatsappNumber) body.whatsapp_number = input.whatsappNumber;
  if (typeof input.phoneIsWhatsapp === "boolean") body.phone_is_whatsapp = input.phoneIsWhatsapp;
  // Forward-compatible only: create-marketplace-order (v5) does not yet read
  // offer_id at all, it always prices from the listing row. See
  // handoff-marketplace.md for exactly what the function still needs before
  // this actually charges the negotiated price rather than the listing's.
  if (input.offerId) body.offer_id = input.offerId;
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
  /** What we actually send to Paystack: item price plus the service fee. */
  subtotal_naira: number;
  /** ESTIMATE of the fee Paystack will add. Can be about a naira off their rounding. */
  paystack_fee_naira: number;
  /** subtotal plus the estimated fee, i.e. roughly what the buyer will be charged. */
  amount_naira: number;
  /** True when Paystack is adding its fee on top (dashboard fee-passing is on). */
  fee_added_by_paystack: boolean;
}

/**
 * Initialises the Paystack transaction server-side (v5) and returns the hosted
 * payment page URL plus the money figures. Because Paystack's "pass transaction
 * fee to customer" is ON, we send only subtotal_naira and Paystack adds its fee
 * at the point of payment, so paystack_fee_naira and amount_naira are ESTIMATES,
 * presented as such in the UI, never computed client side. Errors: 'This is not
 * your order' (403), 'This order is already paid' (409), 'This item is no longer
 * available' (409), 'Payment is not configured' (500).
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
  seller_whatsapp: string | null;
  seller_phone: string | null;
  can_call: boolean;
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
