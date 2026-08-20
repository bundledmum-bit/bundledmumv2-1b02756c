import { Link, useLocation } from "react-router-dom";
import { useSeller } from "./sell/useSeller";
import logoWhite from "@/assets/logos/BM-LOGO-WHITE.png";

/**
 * The one shared marketplace footer, rendered once below every route (design R2 /
 * R2b, the compact version, about a third of the old height). Brand + protection
 * line on one side, links grouped under "Marketplace" and "Policies" headings on
 * the other, copyright and the storefront link in a separate bottom bar below a
 * divider. No marketing paragraph, no held-payment paragraph, no WhatsApp CTA.
 *
 * Suppressed on the screens that end in a fixed action bar: all /checkout* routes,
 * the dispatch-upload screen, and the buyer order detail + problem routes, plus
 * /login. On listing detail it gets extra bottom clearance so the fixed Buy now
 * bar cannot obscure the last line. Only links whose destinations exist are shown
 * (Help still has no page, so it stays omitted; the five policy pages now do,
 * design 24a, so they are wired in below).
 */
export default function MarketplaceFooter() {
  const { pathname } = useLocation();
  const { seller } = useSeller();

  const onCheckout = pathname.startsWith("/checkout");
  const onDispatch = /^\/sell\/orders\/[^/]+\/dispatch$/.test(pathname);
  const onOrderAction = /^\/orders\/[^/]+/.test(pathname);
  const onLogin = pathname === "/login";
  if (onCheckout || onDispatch || onOrderAction || onLogin) return null;

  // Listing detail carries a position:fixed Buy now bar; clear it.
  const hasFixedBar = pathname.startsWith("/listing/");

  return (
    <footer className={hasFixedBar ? "mkt-ftr clear-bar" : "mkt-ftr"}>
      <div className="mkt-ftr-inner">
        <div className="mkt-ftr-brand">
          <div className="mkt-ftr-lockup">
            <img src={logoWhite} alt="BundledMum" className="mkt-ftr-logo" />
            <span className="mkt-ftr-market">Marketplace</span>
          </div>
          <p className="mkt-ftr-protect">Sell the baby &amp; children's items you don't need, or buy cheap secondhand items for your children.</p>
        </div>

        <div className="mkt-ftr-groups">
          <nav className="mkt-ftr-group">
            <span className="mkt-ftr-group-h">Marketplace</span>
            <Link to="/" className="mkt-ftr-link">Browse</Link>
            <Link to="/how-it-works" className="mkt-ftr-link">How buying works</Link>
            <Link to="/sell" className="mkt-ftr-link">Sell</Link>
            <Link to="/faq" className="mkt-ftr-link">FAQ</Link>
            <Link to="/orders" className="mkt-ftr-link">My orders</Link>
            {seller && <Link to="/sell/dashboard" className="mkt-ftr-link">Seller dashboard</Link>}
            <Link to="/install" className="mkt-ftr-link">Install the app</Link>
          </nav>

          <nav className="mkt-ftr-group">
            <span className="mkt-ftr-group-h">Policies</span>
            <Link to="/buyer-protection" className="mkt-ftr-link">Buyer protection</Link>
            <Link to="/seller-protection" className="mkt-ftr-link">Seller protection</Link>
            <Link to="/terms" className="mkt-ftr-link">Terms</Link>
            <Link to="/privacy" className="mkt-ftr-link">Privacy</Link>
            <Link to="/cookies" className="mkt-ftr-link">Cookies</Link>
          </nav>
        </div>
      </div>

      <div className="mkt-ftr-bottom">
        <p className="mkt-ftr-legal">© 2026 BundledMum Ltd, Lagos.</p>
        <a href="/" className="mkt-ftr-link">bundledmum.com</a>
      </div>
    </footer>
  );
}
