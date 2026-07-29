import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Gift, Plus, Trash2, Search, X, AlertTriangle, RefreshCw, Clock,
  Loader2, PackageX, ShoppingBag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

// Money is integer naira (never /100), same convention as fmtN elsewhere.
const naira = (n: number | null | undefined) =>
  typeof n === "number" && isFinite(n) ? `₦${Math.round(n).toLocaleString()}` : "₦0";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

// Surface the server's message verbatim — the DB is the source of truth for
// FK/threshold/stock failures, so we never reword or pre-validate them.
const errMsg = (e: any, fallback: string) => e?.message || fallback;

// ─── Types (mirror the views / RPCs) ───────────────────────────────
interface TierSummary {
  tier_key: string;
  label: string;
  threshold: number;
  cap: number;
  grant_free_delivery: boolean;
  timer_hours: number;
  offer_copy: string;
  is_active: boolean;
  configured_retail_value: number;
  configured_cost_value: number;
  item_count: number;
  has_out_of_stock_item: boolean;
}
interface TierItemDetailed {
  id: string;
  tier_key: string;
  brand_id: string;
  quantity: number;
  display_order: number | null;
  sku: string | null;
  brand_name: string | null;
  product_name: string | null;
  price: number | null;
  cost_price: number | null;
  in_stock: boolean;
  image_url: string | null;
}
interface LivePromo {
  quote_id: string;
  quote_number: string;
  customer_name: string | null;
  tier: string;
  tier_label: string;
  status: "applied" | "active";
  discount: number;
  applied_at: string;
  first_viewed_at: string | null;
  expires_at: string | null;
  delivery_granted: boolean;
  total: number;
  share_token: string | null;
}
interface TierStat {
  tier: string;
  tier_label: string;
  currently_active: number;
  currently_applied: number;
  naturally_expired: number;
  manually_cancelled: number;
  converted_to_order: number;
  total_applications: number;
  total_discount_on_paid_orders: number;
  total_discount_all_time: number;
}

// ════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════
export default function QuotePromoAdmin() {
  const { can } = usePermissions();
  const canEdit = can("quotes", "edit");

  return (
    <div className="max-w-[1100px]">
      <div className="mb-6">
        <h1 className="pf text-2xl font-bold flex items-center gap-2">
          <Gift className="w-6 h-6" /> Quote Promo
        </h1>
        <p className="text-sm text-text-med mt-1">
          Configure the free-items promo tiers and manage every promo that is
          currently live across all quotes.
        </p>
      </div>

      <StatsSection />
      <TierConfigSection canEdit={canEdit} />
      <LivePromosSection canEdit={canEdit} />
      <LandingPageAssignmentSection canEdit={canEdit} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SECTION 1 — STATS
// ════════════════════════════════════════════════════════════════════
function StatsSection() {
  const { data: stats = [], isLoading } = useQuery({
    queryKey: ["fip-stats"],
    queryFn: async (): Promise<TierStat[]> => {
      const { data, error } = await (supabase as any).rpc("get_free_items_promo_stats");
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as TierStat[];
    },
  });

  return (
    <section className="mb-8">
      <h2 className="text-sm font-bold uppercase tracking-widest text-text-med mb-3">Stats</h2>
      {isLoading ? (
        <div className="text-sm text-text-med">Loading stats…</div>
      ) : stats.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-text-med">
          No promo has been applied to any quote yet. Stats will appear here once a tier is used.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.tier} className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold mb-3">{s.tier_label}</h3>
              <dl className="space-y-1 text-[13px]">
                <StatRow k="Currently active" v={s.currently_active} />
                <StatRow k="Currently applied" v={s.currently_applied} />
                <StatRow k="Naturally expired" v={s.naturally_expired} />
                <StatRow k="Manually cancelled" v={s.manually_cancelled} />
                <StatRow k="Converted to order" v={s.converted_to_order} />
                <StatRow k="Total applications" v={s.total_applications} />
              </dl>
              <div className="mt-3 pt-3 border-t border-border space-y-1 text-[13px]">
                <StatRow k="Discount on paid orders" v={naira(s.total_discount_on_paid_orders)} strong />
                <StatRow k="Discount all time" v={naira(s.total_discount_all_time)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatRow({ k, v, strong }: { k: string; v: string | number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-text-med">{k}</dt>
      <dd className={`tabular-nums ${strong ? "font-bold text-forest" : "font-semibold"}`}>{v}</dd>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SECTION 2 — TIER CONFIGURATION
// ════════════════════════════════════════════════════════════════════
function TierConfigSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: tiers = [], isLoading } = useQuery({
    queryKey: ["fip-tier-summary"],
    queryFn: async (): Promise<TierSummary[]> => {
      const { data, error } = await (supabase as any)
        .from("free_items_promo_tier_summary")
        .select("*")
        .order("threshold", { ascending: false });
      if (error) throw error;
      return (data || []) as TierSummary[];
    },
  });

  const [creating, setCreating] = useState(false);

  const createTier = async () => {
    const rawKey = window.prompt(
      "New tier key — lowercase letters, numbers and underscores only:",
      "tier_750k",
    );
    if (rawKey == null) return;
    const tier_key = rawKey.trim();
    if (!/^[a-z0-9_]+$/.test(tier_key)) {
      toast.error("Tier key must be lowercase letters, numbers and underscores only.");
      return;
    }
    const label = window.prompt("Label for this tier (e.g. ₦750k tier):", "")?.trim();
    if (label == null || label === "") {
      toast.error("A label is required.");
      return;
    }
    setCreating(true);
    // Sensible, safe defaults; is_active false so a half-configured tier can't
    // go live before the admin fills in real values.
    const { error } = await (supabase as any).from("free_items_promo_tiers").insert({
      tier_key, label, threshold: 0, cap: 0, timer_hours: 24,
      grant_free_delivery: false, is_active: false, offer_copy: "",
    });
    setCreating(false);
    if (error) { toast.error(errMsg(error, "Could not create tier.")); return; }
    toast.success(`Tier "${tier_key}" created. Fill in its values below.`);
    qc.invalidateQueries({ queryKey: ["fip-tier-summary"] });
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-med">Tier configuration</h2>
        <button
          type="button"
          onClick={createTier}
          disabled={!canEdit || creating}
          className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          New tier
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-text-med">Loading tiers…</div>
      ) : tiers.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-text-med">
          No tiers configured yet. Use “New tier” to create one.
        </div>
      ) : (
        <div className="space-y-4">
          {tiers.map((t) => (
            <TierCard key={t.tier_key} tier={t} canEdit={canEdit} />
          ))}
        </div>
      )}
    </section>
  );
}

function TierCard({ tier, canEdit }: { tier: TierSummary; canEdit: boolean }) {
  const qc = useQueryClient();
  // Editable form seeded from the tier row; re-seeds if the row changes.
  const [form, setForm] = useState({
    label: tier.label,
    threshold: String(tier.threshold),
    cap: String(tier.cap),
    grant_free_delivery: tier.grant_free_delivery,
    timer_hours: String(tier.timer_hours),
    offer_copy: tier.offer_copy,
    is_active: tier.is_active,
  });
  useEffect(() => {
    setForm({
      label: tier.label,
      threshold: String(tier.threshold),
      cap: String(tier.cap),
      grant_free_delivery: tier.grant_free_delivery,
      timer_hours: String(tier.timer_hours),
      offer_copy: tier.offer_copy,
      is_active: tier.is_active,
    });
  }, [tier]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    const timer = parseInt(form.timer_hours, 10);
    if (!Number.isFinite(timer) || timer < 1 || timer > 168) {
      toast.error("Timer hours must be between 1 and 168.");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from("free_items_promo_tiers")
      .update({
        label: form.label.trim(),
        threshold: parseInt(form.threshold, 10) || 0,
        cap: parseInt(form.cap, 10) || 0,
        grant_free_delivery: form.grant_free_delivery,
        timer_hours: timer,
        offer_copy: form.offer_copy,
        is_active: form.is_active,
      })
      .eq("tier_key", tier.tier_key);
    setSaving(false);
    if (error) { toast.error(errMsg(error, "Could not save tier.")); return; }
    toast.success(`${form.label.trim() || tier.tier_key} saved.`);
    qc.invalidateQueries({ queryKey: ["fip-tier-summary"] });
  };

  const deleteTier = async () => {
    if (!window.confirm(`Delete tier "${tier.tier_key}"? This cannot be undone.`)) return;
    setDeleting(true);
    const { error } = await (supabase as any).from("free_items_promo_tiers").delete().eq("tier_key", tier.tier_key);
    setDeleting(false);
    if (error) {
      // Verbatim Postgres message (e.g. FK violation) + the safer alternative.
      toast.error(`${errMsg(error, "Could not delete tier.")} — turn off “Active” instead of deleting.`);
      return;
    }
    toast.success(`Tier "${tier.tier_key}" deleted.`);
    qc.invalidateQueries({ queryKey: ["fip-tier-summary"] });
  };

  const overCap = tier.configured_retail_value > tier.cap;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold bg-muted px-2 py-1 rounded">{tier.tier_key}</span>
          {!tier.is_active && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-text-med border border-border">
              Inactive
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={deleteTier}
          disabled={!canEdit || deleting}
          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete tier
        </button>
      </div>

      {/* Live validation from the view's own numbers — no client math. */}
      {overCap && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-300 px-3 py-2 text-[12px] text-red-800 flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Configured items total {naira(tier.configured_retail_value)}, which exceeds the {naira(tier.cap)} cap.
            Applying this tier will fail until you raise the cap or remove an item.
          </span>
        </div>
      )}
      {tier.has_out_of_stock_item && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-300 px-3 py-2 text-[12px] text-red-800 flex items-start gap-1.5">
          <PackageX className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            One or more gift items in this tier are out of stock. Applying this tier will fail until you swap or restock it.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={labelCls}>Label</label>
          <input className={inputCls} value={form.label} disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Threshold (₦)</label>
          <input type="number" min={0} className={inputCls} value={form.threshold} disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Cap (₦)</label>
          <input type="number" min={0} className={inputCls} value={form.cap} disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, cap: e.target.value }))} />
        </div>
        <div>
          <label className={labelCls}>Timer hours (1–168)</label>
          <input type="number" min={1} max={168} className={inputCls} value={form.timer_hours} disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, timer_hours: e.target.value }))} />
        </div>
        <div className="flex items-center gap-6 pt-5">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.grant_free_delivery} disabled={!canEdit}
              onCheckedChange={(v) => setForm((f) => ({ ...f, grant_free_delivery: v }))} />
            Free delivery
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.is_active} disabled={!canEdit}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            Active
          </label>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Offer copy (shown to admin on a qualifying quote)</label>
          <textarea className={`${inputCls} min-h-[80px] resize-y`} value={form.offer_copy} disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, offer_copy: e.target.value }))} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] text-text-med">
          Configured value: <span className="font-semibold">{naira(tier.configured_retail_value)}</span> retail ·{" "}
          <span className="font-semibold">{naira(tier.configured_cost_value)}</span> cost · {tier.item_count} item{tier.item_count === 1 ? "" : "s"}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={!canEdit || saving}
          className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
        </button>
      </div>

      <TierItems tierKey={tier.tier_key} canEdit={canEdit} />
    </div>
  );
}

function TierItems({ tierKey, canEdit }: { tierKey: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["fip-tier-items", tierKey],
    queryFn: async (): Promise<TierItemDetailed[]> => {
      const { data, error } = await (supabase as any)
        .from("free_items_promo_tier_items_detailed")
        .select("*")
        .eq("tier_key", tierKey)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as TierItemDetailed[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fip-tier-items", tierKey] });
    qc.invalidateQueries({ queryKey: ["fip-tier-summary"] }); // validation numbers change
  };

  const removeItem = async (id: string) => {
    const { error } = await (supabase as any).from("free_items_promo_tier_items").delete().eq("id", id);
    if (error) { toast.error(errMsg(error, "Could not remove item.")); return; }
    toast.success("Item removed.");
    refresh();
  };

  const setQty = async (id: string, qty: number) => {
    const q = Math.max(1, Math.round(qty) || 1);
    const { error } = await (supabase as any).from("free_items_promo_tier_items").update({ quantity: q }).eq("id", id);
    if (error) { toast.error(errMsg(error, "Could not update quantity.")); return; }
    refresh();
  };

  const maxOrder = items.reduce((m, it) => Math.max(m, it.display_order ?? 0), 0);

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <h4 className="text-[11px] uppercase tracking-widest font-semibold text-text-med mb-2">Gift items</h4>
      {items.length === 0 ? (
        <p className="text-xs text-text-med mb-2">No items yet. Add one below.</p>
      ) : (
        <div className="space-y-2 mb-2">
          {items.map((it) => (
            <TierItemRow key={it.id} it={it} canEdit={canEdit} onRemove={removeItem} onQty={setQty} />
          ))}
        </div>
      )}
      {canEdit && <AddItemSearch tierKey={tierKey} nextOrder={maxOrder + 1} onAdded={refresh} />}
    </div>
  );
}

function TierItemRow({
  it, canEdit, onRemove, onQty,
}: {
  it: TierItemDetailed;
  canEdit: boolean;
  onRemove: (id: string) => void;
  onQty: (id: string, qty: number) => void;
}) {
  const [qty, setQtyLocal] = useState(String(it.quantity));
  useEffect(() => setQtyLocal(String(it.quantity)), [it.quantity]);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
      <div className="w-11 h-11 rounded-lg overflow-hidden bg-muted flex-shrink-0 grid place-items-center">
        {it.image_url ? (
          <img src={it.image_url} alt={it.product_name || ""} className="w-full h-full object-cover" />
        ) : (
          <ShoppingBag className="w-4 h-4 text-text-light" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate flex items-center gap-1.5">
          {it.product_name || "—"}
          {!it.in_stock && (
            <span title="Out of stock" className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600">
              <PackageX className="w-3.5 h-3.5" /> OOS
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-x-2 text-[11px] text-text-med">
          {it.brand_name && <span>{it.brand_name}</span>}
          {it.sku && <span>SKU: {it.sku}</span>}
          <span>{naira(it.price)} retail</span>
          <span>{naira(it.cost_price)} cost</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <input
          type="number" min={1} value={qty} disabled={!canEdit}
          onChange={(e) => setQtyLocal(e.target.value)}
          onBlur={() => { const n = parseInt(qty, 10); if (n && n !== it.quantity) onQty(it.id, n); else setQtyLocal(String(it.quantity)); }}
          className="w-16 border border-input rounded-lg px-2 py-1.5 text-sm bg-background text-center"
          aria-label="Quantity"
        />
        <button
          type="button" onClick={() => onRemove(it.id)} disabled={!canEdit}
          aria-label="Remove item"
          className="w-8 h-8 grid place-items-center text-text-light hover:text-red-600 rounded-lg disabled:opacity-40"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Small catalog search — replicates the products query PackageItemsBuilder uses
// for adding a product to a quote, scoped to what we need (brand_id to insert).
function AddItemSearch({ tierKey, nextOrder, onAdded }: { tierKey: string; nextOrder: number; onAdded: () => void }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const trimmed = term.trim();

  const { data: results = [] } = useQuery({
    queryKey: ["fip-product-search", trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, brands!brands_product_id_fkey!inner(id, brand_name, price, in_stock)")
        .eq("is_active", true)
        .eq("brands.in_stock", true)
        .gt("brands.price", 0)
        .ilike("name", `%${trimmed}%`)
        .limit(15);
      if (error) throw error;
      const rows: Array<{ brandId: string; productName: string; brandName: string; price: number }> = [];
      (data || []).forEach((p: any) =>
        (p.brands || []).forEach((b: any) =>
          rows.push({ brandId: b.id, productName: p.name, brandName: b.brand_name, price: b.price }),
        ),
      );
      return rows;
    },
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const add = async (brandId: string) => {
    if (adding) return;
    setAdding(true);
    const { error } = await (supabase as any).from("free_items_promo_tier_items").insert({
      tier_key: tierKey, brand_id: brandId, quantity: 1, display_order: nextOrder,
    });
    setAdding(false);
    if (error) { toast.error(errMsg(error, "Could not add item.")); return; }
    toast.success("Item added.");
    setTerm(""); setOpen(false);
    onAdded();
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 border border-dashed border-forest/50 rounded-lg px-3 py-2">
        <Search className="w-4 h-4 text-text-light flex-shrink-0" />
        <input
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Add item — search products…"
          className="flex-1 bg-transparent text-sm outline-none min-w-0"
        />
        {term && (
          <button type="button" onClick={() => { setTerm(""); setOpen(false); }} aria-label="Clear">
            <X className="w-4 h-4 text-text-light" />
          </button>
        )}
      </div>
      {open && trimmed.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-72 overflow-auto">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-text-med">No matches.</p>
          ) : (
            results.map((r) => (
              <button
                key={r.brandId}
                type="button"
                onClick={() => add(r.brandId)}
                disabled={adding}
                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-3 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="text-sm font-semibold block truncate">{r.productName}</span>
                  <span className="text-[11px] text-text-med">{r.brandName}</span>
                </span>
                <span className="text-xs tabular-nums text-text-med flex-shrink-0">{naira(r.price)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SECTION 3 — LIVE PROMOS
// ════════════════════════════════════════════════════════════════════
function LivePromosSection({ canEdit }: { canEdit: boolean }) {
  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["fip-live"],
    queryFn: async (): Promise<LivePromo[]> => {
      const { data, error } = await (supabase as any).rpc("get_free_items_promo_live");
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as LivePromo[];
    },
  });

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-med">Live promos</h2>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 border border-border text-text-med px-3 py-2 rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-text-med">Loading live promos…</div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-text-med">
          No promos are currently live.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-text-med">
                  <th className="px-3 py-2 font-semibold">Quote</th>
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Tier</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold text-right">Discount</th>
                  <th className="px-3 py-2 font-semibold">Timer</th>
                  <th className="px-3 py-2 font-semibold"></th>
                  <th className="px-3 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <LivePromoRow key={r.quote_id} row={r} canEdit={canEdit} onChanged={() => refetch()} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function LivePromoRow({ row, canEdit, onChanged }: { row: LivePromo; canEdit: boolean; onChanged: () => void }) {
  const [panel, setPanel] = useState<null | "extend" | "revoke">(null);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState("24");
  const [reason, setReason] = useState("");

  const doExtend = async (h: number) => {
    if (busy) return;
    if (!Number.isFinite(h) || h < 1 || h > 168) { toast.error("Hours must be between 1 and 168."); return; }
    setBusy(true);
    const { error } = await (supabase as any).rpc("extend_free_items_promo", { p_quote_id: row.quote_id, p_hours: h });
    setBusy(false);
    if (error) { toast.error(errMsg(error, "Could not extend promo.")); return; }
    toast.success(`Extended by ${h}h.`);
    setPanel(null); onChanged();
  };

  const doRevoke = async () => {
    if (busy) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("revoke_free_items_promo", {
      p_quote_id: row.quote_id, p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error(errMsg(error, "Could not revoke promo.")); return; }
    toast.success("Promo revoked.");
    setPanel(null); onChanged();
  };

  return (
    <>
      <tr className="align-middle">
        <td className="px-3 py-2">
          <Link to={`/admin/quotes?quote=${row.quote_id}`} className="text-forest font-semibold hover:underline font-mono">
            {row.quote_number}
          </Link>
        </td>
        <td className="px-3 py-2">{row.customer_name || "—"}</td>
        <td className="px-3 py-2">{row.tier_label}</td>
        <td className="px-3 py-2">
          {row.status === "active" ? (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">Active</span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-text-med border border-border">Applied</span>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-semibold">{naira(row.discount)}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          {row.status === "applied" ? (
            <span className="text-xs text-text-med">Waiting for first view</span>
          ) : row.expires_at ? (
            <MiniCountdown expiresAt={row.expires_at} />
          ) : (
            <span className="text-xs text-text-med">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          {row.delivery_granted && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-forest-light text-forest border border-forest/20">Free delivery</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPanel(panel === "extend" ? null : "extend")}
              disabled={!canEdit || row.status !== "active"}
              title={row.status !== "active" ? "Timer hasn't started yet" : undefined}
              className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
            >
              <Clock className="w-3.5 h-3.5" /> Extend
            </button>
            <button
              type="button"
              onClick={() => setPanel(panel === "revoke" ? null : "revoke")}
              disabled={!canEdit}
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="w-3.5 h-3.5" /> Revoke
            </button>
          </div>
        </td>
      </tr>

      {panel === "extend" && (
        <tr>
          <td colSpan={8} className="px-3 py-3 bg-muted/30">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-text-med">Extend by:</span>
              {[6, 12, 24].map((h) => (
                <button key={h} type="button" onClick={() => doExtend(h)} disabled={busy}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50">
                  {h}h
                </button>
              ))}
              <input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(e.target.value)}
                className="w-20 border border-input rounded-lg px-2 py-1.5 text-sm bg-background" aria-label="Custom hours" />
              <button type="button" onClick={() => doExtend(parseInt(hours, 10))} disabled={busy}
                className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Apply
              </button>
              <button type="button" onClick={() => setPanel(null)} className="text-xs text-text-med hover:text-foreground ml-1">Cancel</button>
            </div>
          </td>
        </tr>
      )}

      {panel === "revoke" && (
        <tr>
          <td colSpan={8} className="px-3 py-3 bg-red-50/60">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-red-800">Revoke this promo?</span>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
                placeholder="Reason (optional)"
                className="flex-1 min-w-[180px] border border-input rounded-lg px-2 py-1.5 text-sm bg-background" />
              <button type="button" onClick={doRevoke} disabled={busy}
                className="inline-flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Confirm revoke
              </button>
              <button type="button" onClick={() => setPanel(null)} className="text-xs text-text-med hover:text-foreground ml-1">Cancel</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Isolated countdown for a table cell: owns its own interval + state so only
// this cell re-renders each second, never the whole table. Not the customer-
// facing QuotePromoCountdown (that is a full-width banner, left untouched).
function MiniCountdown({ expiresAt }: { expiresAt: string }) {
  const remaining = () => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [secs, setSecs] = useState(remaining);
  useEffect(() => {
    setSecs(remaining());
    const id = window.setInterval(() => {
      const next = remaining();
      setSecs(next);
      if (next <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  if (secs <= 0) return <span className="text-xs font-semibold text-text-med">Ended</span>;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="text-xs font-mono font-bold tabular-nums text-forest">
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════
// SECTION 4 — LANDING PAGE ASSIGNMENT
// ════════════════════════════════════════════════════════════════════
interface LandingPageRow {
  id: string;
  slug: string | null;
  title: string | null;
  is_active: boolean;
  promo_enabled: boolean;
  promo_label: string | null;
  free_items_promo_tier: string | null;
}

function LandingPageAssignmentSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ["fip-landing-pages"],
    queryFn: async (): Promise<LandingPageRow[]> => {
      const { data, error } = await (supabase as any)
        .from("landing_pages")
        .select("id, slug, title, is_active, promo_enabled, promo_label, free_items_promo_tier")
        .order("title", { ascending: true });
      if (error) throw error;
      return (data || []) as LandingPageRow[];
    },
  });

  // Reuses the same query key as the tier config section, so react-query serves
  // it from cache — the picker options are the configured tiers.
  const { data: tiers = [] } = useQuery({
    queryKey: ["fip-tier-summary"],
    queryFn: async (): Promise<TierSummary[]> => {
      const { data, error } = await (supabase as any)
        .from("free_items_promo_tier_summary")
        .select("*")
        .order("threshold", { ascending: false });
      if (error) throw error;
      return (data || []) as TierSummary[];
    },
  });

  const [savingId, setSavingId] = useState<string | null>(null);

  const setTier = async (row: LandingPageRow, value: string | null) => {
    setSavingId(row.id);
    // No client-side permission pre-check: landing_pages writes need
    // promotions.edit (this page is gated on quotes.edit), so an admin without
    // it hits an RLS error — which we surface verbatim rather than guessing.
    const { error } = await (supabase as any)
      .from("landing_pages")
      .update({ free_items_promo_tier: value })
      .eq("id", row.id);
    setSavingId(null);
    if (error) { toast.error(errMsg(error, "Could not update landing page.")); return; }
    toast.success(value ? `Assigned ${value} to ${row.title || row.slug || "page"}.` : "Free items promo removed from page.");
    qc.invalidateQueries({ queryKey: ["fip-landing-pages"] });
  };

  return (
    <section className="mb-8">
      <h2 className="text-sm font-bold uppercase tracking-widest text-text-med mb-3">Landing page assignment</h2>
      <p className="text-xs text-text-med mb-3">
        Pick which free-items tier auto-applies on each landing page. “None” leaves
        the page’s own behaviour untouched.
      </p>

      {isLoading ? (
        <div className="text-sm text-text-med">Loading landing pages…</div>
      ) : pages.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-text-med">
          No landing pages found.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-text-med">
                  <th className="px-3 py-2 font-semibold">Landing page</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Free items tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pages.map((p) => {
                  const bothOn = !!p.free_items_promo_tier && p.promo_enabled;
                  return (
                    <tr key={p.id} className="align-top">
                      <td className="px-3 py-2">
                        <div className="font-semibold">{p.title || "—"}</div>
                        <div className="text-[11px] text-text-med font-mono">/{p.slug || ""}</div>
                        {bothOn && (
                          <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-300 px-2.5 py-1.5 text-[11px] text-amber-800 flex items-start gap-1.5 max-w-[420px]">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>
                              Old cash promo (promo_enabled) is also on for this page. It is ignored
                              while a free items tier is assigned — consider turning it off to avoid confusion.
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {p.is_active ? (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">Active</span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-text-med border border-border" title="The promo won't run until the page is active">Inactive</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <select
                            className={`${inputCls} max-w-[220px]`}
                            value={p.free_items_promo_tier ?? ""}
                            disabled={!canEdit || savingId === p.id}
                            onChange={(e) => setTier(p, e.target.value || null)}
                          >
                            <option value="">None</option>
                            {tiers.map((t) => (
                              <option key={t.tier_key} value={t.tier_key}>{t.label}</option>
                            ))}
                          </select>
                          {savingId === p.id && <Loader2 className="w-4 h-4 animate-spin text-text-med" />}
                        </div>
                        {!p.is_active && p.free_items_promo_tier && (
                          <p className="text-[10px] text-text-light mt-1">Won’t run until this page is active.</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
