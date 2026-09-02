import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * The card shared by every banner that sends someone from one BundledMum app
 * to the other.
 *
 * Three of them exist and they were three near-identical files until this was
 * extracted:
 *   - MarketplaceCrossSellBanner  storefront category/product pages -> marketplace
 *   - StorefrontCrossSellBanner   marketplace browse                -> storefront shop
 *   - PregnancyQuizBanner         marketplace listing pages         -> storefront quiz
 *
 * WHAT IS SHARED IS THE PRESENTATION ONLY: the wrapper, the card, the emoji
 * accent, the headline, the dismiss, and the arrow keyframes. Where the data
 * comes from, when to render at all, and where the CTA goes stay with each
 * caller, because those are the parts that genuinely differ.
 *
 * THE CTA IS PASSED IN AS A NODE, NOT DESCRIBED BY PROPS. Two of the three are
 * <button>s calling window.location.assign, because their destination is an
 * arbitrary destination_url that only arrives at runtime. The quiz banner is an
 * <a> with a fixed href, so it is a real link — openable in a new tab and
 * right-clickable — while still being a full page load. That is a genuine
 * behavioural difference, not an inconsistency to iron out, so this component
 * never decides which element to render. There is deliberately no `renderAs`
 * prop and no boolean choosing between them: callers build their own CTA and
 * pass `bannerCtaStyle(palette)` and the two class constants into it, so the
 * styling is shared without the element type being.
 *
 * GEOMETRY IS PER PAGE, and must stay that way. The three sit on pages with
 * different content columns — 1200 with px-4/px-10 on the storefront, 1240 with
 * a 16px gutter on marketplace browse, 1200 with the gutter stopping at 1024 on
 * a marketplace listing page. Each has been asserted equal to its OWN page's
 * neighbour at 375, 768 and 1440. That is why wrapperClassName/wrapperStyle/
 * cardClassName are passed in rather than fixed here: a single set of numbers
 * would misalign two of the three.
 */

export interface BannerPalette {
  /** CTA fill and card border. */
  accent: string;
  /** Card background. */
  surface: string;
  /** Headline and dismiss glyph. */
  ink: string;
  /** The accent as "r,g,b", for the two shadows only. A shadow needs an alpha
   * channel, and neither a hex nor a CSS variable can supply one here, so this
   * is the one value that cannot follow a token. Retune it if the accent moves. */
  accentRgb: string;
}

/** The arrow animates; put this on the glyph inside your CTA. The keyframes are
 * emitted by the component, so the class only works inside one. */
export const BANNER_ARROW_CLASS = "bm-crossapp-arrow";

/** Full width on mobile, hugging its content from md up. */
export const BANNER_CTA_CLASS = "w-full md:w-auto";

/** The pill. Spread onto whatever element the caller's CTA actually is. */
export function bannerCtaStyle(p: BannerPalette): CSSProperties {
  return {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: p.accent,
    color: "#FFFFFF",
    border: "none",
    borderRadius: 100,
    padding: "11px 18px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    boxShadow: `0 1px 4px rgba(${p.accentRgb},0.35)`,
  };
}

/**
 * Dismissal, remembered for the session.
 *
 * EVERY BANNER MUST PASS ITS OWN KEY. All three are served from the same
 * origin, so a shared key would make dismissing one hide the others.
 */
export function useBannerDismiss(key: string): [boolean, () => void] {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(key) === "1"; } catch { return false; }
  });
  const dismiss = () => {
    try { sessionStorage.setItem(key, "1"); } catch { /* private mode — just hide */ }
    setDismissed(true);
  };
  return [dismissed, dismiss];
}

export default function CrossAppBanner({
  ariaLabel, palette, accent, headline, cta, onDismiss,
  wrapperClassName, wrapperStyle, cardClassName,
}: {
  ariaLabel: string;
  palette: BannerPalette;
  /** One emoji, saying what is on the other side. No <img>: these are read on
   * paid Nigerian mobile data and the banners carry no image files at all. */
  accent: string;
  headline: string;
  cta: ReactNode;
  onDismiss: () => void;
  wrapperClassName?: string;
  wrapperStyle?: CSSProperties;
  cardClassName?: string;
}) {
  return (
    <div role="complementary" aria-label={ariaLabel} className={wrapperClassName} style={wrapperStyle}>
      {/* Scoped keyframes; disabled under prefers-reduced-motion. A CSS
          animation downloads nothing, which is why it does not breach the
          no-decorative-payload rule these banners are built to. */}
      <style>{`
        @keyframes bmCrossAppArrow { 0%,100% { transform: translateX(0); } 50% { transform: translateX(4px); } }
        .${BANNER_ARROW_CLASS} { display: inline-block; animation: bmCrossAppArrow 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .${BANNER_ARROW_CLASS} { animation: none; }
        }
      `}</style>

      <div
        className={`${cardClassName ? `${cardClassName} ` : ""}flex flex-col md:flex-row md:items-center gap-3 md:gap-4`}
        style={{
          position: "relative",
          background: palette.surface,
          border: `1.5px solid ${palette.accent}`,
          borderRadius: 16,
          boxShadow: `0 2px 14px rgba(${palette.accentRgb},0.16)`,
          padding: "14px 16px",
          fontFamily: "'Nunito', system-ui, -apple-system, Arial, sans-serif",
        }}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-7 md:pr-0">
          <span aria-hidden style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{accent}</span>
          <p style={{ margin: 0, minWidth: 0, color: palette.ink, fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>
            {headline}
          </p>
        </div>

        {cta}

        <button
          type="button"
          onClick={onDismiss}
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
            color: palette.ink,
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
