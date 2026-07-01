import { useMemo, useState } from "react";
import Seo from "@/components/Seo";
import { useAllProducts } from "@/hooks/useSupabaseData";
import { Flame, Clock, Percent, Truck, RotateCcw } from "lucide-react";
import {
  FlashDealCard,
  getDealPricing,
  useCountdown,
  pad,
  selectDealProducts,
} from "@/components/home/FlashDeals";

/**
 * Dedicated Flash Deals page. Linked from the homepage "See all". A compact,
 * wide header (not a full hero) keeps the focus on the deals themselves, with
 * a live countdown and a short strip of deal-friendly reassurances. Cards
 * reuse FlashDealCard so pricing, urgency, and add-to-cart stay identical to
 * the homepage rail.
 *
 * TODO(backend): see docs/storefront-redesign-backend-audit.md for the
 * proposed deals_ends_at / deals_product_ids / compare_at_price fields that
 * would replace the preview fallbacks used here.
 */

type CategoryFilter = "all" | "baby" | "mum";
type SortKey = "savings" | "price_asc" | "price_desc";

export default function DealsPage() {
  const { data: products = [], isLoading } = useAllProducts();
  const { h, m, s } = useCountdown();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<SortKey>("savings");

  const allDeals = useMemo(() => selectDealProducts(products as any[], 60), [products]);

  const filtered = useMemo(() => {
    let list = allDeals.filter((p: any) => category === "all" || p.category === category);
    const priced = list
      .map((p: any) => ({ product: p, pricing: getDealPricing(p) }))
      .filter((x): x is { product: any; pricing: NonNullable<ReturnType<typeof getDealPricing>> } => !!x.pricing);
    if (sort === "savings") priced.sort((a, b) => b.pricing.savePct - a.pricing.savePct);
    if (sort === "price_asc") priced.sort((a, b) => a.pricing.price - b.pricing.price);
    if (sort === "price_desc") priced.sort((a, b) => b.pricing.price - a.pricing.price);
    return priced.map((x) => x.product);
  }, [allDeals, category, sort]);

  return (
    <div className="min-h-screen bg-background pt-[68px] pb-16 md:pb-0">
      <Seo
        title="Flash Deals | BundledMum"
        description="Time-limited savings on baby and mum essentials. Shop today's flash deals before they're gone."
      />

      {/* Compact, wide header: deals should feel fast and current, not
          editorial, so this is a slim strip rather than a full hero. */}
      <div className="bg-gradient-to-r from-forest-deep to-forest">
        <div className="max-w-[1180px] mx-auto px-4 md:px-6 py-5 md:py-7 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="pf text-white font-bold text-2xl md:text-[32px] inline-flex items-center gap-2">
              <Flame className="w-6 h-6 md:w-7 md:h-7 text-coral" /> Flash Deals
            </h1>
            <p className="mt-1 text-white/80 text-sm md:text-[15px]">Real savings on baby and mum essentials, while stocks last.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-pill bg-white/15 border border-white/25 text-white text-sm font-semibold px-4 py-2.5 backdrop-blur-sm">
            <Clock className="w-4 h-4" />
            Ends in <span className="font-mono-price">{pad(h)}:{pad(m)}:{pad(s)}</span>
          </span>
        </div>
      </div>

      {/* Deal-friendly feature strip: what makes shopping deals here safe and
          worth it, not generic site trust copy. */}
      <div className="border-b border-border bg-card">
        <div className="max-w-[1180px] mx-auto px-4 md:px-6 py-3 flex flex-wrap gap-x-6 gap-y-2 text-xs md:text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Percent className="w-4 h-4 text-coral" /> New deals every day</span>
          <span className="inline-flex items-center gap-1.5"><Truck className="w-4 h-4 text-forest" /> Fast Lagos delivery</span>
          <span className="inline-flex items-center gap-1.5"><RotateCcw className="w-4 h-4 text-forest" /> Easy returns</span>
        </div>
      </div>

      <div className="max-w-[1180px] mx-auto px-4 md:px-6 py-5">
        {/* Filter + sort controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex gap-2">
            {([
              { key: "all", label: "All deals" },
              { key: "baby", label: "Baby" },
              { key: "mum", label: "Mum" },
            ] as const).map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`rounded-pill px-4 py-2 text-xs font-semibold border transition-colors min-h-[36px] ${category === c.key ? "bg-forest border-forest text-primary-foreground" : "bg-card border-border text-muted-foreground"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-pill border border-border px-3 py-2 text-xs font-semibold bg-card text-muted-foreground outline-none min-h-[36px]"
          >
            <option value="savings">Biggest savings</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-[14px] border border-border bg-card overflow-hidden">
                <div className="aspect-square bg-muted animate-pulse" />
                <div className="p-2.5 space-y-2">
                  <div className="h-3 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🔥</p>
            <h2 className="pf text-xl mb-2">No deals in this category right now</h2>
            <p className="text-muted-foreground text-sm">Check back soon, new deals drop daily.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
            {filtered.map((p: any) => (
              <FlashDealCard key={p.id} product={p} className="w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
