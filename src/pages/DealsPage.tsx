import { useMemo, useState } from "react";
import Seo from "@/components/Seo";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import Breadcrumb from "@/components/Breadcrumb";
import {
  FlashDealCard,
  useDealTimerState,
  DealCountdown,
  DealsEndedBanner,
  DEALS_ENDED_HEADING,
  DEALS_ENDED_MESSAGE,
  useDealProducts,
} from "@/components/home/FlashDeals";

/**
 * Deals page. The deal set is admin-curated and served by get_deal_products()
 * (active + in-stock applied, ordered by display_order). Gated by
 * site_settings.deals_enabled. Headings come from deals_heading /
 * deals_subtitle. A countdown shows only when deals_ends_at is a real future
 * time. No invented discounts and no fabricated urgency.
 */

type CategoryFilter = "all" | "baby" | "mum";

export default function DealsPage() {
  const { data: settings } = useSiteSettings();
  const { items, isLoading } = useDealProducts();
  const [category, setCategory] = useState<CategoryFilter>("all");

  const dealsEnabled = settings?.deals_enabled !== false && settings?.deals_enabled !== "false";
  const heading = (settings?.deals_heading as string) || "Deals";
  const subtitle = (settings?.deals_subtitle as string) || "";
  const endsAt = (settings?.deals_ends_at as string | null) || null;
  const { countdown, ended } = useDealTimerState(endsAt);
  const endedHeading = (settings?.deals_ended_heading as string) || DEALS_ENDED_HEADING;
  const endedMessage = (settings?.deals_ended_message as string) || DEALS_ENDED_MESSAGE;

  const filtered = useMemo(
    () => items.filter((d) => category === "all" || d.product.category === category),
    [items, category]
  );

  return (
    <div className="min-h-screen bg-background pt-[68px] pb-16 md:pb-0">
      <Seo
        title={`${heading} | BundledMum`}
        description={subtitle || "Shop curated deals on baby and mum essentials."}
      />

      {/* Compact, wide header. */}
      <div className="bg-gradient-to-r from-forest-deep to-forest">
        <div className="max-w-[1180px] mx-auto px-4 md:px-6 py-5 md:py-7 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="pf text-white font-bold text-2xl md:text-[32px]">{heading}</h1>
            {subtitle && <p className="mt-1 text-white/80 text-sm md:text-[15px]">{subtitle}</p>}
          </div>
          {countdown ? (
            <DealCountdown countdown={countdown} onDark />
          ) : ended ? (
            <DealsEndedBanner onDark heading={endedHeading} message={endedMessage} className="w-full sm:w-auto sm:max-w-sm" />
          ) : null}
        </div>
      </div>

      <div className="max-w-[1180px] mx-auto px-4 md:px-6 py-5">
        <Breadcrumb items={[{ label: heading }]} className="mb-4" />

        {/* Category filter (deals stay in curated display_order). */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {([
            { key: "all", label: "All" },
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

        {!dealsEnabled ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🛍️</p>
            <h2 className="pf text-xl mb-2">No deals right now</h2>
            <p className="text-muted-foreground text-sm">Check back soon.</p>
          </div>
        ) : isLoading ? (
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
            <p className="text-4xl mb-3">🛍️</p>
            <h2 className="pf text-xl mb-2">No deals in this category right now</h2>
            <p className="text-muted-foreground text-sm">Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
            {filtered.map((d) => (
              <FlashDealCard key={d.dealId} product={d.product} brandId={d.brandId} brandName={d.brandName} sku={d.sku} price={d.price} compareAt={d.compareAt} promoLabel={d.promoLabel} promoEndsAt={d.promoEndsAt} className="w-full" zoomable />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
