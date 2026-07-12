import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Trash2, Plus, Search, AlertTriangle, Pencil, ImageOff } from "lucide-react";

/**
 * Deals management. Curation is product-level (admin_add/remove/set_deal_product),
 * but PROMOTIONS are BRAND-WIDE and set here in place via admin_set_brand_promotion.
 * The live list (admin_list_deal_products) reports the financial impact of each
 * promo — customer_pays, revenue given up, cost and margin — so a loss-making
 * promo can never be saved blind. Live preview uses admin_preview_promotion; the
 * storefront/cart/place-order all price via get_brand_effective_price.
 */

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const naira = (n: any) => (n == null ? "" : `₦${Number(n).toLocaleString("en-NG")}`);

// Compact square product thumbnail. Neutral placeholder when there is no image
// or when a URL fails to load — never a broken image.
function DealThumb({ url, alt }: { url: string | null | undefined; alt: string }) {
  return (
    <div className="w-10 h-10 rounded-md bg-muted border border-border overflow-hidden flex-shrink-0 flex items-center justify-center">
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <ImageOff className="w-4 h-4 text-text-light" />
      )}
    </div>
  );
}

type DealRow = {
  deal_id: string;
  product_id: string;
  product_name: string;
  subcategory: string | null;
  display_order: number;
  is_active: boolean;
  brand_id: string;
  brand_name: string | null;
  sku: string | null;
  list_price: number | null;
  cost_price: number | null;
  promo_type: string | null;
  promo_label: string | null;
  discount_percent: number | null;
  bogo_buy_qty: number | null;
  bogo_get_percent_off: number | null;
  starts_at: string | null;
  ends_at: string | null;
  promo_live: boolean;
  eval_qty: number | null;
  customer_pays: number | null;
  normal_revenue: number | null;
  revenue_given_up: number | null;
  your_cost: number | null;
  your_margin: number | null;
  margin_pct: number | null;
  below_cost: boolean;
  image_url: string | null;
};

type BrandHit = {
  brand_id: string;
  brand_name: string | null;
  sku: string | null;
  product_id: string;
  product_name: string;
  subcategory: string | null;
  price: number | null;
  cost_price: number | null;
  in_stock: boolean;
  image_url: string | null;
  on_deals: boolean;
  has_promo: boolean;
};

// LOSS -> red, thin (< ~10% of what the customer pays) -> amber, else forest.
function marginTone(margin: number | null, customerPays: number | null, belowCost: boolean) {
  const m = Number(margin) || 0;
  const cp = Number(customerPays) || 0;
  if (belowCost || m <= 0) return { cls: "text-red-600", tag: "LOSING MONEY", tagCls: "bg-red-100 text-red-700" };
  if (cp > 0 && m < cp * 0.1) return { cls: "text-amber-600", tag: "thin margin", tagCls: "bg-amber-100 text-amber-700" };
  return { cls: "text-forest", tag: "", tagCls: "" };
}

// ISO <-> <input type="datetime-local"> value.
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Live promo preview for a single brand, recomputed via admin_preview_promotion
// as the admin edits — BEFORE saving.
function usePromoPreview(brandId: string, promoType: string, discountPercent: string, buyQty: string, getPct: string) {
  const validDiscount = promoType === "discount" && Number(discountPercent) > 0;
  const validBogo = promoType === "bogo" && Number(buyQty) > 0 && getPct !== "";
  const enabled = validDiscount || validBogo;
  const { data } = useQuery({
    queryKey: ["promo-preview", brandId, promoType, discountPercent, buyQty, getPct],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_preview_promotion", {
        p_brand_id: brandId,
        p_promo_type: promoType,
        p_discount_percent: promoType === "discount" ? Number(discountPercent) : null,
        p_bogo_buy_qty: promoType === "bogo" ? Number(buyQty) : null,
        p_bogo_get_percent_off: promoType === "bogo" ? Number(getPct) : null,
        // Gift params (this editor only sets discount/bogo). Sent explicitly so
        // the call resolves to the current gift-aware overload unambiguously —
        // PostgREST otherwise can't choose between two overloads if a stale one
        // lingers during a migration (PGRST201/203), which silently breaks BOGO.
        p_trigger_qty: null,
        p_gift_brand_id: null,
        p_gift_qty: null,
        p_gift_percent_off: null,
      });
      if (error) throw error;
      return (data && data[0]) || null;
    },
  });
  return data || null;
}

function PromoEditor({ row, onDone }: { row: DealRow; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [promoType, setPromoType] = useState<string>(row.promo_type === "bogo" ? "bogo" : "discount");
  const [discountPercent, setDiscountPercent] = useState<string>(row.discount_percent != null ? String(row.discount_percent) : "");
  const [buyQty, setBuyQty] = useState<string>(row.bogo_buy_qty != null ? String(row.bogo_buy_qty) : "1");
  const [getPct, setGetPct] = useState<string>(row.bogo_get_percent_off != null ? String(row.bogo_get_percent_off) : "100");
  const [startsAt, setStartsAt] = useState<string>(toLocalInput(row.starts_at));
  const [endsAt, setEndsAt] = useState<string>(toLocalInput(row.ends_at));

  const preview = usePromoPreview(row.brand_id, promoType, discountPercent, buyQty, getPct);

  const save = useMutation({
    mutationFn: async () => {
      // Validate BEFORE the RPC so a malformed promo can never save blind and
      // then silently fail the DB CHECK constraint (buy qty / get% NOT NULL).
      if (promoType === "bogo") {
        const bq = Number(buyQty);
        const gp = Number(getPct);
        if (!Number.isInteger(bq) || bq < 1) {
          throw new Error("Buy quantity must be a whole number of 1 or more.");
        }
        if (!Number.isFinite(gp) || gp < 1 || gp > 100) {
          throw new Error("‘Get next at % off’ must be between 1 and 100 (100 = free).");
        }
      } else {
        const dp = Number(discountPercent);
        if (!Number.isFinite(dp) || dp < 1 || dp > 100) {
          throw new Error("Discount % must be between 1 and 100.");
        }
      }
      const { error } = await (supabase as any).rpc("admin_set_brand_promotion", {
        p_brand_id: row.brand_id,
        p_promo_type: promoType,
        p_discount_percent: promoType === "discount" ? Number(discountPercent) : null,
        p_bogo_buy_qty: promoType === "bogo" ? Number(buyQty) : null,
        p_bogo_get_percent_off: promoType === "bogo" ? Number(getPct) : null,
        p_starts_at: fromLocalInput(startsAt) ?? new Date().toISOString(),
        p_ends_at: fromLocalInput(endsAt),
        // Gift params (this editor only sets discount/bogo). Passed explicitly so
        // PostgREST resolves to the current gift-aware overload unambiguously — a
        // stale narrower overload lingering during a DB migration otherwise makes
        // the named-arg call ambiguous (PGRST201/203) and BOGO saves fail silently.
        p_trigger_qty: null,
        p_gift_brand_id: null,
        p_gift_qty: null,
        p_gift_percent_off: null,
        p_gift_max_per_order: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deal-products"] });
      toast.success("Promotion saved");
      onDone();
    },
    onError: (e: any) => toast.error(`Could not save promotion: ${e.message || e}`),
  });
  const clear = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("admin_clear_brand_promotion", { p_brand_id: row.brand_id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deal-products"] });
      toast.success("Promotion cleared");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pMargin = preview ? Number(preview.your_margin) : null;
  const pCustomerPays = preview ? Number(preview.customer_pays) : null;
  const pBelowCost = !!preview?.below_cost;
  const tone = marginTone(pMargin, pCustomerPays, pBelowCost);

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="border border-input rounded-lg px-2 py-1.5 text-sm bg-background" value={promoType} onChange={(e) => setPromoType(e.target.value)}>
          <option value="discount">% discount</option>
          <option value="bogo">Buy X get Y</option>
        </select>
        {promoType === "discount" ? (
          <label className="text-sm flex items-center gap-1.5">
            <input type="number" min={1} max={100} className="w-20 border border-input rounded-lg px-2 py-1.5 text-sm bg-background" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="%" />
            % off
          </label>
        ) : (
          <div className="flex items-center gap-1.5 text-sm">
            Buy
            <input type="number" min={1} className="w-16 border border-input rounded-lg px-2 py-1.5 text-sm bg-background" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} />
            get 1 at
            <input type="number" min={1} max={100} className="w-16 border border-input rounded-lg px-2 py-1.5 text-sm bg-background" value={getPct} onChange={(e) => setGetPct(e.target.value)} />
            % off <span className="text-text-light">(100 = free)</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs font-semibold text-text-med">Starts at
          <input type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-text-med">Ends at (blank = runs until cleared)
          <input type="datetime-local" className={inputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
      </div>

      {/* Live preview — updates BEFORE saving. */}
      {preview && (
        <div className="rounded-lg bg-card border border-border p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">{preview.promo_label || "Promo"}</span>
            {tone.tag && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${tone.tagCls}`}><AlertTriangle className="w-3 h-3" /> {tone.tag}</span>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono-price">
            <span className="text-text-med">List</span><span className="text-right">{naira(preview.list_price)}</span>
            <span className="text-text-med">Customer pays</span><span className="text-right">{naira(preview.customer_pays)}</span>
            <span className="text-text-med">Your cost</span><span className="text-right">{naira(preview.your_cost)}</span>
            <span className="text-text-med font-semibold">Your margin</span>
            <span className={`text-right font-bold ${tone.cls}`}>{naira(preview.your_margin)} ({preview.margin_pct}%)</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-forest text-primary-foreground px-3 py-1.5 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">Save promotion</button>
        {row.promo_type && (
          <button onClick={() => clear.mutate()} disabled={clear.isPending} className="rounded-lg border border-destructive text-destructive px-3 py-1.5 text-sm font-semibold hover:bg-destructive/10 disabled:opacity-50">Clear promotion</button>
        )}
        <button onClick={onDone} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted">Cancel</button>
      </div>
    </div>
  );
}

export default function AdminDeals() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null); // brand_id being edited

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

  // ---- Deal BRAND list (one row per brand; same product can appear more than
  // once with different brands). Margins per the previous prompt still apply. ----
  const { data: deals, isLoading } = useQuery({
    queryKey: ["admin-deal-brands"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_list_deal_brands");
      if (error) throw error;
      return (data || []) as DealRow[];
    },
  });
  const ordered = useMemo(() => [...(deals || [])].sort((a, b) => a.display_order - b.display_order), [deals]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-deal-brands"] });

  const addDeal = useMutation({
    mutationFn: async (brandId: string) => {
      const { error } = await (supabase as any).rpc("admin_add_deal_brand", { p_brand_id: brandId });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Brand added to deals"); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeDeal = useMutation({
    mutationFn: async (brandId: string) => {
      const { error } = await (supabase as any).rpc("admin_remove_deal_brand", { p_brand_id: brandId });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Brand removed from deals"); },
    onError: (e: any) => toast.error(e.message),
  });
  const reorder = useMutation({
    mutationFn: async (rows: DealRow[]) => {
      const { error } = await (supabase as any).rpc("admin_reorder_deals", { p_brand_ids: rows.map((r) => r.brand_id) });
      if (error) throw error;
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

  // ---- Brand-level search (mirrors the quote admin search) ----
  const { data: brandHits } = useQuery({
    queryKey: ["admin-brand-deal-search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_search_brands_for_deals", { p_query: q.trim(), p_limit: 30 });
      if (error) throw error;
      return (data || []) as BrandHit[];
    },
  });

  return (
    <div className="max-w-[1100px]">
      <h1 className="pf text-2xl font-bold mb-1">Deals</h1>
      <p className="text-text-med text-sm mb-6">
        Curate the products shown on <code>/deals</code> and the homepage rail, and run brand-wide promotions
        (a % discount or a buy-X-get-Y offer) with a per-brand timer. Every promo shows what it costs you and
        your resulting margin before you save.
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
            <label className="text-xs font-semibold text-text-med block mb-1">Page countdown ends at (optional)</label>
            <input type="datetime-local" className={inputCls} value={s.endsAt || ""} onChange={(e) => setForm({ ...s, endsAt: e.target.value })} />
            <p className="text-[11px] text-text-light mt-1">Page-level banner countdown. Per-brand promo timers are set on each row below.</p>
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

      {/* Add via brand search */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 mb-6">
        <h2 className="font-bold text-lg mb-3">Add a brand to deals</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
          <input className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brands by name, SKU or product..." />
        </div>
        {q.trim().length >= 2 && (
          <div className="mt-3 border border-border rounded-lg divide-y divide-border max-h-80 overflow-y-auto">
            {(brandHits || []).length === 0 ? (
              <p className="text-sm text-text-med p-3">No matching brands.</p>
            ) : (
              (brandHits || []).map((b) => (
                <div key={b.brand_id} className="flex items-center justify-between gap-3 p-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <DealThumb url={b.image_url} alt={b.product_name} />
                    <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{b.brand_name} <span className="text-text-light">· {b.product_name}</span></p>
                    <p className="text-[11px] text-text-light">
                      {b.sku ? `${b.sku} · ` : ""}{naira(b.price)}{b.cost_price != null ? ` · cost ${naira(b.cost_price)}` : ""}
                      {b.has_promo ? " · promo live" : ""}{!b.in_stock ? " · out of stock" : ""}
                    </p>
                    </div>
                  </div>
                  <button
                    disabled={b.on_deals || addDeal.isPending}
                    onClick={() => addDeal.mutate(b.brand_id)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-coral text-white px-3 py-1.5 text-xs font-semibold hover:bg-coral-dark disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" /> {b.on_deals ? "Added" : "Add"}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Current deals with margin + edit-in-place */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h2 className="font-bold text-lg mb-3">Current deals ({ordered.length})</h2>
        {isLoading ? (
          <p className="text-sm text-text-med">Loading...</p>
        ) : ordered.length === 0 ? (
          <p className="text-sm text-text-med">No deals yet. Add a brand above.</p>
        ) : (
          <div className="space-y-3">
            {ordered.map((d, i) => {
              const tone = marginTone(d.your_margin, d.customer_pays, d.below_cost);
              return (
                <div key={d.deal_id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <DealThumb url={d.image_url} alt={d.product_name} />
                      <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{d.product_name}</span>
                        {!d.is_active && <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">inactive</span>}
                        {d.promo_type && (d.promo_live
                          ? <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">live</span>
                          : <span className="text-[10px] font-semibold text-text-light bg-muted px-1.5 py-0.5 rounded">scheduled/ended</span>)}
                      </div>
                      <p className="text-coral text-xs font-semibold mt-0.5">{d.brand_name}{d.sku ? ` · ${d.sku}` : ""}</p>
                      <p className="text-xs text-text-med mt-0.5">{d.promo_label || "No promo"}{d.eval_qty ? ` · at qty ${d.eval_qty}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending} className="p-1 rounded hover:bg-muted disabled:opacity-30" aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => move(i, 1)} disabled={i === ordered.length - 1 || reorder.isPending} className="p-1 rounded hover:bg-muted disabled:opacity-30" aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditing(editing === d.brand_id ? null : d.brand_id)} className="p-1.5 rounded hover:bg-muted text-forest" aria-label="Edit promo"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => removeDeal.mutate(d.brand_id)} disabled={removeDeal.isPending} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  {/* Financial impact */}
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-1 text-[13px] font-mono-price">
                    <div><div className="text-[10px] uppercase tracking-wide text-text-light font-sans">Customer pays</div>{naira(d.customer_pays)}</div>
                    <div><div className="text-[10px] uppercase tracking-wide text-text-light font-sans">Normal revenue</div>{naira(d.normal_revenue)}</div>
                    <div><div className="text-[10px] uppercase tracking-wide text-text-light font-sans">Revenue given up</div><span className="text-coral">{naira(d.revenue_given_up)}</span></div>
                    <div><div className="text-[10px] uppercase tracking-wide text-text-light font-sans">Your cost</div>{naira(d.your_cost)}</div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-light font-sans">Your margin</div>
                      <span className={`font-bold ${tone.cls}`}>{naira(d.your_margin)} ({d.margin_pct}%)</span>
                    </div>
                  </div>
                  {tone.tag && (
                    <div className={`mt-2 inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-bold ${tone.tagCls}`}>
                      <AlertTriangle className="w-3.5 h-3.5" /> {tone.tag === "LOSING MONEY" ? "LOSING MONEY on this promo" : "Thin margin — Paystack/Klump fees and delivery can wipe it out"}
                    </div>
                  )}

                  {editing === d.brand_id && <PromoEditor row={d} onDone={() => setEditing(null)} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
