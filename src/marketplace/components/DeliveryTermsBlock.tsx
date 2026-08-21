import { useQuery } from "@tanstack/react-query";
import { fetchListingDeliveryTerms, deliveryHeadline, deliveryDetail } from "../sell/deliveryPrefs";

/**
 * What a buyer is told about getting this item, on listing detail.
 *
 * Reads listing_delivery_terms(), never the listing columns directly: those
 * hold only the per-listing OVERRIDE, so a null there means "use the seller
 * default", not "unset". Only the RPC resolves the two correctly.
 *
 * THREE genuinely different states, and the third is the important one:
 *  - sells nationwide;
 *  - own state only;
 *  - NOT ANSWERED (is_set false), which is every one of the 180 live
 *    listings today. That case gets its own neutral treatment and says so
 *    plainly. We deliberately do not fall back to a default here: telling a
 *    buyer in Kano that a Lagos seller ships, when the seller has never said
 *    any such thing, would be the one genuinely damaging outcome.
 *
 * SAFETY: this never renders an address, and cannot — the RPC returns only
 * seller_state. "Collection" means a stranger travelling to someone's home,
 * so where they live is shared only after payment, with that one buyer, in
 * their own chat, exactly as the seller's phone number already is.
 */
export default function DeliveryTermsBlock({ listingId }: { listingId: string }) {
  const { data: terms, isLoading } = useQuery({
    queryKey: ["mkt-delivery-terms", listingId],
    queryFn: () => fetchListingDeliveryTerms(listingId),
    staleTime: 60_000,
  });

  // Nothing at all rather than a skeleton or a guess: a wrong or flickering
  // answer here is worse than a slightly later one.
  if (isLoading || !terms) return null;

  const unset = !terms.is_set;
  return (
    <div className={unset ? "mkt-delivery-terms unset" : "mkt-delivery-terms"}>
      <span className="ic" aria-hidden>{unset ? "?" : terms.sells_nationwide ? "🚚" : "📍"}</span>
      <div>
        <div className="head">{deliveryHeadline(terms)}</div>
        <div className="body">{deliveryDetail(terms)}</div>
      </div>
    </div>
  );
}
