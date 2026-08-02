import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useSeller } from "./sell/useSeller";
import logoWhite from "@/assets/logos/BM-LOGO-WHITE.svg";

/**
 * The one shared marketplace header, rendered once above every route. A green
 * strip with the BundledMum logo lockup: on mobile a hamburger opens a full
 * screen menu, on desktop the links sit inline. It is auth-aware (via
 * useCustomerAuth) and seller-aware (via useSeller, for the dashboard link).
 *
 * On the checkout and payment-return routes it drops to a REDUCED variant, logo
 * only, no menu, so a buyer mid-payment cannot casually navigate away. The
 * header is pure chrome and never touches routing or the payment reference.
 *
 * "My orders" links to the buyer orders route (shown when logged in). "How
 * BundledMum works" is still omitted, as that route does not exist.
 */
export default function MarketplaceHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, user } = useCustomerAuth();
  const { seller } = useSeller();
  const [open, setOpen] = useState(false);

  const reduced = pathname.startsWith("/checkout");

  // Close the menu whenever the route changes.
  useEffect(() => { setOpen(false); }, [pathname]);

  const Lockup = (
    <span className="mkt-hdr-lockup">
      <img src={logoWhite} alt="BundledMum" className="mkt-hdr-logo" />
      <span className="mkt-hdr-market">Marketplace</span>
    </span>
  );

  if (reduced) {
    return (
      <header className="mkt-hdr">
        <div className="mkt-hdr-inner">{Lockup}</div>
      </header>
    );
  }

  const initials = (user?.email || "?").slice(0, 2).toUpperCase();

  async function signOut() {
    await supabase.auth.signOut();
    setOpen(false);
    navigate("/");
  }

  return (
    <header className="mkt-hdr">
      <div className="mkt-hdr-inner">
        <Link to="/" className="mkt-hdr-lockuplink" aria-label="BundledMum Marketplace, browse">{Lockup}</Link>

        {/* Desktop inline links */}
        <nav className="mkt-hdr-nav">
          <Link to="/" className="mkt-hdr-link">Browse</Link>
          <Link to="/sell" className="mkt-hdr-link">Sell an item</Link>
          {isLoggedIn && <Link to="/orders" className="mkt-hdr-link">My orders</Link>}
          {seller && <Link to="/sell/dashboard" className="mkt-hdr-link">Seller dashboard</Link>}
          {isLoggedIn
            ? <button className="mkt-hdr-account" onClick={() => setOpen(true)}><span className="av">{initials}</span>Account</button>
            : <Link className="mkt-hdr-link" to="/login">Log in</Link>}
        </nav>

        {/* Mobile hamburger */}
        <button className="mkt-hdr-burger" onClick={() => setOpen(true)} aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>
      </div>

      {open && (
        <div className="mkt-menu">
          <div className="mkt-menu-top">
            {Lockup}
            <button className="mkt-menu-close" onClick={() => setOpen(false)} aria-label="Close menu">×</button>
          </div>
          <nav className="mkt-menu-list">
            <Link to="/" className="mkt-menu-item">Browse</Link>
            <Link to="/sell" className="mkt-menu-item">Sell an item</Link>
            {isLoggedIn && <Link to="/orders" className="mkt-menu-item">My orders</Link>}
            {seller && <Link to="/sell/dashboard" className="mkt-menu-item">Seller dashboard</Link>}
            <a href="/" className="mkt-menu-item soft">Back to bundledmum.com</a>
          </nav>
          <div className="mkt-menu-foot">
            {isLoggedIn ? (
              <div className="mkt-menu-account">
                <span className="av">{initials}</span>
                <span className="who">{user?.email}</span>
                <button className="signout" onClick={signOut}>Sign out</button>
              </div>
            ) : (
              <Link className="mkt-primary" to="/login">Log in</Link>
            )}
            <a className="mkt-wa" href={WHATSAPP_BASE} target="_blank" rel="noreferrer"><span className="ic">✆</span>Help on WhatsApp</a>
          </div>
        </div>
      )}
    </header>
  );
}
