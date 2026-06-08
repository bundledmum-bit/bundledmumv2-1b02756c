import { useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, Menu, X, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import logoWhite from "@/assets/logos/logo-white.png";
import logoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { useSubscriptionSettings } from "@/hooks/useSubscription";

export default function Navbar({ topOffset = 0 }: { topOffset?: number }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bumping, setBumping] = useState(false);
  const { totalItems, justAdded } = useCart();
  const { isLoggedIn } = useCustomerAuth();
  const location = useLocation();
  const { data: settings } = useSiteSettings();
  const { data: subSettings } = useSubscriptionSettings();
  const contactEmail = settings?.contact_email || "";
  // Default-hidden: only show the Subscribe link when we've confirmed
  // the programme is enabled. While the settings query loads, the link
  // stays out so it can't flash on then disappear.
  const showSubscribe = subSettings?.subscription_enabled === true;

  const isHome = location.pathname === "/";

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => setMenuOpen(false), [location]);

  // Cart-icon bump: fired by article product adds (window 'cart-bump'
  // event) so the existing cart icon animates instead of a new floating
  // CTA. Resting state is unchanged — only a brief scale pulse on add.
  useEffect(() => {
    const handler = () => {
      setBumping(true);
      setTimeout(() => setBumping(false), 400);
    };
    window.addEventListener("cart-bump", handler);
    return () => window.removeEventListener("cart-bump", handler);
  }, []);

  const onLight = !isHome;
  const dark = scrolled || onLight;

  const navLinks = [
    { to: "/bundles", label: "Bundles & Kits" },
    { to: "/shop", label: "All Shop" },
    { to: "/shop/baby", label: "Baby Shop" },
    { to: "/shop/mum", label: "Mum Shop" },
    ...(showSubscribe ? [{ to: "/subscribe", label: "Subscribe 🔄" }] : []),
    { to: "/push-gifts", label: "Push Gifts 💝" },
  ];

  return (
    <>
      <nav style={{ top: topOffset }} className={`fixed left-0 right-0 z-[1000] transition-all duration-300 ${dark ? "bg-warm-cream/95 backdrop-blur-sm border-b border-border" : "bg-transparent"}`}>
        <div className="max-w-[1200px] mx-auto flex items-center justify-between h-[68px] px-5 md:px-10">
          <Link to="/" className="flex-shrink-0">
            <img src={dark ? logoGreen : logoWhite} alt="BundledMum" className="h-11 w-auto transition-all" />
          </Link>

          <div className="hidden md:flex items-center gap-1.5">
            <Link to="/quiz" className="rounded-pill bg-coral px-5 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-coral-dark interactive font-body">Build My Bundle</Link>
            {navLinks.map(l => (
              <Link key={l.to} to={l.to} className={`rounded-pill px-3.5 py-2 text-[13px] font-semibold transition-colors font-body ${dark ? "text-foreground hover:bg-midnight/[0.07]" : "text-primary-foreground hover:bg-primary-foreground/10"}`}>
                {l.label}
              </Link>
            ))}
            <Link
              to={isLoggedIn ? "/account" : "/account/login"}
              className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-[13px] font-semibold transition-colors font-body ${dark ? "text-foreground hover:bg-midnight/[0.07]" : "text-primary-foreground hover:bg-primary-foreground/10"}`}
            >
              <User className="w-4 h-4" fill={isLoggedIn ? "currentColor" : "none"} />
              {isLoggedIn ? "My Account" : "Sign In"}
            </Link>
            <Link to="/cart" className="relative ml-1 p-1.5">
              <span className={`text-xl inline-block transition-transform duration-300 ${bumping ? "scale-125" : "scale-100"}`}>🛍️</span>
              {totalItems > 0 && (
                <span className={`absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-coral text-[9px] font-bold text-primary-foreground ${justAdded ? "animate-pulse-badge" : ""}`}>{totalItems}</span>
              )}
            </Link>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <Link to="/cart" className="relative inline-flex items-center justify-center min-h-9 min-w-9">
              <span className={`text-xl inline-block transition-transform duration-300 ${bumping ? "scale-125" : "scale-100"}`}>🛍️</span>
              {totalItems > 0 && (
                <span className={`absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-coral text-[9px] font-bold text-primary-foreground ${justAdded ? "animate-pulse-badge" : ""}`}>{totalItems}</span>
              )}
            </Link>
            <button onClick={() => setMenuOpen(true)} className="min-h-9 min-w-9 flex flex-col items-center justify-center gap-[5px]">
              {[0, 1, 2].map(i => <div key={i} className={`w-[22px] h-[2px] rounded-sm ${dark ? "bg-foreground" : "bg-primary-foreground"}`} />)}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 bg-midnight/50 z-[998] animate-fade-in" onClick={() => setMenuOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-[280px] max-w-[85vw] bg-card z-[999] p-6 overflow-y-auto animate-slide-down">
            <div className="flex justify-between items-center mb-7">
              <img src={logoGreen} alt="BundledMum" className="h-9 w-auto" />
              <button onClick={() => setMenuOpen(false)} className="text-text-med text-xl leading-none">✕</button>
            </div>
            <Link to="/quiz" className="block w-full text-center rounded-pill bg-coral py-3.5 font-body font-semibold text-primary-foreground mb-5">Build My Bundle →</Link>
            {navLinks.map(l => (
              <Link key={l.to} to={l.to} className="block w-full text-left py-3.5 border-b border-border font-body font-semibold text-base">{l.label}</Link>
            ))}
            <div className="mt-7">
              <div className="text-text-light text-xs mb-2">Contact us</div>
              <div className="text-text-med text-sm">{contactEmail || "hello@bundledmum.ng"}</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
