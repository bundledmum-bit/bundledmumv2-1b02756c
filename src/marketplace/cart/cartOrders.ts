import { cdb, CheckoutError } from "../checkout/orders";

/**
 * Cart-specific data helpers, kept separate from checkout/orders.ts so the
 * single-item flow (Buy now, /checkout/:listingId) stays completely
 * untouched. Both files share the same `cdb` client.
 */

export interface CartItemSummary {
  listing_id: string;
  title: string;
  image_url: string | null;
  seller_id: string;
  seller_name: string | null;
  location: string | null;
  price: number;
  is_available: boolean;
}

/** Re-checks every item in the cart against the live listing state. Always
 * called fresh when the cart is shown — a sold-out or delisted item is
 * never trusted from localStorage. Anonymous-callable (SECURITY DEFINER). */
export async function summariseCart(listingIds: string[]): Promise<CartItemSummary[]> {
  if (listingIds.length === 0) return [];
  const { data, error } = await cdb.rpc("summarise_cart", { p_listing_ids: listingIds });
  if (error) throw error;
  return (data ?? []) as CartItemSummary[];
}

export interface CartOrderRow {
  id: string;
  seller_id: string;
  listing_id: string;
  item_price_naira: number;
  service_fee_naira: number;
  amount_naira: number;
  cart_reference: string;
  [k: string]: unknown;
}

export interface CartOrderResult {
  cart_reference: string;
  orders: CartOrderRow[];
  items_total: number;
  service_fee_naira: number;
  amount_naira: number;
  seller_count: number;
  delivery_count: number;
  email?: string;
}

/**
 * Creates one order per listing, all sharing a cart_reference, via the
 * deployed create-marketplace-cart-order edge function. Same buyer-detail
 * rules as the single-item create-marketplace-order: logged-in buyers need
 * nothing extra, guests must supply email/full_name/phone. Errors surface
 * verbatim from the server (already human-readable), same convention as
 * createMarketplaceOrder. A 409 carries an `unavailable` array of items that
 * dropped out between cart view and checkout.
 */
export async function createMarketplaceCartOrder(input: {
  listingIds: string[];
  email?: string;
  full_name?: string;
  phone?: string;
  whatsappNumber?: string;
  phoneIsWhatsapp?: boolean;
}): Promise<CartOrderResult> {
  const body: Record<string, unknown> = { listing_ids: input.listingIds };
  if (input.email) body.email = input.email;
  if (input.full_name) body.full_name = input.full_name;
  if (input.phone) body.phone = input.phone;
  if (input.whatsappNumber) body.whatsapp_number = input.whatsappNumber;
  if (typeof input.phoneIsWhatsapp === "boolean") body.phone_is_whatsapp = input.phoneIsWhatsapp;

  const { data, error } = await cdb.functions.invoke("create-marketplace-cart-order", { body });
  if (error) {
    let code = "unknown";
    let unavailable: { id: string; title: string | null }[] | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const parsed = await ctx.json();
        code = (parsed as { error?: string })?.error || code;
        unavailable = (parsed as { unavailable?: { id: string; title: string | null }[] })?.unavailable;
      }
    } catch { /* body was not JSON */ }
    const err = new CheckoutError(code);
    (err as CheckoutError & { unavailable?: typeof unavailable }).unavailable = unavailable;
    throw err;
  }
  return data as CartOrderResult;
}

export interface InitCartPayment {
  authorization_url: string;
  reference: string;
  subtotal_naira: number;
  paystack_fee_naira: number;
  amount_naira: number;
  fee_added_by_paystack: boolean;
  order_count: number;
  is_cart: boolean;
}

/**
 * Initialises ONE Paystack transaction covering every order in the cart
 * (marketplace-initialize-payment now accepts cart_reference alongside its
 * original single order_id — single-item Buy now is unaffected, still
 * sends order_id, see checkout/orders.ts's initializePayment). A 409 means
 * an item sold out between checkout and pay; carries the same `unavailable`
 * shape as create-marketplace-cart-order's own 409.
 */
export async function initializeCartPayment(input: { cartReference: string; callbackUrl: string; channel: "card" | "bank_transfer" }): Promise<InitCartPayment> {
  const { data, error } = await cdb.functions.invoke("marketplace-initialize-payment", {
    body: { cart_reference: input.cartReference, callback_url: input.callbackUrl, channel: input.channel },
  });
  if (error) {
    let code = "unknown";
    let unavailable: { id: string; title: string | null }[] | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const parsed = await ctx.json();
        code = (parsed as { error?: string })?.error || code;
        unavailable = (parsed as { unavailable?: { id: string; title: string | null }[] })?.unavailable;
      }
    } catch { /* body was not JSON */ }
    const err = new CheckoutError(code);
    (err as CheckoutError & { unavailable?: typeof unavailable }).unavailable = unavailable;
    throw err;
  }
  return data as InitCartPayment;
}
