/**
 * Resolves whether the app should render the MARKETPLACE experience
 * (marketplace.bundledmum.com) rather than the main storefront
 * (bundledmum.com). Both hosts serve this same build from this same repo; the
 * split happens here, at runtime, in the browser.
 *
 * Two inputs feed one boolean:
 *  1. Hostname — treated as marketplace when it starts with "marketplace."
 *     (e.g. marketplace.bundledmum.com).
 *  2. Preview override — "?view=marketplace" anywhere in the query string
 *     forces marketplace mode regardless of hostname. The real subdomain does
 *     not resolve during local dev or on the Lovable preview URL, so this lets
 *     us preview the marketplace experience before DNS is live.
 *
 * Computed once from window.location at call time (App resolves it a single
 * time at the top level and picks the route tree from the result).
 */
export function isMarketplace(): boolean {
  if (typeof window === "undefined") return false;

  const host = window.location.hostname.toLowerCase();
  if (host.startsWith("marketplace.")) return true;

  const view = new URLSearchParams(window.location.search).get("view");
  return view === "marketplace";
}
