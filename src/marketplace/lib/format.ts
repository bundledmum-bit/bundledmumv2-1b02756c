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
  // "almost new" is the current picker label; "like new" / "as new" are legacy
  // rows and map to the same display label so cards stay consistent.
  if (n.includes("almost new") || n.includes("like new") || n.includes("as new")) return "Almost new";
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

/**
 * Seller display name for the DETAIL page only (never shown on the browse card).
 * Falls back to a generic label when the seller has no public display name, so
 * we never render an empty line or the word "null".
 */
export function sellerDisplayName(listing: MarketplaceListing): string {
  const name = listing.seller?.display_name?.trim();
  return name ? name : "BundledMum seller";
}

/**
 * Short tenure line from the seller's created_at, year only (e.g. "Selling
 * since 2026"). Returns null when created_at is missing or unparseable, so the
 * caller can omit the line rather than show a broken string.
 */
export function sellerTenure(listing: MarketplaceListing): string | null {
  const created = listing.seller?.created_at;
  if (!created) return null;
  const year = new Date(created).getFullYear();
  if (!Number.isFinite(year)) return null;
  return `Selling since ${year}`;
}

/** Avatar initials from the seller display name, e.g. "Amaka O." to "AO".
 * Falls back to "BM" when there is no name. */
export function sellerInitials(listing: MarketplaceListing): string {
  const name = listing.seller?.display_name?.trim();
  if (!name) return "BM";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "BM";
}
