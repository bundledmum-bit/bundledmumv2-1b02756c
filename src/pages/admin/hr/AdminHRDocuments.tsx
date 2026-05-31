import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Files } from "lucide-react";
import { useHRDocuments, useHREmployees, useCreateDocument } from "@/hooks/useHR";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

const DOC_TYPES = ["contract", "offer_letter", "id_document", "tax_form", "pension", "nhf", "certificate", "appraisal", "other"];

export default function AdminHRDocuments() {
  const { data: docs = [] } = useHRDocuments();
  const { data: employees = [] } = useHREmployees();
  const create = useCreateDocument();
  const [empFilter, setEmpFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => docs.filter(d => {
    if (empFilter && d.employee_id !== empFilter) return false;
    if (typeFilter && d.document_type !== typeFilter) return false;
    return true;
  }), [docs, empFilter, typeFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} className="border border-input rounded-lg px-2 py-2 text-xs bg-background">
          <option value="">All employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-input rounded-lg px-2 py-2 text-xs bg-background">
          <option value="">All types</option>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep ml-auto">
          <Plus className="w-3.5 h-3.5" /> Upload
        </button>
      </div>

      {adding && (
        <UploadForm
          employees={employees}
          onCancel={() => setAdding(false)}
          onSave={async (p) => {
            await create.mutateAsync(p);
            toast.success("Document saved");
            setAdding(false);
          }}
        />
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0 z-10">
              <tr className="text-left">
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Uploaded</th>
                <th className="px-3 py-2 text-right">File</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{d.hr_employees?.full_name || "—"}</td>
                  <td className="px-3 py-2 capitalize">{d.document_type.replace("_", " ")}</td>
                  <td className="px-3 py-2">{d.title}</td>
                  <td className="px-3 py-2 text-text-light">{d.created_at ? new Date(d.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {d.file_url ? <a href={d.file_url} target="_blank" rel="noreferrer" className="text-forest font-semibold hover:underline">Open ↗</a> : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-text-light">
                  <Files className="w-5 h-5 mx-auto mb-1" />No documents yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UploadForm({ employees, onCancel, onSave }: {
  employees: Array<{ id: string; full_name: string }>;
  onCancel: () => void;
  onSave: (payload: { employee_id: string; document_type: string; title: string; file_url: string }) => Promise<any>;
}) {
  const [empId, setEmpId] = useState("");
  const [type, setType] = useState("contract");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const submit = async () => {
    if (!empId || !title.trim() || !url.trim()) { toast.error("Employee, title and file URL required"); return; }
    await onSave({ employee_id: empId, document_type: type, title: title.trim(), file_url: url.trim() });
    setEmpId(""); setTitle(""); setUrl("");
  };
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Employee</label>
          <select value={empId} onChange={e => setEmpId(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Document type</label>
          <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
            {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>File URL</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" className={inputCls} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs text-text-med hover:text-foreground px-2 py-1">Cancel</button>
        <button onClick={submit} className="bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep">Save document</button>
      </div>
    </div>
  );
}
