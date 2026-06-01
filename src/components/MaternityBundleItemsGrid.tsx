import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ProductImage from "@/components/ProductImage";

// Read-only items grid for maternity-bundle-* product pages.
// Reads the latest snapshot from maternity_bundle_snapshots — the SAME
// table BundleCustomiser reads — so the daily quiz-engine refresh
// drives both surfaces from one source of truth.
//
// No edit controls; the customise UX still lives in BundleCustomiser
// (which the page mounts inline when the customer taps "Or customise").

interface Props {
  bundleId: string;
}

interface SnapshotItem {
  product_id: string;
  name?: string;
  quantity?: number;
  brand?: {
    id?: string;
    brand_name?: string;
    price?: number;
    image_url?: string | null;
    stored_image_url?: string | null;
  } | null;
}

export default function MaternityBundleItemsGrid({ bundleId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["maternity-bundle-snapshot-items", bundleId],
    enabled: !!bundleId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("maternity_bundle_snapshots")
        .select("items_snapshot, item_count")
        .eq("bundle_id", bundleId)
        .order("snapped_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <section className="px-6 md:px-12 lg:px-16 py-10 md:py-16 border-t border-border/40">
        <div className="max-w-[1120px] mx-auto text-sm text-text-light">
          Loading items…
        </div>
      </section>
    );
  }

  const items: SnapshotItem[] = Array.isArray(data?.items_snapshot)
    ? (data!.items_snapshot as SnapshotItem[])
    : [];

  if (items.length === 0) return null;

  return (
    <section className="px-6 md:px-12 lg:px-16 py-10 md:py-16 border-t border-border/40">
      <div className="max-w-[1120px] mx-auto">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-med mb-8 md:mb-10">
          What&rsquo;s inside — {items.length}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {items.map((it, i) => {
            const img = it.brand?.stored_image_url || it.brand?.image_url || null;
            return (
              <div key={`${it.product_id}-${i}`} className="group">
                <div className="aspect-[3/4] overflow-hidden bg-warm-cream mb-3 md:mb-4">
                  <ProductImage
                    imageUrl={img || undefined}
                    alt={it.name || "Product"}
                    className="w-full h-full transition-transform duration-700 group-hover:scale-[1.02]"
                    emojiClassName="text-5xl"
                  />
                </div>
                <p className="text-foreground text-sm leading-snug line-clamp-2">
                  {it.name || "—"}
                  {it.quantity && it.quantity > 1 && (
                    <span className="text-text-light font-normal"> × {it.quantity}</span>
                  )}
                </p>
                {it.brand?.brand_name && (
                  <p className="text-text-light text-xs mt-1 line-clamp-1">
                    {it.brand.brand_name}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Shared shape exported so the parent page can read the same snapshot
// when wiring the hero "Add bundle to cart" CTA without an extra query.
export type { SnapshotItem as MaternityBundleSnapshotItem };
