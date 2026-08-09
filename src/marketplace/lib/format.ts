import type { MarketplaceListing } from "../types";

/** Buyer-facing price, e.g. 49500 becomes "₦49,500". */
export function formatNaira(value: number | null | undefined): string {
  const n = Number(value);
  if (!isFinite(n)) return "₦0";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

/** Full location text shown below the price on cards and detail: "Ikorodu,
 * Lagos" when both city and state are on file (every live listing, now the
 * marketplace covers all 37 states). Falls back to whichever one is
 * present alone (state only, or city only) rather than a stray leading or
 * trailing comma, then a final gentle fallback if neither is set. */
export function locationLabel(listing: MarketplaceListing): string {
  const city = listing.location_city?.trim();
  const state = listing.location_state?.trim();
  if (city && state) return `${city}, ${state}`;
  return city || state || "Nigeria";
}

/** State only, for the small badge on the photo itself — a different job
 * from locationLabel's full "City, State" text: glanceable while scanning a
 * grid of photos, rather than read. Null (never a badge at all) when no
 * state is on file. */
export function stateBadgeLabel(listing: MarketplaceListing): string | null {
  return listing.location_state?.trim() || null;
}

/**
 * Short condition tag for cards and detail, from the structured `condition`
 * enum column, NOT condition_notes. condition_notes is now derived server
 * side from condition_answers (see sync_condition_notes_from_answers) and no
 * longer reliably contains a word like "good" or "fair" to parse, so the
 * enum is the only trustworthy source here, same reasoning as the browse
 * filter already using it instead of parsing free text.
 */
export function conditionLabel(condition: string | null | undefined): string {
  if (condition === "almost_new") return "Almost new";
  if (condition === "good") return "Good";
  if (condition === "fair") return "Fair";
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
