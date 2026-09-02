import { useShowsPregnancyPromo } from "../pregnancyPromo";

/**
 * An advert for the storefront's quiz, on marketplace listing pages.
 *
 * WHERE IT SITS, AND WHY. Directly after the buy bar comes to rest and before
 * "More items you might like". The buy bar is `position: sticky; bottom: 0`
 * and follows the buyer for the whole purchase, then stops, because it is the
 * last thing inside .mkt-detail. That is the page marking its own boundary:
 * above the line the buyer is deciding about this item, below it the page is
 * already about other things. An advert above that line would interrupt a
 * purchase to sell a different one, which on a marketplace with five sales is
 * the worst outcome available. Placement agreed with Claude Design.
 *
 * ONE PAGE IN FOUR. useShowsPregnancyPromo asks the server whether this
 * listing's category qualifies; see that file for why the list is not here.
 * When the answer is no — which is 213 of 281 live listings — this renders
 * nothing at all: no spacing, no rule, no empty box.
 *
 * NEVER ON A SOLD PAGE. A sold listing renders SoldListingPage instead of
 * this page, so the banner is never mounted there. That page was stripped to
 * the name, the video and alternatives with every call to action removed, and
 * a quiz advert would be the only CTA left on it.
 *
 * IN FLOW, NOT FLOATING. The bottom strip already has the buy bar, the install
 * prompt and the WhatsApp prompt competing for it. This is a fourth thing that
 * deliberately does not join that fight.
 *
 * STATIC. No animation, no GIF, no image at all: buyers are on Nigerian mobile
 * data, where a decorative loop costs them real money. The whole advert is
 * text and one arrow glyph.
 *
 * GREEN, NEVER CORAL. The sell prompt immediately below is a solid coral
 * block. A coral advert here would merge with it into one undifferentiated
 * mass of things asking the buyer for something.
 *
 * The eyebrow is what makes it read as an advert rather than as another
 * reassurance block: green-light is also the delivery and protection colour,
 * but those sit inside the panel above the buy bar and never name a
 * destination or carry an arrow.
 *
 * A plain <a> to a same-origin path, so it is a real link (openable in a new
 * tab, right-clickable) and a full page load — /quiz is the storefront app
 * tree, which the marketplace router must not try to handle. Relative rather
 * than the absolute https://bundledmum.com/quiz so a preview build stays on
 * the origin it is served from instead of jumping to production.
 */
export default function PregnancyQuizBanner({ listingId }: { listingId: string }) {
  const show = useShowsPregnancyPromo(listingId);
  if (!show) return null;

  return (
    <a className="mkt-quizad" href="/quiz">
      <span className="mkt-quizad-text">
        <span className="eyebrow">From the BundledMum shop</span>
        <span className="line">
          <b>Are you pregnant?</b> Buy all your hospital delivery items based on your budget
        </span>
      </span>
      <span className="mkt-quizad-go" aria-hidden="true">→</span>
    </a>
  );
}
