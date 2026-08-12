import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sends DIRECTLY to Resend (api.resend.com). Previously routed through the dead
// Lovable connector gateway with LOVABLE_API_KEY (401 "Credential not found").
// Only the outbound URL + credential changed.
const RESEND_URL = "https://api.resend.com/emails";

async function sendViaResend(
  to: string, subject: string, html: string,
  resendKey: string,
  from = "BundledMum <hello@bundledmum.com>",
  replyTo = "hello@bundledmum.ng"
): Promise<boolean> {
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({ from, reply_to: [replyTo], to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error("Resend error:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend fetch error:", err);
    return false;
  }
}

async function sendInternal(
  to: string, subject: string, html: string,
  resendKey: string
): Promise<boolean> {
  return sendViaResend(
    to,
    `[HR] ${subject}`,
    html,
    resendKey,
    "BundledMum HR <hello@bundledmum.com>",
    "hello@bundledmum.ng"
  );
}

function employeeEmail(emp: { work_email?: string | null; personal_email: string }): string {
  return (emp.work_email && emp.work_email.trim() !== "") ? emp.work_email : emp.personal_email;
}

function nairaFormat(kobo: number): string {
  return "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 });
}

function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString("en-NG", { month: "long" });
}

function fmtDate(d: string | null): string {
  if (!d) return "No due date";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

function renderTemplate(html: string, subject: string, vars: Record<string, string>): { html: string; subject: string } {
  let h = html; let s = subject;
  for (const [k, v] of Object.entries(vars)) {
    h = h.replaceAll(`{{${k}}}`, v ?? "");
    s = s.replaceAll(`{{${k}}}`, v ?? "");
  }
  h = h.replace(/\{\{#if [^}]+\}\}[\s\S]*?\{\{\/if\}\}/g, (match) => {
    const varMatch = match.match(/\{\{#if ([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/);
    if (!varMatch) return "";
    return vars[varMatch[1].trim()] ? varMatch[2] : "";
  });
  return { html: h, subject: s };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { notification_type, payroll_run_id, leave_request_id, task_id } = body;

    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey      = Deno.env.get("RESEND_API_KEY")!;
    const supabase       = createClient(supabaseUrl, serviceRoleKey);

    if (notification_type === "payslip" && payroll_run_id) {
      const { data: run, error } = await supabase.from("hr_payroll_runs").select("*, hr_employees(full_name, personal_email, work_email)").eq("id", payroll_run_id).single();
      if (error || !run) return new Response(JSON.stringify({ error: "Payroll run not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: tmpl } = await supabase.from("email_templates").select("html_body, subject, is_active").eq("slug", "payslip_notification").single();
      if (!tmpl?.is_active) return new Response(JSON.stringify({ skipped: "template inactive" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const emp = run.hr_employees;
      const vars: Record<string, string> = {
        employee_name: emp.full_name, pay_month: monthName(run.pay_month), pay_year: String(run.pay_year),
        basic_salary: nairaFormat(run.basic_salary), housing_allowance: nairaFormat(run.housing_allowance),
        transport_allowance: nairaFormat(run.transport_allowance), other_allowances: nairaFormat(run.other_allowances),
        gross_salary: nairaFormat(run.gross_salary), paye_tax: nairaFormat(run.paye_tax),
        employee_pension: nairaFormat(run.employee_pension), nhf_deduction: nairaFormat(run.nhf_deduction),
        net_salary: nairaFormat(run.net_salary),
        payment_date: run.payment_date ? new Date(run.payment_date).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" }) : "N/A",
        payment_method: run.payment_method === "bank_transfer" ? "Bank Transfer" : "Cash",
      };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const toEmail = employeeEmail(emp);
      const sent = await sendInternal(toEmail, subject, html, resendKey);
      if (sent) await supabase.from("hr_payroll_runs").update({ notification_sent: true }).eq("id", payroll_run_id);
      return new Response(JSON.stringify({ success: sent, sent_to: toEmail }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (notification_type === "leave_status" && leave_request_id) {
      const { data: ld } = await supabase.from("hr_leave_requests").select("*, hr_employees(full_name, personal_email, work_email), hr_leave_types(name)").eq("id", leave_request_id).single();
      if (!ld) return new Response(JSON.stringify({ error: "Leave request not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: tmpl } = await supabase.from("email_templates").select("html_body, subject, is_active").eq("slug", "leave_status_update").single();
      if (!tmpl?.is_active) return new Response(JSON.stringify({ skipped: "template inactive" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const statusLabels: Record<string, string> = { pending_manager: "Pending Manager Approval", pending_hr: "Approved by Manager — Awaiting HR", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" };
      const statusNotes: Record<string, string> = { approved: "Your leave has been fully approved. Please ensure your tasks are handed over before your leave starts.", rejected: ld.rejection_reason ? `Reason: ${ld.rejection_reason}` : "Your leave request was not approved. Please speak to your line manager or HR.", pending_hr: "Your manager has approved your request. It is now with HR for final review.", cancelled: "Your leave request has been cancelled." };
      const vars: Record<string, string> = { employee_name: ld.hr_employees.full_name, leave_type: ld.hr_leave_types.name, status_label: statusLabels[ld.status] || ld.status, start_date: fmtDate(ld.start_date), end_date: fmtDate(ld.end_date), days_count: String(ld.days_count), status_notes: statusNotes[ld.status] || "" };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const toEmail = employeeEmail(ld.hr_employees);
      const sent = await sendInternal(toEmail, subject, html, resendKey);
      return new Response(JSON.stringify({ success: sent, sent_to: toEmail }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (notification_type === "leave_manager_alert" && leave_request_id) {
      const { data: ld } = await supabase.from("hr_leave_requests").select("*, hr_employees!hr_leave_requests_employee_id_fkey(full_name, job_title, line_manager_id), hr_leave_types(name)").eq("id", leave_request_id).single();
      if (!ld?.hr_employees?.line_manager_id) return new Response(JSON.stringify({ skipped: "no line manager" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: manager } = await supabase.from("hr_employees").select("full_name, personal_email, work_email").eq("id", ld.hr_employees.line_manager_id).single();
      if (!manager) return new Response(JSON.stringify({ skipped: "manager not found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const managerEmail = employeeEmail(manager);
      const subj = `Leave Request from ${ld.hr_employees.full_name}`;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FFF8F4;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF8F4;"><tr><td align="center" style="padding:24px 16px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);"><tr><td style="background:linear-gradient(135deg,#2D6A4F 0%,#1E5C44 100%);padding:32px 40px;text-align:center;"><img src="https://bundledmum.com/images/BM-LOGO-CORAL.png" alt="BundledMum" width="180" style="display:block;margin:0 auto 16px;"/><div style="font-size:28px;font-weight:900;color:#FFFFFF;line-height:1.2;">Leave Approval Required</div></td></tr><tr><td style="padding:32px;"><p style="font-size:14px;color:#555;">Hi ${manager.full_name}, please review this leave request from ${ld.hr_employees.full_name}.</p><table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;"><tr><td style="background:#D8EFE5;padding:12px 20px;font-size:14px;font-weight:800;color:#2D6A4F;">Leave Details</td></tr><tr><td style="padding:16px 20px;font-size:14px;color:#1A1A1A;line-height:2;">Employee: <strong>${ld.hr_employees.full_name}</strong><br/>Leave Type: <strong>${ld.hr_leave_types.name}</strong><br/>From: <strong>${fmtDate(ld.start_date)}</strong> to <strong>${fmtDate(ld.end_date)}</strong><br/>Duration: <strong>${ld.days_count} day(s)</strong>${ld.reason ? `<br/>Reason: <em>${ld.reason}</em>` : ""}</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center"><a href="https://bundledmum.com/admin/hr/leave" style="display:inline-block;background:#2D6A4F;color:#FFFFFF;font-size:15px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:100px;">Review Leave Request</a></td></tr></table></td></tr><tr><td style="background:#1A1A1A;padding:28px 32px;text-align:center;"><div style="font-size:13px;color:rgba(255,255,255,0.5);">BundledMum HR &middot; Lagos, Nigeria</div></td></tr></table></td></tr></table></body></html>`;
      const sent = await sendInternal(managerEmail, subj, html, resendKey);
      return new Response(JSON.stringify({ success: sent, sent_to: managerEmail }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (notification_type === "task_assigned" && task_id) {
      const { data: task, error } = await supabase.from("hr_tasks").select(`id, title, description, priority, due_date,
          assignee:hr_employees!assigned_to(full_name, personal_email, work_email),
          assigner_emp:hr_employees!assigned_by_employee(full_name),
          assigner_admin:admin_users!assigned_by_admin(display_name)`).eq("id", task_id).single();
      if (error || !task || !task.assignee) return new Response(JSON.stringify({ error: "Task or assignee not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: tmpl } = await supabase.from("email_templates").select("html_body, subject, is_active").eq("slug", "task_assigned").single();
      if (!tmpl?.is_active) return new Response(JSON.stringify({ skipped: "template inactive" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const assignerName = task.assigner_emp?.full_name || task.assigner_admin?.display_name || "Management";
      const priorityLabel: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
      const vars: Record<string, string> = {
        employee_name: task.assignee.full_name, task_title: task.title,
        task_description: task.description || "No description provided.",
        priority: priorityLabel[task.priority] || task.priority,
        due_date: task.due_date ? fmtDate(task.due_date) : "No due date",
        assigned_by: assignerName,
      };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const toEmail = employeeEmail(task.assignee);
      const sent = await sendInternal(toEmail, subject, html, resendKey);
      return new Response(JSON.stringify({ success: sent, sent_to: toEmail }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (notification_type === "task_completed" && task_id) {
      const { data: task, error } = await supabase.from("hr_tasks").select(`id, title, description, priority, due_date, completed_at, completion_notes,
          assigned_by_employee, assigned_by_admin,
          assignee:hr_employees!assigned_to(id, full_name, line_manager_id, personal_email, work_email),
          assigner_emp:hr_employees!assigned_by_employee(full_name)`).eq("id", task_id).single();
      if (error || !task || !task.assignee) return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      let managerId: string | null = null;
      if (task.assigned_by_employee && task.assigned_by_employee !== task.assignee.id) managerId = task.assigned_by_employee;
      else if (task.assignee.line_manager_id) managerId = task.assignee.line_manager_id;
      let managerEmail: string | null = null;
      let managerName = "Manager";
      if (managerId) {
        const { data: mgr } = await supabase.from("hr_employees").select("full_name, personal_email, work_email").eq("id", managerId).single();
        if (mgr) { managerEmail = employeeEmail(mgr); managerName = mgr.full_name; }
      } else if (task.assigned_by_admin) {
        const { data: adminUser } = await supabase.from("admin_users").select("display_name, email").eq("id", task.assigned_by_admin).single();
        if (adminUser) { managerEmail = adminUser.email; managerName = adminUser.display_name; }
      }
      if (!managerEmail) return new Response(JSON.stringify({ skipped: "no manager to notify" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: tmpl } = await supabase.from("email_templates").select("html_body, subject, is_active").eq("slug", "task_completed_manager").single();
      if (!tmpl?.is_active) return new Response(JSON.stringify({ skipped: "template inactive" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      let originLabel = "Self-assigned task";
      if (task.assigned_by_employee && task.assigned_by_employee !== task.assignee.id) originLabel = `Assigned by ${task.assigner_emp?.full_name || "manager"}`;
      else if (task.assigned_by_admin) originLabel = "Assigned by admin";
      const vars: Record<string, string> = {
        manager_name: managerName, employee_name: task.assignee.full_name,
        task_title: task.title, task_description: task.description || "",
        origin_label: originLabel,
        completed_at: task.completed_at ? new Date(task.completed_at).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Just now",
        completion_notes: task.completion_notes || "",
      };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const sent = await sendInternal(managerEmail, subject, html, resendKey);
      return new Response(JSON.stringify({ success: sent, sent_to: managerEmail }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid notification_type or missing required id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
