import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Checkout data helpers. marketplace_orders deliberately has NO public INSERT or
 * UPDATE policy: only admin and the service role can write, so a buggy or
 * compromised client cannot forge an order or a payment state. Order creation
 * therefore MUST go through a server-side edge function. This module isolates
 * that single call so it can be pointed at the function once it is deployed.
 *
 * OUTSTANDING: the edge function `create-marketplace-order` is not deployed yet.
 * Until it is, createMarketplaceOrder throws and the checkout surfaces a clear
 * "checkout is being set up" message. See handoff-marketplace.md for exactly what
 * the function must do (it computes seller_share from the listing's price_naira,
 * which the buyer must never see, which is the core reason it is server-side).
 */
export const cdb = supabase as unknown as SupabaseClient;

/** Reads a public marketplace listing (buyer-facing fields only, never price_naira). */
export const CHECKOUT_LISTING_SELECT =
  "id, title, final_price_naira, image_url, status, seller_id, " +
  "seller:marketplace_sellers!marketplace_listings_seller_id_fkey(display_name)";

export function formatNaira(value: number | null | undefined): string {
  const n = Number(value);
  if (!isFinite(n)) return "₦0";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

/**
 * Generates a short, unique-enough payment reference for the transfer narration.
 * BM- plus 8 chars from an unambiguous alphabet (no 0/O/1/I) via crypto, roughly
 * 8e11 combinations, so collisions are negligible at this volume. The buyer types
 * this into their transfer so BundledMum can match the money to the order.
 */
export function generatePaymentReference(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `BM-${out}`;
}

/**
 * Creates the order via the server-side edge function. The client sends only the
 * listing id and the reference it displayed; the function authenticates the
 * buyer and computes every money field authoritatively from the listing and
 * site_settings. Returns the created order row.
 */
export async function createMarketplaceOrder(input: { listingId: string; reference: string }) {
  const { data, error } = await cdb.functions.invoke("create-marketplace-order", {
    body: { listing_id: input.listingId, payment_reference: input.reference },
  });
  if (error) throw error;
  return data as { id: string; paystack_transaction_reference: string } & Record<string, unknown>;
}
