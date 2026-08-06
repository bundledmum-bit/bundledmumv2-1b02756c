import { Helmet } from "react-helmet-async";

const SUFFIX = "BundledMum Marketplace";

/**
 * Sets only the browser tab title for a marketplace route. Deliberately
 * title-only, not the storefront's <Seo> component (src/components/Seo.tsx),
 * even though both sit on the same react-helmet-async — reusing <Seo> as-is
 * would be wrong here for two reasons:
 *
 * 1. <Seo>'s canonical link and og:url are built from useLocation().pathname.
 *    The marketplace router is mounted with basename="/marketplace", so
 *    useLocation() there returns the path with that basename ALREADY
 *    STRIPPED (confirmed: every navigate() call in this app already omits
 *    it). <Seo> would emit a canonical/OG url missing "/marketplace" —
 *    wrong, and for a path like /terms it would collide with the
 *    storefront's own top-level page at that same bare path.
 * 2. <Seo> requires a description and always renders og:title/og:description.
 *    Meta description and Open Graph are explicitly out of scope this pass
 *    (see handoff-marketplace.md) — using <Seo> would fix them as a side
 *    effect whether intended or not.
 *
 * So: same underlying mechanism (Helmet) the storefront already uses, scoped
 * down to just <title>, so it can't touch either of those.
 */
export default function MarketplaceTitle({ title }: { title: string }) {
  const trimmed = title.length > 60 ? `${title.slice(0, 59).trimEnd()}…` : title;
  return (
    <Helmet>
      <title>{`${trimmed} · ${SUFFIX}`}</title>
    </Helmet>
  );
}
