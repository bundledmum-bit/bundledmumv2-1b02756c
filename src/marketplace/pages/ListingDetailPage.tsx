import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useListing } from "../data/useListings";
import {
  formatNaira,
  locationLabel,
  conditionLabel,
  isVerifiedSeller,
  sellerDisplayName,
  sellerTenure,
  sellerInitials,
} from "../lib/format";
import VerifiedBadge from "../components/VerifiedBadge";

/**
 * LISTING DETAIL, reskinned to the design: hero photo with back control and
 * thumbnails, price, title, tag chips, seller row, condition and description,
 * an escrow reassurance note, and a sticky Buy now bar. Public, read-only. Buy
 * now is a placeholder for this phase (reveals a "checkout coming soon" note):
 * no payment, no seller contact. All data plumbing is unchanged.
 */
export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: listing, isLoading, isError } = useListing(id);

  const [activeImage, setActiveImage] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="mkt-center">
        <BMLoadingAnimation size={160} />
      </div>
    );
  }

  // A sold-out item (last unit gone, status flipped to 'sold') is no longer
  // publicly readable, so a saved or shared link resolves here to null. Show a
  // warm "this one has gone" state with a clear route back to browse.
  if (isError || !listing) {
    return (
      <div className="mkt-center">
        <span className="mkt-st sold" style={{ marginBottom: 4 }}>Sold out</span>
        <div className="mkt-empty-title">Ah, this one has gone</div>
        <div className="mkt-empty-sub">
          It sold or was taken down. Things move fast here, especially the good ones. There is plenty more to see.
        </div>
        <button className="mkt-buy" style={{ maxWidth: 220 }} onClick={() => navigate("/")}>
          See what else is there
        </button>
      </div>
    );
  }

  const qty = Number(listing.quantity ?? 1);
  const available = qty - Number(listing.quantity_sold ?? 0);
  const multi = qty > 1;

  // Belt and braces: a live listing with no stock left (should not happen, the
  // trigger flips it to 'sold') still shows the gone state rather than a dead Buy.
  if (available <= 0) {
    return (
      <div className="mkt-center">
        <span className="mkt-st sold" style={{ marginBottom: 4 }}>Sold out</span>
        <div className="mkt-empty-title">Ah, this one has gone</div>
        <div className="mkt-empty-sub">The last one was just bought. There is plenty more to see.</div>
        <button className="mkt-buy" style={{ maxWidth: 220 }} onClick={() => navigate("/")}>See what else is there</button>
      </div>
    );
  }

  const gallery = (listing.gallery_urls ?? []).filter(Boolean);
  const images = [listing.image_url, ...gallery].filter(Boolean) as string[];
  const hero = activeImage ?? listing.image_url ?? images[0] ?? null;
  const verified = isVerifiedSeller(listing);
  const tenure = sellerTenure(listing);

  return (
    <div className="mkt-detail">
      <div className="mkt-hero">
        {hero ? <img src={hero} alt={listing.title} /> : null}
        <button className="mkt-back" onClick={() => navigate("/")} aria-label="Back to marketplace">
          ‹
        </button>
      </div>

      {images.length > 1 ? (
        <div className="mkt-thumbs">
          {images.map((url) => (
            <button
              key={url}
              className={url === hero ? "mkt-thumb active" : "mkt-thumb"}
              onClick={() => setActiveImage(url)}
              aria-label="View image"
            >
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="mkt-detail-body">
        <div>
          <div className="mkt-detail-price">{formatNaira(listing.final_price_naira)}{multi ? " each" : ""}</div>
          <h1 className="mkt-detail-title">{listing.title}</h1>
          {multi && (
            <span className={available === 1 ? "mkt-avail low" : "mkt-avail"}>{available === 1 ? "Last one" : `${available} available`}</span>
          )}
        </div>

        {multi && (
          <div className="mkt-reassure">
            <div className="mkt-reassure-tick">✓</div>
            <div className="mkt-reassure-text">
              {sellerDisplayName(listing)} has confirmed all {qty} are identical. You are buying one, at {formatNaira(listing.final_price_naira)}.
            </div>
          </div>
        )}

        <div className="mkt-tags">
          <span className="mkt-tag cond">{conditionLabel(listing.condition_notes)}</span>
          <span className="mkt-tag loc">{locationLabel(listing)}</span>
          {listing.category?.name ? (
            <span className="mkt-tag cat">{listing.category.name}</span>
          ) : null}
        </div>

        <div className="mkt-seller">
          <div className="mkt-seller-avatar">{sellerInitials(listing)}</div>
          <div className="mkt-seller-text">
            <div className="mkt-seller-name">{sellerDisplayName(listing)}</div>
            {tenure ? <div className="mkt-seller-sub">{tenure}</div> : null}
          </div>
          {verified ? <VerifiedBadge size="lg" /> : null}
        </div>

        {listing.condition_notes ? (
          <div>
            <p className="mkt-section-label">Condition notes</p>
            <p className="mkt-detail-text">{listing.condition_notes}</p>
          </div>
        ) : null}

        <div>
          <p className="mkt-section-label">Description</p>
          <p className="mkt-detail-text">{listing.description}</p>
        </div>

        <div className="mkt-reassure">
          <div className="mkt-reassure-tick">✓</div>
          <div className="mkt-reassure-text">
            Your money is held safely until you confirm the item arrived as
            described. Seller details are shared right after payment.
          </div>
        </div>
      </div>

      <div className="mkt-buybar">
        <div className="mkt-buybar-price">
          <small>{multi ? "Price each" : "Price"}</small>
          <b>{formatNaira(listing.final_price_naira)}</b>
        </div>
        <button className="mkt-buy" onClick={() => navigate(`/checkout/${listing.id}`)}>
          {multi ? "Buy one now" : "Buy now"}
        </button>
      </div>
    </div>
  );
}
