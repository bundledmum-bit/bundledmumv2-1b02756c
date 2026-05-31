import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ListChecks, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Plus, MessageSquarePlus, X } from "lucide-react";
import {
  useMyEmployee, useMyTasks, useTasksAssignedByMe, useDirectReports,
  useUpdateTask, useAddTaskComment,
  TASK_PRIORITY_COLORS, TASK_STATUS_LABELS,
  type HRTask, type TaskStatus,
} from "@/hooks/useHR";
import CreateTaskModal from "@/components/admin/hr/CreateTaskModal";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";

export default function EmployeeTasks() {
  const { data: employee } = useMyEmployee();
  const { data: reports = [] } = useDirectReports(employee?.id || null);
  const isManager = reports.length > 0;
  const [tab, setTab] = useState<"mine" | "team">("mine");

  if (!employee) {
    return <p className="text-sm text-text-light">Loading your profile…</p>;
  }

  return (
    <div className="space-y-3">
      <h1 className="pf text-xl font-bold flex items-center gap-2"><ListChecks className="w-5 h-5" /> My tasks</h1>

      {isManager && (
        <nav className="flex gap-1 border-b border-border">
          <button onClick={() => setTab("mine")} className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === "mine" ? "border-forest text-forest" : "border-transparent text-text-med hover:text-forest"}`}>My tasks</button>
          <button onClick={() => setTab("team")} className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${tab === "team" ? "border-forest text-forest" : "border-transparent text-text-med hover:text-forest"}`}>My team's tasks</button>
        </nav>
      )}

      {tab === "mine" ? <MyTab employeeId={employee.id} /> : <TeamTab employeeId={employee.id} reports={reports} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My tasks
// ---------------------------------------------------------------------------

function MyTab({ employeeId }: { employeeId: string }) {
  const { data: tasks = [] } = useMyTasks(employeeId);
  const today = new Date().toISOString().slice(0, 10);

  const { overdue, active, recentlyDone, counts } = useMemo(() => {
    const overdue: HRTask[] = [];
    const active: HRTask[] = [];
    const recentlyDone: HRTask[] = [];
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const counts = { todo: 0, in_progress: 0, overdue: 0 };

    for (const t of tasks) {
      if (t.status === "done") {
        if (t.completed_at && t.completed_at.slice(0, 10) >= cutoffIso) recentlyDone.push(t);
        continue;
      }
      if (t.status === "todo") counts.todo += 1;
      if (t.status === "in_progress") counts.in_progress += 1;
      if (t.due_date && t.due_date < today && t.status !== "done") {
        counts.overdue += 1;
        overdue.push(t);
      } else {
        active.push(t);
      }
    }
    return { overdue, active, recentlyDone, counts };
  }, [tasks, today]);

  const [doneExpanded, setDoneExpanded] = useState(false);

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-3 gap-2">
        <Stat label="To do"       value={counts.todo} />
        <Stat label="In progress" value={counts.in_progress} />
        <Stat label="Overdue"     value={counts.overdue} danger />
      </section>

      {overdue.length > 0 && (
        <Group title="Overdue" icon={<AlertTriangle className="w-4 h-4 text-red-600" />} tone="red">
          {overdue.map(t => <MyTaskCard key={t.id} task={t} today={today} />)}
        </Group>
      )}

      <Group title="To do &amp; in progress" icon={<ListChecks className="w-4 h-4 text-forest" />}>
        {active.length === 0 ? <p className="text-xs text-text-light py-2">You're all caught up.</p> : active.map(t => <MyTaskCard key={t.id} task={t} today={today} />)}
      </Group>

      {recentlyDone.length > 0 && (
        <section className="bg-card border border-border rounded-card">
          <button onClick={() => setDoneExpanded(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-text-med hover:bg-muted/40">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Recently completed · {recentlyDone.length}</span>
            {doneExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {doneExpanded && (
            <div className="p-3 space-y-2 border-t border-border">
              {recentlyDone.map(t => <MyTaskCard key={t.id} task={t} today={today} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`rounded-card border p-3 ${danger && value > 0 ? "bg-red-50 border-red-200" : "bg-card border-border"}`}>
      <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-0.5 ${danger && value > 0 ? "text-red-600" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function Group({ title, icon, tone, children }: { title: React.ReactNode; icon: React.ReactNode; tone?: "red"; children: React.ReactNode }) {
  return (
    <section className={`rounded-card border p-3 ${tone === "red" ? "bg-red-50/40 border-red-200" : "bg-card border-border"}`}>
      <h3 className={`text-[11px] uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5 ${tone === "red" ? "text-red-700" : "text-text-med"}`}>
        {icon} {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MyTaskCard({ task, today }: { task: HRTask; today: string }) {
  const update = useUpdateTask();
  const [completing, setCompleting] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const assigner = task.assigner_emp?.full_name || task.assigner_admin?.display_name || "HR";
  const overdue = !!task.due_date && task.due_date < today && task.status !== "done";

  const startTask = async () => {
    try { await update.mutateAsync({ id: task.id, status: "in_progress" }); toast.success("Task started"); }
    catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <article className="bg-card border border-border rounded-lg p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold leading-tight">{task.title}</h4>
          {task.description && <p className="text-xs text-text-med mt-1 whitespace-pre-wrap">{task.description}</p>}
          <div className="text-[11px] text-text-light mt-1">Assigned by {assigner}</div>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-pill text-[9px] font-bold capitalize border ${TASK_PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
            {task.due_date && (
              <span className={`text-[10px] ${overdue ? "text-red-600 font-semibold" : "text-text-light"}`}>Due {task.due_date}</span>
            )}
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-pill text-[9px] font-bold capitalize ${task.status === "done" ? "bg-gray-100 text-gray-500" : "bg-blue-100 text-blue-700"}`}>
              {TASK_STATUS_LABELS[task.status] || task.status}
            </span>
          </div>
        </div>
        <div className="flex-shrink-0">
          {task.status === "todo" && (
            <button onClick={startTask} disabled={update.isPending} className="bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">Start task</button>
          )}
          {task.status === "in_progress" && (
            <button onClick={() => setCompleting(true)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700">Mark as done</button>
          )}
          {task.status === "done" && (
            <span className="text-xs font-semibold text-emerald-700">Completed ✓</span>
          )}
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
        <button onClick={() => setCommenting(v => !v)} className="text-[11px] text-forest font-semibold hover:underline inline-flex items-center gap-1">
          <MessageSquarePlus className="w-3 h-3" /> {commenting ? "Close" : "Add comment"}
        </button>
      </div>

      {commenting && <InlineComment taskId={task.id} onClose={() => setCommenting(false)} />}
      {completing && <MarkDoneModal task={task} onClose={() => setCompleting(false)} />}
    </article>
  );
}

function InlineComment({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { data: employee } = useMyEmployee();
  const add = useAddTaskComment();
  const [text, setText] = useState("");

  const send = async () => {
    if (!text.trim()) return;
    try {
      await add.mutateAsync({ task_id: taskId, content: text.trim(), author_employee_id: employee?.id || null });
      toast.success("Comment added");
      setText("");
      onClose();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <div className="mt-2 space-y-1.5">
      <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Leave a comment for HR or your manager…" className={inputCls} />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-2 py-1">Cancel</button>
        <button onClick={send} disabled={!text.trim() || add.isPending} className="bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">Send</button>
      </div>
    </div>
  );
}

function MarkDoneModal({ task, onClose }: { task: HRTask; onClose: () => void }) {
  const update = useUpdateTask();
  const [notes, setNotes] = useState("");

  const confirm = async () => {
    try {
      await update.mutateAsync({
        id: task.id,
        status: "done",
        completion_notes: notes.trim() || null,
      });
      toast.success("Task completed");
      onClose();
    } catch (e: any) { toast.error(e?.message || "Failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">Complete task</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-2 text-sm">
          <p className="text-xs text-text-light">You're marking <b className="text-foreground">{task.title}</b> as done.</p>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Completion notes (optional)</label>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} placeholder="What did you deliver? Any caveats your manager should know?" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
            <button onClick={confirm} disabled={update.isPending} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40"><CheckCircle2 className="w-3.5 h-3.5" /> Mark done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team tab — for managers
// ---------------------------------------------------------------------------

function TeamTab({ employeeId, reports }: { employeeId: string; reports: Array<{ id: string; full_name: string; employee_id: string }> }) {
  const { data: tasks = [] } = useTasksAssignedByMe(employeeId);
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    const m = new Map<string, HRTask[]>();
    for (const t of tasks) {
      const key = t.assignee?.id || "unknown";
      const list = m.get(key) || [];
      list.push(t);
      m.set(key, list);
    }
    return m;
  }, [tasks]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-med">You manage {reports.length} {reports.length === 1 ? "person" : "people"}.</p>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep">
          <Plus className="w-3.5 h-3.5" /> Assign task
        </button>
      </div>

      {reports.length === 0 ? (
        <p className="text-xs text-text-light">You don't have any direct reports yet.</p>
      ) : (
        <div className="space-y-3">
          {reports.map(r => {
            const rows = grouped.get(r.id) || [];
            return (
              <section key={r.id} className="bg-card border border-border rounded-card">
                <header className="px-3 py-2 border-b border-border flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">{r.full_name}</div>
                    <div className="text-[10px] text-text-light">{r.employee_id} · {rows.length} open task{rows.length === 1 ? "" : "s"}</div>
                  </div>
                </header>
                <ul className="divide-y divide-border/40">
                  {rows.length === 0 && <li className="px-3 py-3 text-xs text-text-light">No open tasks assigned.</li>}
                  {rows.map(t => (
                    <li key={t.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{t.title}</div>
                        <div className="text-[10px] text-text-light">{TASK_STATUS_LABELS[t.status] || t.status}{t.due_date ? ` · due ${t.due_date}` : ""}</div>
                      </div>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-pill text-[9px] font-bold capitalize border ${TASK_PRIORITY_COLORS[t.priority]}`}>{t.priority}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {creating && (
        <CreateTaskModal
          assignableEmployees={reports}
          assigner={{ employeeId }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
