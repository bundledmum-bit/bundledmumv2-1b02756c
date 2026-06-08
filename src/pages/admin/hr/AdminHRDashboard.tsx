import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Users, CalendarClock, AlertTriangle, Wallet, TrendingUp, Building2, ListChecks, Trophy } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import {
  useHRAnalytics, useHeadcountByDept, useRecentPaidPayroll, useLeaveBalances,
  useHRTasks, useEmployeePerformance,
  fmtN, MONTHS,
} from "@/hooks/useHR";

export default function AdminHRDashboard() {
  const { data: stats } = useHRAnalytics();
  const { data: byDept = [] } = useHeadcountByDept();
  const { data: paidRuns = [] } = useRecentPaidPayroll(200);
  const thisYear = new Date().getFullYear();
  const { data: balances = [] } = useLeaveBalances(thisYear);
  const { data: tasks = [] } = useHRTasks();
  const { data: performance = [] } = useEmployeePerformance();

  const taskSummary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let openTasks = 0, overdue = 0, completedToday = 0;
    for (const t of tasks) {
      if (t.status === "todo" || t.status === "in_progress") openTasks += 1;
      if ((t.status === "todo" || t.status === "in_progress") && t.due_date && t.due_date < today) overdue += 1;
      if (t.status === "done" && t.completed_at && t.completed_at.slice(0, 10) === today) completedToday += 1;
    }
    return { openTasks, overdue, completedToday };
  }, [tasks]);

  const topPerformers = useMemo(() => {
    return [...performance]
      .sort((a, b) => Number(b.performance_score) - Number(a.performance_score))
      .slice(0, 3);
  }, [performance]);

  // Aggregate payroll runs by year-month for the last 6 months.
  const chartData = useMemo(() => {
    const map = new Map<string, { key: string; label: string; year: number; month: number; net: number }>();
    for (const r of paidRuns) {
      const k = `${r.pay_year}-${r.pay_month}`;
      const row = map.get(k) || { key: k, label: `${MONTHS[r.pay_month - 1]} ${r.pay_year}`, year: r.pay_year, month: r.pay_month, net: 0 };
      row.net += Number(r.net_salary) || 0;
      map.set(k, row);
    }
    return Array.from(map.values())
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .slice(-6)
      .map(r => ({ ...r, netNaira: Math.round(r.net / 100) }));
  }, [paidRuns]);

  const mostStaffRow = useMemo(() => {
    let top = byDept[0];
    for (const r of byDept) if ((r.active_count || 0) > (top?.active_count || 0)) top = r;
    return top;
  }, [byDept]);

  const pendingColor = (stats?.pending_leave_requests || 0) > 0 ? "text-amber-700" : "text-foreground";

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Users className="w-4 h-4" />} label="Active staff"       value={`${stats?.active_headcount ?? "—"} people`} />
        <Kpi icon={<CalendarClock className="w-4 h-4" />} label="On leave now" value={`${stats?.on_leave_count ?? "—"} people`} />
        <Kpi icon={<AlertTriangle className="w-4 h-4" />} label="Pending approvals" value={
          <span className={pendingColor}>{stats?.pending_leave_requests ?? "—"} requests</span>
        } />
        <Kpi icon={<Wallet className="w-4 h-4" />} label="Monthly payroll (net)" value={stats ? fmtN(stats.current_month_net_payroll) : "—"} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Headcount by department</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0 z-10">
                <tr className="text-left">
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2 text-right">Active</th>
                  <th className="px-3 py-2 text-right">On leave</th>
                  <th className="px-3 py-2 text-right">Monthly gross</th>
                </tr>
              </thead>
              <tbody>
                {byDept.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-text-light">No departments yet.</td></tr>}
                {byDept.map(d => (
                  <tr key={d.department_id || d.department_name || Math.random()} className={`border-t border-border ${mostStaffRow && mostStaffRow.department_id === d.department_id ? "bg-emerald-50/50" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{d.department_name || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.active_count ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.on_leave_count ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtN(d.monthly_gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Payroll spend — last 6 months</h2>
          <div style={{ width: "100%", height: 240 }}>
            {chartData.length === 0 ? (
              <p className="text-xs text-text-light text-center pt-12">No paid payroll runs yet.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" fontSize={10} />
                  <YAxis fontSize={10} tickFormatter={(v: number) => `₦${(v / 1000).toFixed(0)}k`} />
                  <RTooltip formatter={(v: number) => `₦${v.toLocaleString()}`} />
                  <Bar dataKey="netNaira" fill="#2D6A4F" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2 flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5" /> Task overview</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            <div className="rounded-lg border border-border p-2">
              <dt className="text-[10px] uppercase tracking-widest font-semibold text-text-light">Total open</dt>
              <dd className="text-xl font-bold tabular-nums mt-0.5">{taskSummary.openTasks}</dd>
            </div>
            <div className={`rounded-lg border p-2 ${taskSummary.overdue > 0 ? "bg-red-50 border-red-200" : "border-border"}`}>
              <dt className="text-[10px] uppercase tracking-widest font-semibold text-text-light">Overdue</dt>
              <dd className={`text-xl font-bold tabular-nums mt-0.5 ${taskSummary.overdue > 0 ? "text-red-600" : ""}`}>{taskSummary.overdue}</dd>
            </div>
            <div className="rounded-lg border border-border p-2">
              <dt className="text-[10px] uppercase tracking-widest font-semibold text-text-light">Done today</dt>
              <dd className="text-xl font-bold tabular-nums mt-0.5 text-emerald-700">{taskSummary.completedToday}</dd>
            </div>
          </dl>
          <div className="pt-2 text-right">
            <Link to="/admin/hr/tasks" className="text-[11px] font-semibold text-forest hover:underline">Manage tasks →</Link>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2 flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Top performers</h2>
          {topPerformers.length === 0 ? (
            <p className="text-xs text-text-light">No performance data yet.</p>
          ) : (
            <ul className="space-y-2">
              {topPerformers.map((p, i) => {
                const pct = Math.min(100, Math.max(0, Number(p.completion_rate_pct) || 0));
                const score = Number(p.performance_score) || 0;
                const scoreCls = score >= 80 ? "text-emerald-700" : score >= 60 ? "text-amber-700" : "text-red-600";
                return (
                  <li key={p.employee_id} className="flex items-center gap-2">
                    <span className="w-5 text-sm font-bold text-text-light">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{p.full_name}</div>
                      <div className="h-1 bg-muted rounded-full overflow-hidden mt-0.5"><div className="h-full bg-forest" style={{ width: `${pct}%` }} /></div>
                      <div className="text-[9px] text-text-light">{pct.toFixed(0)}% completion</div>
                    </div>
                    <span className={`text-lg font-black tabular-nums ${scoreCls}`}>{score}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-card border border-border rounded-xl">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med">Leave utilisation — {thisYear}</h2>
          <Link to="/admin/hr/leave" className="text-[11px] font-semibold text-forest hover:underline">Manage leave →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/20 sticky top-0 z-10">
              <tr className="text-left">
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Leave type</th>
                <th className="px-3 py-2 text-right">Entitled</th>
                <th className="px-3 py-2 text-right">Used</th>
                <th className="px-3 py-2 text-right">Pending</th>
                <th className="px-3 py-2 text-right">Remaining</th>
                <th className="px-3 py-2 w-32">Usage</th>
              </tr>
            </thead>
            <tbody>
              {balances.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-text-light">No balances yet.</td></tr>}
              {[...balances]
                .sort((a, b) => Number(b.used_days) - Number(a.used_days))
                .map(b => {
                  const entitled = Number(b.entitled_days) || 0;
                  const used = Number(b.used_days) || 0;
                  const pending = Number(b.pending_days) || 0;
                  const remaining = entitled - used - pending;
                  const pct = entitled > 0 ? Math.min(100, Math.round((used / entitled) * 100)) : 0;
                  return (
                    <tr key={b.id} className="border-t border-border">
                      <td className="px-3 py-2">{b.hr_employees?.full_name || "—"}</td>
                      <td className="px-3 py-2">{b.hr_leave_types?.name || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{entitled.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{used.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pending.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{remaining.toFixed(1)}</td>
                      <td className="px-3 py-2">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-forest" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-[9px] text-text-light mt-0.5">{pct}%</div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold text-text-light">{icon} {label}</div>
      <div className="text-lg font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

