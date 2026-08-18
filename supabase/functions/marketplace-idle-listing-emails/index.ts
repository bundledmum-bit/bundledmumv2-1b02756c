import { createClient } from 'jsr:@supabase/supabase-js@2';

// ONE email per SELLER, not per listing. The first run would otherwise have sent
// one seller 16 separate emails in a burst, which reads as broken rather than
// helpful. Sellers with several idle listings get one email naming the oldest
// and mentioning the rest.
//
// Sent once per listing ever. The manual WhatsApp outreach nudge covers the same
// situation separately and is deliberately left running, the two reach different
// people.
const SITE = 'https://bundledmum.com';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';
const PLACEHOLDER = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/bundledmum-box.png';

const N = (n: unknown) => '₦' + Number(n || 0).toLocaleString('en-NG');
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function normaliseWa(raw: unknown): string {
  const d = String(raw ?? '2347040667424').replace(/\D/g, '');
  if (d.startsWith('234')) return d;
  if (d.startsWith('0')) return '234' + d.slice(1);
  return d.length === 10 ? '234' + d : d;
}

const H1 = (t: string) => `<h1 style="margin:0 0 10px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:23px;line-height:1.25">${t}</h1>`;
const LEAD = (t: string) => `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#444">${t}</p>`;
const FINE = (t: string) => `<p style="margin:16px 0 0;font-size:12.5px;line-height:1.65;color:#777">${t}</p>`;

function callout(kind: string, title: string, body: string): string {
  const styles: Record<string, string[]> = {
    green: ['#D8EFE5', '#1A4A33', '#1A4A33'],
    plain: ['#FFF8F4', '#2D6A4F', '#444'],
  };
  const [bg, tc, bc] = styles[kind] ?? styles.plain;
  return `<div style="background:${bg};border-radius:12px;padding:16px 18px;margin:0 0 14px">
<p style="margin:0 0 6px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:14px;color:${tc}">${title}</p>
<p style="margin:0;font-size:14px;line-height:1.65;color:${bc}">${body}</p></div>`;
}

function layout(inner: string, wa: string): string {
  return `<div style="background:#FFF8F4;padding:24px 12px;font-family:Lato,Helvetica,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:600px;margin:0 auto">
<div style="background:#2D6A4F;border-radius:16px 16px 0 0;padding:26px 24px;text-align:center">
<img src="${LOGO}" alt="BundledMum" width="150" style="display:block;margin:0 auto 8px;max-width:150px;height:auto" />
<div style="color:#D8EFE5;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700">Marketplace</div>
</div>
<div style="background:#ffffff;padding:28px 24px 24px">${inner}</div>
<div style="background:#1A1A1A;border-radius:0 0 16px 16px;padding:20px 24px;text-align:center">
<p style="margin:0 0 6px;color:#ffffff;font-size:12px;line-height:1.6">Need help? <a href="${wa}" style="color:#D8EFE5;text-decoration:underline">Chat to us on WhatsApp</a></p>
<p style="margin:0;color:#888;font-size:11px;line-height:1.6">BundledMum Marketplace, Lagos, Nigeria.</p>
</div>
</div></div>`;
}

Deno.serve(async () => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not configured' }, 500);

    const { data: tpl } = await db.from('email_templates')
      .select('subject, html_body, is_active')
      .eq('slug', 'marketplace_seller_listing_idle').maybeSingle();
    if (!tpl || tpl.is_active === false) return json({ skipped: 'template inactive' });

    const { data: daysSetting } = await db.from('site_settings').select('value').eq('key', 'marketplace_idle_listing_days').maybeSingle();
    const days = Number(daysSetting?.value ?? 4);

    const { data: waSetting } = await db.from('site_settings').select('value').eq('key', 'whatsapp_number').maybeSingle();
    const waNumber = normaliseWa(waSetting?.value);

    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const { data: idle } = await db.from('marketplace_listings')
      .select('id, title, image_url, price_naira, seller_id, created_at')
      .eq('status', 'live')
      .eq('quantity_sold', 0)
      .is('idle_email_sent_at', null)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true });

    // group by seller so nobody gets a burst
    const bySeller = new Map<string, Array<Record<string, unknown>>>();
    for (const l of idle ?? []) {
      const k = String(l.seller_id);
      if (!bySeller.has(k)) bySeller.set(k, []);
      bySeller.get(k)!.push(l);
    }

    let sent = 0;
    let skipped = 0;

    for (const [sellerId, listings] of bySeller) {
      const { data: s } = await db.from('marketplace_sellers')
        .select('display_name, customer_id').eq('id', sellerId).maybeSingle();
      if (!s?.customer_id) { skipped++; continue; }

      const { data: c } = await db.from('customers').select('email').eq('id', s.customer_id).maybeSingle();
      if (!c?.email) { skipped++; continue; }

      // the oldest one leads the email, the rest are mentioned rather than listed
      const lead = listings[0];
      const others = listings.length - 1;

      const itemCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F4;border-radius:12px;margin:0 0 18px">
<tr><td width="88" style="padding:14px 0 14px 14px;vertical-align:top">
<img src="${lead.image_url || PLACEHOLDER}" alt="" width="74" height="74" style="display:block;width:74px;height:74px;object-fit:cover;border-radius:10px;background:#FDE8DF" /></td>
<td style="padding:14px;vertical-align:top">
<p style="margin:0 0 5px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;line-height:1.35">${esc(lead.title)}</p>
<p style="margin:0;font-size:13px;color:#666">You asked for <strong style="font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;color:#2D6A4F">${N(lead.price_naira)}</strong></p>
</td></tr></table>`
        + (others > 0
          ? `<p style="margin:-6px 0 18px;font-size:13.5px;color:#666">You have ${others} other item${others > 1 ? 's' : ''} still waiting for a buyer too. The same two things help all of them.</p>`
          : '');

      const shareLink = `${SITE}/marketplace/sell/share/${lead.id}`;
      const dashLink = `${SITE}/marketplace/sell/dashboard`;

      let body = (tpl.html_body ?? '')
        .replaceAll('{{listing_title}}', esc(lead.title))
        .replaceAll('{{item_card}}', itemCard)
        .replace(/<h1 class="h1">([\s\S]*?)<\/h1>/g, (_m: string, t: string) => H1(t))
        .replace(/<p class="lead">([\s\S]*?)<\/p>/g, (_m: string, t: string) => LEAD(t))
        .replace(/<p class="fine">([\s\S]*?)<\/p>/g, (_m: string, t: string) => FINE(t))
        .replace(/<div class="callout-(green|plain)">\s*<p class="cal-t">([\s\S]*?)<\/p>\s*<p class="cal-b">([\s\S]*?)<\/p>\s*<\/div>/g,
          (_m: string, kind: string, t: string, b: string) => callout(kind, t, b))
        .replace(/\{\{primary_button:([^}]*)\}\}/g, (_m: string, label: string) =>
          `<a href="${shareLink}" style="display:block;background:#25D366;color:#fff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center;margin:0 0 18px">${esc(label)}</a>`)
        .replace(/\{\{secondary_button:([^}]*)\}\}/g, (_m: string, label: string) =>
          `<a href="${others > 0 ? dashLink : shareLink.replace('/share/', '/listings/') + '/price'}" style="display:block;background:#fff;border:2px solid #2D6A4F;color:#2D6A4F;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:13px 20px;border-radius:12px;text-align:center">${esc(label)}</a>`)
        .replace(/\{\{[a-z_]+\}\}/g, '');

      const subject = (tpl.subject ?? '').replaceAll('{{listing_title}}', String(lead.title ?? 'your item'));
      const wa = `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello. I need help selling my listing ${lead.title ?? ''}.`)}`;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'BundledMum Marketplace <hello@bundledmum.com>',
          to: [c.email], subject, html: layout(body, wa),
        }),
      });

      if (res.ok) {
        // mark ALL of this seller's idle listings, so the ones only mentioned
        // do not trigger their own email tomorrow
        const ids = listings.map((l) => String(l.id));
        await db.from('marketplace_listings')
          .update({ idle_email_sent_at: new Date().toISOString() }).in('id', ids);
        sent++;
      } else { skipped++; }
    }

    if (sent > 0) {
      await db.from('email_templates')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('slug', 'marketplace_seller_listing_idle');
    }

    return json({ sellers_emailed: sent, skipped, listings_covered: (idle ?? []).length, days });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
