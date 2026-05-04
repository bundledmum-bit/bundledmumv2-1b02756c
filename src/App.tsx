import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient, MutationCache } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import { BrowserRouter, Route, Routes, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useComingSoonFlags } from "@/hooks/useComingSoon";
import { usePreviewToken } from "@/hooks/usePreviewToken";
import { useAdmin } from "@/hooks/useAdmin";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/lib/cart";
import ScrollToTop from "@/components/ScrollToTop";
import PixelRouteListener from "@/components/PixelRouteListener";
import SkipNav from "@/components/SkipNav";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

import MobileBottomNav from "@/components/MobileBottomNav";
import AnnouncementBar, { useAnnouncementHeight } from "@/components/AnnouncementBar";
import AnnouncementEngine, { useAnnouncementEngineBarHeight } from "@/components/AnnouncementEngine";
import { subscribeToAllChanges } from "@/lib/realtime";
import { usePageTracking } from "@/hooks/usePageTracking";

import HomePage from "@/pages/HomePage";
import SubscribeLanding from "@/pages/SubscribeLanding";
import PaymentReceivedPage from "@/pages/PaymentReceivedPage";
import SubscriptionPage from "@/pages/SubscriptionPage";
import SubscriptionCheckout from "@/pages/SubscriptionCheckout";
import SubscriptionThankYou from "@/pages/SubscriptionThankYou";
import NewSubscription from "@/pages/account/NewSubscription";
import AccountSubscriptions from "@/pages/account/AccountSubscriptions";
import BundlesPage from "@/pages/BundlesPage";
import BundleDetailPage from "@/pages/BundleDetailPage";
import ShopPage from "@/pages/ShopPage";
import CategoryPage from "@/pages/CategoryPage";
import QuizPage from "@/pages/QuizPage";
import CartPage from "@/pages/CartPage";
import CheckoutPage from "@/pages/CheckoutPage";
import OrderConfirmedPage from "@/pages/OrderConfirmedPage";
import AboutPage from "@/pages/AboutPage";
import ContactPage from "@/pages/ContactPage";
import PrivacyPage from "@/pages/PrivacyPage";
import TermsPage from "@/pages/TermsPage";
import CookiesPage from "@/pages/CookiesPage";
import ReturnsPage from "@/pages/ReturnsPage";
import BlogPage from "@/pages/BlogPage";
import TrackOrderPage from "@/pages/TrackOrderPage";
import AccountPage from "@/pages/AccountPage";
import AccountLoginPage from "@/pages/AccountLoginPage";
import AccountOrdersPage from "@/pages/AccountOrdersPage";
import AccountProfilePage from "@/pages/AccountProfilePage";
import AccountReferralPage from "@/pages/AccountReferralPage";
import RequireCustomerAuth from "@/components/account/RequireCustomerAuth";
import PushGiftsPage from "@/pages/PushGiftsPage";
import ProductPage from "@/pages/ProductPage";
import DynamicPage from "@/pages/DynamicPage";
import ComingSoonPage from "@/pages/ComingSoonPage";
import NotFound from "./pages/NotFound.tsx";

// Admin
import AdminLogin from "@/pages/admin/AdminLogin";
import AdminSetPassword from "@/pages/admin/AdminSetPassword";
import ResetPassword from "@/pages/ResetPassword";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminBundles from "@/pages/admin/AdminBundles";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminDelivery from "@/pages/admin/AdminDelivery";
import AdminContent from "@/pages/admin/AdminContent";
import AdminBlog from "@/pages/admin/AdminBlog";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminPermissions from "@/pages/admin/AdminPermissions";
import AdminApprovals from "@/pages/admin/AdminApprovals";
import AdminReferrals from "@/pages/admin/AdminReferrals";
import AdminAnalytics from "@/pages/admin/AdminAnalytics";
import AdminMarketingAnalytics from "@/pages/admin/analytics/AdminMarketingAnalytics";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminMedia from "@/pages/admin/AdminMedia";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminInventory from "@/pages/admin/AdminInventory";
import AdminShippingZones from "@/pages/admin/AdminShippingZones";
import AdminDeliverableStates from "@/pages/admin/AdminDeliverableStates";
import AdminCouriers from "@/pages/admin/AdminCouriers";
import AdminPages from "@/pages/admin/AdminPages";
import AdminPromotions from "@/pages/admin/AdminPromotions";
import AdminQuizLeads from "@/pages/admin/AdminQuizLeads";
import AdminQuizEngine from "@/pages/admin/AdminQuizEngine";
import AdminEmailTemplates from "@/pages/admin/AdminEmailTemplates";
import AdminComingSoon from "@/pages/admin/AdminComingSoon";
import AdminFinance from "@/pages/admin/AdminFinance";
import AdminHomepage from "@/pages/admin/AdminHomepage";
import AdminTestimonials from "@/pages/admin/AdminTestimonials";
import AdminTrustSignals from "@/pages/admin/AdminTrustSignals";
import AdminSpendThresholds from "@/pages/admin/AdminSpendThresholds";
import AdminReturns from "@/pages/admin/AdminReturns";
import AdminSubscriptions from "@/pages/admin/AdminSubscriptions";
import AdminMerchandising from "@/pages/admin/AdminMerchandising";
import AdminVendors from "@/pages/admin/AdminVendors";
import AdminPicking from "@/pages/admin/AdminPicking";
import AdminPickingHistory from "@/pages/admin/AdminPickingHistory";
import MarginsPage from "@/pages/admin/products/MarginsPage";
import AdminHRLayout from "@/pages/admin/hr/AdminHRLayout";
import AdminHREmployees from "@/pages/admin/hr/AdminHREmployees";
import AdminHRPayroll from "@/pages/admin/hr/AdminHRPayroll";
import AdminHRLeave from "@/pages/admin/hr/AdminHRLeave";
import AdminHRDocuments from "@/pages/admin/hr/AdminHRDocuments";
import AdminHRDepartments from "@/pages/admin/hr/AdminHRDepartments";
import AdminHRDashboard from "@/pages/admin/hr/AdminHRDashboard";
import AdminHRTasks from "@/pages/admin/hr/AdminHRTasks";
import EmployeePortalLayout from "@/pages/employee-portal/EmployeePortalLayout";
import EmployeePortalLogin from "@/pages/employee-portal/EmployeePortalLogin";
import EmployeePortalDashboard from "@/pages/employee-portal/EmployeePortalDashboard";
import EmployeePayslips from "@/pages/employee-portal/EmployeePayslips";
import EmployeeLeave from "@/pages/employee-portal/EmployeeLeave";
import EmployeeProfile from "@/pages/employee-portal/EmployeeProfile";
import EmployeeTasks from "@/pages/employee-portal/EmployeeTasks";
import PermissionGate from "@/components/admin/PermissionGate";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: true,
    },
  },
  mutationCache: new MutationCache({
    onError: (error: any) => {
      // Surface silent mutation failures (RLS denials, validation errors, etc.)
      // Per-mutation onError handlers still run in addition to this.
      console.error("[mutation error]", error);
      const msg = error?.message || error?.error_description || "Something went wrong";
      sonnerToast.error(msg);
    },
  }),
});

function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  useEffect(() => {
    const unsub = subscribeToAllChanges((_table, keys) => {
      keys.forEach(key => qc.invalidateQueries({ queryKey: [key] }));
    });
    return unsub;
  }, [qc]);
  return <>{children}</>;
}

function PageTracker({ children }: { children: React.ReactNode }) {
  usePageTracking();
  return <>{children}</>;
}

/**
 * Listens for Supabase's PASSWORD_RECOVERY event (fires when the user
 * lands with a recovery token in the URL fragment) and routes them to
 * the password reset page. Mounted inside <BrowserRouter> so navigate()
 * is in scope.
 */
function PasswordRecoveryListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password?flow=recovery");
        return;
      }
      // Admin invite links land with `type=invite` in the URL fragment and
      // emit INITIAL_SESSION on first load (no separate event). Capture the
      // hash here — Supabase strips it shortly after — and pass the flow as
      // a query param so the page can render the right copy + redirect.
      if (event === "INITIAL_SESSION" && session?.user) {
        const hash = typeof window !== "undefined" ? window.location.hash || "" : "";
        if (hash.includes("type=invite")) {
          navigate("/reset-password?flow=invite");
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  return null;
}

/**
 * Redirects storefront traffic to /coming-soon when both flags are on.
 * Admin sessions (logged-in Supabase users) bypass the redirect so they
 * can still preview the live site. /admin/* routes are excluded by
 * design — they're mounted as siblings of <StorefrontShell />.
 */
function ComingSoonGate({ children }: { children: React.ReactNode }) {
  const { data: flags, isLoading: flagsLoading } = useComingSoonFlags();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { ready: previewReady, valid: previewValid } = usePreviewToken();
  const location = useLocation();

  // Don't redirect the coming-soon page itself
  if (location.pathname === "/coming-soon") return <>{children}</>;

  // Wait for ALL inputs (the flags themselves, the admin auth state, and
  // the preview-token validation) before deciding what to render. Without
  // this, the storefront paints for a frame and then yanks the customer
  // to /coming-soon — they see a flash of the live site before the
  // redirect fires.
  if (flagsLoading || adminLoading || !previewReady) return null;

  const shouldRedirect =
    flags?.enabled === true &&
    flags?.redirectAll === true &&
    !isAdmin &&
    !previewValid;

  if (shouldRedirect) return <Navigate to="/coming-soon" replace />;
  return <>{children}</>;
}

function StorefrontShell() {
  const { height: legacyBarHeight, dismissed, setDismissed } = useAnnouncementHeight();
  const engineBarHeight = useAnnouncementEngineBarHeight();
  const totalBarHeight = legacyBarHeight + engineBarHeight;

  // The announcement bars resolve their height after the initial render,
  // and the spacer below transitions from 0 → totalBarHeight over 300ms.
  // Browser scroll-anchoring drifts the viewport downward as the spacer
  // grows, so re-pin the page to the top whenever totalBarHeight changes.
  // Only re-snap if the customer hasn't already scrolled away from the
  // top — we never want to yank a reading customer back up.
  useEffect(() => {
    if (totalBarHeight === 0) return;
    const t = setTimeout(() => {
      if (window.scrollY < 120) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, 350);
    return () => clearTimeout(t);
  }, [totalBarHeight]);

  return (
    <>
      <SkipNav />
      <AnnouncementBar dismissed={dismissed} onDismiss={() => setDismissed(true)} />
      <AnnouncementEngine topOffset={legacyBarHeight} />
      <Navbar topOffset={totalBarHeight} />
      <main id="main-content">
        {totalBarHeight > 0 && <div style={{ height: totalBarHeight }} className="transition-all duration-300" />}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/bundles" element={<BundlesPage />} />
          <Route path="/bundles/:bundleId" element={<BundleDetailPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/shop/baby" element={<ShopPage />} />
          <Route path="/shop/mum" element={<ShopPage />} />
          <Route path="/shop/:slug" element={<CategoryPage />} />
          <Route path="/subscribe" element={<SubscribeLanding />} />
          <Route path="/subscriptions" element={<SubscriptionPage />} />
          <Route path="/subscriptions/checkout" element={<SubscriptionCheckout />} />
          <Route path="/subscriptions/thank-you" element={<SubscriptionThankYou />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-confirmed" element={<OrderConfirmedPage />} />
          <Route path="/payment-received" element={<PaymentReceivedPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/cookies" element={<CookiesPage />} />
          <Route path="/returns" element={<ReturnsPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/track-order" element={<TrackOrderPage />} />
          <Route path="/account/login" element={<AccountLoginPage />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/account/subscriptions" element={<RequireCustomerAuth><AccountSubscriptions /></RequireCustomerAuth>} />
          <Route path="/account/subscriptions/new" element={<RequireCustomerAuth><NewSubscription /></RequireCustomerAuth>} />
          <Route path="/account" element={<RequireCustomerAuth><AccountPage /></RequireCustomerAuth>} />
          <Route path="/account/orders" element={<RequireCustomerAuth><AccountOrdersPage /></RequireCustomerAuth>} />
          <Route path="/account/profile" element={<RequireCustomerAuth><AccountProfilePage /></RequireCustomerAuth>} />
          <Route path="/account/referral" element={<RequireCustomerAuth><AccountReferralPage /></RequireCustomerAuth>} />
          <Route path="/push-gifts" element={<PushGiftsPage />} />
          <Route path="/products/:slug" element={<ProductPage />} />
          <Route path="/p/:slug" element={<DynamicPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <RealtimeProvider>
      <TooltipProvider>
        <CartProvider>
          <Sonner />
          <BrowserRouter>
            <PageTracker>
            <ScrollToTop />
            <PixelRouteListener />
            <PasswordRecoveryListener />
            <Routes>
              {/* Admin routes */}
              <Route path="/admin/set-password" element={<AdminSetPassword />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<PermissionGate module="dashboard" action="view"><AdminDashboard /></PermissionGate>} />
                <Route path="products" element={<PermissionGate module="products" action="view"><AdminProducts /></PermissionGate>} />
                <Route path="products/margins" element={<PermissionGate module="products" action="view"><MarginsPage /></PermissionGate>} />
                <Route path="bundles" element={<PermissionGate module="products" action="view"><AdminBundles /></PermissionGate>} />
                <Route path="orders" element={<PermissionGate module="orders" action="view"><AdminOrders /></PermissionGate>} />
                <Route path="delivery" element={<PermissionGate module="delivery" action="view"><AdminDelivery /></PermissionGate>} />
                <Route path="content" element={<PermissionGate module="content" action="view"><AdminContent /></PermissionGate>} />
                <Route path="blog" element={<PermissionGate module="content" action="view"><AdminBlog /></PermissionGate>} />
                <Route path="settings" element={<PermissionGate module="content" action="edit_settings"><AdminSettings /></PermissionGate>} />
                <Route path="settings/permissions" element={<AdminPermissions />} />
                <Route path="approvals" element={<AdminApprovals />} />
                <Route path="referrals" element={<PermissionGate module="customers" action="view"><AdminReferrals /></PermissionGate>} />
                <Route path="analytics" element={<PermissionGate module="analytics" action="view"><AdminAnalytics /></PermissionGate>} />
                <Route path="analytics/marketing" element={<PermissionGate module="analytics" action="view"><AdminMarketingAnalytics /></PermissionGate>} />
                <Route path="users" element={<PermissionGate module="admin" action="view_users"><AdminUsers /></PermissionGate>} />
                <Route path="media" element={<PermissionGate module="content" action="view"><AdminMedia /></PermissionGate>} />
                <Route path="coupons" element={<PermissionGate module="coupons" action="view"><AdminCoupons /></PermissionGate>} />
                <Route path="customers" element={<PermissionGate module="customers" action="view"><AdminCustomers /></PermissionGate>} />
                <Route path="inventory" element={<PermissionGate module="inventory" action="view"><AdminInventory /></PermissionGate>} />
                <Route path="shipping-zones" element={<PermissionGate module="delivery" action="view"><AdminShippingZones /></PermissionGate>} />
                <Route path="deliverable-states" element={<PermissionGate module="delivery" action="view"><AdminDeliverableStates /></PermissionGate>} />
                <Route path="couriers" element={<PermissionGate module="delivery" action="view"><AdminCouriers /></PermissionGate>} />
                <Route path="pages" element={<PermissionGate module="content" action="view"><AdminPages /></PermissionGate>} />
                <Route path="promotions" element={<PermissionGate module="promotions" action="view"><AdminPromotions /></PermissionGate>} />
                <Route path="quiz-leads" element={<PermissionGate module="content" action="manage_quiz"><AdminQuizLeads /></PermissionGate>} />
                <Route path="quiz-engine" element={<PermissionGate module="content" action="manage_quiz"><AdminQuizEngine /></PermissionGate>} />
                <Route path="email-templates" element={<PermissionGate module="content" action="edit_settings"><AdminEmailTemplates /></PermissionGate>} />
                <Route path="coming-soon" element={<PermissionGate module="settings" action="manage_coming_soon"><AdminComingSoon /></PermissionGate>} />
                <Route path="finance/*" element={<PermissionGate module="analytics" action="view"><AdminFinance /></PermissionGate>} />
                <Route path="storefront/homepage" element={<PermissionGate module="content" action="edit"><AdminHomepage /></PermissionGate>} />
                <Route path="storefront/testimonials" element={<PermissionGate module="content" action="edit"><AdminTestimonials /></PermissionGate>} />
                <Route path="storefront/trust" element={<PermissionGate module="content" action="edit"><AdminTrustSignals /></PermissionGate>} />
                <Route path="storefront/thresholds" element={<PermissionGate module="content" action="edit"><AdminSpendThresholds /></PermissionGate>} />
                <Route path="returns" element={<PermissionGate module="orders" action="refund"><AdminReturns /></PermissionGate>} />
                <Route path="subscriptions" element={<PermissionGate module="orders" action="view"><AdminSubscriptions /></PermissionGate>} />
                <Route path="merchandising" element={<PermissionGate module="content" action="edit"><AdminMerchandising /></PermissionGate>} />
                <Route path="vendors" element={<PermissionGate module="products" action="view"><AdminVendors /></PermissionGate>} />
                <Route path="picking" element={<PermissionGate module="orders" action="view"><AdminPicking /></PermissionGate>} />
                <Route path="picking/history" element={<PermissionGate module="orders" action="view"><AdminPickingHistory /></PermissionGate>} />

                {/* HR section (nested tabs share AdminHRLayout) */}
                <Route path="hr" element={<PermissionGate module="hr" action="view"><AdminHRLayout /></PermissionGate>}>
                  <Route index element={<AdminHRDashboard />} />
                  <Route path="employees" element={<AdminHREmployees />} />
                  <Route path="payroll" element={<AdminHRPayroll />} />
                  <Route path="leave" element={<AdminHRLeave />} />
                  <Route path="tasks" element={<AdminHRTasks />} />
                  <Route path="documents" element={<AdminHRDocuments />} />
                  <Route path="departments" element={<AdminHRDepartments />} />
                </Route>
              </Route>

              {/* Employee portal — separate from admin + storefront shells.
                  Uses Supabase auth.users via useCustomerAuth; RLS on
                  hr_employees scopes data to auth_user_id. */}
              <Route path="/employee-portal/login" element={<EmployeePortalLogin />} />
              <Route path="/employee-portal" element={<EmployeePortalLayout />}>
                <Route index element={<EmployeePortalDashboard />} />
                <Route path="payslips" element={<EmployeePayslips />} />
                <Route path="leave" element={<EmployeeLeave />} />
                <Route path="tasks" element={<EmployeeTasks />} />
                <Route path="profile" element={<EmployeeProfile />} />
              </Route>

              {/* Standalone public page — no navbar/footer, not redirected */}
              <Route path="/coming-soon" element={<ComingSoonPage />} />

              {/* Storefront routes (wrapped in Coming Soon redirect gate) */}
              <Route path="*" element={<ComingSoonGate><StorefrontShell /></ComingSoonGate>} />
            </Routes>
            </PageTracker>
          </BrowserRouter>
        </CartProvider>
      </TooltipProvider>
    </RealtimeProvider>
  </QueryClientProvider>
);

export default App;
