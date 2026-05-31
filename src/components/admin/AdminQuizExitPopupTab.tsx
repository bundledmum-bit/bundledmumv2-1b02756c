import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Eye, EyeOff, RotateCcw, Lock } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

/**
 * Rich admin UI for the Quiz Exit Intent popup.
 * All values are persisted in site_settings as individual keys prefixed
 * with quiz_exit_popup_*. Keys read by ExitIntentPopup.tsx.
 */

// ─── Defaults ──────────────────────────────────────────────────────────────
// These mirror the original hardcoded component, so unsetting a key falls
// back to the original behavior/copy.

export const EXIT_POPUP_DEFAULTS = {
  quiz_exit_popup_enabled: true,
  quiz_exit_popup_emoji: "🎁",
  quiz_exit_popup_title: "Wait — your bundle is almost ready!",
  quiz_exit_popup_message:
    "You're {stepsLeft} step{s} away from your personalised hospital bag list.",

  quiz_exit_popup_bg_color: "#ffffff",
  quiz_exit_popup_text_color: "#1A1A1A",

  quiz_exit_popup_primary_cta_text: "Continue My Quiz →",
  quiz_exit_popup_primary_cta_bg: "#F4845F",
  quiz_exit_popup_primary_cta_text_color: "#ffffff",
  quiz_exit_popup_primary_cta_action: "close", // "close" | "link"
  quiz_exit_popup_primary_cta_link: "",

  quiz_exit_popup_secondary_enabled: true,
  quiz_exit_popup_secondary_text: "Maybe Later",
  quiz_exit_popup_secondary_action: "close", // "close" | "link"
  quiz_exit_popup_secondary_link: "",

  quiz_exit_popup_testimonial_enabled: true,
  quiz_exit_popup_testimonial_text:
    "The quiz took 2 minutes and saved me weeks of research",
  quiz_exit_popup_testimonial_author: "Ngozi T.",

  quiz_exit_popup_trigger_mouse_y: 5,
  quiz_exit_popup_trigger_popstate: true,
  quiz_exit_popup_min_steps: 1,
  quiz_exit_popup_once_per_session: true,
  quiz_exit_popup_delay_seconds: 0,
};

export type ExitPopupKey = keyof typeof EXIT_POPUP_DEFAULTS;

// ─── Helpers for reading site_settings values ──────────────────────────────
export function readExitPopupSetting<K extends ExitPopupKey>(
  settings: Record<string, any> | undefined,
  key: K,
): (typeof EXIT_POPUP_DEFAULTS)[K] {
  const raw = settings?.[key];
  const fallback = EXIT_POPUP_DEFAULTS[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof fallback === "boolean") {
    return (raw === true || raw === "true" || raw === 1 || raw === "1") as any;
  }
  if (typeof fallback === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : fallback) as any;
  }
  if (typeof raw === "string") return raw as any;
  return String(raw) as any;
}

// ─── UI ────────────────────────────────────────────────────────────────────

export default function AdminQuizExitPopupTab() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  // Defense-in-depth: super_admin/admin are auto-allowed; other roles need
  // the explicit content.manage_quiz_exit_popup permission.
  const canManage = can("content", "manage_quiz_exit_popup");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-quiz-exit-popup"],
    queryFn: async () => {
      const keys = Object.keys(EXIT_POPUP_DEFAULTS);
      const { data, error } = await supabase
        .from("site_settings")
        .select("*")
        .in("key", keys);
      if (error) throw error;
      const map: Record<string, any> = {};
      (data || []).forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
  });

  const [draft, setDraft] = useState<Record<string, any>>({});
  const [showPreview, setShowPreview] = useState(true);

  // Merged view: draft overrides DB value overrides default
  const effective = useMemo(() => {
    const out: Record<string, any> = {};
    for (const k of Object.keys(EXIT_POPUP_DEFAULTS) as ExitPopupKey[]) {
      if (k in draft) out[k] = draft[k];
      else out[k] = readExitPopupSetting(settings, k);
    }
    return out as typeof EXIT_POPUP_DEFAULTS;
  }, [draft, settings]);

  const dirtyKeys = Object.keys(draft);
  const hasChanges = dirtyKeys.length > 0;

  const set = <K extends ExitPopupKey>(key: K, value: (typeof EXIT_POPUP_DEFAULTS)[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const saveAll = useMutation({
    mutationFn: async () => {
      if (!canManage) throw new Error("Not permitted to modify exit popup settings");
      const rows = dirtyKeys.map(key => ({ key, value: draft[key] }));
      const { error } = await supabase.from("site_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-quiz-exit-popup"] });
      queryClient.invalidateQueries({ queryKey: ["site_settings"] });
      setDraft({});
      toast.success("Exit popup settings saved");
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  const resetDefaults = () => {
    const all: Record<string, any> = {};
    for (const k of Object.keys(EXIT_POPUP_DEFAULTS) as ExitPopupKey[]) {
      all[k] = EXIT_POPUP_DEFAULTS[k];
    }
    setDraft(all);
    toast.info("Defaults loaded — click Save All to apply");
  };

  if (isLoading) return <div className="py-10 text-center text-text-light text-sm">Loading…</div>;

  if (!canManage) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center">
        <Lock className="w-8 h-8 mx-auto text-text-light mb-3" />
        <h3 className="text-sm font-bold mb-1">Restricted setting</h3>
        <p className="text-xs text-text-light">
          Only super admins, admins, or users with the
          <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px] mx-1">content.manage_quiz_exit_popup</span>
          permission can configure this.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header / actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 sticky top-0 bg-background/95 backdrop-blur-sm z-20 py-2 -mx-1 px-1 border-b border-border">
        <div>
          <h2 className="pf text-xl font-bold">Quiz Exit Popup</h2>
          <p className="text-xs text-text-light mt-0.5">
            Controls the popup shown on <span className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">/quiz</span> when visitors try to leave
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text-med hover:bg-muted transition-colors"
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPreview ? "Hide" : "Show"} preview
          </button>
          <button
            onClick={resetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text-med hover:bg-muted transition-colors"
            title="Load default values into draft (not saved yet)"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restore defaults
          </button>
          <button
            onClick={() => saveAll.mutate()}
            disabled={!hasChanges || saveAll.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-forest text-primary-foreground text-xs font-semibold disabled:opacity-50 transition-opacity"
          >
            <Save className="w-3.5 h-3.5" />
            {saveAll.isPending ? "Saving…" : hasChanges ? `Save ${dirtyKeys.length} change${dirtyKeys.length === 1 ? "" : "s"}` : "No changes"}
          </button>
        </div>
      </div>

      <div className={`grid gap-6 ${showPreview ? "lg:grid-cols-[1fr_360px]" : "grid-cols-1"}`}>
        {/* ── Fields column ── */}
        <div className="space-y-6">
          {/* Master toggle */}
          <Section title="Master toggle">
            <ToggleField
              label="Exit popup enabled"
              description="Globally enable or disable the quiz exit intent popup"
              value={effective.quiz_exit_popup_enabled}
              onChange={v => set("quiz_exit_popup_enabled", v)}
            />
          </Section>

          {/* Content */}
          <Section title="Content" subtitle="Copy, emoji, and colors shown inside the popup">
            <div className="grid grid-cols-1 sm:grid-cols-[80px_1fr] gap-3 items-start">
              <TextField
                label="Emoji"
                value={effective.quiz_exit_popup_emoji}
                onChange={v => set("quiz_exit_popup_emoji", v)}
                placeholder="🎁"
              />
              <TextField
                label="Title / headline"
                value={effective.quiz_exit_popup_title}
                onChange={v => set("quiz_exit_popup_title", v)}
                placeholder="Wait — your bundle is almost ready!"
              />
            </div>
            <TextareaField
              label="Message"
              description="Use {stepsLeft} for remaining steps and {s} for pluralisation. e.g. '{stepsLeft} step{s} away'"
              value={effective.quiz_exit_popup_message}
              onChange={v => set("quiz_exit_popup_message", v)}
              rows={2}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ColorField
                label="Background color"
                value={effective.quiz_exit_popup_bg_color}
                onChange={v => set("quiz_exit_popup_bg_color", v)}
              />
              <ColorField
                label="Text color"
                value={effective.quiz_exit_popup_text_color}
                onChange={v => set("quiz_exit_popup_text_color", v)}
              />
            </div>
          </Section>

          {/* Primary CTA */}
          <Section title="Primary CTA" subtitle="The main action button in the popup">
            <TextField
              label="Button text"
              value={effective.quiz_exit_popup_primary_cta_text}
              onChange={v => set("quiz_exit_popup_primary_cta_text", v)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ColorField
                label="Button background"
                value={effective.quiz_exit_popup_primary_cta_bg}
                onChange={v => set("quiz_exit_popup_primary_cta_bg", v)}
              />
              <ColorField
                label="Button text color"
                value={effective.quiz_exit_popup_primary_cta_text_color}
                onChange={v => set("quiz_exit_popup_primary_cta_text_color", v)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField
                label="Click behavior"
                value={effective.quiz_exit_popup_primary_cta_action}
                onChange={v => set("quiz_exit_popup_primary_cta_action", v)}
                options={[
                  { value: "close", label: "Close popup (continue quiz)" },
                  { value: "link", label: "Navigate to a URL" },
                ]}
              />
              {effective.quiz_exit_popup_primary_cta_action === "link" && (
                <TextField
                  label="URL"
                  value={effective.quiz_exit_popup_primary_cta_link}
                  onChange={v => set("quiz_exit_popup_primary_cta_link", v)}
                  placeholder="/shop or https://..."
                />
              )}
            </div>
          </Section>

          {/* Secondary CTA */}
          <Section title="Secondary CTA" subtitle="Optional dismissive / alternative action">
            <ToggleField
              label="Show secondary button"
              value={effective.quiz_exit_popup_secondary_enabled}
              onChange={v => set("quiz_exit_popup_secondary_enabled", v)}
            />
            {effective.quiz_exit_popup_secondary_enabled && (
              <>
                <TextField
                  label="Button text"
                  value={effective.quiz_exit_popup_secondary_text}
                  onChange={v => set("quiz_exit_popup_secondary_text", v)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <SelectField
                    label="Click behavior"
                    value={effective.quiz_exit_popup_secondary_action}
                    onChange={v => set("quiz_exit_popup_secondary_action", v)}
                    options={[
                      { value: "close", label: "Close popup" },
                      { value: "link", label: "Navigate to a URL" },
                    ]}
                  />
                  {effective.quiz_exit_popup_secondary_action === "link" && (
                    <TextField
                      label="URL"
                      value={effective.quiz_exit_popup_secondary_link}
                      onChange={v => set("quiz_exit_popup_secondary_link", v)}
                      placeholder="/shop or https://..."
                    />
                  )}
                </div>
              </>
            )}
          </Section>

          {/* Testimonial */}
          <Section title="Social proof" subtitle="Optional testimonial shown below the buttons">
            <ToggleField
              label="Show testimonial"
              value={effective.quiz_exit_popup_testimonial_enabled}
              onChange={v => set("quiz_exit_popup_testimonial_enabled", v)}
            />
            {effective.quiz_exit_popup_testimonial_enabled && (
              <>
                <TextareaField
                  label="Testimonial quote"
                  value={effective.quiz_exit_popup_testimonial_text}
                  onChange={v => set("quiz_exit_popup_testimonial_text", v)}
                  rows={2}
                />
                <TextField
                  label="Attribution (author)"
                  value={effective.quiz_exit_popup_testimonial_author}
                  onChange={v => set("quiz_exit_popup_testimonial_author", v)}
                  placeholder="Ngozi T."
                />
              </>
            )}
          </Section>

          {/* Triggers */}
          <Section title="Triggers" subtitle="When the popup should fire">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumberField
                label="Mouse exit threshold (px from top)"
                description="Fires when cursor moves above this Y coordinate. 0 disables mouse trigger."
                value={effective.quiz_exit_popup_trigger_mouse_y}
                onChange={v => set("quiz_exit_popup_trigger_mouse_y", v)}
                min={0}
                max={200}
              />
              <NumberField
                label="Minimum steps completed"
                description="Don't fire until the visitor has answered at least this many quiz steps"
                value={effective.quiz_exit_popup_min_steps}
                onChange={v => set("quiz_exit_popup_min_steps", v)}
                min={0}
                max={20}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumberField
                label="Delay (seconds on page before arming)"
                description="Don't fire until the visitor has been on /quiz for this many seconds"
                value={effective.quiz_exit_popup_delay_seconds}
                onChange={v => set("quiz_exit_popup_delay_seconds", v)}
                min={0}
                max={300}
              />
              <ToggleField
                label="Mobile back-button trigger"
                description="Fire on popstate (mobile hardware/software back button)"
                value={effective.quiz_exit_popup_trigger_popstate}
                onChange={v => set("quiz_exit_popup_trigger_popstate", v)}
              />
            </div>
            <ToggleField
              label="Show only once per session"
              description="If off, the popup can re-fire multiple times in the same session"
              value={effective.quiz_exit_popup_once_per_session}
              onChange={v => set("quiz_exit_popup_once_per_session", v)}
            />
          </Section>
        </div>

        {/* ── Live preview column ── */}
        {showPreview && (
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="text-[11px] font-bold text-text-light uppercase tracking-wider mb-2">Live preview</div>
            <div className="rounded-xl bg-gradient-to-br from-forest/20 to-coral/20 p-6 border border-border min-h-[400px] flex items-center justify-center">
              {effective.quiz_exit_popup_enabled ? (
                <PopupPreview settings={effective} />
              ) : (
                <div className="text-center text-text-light text-xs py-12">
                  <div className="text-3xl mb-2 opacity-40">🔕</div>
                  <p>Popup is disabled.</p>
                  <p className="mt-1">Enable the master toggle to preview.</p>
                </div>
              )}
            </div>
            <div className="text-[10px] text-text-light mt-2 leading-relaxed">
              Preview reflects unsaved changes in real time. {"{stepsLeft}"} and {"{s}"}
              variables shown with example values.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Preview ──────────────────────────────────────────────────────────────

function PopupPreview({ settings }: { settings: typeof EXIT_POPUP_DEFAULTS }) {
  const stepsLeft: number = 2;
  const renderedMessage = (settings.quiz_exit_popup_message || "")
    .replace(/\{stepsLeft\}/g, String(stepsLeft))
    .replace(/\{s\}/g, stepsLeft === 1 ? "" : "s");

  return (
    <div
      className="relative rounded-[22px] shadow-2xl max-w-[360px] w-full p-6 text-center"
      style={{
        backgroundColor: settings.quiz_exit_popup_bg_color,
        color: settings.quiz_exit_popup_text_color,
      }}
    >
      {settings.quiz_exit_popup_emoji && (
        <div className="text-4xl mb-3">{settings.quiz_exit_popup_emoji}</div>
      )}
      {settings.quiz_exit_popup_title && (
        <h2 className="pf text-xl font-bold mb-2">{settings.quiz_exit_popup_title}</h2>
      )}
      {renderedMessage && (
        <p className="text-sm mb-5 opacity-90">{renderedMessage}</p>
      )}
      <div className="flex flex-col gap-2.5">
        <button
          className="rounded-pill px-6 py-3 font-semibold text-sm"
          style={{
            backgroundColor: settings.quiz_exit_popup_primary_cta_bg,
            color: settings.quiz_exit_popup_primary_cta_text_color,
          }}
        >
          {settings.quiz_exit_popup_primary_cta_text}
        </button>
        {settings.quiz_exit_popup_secondary_enabled && (
          <button
            className="rounded-pill border-2 px-6 py-3 font-semibold text-sm opacity-80"
            style={{ borderColor: settings.quiz_exit_popup_text_color, color: settings.quiz_exit_popup_text_color }}
          >
            {settings.quiz_exit_popup_secondary_text}
          </button>
        )}
      </div>
      {settings.quiz_exit_popup_testimonial_enabled && settings.quiz_exit_popup_testimonial_text && (
        <p className="text-[11px] mt-4 italic opacity-70">
          ⭐ "{settings.quiz_exit_popup_testimonial_text}"
          {settings.quiz_exit_popup_testimonial_author ? ` — ${settings.quiz_exit_popup_testimonial_author}` : ""}
        </p>
      )}
    </div>
  );
}

// ─── Small field components ───────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-text-light mt-0.5">{subtitle}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FieldLabel({ label, description }: { label: string; description?: string }) {
  return (
    <div className="mb-1">
      <label className="text-xs font-semibold text-text-med block">{label}</label>
      {description && <p className="text-[10px] text-text-light mt-0.5 leading-relaxed">{description}</p>}
    </div>
  );
}

function TextField({ label, description, value, onChange, placeholder }: { label: string; description?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <FieldLabel label={label} description={description} />
      <input
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
      />
    </div>
  );
}

function TextareaField({ label, description, value, onChange, rows = 3 }: { label: string; description?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <FieldLabel label={label} description={description} />
      <textarea
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none"
      />
    </div>
  );
}

function NumberField({ label, description, value, onChange, min, max }: { label: string; description?: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div>
      <FieldLabel label={label} description={description} />
      <input
        type="number"
        value={value ?? 0}
        min={min}
        max={max}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
      />
    </div>
  );
}

function ToggleField({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-1">
      <input
        type="checkbox"
        checked={!!value}
        onChange={e => onChange(e.target.checked)}
        className="rounded mt-0.5"
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description && <p className="text-[10px] text-text-light mt-0.5 leading-relaxed">{description}</p>}
      </div>
    </label>
  );
}

function ColorField({ label, description, value, onChange }: { label: string; description?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <FieldLabel label={label} description={description} />
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value || "#000000"}
          onChange={e => onChange(e.target.value)}
          className="w-9 h-9 rounded border border-input cursor-pointer flex-shrink-0"
        />
        <input
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 min-w-0 border border-input rounded-lg px-2 py-2 text-xs bg-background font-mono"
        />
      </div>
    </div>
  );
}

function SelectField({ label, description, value, onChange, options }: { label: string; description?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <FieldLabel label={label} description={description} />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
