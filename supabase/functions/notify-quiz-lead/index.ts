import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Sends DIRECTLY to Resend (api.resend.com). Previously routed through the dead
// Lovable connector gateway with LOVABLE_API_KEY (401 "Credential not found").
// Only the outbound URL + credential changed.
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

// Normalize a phone/WhatsApp number to wa.me format (intl digits, no plus/leading zero).
function waNumber(raw: unknown): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '234' + d.slice(1);
  else if (d.startsWith('234')) { /* already intl */ }
  else if (d.length === 10) d = '234' + d;
  return d;
}

function json(body: Record<string, unknown>, status = 200) {
  console.log('[notify-quiz-lead] RESPONSE:', JSON.stringify(body));
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ sent: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    console.log('[notify-quiz-lead] INPUT:', JSON.stringify(body));

    let sessionId: string | undefined = body?.session_id;
    const testMode: boolean = body?.test_mode === true;

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };

    // TEST MODE: find most recent lead WITH WhatsApp server-side, bypass already_sent
    if (testMode) {
      console.log('[notify-quiz-lead] TEST MODE active');
      const testLeadRes = await fetch(
        `${SUPABASE_URL}/rest/v1/quiz_customers?whatsapp_number=not.is.null&order=created_at.desc&limit=1&select=session_id`,
        { headers }
      );
      const testLeads = await testLeadRes.json();
      console.log('[notify-quiz-lead] test mode lookup result:', JSON.stringify(testLeads));
      if (!Array.isArray(testLeads) || testLeads.length === 0) {
        return json({ sent: false, reason: 'no_leads_with_whatsapp_for_test' });
      }
      sessionId = testLeads[0].session_id;
      // Clear notification_sent_at so test can resend
      await fetch(
        `${SUPABASE_URL}/rest/v1/quiz_customers?session_id=eq.${encodeURIComponent(sessionId!)}`,
        { method: 'PATCH', headers, body: JSON.stringify({ notification_sent_at: null }) }
      );
      console.log('[notify-quiz-lead] test mode session_id resolved:', sessionId);
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return json({ sent: false, reason: 'missing_session_id' }, 400);
    }

    // Fetch lead + settings in parallel
    console.log('[notify-quiz-lead] fetching lead + settings for session:', sessionId);
    const [leadRes, settingsRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/quiz_customers?session_id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`,
        { headers }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/site_settings?key=in.(quiz_lead_notification_email,quiz_lead_notification_enabled)&select=key,value`,
        { headers }
      ),
    ]);

    const leads = await leadRes.json();
    const settings = await settingsRes.json();
    console.log('[notify-quiz-lead] leads found:', leads?.length);
    console.log('[notify-quiz-lead] settings raw:', JSON.stringify(settings));

    if (!Array.isArray(leads) || leads.length === 0) {
      return json({ sent: false, reason: 'lead_not_found', session_id: sessionId });
    }
    const lead = leads[0];
    console.log('[notify-quiz-lead] lead has whatsapp:', !!lead.whatsapp_number, 'notif_sent_at:', lead.notification_sent_at);

    // Guards (skip already_sent guard in test mode)
    if (!testMode && lead.notification_sent_at) {
      return json({ sent: false, reason: 'already_sent', sent_at: lead.notification_sent_at });
    }
    if (!lead.whatsapp_number) {
      return json({ sent: false, reason: 'no_whatsapp', lead_id: lead.id });
    }

    // Parse settings
    const settingsMap: Record<string, unknown> = {};
    for (const s of settings) settingsMap[s.key] = s.value;
    console.log('[notify-quiz-lead] settings parsed:', JSON.stringify(settingsMap));

    const enabled = settingsMap.quiz_lead_notification_enabled === true;
    const recipientRaw = settingsMap.quiz_lead_notification_email;
    const recipient = typeof recipientRaw === 'string' ? recipientRaw.trim() : '';
    console.log('[notify-quiz-lead] enabled:', enabled, 'recipient:', recipient);

    if (!enabled) {
      return json({ sent: false, reason: 'notifications_disabled' });
    }
    if (!recipient || !recipient.includes('@')) {
      return json({ sent: false, reason: 'no_valid_recipient', recipient });
    }

    // Build email content
    const whatsapp = esc(lead.whatsapp_number);
    const budgetTier = esc(lead.budget_tier ?? '(not set)');
    const scope = esc(lead.scope ?? '(not set)');
    const stage = esc(lead.stage ?? '(not set)');
    const shopper = esc(lead.shopper_type ?? '(not set)');
    const giftSub = esc(lead.full_answers?.gift_subcategory ?? '');
    const budgetAmount = typeof lead.full_answers?.budget === 'number' ? lead.full_answers.budget : null;
    const budgetDisplay = budgetAmount ? `₦${budgetAmount.toLocaleString('en-NG')}` : '(not set)';
    const submittedAt = new Date(lead.created_at).toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // Pre-filled WhatsApp help message (staff -> lead), references the quiz.
    const custWa = waNumber(lead.whatsapp_number);
    const waMessage = "Hi! This is BundledMum. We saw you took our quiz and we are happy to help you find the right bundle for your needs. Would you like us to help you get started?";
    const waUrl = `https://wa.me/${custWa}?text=${encodeURIComponent(waMessage)}`;

    const subject = `🎯 New Quiz Lead — ${whatsapp} (${budgetTier})`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:white;">
    <div style="background:linear-gradient(135deg,#2D6A4F 0%,#1E5C44 100%);padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:white;font-size:24px;font-weight:bold;">🎯 New Quiz Lead</h1>
      <p style="margin:8px 0 0;color:#E8F5E9;font-size:14px;">A new mum just finished the quiz and shared her WhatsApp.</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;font-size:15px;color:#1A1A1A;">
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:bold;width:140px;">WhatsApp</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${whatsapp}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:bold;">Budget</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${esc(budgetDisplay)} <span style="color:#777;">(${budgetTier})</span></td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:bold;">Scope</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${scope}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:bold;">Stage</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${stage}</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:bold;">Shopper</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${shopper}</td></tr>
        ${giftSub ? `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:bold;">Gift Category</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${giftSub}</td></tr>` : ''}
        <tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:bold;">Submitted</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${esc(submittedAt)} (Lagos time)</td></tr>
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="${esc(waUrl)}" style="display:inline-block;padding:14px 40px;background:#25D366;color:white;text-decoration:none;border-radius:100px;font-weight:bold;font-size:15px;">💬 Chat on WhatsApp</a>
        <div style="font-size:12px;color:#A0A0A0;margin-top:10px;">Opens a chat to ${whatsapp} with a friendly message ready to send.</div>
      </div>
      <div style="margin-top:20px;text-align:center;">
        <a href="https://bundledmum.com/admin/quiz-leads" style="display:inline-block;padding:12px 28px;background:#2D6A4F;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">View in Admin →</a>
      </div>
    </div>
    <div style="background:#1A1A1A;padding:16px 24px;text-align:center;">
      <p style="margin:0;color:#999;font-size:12px;">Automated notification from BundledMum.</p>
    </div>
  </div>
</body></html>`;

    // Send directly to Resend
    console.log('[notify-quiz-lead] calling resend with recipient:', recipient);
    const gatewayRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'BundledMum <hello@bundledmum.com>',
        to: [recipient],
        reply_to: ['hello@bundledmum.ng'],
        subject,
        html,
      }),
    });

    const gatewayBody = await gatewayRes.json().catch(() => ({}));
    const sent = gatewayRes.ok;
    console.log('[notify-quiz-lead] resend status:', gatewayRes.status, 'ok:', sent, 'body:', JSON.stringify(gatewayBody));

    // Mark sent (only if successful, to allow retry on failure)
    if (sent) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/quiz_customers?session_id=eq.${encodeURIComponent(sessionId)}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ notification_sent_at: new Date().toISOString() }),
        }
      );
    }

    return json({
      sent,
      recipient,
      lead_id: lead.id,
      session_id: sessionId,
      test_mode: testMode,
      gateway_status: gatewayRes.status,
      gateway_response: gatewayBody,
    });
  } catch (err) {
    console.error('[notify-quiz-lead] ERROR:', err);
    return json({ sent: false, error: String(err) }, 500);
  }
});
