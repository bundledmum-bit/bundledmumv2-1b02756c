import { sdb } from "./sellData";

/**
 * Where a seller is willing to sell, and how a nearby buyer gets the item.
 *
 * Two levels, and the difference matters:
 *  - the SELLER DEFAULT (seller_set_delivery_prefs) applies to everything
 *    they list, asked once and never again;
 *  - a PER LISTING OVERRIDE (seller_set_listing_delivery) wins for that one
 *    item. Passing null for both CLEARS the override and returns the listing
 *    to the seller default.
 *
 * A buyer never reads either column directly: marketplace_listings carries
 * the override columns, so a null there means "use the seller default", NOT
 * "unset". Only listing_delivery_terms() resolves the two properly, which is
 * why the buyer-facing read below always goes through the RPC.
 *
 * SAFETY: nothing here ever exposes a seller's address. The furthest any of
 * this goes is their state, which is already public on every listing. A home
 * address is shared only after payment, with that one buyer, exactly as the
 * seller's phone number already is.
 */

/** How a buyer in the seller's own state receives the item. */
export type LocalHandover = "ships" | "collection" | "both";

export interface DeliveryTerms {
  /** null when the seller has never answered — never treat as false. */
  sells_nationwide: boolean | null;
  local_handover: LocalHandover | null;
  seller_state: string | null;
  /** False for a listing whose seller has not answered the two questions.
   * There is deliberately no default: we must not imply someone ships. */
  is_set: boolean;
}

/** What a buyer should be told about getting this item. Anon callable, so it
 * works for a signed-out browser. */
export async function fetchListingDeliveryTerms(listingId: string): Promise<DeliveryTerms | null> {
  const { data, error } = await sdb.rpc("listing_delivery_terms", { p_listing_id: listingId });
  if (error) return null;
  const rows = (data ?? []) as DeliveryTerms[];
  return rows[0] ?? null;
}



/** One flat shape rather than a discriminated union: this project's
 * TypeScript config does not narrow `{ok:true}|{ok:false;message}` after an
 * `if (!res.ok)` guard (several existing call sites carry that same error),
 * so an optional message avoids reproducing a known papercut. */
export interface SaveResult { ok: boolean; message?: string }

/** Sets the seller's default for everything they list. The server raises
 * 'Please choose where you are willing to sell' / 'Please choose how buyers
 * near you receive the item' — already human-readable, so they surface
 * verbatim, the same convention as the rest of the sell flow. */
export async function saveSellerDeliveryPrefs(input: { sellsNationwide: boolean; localHandover: LocalHandover }): Promise<SaveResult> {
  const { error } = await sdb.rpc("seller_set_delivery_prefs", {
    p_sells_nationwide: input.sellsNationwide,
    p_local_handover: input.localHandover,
  });
  if (error) return { ok: false, message: error.message || "We could not save that just now. Please try again." };
  return { ok: true };
}

/**
 * Overrides one listing, or CLEARS the override when both are null so the
 * listing goes back to following the seller default.
 */
export async function saveListingDelivery(input: { listingId: string; sellsNationwide: boolean | null; localHandover: LocalHandover | null }): Promise<SaveResult> {
  const { error } = await sdb.rpc("seller_set_listing_delivery", {
    p_listing_id: input.listingId,
    p_sells_nationwide: input.sellsNationwide,
    p_local_handover: input.localHandover,
  });
  if (error) return { ok: false, message: error.message || "We could not save that just now. Please try again." };
  return { ok: true };
}

/**
 * The buyer-facing sentence, in one place so listing detail and anywhere
 * else it is ever shown can never drift apart.
 *
 * When nothing is set we say so plainly and hand the buyer a real next step,
 * rather than inventing a default. Implying a seller ships when they have
 * never said so is the one outcome worth avoiding here.
 */
export function deliveryHeadline(terms: DeliveryTerms): string {
  if (!terms.is_set) return "Delivery not confirmed yet";
  return terms.sells_nationwide ? "Sends anywhere in Nigeria" : `${terms.seller_state || "In-state"} buyers only`;
}

export function deliveryDetail(terms: DeliveryTerms): string {
  const state = terms.seller_state || "the seller's state";
  if (!terms.is_set) {
    return `This seller has not told us yet whether they send items or only sell to buyers nearby. The item is in ${state}. Ask them before you buy, so you know how it would reach you.`;
  }
  const near = terms.local_handover === "ships"
    ? `they will send it to you`
    : terms.local_handover === "collection"
      ? `you would collect it from them`
      : `they can send it to you or you can collect it, whichever suits you both`;
  if (terms.sells_nationwide) {
    return `Wherever you are in Nigeria, this seller will send it to you. If you are in ${state} too, ${near}. You agree the details and who covers the cost on WhatsApp after you pay.`;
  }
  return `This seller only sells to buyers in ${state}. If you are in ${state}, ${near}. You agree the details and who covers the cost on WhatsApp after you pay.`;
}
