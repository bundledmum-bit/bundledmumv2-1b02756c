/**
 * Local row types for the marketplace tables. These tables are NOT in the
 * auto-generated src/integrations/supabase/types.ts, so we type reads here
 * rather than touching the generated file. Only the buyer-facing columns are
 * modelled; price_naira is deliberately omitted so it can never leak to buyers.
 */

export type VerificationTier = "basic" | "verified";

export interface MarketplaceSellerEmbed {
  verification_tier: VerificationTier | null;
  status: string | null;
}

export interface MarketplaceCategoryEmbed {
  name: string | null;
}

export interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  condition_notes: string | null;
  final_price_naira: number;
  location_state: string | null;
  location_city: string | null;
  status: string;
  image_url: string | null;
  gallery_urls: string[] | null;
  category_id: string;
  seller_id: string;
  category: MarketplaceCategoryEmbed | null;
  seller: MarketplaceSellerEmbed | null;
}
