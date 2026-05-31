import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, X, Save, UserPlus, Trash2, UserMinus, AlertTriangle, ShieldCheck, History as HistoryIcon, FileText, Printer } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import {
  useHREmployees, useHRDepartments, useUpsertEmployee,
  useHRDocuments, useMyLeaveBalances, useMyPayrollRuns,
  useJobHistory, useInsertJobHistory, generateEmploymentLetterData,
  type HREmployee, type JobHistoryChangeType, type EmploymentLetterData,
  STATUS_COLORS, fmtN, fromKobo, toKobo, MONTHS,
} from "@/hooks/useHR";
import JobHistoryTimeline from "@/components/admin/hr/JobHistoryTimeline";
import EmploymentLetter from "@/components/employee-portal/EmploymentLetter";

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern", "consultant"];
const STATUSES = ["active", "on_leave", "suspended", "terminated"];
const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

export default function AdminHREmployees() {
  const { data: employees = [], isLoading } = useHREmployees();
  const { data: departments = [] } = useHRDepartments();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const filtered = useMemo(() => {
    return employees.filter(e => {
      if (statusFilter && e.status !== statusFilter) return false;
      if (deptFilter && e.department_id !== deptFilter) return false;
      if (typeFilter && e.employment_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${e.full_name} ${e.employee_id} ${e.job_title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [employees, search, deptFilter, statusFilter, typeFilter]);

  const selected = employees.find(e => e.id === detailId) || null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, job title…"
            className="w-full pl-9 pr-3 py-2 border border-input rounded-lg text-sm bg-background"
          />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="border border-input rounded-lg px-2 py-2 text-xs bg-background">
          <option value="">All departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-input rounded-lg px-2 py-2 text-xs bg-background">
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-input rounded-lg px-2 py-2 text-xs bg-background">
          <option value="">All types</option>
          {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </select>
        <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep">
          <UserPlus className="w-3.5 h-3.5" /> Add Employee
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Job title</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Start date</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="px-3 py-8 text-center text-text-light">Loading…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-text-light">No employees found.</td></tr>}
              {filtered.map(e => (
                <tr key={e.id} onClick={() => setDetailId(e.id)} className="border-t border-border hover:bg-muted/30 cursor-pointer">
                  <td className="px-3 py-2 font-mono text-text-med">{e.employee_id}</td>
                  <td className="px-3 py-2 font-semibold">{e.full_name}</td>
                  <td className="px-3 py-2">{e.job_title}</td>
                  <td className="px-3 py-2">{e.hr_departments?.name || "—"}</td>
                  <td className="px-3 py-2 capitalize">{e.employment_type?.replace("_", " ")}</td>
                  <td className="px-3 py-2 text-text-light">{e.start_date}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold capitalize ${STATUS_COLORS[e.status] || "bg-muted text-text-med"}`}>
                      {e.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen && (
        <EmployeeFormModal
          departments={departments}
          employees={employees}
          onClose={() => setAddOpen(false)}
          onSaved={() => setAddOpen(false)}
        />
      )}

      {selected && !editOpen && (
        <EmployeeDetailPanel
          employee={selected}
          onClose={() => setDetailId(null)}
          onEdit={() => setEditOpen(true)}
        />
      )}

      {selected && editOpen && (
        <EmployeeFormModal
          departments={departments}
          employees={employees}
          editing={selected}
          onClose={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit form modal
// ---------------------------------------------------------------------------

function EmployeeFormModal({
  departments, employees, editing, onClose, onSaved,
}: {
  departments: Array<{ id: string; name: string }>;
  employees: HREmployee[];
  editing?: HREmployee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useUpsertEmployee();
  const isEdit = !!editing;

  const [form, setForm] = useState<Partial<HREmployee> & {
    basicNaira?: number | string; housingNaira?: number | string;
    transportNaira?: number | string; otherNaira?: number | string;
  }>(() => ({
    ...editing,
    basicNaira: editing ? fromKobo(editing.basic_salary) : "",
    housingNaira: editing ? fromKobo(editing.housing_allowance) : "",
    transportNaira: editing ? fromKobo(editing.transport_allowance) : "",
    otherNaira: editing ? fromKobo(editing.other_allowances) : "",
    employment_type: editing?.employment_type || "full_time",
    status: editing?.status || "active",
    gender: editing?.gender || undefined,
  }));

  const set = <K extends keyof typeof form>(k: K, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.full_name?.trim() || !form.personal_email?.trim() || !form.job_title?.trim() ||
        !form.employment_type || !form.start_date || !form.department_id) {
      toast.error("Full name, email, job title, type, department, and start date are required.");
      return;
    }
    const payload: Partial<HREmployee> = {
      ...(form as any),
      basic_salary: toKobo(form.basicNaira as any),
      housing_allowance: toKobo(form.housingNaira as any),
      transport_allowance: toKobo(form.transportNaira as any),
      other_allowances: toKobo(form.otherNaira as any),
    };
    // Strip local-only fields.
    delete (payload as any).basicNaira;
    delete (payload as any).housingNaira;
    delete (payload as any).transportNaira;
    delete (payload as any).otherNaira;

    try {
      await upsert.mutateAsync(payload);
      toast.success(isEdit ? "Employee updated" : "Employee added");
      if (!isEdit && form.personal_email) {
        // Magic-link invite so the new hire can access the employee portal.
        try {
          const { error } = await (supabase.auth as any).signInWithOtp({
            email: form.personal_email,
            options: { emailRedirectTo: "https://bundledmum.com/employee-portal", shouldCreateUser: true },
          });
          if (error) throw error;
          toast.success("Invite sent to personal email.");
        } catch (e: any) {
          console.warn("Invite send failed", e);
          toast.message("Employee saved — invite send failed, ask IT to resend.");
        }
      }
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[92svh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-sm">{isEdit ? `Edit ${editing?.full_name}` : "Add employee"}</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          <Section title="Personal">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Full name *"><input className={inputCls} value={form.full_name || ""} onChange={e => set("full_name", e.target.value)} /></Field>
              <Field
                label={
                  <span className="inline-flex items-center gap-1.5">
                    Work email
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-pill bg-forest/10 text-forest text-[9px] font-bold tracking-wider uppercase">Primary</span>
                  </span>
                }
                hint="Used for login and all HR communications"
              >
                <input type="email" className={inputCls} value={form.work_email || ""} onChange={e => set("work_email", e.target.value)} placeholder="yourname@bundledmum.com" />
              </Field>
              <Field label="Personal email *"><input type="email" className={inputCls} value={form.personal_email || ""} onChange={e => set("personal_email", e.target.value)} disabled={isEdit} /></Field>
              <Field label="Phone"><input className={inputCls} value={form.phone || ""} onChange={e => set("phone", e.target.value)} /></Field>
              <Field label="WhatsApp number"><input className={inputCls} value={form.whatsapp_number || ""} onChange={e => set("whatsapp_number", e.target.value)} /></Field>
              <Field label="Date of birth"><input type="date" className={inputCls} value={form.date_of_birth || ""} onChange={e => set("date_of_birth", e.target.value)} /></Field>
              <Field label="Gender">
                <select className={inputCls} value={form.gender || ""} onChange={e => set("gender", e.target.value || null)}>
                  <option value="">—</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="State of origin"><input className={inputCls} value={form.state_of_origin || ""} onChange={e => set("state_of_origin", e.target.value)} /></Field>
              <Field label="National ID number"><input className={inputCls} value={form.national_id_number || ""} onChange={e => set("national_id_number", e.target.value)} /></Field>
              <Field label="Address" full><textarea rows={2} className={inputCls} value={form.address || ""} onChange={e => set("address", e.target.value)} /></Field>
            </div>
          </Section>

          <Section title="Employment">
            <div className="grid md:grid-cols-2 gap-3">
              <Field label="Department *">
                <select className={inputCls} value={form.department_id || ""} onChange={e => set("department_id", e.target.value)}>
                  <option value="">Select…</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Job title *"><input className={inputCls} value={form.job_title || ""} onChange={e => set("job_title", e.target.value)} /></Field>
              <Field label="Employment type *">
                <select className={inputCls} value={form.employment_type || "full_time"} onChange={e => set("employment_type", e.target.value)}>
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </select>
              </Field>
              <Field label="Line manager">
                <select className={inputCls} value={form.line_manager_id || ""} onChange={e => set("line_manager_id", e.target.value || null)}>
                  <option value="">—</option>
                  {employees.filter(x => x.status === "active" && x.id !== editing?.id).map(x => (
                    <option key={x.id} value={x.id}>{x.full_name} ({x.employee_id})</option>
                  ))}
                </select>
              </Field>
              <Field label="Start date *"><input type="date" className={inputCls} value={form.start_date || ""} onChange={e => set("start_date", e.target.value)} /></Field>
              <Field label="Probation end date"><input type="date" className={inputCls} value={form.probation_end_date || ""} onChange={e => set("probation_end_date", e.target.value || null)} /></Field>
              <Field label="End date"><input type="date" className={inputCls} value={form.end_date || ""} onChange={e => set("end_date", e.target.value || null)} /></Field>
            </div>
          </Section>

          <Section title="Banking">
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Bank name"><input className={inputCls} value={form.bank_name || ""} onChange={e => set("bank_name", e.target.value)} /></Field>
              <Field label="Account number"><input className={inputCls} value={form.bank_account_number || ""} onChange={e => set("bank_account_number", e.target.value)} /></Field>
              <Field label="Account name"><input className={inputCls} value={form.bank_account_name || ""} onChange={e => set("bank_account_name", e.target.value)} /></Field>
            </div>
          </Section>

          <Section title="Salary defaults (₦)">
            <div className="grid md:grid-cols-4 gap-3">
              <Field label="Basic"><input type="number" min={0} className={inputCls} value={form.basicNaira || ""} onChange={e => set("basicNaira", e.target.value)} /></Field>
              <Field label="Housing"><input type="number" min={0} className={inputCls} value={form.housingNaira || ""} onChange={e => set("housingNaira", e.target.value)} /></Field>
              <Field label="Transport"><input type="number" min={0} className={inputCls} value={form.transportNaira || ""} onChange={e => set("transportNaira", e.target.value)} /></Field>
              <Field label="Other"><input type="number" min={0} className={inputCls} value={form.otherNaira || ""} onChange={e => set("otherNaira", e.target.value)} /></Field>
            </div>
          </Section>

          <Section title="Emergency contact">
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Name"><input className={inputCls} value={form.emergency_contact_name || ""} onChange={e => set("emergency_contact_name", e.target.value)} /></Field>
              <Field label="Phone"><input className={inputCls} value={form.emergency_contact_phone || ""} onChange={e => set("emergency_contact_phone", e.target.value)} /></Field>
              <Field label="Relationship"><input className={inputCls} value={form.emergency_contact_relationship || ""} onChange={e => set("emergency_contact_relationship", e.target.value)} /></Field>
            </div>
          </Section>

          <Section title="Notes">
            <textarea rows={2} className={inputCls} value={form.notes || ""} onChange={e => set("notes", e.target.value)} />
          </Section>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
            <button
              onClick={save}
              disabled={upsert.isPending}
              className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" /> {isEdit ? "Save changes" : "Create employee"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest font-bold text-text-med">{title}</h4>
      {children}
    </section>
  );
}

function Field({ label, children, full, hint }: { label: React.ReactNode; children: React.ReactNode; full?: boolean; hint?: string }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[10px] text-text-light mt-1">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail side sheet
// ---------------------------------------------------------------------------

function EmployeeDetailPanel({ employee: e, onClose, onEdit }: { employee: HREmployee; onClose: () => void; onEdit: () => void }) {
  const qc = useQueryClient();
  const { can, adminUser } = usePermissions();
  const canEditHR = can("hr", "edit");
  const isAdmin = adminUser?.role === "super_admin" || adminUser?.role === "admin";
  const [tab, setTab] = useState<"profile" | "payslips" | "leave" | "documents" | "history">("profile");
  const [letterOpen, setLetterOpen] = useState(false);
  const [statusEdit, setStatusEdit] = useState(e.status);
  const [terminationReason, setTerminationReason] = useState(e.termination_reason || "");

  // Terminate inline form
  const [termOpen, setTermOpen] = useState(false);
  const [termDate, setTermDate] = useState(new Date().toISOString().slice(0, 10));
  const [termReason, setTermReason] = useState("");
  const [terming, setTerming] = useState(false);

  // Delete confirmation + admin verification (required when deleter isn't admin/super_admin)
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyPassword, setVerifyPassword] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifyingAdmin, setVerifyingAdmin] = useState(false);

  useEffect(() => { setStatusEdit(e.status); setTerminationReason(e.termination_reason || ""); }, [e.id, e.status, e.termination_reason]);

  const applyStatus = async () => {
    const payload: any = { status: statusEdit, updated_at: new Date().toISOString() };
    if (statusEdit === "terminated") payload.termination_reason = terminationReason.trim() || null;
    const { error } = await (supabase as any).from("hr_employees").update(payload).eq("id", e.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["hr-employees"] });
    toast.success("Status updated");
  };

  const confirmTerminate = async () => {
    setTerming(true);
    try {
      const { error } = await (supabase as any).from("hr_employees").update({
        status: "terminated",
        end_date: termDate,
        termination_reason: termReason.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", e.id);
      if (error) { toast.error(error.message); return; }
      await qc.invalidateQueries({ queryKey: ["hr-employees"] });
      toast.success("Employee marked as terminated.");
      setTermOpen(false);
    } finally {
      setTerming(false);
    }
  };

  const verifyAdmin = async () => {
    const email = verifyEmail.trim().toLowerCase();
    if (!email || !verifyPassword) { toast.error("Enter the verifying admin's email and password."); return; }
    setVerifyingAdmin(true);
    try {
      // Use a throwaway client so we don't clobber the current admin's session.
      const url = (import.meta as any).env.VITE_SUPABASE_URL;
      const key = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const verifier = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: auth, error: signErr } = await verifier.auth.signInWithPassword({ email, password: verifyPassword });
      if (signErr || !auth?.user) { toast.error("Verification failed — wrong email or password."); return; }
      const { data: row, error: roleErr } = await (verifier as any)
        .from("admin_users")
        .select("role, is_active")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      await verifier.auth.signOut();
      if (roleErr) { toast.error(roleErr.message); return; }
      if (!row || !row.is_active || (row.role !== "super_admin" && row.role !== "admin")) {
        toast.error("That account isn't a super admin or admin.");
        return;
      }
      setVerified(true);
      toast.success("Verified — you can now delete.");
    } finally {
      setVerifyingAdmin(false);
    }
  };

  const deleteEmployee = async () => {
    if (!isAdmin && !verified) { toast.error("Admin verification required."); return; }
    setDeleting(true);
    try {
      const { error } = await (supabase as any).from("hr_employees").delete().eq("id", e.id);
      if (error) { toast.error(`Could not delete employee — ${error.message}`); return; }
      await qc.invalidateQueries({ queryKey: ["hr-employees"] });
      toast.success("Employee deleted successfully");
      setConfirmDelete(false);
      setVerified(false); setVerifyEmail(""); setVerifyPassword("");
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setConfirmDelete(false);
    setVerified(false); setVerifyEmail(""); setVerifyPassword("");
  };

  const initials = e.full_name.split(" ").slice(0, 2).map(s => s[0]).join("").toUpperCase();

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="flex-1 bg-foreground/40" onClick={onClose} />
      <aside className="w-full max-w-[620px] h-full bg-background border-l border-border overflow-y-auto">
        <header className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-forest/10 text-forest flex items-center justify-center font-bold text-sm">{initials}</div>
            <div>
              <h2 className="font-bold text-sm">{e.full_name}</h2>
              <div className="text-[10px] text-text-light">{e.employee_id} · {e.job_title}</div>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold capitalize ${STATUS_COLORS[e.status] || "bg-muted text-text-med"}`}>{e.status.replace("_", " ")}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setLetterOpen(true)} className="inline-flex items-center gap-1 text-xs text-forest font-semibold hover:underline"><FileText className="w-3.5 h-3.5" /> Employment Letter</button>
            <button onClick={onEdit} className="text-xs text-forest font-semibold hover:underline">Edit</button>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
        </header>

        <nav className="flex gap-1 border-b border-border px-5 py-2">
          {(["profile","payslips","leave","documents","history"] as const).map(k => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize ${tab === k ? "bg-forest/10 text-forest" : "text-text-med hover:text-forest"}`}
            >
              {k}
            </button>
          ))}
        </nav>

        <div className="p-5 space-y-4">
          {tab === "profile" && (
            <>
              <dl className="text-xs space-y-1">
                <Row label="Department" v={e.hr_departments?.name || "—"} />
                <Row label="Employment type" v={e.employment_type} />
                <Row label="Start date" v={e.start_date} />
                <Row label="Probation end" v={e.probation_end_date || "—"} />
                <Row label="End date" v={e.end_date || "—"} />
                <Row label="Personal email" v={e.personal_email} />
                <Row label="Work email" v={e.work_email || "—"} />
                <Row label="Phone" v={e.phone || "—"} />
                <Row label="WhatsApp" v={e.whatsapp_number || "—"} />
                <Row label="Bank" v={[e.bank_name, e.bank_account_number, e.bank_account_name].filter(Boolean).join(" · ") || "—"} />
                <Row label="Basic" v={fmtN(e.basic_salary)} />
                <Row label="Housing" v={fmtN(e.housing_allowance)} />
                <Row label="Transport" v={fmtN(e.transport_allowance)} />
                <Row label="Other" v={fmtN(e.other_allowances)} />
                <Row label="Emergency" v={[e.emergency_contact_name, e.emergency_contact_phone, e.emergency_contact_relationship].filter(Boolean).join(" · ") || "—"} />
              </dl>

              <section className="border-t border-border pt-3">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-2">Status management</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={statusEdit} onChange={ev => setStatusEdit(ev.target.value as any)} className={inputCls + " max-w-[160px]"}>
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                  {statusEdit === "terminated" && (
                    <input className={inputCls + " flex-1"} placeholder="Termination reason" value={terminationReason} onChange={ev => setTerminationReason(ev.target.value)} />
                  )}
                  <button onClick={applyStatus} disabled={statusEdit === e.status && terminationReason === (e.termination_reason || "")} className="text-xs font-semibold bg-forest text-primary-foreground px-3 py-2 rounded-lg hover:bg-forest-deep disabled:opacity-40">Update status</button>
                </div>
              </section>

              {canEditHR && (
                <section className="border-t border-destructive/30 pt-3 mt-4 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                    <h3 className="text-[10px] uppercase tracking-widest font-bold text-destructive">Danger zone</h3>
                  </div>

                  {/* Terminate */}
                  {!termOpen ? (
                    <button
                      onClick={() => { setTermOpen(true); setTermDate(new Date().toISOString().slice(0, 10)); setTermReason(""); }}
                      className="inline-flex items-center gap-1.5 border border-input rounded-lg px-3 py-2 text-xs font-semibold hover:bg-muted"
                    >
                      <UserMinus className="w-3.5 h-3.5" /> Mark as Terminated
                    </button>
                  ) : (
                    <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                      <div className="grid md:grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls}>Termination date</label>
                          <input type="date" className={inputCls} value={termDate} onChange={ev => setTermDate(ev.target.value)} />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Termination reason (optional)</label>
                        <textarea rows={2} className={inputCls} value={termReason} onChange={ev => setTermReason(ev.target.value)} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setTermOpen(false)} className="text-xs text-text-med hover:text-foreground px-2 py-1">Cancel</button>
                        <button onClick={confirmTerminate} disabled={terming || !termDate} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
                          Confirm Termination
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Delete */}
                  <div>
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 bg-destructive text-destructive-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:opacity-90"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Employee
                    </button>
                  </div>

                  <p className="text-[11px] text-text-light leading-relaxed">
                    Use <b>Terminate</b> to keep employment history. Use <b>Delete</b> only to remove incorrect entries.
                  </p>
                </section>
              )}
            </>
          )}

          {tab === "payslips" && <EmployeePayslipsTab employeeId={e.id} />}
          {tab === "leave" && <EmployeeLeaveHistoryTab employeeId={e.id} />}
          {tab === "documents" && <EmployeeDocumentsTab employeeId={e.id} employeeName={e.full_name} />}
          {tab === "history" && <EmployeeHistoryTab employeeId={e.id} canEdit={canEditHR} adminId={adminUser?.id || null} />}
        </div>
      </aside>

      {letterOpen && <EmploymentLetterModal employeeId={e.id} onClose={() => setLetterOpen(false)} />}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] bg-foreground/60 flex items-center justify-center p-4" onClick={closeDeleteModal}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-5 space-y-3" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <h3 className="font-bold text-sm">Delete Employee</h3>
            </div>
            <p className="text-xs text-text-med leading-relaxed">
              This will permanently delete <b>{e.full_name}</b> and all their leave history and documents. Payslips already marked as paid are preserved in Finance. This cannot be undone.
            </p>

            {!isAdmin && (
              <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-forest" />
                  <span className="text-[11px] font-semibold">Admin verification required</span>
                </div>
                {verified ? (
                  <p className="text-[11px] text-forest">✓ Verified by <b>{verifyEmail.trim().toLowerCase()}</b>. You can now delete.</p>
                ) : (
                  <>
                    <p className="text-[11px] text-text-light leading-relaxed">
                      A super admin or admin must verify this deletion. Ask them to enter their credentials below.
                    </p>
                    <div>
                      <label className={labelCls}>Admin email</label>
                      <input type="email" className={inputCls} value={verifyEmail} onChange={ev => setVerifyEmail(ev.target.value)} autoComplete="off" />
                    </div>
                    <div>
                      <label className={labelCls}>Admin password</label>
                      <input type="password" className={inputCls} value={verifyPassword} onChange={ev => setVerifyPassword(ev.target.value)} autoComplete="off" />
                    </div>
                    <div className="flex justify-end">
                      <button onClick={verifyAdmin} disabled={verifyingAdmin || !verifyEmail.trim() || !verifyPassword} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
                        <ShieldCheck className="w-3.5 h-3.5" /> {verifyingAdmin ? "Verifying…" : "Verify"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={closeDeleteModal} disabled={deleting} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
              <button
                onClick={deleteEmployee}
                disabled={deleting || (!isAdmin && !verified)}
                className="inline-flex items-center gap-1.5 bg-destructive text-destructive-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1 border-b border-border/40 last:border-0">
      <dt className="text-text-light">{label}</dt>
      <dd className="font-medium text-right">{v}</dd>
    </div>
  );
}

function EmployeePayslipsTab({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useMyPayrollRuns(employeeId);
  if (isLoading) return <p className="text-xs text-text-light">Loading payslips…</p>;
  if (!data || data.length === 0) return <p className="text-xs text-text-light">No payslips yet.</p>;
  return (
    <ul className="text-xs space-y-1">
      {data.map(r => (
        <li key={r.id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
          <span>{MONTHS[r.pay_month - 1]} {r.pay_year}</span>
          <span className="tabular-nums">{fmtN(r.net_salary)}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-pill capitalize ${STATUS_COLORS[r.status] || "bg-muted text-text-med"}`}>{r.status}</span>
        </li>
      ))}
    </ul>
  );
}

function EmployeeLeaveHistoryTab({ employeeId }: { employeeId: string }) {
  const year = new Date().getFullYear();
  const { data: balances } = useMyLeaveBalances(employeeId, year);
  return (
    <div className="text-xs space-y-2">
      <h4 className="text-[10px] uppercase tracking-widest font-bold text-text-med">Balances ({year})</h4>
      {!balances || balances.length === 0 ? <p className="text-text-light">No balances recorded.</p> : (
        <ul>
          {balances.map(b => (
            <li key={b.id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
              <span>{b.hr_leave_types?.name || "Leave"}</span>
              <span className="tabular-nums">{(Number(b.entitled_days) - Number(b.used_days) - Number(b.pending_days)).toFixed(1)} / {Number(b.entitled_days).toFixed(0)} remaining</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmployeeDocumentsTab({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const { data } = useHRDocuments(employeeId);
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState("contract");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const save = async () => {
    if (!title.trim() || !url.trim()) { toast.error("Title and file URL required"); return; }
    const { error } = await (supabase as any).from("hr_documents").insert({
      employee_id: employeeId, document_type: docType, title: title.trim(), file_url: url.trim(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Document saved");
    setOpen(false); setTitle(""); setUrl("");
  };

  return (
    <div className="text-xs space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] uppercase tracking-widest font-bold text-text-med">Documents for {employeeName}</h4>
        {!open && <button onClick={() => setOpen(true)} className="text-forest font-semibold hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>}
      </div>
      {open && (
        <div className="border border-border rounded-lg p-2 space-y-2">
          <div className="grid md:grid-cols-2 gap-2">
            <select value={docType} onChange={e => setDocType(e.target.value)} className={inputCls}>
              {["contract","offer_letter","id_document","tax_form","pension","nhf","certificate","appraisal","other"].map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
            <input className={inputCls} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <input className={inputCls} placeholder="https://… file URL" value={url} onChange={e => setUrl(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="text-text-med hover:text-foreground">Cancel</button>
            <button onClick={save} className="bg-forest text-primary-foreground px-2 py-1 rounded font-semibold">Save</button>
          </div>
        </div>
      )}
      {(data || []).length === 0 ? <p className="text-text-light">No documents yet.</p> : (
        <ul className="space-y-1">
          {(data || []).map(d => (
            <li key={d.id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
              <span className="truncate"><span className="text-text-light">{d.document_type}</span> · {d.title}</span>
              {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" className="text-forest font-semibold hover:underline">Open ↗</a>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab (job + salary timeline)
// ---------------------------------------------------------------------------

const CHANGE_TYPES: Array<{ v: JobHistoryChangeType; label: string }> = [
  { v: "promotion",         label: "Promotion" },
  { v: "salary_review",     label: "Salary Review" },
  { v: "title_change",      label: "Title Change" },
  { v: "department_change", label: "Department Change" },
  { v: "contract_change",   label: "Contract Change" },
  { v: "status_change",     label: "Status Change" },
  { v: "hire",              label: "Hire" },
];

function EmployeeHistoryTab({ employeeId, canEdit, adminId }: { employeeId: string; canEdit: boolean; adminId: string | null }) {
  const { data = [], isLoading } = useJobHistory(employeeId);
  const insert = useInsertJobHistory();
  const [recording, setRecording] = useState(false);
  const [form, setForm] = useState<{ change_type: JobHistoryChangeType; effective_date: string; reason: string }>({
    change_type: "promotion",
    effective_date: new Date().toISOString().slice(0, 10),
    reason: "",
  });

  const save = async () => {
    if (!form.change_type || !form.effective_date) { toast.error("Change type and date required."); return; }
    try {
      await insert.mutateAsync({
        employee_id: employeeId,
        change_type: form.change_type,
        effective_date: form.effective_date,
        reason: form.reason.trim() || null,
        recorded_by: adminId,
      } as any);
      toast.success("History entry recorded");
      setRecording(false);
      setForm({ change_type: "promotion", effective_date: new Date().toISOString().slice(0, 10), reason: "" });
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] uppercase tracking-widest font-bold text-text-med inline-flex items-center gap-1.5"><HistoryIcon className="w-3.5 h-3.5" /> Job &amp; salary history</h3>
        {canEdit && !recording && (
          <button onClick={() => setRecording(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-forest hover:underline"><Plus className="w-3 h-3" /> Record Change</button>
        )}
      </div>

      {recording && (
        <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Change type</label>
              <select value={form.change_type} onChange={e => setForm(f => ({ ...f, change_type: e.target.value as JobHistoryChangeType }))} className={inputCls}>
                {CHANGE_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Effective date</label>
              <input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Reason / notes</label>
            <textarea rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className={inputCls} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setRecording(false)} className="text-xs text-text-med hover:text-foreground px-2 py-1">Cancel</button>
            <button onClick={save} disabled={insert.isPending} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
              <Save className="w-3 h-3" /> Save entry
            </button>
          </div>
          <p className="text-[10px] text-text-light">Profile updates (salary, title, department) are recorded automatically — use this form to add manual entries with context (e.g. a promotion rationale).</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-text-light">Loading history…</p>
      ) : (
        <JobHistoryTimeline entries={data} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employment letter modal
// ---------------------------------------------------------------------------

function EmploymentLetterModal({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const [data, setData] = useState<EmploymentLetterData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    generateEmploymentLetterData(employeeId)
      .then(d => { if (mounted) setData(d); })
      .catch(e => { if (mounted) setErr(e?.message || "Could not generate letter"); });
    return () => { mounted = false; };
  }, [employeeId]);

  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[92svh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10 print:hidden">
          <h3 className="font-bold text-sm inline-flex items-center gap-1.5"><FileText className="w-4 h-4" /> Employment confirmation letter</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} disabled={!data} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"><Printer className="w-3.5 h-3.5" /> Print Letter</button>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-2 sm:p-5">
          {err && <p className="text-sm text-destructive">Could not generate letter: {err}</p>}
          {!err && !data && <p className="text-sm text-text-light">Generating letter…</p>}
          {data && <EmploymentLetter data={data} />}
        </div>
      </div>
    </div>
  );
}
