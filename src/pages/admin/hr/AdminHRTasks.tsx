import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, LayoutGrid, List as ListIcon, Search, ChevronRight, MoreHorizontal, Trophy } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import {
  useHRTasks, useHREmployees, useUpdateTask, useEmployeePerformance,
  TASK_PRIORITY_COLORS, TASK_STATUS_LABELS,
  type HRTask, type TaskStatus,
} from "@/hooks/useHR";
import TaskDetailDrawer from "@/components/admin/hr/TaskDetailDrawer";
import CreateTaskModal from "@/components/admin/hr/CreateTaskModal";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

export default function AdminHRTasks() {
  const [view, setView] = useState<"board" | "list">("board");
  const [tab, setTab] = useState<"tasks" | "performance">("tasks");
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [myAssignments, setMyAssignments] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");

  const { data: tasks = [] } = useHRTasks();
  const { data: employees = [] } = useHREmployees();
  const { adminUser } = usePermissions();
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (assigneeFilter && t.assigned_to !== assigneeFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (myAssignments && t.assigned_by_admin !== adminUser?.id) return false;
      if (overdueOnly) {
        if (t.status === "done") return false;
        if (!t.due_date || t.due_date >= today) return false;
      }
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, assigneeFilter, priorityFilter, myAssignments, overdueOnly, search, adminUser, today]);

  const selectedTask = tasks.find(t => t.id === detailId) || null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <nav className="flex gap-1 border-b border-border">
          <button onClick={() => setTab("tasks")} className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === "tasks" ? "border-forest text-forest" : "border-transparent text-text-med hover:text-forest"}`}>Tasks</button>
          <button onClick={() => setTab("performance")} className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === "performance" ? "border-forest text-forest" : "border-transparent text-text-med hover:text-forest"}`}>Performance Scores</button>
        </nav>

        {tab === "tasks" && (
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
              <button onClick={() => setView("board")} className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 ${view === "board" ? "bg-card font-semibold" : ""}`}><LayoutGrid className="w-3.5 h-3.5" /> Board</button>
              <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 ${view === "list" ? "bg-card font-semibold" : ""}`}><ListIcon className="w-3.5 h-3.5" /> List</button>
            </div>
            <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep"><Plus className="w-3.5 h-3.5" /> New Task</button>
          </div>
        )}
      </div>

      {tab === "tasks" && (
        <>
          <div className="bg-card border border-border rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title…" className="w-full pl-9 pr-3 py-1.5 border border-input rounded-lg text-xs bg-background" />
            </div>
            <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="border border-input rounded-lg px-2 py-1.5 text-xs bg-background">
              <option value="">All assignees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="border border-input rounded-lg px-2 py-1.5 text-xs bg-background">
              <option value="">All priorities</option>
              {["urgent","high","medium","low"].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="checkbox" checked={myAssignments} onChange={e => setMyAssignments(e.target.checked)} /> My assignments
            </label>
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} /> Overdue only
            </label>
          </div>

          {view === "board" ? (
            <Board tasks={filtered} today={today} onOpen={setDetailId} />
          ) : (
            <ListView tasks={filtered} today={today} onOpen={setDetailId} />
          )}
        </>
      )}

      {tab === "performance" && (
        <PerformanceTab onOpenEmployee={(empId) => { setTab("tasks"); setAssigneeFilter(empId); }} />
      )}

      {creating && (
        <CreateTaskModal
          assignableEmployees={employees.filter(e => e.status === "active").map(e => ({ id: e.id, full_name: e.full_name, employee_id: e.employee_id }))}
          assigner={{ adminId: adminUser?.id || null }}
          onClose={() => setCreating(false)}
        />
      )}

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          onClose={() => setDetailId(null)}
          actor={{ adminId: adminUser?.id || null }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board view
// ---------------------------------------------------------------------------

function Board({ tasks, today, onOpen }: { tasks: HRTask[]; today: string; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const map: Record<string, HRTask[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) {
      if (t.status === "todo" || t.status === "in_progress" || t.status === "done") {
        map[t.status].push(t);
      }
    }
    return map;
  }, [tasks]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {STATUSES.map(s => (
        <div key={s} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/40 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-text-med flex items-center justify-between">
            <span>{TASK_STATUS_LABELS[s]}</span>
            <span className="text-[10px] bg-background border border-border rounded-pill px-2 py-0.5">{groups[s].length}</span>
          </div>
          <div className="p-2 space-y-2 min-h-[120px]">
            {groups[s].length === 0 && <p className="text-xs text-text-light text-center py-6">Nothing here.</p>}
            {groups[s].map(t => <TaskCard key={t.id} task={t} today={today} onOpen={onOpen} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task, today, onOpen }: { task: HRTask; today: string; onOpen: (id: string) => void }) {
  const update = useUpdateTask();
  const overdue = !!task.due_date && task.due_date < today && task.status !== "done";

  const nextStatus = (cur: TaskStatus): TaskStatus | null => cur === "todo" ? "in_progress" : cur === "in_progress" ? "done" : null;

  const advance = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nxt = nextStatus(task.status as TaskStatus);
    if (!nxt) return;
    try { await update.mutateAsync({ id: task.id, status: nxt }); toast.success(`Moved to ${TASK_STATUS_LABELS[nxt]}`); }
    catch (err: any) { toast.error(err?.message || "Could not move"); }
  };

  const cancelTask = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Cancel this task?")) return;
    try { await update.mutateAsync({ id: task.id, status: "cancelled" }); toast.success("Task cancelled"); }
    catch (err: any) { toast.error(err?.message || "Failed"); }
  };

  const assigner = task.assigner_emp?.full_name || task.assigner_admin?.display_name || "—";

  return (
    <article onClick={() => onOpen(task.id)} className="bg-background border border-border rounded-lg p-3 text-xs cursor-pointer hover:border-forest/40">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold text-sm leading-tight line-clamp-2">{task.title}</h4>
        <TaskMenu onCancel={cancelTask} />
      </div>
      {task.assignee && <div className="text-[11px] text-text-med mt-1">{task.assignee.full_name}</div>}
      <div className="text-[10px] text-text-light mt-0.5">by {assigner}</div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-pill text-[9px] font-bold capitalize border ${TASK_PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
        {task.due_date && (
          <span className={`text-[10px] ${overdue ? "text-red-600 font-semibold" : "text-text-light"}`}>Due {task.due_date}</span>
        )}
        {task.status !== "done" && (
          <button onClick={advance} className="ml-auto text-[10px] font-semibold text-forest hover:underline inline-flex items-center gap-0.5">Move to <ChevronRight className="w-3 h-3" /></button>
        )}
      </div>
    </article>
  );
}

function TaskMenu({ onCancel }: { onCancel: (e: React.MouseEvent) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(v => !v)} className="w-6 h-6 rounded-full hover:bg-muted inline-flex items-center justify-center"><MoreHorizontal className="w-3.5 h-3.5" /></button>
      {open && (
        <div className="absolute right-0 top-7 z-10 bg-card border border-border rounded-lg shadow-md text-[11px] w-36 py-1">
          <button onClick={() => { setOpen(false); onCancel({ stopPropagation: () => {} } as any); }} className="w-full text-left px-3 py-1.5 text-destructive hover:bg-muted">Cancel task</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function ListView({ tasks, today, onOpen }: { tasks: HRTask[]; today: string; onOpen: (id: string) => void }) {
  const update = useUpdateTask();
  const setStatus = async (id: string, status: TaskStatus) => {
    try { await update.mutateAsync({ id, status }); toast.success("Status updated"); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Task</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Due date</th>
              <th className="px-3 py-2">Assigned by</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-text-light">No tasks match.</td></tr>}
            {tasks.map(t => {
              const overdue = !!t.due_date && t.due_date < today && t.status !== "done";
              return (
                <tr key={t.id} onClick={() => onOpen(t.id)} className="border-t border-border hover:bg-muted/30 cursor-pointer">
                  <td className="px-3 py-2 font-semibold">{t.title}</td>
                  <td className="px-3 py-2">{t.assignee?.full_name || "—"}</td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <select value={t.status} onChange={e => setStatus(t.id, e.target.value as TaskStatus)} className="border border-input rounded px-2 py-1 text-xs bg-background">
                      {(["todo","in_progress","done","cancelled"] as TaskStatus[]).map(s => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><span className={`inline-flex items-center px-1.5 py-0.5 rounded-pill text-[9px] font-bold capitalize border ${TASK_PRIORITY_COLORS[t.priority]}`}>{t.priority}</span></td>
                  <td className={`px-3 py-2 ${overdue ? "text-red-600 font-semibold" : "text-text-light"}`}>{t.due_date || "—"}</td>
                  <td className="px-3 py-2 text-text-light">{t.assigner_emp?.full_name || t.assigner_admin?.display_name || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Performance tab
// ---------------------------------------------------------------------------

function PerformanceTab({ onOpenEmployee }: { onOpenEmployee: (empId: string) => void }) {
  const { data = [], isLoading } = useEmployeePerformance();
  const sorted = useMemo(() => [...data].sort((a, b) => Number(b.performance_score) - Number(a.performance_score)), [data]);

  const scoreColor = (s: number) => s >= 80 ? "text-emerald-700" : s >= 60 ? "text-amber-700" : "text-red-600";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-border text-[10px] uppercase tracking-widest font-bold text-text-med inline-flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Employee performance</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2 w-40">Completion rate</th>
              <th className="px-3 py-2 text-right">On-time rate</th>
              <th className="px-3 py-2 text-right">Overdue</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-right">This month</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-3 py-8 text-center text-text-light">Loading…</td></tr>}
            {!isLoading && sorted.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-text-light">No performance data yet.</td></tr>}
            {sorted.map(p => {
              const pct = Math.min(100, Math.max(0, Number(p.completion_rate_pct) || 0));
              return (
                <tr key={p.employee_id} onClick={() => onOpenEmployee(p.employee_id)} className="border-t border-border hover:bg-muted/30 cursor-pointer">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{p.full_name}</div>
                    <div className="text-[10px] text-text-light">{p.job_title}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="tabular-nums text-xs">{Number(p.completion_rate_pct).toFixed(0)}%</div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden mt-0.5"><div className="h-full bg-forest" style={{ width: `${pct}%` }} /></div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(p.on_time_rate_pct).toFixed(0)}%</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${Number(p.overdue_tasks) > 0 ? "text-red-600 font-semibold" : ""}`}>{p.overdue_tasks}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`text-lg font-black tabular-nums ${scoreColor(Number(p.performance_score))}`}>{Number(p.performance_score)}</span>
                    <span className="text-[10px] text-text-light">/100</span>
                  </td>
                  <td className="px-3 py-2 text-right text-text-light">{p.completed_this_month}/{p.tasks_this_month} done</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
