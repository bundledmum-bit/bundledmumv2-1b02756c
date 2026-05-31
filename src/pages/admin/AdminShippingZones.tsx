import { useMemo, useState, useEffect, KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, X, MapPin, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

const fmtN = (n: number | null | undefined) =>
  typeof n === "number" && isFinite(n) ? `₦${Math.round(n).toLocaleString()}` : "—";

// Form shape kept separate from the DB row so number inputs can hold
// strings while the user types, and the chip lists can be edited
// independently of arrays sent to Supabase.
interface ZoneForm {
  id?: string;
  name: string;
  areas: string[];
  states: string[];
  flat_rate: string;
  free_delivery_threshold: string;
  estimated_days_min: string;
  estimated_days_max: string;
  display_order: string;
  is_active: boolean;
}

const BLANK_FORM: ZoneForm = {
  name: "",
  areas: [],
  states: [],
  flat_rate: "",
  free_delivery_threshold: "",
  estimated_days_min: "1",
  estimated_days_max: "2",
  display_order: "0",
  is_active: true,
};

function rowToForm(z: any): ZoneForm {
  return {
    id: z.id,
    name: z.name || "",
    areas: Array.isArray(z.areas) ? z.areas : [],
    states: Array.isArray(z.states) ? z.states : [],
    flat_rate: z.flat_rate != null ? String(z.flat_rate) : "",
    free_delivery_threshold: z.free_delivery_threshold != null ? String(z.free_delivery_threshold) : "",
    estimated_days_min: z.estimated_days_min != null ? String(z.estimated_days_min) : "1",
    estimated_days_max: z.estimated_days_max != null ? String(z.estimated_days_max) : "2",
    display_order: z.display_order != null ? String(z.display_order) : "0",
    is_active: z.is_active !== false,
  };
}

export default function AdminShippingZones() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEdit = can("delivery", "edit");
  const [editing, setEditing] = useState<ZoneForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: zones, isLoading } = useQuery({
    queryKey: ["admin-shipping-zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipping_zones")
        .select("*")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const saveZone = useMutation({
    mutationFn: async (zone: ZoneForm) => {
      const payload = {
        name: zone.name.trim(),
        areas: zone.areas,
        states: zone.states.length > 0 ? zone.states : null,
        flat_rate: parseInt(zone.flat_rate, 10) || 0,
        free_delivery_threshold:
          zone.free_delivery_threshold ? parseInt(zone.free_delivery_threshold, 10) : null,
        estimated_days_min: parseInt(zone.estimated_days_min, 10) || 1,
        estimated_days_max: parseInt(zone.estimated_days_max, 10) || 2,
        display_order: parseInt(zone.display_order, 10) || 0,
        is_active: zone.is_active,
      };
      if (zone.id) {
        const { error } = await supabase.from("shipping_zones").update(payload).eq("id", zone.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shipping_zones").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-shipping-zones"] });
      queryClient.invalidateQueries({ queryKey: ["shipping-zones"] });
      setEditing(null);
      setFormError(null);
      toast.success("Zone saved");
    },
    onError: (e: any) => {
      // Postgres unique-violation surface — surface inline rather than toast.
      const msg = e?.message || "Could not save zone";
      if (/duplicate|unique/i.test(msg)) {
        setFormError("A zone with this name already exists.");
      } else {
        toast.error(msg);
      }
    },
  });

  const deleteZone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shipping_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-shipping-zones"] });
      queryClient.invalidateQueries({ queryKey: ["shipping-zones"] });
      toast.success("Zone deleted");
    },
    onError: (e: any) => toast.error(e?.message || "Could not delete zone"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("shipping_zones").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-shipping-zones"] });
      queryClient.invalidateQueries({ queryKey: ["shipping-zones"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not toggle"),
  });

  // Client-side duplicate-name guard so we can surface inline before the
  // Postgres unique-violation bubbles up. Case-insensitive comparison
  // matches what the user actually sees in the list.
  const nameTaken = useMemo(() => {
    if (!editing) return false;
    const target = editing.name.trim().toLowerCase();
    if (!target) return false;
    return (zones || []).some(
      (z: any) => (z.name || "").toLowerCase() === target && z.id !== editing.id,
    );
  }, [editing, zones]);

  const handleSave = () => {
    if (!editing) return;
    setFormError(null);
    if (!editing.name.trim()) {
      setFormError("Zone name is required.");
      return;
    }
    if (nameTaken) {
      setFormError("A zone with this name already exists.");
      return;
    }
    if (editing.areas.length === 0) {
      setFormError("Add at least one area to the zone.");
      return;
    }
    const flat = parseInt(editing.flat_rate, 10);
    if (!flat || flat <= 0) {
      setFormError("Flat rate must be greater than 0.");
      return;
    }
    if (editing.free_delivery_threshold) {
      const fd = parseInt(editing.free_delivery_threshold, 10);
      if (!fd || fd <= 0) {
        setFormError("Free delivery threshold must be greater than 0 if set.");
        return;
      }
    }
    saveZone.mutate(editing);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="pf text-2xl font-bold flex items-center gap-2">
            <MapPin className="w-6 h-6" /> Shipping Zones
          </h1>
          <p className="text-text-med text-sm mt-1 max-w-[720px]">
            Manage delivery zones, coverage areas, and per-zone settings.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditing(BLANK_FORM); setFormError(null); }}
            className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep"
          >
            <Plus className="w-4 h-4" /> New Zone
          </button>
        )}
      </div>

      {/* Info banner — explains the live-pricing relationship to /admin/couriers */}
      <div className="mb-5 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-[12px] text-blue-900">
        <Info className="w-4 h-4 mt-[1px] flex-shrink-0" />
        <p>
          Live delivery pricing is set per courier in <span className="font-semibold">/admin/couriers</span>.
          This page controls which areas belong to which zone and the free-delivery threshold per zone.
        </p>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-10 text-text-med text-sm">Loading zones…</div>
      ) : !zones || zones.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl text-text-med text-sm">
          No shipping zones yet. {canEdit ? "Click + New Zone to get started." : ""}
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map((z: any) => (
            <div
              key={z.id}
              className={`bg-card border rounded-xl p-4 md:p-5 ${z.is_active ? "border-border" : "border-border opacity-70"}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-base md:text-lg">{z.name}</h3>
                    {Array.isArray(z.states) && z.states.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {z.states.map((s: string) => (
                          <span
                            key={s}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-text-med"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-text-light">
                    {(z.areas || []).length} area{(z.areas || []).length === 1 ? "" : "s"}
                    {Array.isArray(z.areas) && z.areas.length > 0 && (
                      <>: <span className="text-text-med">{z.areas.slice(0, 6).join(", ")}{z.areas.length > 6 ? ` +${z.areas.length - 6} more` : ""}</span></>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={z.is_active !== false}
                      onCheckedChange={(v) => canEdit && toggleActive.mutate({ id: z.id, value: v })}
                      disabled={!canEdit}
                    />
                    <span className="text-[11px] text-text-med">{z.is_active !== false ? "Active" : "Inactive"}</span>
                  </div>
                  {canEdit && (
                    <>
                      <button
                        onClick={() => { setEditing(rowToForm(z)); setFormError(null); }}
                        className="p-1.5 hover:bg-muted rounded"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete the "${z.name}" zone? This cannot be undone.`)) {
                            deleteZone.mutate(z.id);
                          }
                        }}
                        className="p-1.5 hover:bg-destructive/10 text-destructive rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
                <div>
                  <span className="text-text-light block">Flat Rate</span>
                  <span className="font-semibold">{fmtN(z.flat_rate)}</span>
                </div>
                <div>
                  <span className="text-text-light block">Free Delivery Over</span>
                  <span className="font-semibold">{fmtN(z.free_delivery_threshold)}</span>
                </div>
                <div>
                  <span className="text-text-light block">Estimated Days</span>
                  <span className="font-semibold">
                    {z.estimated_days_min ?? "—"}–{z.estimated_days_max ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="text-text-light block">Display Order</span>
                  <span className="font-semibold">{z.display_order ?? 0}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ZoneEditorModal
          form={editing}
          setForm={setEditing}
          onClose={() => { setEditing(null); setFormError(null); }}
          onSave={handleSave}
          saving={saveZone.isPending}
          error={formError}
          nameTaken={nameTaken}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor modal — chip inputs for areas + states, naira-prefixed number
// inputs, validation surfaced inline.
// ---------------------------------------------------------------------------
function ZoneEditorModal({
  form,
  setForm,
  onClose,
  onSave,
  saving,
  error,
  nameTaken,
}: {
  form: ZoneForm;
  setForm: (next: ZoneForm | ((p: ZoneForm) => ZoneForm) | null) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  nameTaken: boolean;
}) {
  // Local drafts for chip inputs (typing buffer before commit).
  const [areaDraft, setAreaDraft] = useState("");
  const [stateDraft, setStateDraft] = useState("");

  // Escape closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent | any) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = (patch: Partial<ZoneForm>) =>
    setForm((p: any) => ({ ...(p as ZoneForm), ...patch }));

  const addChip = (kind: "areas" | "states", value: string) => {
    const v = value.trim();
    if (!v) return;
    setForm((p: any) => {
      const arr: string[] = (p as any)[kind] || [];
      if (arr.some(x => x.toLowerCase() === v.toLowerCase())) return p;
      return { ...(p as ZoneForm), [kind]: [...arr, v] } as ZoneForm;
    });
    if (kind === "areas") setAreaDraft(""); else setStateDraft("");
  };

  const removeChip = (kind: "areas" | "states", value: string) => {
    setForm((p: any) => ({
      ...(p as ZoneForm),
      [kind]: ((p as any)[kind] || []).filter((x: string) => x !== value),
    }) as ZoneForm);
  };

  const onChipKey = (kind: "areas" | "states", e: React.KeyboardEvent<HTMLInputElement>) => {
    const v = (kind === "areas" ? areaDraft : stateDraft);
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip(kind, v);
    } else if (e.key === "Backspace" && !v) {
      // Backspace on empty input removes the last chip — common chip-input affordance.
      const arr = (form as any)[kind] || [];
      if (arr.length > 0) removeChip(kind, arr[arr.length - 1]);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-bold">{form.id ? "Edit Zone" : "New Zone"}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Zone Name *</label>
            <input
              value={form.name}
              onChange={e => update({ name: e.target.value })}
              className={inputCls}
              placeholder="e.g. Island, Mainland, Ikorodu"
              autoFocus
            />
            {nameTaken && (
              <p className="text-[11px] text-destructive mt-1">A zone with this name already exists.</p>
            )}
          </div>

          {/* Areas chip input */}
          <div>
            <label className={labelCls}>Areas * (Enter or comma to add)</label>
            <div className="flex flex-wrap gap-1.5 border border-input rounded-lg px-2 py-2 bg-background min-h-[44px]">
              {form.areas.map(a => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-forest-light text-forest text-[11px] font-semibold"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() => removeChip("areas", a)}
                    className="hover:text-destructive"
                    aria-label={`Remove ${a}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                value={areaDraft}
                onChange={e => setAreaDraft(e.target.value)}
                onKeyDown={e => onChipKey("areas", e)}
                onBlur={() => addChip("areas", areaDraft)}
                className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
                placeholder={form.areas.length === 0 ? "Lekki Phase 1, Banana Island…" : ""}
              />
            </div>
          </div>

          {/* States chip input */}
          <div>
            <label className={labelCls}>States (optional)</label>
            <div className="flex flex-wrap gap-1.5 border border-input rounded-lg px-2 py-2 bg-background min-h-[44px]">
              {form.states.map(s => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-text-med text-[11px] font-semibold"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeChip("states", s)}
                    className="hover:text-destructive"
                    aria-label={`Remove ${s}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                value={stateDraft}
                onChange={e => setStateDraft(e.target.value)}
                onKeyDown={e => onChipKey("states", e)}
                onBlur={() => addChip("states", stateDraft)}
                className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
                placeholder={form.states.length === 0 ? "Lagos, Abuja (FCT)…" : ""}
              />
            </div>
          </div>

          {/* Flat rate + free delivery */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Flat Rate * (₦)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-med text-sm pointer-events-none">₦</span>
                <input
                  type="number"
                  min="0"
                  value={form.flat_rate}
                  onChange={e => update({ flat_rate: e.target.value })}
                  className={`${inputCls} pl-7`}
                  placeholder="2500"
                />
              </div>
              <p className="text-[10px] text-text-light mt-1 leading-snug">
                Fallback only. The live RPC pricing from courier rate cards normally overrides this.
              </p>
            </div>
            <div>
              <label className={labelCls}>Free Delivery Over (₦)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-med text-sm pointer-events-none">₦</span>
                <input
                  type="number"
                  min="0"
                  value={form.free_delivery_threshold}
                  onChange={e => update({ free_delivery_threshold: e.target.value })}
                  className={`${inputCls} pl-7`}
                  placeholder="None"
                />
              </div>
            </div>
          </div>

          {/* Estimated days */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Min Days</label>
              <input
                type="number"
                min="0"
                value={form.estimated_days_min}
                onChange={e => update({ estimated_days_min: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Max Days</label>
              <input
                type="number"
                min="0"
                value={form.estimated_days_max}
                onChange={e => update({ estimated_days_max: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>

          {/* Display order + is_active */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className={labelCls}>Display Order</label>
              <input
                type="number"
                value={form.display_order}
                onChange={e => update({ display_order: e.target.value })}
                className={inputCls}
              />
              <p className="text-[10px] text-text-light mt-1">Lower numbers appear first.</p>
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => update({ is_active: !!v })}
              />
              <span>{form.is_active ? "Active" : "Inactive"}</span>
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !form.name.trim() || form.areas.length === 0 || nameTaken}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save Zone"}
          </button>
        </div>
      </div>
    </div>
  );
}
