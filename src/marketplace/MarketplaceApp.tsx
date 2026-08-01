import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BrowsePage from "./pages/BrowsePage";
import ListingDetailPage from "./pages/ListingDetailPage";
import "./marketplace.css";

/**
 * MARKETPLACE experience, mounted at bundledmum.com/marketplace. A SEPARATE
 * surface from the main storefront; the two share one repo, one build, and one
 * origin but are different products. See handoff-marketplace.md.
 *
 * The router uses basename="/marketplace" so internal routes are relative to
 * that base ("/" is /marketplace; "/listing/:id" is /marketplace/listing/:id).
 *
 * This tree brings its OWN QueryClient (the storefront's providers live inside
 * StorefrontApp and are not mounted here). Everything is wrapped in a `.mkt`
 * div so marketplace.css styling stays scoped and never touches the storefront.
 */

const MARKETPLACE_BASENAME = "/marketplace";

const marketplaceQueryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export default function MarketplaceApp() {
  return (
    <QueryClientProvider client={marketplaceQueryClient}>
      <BrowserRouter basename={MARKETPLACE_BASENAME}>
        <div className="mkt">
          <Routes>
            <Route path="/" element={<BrowsePage />} />
            <Route path="/listing/:id" element={<ListingDetailPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
