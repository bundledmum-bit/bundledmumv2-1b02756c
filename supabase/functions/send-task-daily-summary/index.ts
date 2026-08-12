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
  resendKey: string
): Promise<boolean> {
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "BundledMum HR <hello@bundledmum.com>",
        reply_to: ["hello@bundledmum.ng"],
        to: [to],
        subject: `[HR] ${subject}`,
        html,
      }),
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

function priorityLabel(p: string): string {
  const map: Record<string, string> = { urgent: "🔴 Urgent", high: "🟠 High", medium: "🟡 Medium", low: "🟢 Low" };
  return map[p] || p;
}
function formatDate(d: string | null): string {
  if (!d) return "No due date";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
function taskRow(t: any, showDue = true): string {
  return `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#1a1a1a;">${t.title}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#555;">${t.assignee || t.assignee_name || ""}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">${priorityLabel(t.priority)}</td>${showDue ? `<td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#888;">${formatDate(t.due_date)}</td>` : ""}${t.days_overdue !== undefined ? `<td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#dc2626;font-weight:600;">${t.days_overdue} day(s)</td>` : ""}</tr>`;
}
function buildEmail(managerName: string, done: any[], pending: any[], overdue: any[], date: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f4f7f4;font-family:Arial,sans-serif;"><div style="max-width:640px;margin:0 auto;background:#fff;"><div style="background:linear-gradient(135deg,#2D6A4F 0%,#1E5C44 100%);padding:28px 40px;"><div style="background:#FF6B6B;color:#fff;font-weight:900;font-size:20px;letter-spacing:2px;padding:8px 16px;border-radius:6px;display:inline-block;">BundledMum</div><h1 style="color:#fff;margin:14px 0 4px;font-size:20px;">Daily Task Summary</h1><p style="color:#a8d5be;margin:0;font-size:13px;">${date} &middot; 6:00 PM</p></div><div style="padding:32px 40px;"><p style="color:#1a1a1a;font-size:15px;margin:0 0 24px;">Hi ${managerName},</p><p style="color:#555;font-size:13px;margin:0 0 28px;">Here is the task summary for your team today.</p><div style="margin-bottom:28px;"><h2 style="font-size:14px;font-weight:700;color:#2D6A4F;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">${done.length > 0 ? "✅" : ""} Completed Today (${done.length})</h2>${done.length === 0 ? "<p style='color:#888;font-size:13px;margin:0;'>No tasks completed today.</p>" : `<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #eee;">TASK</th><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #eee;">ASSIGNEE</th><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #eee;">PRIORITY</th></tr></thead><tbody>${done.map(t => taskRow(t, false)).join("")}</tbody></table>`}</div>${overdue.length > 0 ? `<div style="margin-bottom:28px;background:#fff5f5;border-left:4px solid #dc2626;border-radius:4px;padding:16px 20px;"><h2 style="font-size:14px;font-weight:700;color:#dc2626;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">⚠️ Overdue (${overdue.length})</h2><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #fecaca;">TASK</th><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #fecaca;">ASSIGNEE</th><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #fecaca;">PRIORITY</th><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #fecaca;">DUE</th><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #fecaca;">DAYS LATE</th></tr></thead><tbody>${overdue.map(t => taskRow(t)).join("")}</tbody></table></div>` : ""}<div style="margin-bottom:28px;"><h2 style="font-size:14px;font-weight:700;color:#1a1a1a;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">🕐 In Progress / To Do (${pending.length})</h2>${pending.length === 0 ? "<p style='color:#888;font-size:13px;margin:0;'>All tasks are up to date.</p>" : `<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #eee;">TASK</th><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #eee;">ASSIGNEE</th><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #eee;">PRIORITY</th><th style="text-align:left;padding:8px 12px;font-size:11px;color:#888;border-bottom:2px solid #eee;">DUE</th></tr></thead><tbody>${pending.map(t => taskRow(t)).join("")}</tbody></table>`}</div><p style="color:#888;font-size:12px;margin:24px 0 0;">View all tasks at <a href="https://bundledmum.com/admin/hr/tasks" style="color:#2D6A4F;">bundledmum.com/admin/hr/tasks</a></p></div><div style="background:#1a1a1a;padding:20px 40px;text-align:center;"><p style="color:#888;font-size:12px;margin:0;">BundledMum HR &middot; Lagos, Nigeria &middot; Automated daily digest</p></div></div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey      = Deno.env.get("RESEND_API_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: summaries, error } = await supabase.rpc("get_daily_task_summary");
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!summaries || summaries.length === 0) {
      return new Response(JSON.stringify({ message: "No managers with tasks found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const dateStr = new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const results: any[] = [];

    for (const summary of summaries) {
      if (!summary.manager_email) continue;
      const done    = Array.isArray(summary.done_today)    ? summary.done_today    : [];
      const pending = Array.isArray(summary.still_pending) ? summary.still_pending : [];
      const overdue = Array.isArray(summary.overdue)       ? summary.overdue       : [];
      if (done.length === 0 && pending.length === 0 && overdue.length === 0) continue;

      const html    = buildEmail(summary.manager_name, done, pending, overdue, dateStr);
      const subject = `Task Summary for ${dateStr} — ${done.length} done, ${overdue.length} overdue, ${pending.length} pending`;
      const sent    = await sendViaResend(summary.manager_email, subject, html, resendKey);
      results.push({ manager: summary.manager_name, email: summary.manager_email, sent, done: done.length, pending: pending.length, overdue: overdue.length });
    }

    return new Response(JSON.stringify({ success: true, results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
