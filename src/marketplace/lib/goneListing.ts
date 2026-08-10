import { mdb } from "../data/mdb";

/**
 * Data layer for the four "not live" situations a listing detail (or a bare
 * 404) can land on: sold, removed, a wrong URL, and a seller looking at
 * their own dead listing. Backed by two already-deployed, anon-callable
 * RPCs — get_gone_listing_context and get_similar_live_listings — plus a
 * light count query for the "See all N" line, matching the same pattern
 * useBrowseCount already uses elsewhere. No migrations, no edge functions,
 * nothing here writes anything.
 */

export interface GoneListingContext {
  title: string;
  image_url: string | null;
  final_price_naira: number;
  status: "sold" | "delisted" | "rejected";
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  sold_at: string | null;
}

/** Null means either the id is genuinely unknown, or it exists but is
 * live/pending_review — both read as "case 3, wrong URL" per the routing
 * rule, since the RPC only ever returns a row for sold/delisted/rejected. */
export async function fetchGoneListingContext(listingId: string): Promise<GoneListingContext | null> {
  const { data, error } = await mdb.rpc("get_gone_listing_context", { p_listing_id: listingId });
  if (error) return null;
  const rows = (data ?? []) as GoneListingContext[];
  return rows[0] ?? null;
}

export interface SimilarListing {
  id: string;
  title: string;
  image_url: string | null;
  final_price_naira: number;
  location_city: string | null;
  location_state: string | null;
  is_negotiable: boolean;
  from_same_category: boolean;
}

export async function fetchSimilarLiveListings(listingId: string, limit = 4): Promise<SimilarListing[]> {
  const { data, error } = await mdb.rpc("get_similar_live_listings", { p_listing_id: listingId, p_limit: limit });
  if (error) return [];
  return (data ?? []) as SimilarListing[];
}

/** get_gone_listing_context (an RPC) only returns category_id, never a slug —
 * not something this pass can change (no edge function/migration scope), so
 * the readable slug for this screen's own "Browse {category}" links is
 * resolved with one small, plain, non-RPC read against the same already-
 * deployed slug column instead. Null on any failure, so a caller can fall
 * back to the still-working raw-id link rather than break it. */
export async function fetchCategorySlug(categoryId: string): Promise<string | null> {
  const { data } = await mdb.from("marketplace_categories").select("slug").eq("id", categoryId).maybeSingle();
  return (data as { slug: string } | null)?.slug ?? null;
}

/** Live count for "See all N in {category}", read the same way BrowsePage's
 * own count already works — a plain head-count select, not a new RPC. */
export async function fetchCategoryLiveCount(categoryId: string): Promise<number> {
  const { count } = await mdb.from("marketplace_listings")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .eq("status", "live");
  return count ?? 0;
}

/** For the seller's-own-view case: ownership is decided by the database via
 * RLS ("Seller reads own listings"), not client-side trust — this only ever
 * returns a row when the id genuinely belongs to the logged-in seller,
 * regardless of its status, which is also why it can carry rejection_reason
 * (get_gone_listing_context deliberately never exposes that to a buyer). */
export interface OwnListingContext {
  id: string;
  title: string;
  image_url: string | null;
  final_price_naira: number;
  status: string;
  rejection_reason: string | null;
}

export async function fetchOwnListingIfMine(listingId: string, sellerId: string): Promise<OwnListingContext | null> {
  const { data } = await mdb.from("marketplace_listings")
    .select("id, title, image_url, final_price_naira, status, rejection_reason")
    .eq("id", listingId)
    .eq("seller_id", sellerId)
    .maybeSingle();
  return (data as OwnListingContext | null) ?? null;
}

/** Lowercased, so it reads naturally inside "Browse {category}". */
export function browseCategoryLabel(categoryName: string | null): string {
  return (categoryName || "everything").toLowerCase();
}
