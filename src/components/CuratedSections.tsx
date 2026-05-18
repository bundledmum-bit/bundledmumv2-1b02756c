import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  usePopularCategories,
  useSectionProducts,
  useFallbackSectionProducts,
  pickSurfacedBrand,
  type ShopVariant,
  type SectionPinnedProduct,
} from "@/hooks/useMerchandising";
import { fmt } from "@/lib/cart";
import ProductImage from "@/components/ProductImage";
import type { Product } from "@/lib/supabaseAdapters";
import { isProductOOS } from "@/lib/supabaseAdapters";

const INITIAL_VISIBLE = 10;
const PAGE_SIZE = 5;

// Solid coloured header bars — distinct adjacent sections. The body of each
// section card sits on white so cards read clearly against the saturated bar.
export const HEADER_PALETTE: Array<{ bar: string; text: string; link: string }> = [
  { bar: "bg-coral",       text: "text-white",  link: "text-white/90 underline" },
  { bar: "bg-forest",      text: "text-white",  link: "text-white/90 underline" },
  { bar: "bg-mint",        text: "text-forest", link: "text-forest underline" },
  { bar: "bg-warm-cream",  text: "text-forest", link: "text-forest underline" },
];

export default function CuratedSections({
  shop,
  onOpenDetail,
}: {
  shop: ShopVariant;
  onOpenDetail: (product: Product) => void;
}) {
  const { data: categories, isLoading } = usePopularCategories(shop);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset when the shop variant changes.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [shop]);

  const total = categories?.length || 0;
  const hasMore = visibleCount < total;

  // IntersectionObserver lazy-load: bump by PAGE_SIZE when sentinel enters view.
  // We include `visibleCount` in deps so the observer is rebuilt after each
  // batch — otherwise the sentinel node stays "isIntersecting" and the
  // callback never re-fires for subsequent pages.
  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setVisibleCount(c => Math.min(total, c + PAGE_SIZE));
        }
      }
    }, { rootMargin: "400px 0px" });
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, total, visibleCount]);

  if (isLoading) {
    return (
      <div className="space-y-5 md:space-y-6 mb-10">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl shadow-sm overflow-hidden bg-card">
            <div className="h-10 bg-muted animate-pulse" />
            <div className="p-4 md:p-6 flex gap-3 overflow-hidden">
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="w-[35vw] md:w-[220px] h-[260px] bg-muted/60 rounded-card animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!categories || categories.length === 0) return null;

  const visible = categories.slice(0, visibleCount);

  return (
    <div className="space-y-5 md:space-y-6 mb-10">
      {visible.map((cat, idx) => (
        <CuratedSection
          key={cat.slug}
          shop={shop}
          slug={cat.slug}
          label={cat.name}
          icon={cat.icon}
          palette={HEADER_PALETTE[idx % HEADER_PALETTE.length]}
          onOpenDetail={onOpenDetail}
        />
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="h-12 flex items-center justify-center">
          <div className="text-xs text-muted-foreground">Loading more sections…</div>
        </div>
      )}
    </div>
  );
}

export function CuratedSection({
  shop,
  slug,
  label,
  icon,
  palette,
  onOpenDetail,
}: {
  shop: ShopVariant;
  slug: string;
  label: string;
  icon: string | null;
  palette: { bar: string; text: string; link: string };
  onOpenDetail: (product: Product) => void;
}) {
  const { data: curated, isLoading: curatedLoading } = useSectionProducts(shop, slug);
  const needsFallback = !curatedLoading && (!curated || curated.length === 0);
  const { data: fallback, isLoading: fallbackLoading } = useFallbackSectionProducts(needsFallback ? slug : "");
  const products: SectionPinnedProduct[] = (curated && curated.length > 0 ? curated : fallback) || [];
  const loading = curatedLoading || (needsFallback && fallbackLoading);

  // Mobile-only: show pulsing "Swipe for more →" hint when the swiper has
  // horizontal overflow. Mirrors the CategoryPage per-product brand swiper.
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
  }, [products.length]);

  if (loading) {
    return (
      <section className="rounded-2xl shadow-sm overflow-hidden bg-card">
        <div className={`${palette.bar} h-10 animate-pulse`} />
        <div className="p-4 md:p-6 flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map(j => (
            <div key={j} className="w-[35vw] md:w-[220px] h-[260px] bg-muted/60 rounded-card animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!products.length) return null;

  return (
    <section className="rounded-2xl shadow-sm overflow-hidden bg-card">
      <div className={`${palette.bar} ${palette.text} px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-between gap-3`}>
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="pf text-base md:text-lg font-bold flex items-center gap-2 truncate">
            {icon && <span>{icon}</span>}
            <span className="truncate">{label}</span>
          </h2>
          <Link
            to={`/shop/${slug}`}
            className={`${palette.link} text-[11px] md:text-xs font-semibold whitespace-nowrap hover:opacity-80`}
          >
            (see all)
          </Link>
        </div>
        {/* Mobile swipe hint, only when overflow */}
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
        {products.map(pin => (
          <CuratedCard key={pin.product.id} pin={pin} onOpenDetail={() => onOpenDetail(pin.product)} />
        ))}
      </div>
    </section>
  );
}

function CuratedCard({ pin, onOpenDetail }: { pin: SectionPinnedProduct; onOpenDetail: () => void }) {
  const product = pin.product;
  const brands = product.brands.slice().sort((a, b) => a.tier - b.tier);
  const surfaceBrand = pickSurfacedBrand(product, pin.defaultBrandId);
  const displayName = pin.displayLabel?.trim() || product.name;
  const minPrice = brands.length > 0 ? Math.min(...brands.map(b => b.price)) : surfaceBrand?.price || 0;
  const showFrom = brands.length > 1;
  const image = surfaceBrand?.imageUrl || product.imageUrl || null;
  const showSale = surfaceBrand?.compareAtPrice && surfaceBrand.compareAtPrice > surfaceBrand.price;
  const allBrandsOos = brands.every(b => b.inStock === false);
  const isOutOfStock = isProductOOS(product);

  const handleChoose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    onOpenDetail();
  };

  return (
    <div className={`snap-start shrink-0 w-[35vw] md:w-[220px] bg-card rounded-card shadow-card overflow-hidden flex flex-col border border-border/40 ${(isOutOfStock || allBrandsOos) ? "opacity-60" : ""}`}>
      <button type="button" onClick={onOpenDetail} className="block w-full text-left">
        <div className="relative aspect-square w-full bg-[#f5f5f5] flex items-center justify-center overflow-hidden">
          {isOutOfStock ? (
            <span className="absolute top-1.5 left-1.5 bg-[#E53935] text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-pill z-10">
              Out of Stock
            </span>
          ) : product.badge ? (
            <span className="absolute top-1.5 left-1.5 bg-coral text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-pill z-10">
              {product.badge}
            </span>
          ) : null}
          {showSale && !isOutOfStock && (
            <span className="absolute top-1.5 right-1.5 bg-destructive text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-pill z-10">
              Sale
            </span>
          )}
          <ProductImage
            imageUrl={image}
            emoji={surfaceBrand?.img || product.baseImg}
            alt={displayName}
            className="w-full h-full"
            emojiClassName="text-5xl"
          />
        </div>
      </button>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <div className="text-[13px] font-semibold leading-tight line-clamp-2 cursor-pointer min-h-[34px]" onClick={onOpenDetail}>
          {displayName}
        </div>
        <div className="flex items-baseline gap-1.5 mt-auto">
          <span className="text-[15px] font-bold text-forest">
            {showFrom ? `from ${fmt(minPrice)}` : fmt(surfaceBrand?.price || 0)}
          </span>
        </div>
        <button
          onClick={handleChoose}
          disabled={isOutOfStock || allBrandsOos}
          className="mt-1.5 w-full rounded-pill text-primary-foreground text-xs font-semibold py-2 min-h-[36px] disabled:cursor-not-allowed"
          style={{ backgroundColor: (isOutOfStock || allBrandsOos) ? "#bbb" : "#F4845F" }}
        >
          {(isOutOfStock || allBrandsOos) ? "Sold Out" : "Choose Brand"}
        </button>
      </div>
    </div>
  );
}
