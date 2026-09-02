import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cross-sell banner shown at the TOP of a storefront category page (immediately
 * after the header, before the listing) that points shoppers at the SAME
 * category on the secondhand marketplace — so people browsing new items discover
 * the cheaper used ones.
 *
 * All mapping/fallback/copy decisions live in the DB: `get_marketplace_crosssell`
 * takes the storefront subcategory slug and returns { destination_url, headline,
 * has_category }. This component hardcodes NO mapping, NO category list and NO
 * copy — it renders exactly what the RPC returns, or nothing at all.
 *
 * - Fires no pixel events.
 * - Never blocks or delays the page (fire-and-forget; renders null until/unless
 *   a row resolves; renders null on any error or empty result).
 * - Crossing to the marketplace is a FULL-PAGE navigation (window.location.assign)
 *   because the marketplace is a separate app tree chosen from window.location at
 *   mount — a client route would leave it unmounted.
 * - Dismissible, remembered in sessionStorage for the whole session so it never
 *   nags again until the tab is closed.
 */

// Marketplace palette (deliberately distinct from the storefront's green).
const CORAL = "#F4845F";
const CORAL_LIGHT = "#FDE8DF";
const CORAL_DARK = "#D4613C";
const INK = "#1A1A1A";

const DISMISS_KEY = "bm_marketplace_xsell_dismissed";

type CrossSell = {
  destination_url: string;
  headline: string;
  has_category: boolean;
  live_count?: number;
};

export default function MarketplaceCrossSellBanner({ subcategory }: { subcategory: string }) {
  const [data, setData] = useState<CrossSell | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!subcategory || dismissed) return;
    let cancelled = false;
    // Fire-and-forget: the page never waits on this.
    (supabase as any)
      .rpc("get_marketplace_crosssell", { p_subcategory: subcategory })
      .then(
        ({ data: rows, error }: { data: unknown; error: unknown }) => {
          if (cancelled || error) return;
          // The RPC returns a single row; supabase-js gives an array for a
          // set-returning function. Accept either shape defensively.
          const row = Array.isArray(rows) ? rows[0] : rows;
          if (row && typeof row.destination_url === "string" && typeof row.headline === "string") {
            setData(row as CrossSell);
          }
        },
        () => { /* ignore — render nothing on failure */ },
      );
    return () => { cancelled = true; };
  }, [subcategory, dismissed]);

  if (dismissed || !data) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode — just hide */ }
    setDismissed(true);
  };

  const go = () => {
    // Tag the crossing for internal attribution (source=storefront, medium=banner)
    // then FULL-PAGE navigate into the separate marketplace app tree. Built with
    // URL so an existing query string / hash on the destination is preserved and
    // the params are de-duplicated; falls back to the raw URL if parsing fails.
    let target = data.destination_url;
    try {
      const u = new URL(data.destination_url, window.location.origin);
      u.searchParams.set("utm_source", "storefront");
      u.searchParams.set("utm_medium", "banner");
      // Campaign names WHICH banner this was, matching the two on the
      // marketplace side (browse_crosssell, listing_quiz). Source alone already
      // separates this one, but naming it keeps every crossing readable in a
      // report without knowing which app each source belongs to.
      u.searchParams.set("utm_campaign", "shop_crosssell");
      target = u.pathname + u.search + u.hash;
    } catch {
      /* keep the raw destination_url */
    }
    window.location.assign(target);
  };

  // Make the promise concrete with the live listing count when we have one.
  // If it's 0 or missing, fall back to the plain wording rather than showing
  // a zero ("See 0 used items" would read as broken).
  const liveCount = Math.trunc(Number(data.live_count) || 0);
  const ctaText =
    liveCount > 0
      ? data.has_category
        ? `See ${liveCount} used items`
        : `Browse ${liveCount} used items`
      : data.has_category
        ? "Shop used"
        : "Click here";

  return (
    // Full-width wrapper so the banner sits in its own row (with breathing room
    // above the listing), but the banner itself is a self-contained CARD aligned
    // to the product-grid width — so it reads as a distinct standalone banner,
    // not a strip glued to the header.
    <div
      role="complementary"
      aria-label="Also available used on the BundledMum marketplace"
      className="w-full px-4 md:px-10 pt-4 md:pt-5"
    >
      {/* Scoped keyframes; disabled under prefers-reduced-motion. */}
      <style>{`
        @keyframes bmXsellArrow { 0%,100% { transform: translateX(0); } 50% { transform: translateX(4px); } }
        .bm-xsell-arrow { display: inline-block; animation: bmXsellArrow 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .bm-xsell-arrow { animation: none; }
        }
      `}</style>

      <div
        className="max-w-[1200px] mx-auto flex flex-col md:flex-row md:items-center gap-3 md:gap-4"
        style={{
          position: "relative",
          background: CORAL_LIGHT,
          border: `1.5px solid ${CORAL}`,
          borderRadius: 16,
          boxShadow: "0 2px 14px rgba(212,97,60,0.16)",
          padding: "14px 16px",
          fontFamily: "'Nunito', system-ui, -apple-system, Arial, sans-serif",
        }}
      >
        {/* Headline block: recycle accent + copy. The recycle mark signals
            "used" and gives the banner its own identity (not ad chrome). */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-7 md:pr-0">
          <span aria-hidden style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>♻️</span>
          <p
            style={{
              margin: 0,
              minWidth: 0,
              color: CORAL_DARK,
              fontWeight: 800,
              fontSize: 14,
              lineHeight: 1.3,
            }}
          >
            {data.headline}
          </p>
        </div>

        <button
          type="button"
          onClick={go}
          className="w-full md:w-auto"
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: CORAL,
            color: "#FFFFFF",
            border: "none",
            borderRadius: 100,
            padding: "11px 18px",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            whiteSpace: "nowrap",
            boxShadow: "0 1px 4px rgba(212,97,60,0.35)",
          }}
        >
          {ctaText}
          <span className="bm-xsell-arrow" aria-hidden>→</span>
        </button>

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
            color: CORAL_DARK,
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
