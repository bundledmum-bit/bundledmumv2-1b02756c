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

/** Columns selected for a listing. The category name is embedded via an explicit
 * FK-hinted embed. The SELLER is NOT embedded here: seller identity comes from
 * the public view marketplace_sellers_public (the base marketplace_sellers table
 * stays locked for anon by design), and PostgREST cannot embed a view via the
 * base table's FK, so sellers are fetched separately and joined client-side by
 * seller_id (see useListings). */
export const LISTING_SELECT =
  "id, title, description, condition_notes, condition, final_price_naira, location_state, location_city, status, image_url, gallery_urls, category_id, seller_id, quantity, quantity_sold, attributes, " +
  "category:marketplace_categories!marketplace_listings_category_id_fkey(name)";

/** The ONLY seller columns anyone may read. This is the full column list of the
 * public-safe view; no other seller field (bank status, debit, strikes,
 * customer_id, contact) exists in it or may be fetched from anywhere else. */
export const SELLER_PUBLIC_SELECT =
  "id, display_name, verification_tier, status, created_at";
