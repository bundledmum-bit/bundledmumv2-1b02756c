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
}

export interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  condition_notes: string | null;
  /** Structured condition, the reliable source for the browse filter. Null when
   * the seller's old free text did not map cleanly. */
  condition: "almost_new" | "good" | "fair" | null;
  final_price_naira: number;
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
  category: MarketplaceCategoryEmbed | null;
  seller: MarketplaceSellerPublic | null;
}
