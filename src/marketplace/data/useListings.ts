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

export type BrowseSort = "newest" | "price_asc" | "price_desc";

export interface BrowseFilters {
  search: string;
  categoryId: string;      // "" for all
  state: string;           // location_state, "" for All Nigeria
  city: string;            // location_city, "" for all areas (needs a state first)
  minPrice: number | null; // filters final_price_naira, never price_naira
  maxPrice: number | null;
  conditions: string[];    // subset of almost_new | good | fair
  sort: BrowseSort;
}

/** Builds the live-listings query with every filter applied SERVER SIDE, so this
 * scales past the seeded set. head:true gives just a count for the live sheet. */
function buildBrowseQuery(f: BrowseFilters, head: boolean) {
  let q = mdb
    .from("marketplace_listings")
    .select(head ? "id" : LISTING_SELECT, { count: "exact", head })
    .eq("status", "live");
  const search = f.search.trim();
  if (search) q = q.ilike("title", `%${search}%`);
  if (f.categoryId) q = q.eq("category_id", f.categoryId);
  if (f.state) q = q.eq("location_state", f.state);
  if (f.city) q = q.eq("location_city", f.city);
  if (f.minPrice != null) q = q.gte("final_price_naira", f.minPrice);
  if (f.maxPrice != null) q = q.lte("final_price_naira", f.maxPrice);
  if (f.conditions.length) q = q.in("condition", f.conditions);
  if (f.sort === "price_asc") q = q.order("final_price_naira", { ascending: true });
  else if (f.sort === "price_desc") q = q.order("final_price_naira", { ascending: false });
  else q = q.order("created_at", { ascending: false });
  return q;
}

/** Live listings matching the filters (server side), plus the total count. */
export function useBrowseListings(filters: BrowseFilters) {
  return useQuery({
    queryKey: ["marketplace", "browse", filters],
    queryFn: async (): Promise<{ listings: MarketplaceListing[]; count: number }> => {
      const { data, error, count } = await buildBrowseQuery(filters, false);
      if (error) throw error;
      const listings = (data ?? []) as unknown as MarketplaceListing[];
      const sellers = await fetchSellersByIds(listings.map((l) => l.seller_id));
      for (const l of listings) l.seller = sellers.get(l.seller_id) ?? null;
      return { listings, count: count ?? listings.length };
    },
    staleTime: 30 * 1000,
  });
}

/** Just the matching count, for the live "N matching now" in the filter sheet. */
export function useBrowseCount(filters: BrowseFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["marketplace", "browse-count", filters],
    enabled,
    queryFn: async (): Promise<number> => {
      const { count, error } = await buildBrowseQuery(filters, true);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 15 * 1000,
  });
}

export interface CategoryOption { id: string; name: string; icon: string | null; group_id: string | null; sort_order: number; }
export interface CategoryGroup { id: string; name: string; sort_order: number; }

/** Allowed categories for the tiles and grouped filter. Ordered by the category's
 * own sort_order then name; grouping/ordering into the 7 groups is done client side
 * against useCategoryGroups (see BrowsePage). icon and group_id are read live so a
 * category added or regrouped by an admin renders with no deploy, no hardcoded map. */
export function useAllowedCategories() {
  return useQuery({
    queryKey: ["marketplace", "allowed-categories"],
    queryFn: async (): Promise<CategoryOption[]> => {
      const { data } = await mdb.from("marketplace_categories").select("id, name, icon, group_id, sort_order").eq("is_allowed", true).order("sort_order").order("name");
      return (data ?? []) as CategoryOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** The 7 category groups (Clothing and shoes, Feeding, ...), ordered for display.
 * Public-readable; a category's group_id points here. */
export function useCategoryGroups() {
  return useQuery({
    queryKey: ["marketplace", "category-groups"],
    queryFn: async (): Promise<CategoryGroup[]> => {
      const { data } = await mdb.from("marketplace_category_groups").select("id, name, sort_order").order("sort_order");
      return (data ?? []) as CategoryGroup[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Allowed states for the location filter (id + name; id feeds the area lookup). */
export function useAllowedStates() {
  return useQuery({
    queryKey: ["marketplace", "allowed-states"],
    queryFn: async (): Promise<Array<{ id: string; name: string }>> => {
      const { data } = await mdb.from("marketplace_states").select("id, name").eq("is_allowed", true).order("sort_order");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Allowed areas for a chosen state, for the dependent city select. Empty until a
 * state is picked, so a city can never be chosen first. Same source
 * (marketplace_areas is_allowed) as the create-listing area select. */
export function useAreasForState(stateId: string | undefined) {
  return useQuery({
    queryKey: ["marketplace", "areas", stateId],
    enabled: !!stateId,
    queryFn: async (): Promise<Array<{ id: string; name: string }>> => {
      const { data } = await mdb.from("marketplace_areas").select("id, name").eq("is_allowed", true).eq("state_id", stateId as string).order("name");
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    staleTime: 5 * 60 * 1000,
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
