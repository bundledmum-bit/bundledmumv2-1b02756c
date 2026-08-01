import { lazy, Suspense } from "react";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { isMarketplace } from "@/lib/isMarketplace";

/**
 * Top-level hostname split. Both bundledmum.com (storefront/admin) and
 * marketplace.bundledmum.com (secondhand marketplace) serve THIS SAME build.
 * We resolve which experience to render once, here, then lazy-load only that
 * route tree so a visitor on one host does not download the other's bundle.
 *
 *  - Storefront/admin tree  → src/StorefrontApp.tsx (the previous App body,
 *    moved verbatim; behaviour + appearance unchanged).
 *  - Marketplace tree       → src/marketplace/MarketplaceApp.tsx (placeholder
 *    for now).
 *
 * isMarketplace() is true when the hostname starts with "marketplace." OR the
 * URL carries ?view=marketplace (preview override for dev + the Lovable
 * preview host, where the real subdomain does not resolve).
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
