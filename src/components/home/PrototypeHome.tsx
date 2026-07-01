import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";
import { useSiteSettings, useBundles, useAllProducts } from "@/hooks/useSupabaseData";
import { useCart, fmt, getBrandForBudget } from "@/lib/cart";
import ProductImage from "@/components/ProductImage";

/**
 * PREVIEW homepage rebuilt to the "BundledMum Prototype" layout.
 *
 * TEXT POLICY: every real copy string still resolves from the database
 * (site_settings.hero_title / hero_subtitle / cta_button_text, bundles, product
 * prices). Only the two prototype sections that have NO backend field yet
 * (Shop by Category tiles, and the Deals rail heading) are placeholders, marked
 * with TODO + a console.warn, pending the backend fields listed in the audit
 * report (home_categories, deals_product_ids / deals_heading). No em dashes.
 */

// TODO(backend): the Shop-by-Category grid has no admin field. Proposed:
// site_settings.home_categories = [{ label, href, image_url, tone }]. Until then
// these tiles are hardcoded placeholders.
const PLACEHOLDER_CATEGORIES = [
  { label: "Maternity", href: "/shop/mum", tone: "forest" as const, emoji: "\u{1F930}" },
  { label: "Baby", href: "/shop/baby", tone: "forest" as const, emoji: "\u{1F476}" },
  { label: "Bundles", href: "/bundles", tone: "coral" as const, emoji: "\u{1F381}" },
  { label: "Gifts", href: "/bundles/baby-shower-gift-boxes", tone: "coral" as const, emoji: "\u{1F49D}" },
];

function HeroSearchBar() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); navigate(`/shop${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`); }}
      className="relative"
    >
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search for products, bundles & gifts..."
        aria-label="Search"
        className="w-full min-h-[48px] rounded-pill bg-card border border-border pl-11 pr-4 text-sm text-foreground placeholder:text-text-light focus:outline-none focus:border-forest"
      />
    </form>
  );
}

export default function PrototypeHome() {
  const { data: settings } = useSiteSettings();
  const { data: bundles = [] } = useBundles();
  const { data: products = [] } = useAllProducts();
  const { subtotal } = useCart();

  const heroTitle = settings?.hero_title || "Everything for Baby & Mum, In One Place.";
  const heroSubtitle = settings?.hero_subtitle || "Thoughtfully sourced essentials, bundles & gifts for every stage.";
  const bundleCtaLabel = settings?.cta_button_text || "Build My Bundle";

  // Popular bundles (real data), first ~8 for the carousel.
  const popularBundles = (bundles as any[]).slice(0, 8);
  const heroImage = (popularBundles[0]?.imageUrl) || (products as any[]).find((p) => p.imageUrl)?.imageUrl || null;

  // Free-delivery progress from the real cart total + the admin threshold.
  const threshold = parseInt(settings?.free_delivery_nationwide_threshold_naira ?? settings?.default_free_threshold ?? "0", 10) || 0;
  const remaining = Math.max(0, threshold - subtotal);
  const pct = threshold > 0 ? Math.min(100, Math.round((subtotal / threshold) * 100)) : 0;

  // TODO(backend): "Deals for you" has no curated source. Placeholder = products
  // whose selected brand is on sale (compareAtPrice > price); falls back to the
  // first few products. Proposed: site_settings.deals_product_ids + deals_heading.
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn("[preview] Home 'Shop by Category' tiles and 'Deals for you' are placeholders pending backend fields (home_categories, deals). See the audit report.");
  }
  const onSale = (products as any[]).filter((p) => {
    const b = getBrandForBudget(p, "standard");
    return b && b.compareAtPrice && b.compareAtPrice > b.price;
  });
  const deals = (onSale.length > 0 ? onSale : (products as any[])).slice(0, 8);

  return (
    <div className="bg-background min-h-screen pt-[76px]">
      {/* Hero */}
      <section className="px-4 pt-4 pb-2">
        <HeroSearchBar />
        <div className="mt-5">
          <h1 className="text-[30px] leading-[1.15] font-bold text-foreground">{heroTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{heroSubtitle}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/quiz" className="rounded-pill bg-coral text-primary-foreground px-5 py-3 text-sm font-semibold hover:bg-coral-dark transition-colors">
              {bundleCtaLabel}
            </Link>
            <Link to="/shop" className="rounded-pill border border-forest text-forest px-5 py-3 text-sm font-semibold hover:bg-forest/5 transition-colors inline-flex items-center gap-1">
              Shop now <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        {heroImage && (
          <Link to="/bundles" className="mt-5 block rounded-[18px] overflow-hidden border border-border aspect-[16/10] bg-muted">
            <img src={heroImage} alt="Featured" className="w-full h-full object-cover" />
          </Link>
        )}
      </section>

      {/* Shop by Category (placeholder tiles) */}
      <section className="px-4 py-5">
        <h2 className="text-lg font-bold text-foreground mb-3">Shop by Category</h2>
        <div className="grid grid-cols-2 gap-3">
          {PLACEHOLDER_CATEGORIES.map((c) => (
            <Link key={c.label} to={c.href}
              className={`rounded-[14px] border border-border p-4 flex flex-col gap-6 min-h-[104px] justify-between ${c.tone === "coral" ? "bg-coral-blush" : "bg-forest-light"}`}>
              <span className="text-2xl">{c.emoji}</span>
              <span className="font-semibold text-foreground inline-flex items-center gap-1">{c.label} <ArrowRight className="w-3.5 h-3.5" /></span>
            </Link>
          ))}
        </div>
      </section>

      {/* Popular Bundles carousel (real bundles) */}
      {popularBundles.length > 0 && (
        <section className="py-5">
          <div className="px-4 flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-foreground">{settings?.most_loved_heading || "Shop Popular Bundles"}</h2>
            <Link to="/bundles" className="text-xs font-semibold text-forest hover:underline inline-flex items-center gap-0.5">View all <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x scrollbar-none">
            {popularBundles.map((b: any) => (
              <Link key={b.id} to={`/bundles/${b.slug ?? b.id}`}
                className="snap-start shrink-0 w-[190px] rounded-[14px] border border-border bg-card overflow-hidden">
                <div className="aspect-[4/3] bg-muted">
                  {b.imageUrl && <img src={b.imageUrl} alt={b.name} className="w-full h-full object-cover" />}
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">{b.name}</p>
                  {b.price != null && <p className="mt-1 font-mono-price text-forest font-bold text-[15px]">{fmt(b.price)}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Free-delivery progress (real cart + admin threshold) */}
      {threshold > 0 && (
        <section className="px-4 py-3">
          <div className="rounded-[14px] bg-forest text-primary-foreground p-4">
            <p className="text-sm font-semibold">
              {remaining > 0
                ? `You're ${fmt(remaining)} away from free delivery`
                : "You have unlocked free delivery"}
            </p>
            <div className="mt-2 h-2 rounded-pill bg-primary-foreground/20 overflow-hidden">
              <div className="h-full rounded-pill bg-coral transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </section>
      )}

      {/* Deals for you (placeholder heading, real on-sale products) */}
      {deals.length > 0 && (
        <section className="py-5">
          <div className="px-4 flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-foreground">Deals for you</h2>
            <Link to="/shop" className="text-xs font-semibold text-forest hover:underline inline-flex items-center gap-0.5">See all <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x scrollbar-none">
            {deals.map((p: any) => {
              const brand = getBrandForBudget(p, "standard");
              if (!brand) return null;
              const onDeal = brand.compareAtPrice && brand.compareAtPrice > brand.price;
              return (
                <Link key={p.id} to={`/products/${p.slug}`}
                  className="snap-start shrink-0 w-[150px] rounded-[14px] border border-border bg-card overflow-hidden">
                  <div className="aspect-square bg-warm-cream relative">
                    <ProductImage imageUrl={p.imageUrl} emoji={brand.img} alt={p.name} className="w-full h-full" emojiClassName="text-5xl" />
                    {onDeal && (
                      <span className="absolute top-2 left-2 rounded-pill bg-coral text-primary-foreground text-[10px] font-bold px-2 py-0.5">
                        Save {Math.round(((brand.compareAtPrice - brand.price) / brand.compareAtPrice) * 100)}%
                      </span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-semibold text-xs text-foreground line-clamp-2 leading-snug">{p.name}</p>
                    <p className="mt-1 font-mono-price text-forest font-bold text-sm">{fmt(brand.price)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
