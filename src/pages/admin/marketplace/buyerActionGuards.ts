/**
 * Why a buyer-side action cannot be taken on a particular listing.
 *
 * The three buyer functions each refuse for reasons that are perfectly
 * visible before the click: a firm price, a video that already exists, an
 * offer that is not actually lower. Letting the database be the one to say
 * so turns a knowable fact into a confusing error after the fact, so this
 * decides it up front and the screen shows the reason on the row itself.
 *
 * Pure on purpose, so the wording and the conditions are testable without a
 * database. The functions still enforce all of this server side; this only
 * decides what an operator is allowed to try.
 */

export type BuyerAction = "ask" | "offer" | "video";

export interface GuardableListing {
  is_negotiable: boolean;
  has_video: boolean;
  final_price_naira: number;
}

/** Null when the action is possible. A sentence when it is not. */
export function listingBlockedReason(action: BuyerAction, l: GuardableListing): string | null {
  if (action === "offer" && !l.is_negotiable) return "The seller has set a firm price on this one.";
  if (action === "video" && l.has_video) return "This one already has a video the buyer can watch.";
  return null;
}

/**
 * Whether an offer amount is one the seller could actually accept.
 *
 * The function requires strictly below the asking price, because an offer
 * at or above it is not an offer, and there would be nothing to accept.
 */
export function offerPriceProblem(naira: number, askingNaira: number): string | null {
  if (!Number.isFinite(naira) || naira <= 0) return "What price did the buyer offer?";
  if (naira >= askingNaira) return "That is not lower than the asking price, so there would be nothing to accept.";
  return null;
}
