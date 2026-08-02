import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sell-side data helpers. Reads and writes go through the authenticated customer
 * Supabase client (same session as the storefront). The marketplace_* tables are
 * not in the generated Database types, so we use an untyped handle and cast.
 */
export const sdb = supabase as unknown as SupabaseClient;

/** Public bucket for seller listing photos. Kept separate from the admin
 * managed product-images bucket. See handoff: this bucket plus an authenticated
 * insert policy is a DB requirement before uploads work. */
export const LISTING_BUCKET = "marketplace-listings";

export function formatNaira(value: number | null | undefined): string {
  const n = Number(value);
  if (!isFinite(n)) return "₦0";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

/** Buyer price from the seller asking price and the current markup percent. */
export function buyerPrice(askingNaira: number, markupPct: number): number {
  if (!isFinite(askingNaira) || askingNaira <= 0) return 0;
  return Math.round(askingNaira * (1 + (markupPct || 0) / 100));
}

/** Masks a bank account number, showing only the last 4 digits. */
export function maskAccount(acct: string | null | undefined): string {
  const s = String(acct || "").trim();
  if (s.length <= 4) return s ? `••••${s}` : "Not set";
  return `••••••${s.slice(-4)}`;
}

/**
 * Validates a public display name. It is shown to buyers, so it must not carry
 * contact details: no digits, no @ symbol, no URL. Returns an error string or
 * null when valid.
 */
export function validateDisplayName(name: string): string | null {
  const s = name.trim();
  if (s.length < 2) return "Please enter a display name.";
  if (/\d/.test(s)) return "The display name cannot contain numbers. It is shown to buyers, so keep out any contact details.";
  if (/@/.test(s)) return "The display name cannot contain an @ symbol. It is shown to buyers, so keep out any contact details.";
  if (/https?:\/\/|www\.|\.[a-z]{2,}\//i.test(s)) return "The display name cannot contain a web address. It is shown to buyers, so keep out any contact details.";
  return null;
}

/**
 * Anti-leakage control, mirrors the admin review check. Blocks listing text that
 * looks like a phone number or an attempt to route buyers off platform: a run of
 * 7 or more digits (with common separators), a +234 prefix, or the words
 * whatsapp, call me, dm me.
 */
export function hasContactLeak(...texts: Array<string | null | undefined>): boolean {
  const blob = texts.filter(Boolean).join("  ");
  if (!blob) return false;
  const lower = blob.toLowerCase();
  if (/whats\s*app|call me|dm me|\+?234\d/.test(lower)) return true;
  if (/(?:\d[\s().\-]?){7,}/.test(blob)) return true;
  return false;
}
