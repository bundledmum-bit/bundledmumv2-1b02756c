import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageCircle, ClipboardCheck, ExternalLink, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

// Follow-up queue (route: /admin/followups). Reads the already-built
// quote_followup_queue() RPC (due-today quotes, highest value first, already
// excluding converted/paid/declined/paused/phone-less/logged stages) and logs
// contact via log_quote_followup(). All money is NAIRA integers (no /100).

interface FollowupRow {
  out_quote_id: string;
  out_quote_number: string;
  out_customer: string | null;
  out_phone: string | null;
  out_total: number | null;
  out_status: string | null;
  out_sent_at: string | null;
  out_days_since: number | null;
  out_due_stage: string; // 'day1' | 'day3' | 'day5' | 'day7'
  out_last_stage: string | null;
  out_last_contact: string | null;
}

const STAGES = [
  { key: "day1", label: "Day 1" },
  { key: "day3", label: "Day 3" },
  { key: "day5", label: "Day 5" },
  { key: "day7", label: "Day 7" },
] as const;

// SOP follow-up scripts, one per due stage. Pre-filled into WhatsApp; the human
// still presses send. Used verbatim.
const SOP_MESSAGES: Record<string, string> = {
  day1: "Hello ma, just checking if you have gone through the list and have any questions?",
  day3: "Good day ma, did you get a chance to look at your list? Happy to adjust anything or answer any questions.",
  day5: "Hello ma, are you ready to place your order? You can also start with Pay Small Small and pay a part now.",
  day7: "Good day ma, we have not heard from you. Are you still interested in the items? No pressure, just let me know either way.",
};

// log_quote_followup accepts exactly these outcomes. 'not_interested' and
// 'ordered' auto-pause future follow-ups server-side.
const OUTCOMES = [
  { value: "no_reply", label: "No reply" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "ordered", label: "Ordered" },
] as const;

const fmtNaira = (n: number | null | undefined) => "₦" + Number(n || 0).toLocaleString("en-NG");
const stageLabel = (stage: string) => STAGES.find((s) => s.key === stage)?.label || stage;
// wa.me needs digits only — strip +, spaces, dashes, brackets.
const waDigits = (phone: string | null | undefined) => String(phone || "").replace(/\D/g, "");
const waLink = (phone: string | null | undefined, stage: string) =>
  `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(SOP_MESSAGES[stage] || SOP_MESSAGES.day1)}`;

export default function AdminFollowups() {
  const { adminUser } = usePermissions();
  const qc = useQueryClient();
  const [stageFilter, setStageFilter] = useState<string>("all");

  // Per-row "Log follow-up" form (only one open at a time).
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

  const totalValue = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.out_total) || 0), 0),
    [rows],
  );

  const countByStage = useMemo(() => {
    const m: Record<string, number> = { day1: 0, day3: 0, day5: 0, day7: 0 };
    for (const r of rows) if (m[r.out_due_stage] != null) m[r.out_due_stage] += 1;
    return m;
  }, [rows]);

  const filtered = stageFilter === "all" ? rows : rows.filter((r) => r.out_due_stage === stageFilter);

  const logMutation = useMutation({
    mutationFn: async (v: { quoteId: string; stage: string; outcome: string; note: string }) => {
      const { error } = await (supabase as any).rpc("log_quote_followup", {
        p_quote_id: v.quoteId,
        p_stage: v.stage,
        p_channel: "whatsapp",
        p_note: v.note.trim() || null,
        p_outcome: v.outcome,
        p_by: adminUser?.email ?? adminUser?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up logged");
      setOpenLogId(null);
      setNote("");
      setOutcome("no_reply");
      // Refetch: the just-logged stage is now done, so the row drops out.
      qc.invalidateQueries({ queryKey: ["quote-followup-queue"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not log follow-up"),
  });

  const openLog = (id: string) => {
    setOpenLogId((cur) => (cur === id ? null : id));
    setOutcome("no_reply");
    setNote("");
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-foreground">Follow-ups</h1>
        <p className="text-sm text-text-med mt-0.5">
          Quotes due a follow-up today, highest value first. WhatsApp opens the SOP message pre-filled
          (you press send), then log the outcome.
        </p>
        <div className="flex flex-wrap gap-3 mt-3">
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-widest font-semibold text-text-med">Due today</div>
            <div className="text-2xl font-bold text-foreground">{rows.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-widest font-semibold text-text-med">Total value</div>
            <div className="text-2xl font-bold text-forest font-mono-price">{fmtNaira(totalValue)}</div>
          </div>
        </div>
      </div>

      {/* Stage filter with per-stage counts */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setStageFilter("all")}
          className={`rounded-pill px-3 py-1.5 text-xs font-semibold border ${stageFilter === "all" ? "bg-forest text-primary-foreground border-forest" : "bg-card text-foreground border-border hover:bg-muted"}`}
        >
          All ({rows.length})
        </button>
        {STAGES.map((s) => (
          <button
            key={s.key}
            onClick={() => setStageFilter(s.key)}
            className={`rounded-pill px-3 py-1.5 text-xs font-semibold border ${stageFilter === s.key ? "bg-forest text-primary-foreground border-forest" : "bg-card text-foreground border-border hover:bg-muted"}`}
          >
            {s.label} ({countByStage[s.key] ?? 0})
          </button>
        ))}
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
          <p className="text-sm text-text-med">No quotes are due a follow-up today.</p>
        </div>
      )}

      {/* Rows */}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const isOpen = openLogId === r.out_quote_id;
            return (
              <div key={r.out_quote_id} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  {/* Customer + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground truncate">{r.out_customer || "—"}</span>
                      <span className="rounded-pill bg-forest-light text-forest border border-forest/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                        {stageLabel(r.out_due_stage)}
                      </span>
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

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={waLink(r.out_phone, r.out_due_stage)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] text-white px-3 py-2 text-xs font-semibold hover:brightness-95"
                    >
                      <MessageCircle className="w-4 h-4" /> WhatsApp
                    </a>
                    <button
                      onClick={() => openLog(r.out_quote_id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border ${isOpen ? "bg-forest text-primary-foreground border-forest" : "bg-card text-foreground border-border hover:bg-muted"}`}
                    >
                      <ClipboardCheck className="w-4 h-4" /> Log follow-up
                    </button>
                  </div>
                </div>

                {/* Inline log form */}
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
                      onClick={() => logMutation.mutate({ quoteId: r.out_quote_id, stage: r.out_due_stage, outcome, note })}
                      disabled={logMutation.isPending}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
                    >
                      {logMutation.isPending && logMutation.variables?.quoteId === r.out_quote_id ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                      ) : (
                        "Save log"
                      )}
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
