import { createClient } from 'jsr:@supabase/supabase-js@2';

// Internal alert when a checkout goes cold, so someone can reach out while the
// buyer is still deciding. Fires ahead of the buyer's own recovery email, which
// waits an hour, so a personal message can land first.
//
// ONE ALERT PER PERSON PER DAY. A repeat visitor generates a row every time they
// return, and Adewale alone produced three alerts in one run. Three emails about
// the same person teaches you to ignore the alerts entirely. They still all
// appear in the admin queue, only the email is deduplicated.
//
// Deduplicated on EMAIL rather than customer id, since guests check out without
// an account and would otherwise never dedupe.
const SITE = 'https://bundledmum.com';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';
const PLACEHOLDER = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/bundledmum-box.png';

const WA_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIj48cGF0aCBmaWxsPSIjZmZmZmZmIiBkPSJNMTYuMDQgNEM5Ljk1IDQgNSA4Ljk1IDUgMTUuMDRjMCAyLjEzLjYgNC4xMiAxLjYzIDUuODFMNSAyOGw3LjM0LTEuNmExMSAxMSAwIDAgMCAzLjcuNjRoLjAxQzIyLjE0IDI3LjA0IDI3IDIyLjA5IDI3IDE2UzIyLjE0IDQgMTYuMDQgNHptMCAyMC44NWgtLjAxYTkuMSA5LjEgMCAwIDEtMy41LS43MmwtLjI1LS4xLTQuMzYuOTUuOTMtNC4yNS0uMTYtLjI3YTkuMDcgOS4wNyAwIDAgMS0xLjA1LTQuM2MwLTUuMDYgNC4xMi05LjE4IDkuNC05LjE4YTkuMTMgOS4xMyAwIDAgMSA5LjE2IDkuMTljMCA1LjA2LTQuMTIgOS4xOC05LjE2IDkuMTh6bTUuMDMtNi44N2MtLjI4LS4xNC0xLjYzLS44LTEuODgtLjktLjI1LS4wOS0uNDQtLjEzLS42Mi4xNC0uMTguMjgtLjcxLjktLjg3IDEuMDgtLjE2LjE5LS4zMi4yMS0uNi4wN2E3LjUgNy41IDAgMCAxLTIuMi0xLjM2IDguMyA4LjMgMCAwIDEtMS41My0xLjljLS4xNi0uMjgtLjAyLS40My4xMi0uNTcuMTMtLjEzLjI4LS4zMi40Mi0uNDkuMTQtLjE2LjE5LS4yOC4yOC0uNDYuMS0uMTkuMDUtLjM1LS4wMi0uNDktLjA3LS4xNC0uNjItMS41LS44NS0yLjA1LS4yMi0uNTMtLjQ1LS40Ni0uNjItLjQ3aC0uNTNjLS4xOCAwLS40Ny4wNy0uNzIuMzUtLjI1LjI4LS45NC45Mi0uOTQgMi4yNHMuOTcgMi42IDEuMSAyLjc4Yy4xNC4xOSAxLjkgMi45IDQuNiA0LjA3LjY0LjI4IDEuMTQuNDQgMS41My41Ny42NC4yIDEuMjMuMTcgMS42OS4xLjUyLS4wNyAxLjYzLS42NiAxLjg2LTEuMy4yMy0uNjUuMjMtMS4yLjE2LTEuMzItLjA3LS4xMS0uMjUtLjE4LS41My0uMzJ6Ii8+PC9zdmc+';

const N = (n: unknown) => '₦' + Number(n || 0).toLocaleString('en-NG');
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function normaliseWa(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('234') && d.length === 13) return d;
  if (d.startsWith('0') && d.length === 11) return '234' + d.slice(1);
  if (d.length === 10) return '234' + d;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

const H1 = (t: string) => `<h1 style="margin:0 0 10px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:23px;line-height:1.25">${t}</h1>`;
const LEAD = (t: string) => `<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#444">${t}</p>`;
const FINE = (t: string) => `<p style="margin:16px 0 0;font-size:12.5px;line-height:1.65;color:#777">${t}</p>`;

function layout(inner: string): string {
  return `<div style="background:#FFF8F4;padding:24px 12px;font-family:Lato,Helvetica,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:600px;margin:0 auto">
<div style="background:#2D6A4F;border-radius:16px 16px 0 0;padding:22px 24px;text-align:center">
<img src="${LOGO}" alt="BundledMum" width="130" style="display:block;margin:0 auto 6px;max-width:130px;height:auto" />
<div style="color:#D8EFE5;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700">Marketplace, internal</div>
</div>
<div style="background:#ffffff;padding:26px 24px 24px">${inner}</div>
<div style="background:#1A1A1A;border-radius:0 0 16px 16px;padding:18px 24px;text-align:center">
<p style="margin:0;color:#888;font-size:11px">BundledMum Marketplace, internal alert.</p>
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
      .select('subject, html_body, is_active, internal_recipients')
      .eq('slug', 'marketplace_admin_abandoned_checkout').maybeSingle();
    if (!tpl || tpl.is_active === false) return json({ skipped: 'template inactive' });

    const to = String(tpl.internal_recipients ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (to.length === 0) return json({ skipped: 'no internal recipient configured' });

    const { data: minsSetting } = await db.from('site_settings').select('value').eq('key', 'marketplace_abandon_minutes').maybeSingle();
    const mins = Number(minsSetting?.value ?? 30);
    const cutoff = new Date(Date.now() - mins * 60000).toISOString();

    // start of today in Lagos, so "once per day" means a real day rather than
    // a rolling 24 hours that drifts
    const nowLagos = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    nowLagos.setHours(0, 0, 0, 0);
    const dayStart = nowLagos.toISOString();

    // every email already alerted about today, from both sources
    const alertedToday = new Set<string>();

    const { data: ordersToday } = await db.from('marketplace_orders')
      .select('buyer_id').gte('abandoned_alert_sent_at', dayStart);
    for (const o of ordersToday ?? []) {
      const { data: c } = await db.from('customers').select('email').eq('id', o.buyer_id).maybeSingle();
      if (c?.email) alertedToday.add(c.email.toLowerCase());
    }

    const { data: attemptsToday } = await db.from('marketplace_checkout_attempts')
      .select('email').gte('abandoned_alert_sent_at', dayStart);
    for (const a of attemptsToday ?? []) {
      if (a.email) alertedToday.add(a.email.toLowerCase());
    }

    type Row = {
      source: 'order' | 'attempt'; ref_id: string; listing_id: string;
      name: string; email: string | null; phone: string | null;
      amount: number; reachedPayment: boolean;
    };
    const rows: Row[] = [];

    const { data: orders } = await db.from('marketplace_orders')
      .select('id, listing_id, buyer_id, amount_naira')
      .eq('payment_status', 'pending').eq('order_status', 'awaiting_payment')
      .is('abandoned_alert_sent_at', null).lte('updated_at', cutoff);

    for (const o of orders ?? []) {
      const { data: c } = await db.from('customers')
        .select('full_name, email, phone, whatsapp_number').eq('id', o.buyer_id).maybeSingle();
      rows.push({
        source: 'order', ref_id: o.id, listing_id: o.listing_id,
        name: c?.full_name ?? 'Someone', email: c?.email ?? null,
        phone: c?.whatsapp_number ?? c?.phone ?? null,
        amount: Number(o.amount_naira), reachedPayment: true,
      });
    }

    const { data: attempts } = await db.from('marketplace_checkout_attempts')
      .select('id, listing_id, full_name, email, phone')
      .is('order_id', null).is('abandoned_alert_sent_at', null).lte('last_activity_at', cutoff);

    for (const a of attempts ?? []) {
      rows.push({
        source: 'attempt', ref_id: a.id, listing_id: a.listing_id,
        name: a.full_name ?? 'Someone', email: a.email, phone: a.phone,
        amount: 0, reachedPayment: false,
      });
    }

    let sent = 0, suppressed = 0, skipped = 0;

    for (const r of rows) {
      const key = (r.email ?? '').toLowerCase();

      // already alerted about this person today. Still mark the row handled so
      // it does not queue up and fire tomorrow, but send nothing.
      if (key && alertedToday.has(key)) {
        const table = r.source === 'order' ? 'marketplace_orders' : 'marketplace_checkout_attempts';
        await db.from(table).update({ abandoned_alert_sent_at: new Date().toISOString() }).eq('id', r.ref_id);
        suppressed++;
        continue;
      }

      const { data: l } = await db.from('marketplace_listings')
        .select('id, title, image_url, final_price_naira, status').eq('id', r.listing_id).maybeSingle();
      if (!l) { skipped++; continue; }

      const price = r.amount > 0 ? r.amount : Number(l.final_price_naira);
      const wa = normaliseWa(r.phone);

      const resume = r.source === 'order'
        ? `${SITE}/marketplace/checkout/${l.id}?resume_order=${r.ref_id}`
        : `${SITE}/marketplace/checkout/${l.id}?resume=${r.ref_id}`;

      const msg = `Hello ${String(r.name).split(' ')[0]},\n\n`
        + `I noticed you were buying the ${l.title} on BundledMum Marketplace but did not finish.\n\n`
        + `It is still available at ${N(price)}, and your details are already saved so you can pick up where you left off:\n${resume}\n\n`
        + `Your money is held by us until you confirm the item arrived as described, so you are never sending cash to a stranger.\n\n`
        + `Anything you want to check first, just reply here.`;

      const itemCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F4;border-radius:12px;margin:0 0 14px">
<tr><td width="88" style="padding:14px 0 14px 14px;vertical-align:top">
<img src="${l.image_url || PLACEHOLDER}" alt="" width="74" height="74" style="display:block;width:74px;height:74px;object-fit:cover;border-radius:10px;background:#FDE8DF" /></td>
<td style="padding:14px;vertical-align:top">
<p style="margin:0 0 5px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;line-height:1.35">${esc(l.title)}</p>
<p style="margin:0;font-size:13px;color:#666">${N(price)}</p>
</td></tr></table>`;

      const contactCard = `<div style="background:#FFF8F4;border-radius:12px;padding:14px 16px;margin:0 0 16px">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#2D6A4F;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Their details</p>
<p style="margin:0;font-size:14px;line-height:1.7;color:#444">${esc(r.name)}<br/>${esc(r.email ?? 'no email')}<br/>${esc(r.phone ?? 'no phone')}</p></div>`;

      const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` : '';

      let body = (tpl.html_body ?? '')
        .replaceAll('{{buyer_name}}', esc(r.name))
        .replaceAll('{{listing_title}}', esc(l.title))
        .replaceAll('{{stage_text}}', r.reachedPayment ? 'the payment step' : 'filling in their details')
        .replaceAll('{{item_card}}', itemCard)
        .replaceAll('{{contact_card}}', contactCard)
        .replace(/<h1 class="h1">([\s\S]*?)<\/h1>/g, (_m: string, t: string) => H1(t))
        .replace(/<p class="lead">([\s\S]*?)<\/p>/g, (_m: string, t: string) => LEAD(t))
        .replace(/<p class="fine">([\s\S]*?)<\/p>/g, (_m: string, t: string) => FINE(t))
        .replace(/\{\{whatsapp_button:([^}]*)\}\}/g, (_m: string, label: string) => wa
          ? `<a href="${waHref}" style="display:block;background:#25D366;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center;margin:0 0 4px"><img src="${WA_ICON}" width="20" height="20" alt="" style="vertical-align:middle;margin-right:8px;display:inline-block" />${esc(label)}</a>`
          : `<div style="background:#FFF8F4;border-radius:12px;padding:14px 16px;text-align:center;color:#777;font-size:14px">No phone number on file, so no WhatsApp link. Email them instead.</div>`)
        .replace(/\{\{[a-z_]+\}\}/g, '');

      const subject = (tpl.subject ?? '')
        .replaceAll('{{buyer_name}}', String(r.name))
        .replaceAll('{{listing_title}}', String(l.title ?? 'an item'));

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'BundledMum Marketplace <hello@bundledmum.com>',
          to, subject, html: layout(body),
        }),
      });

      if (res.ok) {
        const table = r.source === 'order' ? 'marketplace_orders' : 'marketplace_checkout_attempts';
        await db.from(table).update({ abandoned_alert_sent_at: new Date().toISOString() }).eq('id', r.ref_id);
        if (key) alertedToday.add(key); // stops a second row for the same person in this same run
        sent++;
      } else { skipped++; }
    }

    if (sent > 0) {
      await db.from('email_templates')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('slug', 'marketplace_admin_abandoned_checkout');
    }

    return json({ candidates: rows.length, sent, suppressed, skipped });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
