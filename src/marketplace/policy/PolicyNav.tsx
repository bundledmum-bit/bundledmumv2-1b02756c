import { Link, useLocation } from "react-router-dom";

const LINKS: Array<{ to: string; label: string }> = [
  { to: "/buyer-protection", label: "Buyer protection" },
  { to: "/seller-protection", label: "Seller protection" },
  { to: "/terms", label: "Terms and conditions" },
  { to: "/privacy", label: "Privacy policy" },
  { to: "/cookies", label: "Cookies" },
];

/**
 * Shared nav at the top of every policy page (design 24a, screen 0), so a
 * reader can hop sideways between the five without going back to the
 * footer. Same on all five, current page shown but not a link.
 */
export default function PolicyNav() {
  const { pathname } = useLocation();
  return (
    <div className="mkt-policy-nav">
      <div className="inner">
        <span className="lead">Policies</span>
        <span className="sub">How BundledMum Marketplace works, in writing.</span>
        <nav className="links">
          {LINKS.map((l, i) => (
            <span key={l.to} className="item">
              {pathname === l.to ? (
                <span className="current">{l.label}</span>
              ) : (
                <Link to={l.to}>{l.label}</Link>
              )}
              {i < LINKS.length - 1 && <span className="sep">›</span>}
            </span>
          ))}
        </nav>
      </div>
    </div>
  );
}
