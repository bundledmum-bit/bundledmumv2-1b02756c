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

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  resendKey: string
): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        reply_to: [REPLY_TO],
        to: [to],
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

function lagosTime(): string {
  return new Date().toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function buildEmail(headline: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FFF8F4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF8F4;">
<tr><td align="center" style="padding:24px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0"
  style="max-width:600px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#2D6A4F 0%,#1E5C44 100%);padding:32px 40px;text-align:center;">
  <img src="https://bundledmum.com/images/BM-LOGO-CORAL.png" alt="BundledMum" width="180"
    style="display:block;margin:0 auto 16px;"/>
  <div style="font-size:24px;font-weight:900;color:#FFFFFF;">${headline}</div>
  <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:6px;">Internal Admin Notification</div>
</td></tr>
<tr><td style="padding:32px;">${bodyHtml}</td></tr>
<tr><td style="background:#1A1A1A;padding:24px 32px;text-align:center;">
  <div style="font-size:12px;color:rgba(255,255,255,0.4);">BundledMum Admin &middot; Internal notification &middot; Do not reply</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      type, description, action, table_name,
      requester_name, reviewer_name,
      approved, note,
      requester_email, super_admin_email,
    } = body;

    const resendKey  = Deno.env.get('RESEND_API_KEY');

    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY required' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let to: string;
    let subject: string;
    let headline: string;
    let bodyHtml: string;

    if (type === 'new_request') {
      to = super_admin_email;
      subject = `[Action required] ${description}`;
      headline = 'New Approval Request';
      bodyHtml = `
        <p style="font-size:15px;color:#1A1A1A;margin:0 0 16px;">Hi Marvellous,</p>
        <p style="font-size:14px;color:#555;margin:0 0 24px;">
          <strong>${requester_name}</strong> has submitted a request that requires your approval.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;">
          <tr><td style="background:#D8EFE5;padding:12px 20px;font-size:14px;font-weight:800;color:#2D6A4F;">Request Details</td></tr>
          <tr><td style="padding:16px 20px;font-size:14px;color:#1A1A1A;line-height:2;">
            Action: <strong>${action?.toUpperCase()}</strong><br/>
            Table: <strong>${table_name}</strong><br/>
            Description: <strong>${description}</strong><br/>
            Requested at: <strong>${lagosTime()}</strong>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
          <tr><td align="center">
            <a href="https://bundledmum.com/admin/approvals"
              style="display:inline-block;background:#2D6A4F;color:#FFFFFF;font-size:15px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:100px;">Review Request</a>
          </td></tr>
        </table>`;

    } else if (type === 'outcome') {
      to = requester_email;
      const outcomeWord = approved ? 'approved' : 'rejected';
      subject = `[Request ${outcomeWord}] ${description}`;
      headline = approved ? 'Request Approved ✅' : 'Request Rejected ❌';
      bodyHtml = `
        <p style="font-size:15px;color:#1A1A1A;margin:0 0 16px;">Hi,</p>
        <p style="font-size:14px;color:#555;margin:0 0 24px;">
          Your request has been <strong>${outcomeWord}</strong> by <strong>${reviewer_name}</strong>.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;">
          <tr><td style="background:#D8EFE5;padding:12px 20px;font-size:14px;font-weight:800;color:#2D6A4F;">Request Details</td></tr>
          <tr><td style="padding:16px 20px;font-size:14px;color:#1A1A1A;line-height:2;">
            Description: <strong>${description}</strong><br/>
            Decision: <strong>${approved ? '✅ Approved' : '❌ Rejected'}</strong><br/>
            ${note ? 'Note: <strong>' + note + '</strong><br/>' : ''}
            Reviewed at: <strong>${lagosTime()}</strong>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <a href="https://bundledmum.com/admin/approvals"
              style="display:inline-block;background:#2D6A4F;color:#FFFFFF;font-size:15px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:100px;">View in Admin</a>
          </td></tr>
        </table>`;

    } else {
      return new Response(
        JSON.stringify({ error: 'Unknown notification type. Use: new_request or outcome' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = buildEmail(headline, bodyHtml);
    const result = await sendViaResend(to, subject, html, resendKey);

    return new Response(
      JSON.stringify({
        success: result.ok,
        gateway_status: result.status,
        gateway_response: result.body,
        sent_to: to,
        type,
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
