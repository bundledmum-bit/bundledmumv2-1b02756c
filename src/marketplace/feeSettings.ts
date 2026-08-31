import { useQuery } from "@tanstack/react-query";
import { mdb } from "./data/mdb";

/**
 * The five numbers that define the service fee, from the one function that
 * owns them.
 *
 * The fee is 8% of the item price with a floor, and TWO caps: a lower cap up
 * to a threshold price and a higher one above it. There is a deliberate cliff
 * at the threshold, and buyers are not told about the cliff, but they ARE told
 * both caps, because a sentence saying "never more than the lower cap" is
 * simply false for anyone buying above the threshold.
 *
 * NOTHING HERE IS HARDCODED and nothing may be. All five change, and all five
 * have changed twice already: a flat fee became a percentage in §172, and the
 * single cap became two caps here. Every literal that has ever been typed into
 * this codebase for this fee has gone stale, which is why every sentence is
 * now built from these values rather than written.
 *
 * NEVER COMPUTE THE FEE FROM THESE. marketplace_service_fee() is the single
 * place the rule lives and is what both order paths actually charge from.
 * These exist only so a page can STATE the rule and an admin preview can label
 * it. A frontend reimplementation would drift from what is charged, which is
 * the failure mode that produced the ₦750-when-it-was-₦1,000 bug.
 */
export interface FeeSettings {
  percent: number;
  minNaira: number;
  /** The cap for items up to and including tierNaira. */
  maxNaira: number;
  /** The price that separates the two caps. */
  tierNaira: number;
  /** The cap for items above tierNaira. */
  maxHighNaira: number;
}

/**
 * Null until it resolves, and null on failure, deliberately.
 *
 * No numeric fallbacks. A fallback that matches today's value just resets the
 * same drift for next time, and a policy page stating a fee we do not charge
 * is worse than one that stays quiet for a moment. Every caller words around
 * null rather than guessing.
 */
export function useFeeSettings() {
  return useQuery<FeeSettings | null>({
    queryKey: ["mkt-fee-settings"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FeeSettings | null> => {
      const { data, error } = await mdb.rpc("marketplace_fee_settings");
      if (error || !data) return null;
      const r = data as Record<string, unknown>;
      const n = (k: string): number | null => {
        const v = Number(r[k]);
        return isFinite(v) && v >= 0 ? v : null;
      };
      const percent = n("percent"), minNaira = n("min_naira"), maxNaira = n("max_naira");
      const tierNaira = n("tier_naira"), maxHighNaira = n("max_high_naira");
      // All five or none. A half-resolved fee cannot be described honestly,
      // and picking which half to state is exactly how a wrong number ships.
      if (percent == null || minNaira == null || maxNaira == null || tierNaira == null || maxHighNaira == null) return null;
      return { percent, minNaira, maxNaira, tierNaira, maxHighNaira };
    },
  });
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

/**
 * The one sentence describing the fee, built from the settings, used wherever
 * the fee is explained.
 *
 * Written once so the FAQ, the Terms and anywhere else cannot drift apart, and
 * so a change to the structure is a change in one place. States both caps and
 * the price between them plainly, then stops: the cliff itself is not
 * dramatised, because a buyer does not need it explained, but nor is either
 * cap hidden from the people it applies to.
 */
export function feeRuleSentence(f: FeeSettings): string {
  return `${f.percent}% of the order total, never less than ${naira(f.minNaira)}. `
    + `It is capped at ${naira(f.maxNaira)} on totals up to ${naira(f.tierNaira)}, `
    + `and at ${naira(f.maxHighNaira)} above that.`;
}

/**
 * The ONE fee for a whole cart, from the server.
 *
 * The fee moved from per item to once per order, on the ORDER TOTAL. A cart
 * still creates one order per listing and the entire fee sits on the FIRST
 * one, zero on the rest, because splitting it would round badly and make each
 * row's platform_share wrong. So NEVER sum service_fee_naira across a cart's
 * orders for display: ask for the cart's fee instead.
 *
 * Priced by marketplace_cart_service_fee, so the number shown before an order
 * exists is the number the order will carry.
 */
export function useCartServiceFee(listingIds: string[]) {
  const key = [...listingIds].sort().join(",");
  return useQuery<number | null>({
    queryKey: ["mkt-cart-service-fee", key],
    enabled: listingIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await mdb.rpc("marketplace_cart_service_fee", { p_listing_ids: listingIds });
      if (error) return null;
      const n = Number(data);
      return isFinite(n) ? n : null;
    },
  });
}
