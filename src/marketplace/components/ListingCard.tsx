import { Link } from "react-router-dom";
import type { MarketplaceListing } from "../types";
import { formatNaira, locationLabel, conditionLabel, isVerifiedSeller } from "../lib/format";
import VerifiedBadge from "./VerifiedBadge";

/**
 * Browse-grid card. Image-forward, minimal: image, price, one-line title, and
 * three trust signals (verified badge when applicable, location, condition).
 * The whole card links to the listing detail page.
 */
export default function ListingCard({ listing }: { listing: MarketplaceListing }) {
  const verified = isVerifiedSeller(listing);
  return (
    <Link className="mkt-card" to={`/listing/${listing.id}`}>
      <div className="mkt-card-imgwrap">
        {listing.image_url ? (
          <img
            className="mkt-card-img"
            src={listing.image_url}
            alt={listing.title}
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="mkt-card-body">
        <span className="mkt-price">{formatNaira(listing.final_price_naira)}</span>
        <span className="mkt-card-title">{listing.title}</span>
        <div className="mkt-trust">
          {verified ? <VerifiedBadge /> : null}
          <span className="mkt-condition">{conditionLabel(listing.condition_notes)}</span>
          <span className="mkt-meta">{locationLabel(listing)}</span>
        </div>
      </div>
    </Link>
  );
}
