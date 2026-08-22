import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import SellerDeliveryLine, { useDeliveryTerms } from "./SellerDeliveryLine";
import { checkListingDeliverable, deliveryMessage } from "../deliverability";
import { getBuyerState, onBuyerStateChange } from "../lib/buyerState";

/**
 * Delivery on listing detail, in two modes.
 *
 * WHEN WE KNOW THE BUYER'S STATE (they have checked out before, or set it
 * on a previous order) the line is PERSONALISED: it says whether this item
 * actually reaches them, naming their state so it reads as genuinely
 * checked rather than generic. Their own first name is deliberately never
 * used — "Ngozi, Amaka will send this to you in Kano" reads like a mail
 * merge; the seller's name and their state are the personalisation that
 * matters.
 *
 * WHEN WE DO NOT, it falls back to stating only the seller's terms, which
 * is all that can honestly be said without knowing where they are.
 *
 * Either way it renders NOTHING when the seller has not set terms. That is
 * 48 of the 77 sellers with listings, so the page is built to look complete
 * without it rather than to have a hole where it should be. State is never
 * asked for here — only at checkout.
 */
export default function DeliveryTermsBlock({
  listingId, sellerName, area,
}: {
  listingId: string;
  sellerName?: string | null;
  area?: string | null;
}) {
  const { data: terms } = useDeliveryTerms(listingId);

  const [buyerState, setBuyerState] = useState<string | null>(() => getBuyerState());
  useEffect(() => onBuyerStateChange(() => setBuyerState(getBuyerState())), []);

  const { data: deliverable } = useQuery({
    queryKey: ["mkt-deliverable-one", listingId, buyerState],
    enabled: !!listingId && !!buyerState,
    staleTime: 30_000,
    queryFn: () => checkListingDeliverable(listingId, buyerState),
  });

  const personalised = deliveryMessage(deliverable, buyerState, { area });

  if (personalised) {
    const catName = deliverable?.category_name?.toLowerCase() || "items";
    const catHref = deliverable?.category_slug ? `/?category=${encodeURIComponent(deliverable.category_slug)}` : "/";
    return (
      <div className={personalised.blocked ? "mkt-delivery-terms restricted" : "mkt-delivery-terms"}>
        <span className="ic" aria-hidden>{personalised.blocked ? "📍" : "🚚"}</span>
        <div className="body">
          {personalised.text}
          {/* Browsing, not a payment about to fail: this keeps her in the
              marketplace rather than ending the visit on a no. */}
          {personalised.blocked && (
            <>
              {" "}
              <Link to={catHref} className="mkt-delivery-catlink">See other {catName}</Link>
            </>
          )}
        </div>
      </div>
    );
  }

  // Nothing known about the buyer: state the seller's terms only.
  return <SellerDeliveryLine variant="block" terms={terms} sellerName={sellerName} area={area} />;
}
