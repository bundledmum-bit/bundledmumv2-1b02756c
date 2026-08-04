import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MarketplaceHeader from "./MarketplaceHeader";
import MarketplaceFooter from "./MarketplaceFooter";
import MarketplaceScrollManager from "./MarketplaceScrollManager";
import MarketplaceLoginPage from "./auth/MarketplaceLoginPage";
import BrowsePage from "./pages/BrowsePage";
import ListingDetailPage from "./pages/ListingDetailPage";
import BecomeSellerPage from "./sell/BecomeSellerPage";
import SellerSetupPage from "./sell/SellerSetupPage";
import CreateListingPage from "./sell/CreateListingPage";
import SellerDashboardPage from "./sell/SellerDashboardPage";
import SellerPriceEditPage from "./sell/SellerPriceEditPage";
import SellerOrderDetailPage from "./sell/SellerOrderDetailPage";
import SellerDispatchPage from "./sell/SellerDispatchPage";
import SellerPayoutsPage from "./sell/SellerPayoutsPage";
import CheckoutPage from "./checkout/CheckoutPage";
import PaymentReturnPage from "./checkout/PaymentReturnPage";
import AwaitingPaymentPage from "./checkout/AwaitingPaymentPage";
import BuyerOrdersListPage from "./checkout/BuyerOrdersListPage";
import BuyerOrderDetailPage from "./checkout/BuyerOrderDetailPage";
import BuyerDisputePage from "./checkout/BuyerDisputePage";
import BuyerReturnPage from "./checkout/BuyerReturnPage";
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
          <MarketplaceScrollManager />
          <MarketplaceHeader />
          <Routes>
            <Route path="/" element={<BrowsePage />} />
            <Route path="/login" element={<MarketplaceLoginPage />} />
            <Route path="/listing/:id" element={<ListingDetailPage />} />
            {/* Sell side: seller onboarding and listing creation */}
            <Route path="/sell" element={<BecomeSellerPage />} />
            <Route path="/sell/setup" element={<SellerSetupPage />} />
            <Route path="/sell/new" element={<CreateListingPage />} />
            <Route path="/sell/listings/:id/edit" element={<CreateListingPage />} />
            <Route path="/sell/listings/:id/price" element={<SellerPriceEditPage />} />
            <Route path="/sell/dashboard" element={<SellerDashboardPage />} />
            <Route path="/sell/payouts" element={<SellerPayoutsPage />} />
            <Route path="/sell/orders/:orderId" element={<SellerOrderDetailPage />} />
            <Route path="/sell/orders/:orderId/dispatch" element={<SellerDispatchPage />} />
            {/* Checkout: Paystack (primary), payment return, transfer fallback */}
            <Route path="/checkout/:listingId" element={<CheckoutPage />} />
            <Route path="/checkout/return" element={<PaymentReturnPage />} />
            <Route path="/checkout/awaiting/:reference" element={<AwaitingPaymentPage />} />
            {/* Buyer orders: my orders, order detail (confirm receipt), report a problem */}
            <Route path="/orders" element={<BuyerOrdersListPage />} />
            <Route path="/orders/:orderId" element={<BuyerOrderDetailPage />} />
            <Route path="/orders/:orderId/problem" element={<BuyerDisputePage />} />
            <Route path="/orders/:orderId/return" element={<BuyerReturnPage />} />
          </Routes>
          <MarketplaceFooter />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
