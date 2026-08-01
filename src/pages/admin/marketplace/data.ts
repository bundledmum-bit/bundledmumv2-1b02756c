import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The marketplace_* tables and the site_settings marketplace keys are read and
 * written here through the authenticated Supabase client (the same one the rest
 * of the admin uses). Admin RLS policies ("Admin manage listings", "Admin
 * manage categories", etc) already gate these. The tables are not in the
 * generated Database types, so we use an untyped handle and cast at call sites.
 */
export const adb = supabase as unknown as SupabaseClient;

/** Money formatting, buyer or seller price, e.g. 49500 becomes "₦49,500". */
export function formatNaira(value: number | null | undefined): string {
  const n = Number(value);
  if (!isFinite(n)) return "₦0";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

/**
 * Anti-leakage control. Scans free text for anything resembling a phone number
 * or an attempt to route buyers off platform: a run of 7 or more digits (with
 * common separators), a +234 prefix, or the words whatsapp, call me, dm me.
 * Returns true when a listing needs a closer look before approval.
 */
export function hasContactLeak(...texts: Array<string | null | undefined>): boolean {
  const blob = texts.filter(Boolean).join("  ");
  if (!blob) return false;
  const lower = blob.toLowerCase();
  if (/whats\s*app|call me|dm me|\+?234\d/.test(lower)) return true;
  // 7+ digits in a row, allowing spaces, dashes, dots, brackets between them.
  if (/(?:\d[\s().\-]?){7,}/.test(blob)) return true;
  return false;
}

/** Columns the review queue needs. price_naira is the seller asking price and
 * is admin facing only, it is never sent to buyers. Category name is embedded
 * via the explicit FK hint. */
export const REVIEW_SELECT =
  "id, title, description, condition_notes, price_naira, final_price_naira, location_state, location_city, status, image_url, gallery_urls, seller_id, created_at, " +
  "category:marketplace_categories!marketplace_listings_category_id_fkey(name)";

export interface ReviewListing {
  id: string;
  title: string;
  description: string;
  condition_notes: string | null;
  price_naira: number;
  final_price_naira: number;
  location_state: string | null;
  location_city: string | null;
  status: string;
  image_url: string | null;
  gallery_urls: string[] | null;
  seller_id: string;
  created_at: string | null;
  category: { name: string | null } | null;
  seller_display_name?: string | null;
}
