import CrossAppBanner, {
  bannerCtaStyle, useBannerDismiss, BANNER_ARROW_CLASS, BANNER_CTA_CLASS, type BannerPalette,
} from "@/components/CrossAppBanner";
import { useShowsPregnancyPromo } from "../pregnancyPromo";

/**
 * An advert for the storefront's quiz, on marketplace listing pages.
 *
 * The card is CrossAppBanner, shared with the two cross-sell banners: all three
 * send someone from the app they are in to the other one, so they are one
 * design and can no longer drift apart. Only what genuinely differs lives here.
 *
 * WHERE IT SITS, AND WHY. Directly after the buy bar comes to rest and before
 * "More items you might like". The buy bar is `position: sticky; bottom: 0` and
 * is the last child of .mkt-detail (§187), so it follows the buyer for the whole
 * purchase and then stops. That is the page marking its own boundary: above the
 * line the buyer is deciding about this item, below it the page is already about
 * other things. Placement agreed with Claude Design.
 *
 * ONE PAGE IN FOUR. useShowsPregnancyPromo asks the server whether this
 * listing's category qualifies; see that file for why the list is not here.
 * When the answer is no — 213 of 281 live listings — this renders nothing.
 *
 * NEVER ON A SOLD PAGE. A sold listing renders SoldListingPage instead of this
 * page, so the banner is never mounted there. That page was stripped to the
 * name, the video and alternatives with every call to action removed, and a
 * quiz advert would be the only CTA left on it.
 *
 * THE CTA IS AN <a>, WHICH IS WHY CrossAppBanner TAKES A NODE. The two
 * cross-sell banners are <button>s calling window.location.assign, because
 * their destination only arrives at runtime. This one is fixed, so it can be a
 * real link — openable in a new tab, right-clickable — and is still a full page
 * load, because /quiz is the storefront app tree the marketplace router must not
 * handle. Relative, so a preview build stays on its own origin rather than
 * jumping to production.
 *
 * GEOMETRY IS THIS PAGE'S, NOT THE SET'S. 1200, because the listing page's
 * column is 1200 (.mkt-related, .mkt-sellprompt) while browse's is 1240; and the
 * 16px gutter stops at 1024, where those two blocks sit flush on the column. The
 * browse banner keeps its gutter at every width. Copying either number across
 * misaligns this against the related row directly beneath it.
 */

const PALETTE: BannerPalette = {
  accent: "var(--mkt-green)",
  surface: "var(--mkt-green-light)",
  ink: "var(--mkt-green-dark)",
  accentRgb: "45,106,79",
};

// Its own key: all three banners share an origin, so a shared key would make
// dismissing one hide the others.
const DISMISS_KEY = "bm_quiz_promo_dismissed";

// Tagged so quiz traffic is separable from the browse banner's, which looks
// identical and lands in the same app.
const QUIZ_HREF = "/quiz?utm_source=marketplace&utm_medium=banner&utm_campaign=listing_quiz";

export default function PregnancyQuizBanner({ listingId }: { listingId: string }) {
  const show = useShowsPregnancyPromo(listingId);
  const [dismissed, dismiss] = useBannerDismiss(DISMISS_KEY);

  if (!show || dismissed) return null;

  return (
    <CrossAppBanner
      ariaLabel="Build your hospital delivery list on the BundledMum shop"
      palette={PALETTE}
      accent="📝"
      headline="Are you pregnant? Buy all your hospital delivery items based on your budget"
      onDismiss={dismiss}
      wrapperClassName="w-full px-4 lg:px-0"
      wrapperStyle={{
        maxWidth: 1200,
        margin: "0 auto",
        // paddingTop, NOT the padding shorthand: the shorthand also sets
        // padding-left/right to 0, and an inline style beats a class, so it
        // silently cancelled the px-4 above and the card ran edge to edge.
        paddingTop: 18,
        boxSizing: "border-box",
      }}
      cta={
        <a href={QUIZ_HREF} className={BANNER_CTA_CLASS} style={bannerCtaStyle(PALETTE)}>
          Build my list
          <span className={BANNER_ARROW_CLASS} aria-hidden>→</span>
        </a>
      }
    />
  );
}
