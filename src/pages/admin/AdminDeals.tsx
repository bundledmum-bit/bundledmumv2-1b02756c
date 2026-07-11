import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Trash2, Plus, Search } from "lucide-react";

/**
 * Deals management. The deal set is admin-curated: rows come from
 * admin_list_deal_products(); products are added/removed/reordered via
 * admin_add_deal_product / admin_remove_deal_product / admin_set_deal_order.
 * The storefront reads the resulting list from get_deal_products(). The
 * deals_* site_settings control the storefront heading, subtitle, countdown
 * and on/off toggle. A real discount only exists when a brand's compare_at_price
 * is set (see the product/brand editor) -- the on_real_sale flag surfaces that.
 */

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const naira = (n: any) => (n == null ? "" : `₦${Number(n).toLocaleString("en-NG")}`);

type DealRow = {
  product_id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  display_order: number;
  is_active: boolean;
  price: number | null;
  compare_at_price: number | null;
  on_real_sale: boolean;
};

export default function AdminDeals() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");

  // ---- Deals settings (site_settings) ----
  const { data: settingsRows } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("*");
      if (error) throw error;
      return data as any[];
    },
  });
  const settingsMap = useMemo(() => new Map((settingsRows || []).map((s) => [s.key, s.value])), [settingsRows]);
  const [form, setForm] = useState<{ enabled?: boolean; heading?: string; subtitle?: string; endsAt?: string } | null>(null);
  const s = form ?? {
    enabled: settingsMap.get("deals_enabled") !== false && settingsMap.get("deals_enabled") !== "false",
    heading: (settingsMap.get("deals_heading") as string) || "",
    subtitle: (settingsMap.get("deals_subtitle") as string) || "",
    endsAt: (settingsMap.get("deals_ends_at") as string) || "",
  };
  const upsertSettings = useMutation({
    mutationFn: async (entries: { key: string; value: any }[]) => {
      const { error } = await supabase.from("site_settings").upsert(entries, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["site_settings"] });
      setForm(null);
      toast.success("Deals settings saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ---- Deal product list ----
  const { data: deals, isLoading } = useQuery({
    queryKey: ["admin-deal-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_list_deal_products");
      if (error) throw error;
      return (data || []) as DealRow[];
    },
  });
  const ordered = useMemo(() => [...(deals || [])].sort((a, b) => a.display_order - b.display_order), [deals]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-deal-products"] });

  const addDeal = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await (supabase as any).rpc("admin_add_deal_product", { p_product_id: productId });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Added to deals"); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeDeal = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await (supabase as any).rpc("admin_remove_deal_product", { p_product_id: productId });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Removed from deals"); },
    onError: (e: any) => toast.error(e.message),
  });
  const reorder = useMutation({
    mutationFn: async (rows: DealRow[]) => {
      // Reindex all rows to a clean 0..n order.
      for (let i = 0; i < rows.length; i++) {
        const { error } = await (supabase as any).rpc("admin_set_deal_order", { p_product_id: rows[i].product_id, p_order: i });
        if (error) throw error;
      }
    },
    onSuccess: () => { refresh(); },
    onError: (e: any) => toast.error(e.message),
  });
  const move = (index: number, dir: -1 | 1) => {
    const rows = [...ordered];
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    [rows[index], rows[j]] = [rows[j], rows[index]];
    reorder.mutate(rows);
  };

  // ---- Product picker (search active products not already a deal) ----
  const dealIds = useMemo(() => new Set((deals || []).map((d) => d.product_id)), [deals]);
  const { data: matches } = useQuery({
    queryKey: ["admin-product-picker", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category")
        .eq("is_active", true)
        .is("deleted_at", null)
        .ilike("name", `%${q.trim()}%`)
        .order("name")
        .limit(12);
      if (error) throw error;
      return (data || []) as { id: string; name: string; category: string | null }[];
    },
  });

  return (
    <div className="max-w-[1100px]">
      <h1 className="pf text-2xl font-bold mb-1">Deals</h1>
      <p className="text-text-med text-sm mb-6">
        Curate the products shown on <code>/deals</code> and the homepage deals rail. A strike-through price
        only appears when a brand has a Compare-at price set (edit that in the product form).
      </p>

      {/* Deals settings */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 mb-6">
        <h2 className="font-bold text-lg mb-3">Storefront settings</h2>
        <label className="flex items-center gap-2 mb-3 text-sm font-semibold">
          <input type="checkbox" checked={!!s.enabled} onChange={(e) => setForm({ ...s, enabled: e.target.checked })} />
          Deals enabled (show the deals page and homepage rail)
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Heading</label>
            <input className={inputCls} value={s.heading} placeholder="Deals" onChange={(e) => setForm({ ...s, heading: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Subtitle</label>
            <input className={inputCls} value={s.subtitle} placeholder="Optional" onChange={(e) => setForm({ ...s, subtitle: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Countdown ends at (optional)</label>
            <input type="datetime-local" className={inputCls} value={s.endsAt || ""} onChange={(e) => setForm({ ...s, endsAt: e.target.value })} />
            <p className="text-[11px] text-text-light mt-1">Leave empty for no countdown.</p>
          </div>
        </div>
        <button
          onClick={() => upsertSettings.mutate([
            { key: "deals_enabled", value: !!s.enabled },
            { key: "deals_heading", value: s.heading || "" },
            { key: "deals_subtitle", value: s.subtitle || "" },
            { key: "deals_ends_at", value: s.endsAt ? s.endsAt : null },
          ])}
          disabled={upsertSettings.isPending}
          className="mt-4 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
        >
          Save settings
        </button>
      </div>

      {/* Add product */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 mb-6">
        <h2 className="font-bold text-lg mb-3">Add a product to deals</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
          <input className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search active products by name..." />
        </div>
        {q.trim().length >= 2 && (
          <div className="mt-3 border border-border rounded-lg divide-y divide-border max-h-72 overflow-y-auto">
            {(matches || []).length === 0 ? (
              <p className="text-sm text-text-med p-3">No matching active products.</p>
            ) : (
              (matches || []).map((m) => {
                const already = dealIds.has(m.id);
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 p-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-[11px] text-text-light">{m.category || "-"}</p>
                    </div>
                    <button
                      disabled={already || addDeal.isPending}
                      onClick={() => addDeal.mutate(m.id)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-coral text-white px-3 py-1.5 text-xs font-semibold hover:bg-coral-dark disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5" /> {already ? "Added" : "Add"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Current deals */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h2 className="font-bold text-lg mb-3">Current deals ({ordered.length})</h2>
        {isLoading ? (
          <p className="text-sm text-text-med">Loading...</p>
        ) : ordered.length === 0 ? (
          <p className="text-sm text-text-med">No deals yet. Add products above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-text-med border-b border-border">
                  <th className="py-2 pr-2 w-24">Order</th>
                  <th className="py-2 pr-2">Product</th>
                  <th className="py-2 pr-2">Category</th>
                  <th className="py-2 pr-2">Price</th>
                  <th className="py-2 pr-2">Compare-at</th>
                  <th className="py-2 pr-2">Real sale?</th>
                  <th className="py-2 pr-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((d, i) => (
                  <tr key={d.product_id} className="border-b border-border/60">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending} className="p-1 rounded hover:bg-muted disabled:opacity-30" aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => move(i, 1)} disabled={i === ordered.length - 1 || reorder.isPending} className="p-1 rounded hover:bg-muted disabled:opacity-30" aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      <span className="font-medium">{d.name}</span>
                      {!d.is_active && <span className="ml-2 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">inactive</span>}
                    </td>
                    <td className="py-2 pr-2 text-text-med">{d.category || "-"}{d.subcategory ? ` / ${d.subcategory}` : ""}</td>
                    <td className="py-2 pr-2 font-mono-price">{naira(d.price)}</td>
                    <td className="py-2 pr-2 font-mono-price text-text-med">{naira(d.compare_at_price)}</td>
                    <td className="py-2 pr-2">
                      {d.on_real_sale ? (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">real discount</span>
                      ) : (
                        <span className="text-[10px] font-semibold text-text-light bg-muted px-1.5 py-0.5 rounded">no discount</span>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <button onClick={() => removeDeal.mutate(d.product_id)} disabled={removeDeal.isPending} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
