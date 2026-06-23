import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import { PROMPT_COPY_DEFAULTS, coercePromptValue, type PromptCopyKey } from "@/hooks/usePromptCopy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Bell, Send, Smartphone, Monitor, Apple } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Subscription = {
  id: string;
  endpoint: string;
  customer_email: string | null;
  os: string | null;
  browser: string | null;
  device_type: string | null;
  is_active: boolean;
  last_sent_at: string | null;
  created_at: string;
};
type Trigger = {
  id: string;
  trigger_key: string;
  label: string;
  is_enabled: boolean;
  title_template: string | null;
  body_template: string | null;
  url_template: string | null;
  updated_at: string;
};
type Campaign = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  audience: string;
  source: string;
  sent_count: number | null;
  failed_count: number | null;
  created_at: string;
};

function relTime(iso?: string | null) {
  if (!iso) return "";
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ""; }
}

const platformOf = (os: string | null): "Android" | "iOS" | "Desktop" | "Other" => {
  const o = (os || "").toLowerCase();
  if (o === "android") return "Android";
  if (o === "ios") return "iOS";
  if (["windows", "macos", "mac os", "linux"].includes(o)) return "Desktop";
  return "Other";
};

const SectionCard = ({ title, children, desc }: { title: string; children: React.ReactNode; desc?: string }) => (
  <section className="bg-card border border-border rounded-xl p-5 space-y-4">
    <div>
      <h2 className="font-bold text-forest text-sm uppercase tracking-wider">{title}</h2>
      {desc && <p className="text-xs text-text-med mt-1">{desc}</p>}
    </div>
    {children}
  </section>
);

export default function AdminPushNotifications() {
  const { can } = usePermissions();
  const canManage = can("settings", "manage");
  const qc = useQueryClient();

  // ── Data ──────────────────────────────────────────────────────────────────
  const subsQuery = useQuery({
    queryKey: ["push", "subscriptions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("push_subscriptions")
        .select("id, endpoint, customer_email, os, browser, device_type, is_active, last_sent_at, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Subscription[];
    },
  });
  const triggersQuery = useQuery({
    queryKey: ["push", "triggers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("push_triggers")
        .select("id, trigger_key, label, is_enabled, title_template, body_template, url_template, updated_at")
        .order("trigger_key", { ascending: true });
      if (error) throw error;
      return (data || []) as Trigger[];
    },
  });
  const campaignsQuery = useQuery({
    queryKey: ["push", "campaigns"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("push_campaigns")
        .select("id, title, body, url, audience, source, sent_count, failed_count, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as Campaign[];
    },
  });

  const subs = subsQuery.data || [];
  const platformCounts = useMemo(() => {
    const c = { Android: 0, iOS: 0, Desktop: 0, Other: 0 };
    for (const s of subs) c[platformOf(s.os)] += 1;
    return c;
  }, [subs]);

  // ── Broadcast composer ──────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [audience, setAudience] = useState<"all" | "customers">("all");
  const [sending, setSending] = useState(false);

  const audienceCount = audience === "customers"
    ? subs.filter((s) => !!s.customer_email).length
    : subs.length;

  const send = async () => {
    if (!canManage) { toast.error("You don't have permission to send."); return; }
    if (!title.trim() || !body.trim()) { toast.error("Title and message are required."); return; }
    if (!window.confirm(`Send "${title.trim()}" to ${audienceCount} subscriber${audienceCount === 1 ? "" : "s"} (${audience})?`)) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push", {
        body: { mode: "broadcast", title: title.trim(), body: body.trim(), url: url.trim() || undefined, audience },
      });
      if (error) throw error;
      const res = (data || {}) as { sent?: number; failed?: number };
      toast.success(`Sent to ${res.sent ?? 0} device${res.sent === 1 ? "" : "s"}${res.failed ? ` · ${res.failed} failed` : ""}.`);
      setTitle(""); setBody(""); setUrl("");
      qc.invalidateQueries({ queryKey: ["push", "campaigns"] });
      qc.invalidateQueries({ queryKey: ["push", "subscriptions"] });
    } catch (e: any) {
      toast.error(e?.message || "Could not send broadcast.");
    } finally {
      setSending(false);
    }
  };

  // ── Trigger editing ─────────────────────────────────────────────────────────
  const toggleTrigger = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await (supabase as any).from("push_triggers").update({ is_enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["push", "triggers"] }),
    onError: (e: any) => toast.error(e?.message || "Could not update trigger."),
  });

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-forest/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-forest" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-forest">Push Notifications</h1>
          <p className="text-sm text-text-med">Broadcast to subscribers, manage automated triggers, and review history.</p>
        </div>
      </header>

      {!canManage && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          You have read-only access. Sending and editing require the settings · manage permission.
        </div>
      )}

      {/* Subscribers */}
      <SectionCard title="Subscribers" desc="Active devices that have opted in to push.">
        {subsQuery.isLoading ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                { label: "Total", value: subs.length, Icon: Bell },
                { label: "Android", value: platformCounts.Android, Icon: Smartphone },
                { label: "iOS", value: platformCounts.iOS, Icon: Apple },
                { label: "Desktop", value: platformCounts.Desktop, Icon: Monitor },
              ] as const).map(({ label, value, Icon }) => (
                <div key={label} className="bg-muted/30 border border-border rounded-xl p-3 text-center">
                  <Icon className="w-4 h-4 mx-auto text-forest mb-1" />
                  <div className="text-xl font-bold">{value}</div>
                  <div className="text-[10px] text-text-med uppercase tracking-wide">{label}</div>
                </div>
              ))}
            </div>
            {subs.length > 0 && (
              <div className="border border-border rounded-lg divide-y divide-border">
                {subs.slice(0, 10).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="font-semibold truncate flex-1">{s.customer_email || "Guest"}</span>
                    <span className="text-text-med">{platformOf(s.os)} · {s.browser || "—"}</span>
                    <span className="text-text-light shrink-0">{relTime(s.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* Broadcast composer */}
      <SectionCard title="Broadcast" desc="Send a one-off notification to all subscribers or customers only.">
        <div className="space-y-3">
          <Input placeholder="Title (e.g. New bundles just dropped 🎉)" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canManage} maxLength={80} />
          <Textarea placeholder="Message body" value={body} onChange={(e) => setBody(e.target.value)} disabled={!canManage} rows={3} maxLength={250} />
          <Input placeholder="Destination URL (optional, e.g. /bundles)" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!canManage} />
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as "all" | "customers")}
              disabled={!canManage}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="all">All subscribers ({subs.length})</option>
              <option value="customers">Customers only ({subs.filter((s) => !!s.customer_email).length})</option>
            </select>
            <Button onClick={send} disabled={!canManage || sending || !title.trim() || !body.trim()} className="sm:ml-auto bg-forest hover:bg-forest/90">
              <Send className="w-4 h-4 mr-1.5" /> {sending ? "Sending…" : `Send to ${audienceCount}`}
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Prompt copy */}
      <PromptCopyEditor canManage={canManage} />

      {/* Automated triggers */}
      <SectionCard title="Automated triggers" desc="Templates support {{first_name}} and {{order_number}}.">
        {triggersQuery.isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : (triggersQuery.data || []).length === 0 ? (
          <p className="text-sm text-text-med">No triggers configured.</p>
        ) : (
          <div className="space-y-3">
            {(triggersQuery.data || []).map((t) => (
              <TriggerRow key={t.id} trigger={t} canManage={canManage} onToggle={(v) => toggleTrigger.mutate({ id: t.id, is_enabled: v })} onSaved={() => qc.invalidateQueries({ queryKey: ["push", "triggers"] })} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* History */}
      <SectionCard title="History" desc="Recent sends, newest first.">
        {campaignsQuery.isLoading ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : (campaignsQuery.data || []).length === 0 ? (
          <p className="text-sm text-text-med">Nothing sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-med border-b border-border">
                  <th className="py-2 pr-3 font-semibold">When</th>
                  <th className="py-2 pr-3 font-semibold">Title</th>
                  <th className="py-2 pr-3 font-semibold">Source</th>
                  <th className="py-2 pr-3 font-semibold">Audience</th>
                  <th className="py-2 pr-3 font-semibold text-right">Sent</th>
                  <th className="py-2 font-semibold text-right">Failed</th>
                </tr>
              </thead>
              <tbody>
                {(campaignsQuery.data || []).map((c) => (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-text-med whitespace-nowrap">{relTime(c.created_at)}</td>
                    <td className="py-2 pr-3 font-medium truncate max-w-[160px]">{c.title}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.source === "broadcast" ? "bg-forest/10 text-forest" : "bg-coral/10 text-coral"}`}>
                        {c.source === "broadcast" ? "Broadcast" : c.source}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-text-med">{c.audience}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{c.sent_count ?? 0}</td>
                    <td className="py-2 text-right text-destructive">{c.failed_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

const COPY_FIELDS: { key: PromptCopyKey; label: string; type: "input" | "textarea" }[] = [
  { key: "pwa_install_title", label: "Install prompt · Title", type: "input" },
  { key: "pwa_install_body", label: "Install prompt · Body", type: "textarea" },
  { key: "pwa_install_cta", label: "Install prompt · Button", type: "input" },
  { key: "push_optin_title", label: "Push opt-in · Title", type: "input" },
  { key: "push_optin_body", label: "Push opt-in · Body", type: "textarea" },
  { key: "push_optin_cta", label: "Push opt-in · Allow button", type: "input" },
  { key: "push_optin_decline", label: "Push opt-in · Decline label", type: "input" },
];

function PromptCopyEditor({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSiteSettings();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings || seeded) return;
    const next: Record<string, string> = {};
    for (const f of COPY_FIELDS) next[f.key] = coercePromptValue(settings[f.key]) || PROMPT_COPY_DEFAULTS[f.key];
    setVals(next);
    setSeeded(true);
  }, [settings, seeded]);

  const save = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      // Store each as a plain string (jsonb) — matches the existing settings format.
      const rows = COPY_FIELDS.map((f) => ({ key: f.key, value: (vals[f.key] ?? "").trim() }));
      const { error } = await (supabase as any).from("site_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
      toast.success("Prompt copy saved.");
      qc.invalidateQueries({ queryKey: ["site_settings"] });
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (e: any) {
      toast.error(e?.message || "Could not save copy.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Prompt Copy" desc="Text shown on the install prompt and the push opt-in card. Leave blank to use the default.">
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : (
        <div className="space-y-3">
          {COPY_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs font-semibold text-text-med">{f.label}</label>
              {f.type === "textarea" ? (
                <Textarea
                  value={vals[f.key] ?? ""}
                  onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}
                  disabled={!canManage}
                  rows={2}
                  placeholder={PROMPT_COPY_DEFAULTS[f.key]}
                  className="text-sm"
                />
              ) : (
                <Input
                  value={vals[f.key] ?? ""}
                  onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}
                  disabled={!canManage}
                  placeholder={PROMPT_COPY_DEFAULTS[f.key]}
                  className="text-sm"
                />
              )}
            </div>
          ))}
          {canManage && (
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving} className="bg-forest hover:bg-forest/90">
                {saving ? "Saving…" : "Save copy"}
              </Button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function TriggerRow({ trigger, canManage, onToggle, onSaved }: { trigger: Trigger; canManage: boolean; onToggle: (v: boolean) => void; onSaved: () => void }) {
  const [titleT, setTitleT] = useState(trigger.title_template || "");
  const [bodyT, setBodyT] = useState(trigger.body_template || "");
  const [urlT, setUrlT] = useState(trigger.url_template || "");
  const [saving, setSaving] = useState(false);

  const dirty = titleT !== (trigger.title_template || "") || bodyT !== (trigger.body_template || "") || urlT !== (trigger.url_template || "");

  const save = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("push_triggers")
        .update({ title_template: titleT, body_template: bodyT, url_template: urlT })
        .eq("id", trigger.id);
      if (error) throw error;
      toast.success(`Saved “${trigger.label}”.`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Could not save trigger.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-forest">{trigger.label}</div>
          <div className="text-[10px] text-text-light font-mono">{trigger.trigger_key}</div>
        </div>
        <Switch checked={trigger.is_enabled} onCheckedChange={onToggle} disabled={!canManage} />
      </div>
      <Input placeholder="Title template" value={titleT} onChange={(e) => setTitleT(e.target.value)} disabled={!canManage} className="text-sm" />
      <Textarea placeholder="Body template" value={bodyT} onChange={(e) => setBodyT(e.target.value)} disabled={!canManage} rows={2} className="text-sm" />
      <Input placeholder="URL template (optional)" value={urlT} onChange={(e) => setUrlT(e.target.value)} disabled={!canManage} className="text-sm" />
      {canManage && dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving} className="bg-forest hover:bg-forest/90">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
