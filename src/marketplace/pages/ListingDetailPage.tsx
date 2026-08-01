import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useListing } from "../data/useListings";
import { formatNaira, locationLabel, isVerifiedSeller } from "../lib/format";
import VerifiedBadge from "../components/VerifiedBadge";

/**
 * LISTING DETAIL. Public, read-only. Buy now is a placeholder for this phase:
 * it reveals a "checkout coming soon" note. No payment, no seller contact.
 */
export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: listing, isLoading, isError } = useListing(id);

  // The main image plus any gallery images, so the hero can switch on thumb tap.
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
        <button className="mkt-back" onClick={() => navigate("/")}>
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
    <div className="mkt-shell">
      <button className="mkt-back" onClick={() => navigate("/")}>
        ← Back to marketplace
      </button>

      <div className="mkt-detail">
        <div className="mkt-detail-hero">
          {hero ? <img src={hero} alt={listing.title} /> : null}
        </div>

        {images.length > 1 ? (
          <div className="mkt-thumbs">
            {images.map((url) => (
              <button
                key={url}
                className="mkt-thumb"
                onClick={() => setActiveImage(url)}
                aria-label="View image"
              >
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        ) : null}

        <h1>{listing.title}</h1>
        <div className="mkt-detail-price">{formatNaira(listing.final_price_naira)}</div>

        <div className="mkt-detail-meta">
          {listing.category?.name ? <span>{listing.category.name}</span> : null}
          <span>{locationLabel(listing)}</span>
        </div>

        <div className="mkt-seller-line">
          {verified ? (
            <>
              <VerifiedBadge />
              <span>Seller checked by BundledMum</span>
            </>
          ) : (
            <span>BundledMum seller</span>
          )}
        </div>

        {listing.condition_notes ? (
          <div>
            <p className="mkt-section-label">Condition</p>
            <p className="mkt-detail-text">{listing.condition_notes}</p>
          </div>
        ) : null}

        <div>
          <p className="mkt-section-label">Description</p>
          <p className="mkt-detail-text">{listing.description}</p>
        </div>

        <div>
          <button className="mkt-buy" onClick={() => setShowBuyNote(true)}>
            Buy now
          </button>
          {showBuyNote ? (
            <div className="mkt-buy-note" role="status">
              Checkout is coming soon. Secure buying opens shortly, thank you for
              your patience.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
