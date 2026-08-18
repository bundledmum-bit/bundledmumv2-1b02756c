import { createClient } from 'jsr:@supabase/supabase-js@2';

// Listing scoped emails, seller facing approved and rejected, plus the operator
// facing submitted for review alert.
const SITE = 'https://bundledmum.com';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';
const PLACEHOLDER = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/bundledmum-box.png';

const N = (n: unknown) => '₦' + Number(n || 0).toLocaleString('en-NG');
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const recipients = (v: unknown) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function normaliseWa(raw: unknown): string {
  const d = String(raw ?? '2347040667424').replace(/\D/g, '');
  if (d.startsWith('234')) return d;
  if (d.startsWith('0')) return '234' + d.slice(1);
  return d.length === 10 ? '234' + d : d;
}

function layout(inner: string, internal: boolean, wa: string): string {
  const label = internal ? 'Marketplace, internal' : 'Marketplace';
  const safety = internal ? '' : `<div style="background:#D8EFE5;padding:16px 24px">
<p style="margin:0;font-size:13px;line-height:1.65;color:#1A4A33"><strong style="font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Keep it on BundledMum.</strong> Pay and get paid only through the marketplace. If anyone asks you to send money directly, do not, and tell us.</p>
</div>`;
  return `<div style="background:#FFF8F4;padding:24px 12px;font-family:Lato,Helvetica,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:600px;margin:0 auto">
<div style="background:#2D6A4F;border-radius:16px 16px 0 0;padding:26px 24px;text-align:center">
<img src="${LOGO}" alt="BundledMum" width="150" style="display:block;margin:0 auto 8px;max-width:150px;height:auto" />
<div style="color:#D8EFE5;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700">${label}</div>
</div>
<div style="background:#ffffff;padding:28px 24px 24px">${inner}</div>
${safety}
<div style="background:#1A1A1A;border-radius:0 0 16px 16px;padding:20px 24px;text-align:center">
${internal ? '' : `<p style="margin:0 0 6px;color:#ffffff;font-size:12px;line-height:1.6">Need help? <a href="${wa}" style="color:#D8EFE5;text-decoration:underline">Chat to us on WhatsApp</a></p>`}
<p style="margin:0;color:#888;font-size:11px;line-height:1.6">BundledMum Marketplace, Lagos, Nigeria.</p>
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
    const { slug, listing_id } = await req.json().catch(() => ({}));
    if (!slug || !listing_id) return json({ error: 'slug and listing_id are required' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not configured' }, 500);

    const { data: tpl } = await db.from('email_templates').select('subject, html_body, is_active, internal_recipients').eq('slug', slug).maybeSingle();
    if (!tpl) return json({ error: 'Template not found' }, 404);
    if (tpl.is_active === false) return json({ skipped: 'template inactive' });

    const { data: waSetting } = await db.from('site_settings').select('value').eq('key', 'whatsapp_number').maybeSingle();
    const waNumber = normaliseWa(waSetting?.value);

    const { data: l } = await db.from('marketplace_listings').select('id, title, image_url, price_naira, final_price_naira, rejection_reason, seller_id').eq('id', listing_id).maybeSingle();
    if (!l) return json({ error: 'Listing not found' }, 404);

    const { data: s } = await db.from('marketplace_sellers').select('display_name, customer_id, strike_count').eq('id', l.seller_id).maybeSingle();
    if (!s) return json({ skipped: 'no seller' });

    const isInternal = slug.includes('_admin_');

    let to: string[] = [];
    if (isInternal) {
      to = recipients(tpl.internal_recipients);
      if (to.length === 0) {
        const { data: setting } = await db.from('site_settings').select('value').eq('key', 'marketplace_payout_digest_email').maybeSingle();
        to = recipients(setting?.value);
      }
    } else {
      if (!s.customer_id) return json({ skipped: 'no seller customer' });
      const { data: c } = await db.from('customers').select('email').eq('id', s.customer_id).maybeSingle();
      if (c?.email) to = [c.email];
    }
    if (to.length === 0) return json({ skipped: 'no recipient' });

    const link = isInternal
      ? SITE + '/admin/marketplace/review'
      : (slug.includes('rejected') ? SITE + '/marketplace/sell/dashboard' : SITE + '/marketplace/listing/' + l.id);

    // second CTA, so a seller whose listing just went live can immediately list
    // another. The moment of approval is when they are most likely to.
    const link2 = SITE + '/marketplace/sell/new';

    const waMsg = slug.includes('rejected')
      ? `Hello. My listing ${l.title ?? ''} was not approved and I would like some help fixing it.`
      : `Hello. I need some help with my listing ${l.title ?? ''}.`;
    const wa = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg.replace(/\s+/g, ' ').trim())}`;

    const cardLabel = isInternal ? 'Buyer would pay' : 'You asked for';
    const cardAmount = isInternal ? N(l.final_price_naira) : N(l.price_naira);

    const itemCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F4;border-radius:12px;margin:0 0 18px">
<tr><td width="88" style="padding:14px 0 14px 14px;vertical-align:top">
<img src="${l.image_url || PLACEHOLDER}" alt="" width="74" height="74" style="display:block;width:74px;height:74px;object-fit:cover;border-radius:10px;background:#FDE8DF" /></td>
<td style="padding:14px;vertical-align:top">
<p style="margin:0 0 5px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;line-height:1.35">${esc(l.title)}</p>
<p style="margin:0;font-size:13px;color:#666">${cardLabel} <strong style="font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;color:#2D6A4F">${cardAmount}</strong></p>
</td></tr></table>`;

    const vars: Record<string, string> = {
      seller_name: esc(s.display_name || 'there'),
      listing_title: esc(l.title || 'your item'),
      seller_amount: N(l.price_naira),
      strike_count: String(s.strike_count ?? 0),
      rejection_reason: esc(l.rejection_reason || 'Please review the photos and description and try again.'),
      item_card: itemCard,
      order_reference: '',
    };

    let body = tpl.html_body ?? '';
    for (const [k, v] of Object.entries(vars)) body = body.replaceAll('{{' + k + '}}', v);
    body = body
      .replace(/<h1 class="h1">([\s\S]*?)<\/h1>/g, (_m, t) => H1(t))
      .replace(/<p class="lead">([\s\S]*?)<\/p>/g, (_m, t) => LEAD(t))
      .replace(/<p class="fine">([\s\S]*?)<\/p>/g, (_m, t) => FINE(t))
      .replace(/<div class="callout-(green|amber|plain|red)">\s*<p class="cal-t">([\s\S]*?)<\/p>\s*<p class="cal-b">([\s\S]*?)<\/p>\s*<\/div>/g, (_m, kind, t, b) => callout(kind, t, b))
      .replace(/\{\{primary_button:([^}]*)\}\}/g, (_m, label) => `<a href="${link}" style="display:block;background:#F4845F;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center;margin:0 0 10px">${esc(label)}</a>`)
      .replace(/\{\{secondary_button:([^}]*)\}\}/g, (_m, label) => `<a href="${link2}" style="display:block;background:#ffffff;border:2px solid #2D6A4F;color:#2D6A4F;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:13px 20px;border-radius:12px;text-align:center">${esc(label)}</a>`)
      .replace(/\{\{[a-z_]+\}\}/g, '');

    let subject = tpl.subject ?? '';
    for (const [k, v] of Object.entries(vars)) subject = subject.replaceAll('{{' + k + '}}', v.replace(/<[^>]*>/g, ''));
    subject = subject.replace(/\{\{[a-z_]+\}\}/g, '').replace(/\s+/g, ' ').trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'BundledMum Marketplace <hello@bundledmum.com>', to, subject, html: layout(body, isInternal, wa) }),
    });
    const rb = await res.json();
    if (!res.ok) return json({ error: rb?.message ?? 'Could not send' }, 502);

    await db.from('email_templates').update({ last_sent_at: new Date().toISOString() }).eq('slug', slug);
    return json({ sent: true, slug, to });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
