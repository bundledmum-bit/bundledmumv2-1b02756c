import { lazy, Suspense } from "react";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { isMarketplace } from "@/lib/isMarketplace";

/**
 * Top-level path split. The storefront/admin experience and the secondhand
 * marketplace live on the SAME origin (bundledmum.com) and serve THIS SAME
 * build. We resolve which experience to render once, here, then lazy-load only
 * that route tree so a visitor of one does not download the other's bundle.
 *
 *  - Storefront/admin tree  → src/StorefrontApp.tsx (the previous App body,
 *    moved verbatim; behaviour + appearance unchanged). Owns every path except
 *    /marketplace.
 *  - Marketplace tree       → src/marketplace/MarketplaceApp.tsx (placeholder
 *    for now), mounted under the /marketplace base path.
 *
 * isMarketplace() is true when the URL path is "/marketplace" or beneath it.
 * (The marketplace was originally going to live on the subdomain
 * marketplace.bundledmum.com, but Lovable hosting only allows one primary custom
 * domain and redirects all others to it, so it moved to a path on the main
 * domain — which also removes the cross-origin auth problem entirely.)
 */

const StorefrontApp = lazy(() => import("@/StorefrontApp"));
const MarketplaceApp = lazy(() => import("@/marketplace/MarketplaceApp"));

const RouteTreeFallback = () => (
  <div
    style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <BMLoadingAnimation size={180} />
  </div>
);

const App = () => {
  const marketplace = isMarketplace();
  return (
    <Suspense fallback={<RouteTreeFallback />}>
      {marketplace ? <MarketplaceApp /> : <StorefrontApp />}
    </Suspense>
  );
};

export default App;
