import { useQuery } from "@tanstack/react-query";
import { mdb } from "../data/mdb";

/**
 * The site_settings values the five policy pages state amounts and timings
 * from. These are admin-editable, so the pages must read them live rather
 * than hardcode a number that becomes wrong the moment a setting changes —
 * this already happened twice (service fee shown as ₦750 when it was
 * ₦1,000; max discount and offer expiry shown as stale numbers too). A
 * numeric fallback that matches "today's" value just resets the same drift
 * for next time, so most fields below only fall back on a genuine read
 * failure; maxDiscountPercent and offerExpiryHours have no fallback at all
 * and resolve to null instead, so a caller shows nothing rather than a
 * guessed number.
 */
export interface MarketplacePolicySettings {
  serviceFeeNaira: number;
  markupPercent: number;
  /** null when the setting has not resolved, so the caller can word around
   * the missing number rather than show a stale guess (see maxDiscountPercent
   * and offerExpiryHours below, both of which have drifted out of date once
   * already). */
  maxDiscountPercent: number | null;
  disputeWindowDays: number;
  offerExpiryHours: number | null;
  returnConfirmDays: number;
  contactEmail: string;
  whatsappNumber: string;
  /** null when the setting is empty or missing, so the caller can hide the
   * "Last updated" line entirely rather than show a blank or a fallback
   * date. A missing date is honest, a wrong one is not. */
  policiesUpdatedAt: string | null;
}

const KEYS = [
  "marketplace_service_fee_naira",
  "marketplace_markup_percent",
  "marketplace_max_discount_percent",
  "marketplace_dispute_window_days",
  "marketplace_offer_expiry_hours",
  "marketplace_return_confirm_days",
  "contact_email",
  "whatsapp_number",
  "marketplace_policies_updated_at",
] as const;

export function useMarketplacePolicySettings() {
  return useQuery({
    queryKey: ["mkt-policy-settings"],
    queryFn: async (): Promise<MarketplacePolicySettings> => {
      const { data } = await mdb.from("site_settings").select("key, value").in("key", KEYS);
      const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
      const map = new Map(rows.map((r) => [r.key, r.value]));
      const num = (key: string, fallback: number) => {
        const n = Number(map.get(key));
        return isFinite(n) && n >= 0 ? n : fallback;
      };
      // No fallback: these two have drifted stale before, so an unresolved
      // read shows nothing rather than a guessed number (see interface note).
      const numOrNull = (key: string): number | null => {
        const n = Number(map.get(key));
        return isFinite(n) && n >= 0 ? n : null;
      };
      const str = (key: string, fallback: string) => {
        const v = map.get(key);
        return typeof v === "string" && v.trim() ? v.trim() : fallback;
      };
      // No fallback here on purpose: an empty or missing date must hide the
      // "Last updated" line, never show a blank or a made up date.
      const strOrNull = (key: string): string | null => {
        const v = map.get(key);
        return typeof v === "string" && v.trim() ? v.trim() : null;
      };
      return {
        serviceFeeNaira: num("marketplace_service_fee_naira", 1000),
        markupPercent: num("marketplace_markup_percent", 10),
        maxDiscountPercent: numOrNull("marketplace_max_discount_percent"),
        disputeWindowDays: num("marketplace_dispute_window_days", 3),
        offerExpiryHours: numOrNull("marketplace_offer_expiry_hours"),
        returnConfirmDays: num("marketplace_return_confirm_days", 4),
        contactEmail: str("contact_email", "hello@bundledmum.ng"),
        whatsappNumber: str("whatsapp_number", "2347040667424"),
        policiesUpdatedAt: strOrNull("marketplace_policies_updated_at"),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function naira(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}
