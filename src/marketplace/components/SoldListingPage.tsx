import { useState } from "react";
import { Link } from "react-router-dom";
import MarketplaceSeo from "./MarketplaceSeo";
import ListingVideoPlayer from "./ListingVideoPlayer";
import SameItemOtherSellers from "./SameItemOtherSellers";
import RelatedListings from "./RelatedListings";
import { formatNaira, conditionLabel } from "../lib/format";
import type { GoneListingContext } from "../lib/goneListing";

/**
 * A sold listing, still worth landing on.
 *
 * WHY THIS EXISTS NOW. Sold videos stay PUBLIC on YouTube permanently rather
 * than being unlisted on sale, so a sold item's video keeps ranking and keeps
 * sending people here. 52 videos are up today and that grows with every
 * seller who uploads. Those visitors were previously shown a stub with a
 * headline and four thumbnails, which is a poor answer for someone who just
 * watched a video of the thing and came to buy it.
 *
 * SO THE ITEM STAYS. Photos, the video they most likely just watched, the
 * condition and the description, exactly as they were. Someone wants to see
 * what they clicked on before being offered alternatives. That is only
 * possible because get_gone_listing_context was widened to return them: RLS
 * still refuses the sold ROW to anon, deliberately, since the raw row carries
 * price_naira, which is the seller's share and must never be public.
 *
 * NOTHING BUYABLE RENDERS. No buy button, no add to cart, no offer, no video
 * request, no sticky bar. Not by suppressing them one by one, but because this
 * is a different component that never had them.
 *
 * Then the two rows, in this order: the SAME item from another seller when one
 * genuinely exists, which is the question the visitor actually arrived with,
 * and then the general related row, which always fills and is therefore the
 * guarantee that this page is never a dead end.
 */
export default function SoldListingPage({ listingId, c }: { listingId: string; c: GoneListingContext }) {
  const images = [c.image_url, ...(c.gallery_urls ?? [])].filter(Boolean) as string[];
  const [active, setActive] = useState<string | null>(null);
  const hero = active ?? images[0] ?? null;
  const where = [c.location_city, c.location_state].filter(Boolean).join(", ");

  return (
    <div className="mkt-sold-page">
      <MarketplaceSeo
        title={`${c.title}, sold`}
        description={c.display_description || `${c.title} has sold on BundledMum Marketplace. See what else is available.`}
        image={c.image_url || undefined}
        type="product"
      />

      {/* Unmissable and first, so nobody reads the page as buyable. Matter of
          fact rather than apologetic: they came to buy something, and the
          useful thing is what is still available, not an apology. */}
      <div className="mkt-sold-banner">
        <span className="tag">Sold</span>
        <div className="txt">
          <b>This one has been sold</b>
          <span>It went for {formatNaira(c.final_price_naira)}. Everything below is still available.</span>
        </div>
      </div>

      <div className="mkt-sold-item">
        {hero && (
          <div className="mkt-sold-hero">
            <img src={hero} alt={c.title} />
          </div>
        )}
        {images.length > 1 && (
          <div className="mkt-sold-thumbs">
            {images.map((src) => (
              <button
                key={src}
                type="button"
                className={src === hero ? "on" : ""}
                onClick={() => setActive(src)}
                aria-label="Show this photo"
              >
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        <h1 className="mkt-sold-title">{c.title}</h1>
        <div className="mkt-sold-meta">
          <span className="price">{formatNaira(c.final_price_naira)}</span>
          {c.condition && <span className="dot">·</span>}
          {c.condition && <span>{conditionLabel(c.condition)}</span>}
          {where && <span className="dot">·</span>}
          {where && <span>{where}</span>}
        </div>

        {/* The reason most of these visitors are here at all. Only ever set
            when youtube_status is 'ready', the same rule listing_video applies,
            so a half-uploaded video never appears. */}
        {c.youtube_video_id && (
          <ListingVideoPlayer
            video={{ youtube_video_id: c.youtube_video_id, status: "ready", stopgap_path: null }}
            posterUrl={c.image_url}
          />
        )}

        {c.display_description && (
          <div className="mkt-sold-desc">
            <p className="mkt-section-label">About this item</p>
            <p className="mkt-detail-text">{c.display_description}</p>
          </div>
        )}
      </div>

      {/* The same item first, because it answers what they came for. Absent
          when there is genuinely no match, which is most items here. */}
      <SameItemOtherSellers listingId={listingId} />
      {/* Always fills, so the page is never a dead end. */}
      <RelatedListings listingId={listingId} />

      <div className="mkt-sold-foot">
        <Link to="/" className="mkt-secondary">Browse everything</Link>
      </div>
    </div>
  );
}
