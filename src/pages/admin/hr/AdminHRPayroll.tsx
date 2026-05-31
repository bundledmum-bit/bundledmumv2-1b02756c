import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { X, Save, CheckCircle2, Wallet, Calendar, History, ChevronDown, ChevronRight, Trash2, Undo2, Pencil, AlertCircle } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import {
  useHREmployees, usePayrollRuns, useUpsertPayrollRun,
  useApprovePayrollRun, useMarkPayrollPaid, useRejectPayrollRun, useDeletePayrollRun,
  calculateEmployeePayroll, type PayrollCalculation,
  fmtN, fromKobo, toKobo, MONTHS,
  type HREmployee, type HRPayrollRun,
} from "@/hooks/useHR";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";
const btnPrimary = "inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40";

// Payroll-specific status colors (draft grey / approved blue / paid green).
const PAYROLL_STATUS_COLORS: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  approved: "bg-blue-100 text-blue-700",
  paid:     "bg-emerald-100 text-emerald-700",
};
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold capitalize ${PAYROLL_STATUS_COLORS[status] || "bg-muted text-text-med"}`}>
      {status}
    </span>
  );
}

export default function AdminHRPayroll() {
  const now = new Date();
  const [tab, setTab] = useState<"run" | "history">("run");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: employees = [] } = useHREmployees();
  const activeEmployees = employees.filter(e => e.status === "active");
  const { data: runs = [] } = usePayrollRuns(year, month);
  const { data: allRuns = [] } = usePayrollRuns();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
          <button onClick={() => setTab("run")} className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 ${tab === "run" ? "bg-card font-semibold" : ""}`}>
            <Wallet className="w-3.5 h-3.5" /> Monthly run
          </button>
          <button onClick={() => setTab("history")} className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 ${tab === "history" ? "bg-card font-semibold" : ""}`}>
            <History className="w-3.5 h-3.5" /> History
          </button>
        </div>

        {tab === "run" && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-text-light" />
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-input rounded-lg px-2 py-1.5 text-xs bg-background">
              {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
            </select>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-24 border border-input rounded-lg px-2 py-1.5 text-xs bg-background" />
          </div>
        )}
      </div>

      {tab === "run" && (
        <MonthlyRunView year={year} month={month} activeEmployees={activeEmployees} runs={runs} />
      )}
      {tab === "history" && <HistoryView runs={allRuns} employees={employees} />}
    </div>
  );
}

function MonthlyRunView({ year, month, activeEmployees, runs }: {
  year: number; month: number; activeEmployees: HREmployee[]; runs: HRPayrollRun[];
}) {
  const { adminUser, can } = usePermissions();
  const approve = useApprovePayrollRun();
  const reject = useRejectPayrollRun();
  const del = useDeletePayrollRun();
  const markPaid = useMarkPayrollPaid();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ run?: HRPayrollRun; employee: HREmployee } | null>(null);
  const [paying, setPaying] = useState<HRPayrollRun | null>(null);

  const rows = useMemo(() => {
    return activeEmployees.map(emp => {
      const run = runs.find(r => r.employee_id === emp.id);
      return { emp, run };
    });
  }, [activeEmployees, runs]);

  const summary = useMemo(() => {
    const counts = { draft: 0, approved: 0, paid: 0 };
    let totalPaid = 0;
    for (const r of runs) {
      if (r.status in counts) counts[r.status as keyof typeof counts] += 1;
      if (r.status === "paid") totalPaid += Number(r.net_salary) || 0;
    }
    return { ...counts, totalPaid };
  }, [runs]);

  const handleApprove = async (run: HRPayrollRun) => {
    try { await approve.mutateAsync({ id: run.id, approvedBy: adminUser?.id || null }); toast.success("Approved"); }
    catch (e: any) { toast.error(e?.message || "Approve failed"); }
  };
  const handleReject = async (run: HRPayrollRun) => {
    if (!confirm("Revert this approved payroll back to draft?")) return;
    try { await reject.mutateAsync({ id: run.id }); toast.success("Reverted to draft"); }
    catch (e: any) { toast.error(e?.message || "Reject failed"); }
  };
  const handleDelete = async (run: HRPayrollRun) => {
    if (!confirm("Delete this draft payroll run? This cannot be undone.")) return;
    try { await del.mutateAsync(run.id); toast.success("Draft deleted"); }
    catch (e: any) { toast.error(e?.message || "Delete failed"); }
  };

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl px-4 py-2.5 text-xs flex items-center gap-4 flex-wrap">
        <span><b className="tabular-nums">{summary.draft}</b> <span className="text-text-light">Draft</span></span>
        <span className="text-text-light">·</span>
        <span><b className="tabular-nums">{summary.approved}</b> <span className="text-text-light">Approved</span></span>
        <span className="text-text-light">·</span>
        <span><b className="tabular-nums">{summary.paid}</b> <span className="text-text-light">Paid</span></span>
        <span className="ml-auto text-text-light">Total payroll (paid): <b className="tabular-nums text-foreground">{fmtN(summary.totalPaid)}</b></span>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0 z-10">
              <tr className="text-left">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Dept</th>
                <th className="px-3 py-2 text-right">Gross</th>
                <th className="px-3 py-2 text-right">Deductions</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ emp, run }) => (
                <tr key={emp.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-text-med">{emp.employee_id}</td>
                  <td className="px-3 py-2 font-semibold">{emp.full_name}</td>
                  <td className="px-3 py-2">{emp.hr_departments?.name || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{run ? fmtN(run.gross_salary) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{run ? fmtN(run.total_deductions) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{run ? fmtN(run.net_salary) : "—"}</td>
                  <td className="px-3 py-2">
                    {run ? (
                      <div className="flex items-center gap-1">
                        <StatusBadge status={run.status} />
                        {run.status === "paid" && run.notification_sent && (
                          <span className="text-[10px] text-emerald-700 font-semibold">· Payslip sent</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-light text-[10px]">No run</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!run && (
                      <button onClick={() => setEditing({ employee: emp })} className="text-forest text-xs font-semibold hover:underline">Create run</button>
                    )}
                    {run && run.status === "draft" && can("finance", "edit_payroll") && (
                      <div className="inline-flex items-center gap-2">
                        <button onClick={() => setEditing({ run, employee: emp })} className="inline-flex items-center gap-1 text-forest text-xs font-semibold hover:underline"><Pencil className="w-3 h-3" /> Edit</button>
                        <button onClick={() => handleApprove(run)} className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-600 text-white px-2.5 py-1 rounded-md hover:bg-blue-700">Approve</button>
                        <button onClick={() => handleDelete(run)} className="inline-flex items-center gap-1 text-destructive text-xs font-semibold hover:underline"><Trash2 className="w-3 h-3" /> Delete</button>
                      </div>
                    )}
                    {run && run.status === "approved" && (
                      <div className="inline-flex items-center gap-2">
                        <button onClick={() => setPaying(run)} className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-600 text-white px-2.5 py-1 rounded-md hover:bg-emerald-700"><CheckCircle2 className="w-3 h-3" /> Mark as Paid</button>
                        <button onClick={() => handleReject(run)} className="inline-flex items-center gap-1 border border-input text-xs font-semibold px-2.5 py-1 rounded-md hover:bg-muted"><Undo2 className="w-3 h-3" /> Reject</button>
                      </div>
                    )}
                    {run && run.status === "paid" && (
                      <span className="text-emerald-700 text-[10px] font-semibold">
                        Paid {run.payment_date || ""}{run.payment_method ? ` · ${run.payment_method.replace("_", " ")}` : ""}{run.payment_reference ? ` · ${run.payment_reference}` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-text-light">No active employees for this month.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <PayrollEntryModal
          employee={editing.employee}
          run={editing.run}
          year={year}
          month={month}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["hr-payroll"] });
            setEditing(null);
          }}
        />
      )}

      {paying && (
        <MarkPaidModal
          run={paying}
          onClose={() => setPaying(null)}
          onConfirm={payload => markPaid.mutateAsync({
            id: paying.id,
            paidBy: adminUser?.id || null,
            paymentMethod: payload.method,
            paymentReference: payload.ref || null,
            paymentDate: payload.date,
          } as any)
            .then(() => { toast.success("Marked paid · payslip email queued"); setPaying(null); })
            .catch(e => toast.error(e?.message || "Failed"))}
          busy={markPaid.isPending}
        />
      )}
    </div>
  );
}

function HistoryView({ runs, employees }: { runs: HRPayrollRun[]; employees: HREmployee[] }) {
  const [empFilter, setEmpFilter] = useState("");
  const [yearFilter, setYearFilter] = useState<number | "">("");
  const [monthFilter, setMonthFilter] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    return runs.filter(r => {
      if (empFilter && r.employee_id !== empFilter) return false;
      if (yearFilter && r.pay_year !== yearFilter) return false;
      if (monthFilter && r.pay_month !== monthFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      return true;
    });
  }, [runs, empFilter, yearFilter, monthFilter, statusFilter]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background">
          <option value="">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
        <select value={String(monthFilter)} onChange={e => setMonthFilter(e.target.value === "" ? "" : Number(e.target.value))} className="border border-input rounded px-2 py-1 text-xs bg-background">
          <option value="">All months</option>
          {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
        </select>
        <input type="number" placeholder="Year" value={yearFilter || ""} onChange={e => setYearFilter(e.target.value ? Number(e.target.value) : "")} className="w-24 border border-input rounded px-2 py-1 text-xs bg-background" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-input rounded px-2 py-1 text-xs bg-background">
          <option value="">All statuses</option>
          {["draft","approved","paid"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2 text-right">Gross</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Paid on</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-semibold">{r.hr_employees?.full_name || r.employee_id}</td>
                <td className="px-3 py-2">{MONTHS[r.pay_month - 1]} {r.pay_year}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(r.gross_salary)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtN(r.net_salary)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-text-light">{r.payment_date || "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-text-light">No payroll runs match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payroll entry modal with DB auto-calc + overrides + tax breakdown
// ---------------------------------------------------------------------------

type FieldKey =
  | "basic" | "housing" | "transport" | "other"
  | "emp_pension" | "nhf" | "paye"
  | "er_pension" | "nsitf" | "itf";

function PayrollEntryModal({ employee, run, year, month, onClose, onSaved }: {
  employee: HREmployee;
  run?: HRPayrollRun;
  year: number;
  month: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useUpsertPayrollRun();
  const isEdit = !!run;

  // All field values stored as NAIRA numbers for display; converted ×100 on save.
  const [v, setV] = useState({
    basic: fromKobo(run?.basic_salary),
    housing: fromKobo(run?.housing_allowance),
    transport: fromKobo(run?.transport_allowance),
    other: fromKobo(run?.other_allowances),
    bonus: fromKobo(run?.bonus),
    emp_pension: fromKobo(run?.employee_pension),
    nhf: fromKobo(run?.nhf_deduction),
    paye: fromKobo(run?.paye_tax),
    er_pension: fromKobo(run?.employer_pension),
    nsitf: fromKobo(run?.nsitf),
    itf: fromKobo(run?.itf),
    notes: run?.notes || "",
  });

  // Computed values (always read-only) — derived from the RPC result or
  // recomputed locally when the user has manually overridden components.
  const [grossNaira, setGrossNaira] = useState<number>(fromKobo(run?.gross_salary));
  const [totalDedNaira, setTotalDedNaira] = useState<number>(fromKobo(run?.total_deductions));
  const [netNaira, setNetNaira] = useState<number>(fromKobo(run?.net_salary));
  const [erCostNaira, setErCostNaira] = useState<number>(fromKobo(run?.total_employer_cost));

  // Track which fields the user has manually overridden so we stop
  // auto-recalculating them when bonus changes.
  const [overrides, setOverrides] = useState<Set<FieldKey>>(new Set());

  // Tax breakdown block from the RPC.
  const [calc, setCalc] = useState<PayrollCalculation | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Fetch the DB calculation when the modal mounts (for new runs) and on
  // every bonus change (both new + edit). On an edit, the initial mount
  // skips the fetch so saved values aren't clobbered — the fetch only fires
  // once the user actually moves the bonus input.
  const [mountedOnce, setMountedOnce] = useState(false);
  useEffect(() => {
    // On edit, skip the very first effect run — use saved values.
    if (isEdit && !mountedOnce) { setMountedOnce(true); return; }
    let mounted = true;
    const fetchCalc = async () => {
      setCalcLoading(true);
      try {
        const bonusKobo = toKobo(v.bonus);
        const data = await calculateEmployeePayroll(employee.id, bonusKobo);
        if (!mounted) return;
        setCalc(data);
        setV(prev => ({
          ...prev,
          basic:        overrides.has("basic")        ? prev.basic        : Math.round(data.basic_salary),
          housing:      overrides.has("housing")      ? prev.housing      : Math.round(data.housing_allowance),
          transport:    overrides.has("transport")    ? prev.transport    : Math.round(data.transport_allowance),
          other:        overrides.has("other")        ? prev.other        : Math.round(data.other_allowances),
          emp_pension:  overrides.has("emp_pension")  ? prev.emp_pension  : Math.round(data.employee_pension),
          nhf:          overrides.has("nhf")          ? prev.nhf          : Math.round(data.nhf_deduction),
          paye:         overrides.has("paye")         ? prev.paye         : Math.round(data.paye_tax),
          er_pension:   overrides.has("er_pension")   ? prev.er_pension   : Math.round(data.employer_pension),
          nsitf:        overrides.has("nsitf")        ? prev.nsitf        : Math.round(data.nsitf),
          itf:          overrides.has("itf")          ? prev.itf          : Math.round(data.itf),
        }));
        setGrossNaira(Math.round(data.gross_salary));
        setTotalDedNaira(Math.round(data.total_deductions));
        setNetNaira(Math.round(data.net_salary));
        setErCostNaira(Math.round(data.total_employer_cost));
      } catch (e: any) {
        if (mounted) toast.error(e?.message || "Could not calculate payroll.");
      } finally {
        if (mounted) setCalcLoading(false);
      }
    };
    fetchCalc();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee.id, v.bonus]);

  // If user manually overrides any component, recompute totals locally.
  useEffect(() => {
    const gross = v.basic + v.housing + v.transport + v.other + v.bonus;
    const totalDed = v.emp_pension + v.nhf + v.paye;
    const net = gross - totalDed;
    const erCost = gross + v.er_pension + v.nsitf + v.itf;
    setGrossNaira(gross);
    setTotalDedNaira(totalDed);
    setNetNaira(net);
    setErCostNaira(erCost);
  }, [v.basic, v.housing, v.transport, v.other, v.bonus, v.emp_pension, v.nhf, v.paye, v.er_pension, v.nsitf, v.itf]);

  const setField = (k: FieldKey, x: number) => {
    setV(prev => ({ ...prev, [k]: x }));
    setOverrides(prev => {
      const next = new Set(prev);
      next.add(k);
      return next;
    });
  };

  const save = async () => {
    try {
      await upsert.mutateAsync({
        ...(run?.id ? { id: run.id } : {}),
        employee_id: employee.id,
        pay_month: month,
        pay_year: year,
        basic_salary: toKobo(v.basic),
        housing_allowance: toKobo(v.housing),
        transport_allowance: toKobo(v.transport),
        other_allowances: toKobo(v.other),
        bonus: toKobo(v.bonus),
        employee_pension: toKobo(v.emp_pension),
        nhf_deduction: toKobo(v.nhf),
        paye_tax: toKobo(v.paye),
        other_deductions: 0,
        employer_pension: toKobo(v.er_pension),
        nsitf: toKobo(v.nsitf),
        itf: toKobo(v.itf),
        notes: v.notes.trim() || null,
        status: run?.status || "draft",
      } as any);
      toast.success("Payroll run saved");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[92svh] overflow-y-auto max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h3 className="font-bold text-sm">{isEdit ? "Edit" : "Create"} payroll run</h3>
            <p className="text-[10px] text-text-light">{employee.full_name} · {MONTHS[month - 1]} {year}{calcLoading ? " · calculating…" : ""}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {overrides.size > 0 && (
            <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2 py-1.5 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Manually adjusted fields will not auto-recalculate when bonus changes.
            </div>
          )}

          <section>
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2">Income (₦) — from employee salary defaults + bonus</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
              <Num label="Basic"     fieldKey="basic"     v={v.basic}     overridden={overrides.has("basic")}     onChange={x => setField("basic", x)} />
              <Num label="Housing"   fieldKey="housing"   v={v.housing}   overridden={overrides.has("housing")}   onChange={x => setField("housing", x)} />
              <Num label="Transport" fieldKey="transport" v={v.transport} overridden={overrides.has("transport")} onChange={x => setField("transport", x)} />
              <Num label="Other"     fieldKey="other"     v={v.other}     overridden={overrides.has("other")}     onChange={x => setField("other", x)} />
              <div>
                <label className={labelCls}>Bonus</label>
                <input type="number" min={0} value={v.bonus} onChange={e => setV(prev => ({ ...prev, bonus: Number(e.target.value) || 0 }))} className={inputCls} />
              </div>
            </div>
            <p className="text-[11px] text-text-light mt-1">Gross (auto): <b className="tabular-nums text-foreground">₦{grossNaira.toLocaleString()}</b></p>
          </section>

          <section>
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2">Deductions (₦) — Nigerian PAYE / pension / NHF</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              <Num label="PAYE tax"          fieldKey="paye"        v={v.paye}        overridden={overrides.has("paye")}        onChange={x => setField("paye", x)} />
              <Num label="Employee pension" fieldKey="emp_pension"  v={v.emp_pension} overridden={overrides.has("emp_pension")} onChange={x => setField("emp_pension", x)} />
              <Num label="NHF"              fieldKey="nhf"          v={v.nhf}         overridden={overrides.has("nhf")}         onChange={x => setField("nhf", x)} />
            </div>
            <p className="text-[11px] text-text-light mt-1">
              Total deductions (auto): <b className="tabular-nums text-foreground">₦{totalDedNaira.toLocaleString()}</b>
              {" · "}Net (auto): <b className="tabular-nums text-forest">₦{netNaira.toLocaleString()}</b>
            </p>
          </section>

          <section>
            <h4 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2">Employer costs (₦)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              <Num label="Employer pension" fieldKey="er_pension" v={v.er_pension} overridden={overrides.has("er_pension")} onChange={x => setField("er_pension", x)} />
              <Num label="NSITF"            fieldKey="nsitf"      v={v.nsitf}      overridden={overrides.has("nsitf")}      onChange={x => setField("nsitf", x)} />
              <Num label="ITF"              fieldKey="itf"        v={v.itf}        overridden={overrides.has("itf")}        onChange={x => setField("itf", x)} />
            </div>
            <p className="text-[11px] text-text-light mt-1">Total employer cost (auto): <b className="tabular-nums">₦{erCostNaira.toLocaleString()}</b></p>
          </section>

          {calc && (
            <section className="border border-border rounded-lg">
              <button onClick={() => setShowBreakdown(s => !s)} className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-text-med hover:bg-muted/40">
                <span className="inline-flex items-center gap-1.5">
                  {showBreakdown ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Tax breakdown
                </span>
                <span>Effective rate: <b className="tabular-nums text-foreground">{Number(calc.effective_tax_rate_pct).toFixed(2)}%</b></span>
              </button>
              {showBreakdown && (
                <dl className="px-3 pb-3 text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  <Row label="Annual gross"            v={`₦${Math.round(calc.annual_gross).toLocaleString()}`} />
                  <Row label="Consolidated Relief (CRA)" v={`₦${Math.round(calc.cra).toLocaleString()}`} />
                  <Row label="Annual taxable income"   v={`₦${Math.round(calc.annual_taxable_income).toLocaleString()}`} />
                  <Row label="Annual PAYE"             v={`₦${Math.round(calc.annual_paye).toLocaleString()}`} />
                </dl>
              )}
            </section>
          )}

          <div>
            <label className={labelCls}>Notes</label>
            <textarea rows={2} className={inputCls} value={v.notes} onChange={e => setV(prev => ({ ...prev, notes: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
            <button onClick={save} disabled={upsert.isPending} className={btnPrimary}><Save className="w-3.5 h-3.5" /> Save draft</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, v }: { label: string; v: string }) {
  return <><dt className="text-text-light">{label}</dt><dd className="tabular-nums text-right">{v}</dd></>;
}

function Num({ label, v, onChange, overridden }: { label: string; fieldKey: FieldKey; v: number | string; overridden?: boolean; onChange: (x: number) => void }) {
  return (
    <div>
      <label className={labelCls + " flex items-center justify-between"}>
        <span>{label}</span>
        {overridden && <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700">Manual</span>}
      </label>
      <input
        type="number"
        min={0}
        value={v}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className={`${inputCls} ${overridden ? "border-amber-400 bg-amber-50/40" : ""}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mark-as-paid modal
// ---------------------------------------------------------------------------

function MarkPaidModal({ run, onClose, onConfirm, busy }: {
  run: HRPayrollRun;
  onClose: () => void;
  onConfirm: (payload: { method: string; ref: string; date: string }) => Promise<any>;
  busy: boolean;
}) {
  const [method, setMethod] = useState<"bank_transfer" | "cash">("bank_transfer");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">Mark as paid</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-2 text-sm">
          <p>Net salary: <b className="tabular-nums">{fmtN(run.net_salary)}</b></p>
          <div>
            <label className={labelCls}>Payment date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Payment method</label>
            <select value={method} onChange={e => setMethod(e.target.value as any)} className={inputCls}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Payment reference (optional)</label>
            <input value={ref} onChange={e => setRef(e.target.value)} className={inputCls} placeholder="Bank ref / cheque number" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
            <button onClick={() => onConfirm({ method, ref, date })} disabled={busy || !date} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40"><CheckCircle2 className="w-3.5 h-3.5" /> Confirm payment</button>
          </div>
        </div>
      </div>
    </div>
  );
}
