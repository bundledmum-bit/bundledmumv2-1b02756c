import { useLocation } from "react-router-dom";
import Seo from "@/components/Seo";

const SUFFIX = "BundledMum Marketplace";
const DEFAULT_DESCRIPTION =
  "Buy or sell used baby and children's items on BundledMum Marketplace. Every seller checked, every listing reviewed, and your money held until you confirm it arrived.";
const DEFAULT_IMAGE = "https://bundledmum.com/images/og-default.jpg";

interface MarketplaceSeoProps {
  title: string;
  description?: string;
  image?: string;
  type?: "website" | "article" | "product";
  noindex?: boolean;
}

/**
 * Marketplace-scoped wrapper around the storefront's own <Seo>
 * (src/components/Seo.tsx) — the same mechanism, not a second one. Two
 * things <Seo> can't do unmodified inside this router:
 *
 * 1. The marketplace router mounts with basename="/marketplace", so
 *    useLocation() here already has that prefix stripped. <Seo>'s own
 *    canonical/og:url default to useLocation().pathname, which would be
 *    wrong here (missing "/marketplace", and for a path like /terms would
 *    collide with the storefront's own page at that same bare path). This
 *    wrapper always passes the corrected, prefixed path explicitly.
 * 2. Every marketplace page should get a real, non-blank description and
 *    image even when the caller has nothing specific to say (a private
 *    checkout/order state, a gone listing, a 404) — so description/image
 *    default to an accurate generic marketplace summary and BundledMum's
 *    existing default share image, never silently blank.
 *
 * Title truncation matches what MarketplaceTitle.tsx (title-only, still
 * used by screens outside this pass's scope) already did, so tab titles
 * stay consistent across the whole marketplace either way.
 */
export default function MarketplaceSeo({ title, description, image, type, noindex }: MarketplaceSeoProps) {
  const loc = useLocation();
  const trimmed = title.length > 60 ? `${title.slice(0, 59).trimEnd()}…` : title;
  return (
    <Seo
      title={`${trimmed} · ${SUFFIX}`}
      description={description || DEFAULT_DESCRIPTION}
      image={image || DEFAULT_IMAGE}
      path={`/marketplace${loc.pathname}`}
      type={type}
      noindex={noindex}
      breadcrumbs={[]}
    />
  );
}
