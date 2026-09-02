import { useQuery } from "@tanstack/react-query";
import { mdb } from "./data/mdb";

/**
 * Whether a promotional banner may appear on this listing's page.
 *
 * True only for a LIVE listing. This is the second lock on the quiz advert
 * never appearing on a sold page (§190, §197). It used to be one, and it was
 * POSITIONAL: the advert was mounted below the branch that returns
 * SoldListingPage, so the only thing keeping it off that page was the order of
 * two returns and a comment asking nobody to move them. It is a condition
 * again, so the mount can move without the advert appearing where it must not.
 *
 * IT RETURNS FALSE, NEVER NULL, for an unknown id — verified, including
 * `is null` being false rather than the value merely printing as false. That is
 * deliberate on the server side and it is the whole point: this project's
 * recurring family of bugs is an ABSENT value being read as a decision (an
 * invented `ok` field, a flag sent as undefined so it could not be turned off,
 * an RLS refusal that returned no error and no rows). A promo gate that
 * answered null for a listing that does not exist would be one more of them.
 *
 * The client still refuses to infer. `=== true` is the test, and the hook
 * defaults to false while loading and on any error, so the banner appears only
 * on a definite yes. A page that fails this call is a page with no banner,
 * never a page with a banner it should not have.
 */
export function useCanShowPromo(listingId: string | undefined): boolean {
  const { data } = useQuery({
    queryKey: ["mkt-can-show-promo", listingId],
    enabled: !!listingId,
    // A listing's status changes when it sells, which the buyer finds out at
    // checkout, not from this. Short enough to follow a sale within a session.
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await mdb.rpc("listing_can_show_promo", { p_listing_id: listingId });
      if (error) return false;
      const v = Array.isArray(data) ? data[0] : data;
      return v === true;
    },
  });
  return data === true;
}
