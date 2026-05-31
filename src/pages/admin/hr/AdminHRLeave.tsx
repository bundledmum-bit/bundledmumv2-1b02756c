import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, XCircle, ChevronLeft, ChevronRight, Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import {
  useLeaveRequests, useLeaveBalances, useLeaveTypes, useHREmployees, useHRDepartments,
  useUpdateLeaveRequest, useApprovedLeavesInRange, usePublicHolidays,
  useLeaveCarryover, useProcessCarryover,
  STATUS_COLORS, MONTHS, type HRLeaveRequest,
} from "@/hooks/useHR";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

export default function AdminHRLeave() {
  const [tab, setTab] = useState<"pending" | "all" | "calendar" | "balances">("pending");
  return (
    <div className="space-y-3">
      <nav className="flex gap-1 border-b border-border">
        {[
          { k: "pending" as const,  label: "Pending approval" },
          { k: "all" as const,      label: "All requests" },
          { k: "calendar" as const, label: "Calendar" },
          { k: "balances" as const, label: "Leave balances" },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === t.k ? "border-forest text-forest" : "border-transparent text-text-med hover:text-forest"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "pending" && <PendingTab />}
      {tab === "all" && <AllRequestsTab />}
      {tab === "calendar" && <CalendarTab />}
      {tab === "balances" && <BalancesTab />}
    </div>
  );
}

function PendingTab() {
  const { data = [] } = useLeaveRequests();
  const pendingMgr = data.filter(r => r.status === "pending_manager");
  const pendingHr  = data.filter(r => r.status === "pending_hr");

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2">Awaiting manager approval ({pendingMgr.length})</h3>
        <div className="space-y-2">
          {pendingMgr.length === 0 && <p className="text-xs text-text-light">Nothing waiting on managers.</p>}
          {pendingMgr.map(r => <RequestCard key={r.id} request={r} stage="manager" />)}
        </div>
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2">Awaiting HR approval ({pendingHr.length})</h3>
        <div className="space-y-2">
          {pendingHr.length === 0 && <p className="text-xs text-text-light">Nothing waiting on HR.</p>}
          {pendingHr.map(r => <RequestCard key={r.id} request={r} stage="hr" />)}
        </div>
      </section>
    </div>
  );
}

function RequestCard({ request: r, stage }: { request: HRLeaveRequest; stage: "manager" | "hr" }) {
  const { adminUser } = usePermissions();
  const update = useUpdateLeaveRequest();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");

  const approve = async () => {
    const nowIso = new Date().toISOString();
    const payload: Partial<HRLeaveRequest> & { id: string } =
      stage === "manager"
        ? { id: r.id, manager_status: "approved", status: "pending_hr", manager_action_at: nowIso, manager_action_by: adminUser?.id || null }
        : { id: r.id, hr_status: "approved", status: "approved", hr_action_at: nowIso, hr_action_by: adminUser?.id || null };
    await update.mutateAsync(payload);
    toast.success("Approved");
  };

  const reject = async () => {
    if (!note.trim()) { toast.error("Rejection note is required."); return; }
    const nowIso = new Date().toISOString();
    const payload: Partial<HRLeaveRequest> & { id: string } =
      stage === "manager"
        ? { id: r.id, manager_status: "rejected", status: "rejected", manager_action_at: nowIso, manager_action_by: adminUser?.id || null, manager_notes: note, rejection_reason: note }
        : { id: r.id, hr_status: "rejected", status: "rejected", hr_action_at: nowIso, hr_action_by: adminUser?.id || null, hr_notes: note, rejection_reason: note };
    await update.mutateAsync(payload);
    toast.success("Rejected");
    setRejectOpen(false); setNote("");
  };

  return (
    <article className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{r.hr_employees?.full_name || "Employee"} <span className="text-text-light text-xs">({r.hr_employees?.employee_id})</span></div>
          <div className="text-xs text-text-med mt-0.5">{r.hr_leave_types?.name || "Leave"} · {r.start_date} → {r.end_date} · {Number(r.days_count).toFixed(1)} day{Number(r.days_count) === 1 ? "" : "s"}</div>
          {r.reason && <p className="text-xs text-text-med mt-1 leading-relaxed">"{r.reason}"</p>}
          <div className="text-[10px] text-text-light mt-1">Submitted {r.created_at ? new Date(r.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={approve} disabled={update.isPending} className="inline-flex items-center gap-1 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"><Check className="w-3.5 h-3.5" /> Approve</button>
          <button onClick={() => setRejectOpen(true)} disabled={update.isPending} className="inline-flex items-center gap-1 border border-destructive text-destructive px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-destructive/10"><XCircle className="w-3.5 h-3.5" /> Reject</button>
        </div>
      </div>

      {rejectOpen && (
        <div className="mt-3 border-t border-border pt-3">
          <label className={labelCls}>Reason / notes</label>
          <textarea rows={2} className={inputCls} value={note} onChange={e => setNote(e.target.value)} />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setRejectOpen(false); setNote(""); }} className="text-xs text-text-med hover:text-foreground px-2 py-1">Cancel</button>
            <button onClick={reject} disabled={update.isPending} className="bg-destructive text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-destructive/90 disabled:opacity-40">Confirm rejection</button>
          </div>
        </div>
      )}
    </article>
  );
}

function AllRequestsTab() {
  const { data = [] } = useLeaveRequests();
  const { data: employees = [] } = useHREmployees();
  const { data: leaveTypes = [] } = useLeaveTypes();
  const [empFilter, setEmpFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (empFilter && r.employee_id !== empFilter) return false;
      if (typeFilter && r.leave_type_id !== typeFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (from && r.end_date < from) return false;
      if (to && r.start_date > to) return false;
      return true;
    });
  }, [data, empFilter, typeFilter, statusFilter, from, to]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background">
          <option value="">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background">
          <option value="">All types</option>
          {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background">
          <option value="">All statuses</option>
          {["pending_manager","pending_hr","approved","rejected","cancelled"].map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background" />
        <span className="text-text-light text-xs">→</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Dates</th>
              <th className="px-3 py-2 text-right">Days</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{r.hr_employees?.full_name}</td>
                <td className="px-3 py-2">{r.hr_leave_types?.name}</td>
                <td className="px-3 py-2 text-text-light">{r.start_date} → {r.end_date}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(r.days_count).toFixed(1)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-pill text-[10px] font-semibold capitalize ${STATUS_COLORS[r.status] || "bg-muted text-text-med"}`}>{r.status.replace("_", " ")}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-text-light">No requests match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BalancesTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const { data = [] } = useLeaveBalances(year);
  const { data: departments = [] } = useHRDepartments();
  const { data: employees = [] } = useHREmployees();
  const [deptFilter, setDeptFilter] = useState("");
  const [empFilter, setEmpFilter] = useState("");
  const [editing, setEditing] = useState<{ id: string; value: number } | null>(null);
  const isPriorYear = year < now.getFullYear();

  // Carryover data for the current view year (shown as "carried from X" column).
  const { data: carryoverRows = [] } = useLeaveCarryover(year);
  const carryByEmpType = useMemo(() => {
    const m = new Map<string, { carried: number; from_year: number; expiry_date: string | null }>();
    for (const c of carryoverRows) {
      const k = `${c.employee_id}|${c.leave_type_id}`;
      m.set(k, { carried: Number(c.carried_days) || 0, from_year: c.from_year, expiry_date: c.expiry_date });
    }
    return m;
  }, [carryoverRows]);

  const visible = useMemo(() => {
    let rows = data;
    if (empFilter) rows = rows.filter(r => r.employee_id === empFilter);
    if (deptFilter) {
      const deptEmpIds = new Set(employees.filter(e => e.department_id === deptFilter).map(e => e.id));
      rows = rows.filter(r => deptEmpIds.has(r.employee_id));
    }
    return rows;
  }, [data, empFilter, deptFilter, employees]);

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await (supabase as any).from("hr_leave_balances").update({
      entitled_days: editing.value, updated_at: new Date().toISOString(),
    }).eq("id", editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Entitlement updated");
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      {isPriorYear && <CarryoverPanel fromYear={year} data={data.filter(b => /annual/i.test(b.hr_leave_types?.name || ""))} />}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value) || now.getFullYear())} className="w-24 border border-input rounded px-2 py-1 text-xs bg-background" />
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background">
          <option value="">All departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background">
          <option value="">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Leave type</th>
              <th className="px-3 py-2 text-right">Entitled</th>
              <th className="px-3 py-2 text-right">Carried from</th>
              <th className="px-3 py-2 text-right">Used</th>
              <th className="px-3 py-2 text-right">Pending</th>
              <th className="px-3 py-2 text-right">Remaining</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(b => {
              const remaining = Number(b.entitled_days) - Number(b.used_days) - Number(b.pending_days);
              const isEditing = editing?.id === b.id;
              const carry = carryByEmpType.get(`${b.employee_id}|${b.leave_type_id}`);
              return (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-3 py-2">{b.hr_employees?.full_name}</td>
                  <td className="px-3 py-2">{b.hr_leave_types?.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {isEditing ? (
                      <input type="number" min={0} step={0.5} value={editing!.value} onChange={e => setEditing({ id: editing!.id, value: Number(e.target.value) })} className="w-20 border border-input rounded px-2 py-0.5 text-xs bg-background" />
                    ) : Number(b.entitled_days).toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-light">
                    {carry ? (
                      <span title={carry.expiry_date ? `Expires ${carry.expiry_date}` : ""}>
                        +{carry.carried.toFixed(1)} <span className="text-[9px]">({carry.from_year})</span>
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(b.used_days).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(b.pending_days).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{remaining.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <>
                        <button onClick={saveEdit} className="text-forest font-semibold hover:underline mr-2">Save</button>
                        <button onClick={() => setEditing(null)} className="text-text-med hover:text-foreground">Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setEditing({ id: b.id, value: Number(b.entitled_days) })} className="text-forest font-semibold hover:underline">Edit entitlement</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-text-light">No balances.</td></tr>}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carry-over panel (shown when viewing a prior year)
// ---------------------------------------------------------------------------

function CarryoverPanel({ fromYear, data }: { fromYear: number; data: ReturnType<typeof useLeaveBalances>["data"] }) {
  const process = useProcessCarryover();
  const [maxDays] = useState(10);
  const toYear = fromYear + 1;

  const rows = useMemo(() => {
    const out: Array<{ employee: string; unused: number; willCarry: number }> = [];
    for (const b of (data || [])) {
      const unused = Math.max(0, Number(b.entitled_days) - Number(b.used_days) - Number(b.pending_days));
      if (unused <= 0) continue;
      out.push({
        employee: b.hr_employees?.full_name || "—",
        unused,
        willCarry: Math.min(unused, maxDays),
      });
    }
    return out.sort((a, b) => b.unused - a.unused);
  }, [data, maxDays]);

  const handleProcess = async () => {
    if (!confirm(`Carry unused annual leave from ${fromYear} → ${toYear}? Max ${maxDays} days each.`)) return;
    try {
      const result = await process.mutateAsync({ fromYear, maxCarryover: maxDays });
      toast.success(`${result.employees_processed} employee(s) had leave carried over to ${result.to_year ?? toYear}`);
    } catch (e: any) {
      toast.error(e?.message || "Carry-over failed");
    }
  };

  return (
    <section className="bg-amber-50/50 border border-amber-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-[11px] uppercase tracking-widest font-bold text-amber-800 inline-flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Annual leave carry-over</h3>
          <p className="text-xs text-amber-900 mt-0.5">Unused annual leave as of 31 Dec {fromYear}. Cap is {maxDays} days per employee.</p>
        </div>
        <button onClick={handleProcess} disabled={process.isPending || rows.length === 0} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
          <RefreshCw className="w-3.5 h-3.5" /> Process Carry-over to {toYear}
        </button>
      </div>
      <div className="overflow-x-auto bg-background rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 text-right">Unused days</th>
              <th className="px-3 py-2 text-right">Max carry-over</th>
              <th className="px-3 py-2 text-right">Will carry</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-text-light">No unused annual leave to carry over.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-2">{r.employee}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.unused.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{maxDays}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-forest">{r.willCarry.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Calendar tab — month grid with approved leaves + public holidays
// ---------------------------------------------------------------------------

const LEAVE_TYPE_COLORS: Array<{ key: RegExp; cls: string; short: string }> = [
  { key: /annual/i,    cls: "bg-emerald-100 text-emerald-800 border-emerald-300", short: "Annual" },
  { key: /sick/i,      cls: "bg-amber-100 text-amber-800 border-amber-300",       short: "Sick" },
  { key: /maternity/i, cls: "bg-pink-100 text-pink-800 border-pink-300",          short: "Maternity" },
  { key: /paternity/i, cls: "bg-sky-100 text-sky-800 border-sky-300",             short: "Paternity" },
  { key: /study/i,     cls: "bg-purple-100 text-purple-800 border-purple-300",    short: "Study" },
  { key: /comp/i,      cls: "bg-teal-100 text-teal-800 border-teal-300",          short: "Comp" },
  { key: /unpaid/i,    cls: "bg-gray-100 text-gray-700 border-gray-300",          short: "Unpaid" },
];
function leaveTypeStyle(name: string | null | undefined): { cls: string; short: string } {
  if (name) for (const m of LEAVE_TYPE_COLORS) if (m.key.test(name)) return { cls: m.cls, short: m.short };
  return { cls: "bg-forest/10 text-forest border-forest/30", short: (name || "Leave").slice(0, 8) };
}

function CalendarTab() {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [deptFilter, setDeptFilter] = useState("");
  const [popover, setPopover] = useState<HRLeaveRequest | null>(null);

  const startOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const endOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const startIso = iso(startOfMonth);
  const endIso = iso(endOfMonth);

  const { data: leaves = [] } = useApprovedLeavesInRange(startIso, endIso);
  const { data: holidays = [] } = usePublicHolidays(startIso, endIso);
  const { data: departments = [] } = useHRDepartments();
  const { data: employees = [] } = useHREmployees();

  const empDeptMap = useMemo(() => new Map(employees.map(e => [e.id, e.department_id])), [employees]);
  const visibleLeaves = useMemo(() => {
    if (!deptFilter) return leaves;
    return leaves.filter(l => empDeptMap.get(l.employee_id) === deptFilter);
  }, [leaves, deptFilter, empDeptMap]);

  // Build the grid (Mon–Sun), padding with prev/next month days.
  const gridCells = useMemo(() => {
    const cells: Array<{ date: Date; inMonth: boolean }> = [];
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last  = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const startWeekday = (first.getDay() + 6) % 7; // 0 = Mon
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), -i), inMonth: false });
    }
    cells.reverse();
    for (let d = 1; d <= last.getDate(); d++) cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d), inMonth: true });
    while (cells.length % 7 !== 0) {
      const d = new Date(cells[cells.length - 1].date);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }
    return cells;
  }, [cursor]);

  const holidaysByDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays) m.set(h.holiday_date, h.name);
    return m;
  }, [holidays]);

  const leavesByDate = useMemo(() => {
    const m = new Map<string, HRLeaveRequest[]>();
    for (const l of visibleLeaves) {
      const start = new Date(l.start_date + "T00:00:00");
      const end = new Date(l.end_date + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const k = iso(d);
        const list = m.get(k) || [];
        list.push(l);
        m.set(k, list);
      }
    }
    return m;
  }, [visibleLeaves]);

  const todayIso = iso(new Date());

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="w-8 h-8 rounded-lg border border-input hover:bg-muted inline-flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
            <div className="font-bold text-sm inline-flex items-center gap-1.5"><CalendarIcon className="w-4 h-4" /> {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</div>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="w-8 h-8 rounded-lg border border-input hover:bg-muted inline-flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))} className="text-xs font-semibold text-forest hover:underline">Today</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="border border-input rounded-lg px-2 py-1 text-xs bg-background">
              <option value="">All departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <div className="flex items-center gap-1.5 text-[10px]">
              {LEAVE_TYPE_COLORS.map(c => (
                <span key={c.short} className={`px-1.5 py-0.5 rounded-md border ${c.cls}`}>{c.short}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider font-semibold text-text-light border-b border-border">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => <div key={d} className="px-1 py-1.5">{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-px bg-border/40">
          {gridCells.map(({ date, inMonth }, idx) => {
            const key = iso(date);
            const dow = date.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const holidayName = holidaysByDate.get(key);
            const dayLeaves = leavesByDate.get(key) || [];
            const isToday = key === todayIso;
            return (
              <div
                key={idx}
                className={`bg-background min-h-[90px] p-1.5 text-xs relative ${!inMonth ? "opacity-40" : ""} ${isWeekend && inMonth ? "bg-muted/20" : ""} ${holidayName ? "bg-amber-50" : ""}`}
                title={holidayName || ""}
              >
                <div className={`flex items-center justify-between text-[11px] font-semibold ${isToday ? "text-forest" : "text-foreground"}`}>
                  <span className={isToday ? "w-5 h-5 rounded-full border border-forest inline-flex items-center justify-center" : ""}>{date.getDate()}</span>
                  {holidayName && <span className="text-[8px] text-amber-700 truncate max-w-[60%]" title={holidayName}>{holidayName}</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  {dayLeaves.slice(0, 3).map(l => {
                    const style = leaveTypeStyle(l.hr_leave_types?.name);
                    const initials = initialsFor(l.hr_employees?.full_name);
                    return (
                      <button key={l.id + key} onClick={() => setPopover(l)} className={`w-full text-left px-1 py-0.5 rounded border text-[9px] font-semibold truncate ${style.cls} hover:opacity-80`}>
                        {initials} – {style.short}
                      </button>
                    );
                  })}
                  {dayLeaves.length > 3 && (
                    <div className="text-[9px] text-text-light">+ {dayLeaves.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {popover && (
        <div className="fixed inset-0 z-40 bg-foreground/40 flex items-center justify-center p-4" onClick={() => setPopover(null)}>
          <div className="bg-card border border-border rounded-xl max-w-sm w-full p-4 space-y-1 text-sm" onClick={e => e.stopPropagation()}>
            <div className="font-bold">{popover.hr_employees?.full_name}</div>
            <div className="text-xs text-text-med">{popover.hr_leave_types?.name || "Leave"}</div>
            <div className="text-xs">{popover.start_date} → {popover.end_date}</div>
            <div className="text-xs text-text-light">{Number(popover.days_count).toFixed(1)} day{Number(popover.days_count) === 1 ? "" : "s"}</div>
            <div className="flex justify-end pt-1">
              <button onClick={() => setPopover(null)} className="text-xs text-forest font-semibold hover:underline">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function initialsFor(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(s => s[0]).join("").toUpperCase();
}
