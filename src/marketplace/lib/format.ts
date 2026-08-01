import type { MarketplaceListing } from "../types";

/** Buyer-facing price, e.g. 49500 becomes "₦49,500". */
export function formatNaira(value: number | null | undefined): string {
  const n = Number(value);
  if (!isFinite(n)) return "₦0";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

/** Location shown on cards: city if present, else state, else a gentle fallback. */
export function locationLabel(listing: MarketplaceListing): string {
  return listing.location_city || listing.location_state || "Nigeria";
}

/**
 * Derives a SHORT condition tag from the free-text condition_notes. We never
 * dump the full notes on a card. If nothing clean can be derived we fall back
 * to a generic "Used" tag.
 */
export function conditionLabel(notes: string | null | undefined): string {
  if (!notes) return "Used";
  const n = notes.toLowerCase();
  if (n.includes("brand new") || n.includes("unused") || n.includes("never used")) return "New";
  if (n.includes("like new") || n.includes("as new")) return "Like new";
  if (n.includes("barely") || n.includes("excellent")) return "Excellent";
  if (n.includes("very good")) return "Very good";
  if (n.includes("good")) return "Good";
  if (n.includes("fair")) return "Fair";
  return "Used";
}

/** True only when the listing's seller has been checked by us. */
export function isVerifiedSeller(listing: MarketplaceListing): boolean {
  return listing.seller?.verification_tier === "verified";
}
