import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, MessageCircle, Phone, ClipboardCheck } from "lucide-react";

// Follow-up REPORT tab. Reads followup_report_summary() (headline + activity
// counters) and followup_report() (one row per contact, each expandable to its
// full history). IMPORTANT wording: opening a chat or dialer is an ACTIVITY, not
// a follow-up. We only ever say "WhatsApp opened" / "Call started" here, never
// "messaged" or "contacted". A confirmed follow-up is one with a logged outcome.

interface ReportSummary {
  contacts: number;
  pipeline_value: number;
  not_started: number;
  in_progress: number;
  awaiting_payment: number;
  won: number;
  lost: number;
  won_value: number;
  lost_value: number;
  open_value: number;
  followups_logged: number;
  whatsapp_opened: number;
  calls_started: number;
  contacted_today: number;
}

interface HistoryEntry {
  at: string;
  type: "followup" | "activity";
  outcome?: string | null;
  channel?: string | null;
  note?: string | null;
  action?: string | null;
  by?: string | null;
}

interface ReportRow {
  out_quote_id: string;
  out_quote_number: string;
  out_customer: string | null;
  out_phone: string | null;
  out_total: number | null;
  out_status: string | null;
  out_sent_at: string | null;
  out_followups: number | null;
  out_wa_opened: number | null;
  out_calls_started: number | null;
  out_last_outcome: string | null;
  out_last_contact: string | null;
  out_next_followup: string | null;
  out_state: string;
  out_days_since_sent: number | null;
  out_history: HistoryEntry[] | null;
}

const fmtNaira = (n: number | null | undefined) => "₦" + Number(n || 0).toLocaleString("en-NG");
const humanize = (s: string | null | undefined) =>
  s ? String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(String(d).length <= 10 ? `${d}T00:00:00` : d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};
const fmtDateTime = (d: string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).replace(",", "");
};

// A click on WhatsApp/Call is an activity — phrased as opened/started, never "messaged".
const activityLabel = (action: string | null | undefined) =>
  action === "whatsapp_opened" ? "WhatsApp opened" : action === "call_started" ? "Call started" : humanize(action);

const STATE_META: Record<string, { label: string; cls: string }> = {
  won: { label: "Won", cls: "bg-forest-light text-forest border-forest/30" },
  awaiting_payment: { label: "Awaiting payment", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  in_progress: { label: "In progress", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  not_started: { label: "Not started", cls: "bg-muted text-text-med border-border" },
  lost: { label: "Lost", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};
const stateMeta = (s: string) => STATE_META[s] || { label: humanize(s), cls: "bg-muted text-text-med border-border" };

const STATE_FILTERS = [
  { key: "all", label: "All" },
  { key: "won", label: "Won" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "in_progress", label: "In progress" },
  { key: "not_started", label: "Not started" },
  { key: "lost", label: "Lost" },
] as const;

function StatCard({ label, value, sub, tone = "default" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneCls =
    tone === "good" ? "border-forest/30" : tone === "warn" ? "border-amber-300" : tone === "bad" ? "border-destructive/40" : "border-border";
  const valCls = tone === "good" ? "text-forest" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className={`rounded-xl border bg-card px-3 py-2.5 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-widest font-semibold text-text-med">{label}</div>
      <div className={`text-xl font-bold ${valCls}`}>{value}</div>
      {sub != null && <div className="text-[11px] text-text-med font-mono-price">{sub}</div>}
    </div>
  );
}

export default function FollowupReport() {
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: summary } = useQuery({
    queryKey: ["followup-report-summary"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("followup_report_summary");
      if (error) throw error;
      return (data || {}) as ReportSummary;
    },
    staleTime: 60_000,
  });

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ["followup-report"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("followup_report");
      if (error) throw error;
      return (data || []) as ReportRow[];
    },
    staleTime: 60_000,
  });

  const filteredSorted = useMemo(() => {
    const base = stateFilter === "all" ? rows : rows.filter((r) => r.out_state === stateFilter);
    return [...base].sort((a, b) => {
      const d = (Number(a.out_total) || 0) - (Number(b.out_total) || 0);
      return sortDir === "desc" ? -d : d;
    });
  }, [rows, stateFilter, sortDir]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const s = summary;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <StatCard label="Contacts" value={s?.contacts ?? 0} />
          <StatCard label="Pipeline value" value={<span className="font-mono-price">{fmtNaira(s?.pipeline_value)}</span>} sub={`Open ${fmtNaira(s?.open_value)}`} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
          <StatCard label="Won" value={s?.won ?? 0} sub={fmtNaira(s?.won_value)} tone="good" />
          <StatCard label="Awaiting payment" value={s?.awaiting_payment ?? 0} tone="warn" />
          <StatCard label="In progress" value={s?.in_progress ?? 0} />
          <StatCard label="Not started" value={s?.not_started ?? 0} />
          <StatCard label="Lost" value={s?.lost ?? 0} sub={fmtNaira(s?.lost_value)} tone="bad" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Follow-ups logged" value={s?.followups_logged ?? 0} />
          <StatCard label="WhatsApp opened" value={s?.whatsapp_opened ?? 0} />
          <StatCard label="Calls started" value={s?.calls_started ?? 0} />
          <StatCard label="Contacted today" value={s?.contacted_today ?? 0} />
        </div>
      </div>

      {/* Filter + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          {STATE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStateFilter(f.key)}
              className={`rounded-pill px-3 py-1.5 text-xs font-semibold border whitespace-nowrap flex-shrink-0 ${stateFilter === f.key ? "bg-forest text-primary-foreground border-forest" : "bg-card text-foreground border-border hover:bg-muted"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
          className="ml-auto rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
        >
          Value {sortDir === "desc" ? "↓ high to low" : "↑ low to high"}
        </button>
      </div>

      {/* Rows */}
      {isLoading && (
        <div className="flex items-center gap-2 text-text-med text-sm py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading report…
        </div>
      )}
      {isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 text-destructive text-sm p-4">
          Could not load the report. {(error as any)?.message || ""}
        </div>
      )}
      {!isLoading && !isError && filteredSorted.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-text-med">
          No contacts in this view.
        </div>
      )}

      {!isLoading && !isError && filteredSorted.length > 0 && (
        <div className="space-y-2">
          {filteredSorted.map((r) => {
            const isOpen = expanded.has(r.out_quote_id);
            const meta = stateMeta(r.out_state);
            const history = Array.isArray(r.out_history) ? r.out_history : [];
            return (
              <div key={r.out_quote_id} className="rounded-xl border border-border bg-card">
                {/* Summary row */}
                <button
                  type="button"
                  onClick={() => toggle(r.out_quote_id)}
                  className="w-full text-left p-3.5 flex items-start gap-3"
                >
                  <span className="pt-0.5 flex-shrink-0 text-text-med">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground truncate">{r.out_customer || "—"}</span>
                      <span className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <div className="text-[12px] text-text-med mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{r.out_phone || "no phone"}</span>
                      <span className="font-mono-price text-forest font-semibold">{fmtNaira(r.out_total)}</span>
                      <span>{r.out_days_since_sent ?? "?"} day{r.out_days_since_sent === 1 ? "" : "s"} since sent</span>
                    </div>
                    {/* Metrics */}
                    <div className="text-[11px] text-text-med mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="inline-flex items-center gap-1"><ClipboardCheck className="w-3 h-3 text-forest" /> {r.out_followups ?? 0} follow-up{r.out_followups === 1 ? "" : "s"} logged</span>
                      <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3 text-[#25D366]" /> {r.out_wa_opened ?? 0} WhatsApp opened</span>
                      <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3 text-forest" /> {r.out_calls_started ?? 0} call{r.out_calls_started === 1 ? "" : "s"} started</span>
                    </div>
                    <div className="text-[11px] text-text-med mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Last outcome: <span className="text-foreground font-medium">{r.out_last_outcome ? humanize(r.out_last_outcome) : "—"}</span></span>
                      <span>Last contact: {fmtDateTime(r.out_last_contact)}</span>
                      <span>Next follow-up: {r.out_next_followup ? fmtDate(r.out_next_followup) : "—"}</span>
                    </div>
                  </div>
                  <Link
                    to={`/admin/quotes?quote=${r.out_quote_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-forest text-[12px] font-semibold hover:underline"
                  >
                    {r.out_quote_number} <ExternalLink className="w-3 h-3" />
                  </Link>
                </button>

                {/* History */}
                {isOpen && (
                  <div className="px-3.5 pb-3.5 -mt-1">
                    <div className="border-t border-border/70 pt-2.5">
                      {history.length === 0 ? (
                        <p className="text-[12px] text-text-med italic">No history yet.</p>
                      ) : (
                        <ol className="space-y-2">
                          {history.map((h, i) => {
                            const isActivity = h.type === "activity";
                            return (
                              <li key={i} className="flex items-start gap-2 text-[12px]">
                                <span
                                  className={`mt-0.5 flex-shrink-0 rounded-pill px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border ${isActivity ? "bg-muted text-text-med border-border" : "bg-forest-light text-forest border-forest/30"}`}
                                >
                                  {isActivity ? "Activity" : "Follow-up"}
                                </span>
                                <div className="flex-1 min-w-0">
                                  {isActivity ? (
                                    <span className="text-foreground">{activityLabel(h.action)}</span>
                                  ) : (
                                    <span className="text-foreground font-medium">
                                      {humanize(h.outcome) || "Follow-up logged"}
                                      {h.channel ? <span className="text-text-med font-normal"> · {humanize(h.channel)}</span> : null}
                                    </span>
                                  )}
                                  {h.note ? <div className="text-text-med italic">“{h.note}”</div> : null}
                                  <div className="text-text-med text-[11px]">
                                    {fmtDateTime(h.at)}{h.by ? ` · ${h.by}` : ""}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
