import { Link } from "react-router-dom";
import type { MarketplaceListing } from "../types";
import { formatNaira, locationLabel, conditionLabel, isVerifiedSeller } from "../lib/format";
import VerifiedBadge from "./VerifiedBadge";

/**
 * Browse-grid card, per the design card anatomy: photo, price, one-line title,
 * and three trust signals (verified badge when applicable, location, condition).
 * Nothing else. The whole card links to the listing detail page.
 */
export default function ListingCard({ listing }: { listing: MarketplaceListing }) {
  const verified = isVerifiedSeller(listing);
  // Availability speaks up only when there are several. A single-item listing
  // (the usual case) shows no badge, so the grid stays clean.
  const available = Number(listing.quantity ?? 1) - Number(listing.quantity_sold ?? 0);
  const showQty = Number(listing.quantity ?? 1) > 1 && available > 0;
  const qtyLabel = available === 1 ? "Last one" : `${available} available`;
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
        {showQty && <span className={available === 1 ? "mkt-card-qty low" : "mkt-card-qty"}>{qtyLabel}</span>}
      </div>
      <div className="mkt-card-body">
        <span className="mkt-price">{formatNaira(listing.final_price_naira)}</span>
        <span className="mkt-card-title">{listing.title}</span>
        <div className="mkt-trust">
          {verified ? <VerifiedBadge /> : null}
          <span className="mkt-meta">{locationLabel(listing)}</span>
          <span className="mkt-dot">·</span>
          <span className="mkt-meta">{conditionLabel(listing.condition_notes)}</span>
        </div>
      </div>
    </Link>
  );
}
