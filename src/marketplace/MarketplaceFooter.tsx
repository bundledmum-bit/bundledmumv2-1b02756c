import { Link, useLocation } from "react-router-dom";
import { WHATSAPP_BASE } from "@/lib/whatsapp";
import { useSeller } from "./sell/useSeller";

/**
 * The one shared marketplace footer, rendered once below every route (design
 * section 7a). Green-dark base so it closes each page against the header; mobile
 * stacks, desktop opens into columns. It carries the trust promise, not
 * marketing.
 *
 * Suppressed on the screens that end in a fixed action bar, so a scrolling
 * footer never fights the primary button: all /checkout* routes (consistent with
 * the header's reduced variant, a buyer mid-payment is not lured away) and the
 * dispatch-upload screen. On listing detail the footer gets extra bottom
 * clearance so the fixed Buy now bar cannot obscure the last line.
 *
 * Only links whose destinations actually exist are shown. The design's category
 * shortcuts (prams, cots, maternity wear), "how buying works", "getting paid",
 * help centre, terms, privacy and refunds all point at pages that do not exist
 * yet, so they are deliberately omitted rather than shipped as dead navigation.
 * The bottom tab bar in the mobile mock is a separate nav element the app does
 * not have, so it is not built here.
 */
export default function MarketplaceFooter() {
  const { pathname } = useLocation();
  const { seller } = useSeller();

  // Suppress where a fixed action bar owns the bottom of the screen.
  const onCheckout = pathname.startsWith("/checkout");
  const onDispatch = /^\/sell\/orders\/[^/]+\/dispatch$/.test(pathname);
  if (onCheckout || onDispatch) return null;

  // Listing detail carries a position:fixed Buy now bar; clear it.
  const hasFixedBar = pathname.startsWith("/listing/");

  return (
    <footer className={hasFixedBar ? "mkt-ftr clear-bar" : "mkt-ftr"}>
      <div className="mkt-ftr-inner">
        {/* Brand + promise + WhatsApp */}
        <div className="mkt-ftr-brandcol">
          <div className="mkt-ftr-lockup">
            <span className="b">B</span>
            <span className="nm">BundledMum <small>Marketplace</small></span>
          </div>
          <p className="mkt-ftr-tag">Secondhand baby and maternity things from mums across Nigeria. Every seller verified, every listing checked, trusted quality at a price that makes sense.</p>
          <a className="mkt-wa mkt-ftr-wa" href={WHATSAPP_BASE} target="_blank" rel="noreferrer"><span className="ic">✆</span>Chat to us on WhatsApp</a>
        </div>

        {/* Buying */}
        <nav className="mkt-ftr-col">
          <div className="mkt-ftr-h">Buying</div>
          <Link to="/" className="mkt-ftr-link">Browse all items</Link>
        </nav>

        {/* Selling */}
        <nav className="mkt-ftr-col">
          <div className="mkt-ftr-h">Selling</div>
          <Link to="/sell" className="mkt-ftr-link">Start selling</Link>
          {seller && <Link to="/sell/dashboard" className="mkt-ftr-link">Seller dashboard</Link>}
        </nav>

        {/* BundledMum */}
        <nav className="mkt-ftr-col">
          <div className="mkt-ftr-h">BundledMum</div>
          <a href="/" className="mkt-ftr-link">Back to bundledmum.com</a>
        </nav>
      </div>

      {/* Held-payment promise, word for word from the buyer flow */}
      <div className="mkt-ftr-held">
        <span className="tick">✓</span>
        <span>We hold every payment until the buyer confirms the item arrived, then we pay the seller by bank transfer. That is how both sides stay safe.</span>
      </div>

      <div className="mkt-ftr-legal">
        <span>© 2026 BundledMum Ltd, Lagos, Nigeria.</span>
        <span>Payments handled by Paystack. Prices in naira.</span>
      </div>
    </footer>
  );
}
