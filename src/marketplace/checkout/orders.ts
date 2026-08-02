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

/**
 * Creates (or reuses) the buyer's pending order via the edge function. Sends only
 * the listing id; the function authenticates the buyer, computes every money
 * field from the listing and site_settings, generates the reference, and returns
 * the order. functions.invoke forwards the current auth session (verify_jwt is
 * on server side). May return { order, reused: true } when an existing pending
 * order for this buyer and listing is returned instead of a new one.
 */
export async function createMarketplaceOrder(input: { listingId: string }): Promise<{ order: OrderRow; reused?: boolean }> {
  const { data, error } = await cdb.functions.invoke("create-marketplace-order", {
    body: { listing_id: input.listingId },
  });
  if (error) {
    let code = "";
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        code = (body as { error?: string })?.error || "";
      }
    } catch { /* body was not JSON, fall through to a generic code */ }
    throw new CheckoutError(code || "unknown");
  }
  return data as { order: OrderRow; reused?: boolean };
}
