import { useState } from "react";
import { toast } from "sonner";
import { X, Save } from "lucide-react";
import { useCreateTask, type TaskPriority } from "@/hooks/useHR";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

/**
 * Shared task creator used by both admin and manager (employee) flows.
 * Pass `assigner={{ adminId }}` for admin-created tasks and
 * `assigner={{ employeeId }}` for portal/manager-created tasks.
 */
export default function CreateTaskModal({
  assignableEmployees,
  assigner,
  defaultAssigneeId,
  onClose,
  onCreated,
}: {
  assignableEmployees: Array<{ id: string; full_name: string; employee_id: string }>;
  assigner: { adminId?: string | null; employeeId?: string | null };
  defaultAssigneeId?: string | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState(defaultAssigneeId || "");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");

  const save = async () => {
    if (!title.trim()) { toast.error("Title is required."); return; }
    if (!assignedTo) { toast.error("Pick an assignee."); return; }
    try {
      const id = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo,
        assigned_by_admin: assigner.adminId ?? null,
        assigned_by_employee: assigner.employeeId ?? null,
        priority,
        due_date: dueDate || null,
        status: "todo",
      });
      toast.success("Task created");
      onCreated?.(id);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not create task");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">Create task</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className={labelCls}>Title *</label>
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea rows={3} className={inputCls} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Assign to *</label>
            <select className={inputCls} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">Select employee…</option>
              {assignableEmployees.map(x => <option key={x.id} value={x.id}>{x.full_name} ({x.employee_id})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Priority</label>
              <select className={inputCls} value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
                {(["low","medium","high","urgent"] as TaskPriority[]).map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Due date</label>
              <input type="date" className={inputCls} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
            <button onClick={save} disabled={create.isPending} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
              <Save className="w-3.5 h-3.5" /> Create task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
