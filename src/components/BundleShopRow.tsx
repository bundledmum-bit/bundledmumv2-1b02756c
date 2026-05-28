import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fmt } from "@/lib/cart";
import { getBrandImage } from "@/lib/brandImage";

/**
 * Bundle row for the shop page, designed to be visually identical to
 * CuratedSection — same section wrapper (rounded-2xl, shadow-sm, bg-card,
 * palette header bar with "(see all)" link), same horizontal snap-scroll
 * card row, and cards sized identically to CuratedCard.
 *
 * The only bundle-specific affordances:
 *   - The card surfaces the bundle_label (e.g. "Basic", "₦200,000") in
 *     place of a brand name.
 *   - A coral "₦Xk" price tag overlays the image for maternity bundles
 *     so customers can tell them apart from the shared base photo.
 *   - The CTA links straight to /products/<slug> instead of opening a
 *     drawer (bundles need the full customise + checkout flow).
 */
interface BundleItem {
  id: string;
  name: string;
  slug: string;
  bundle_label: string | null;
  is_maternity: boolean;
  item_count: number;
  computed_price: number;
  brands: { id: string; image_url?: string | null; stored_image_url?: string | null; images?: string[] | null; tier?: string | null; price?: number }[];
}

interface PaletteVariant {
  bar: string;
  text: string;
  link: string;
}

function abbreviatePrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "";
  return `₦${Math.round(price / 1000)}k`;
}

export default function BundleShopRow({
  heading,
  subtitle: _subtitle,
  items,
  palette,
}: {
  heading: string;
  subtitle?: string | null;
  items: BundleItem[];
  palette: PaletteVariant;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setHasOverflow(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  if (!items || items.length === 0) return null;

  return (
    <section className="rounded-2xl shadow-sm overflow-hidden bg-card">
      <div className={`${palette.bar} ${palette.text} px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-between gap-3`}>
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="pf text-base md:text-lg font-bold truncate">{heading}</h2>
          <Link
            to="/bundles"
            className={`${palette.link} text-[11px] md:text-xs font-semibold whitespace-nowrap hover:opacity-80`}
          >
            (see all)
          </Link>
        </div>
        {hasOverflow && (
          <span className={`md:hidden text-[11px] font-semibold animate-pulse whitespace-nowrap ${palette.text}`}>
            Swipe for more →
          </span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 snap-x snap-mandatory overflow-x-auto p-4 md:p-6 scrollbar-hide"
      >
        {items.map(item => <BundleRowCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}

function BundleRowCard({ item }: { item: BundleItem }) {
  const brand = item.brands?.[0];
  const image = getBrandImage(brand)
    || (Array.isArray(brand?.images) ? brand!.images![0] : null)
    || null;
  const displayName = item.name;
  const displayLabel = item.bundle_label?.trim() || "";
  const price = item.computed_price || Number(brand?.price ?? 0);

  return (
    <div className="snap-start shrink-0 w-[35vw] md:w-[220px] bg-card rounded-card shadow-card overflow-hidden flex flex-col border border-border/40">
      <Link to={`/products/${item.slug}`} className="block w-full text-left">
        <div className="relative aspect-square w-full bg-[#f5f5f5] flex items-center justify-center overflow-hidden">
          {displayLabel && (
            <span className="absolute top-1.5 left-1.5 bg-coral text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-pill z-10">
              {displayLabel}
            </span>
          )}
          {image ? (
            <img src={image} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center px-3"
              style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }}
            >
              <span className="text-primary-foreground font-bold text-center text-xs md:text-sm leading-snug">
                {displayLabel || displayName}
              </span>
            </div>
          )}
          {item.is_maternity && price > 0 && (
            <span
              className="absolute bottom-1.5 left-1.5"
              style={{
                background: "#F4845F", color: "#FFFFFF",
                fontFamily: "Nunito, sans-serif", fontWeight: 900, fontSize: 11,
                padding: "3px 9px", borderRadius: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                letterSpacing: "0.3px",
              }}
            >
              {abbreviatePrice(price)}
            </span>
          )}
        </div>
      </Link>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <div className="text-[13px] font-semibold leading-tight line-clamp-2 min-h-[34px]">
          {displayName}
        </div>
        <div className="flex items-baseline gap-1.5 mt-auto">
          <span className="text-[15px] font-bold text-forest">{fmt(price)}</span>
        </div>
        <Link
          to={`/products/${item.slug}`}
          className="mt-1.5 w-full rounded-pill text-primary-foreground text-xs font-semibold py-2 min-h-[36px] inline-flex items-center justify-center"
          style={{ backgroundColor: "#F4845F" }}
        >
          Shop Bundle
        </Link>
      </div>
    </div>
  );
}
