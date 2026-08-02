import { Link, useLocation } from "react-router-dom";
import { useSeller } from "./sell/useSeller";
import logoWhite from "@/assets/logos/BM-LOGO-WHITE.png";

/**
 * The one shared marketplace footer, rendered once below every route (design R2 /
 * R2b, the compact version, about a third of the old height). It carries the
 * brand lockup, the real navigation links, one protection line, and the
 * copyright. No marketing paragraph, no held-payment paragraph, no WhatsApp CTA.
 *
 * Suppressed on the screens that end in a fixed action bar: all /checkout* routes,
 * the dispatch-upload screen, and the buyer order detail + problem routes, plus
 * /login. On listing detail it gets extra bottom clearance so the fixed Buy now
 * bar cannot obscure the last line. Only links whose destinations exist are shown
 * (Help, Terms and Privacy have no pages, so they are omitted).
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
        <div className="mkt-ftr-lockup">
          <img src={logoWhite} alt="BundledMum" className="mkt-ftr-logo" />
          <span className="mkt-ftr-market">Marketplace</span>
        </div>

        <nav className="mkt-ftr-links">
          <Link to="/" className="mkt-ftr-link">Browse</Link>
          <Link to="/sell" className="mkt-ftr-link">Sell</Link>
          <Link to="/orders" className="mkt-ftr-link">My orders</Link>
          {seller && <Link to="/sell/dashboard" className="mkt-ftr-link">Seller dashboard</Link>}
          <a href="/" className="mkt-ftr-link">bundledmum.com</a>
        </nav>
      </div>

      <p className="mkt-ftr-protect">Sellers checked, listings reviewed, and your money held until you confirm the item arrived.</p>
      <p className="mkt-ftr-legal">© 2026 BundledMum Ltd, Lagos.</p>
    </footer>
  );
}
