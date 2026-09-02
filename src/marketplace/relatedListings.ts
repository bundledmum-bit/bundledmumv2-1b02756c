import { useQuery } from "@tanstack/react-query";
import { mdb, LISTING_SELECT } from "./data/mdb";
import type { MarketplaceListing, MarketplaceSellerPublic } from "./types";

/**
 * Other items worth seeing, at the bottom of a listing page.
 *
 * IT ALWAYS FILLS, which is the whole reason this is a database function
 * rather than a query here. 232 of 266 live listings have four or more
 * siblings in their own category, but 26 have only one to three and 8 have
 * none at all. So related_listings widens in steps, same category, then the
 * same group, then a similar price, and stops at the first step that fills.
 * Verified against the hardest case: four listings that are ALONE in their
 * category each returned a full eight.
 *
 * WHY IDS AND NOT ITS ROWS. The function returns nine columns and a
 * ListingCard reads at least seven more: condition, quantity, quantity_sold,
 * video_url, admin_discount_naira, price_before_discount_naira, and the
 * seller for the verified badge. Handing it the raw rows would render cards
 * with no condition, no badge and no discount, visibly second class beside
 * every other card on the site, which defeats the point of showing them.
 *
 * So the ids come back in the function's order and are hydrated through the
 * existing LISTING_SELECT, exactly as §178 did for search. The card then
 * inherits everything it already does, and anything added to it later.
 *
 * match_reason is deliberately NOT returned to the caller. It exists so we
 * can see why something appeared; a buyer does not care whether we found it
 * by category or by price, and telling them would only invite the question.
 */

const RELATED_LIMIT = 8;

interface RelatedRow {
  listing_id: string;
  match_reason: string;
}

async function fetchSellersByIds(ids: string[]): Promise<Map<string, MarketplaceSellerPublic>> {
  const map = new Map<string, MarketplaceSellerPublic>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const { data, error } = await mdb
    .from("marketplace_sellers_public")
    .select("id, display_name, verification_tier, status, created_at")
    .in("id", unique);
  if (error) return map;
  for (const row of (data ?? []) as Array<{ id: string } & MarketplaceSellerPublic>) {
    map.set(row.id, {
      display_name: row.display_name ?? null,
      verification_tier: row.verification_tier ?? null,
      status: row.status ?? null,
      created_at: row.created_at ?? null,
    });
  }
  return map;
}

export function useRelatedListings(listingId: string | undefined) {
  return useQuery({
    queryKey: ["mkt-related", listingId],
    enabled: !!listingId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MarketplaceListing[]> => {
      const { data, error } = await mdb.rpc("related_listings", {
        p_listing_id: listingId, p_limit: RELATED_LIMIT,
      });
      if (error) return [];
      const rows = (data ?? []) as RelatedRow[];
      const ids = rows.map((r) => r.listing_id).filter(Boolean);
      if (ids.length === 0) return [];

      const { data: full, error: fullErr } = await mdb
        .from("marketplace_listings")
        .select(LISTING_SELECT)
        .in("id", ids)
        .eq("status", "live");
      if (fullErr) return [];

      const listings = (full ?? []) as unknown as MarketplaceListing[];
      const sellers = await fetchSellersByIds(listings.map((l) => l.seller_id));
      for (const l of listings) l.seller = sellers.get(l.seller_id) ?? null;

      // Back into the function's own order: it ranks by step and puts
      // listings WITH A VIDEO first within each, which converts a browsing
      // buyer better. An `in` filter returns rows in whatever order the
      // database likes, so that ranking would otherwise be thrown away.
      const rank = new Map(ids.map((id, i) => [id, i]));
      const byId = new Map(listings.map((l) => [l.id, l]));
      const ordered = ids.map((id) => byId.get(id)).filter((l): l is MarketplaceListing => !!l);
      ordered.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

      // Deliberately NOT filtered for QA sellers. useBrowseListings does not
      // filter them either, so a listing visible in the grid must be visible
      // here too or the same item is present in one row and missing from
      // another. Filtering would also punch a hole in the row, and a row that
      // renders seven when it promised eight is the failure this whole
      // widening design exists to avoid.
      return ordered;
    },
  });
}
