import { useQuery } from "@tanstack/react-query";
import { mdb, LISTING_SELECT } from "./data/mdb";
import type { MarketplaceListing, MarketplaceSellerPublic } from "./types";

/**
 * The same item, from someone else, on a sold listing page.
 *
 * WHY THIS AND NOT JUST RELATED ITEMS. Sold videos now stay public on YouTube
 * permanently, so someone searching for a baby bouncer finds one and clicks
 * through to an item that is gone. The single most useful thing on that page is
 * the same item still for sale, and that is a different question from "what
 * else might you like".
 *
 * IT ONLY RETURNS GENUINE MATCHES. Raw title similarity does not work here:
 * "Baby Walker" scores 0.33 against "Baby Bouncer" purely because every listing
 * contains the word "Baby". The function strips the same noise words the search
 * strips and compares what is left, so the sold Baby Bouncer returns the two
 * real bouncers from other sellers and none of the walkers, beds or strollers.
 *
 * IT OFTEN RETURNS NOTHING, and that is correct rather than a failure. Most
 * items here are one of a kind: 1 of the 5 sold listings today has no match at
 * all. The row is rendered only when there are results and is never padded,
 * because a "same item from another seller" row holding something that is not
 * the same item is worse than no row.
 *
 * `closeness` is deliberately not returned to the caller. It exists so we can
 * see why something matched; a buyer does not care about a similarity score.
 *
 * Ids are hydrated through LISTING_SELECT for the same reason as §186: the RPC
 * returns nine columns and ListingCard reads about seven more, so its raw rows
 * would render cards with no condition, no verified badge and no discount,
 * visibly second class beside every other card.
 */

const LIMIT = 4;

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

export function useSameItemOtherSellers(listingId: string | undefined) {
  return useQuery({
    queryKey: ["mkt-same-item", listingId],
    enabled: !!listingId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MarketplaceListing[]> => {
      const { data, error } = await mdb.rpc("same_item_other_sellers", {
        p_listing_id: listingId, p_limit: LIMIT,
      });
      if (error) return [];
      const ids = ((data ?? []) as Array<{ listing_id: string }>).map((r) => r.listing_id).filter(Boolean);
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

      // Back into the function's own order, closest first. An `in` filter
      // returns rows in whatever order the database likes.
      const byId = new Map(listings.map((l) => [l.id, l]));
      return ids.map((id) => byId.get(id)).filter((l): l is MarketplaceListing => !!l);
    },
  });
}
