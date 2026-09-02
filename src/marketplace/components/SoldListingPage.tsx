import MarketplaceSeo from "./MarketplaceSeo";
import ListingVideoPlayer from "./ListingVideoPlayer";
import SameItemOtherSellers from "./SameItemOtherSellers";
import RelatedListings from "./RelatedListings";
import type { GoneListingContext } from "../lib/goneListing";

/**
 * A sold listing. The name, the video, and then what can actually be bought.
 *
 * WHY ANYONE IS HERE. Sold videos stay PUBLIC on YouTube permanently rather
 * than being unlisted on sale, so a sold item's video keeps ranking and keeps
 * sending people to this page. For many of them it is the FIRST thing they ever
 * see of BundledMum, so it is built as a landing page rather than an error
 * state: no apology, no dead end, nothing that reads as a failure.
 *
 * WHAT IS DELIBERATELY NOT HERE. No photos, no description, no price, no
 * condition, no location, and no call to action. Everything about the sold item
 * beyond its name and the video the visitor arrived from is gone, because none
 * of it is buyable and all of it competes with the part that is. The
 * ALTERNATIVES ARE THE PAGE.
 *
 * NOTHING BUYABLE EXISTS IN THIS COMPONENT. Not suppressed control by control:
 * there is no buy button, cart, offer, video request or sticky bar to suppress.
 *
 * Then the two rows, in this order. The same item from another seller when one
 * genuinely exists, which is the question a visitor from a video actually
 * arrived with, and then related items, which always fills and is therefore the
 * guarantee that this page is never a dead end.
 */
export default function SoldListingPage({ listingId, c }: { listingId: string; c: GoneListingContext }) {
  return (
    <div className="mkt-sold-page">
      {/* No price and no Product schema anywhere on a sold page: nothing here
          is purchasable, so InStock would lie to a crawler and SoldOut invites
          a rich result nobody can act on. */}
      <MarketplaceSeo
        title={`${c.title}, sold`}
        description={`${c.title} has sold on BundledMum Marketplace. See the same item from other sellers, and what else is available now.`}
        image={c.image_url || undefined}
      />

      <header className="mkt-sold-head">
        <span className="tag">Sold</span>
        <h1>{c.title}</h1>
        <p>This one has been sold. Here is what is still available.</p>
      </header>

      {/* The reason most of these visitors are here at all. Only ever set when
          youtube_status is 'ready', the same rule listing_video applies, so a
          half-uploaded video never appears. */}
      {c.youtube_video_id && (
        <div className="mkt-sold-video">
          <ListingVideoPlayer
            video={{ youtube_video_id: c.youtube_video_id, status: "ready", stopgap_path: null }}
            posterUrl={c.image_url}
          />
        </div>
      )}

      {/* The same item first, because it answers what they came for. Absent
          when there is genuinely no match, which is most items here. */}
      <SameItemOtherSellers listingId={listingId} />
      {/* Always fills, so the page is never a dead end. */}
      <RelatedListings listingId={listingId} />
    </div>
  );
}
