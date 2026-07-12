import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ArrowRight } from "lucide-react";
import { useSiteSettings, useBundles, useAllProducts } from "@/hooks/useSupabaseData";
import { useCart, fmt } from "@/lib/cart";
import HeroCarousel, { type HeroSlide } from "@/components/home/HeroCarousel";
import FlashDeals, { useDealProducts } from "@/components/home/FlashDeals";

/**
 * Homepage in the "BundledMum Prototype" layout.
 *
 * Copy and curation resolve from admin settings:
 *   - Hero slides:        site_settings.home_hero_slides (fallback: derived images + hero copy)
 *   - Category tiles:     site_settings.home_categories (fallback image per label)
 *   - Most loved brands:  site_settings.home_loved_baby_brands + home_loved_baby_heading
 *   - Deals:              get_deal_products() gated by deals_enabled, with deals_heading/subtitle/ends_at
 * No em dashes.
 */

// site_settings JSON values may arrive as a parsed array (jsonb) or a JSON
// string; normalise to an array either way.
function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

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

  // Derived imagery used as fallbacks when admin has not configured a field.
  const heroImages = useMemo(() => {
    const imgs: string[] = [];
    (bundles as any[]).forEach((b) => { if (b?.imageUrl) imgs.push(b.imageUrl); });
    const p = (products as any[]).find((x) => x.imageUrl);
    if (p?.imageUrl) imgs.push(p.imageUrl);
    return Array.from(new Set(imgs)).slice(0, 5);
  }, [bundles, products]);

  // Hero slides: admin-curated (home_hero_slides) when present, else a fallback
  // built from real imagery + the DB brand copy so the hero never renders empty.
  const heroSlides: HeroSlide[] = useMemo(() => {
    const configured = asArray(settings?.home_hero_slides)
      .filter((s: any) => s && (s.title || s.image_url_desktop || s.image_url_mobile || s.image_url))
      .map((s: any) => ({
        // Prefer the explicit desktop asset; fall back to the legacy single
        // image_url so older rows keep working.
        image: s.image_url_desktop || s.image_url || null,
        imageMobile: s.image_url_mobile || null,
        title: s.title || heroTitle,
        subtitle: s.subtitle || undefined,
        ctaLabel: s.cta_text || bundleCtaLabel,
        ctaHref: s.cta_href || "/quiz",
      }));
    if (configured.length > 0) return configured;
    const base = {
      title: heroTitle,
      subtitle: heroSubtitle,
      ctaLabel: bundleCtaLabel,
      ctaHref: "/quiz",
      secondaryLabel: "Shop now",
      secondaryHref: "/shop",
    };
    if (heroImages.length === 0) return [{ ...base, image: null }];
    return heroImages.map((img) => ({ ...base, image: img }));
  }, [settings?.home_hero_slides, heroImages, heroTitle, heroSubtitle, bundleCtaLabel]);

  // Category tiles: admin-curated labels/hrefs (home_categories); image falls
  // back to a derived image matched by label when image_url is null.
  const catImg = useMemo(() => {
    const prods = products as any[];
    const bnds = bundles as any[];
    const pick = (arr: any[], pred: (x: any) => boolean) => arr.find(pred)?.imageUrl || null;
    return {
      mum: pick(prods, (p) => p.category === "mum" && p.imageUrl),
      baby: pick(prods, (p) => p.category === "baby" && p.imageUrl),
      bundles: pick(bnds, (b) => !!b.imageUrl),
      gifts: bnds.find((b) => /gift/i.test(`${b.name || ""} ${b.slug || ""}`) && b.imageUrl)?.imageUrl
        || bnds.filter((b) => b.imageUrl)[1]?.imageUrl || null,
    };
  }, [products, bundles]);
  const deriveCatImage = (label: string): string | null => {
    const l = (label || "").toLowerCase();
    if (/matern|mum/.test(l)) return catImg.mum;
    if (/baby/.test(l)) return catImg.baby;
    if (/gift/.test(l)) return catImg.gifts;
    if (/bundle|kit/.test(l)) return catImg.bundles;
    return null;
  };
  const categories = useMemo(() => {
    const configured = asArray(settings?.home_categories)
      .filter((c: any) => c && c.label && c.href)
      .map((c: any) => ({ label: c.label, href: c.href, image: c.image_url || deriveCatImage(c.label) }));
    if (configured.length > 0) return configured;
    // Last-resort fallback if the setting is somehow empty.
    return [
      { label: "Maternity", href: "/shop/mum", image: catImg.mum },
      { label: "Baby", href: "/shop/baby", image: catImg.baby },
      { label: "Bundles", href: "/bundles", image: catImg.bundles },
      { label: "Gifts", href: "/bundles/baby-shower-gift-boxes", image: catImg.gifts },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.home_categories, catImg]);

  // Most Loved Baby Items: brand list from admin (home_loved_baby_brands),
  // matched against real baby products to show one clean card per brand.
  const lovedHeading = settings?.home_loved_baby_heading || "Our Most Loved Baby Items";
  const lovedBrandNames = useMemo(() => {
    return asArray(settings?.home_loved_baby_brands)
      .map((x: any) => (typeof x === "string" ? x : x?.name || x?.label || x?.brand || ""))
      .filter(Boolean) as string[];
  }, [settings?.home_loved_baby_brands]);
  const babyBrands = useMemo(() => {
    const babyProducts = (products as any[]).filter((p) => p.category === "baby");
    const squash = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const out: Array<{ name: string; image: string | null; minPrice: number }> = [];
    for (const canon of lovedBrandNames) {
      const key = squash(canon);
      if (!key) continue;
      let image: string | null = null;
      let minPrice = Infinity;
      let found = false;
      for (const p of babyProducts) {
        const pn = squash(p.name);
        for (const b of p.brands || []) {
          if (squash(b.label).includes(key) || pn.includes(key)) {
            found = true;
            const price = Number(b.price) || 0;
            if (price > 0 && price < minPrice) minPrice = price;
            if (!image) image = b.imageUrl || p.imageUrl || null;
          }
        }
      }
      if (found) out.push({ name: canon, image, minPrice: isFinite(minPrice) ? minPrice : 0 });
      if (out.length >= 10) break;
    }
    return out;
  }, [products, lovedBrandNames]);

  // Free-delivery progress from the real cart total + the admin threshold.
  const threshold = parseInt(settings?.free_delivery_nationwide_threshold_naira ?? settings?.default_free_threshold ?? "0", 10) || 0;
  const remaining = Math.max(0, threshold - subtotal);
  const pct = threshold > 0 ? Math.min(100, Math.round((subtotal / threshold) * 100)) : 0;

  // Deals: admin-curated via get_deal_products(), gated by deals_enabled.
  const { items: dealItems } = useDealProducts();
  const dealsEnabled = settings?.deals_enabled !== false && settings?.deals_enabled !== "false";
  const dealsHeading = (settings?.deals_heading as string) || "Deals";
  const dealsSubtitle = (settings?.deals_subtitle as string) || "";
  const dealsEndsAt = (settings?.deals_ends_at as string | null) || null;
  const dealsEndedHeading = (settings?.deals_ended_heading as string) || undefined;
  const dealsEndedMessage = (settings?.deals_ended_message as string) || undefined;

  return (
    <div className="bg-background min-h-screen pt-[76px]">
     <div className="max-w-[1180px] mx-auto">
      {/* Real h1 for SEO/a11y; the visible hero title is an h2 in the carousel. */}
      <h1 className="sr-only">{heroTitle}</h1>

      {/* Hero: search + carousel */}
      <section className="px-4 md:px-6 pt-4 pb-2">
        <HeroSearchBar />
        <div className="mt-4">
          <HeroCarousel slides={heroSlides} />
        </div>
      </section>

      {/* Shop by Category */}
      <section className="px-4 md:px-6 py-5">
        <h2 className="text-lg md:text-xl font-bold text-foreground mb-3">Shop by Category</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {categories.map((c) => (
            <Link key={c.label} to={c.href}
              className="relative rounded-[16px] overflow-hidden border border-border bg-forest-light min-h-[104px] md:min-h-[220px] group">
              {c.image && (
                <img src={c.image} alt="" aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/25 to-transparent" />
              <span className="absolute left-3 bottom-3 md:left-4 md:bottom-4 z-10 font-semibold text-white text-sm md:text-lg inline-flex items-center gap-1 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
                {c.label} <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Our Most Loved Baby Items */}
      {babyBrands.length > 0 && (
        <section className="py-5">
          <div className="px-4 md:px-6 flex items-center justify-between mb-3">
            <h2 className="text-lg md:text-xl font-bold text-foreground">{lovedHeading}</h2>
            <Link to="/shop/baby" className="text-xs font-semibold text-forest hover:underline inline-flex items-center gap-0.5">View all <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 md:px-6 pb-1 snap-x scrollbar-none">
            {babyBrands.map((b) => (
              <Link key={b.name} to={`/shop/baby?q=${encodeURIComponent(b.name)}`}
                className="snap-start shrink-0 w-[150px] rounded-[14px] border border-border bg-card overflow-hidden card-hover">
                <div className="aspect-square bg-warm-cream overflow-hidden">
                  {b.image && <img src={b.image} alt={b.name} loading="lazy" className="w-full h-full object-cover" />}
                </div>
                <div className="p-2.5">
                  <p className="font-semibold text-xs text-foreground truncate">{b.name}</p>
                  {b.minPrice > 0 && <p className="mt-0.5 font-mono-price text-forest font-bold text-sm">from {fmt(b.minPrice)}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Free-delivery progress (real cart + admin threshold) */}
      {threshold > 0 && (
        <section className="px-4 md:px-6 py-3">
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

      {/* Deals rail (admin-curated) */}
      {dealsEnabled && (
        <FlashDeals items={dealItems} heading={dealsHeading} subtitle={dealsSubtitle} endsAt={dealsEndsAt} endedHeading={dealsEndedHeading} endedMessage={dealsEndedMessage} />
      )}
     </div>
    </div>
  );
}
