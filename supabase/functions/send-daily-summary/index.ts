import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sends DIRECTLY to Resend (api.resend.com). Previously routed through the dead
// Lovable connector gateway with LOVABLE_API_KEY (401 "Credential not found").
// Only the outbound URL + credential changed.
const RESEND_URL = 'https://api.resend.com/emails';
const FROM_EMAIL  = 'BundledMum Admin <hello@bundledmum.com>';
const REPLY_TO    = 'hello@bundledmum.ng';

function parseRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const cleaned = String(raw).replace(/^\"|\"$/g, '');
  const tokens = cleaned
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const valid: string[] = [];
  const seen = new Set<string>();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const t of tokens) {
    if (!emailRegex.test(t)) continue;
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    valid.push(t);
  }
  return valid;
}

async function sendViaResend(
  recipients: string[],
  subject: string,
  html: string,
  resendKey: string
): Promise<{ ok: boolean; status: number; body: string }> {
  if (recipients.length === 0) return { ok: false, status: 0, body: 'no recipients' };
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipients,
        reply_to: [REPLY_TO],
        subject,
        html,
      }),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

function renderTemplate(
  html: string,
  subject: string,
  vars: Record<string, string>
): { html: string; subject: string } {
  let h = html;
  let s = subject;
  for (const [k, v] of Object.entries(vars)) {
    h = h.replaceAll(`{{${k}}}`, v ?? '');
    s = s.replaceAll(`{{${k}}}`, v ?? '');
  }
  return { html: h, subject: s };
}

function nairaFormat(amount: number): string {
  return '₦' + Math.round(amount).toLocaleString('en-NG');
}

function getYesterdayLagosRange(): { startUTC: string; endUTC: string; lagosDateLabel: string } {
  const now = new Date();
  const lagosNow = new Date(now.getTime() + 60 * 60 * 1000);
  const lagosYesterday = new Date(lagosNow);
  lagosYesterday.setUTCDate(lagosNow.getUTCDate() - 1);
  const y = lagosYesterday.getUTCFullYear();
  const m = lagosYesterday.getUTCMonth();
  const d = lagosYesterday.getUTCDate();
  const startUTC = new Date(Date.UTC(y, m, d, 0, 0, 0) - 60 * 60 * 1000);
  const endUTC = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - 60 * 60 * 1000);
  const label = lagosYesterday.toLocaleDateString('en-NG', {
    timeZone: 'Africa/Lagos',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString(), lagosDateLabel: label };
}

function getCurrentMonthLagosRange(): { startUTC: string } {
  const now = new Date();
  const lagosNow = new Date(now.getTime() + 60 * 60 * 1000);
  const startUTC = new Date(Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), 1, 0, 0, 0) - 60 * 60 * 1000);
  return { startUTC: startUTC.toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey      = Deno.env.get('RESEND_API_KEY');
    const supabase       = createClient(supabaseUrl, serviceRoleKey);

    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY required' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: recipientSetting } = await supabase
      .from('site_settings').select('value').eq('key', 'daily_summary_email').single();

    const rawRecipient = recipientSetting?.value;
    const recipientStr = typeof rawRecipient === 'string'
      ? rawRecipient
      : String(rawRecipient ?? '').replace(/^\"|\"$/g, '');

    let recipients = parseRecipients(recipientStr);
    if (recipients.length === 0) {
      const { data: superAdmin } = await supabase
        .from('admin_users').select('email').eq('role', 'super_admin').eq('is_active', true)
        .order('created_at', { ascending: true }).limit(1).single();
      recipients = [superAdmin?.email ?? 'iceboxx766@gmail.com'];
    }

    const { startUTC, endUTC, lagosDateLabel } = getYesterdayLagosRange();
    const { startUTC: monthStartUTC } = getCurrentMonthLagosRange();

    const { count: ordersPlaced } = await supabase
      .from('orders').select('id', { count: 'exact', head: true })
      .gte('created_at', startUTC).lte('created_at', endUTC);

    const { data: paidOrders, count: ordersPaidCount } = await supabase
      .from('orders').select('id, total', { count: 'exact' })
      .eq('payment_status', 'paid')
      .gte('created_at', startUTC).lte('created_at', endUTC);

    const revenueYesterday = (paidOrders ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0);
    const aov = (ordersPaidCount && ordersPaidCount > 0)
      ? revenueYesterday / ordersPaidCount
      : 0;

    const { count: transfersPending } = await supabase
      .from('orders').select('id', { count: 'exact', head: true })
      .eq('payment_method', 'transfer').eq('payment_status', 'pending')
      .gte('created_at', startUTC).lte('created_at', endUTC);

    const { data: mtdOrders } = await supabase
      .from('orders').select('total').eq('payment_status', 'paid').gte('created_at', monthStartUTC);

    const mtdGmv = (mtdOrders ?? []).reduce((sum, o) => sum + (o.total ?? 0), 0);

    const { data: annualTargetSetting } = await supabase
      .from('site_settings').select('value').eq('key', 'annual_gmv_target').single();

    const annualTarget = annualTargetSetting?.value
      ? Number(String(annualTargetSetting.value).replace(/[^0-9]/g, ''))
      : 1400000000;
    const monthlyTarget = Math.round(annualTarget / 12);
    const targetProgressPct = monthlyTarget > 0
      ? Math.round((mtdGmv / monthlyTarget) * 100)
      : 0;

    const { count: awaitingPick } = await supabase
      .from('orders').select('id', { count: 'exact', head: true })
      .eq('payment_status', 'paid').in('order_status', ['confirmed', 'processing']);

    const { count: outForDelivery } = await supabase
      .from('orders').select('id', { count: 'exact', head: true }).eq('order_status', 'shipped');

    const { count: returnsOpen } = await supabase
      .from('order_returns').select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'approved']);

    const { count: newCustomers } = await supabase
      .from('customers').select('id', { count: 'exact', head: true })
      .gte('account_created_at', startUTC).lte('account_created_at', endUTC);

    const { data: tmpl } = await supabase
      .from('email_templates').select('html_body, subject, is_active')
      .eq('slug', 'internal_daily_summary').single();

    if (!tmpl?.is_active) {
      return new Response(JSON.stringify({ skipped: 'template inactive' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const primaryRecipient = recipients[0];
    const vars: Record<string, string> = {
      recipient_name:    primaryRecipient.split('@')[0],
      summary_date:      lagosDateLabel,
      orders_placed:     String(ordersPlaced ?? 0),
      orders_paid:       String(ordersPaidCount ?? 0),
      transfers_pending: String(transfersPending ?? 0),
      revenue_paid:      nairaFormat(revenueYesterday),
      aov:               nairaFormat(aov),
      mtd_gmv:           nairaFormat(mtdGmv),
      monthly_target:    nairaFormat(monthlyTarget),
      target_progress:   `${targetProgressPct}%`,
      awaiting_pick:     String(awaitingPick ?? 0),
      out_for_delivery:  String(outForDelivery ?? 0),
      returns_open:      String(returnsOpen ?? 0),
      new_customers:     String(newCustomers ?? 0),
    };

    const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
    const result = await sendViaResend(recipients, subject, html, resendKey);

    return new Response(
      JSON.stringify({
        success: result.ok,
        gateway_status: result.status,
        gateway_response: result.body,
        sent_to: recipients,
        summary_date: lagosDateLabel,
        vars,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
