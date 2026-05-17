import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/cart";

/**
 * Reusable "Bundles & Kits" surface for the storefront. Renders three
 * sections — Baby Shower Gift Boxes, Postpartum Recovery Kits, and a
 * Maternity Lists "Coming Soon" placeholder. Data is sourced from the
 * standard products table (where is_gift_box = true), so the existing
 * /products/<slug> detail page handles purchasing without new routes.
 *
 * `variant`:
 *  - "shop":    compact cards for /shop, 3-up grid
 *  - "bundles": large, detailed cards for /bundles
 */
type Variant = "shop" | "bundles";

interface BundleProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_gift_box: boolean;
  brands: { id: string; sku: string | null; brand_name: string; price: number; tier: string | null; in_stock: boolean; image_url: string | null }[];
}

interface EnrichedBundle extends BundleProduct {
  item_count: number;
  computed_price: number;
}

function tierLabel(tier: string | null | undefined): "Basic" | "Standard" | "Premium" {
  if (tier === "premium") return "Premium";
  if (tier === "standard") return "Standard";
  return "Basic"; // starter or unknown
}

function tierBadgeClasses(tier: string | null | undefined): string {
  if (tier === "premium") return "bg-purple-100 text-purple-800";
  if (tier === "standard") return "bg-blue-100 text-blue-800";
  return "bg-green-100 text-green-800";
}

function truncate(s: string | null, max: number): string {
  if (!s) return "";
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

export default function BundleSections({ variant = "shop" }: { variant?: Variant }) {
  const { data: products, isLoading } = useQuery({
    queryKey: ["bundle-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select(`
          id, name, slug, description, is_gift_box,
          brands ( id, sku, brand_name, price, tier, in_stock, image_url )
        `)
        .eq("is_gift_box", true)
        .eq("is_active", true)
        .order("slug");
      if (error) throw error;
      return (data || []) as BundleProduct[];
    },
    staleTime: 60_000,
  });

  // Enrich with item_count + freshest computed sell_price via the
  // get_gift_box_price RPC. Failures are swallowed: a missing RPC value
  // falls back to the cached brand price, never blocks rendering.
  const [enriched, setEnriched] = useState<EnrichedBundle[] | null>(null);
  useEffect(() => {
    if (!products || products.length === 0) { setEnriched([]); return; }
    let cancelled = false;
    (async () => {
      const out = await Promise.all(products.map(async p => {
        try {
          const { data } = await (supabase as any)
            .rpc("get_gift_box_price", { p_gift_box_id: p.id });
          return {
            ...p,
            item_count: Number((data as any)?.item_count ?? 0),
            computed_price: Number((data as any)?.sell_price ?? p.brands?.[0]?.price ?? 0),
          } as EnrichedBundle;
        } catch {
          return {
            ...p,
            item_count: 0,
            computed_price: Number(p.brands?.[0]?.price ?? 0),
          } as EnrichedBundle;
        }
      }));
      if (!cancelled) setEnriched(out);
    })();
    return () => { cancelled = true; };
  }, [products]);

  // Split by name pattern. The DB seeded exactly two families today; the
  // filters tolerate any future "Baby Shower Gift Box - …" / "Postpartum
  // Recovery Kit - …" naming convention without code edits.
  const giftBoxes = useMemo(() => (enriched || []).filter(p => /Baby Shower Gift Box/i.test(p.name))
    .sort(byTier), [enriched]);
  const recoveryKits = useMemo(() => (enriched || []).filter(p => /Postpartum Recovery Kit/i.test(p.name))
    .sort(byTier), [enriched]);

  return (
    <div className={variant === "bundles" ? "space-y-10 md:space-y-14" : "space-y-8 mb-8"}>
      <BundleSection
        heading="Baby Shower Gift Boxes"
        subtitle="Thoughtfully curated gifts for the new mum"
        items={giftBoxes}
        loading={isLoading || enriched === null}
        variant={variant}
      />
      {variant === "bundles" && <div className="border-t border-border" />}
      <BundleSection
        heading="Postpartum Recovery Kits"
        subtitle="Everything a new mum needs to heal and thrive"
        items={recoveryKits}
        loading={isLoading || enriched === null}
        variant={variant}
      />
      {variant === "bundles" && <div className="border-t border-border" />}
      <ComingSoonSection variant={variant} />
    </div>
  );
}

function byTier(a: EnrichedBundle, b: EnrichedBundle): number {
  const rank = (t: string | null | undefined) => t === "premium" ? 2 : t === "standard" ? 1 : 0;
  const at = a.brands?.[0]?.tier ?? null;
  const bt = b.brands?.[0]?.tier ?? null;
  return rank(at) - rank(bt);
}

function BundleSection({ heading, subtitle, items, loading, variant }: {
  heading: string;
  subtitle: string;
  items: EnrichedBundle[];
  loading: boolean;
  variant: Variant;
}) {
  const isBundlesPage = variant === "bundles";
  return (
    <section>
      <div className="flex items-end justify-between mb-3 md:mb-4 gap-3 flex-wrap">
        <div>
          <h2 className={`pf font-bold ${isBundlesPage ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"}`}>{heading}</h2>
          <p className="text-text-med text-sm">{subtitle}</p>
        </div>
        {!isBundlesPage && (
          <Link to="/bundles" className="text-forest text-sm font-semibold hover:underline whitespace-nowrap">
            View all →
          </Link>
        )}
      </div>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
          {[0, 1, 2].map(i => <div key={i} className={`bg-card rounded-card shadow-card animate-pulse ${isBundlesPage ? "h-72" : "h-56"}`} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-text-light text-sm italic">No items yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
          {items.map(item => <BundleCard key={item.id} item={item} variant={variant} />)}
        </div>
      )}
    </section>
  );
}

function BundleCard({ item, variant }: { item: EnrichedBundle; variant: Variant }) {
  const tier = item.brands?.[0]?.tier ?? null;
  const label = tierLabel(tier);
  const badge = tierBadgeClasses(tier);
  const image = item.brands?.[0]?.image_url || null;
  const isBundlesPage = variant === "bundles";
  return (
    <Link
      to={`/products/${item.slug}`}
      className="bg-card rounded-card shadow-card overflow-hidden border border-border hover:shadow-card-hover transition-all group flex flex-col"
    >
      <div className={`relative ${isBundlesPage ? "aspect-[4/3]" : "aspect-square"} bg-warm-cream`}>
        {image ? (
          <img src={image} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">🎁</div>
        )}
        <span className={`absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-pill ${badge}`}>
          {label}
        </span>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className={`font-bold ${isBundlesPage ? "text-base md:text-lg" : "text-sm"} text-foreground mb-1 leading-snug`}>
          {item.name}
        </h3>
        {isBundlesPage && item.description && (
          <p className="text-text-med text-xs leading-relaxed mb-2">{truncate(item.description, 100)}</p>
        )}
        <div className={`pf font-bold text-forest ${isBundlesPage ? "text-2xl md:text-3xl" : "text-lg"} mt-1`}>
          {fmt(item.computed_price)}
        </div>
        {isBundlesPage && item.item_count > 0 && (
          <div className="text-text-light text-xs mt-1">Includes {item.item_count} item{item.item_count === 1 ? "" : "s"}</div>
        )}
        <button
          type="button"
          className={`mt-3 rounded-pill bg-coral text-primary-foreground font-semibold ${isBundlesPage ? "px-5 py-2.5 text-sm" : "px-4 py-2 text-xs"} hover:bg-coral-dark transition-colors`}
        >
          Shop Now
        </button>
      </div>
    </Link>
  );
}

function ComingSoonSection({ variant }: { variant: Variant }) {
  const isBundlesPage = variant === "bundles";
  return (
    <section>
      <div className="mb-3 md:mb-4">
        <h2 className={`pf font-bold ${isBundlesPage ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"}`}>Maternity Lists</h2>
        <p className="text-text-med text-sm">Complete hospital bag and baby prep lists — coming soon</p>
      </div>
      <div className={`bg-warm-cream border border-dashed border-border rounded-card ${isBundlesPage ? "p-8 md:p-10" : "p-6"} text-center`}>
        <span className="inline-block text-[10px] font-bold uppercase tracking-wider bg-coral/15 text-coral px-2 py-0.5 rounded-pill mb-3">
          Coming soon
        </span>
        <h3 className={`pf font-bold text-foreground mb-1 ${isBundlesPage ? "text-xl md:text-2xl" : "text-base md:text-lg"}`}>
          Personalised maternity lists are on the way
        </h3>
        <p className="text-text-med text-sm mb-4 max-w-md mx-auto">
          We're putting together complete, ready-to-shop hospital bag and baby prep lists. Be the first to know when they go live.
        </p>
        <a
          href="https://wa.me/+2347040667424?text=Hi%20BundledMum%21%20Please%20notify%20me%20when%20Maternity%20Lists%20launch."
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-pill bg-forest text-primary-foreground font-semibold px-5 py-2.5 text-sm hover:bg-forest-deep"
        >
          Get notified on WhatsApp
        </a>
      </div>
    </section>
  );
}
