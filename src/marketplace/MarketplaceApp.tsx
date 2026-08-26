import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import PixelRouteListener from "@/components/PixelRouteListener";
import InstallPage from "./InstallPage";
import MarketplaceInstallBanner from "./MarketplaceInstallBanner";
import SellerDeliveryGate from "./sell/SellerDeliveryGate";
import PendingActionPrompt from "./components/PendingActionPrompt";
import MarketplaceHeader from "./MarketplaceHeader";
import MarketplaceFooter from "./MarketplaceFooter";
import MarketplaceScrollManager from "./MarketplaceScrollManager";
import MarketplaceLoginPage from "./auth/MarketplaceLoginPage";
import BrowsePage from "./pages/BrowsePage";
import ListingDetailPage from "./pages/ListingDetailPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import FaqPage from "./pages/FaqPage";
import BecomeSellerPage from "./sell/BecomeSellerPage";
import SellerSetupPage from "./sell/SellerSetupPage";
import CreateListingPage from "./sell/CreateListingPage";
import SellerDashboardPage from "./sell/SellerDashboardPage";
import SellerPriceEditPage from "./sell/SellerPriceEditPage";
import SellerOrderDetailPage from "./sell/SellerOrderDetailPage";
import SellerDispatchPage from "./sell/SellerDispatchPage";
import SellerPayoutsPage from "./sell/SellerPayoutsPage";
import CartPage from "./cart/CartPage";
import CheckoutPage from "./checkout/CheckoutPage";
import PaymentReturnPage from "./checkout/PaymentReturnPage";
import AwaitingPaymentPage from "./checkout/AwaitingPaymentPage";
import BuyerOrdersListPage from "./checkout/BuyerOrdersListPage";
import BuyerOrderDetailPage from "./checkout/BuyerOrderDetailPage";
import BuyerDisputePage from "./checkout/BuyerDisputePage";
import BuyerReturnPage from "./checkout/BuyerReturnPage";
import BuyerOfferPage from "./checkout/BuyerOfferPage";
import SellerOfferPage from "./sell/SellerOfferPage";
import SellerQuestionDetailPage from "./sell/SellerQuestionDetailPage";
import SellerVideoRequestDetailPage from "./sell/SellerVideoRequestDetailPage";
import SellerListingSharePage from "./sell/SellerListingSharePage";
import TermsPage from "./policy/TermsPage";
import PrivacyPage from "./policy/PrivacyPage";
import BuyerProtectionPage from "./policy/BuyerProtectionPage";
import SellerProtectionPage from "./policy/SellerProtectionPage";
import CookiesPage from "./policy/CookiesPage";
import MarketplaceNotFoundPage from "./MarketplaceNotFoundPage";
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
// The marketplace's own Meta pixel — a separate property from the
// storefront's, tracked server side via site_settings.meta_pixel_id and
// proven working through the Conversions API. See PixelRouteListener.
const MARKETPLACE_PIXEL_ID = "1737624674564707";

const marketplaceQueryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export default function MarketplaceApp() {
  return (
    <QueryClientProvider client={marketplaceQueryClient}>
      <BrowserRouter basename={MARKETPLACE_BASENAME}>
        <div className="mkt">
          {/* Marketplace gets its own installable PWA, separate from the
              storefront's (index.html's default manifest is the storefront's,
              name "BundledMum", start_url "/"). Helmet swaps these tags in
              only while a marketplace route is mounted — the same pattern
              AdminLayout.tsx uses for /admin — and reverts to the storefront
              defaults the moment the visitor navigates away, since App.tsx's
              path split unmounts this whole tree. */}
          <Helmet>
            <link rel="manifest" href="/marketplace-manifest.webmanifest" />
            <meta name="theme-color" content="#2D6A4F" />
            <meta name="apple-mobile-web-app-capable" content="yes" />
            <meta name="mobile-web-app-capable" content="yes" />
            <meta name="apple-mobile-web-app-status-bar-style" content="default" />
            <meta name="apple-mobile-web-app-title" content="BM Market" />
            <link rel="apple-touch-icon" href="/bm-mkt-apple-touch-icon.png" />
          </Helmet>
          <PixelRouteListener pixelId={MARKETPLACE_PIXEL_ID} />
          <MarketplaceScrollManager />
          <MarketplaceHeader />
          <div className="mkt-main">
          <Routes>
            <Route path="/" element={<BrowsePage />} />
            <Route path="/install" element={<InstallPage />} />
            <Route path="/login" element={<MarketplaceLoginPage />} />
            <Route path="/listing/:id" element={<ListingDetailPage />} />
            <Route path="/listing/:id/offer" element={<BuyerOfferPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/faq" element={<FaqPage />} />
            {/* Sell side: seller onboarding and listing creation */}
            <Route path="/sell" element={<BecomeSellerPage />} />
            <Route path="/sell/setup" element={<SellerSetupPage />} />
            <Route path="/sell/new" element={<CreateListingPage />} />
            <Route path="/sell/listings/:id/edit" element={<CreateListingPage />} />
            <Route path="/sell/listings/:id/price" element={<SellerPriceEditPage />} />
            <Route path="/sell/share/:listingId" element={<SellerListingSharePage />} />
            <Route path="/sell/dashboard" element={<SellerDashboardPage />} />
            <Route path="/sell/payouts" element={<SellerPayoutsPage />} />
            <Route path="/sell/orders/:orderId" element={<SellerOrderDetailPage />} />
            <Route path="/sell/orders/:orderId/dispatch" element={<SellerDispatchPage />} />
            <Route path="/sell/offers/:offerId" element={<SellerOfferPage />} />
            <Route path="/sell/questions/:id" element={<SellerQuestionDetailPage />} />
            <Route path="/sell/video-requests/:id" element={<SellerVideoRequestDetailPage />} />
            {/* Cart: multi-seller, one payment several deliveries (design 42a). */}
            <Route path="/cart" element={<CartPage />} />
            {/* Checkout: Paystack (primary), payment return, transfer fallback.
                ONE checkout page for both modes — /checkout/cart is the cart's
                own mode of the same component ("cart" is never a listing id),
                so a fix here can never again reach one path and miss the
                other, which is exactly how the channel selector went missing
                (§119). React Router ranks a static segment above a dynamic
                one regardless of declaration order, so /checkout/cart always
                wins over /checkout/:listingId — the same way /checkout/return
                already does. */}
            <Route path="/checkout/cart" element={<CheckoutPage />} />
            <Route path="/checkout/:listingId" element={<CheckoutPage />} />
            <Route path="/checkout/return" element={<PaymentReturnPage />} />
            <Route path="/checkout/awaiting/:reference" element={<AwaitingPaymentPage />} />
            {/* Buyer orders: my orders, order detail (confirm receipt), report a problem */}
            <Route path="/orders" element={<BuyerOrdersListPage />} />
            <Route path="/orders/:orderId" element={<BuyerOrderDetailPage />} />
            <Route path="/orders/:orderId/problem" element={<BuyerDisputePage />} />
            <Route path="/orders/:orderId/return" element={<BuyerReturnPage />} />
            {/* Policy pages (design 24a) */}
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/buyer-protection" element={<BuyerProtectionPage />} />
            <Route path="/seller-protection" element={<SellerProtectionPage />} />
            <Route path="/cookies" element={<CookiesPage />} />
            <Route path="*" element={<MarketplaceNotFoundPage />} />
          </Routes>
          </div>
          <MarketplaceFooter />
          <MarketplaceInstallBanner />
          {/* Blocking, non-dismissible ask for a seller who already has
              listings but has never said how same-state buyers get them.
              Self-gating: gone for good once answered. */}
          <SellerDeliveryGate />
          {/* Someone is waiting on this person. Outranks the install banner
              and the WhatsApp nudge, yields to the blocking gate above. */}
          <PendingActionPrompt />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
