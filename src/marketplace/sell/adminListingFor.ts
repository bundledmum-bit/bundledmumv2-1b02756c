import { useQuery } from "@tanstack/react-query";
import { sdb } from "./sellData";
import type { SellerRow } from "./useSeller";

/**
 * Listing for a seller who asked us to, instead of as yourself.
 *
 * 133 registered sellers have never listed anything and every one of them set
 * up their bank details first, so all 133 reached "this is where your money
 * goes" and stopped at listing. The offer emailed to them is that they send us
 * their items and we put them up.
 *
 * This deliberately does NOT build a second form. The existing create flow
 * already handles the photos, the crop, the watermark, the location rules, the
 * delivery terms, the category questions and the video requirement, and every
 * one of those must still apply when an admin is doing the typing. So the flow
 * is unchanged and only the SELLER it acts for is swapped, through ?for=.
 *
 * The seller id lives in the URL rather than in state so it survives the
 * page's own navigation and a refresh mid-listing, and so it is visible: an
 * admin can see at a glance whose account they are about to post to.
 */

export const ADMIN_LISTING_FOR_PARAM = "for";

export interface ListForVerdict {
  allowed: boolean;
  reason: string;
  route: "managed" | "assisted" | "needs_consent" | "not_found";
  needs_delivery_prefs: boolean;
  /** Worded server side, shown verbatim, null when not needed. */
  delivery_warning: string | null;
}

/** Absence is blocked, never permission. An unknown id used to return no row
 * at all, and a client reading "no answer" as "no objection" would have opened
 * the gate on a typo. */
const BLOCKED: ListForVerdict = {
  allowed: false,
  reason: "We could not check this seller. Refresh and try again.",
  route: "not_found",
  needs_delivery_prefs: false,
  delivery_warning: null,
};

export interface ActingSeller {
  seller: SellerRow;
  verdict: ListForVerdict;
  /** admin_users.id of whoever is doing this, for listed_by_admin. Null if
   * the signed-in person is somehow not an admin, in which case the verdict
   * will not be allowed anyway and nothing is written. */
  adminUserId: string | null;
}

/**
 * Resolves the seller named by ?for=, and whether we may list for them.
 *
 * Returns null when no id is present, which is the ordinary case: a seller
 * listing their own item. The caller then uses their own seller row exactly as
 * before, so nothing about normal listing changes.
 */
export function useAdminListingFor(sellerId: string | null) {
  return useQuery<ActingSeller | null>({
    queryKey: ["admin-listing-for", sellerId],
    enabled: !!sellerId,
    staleTime: 30_000,
    queryFn: async (): Promise<ActingSeller | null> => {
      if (!sellerId) return null;

      const { data: v, error: vErr } = await sdb.rpc("can_admin_list_for", { p_seller_id: sellerId });
      const row = (Array.isArray(v) ? v[0] : v) as ListForVerdict | undefined;
      const verdict: ListForVerdict = vErr || !row
        ? BLOCKED
        : {
            ...row,
            // needs_consent and not_found are both blocked, whatever `allowed`
            // happens to say.
            allowed: row.allowed === true && row.route !== "not_found" && row.route !== "needs_consent",
          };

      const { data: s } = await sdb
        .from("marketplace_sellers")
        .select("id, customer_id, display_name, legal_first_name, legal_last_name, phone, bank_name, bank_account_name, bank_account_number, bank_account_verified, verification_tier, status, strike_count, outstanding_debit_naira, sells_nationwide, local_handover, delivery_prefs_set_at")
        .eq("id", sellerId)
        .maybeSingle();

      const { data: au } = await sdb
        .from("admin_users")
        .select("id")
        .eq("auth_user_id", (await sdb.auth.getUser()).data.user?.id ?? "")
        .maybeSingle();
      const adminUserId = (au as { id?: string } | null)?.id ?? null;

      // A seller row we cannot read is its own problem, and NOT a reason to
      // discard the verdict: doing that replaced an accurate "they have not
      // asked us to list for them" with a generic "we could not check", which
      // is the difference between telling an admin what to do next and
      // telling them nothing. Keep the real reason; only override `allowed`,
      // since we genuinely cannot list without the row.
      if (!s) {
        return {
          seller: null as unknown as SellerRow,
          verdict: verdict.allowed
            ? { ...verdict, allowed: false, reason: "We could not load this seller's details. Refresh and try again." }
            : verdict,
          adminUserId,
        };
      }
      return { seller: s as unknown as SellerRow, verdict, adminUserId };
    },
  });
}

/** The note recorded on anything created this way, built from the consent
 * already on file so an admin is not asked to retype it per listing. */
export function onBehalfListingNote(displayName: string | null): string {
  return `Listed by admin for ${displayName || "this seller"}, who asked us to list for them.`;
}
