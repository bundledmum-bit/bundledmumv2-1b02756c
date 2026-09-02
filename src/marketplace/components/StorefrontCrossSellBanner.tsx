import { useEffect, useState } from "react";
import CrossAppBanner, {
  bannerCtaStyle, useBannerDismiss, BANNER_ARROW_CLASS, BANNER_CTA_CLASS, type BannerPalette,
} from "@/components/CrossAppBanner";
import { mdb } from "../data/mdb";

/**
 * Cross-sell banner at the top of the marketplace listing grid that points a
 * shopper at the SAME category on the storefront — so someone browsing used
 * items can jump to buying it new.
 *
 * The exact counterpart of the storefront's MarketplaceCrossSellBanner
 * (src/components/shop/MarketplaceCrossSellBanner.tsx), mirrored deliberately:
 * same card, same layout, same arrow motion, same dismiss, same CTA pattern.
 * Only four things differ — the palette, the RPC, the dismiss key and the CTA
 * label. If you change one of them, change the other file too or the pair
 * stops reading as one system.
 *
 * PALETTE IS THE STOREFRONT'S GREEN, not the marketplace's coral, on the same
 * principle as the mirror: a cross-sell banner should look like where it is
 * GOING, not like the app it is sitting in. The storefront banner is coral
 * against a green storefront; this one is green against a coral marketplace.
 *
 * BUT NOT DIRECTLY UNDER THE HEADER. On browse, .mkt-topbar is a solid
 * #2D6A4F block 195px tall — the very green this banner is built from — so
 * mounted "immediately after the header" the card would sit flush beneath a
 * slab of its own colour and disappear. It is mounted below the filter bar and
 * the applied chips instead, directly above the grid, which is the same
 * position in the reading order (after the controls, before the listing) with
 * ~90px of cream and two rows of controls separating it from the green.
 *
 * ONLY WHEN A CATEGORY IS ACTUALLY SELECTED. The marketplace has no category
 * ROUTES — browse is one page and the category is a filter — so the caller
 * passes a slug only when one is applied, and this renders nothing on
 * unfiltered browse. That keeps it off the "non-category pages" the brief
 * excludes without needing a route to hang it on.
 *
 * WIDTH IS THE MARKETPLACE'S, not the storefront banner's 1200px. Browse is
 * capped at 1240 with a 16px gutter, so the wrapper below uses those values:
 * the card's left edge lands on the filter panel and its right edge on the
 * grid's right edge. Copying the 1200 across left it 20px inside everything
 * around it, which is the one measurement that must NOT be mirrored.
 *
 * All mapping, fallback and copy live in get_storefront_crosssell. This
 * component hardcodes NO category mapping and NO headline — it renders what
 * the RPC returns, or nothing at all. Renders nothing on error, on an empty
 * result, and while loading, so a missing or failing RPC is a page with no
 * banner rather than a broken one.
 */

/* The MARKETPLACE's own green tokens, not literal hexes and not the
 * storefront's. This banner lives on marketplace pages, so it should match its
 * surroundings; green already reads as "the other side" here because
 * everything else on browse that matters is coral. Tracking the tokens means a
 * palette change moves this with it — the earlier literals happened to be
 * right for --mkt-green but not for --mkt-green-dark (#1A4A33, not #1E5C44).
 *
 * The two box-shadows below stay literal rgba: a shadow needs an alpha channel
 * and there is no token carrying one. They are --mkt-green at low opacity, so
 * if that token is ever retuned, retune them with it. */
const PALETTE: BannerPalette = {
  accent: "var(--mkt-green)",
  surface: "var(--mkt-green-light)",
  ink: "var(--mkt-green-dark)",
  // The one value that cannot follow a token: a shadow needs an alpha channel.
  accentRgb: "45,106,79",
};

const DISMISS_KEY = "bm_storefront_xsell_dismissed";

type CrossSell = {
  destination_url: string;
  headline: string;
  has_category: boolean;
  /** Optional, and optional on purpose: the RPC does not exist yet, so this
   * degrades to the plain wording rather than requiring a shape nobody has
   * committed to. Mirrors the storefront banner, which added it in c4d0266. */
  live_count?: number;
};

export default function StorefrontCrossSellBanner({ category }: { category: string }) {
  const [data, setData] = useState<CrossSell | null>(null);
  const [dismissed, dismiss] = useBannerDismiss(DISMISS_KEY);

  useEffect(() => {
    if (!category || dismissed) return;
    let cancelled = false;
    // Fire-and-forget: the listing grid never waits on this.
    (mdb as any)
      .rpc("get_storefront_crosssell", { p_category: category })
      .then(
        ({ data: rows, error }: { data: unknown; error: unknown }) => {
          if (cancelled || error) return;
          // Set-returning function: supabase-js gives an array. Accept either
          // shape defensively, exactly as the storefront side does.
          const row: any = Array.isArray(rows) ? rows[0] : rows;
          if (row && typeof row.destination_url === "string" && typeof row.headline === "string") {
            setData(row as CrossSell);
          }
        },
        () => { /* ignore — render nothing on failure */ },
      );
    return () => { cancelled = true; };
  }, [category, dismissed]);

  if (dismissed || !data) return null;

  const go = () => {
    // Tag the crossing for internal attribution. This banner ORIGINATES on the
    // marketplace (points back to the storefront), so source=marketplace — the
    // mirror of the storefront banner's source=storefront/medium=banner. Built
    // with URL so an existing query/hash is preserved and params de-duped.
    let target = data.destination_url;
    try {
      const u = new URL(data.destination_url, window.location.origin);
      u.searchParams.set("utm_source", "marketplace");
      u.searchParams.set("utm_medium", "banner");
      // Campaign names WHICH marketplace banner this was. PregnancyQuizBanner
      // also sends source=marketplace / medium=banner from the same app and now
      // looks identical, so without this the two are separable only by one of
      // them having no campaign at all, which reads as missing data rather than
      // as a distinct source.
      u.searchParams.set("utm_campaign", "browse_crosssell");
      target = u.pathname + u.search + u.hash;
    } catch {
      /* keep the raw destination_url */
    }
    // FULL-PAGE navigation into the separate storefront app tree. A client
    // route cannot reach it: the marketplace app is chosen from
    // window.location at mount, so the storefront tree is not even mounted.
    window.location.assign(target);
  };

  // Mirrors the storefront banner's CTA exactly (c4d0266): make the promise
  // concrete with the live count when there is one, and fall back to the plain
  // wording at 0 or missing rather than showing a zero, since "See 0 new items"
  // reads as broken. If you change this, change the other file too.
  const liveCount = Math.trunc(Number(data.live_count) || 0);
  const ctaText =
    liveCount > 0
      ? data.has_category
        ? `See ${liveCount} new items`
        : `Browse ${liveCount} new items`
      : data.has_category
        ? "Shop new"
        : "Click here";

  return (
    <CrossAppBanner
      ariaLabel="Also available new on the BundledMum shop"
      palette={PALETTE}
      /* Shopping-bag accent, the mirror of the storefront banner's recycle
         mark: that one says "used", this one says "new". */
      accent="🛍️"
      headline={data.headline}
      onDismiss={dismiss}
      wrapperClassName="w-full"
      wrapperStyle={{
        maxWidth: 1240,
        margin: "0 auto",
        padding: "2px 16px 12px",
        boxSizing: "border-box",
      }}
      cta={
        <button type="button" onClick={go} className={BANNER_CTA_CLASS} style={bannerCtaStyle(PALETTE)}>
          {ctaText}
          <span className={BANNER_ARROW_CLASS} aria-hidden>→</span>
        </button>
      }
    />
  );
}
