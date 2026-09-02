import { useRelatedListings } from "../relatedListings";
import ListingCard from "./ListingCard";

/**
 * Other items, at the bottom of a listing page.
 *
 * Reuses ListingCard rather than building a second card, so a related item
 * looks exactly like every other item on the site and inherits whatever the
 * card already does: the verified badge, the condition, the location, the
 * quantity badge, the public price cut, the video glyph. A hand-rolled card
 * here would drift from the real one the first time either changed, which is
 * already visible elsewhere on the site.
 *
 * RENDERS NOTHING RATHER THAN A HALF ROW. The function is designed to always
 * fill eight by widening from category to group to price, so an empty or
 * short result means something is wrong upstream, and a lone card under
 * "More items you might like" reads as a broken page rather than a thin one.
 * While loading it renders nothing at all: no skeleton, because this sits
 * below the fold under the actions and nobody is waiting on it.
 */
export default function RelatedListings({ listingId }: { listingId: string }) {
  const { data: related = [], isLoading } = useRelatedListings(listingId);

  if (isLoading || related.length === 0) return null;

  return (
    <section className="mkt-related" aria-label="More items you might like">
      <h2 className="mkt-related-h">More items you might like</h2>
      <div className="mkt-related-grid">
        {related.map((l) => <ListingCard key={l.id} listing={l} />)}
      </div>
    </section>
  );
}
