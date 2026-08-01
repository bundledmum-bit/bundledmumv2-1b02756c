import { useQuery } from "@tanstack/react-query";
import { mdb, LISTING_SELECT, SELLER_PUBLIC_SELECT } from "./mdb";
import type { MarketplaceListing, MarketplaceSellerPublic } from "../types";

/**
 * Fetches seller identity for the given seller ids from the public-safe view
 * marketplace_sellers_public and returns a map keyed by seller id. Read errors
 * are tolerated (returns an empty map) so a seller-view hiccup never blanks the
 * listings, it just leaves the badge and name unresolved.
 */
async function fetchSellersByIds(
  ids: string[],
): Promise<Map<string, MarketplaceSellerPublic>> {
  const map = new Map<string, MarketplaceSellerPublic>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;

  const { data, error } = await mdb
    .from("marketplace_sellers_public")
    .select(SELLER_PUBLIC_SELECT)
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

/**
 * All live listings, newest first, each with its public seller attached.
 * status='live' is enforced here AND by the "Public read live listings" RLS
 * policy, so nothing else can surface.
 */
export function useLiveListings() {
  return useQuery({
    queryKey: ["marketplace", "listings", "live"],
    queryFn: async (): Promise<MarketplaceListing[]> => {
      const { data, error } = await mdb
        .from("marketplace_listings")
        .select(LISTING_SELECT)
        .eq("status", "live")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const listings = (data ?? []) as unknown as MarketplaceListing[];
      const sellers = await fetchSellersByIds(listings.map((l) => l.seller_id));
      for (const l of listings) {
        l.seller = sellers.get(l.seller_id) ?? null;
      }
      return listings;
    },
    staleTime: 60 * 1000,
  });
}

/** A single listing by id, with its public seller attached. Still scoped to
 * status='live' so a non-live id 404s. */
export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: ["marketplace", "listing", id],
    enabled: !!id,
    queryFn: async (): Promise<MarketplaceListing | null> => {
      const { data, error } = await mdb
        .from("marketplace_listings")
        .select(LISTING_SELECT)
        .eq("id", id as string)
        .eq("status", "live")
        .maybeSingle();
      if (error) throw error;

      const listing = (data ?? null) as unknown as MarketplaceListing | null;
      if (listing) {
        const sellers = await fetchSellersByIds([listing.seller_id]);
        listing.seller = sellers.get(listing.seller_id) ?? null;
      }
      return listing;
    },
  });
}
