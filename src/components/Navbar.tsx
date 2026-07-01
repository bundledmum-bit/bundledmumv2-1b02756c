import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShoppingBag, X, User, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useProductCategories } from "@/hooks/useProductCategories";
import logoGreen from "@/assets/logos/BM-LOGO-GREEN.svg";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { useSubscriptionSettings } from "@/hooks/useSubscription";

// Hardcoded bundle sub-nav: these match the named routes in App.tsx and do
// not need a DB field since bundle categories are not managed via
// product_categories.
const BUNDLE_LINKS = [
  { label: "Baby Shower Gift Boxes", href: "/bundles/baby-shower-gift-boxes" },
  { label: "Postpartum Recovery Kits", href: "/bundles/postpartum-recovery-kits" },
  { label: "Maternity Bundles", href: "/bundles/maternity-bundles" },
];

// Desktop flyout panel -- shared for all dropdowns.
function DropdownPanel({
  children,
  onMouseEnter,
  onMouseLeave,
  wide,
}: {
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  wide?: boolean;
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`absolute top-full left-0 mt-1 bg-card border border-border rounded-[16px] shadow-[0_8px_32px_-8px_rgba(32,37,26,0.18)] py-3 z-[200] ${wide ? "w-[520px]" : "min-w-[200px] py-1.5"}`}
    >
      {children}
    </div>
  );
}

function DropdownLink({ to, label, icon }: { to: string; label: string; icon?: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-foreground hover:bg-forest-light hover:text-forest rounded-xl mx-1 transition-colors"
    >
      {icon && <span className="text-base leading-none">{icon}</span>}
      {label}
    </Link>
  );
}

// Wide 2-column mega-panel for "Shop All" showing every category.
function ShopMegaPanel({
  babySubcats,
  mumSubcats,
  onMouseEnter,
  onMouseLeave,
}: {
  babySubcats: Array<{ id: string; name: string; slug: string; icon?: string | null }>;
  mumSubcats: Array<{ id: string; name: string; slug: string; icon?: string | null }>;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <DropdownPanel wide onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {/* Top: All Products */}
      <Link
        to="/shop"
        className="flex items-center justify-between px-4 py-2.5 text-[13px] font-bold text-forest hover:bg-forest-light rounded-xl mx-1 mb-1 transition-colors"
      >
        All Products
        <span className="text-[11px] text-muted-foreground font-normal">Browse everything</span>
      </Link>
      <div className="mx-4 border-t border-border mb-3" />

      {/* Two columns */}
      <div className="grid grid-cols-2 gap-0 px-2">
        {/* Baby column */}
        <div className="pr-3 border-r border-border">
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Baby</span>
            <span>👶</span>
          </div>
          <Link
            to="/shop/baby"
            className="block px-3 py-2 text-[12px] font-bold text-foreground hover:bg-forest-light hover:text-forest rounded-xl transition-colors mb-0.5"
          >
            All Baby Products
          </Link>
          {babySubcats.map((c) => (
            <Link
              key={c.id}
              to={`/shop/baby?category=${c.slug}`}
              className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-forest hover:bg-forest-light rounded-xl transition-colors"
            >
              {c.icon && <span className="text-sm">{c.icon}</span>}
              {c.name}
            </Link>
          ))}
        </div>

        {/* Mum column */}
        <div className="pl-3">
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mum</span>
            <span>💛</span>
          </div>
          <Link
            to="/shop/mum"
            className="block px-3 py-2 text-[12px] font-bold text-foreground hover:bg-forest-light hover:text-forest rounded-xl transition-colors mb-0.5"
          >
            All Mum Products
          </Link>
          {mumSubcats.map((c) => (
            <Link
              key={c.id}
              to={`/shop/mum?category=${c.slug}`}
              className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-forest hover:bg-forest-light rounded-xl transition-colors"
            >
              {c.icon && <span className="text-sm">{c.icon}</span>}
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </DropdownPanel>
  );
}

// Mobile drawer accordion section -- label row + collapsible children.
function AccordionSection({
  label,
  href,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  href: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/60">
      <div className="flex items-center">
        <Link to={href} className="flex-1 px-5 py-3.5 text-[15px] font-semibold text-foreground hover:text-forest transition-colors">
          {label}
        </Link>
        <button
          onClick={onToggle}
          aria-label={isOpen ? "Collapse" : "Expand"}
          className="px-4 py-3.5 text-muted-foreground"
        >
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </div>
      {isOpen && (
        <div className="bg-background pb-1">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Navbar({ topOffset = 0 }: { topOffset?: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [bumping, setBumping] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { totalItems, justAdded } = useCart();
  const { isLoggedIn } = useCustomerAuth();
  const location = useLocation();
  const { data: settings } = useSiteSettings();
  const { data: subSettings } = useSubscriptionSettings();
  const { data: categories = [] } = useProductCategories();

  const contactEmail = settings?.contact_email || "";
  const showSubscribe = subSettings?.subscription_enabled === true;

  // Subcategories from DB, grouped by parent.
  const babySubcats = categories.filter(
    (c) => c.parent_category === "baby" || c.parent_category === "both"
  );
  const mumSubcats = categories.filter(
    (c) => c.parent_category === "mum" || c.parent_category === "both"
  );

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Close mobile drawer on route change.
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    if (!menuOpen) setExpandedSection(null);
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    const handler = () => {
      setBumping(true);
      setTimeout(() => setBumping(false), 400);
    };
    window.addEventListener("cart-bump", handler);
    return () => window.removeEventListener("cart-bump", handler);
  }, []);

  // Clean up close timer on unmount.
  useEffect(() => {
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); };
  }, []);

  const openDropdown = (key: string) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setActiveDropdown(key);
  };

  const scheduleClose = () => {
    closeTimerRef.current = setTimeout(() => setActiveDropdown(null), 120);
  };

  const toggleSection = (key: string) =>
    setExpandedSection((prev) => (prev === key ? null : key));

  const cartBadge = totalItems > 0 && (
    <span
      className={`absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-coral text-[9px] font-bold text-white ${justAdded ? "animate-pulse-badge" : ""}`}
    >
      {totalItems}
    </span>
  );

  return (
    <>
      {/* Sticky bar */}
      <nav
        style={{ top: topOffset }}
        className={`fixed left-0 right-0 z-[1000] bg-warm-cream backdrop-blur-sm border-b border-border transition-shadow duration-200 ${scrolled ? "shadow-[0_2px_20px_-4px_rgba(32,37,26,0.12)]" : ""}`}
      >
        <div className="max-w-[1280px] mx-auto px-4 md:px-8 flex items-center h-[68px] gap-3">

          {/* Logo */}
          <Link to="/" className="shrink-0 mr-2 md:mr-4">
            <img src={logoGreen} alt="BundledMum" className="h-10 w-auto" />
          </Link>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">

            {/* Primary CTA */}
            <Link
              to="/quiz"
              className="rounded-pill bg-coral text-white px-4 py-2 text-[13px] font-bold hover:bg-coral-dark transition-colors shrink-0 mr-1.5"
            >
              Build My Bundle
            </Link>

            {/* Shop mega-dropdown — all categories in one panel */}
            <div
              className="relative"
              onMouseEnter={() => openDropdown("shop")}
              onMouseLeave={scheduleClose}
            >
              <button
                className={`inline-flex items-center gap-0.5 rounded-pill px-3 py-2 text-[13px] font-semibold transition-colors ${activeDropdown === "shop" ? "bg-forest-light text-forest" : "text-foreground hover:bg-midnight/[0.06]"}`}
              >
                Shop <ChevronDown className={`w-3.5 h-3.5 mt-px transition-transform duration-150 ${activeDropdown === "shop" ? "rotate-180" : ""}`} />
              </button>
              {activeDropdown === "shop" && (
                <ShopMegaPanel
                  babySubcats={babySubcats}
                  mumSubcats={mumSubcats}
                  onMouseEnter={() => openDropdown("shop")}
                  onMouseLeave={scheduleClose}
                />
              )}
            </div>

            {/* Baby with subcategory dropdown */}
            <div
              className="relative"
              onMouseEnter={() => openDropdown("baby")}
              onMouseLeave={scheduleClose}
            >
              <Link
                to="/shop/baby"
                className={`inline-flex items-center gap-0.5 rounded-pill px-3 py-2 text-[13px] font-semibold transition-colors ${activeDropdown === "baby" ? "bg-forest-light text-forest" : "text-foreground hover:bg-midnight/[0.06]"}`}
              >
                Baby <ChevronDown className={`w-3.5 h-3.5 mt-px transition-transform duration-150 ${activeDropdown === "baby" ? "rotate-180" : ""}`} />
              </Link>
              {activeDropdown === "baby" && (
                <DropdownPanel onMouseEnter={() => openDropdown("baby")} onMouseLeave={scheduleClose}>
                  <DropdownLink to="/shop/baby" label="All Baby Products" />
                  {babySubcats.length > 0 && (
                    <div className="mx-4 my-1 border-t border-border" />
                  )}
                  {babySubcats.map((c) => (
                    <DropdownLink key={c.id} to={`/shop/baby?category=${c.slug}`} label={c.name} icon={c.icon ?? undefined} />
                  ))}
                </DropdownPanel>
              )}
            </div>

            {/* Mum with subcategory dropdown */}
            <div
              className="relative"
              onMouseEnter={() => openDropdown("mum")}
              onMouseLeave={scheduleClose}
            >
              <Link
                to="/shop/mum"
                className={`inline-flex items-center gap-0.5 rounded-pill px-3 py-2 text-[13px] font-semibold transition-colors ${activeDropdown === "mum" ? "bg-forest-light text-forest" : "text-foreground hover:bg-midnight/[0.06]"}`}
              >
                Mum <ChevronDown className={`w-3.5 h-3.5 mt-px transition-transform duration-150 ${activeDropdown === "mum" ? "rotate-180" : ""}`} />
              </Link>
              {activeDropdown === "mum" && (
                <DropdownPanel onMouseEnter={() => openDropdown("mum")} onMouseLeave={scheduleClose}>
                  <DropdownLink to="/shop/mum" label="All Mum Products" />
                  {mumSubcats.length > 0 && (
                    <div className="mx-4 my-1 border-t border-border" />
                  )}
                  {mumSubcats.map((c) => (
                    <DropdownLink key={c.id} to={`/shop/mum?category=${c.slug}`} label={c.name} icon={c.icon ?? undefined} />
                  ))}
                </DropdownPanel>
              )}
            </div>

            {/* Bundles with sub-nav dropdown */}
            <div
              className="relative"
              onMouseEnter={() => openDropdown("bundles")}
              onMouseLeave={scheduleClose}
            >
              <Link
                to="/bundles"
                className={`inline-flex items-center gap-0.5 rounded-pill px-3 py-2 text-[13px] font-semibold transition-colors ${activeDropdown === "bundles" ? "bg-forest-light text-forest" : "text-foreground hover:bg-midnight/[0.06]"}`}
              >
                Bundles <ChevronDown className={`w-3.5 h-3.5 mt-px transition-transform duration-150 ${activeDropdown === "bundles" ? "rotate-180" : ""}`} />
              </Link>
              {activeDropdown === "bundles" && (
                <DropdownPanel onMouseEnter={() => openDropdown("bundles")} onMouseLeave={scheduleClose}>
                  <DropdownLink to="/bundles" label="All Bundles & Kits" />
                  <div className="mx-4 my-1 border-t border-border" />
                  {BUNDLE_LINKS.map((l) => (
                    <DropdownLink key={l.href} to={l.href} label={l.label} />
                  ))}
                </DropdownPanel>
              )}
            </div>

            {/* Direct links */}
            <Link
              to="/hospital-list"
              className="rounded-pill px-3 py-2 text-[13px] font-semibold text-white bg-forest hover:bg-forest-deep transition-colors"
            >
              Hospital Lists
            </Link>

            <Link
              to="/deals"
              className="rounded-pill px-3 py-2 text-[13px] font-semibold text-coral hover:bg-coral-blush transition-colors"
            >
              Deals
            </Link>

            <Link
              to="/push-gifts"
              className="rounded-pill px-3 py-2 text-[13px] font-semibold text-foreground hover:bg-midnight/[0.06] transition-colors"
            >
              Push Gifts
            </Link>

            {showSubscribe && (
              <Link
                to="/subscribe"
                className="rounded-pill px-3 py-2 text-[13px] font-semibold text-foreground hover:bg-midnight/[0.06] transition-colors"
              >
                Subscribe
              </Link>
            )}
          </div>

          {/* Desktop icon cluster: search / account / cart */}
          <div className="hidden md:flex items-center gap-0.5 shrink-0 ml-auto">
            <Link
              to="/shop"
              aria-label="Search"
              className="w-9 h-9 inline-flex items-center justify-center rounded-full text-foreground hover:bg-midnight/[0.06] transition-colors"
            >
              <Search className="w-[18px] h-[18px]" />
            </Link>
            <Link
              to={isLoggedIn ? "/account" : "/account/login"}
              aria-label={isLoggedIn ? "My Account" : "Sign In"}
              className="w-9 h-9 inline-flex items-center justify-center rounded-full text-foreground hover:bg-midnight/[0.06] transition-colors"
            >
              <User className="w-[18px] h-[18px]" fill={isLoggedIn ? "currentColor" : "none"} />
            </Link>
            <Link
              to="/cart"
              aria-label="Cart"
              className="relative w-9 h-9 inline-flex items-center justify-center rounded-full text-foreground hover:bg-midnight/[0.06] transition-colors"
            >
              <ShoppingBag className={`w-[18px] h-[18px] transition-transform duration-300 ${bumping ? "scale-125" : "scale-100"}`} />
              {cartBadge}
            </Link>
          </div>

          {/* Mobile icon cluster: search / cart / hamburger */}
          <div className="flex md:hidden items-center gap-0.5 ml-auto shrink-0">
            <Link
              to="/shop"
              aria-label="Search"
              className="w-9 h-9 inline-flex items-center justify-center rounded-full text-foreground"
            >
              <Search className="w-[18px] h-[18px]" />
            </Link>
            <Link
              to="/cart"
              aria-label="Cart"
              className="relative w-9 h-9 inline-flex items-center justify-center rounded-full text-foreground"
            >
              <ShoppingBag className={`w-5 h-5 transition-transform duration-300 ${bumping ? "scale-125" : "scale-100"}`} />
              {cartBadge}
            </Link>
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="w-9 h-9 flex flex-col items-center justify-center gap-[5px]"
            >
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-[22px] h-[2px] rounded-sm bg-foreground" />
              ))}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-midnight/40 z-[1001] animate-fade-in"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Mobile drawer panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 w-[300px] max-w-[92vw] bg-card z-[1002] flex flex-col shadow-[-12px_0_40px_rgba(32,37,26,0.18)] transition-transform duration-300 ease-out ${menuOpen ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!menuOpen}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <img src={logoGreen} alt="BundledMum" className="h-8 w-auto" />
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer scrollable body */}
        <div className="flex-1 overflow-y-auto py-3">

          {/* Primary CTA */}
          <div className="px-4 pb-4">
            <Link
              to="/quiz"
              className="block text-center rounded-pill bg-coral py-3.5 text-[15px] font-bold text-white hover:bg-coral-dark transition-colors"
            >
              Build My Bundle →
            </Link>
          </div>

          {/* All Products flat link */}
          <Link
            to="/shop"
            className="flex items-center justify-between px-5 py-3.5 text-[15px] font-bold text-forest border-b border-border/50 hover:bg-forest-light transition-colors"
          >
            All Products
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </Link>

          {/* Accordion sections with subcategory links from DB */}
          <AccordionSection
            label="Baby"
            href="/shop/baby"
            isOpen={expandedSection === "baby"}
            onToggle={() => toggleSection("baby")}
          >
            {babySubcats.map((c) => (
              <Link
                key={c.id}
                to={`/shop/baby?category=${c.slug}`}
                className="flex items-center gap-2 px-5 py-2.5 text-[14px] text-muted-foreground font-medium hover:text-forest transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-forest/40 shrink-0" />
                {c.name}
              </Link>
            ))}
          </AccordionSection>

          <AccordionSection
            label="Mum"
            href="/shop/mum"
            isOpen={expandedSection === "mum"}
            onToggle={() => toggleSection("mum")}
          >
            {mumSubcats.map((c) => (
              <Link
                key={c.id}
                to={`/shop/mum?category=${c.slug}`}
                className="flex items-center gap-2 px-5 py-2.5 text-[14px] text-muted-foreground font-medium hover:text-forest transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-forest/40 shrink-0" />
                {c.name}
              </Link>
            ))}
          </AccordionSection>

          <AccordionSection
            label="Bundles & Kits"
            href="/bundles"
            isOpen={expandedSection === "bundles"}
            onToggle={() => toggleSection("bundles")}
          >
            {BUNDLE_LINKS.map((l) => (
              <Link
                key={l.href}
                to={l.href}
                className="flex items-center gap-2 px-5 py-2.5 text-[14px] text-muted-foreground font-medium hover:text-forest transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-forest/40 shrink-0" />
                {l.label}
              </Link>
            ))}
          </AccordionSection>

          {/* Flat links row */}
          <div className="mt-1">
            {[
              { to: "/hospital-list", label: "Hospital Lists", variant: "highlight" },
              { to: "/deals", label: "Flash Deals", variant: "accent" },
              { to: "/push-gifts", label: "Push Gifts", variant: "default" },
              ...(showSubscribe ? [{ to: "/subscribe", label: "Subscribe", variant: "default" as const }] : []),
              {
                to: isLoggedIn ? "/account" : "/account/login",
                label: isLoggedIn ? "My Account" : "Sign In",
                variant: "default" as const,
              },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`flex items-center justify-between px-5 py-3.5 text-[15px] font-semibold border-b border-border/50 hover:bg-forest-light transition-colors ${l.variant === "highlight" ? "text-forest" : l.variant === "accent" ? "text-coral" : "text-foreground"}`}
              >
                {l.label}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>

        {/* Drawer footer */}
        <div className="px-5 py-4 border-t border-border bg-background shrink-0">
          <p className="text-[11px] text-muted-foreground mb-0.5">Need help?</p>
          <p className="text-sm font-semibold text-foreground">
            {contactEmail || "hello@bundledmum.ng"}
          </p>
        </div>
      </div>
    </>
  );
}
