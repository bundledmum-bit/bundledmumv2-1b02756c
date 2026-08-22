import { useQuery } from "@tanstack/react-query";
import { fetchListingDeliveryTerms, deliveryLine, isStateOnly, type DeliveryTerms } from "../sell/deliveryPrefs";

/**
 * One seller's delivery terms, as a single line. The same component and the
 * same sentences on listing detail, in the cart and at checkout, so a buyer
 * never meets two different treatments of the same fact (design 44a).
 *
 * States ONLY what the seller does. Never whether it reaches the buyer: we
 * do not know where they are, since checkout collects no address.
 *
 * Renders NOTHING when the seller has not answered — no default, no
 * caveat, no placeholder, no skeleton. That is the common case (178 of 181
 * listings), so the surrounding card is built to look complete without this
 * line rather than to have a hole where it should be.
 *
 * Never an address: area and state only, both already public.
 */
export function useDeliveryTerms(listingId: string | undefined) {
  return useQuery({
    queryKey: ["mkt-delivery-terms", listingId],
    enabled: !!listingId,
    staleTime: 60_000,
    queryFn: () => fetchListingDeliveryTerms(listingId as string),
  });
}

export default function SellerDeliveryLine({
  terms, sellerName, area, size = "md",
}: {
  terms: DeliveryTerms | null | undefined;
  sellerName?: string | null;
  area?: string | null;
  size?: "sm" | "md";
}) {
  if (!terms) return null;
  const line = deliveryLine(terms, { sellerName, area });
  if (!line) return null; // unset: nothing at all, deliberately
  const restricted = isStateOnly(terms);
  return (
    <div className={`mkt-delivery-line${restricted ? " restricted" : ""}${size === "sm" ? " sm" : ""}`}>
      <span className="ic" aria-hidden>{restricted ? "📍" : "🚚"}</span>
      <span className="txt">{line}</span>
    </div>
  );
}
