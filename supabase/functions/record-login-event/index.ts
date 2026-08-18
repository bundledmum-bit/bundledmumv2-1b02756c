import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';
const BM_WA = '2347040667424';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function alertEmail(deviceLabel: string, when: string): string {
  return `<div style="background:#FFF8F4;padding:24px 12px;font-family:Lato,Helvetica,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:600px;margin:0 auto">
<div style="background:#2D6A4F;border-radius:16px 16px 0 0;padding:26px 24px;text-align:center">
<img src="${LOGO}" alt="BundledMum" width="150" style="display:block;margin:0 auto 8px;max-width:150px;height:auto" />
</div>
<div style="background:#ffffff;padding:28px 24px">
<h1 style="margin:0 0 12px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:22px">New sign-in to your account</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#444">Your BundledMum account was just signed into from a device we have not seen before.</p>
<div style="background:#FFF8F4;border-radius:12px;padding:16px 18px;margin:0 0 20px">
<p style="margin:0 0 6px;font-size:13px;color:#666">Device</p>
<p style="margin:0 0 12px;font-size:14px">${esc(deviceLabel)}</p>
<p style="margin:0 0 6px;font-size:13px;color:#666">When</p>
<p style="margin:0;font-size:14px">${esc(when)}</p>
</div>
<div style="background:#FDE8DF;border-radius:12px;padding:16px 18px">
<p style="margin:0;font-size:14px;line-height:1.65;color:#6b3a26"><strong>Was this you?</strong> If yes, no action needed. If you do not recognise this, message us on WhatsApp right away so we can help secure your account.</p>
</div>
<div style="text-align:center;margin:24px 0 4px">
<a href="https://wa.me/${BM_WA}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:15px;padding:13px 26px;border-radius:12px">This was not me</a>
</div>
</div>
<div style="background:#1A1A1A;border-radius:0 0 16px 16px;padding:18px 24px;text-align:center">
<p style="margin:0;color:#888;font-size:11px">BundledMum, Lagos, Nigeria.</p>
</div>
</div></div>`;
}

// Called right after a magic-link sign-in completes. Records the device every
// time, but only alerts when this customer already had a PRIOR sign-in before
// this device appeared. A person's very first device is not a suspicious new
// device, it is simply them, there is nothing yet to compare it against.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: 'Not authenticated' }, 401);

    const { device_fingerprint, user_agent } = await req.json().catch(() => ({}));
    if (!device_fingerprint) return json({ error: 'device_fingerprint is required' }, 400);

    const { data: customer } = await admin
      .from('customers')
      .select('id, email, full_name')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();
    if (!customer) return json({ skipped: 'no customer record' });

    // has this customer EVER signed in before, on any device at all
    const { count: priorLoginCount } = await admin
      .from('customer_login_events')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id);

    const isFirstEverSignIn = (priorLoginCount ?? 0) === 0;

    const { data: seenBefore } = await admin
      .from('customer_login_events')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('device_fingerprint', device_fingerprint)
      .limit(1)
      .maybeSingle();

    const isUnrecognisedDevice = !seenBefore;

    // record every sign-in regardless, this is the audit trail
    await admin.from('customer_login_events').insert({
      customer_id: customer.id,
      device_fingerprint,
      user_agent: user_agent ?? null,
      is_new_device: isUnrecognisedDevice,
    });

    // only alert when there was a genuine PRIOR baseline to differ from,
    // never on the account's very first sign-in
    if (isFirstEverSignIn || !isUnrecognisedDevice) {
      return json({ recorded: true, new_device: isUnrecognisedDevice, alerted: false, first_ever_signin: isFirstEverSignIn });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey || !customer.email) return json({ recorded: true, new_device: true, alerted: false, email_sent: false });

    const deviceLabel = user_agent ? String(user_agent).slice(0, 120) : 'Unknown device';
    const when = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'BundledMum <hello@bundledmum.com>',
        to: [customer.email],
        subject: 'New sign-in to your BundledMum account',
        html: alertEmail(deviceLabel, when),
      }),
    });

    return json({ recorded: true, new_device: true, alerted: true, email_sent: res.ok });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
