import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Zap, Check } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

export default function AdminDelivery() {
  const queryClient = useQueryClient();

  const { data: zones, isLoading } = useQuery({
    queryKey: ["admin-delivery"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_settings").select("*").order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const updateZone = useMutation({
    mutationFn: async (zone: any) => {
      const { error } = await supabase.from("delivery_settings")
        .update({ delivery_fee: zone.delivery_fee, delivery_days_min: zone.delivery_days_min, delivery_days_max: zone.delivery_days_max, free_delivery_threshold: zone.free_delivery_threshold, is_active: zone.is_active })
        .eq("id", zone.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-delivery"] });
      toast.success("Delivery zone updated");
    },
  });

  return (
    <div>
      {/* Express Order Settings — six site_settings keys colocated here so
          the admin can manage the manual-quote flow without SQL. */}
      <ExpressOrderSettingsCard />

      <h1 className="pf text-2xl font-bold mb-6">Delivery Zones</h1>
      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading...</div>
      ) : (
        <div className="space-y-4">
          {(zones || []).map((z: any) => (
            <div key={z.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-lg">{z.zone_name}</h3>
                <button onClick={() => updateZone.mutate({ ...z, is_active: !z.is_active })}
                  className={`w-10 h-5 rounded-full relative transition-colors ${z.is_active ? "bg-forest" : "bg-border"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary-foreground shadow transition-transform ${z.is_active ? "left-5" : "left-0.5"}`} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Fee (₦)</label>
                  <input type="number" defaultValue={z.delivery_fee}
                    onBlur={e => updateZone.mutate({ ...z, delivery_fee: parseInt(e.target.value) })}
                    className="w-full border border-input rounded-lg px-3 py-1.5 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Min Days</label>
                  <input type="number" defaultValue={z.delivery_days_min}
                    onBlur={e => updateZone.mutate({ ...z, delivery_days_min: parseInt(e.target.value) })}
                    className="w-full border border-input rounded-lg px-3 py-1.5 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Max Days</label>
                  <input type="number" defaultValue={z.delivery_days_max}
                    onBlur={e => updateZone.mutate({ ...z, delivery_days_max: parseInt(e.target.value) })}
                    className="w-full border border-input rounded-lg px-3 py-1.5 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Free Over (₦)</label>
                  <input type="number" defaultValue={z.free_delivery_threshold || ""}
                    onBlur={e => updateZone.mutate({ ...z, free_delivery_threshold: parseInt(e.target.value) || null })}
                    className="w-full border border-input rounded-lg px-3 py-1.5 text-sm bg-background" placeholder="None" />
                </div>
              </div>
              <div className="mt-2 text-xs text-text-light">
                States: {(z.states || []).join(", ") || "—"} · Cities: {(z.cities || []).slice(0, 5).join(", ")}{(z.cities || []).length > 5 ? ` +${z.cities.length - 5} more` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Express Order Settings — six site_settings keys read in one query,
// each control persists individually (switches immediately, text /
// number on blur). Server-side place-order v35 reads the same keys at
// validation time.
// ─────────────────────────────────────────────────────────────────────

const EXPRESS_KEYS = [
  "express_order_enabled",
  "express_order_min_subtotal_naira",
  "express_order_min_subtotal_enforced",
  "express_order_sla_hours",
  "express_order_display_name",
  "express_order_acknowledgment_text",
] as const;

type ExpressKey = typeof EXPRESS_KEYS[number];

interface ExpressSettings {
  express_order_enabled: boolean;
  express_order_min_subtotal_naira: number;
  express_order_min_subtotal_enforced: boolean;
  express_order_sla_hours: number;
  express_order_display_name: string;
  express_order_acknowledgment_text: string;
}

const DEFAULTS: ExpressSettings = {
  express_order_enabled: false,
  express_order_min_subtotal_naira: 150000,
  express_order_min_subtotal_enforced: true,
  express_order_sla_hours: 24,
  express_order_display_name: "Express Order",
  express_order_acknowledgment_text:
    "I understand that my delivery fee will be quoted separately and paid via a second Paystack link. My order will not ship until delivery is paid.",
};

// site_settings.value is jsonb — could come back as native boolean /
// number / string, OR as a JSON-encoded string from legacy seeds. Coerce
// per type so the UI never crashes on a "false" string vs false bool.
function asBool(v: any, fallback: boolean): boolean {
  if (v === true || v === false) return v;
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === 1 || v === "1") return true;
  if (v === 0 || v === "0") return false;
  return fallback;
}
function asInt(v: any, fallback: number): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseInt(v.replace(/^"|"$/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
function asString(v: any, fallback: string): string {
  if (typeof v === "string") return v.replace(/^"|"$/g, "");
  if (v == null) return fallback;
  return String(v);
}

function ExpressOrderSettingsCard() {
  const { can } = usePermissions();
  const canEdit = can("delivery", "edit");
  const queryClient = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-express-order-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", EXPRESS_KEYS as readonly string[]);
      if (error) throw error;
      return data || [];
    },
  });

  const [form, setForm] = useState<ExpressSettings>(DEFAULTS);
  // "Saved" indicator window — keyed per field for a brief checkmark.
  const [justSaved, setJustSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!rows) return;
    const map: Record<string, any> = {};
    rows.forEach((r: any) => { map[r.key] = r.value; });
    setForm({
      express_order_enabled: asBool(map.express_order_enabled, DEFAULTS.express_order_enabled),
      express_order_min_subtotal_naira: asInt(map.express_order_min_subtotal_naira, DEFAULTS.express_order_min_subtotal_naira),
      express_order_min_subtotal_enforced: asBool(map.express_order_min_subtotal_enforced, DEFAULTS.express_order_min_subtotal_enforced),
      express_order_sla_hours: asInt(map.express_order_sla_hours, DEFAULTS.express_order_sla_hours),
      express_order_display_name: asString(map.express_order_display_name, DEFAULTS.express_order_display_name),
      express_order_acknowledgment_text: asString(map.express_order_acknowledgment_text, DEFAULTS.express_order_acknowledgment_text),
    });
  }, [rows]);

  // ── Validation per key ─────────────────────────────────────────
  const validators: Record<ExpressKey, (v: any) => string | null> = {
    express_order_enabled: () => null,
    express_order_min_subtotal_enforced: () => null,
    express_order_min_subtotal_naira: (v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 10_000_000) return "Must be an integer between 0 and 10,000,000";
      return null;
    },
    express_order_sla_hours: (v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 168) return "Must be an integer between 1 and 168";
      return null;
    },
    express_order_display_name: (v) => {
      const s = String(v || "").trim();
      if (s.length < 1 || s.length > 50) return "Must be 1–50 characters";
      return null;
    },
    express_order_acknowledgment_text: (v) => {
      const s = String(v || "").trim();
      if (s.length < 10 || s.length > 1000) return "Must be 10–1000 characters";
      return null;
    },
  };

  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const persist = async (key: ExpressKey, value: any) => {
    const errMsg = validators[key](value);
    setErrors((p) => ({ ...p, [key]: errMsg }));
    if (errMsg) return;
    const { error } = await (supabase as any)
      .from("site_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-express-order-settings"] });
    queryClient.invalidateQueries({ queryKey: ["site_settings"] });
    setJustSaved((p) => ({ ...p, [key]: true }));
    setTimeout(() => setJustSaved((p) => ({ ...p, [key]: false })), 1500);
  };

  // Switches → persist immediately. Toast uses the spec wording.
  const toggleSwitch = (key: ExpressKey, label: string, nextValue: boolean) => {
    setForm((p) => ({ ...p, [key]: nextValue }));
    void persist(key, nextValue).then(() => {
      toast.success(`${label}: ${nextValue ? "enabled" : "disabled"}`);
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 md:p-6 mb-6">
      <div className="mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" /> Express Order Settings
        </h2>
        <p className="text-text-med text-xs mt-1 max-w-[640px]">
          Configure the Express Order delivery option. Express Orders are quoted manually within the SLA hours after payment.
        </p>
      </div>

      {!canEdit && (
        <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-text-med">
          You need 'Delivery' edit permission to change these settings.
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-6 text-text-med text-sm">Loading settings…</div>
      ) : (
        <div className="space-y-5">
          {/* Row 1 — Master toggle */}
          <SwitchRow
            label="Express Order enabled"
            helper="When OFF, customers cannot select Express Order at checkout."
            checked={form.express_order_enabled}
            saved={justSaved.express_order_enabled}
            disabled={!canEdit}
            onChange={(v) => toggleSwitch("express_order_enabled", "Express Order", v)}
          />

          {/* Row 2 — Display name */}
          <FieldRow
            label="Display name shown to customers"
            helper="What customers see on checkout. Default: Express Order"
            error={errors.express_order_display_name}
            saved={justSaved.express_order_display_name}
          >
            <input
              type="text"
              value={form.express_order_display_name}
              maxLength={50}
              onChange={(e) => setForm((p) => ({ ...p, express_order_display_name: e.target.value }))}
              onBlur={(e) => persist("express_order_display_name", e.target.value.trim())}
              disabled={!canEdit}
              className={inputClass(!!errors.express_order_display_name)}
            />
          </FieldRow>

          {/* Row 3 — SLA hours */}
          <FieldRow
            label="Delivery quote SLA (hours)"
            helper="How long you commit to send a delivery quote. Used in customer messaging."
            error={errors.express_order_sla_hours}
            saved={justSaved.express_order_sla_hours}
          >
            <input
              type="number"
              min={1}
              max={168}
              value={form.express_order_sla_hours}
              onChange={(e) => setForm((p) => ({ ...p, express_order_sla_hours: parseInt(e.target.value, 10) || 0 }))}
              onBlur={(e) => persist("express_order_sla_hours", parseInt(e.target.value, 10))}
              disabled={!canEdit}
              className={`max-w-[160px] ${inputClass(!!errors.express_order_sla_hours)}`}
            />
          </FieldRow>

          {/* Row 4 — Minimum cart size (number) */}
          <FieldRow
            label="Minimum cart size (₦)"
            helper="Minimum subtotal required for Express Order eligibility."
            error={errors.express_order_min_subtotal_naira}
            saved={justSaved.express_order_min_subtotal_naira}
          >
            <div className="relative max-w-[220px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-med text-sm pointer-events-none">₦</span>
              <input
                type="number"
                min={0}
                max={10_000_000}
                value={form.express_order_min_subtotal_naira}
                onChange={(e) => setForm((p) => ({ ...p, express_order_min_subtotal_naira: parseInt(e.target.value, 10) || 0 }))}
                onBlur={(e) => persist("express_order_min_subtotal_naira", parseInt(e.target.value, 10))}
                disabled={!canEdit}
                className={`pl-7 ${inputClass(!!errors.express_order_min_subtotal_naira)}`}
              />
            </div>
          </FieldRow>

          {/* Row 5 — Enforce minimum (toggle) */}
          <SwitchRow
            label="Enforce minimum cart size"
            helper="When OFF, any cart size can use Express Order regardless of the minimum. Useful for bulk orders or promotions. State-level Express Only overrides this anyway."
            checked={form.express_order_min_subtotal_enforced}
            saved={justSaved.express_order_min_subtotal_enforced}
            disabled={!canEdit}
            onChange={(v) => toggleSwitch("express_order_min_subtotal_enforced", "Minimum cart size enforcement", v)}
          />

          {/* Row 6 — Acknowledgment text */}
          <FieldRow
            label="Acknowledgment text customers must agree to"
            helper="Shown next to the acknowledgment checkbox at checkout."
            error={errors.express_order_acknowledgment_text}
            saved={justSaved.express_order_acknowledgment_text}
          >
            <textarea
              rows={4}
              maxLength={1000}
              value={form.express_order_acknowledgment_text}
              onChange={(e) => setForm((p) => ({ ...p, express_order_acknowledgment_text: e.target.value }))}
              onBlur={(e) => persist("express_order_acknowledgment_text", e.target.value.trim())}
              disabled={!canEdit}
              className={inputClass(!!errors.express_order_acknowledgment_text)}
            />
          </FieldRow>
        </div>
      )}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `w-full border rounded-lg px-3 py-2 text-sm bg-background ${hasError ? "border-destructive" : "border-input"}`;
}

function SwitchRow({
  label, helper, checked, onChange, disabled, saved,
}: { label: string; helper: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; saved?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold flex items-center gap-2">
          {label}
          {saved && <span className="inline-flex items-center gap-1 text-[11px] text-forest"><Check className="w-3 h-3" /> Saved</span>}
        </div>
        <p className="text-[12px] text-text-med mt-0.5 max-w-[640px]">{helper}</p>
      </div>
      <label className={`inline-flex items-center gap-2 select-none ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => { if (!disabled) onChange(e.target.checked); }}
          disabled={disabled}
          className="sr-only peer"
        />
        <span className="w-11 h-6 rounded-full bg-muted peer-checked:bg-forest transition relative before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-5 before:h-5 before:rounded-full before:bg-white before:transition peer-checked:before:translate-x-5" />
      </label>
    </div>
  );
}

function FieldRow({
  label, helper, error, saved, children,
}: { label: string; helper: string; error?: string | null; saved?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-semibold flex items-center gap-2 mb-1">
        {label}
        {saved && <span className="inline-flex items-center gap-1 text-[11px] text-forest"><Check className="w-3 h-3" /> Saved</span>}
      </label>
      {children}
      <p className={`text-[12px] mt-1 max-w-[640px] ${error ? "text-destructive" : "text-text-med"}`}>{error || helper}</p>
    </div>
  );
}
