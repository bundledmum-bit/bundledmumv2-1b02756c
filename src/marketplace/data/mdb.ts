import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The marketplace_* tables are not in the auto-generated Database types, so the
 * strongly-typed client rejects .from("marketplace_listings"). We reuse the same
 * anon client (RLS allows public read of live listings and allowed categories)
 * but as an untyped handle, and cast rows to our local interfaces at the call
 * site. This keeps the generated types.ts untouched.
 */
export const mdb = supabase as unknown as SupabaseClient;

/** Columns selected for a listing, with explicit FK-hinted embeds to avoid any
 * PostgREST ambiguity (each embed names the exact foreign-key constraint). */
export const LISTING_SELECT =
  "id, title, description, condition_notes, final_price_naira, location_state, location_city, status, image_url, gallery_urls, category_id, seller_id, " +
  "category:marketplace_categories!marketplace_listings_category_id_fkey(name), " +
  "seller:marketplace_sellers!marketplace_listings_seller_id_fkey(verification_tier, status)";
