import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Save, User as UserIcon, FileText, Printer, History as HistoryIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useMyEmployee, useJobHistory, generateEmploymentLetterData,
  fmtN, type HREmployee, type EmploymentLetterData,
} from "@/hooks/useHR";
import EmploymentLetter from "@/components/employee-portal/EmploymentLetter";
import JobHistoryTimeline from "@/components/admin/hr/JobHistoryTimeline";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

function maskAccount(n: string | null): string {
  if (!n) return "—";
  const digits = n.replace(/\D/g, "");
  if (digits.length < 4) return digits;
  return "•".repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
}

export default function EmployeeProfile() {
  const { data: employee, isLoading } = useMyEmployee();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<HREmployee>>({});

  useEffect(() => {
    if (employee) setDraft({
      phone: employee.phone || "",
      whatsapp_number: employee.whatsapp_number || "",
      address: employee.address || "",
      emergency_contact_name: employee.emergency_contact_name || "",
      emergency_contact_phone: employee.emergency_contact_phone || "",
      emergency_contact_relationship: employee.emergency_contact_relationship || "",
    });
  }, [employee?.id]);

  const save = async () => {
    if (!employee) return;
    const { error } = await (supabase as any).from("hr_employees").update({
      phone: draft.phone?.trim() || null,
      whatsapp_number: draft.whatsapp_number?.trim() || null,
      address: draft.address?.trim() || null,
      emergency_contact_name: draft.emergency_contact_name?.trim() || null,
      emergency_contact_phone: draft.emergency_contact_phone?.trim() || null,
      emergency_contact_relationship: draft.emergency_contact_relationship?.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", employee.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["my-hr-employee"] });
    toast.success("Details updated");
    setEditing(false);
  };

  if (isLoading || !employee) {
    return <div className="text-center py-10 text-sm text-text-light">Loading your profile…</div>;
  }

  return (
    <div className="space-y-4 max-w-[680px]">
      <h1 className="pf text-xl font-bold flex items-center gap-2"><UserIcon className="w-5 h-5" /> My profile</h1>

      <section className="bg-card border border-border rounded-card p-4 space-y-1 text-sm">
        <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-1">Personal details</h2>
        <Row label="Full name" v={employee.full_name} />
        <Row label="Personal email" v={employee.personal_email} />
        <Row label="Work email" v={employee.work_email || "—"} />
        <Row label="Date of birth" v={employee.date_of_birth || "—"} />
        <Row label="Gender" v={employee.gender || "—"} />
        <Row label="State of origin" v={employee.state_of_origin || "—"} />
      </section>

      <section className="bg-card border border-border rounded-card p-4 space-y-1 text-sm">
        <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-1">Employment</h2>
        <Row label="Employee ID" v={employee.employee_id} />
        <Row label="Job title" v={employee.job_title} />
        <Row label="Department" v={employee.hr_departments?.name || "—"} />
        <Row label="Employment type" v={employee.employment_type?.replace("_", " ")} />
        <Row label="Start date" v={employee.start_date} />
        <Row label="Probation end" v={employee.probation_end_date || "—"} />
        <Row label="Status" v={employee.status.replace("_", " ")} />
        <Row label="Basic salary" v={fmtN(employee.basic_salary)} />
        <Row label="Housing" v={fmtN(employee.housing_allowance)} />
        <Row label="Transport" v={fmtN(employee.transport_allowance)} />
        <Row label="Other allowances" v={fmtN(employee.other_allowances)} />
      </section>

      <section className="bg-card border border-border rounded-card p-4 space-y-1 text-sm">
        <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-1">Banking (view only)</h2>
        <Row label="Bank" v={employee.bank_name || "—"} />
        <Row label="Account number" v={maskAccount(employee.bank_account_number)} />
        <Row label="Account name" v={employee.bank_account_name || "—"} />
      </section>

      <section className="bg-card border border-border rounded-card p-4 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med">Contact & emergency</h2>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-xs font-semibold text-forest hover:underline">
              Update my details
            </button>
          )}
        </div>

        {!editing ? (
          <>
            <Row label="Phone" v={employee.phone || "—"} />
            <Row label="WhatsApp" v={employee.whatsapp_number || "—"} />
            <Row label="Address" v={employee.address || "—"} />
            <Row label="Emergency name" v={employee.emergency_contact_name || "—"} />
            <Row label="Emergency phone" v={employee.emergency_contact_phone || "—"} />
            <Row label="Emergency relationship" v={employee.emergency_contact_relationship || "—"} />
          </>
        ) : (
          <div className="space-y-2">
            <div className="grid md:grid-cols-2 gap-2">
              <Field label="Phone"><input className={inputCls} value={draft.phone || ""} onChange={e => setDraft({ ...draft, phone: e.target.value })} /></Field>
              <Field label="WhatsApp"><input className={inputCls} value={draft.whatsapp_number || ""} onChange={e => setDraft({ ...draft, whatsapp_number: e.target.value })} /></Field>
              <Field label="Address" full><textarea rows={2} className={inputCls} value={draft.address || ""} onChange={e => setDraft({ ...draft, address: e.target.value })} /></Field>
              <Field label="Emergency name"><input className={inputCls} value={draft.emergency_contact_name || ""} onChange={e => setDraft({ ...draft, emergency_contact_name: e.target.value })} /></Field>
              <Field label="Emergency phone"><input className={inputCls} value={draft.emergency_contact_phone || ""} onChange={e => setDraft({ ...draft, emergency_contact_phone: e.target.value })} /></Field>
              <Field label="Emergency relationship"><input className={inputCls} value={draft.emergency_contact_relationship || ""} onChange={e => setDraft({ ...draft, emergency_contact_relationship: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-text-med hover:text-foreground px-2 py-1">Cancel</button>
              <button onClick={save} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep"><Save className="w-3.5 h-3.5" /> Save</button>
            </div>
            <p className="text-[10px] text-text-light">Salary, job title, and department are managed by HR — contact them to update those.</p>
          </div>
        )}
      </section>

      <MyHistorySection employeeId={employee.id} />

      <RequestLetterSection employeeId={employee.id} />
    </div>
  );
}

function MyHistorySection({ employeeId }: { employeeId: string }) {
  const { data = [], isLoading } = useJobHistory(employeeId);
  return (
    <section className="bg-card border border-border rounded-card p-4 space-y-3 text-sm">
      <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-1 flex items-center gap-1.5"><HistoryIcon className="w-3.5 h-3.5" /> My history</h2>
      {isLoading ? (
        <p className="text-xs text-text-light">Loading…</p>
      ) : (
        <JobHistoryTimeline entries={data} hideSensitive />
      )}
    </section>
  );
}

function RequestLetterSection({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<EmploymentLetterData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setData(null); setErr(null);
    generateEmploymentLetterData(employeeId)
      .then(d => { if (mounted) setData(d); })
      .catch(e => { if (mounted) setErr(e?.message || "Could not generate letter"); });
    return () => { mounted = false; };
  }, [open, employeeId]);

  return (
    <section className="bg-card border border-border rounded-card p-4 text-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-[10px] uppercase tracking-widest font-bold text-text-med mb-1 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Employment letter</h2>
          <p className="text-xs text-text-light">Generate a confirmation-of-employment letter for visa, loan, or rental use.</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep">
          <FileText className="w-3.5 h-3.5" /> Request Employment Letter
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-foreground/60 flex items-center justify-center p-4 print:bg-transparent print:p-0 max-md:items-end max-md:p-0" onClick={() => setOpen(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[92svh] overflow-y-auto print:max-w-none print:border-0 max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10 print:hidden">
              <h3 className="font-bold text-sm inline-flex items-center gap-1.5"><FileText className="w-4 h-4" /> Employment confirmation letter</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => window.print()} disabled={!data} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"><Printer className="w-3.5 h-3.5" /> Print / Save as PDF</button>
                <button onClick={() => setOpen(false)} className="text-xs text-text-med hover:text-foreground px-2 py-1">Close</button>
              </div>
            </div>
            <div className="p-2 sm:p-5">
              {err && <p className="text-sm text-destructive">Could not generate letter: {err}</p>}
              {!err && !data && <p className="text-sm text-text-light">Generating letter…</p>}
              {data && <EmploymentLetter data={data} />}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ label, v }: { label: string; v: string }) {
  return <div className="flex items-start justify-between gap-2 py-1 border-b border-border/40 last:border-0"><dt className="text-text-light">{label}</dt><dd className="font-medium text-right">{v}</dd></div>;
}
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}
