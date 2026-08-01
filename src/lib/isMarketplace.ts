/**
 * Resolves whether the app should render the MARKETPLACE experience rather than
 * the main storefront. Both live on the SAME origin now: the marketplace is
 * mounted at the path bundledmum.com/marketplace and the storefront owns every
 * other path. (Originally the marketplace was going to live on the subdomain
 * marketplace.bundledmum.com, but Lovable hosting only allows one primary custom
 * domain and redirects all other connected domains to it, so the subdomain
 * cannot serve the app independently — hence the move to a path.)
 *
 * Marketplace mode is entered when the URL path is "/marketplace" or anything
 * beneath it ("/marketplace/listings", ...). The check is exact on "/marketplace"
 * and prefix on "/marketplace/" so sibling storefront paths like
 * "/marketplace-anything" are NOT captured.
 *
 * Computed once from window.location at call time (App resolves it a single
 * time at the top level and picks the route tree from the result).
 */
export function isMarketplace(): boolean {
  if (typeof window === "undefined") return false;

  const path = window.location.pathname;
  return path === "/marketplace" || path.startsWith("/marketplace/");
}
