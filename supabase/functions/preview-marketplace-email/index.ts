import { createClient } from 'jsr:@supabase/supabase-js@2';

// Renders a marketplace email template exactly as it will be sent, using sample
// data, and returns the HTML instead of sending it. The admin editor stores body
// fragments in shorthand, so previewing the raw body looks plain and misleading.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const SITE = 'https://bundledmum.com';
const BM_WA = '2347040667424';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';
const SAMPLE_IMG = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/bundledmum-box.png';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function layout(inner: string): string {
  return `<div style="background:#FFF8F4;padding:24px 12px;font-family:Lato,Helvetica,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:600px;margin:0 auto">
<div style="background:#2D6A4F;border-radius:16px 16px 0 0;padding:26px 24px;text-align:center">
<img src="${LOGO}" alt="BundledMum" width="150" style="display:block;margin:0 auto 8px;max-width:150px;height:auto" />
<div style="color:#D8EFE5;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700">Marketplace</div>
</div>
<div style="background:#ffffff;padding:28px 24px 24px">${inner}</div>
<div style="background:#D8EFE5;padding:16px 24px">
<p style="margin:0;font-size:13px;line-height:1.65;color:#1A4A33"><strong style="font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Keep it on BundledMum.</strong> Pay and get paid only through the marketplace. If anyone asks you to send money directly, do not, and tell us.</p>
</div>
<div style="background:#1A1A1A;border-radius:0 0 16px 16px;padding:20px 24px;text-align:center">
<p style="margin:0 0 6px;color:#ffffff;font-size:12px;line-height:1.6">Need help? <a href="https://wa.me/${BM_WA}" style="color:#D8EFE5;text-decoration:underline">Chat to us on WhatsApp</a></p>
<p style="margin:0;color:#888;font-size:11px;line-height:1.6">BundledMum Marketplace, Lagos, Nigeria. Payments handled by Paystack. Prices in naira.</p>
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

const SAMPLE: Record<string, string> = {
  buyer_name: 'Chioma Eze',
  seller_name: 'Amaka O.',
  listing_title: 'Chicco Bravo stroller, folds flat',
  order_reference: 'BMM-K4T7XQZP',
  order_date: '2 August 2026',
  amount_paid: '₦51,117',
  seller_amount: '₦45,000',
  platform_margin: '₦6,117',
  strike_count: '1',
  seller_phone: '0801 234 5678',
  payout_bank: 'GTBank ****6789',
  window_days: '3',
  deadline_date: 'Friday, 8 August',
  dispute_reason: 'The frame has a crack on the right side that was not shown in any photo.',
  outcome_note: 'We compared the buyer photos with the listing photos and the crack is not visible in any of them.',
  rejection_reason: 'The main photo is blurry, please retake it in daylight so buyers can see the item clearly.',
  payout_count: '7',
  payout_total: '₦312,750',
  open_disputes: '2',
  pending_reviews: '9',
  refunds_pending: '1',
  held_funds: '₦486,300',
  oldest_wait: '14 hours',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const url = new URL(req.url);
    let slug = url.searchParams.get('slug') ?? '';
    let bodyOverride: string | null = null;
    if (req.method === 'POST') {
      const p = await req.json().catch(() => ({}));
      slug = p.slug ?? slug;
      bodyOverride = p.html_body ?? null;
    }
    if (!slug && !bodyOverride) return json({ error: 'slug is required' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let raw = bodyOverride;
    let subject = '';
    if (!raw) {
      const { data: tpl } = await db.from('email_templates').select('subject, html_body').eq('slug', slug).maybeSingle();
      if (!tpl) return json({ error: 'Template not found' }, 404);
      raw = tpl.html_body ?? '';
      subject = tpl.subject ?? '';
    }

    const audience = (slug.includes('_seller_') || slug.includes('_listing_')) ? 'seller' : 'buyer';
    const amountLabel = audience === 'seller' ? 'You receive' : 'You paid';
    const amountVal = audience === 'seller' ? SAMPLE.seller_amount : SAMPLE.amount_paid;

    const itemCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F4;border-radius:12px;margin:0 0 18px">
<tr><td width="88" style="padding:14px 0 14px 14px;vertical-align:top">
<img src="${SAMPLE_IMG}" alt="" width="74" height="74" style="display:block;width:74px;height:74px;object-fit:cover;border-radius:10px;background:#FDE8DF" /></td>
<td style="padding:14px;vertical-align:top">
<p style="margin:0 0 5px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;line-height:1.35">${SAMPLE.listing_title}</p>
<p style="margin:0 0 3px;font-size:13px;color:#666">Order ${SAMPLE.order_reference}</p>
<p style="margin:0;font-size:13px;color:#666">${amountLabel} <strong style="font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;color:#2D6A4F">${amountVal}</strong></p>
</td></tr></table>`;

    const who = audience === 'seller' ? 'buyer' : 'seller';
    const contactName = audience === 'seller' ? SAMPLE.buyer_name : SAMPLE.seller_name;
    const contactCard = `<div style="background:#FFF8F4;border:2px solid #D8EFE5;border-radius:14px;padding:18px;margin:0 0 18px">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#2D6A4F;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Your ${who}</p>
<p style="margin:0 0 10px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:19px">${contactName}</p>
<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#444">Message them to agree how the item travels. Your message is already written for you.</p>
<a href="#" style="display:block;background:#25D366;color:#fff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center;margin-bottom:10px">Message on WhatsApp</a>
<a href="#" style="display:block;background:#fff;border:2px solid #2D6A4F;color:#2D6A4F;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:13px 20px;border-radius:12px;text-align:center">Call 0801 234 5678</a></div>`;

    const vars: Record<string, string> = {
      ...SAMPLE,
      item_card: itemCard,
      contact_block: contactCard,
      dispatch_photo_block: `<div style="margin:0 0 18px"><p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#2D6A4F;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Seller's dispatch photo</p><img src="${SAMPLE_IMG}" alt="" width="552" style="display:block;width:100%;max-width:552px;border-radius:12px" /></div>`,
      outcome_block: callout('green', 'You are getting a full refund', 'We agreed with you. Your ₦51,117 is being refunded and the seller will not be paid.'),
      refund_timing_block: callout('plain', 'How your refund reaches you', 'Your ₦51,117 goes back to the card you paid with, through Paystack. We start it by hand, so it is not instant.'),
      payout_table: `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
<td style="padding:10px 8px;border-bottom:1px solid #EEE7E2;font-size:13px"><strong>Amaka O.</strong><br/><span style="color:#666">GTBank 0123456789</span></td>
<td style="padding:10px 8px;border-bottom:1px solid #EEE7E2;font-size:13px;color:#666">BMM-K4T7XQZP<br/><span style="color:#2D6A4F">Buyer confirmed</span></td>
<td style="padding:10px 8px;border-bottom:1px solid #EEE7E2;font-size:14px;text-align:right;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">₦45,000</td></tr></table>`,
    };

    let out = raw ?? '';
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll('{{' + k + '}}', v);
    out = out
      .replace(/<h1 class="h1">([\s\S]*?)<\/h1>/g, (_m, t) => H1(t))
      .replace(/<p class="lead">([\s\S]*?)<\/p>/g, (_m, t) => LEAD(t))
      .replace(/<p class="fine">([\s\S]*?)<\/p>/g, (_m, t) => FINE(t))
      .replace(/<div class="callout-(green|amber|plain|red)">\s*<p class="cal-t">([\s\S]*?)<\/p>\s*<p class="cal-b">([\s\S]*?)<\/p>\s*<\/div>/g, (_m, kind, t, b) => callout(kind, t, b))
      .replace(/\{\{primary_button:([^}]*)\}\}/g, (_m, label) => `<a href="#" style="display:block;background:#F4845F;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center;margin:0 0 4px">${esc(label)}</a>`)
      .replace(/\{\{[a-z_]+\}\}/g, '');

    for (const [k, v] of Object.entries(SAMPLE)) subject = subject.replaceAll('{{' + k + '}}', v);

    const html = layout(out);

    if (url.searchParams.get('format') === 'html' || req.method === 'GET') {
      return new Response(html, { headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return json({ html, subject, sample: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
