import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageCircle, Phone, StickyNote, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

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

// mark_followup_done accepts exactly these outcomes; 'not_interested' and
// 'ordered' stop the chase server-side.
const OUTCOMES = [
  { value: "no_reply", label: "No reply" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "ordered", label: "Ordered" },
] as const;

// WhatsApp message templates. Chosen by out_kind, and the chase text varies by
// how many follow-ups have already gone out (out_followup_no). Pre-filled into
// WhatsApp; the human still presses send. Used verbatim.
const CHASE_EARLY = "Hello ma, just checking if you have gone through the list and have any questions?";
const CHASE_TWO = "Good day ma, did you get a chance to look at your list? Happy to adjust anything or answer any questions.";
const CHASE_THREE = "Hello ma, are you ready to place your order? You can also start with Pay Small Small and pay a part now.";
const CHASE_LATE = "Good day ma, we have not heard from you. Are you still interested in the items? No pressure, just let me know either way.";
const PAYMENT_MESSAGE = "Hello ma, thank you for your order. We are ready to process it as soon as your payment comes through. Would you like to pay in full or use Pay Small Small?";

function messageFor(kind: string, followupNo: number | null | undefined): string {
  if (kind === "awaiting_payment") return PAYMENT_MESSAGE;
  const n = Number(followupNo) || 0;
  if (n <= 1) return CHASE_EARLY;
  if (n === 2) return CHASE_TWO;
  if (n === 3) return CHASE_THREE;
  return CHASE_LATE;
}

const fmtNaira = (n: number | null | undefined) => "₦" + Number(n || 0).toLocaleString("en-NG");
// wa.me needs digits only — strip +, spaces, dashes, brackets.
const waDigits = (phone: string | null | undefined) => String(phone || "").replace(/\D/g, "");
const waLink = (phone: string | null | undefined, message: string) =>
  `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(message)}`;
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
  const [outcome, setOutcome] = useState<string>("no_reply");
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

  const overdueRows = useMemo(() => rows.filter((r) => r.out_bucket === "overdue"), [rows]);
  const todayRows = useMemo(() => rows.filter((r) => r.out_bucket === "today"), [rows]);
  const tomorrowRows = useMemo(() => rows.filter((r) => r.out_bucket === "tomorrow"), [rows]);
  const laterRows = useMemo(() => rows.filter((r) => r.out_bucket === "later"), [rows]);
  // Distinct future dates, ascending (ISO date strings sort chronologically).
  const laterDates = useMemo(
    () => [...new Set(laterRows.map((r) => r.out_due_date).filter(Boolean) as string[])].sort(),
    [laterRows],
  );

  // Tab order: Overdue (only when present) -> Today -> Tomorrow -> real dates.
  const tabs = useMemo(() => {
    const list: Array<{ key: string; label: string; count: number; urgent?: boolean }> = [];
    if (overdueRows.length) list.push({ key: "overdue", label: "Overdue", count: overdueRows.length, urgent: true });
    list.push({ key: "today", label: "Follow Up Today", count: todayRows.length });
    list.push({ key: "tomorrow", label: "Tomorrow", count: tomorrowRows.length });
    for (const d of laterDates) list.push({ key: `date:${d}`, label: fmtDate(d), count: laterRows.filter((r) => r.out_due_date === d).length });
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

  // THE TICK — logs the contact and auto-schedules the next follow-up. Also used
  // by the Log/notes form (with an outcome + note). 'not_interested'/'ordered'
  // stop the chase.
  const doneMutation = useMutation({
    mutationFn: async (v: { quoteId: string; outcome?: string | null; note?: string | null }) => {
      const { data, error } = await (supabase as any).rpc("mark_followup_done", {
        p_quote_id: v.quoteId,
        p_channel: "whatsapp",
        p_outcome: v.outcome ?? null,
        p_note: v.note?.trim() || null,
        p_by: adminUser?.email ?? adminUser?.id ?? null,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      if (data?.stopped) {
        toast.success(`Follow-ups stopped${data.reason ? ` (${String(data.reason).replace(/_/g, " ")})` : ""}.`);
      } else if (data?.next_followup_date) {
        toast.success(`Done. Next follow-up ${fmtDate(data.next_followup_date)}.`);
      } else {
        toast.success("Follow-up marked done.");
      }
      setOpenLogId(null);
      setNote("");
      setOutcome("no_reply");
      // Refetch: the ticked row is rescheduled and drops out of this bucket.
      qc.invalidateQueries({ queryKey: ["quote-followup-queue"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not update the follow-up"),
  });

  const openLog = (id: string) => {
    setOpenLogId((cur) => (cur === id ? null : id));
    setOutcome("no_reply");
    setNote("");
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
              {t.label} ({t.count})
            </button>
          );
        })}
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex items-center gap-2 text-text-med text-sm py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading follow-up queue…
        </div>
      )}
      {isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 text-destructive text-sm p-4">
          Could not load the follow-up queue. {(error as any)?.message || ""}
        </div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-lg font-semibold text-foreground mb-1">All caught up 🎉</p>
          <p className="text-sm text-text-med">No quotes are due a follow-up.</p>
        </div>
      )}
      {!isLoading && !isError && rows.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-med">Nothing in this list.</p>
        </div>
      )}

      {/* Rows */}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const isOpen = openLogId === r.out_quote_id;
            const overdueBy = Number(r.out_days_overdue) || 0;
            const awaitingPayment = r.out_kind === "awaiting_payment";
            const message = messageFor(r.out_kind, r.out_followup_no);
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
                  {/* TICK — first thing on the card, before the name. */}
                  <label className="flex-shrink-0 py-1 -my-1 pr-1" title="Mark this follow-up done (schedules the next one)">
                    {ticking ? (
                      <Loader2 className="w-6 h-6 animate-spin text-forest" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={doneMutation.isPending}
                        onChange={() => doneMutation.mutate({ quoteId: r.out_quote_id })}
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
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-3 py-2.5 text-xs font-semibold hover:bg-forest-deep"
                      >
                        <Phone className="w-4 h-4" /> Call
                      </a>
                    )}
                    {hasPhone && (
                      <a
                        href={waLink(r.out_phone, message)}
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

                {/* Inline log form — records an outcome + note via mark_followup_done. */}
                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-border/70 flex flex-col sm:flex-row gap-2 sm:items-end">
                    <div className="sm:w-44">
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-text-med mb-1">Outcome</label>
                      <select
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value)}
                        className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                      >
                        {OUTCOMES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
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
                    <button
                      onClick={() => doneMutation.mutate({ quoteId: r.out_quote_id, outcome, note })}
                      disabled={doneMutation.isPending}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
                    >
                      {ticking ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save & mark done"}
                    </button>
                  </div>
                )}
                {isOpen && (outcome === "not_interested" || outcome === "ordered") && (
                  <p className="text-[11px] text-text-med mt-1.5 italic">
                    Logging {outcome === "ordered" ? "\"Ordered\"" : "\"Not interested\""} stops future follow-ups for this quote.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
