import { useQuery } from "@tanstack/react-query";
import { mdb, LISTING_SELECT, SELLER_PUBLIC_SELECT } from "./mdb";
import { testSellerIdList } from "@/lib/testAccounts";
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
  categoryId: string;      // "" for all — a single category
  groupId: string;         // "" for all — a whole category GROUP, e.g. from ?group=slug.
                            // Mutually exclusive with categoryId; categoryId always wins
                            // if both are somehow set, since it's the finer filter.
  categoryIds: string[] | null; // resolved list of category ids belonging to groupId,
                                 // computed client side (categories are already loaded
                                 // for the tiles/accordion) — null when groupId is "".
  state: string;           // location_state, "" for All Nigeria
  city: string;            // location_city, "" for all areas (needs a state first)
  minPrice: number | null; // filters final_price_naira, never price_naira
  maxPrice: number | null;
  conditions: string[];    // subset of almost_new | good | fair
  sort: BrowseSort;
}

/**
 * The ids that match what was typed, in relevance order.
 *
 * Search used to be `title ilike '%term%'`, one substring against one column,
 * and the search log showed every failing search had matching stock:
 * "cots" missed "cot", "breastpump" missed "breast pump", "baby chair" missed
 * "Baby Starter-chair" because no title holds that exact pair, and "baby bad"
 * plainly meant bed. Live, that ilike returned NOTHING for six of the ten
 * terms people actually typed.
 *
 * search_marketplace_listings does the reading instead: it strips noise words
 * (every listing here is a baby item, so "baby" narrows nothing), applies the
 * 44 admin-editable aliases, stems a trailing s, then tries exact, then
 * partial, then fuzzy, stopping at the first pass that finds anything. Fuzzy
 * being LAST is the point: it rescues a typo without diluting a good match.
 *
 * WHY IDS AND NOT ITS ROWS. The function returns nine columns and a listing
 * card needs about twenty-five, and it returns no category_id at all, so its
 * output cannot be filtered by category even in principle. Taking the ids and
 * fetching them through LISTING_SELECT keeps the cards and all eight filters
 * exactly as they were, and keeps the count a real server-side count, which is
 * what the search log depends on.
 */
const SEARCH_ID_LIMIT = 500;

async function searchListingIds(query: string): Promise<string[]> {
  // p_limit is applied INSIDE each pass, before any of our filters run, so a
  // small one would silently mean "Lagos cots among the best-ranked 60 cots"
  // rather than all of them, and would cap the recorded count too. Set above
  // the live catalogue (244) so it is not a real ceiling, while still bounded.
  const { data, error } = await mdb.rpc("search_marketplace_listings", {
    p_query: query, p_limit: SEARCH_ID_LIMIT,
  });
  if (error) return [];
  return ((data ?? []) as Array<{ listing_id: string }>).map((r) => r.listing_id);
}

/** Builds the live-listings query with every filter applied SERVER SIDE, so this
 * scales past the seeded set. head:true gives just a count for the live sheet.
 * searchIds is the relevance-ordered result of searchListingIds, or null when
 * nothing was typed. */
function buildBrowseQuery(f: BrowseFilters, head: boolean, searchIds: string[] | null) {
  let q = mdb
    .from("marketplace_listings")
    .select(head ? "id" : LISTING_SELECT, { count: "exact", head })
    .eq("status", "live");
  // The search is now an id set rather than a LIKE, and it is ANDed with the
  // rest exactly as the LIKE was, so every other filter behaves identically.
  if (searchIds) q = q.in("id", searchIds);
  // categoryId (a single category) always takes priority over categoryIds (a whole
  // group) if both are ever set at once — the finer filter wins, and this also
  // guards against a stale group selection lingering after a category is picked.
  if (f.categoryId) q = q.eq("category_id", f.categoryId);
  else if (f.categoryIds && f.categoryIds.length) q = q.in("category_id", f.categoryIds);
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
      const term = filters.search.trim();
      const searchIds = term ? await searchListingIds(term) : null;
      // Nothing matched what they typed, so there is no second query to make
      // and no chance of `.in("id", [])` being read as "no filter".
      if (searchIds && searchIds.length === 0) return { listings: [], count: 0 };

      const { data, error, count } = await buildBrowseQuery(filters, false, searchIds);
      if (error) throw error;
      let listings = (data ?? []) as unknown as MarketplaceListing[];

      // Relevance is the sort when someone has typed something and not asked
      // for a different order: the function already ranks by pass, then a
      // video, then views, and PostgREST cannot express that. An explicit
      // price sort is a deliberate choice by the buyer and still wins.
      if (searchIds && filters.sort === "newest") {
        const rank = new Map(searchIds.map((id, i) => [id, i]));
        listings = [...listings].sort(
          (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
        );
      }

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
      const term = filters.search.trim();
      const searchIds = term ? await searchListingIds(term) : null;
      if (searchIds && searchIds.length === 0) return 0;
      const { count, error } = await buildBrowseQuery(filters, true, searchIds);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 15 * 1000,
  });
}

export interface CategoryOption { id: string; name: string; slug: string; icon: string | null; group_id: string | null; sort_order: number; }
export interface CategoryGroup { id: string; name: string; slug: string; sort_order: number; }

/** Allowed categories for the tiles and grouped filter. Ordered by the category's
 * own sort_order then name; grouping/ordering into the 7 groups is done client side
 * against useCategoryGroups (see BrowsePage). icon and group_id are read live so a
 * category added or regrouped by an admin renders with no deploy, no hardcoded map.
 * slug is unique, auto-generated from the name and kept in sync server side by a
 * trigger — the readable form every category link now uses instead of a raw id. */
export function useAllowedCategories() {
  return useQuery({
    queryKey: ["marketplace", "allowed-categories"],
    queryFn: async (): Promise<CategoryOption[]> => {
      const { data } = await mdb.from("marketplace_categories").select("id, name, slug, icon, group_id, sort_order").eq("is_allowed", true).order("sort_order").order("name");
      return (data ?? []) as CategoryOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** The 7 category groups (Clothing and shoes, Feeding, ...), ordered for display.
 * Public-readable; a category's group_id points here. slug is the readable ?group=
 * link value, same auto-generated/trigger-synced column as a category's own. */
export function useCategoryGroups() {
  return useQuery({
    queryKey: ["marketplace", "category-groups"],
    queryFn: async (): Promise<CategoryGroup[]> => {
      const { data } = await mdb.from("marketplace_category_groups").select("id, name, slug, sort_order").order("sort_order");
      return (data ?? []) as CategoryGroup[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * How many LIVE listings each category holds right now.
 *
 * Drives the whole category menu: the order (most stock first), the count
 * shown beside every name, and which ones are dimmed as empty. 21 of the 49
 * allowed categories have nothing in them, so a menu that did not say so would
 * send buyers into dead ends by its own navigation.
 *
 * One query for every live listing's category_id, counted here. PostgREST has
 * no GROUP BY, and adding a view would be a Supabase change; at 265 live
 * listings this is a few kilobytes and one round trip, and it stays honest
 * because it counts exactly what the grid can show.
 */
export function useCategoryCounts() {
  return useQuery({
    queryKey: ["marketplace", "category-counts"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await mdb
        .from("marketplace_listings")
        .select("category_id")
        .eq("status", "live");
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of (data ?? []) as Array<{ category_id: string | null }>) {
        if (!r.category_id) continue;
        m.set(r.category_id, (m.get(r.category_id) ?? 0) + 1);
      }
      return m;
    },
  });
}

export type FeaturedSurface = "browse_home" | "sell_page";
export interface FeaturedCategoryRow { category_id: string; sort_order: number; }

/** Admin-curated category picks for one surface (browse home's tile strip or
 * the sell page's category showcase), in sort_order. Public-readable, empty
 * by default until an admin curates it — callers are expected to fall back
 * to their own default ordering when this comes back empty, never to render
 * a blank section just because nothing has been picked yet. */
export function useFeaturedCategories(surface: FeaturedSurface) {
  return useQuery({
    queryKey: ["marketplace", "featured-categories", surface],
    queryFn: async (): Promise<FeaturedCategoryRow[]> => {
      const { data } = await mdb.from("marketplace_featured_categories")
        .select("category_id, sort_order").eq("surface", surface).order("sort_order");
      return (data ?? []) as FeaturedCategoryRow[];
    },
    staleTime: 60 * 1000,
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

export interface HeroListing {
  id: string;
  title: string;
  image_url: string;
  final_price_naira: number;
  location_state: string | null;
  location_city: string | null;
  condition: string | null;
  is_negotiable: boolean;
}

/**
 * Hero carousel listings for the desktop home (design 38a), via the
 * get_hero_listings RPC. The RPC orders by view count server side, falling
 * back to newest whenever real view data is too thin, but that ordering is
 * NEVER surfaced to the buyer as a label — no "popular", "trending", no
 * badge. With one completed sale and low traffic, calling something
 * popular invites scrutiny it cannot survive, so this reads as a plain
 * selection of items, not a ranking. The fallback is invisible by design
 * and needs no handling here.
 */
export function useHeroListings(limit: number) {
  return useQuery({
    queryKey: ["marketplace", "hero-listings", limit],
    queryFn: async (): Promise<HeroListing[]> => {
      const { data, error } = await mdb.rpc("get_hero_listings", { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as HeroListing[];
    },
    staleTime: 60 * 1000,
  });
}

export interface JustListedItem {
  id: string;
  title: string;
  image_url: string | null;
  final_price_naira: number;
  created_at: string;
  seller: MarketplaceSellerPublic | null;
}

/** Newest live listings for the desktop home's "Just listed" row (design
 * 38a), each with its public seller attached so the freshest ones can say
 * who actually listed it, not just when. Desktop only, see BrowsePage. */
export function useJustListed(limit: number) {
  return useQuery({
    queryKey: ["marketplace", "just-listed", limit],
    queryFn: async (): Promise<JustListedItem[]> => {
      const { data, error } = await mdb
        .from("marketplace_listings")
        .select("id, title, image_url, final_price_naira, created_at, seller_id")
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string; title: string; image_url: string | null;
        final_price_naira: number; created_at: string; seller_id: string;
      }>;
      const sellers = await fetchSellersByIds(rows.map((r) => r.seller_id));
      return rows.map((r) => ({ ...r, seller: sellers.get(r.seller_id) ?? null }));
    },
    staleTime: 60 * 1000,
  });
}

export interface MarketplaceStats {
  sellerCount: number;
  liveListingValueNaira: number;
  /** Plain live-listing count, for pages (how-it-works, FAQ) that need a real
   * "browse all N items" number without pulling every price row. */
  liveListingCount: number;
}

/**
 * The real numbers behind the desktop home's stat tiles (design 38a) and any
 * other page that needs to say how many sellers or listings actually exist
 * right now (design 40a/41a's "Browse all N items" and FAQ answers): genuine
 * counts read live from marketplace_sellers_public (already publicly
 * readable) and marketplace_listings where status='live'. Deliberately real
 * operational numbers rather than reviews, ratings, or a sold count — there
 * has only been one completed sale, so anything of that kind would be
 * fabricated. No new Supabase function, just the same plain client reads
 * every other hook here already does.
 */
export function useMarketplaceStats() {
  return useQuery({
    queryKey: ["marketplace", "stats"],
    queryFn: async (): Promise<MarketplaceStats> => {
      const [sellersRes, listingsRes, countRes] = await Promise.all([
        mdb.from("marketplace_sellers_public").select("id", { count: "exact", head: true })
          // The QA seller is a real row but must never inflate a number
          // shown to buyers. Excluded server side so this stays a head+count.
          .not("id", "in", testSellerIdList()),
        mdb.from("marketplace_listings").select("final_price_naira").eq("status", "live"),
        mdb.from("marketplace_listings").select("id", { count: "exact", head: true }).eq("status", "live"),
      ]);
      const sellerCount = sellersRes.count ?? 0;
      const rows = (listingsRes.data ?? []) as Array<{ final_price_naira: number }>;
      const liveListingValueNaira = rows.reduce((sum, r) => sum + (Number(r.final_price_naira) || 0), 0);
      const liveListingCount = countRes.count ?? 0;
      return { sellerCount, liveListingValueNaira, liveListingCount };
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
