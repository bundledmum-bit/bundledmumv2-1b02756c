import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageCircle, Phone, StickyNote, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import FollowupReport from "@/components/admin/FollowupReport";

// Follow-up queue (route: /admin/followups). Reads the already-built
// quote_followup_queue() RPC, which schedules real DATES with overdue
// carry-forward and marks each contact via mark_followup_done() (the tick),
// which auto-schedules the next follow-up (gaps widen 1, 2, 3, 5, 7 days).
// Paid quotes are excluded server-side. All money is NAIRA integers (no /100).

interface FollowupRow {
  out_quote_id: string;
  out_quote_number: string;
  out_customer: string | null;
  out_phone: string | null;
  out_total: number | null;
  out_status: string | null;
  out_sent_at: string | null;
  out_days_since: number | null;
  out_due_date: string | null;          // date this follow-up is due
  out_days_overdue: number | null;      // 0 unless overdue
  out_bucket: string;                   // 'overdue' | 'today' | 'tomorrow' | 'later'
  out_kind: string;                     // 'chase_quote' | 'awaiting_payment'
  out_followup_no: number | null;       // how many follow-ups already done
  out_last_contact: string | null;
}

// An outcome rule from followup_outcome_rules(). The list is NEVER hardcoded —
// labels, and whether an outcome closes the quote, come from the RPC so they
// stay in sync with the backend.
interface OutcomeRule {
  outcome: string;
  label: string;
  next_gap_days: number | null;
  closes: boolean;
  closes_as: string | null;
}

// UI-only grouping so the picker scans well. Only the group membership lives
// here; every label/closes flag is read from the RPC. Any outcome the RPC
// returns that isn't listed here falls into an "Other" group so it is never
// dropped from the picker.
const OUTCOME_GROUPS: Array<{ title: string; codes: string[] }> = [
  { title: "No contact made", codes: ["call_not_picked", "number_unreachable", "wrong_number"] },
  {
    title: "Still in play",
    codes: [
      "call_back_later", "still_deciding", "wants_discount", "whatsapp_sent",
      "wants_revised_quote", "waiting_for_money", "delivery_far_off", "ready_to_order",
    ],
  },
  { title: "Closed", codes: ["ordered", "not_interested", "already_given_birth", "bought_elsewhere"] },
];

const fmtNaira = (n: number | null | undefined) => "₦" + Number(n || 0).toLocaleString("en-NG");
// wa.me needs digits only — strip +, spaces, dashes, brackets.
const waDigits = (phone: string | null | undefined) => String(phone || "").replace(/\D/g, "");
// Just opens the chat with that customer — NO pre-filled message (opening a chat
// is not the same as messaging someone).
const waLink = (phone: string | null | undefined) => `https://wa.me/${waDigits(phone)}`;
// tel: keeps the leading + and digits so it dials directly on mobile.
const telLink = (phone: string | null | undefined) => `tel:${String(phone || "").replace(/[^\d+]/g, "")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "";
  // A bare date ("2026-07-25") must be parsed as LOCAL midnight, not UTC, or it
  // can show the previous day in Nigeria's timezone.
  const dt = new Date(String(d).length <= 10 ? `${d}T00:00:00` : d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }).replace(",", "");
};

const sumValue = (arr: FollowupRow[]) => arr.reduce((s, r) => s + (Number(r.out_total) || 0), 0);

export default function AdminFollowups() {
  const { adminUser } = usePermissions();
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("today"); // DEFAULT: Follow Up Today

  // Per-row "Log / notes" form (only one open at a time).
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>(""); // empty until the admin picks one
  const [note, setNote] = useState<string>("");

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ["quote-followup-queue"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("quote_followup_queue");
      if (error) throw error;
      return (data || []) as FollowupRow[];
    },
    staleTime: 30_000,
  });

  // Outcome picker options come from the backend, never hardcoded.
  const { data: outcomeRules = [] } = useQuery({
    queryKey: ["followup-outcome-rules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("followup_outcome_rules");
      if (error) throw error;
      return (data || []) as OutcomeRule[];
    },
    staleTime: 10 * 60_000,
  });

  const ruleByOutcome = useMemo(() => {
    const m = new Map<string, OutcomeRule>();
    for (const r of outcomeRules) m.set(r.outcome, r);
    return m;
  }, [outcomeRules]);

  // Group the RPC rules for the picker; anything not in a known group falls into
  // "Other" so a newly-added backend outcome still appears.
  const groupedOutcomes = useMemo(() => {
    const used = new Set<string>();
    const groups = OUTCOME_GROUPS.map((g) => ({
      title: g.title,
      rules: g.codes.map((c) => ruleByOutcome.get(c)).filter(Boolean).map((r) => { used.add(r!.outcome); return r!; }),
    }));
    const leftover = outcomeRules.filter((r) => !used.has(r.outcome));
    if (leftover.length) groups.push({ title: "Other", rules: leftover });
    return groups.filter((g) => g.rules.length > 0);
  }, [outcomeRules, ruleByOutcome]);

  const selectedRule = outcome ? ruleByOutcome.get(outcome) : undefined;

  const overdueRows = useMemo(() => rows.filter((r) => r.out_bucket === "overdue"), [rows]);
  const todayRows = useMemo(() => rows.filter((r) => r.out_bucket === "today"), [rows]);
  const tomorrowRows = useMemo(() => rows.filter((r) => r.out_bucket === "tomorrow"), [rows]);
  const laterRows = useMemo(() => rows.filter((r) => r.out_bucket === "later"), [rows]);
  // Distinct future dates, ascending (ISO date strings sort chronologically).
  const laterDates = useMemo(
    () => [...new Set(laterRows.map((r) => r.out_due_date).filter(Boolean) as string[])].sort(),
    [laterRows],
  );

  // Tab order: Overdue (only when present) -> Today -> Tomorrow -> real dates ->
  // Report (always last).
  const tabs = useMemo(() => {
    const list: Array<{ key: string; label: string; count?: number; urgent?: boolean }> = [];
    if (overdueRows.length) list.push({ key: "overdue", label: "Overdue", count: overdueRows.length, urgent: true });
    list.push({ key: "today", label: "Follow Up Today", count: todayRows.length });
    list.push({ key: "tomorrow", label: "Tomorrow", count: tomorrowRows.length });
    for (const d of laterDates) list.push({ key: `date:${d}`, label: fmtDate(d), count: laterRows.filter((r) => r.out_due_date === d).length });
    list.push({ key: "report", label: "Report" });
    return list;
  }, [overdueRows, todayRows, tomorrowRows, laterRows, laterDates]);

  // If the selected tab vanished (e.g. its rows were all ticked), fall back to
  // Today, which is always present.
  const tabKeys = tabs.map((t) => t.key).join("|");
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab("today");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKeys]);

  const filtered = useMemo(() => {
    if (tab === "overdue") return overdueRows;
    if (tab === "tomorrow") return tomorrowRows;
    if (tab.startsWith("date:")) { const d = tab.slice(5); return laterRows.filter((r) => r.out_due_date === d); }
    return todayRows;
  }, [tab, overdueRows, todayRows, tomorrowRows, laterRows]);

  // Records the contact with a COMPULSORY outcome. The backend decides the next
  // date and any status change and returns a human-readable `message` we show
  // as-is. The frontend never computes dates or statuses.
  const doneMutation = useMutation({
    mutationFn: async (v: { quoteId: string; outcome: string; note?: string | null }) => {
      const { data, error } = await (supabase as any).rpc("mark_followup_done", {
        p_quote_id: v.quoteId,
        p_channel: "whatsapp",
        p_outcome: v.outcome,
        p_note: v.note?.trim() || null,
        p_by: adminUser?.email ?? adminUser?.id ?? null,
      });
      if (error) throw error;
      // The RPC signals business failures (e.g. missing outcome) via success:false.
      if (!data?.success) throw new Error(data?.error || "Could not update the follow-up.");
      return data as any;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Follow-up updated.");
      setOpenLogId(null);
      setNote("");
      setOutcome("");
      // Refetch so the card moves/disappears (or, for 'ordered', reappears
      // tomorrow as an awaiting-payment follow-up — the backend decides).
      qc.invalidateQueries({ queryKey: ["quote-followup-queue"] });
    },
    // On failure, leave the form open and the card unticked so the admin retries.
    onError: (e: any) => toast.error(e?.message || "Could not update the follow-up"),
  });

  // Ticking (or the Log/notes button) OPENS the feedback form; it never saves on
  // its own. Toggling it closed reverts the tick with nothing logged.
  const openLog = (id: string) => {
    setOpenLogId((cur) => (cur === id ? null : id));
    setOutcome("");
    setNote("");
  };

  // Record that the admin OPENED a chat / STARTED a call — an activity, not a
  // logged follow-up. Fire-and-forget: it never blocks the link, never
  // reschedules, never marks anything done, and never removes the card. Errors
  // are ignored silently.
  const logActivity = (quoteId: string, action: "whatsapp_opened" | "call_started") => {
    (supabase as any)
      .rpc("log_followup_activity", { p_quote_id: quoteId, p_action: action, p_by: adminUser?.email ?? adminUser?.id ?? null })
      .then(() => {}, () => {});
  };

  const activeUrgent = tab === "overdue";

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-foreground">Follow-ups</h1>
        <p className="text-sm text-text-med mt-0.5">
          Tick each quote once you have contacted the customer and the next follow-up schedules itself.
          Overdue quotes carry forward until they are ticked.
        </p>
        <div className="flex gap-3 mt-3">
          <div className="flex-1 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
            <div className="text-[11px] uppercase tracking-widest font-semibold text-destructive">Overdue</div>
            <div className="text-2xl font-bold text-destructive">{overdueRows.length}</div>
            <div className="text-[12px] font-mono-price text-destructive/80">{fmtNaira(sumValue(overdueRows))}</div>
          </div>
          <div className="flex-1 rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-widest font-semibold text-text-med">Follow up today</div>
            <div className="text-2xl font-bold text-foreground">{todayRows.length}</div>
            <div className="text-[12px] font-mono-price text-forest">{fmtNaira(sumValue(todayRows))}</div>
          </div>
        </div>
      </div>

      {/* Tabs — swipeable on mobile so many date tabs don't stack into rows. */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        {tabs.map((t) => {
          const active = t.key === tab;
          const base = "rounded-pill px-3 py-2 text-xs font-semibold border transition-colors whitespace-nowrap flex-shrink-0";
          const cls = t.urgent
            ? active
              ? "bg-destructive text-primary-foreground border-destructive"
              : "bg-destructive/10 text-destructive border-destructive/40 hover:bg-destructive/20"
            : active
              ? "bg-forest text-primary-foreground border-forest"
              : "bg-card text-foreground border-border hover:bg-muted";
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className={`${base} ${cls}`}>
              {t.urgent && <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
              {t.label}{t.count != null ? ` (${t.count})` : ""}
            </button>
          );
        })}
      </div>

      {tab === "report" && <FollowupReport />}

      {/* States */}
      {tab !== "report" && isLoading && (
        <div className="flex items-center gap-2 text-text-med text-sm py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading follow-up queue…
        </div>
      )}
      {tab !== "report" && isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 text-destructive text-sm p-4">
          Could not load the follow-up queue. {(error as any)?.message || ""}
        </div>
      )}
      {tab !== "report" && !isLoading && !isError && rows.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-lg font-semibold text-foreground mb-1">All caught up 🎉</p>
          <p className="text-sm text-text-med">No quotes are due a follow-up.</p>
        </div>
      )}
      {tab !== "report" && !isLoading && !isError && rows.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-med">Nothing in this list.</p>
        </div>
      )}

      {/* Rows */}
      {tab !== "report" && !isLoading && !isError && filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const isOpen = openLogId === r.out_quote_id;
            const overdueBy = Number(r.out_days_overdue) || 0;
            const awaitingPayment = r.out_kind === "awaiting_payment";
            const ticking = doneMutation.isPending && doneMutation.variables?.quoteId === r.out_quote_id;
            const hasPhone = !!waDigits(r.out_phone);
            return (
              <div
                key={r.out_quote_id}
                className={`rounded-xl border bg-card p-3.5 ${activeUrgent || overdueBy > 0 ? "border-destructive/40" : "border-border"}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  {/* Tick + customer info stay on one line; on mobile the action
                      buttons drop to a full-width row below (see below). */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* TICK — first thing on the card, before the name. Ticking
                      OPENS the outcome form; it never saves on its own. Shows as
                      ticked while the form is open (pending) and reverts on cancel. */}
                  <label className="flex-shrink-0 py-1 -my-1 pr-1" title="Log the outcome of this follow-up">
                    {ticking ? (
                      <Loader2 className="w-6 h-6 animate-spin text-forest" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={isOpen}
                        disabled={doneMutation.isPending}
                        onChange={() => openLog(r.out_quote_id)}
                        className="w-6 h-6 accent-forest cursor-pointer disabled:opacity-40"
                      />
                    )}
                  </label>

                  {/* Customer + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground truncate">{r.out_customer || "—"}</span>
                      {overdueBy > 0 && (
                        <span className="rounded-pill bg-destructive text-primary-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          Overdue by {overdueBy} day{overdueBy === 1 ? "" : "s"}
                        </span>
                      )}
                      {awaitingPayment && (
                        <span className="rounded-pill bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          Awaiting payment
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-text-med mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{r.out_phone || "no phone"}</span>
                      <span className="font-mono-price text-forest font-semibold">{fmtNaira(r.out_total)}</span>
                      <span>{r.out_days_since ?? "?"} day{r.out_days_since === 1 ? "" : "s"} since sent</span>
                      <Link to={`/admin/quotes?quote=${r.out_quote_id}`} className="inline-flex items-center gap-1 text-forest font-semibold hover:underline">
                        {r.out_quote_number} <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                  </div>

                  {/* Actions: Call -> WhatsApp -> Log/notes.
                      Full-width tap row on mobile; inline on the right on desktop. */}
                  <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-shrink-0">
                    {hasPhone && (
                      <a
                        href={telLink(r.out_phone)}
                        onClick={() => logActivity(r.out_quote_id, "call_started")}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-3 py-2.5 text-xs font-semibold hover:bg-forest-deep"
                      >
                        <Phone className="w-4 h-4" /> Call
                      </a>
                    )}
                    {hasPhone && (
                      <a
                        href={waLink(r.out_phone)}
                        onClick={() => logActivity(r.out_quote_id, "whatsapp_opened")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#25D366] text-white px-3 py-2.5 text-xs font-semibold hover:brightness-95"
                      >
                        <MessageCircle className="w-4 h-4" /> WhatsApp
                      </a>
                    )}
                    <button
                      onClick={() => openLog(r.out_quote_id)}
                      className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold border ${isOpen ? "bg-forest text-primary-foreground border-forest" : "bg-card text-foreground border-border hover:bg-muted"}`}
                    >
                      <StickyNote className="w-4 h-4" /> <span className="whitespace-nowrap">Log / notes</span>
                    </button>
                  </div>
                </div>

                {/* Feedback form — a compulsory outcome (from followup_outcome_rules)
                    plus an optional note, saved via mark_followup_done. */}
                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-border/70 space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                      <div className="sm:w-72">
                        <label className="block text-[10px] uppercase tracking-widest font-semibold text-text-med mb-1">
                          Outcome <span className="text-destructive">*</span>
                        </label>
                        <select
                          value={outcome}
                          onChange={(e) => setOutcome(e.target.value)}
                          className={`w-full border rounded-lg px-3 py-2 text-sm bg-background ${outcome ? "border-input" : "border-amber-300"}`}
                        >
                          <option value="" disabled>Choose an outcome…</option>
                          {groupedOutcomes.map((g) => (
                            <optgroup key={g.title} label={g.title}>
                              {g.rules.map((rule) => (
                                <option key={rule.outcome} value={rule.outcome}>
                                  {rule.label}{rule.closes ? " — closes quote" : ""}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] uppercase tracking-widest font-semibold text-text-med mb-1">Note (optional)</label>
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="What happened on this follow-up?"
                          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => doneMutation.mutate({ quoteId: r.out_quote_id, outcome, note })}
                          disabled={doneMutation.isPending || !outcome}
                          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
                        >
                          {ticking ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save"}
                        </button>
                        <button
                          onClick={() => { setOpenLogId(null); setOutcome(""); setNote(""); }}
                          disabled={doneMutation.isPending}
                          className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-text-med hover:bg-muted disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    {!outcome && (
                      <p className="text-[11px] text-amber-700">Choose an outcome to save this follow-up.</p>
                    )}
                    {selectedRule?.closes && (
                      <p className="text-[11px] text-destructive font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        This closes the quote{selectedRule.closes_as ? ` as ${selectedRule.closes_as.replace(/_/g, " ")}` : ""}.
                      </p>
                    )}
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
