/**
 * Local row types for the marketplace tables. These tables are NOT in the
 * auto-generated src/integrations/supabase/types.ts, so we type reads here
 * rather than touching the generated file. Only the buyer-facing columns are
 * modelled; price_naira is deliberately omitted so it can never leak to buyers.
 */

export type VerificationTier = "basic" | "verified";

/**
 * Seller identity as exposed by the public-safe view marketplace_sellers_public.
 * These are the ONLY seller fields that exist for buyers: nothing sensitive
 * (bank status, debit, strikes, customer_id, contact) is here or fetched
 * anywhere else. Attached to each listing client-side by seller_id.
 */
export interface MarketplaceSellerPublic {
  display_name: string | null;
  verification_tier: VerificationTier | null;
  status: string | null;
  created_at: string | null;
}

export interface MarketplaceCategoryEmbed {
  name: string | null;
  /** The readable ?category= link value (see handoff §56) — null only for a
   * category created before slugs existed and never re-saved since; the
   * trigger backfills/keeps this in sync otherwise. */
  slug: string | null;
}

export interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  /** Trigger-maintained: identical to description once it's 40+ characters
   * (the seller's own words, untouched); otherwise composed from the short
   * description plus category question answers and the condition summary,
   * into a real sentence. What "About this item" renders — never description
   * directly. */
  display_description: string;
  condition_notes: string | null;
  /** Structured condition, the reliable source for the browse filter. Null when
   * the seller's old free text did not map cleanly. */
  condition: "almost_new" | "good" | "fair" | null;
  final_price_naira: number;
  /** What it cost new, seller-entered and optional. Shown to buyers as
   * "Bought brand new at ₦X" plus the saving when present; nothing renders
   * when absent, no empty state. Not the same thing as price_before_discount_naira
   * below — this is the seller's own informational figure, that one is ours. */
  original_price_naira: number | null;
  /** Cut from OUR OWN markup by a super admin to move a specific listing —
   * see super_admin_set_listing_discount. 0 when none. Unlike an accepted
   * offer (private to one buyer), this changes final_price_naira itself,
   * so every visitor sees it, signed in or not. */
  admin_discount_naira: number;
  /** What final_price_naira was before the discount above — the
   * struck-through price. Null when there is no discount. */
  price_before_discount_naira: number | null;
  admin_discount_at: string | null;
  location_state: string | null;
  location_city: string | null;
  status: string;
  image_url: string | null;
  gallery_urls: string[] | null;
  category_id: string;
  seller_id: string;
  /** How many identical units the seller has, and how many are already bought.
   * Available stock is quantity minus quantity_sold; both are trigger/server
   * owned and never written from the client. */
  quantity: number;
  quantity_sold: number;
  /** The seller's answers to their category's questions (marketplace_category_fields),
   * keyed by field_key. Always an object (jsonb NOT NULL, defaults to {}), never null.
   * Read-only here; only create-listing writes to it. */
  attributes: Record<string, string | number | boolean>;
  /** Whether the seller has offers switched on for this listing. The
   * server is the real enforcement (buyer_make_offer raises "The seller
   * has set a firm price on this item" and refuses otherwise) — this is
   * read so the client can hide the entry point up front rather than let
   * a buyer tap through to a request the database will just reject. */
  is_negotiable: boolean;
  category: MarketplaceCategoryEmbed | null;
  seller: MarketplaceSellerPublic | null;
  /** One optional seller-recorded video, up to marketplace_video_max_seconds
   * (currently 15s). Null on most listings — rendered as nothing at all,
   * never a placeholder, see ListingDetailPage.tsx. */
  video_url: string | null;
  video_poster_url: string | null;
  video_duration_seconds: number | null;
}
