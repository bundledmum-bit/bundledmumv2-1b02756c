import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Rocket, ExternalLink, Copy, AlertTriangle, Link2, Trash2, XCircle, Plus, X } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

const SETTING_KEYS = [
  "coming_soon_enabled",
  "coming_soon_redirect_all",
  "coming_soon_heading",
  "coming_soon_subtext",
  "coming_soon_cta_label",
  "coming_soon_logo_url",
  "coming_soon_bg_color",
  "coming_soon_accent_color",
  "coming_soon_input_placeholder",
] as const;

function toBool(v: any): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function unwrap(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return String(v);
}

export default function AdminComingSoon() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-coming-soon-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", SETTING_KEYS as unknown as string[]);
      if (error) throw error;
      const map: Record<string, any> = {};
      (data || []).forEach((r: any) => { map[r.key] = r.value; });
      return map;
    },
  });

  const { data: waitlist, isLoading: waitlistLoading } = useQuery({
    queryKey: ["admin-coming-soon-waitlist"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("coming_soon_waitlist")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; whatsapp_number: string; created_at: string }>;
    },
  });

  const [form, setForm] = useState({
    heading: "",
    subtext: "",
    cta_label: "",
    input_placeholder: "",
    logo_url: "",
    bg_color: "#FFF8F4",
    accent_color: "#F4845F",
  });
  const [enabled, setEnabled] = useState(false);
  const [redirectAll, setRedirectAll] = useState(false);

  // Hydrate form when settings load
  useEffect(() => {
    if (!settings) return;
    setEnabled(toBool(settings.coming_soon_enabled));
    setRedirectAll(toBool(settings.coming_soon_redirect_all));
    setForm({
      heading: unwrap(settings.coming_soon_heading),
      subtext: unwrap(settings.coming_soon_subtext),
      cta_label: unwrap(settings.coming_soon_cta_label),
      input_placeholder: unwrap(settings.coming_soon_input_placeholder),
      logo_url: unwrap(settings.coming_soon_logo_url),
      bg_color: unwrap(settings.coming_soon_bg_color) || "#FFF8F4",
      accent_color: unwrap(settings.coming_soon_accent_color) || "#F4845F",
    });
  }, [settings]);

  const upsertOne = async (key: string, value: any) => {
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) throw error;
  };

  const saveToggle = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      await upsertOne(key, value);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coming-soon-settings"] });
      queryClient.invalidateQueries({ queryKey: ["coming_soon_flags"] });
      queryClient.invalidateQueries({ queryKey: ["coming_soon_settings"] });
      toast.success("Setting saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      await Promise.all([
        upsertOne("coming_soon_heading", form.heading),
        upsertOne("coming_soon_subtext", form.subtext),
        upsertOne("coming_soon_cta_label", form.cta_label),
        upsertOne("coming_soon_input_placeholder", form.input_placeholder),
        upsertOne("coming_soon_logo_url", form.logo_url || null),
        upsertOne("coming_soon_bg_color", form.bg_color),
        upsertOne("coming_soon_accent_color", form.accent_color),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coming-soon-settings"] });
      queryClient.invalidateQueries({ queryKey: ["coming_soon_settings"] });
      toast.success("Coming Soon settings saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleToggleEnabled = (val: boolean) => {
    setEnabled(val);
    if (!val) { setRedirectAll(false); saveToggle.mutate({ key: "coming_soon_redirect_all", value: false }); }
    saveToggle.mutate({ key: "coming_soon_enabled", value: val });
  };

  const handleToggleRedirect = (val: boolean) => {
    if (!enabled) return;
    setRedirectAll(val);
    saveToggle.mutate({ key: "coming_soon_redirect_all", value: val });
  };

  const copyAll = () => {
    const numbers = (waitlist || []).map(w => w.whatsapp_number).join(", ");
    navigator.clipboard.writeText(numbers);
    toast.success(`Copied ${waitlist?.length || 0} numbers to clipboard`);
  };

  if (isLoading) return <div className="text-center py-10 text-text-med">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="pf text-2xl font-bold flex items-center gap-2">
            <Rocket className="w-6 h-6" /> Coming Soon
          </h1>
          <p className="text-text-med text-sm mt-1">Pre-launch waitlist page with full admin control.</p>
        </div>
        <a href="/coming-soon" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-forest font-semibold border border-forest px-4 py-2 rounded-lg hover:bg-forest-light">
          <ExternalLink className="w-4 h-4" /> Preview page
        </a>
      </div>

      {/* Toggles */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold">Enable Coming Soon Page</h3>
            <p className="text-text-light text-xs mt-0.5">When ON, the <code className="bg-muted px-1 py-0.5 rounded">/coming-soon</code> page is live and accessible.</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" className="peer sr-only" checked={enabled}
              onChange={e => handleToggleEnabled(e.target.checked)} />
            <div className="peer h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-forest peer-checked:after:translate-x-5" />
          </label>
        </div>

        <div className={`flex items-start justify-between gap-4 border-t border-border pt-5 ${!enabled ? "opacity-50" : ""}`}>
          <div>
            <h3 className="text-sm font-bold">Redirect entire site to Coming Soon</h3>
            <p className="text-text-light text-xs mt-0.5">When ON, every public route redirects to <code className="bg-muted px-1 py-0.5 rounded">/coming-soon</code>. Admins are not redirected.</p>
            {redirectAll && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-[#92400E] bg-[#FFF8E1] border border-[#F59E0B]/40 rounded p-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>This will redirect all visitors away from the main site.</span>
              </div>
            )}
          </div>
          <label className={`relative inline-flex items-center ${enabled ? "cursor-pointer" : "cursor-not-allowed"}`}>
            <input type="checkbox" className="peer sr-only" disabled={!enabled} checked={redirectAll}
              onChange={e => handleToggleRedirect(e.target.checked)} />
            <div className="peer h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-coral peer-checked:after:translate-x-5" />
          </label>
        </div>
      </div>

      {enabled && <PreviewTokensSection />}

      {/* Content form */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold mb-1">Page content</h3>

        <div>
          <label className="text-xs font-semibold text-text-med block mb-1.5">Heading</label>
          <textarea value={form.heading} onChange={e => setForm(p => ({ ...p, heading: e.target.value }))}
            rows={3} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
        </div>

        <div>
          <label className="text-xs font-semibold text-text-med block mb-1.5">Subtext</label>
          <textarea value={form.subtext} onChange={e => setForm(p => ({ ...p, subtext: e.target.value }))}
            rows={2} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1.5">CTA button label</label>
            <input type="text" value={form.cta_label} onChange={e => setForm(p => ({ ...p, cta_label: e.target.value }))}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1.5">WhatsApp input placeholder</label>
            <input type="text" value={form.input_placeholder} onChange={e => setForm(p => ({ ...p, input_placeholder: e.target.value }))}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-text-med block mb-1.5">Logo URL</label>
          <input type="url" value={form.logo_url} onChange={e => setForm(p => ({ ...p, logo_url: e.target.value }))}
            placeholder="https://..."
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
          {form.logo_url && (
            <div className="mt-2 p-3 bg-muted/40 border border-border rounded-lg">
              <p className="text-[10px] text-text-light uppercase tracking-wider mb-1.5">Preview</p>
              <img src={form.logo_url} alt="Logo preview" className="h-12 object-contain" />
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1.5">Background color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.bg_color} onChange={e => setForm(p => ({ ...p, bg_color: e.target.value }))}
                className="w-10 h-9 rounded border border-input cursor-pointer" />
              <input type="text" value={form.bg_color} onChange={e => setForm(p => ({ ...p, bg_color: e.target.value }))}
                className="flex-1 border border-input rounded-lg px-3 py-2 text-sm font-mono bg-background" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1.5">Accent color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.accent_color} onChange={e => setForm(p => ({ ...p, accent_color: e.target.value }))}
                className="w-10 h-9 rounded border border-input cursor-pointer" />
              <input type="text" value={form.accent_color} onChange={e => setForm(p => ({ ...p, accent_color: e.target.value }))}
                className="flex-1 border border-input rounded-lg px-3 py-2 text-sm font-mono bg-background" />
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button onClick={() => saveAll.mutate()} disabled={saveAll.isPending}
            className="flex items-center gap-1.5 bg-forest text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
            <Save className="w-4 h-4" /> {saveAll.isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Waitlist */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold">Waitlist Signups</h3>
            <p className="text-text-light text-xs mt-0.5">{waitlist?.length || 0} people waiting</p>
          </div>
          <button onClick={copyAll} disabled={!waitlist?.length}
            className="flex items-center gap-1.5 text-xs font-semibold border border-border px-3 py-2 rounded-lg hover:bg-muted disabled:opacity-40">
            <Copy className="w-3.5 h-3.5" /> Copy All Numbers
          </button>
        </div>

        {waitlistLoading ? (
          <div className="text-center py-6 text-text-med text-sm">Loading waitlist...</div>
        ) : !waitlist?.length ? (
          <div className="text-center py-6 text-text-med text-sm">No signups yet.</div>
        ) : (
          <div className="overflow-hidden border border-border rounded-lg">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-med text-xs">WhatsApp number</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-text-med text-xs">Date signed up</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map(w => (
                  <tr key={w.id} className="border-t border-border">
                    <td className="px-4 py-2.5 font-mono text-xs">{w.whatsapp_number}</td>
                    <td className="px-4 py-2.5 text-xs text-text-light">
                      {new Date(w.created_at).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview token admin — issue, view, copy, revoke, delete
// ---------------------------------------------------------------------------

interface PreviewTokenRow {
  id: string;
  token: string;
  label: string;
  is_active: boolean;
  access_count: number;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

function PreviewTokensSection() {
  const qc = useQueryClient();
  const { adminUser } = usePermissions();
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<PreviewTokenRow | null>(null);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["preview-tokens"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("preview_tokens")
        .select("id, token, label, is_active, access_count, last_used_at, expires_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PreviewTokenRow[];
    },
  });

  const linkFor = (t: PreviewTokenRow) => `https://bundledmum.com?preview=${t.token}`;

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied!");
  };

  const revoke = async (t: PreviewTokenRow) => {
    if (!confirm(`Revoke the preview link for "${t.label}"? They'll no longer bypass Coming Soon.`)) return;
    const { error } = await (supabase as any).from("preview_tokens").update({ is_active: false }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["preview-tokens"] });
    toast.success("Link revoked");
  };

  const del = async (t: PreviewTokenRow) => {
    if (!confirm(`Delete this preview link? This cannot be undone.`)) return;
    const { error } = await (supabase as any).from("preview_tokens").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["preview-tokens"] });
    toast.success("Link deleted");
  };

  const create = useMutation({
    mutationFn: async (payload: { label: string; expires_at: string | null }) => {
      const { data, error } = await (supabase as any)
        .from("preview_tokens")
        .insert({
          label: payload.label,
          expires_at: payload.expires_at,
          created_by: adminUser?.id || null,
        })
        .select("id, token, label, is_active, access_count, last_used_at, expires_at, created_at")
        .single();
      if (error) throw error;
      return data as PreviewTokenRow;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["preview-tokens"] });
      setCreating(false);
      setReveal(row);
    },
  });

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Preview access links</h3>
          <p className="text-text-light text-xs mt-0.5">Share a unique URL with a specific person so they can bypass Coming Soon. Links track use and can be revoked at any time.</p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep">
          <Plus className="w-3.5 h-3.5" /> New preview link
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Link</th>
              <th className="px-3 py-2 text-right">Uses</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="px-3 py-8 text-center text-text-light">Loading…</td></tr>}
            {!isLoading && tokens.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-text-light">No preview links yet.</td></tr>}
            {tokens.map(t => {
              const url = linkFor(t);
              return (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{t.label}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 max-w-[280px]">
                      <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded truncate flex-1">{url}</code>
                      <button onClick={() => copy(url)} className="text-forest font-semibold hover:underline inline-flex items-center gap-0.5" title="Copy link"><Copy className="w-3 h-3" /></button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.access_count}</td>
                  <td className="px-3 py-2 text-text-light">{t.last_used_at ? new Date(t.last_used_at).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"}</td>
                  <td className="px-3 py-2 text-text-light">{t.expires_at ? new Date(t.expires_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "Never"}</td>
                  <td className="px-3 py-2">
                    {t.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold bg-emerald-100 text-emerald-700">Active</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold bg-red-100 text-red-700">Revoked</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {t.is_active && (
                      <button onClick={() => revoke(t)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:underline mr-2"><XCircle className="w-3 h-3" /> Revoke</button>
                    )}
                    <button onClick={() => del(t)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-destructive hover:underline"><Trash2 className="w-3 h-3" /> Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreatePreviewTokenModal
          busy={create.isPending}
          onClose={() => setCreating(false)}
          onCreate={(label, expires_at) => create.mutate({ label, expires_at })}
        />
      )}

      {reveal && <RevealPreviewTokenModal row={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function CreatePreviewTokenModal({
  busy, onClose, onCreate,
}: { busy: boolean; onClose: () => void; onCreate: (label: string, expires_at: string | null) => void }) {
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("");

  const submit = () => {
    if (!label.trim()) { toast.error("Label is required."); return; }
    onCreate(label.trim(), expiry || null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">New preview link</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Label *</label>
            <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="Ada — TikTok launch" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            <p className="text-[10px] text-text-light mt-1">Human-readable name so you can tell who's using which link.</p>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Expires on</label>
            <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            <p className="text-[10px] text-text-light mt-1">Leave blank for a link that never expires.</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} disabled={busy} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
            <button onClick={submit} disabled={busy || !label.trim()} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
              <Link2 className="w-3.5 h-3.5" /> Create link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RevealPreviewTokenModal({ row, onClose }: { row: PreviewTokenRow; onClose: () => void }) {
  const url = `https://bundledmum.com?preview=${row.token}`;
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied!");
  };
  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm inline-flex items-center gap-1.5"><Link2 className="w-4 h-4 text-forest" /> Your preview link is ready</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <p className="text-xs text-text-med">Copy and share this link with <b className="text-foreground">{row.label}</b>. Anyone with this URL will bypass the Coming Soon page.</p>
          <div className="bg-muted rounded-lg px-3 py-2 break-all text-xs font-mono">{url}</div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Close</button>
            <button onClick={copy} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep">
              <Copy className="w-3.5 h-3.5" /> Copy link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
