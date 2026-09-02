import { useSameItemOtherSellers } from "../sameItemOtherSellers";
import ListingCard from "./ListingCard";

/**
 * The same item, still for sale, from someone else.
 *
 * Sits ABOVE the general related row on a sold page, because it answers the
 * question the visitor actually arrived with. Someone who followed a YouTube
 * video of a baby bouncer wants a baby bouncer, not something adjacent.
 *
 * RENDERS NOTHING WHEN THERE IS NOTHING. Most items here are one of a kind, so
 * this row is absent roughly a fifth of the time and that is correct. It is
 * never padded out with near misses: a row promising the same item and holding
 * something else is worse than no row, and the related row below is the
 * guarantee that the page is never a dead end.
 */
export default function SameItemOtherSellers({ listingId }: { listingId: string }) {
  const { data: items = [], isLoading } = useSameItemOtherSellers(listingId);

  if (isLoading || items.length === 0) return null;

  return (
    <section className="mkt-sameitem" aria-label="The same item from other sellers">
      <h2 className="mkt-sameitem-h">
        {items.length === 1 ? "Another seller has this one" : "Other sellers have this one"}
      </h2>
      <div className="mkt-sameitem-grid">
        {items.map((l) => <ListingCard key={l.id} listing={l} />)}
      </div>
    </section>
  );
}
