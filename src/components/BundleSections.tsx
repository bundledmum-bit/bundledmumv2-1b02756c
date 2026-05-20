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
  bundle_label: string | null;
  shop_section_order: number | null;
  brands: { id: string; sku: string | null; brand_name: string; price: number; tier: string | null; in_stock: boolean; image_url: string | null; images?: string[] | null }[];
}

interface EnrichedBundle extends BundleProduct {
  item_count: number;
  computed_price: number;
  is_maternity: boolean;
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

/**
 * Round a naira amount to its nearest thousand for compact price tags.
 *   189_625 → "₦190k", 991_625 → "₦992k"
 * Reads live `brands[0].price` so nightly refreshes propagate without
 * any code edits.
 */
function abbreviatePrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "";
  const thousands = Math.round(price / 1000);
  return `₦${thousands}k`;
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
          id, name, slug, description, is_gift_box, bundle_label, shop_section_order,
          brands:brands_public ( id, sku, brand_name, price, tier, in_stock, image_url, images )
        `)
        .eq("is_gift_box", true)
        .eq("is_active", true)
        // Admin-controlled within each section, then slug as a stable tiebreaker.
        .order("shop_section_order", { ascending: true, nullsFirst: false })
        .order("slug");
      if (error) throw error;
      return (data || []) as BundleProduct[];
    },
    staleTime: 60_000,
  });

  // Enrich with item_count + freshest computed sell_price.
  //  - Maternity bundles use the latest maternity_bundle_snapshots row.
  //  - Fixed bundles use the get_gift_box_price RPC.
  // Failures fall back to the cached brand price + a 0 item_count.
  const [enriched, setEnriched] = useState<EnrichedBundle[] | null>(null);
  useEffect(() => {
    if (!products || products.length === 0) { setEnriched([]); return; }
    let cancelled = false;
    (async () => {
      const matIds = products.filter(p => /^Maternity( \+ Baby Items)? Bundle/i.test(p.name)).map(p => p.id);
      const snapshotMap: Record<string, { item_count: number; sell_price: number }> = {};
      if (matIds.length > 0) {
        try {
          const { data } = await (supabase as any)
            .from("maternity_bundle_snapshots")
            .select("bundle_id, item_count, sell_price, snapped_at")
            .in("bundle_id", matIds)
            .order("snapped_at", { ascending: false });
          (data || []).forEach((s: any) => {
            if (!snapshotMap[s.bundle_id]) {
              snapshotMap[s.bundle_id] = {
                item_count: Number(s.item_count ?? 0),
                sell_price: Number(s.sell_price ?? 0),
              };
            }
          });
        } catch { /* fall through */ }
      }

      const out = await Promise.all(products.map(async p => {
        const isMaternity = /^Maternity( \+ Baby Items)? Bundle/i.test(p.name);
        if (isMaternity) {
          const snap = snapshotMap[p.id];
          return {
            ...p,
            is_maternity: true,
            item_count: snap?.item_count ?? 0,
            computed_price: snap?.sell_price || Number(p.brands?.[0]?.price ?? 0),
          } as EnrichedBundle;
        }
        try {
          const { data } = await (supabase as any)
            .rpc("get_gift_box_price", { p_gift_box_id: p.id });
          return {
            ...p,
            is_maternity: false,
            item_count: Number((data as any)?.item_count ?? 0),
            computed_price: Number((data as any)?.sell_price ?? p.brands?.[0]?.price ?? 0),
          } as EnrichedBundle;
        } catch {
          return {
            ...p,
            is_maternity: false,
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
  // Preserve the query's shop_section_order; re-sort after filtering to
  // be defensive against any incidental reorder during async enrichment.
  const sortByOrder = (a: EnrichedBundle, b: EnrichedBundle) =>
    (a.shop_section_order ?? 99) - (b.shop_section_order ?? 99);
  const giftBoxes = useMemo(() => (enriched || []).filter(p => /Baby Shower Gift Box/i.test(p.name)).sort(sortByOrder), [enriched]);
  const recoveryKits = useMemo(() => (enriched || []).filter(p => /Postpartum Recovery Kit/i.test(p.name)).sort(sortByOrder), [enriched]);
  const maternityBundles = useMemo(() => (enriched || []).filter(p => /^Maternity( \+ Baby Items)? Bundle/i.test(p.name)).sort(sortByOrder), [enriched]);

  // ── Admin-driven section config (shop_sections table) ───────────────
  // Two parallel orderings live on the same shop_sections row:
  //   - display_order / is_visible  → /shop page (handled elsewhere)
  //   - bundles_display_order / bundles_is_visible → /bundles page
  // Plus standalone_page_slug + see_all_label drive the per-section
  // "See all" link surfaced at the top-right of each bundles page row.
  const sectionsQuery = useQuery({
    queryKey: ["shop-sections", "bundles", variant],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_sections")
        .select("section_key, title, subtitle, filter_value, display_order, is_visible, bundles_display_order, bundles_is_visible, standalone_page_slug, see_all_label, section_type")
        .eq("section_type", "bundle_group")
        .order(variant === "bundles" ? "bundles_display_order" : "display_order");
      if (error) throw error;
      return (data || []) as Array<{
        section_key: string; title: string; subtitle: string | null;
        filter_value: string;
        display_order: number; is_visible: boolean;
        bundles_display_order: number | null; bundles_is_visible: boolean | null;
        standalone_page_slug: string | null; see_all_label: string | null;
        section_type: string;
      }>;
    },
    staleTime: 30_000,
  });

  const sectionFor = (filter: string) => sectionsQuery.data?.find(s => s.filter_value === filter);
  // Maternity config — referenced under two keys to stay tolerant of the upcoming
  // shop_sections.filter_value rename from "Maternity Bundle" → "Maternity".
  // Once the rename ships, the "Maternity Bundle" alias can be removed.
  const MATERNITY_SECTION_CONFIG = { title: variant === "bundles" ? "Maternity + Baby Essentials" : "Bundles & Kits", subtitle: variant === "bundles" ? "Complete hospital bag and baby prep lists, curated by budget" : "Pre-packed bundles by budget — from starter to premium", shopOrder: 30, bundlesOrder: 30, visible: true, items: maternityBundles, grid: variant === "shop" ? "1-2-4" as const : "1-2-3" as const, slug: "maternity-bundles", seeAllLabel: "See all Maternity + Baby Essentials" };
  const SECTION_DEFAULTS = {
    "Baby Shower Gift Box":     { title: "Baby Shower Gift Boxes for your Budget",  subtitle: "Thoughtfully curated gifts for the new mum",  shopOrder: 10, bundlesOrder: 10, visible: true, items: giftBoxes,        grid: "1-2-3" as const, slug: "baby-shower-gift-boxes",  seeAllLabel: "See all Baby Shower Gift Boxes" },
    "Postpartum Recovery Kit":  { title: "Postpartum Recovery Kits for your Budget", subtitle: "Everything a new mum needs to heal and thrive", shopOrder: 20, bundlesOrder: 20, visible: true, items: recoveryKits,     grid: "1-2-3" as const, slug: "postpartum-recovery-kits", seeAllLabel: "See all Postpartum Recovery Kits" },
    "Maternity Bundle":         MATERNITY_SECTION_CONFIG, // legacy alias (DB hasn't changed yet)
    "Maternity":                MATERNITY_SECTION_CONFIG, // new alias (DB will use this)
  };
  const isBundlesVariant = variant === "bundles";
  // Alias dedupe: the maternity config is registered under two keys
  // ("Maternity Bundle" + "Maternity") so the section keeps rendering
  // across the shop_sections.filter_value rename. Pick whichever alias
  // matches a current shop_sections row; if neither matches, prefer
  // the post-rename "Maternity" key. Then drop the loser so the
  // section appears exactly once regardless of DB state.
  const matchedFilters = new Set((sectionsQuery.data || []).map(s => s.filter_value));
  const activeMaternityKey: "Maternity Bundle" | "Maternity" = matchedFilters.has("Maternity Bundle")
    ? "Maternity Bundle"
    : "Maternity";
  const dropMaternityKey = activeMaternityKey === "Maternity Bundle" ? "Maternity" : "Maternity Bundle";
  const blocks = Object.entries(SECTION_DEFAULTS).filter(([key]) => key !== dropMaternityKey).map(([filter, d]) => {
    const cfg = sectionFor(filter);
    const adminOrder = isBundlesVariant
      ? cfg?.bundles_display_order ?? cfg?.display_order
      : cfg?.display_order;
    const adminVisible = isBundlesVariant
      ? (cfg?.bundles_is_visible ?? cfg?.is_visible)
      : cfg?.is_visible;
    return {
      filter,
      title: cfg?.title || d.title,
      subtitle: cfg?.subtitle ?? d.subtitle,
      order: adminOrder ?? (isBundlesVariant ? d.bundlesOrder : d.shopOrder),
      visible: cfg ? (adminVisible !== false) : d.visible,
      slug: cfg?.standalone_page_slug || d.slug,
      seeAllLabel: cfg?.see_all_label || d.seeAllLabel,
      items: d.items,
      grid: d.grid,
    };
  }).sort((a, b) => a.order - b.order);

  return (
    <div className={isBundlesVariant ? "space-y-10 md:space-y-14" : "space-y-8 mb-8"}>
      {blocks.filter(b => b.visible).map((b, i, arr) => (
        <div key={b.filter}>
          <BundleSection
            heading={b.title}
            subtitle={b.subtitle || ""}
            items={b.items}
            loading={isLoading || enriched === null}
            variant={variant}
            gridCols={b.grid}
            seeAllHref={isBundlesVariant ? `/bundles/${b.slug}` : undefined}
            seeAllLabel={isBundlesVariant ? b.seeAllLabel : undefined}
          />
          {isBundlesVariant && i < arr.length - 1 && <div className="border-t border-border mt-10" />}
        </div>
      ))}
    </div>
  );
}

export function BundleSection({ heading, subtitle, items, loading, variant, gridCols = "1-2-3", seeAllHref, seeAllLabel }: {
  heading: string;
  subtitle: string;
  items: EnrichedBundle[];
  loading: boolean;
  variant: Variant;
  gridCols?: "1-2-3" | "1-2-4";
  seeAllHref?: string;
  seeAllLabel?: string;
}) {
  const isBundlesPage = variant === "bundles";
  // Maternity Lists on /shop runs 4-up so 8 cards lay out cleanly;
  // the default 3-up keeps Gift Boxes / Recovery Kits matching the
  // 3-card spec.
  const gridClass = gridCols === "1-2-4"
    ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5"
    : "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-5";
  return (
    <section>
      <div className="flex items-end justify-between mb-3 md:mb-4 gap-3 flex-wrap">
        <div>
          <h2 className={`pf font-bold ${isBundlesPage ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"}`}>{heading}</h2>
          <p className="text-text-med text-sm">{subtitle}</p>
        </div>
        {isBundlesPage && seeAllHref ? (
          <Link to={seeAllHref} className="text-forest text-sm font-semibold hover:underline whitespace-nowrap inline-flex items-center gap-1">
            {seeAllLabel || "See all"} →
          </Link>
        ) : !isBundlesPage && (
          <Link to="/bundles" className="text-forest text-sm font-semibold hover:underline whitespace-nowrap">
            View all →
          </Link>
        )}
      </div>
      {loading ? (
        <div className={gridClass}>
          {[0, 1, 2].map(i => <div key={i} className={`bg-card rounded-card shadow-card animate-pulse ${isBundlesPage ? "h-72" : "h-56"}`} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-text-light text-sm italic">No items yet.</div>
      ) : (
        <div className={gridClass}>
          {items.map(item => <BundleCard key={item.id} item={item} variant={variant} />)}
        </div>
      )}
    </section>
  );
}

function BundleCard({ item, variant }: { item: EnrichedBundle; variant: Variant }) {
  const tier = item.brands?.[0]?.tier ?? null;
  // Admin-edited display label (e.g. "Basic", "₦200,000") takes precedence
  // over the tier-derived default. Tier still drives the badge colour.
  const label = item.bundle_label?.trim() || tierLabel(tier);
  const badge = tierBadgeClasses(tier);
  // Bundle products keep imagery on the brand row (brands.image_url,
  // brands.images[]) — products.image_url is NULL for every bundle.
  const brand = item.brands?.[0];
  const image = brand?.image_url
    || (Array.isArray(brand?.images) ? brand!.images![0] : null)
    || null;
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
          <div
            className="w-full h-full flex items-center justify-center px-4"
            style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }}
          >
            <span className="text-primary-foreground font-bold text-center text-sm md:text-base leading-snug">
              {item.bundle_label || item.name}
            </span>
          </div>
        )}
        <span className={`absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-pill ${badge}`}>
          {label}
        </span>
        {/* Maternity bundles share a single base image — overlay a coral
            price tag so the customer can tell them apart at a glance.
            Pulled from live brands[0].price; nightly refresh updates it
            automatically. */}
        {item.is_maternity && (item.brands?.[0]?.price ?? 0) > 0 && (
          <span
            className="absolute bottom-3 left-3"
            style={{
              background: "#F4845F",
              color: "#FFFFFF",
              fontFamily: "Nunito, sans-serif",
              fontWeight: 900,
              fontSize: 14,
              padding: "4px 12px",
              borderRadius: 100,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              letterSpacing: "0.3px",
            }}
          >
            {abbreviatePrice(item.brands![0].price)}
          </span>
        )}
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

