import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

const fmt = (n: number) => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;

interface MatBundleRow {
  id: string;
  name: string;
  slug: string;
  bundle_discount_pct: number;
  brands: { id: string; sku: string | null; price: number; tier: string | null }[];
}

interface MatSnapshot {
  bundle_id: string;
  budget_amount: number;
  bundle_tier: "starter" | "standard" | "premium" | string;
  item_count: number;
  retail_total: number;
  sell_price: number;
  items_snapshot: any[] | null;
  snapped_at: string;
}

const tierBadge = (tier: string | null | undefined): string => {
  if (tier === "premium") return "bg-purple-100 text-purple-800";
  if (tier === "standard") return "bg-blue-100 text-blue-800";
  return "bg-green-100 text-green-800";
};

const tierLabel = (tier: string | null | undefined): string => {
  if (tier === "premium") return "Premium";
  if (tier === "standard") return "Standard";
  return "Starter";
};

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminMaternityBundles() {
  const qc = useQueryClient();
  const [refreshingAll, setRefreshingAll] = useState(false);

  const bundlesQuery = useQuery({
    queryKey: ["admin-maternity-bundles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, slug, bundle_discount_pct, brands ( id, sku, price, tier )")
        .eq("is_gift_box", true)
        .eq("is_active", true)
        .ilike("slug", "maternity-bundle-%")
        .order("slug");
      if (error) throw error;
      return (data || []) as MatBundleRow[];
    },
  });

  const snapshotsQuery = useQuery({
    queryKey: ["admin-maternity-bundle-snapshots", (bundlesQuery.data || []).map(b => b.id).join(",")],
    enabled: !!bundlesQuery.data && bundlesQuery.data.length > 0,
    queryFn: async () => {
      const ids = (bundlesQuery.data || []).map(b => b.id);
      if (ids.length === 0) return [] as MatSnapshot[];
      const { data, error } = await (supabase as any)
        .from("maternity_bundle_snapshots")
        .select("bundle_id, budget_amount, bundle_tier, item_count, retail_total, sell_price, items_snapshot, snapped_at")
        .in("bundle_id", ids)
        .order("snapped_at", { ascending: false });
      if (error) throw error;
      return (data || []) as MatSnapshot[];
    },
  });

  const snapshotMap = useMemo(() => {
    const m: Record<string, MatSnapshot> = {};
    (snapshotsQuery.data || []).forEach(s => {
      if (!m[s.bundle_id]) m[s.bundle_id] = s;
    });
    return m;
  }, [snapshotsQuery.data]);

  const refreshAll = async () => {
    setRefreshingAll(true);
    try {
      const { data, error } = await (supabase as any).rpc("refresh_maternity_bundle_prices");
      if (error) throw error;
      const count = Array.isArray((data as any)?.bundles) ? (data as any).bundles.length : 0;
      toast.success(`Maternity bundle prices refreshed — ${count} bundle${count === 1 ? "" : "s"} updated`);
      qc.invalidateQueries({ queryKey: ["admin-maternity-bundles"] });
      qc.invalidateQueries({ queryKey: ["admin-maternity-bundle-snapshots"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to refresh prices");
    } finally {
      setRefreshingAll(false);
    }
  };

  const isLoading = bundlesQuery.isLoading || snapshotsQuery.isLoading;
  const bundles = bundlesQuery.data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-text-med text-sm max-w-2xl">
          Maternity bundles are curated by the quiz engine. Items + retail prices snapshot nightly; click <em>Refresh prices</em> to re-run on demand.
        </p>
        <button
          onClick={refreshAll}
          disabled={refreshingAll}
          className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refreshingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {refreshingAll ? "Refreshing…" : "Refresh prices"}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading maternity bundles…</div>
      ) : bundles.length === 0 ? (
        <div className="text-center py-10 text-text-med">No maternity bundles configured.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {bundles.map(b => (
            <MaternityBundlePanel
              key={b.id}
              bundle={b}
              snapshot={snapshotMap[b.id] || null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MaternityBundlePanel({ bundle, snapshot }: { bundle: MatBundleRow; snapshot: MatSnapshot | null }) {
  const qc = useQueryClient();
  const [discountDraft, setDiscountDraft] = useState<string>(String(bundle.bundle_discount_pct ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDiscountDraft(String(bundle.bundle_discount_pct ?? 0));
  }, [bundle.bundle_discount_pct]);

  const discountNum = Number(discountDraft);
  const validDiscount = Number.isFinite(discountNum) && discountNum >= 0 && discountNum <= 100;
  const retail = Number(snapshot?.retail_total ?? 0);
  // Live preview tracks the input field; falls back to the snapshot's
  // canonical sell_price when the input is empty/invalid.
  const previewSell = validDiscount && retail > 0
    ? Math.round(retail * (1 - discountNum / 100))
    : Number(snapshot?.sell_price ?? 0);
  const sku = bundle.brands?.[0]?.sku || "—";
  const tier = (snapshot?.bundle_tier || bundle.brands?.[0]?.tier || null) as string | null;

  const saveDiscount = async () => {
    if (!validDiscount) {
      toast.error("Discount must be between 0 and 100.");
      return;
    }
    if (!snapshot) {
      toast.error("This bundle has no snapshot yet — click Refresh prices first.");
      return;
    }
    setSaving(true);
    try {
      const newSell = Math.round(retail * (1 - discountNum / 100));
      const { error: e1 } = await (supabase as any)
        .from("products")
        .update({ bundle_discount_pct: discountNum })
        .eq("id", bundle.id);
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any)
        .from("brands")
        .update({ price: newSell })
        .eq("product_id", bundle.id);
      if (e2) throw e2;
      toast.success("Discount updated");
      qc.invalidateQueries({ queryKey: ["admin-maternity-bundles"] });
      qc.invalidateQueries({ queryKey: ["admin-maternity-bundle-snapshots"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to save discount");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-5">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="pf text-base md:text-lg font-bold">
              Maternity + Baby Items Bundle — {fmt(snapshot?.budget_amount ?? extractBudgetFromName(bundle.name))}
            </h2>
            {tier && (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-pill ${tierBadge(tier)}`}>
                {tierLabel(tier)}
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-light">SKU: {sku}</p>
          {snapshot && (
            <p className="text-[11px] text-text-light">Updated {formatRelative(snapshot.snapped_at)}</p>
          )}
        </div>
      </div>

      {!snapshot ? (
        <div className="bg-warm-cream border border-dashed border-border rounded-lg p-4 text-center text-sm text-text-med">
          Prices not yet generated — click <strong>Refresh prices</strong> above to generate.
        </div>
      ) : (
        <>
          {/* Pricing */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-muted/30 rounded-lg p-2">
              <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light">Retail Total</div>
              <div className="text-sm font-bold">{fmt(retail)}</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2">
              <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light">Discount</div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={discountDraft}
                  onChange={e => setDiscountDraft(e.target.value)}
                  className="w-14 border border-input rounded px-1.5 py-0.5 text-sm bg-background"
                />
                <span className="text-xs text-text-med">%</span>
              </div>
            </div>
            <div className="bg-forest-light rounded-lg p-2">
              <div className="text-[10px] uppercase tracking-widest font-semibold text-forest">Sell Price</div>
              <div className="text-sm font-bold text-forest">{fmt(previewSell)}</div>
            </div>
          </div>

          <button
            onClick={saveDiscount}
            disabled={saving}
            className="mb-4 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save Discount"}
          </button>

          {/* Items list */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light mb-2">
              {snapshot.item_count} item{snapshot.item_count === 1 ? "" : "s"}
            </div>
            <div className="border border-border rounded-lg divide-y divide-border max-h-72 overflow-y-auto">
              {(snapshot.items_snapshot || []).map((it: any, idx: number) => {
                const brandName = it?.brand?.brand_name || "—";
                const unit = Number(it?.brand?.price ?? 0);
                const qty = Number(it?.quantity ?? 1);
                const line = unit * qty;
                const priority = (it?.priority || "").toLowerCase();
                return (
                  <div key={it?.product_id || idx} className="flex items-start justify-between gap-2 px-3 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{it?.name || "—"}</div>
                      <div className="text-[10px] text-text-med flex flex-wrap gap-x-2">
                        <span>Brand: {brandName}</span>
                        <span>Qty {qty} × {fmt(unit)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-semibold">{fmt(line)}</div>
                      {priority && (
                        <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${priorityBadge(priority)}`}>
                          {priority}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {(!snapshot.items_snapshot || snapshot.items_snapshot.length === 0) && (
                <div className="px-3 py-3 text-xs text-text-light italic">No items in snapshot.</div>
              )}
            </div>
            <p className="text-[10px] text-text-light mt-2 italic">
              Items are curated automatically by the quiz engine. Prices update nightly or when you click Refresh.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function priorityBadge(priority: string): string {
  if (priority === "essential") return "bg-red-100 text-red-700";
  if (priority === "recommended") return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-700";
}

function extractBudgetFromName(name: string): number {
  // "Maternity Bundle - ₦200k" / "₦1M" → numeric naira
  const m = name.match(/₦?\s*([\d.]+)\s*([kKmM])?/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const suffix = (m[2] || "").toLowerCase();
  if (suffix === "k") return Math.round(n * 1000);
  if (suffix === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}
