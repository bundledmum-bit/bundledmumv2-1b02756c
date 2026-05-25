import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Save, X, Percent, Truck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { useDeliverableStates } from "@/hooks/useDeliverableStates";

interface SpendThreshold {
  id: string;
  name: string;
  threshold_amount: number;
  discount_percent: number;
  max_discount_amount: number | null;
  is_active: boolean;
  display_order: number;
}

const fmt = (n: number) => `₦${n.toLocaleString()}`;

export default function AdminPromotions() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="pf text-2xl font-bold">Promotions</h1>
        <p className="text-text-med text-sm mt-1">
          Spend-threshold discounts and free-delivery thresholds, in one place.
        </p>
      </div>
      <Tabs defaultValue="spend" className="w-full">
        <TabsList>
          <TabsTrigger value="spend">
            <Percent className="w-4 h-4 mr-1.5" /> Spend Threshold Discounts
          </TabsTrigger>
          <TabsTrigger value="free-delivery">
            <Truck className="w-4 h-4 mr-1.5" /> Free Delivery Thresholds
          </TabsTrigger>
        </TabsList>
        <TabsContent value="spend" className="mt-4">
          <SpendThresholdsTab />
        </TabsContent>
        <TabsContent value="free-delivery" className="mt-4">
          <FreeDeliveryThresholdsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SpendThresholdsTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SpendThreshold | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", threshold_amount: "", discount_percent: "", max_discount_amount: "", is_active: true, display_order: "0" });

  const { data: thresholds, isLoading } = useQuery({
    queryKey: ["admin-spend-thresholds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spend_threshold_discounts")
        .select("*")
        .order("threshold_amount", { ascending: true });
      if (error) throw error;
      return data as SpendThreshold[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await supabase.from("spend_threshold_discounts").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("spend_threshold_discounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-spend-thresholds"] });
      queryClient.invalidateQueries({ queryKey: ["spend-thresholds"] });
      toast.success("Spend threshold saved");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("spend_threshold_discounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-spend-thresholds"] });
      queryClient.invalidateQueries({ queryKey: ["spend-thresholds"] });
      toast.success("Threshold deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetForm = () => {
    setEditing(null);
    setCreating(false);
    setForm({ name: "", threshold_amount: "", discount_percent: "", max_discount_amount: "", is_active: true, display_order: "0" });
  };

  const startEdit = (t: SpendThreshold) => {
    setEditing(t);
    setCreating(false);
    setForm({
      name: t.name,
      threshold_amount: String(t.threshold_amount),
      discount_percent: String(t.discount_percent),
      max_discount_amount: t.max_discount_amount != null ? String(t.max_discount_amount) : "",
      is_active: t.is_active,
      display_order: String(t.display_order),
    });
  };

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm({ name: "", threshold_amount: "", discount_percent: "", max_discount_amount: "", is_active: true, display_order: "0" });
  };

  const handleSave = () => {
    if (!form.name || !form.threshold_amount || !form.discount_percent) {
      toast.error("Name, threshold, and discount % are required");
      return;
    }
    const payload: any = {
      name: form.name,
      threshold_amount: parseInt(form.threshold_amount),
      discount_percent: parseFloat(form.discount_percent),
      max_discount_amount: form.max_discount_amount ? parseInt(form.max_discount_amount) : null,
      is_active: form.is_active,
      display_order: parseInt(form.display_order) || 0,
    };
    if (editing) payload.id = editing.id;
    saveMutation.mutate(payload);
  };

  const previewSavings = form.threshold_amount && form.discount_percent
    ? Math.round(parseInt(form.threshold_amount) * (parseFloat(form.discount_percent) / 100))
    : 0;

  const showForm = creating || editing;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-text-med text-sm max-w-[640px]">
          Encourage customers to spend more by offering percentage discounts at spend thresholds.
        </p>
        {!showForm && (
          <button onClick={startCreate} className="flex items-center gap-2 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
            <Plus className="w-4 h-4" /> Add Threshold
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">{editing ? "Edit Threshold" : "New Threshold"}</h2>
            <button onClick={resetForm} className="text-text-light hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. 5% off ₦100k+" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Spend Threshold (₦)</label>
              <input type="number" value={form.threshold_amount} onChange={e => setForm(f => ({ ...f, threshold_amount: e.target.value }))}
                placeholder="100000" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Discount (%)</label>
              <input type="number" step="0.1" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))}
                placeholder="5" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Max Discount Cap (₦) <span className="text-text-light font-normal">optional</span></label>
              <input type="number" value={form.max_discount_amount} onChange={e => setForm(f => ({ ...f, max_discount_amount: e.target.value }))}
                placeholder="Leave empty for no cap" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Display Order</label>
              <input type="number" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: e.target.value }))}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                <span className="text-sm font-semibold">Active</span>
              </label>
            </div>
          </div>

          {previewSavings > 0 && (
            <div className="mt-4 bg-forest-light border border-forest/20 rounded-lg p-4">
              <p className="text-xs font-semibold text-forest mb-1">💡 Live Preview</p>
              <p className="text-sm text-foreground">
                When a customer spends <strong>{fmt(parseInt(form.threshold_amount))}</strong> or more, they get{" "}
                <strong>{form.discount_percent}% off</strong> — saving up to{" "}
                <strong>{fmt(form.max_discount_amount ? Math.min(previewSavings, parseInt(form.max_discount_amount)) : previewSavings)}</strong>.
              </p>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} disabled={saveMutation.isPending}
              className="flex items-center gap-2 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
              <Save className="w-4 h-4" /> {saveMutation.isPending ? "Saving..." : "Save Threshold"}
            </button>
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-sm font-semibold border border-border text-text-med hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading...</div>
      ) : !thresholds || thresholds.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <Percent className="w-12 h-12 text-text-light mx-auto mb-3" />
          <h3 className="font-semibold text-lg mb-1">No spend thresholds yet</h3>
          <p className="text-text-med text-sm mb-4">Create your first spend threshold to encourage larger orders.</p>
          <button onClick={startCreate} className="bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
            <Plus className="w-4 h-4 inline mr-1" /> Create Threshold
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-med">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-med">Threshold</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-med">Discount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-med">Max Cap</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-med">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-text-med">Actions</th>
              </tr>
            </thead>
            <tbody>
              {thresholds.map(t => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-semibold">{t.name}</td>
                  <td className="px-4 py-3">{fmt(t.threshold_amount)}</td>
                  <td className="px-4 py-3">{t.discount_percent}%</td>
                  <td className="px-4 py-3 text-text-med">{t.max_discount_amount ? fmt(t.max_discount_amount) : "No cap"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-pill text-[11px] font-semibold ${t.is_active ? "bg-forest-light text-forest" : "bg-muted text-text-light"}`}>
                      {t.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg hover:bg-muted text-text-med hover:text-foreground">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => { if (confirm("Delete this threshold?")) deleteMutation.mutate(t.id); }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-text-med hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Free Delivery Thresholds — admin CRUD for free_delivery_thresholds
// table. Mirrors the spend-threshold inline-form pattern for visual
// consistency. Customer-facing CheckoutPage still reads the old
// site_settings keys; switching it over is a separate prompt.
// ─────────────────────────────────────────────────────────────────────

interface FreeDeliveryThreshold {
  id: string;
  name: string;
  threshold_amount: number;
  scope: "lagos" | "nationwide" | "specific_states";
  applicable_states: string[] | null;
  customer_pays_fee: number;
  delivery_label: string;
  helper_text: string | null;
  marketing_copy: string | null;
  progress_template: string;
  banner_display_threshold_pct: number;
  is_active: boolean;
  display_order: number;
}

// Lagos zone thresholds now live on shipping_zones (one row per zone
// with its own free_delivery_threshold). This page only manages the
// nationwide promotional row going forward. `lagos` and
// `specific_states` are kept in the type so legacy rows still render,
// but the scope picker below restricts new rows to `nationwide`.
const SCOPE_OPTIONS: { value: FreeDeliveryThreshold["scope"]; label: string; tone: string }[] = [
  { value: "nationwide", label: "Nationwide", tone: "bg-blue-100 text-blue-800" },
  { value: "lagos", label: "Lagos (legacy)", tone: "bg-gray-100 text-gray-700" },
  { value: "specific_states", label: "Specific States (legacy)", tone: "bg-orange-100 text-orange-800" },
];

interface FdForm {
  name: string;
  threshold_amount: string;
  scope: FreeDeliveryThreshold["scope"];
  applicable_states: string[];
  customer_pays_fee: string;
  delivery_label: string;
  helper_text: string;
  marketing_copy: string;
  progress_template: string;
  banner_display_threshold_pct: string;
  is_active: boolean;
  display_order: string;
}

const BLANK_FD_FORM: FdForm = {
  name: "",
  threshold_amount: "",
  scope: "nationwide",
  applicable_states: [],
  customer_pays_fee: "0",
  delivery_label: "",
  helper_text: "",
  marketing_copy: "",
  progress_template: "Add ₦{remaining} more to qualify!",
  banner_display_threshold_pct: "70",
  is_active: true,
  display_order: "0",
};

function FreeDeliveryThresholdsTab() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("promotions", "edit");
  const [editing, setEditing] = useState<FreeDeliveryThreshold | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FdForm>(BLANK_FD_FORM);
  const [deletePrompt, setDeletePrompt] = useState<FreeDeliveryThreshold | null>(null);

  const { data: states } = useDeliverableStates(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-free-delivery-thresholds"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("free_delivery_thresholds")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as FreeDeliveryThreshold[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (payload.id) {
        const { id, ...rest } = payload;
        const { error } = await (supabase as any).from("free_delivery_thresholds").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("free_delivery_thresholds").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-free-delivery-thresholds"] });
      queryClient.invalidateQueries({ queryKey: ["free-delivery-thresholds"] });
      toast.success("Free delivery threshold saved");
      resetForm();
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("free_delivery_thresholds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-free-delivery-thresholds"] });
      queryClient.invalidateQueries({ queryKey: ["free-delivery-thresholds"] });
      toast.success("Threshold deleted");
      setDeletePrompt(null);
    },
    onError: (e: any) => toast.error(e?.message || "Delete failed"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any).from("free_delivery_thresholds").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-free-delivery-thresholds"] });
      queryClient.invalidateQueries({ queryKey: ["free-delivery-thresholds"] });
    },
    onError: (e: any) => toast.error(e?.message || "Toggle failed"),
  });

  const resetForm = () => {
    setEditing(null);
    setCreating(false);
    setForm(BLANK_FD_FORM);
  };

  const startEdit = (r: FreeDeliveryThreshold) => {
    setEditing(r);
    setCreating(false);
    setForm({
      name: r.name,
      threshold_amount: String(r.threshold_amount),
      scope: r.scope,
      applicable_states: r.applicable_states || [],
      customer_pays_fee: String(r.customer_pays_fee ?? 0),
      delivery_label: r.delivery_label,
      helper_text: r.helper_text || "",
      marketing_copy: r.marketing_copy || "",
      progress_template: r.progress_template || "Add ₦{remaining} more to qualify!",
      banner_display_threshold_pct: String(r.banner_display_threshold_pct ?? 70),
      is_active: r.is_active,
      display_order: String(r.display_order ?? 0),
    });
  };

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm(BLANK_FD_FORM);
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.threshold_amount || parseInt(form.threshold_amount) < 0) {
      toast.error("Threshold amount must be 0 or more"); return;
    }
    if (!form.delivery_label.trim()) { toast.error("Delivery label is required"); return; }
    if (form.delivery_label.length > 60) { toast.error("Delivery label must be 60 chars or fewer"); return; }
    if (form.helper_text.length > 120) { toast.error("Helper text must be 120 chars or fewer"); return; }
    if (form.marketing_copy.length > 200) { toast.error("Marketing copy must be 200 chars or fewer"); return; }
    const pct = parseInt(form.banner_display_threshold_pct, 10);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("Banner display threshold must be between 0 and 100"); return;
    }
    if (form.scope === "specific_states" && form.applicable_states.length === 0) {
      toast.error("Pick at least one state when scope is Specific States"); return;
    }

    const payload: any = {
      name: form.name.trim(),
      threshold_amount: parseInt(form.threshold_amount, 10),
      scope: form.scope,
      applicable_states: form.scope === "specific_states" ? form.applicable_states : null,
      customer_pays_fee: parseInt(form.customer_pays_fee, 10) || 0,
      delivery_label: form.delivery_label.trim(),
      helper_text: form.helper_text.trim() || null,
      marketing_copy: form.marketing_copy.trim() || null,
      progress_template: form.progress_template.trim() || "Add ₦{remaining} more to qualify!",
      banner_display_threshold_pct: pct,
      is_active: form.is_active,
      display_order: parseInt(form.display_order, 10) || 0,
    };
    if (editing) payload.id = editing.id;
    saveMutation.mutate(payload);
  };

  const showForm = creating || !!editing;
  const scopeTone = useMemo(
    () => Object.fromEntries(SCOPE_OPTIONS.map((o) => [o.value, o.tone])) as Record<string, string>,
    [],
  );
  const scopeLabel = useMemo(
    () => Object.fromEntries(SCOPE_OPTIONS.map((o) => [o.value, o.label])) as Record<string, string>,
    [],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <p className="text-text-med text-sm max-w-[640px]">
          Manages the promotional <strong>nationwide</strong> free-delivery threshold (non-Lagos states).
          Lagos zone thresholds are managed in <a href="/admin/shipping-zones" className="text-forest underline">/admin/shipping-zones</a> — one row per Lagos zone with its own free-delivery amount.
        </p>
        {canEdit && !showForm && (
          <button
            onClick={startCreate}
            className="flex items-center gap-2 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep"
          >
            <Plus className="w-4 h-4" /> Add Nationwide Threshold
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-text-med">
          You don't have permission to manage promotions — controls are read-only.
        </div>
      )}

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">{editing ? `Edit "${editing.name}"` : "New Free Delivery Threshold"}</h2>
            <button onClick={resetForm} className="text-text-light hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Free Lagos delivery over ₦200k"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                maxLength={120}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Threshold amount (₦) *</label>
              <input
                type="number"
                min={0}
                value={form.threshold_amount}
                onChange={(e) => setForm((f) => ({ ...f, threshold_amount: e.target.value }))}
                placeholder="200000"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Scope *</label>
              <select
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as FreeDeliveryThreshold["scope"] }))}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!editing}
                title={!editing ? "New thresholds are nationwide-only — Lagos zones are managed in shipping-zones." : undefined}
              >
                {SCOPE_OPTIONS.filter((o) => editing || o.value === "nationwide").map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {!editing && (
                <p className="text-[11px] text-text-med mt-1">
                  Only <strong>nationwide</strong> rows can be created here. Lagos zone thresholds live in shipping-zones.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Customer pays fee (₦)</label>
              <input
                type="number"
                min={0}
                value={form.customer_pays_fee}
                onChange={(e) => setForm((f) => ({ ...f, customer_pays_fee: e.target.value }))}
                placeholder="0"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
              />
              <p className="text-[11px] text-text-light mt-1">Set to 0 for free delivery, or a flat fee customer pays.</p>
            </div>
            {form.scope === "specific_states" && (
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-text-med block mb-1">Applicable states *</label>
                <select
                  multiple
                  value={form.applicable_states}
                  onChange={(e) => {
                    const picked = Array.from(e.target.selectedOptions).map((o) => o.value);
                    setForm((f) => ({ ...f, applicable_states: picked }));
                  }}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background min-h-[120px]"
                >
                  {(states || []).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <p className="text-[11px] text-text-light mt-1">Hold ⌘/Ctrl to multi-select. Only fires for these states.</p>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-text-med block mb-1">Delivery label *</label>
              <input
                value={form.delivery_label}
                onChange={(e) => setForm((f) => ({ ...f, delivery_label: e.target.value }))}
                placeholder="e.g. FREE Nationwide Delivery 🎉"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                maxLength={60}
              />
              <p className="text-[11px] text-text-light mt-1">Shown on the delivery line at checkout when customer qualifies. {form.delivery_label.length}/60</p>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-text-med block mb-1">Helper text <span className="text-text-light font-normal">optional</span></label>
              <input
                value={form.helper_text}
                onChange={(e) => setForm((f) => ({ ...f, helper_text: e.target.value }))}
                placeholder="e.g. Delivered in 3–5 business days"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                maxLength={120}
              />
              <p className="text-[11px] text-text-light mt-1">Small text shown under the delivery line. {form.helper_text.length}/120</p>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-text-med block mb-1">Marketing copy <span className="text-text-light font-normal">optional</span></label>
              <textarea
                value={form.marketing_copy}
                onChange={(e) => setForm((f) => ({ ...f, marketing_copy: e.target.value }))}
                placeholder="Spend ₦500k+ for FREE delivery anywhere in Nigeria!"
                rows={2}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                maxLength={200}
              />
              <p className="text-[11px] text-text-light mt-1">Homepage banners + general marketing. Mention the threshold manually so you can update both together. {form.marketing_copy.length}/200</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Progress template</label>
              <input
                value={form.progress_template}
                onChange={(e) => setForm((f) => ({ ...f, progress_template: e.target.value }))}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                maxLength={120}
              />
              <p className="text-[11px] text-text-light mt-1">Nudge banner text. Use <code>{"{remaining}"}</code> where the ₦ amount appears.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Banner display threshold (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.banner_display_threshold_pct}
                onChange={(e) => setForm((f) => ({ ...f, banner_display_threshold_pct: e.target.value }))}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
              />
              <p className="text-[11px] text-text-light mt-1">Show nudge banner when cart is at this % of the threshold or above.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Display order</label>
              <input
                type="number"
                value={form.display_order}
                onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                <span className="text-sm font-semibold">Active</span>
              </label>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saveMutation.isPending ? "Saving..." : "Save Threshold"}
            </button>
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-sm font-semibold border border-border text-text-med hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading...</div>
      ) : !rows || rows.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <Truck className="w-12 h-12 text-text-light mx-auto mb-3" />
          <h3 className="font-semibold text-lg mb-1">No free delivery thresholds yet</h3>
          <p className="text-text-med text-sm mb-4">Create your first free-delivery rule to reward larger orders.</p>
          {canEdit && (
            <button onClick={startCreate} className="bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
              <Plus className="w-4 h-4 inline mr-1" /> Create Threshold
            </button>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-med">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-med">Scope</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-med">Threshold</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-med">Customer Pays</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-text-med">Active</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-text-med">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{r.name}</div>
                      {r.scope === "specific_states" && r.applicable_states && r.applicable_states.length > 0 && (
                        <div className="text-[10px] text-text-light mt-0.5">{r.applicable_states.join(", ")}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-pill text-[10px] font-semibold ${scopeTone[r.scope] || "bg-muted text-text-med"}`}>
                        {scopeLabel[r.scope] || r.scope}
                      </span>
                    </td>
                    <td className="px-4 py-3">{fmt(r.threshold_amount)}</td>
                    <td className="px-4 py-3">{r.customer_pays_fee === 0 ? <span className="text-forest font-semibold">FREE</span> : fmt(r.customer_pays_fee)}</td>
                    <td className="px-4 py-3 text-center">
                      <label className={`relative inline-flex items-center ${canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={r.is_active}
                          onChange={(e) => canEdit && toggleActiveMutation.mutate({ id: r.id, is_active: e.target.checked })}
                          disabled={!canEdit || toggleActiveMutation.isPending}
                        />
                        <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-forest peer-checked:after:translate-x-4" />
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        {canEdit && (
                          <>
                            <button onClick={() => startEdit(r)} className="p-1.5 rounded-lg hover:bg-muted text-text-med hover:text-foreground" title={`Edit ${r.name}`}>
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeletePrompt(r)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-text-med hover:text-destructive" title={`Delete ${r.name}`}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deletePrompt && (
        <div className="fixed inset-0 bg-foreground/60 z-[150] flex items-center justify-center p-4" onClick={() => setDeletePrompt(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-[420px] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-1">Delete "{deletePrompt.name}"?</h3>
            <p className="text-xs text-text-med">
              Are you sure you want to delete "{deletePrompt.name}"? This will hide it from customers immediately.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDeletePrompt(null)} className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deletePrompt.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-2 bg-destructive text-white rounded-lg text-xs font-semibold hover:bg-destructive/90 disabled:opacity-40"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
