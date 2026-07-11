import { Link, useNavigate } from "react-router-dom";
import Seo from "@/components/Seo";
import { useCart, fmt, getBrandForBudget, getMissingVariantAxes } from "@/lib/cart";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useAllProducts, useTestimonials, useSiteSettings, useBundles } from "@/hooks/useSupabaseData";
import type { Product } from "@/lib/supabaseAdapters";
import ProductImage from "@/components/ProductImage";
import QtyControl from "@/components/QtyControl";
import HomeQuiz from "@/components/home/HomeQuiz";
import ShopShortcuts from "@/components/home/ShopShortcuts";
import FeaturedProductsRail from "@/components/home/FeaturedProductsRail";
import HowItWorksSection from "@/components/home/HowItWorksSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import TrustBarDb from "@/components/home/TrustBar";
import HeroVideoBackground from "@/components/home/HeroVideoBackground";
import PrototypeHome from "@/components/home/PrototypeHome";
import { useHomepageSections, type HomepageSection } from "@/hooks/useHomepage";
import { Search } from "lucide-react";

/**
 * Compact search input rendered inside the hero — routes to /shop?q=…
 * where the Shop page already reads the q param into its search state.
 */
function HeroSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const v = q.trim();
        if (!v) return navigate("/shop");
        navigate(`/shop?q=${encodeURIComponent(v)}`);
      }}
      className="animate-fade-up-3 relative mb-4 max-w-[480px]"
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search products, bundles, brands…"
        className="w-full pl-9 pr-20 py-3 rounded-pill bg-primary-foreground/95 text-foreground placeholder:text-text-light text-sm text-ellipsis outline-none focus:ring-2 focus:ring-coral"
      />
      <button
        type="submit"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-coral text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-pill hover:bg-coral-dark"
      >
        Search
      </button>
    </form>
  );
}

function HeroSection() {
  const { data: settings } = useSiteSettings();
  const { data: sections } = useHomepageSections();
  const navigate = useNavigate();

  const heroBadge = settings?.hero_badge || "";
  const heroTitle = settings?.hero_title || "";
  const trustStats: string[][] = Array.isArray(settings?.trust_stats) ? settings.trust_stats : [];

  // Hero-level toggles from homepage_sections.settings (JSONB).
  //
  // Two things to keep apart:
  //   1. "We don't have data yet" — sections is still undefined. We must
  //      render the bar hidden, otherwise it pops in and then pops out
  //      as soon as the DB row arrives with show_search:false (FOUC).
  //   2. "Data loaded but the row never set the key" — the row exists,
  //      show_search is undefined. Treat that as visible (the original
  //      intent of the "default true" comment).
  const heroRow = sections ? sections.find(s => s.section_key === "hero") : undefined;
  const heroSettings = (heroRow?.settings || {}) as Record<string, any>;
  // Only true once sections have actually loaded AND the row hasn't
  // explicitly disabled the bar. While `sections` is undefined we
  // render nothing, so the bar can't flash.
  const showSearch = sections != null && heroSettings.show_search !== false;

  return (
    <section className="md:h-screen md:min-h-[720px] md:max-h-[1000px] flex items-center relative overflow-hidden" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 55%, #163D2E 100%)" }}>
      {/* Desktop-only ambient YouTube background — sits behind the green tint overlay */}
      <div className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <HeroVideoBackground videoId="Cy2yQuAKfus" />
        {/* Green tint overlay — keeps the brand color dominant, video stays faint but noticeable */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(45,106,79,0.82) 0%, rgba(30,92,68,0.85) 55%, rgba(22,61,46,0.88) 100%)" }} />
      </div>
      <div className="absolute w-[700px] h-[700px] rounded-full bg-primary-foreground/[0.025] -top-[250px] -right-[250px]" />

      <div className="max-w-[1200px] mx-auto px-5 md:px-10 pt-20 md:pt-24 pb-10 md:pb-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-[56px] items-center w-full">
        <div>
          {heroBadge && (
            <div className="animate-fade-up inline-flex items-center gap-2 bg-coral/[0.18] border border-coral/40 rounded-pill px-4 py-1.5 mb-4">
              <span className="text-coral text-xs font-semibold">{heroBadge}</span>
            </div>
          )}
          {heroTitle && (
            <h1 className="pf animate-fade-up-2 text-[26px] md:text-[38px] font-bold text-primary-foreground leading-[1.15] mb-2.5">
              {/* Mobile: show only the first comma-separated segment, with a full stop */}
              <span className="md:hidden">{heroTitle.split(",")[0].trim()}.</span>
              {/* Desktop: full heading with last segment italic coral */}
              <span className="hidden md:inline">
                {heroTitle.split(",").map((part: string, i: number) =>
                  i === heroTitle.split(",").length - 1
                    ? <span key={i} className="text-coral italic">{part.trim()}</span>
                    : <span key={i}>{part.trim()},<br /></span>
                )}
              </span>
            </h1>
          )}
          <p className="animate-fade-up-3 text-primary-foreground/70 text-[13px] md:text-[15px] leading-[1.65] mb-4 max-w-[480px] font-body">
            Shop baby essentials, mum items, and bundles & kits without stepping foot in any market.
          </p>

          {/* Homepage search — submits to /shop?q=… which the Shop page
              already reads to pre-populate its search input. Gated by
              homepage_sections.hero.settings.show_search. */}
          {showSearch && <HeroSearch />}

          {trustStats.length > 0 && (
            <div className="animate-fade-up-4 hidden md:flex gap-6 md:gap-8 pt-3 border-t border-primary-foreground/10">
              {trustStats.map(([v, l]: string[]) => (
                <div key={l}><div className="pf text-lg md:text-[22px] font-bold text-coral leading-none">{v}</div><div className="text-primary-foreground/50 text-[11px] mt-0.5">{l}</div></div>
              ))}
            </div>
          )}
        </div>

        {/* Embedded quiz — replaces the old static bundle card on both mobile + desktop */}
        <div className="animate-fade-up-3">
          <HomeQuiz
            onSubmit={(answers) => {
              // On Home, advancing from screen 1 routes to /quiz with the
              // answers seeded so the WhatsApp + Results screens render
              // on the /quiz route instead of overlaying the home page.
              navigate("/quiz", { state: { answers, autoAdvance: "whatsapp" } });
            }}
          />
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  const { data: settings } = useSiteSettings();
  const items: string[] = Array.isArray(settings?.trust_strip) ? settings.trust_strip : [];

  if (items.length === 0) return null;

  return (
    <section className="bg-warm-cream border-y border-border py-4 overflow-x-auto">
      <div className="flex gap-6 md:gap-10 justify-center items-center px-5 min-w-max mx-auto">
        {items.map((item: string) => (
          <span key={item} className="text-text-med text-xs md:text-sm font-semibold font-body whitespace-nowrap">{item}</span>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { data: settings } = useSiteSettings();
  const steps: { num: string; icon: string; title: string; desc: string }[] = Array.isArray(settings?.how_it_works) ? settings.how_it_works : [];

  if (steps.length === 0) return null;

  return (
    <section className="py-16 md:py-24 bg-card">
      <div className="max-w-[1200px] mx-auto px-5 md:px-10">
        <div className="text-center mb-10 md:mb-14">
          <span className="text-coral text-xs font-semibold uppercase tracking-widest">Simple Process</span>
          <h2 className="pf text-2xl md:text-[42px] text-forest mt-2">How BundledMum Works</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.num} className="relative bg-card border border-border rounded-[20px] p-6 md:p-8 text-center">
              <div className="absolute top-3 left-4 text-[56px] font-bold text-forest/[0.06] pf leading-none">{s.num}</div>
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-forest-light flex items-center justify-center text-3xl relative z-10">{s.icon}</div>
              <h3 className="font-bold text-lg mb-2 relative z-10">{s.title}</h3>
              <p className="text-text-med text-sm leading-relaxed relative z-10">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-8">
          <Link to="/quiz" className="rounded-pill bg-coral px-8 py-3.5 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive text-sm inline-block">Start the Quiz →</Link>
        </div>
      </div>
    </section>
  );
}

function BundleTiers() {
  const { data: settings } = useSiteSettings();
  const tiers: { icon: string; name: string; range: string; tagline: string; items: string; popular: boolean }[] = Array.isArray(settings?.bundle_tiers) ? settings.bundle_tiers : [];

  if (tiers.length === 0) return null;

  return (
    <section className="py-16 md:py-24" style={{ background: "linear-gradient(135deg, #2D6A4F 0%, #1E5C44 100%)" }}>
      <div className="max-w-[1100px] mx-auto px-5 md:px-10">
        <div className="text-center mb-10 md:mb-14">
          <span className="text-coral text-xs font-semibold uppercase tracking-widest">Bundles & Kits</span>
          <h2 className="pf text-2xl md:text-[42px] text-primary-foreground mt-2">Shop by Budget</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-end">
          {tiers.map((t, idx) => (
            <div key={t.name} className={`rounded-[20px] p-6 md:p-8 text-center relative ${t.popular ? "bg-forest-light md:scale-105 md:-my-2 border-2 border-forest" : "bg-primary-foreground/[0.07] border border-primary-foreground/10"}`}>
              {t.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-coral text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-pill">✦ Most Popular</div>
              )}
              <div className="text-4xl mb-3">{t.icon}</div>
              <h3 className={`pf text-xl font-bold mb-1 ${t.popular ? "text-forest" : "text-primary-foreground"}`}>{t.name}</h3>
              <div className={`text-2xl font-bold pf mb-2 ${t.popular ? "text-forest" : "text-coral"}`}>
                {idx === 0 ? "₦178,000 – ₦400,000" : idx === 1 ? "₦400,000 – ₦900,000" : "₦900,000 – ₦2,500,000"}
              </div>
              <p className={`text-sm mb-1 ${t.popular ? "text-text-med" : "text-primary-foreground/60"}`}>{t.tagline}</p>
              <p className={`text-xs mb-4 ${t.popular ? "text-text-light" : "text-primary-foreground/40"}`}>{t.items}</p>
              <Link to="/quiz" className={`inline-block rounded-pill px-6 py-2.5 font-body font-semibold text-sm interactive ${t.popular ? "bg-forest text-primary-foreground hover:bg-forest-deep" : "bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"}`}>
                Build This Bundle →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedProducts() {
  const { addToCart, cart, setCart, updateQty } = useCart();
  const navigate = useNavigate();
  const { data: allProducts, isLoading } = useAllProducts();
  const { data: settings } = useSiteSettings();

  const heading = settings?.most_loved_heading || "Our Most Loved Items";
  const featured = (allProducts || []).filter(p => p.badge || p.rating >= 4.8).slice(0, 4);

  if (isLoading || featured.length === 0) {
    return (
      <section className="py-16 md:py-24 bg-background">
        <div className="max-w-[1200px] mx-auto px-5 md:px-10">
          <div className="text-center mb-10">
            <span className="text-coral text-xs font-semibold uppercase tracking-widest">Shop</span>
            <h2 className="pf text-2xl md:text-[42px] text-forest mt-2">{heading}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-card rounded-card shadow-card h-[320px] animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const deliveryText = settings?.delivery_text || "";

  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="max-w-[1200px] mx-auto px-5 md:px-10">
        <div className="flex justify-between items-end mb-10 flex-col md:flex-row gap-3">
          <div>
            <span className="text-coral text-xs font-semibold uppercase tracking-widest">Shop</span>
            <h2 className="pf text-2xl md:text-[42px] text-forest mt-2">{heading}</h2>
          </div>
          <Link to="/shop" className="rounded-pill border-2 border-forest text-forest px-5 py-2.5 font-body font-semibold text-sm hover:bg-forest/5 interactive w-full md:w-auto text-center">See All Products →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
          {featured.map(p => {
            const brand = getBrandForBudget(p, "standard");
            if (!brand) return null;
            const isInCart = cart.some(c => c.id === p.id);
            const cartItem = cart.find(c => c.id === p.id);
            return (
              <div key={p.id} className="bg-card rounded-card shadow-card card-hover overflow-hidden relative">
                <div className="h-[170px] flex items-center justify-center relative overflow-hidden" style={{ background: p.imageUrl ? '#f5f5f5' : `linear-gradient(135deg, ${brand.color}, #fff)` }}>
                  {p.badge && (
                    <div className="absolute top-2.5 left-2.5 text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-pill uppercase bg-coral z-10">{p.badge}</div>
                  )}
                  <ProductImage imageUrl={p.imageUrl} emoji={brand.img} alt={p.name} className="w-full h-full" emojiClassName="text-6xl" />
                </div>
                <div className="p-4">
                  <h3 className="text-[13px] font-semibold mb-2 leading-tight min-h-[36px]">{p.name}</h3>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-coral text-xs">⭐ {p.rating}</span>
                    <span className="text-text-light text-[11px]">({p.reviews})</span>
                  </div>
                  {deliveryText && <p className="text-text-light text-[9px] mb-2">{deliveryText}</p>}
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-forest font-bold text-[17px]">{fmt(brand.price)}</span>
                      {p.brands.length > 1 && <div className="text-text-light text-[10px]">from {fmt(Math.min(...p.brands.map(b => b.price)))}</div>}
                    </div>
                    {isInCart && cartItem ? (
                      <QtyControl qty={cartItem.qty} onUpdate={(newQty) => updateQty(cartItem._key, newQty)} maxQty={brand.stockQuantity ?? undefined} />
                    ) : (
                      <button onClick={() => {
                        // Route variant-requiring products to their page to pick.
                        const missing = getMissingVariantAxes(p);
                        if (missing.length) {
                          const label = missing.length === 2 ? "a size & colour" : missing[0] === "color" ? "a colour" : "a size";
                          if (p.slug) { navigate(`/products/${p.slug}`); toast(`Choose ${label} for ${p.name}`); }
                          else toast.error(`Please choose ${label} for ${p.name} on its product page.`);
                          return;
                        }
                        const added = addToCart({ ...p, selectedBrand: brand, price: brand.price, name: `${p.name} (${brand.label})` });
                        if (added) toast.success(`✓ ${p.name} added to cart`, { action: { label: "View Cart →", onClick: () => window.location.href = "/cart" } });
                      }}
                        className="rounded-pill bg-forest px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-forest-deep font-body interactive">+ Add</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Legacy in-file testimonials — superseded by @/components/home/TestimonialsSection
// which is DB-driven. Kept for reference; not rendered from the new router.
function _LegacyTestimonialsSection() {
  const { data: testimonials } = useTestimonials(true);
  const { data: settings } = useSiteSettings();

  const heading = settings?.testimonials_heading || "Mums Who Bundled With Us";
  const whatsapp = settings?.whatsapp_number || "";

  if (!testimonials || testimonials.length === 0) return null;

  const items = testimonials.map(t => ({ name: t.customer_name, loc: t.customer_city.replace(", Nigeria", ""), stars: t.rating || 5, text: t.quote }));

  return (
    <section className="py-16 md:py-24" style={{ background: "#2D6A4F" }}>
      <div className="max-w-[1100px] mx-auto px-5 md:px-10">
        <div className="text-center mb-10 md:mb-14">
          <span className="text-coral text-xs font-semibold uppercase tracking-widest">Real Stories</span>
          <h2 className="pf text-2xl md:text-[42px] text-primary-foreground mt-2">{heading}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 md:gap-6">
          {items.map((t, i) => (
            <div key={i} className="bg-primary-foreground/[0.09] border border-primary-foreground/[0.11] rounded-[20px] p-5 md:p-8">
              <div className="text-coral text-base mb-3">{"⭐".repeat(t.stars)}</div>
              <p className="text-primary-foreground/80 leading-[1.8] text-sm mb-4 italic">"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-coral rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">{t.name[0]}</div>
                <div>
                  <div className="text-primary-foreground font-semibold text-sm">{t.name}</div>
                  <div className="text-primary-foreground/45 text-xs">— {t.loc}, Nigeria</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-8 space-y-3">
          <p className="text-primary-foreground/50 text-sm">Know someone expecting? Tell them about BundledMum</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => {
              const text = "Hey! I found this amazing site that curates hospital bags for Nigerian mums. Check it out: https://bundledmum.com/?ref=testimonial_share";
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
            }} className="rounded-pill bg-[#25D366] text-primary-foreground px-5 py-2.5 text-xs font-semibold interactive">
              📱 Share on WhatsApp
            </button>
            {whatsapp && (
              <a href={`https://wa.me/${whatsapp}?text=Hi! I want to share my BundledMum experience`} target="_blank" rel="noopener noreferrer"
                className="rounded-pill border border-primary-foreground/30 text-primary-foreground/70 px-5 py-2.5 text-xs font-semibold interactive">
                ✍️ Share Your Story
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function CTABanner() {
  const { data: settings } = useSiteSettings();
  const heading = settings?.cta_heading || "";
  const subtitle = settings?.cta_subtitle || "";
  const buttonText = settings?.cta_button_text || "Start the Quiz →";

  return (
    <section className="py-16 md:py-24 bg-background text-center">
      <div className="max-w-[640px] mx-auto px-5">
        <div className="text-4xl md:text-6xl mb-4">🌿</div>
        {heading && <h2 className="pf text-2xl md:text-[46px] text-forest mb-3.5">{heading}</h2>}
        {subtitle && <p className="text-text-med text-sm md:text-[17px] mb-6 leading-[1.75]">{subtitle}</p>}
        <Link to="/quiz" className="rounded-pill bg-forest px-8 md:px-12 py-4 font-body font-semibold text-primary-foreground hover:bg-forest-deep interactive text-[15px] md:text-base inline-block">{buttonText}</Link>
        <div className="text-text-light text-xs mt-3.5">🔒 No account needed · Results appear instantly</div>
      </div>
    </section>
  );
}

function StickyMobileCTA() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const handler = () => setShow(window.scrollY > 600);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  if (!show) return null;
  return (
    <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 z-[80] bg-card border-t border-border p-3 md:hidden animate-slide-up">
      <Link to="/quiz" className="block w-full rounded-pill bg-coral py-3.5 text-center font-body font-semibold text-primary-foreground text-sm">Build My List →</Link>
    </div>
  );
}

/**
 * Maps a `homepage_sections.section_key` to the component that should
 * render it. Keys unknown to us are ignored, so new sections can be
 * added in the DB first and wired up later without breaking.
 */
function renderSection(s: HomepageSection) {
  const settings = (s.settings || {}) as Record<string, any>;
  const maxItems = Number(settings.max_items) || undefined;
  switch (s.section_key) {
    case "hero":              return <HeroSection key={s.id} />;
    case "trust_bar":         return <TrustBarDb key={s.id} title={s.title} />;
    case "bundle_tiers":      return <ShopShortcuts key={s.id} />; // the 2x2 category/bundle grid
    case "featured_products":
    case "most_loved":        return <FeaturedProductsRail key={s.id} title={s.title} subtitle={s.subtitle} maxItems={maxItems} />;
    case "how_it_works":      return <HowItWorksSection key={s.id} title={s.title} subtitle={s.subtitle} />;
    case "testimonials":      return <TestimonialsSection key={s.id} title={s.title} subtitle={s.subtitle} maxItems={maxItems} />;
    default:                  return null;
  }
}

export default function HomePage() {
  useEffect(() => { document.title = "BundledMum — ...making being a mum easier."; }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      try { localStorage.setItem("bm-referral-from", ref); } catch {}
    }
  }, []);

  const { data: sections, isLoading } = useHomepageSections();
  const { data: settings } = useSiteSettings();

  // If the DB hasn't responded yet (or the table is empty), render the
  // minimal skeleton: Hero + ShopShortcuts. This preserves the old
  // behaviour for cold loads and guarantees the page never renders
  // blank.
  // PREVIEW: the "BundledMum Prototype" homepage layout replaces the DB-ordered
  // section list. Text still comes from the DB (hero_title, bundles, prices);
  // only the prototype-new sections are placeholders (see PrototypeHome).
  if (isLoading || !sections || sections.length === 0) {
    return (
      <>
        <PrototypeHome />
        <StickyMobileCTA />
      </>
    );
  }

  // Build FAQPage JSON-LD from the How It Works steps (each step's title
  // becomes the question, description the answer). Falls back to a static
  // pair when settings haven't loaded yet so the homepage still ships
  // something for rich snippets.
  const howSteps: { title: string; desc: string }[] = Array.isArray((settings as any)?.how_it_works)
    ? ((settings as any).how_it_works as any[]).map(s => ({ title: s.title, desc: s.desc }))
    : [];

  const jsonLd: Record<string, any>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "BundledMum",
      url: "https://bundledmum.com",
      logo: "https://bundledmum.com/src/assets/logos/BM-ICON-GREEN.svg",
      sameAs: ["https://www.instagram.com/bundledmum"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "BundledMum",
      url: "https://bundledmum.com",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://bundledmum.com/shop?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
  ];
  if (howSteps.length > 0) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: howSteps.map(s => ({
        "@type": "Question",
        name: s.title,
        acceptedAnswer: { "@type": "Answer", text: s.desc },
      })),
    });
  }

  return (
    <>
      <Seo
        title="BundledMum — Hospital Bags & Baby Bundles for Nigerian Mums"
        description="Curated maternity and baby bundles for Nigerian mums. Take the quiz, shop pre-packed hospital bags, or build your own. Delivered in Lagos within 48 hours."
        jsonLd={jsonLd}
      />
      <PrototypeHome />
      <StickyMobileCTA />
    </>
  );
}
