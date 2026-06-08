import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, GripVertical, Plus, Save, Search, Trash2, Truck, X, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  useCouriers,
  useUpdateCourier,
  useCreateCourier,
  useDeleteCourier,
  useReorderCouriers,
  useShippingZonesAdmin,
  useCourierZoneAssignments,
  useUpsertZoneAssignment,
  useDeleteZoneAssignment,
  useCourierRateCards,
  useUpsertRateCard,
  useDeleteRateCard,
  useCourierInterstateRates,
  useUpsertInterstateRate,
  useDeleteInterstateRate,
  useCourierRoutingRules,
  useUpsertRoutingRule,
  type Courier,
  type AdminShippingZone,
  type SubscriptionPlan,
  type CourierZoneAssignment,
  type ZoneConditionType,
  type CourierRateCard,
  type CourierInterstateRate,
  type CourierRoutingRule,
  type RoutingStrategy,
} from "@/hooks/useCouriers";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";
const sectionCls = "text-xs uppercase tracking-widest font-bold text-text-med mt-4 mb-2";
const saveBtnCls = "inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-40";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const fmtN = (n: number) => `₦${Math.round(n).toLocaleString()}`;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminCouriers() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="pf text-2xl font-bold flex items-center gap-2">
          <Truck className="w-6 h-6" /> Courier Partners
        </h1>
        <p className="text-text-med text-sm mt-1 max-w-[720px]">
          Manage delivery partners, zone routing rules, and interstate rate tables.
        </p>
      </div>

      <Tabs defaultValue="partners">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="assignments">Zone Assignments</TabsTrigger>
          <TabsTrigger value="rate_cards">Rate Cards</TabsTrigger>
          <TabsTrigger value="interstate">Interstate Rates</TabsTrigger>
          <TabsTrigger value="routing">Routing Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="space-y-3"><PartnersTab /></TabsContent>
        <TabsContent value="assignments" className="space-y-4"><ZoneAssignmentsTab /></TabsContent>
        <TabsContent value="rate_cards" className="space-y-4"><RateCardsTab /></TabsContent>
        <TabsContent value="interstate" className="space-y-4"><InterstateRatesTab /></TabsContent>
        <TabsContent value="routing" className="space-y-4"><RoutingRulesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable: chip list editor (with optional autocomplete suggestions)
// ---------------------------------------------------------------------------

function ChipList({
  value,
  onChange,
  color = "green",
  placeholder = "Add item and press Enter",
  suggestions,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  color?: "green" | "red" | "grey";
  placeholder?: string;
  suggestions?: string[];
}) {
  const [input, setInput] = useState("");
  const listId = useMemo(() => `dl-${Math.random().toString(36).slice(2, 8)}`, []);
  const palette = {
    green: "bg-green-100 text-green-700 hover:text-green-900",
    red: "bg-red-100 text-red-700 hover:text-red-900",
    grey: "bg-muted text-text-med hover:text-foreground",
  }[color];

  const add = () => {
    const v = input.trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setInput("");
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((a, i) => (
            <span key={i} className={`text-[10px] font-semibold px-2 py-1 rounded-pill inline-flex items-center gap-1 ${palette}`}>
              {a}
              <button onClick={() => remove(i)} aria-label="Remove"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-text-light text-xs">Empty.</p>
      )}
      <div className="flex gap-2">
        <input
          list={suggestions ? listId : undefined}
          className={inputCls + " flex-1"}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <button onClick={add} className="px-3 py-2 rounded-lg bg-muted text-xs font-semibold hover:bg-border"><Plus className="w-3.5 h-3.5 inline-block" /> Add</button>
        {suggestions && (
          <datalist id={listId}>
            {suggestions.map(s => <option key={s} value={s} />)}
          </datalist>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 1 — Partners
// ---------------------------------------------------------------------------

const emptyCourier: Partial<Courier> = {
  name: "",
  is_active: true,
  coverage: [],
  excluded_areas: [],
  pricing_model: "flat_rate",
  subscription_plans: [],
  weight_limit_kg: null,
  weight_rounding: "up",
  express_available: false,
  express_surcharge: null,
  display_order: 99,
};

function PartnersTab() {
  const { data: couriers, isLoading } = useCouriers();
  const reorder = useReorderCouriers();
  const create = useCreateCourier();

  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");

  const filtered = useMemo(() => {
    if (!couriers) return [];
    if (!search.trim()) return couriers;
    const q = search.trim().toLowerCase();
    return couriers.filter(c => c.name.toLowerCase().includes(q));
  }, [couriers, search]);

  const handleDrop = async (targetId: string) => {
    if (!couriers || !draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const ordered = [...couriers];
    const fromIdx = ordered.findIndex(c => c.id === draggingId);
    const toIdx = ordered.findIndex(c => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) { setDraggingId(null); return; }
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved);
    setDraggingId(null);
    try {
      await reorder.mutateAsync(ordered.map(c => c.id));
      toast.success("Reordered");
    } catch (e: any) {
      toast.error(e.message || "Reorder failed");
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { toast.error("Name is required"); return; }
    try {
      const nextOrder = (couriers?.length || 0);
      await create.mutateAsync({ ...emptyCourier, name, display_order: nextOrder });
      toast.success(`${name} added`);
      setAddingNew(false);
      setNewName("");
    } catch (e: any) {
      toast.error(e.message || "Create failed");
    }
  };

  if (isLoading) return <div className="text-center py-10 text-text-med text-sm">Loading couriers…</div>;
  if (!couriers) return null;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search couriers…"
            className="w-full pl-9 pr-3 py-2 border border-input rounded-lg text-sm bg-background"
          />
        </div>
        {addingNew ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setAddingNew(false); setNewName(""); } }}
              placeholder="Courier name"
              className={inputCls + " w-[200px]"}
            />
            <button onClick={handleCreate} disabled={create.isPending} className={saveBtnCls}><Save className="w-3.5 h-3.5" /> Add</button>
            <button onClick={() => { setAddingNew(false); setNewName(""); }} className="text-xs text-text-med hover:text-destructive">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAddingNew(true)} className="inline-flex items-center gap-1.5 bg-forest-light text-forest px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest/20">
            <Plus className="w-3.5 h-3.5" /> Add courier
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-text-med text-sm">No couriers match "{search}".</div>
      ) : (
        filtered.map(c => (
          <CourierCard
            key={c.id}
            courier={c}
            draggingId={draggingId}
            onDragStart={() => setDraggingId(c.id)}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={() => handleDrop(c.id)}
            onDragEnd={() => setDraggingId(null)}
          />
        ))
      )}
    </div>
  );
}

function CourierCard({
  courier,
  draggingId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  courier: Courier;
  draggingId: string | null;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Courier>(courier);
  const update = useUpdateCourier();
  const del = useDeleteCourier();

  useEffect(() => { setDraft(courier); }, [courier]);

  const field = <K extends keyof Courier>(k: K, v: Courier[K]) => setDraft(d => ({ ...d, [k]: v }));

  const addPlan = () => {
    const next = [...(draft.subscription_plans || []), { plan: "New plan", cost: 0, deliveries: 0, valid_days: 30, cost_per_delivery: 0 }];
    field("subscription_plans", next as any);
  };
  const updatePlan = (i: number, changes: Partial<SubscriptionPlan>) => {
    const next = (draft.subscription_plans || []).map((p, idx) => {
      if (idx !== i) return p;
      const merged = { ...p, ...changes } as SubscriptionPlan;
      merged.cost_per_delivery = merged.deliveries > 0 ? Math.round(merged.cost / merged.deliveries) : 0;
      return merged;
    });
    field("subscription_plans", next as any);
  };
  const removePlan = (i: number) => {
    field("subscription_plans", (draft.subscription_plans || []).filter((_, idx) => idx !== i) as any);
  };

  const toggleActive = async () => {
    try {
      await update.mutateAsync({ id: courier.id, is_active: !courier.is_active });
      toast.success(`${courier.name} ${!courier.is_active ? "activated" : "deactivated"}`);
    } catch (e: any) { toast.error(e.message || "Failed to update"); }
  };

  // Validation warnings
  const warnings: string[] = [];
  if (!draft.name.trim()) warnings.push("Name is required");
  if ((draft.express_surcharge || 0) < 0) warnings.push("Express surcharge must be ≥ 0");
  if ((draft.weight_limit_kg || 0) < 0) warnings.push("Weight limit must be ≥ 0");
  (draft.subscription_plans || []).forEach((p, i) => {
    if (p.deliveries === 0 && draft.pricing_model === "subscription") warnings.push(`Plan ${i + 1}: deliveries must be > 0`);
    if (p.cost < 0) warnings.push(`Plan ${i + 1}: cost must be ≥ 0`);
  });

  const save = async () => {
    if (warnings.length > 0) { toast.error(warnings[0]); return; }
    try {
      await update.mutateAsync(draft);
      toast.success(`${draft.name} saved`);
    } catch (e: any) { toast.error(e.message || "Save failed"); }
  };

  const remove = async () => {
    if (!confirm(`Delete "${courier.name}"? This cannot be undone.`)) return;
    try {
      await del.mutateAsync(courier.id);
      toast.success(`${courier.name} deleted`);
    } catch (e: any) { toast.error(e.message || "Delete failed"); }
  };

  const isDragging = draggingId === courier.id;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`bg-card border border-border rounded-xl overflow-hidden transition-opacity ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2 flex-1">
          <GripVertical className="w-4 h-4 text-text-light cursor-grab flex-shrink-0" />
          <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left flex-1">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <div>
              <div className="font-bold text-base">{courier.name || <span className="text-text-light italic">Unnamed</span>}</div>
              <div className="text-[11px] text-text-light mt-0.5">
                {courier.pricing_model} · {courier.coverage?.length || 0} zones · {courier.is_active ? "Active" : "Inactive"}
              </div>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <label className="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" className="peer sr-only" checked={courier.is_active} onChange={toggleActive} />
            <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-forest peer-checked:after:translate-x-4" />
          </label>
          <button onClick={remove} className="p-1.5 text-destructive hover:bg-destructive/10 rounded" title="Delete courier">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border p-5 space-y-4">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={draft.name} onChange={e => field("name", e.target.value)} />
          </div>

          <h4 className={sectionCls}>Contact & Info</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className={labelCls}>Address</label><input className={inputCls} value={draft.address || ""} onChange={e => field("address", e.target.value)} /></div>
            <div><label className={labelCls}>Website</label><input className={inputCls} value={draft.website || ""} onChange={e => field("website", e.target.value)} /></div>
            <div><label className={labelCls}>Working Hours</label><input className={inputCls} value={draft.working_hours || ""} onChange={e => field("working_hours", e.target.value)} /></div>
            <div><label className={labelCls}>Working Days</label><input className={inputCls} value={draft.working_days || ""} onChange={e => field("working_days", e.target.value)} /></div>
            <div><label className={labelCls}>Contact WhatsApp</label><input className={inputCls} value={draft.contact_whatsapp || ""} onChange={e => field("contact_whatsapp", e.target.value)} /></div>
            <div><label className={labelCls}>Contact Phone</label><input className={inputCls} value={draft.contact_phone || ""} onChange={e => field("contact_phone", e.target.value)} /></div>
            <div className="md:col-span-2"><label className={labelCls}>Contact Email</label><input className={inputCls} value={draft.contact_email || ""} onChange={e => field("contact_email", e.target.value)} /></div>
          </div>

          <h4 className={sectionCls}>Coverage (zones this partner serves)</h4>
          <ChipList value={draft.coverage || []} onChange={v => field("coverage", v)} color="green" placeholder="e.g. Island, Mainland" />

          <h4 className={sectionCls}>Excluded Areas</h4>
          <ChipList value={draft.excluded_areas || []} onChange={v => field("excluded_areas", v)} color="red" placeholder="e.g. Ajah, Badagry" />

          <h4 className={sectionCls}>Pricing</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Pricing Model</label>
              <select className={inputCls} value={draft.pricing_model} onChange={e => field("pricing_model", e.target.value)}>
                <option value="flat_rate">Flat rate</option>
                <option value="weight_based">Weight-based</option>
                <option value="subscription">Subscription</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Max kg per booking</label>
              <input type="number" className={inputCls} value={draft.weight_limit_kg ?? ""} onChange={e => field("weight_limit_kg", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label className={labelCls}>Weight rounding</label>
              <select className={inputCls} value={draft.weight_rounding || "up"} onChange={e => field("weight_rounding", e.target.value as "up" | "down")}>
                <option value="up">Round up</option>
                <option value="down">Round down</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={draft.express_available} onChange={e => field("express_available", e.target.checked)} />
                Express available
              </label>
            </div>
            {draft.express_available && (
              <div>
                <label className={labelCls}>Express surcharge (₦)</label>
                <input type="number" className={inputCls} value={draft.express_surcharge ?? ""} onChange={e => field("express_surcharge", e.target.value ? Number(e.target.value) : null)} />
              </div>
            )}
          </div>

          {draft.pricing_model === "subscription" && (
            <>
              <h4 className={sectionCls}>Subscription Plans</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left">Plan</th>
                      <th className="px-2 py-2 text-right">Cost (₦)</th>
                      <th className="px-2 py-2 text-right">Deliveries</th>
                      <th className="px-2 py-2 text-right">Valid (days)</th>
                      <th className="px-2 py-2 text-right">₦/delivery</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {(draft.subscription_plans || []).map((p, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-1 py-1"><input className={inputCls} value={p.plan} onChange={e => updatePlan(i, { plan: e.target.value })} /></td>
                        <td className="px-1 py-1"><input type="number" className={inputCls + " text-right"} value={p.cost} onChange={e => updatePlan(i, { cost: Number(e.target.value) })} /></td>
                        <td className="px-1 py-1"><input type="number" className={inputCls + " text-right"} value={p.deliveries} onChange={e => updatePlan(i, { deliveries: Number(e.target.value) })} /></td>
                        <td className="px-1 py-1"><input type="number" className={inputCls + " text-right"} value={p.valid_days} onChange={e => updatePlan(i, { valid_days: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1 text-right font-mono text-text-med">{fmtN(p.cost_per_delivery || 0)}</td>
                        <td className="px-1 py-1 text-right"><button onClick={() => removePlan(i)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={addPlan} className="text-xs font-semibold text-forest hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add plan</button>
            </>
          )}

          <h4 className={sectionCls}>Special Notes</h4>
          <textarea className={inputCls + " h-24"} value={draft.special_notes || ""} onChange={e => field("special_notes", e.target.value)} />

          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-3 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold mb-1">Validation issues</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={save} disabled={update.isPending || warnings.length > 0} className={saveBtnCls}>
              <Save className="w-4 h-4" /> {update.isPending ? "Saving…" : "Save Partner"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const fromKobo = (k: number | null | undefined) => (k || 0) / 100;
const toKobo = (ngn: number | string) => Math.round((Number(ngn) || 0) * 100);
const fmtNaira = (kobo: number | null | undefined) => `₦${Math.round(fromKobo(kobo)).toLocaleString()}`;

function customerRateFromCard(card: Pick<CourierRateCard, "partner_cost" | "markup_pct" | "customer_rate_override">): number {
  if (card.customer_rate_override != null) return card.customer_rate_override;
  return Math.round((card.partner_cost || 0) * (1 + (Number(card.markup_pct) || 0) / 100));
}

function customerRateFromInterstate(row: Pick<CourierInterstateRate, "partner_cost" | "markup_pct">): number {
  return Math.round((row.partner_cost || 0) * (1 + (Number(row.markup_pct) || 0) / 100));
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const CONDITION_BADGE: Record<string, { label: string; cls: string }> = {
  always:           { label: "Always",           cls: "bg-emerald-100 text-emerald-700" },
  fallback:         { label: "Fallback",         cls: "bg-muted text-text-med" },
  area_exclusion:   { label: "Area Exclusion",   cls: "bg-orange-100 text-orange-700" },
  volume_threshold: { label: "Volume Threshold", cls: "bg-blue-100 text-blue-700" },
  day_of_week:      { label: "Day of Week",      cls: "bg-purple-100 text-purple-700" },
};

// ---------------------------------------------------------------------------
// TAB 2 — Zone Assignments
// ---------------------------------------------------------------------------

function ZoneAssignmentsTab() {
  const { data: zones } = useShippingZonesAdmin();
  const { data: couriers } = useCouriers();
  const { data: assignments, isLoading } = useCourierZoneAssignments();
  const upsert = useUpsertZoneAssignment();
  const del = useDeleteZoneAssignment();

  if (isLoading) return <div className="text-center py-10 text-text-med text-sm">Loading zone assignments…</div>;

  const grouped = new Map<string, CourierZoneAssignment[]>();
  (zones || []).forEach(z => grouped.set(z.id, []));
  (assignments || []).forEach(a => {
    if (!grouped.has(a.zone_id)) grouped.set(a.zone_id, []);
    grouped.get(a.zone_id)!.push(a);
  });

  return (
    <div className="space-y-6">
      <CostSimulator zones={zones || []} couriers={couriers || []} />
      {(zones || []).map(zone => {
        const rows = (grouped.get(zone.id) || []).sort((a, b) => a.priority - b.priority);
        return (
          <div key={zone.id} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm">{zone.name}</h3>
              <span className="text-[10px] text-text-light">{rows.length} assignment{rows.length === 1 ? "" : "s"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="px-3 py-2 w-16">Priority</th>
                    <th className="px-3 py-2">Courier</th>
                    <th className="px-3 py-2">Condition</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2 w-20">Active</th>
                    <th className="px-3 py-2 w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-text-light">No assignments for this zone.</td></tr>
                  )}
                  {rows.map(r => (
                    <AssignmentRow
                      key={r.id}
                      assignment={r}
                      couriers={couriers || []}
                      zones={zones || []}
                      onSave={p => upsert.mutateAsync(p).then(() => toast.success("Saved")).catch(e => toast.error(e.message || "Save failed"))}
                      onDelete={() => { if (confirm("Delete this assignment?")) del.mutateAsync(r.id).then(() => toast.success("Deleted")).catch(e => toast.error(e.message || "Delete failed")); }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-border">
              <AssignmentAddForm
                zoneId={zone.id}
                couriers={couriers || []}
                zones={zones || []}
                nextPriority={(rows[rows.length - 1]?.priority ?? 0) + 1}
                onCreate={p => upsert.mutateAsync(p).then(() => toast.success("Assignment created")).catch(e => toast.error(e.message || "Create failed"))}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssignmentRow({
  assignment, couriers, onSave, onDelete,
}: {
  assignment: CourierZoneAssignment;
  couriers: Courier[];
  zones: AdminShippingZone[];
  onSave: (p: Partial<CourierZoneAssignment>) => Promise<any>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [valueOpen, setValueOpen] = useState(false);
  const [draft, setDraft] = useState<CourierZoneAssignment>(assignment);

  useEffect(() => { setDraft(assignment); }, [assignment]);

  const badge = CONDITION_BADGE[assignment.condition_type] || { label: assignment.condition_type, cls: "bg-muted text-text-med" };

  const toggleActive = () => onSave({ id: assignment.id, is_active: !assignment.is_active });

  const saveEdit = () => {
    onSave({
      id: draft.id,
      courier_id: draft.courier_id,
      priority: draft.priority,
      condition_type: draft.condition_type,
      condition_value: draft.condition_value,
      notes: draft.notes,
    }).then(() => setEditing(false));
  };

  if (editing) {
    return (
      <tr className="border-t border-border bg-forest/5">
        <td className="px-3 py-2"><input type="number" className={inputCls} value={draft.priority} onChange={e => setDraft({ ...draft, priority: Number(e.target.value) })} /></td>
        <td className="px-3 py-2">
          <select className={inputCls} value={draft.courier_id} onChange={e => setDraft({ ...draft, courier_id: e.target.value })}>
            {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </td>
        <td className="px-3 py-2">
          <select className={inputCls} value={draft.condition_type} onChange={e => setDraft({ ...draft, condition_type: e.target.value as ZoneConditionType, condition_value: null })}>
            {Object.entries(CONDITION_BADGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </td>
        <td className="px-3 py-2" colSpan={2}>
          <ConditionValueEditor type={draft.condition_type as ZoneConditionType} value={draft.condition_value} onChange={v => setDraft({ ...draft, condition_value: v })} />
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button onClick={saveEdit} className="text-forest hover:underline text-xs font-semibold mr-2">Save</button>
          <button onClick={() => { setDraft(assignment); setEditing(false); }} className="text-text-med hover:text-foreground text-xs">Cancel</button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border hover:bg-muted/30">
      <td className="px-3 py-2 tabular-nums">{assignment.priority}</td>
      <td className="px-3 py-2 font-medium">{assignment.courier?.name || <span className="text-text-light">—</span>}</td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-pill ${badge.cls}`}>{badge.label}</span>
      </td>
      <td className="px-3 py-2">
        {assignment.condition_value ? (
          <div>
            <button onClick={() => setValueOpen(o => !o)} className="text-text-med hover:text-forest text-[11px] inline-flex items-center gap-1">
              {valueOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {valueOpen ? "Hide" : "Show"} JSON
            </button>
            {valueOpen && <pre className="mt-1 bg-muted/40 rounded px-2 py-1 text-[10px] overflow-x-auto max-w-[320px]">{JSON.stringify(assignment.condition_value, null, 2)}</pre>}
          </div>
        ) : (
          <span className="text-text-light text-[11px]">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" className="peer sr-only" checked={assignment.is_active} onChange={toggleActive} />
          <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-forest peer-checked:after:translate-x-4" />
        </label>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button onClick={() => setEditing(true)} className="text-forest hover:underline text-xs font-semibold mr-2">Edit</button>
        <button onClick={onDelete} className="text-destructive hover:underline text-xs"><Trash2 className="w-3 h-3 inline-block" /></button>
      </td>
    </tr>
  );
}

function ConditionValueEditor({ type, value, onChange }: { type: ZoneConditionType; value: any; onChange: (v: any) => void }) {
  if (type === "area_exclusion") {
    const text = Array.isArray(value?.areas) ? value.areas.join("\n") : "";
    return (
      <textarea
        placeholder="One area per line"
        className={inputCls + " h-20"}
        value={text}
        onChange={e => onChange({ areas: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })}
      />
    );
  }
  if (type === "volume_threshold") {
    return (
      <div>
        <label className={labelCls}>Min orders</label>
        <input type="number" className={inputCls} value={value?.min_orders ?? ""} onChange={e => onChange({ min_orders: e.target.value ? Number(e.target.value) : null })} />
      </div>
    );
  }
  if (type === "day_of_week") {
    const selected: string[] = Array.isArray(value?.days) ? value.days : [];
    const toggle = (k: string) => {
      const next = selected.includes(k) ? selected.filter(d => d !== k) : [...selected, k];
      onChange({ days: next });
    };
    return (
      <div className="flex flex-wrap gap-1">
        {WEEKDAY_KEYS.map((k, i) => (
          <label key={k} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border border-border rounded-lg cursor-pointer hover:bg-muted/30">
            <input type="checkbox" checked={selected.includes(k)} onChange={() => toggle(k)} />
            {WEEKDAY_LABELS[i]}
          </label>
        ))}
      </div>
    );
  }
  return <span className="text-text-light text-[11px]">No extra fields for this condition.</span>;
}

function AssignmentAddForm({
  zoneId, couriers, zones, nextPriority, onCreate,
}: {
  zoneId: string;
  couriers: Courier[];
  zones: AdminShippingZone[];
  nextPriority: number;
  onCreate: (p: Partial<CourierZoneAssignment>) => Promise<any>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<CourierZoneAssignment>>({
    zone_id: zoneId, courier_id: "", priority: nextPriority,
    condition_type: "always", condition_value: null, is_active: true, notes: "",
  });

  useEffect(() => { setDraft(d => ({ ...d, priority: nextPriority, zone_id: zoneId })); }, [zoneId, nextPriority]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-forest-light text-forest px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest/20">
        <Plus className="w-3.5 h-3.5" /> Add assignment
      </button>
    );
  }

  const submit = async () => {
    if (!draft.courier_id) { toast.error("Courier is required"); return; }
    await onCreate({ ...draft });
    setOpen(false);
    setDraft({ zone_id: zoneId, courier_id: "", priority: nextPriority + 1, condition_type: "always", condition_value: null, is_active: true, notes: "" });
  };

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div>
          <label className={labelCls}>Zone</label>
          <select className={inputCls} value={draft.zone_id} onChange={e => setDraft({ ...draft, zone_id: e.target.value })}>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Courier</label>
          <select className={inputCls} value={draft.courier_id} onChange={e => setDraft({ ...draft, courier_id: e.target.value })}>
            <option value="">Select…</option>
            {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Priority</label>
          <input type="number" className={inputCls} value={draft.priority} onChange={e => setDraft({ ...draft, priority: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>Condition Type</label>
          <select className={inputCls} value={draft.condition_type} onChange={e => setDraft({ ...draft, condition_type: e.target.value, condition_value: null })}>
            {Object.entries(CONDITION_BADGE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Condition Value</label>
        <ConditionValueEditor type={(draft.condition_type || "always") as ZoneConditionType} value={draft.condition_value} onChange={v => setDraft({ ...draft, condition_value: v })} />
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <textarea className={inputCls + " h-16"} value={draft.notes || ""} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button onClick={() => setOpen(false)} className="text-xs text-text-med hover:text-foreground">Cancel</button>
        <button onClick={submit} className={saveBtnCls}><Save className="w-3.5 h-3.5" /> Save</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 3 — Rate Cards
// ---------------------------------------------------------------------------

function RateCardsTab() {
  const { data: zones } = useShippingZonesAdmin();
  const { data: couriers } = useCouriers();
  const { data: cards, isLoading } = useCourierRateCards();
  const upsert = useUpsertRateCard();
  const del = useDeleteRateCard();

  if (isLoading) return <div className="text-center py-10 text-text-med text-sm">Loading rate cards…</div>;

  const byZone = new Map<string, CourierRateCard[]>();
  (zones || []).forEach(z => byZone.set(z.id, []));
  (cards || []).forEach(c => {
    if (!byZone.has(c.zone_id)) byZone.set(c.zone_id, []);
    byZone.get(c.zone_id)!.push(c);
  });

  return (
    <div className="space-y-6">
      {(zones || []).map(zone => {
        const rows = byZone.get(zone.id) || [];
        return (
          <div key={zone.id} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-bold text-sm">{zone.name}</h3>
              <div className="text-[10px] text-text-light mt-0.5">{rows.length} rate card{rows.length === 1 ? "" : "s"}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="px-3 py-2">Courier</th>
                    <th className="px-3 py-2">Rate Type</th>
                    <th className="px-3 py-2 text-right">Partner Cost</th>
                    <th className="px-3 py-2 text-right">Markup %</th>
                    <th className="px-3 py-2 text-right">Customer Rate</th>
                    <th className="px-3 py-2 text-right">Weight limit</th>
                    <th className="px-3 py-2 text-right">Bulk min</th>
                    <th className="px-3 py-2">Days</th>
                    <th className="px-3 py-2 text-right">Override</th>
                    <th className="px-3 py-2 w-16">Active</th>
                    <th className="px-3 py-2 w-24 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={11} className="px-3 py-4 text-center text-text-light">No rate cards for this zone.</td></tr>
                  )}
                  {rows.map(c => (
                    <RateCardRow
                      key={c.id}
                      card={c}
                      couriers={couriers || []}
                      onSave={p => upsert.mutateAsync(p).then(() => toast.success("Saved")).catch(e => toast.error(e.message || "Save failed"))}
                      onDelete={() => { if (confirm("Delete this rate card?")) del.mutateAsync(c.id).then(() => toast.success("Deleted")).catch(e => toast.error(e.message || "Delete failed")); }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-border">
              <RateCardAddForm
                zoneId={zone.id}
                couriers={couriers || []}
                onCreate={p => upsert.mutateAsync(p).then(() => toast.success("Created")).catch(e => toast.error(e.message || "Create failed"))}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RateCardRow({
  card, couriers, onSave, onDelete,
}: {
  card: CourierRateCard;
  couriers: Courier[];
  onSave: (p: Partial<CourierRateCard>) => Promise<any>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<CourierRateCard>(card);
  useEffect(() => { setDraft(card); }, [card]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(card);
  const overridden = draft.customer_rate_override != null;
  const customerRate = customerRateFromCard(draft);
  const daysStr = (draft.applies_on_days || []).join(",");

  const save = () => onSave({
    id: draft.id,
    courier_id: draft.courier_id,
    rate_type: draft.rate_type,
    partner_cost: draft.partner_cost,
    markup_pct: draft.markup_pct,
    customer_rate_override: draft.customer_rate_override,
    bulk_min_orders: draft.bulk_min_orders,
    weight_limit_kg: draft.weight_limit_kg,
    applies_on_days: draft.applies_on_days,
    notes: draft.notes,
    is_active: draft.is_active,
  });

  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2">
        <select className={inputCls + " w-32"} value={draft.courier_id} onChange={e => setDraft({ ...draft, courier_id: e.target.value })}>
          {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input className={inputCls + " w-28"} value={draft.rate_type} onChange={e => setDraft({ ...draft, rate_type: e.target.value })} placeholder="standard" />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center gap-1 justify-end">
          <span className="text-text-light">₦</span>
          <input type="number" className={inputCls + " w-24 text-right"} value={fromKobo(draft.partner_cost)} onChange={e => setDraft({ ...draft, partner_cost: toKobo(e.target.value) })} />
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <input type="number" step="0.1" className={inputCls + " w-20 text-right"} value={draft.markup_pct} onChange={e => setDraft({ ...draft, markup_pct: Number(e.target.value) })} />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span className={overridden ? "text-text-light line-through" : "font-semibold"}>{fmtNaira(customerRateFromCard({ ...draft, customer_rate_override: null }))}</span>
        {overridden && (
          <div className="text-[9px] text-amber-700 font-semibold inline-flex items-center gap-1 mt-0.5">
            <AlertTriangle className="w-2.5 h-2.5" /> override
          </div>
        )}
        {overridden && <div className="font-bold text-forest">{fmtNaira(customerRate)}</div>}
      </td>
      <td className="px-3 py-2 text-right">
        <input type="number" step="0.1" className={inputCls + " w-20 text-right"} value={draft.weight_limit_kg ?? ""} onChange={e => setDraft({ ...draft, weight_limit_kg: e.target.value ? Number(e.target.value) : null })} />
      </td>
      <td className="px-3 py-2 text-right">
        <input type="number" className={inputCls + " w-16 text-right"} value={draft.bulk_min_orders ?? ""} onChange={e => setDraft({ ...draft, bulk_min_orders: e.target.value ? Number(e.target.value) : null })} />
      </td>
      <td className="px-3 py-2">
        <input className={inputCls + " w-28"} placeholder="mon,tue,…" value={daysStr}
          onChange={e => setDraft({ ...draft, applies_on_days: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center gap-1 justify-end">
          <span className="text-text-light">₦</span>
          <input type="number" className={inputCls + " w-24 text-right"} value={draft.customer_rate_override != null ? fromKobo(draft.customer_rate_override) : ""} placeholder="—"
            onChange={e => setDraft({ ...draft, customer_rate_override: e.target.value === "" ? null : toKobo(e.target.value) })} />
        </div>
      </td>
      <td className="px-3 py-2">
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" className="peer sr-only" checked={draft.is_active} onChange={() => setDraft({ ...draft, is_active: !draft.is_active })} />
          <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-forest peer-checked:after:translate-x-4" />
        </label>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button onClick={save} disabled={!dirty} className="text-forest hover:underline text-xs font-semibold mr-2 disabled:text-text-light disabled:no-underline">Save</button>
        <button onClick={onDelete} className="text-destructive"><Trash2 className="w-3.5 h-3.5 inline-block" /></button>
      </td>
    </tr>
  );
}

function RateCardAddForm({ zoneId, couriers, onCreate }: {
  zoneId: string; couriers: Courier[]; onCreate: (p: Partial<CourierRateCard>) => Promise<any>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<CourierRateCard>>({
    zone_id: zoneId, courier_id: "", rate_type: "standard",
    partner_cost: 0, markup_pct: 10, customer_rate_override: null,
    bulk_min_orders: 5, weight_limit_kg: null, applies_on_days: [], notes: "", is_active: true,
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-forest-light text-forest px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest/20">
        <Plus className="w-3.5 h-3.5" /> Add rate card
      </button>
    );
  }

  const preview = customerRateFromCard({
    partner_cost: Number(draft.partner_cost) || 0,
    markup_pct: Number(draft.markup_pct) || 0,
    customer_rate_override: draft.customer_rate_override ?? null,
  });

  const submit = async () => {
    if (!draft.courier_id) { toast.error("Courier required"); return; }
    await onCreate({ ...draft, zone_id: zoneId });
    setOpen(false);
  };

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div>
          <label className={labelCls}>Courier</label>
          <select className={inputCls} value={draft.courier_id} onChange={e => setDraft({ ...draft, courier_id: e.target.value })}>
            <option value="">Select…</option>
            {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Rate type</label>
          <input className={inputCls} value={draft.rate_type} onChange={e => setDraft({ ...draft, rate_type: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Partner cost (₦)</label>
          <input type="number" className={inputCls} value={fromKobo(draft.partner_cost)} onChange={e => setDraft({ ...draft, partner_cost: toKobo(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>Markup %</label>
          <input type="number" step="0.1" className={inputCls} value={draft.markup_pct} onChange={e => setDraft({ ...draft, markup_pct: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>Weight limit (kg)</label>
          <input type="number" step="0.1" className={inputCls} value={draft.weight_limit_kg ?? ""} onChange={e => setDraft({ ...draft, weight_limit_kg: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <label className={labelCls}>Bulk min orders</label>
          <input type="number" className={inputCls} value={draft.bulk_min_orders ?? ""} onChange={e => setDraft({ ...draft, bulk_min_orders: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div>
          <label className={labelCls}>Override (₦)</label>
          <input type="number" className={inputCls} placeholder="—"
            value={draft.customer_rate_override != null ? fromKobo(draft.customer_rate_override) : ""}
            onChange={e => setDraft({ ...draft, customer_rate_override: e.target.value === "" ? null : toKobo(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>Customer rate preview</label>
          <div className="px-3 py-2 text-sm font-bold text-forest bg-forest/5 rounded-lg">{fmtNaira(preview)}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button onClick={() => setOpen(false)} className="text-xs text-text-med hover:text-foreground">Cancel</button>
        <button onClick={submit} className={saveBtnCls}><Save className="w-3.5 h-3.5" /> Save</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 4 — Interstate Rates
// ---------------------------------------------------------------------------

// Bundle weight profile (Starter / Standard / Premium). `bookings` = how many
// 10kg (or defined weight_limit) bookings the bundle requires.
const BUNDLES = [
  { name: "Starter",  actualKg: 9.2,  bookings: 1, breakdown: "10kg" },
  { name: "Standard", actualKg: 16.1, bookings: 2, breakdown: "10+7kg" },
  { name: "Premium",  actualKg: 28.3, bookings: 3, breakdown: "10+10+9kg" },
];

function InterstateRatesTab() {
  const { data: zones } = useShippingZonesAdmin();
  const { data: couriers } = useCouriers();
  const { data: rates, isLoading } = useCourierInterstateRates();
  const upsert = useUpsertInterstateRate();
  const del = useDeleteInterstateRate();

  if (isLoading) return <div className="text-center py-10 text-text-med text-sm">Loading interstate rates…</div>;

  // Interstate zones are the non-Lagos ones.
  const interstateZones = (zones || []).filter(z => !(z.states || []).includes("Lagos"));
  const byZone = new Map<string, CourierInterstateRate[]>();
  interstateZones.forEach(z => byZone.set(z.id, []));
  (rates || []).forEach(r => {
    if (!byZone.has(r.zone_id)) byZone.set(r.zone_id, []);
    byZone.get(r.zone_id)!.push(r);
  });

  return (
    <div className="space-y-6">
      {interstateZones.length === 0 && (
        <div className="text-center py-10 text-text-med text-sm">No interstate zones configured (non-Lagos).</div>
      )}
      {interstateZones.map(zone => {
        const rows = (byZone.get(zone.id) || []).sort((a, b) => a.weight_kg_max - b.weight_kg_max);
        return (
          <InterstateZoneCard
            key={zone.id}
            zone={zone}
            rows={rows}
            couriers={couriers || []}
            onSave={p => upsert.mutateAsync(p).then(() => toast.success("Saved")).catch(e => toast.error(e.message || "Save failed"))}
            onDelete={id => del.mutateAsync(id).then(() => toast.success("Deleted")).catch(e => toast.error(e.message || "Delete failed"))}
          />
        );
      })}
    </div>
  );
}

function InterstateZoneCard({
  zone, rows, couriers, onSave, onDelete,
}: {
  zone: AdminShippingZone;
  rows: CourierInterstateRate[];
  couriers: Courier[];
  onSave: (p: Partial<CourierInterstateRate>) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
}) {
  const [local, setLocal] = useState<CourierInterstateRate[]>(rows);
  const [globalMarkup, setGlobalMarkup] = useState<string>("");

  useEffect(() => { setLocal(rows); }, [rows]);

  // Make sure we always have 10 rows (1kg through 10kg) — any missing kg
  // becomes a placeholder the admin can fill & save.
  const completeRows = useMemo(() => {
    const result: Array<Partial<CourierInterstateRate> & { weight_kg_max: number }> = [];
    for (let kg = 1; kg <= 10; kg++) {
      const existing = local.find(r => Number(r.weight_kg_max) === kg);
      if (existing) result.push(existing);
      else result.push({
        zone_id: zone.id,
        weight_kg_max: kg,
        partner_cost: 0,
        markup_pct: 10,
        courier_id: couriers[0]?.id || "",
        is_active: true,
      });
    }
    return result;
  }, [local, zone.id, couriers]);

  const updateRow = (idx: number, patch: Partial<CourierInterstateRate>) => {
    // Keep the full 10-row draft list in `local`, saved rows and unsaved
    // placeholders alike. We re-derive `completeRows` from `local` via the
    // weight_kg_max lookup above, so this is the single source of truth.
    const next = [...completeRows];
    next[idx] = { ...next[idx], ...patch } as any;
    setLocal(next as any);
  };

  const saveRow = async (row: any) => {
    const payload: Partial<CourierInterstateRate> = {
      id: row.id,
      courier_id: row.courier_id,
      zone_id: zone.id,
      weight_kg_max: Number(row.weight_kg_max),
      partner_cost: Number(row.partner_cost) || 0,
      markup_pct: Number(row.markup_pct) || 0,
      is_active: row.is_active ?? true,
    };
    if (!payload.courier_id) { toast.error("Pick a courier first"); return; }
    await onSave(payload);
  };

  const applyGlobalMarkup = async () => {
    const pct = Number(globalMarkup);
    if (!isFinite(pct) || pct < 0) { toast.error("Enter a valid markup %"); return; }
    if (!confirm(`Apply ${pct}% markup to all rows in ${zone.name}?`)) return;
    await Promise.all(
      completeRows.filter(r => r.id).map(r => onSave({ id: r.id, markup_pct: pct }))
    );
    toast.success("Markup applied to all rows");
    setGlobalMarkup("");
  };

  // Bundle cost breakdown
  const bundleRows = BUNDLES.map(b => {
    const perBookingKg = 10;
    const totalKg = b.actualKg;
    // Naively: cost per booking = rate for the max-kg row (10kg). Profit per booking
    // uses customer rate (cost + markup).
    const kgRow = completeRows.find(r => Number(r.weight_kg_max) === perBookingKg);
    const ourCost = (kgRow ? Number(kgRow.partner_cost) || 0 : 0) * b.bookings;
    const customer = (kgRow ? customerRateFromInterstate({ partner_cost: Number(kgRow.partner_cost) || 0, markup_pct: Number(kgRow.markup_pct) || 0 }) : 0) * b.bookings;
    return { ...b, totalKg, ourCost, customer, profit: customer - ourCost };
  });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-sm">{zone.name}</h3>
          <div className="text-[10px] text-text-light mt-0.5">{rows.length} rows · interstate</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-text-med">Apply same markup to all rows:</label>
          <input type="number" step="0.1" className={inputCls + " w-20"} value={globalMarkup} onChange={e => setGlobalMarkup(e.target.value)} placeholder="%" />
          <button onClick={applyGlobalMarkup} className={saveBtnCls + " !py-1.5"}>Apply</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2 w-16">Weight</th>
              <th className="px-3 py-2">Courier</th>
              <th className="px-3 py-2 text-right">Partner Cost</th>
              <th className="px-3 py-2 text-right">Markup %</th>
              <th className="px-3 py-2 text-right">Customer Rate</th>
              <th className="px-3 py-2 w-24 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {completeRows.map((r, idx) => {
              const customer = customerRateFromInterstate({ partner_cost: Number(r.partner_cost) || 0, markup_pct: Number(r.markup_pct) || 0 });
              return (
                <tr key={r.id || `new-${r.weight_kg_max}`} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{r.weight_kg_max} kg</td>
                  <td className="px-3 py-2">
                    <select className={inputCls + " w-36"} value={r.courier_id || ""} onChange={e => updateRow(idx, { courier_id: e.target.value })}>
                      <option value="">Select…</option>
                      {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-text-light">₦</span>
                      <input type="number" className={inputCls + " w-24 text-right"} value={fromKobo(r.partner_cost)} onChange={e => updateRow(idx, { partner_cost: toKobo(e.target.value) })} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" step="0.1" className={inputCls + " w-20 text-right"} value={r.markup_pct ?? 10} onChange={e => updateRow(idx, { markup_pct: Number(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-forest tabular-nums">{fmtNaira(customer)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => saveRow(r)} className="text-forest hover:underline text-xs font-semibold mr-2">Save</button>
                    {r.id && <button onClick={() => { if (confirm("Delete row?")) onDelete(r.id!); }} className="text-destructive"><Trash2 className="w-3.5 h-3.5 inline-block" /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-border">
        <h4 className={sectionCls + " flex items-center gap-1"}><Calculator className="w-3.5 h-3.5" /> Bundle cost breakdown</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0 z-10">
              <tr className="text-left">
                <th className="px-3 py-2">Bundle</th>
                <th className="px-3 py-2">Weight</th>
                <th className="px-3 py-2 text-right">Bookings</th>
                <th className="px-3 py-2 text-right">Our Cost</th>
                <th className="px-3 py-2 text-right">Customer Rate</th>
                <th className="px-3 py-2 text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {bundleRows.map(b => (
                <tr key={b.name} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{b.name}</td>
                  <td className="px-3 py-2 text-text-med">{b.actualKg}kg → {b.breakdown}</td>
                  <td className="px-3 py-2 text-right">{b.bookings}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(b.ourCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNaira(b.customer)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-bold ${b.profit >= 0 ? "text-forest" : "text-destructive"}`}>{fmtNaira(b.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAB 5 — Routing Rules
// ---------------------------------------------------------------------------

function RoutingRulesTab() {
  const { data: rule, isLoading } = useCourierRoutingRules();
  const { data: couriers } = useCouriers();
  const { data: zones } = useShippingZonesAdmin();
  const { data: assignments } = useCourierZoneAssignments();
  const upsert = useUpsertRoutingRule();

  const [draft, setDraft] = useState<Partial<CourierRoutingRule> | null>(null);
  useEffect(() => {
    if (rule) setDraft(rule);
    else if (!isLoading) {
      setDraft({
        rule_name: "default", strategy: "cheapest",
        preferred_courier_id: null, bulk_order_threshold: 5, bulk_window_hours: 24,
        interstate_courier_id: null, fallback_courier_id: null, is_active: true, notes: "",
      });
    }
  }, [rule, isLoading]);

  if (isLoading || !draft) return <div className="text-center py-10 text-text-med text-sm">Loading routing rules…</div>;

  const strategy = (draft.strategy || "cheapest") as RoutingStrategy;

  const save = async () => {
    try {
      await upsert.mutateAsync(draft);
      toast.success("Routing rules saved");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  };

  // Today's picked courier per active zone, based on strategy.
  const today = new Date();
  const dayKey = WEEKDAY_KEYS[(today.getDay() + 6) % 7]; // JS 0=Sun → our mon-first index
  const todaysDecisions = (zones || []).map(z => {
    const zoneAssignments = (assignments || []).filter(a => a.zone_id === z.id && a.is_active);
    if (zoneAssignments.length === 0) return { zone: z.name, chosen: "— no assignment —" };

    if (strategy === "preferred" && draft.preferred_courier_id) {
      const pref = couriers?.find(c => c.id === draft.preferred_courier_id);
      if (pref && zoneAssignments.some(a => a.courier_id === pref.id)) {
        return { zone: z.name, chosen: `${pref.name} (preferred)` };
      }
    }

    // Filter by day-of-week if condition requires
    const applicable = zoneAssignments.filter(a => {
      if (a.condition_type === "day_of_week") {
        const days: string[] = Array.isArray(a.condition_value?.days) ? a.condition_value.days : [];
        return days.includes(dayKey);
      }
      return true;
    });
    if (applicable.length === 0) {
      const fallback = zoneAssignments.find(a => a.condition_type === "fallback");
      return { zone: z.name, chosen: fallback ? `${fallback.courier?.name || "—"} (fallback)` : "— none eligible —" };
    }
    const sorted = [...applicable].sort((a, b) => a.priority - b.priority);
    return { zone: z.name, chosen: `${sorted[0].courier?.name || "—"} (priority ${sorted[0].priority})` };
  });

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-sm">Routing Strategy</h3>
        <div className="space-y-2">
          {(["cheapest", "preferred", "priority"] as const).map(s => (
            <label key={s} className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name="strategy" className="mt-1" checked={strategy === s} onChange={() => setDraft({ ...draft, strategy: s })} />
              <div>
                <div className="font-semibold text-sm capitalize">
                  {s === "cheapest" ? "Cheapest Always" : s === "preferred" ? "Preferred Partner" : "Priority Order"}
                </div>
                <div className="text-[11px] text-text-med">
                  {s === "cheapest"
                    ? "Auto-selects the lowest-cost eligible courier per order."
                    : s === "preferred"
                    ? "Always uses the preferred partner when available in that zone."
                    : "Follows the priority rank set in zone assignments."}
                </div>
              </div>
            </label>
          ))}
        </div>
        {strategy === "preferred" && (
          <div>
            <label className={labelCls}>Preferred Partner</label>
            <select className={inputCls} value={draft.preferred_courier_id || ""} onChange={e => setDraft({ ...draft, preferred_courier_id: e.target.value || null })}>
              <option value="">Select…</option>
              {(couriers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-bold text-sm">Bulk Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Bulk order threshold</label>
            <input type="number" className={inputCls} value={draft.bulk_order_threshold ?? 5} onChange={e => setDraft({ ...draft, bulk_order_threshold: e.target.value ? Number(e.target.value) : null })} />
            <div className="text-[10px] text-text-light mt-1">Use bulk rates when dispatching this many orders on the same day.</div>
          </div>
          <div>
            <label className={labelCls}>Bulk window (hours)</label>
            <input type="number" className={inputCls} value={draft.bulk_window_hours ?? 24} onChange={e => setDraft({ ...draft, bulk_window_hours: e.target.value ? Number(e.target.value) : null })} />
            <div className="text-[10px] text-text-light mt-1">Rolling window used to count same-day orders.</div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h3 className="font-bold text-sm">Special Couriers</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Interstate courier</label>
            <select className={inputCls} value={draft.interstate_courier_id || ""} onChange={e => setDraft({ ...draft, interstate_courier_id: e.target.value || null })}>
              <option value="">Select…</option>
              {(couriers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="text-[10px] text-text-light mt-1">Always use this courier for non-Lagos orders.</div>
          </div>
          <div>
            <label className={labelCls}>Fallback courier</label>
            <select className={inputCls} value={draft.fallback_courier_id || ""} onChange={e => setDraft({ ...draft, fallback_courier_id: e.target.value || null })}>
              <option value="">Select…</option>
              {(couriers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="text-[10px] text-text-light mt-1">Use this when no zone matches the customer address.</div>
          </div>
        </div>
      </div>

      <div className="bg-forest/5 border border-forest/20 rounded-xl p-5">
        <h3 className="font-bold text-sm mb-3">Today's routing preview</h3>
        <div className="text-[11px] text-text-med mb-3">
          Based on the current settings, {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}'s orders will be dispatched as follows:
        </div>
        <div className="space-y-1.5">
          {todaysDecisions.map(d => (
            <div key={d.zone} className="flex items-center justify-between text-xs border-b border-border/40 py-1.5">
              <span className="font-semibold">{d.zone}</span>
              <span className="text-text-med">{d.chosen}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={upsert.isPending} className={saveBtnCls}>
          <Save className="w-4 h-4" /> {upsert.isPending ? "Saving…" : "Save routing rules"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cost Simulator (top of Zone Assignments tab)
// ---------------------------------------------------------------------------

/**
 * Courier cost comparison + live get_courier_assignment call.
 * Renders a small form (weight, zone, daily orders) and a two-row table
 * comparing Brain Express vs eFTD Africa, highlights the winner, shows
 * customer price + profit, and lists the crossover points derived from
 * the live rate cards.
 */
function CostSimulator({ zones, couriers }: { zones: AdminShippingZone[]; couriers: Courier[] }) {
  const { data: rateCards } = useCourierRateCards();

  // Lagos zones only for the simulator — interstate rates live in a
  // separate table and have their own preview on that tab.
  const lagosZones = zones.filter(z => (z.states || []).includes("Lagos"));

  const [weight, setWeight] = useState<number>(9.2);
  const [zoneId, setZoneId] = useState<string>("");
  const [dailyOrders, setDailyOrders] = useState<number>(1);
  // Order subtotal in naira — feeds p_order_subtotal so the simulator
  // exercises the free-delivery threshold branch of the RPC. 0 = no
  // free-delivery eligibility, matching the historical behaviour.
  const [orderSubtotal, setOrderSubtotal] = useState<number>(0);
  const [debouncedWeight, setDebouncedWeight] = useState<number>(9.2);
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    if (!zoneId && lagosZones.length) setZoneId(lagosZones[0].id);
  }, [zoneId, lagosZones]);

  // Debounce the weight input so we don't recompute every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedWeight(weight), 300);
    return () => clearTimeout(t);
  }, [weight]);

  const zone = lagosZones.find(z => z.id === zoneId);

  // Resolve courier IDs by name (the rate cards are joined to the
  // couriers table, but we want to show both regardless of whether
  // they've been added to this zone yet).
  const brainExpress = couriers.find(c => c.name.toLowerCase().includes("brain"));
  const eftd = couriers.find(c => c.name.toLowerCase().includes("eftd") || c.name.toLowerCase().includes("efdt"));

  const cardsForZone = (rateCards || []).filter(rc => rc.zone_id === zoneId && rc.is_active);
  const beCard = brainExpress ? cardsForZone.find(rc => rc.courier_id === brainExpress.id) : undefined;
  const eftdCard = eftd ? cardsForZone.find(rc => rc.courier_id === eftd.id) : undefined;

  const costForCard = (card: CourierRateCard | undefined, wantedCourier: Courier | undefined, weightKg: number) => {
    if (!card) return null;
    const limit = Number(card.weight_limit_kg || wantedCourier?.weight_limit_kg || 10);
    const bookings = Math.max(1, Math.ceil(weightKg / Math.max(0.1, limit)));
    const partnerCost = bookings * (card.partner_cost || 0);
    const override = card.customer_rate_override;
    const customerRate = override != null ? override : Math.round(partnerCost * (1 + (Number(card.markup_pct) || 0) / 100));
    return { bookings, partnerCost, customerRate, markup: Number(card.markup_pct) || 0, weightLimit: limit };
  };

  const beCost = costForCard(beCard, brainExpress, debouncedWeight);
  const eftdCost = costForCard(eftdCard, eftd, debouncedWeight);

  const candidates: Array<{ name: string; card: CourierRateCard | undefined; cost: ReturnType<typeof costForCard> }> = [
    { name: "Brain Express", card: beCard, cost: beCost },
    { name: "eFTD Africa",   card: eftdCard, cost: eftdCost },
  ];
  const winner = candidates
    .filter(c => c.cost != null)
    .sort((a, b) => (a.cost!.partnerCost) - (b.cost!.partnerCost))[0];

  // Live RPC call — uses the zone's first area as a representative
  // city so the routing logic evaluates assignments.
  useEffect(() => {
    if (!zone || !debouncedWeight) { setQuote(null); return; }
    const city = (zone.areas || [])[0] || zone.name;
    const stateName = (zone.states || [])[0] || "Lagos";
    let cancelled = false;
    setQuoteLoading(true);
    (async () => {
      try {
        const { data } = await (supabase.rpc as any)("get_courier_assignment", {
          p_delivery_city: city,
          p_delivery_state: stateName,
          p_bundle_tier: "standard",
          p_order_day: new Date().toLocaleDateString("en-US", { weekday: "long" }),
          p_daily_order_count: dailyOrders,
          p_order_weight_kg: debouncedWeight,
          p_order_subtotal: orderSubtotal,
        });
        if (!cancelled) setQuote(data || null);
      } catch {
        if (!cancelled) setQuote(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [zone?.id, debouncedWeight, dailyOrders, orderSubtotal, zone]);

  // Crossover points for this zone — scan 1→30 kg and note where the
  // winner flips. Useful for the admin to eyeball who wins where.
  const crossovers = useMemo(() => {
    if (!beCost || !eftdCost) return [] as Array<{ from: number; to: number; winner: string }>;
    const beLimit = Number(beCard?.weight_limit_kg || brainExpress?.weight_limit_kg || 10);
    const eftdLimit = Number(eftdCard?.weight_limit_kg || eftd?.weight_limit_kg || 10);
    const beUnit = beCard?.partner_cost || 0;
    const eftdUnit = eftdCard?.partner_cost || 0;
    const ranges: Array<{ from: number; to: number; winner: string }> = [];
    let start = 1;
    let currentWinner: string | null = null;
    for (let kg = 1; kg <= 30; kg++) {
      const be = Math.ceil(kg / beLimit) * beUnit;
      const ef = Math.ceil(kg / eftdLimit) * eftdUnit;
      const w = be === ef ? "Tie" : be < ef ? "Brain Express" : "eFTD Africa";
      if (currentWinner == null) { currentWinner = w; start = kg; continue; }
      if (w !== currentWinner) {
        ranges.push({ from: start, to: kg - 1, winner: currentWinner });
        currentWinner = w;
        start = kg;
      }
    }
    if (currentWinner) ranges.push({ from: start, to: 30, winner: currentWinner });
    return ranges;
  }, [beCost, eftdCost, beCard, eftdCard, brainExpress, eftd]);

  const customerPaysKobo = Number(quote?.customer_rate || 0);
  const ourCostKobo = Number(quote?.partner_cost || 0);
  const profitKobo = customerPaysKobo - ourCostKobo;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="w-5 h-5 text-forest" />
        <h3 className="font-bold text-sm">Courier Cost Simulator</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Order Weight (kg)</label>
          <input type="number" min="0.1" step="0.1" className={inputCls} value={weight} onChange={e => setWeight(Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className={labelCls}>Zone</label>
          <select className={inputCls} value={zoneId} onChange={e => setZoneId(e.target.value)}>
            {lagosZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Daily Orders</label>
          <input type="number" min="1" className={inputCls} value={dailyOrders} onChange={e => setDailyOrders(Number(e.target.value) || 1)} />
        </div>
        <div>
          <label className={labelCls}>Order Subtotal (₦)</label>
          <input
            type="number"
            min="0"
            step="1000"
            className={inputCls}
            value={orderSubtotal}
            onChange={e => setOrderSubtotal(Number(e.target.value) || 0)}
            title="Used to evaluate the zone's free-delivery threshold"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Courier</th>
              <th className="px-3 py-2 text-right">Bookings</th>
              <th className="px-3 py-2 text-right">Our Cost</th>
              <th className="px-3 py-2 text-right">Customer Rate</th>
              <th className="px-3 py-2 w-28 text-center">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map(c => {
              const isWinner = winner && c.name === winner.name && c.cost != null;
              const isLoser = winner && c.name !== winner.name && c.cost != null;
              return (
                <tr key={c.name} className={`border-t border-border ${isWinner ? "bg-emerald-50" : ""}`}>
                  <td className="px-3 py-2 font-semibold">{c.name}</td>
                  {c.cost ? (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">{c.cost.bookings}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(c.cost.partnerCost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(c.cost.customerRate)}</td>
                      <td className="px-3 py-2 text-center">
                        {isWinner ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">✓ Cheapest</span>
                        ) : isLoser ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-text-light">×</span>
                        ) : null}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="px-3 py-2 text-text-light italic">No rate card for this zone</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Live assignment result */}
      <div className="bg-forest/5 border border-forest/20 rounded-lg p-3 text-xs">
        {quoteLoading ? (
          <span className="text-text-med italic">Calculating live assignment…</span>
        ) : quote ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <div>
              <span className="text-text-med">Customer pays:</span>{" "}
              <span className="font-bold text-forest tabular-nums">{fmtNaira(customerPaysKobo)}</span>
            </div>
            <div>
              <span className="text-text-med">Our cost:</span>{" "}
              <span className="font-semibold tabular-nums">{fmtNaira(ourCostKobo)}</span>
            </div>
            <div>
              <span className="text-text-med">Delivery profit:</span>{" "}
              <span className={`font-bold tabular-nums ${profitKobo >= 0 ? "text-forest" : "text-destructive"}`}>{fmtNaira(profitKobo)}</span>
            </div>
            <div className="text-text-light">
              via <b>{quote.partner || "—"}</b> · {quote.bookings || 0} booking{(quote.bookings || 0) === 1 ? "" : "s"} · {quote.rate_type || "standard"}
            </div>
          </div>
        ) : (
          <span className="text-text-light italic">No live quote yet.</span>
        )}
      </div>

      {/* Breakdown text */}
      {quote && winner?.cost && (
        <div className="text-[11px] text-text-med leading-relaxed">
          At {Number(debouncedWeight).toFixed(1)}kg via <b>{quote.partner}</b>:
          {" "}{quote.bookings} booking{quote.bookings === 1 ? "" : "s"} × {fmtNaira((quote.partner_cost || 0) / (quote.bookings || 1))}
          {" "}= <b>{fmtNaira(ourCostKobo)}</b> cost to us.
          {" "}Customer pays <b>{fmtNaira(customerPaysKobo)}</b> ({Number(quote.markup_pct || 0)}% markup).
          {" "}Delivery profit: <b>{fmtNaira(profitKobo)}</b>.
        </div>
      )}

      {/* Crossover points */}
      {crossovers.length > 0 && (
        <div className="bg-muted/40 rounded-lg p-3 text-[11px] text-text-med">
          <div className="font-semibold text-text-dark mb-1">Crossover points (this zone, 1–30kg)</div>
          {crossovers.map((r, i) => (
            <div key={i}>
              {r.from}kg{r.from !== r.to ? `–${r.to}kg` : ""}: <b>{r.winner}</b> wins
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
