import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useListing } from "../data/useListings";
import { formatNaira, locationLabel, conditionLabel, isVerifiedSeller } from "../lib/format";
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
  const [showBuyNote, setShowBuyNote] = useState(false);

  if (isLoading) {
    return (
      <div className="mkt-center">
        <BMLoadingAnimation size={160} />
      </div>
    );
  }

  if (isError || !listing) {
    return (
      <div className="mkt-center">
        <div className="mkt-empty-title">This listing is not available</div>
        <div className="mkt-empty-sub">
          It may have sold or been taken down. Browse other items instead.
        </div>
        <button className="mkt-buy" style={{ maxWidth: 220 }} onClick={() => navigate("/")}>
          Back to marketplace
        </button>
      </div>
    );
  }

  const gallery = (listing.gallery_urls ?? []).filter(Boolean);
  const images = [listing.image_url, ...gallery].filter(Boolean) as string[];
  const hero = activeImage ?? listing.image_url ?? images[0] ?? null;
  const verified = isVerifiedSeller(listing);

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
          <div className="mkt-detail-price">{formatNaira(listing.final_price_naira)}</div>
          <h1 className="mkt-detail-title">{listing.title}</h1>
        </div>

        <div className="mkt-tags">
          <span className="mkt-tag cond">{conditionLabel(listing.condition_notes)}</span>
          <span className="mkt-tag loc">{locationLabel(listing)}</span>
          {listing.category?.name ? (
            <span className="mkt-tag cat">{listing.category.name}</span>
          ) : null}
        </div>

        <div className="mkt-seller">
          <div className="mkt-seller-avatar">BM</div>
          <div className="mkt-seller-text">
            <div className="mkt-seller-name">BundledMum seller</div>
            <div className="mkt-seller-sub">
              {verified ? "Seller checked by BundledMum" : "Selling on BundledMum"}
            </div>
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

      {showBuyNote ? (
        <div className="mkt-buy-note" role="status">
          Checkout is coming soon. Secure buying opens shortly, thank you for your
          patience.
        </div>
      ) : null}

      <div className="mkt-buybar">
        <div className="mkt-buybar-price">
          <small>Price</small>
          <b>{formatNaira(listing.final_price_naira)}</b>
        </div>
        <button className="mkt-buy" onClick={() => setShowBuyNote(true)}>
          Buy now
        </button>
      </div>
    </div>
  );
}
