import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const SITE = 'https://bundledmum.com';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

function signinEmailHtml(actionLink: string): string {
  return `<div style="background:#FFF8F4;padding:24px 12px;font-family:Lato,Helvetica,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:600px;margin:0 auto">
<div style="background:#2D6A4F;border-radius:16px 16px 0 0;padding:26px 24px;text-align:center">
<img src="${LOGO}" alt="BundledMum" width="150" style="display:block;margin:0 auto 8px;max-width:150px;height:auto" />
</div>
<div style="background:#ffffff;padding:28px 24px">
<h1 style="margin:0 0 10px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:22px">Sign in to your account</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#444">You asked us for help signing in. Tap below to sign in, no password needed.</p>
<a href="${actionLink}" style="display:block;background:#F4845F;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center">Sign in now</a>
<p style="margin:20px 0 0;font-size:12.5px;line-height:1.6;color:#777">If you did not ask for this, you can safely ignore this email.</p>
</div>
<div style="background:#1A1A1A;border-radius:0 0 16px 16px;padding:18px 24px;text-align:center">
<p style="margin:0;color:#888;font-size:11px">BundledMum, Lagos, Nigeria.</p>
</div>
</div></div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated' }, 401);

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await callerClient.auth.getUser();
    if (!userData?.user) return json({ error: 'Not authenticated' }, 401);

    const { data: isAdmin } = await callerClient.rpc('has_admin_permission', { p_section: 'marketplace', p_action: 'manage' });
    if (isAdmin !== true) return json({ error: 'Not permitted' }, 403);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: adminRow } = await admin.from('admin_users').select('id').eq('auth_user_id', userData.user.id).maybeSingle();

    const { action, customer_id, new_email, context } = await req.json().catch(() => ({}));
    if (!action || !customer_id) return json({ error: 'action and customer_id are required' }, 400);

    // The same customer record can need either destination. A seller having
    // marketplace trouble must land in the marketplace, not the storefront
    // account page, that mismatch would look exactly like "the link did not
    // work" even though it did. Caller states which surface this is for.
    const redirectTo = context === 'marketplace' ? `${SITE}/marketplace` : `${SITE}/account`;

    const { data: customer } = await admin.from('customers').select('id, email, auth_user_id').eq('id', customer_id).maybeSingle();
    if (!customer) return json({ error: 'Customer not found' }, 404);

    const log = async (extra: Record<string, unknown>) => {
      await admin.from('marketplace_signin_assistance_log').insert({
        admin_id: adminRow?.id ?? null,
        customer_id,
        action,
        ...extra,
      });
    };

    if (action === 'resend_link') {
      const { data: link, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: customer.email,
        options: { redirectTo },
      });
      if (error || !link?.properties?.action_link) return json({ error: error?.message ?? 'Could not generate link' }, 500);

      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'BundledMum <hello@bundledmum.com>',
            to: [customer.email],
            subject: 'Sign in to your account',
            html: signinEmailHtml(link.properties.action_link),
          }),
        });
      }

      await log({ old_email: customer.email });
      return json({ sent: true, to: customer.email, redirect_context: context ?? 'storefront' });
    }

    if (action === 'handoff_link') {
      const { data: link, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: customer.email,
        options: { redirectTo },
      });
      if (error || !link?.properties?.action_link) return json({ error: error?.message ?? 'Could not generate link' }, 500);

      await log({ old_email: customer.email });
      return json({ link: link.properties.action_link, email: customer.email, redirect_context: context ?? 'storefront' });
    }

    if (action === 'email_corrected') {
      const cleaned = String(new_email ?? '').trim().toLowerCase();
      if (!isValidEmail(cleaned)) return json({ error: 'Enter a valid email address' }, 400);
      if (cleaned === customer.email) return json({ error: 'That is already the email on file' }, 400);

      const { data: clash } = await admin.from('customers').select('id').eq('email', cleaned).maybeSingle();
      if (clash) return json({ error: 'Another account already uses that email' }, 409);

      if (customer.auth_user_id) {
        const { error: authErr } = await admin.auth.admin.updateUserById(customer.auth_user_id, {
          email: cleaned,
          email_confirm: true,
        });
        if (authErr) return json({ error: authErr.message }, 500);
      }

      const { error: custErr } = await admin.from('customers').update({ email: cleaned }).eq('id', customer_id);
      if (custErr) return json({ error: custErr.message }, 500);

      await log({ old_email: customer.email, new_email: cleaned });
      return json({ corrected: true, old_email: customer.email, new_email: cleaned });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
