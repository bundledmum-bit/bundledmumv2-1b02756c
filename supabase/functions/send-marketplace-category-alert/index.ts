import { createClient } from 'jsr:@supabase/supabase-js@2';

const SITE = 'https://bundledmum.com';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';
const PLACEHOLDER = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/bundledmum-box.png';

const N = (n: unknown) => '₦' + Number(n || 0).toLocaleString('en-NG');
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function layout(inner: string): string {
  return `<div style="background:#FFF8F4;padding:24px 12px;font-family:Lato,Helvetica,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:600px;margin:0 auto">
<div style="background:#2D6A4F;border-radius:16px 16px 0 0;padding:26px 24px;text-align:center">
<img src="${LOGO}" alt="BundledMum" width="150" style="display:block;margin:0 auto 8px;max-width:150px;height:auto" />
<div style="color:#D8EFE5;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700">Marketplace</div>
</div>
<div style="background:#ffffff;padding:28px 24px 24px">${inner}</div>
<div style="background:#1A1A1A;border-radius:0 0 16px 16px;padding:20px 24px;text-align:center">
<p style="margin:0;color:#888;font-size:11px;line-height:1.6">BundledMum Marketplace, Lagos, Nigeria.</p>
</div>
</div></div>`;
}

const H1 = (t: string) => `<h1 style="margin:0 0 10px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:23px;line-height:1.25;letter-spacing:-0.5px">${t}</h1>`;
const LEAD = (t: string) => `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#444">${t}</p>`;
const FINE = (t: string) => `<p style="margin:16px 0 0;font-size:12.5px;line-height:1.65;color:#777">${t}</p>`;

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const { email, listing_id, category_id } = await req.json().catch(() => ({}));
    if (!email || !listing_id || !category_id) return json({ error: 'email, listing_id and category_id are required' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not configured' }, 500);

    const { data: tpl } = await db.from('email_templates').select('subject, html_body, is_active').eq('slug', 'marketplace_category_stock_alert').maybeSingle();
    if (!tpl || tpl.is_active === false) return json({ skipped: 'template inactive' });

    const { data: l } = await db.from('marketplace_listings').select('title, image_url, final_price_naira').eq('id', listing_id).maybeSingle();
    const { data: c } = await db.from('marketplace_categories').select('name').eq('id', category_id).maybeSingle();

    const itemCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F4;border-radius:12px;margin:0 0 18px">
<tr><td width="88" style="padding:14px 0 14px 14px;vertical-align:top">
<img src="${l?.image_url || PLACEHOLDER}" alt="" width="74" height="74" style="display:block;width:74px;height:74px;object-fit:cover;border-radius:10px;background:#FDE8DF" /></td>
<td style="padding:14px;vertical-align:top">
<p style="margin:0 0 5px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;line-height:1.35">${esc(l?.title ?? 'A new item')}</p>
<p style="margin:0;font-size:13px;color:#666">${N(l?.final_price_naira)}</p>
</td></tr></table>`;

    const vars: Record<string, string> = {
      category_name: esc(c?.name ?? 'this category'),
      item_card: itemCard,
    };

    let body = tpl.html_body ?? '';
    for (const [k, v] of Object.entries(vars)) body = body.replaceAll('{{' + k + '}}', v);
    body = body
      .replace(/<h1 class="h1">([\s\S]*?)<\/h1>/g, (_m, t) => H1(t))
      .replace(/<p class="lead">([\s\S]*?)<\/p>/g, (_m, t) => LEAD(t))
      .replace(/<p class="fine">([\s\S]*?)<\/p>/g, (_m, t) => FINE(t))
      .replace(/\{\{primary_button:([^}]*)\}\}/g, (_m, label) => `<a href="${SITE}/marketplace/listing/${listing_id}" style="display:block;background:#F4845F;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center">${esc(label)}</a>`)
      .replace(/\{\{[a-z_]+\}\}/g, '');

    let subject = tpl.subject ?? '';
    for (const [k, v] of Object.entries(vars)) subject = subject.replaceAll('{{' + k + '}}', v.replace(/<[^>]*>/g, ''));

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'BundledMum Marketplace <hello@bundledmum.com>', to: [email], subject, html: layout(body) }),
    });
    const rb = await res.json();
    if (!res.ok) return json({ error: rb?.message ?? 'Could not send' }, 502);

    return json({ sent: true, email });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
