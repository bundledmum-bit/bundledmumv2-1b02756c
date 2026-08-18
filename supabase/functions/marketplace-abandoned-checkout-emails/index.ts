import { createClient } from 'jsr:@supabase/supabase-js@2';

// Three recovery emails, at 1, 24 and 48 hours. Escalating, then it stops.
//
// The urgency in emails 2 and 3 is real rather than manufactured: secondhand
// items are one of a kind, so "someone else could buy this" is simply true. No
// fake countdowns, which would be both dishonest and obvious.
const SITE = 'https://bundledmum.com';
const BM_WA = '2347040667424';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';
const PLACEHOLDER = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/bundledmum-box.png';

const N = (n: unknown) => '₦' + Number(n || 0).toLocaleString('en-NG');
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const H1 = (t: string) => `<h1 style="margin:0 0 10px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:23px;line-height:1.25">${t}</h1>`;
const LEAD = (t: string) => `<p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#444">${t}</p>`;
const FINE = (t: string) => `<p style="margin:16px 0 0;font-size:12.5px;line-height:1.65;color:#777">${t}</p>`;

function callout(kind: string, title: string, body: string): string {
  const s: Record<string, string[]> = {
    green: ['#D8EFE5', '#1A4A33', '#1A4A33'],
    plain: ['#FFF8F4', '#2D6A4F', '#444'],
  };
  const [bg, tc, bc] = s[kind] ?? s.plain;
  return `<div style="background:${bg};border-radius:12px;padding:16px 18px;margin:0 0 16px">
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
<p style="margin:0 0 6px;color:#ffffff;font-size:12px;line-height:1.6">Questions? <a href="${wa}" style="color:#D8EFE5;text-decoration:underline">Chat to us on WhatsApp</a></p>
<p style="margin:0;color:#888;font-size:11px;line-height:1.6">BundledMum Marketplace, Lagos, Nigeria. Payments handled by Paystack.</p>
</div>
</div></div>`;
}

Deno.serve(async () => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not configured' }, 500);

    const setting = async (k: string, d: number) => {
      const { data } = await db.from('site_settings').select('value').eq('key', k).maybeSingle();
      return Number(data?.value ?? d);
    };

    // hours before each email in the sequence
    const gates = [
      await setting('marketplace_abandoned_email_hours', 1),
      await setting('marketplace_abandoned_email_2_hours', 24),
      await setting('marketplace_abandoned_email_3_hours', 48),
    ];
    const slugs = [
      'marketplace_abandoned_checkout',
      'marketplace_abandoned_checkout_2',
      'marketplace_abandoned_checkout_3',
    ];

    type Row = {
      source: 'order' | 'attempt'; ref_id: string; listing_id: string;
      email: string | null; amount: number; sentCount: number; lastActivity: string;
    };
    const rows: Row[] = [];

    const { data: orders } = await db.from('marketplace_orders')
      .select('id, listing_id, buyer_id, amount_naira, abandoned_emails_sent, updated_at')
      .eq('payment_status', 'pending').eq('order_status', 'awaiting_payment')
      .lt('abandoned_emails_sent', 3);

    for (const o of orders ?? []) {
      const { data: c } = await db.from('customers').select('email').eq('id', o.buyer_id).maybeSingle();
      if (c?.email) rows.push({
        source: 'order', ref_id: o.id, listing_id: o.listing_id, email: c.email,
        amount: Number(o.amount_naira), sentCount: Number(o.abandoned_emails_sent), lastActivity: o.updated_at,
      });
    }

    const { data: attempts } = await db.from('marketplace_checkout_attempts')
      .select('id, listing_id, email, abandoned_emails_sent, last_activity_at')
      .is('order_id', null).lt('abandoned_emails_sent', 3);

    for (const a of attempts ?? []) {
      if (a.email) rows.push({
        source: 'attempt', ref_id: a.id, listing_id: a.listing_id, email: a.email,
        amount: 0, sentCount: Number(a.abandoned_emails_sent), lastActivity: a.last_activity_at,
      });
    }

    let sent = 0, skipped = 0;

    for (const r of rows) {
      const stage = r.sentCount; // 0, 1 or 2, which email is due next
      const hoursElapsed = (Date.now() - new Date(r.lastActivity).getTime()) / 3600000;
      if (hoursElapsed < gates[stage]) { skipped++; continue; }

      const { data: l } = await db.from('marketplace_listings')
        .select('id, title, image_url, final_price_naira, is_negotiable, status')
        .eq('id', r.listing_id).maybeSingle();

      // never chase someone toward something they can no longer buy
      if (!l || l.status !== 'live') { skipped++; continue; }

      const { data: tpl } = await db.from('email_templates')
        .select('subject, html_body, is_active').eq('slug', slugs[stage]).maybeSingle();
      if (!tpl || tpl.is_active === false) { skipped++; continue; }

      const price = r.amount > 0 ? r.amount : Number(l.final_price_naira);
      const resume = r.source === 'order'
        ? `${SITE}/marketplace/checkout/${l.id}?resume_order=${r.ref_id}`
        : `${SITE}/marketplace/checkout/${l.id}?resume=${r.ref_id}`;

      const wa = `https://wa.me/${BM_WA}?text=${encodeURIComponent(
        `Hello. I was buying the ${l.title ?? 'item'} on BundledMum Marketplace for ${N(price)} but did not finish. Can you help?`)}`;

      const itemCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F4;border-radius:12px;margin:0 0 18px">
<tr><td width="88" style="padding:14px 0 14px 14px;vertical-align:top">
<img src="${l.image_url || PLACEHOLDER}" alt="" width="74" height="74" style="display:block;width:74px;height:74px;object-fit:cover;border-radius:10px;background:#FDE8DF" /></td>
<td style="padding:14px;vertical-align:top">
<p style="margin:0 0 5px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;line-height:1.35">${esc(l.title)}</p>
<p style="margin:0;font-size:13px;color:#666">${N(price)}</p>
</td></tr></table>`;

      const protectionBlock = `<div style="background:#D8EFE5;border-radius:12px;padding:18px;margin:0 0 16px">
<p style="margin:0 0 8px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:15px;color:#1A4A33">You cannot be scammed here</p>
<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#1A4A33">Your money does not go to the seller when you pay. BundledMum holds it until you have the item in your hands and confirm it is as described.</p>
<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#1A4A33">Not as described? Report it, send it back, and we refund you the same day the seller confirms it arrived back. The seller does not get paid.</p>
<p style="margin:0;font-size:13.5px;line-height:1.6"><a href="${SITE}/marketplace/buyer-protection" style="color:#1A4A33;text-decoration:underline;font-weight:700">Read how buyer protection works</a></p>
</div>`;

      const negotiateBlock = l.is_negotiable
        ? callout('plain', 'The price is negotiable on this one',
            'This seller is open to offers. You can ask for a lower price before you buy, and they can accept, decline, or suggest their own. No harm in asking.')
        : '';

      const questionButton = `<a href="${SITE}/marketplace/listing/${l.id}" style="display:block;background:#ffffff;border:2px solid #2D6A4F;color:#2D6A4F;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:13px 20px;border-radius:12px;text-align:center;margin:0 0 4px">Ask the seller a question</a>`;

      let bodyHtml = (tpl.html_body ?? '')
        .replaceAll('{{listing_title}}', esc(l.title))
        .replaceAll('{{item_card}}', itemCard)
        .replaceAll('{{protection_block}}', protectionBlock)
        .replaceAll('{{negotiate_block}}', negotiateBlock)
        .replaceAll('{{question_button}}', questionButton)
        .replace(/<h1 class="h1">([\s\S]*?)<\/h1>/g, (_m: string, t: string) => H1(t))
        .replace(/<p class="lead">([\s\S]*?)<\/p>/g, (_m: string, t: string) => LEAD(t))
        .replace(/<p class="fine">([\s\S]*?)<\/p>/g, (_m: string, t: string) => FINE(t))
        .replace(/<div class="callout-(green|plain)">\s*<p class="cal-t">([\s\S]*?)<\/p>\s*<p class="cal-b">([\s\S]*?)<\/p>\s*<\/div>/g,
          (_m: string, kind: string, t: string, b: string) => callout(kind, t, b))
        .replace(/\{\{primary_button:([^}]*)\}\}/g, (_m: string, label: string) =>
          `<a href="${resume}" style="display:block;background:#F4845F;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center;margin:0 0 10px">${esc(label)}</a>`)
        .replace(/\{\{whatsapp_button:([^}]*)\}\}/g, (_m: string, label: string) =>
          `<a href="${wa}" style="display:block;background:#25D366;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center;margin:0 0 18px">${esc(label)}</a>`)
        .replace(/\{\{[a-z_]+\}\}/g, '');

      const subject = (tpl.subject ?? '').replaceAll('{{listing_title}}', String(l.title ?? 'your item'));

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'BundledMum Marketplace <hello@bundledmum.com>',
          to: [r.email], subject, html: layout(bodyHtml, wa),
        }),
      });

      if (res.ok) {
        const table = r.source === 'order' ? 'marketplace_orders' : 'marketplace_checkout_attempts';
        await db.from(table).update({
          abandoned_emails_sent: stage + 1,
          abandoned_email_sent_at: new Date().toISOString(),
        }).eq('id', r.ref_id);
        await db.from('email_templates')
          .update({ last_sent_at: new Date().toISOString() }).eq('slug', slugs[stage]);
        sent++;
      } else { skipped++; }
    }

    return json({ candidates: rows.length, sent, skipped });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
