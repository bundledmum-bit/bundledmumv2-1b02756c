import { mdb } from "./data/mdb";

/**
 * Can this seller actually get this item to this buyer.
 *
 * Both checks are anon callable, and both return deliverable TRUE whenever
 * we cannot honestly say otherwise — an unknown buyer state, or a seller
 * who has never set terms. That is deliberate and load-bearing: 48 of the
 * 77 sellers with listings have not answered, so "unknown" is the common
 * case and must never cost a buyer anything.
 */

export interface Deliverability {
  listing_id: string;
  title: string | null;
  deliverable: boolean;
  /** The server's own sentence. Kept as a fallback only — the buyer-facing
   * wording is built in deliveryMessage() so it can name the buyer's state,
   * which the server's version does not. */
  reason: string | null;
  seller_first_name: string | null;
  seller_state: string | null;
  local_handover?: string | null;
  category_slug: string | null;
  category_name: string | null;
}

export async function checkListingDeliverable(listingId: string, buyerState: string | null): Promise<Deliverability | null> {
  const { data, error } = await mdb.rpc("check_listing_deliverable", {
    p_listing_id: listingId,
    p_buyer_state: buyerState,
  });
  if (error) return null;
  return ((data ?? []) as Deliverability[])[0] ?? null;
}

export async function checkCartDeliverable(listingIds: string[], buyerState: string | null): Promise<Deliverability[]> {
  if (listingIds.length === 0) return [];
  const { data, error } = await mdb.rpc("check_cart_deliverable", {
    p_listing_ids: listingIds,
    p_buyer_state: buyerState,
  });
  if (error) return [];
  return (data ?? []) as Deliverability[];
}

/**
 * The personalised line, for a buyer whose state we know.
 *
 * Deliberately built here rather than using the server's `reason`: the
 * required wording names the BUYER'S state ("...to you in Kano"), which
 * makes the message read as genuinely checked rather than generic, and the
 * server's sentence does not carry it.
 *
 * Returns null when nothing may be claimed — no buyer state, or the seller
 * has not set terms. Callers render nothing at all in that case.
 *
 * The buyer's own first name is never used: "Ngozi, Amaka will send this to
 * you in Kano" reads like a mail merge. Their state and the seller's name
 * are the personalisation that matters.
 */
export function deliveryMessage(
  d: Deliverability | null | undefined,
  buyerState: string | null,
  opts: { area?: string | null } = {},
): { text: string; blocked: boolean } | null {
  if (!d || !buyerState) return null;
  const who = d.seller_first_name?.trim() || "This seller";
  const sellerState = d.seller_state?.trim() || null;
  const area = opts.area?.trim() || null;
  const fromArea = area ? ` in ${area}` : "";
  const collectFrom = area ? ` from ${area}` : "";

  // Case 4: she cannot reach them. Blocks payment.
  if (!d.deliverable) {
    return {
      blocked: true,
      text: `${who} cannot send this to you in ${buyerState}, she only sells within ${sellerState || "her own state"}.`,
    };
  }

  // Terms not set — nothing may be claimed either way. Case 5: nothing.
  const handover = d.local_handover?.trim() || null;
  if (!handover) return null;

  const sameState = !!sellerState && sellerState.toLowerCase() === buyerState.toLowerCase();

  // Case 1: she will send it. Nationwide, or same state where she ships.
  if (!sameState || handover === "ships") {
    return { blocked: false, text: `${who} will send this to you in ${buyerState}.` };
  }
  // Case 2: same state, collection only.
  if (handover === "collection") {
    return { blocked: false, text: `You are both in ${buyerState}, so you collect this from ${who}${fromArea}.` };
  }
  // Case 3: same state, either.
  return {
    blocked: false,
    text: `You are both in ${buyerState}. ${who} can send it to you, or you can collect it${collectFrom}.`,
  };
}
