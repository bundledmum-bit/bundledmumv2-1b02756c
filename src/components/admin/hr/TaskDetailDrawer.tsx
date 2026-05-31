import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Send, Save } from "lucide-react";
import {
  useTaskComments, useAddTaskComment, useUpdateTask,
  TASK_PRIORITY_COLORS, TASK_STATUS_LABELS,
  type HRTask, type TaskPriority, type TaskStatus,
} from "@/hooks/useHR";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

/**
 * Shared task detail drawer. Admins can edit all fields; employees
 * viewing their own task get a read-only variant via the `readOnly` prop.
 */
export default function TaskDetailDrawer({
  task, onClose, actor, readOnly,
}: {
  task: HRTask;
  onClose: () => void;
  actor: { adminId?: string | null; employeeId?: string | null };
  readOnly?: boolean;
}) {
  const update = useUpdateTask();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [status, setStatus] = useState<TaskStatus>(task.status as TaskStatus);
  const [priority, setPriority] = useState<TaskPriority>(task.priority as TaskPriority);
  const [dueDate, setDueDate] = useState(task.due_date || "");
  const [comment, setComment] = useState("");

  const { data: comments = [] } = useTaskComments(task.id);
  const addComment = useAddTaskComment();

  // Sync local state when a different task is opened.
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || "");
    setStatus(task.status as TaskStatus);
    setPriority(task.priority as TaskPriority);
    setDueDate(task.due_date || "");
  }, [task.id]);

  const dirty = title !== task.title
    || description !== (task.description || "")
    || status !== task.status
    || priority !== task.priority
    || dueDate !== (task.due_date || "");

  const save = async () => {
    try {
      await update.mutateAsync({
        id: task.id,
        title: title.trim() || task.title,
        description: description.trim() || null,
        status, priority,
        due_date: dueDate || null,
      });
      toast.success("Task updated");
    } catch (e: any) { toast.error(e?.message || "Save failed"); }
  };

  const sendComment = async () => {
    const content = comment.trim();
    if (!content) return;
    try {
      await addComment.mutateAsync({
        task_id: task.id,
        content,
        author_admin_id: actor.adminId ?? null,
        author_employee_id: actor.employeeId ?? null,
      });
      setComment("");
    } catch (e: any) { toast.error(e?.message || "Failed to send"); }
  };

  const assignerName = task.assigner_emp?.full_name || task.assigner_admin?.display_name || "—";

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="flex-1 bg-foreground/40" />
      <aside className="w-full max-w-[560px] h-full bg-background border-l border-border overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="sticky top-0 z-10 bg-card border-b border-border px-5 py-3 flex items-center justify-between">
          <h2 className="font-bold text-sm">Task details</h2>
          <div className="flex items-center gap-2">
            {!readOnly && dirty && (
              <button onClick={save} disabled={update.isPending} className="inline-flex items-center gap-1 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"><Save className="w-3.5 h-3.5" /> Save</button>
            )}
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
        </header>

        <div className="p-5 space-y-3 text-sm">
          <div>
            <label className={labelCls}>Title</label>
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} readOnly={readOnly} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea rows={3} className={inputCls} value={description} onChange={e => setDescription(e.target.value)} readOnly={readOnly} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as TaskStatus)} disabled={readOnly} className={inputCls}>
                {(["todo","in_progress","done","cancelled"] as TaskStatus[]).map(s => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} disabled={readOnly} className={inputCls}>
                {(["low","medium","high","urgent"] as TaskPriority[]).map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Due date</label>
              <input type="date" className={inputCls} value={dueDate} onChange={e => setDueDate(e.target.value)} readOnly={readOnly} />
            </div>
            <div>
              <label className={labelCls}>Priority badge</label>
              <span className={`inline-flex items-center px-2 py-1 rounded-pill text-xs font-semibold capitalize border ${TASK_PRIORITY_COLORS[priority]}`}>{priority}</span>
            </div>
          </div>

          <dl className="text-xs space-y-0.5 pt-2 border-t border-border">
            <Kv k="Assignee" v={task.assignee?.full_name || "—"} />
            <Kv k="Assigned by" v={assignerName} />
            <Kv k="Created" v={new Date(task.created_at).toLocaleString("en-NG")} />
            {task.completed_at && <Kv k="Completed" v={new Date(task.completed_at).toLocaleString("en-NG")} />}
            {task.completion_notes && <Kv k="Completion notes" v={task.completion_notes} />}
          </dl>

          <section className="pt-2 border-t border-border">
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2">Comments</h3>
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {comments.length === 0 && <p className="text-xs text-text-light">No comments yet.</p>}
              {comments.map(c => {
                const authorName = c.author_emp?.full_name || c.author_admin?.display_name || "Someone";
                const isMe = (c.author_admin_id && c.author_admin_id === actor.adminId)
                          || (c.author_employee_id && c.author_employee_id === actor.employeeId);
                return (
                  <div key={c.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${isMe ? "bg-forest text-primary-foreground" : "bg-muted text-foreground"}`}>
                      <div className={`text-[10px] font-semibold mb-0.5 ${isMe ? "text-primary-foreground/80" : "text-text-med"}`}>
                        {authorName} · {new Date(c.created_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </div>
                      <div className="whitespace-pre-wrap">{c.content}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex items-end gap-2">
              <textarea rows={2} placeholder="Add a comment…" value={comment} onChange={e => setComment(e.target.value)} className={inputCls} />
              <button onClick={sendComment} disabled={!comment.trim() || addComment.isPending} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return <div className="flex items-start justify-between gap-3 py-0.5"><dt className="text-text-light">{k}</dt><dd className="text-right">{v}</dd></div>;
}
