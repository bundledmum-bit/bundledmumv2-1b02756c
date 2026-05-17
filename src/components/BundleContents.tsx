import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/cart";

/**
 * "What's Inside" panel for bundle product pages.
 *
 * - Fixed bundles (gift boxes, recovery kits): items + price via the
 *   get_gift_box_price RPC. Disabled items show as "Not included".
 * - Maternity bundles: items + price from the latest
 *   maternity_bundle_snapshots row.
 */
interface BundleContentsProps {
  productId: string;
  productName: string;
}

interface FixedItem {
  gift_box_item_id?: string;
  product_id: string;
  product_name: string;
  brand_id?: string | null;
  brand_name?: string | null;
  unit_price: number;
  quantity: number;
  line_retail?: number;
  is_enabled?: boolean;
  is_optional?: boolean;
}

interface PanelData {
  item_count: number;
  retail_total: number;
  sell_price: number;
  discount_pct: number;
  items: FixedItem[];
}

export default function BundleContents({ productId, productName }: BundleContentsProps) {
  const isMaternityBundle = /^Maternity Bundle/i.test(productName || "");

  const fixedQuery = useQuery({
    queryKey: ["bundle-contents-fixed", productId],
    enabled: !isMaternityBundle,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc("get_gift_box_price", { p_gift_box_id: productId });
      if (error) throw error;
      const raw = data as any;
      const items: FixedItem[] = Array.isArray(raw?.items) ? raw.items : [];
      return {
        item_count: Number(raw?.item_count ?? 0),
        retail_total: Number(raw?.retail_total ?? 0),
        sell_price: Number(raw?.sell_price ?? 0),
        discount_pct: Number(raw?.discount_pct ?? 0),
        items,
      } as PanelData;
    },
    staleTime: 60_000,
  });

  const matQuery = useQuery({
    queryKey: ["bundle-contents-maternity", productId],
    enabled: isMaternityBundle,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("maternity_bundle_snapshots")
        .select("items_snapshot, item_count, retail_total, sell_price")
        .eq("bundle_id", productId)
        .order("snapped_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const snap = data as any;
      const items: FixedItem[] = (Array.isArray(snap.items_snapshot) ? snap.items_snapshot : []).map((it: any) => ({
        product_id: String(it?.product_id ?? ""),
        product_name: it?.name || "—",
        brand_name: it?.brand?.brand_name ?? null,
        brand_id: it?.brand?.id ?? null,
        unit_price: Number(it?.brand?.price ?? 0),
        quantity: Number(it?.quantity ?? 1),
        is_enabled: true,
      }));
      const retail = Number(snap.retail_total ?? 0);
      const sell = Number(snap.sell_price ?? retail);
      return {
        item_count: Number(snap.item_count ?? items.length),
        retail_total: retail,
        sell_price: sell,
        discount_pct: retail > 0 ? Math.round((1 - sell / retail) * 100) : 0,
        items,
      } as PanelData;
    },
    staleTime: 60_000,
  });

  const data: PanelData | null | undefined = isMaternityBundle ? matQuery.data : fixedQuery.data;
  const loading = isMaternityBundle ? matQuery.isLoading : fixedQuery.isLoading;

  if (loading) {
    return (
      <section className="mt-8 bg-card border border-border rounded-card p-5">
        <div className="text-sm text-text-light">Loading bundle contents…</div>
      </section>
    );
  }
  if (!data || data.items.length === 0) return null;

  const enabledItems = data.items.filter(it => it.is_enabled !== false);
  const savings = Math.max(0, data.retail_total - data.sell_price);

  return (
    <section className="mt-8 bg-card border border-border rounded-card p-5 md:p-6">
      <div className="flex items-end justify-between mb-3 flex-wrap gap-1">
        <h2 className="pf text-xl md:text-2xl font-bold">What's Inside</h2>
        <p className="text-text-med text-sm">{enabledItems.length} item{enabledItems.length === 1 ? "" : "s"} included</p>
      </div>

      <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
        {data.items.map((it, idx) => {
          const disabled = it.is_enabled === false;
          const lineRetail = Number(it.line_retail ?? (it.unit_price * it.quantity));
          return (
            <li
              key={it.gift_box_item_id || `${it.product_id}-${idx}`}
              className={`flex items-center gap-3 px-3 py-2 ${disabled ? "bg-muted/30" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${disabled ? "line-through text-muted-foreground" : ""}`}>
                  {it.product_name}
                  {it.quantity > 1 && <span className="text-text-light font-normal"> × {it.quantity}</span>}
                </div>
                <div className={`text-[11px] ${disabled ? "text-muted-foreground" : "text-text-med"}`}>
                  {it.brand_name || "—"}
                </div>
              </div>
              {disabled ? (
                <span className="text-[11px] text-muted-foreground italic flex-shrink-0">Not included</span>
              ) : (
                <span className="text-sm font-semibold text-foreground flex-shrink-0 tabular-nums">
                  {fmt(lineRetail)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 space-y-1">
        {data.retail_total > 0 && data.sell_price !== data.retail_total && (
          <div className="flex justify-between text-sm text-text-med">
            <span>Retail total</span>
            <span className="line-through tabular-nums">{fmt(data.retail_total)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base">
          <span>Bundle Price</span>
          <span className="text-forest tabular-nums">{fmt(data.sell_price)}</span>
        </div>
        {savings > 0 && (
          <div className="flex justify-between text-sm text-coral font-semibold">
            <span>You save</span>
            <span className="tabular-nums">{fmt(savings)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
