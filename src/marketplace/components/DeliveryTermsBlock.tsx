import SellerDeliveryLine, { useDeliveryTerms } from "./SellerDeliveryLine";

/**
 * Delivery terms on listing detail.
 *
 * Rewritten against the 44a constraint: we do not know where the buyer is,
 * so this states only what the seller does and never claims an item can or
 * cannot reach anyone. When the seller has not answered it renders nothing
 * at all, rather than the "Delivery not confirmed yet, ask them before you
 * buy" block it used to show — an empty space reads as "nothing to say"
 * while that block read as a problem with the listing.
 *
 * Shares SellerDeliveryLine with the cart and checkout so the wording and
 * the state-only emphasis are identical everywhere a buyer meets them.
 */
export default function DeliveryTermsBlock({
  listingId, sellerName, area,
}: {
  listingId: string;
  sellerName?: string | null;
  area?: string | null;
}) {
  const { data: terms } = useDeliveryTerms(listingId);
  return <SellerDeliveryLine terms={terms} sellerName={sellerName} area={area} />;
}
