import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

// Money is integer NAIRA — never /100.
const fmtNaira = (n: number | null | undefined) => "₦" + Number(n || 0).toLocaleString("en-NG");

const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Human duration from start→end (the view's picking_duration is an interval;
// computing here avoids parsing interval strings). "—" when not completed.
function durationStr(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const STALE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const isStale = (r: PickingHistoryRow) =>
  r.picking_status === "in_progress" && !!r.started_at &&
  Date.now() - new Date(r.started_at).getTime() > STALE_MS;
const isInProgress = (s: string | null) => s === "in_progress";

interface PickingHistoryRow {
  session_id: string;
  order_id: string;
  order_number: string | null;
  customer_name: string | null;
  order_status: string | null;
  payment_status: string | null;
  total: number | null;
  picking_status: string | null;
  started_by: string | null;
  picker_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  picking_duration: string | null;
  notes: string | null;
  item_count: number | null;
  picked_count: number | null;
}

function StatusBadge({ status }: { status: string | null }) {
  const inProg = isInProgress(status);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      inProg ? "bg-amber-100 text-amber-800" : "bg-[#2D6A4F]/10 text-[#2D6A4F]"}`}>
      {inProg ? "In progress" : (status || "completed").replace(/_/g, " ")}
    </span>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const complete = total > 0 && done >= total;
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <span className="tabular-nums text-xs whitespace-nowrap">{done} / {total}</span>
      <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <span className={`block h-full ${complete ? "bg-[#2D6A4F]" : "bg-[#F4845F]"}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

export default function AdminPickingHistory() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Super-admin gate (same self-contained pattern as AdminApprovals).
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) { setRole(null); setAuthReady(true); } return; }
      const { data } = await supabase.from("admin_users").select("role").eq("auth_user_id", user.id).maybeSingle();
      if (cancelled) return;
      setRole((data as any)?.role ?? null);
      setAuthReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "completed">("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["picking-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("picking_history" as any)
        .select("*")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as PickingHistoryRow[]) ?? [];
    },
    enabled: authReady && role === "super_admin",
    staleTime: 30_000,
  });

  const summary = useMemo(() => {
    const inProg = rows.filter(r => isInProgress(r.picking_status)).length;
    return { total: rows.length, inProg, completed: rows.length - inProg };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => statusFilter === "all"
        || (statusFilter === "in_progress" ? isInProgress(r.picking_status) : !isInProgress(r.picking_status)))
      .filter(r => {
        if (!q) return true;
        return (
          (r.order_number ?? "").toLowerCase().includes(q) ||
          (r.customer_name ?? "").toLowerCase().includes(q) ||
          (r.picker_name ?? "").toLowerCase().includes(q)
        );
      });
  }, [rows, statusFilter, search]);

  if (!authReady) {
    return <div className="flex justify-center py-20"><Skeleton className="h-8 w-48" /></div>;
  }
  if (role !== "super_admin") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/admin/picking">
          <Button className="h-10" variant="ghost" size="sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#2D6A4F]">Picking History</h1>
          <p className="text-sm text-muted-foreground">All order picking sessions across every order.</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Sessions", value: summary.total, cls: "" },
          { label: "In progress", value: summary.inProg, cls: "text-amber-700" },
          { label: "Completed", value: summary.completed, cls: "text-[#2D6A4F]" },
        ].map(c => (
          <div key={c.label} className="rounded-lg border border-border bg-card p-3 text-center">
            <div className={`text-lg font-bold ${c.cls}`}>{c.value}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-[180px] max-md:min-h-[44px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Search order #, customer, or picker…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-[300px] max-md:min-h-[44px]"
        />
        <span className="text-xs text-muted-foreground sm:ml-auto">{filtered.length} shown</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-10 text-center text-muted-foreground text-sm">
          {rows.length === 0 ? "No picking history yet." : "No sessions match your filters."}
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          {filtered.map(r => {
            const stale = isStale(r);
            return (
              <div key={r.session_id} onClick={() => navigate(`/admin/picking/${r.order_id}`)}
                className={`rounded-lg border p-3 active:bg-muted/50 cursor-pointer ${stale ? "border-amber-300 bg-amber-50/40" : "border-border bg-card"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{r.order_number || "—"}</p>
                    <p className="text-sm text-muted-foreground truncate">{r.customer_name || "—"}</p>
                  </div>
                  <StatusBadge status={r.picking_status} />
                </div>
                {stale && (
                  <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                    <AlertTriangle className="w-3 h-3" /> Stale — started over 3 days ago
                  </p>
                )}
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Picker</span><span className="font-medium">{r.picker_name || "Unknown"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Progress</span><Progress done={r.picked_count ?? 0} total={r.item_count ?? 0} /></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Started</span><span className="font-medium">{fmtDateTime(r.started_at)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Completed</span><span className="font-medium">{fmtDateTime(r.completed_at)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Duration</span><span className="font-medium">{durationStr(r.started_at, r.completed_at)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Total</span><span className="font-semibold">{fmtNaira(r.total)}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 sticky top-0 z-10">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="p-2">Order #</th>
                <th className="p-2">Status</th>
                <th className="p-2">Picker</th>
                <th className="p-2">Started</th>
                <th className="p-2">Completed</th>
                <th className="p-2">Progress</th>
                <th className="p-2">Duration</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const stale = isStale(r);
                return (
                  <tr key={r.session_id}
                    onClick={() => navigate(`/admin/picking/${r.order_id}`)}
                    className={`border-t border-border cursor-pointer hover:bg-muted/30 ${stale ? "bg-amber-50/50" : ""}`}>
                    <td className="p-2">
                      <div className="font-semibold flex items-center gap-1.5">
                        {r.order_number || "—"}
                        {stale && <span title="Stale — started over 3 days ago"><AlertTriangle className="w-3.5 h-3.5 text-amber-600" /></span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.customer_name || "—"}</div>
                    </td>
                    <td className="p-2"><StatusBadge status={r.picking_status} /></td>
                    <td className="p-2">{r.picker_name || "Unknown"}</td>
                    <td className="p-2 whitespace-nowrap">{fmtDateTime(r.started_at)}</td>
                    <td className="p-2 whitespace-nowrap">{fmtDateTime(r.completed_at)}</td>
                    <td className="p-2"><Progress done={r.picked_count ?? 0} total={r.item_count ?? 0} /></td>
                    <td className="p-2 whitespace-nowrap">{durationStr(r.started_at, r.completed_at)}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{fmtNaira(r.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
