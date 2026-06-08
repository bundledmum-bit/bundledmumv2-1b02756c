import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Building2, Save } from "lucide-react";
import { useHRDepartments, useHREmployees, useUpsertDepartment, type HRDepartment } from "@/hooks/useHR";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

export default function AdminHRDepartments() {
  const { data: departments = [] } = useHRDepartments();
  const { data: employees = [] } = useHREmployees();
  const upsert = useUpsertDepartment();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-1.5"><Building2 className="w-4 h-4" /> Departments ({departments.length})</h3>
        {!adding && (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep">
            <Plus className="w-3.5 h-3.5" /> Add department
          </button>
        )}
      </div>

      {adding && (
        <DepartmentForm
          employees={employees}
          onCancel={() => setAdding(false)}
          onSave={async (p) => {
            await upsert.mutateAsync(p);
            toast.success("Department added");
            setAdding(false);
          }}
        />
      )}

      <div className="space-y-2">
        {departments.map(d => (
          editing === d.id ? (
            <DepartmentForm
              key={d.id}
              department={d}
              employees={employees}
              onCancel={() => setEditing(null)}
              onSave={async (p) => { await upsert.mutateAsync({ ...p, id: d.id }); toast.success("Saved"); setEditing(null); }}
            />
          ) : (
            <div key={d.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{d.name}</span>
                  {!d.is_active && <span className="text-[10px] font-semibold bg-muted text-text-med px-1.5 py-0.5 rounded-pill">Inactive</span>}
                </div>
                {d.description && <p className="text-xs text-text-med mt-0.5">{d.description}</p>}
                {d.head_employee_id && (
                  <p className="text-[11px] text-text-light mt-0.5">Head: {employees.find(e => e.id === d.head_employee_id)?.full_name || "—"}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditing(d.id)} className="text-forest text-xs font-semibold hover:underline">Edit</button>
                <button
                  onClick={() => upsert.mutateAsync({ id: d.id, is_active: !d.is_active }).then(() => toast.success(`${d.is_active ? "Deactivated" : "Activated"}`))}
                  className="text-xs text-text-med hover:text-foreground font-semibold"
                >
                  {d.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          )
        ))}
        {departments.length === 0 && <p className="text-xs text-text-light">No departments yet.</p>}
      </div>
    </div>
  );
}

function DepartmentForm({ department, employees, onCancel, onSave }: {
  department?: HRDepartment;
  employees: Array<{ id: string; full_name: string; status: string }>;
  onCancel: () => void;
  onSave: (payload: Partial<HRDepartment>) => Promise<any>;
}) {
  const [name, setName] = useState(department?.name || "");
  const [desc, setDesc] = useState(department?.description || "");
  const [head, setHead] = useState(department?.head_employee_id || "");
  const [active, setActive] = useState(department?.is_active !== false);
  useEffect(() => {
    setName(department?.name || "");
    setDesc(department?.description || "");
    setHead(department?.head_employee_id || "");
    setActive(department?.is_active !== false);
  }, [department?.id]);

  const submit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    await onSave({
      name: name.trim(),
      description: desc.trim() || null,
      head_employee_id: head || null,
      is_active: active,
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Head of department</label>
          <select value={head} onChange={e => setHead(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {employees.filter(e => e.status === "active").map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Description</label>
          <textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)} className={inputCls} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
        Active
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs text-text-med hover:text-foreground px-2 py-1">Cancel</button>
        <button onClick={submit} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep"><Save className="w-3.5 h-3.5" /> Save</button>
      </div>
    </div>
  );
}
