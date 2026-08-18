import { createClient } from 'jsr:@supabase/supabase-js@2';

// Internal operator alerts keyed to a SELLER rather than an order.
const SITE = 'https://bundledmum.com';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const recipients = (v: unknown) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function layout(inner: string): string {
  return `<div style="background:#FFF8F4;padding:24px 12px;font-family:Lato,Helvetica,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:600px;margin:0 auto">
<div style="background:#2D6A4F;border-radius:16px 16px 0 0;padding:26px 24px;text-align:center">
<img src="${LOGO}" alt="BundledMum" width="150" style="display:block;margin:0 auto 8px;max-width:150px;height:auto" />
<div style="color:#D8EFE5;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700">Marketplace, internal</div>
</div>
<div style="background:#ffffff;padding:28px 24px 24px">${inner}</div>
<div style="background:#1A1A1A;border-radius:0 0 16px 16px;padding:18px 24px;text-align:center">
<p style="margin:0;color:#888;font-size:11px">Internal alert, BundledMum Marketplace operations.</p>
</div>
</div></div>`;
}

const H1 = (t: string) => `<h1 style="margin:0 0 10px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:23px;line-height:1.25;letter-spacing:-0.5px">${t}</h1>`;
const LEAD = (t: string) => `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#444">${t}</p>`;
const FINE = (t: string) => `<p style="margin:16px 0 0;font-size:12.5px;line-height:1.65;color:#777">${t}</p>`;

function callout(kind: string, title: string, body: string): string {
  const s: Record<string, string[]> = {
    green: ['#D8EFE5', '#1A4A33', '#1A4A33'],
    amber: ['#FDE8DF', '#D4613C', '#6b3a26'],
    plain: ['#FFF8F4', '#2D6A4F', '#444'],
    red:   ['#FDE8DF', '#C0392B', '#7a2e24'],
  };
  const [bg, tc, bc] = s[kind] ?? s.plain;
  return `<div style="background:${bg};border-radius:12px;padding:16px 18px;margin:0 0 18px">
<p style="margin:0 0 6px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:14px;color:${tc}">${title}</p>
<p style="margin:0;font-size:14px;line-height:1.65;color:${bc}">${body}</p></div>`;
}

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const { slug, seller_id } = await req.json().catch(() => ({}));
    if (!slug || !seller_id) return json({ error: 'slug and seller_id are required' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not configured' }, 500);

    const { data: tpl } = await db.from('email_templates').select('subject, html_body, is_active, internal_recipients').eq('slug', slug).maybeSingle();
    if (!tpl) return json({ error: 'Template not found' }, 404);
    if (tpl.is_active === false) return json({ skipped: 'template inactive' });

    let to = recipients(tpl.internal_recipients);
    if (to.length === 0) {
      const { data: setting } = await db.from('site_settings').select('value').eq('key', 'marketplace_payout_digest_email').maybeSingle();
      to = recipients(setting?.value);
    }
    if (to.length === 0) return json({ skipped: 'no recipient configured' });

    const { data: s } = await db.from('marketplace_sellers').select('display_name, phone, whatsapp_number, bank_name, bank_account_number, strike_count').eq('id', seller_id).maybeSingle();
    if (!s) return json({ error: 'Seller not found' }, 404);

    const vars: Record<string, string> = {
      seller_name: esc(s.display_name || 'Unnamed seller'),
      seller_phone: esc(s.whatsapp_number || s.phone || 'not on file'),
      strike_count: String(s.strike_count ?? 0),
      payout_bank: esc([s.bank_name, s.bank_account_number ? '****' + String(s.bank_account_number).slice(-4) : ''].filter(Boolean).join(' ')) || 'not on file',
      item_card: '',
    };

    let body = tpl.html_body ?? '';
    for (const [k, v] of Object.entries(vars)) body = body.replaceAll('{{' + k + '}}', v);
    body = body
      .replace(/<h1 class="h1">([\s\S]*?)<\/h1>/g, (_m, t) => H1(t))
      .replace(/<p class="lead">([\s\S]*?)<\/p>/g, (_m, t) => LEAD(t))
      .replace(/<p class="fine">([\s\S]*?)<\/p>/g, (_m, t) => FINE(t))
      .replace(/<div class="callout-(green|amber|plain|red)">\s*<p class="cal-t">([\s\S]*?)<\/p>\s*<p class="cal-b">([\s\S]*?)<\/p>\s*<\/div>/g, (_m, kind, t, b) => callout(kind, t, b))
      .replace(/\{\{primary_button:([^}]*)\}\}/g, (_m, label) => `<a href="${SITE}/admin/marketplace/sellers" style="display:block;background:#F4845F;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center">${esc(label)}</a>`)
      .replace(/\{\{[a-z_]+\}\}/g, '');

    let subject = tpl.subject ?? '';
    for (const [k, v] of Object.entries(vars)) subject = subject.replaceAll('{{' + k + '}}', v.replace(/<[^>]*>/g, ''));
    subject = subject.replace(/\{\{[a-z_]+\}\}/g, '').replace(/\s+/g, ' ').trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'BundledMum Marketplace <hello@bundledmum.com>', to, subject, html: layout(body) }),
    });
    const rb = await res.json();
    if (!res.ok) return json({ error: rb?.message ?? 'Could not send' }, 502);

    return json({ sent: true, slug, to });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
