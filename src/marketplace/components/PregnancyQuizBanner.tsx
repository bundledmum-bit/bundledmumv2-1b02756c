import { useState } from "react";
import { useShowsPregnancyPromo } from "../pregnancyPromo";

/**
 * An advert for the storefront's quiz, on marketplace listing pages.
 *
 * SAME DESIGN AS THE CROSS-SELL BANNERS, deliberately. This is the third of a
 * set — StorefrontCrossSellBanner (marketplace browse to the shop) and the
 * storefront's own MarketplaceCrossSellBanner (shop to the marketplace) are the
 * other two — and all three do the same job: send someone from the app they are
 * in to the other one. So they are the same self-contained rounded card, the
 * same emoji accent, the same pill CTA with the same animated arrow, the same
 * dismiss. If you restyle one, restyle all three.
 *
 * The three files are now near-identical apart from their data source. They are
 * a good candidate for one shared presentational component; that was NOT done
 * here only because the other two are being edited in parallel and a refactor
 * would have collided with that work.
 *
 * WHERE IT SITS, AND WHY. Directly after the buy bar comes to rest and before
 * "More items you might like". The buy bar is `position: sticky; bottom: 0` and
 * is the last child of .mkt-detail (§187), so it follows the buyer for the whole
 * purchase and then stops. That is the page marking its own boundary: above the
 * line the buyer is deciding about this item, below it the page is already about
 * other things. Placement agreed with Claude Design.
 *
 * WIDTH IS 1200, NOT THE 1240 THE BROWSE BANNER USES. The two live on pages
 * with different content columns: browse is capped at 1240 with a 16px gutter,
 * the listing page at 1200 (.mkt-related, .mkt-sellprompt). Copying the browse
 * banner's number across would put this out of line with the related row
 * directly beneath it. This is the one measurement the set must NOT share.
 *
 * The 16px gutter also stops at 1024, where .mkt-related and .mkt-sellprompt
 * lose theirs and sit flush on the 1200 column. The browse banner keeps its
 * gutter at every width because browse's column is 1240 WITH one. Same design,
 * two different pages, and the padding has to follow the page it is on: with a
 * gutter at desktop this card sat 16px inside the related row directly below
 * it, measured at 134 against 118.
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
 * STILL NO IMAGE, and the animated arrow does not contradict that. The §191
 * "static" rule was about DATA — buyers are on paid Nigerian mobile data and a
 * decorative GIF costs them money. A CSS keyframe downloads nothing, and it is
 * gated on prefers-reduced-motion. There is still no img, svg or video here.
 *
 * GREEN, NEVER CORAL, unchanged from §191: the sell prompt below is a solid
 * coral block and a coral advert here would merge with it. Green also matches
 * the browse banner, which is right — both point at the storefront.
 *
 * The CTA is an <a>, not the <button> the cross-sell banners use. They navigate
 * to an arbitrary destination_url that only arrives at runtime; this one has a
 * fixed destination, so it can be a real link — openable in a new tab and
 * right-clickable — while still being a full page load, because /quiz is the
 * storefront app tree the marketplace router must not handle. Relative, so a
 * preview build stays on its own origin instead of jumping to production.
 */

// Marketplace green tokens, matching StorefrontCrossSellBanner. The shadow
// stays literal rgba because a shadow needs an alpha channel and no token
// carries one; it is --mkt-green at low opacity.
const GREEN = "var(--mkt-green)";
const GREEN_LIGHT = "var(--mkt-green-light)";
const GREEN_DARK = "var(--mkt-green-dark)";

// Its OWN key. The other two banners use bm_marketplace_xsell_dismissed and
// bm_storefront_xsell_dismissed, and all three are served from the same origin,
// so sharing a key would make dismissing one hide the others.
const DISMISS_KEY = "bm_quiz_promo_dismissed";

// Tagged so quiz traffic from here is separable from the browse banner's, which
// now looks identical and lands in the same app.
const QUIZ_HREF = "/quiz?utm_source=marketplace&utm_medium=banner&utm_campaign=listing_quiz";

export default function PregnancyQuizBanner({ listingId }: { listingId: string }) {
  const show = useShowsPregnancyPromo(listingId);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  if (!show || dismissed) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode — just hide */ }
    setDismissed(true);
  };

  return (
    <div
      role="complementary"
      aria-label="Build your hospital delivery list on the BundledMum shop"
      className="w-full px-4 lg:px-0"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        // paddingTop, NOT the padding shorthand: the shorthand also sets
        // padding-left/right to 0, and an inline style beats a class, so it
        // silently cancelled the px-4 below and the card ran edge to edge.
        paddingTop: 18,
        boxSizing: "border-box",
      }}
    >
      {/* Scoped keyframes; disabled under prefers-reduced-motion. */}
      <style>{`
        @keyframes bmQuizArrow { 0%,100% { transform: translateX(0); } 50% { transform: translateX(4px); } }
        .bm-quiz-arrow { display: inline-block; animation: bmQuizArrow 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .bm-quiz-arrow { animation: none; }
        }
      `}</style>

      <div
        className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4"
        style={{
          position: "relative",
          background: GREEN_LIGHT,
          border: `1.5px solid ${GREEN}`,
          borderRadius: 16,
          boxShadow: "0 2px 14px rgba(45,106,79,0.16)",
          padding: "14px 16px",
          fontFamily: "'Nunito', system-ui, -apple-system, Arial, sans-serif",
        }}
      >
        {/* A checklist, because what the quiz actually produces is a list. */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-7 md:pr-0">
          <span aria-hidden style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>📝</span>
          <p
            style={{
              margin: 0,
              minWidth: 0,
              color: GREEN_DARK,
              fontWeight: 800,
              fontSize: 14,
              lineHeight: 1.3,
            }}
          >
            Are you pregnant? Buy all your hospital delivery items based on your budget
          </p>
        </div>

        <a
          href={QUIZ_HREF}
          className="w-full md:w-auto"
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: GREEN,
            color: "#FFFFFF",
            border: "none",
            borderRadius: 100,
            padding: "11px 18px",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            whiteSpace: "nowrap",
            textDecoration: "none",
            boxShadow: "0 1px 4px rgba(45,106,79,0.35)",
          }}
        >
          Build my list
          <span className="bm-quiz-arrow" aria-hidden>→</span>
        </a>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute md:static top-2.5 right-2.5"
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            background: "transparent",
            border: "none",
            color: GREEN_DARK,
            fontSize: 18,
            lineHeight: 1,
            fontWeight: 700,
            cursor: "pointer",
            padding: 0,
            opacity: 0.7,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
