import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
// Merchandising RPCs aren't in the generated types; cast so TS accepts them.
const supabase = supabaseTyped as any;
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Trash2, Plus, Search } from "lucide-react";
import { useProductCategories } from "@/hooks/useProductCategories";

/**
 * Merchandising, rebuilt around SCOPES for the flat marketplace grid. Each scope
 * ('all' | 'baby' | 'mum' | 'push-gift' | 'sub:<slug>') has an admin-pinned list
 * of up to 25 products. get_merchandised_products renders those 1..25 first (in
 * this exact order) and daily-shuffles everything else. Positions beyond 25 are
 * NOT pinned — they are the shuffled tail.
 */

const naira = (n: any) => (n == null ? "" : `₦${Number(n).toLocaleString("en-NG")}`);
const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";

type RankRow = {
  product_id: string;
  product_name: string;
  subcategory: string | null;
  rank_position: number | null;
  pinned_brand_id: string | null;
  pinned_brand_name: string | null;
  resolved_brand_name: string | null;
  resolved_price: number | null;
  brand_count: number | null;
};

type BrandHit = {
  brand_id: string;
  brand_name: string | null;
  sku: string | null;
  product_id: string;
  product_name: string;
  subcategory: string | null;
  price: number | null;
  in_stock: boolean;
  on_deals: boolean;
  has_promo: boolean;
};

type ProductBrand = { brand_id: string; brand_name: string | null; sku: string | null; price: number | null; in_stock: boolean };

// Per-row "lead brand" dropdown: which brand the card shows on this scope's page.
function LeadBrandSelect({ scope, row, onChanged }: { scope: string; row: RankRow; onChanged: () => void }) {
  const { data: brands } = useQuery({
    queryKey: ["admin-product-brands", row.product_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_product_brands", { p_product_id: row.product_id });
      if (error) throw error;
      return (data || []) as ProductBrand[];
    },
    staleTime: 60_000,
  });
  const set = useMutation({
    mutationFn: async (brandId: string | null) => {
      const { error } = await supabase.rpc("admin_set_merch_rank", {
        p_scope: scope,
        p_product_id: row.product_id,
        p_position: row.rank_position,
        p_pinned_brand_id: brandId,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lead brand updated"); onChanged(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <select
      className="border border-input rounded-lg px-2 py-1 text-xs bg-background max-w-[180px]"
      value={row.pinned_brand_id || ""}
      onChange={(e) => set.mutate(e.target.value || null)}
      disabled={set.isPending}
    >
      <option value="">Auto (promo, else cheapest)</option>
      {(brands || []).map((b) => (
        <option key={b.brand_id} value={b.brand_id}>{b.brand_name}{b.sku ? ` · ${b.sku}` : ""} — {naira(b.price)}{b.in_stock ? "" : " (OOS)"}</option>
      ))}
    </select>
  );
}

export default function AdminMerchandising() {
  const queryClient = useQueryClient();
  const { data: categories } = useProductCategories();
  const [scope, setScope] = useState("all");
  const [q, setQ] = useState("");

  // Scope options: fixed shops + every subcategory as sub:<slug>.
  const scopeOptions = useMemo(() => {
    const base = [
      { value: "all", label: "All Products" },
      { value: "baby", label: "Baby" },
      { value: "mum", label: "Mum" },
      { value: "push-gift", label: "Gifts" },
    ];
    const subs = (categories || [])
      .slice()
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
      .map((c: any) => ({ value: `sub:${c.slug}`, label: c.name as string }));
    return { base, subs };
  }, [categories]);

  const { data: ranking, isLoading } = useQuery({
    queryKey: ["admin-merch-ranking", scope],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_merch_ranking", { p_scope: scope });
      if (error) throw error;
      return (data || []) as RankRow[];
    },
  });
  const ordered = useMemo(
    () => [...(ranking || [])].sort((a, b) => (a.rank_position ?? 9999) - (b.rank_position ?? 9999)),
    [ranking],
  );
  const pinnedIds = useMemo(() => new Set(ordered.map((r) => r.product_id)), [ordered]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-merch-ranking", scope] });

  const removeRank = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase.rpc("admin_remove_merch_rank", { p_scope: scope, p_product_id: productId });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Removed from pinned"); },
    onError: (e: any) => toast.error(e.message),
  });
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("admin_reorder_merch", { p_scope: scope, p_product_ids: ids });
      if (error) throw error;
    },
    onSuccess: () => refresh(),
    onError: (e: any) => toast.error(e.message),
  });
  const addRank = useMutation({
    mutationFn: async ({ productId, brandId }: { productId: string; brandId?: string | null }) => {
      const pos = Math.min(25, ordered.length + 1);
      const { error } = await supabase.rpc("admin_set_merch_rank", {
        p_scope: scope,
        p_product_id: productId,
        p_position: pos,
        p_pinned_brand_id: brandId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Pinned"); },
    onError: (e: any) => toast.error(e.message),
  });

  const move = (index: number, dir: -1 | 1) => {
    const rows = [...ordered];
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    [rows[index], rows[j]] = [rows[j], rows[index]];
    reorder.mutate(rows.map((r) => r.product_id));
  };

  // Brand/product search for adding to the pinned list.
  const { data: brandHits } = useQuery({
    queryKey: ["admin-merch-brand-search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_search_brands_for_deals", { p_query: q.trim(), p_limit: 30 });
      if (error) throw error;
      return (data || []) as BrandHit[];
    },
  });

  return (
    <div className="max-w-[1100px]">
      <h1 className="pf text-2xl font-bold mb-1">Merchandising</h1>
      <p className="text-text-med text-sm mb-6">
        Pin the products that lead each page. Pinned products (positions 1..25) show first in this exact
        order; everything else is shuffled fresh each day. Choose a scope, then pin, reorder and set an
        optional lead brand per product.
      </p>

      {/* Scope selector */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 mb-6">
        <label className="text-xs font-semibold text-text-med block mb-1">Scope</label>
        <select className={inputCls} value={scope} onChange={(e) => { setScope(e.target.value); setQ(""); }}>
          {scopeOptions.base.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {scopeOptions.subs.length > 0 && (
            <optgroup label="Subcategories">
              {scopeOptions.subs.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {/* Add product/brand */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 mb-6">
        <h2 className="font-bold text-lg mb-3">Pin a product to this scope</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
          <input className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product, brand or SKU..." />
        </div>
        {q.trim().length >= 2 && (
          <div className="mt-3 border border-border rounded-lg divide-y divide-border max-h-80 overflow-y-auto">
            {(brandHits || []).length === 0 ? (
              <p className="text-sm text-text-med p-3">No matches.</p>
            ) : (
              (brandHits || []).map((b) => {
                const already = pinnedIds.has(b.product_id);
                const atCap = ordered.length >= 25;
                return (
                  <div key={b.brand_id} className="flex items-center justify-between gap-3 p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.product_name} <span className="text-text-light">· {b.brand_name}</span></p>
                      <p className="text-[11px] text-text-light">{b.sku ? `${b.sku} · ` : ""}{naira(b.price)}{b.subcategory ? ` · ${b.subcategory}` : ""}</p>
                    </div>
                    <button
                      disabled={already || (atCap && !already) || addRank.isPending}
                      onClick={() => addRank.mutate({ productId: b.product_id, brandId: b.brand_id })}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-coral text-white px-3 py-1.5 text-xs font-semibold hover:bg-coral-dark disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5" /> {already ? "Pinned" : atCap ? "List full (25)" : "Pin"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Pinned list */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h2 className="font-bold text-lg mb-1">Pinned products ({ordered.length}/25)</h2>
        <p className="text-[12px] text-text-light mb-3">Everything not pinned here is shuffled daily on this page.</p>
        {isLoading ? (
          <p className="text-sm text-text-med">Loading...</p>
        ) : ordered.length === 0 ? (
          <p className="text-sm text-text-med">Nothing pinned for this scope yet. Search above to pin a product.</p>
        ) : (
          <div className="space-y-2">
            {ordered.map((r, i) => (
              <div key={r.product_id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                <div className="flex flex-col items-center gap-0.5">
                  <button onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending} className="p-0.5 rounded hover:bg-muted disabled:opacity-30" aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <span className="text-[11px] font-bold text-text-med w-5 text-center">{r.rank_position}</span>
                  <button onClick={() => move(i, 1)} disabled={i === ordered.length - 1 || reorder.isPending} className="p-0.5 rounded hover:bg-muted disabled:opacity-30" aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{r.product_name}</p>
                  <p className="text-[11px] text-text-light">
                    Card shows: <span className="font-semibold text-text-med">{r.resolved_brand_name || "—"}</span> · {naira(r.resolved_price)}
                    {r.brand_count ? ` · ${r.brand_count} brand${r.brand_count === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <LeadBrandSelect scope={scope} row={r} onChanged={refresh} />
                <button onClick={() => removeRank.mutate(r.product_id)} disabled={removeRank.isPending} className="p-1.5 rounded hover:bg-destructive/10 text-destructive shrink-0" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
