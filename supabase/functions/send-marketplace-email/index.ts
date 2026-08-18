import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const SITE = 'https://bundledmum.com';
const BM_WA = '2347040667424';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';
const PLACEHOLDER = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/bundledmum-box.png';

const N = (n: unknown) => '₦' + Number(n || 0).toLocaleString('en-NG');
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const recipients = (v: unknown) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function intlPhone(raw: unknown): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.startsWith('234') && d.length === 13) return d;
  if (d.startsWith('0') && d.length === 11) return '234' + d.slice(1);
  if (d.length === 10) return '234' + d;
  if (d.length >= 8 && d.length <= 15) return d;
  return null;
}

function isNigerian(raw: unknown): boolean {
  const d = String(raw ?? '').replace(/\D/g, '');
  return /^234\d{10}$/.test(d) || /^0\d{10}$/.test(d);
}

const pretty = (i: string) => { const l = '0' + i.slice(3); return l.slice(0,4) + ' ' + l.slice(4,7) + ' ' + l.slice(7); };
const dateNG = (d: string | null) => d ? new Date(d).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
const shortDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

function helpLink(slug: string, reference: string, name: string, item: string): string {
  const who = name ? `Hello, this is ${name}. ` : 'Hello. ';
  const ref = reference ? ` ${reference}` : '';
  const it = item ? ` ${item}` : ' my item';

  const map: Record<string, string> = {
    marketplace_order_confirmation: `${who}I have a question about my order${ref}.`,
    marketplace_buyer_dispatched: `${who}My order${ref} is marked as sent. I want to check on it or let you know if it has not arrived.`,
    marketplace_buyer_confirm_prompt: `${who}About my order${ref}, I want to let you know whether it arrived or not.`,
    marketplace_buyer_confirmed: `${who}I have confirmed my order${ref} and I have a question.`,
    marketplace_buyer_review_request: `${who}I have some feedback about my order${ref}.`,
    marketplace_buyer_offer_accepted: `${who}My price request on${it} was accepted and I need help buying it.`,
    marketplace_buyer_offer_countered: `${who}The seller suggested a different price for${it} and I need help.`,
    marketplace_buyer_offer_declined: `${who}My price request on${it} was declined and I have a question.`,
    marketplace_buyer_question_answered: `${who}I have a follow up about${it}.`,
    marketplace_category_stock_alert: `${who}I saw the new item you emailed me about and I have a question.`,
    marketplace_buyer_dispute_raised: `${who}I need help with the problem I reported on order${ref}.`,
    marketplace_buyer_dispute_resolved: `${who}I have a question about the decision on my order${ref}.`,
    marketplace_buyer_return_requested: `${who}I need help sending back the item from order${ref}.`,
    marketplace_buyer_return_confirmed: `${who}My return for order${ref} is confirmed and I am waiting on my refund.`,
    marketplace_buyer_refund_paid: `${who}My refund for order${ref} has not arrived yet.`,

    marketplace_seller_welcome: `${who}I have just joined as a seller and I need some help getting started.`,
    marketplace_seller_first_listing_guide: `${who}I need help listing my first item.`,
    marketplace_seller_listing_approved: `${who}I have a question about my listing${it}.`,
    marketplace_seller_listing_rejected: `${who}My listing${it} was not approved and I would like help fixing it.`,
    marketplace_seller_listing_idle: `${who}I need help selling my listing${it}.`,
    marketplace_seller_sale: `${who}I have sold${it}, order${ref}, and I need help with sending it.`,
    marketplace_seller_offer_received: `${who}A buyer asked for a lower price on${it} and I need help deciding.`,
    marketplace_seller_offer_answered: `${who}I have a question about the price request on${it}.`,
    marketplace_seller_question_received: `${who}A buyer asked about${it} and I need help answering.`,
    marketplace_seller_buyer_confirmed: `${who}The buyer confirmed order${ref}. I have a question about my payout.`,
    marketplace_seller_payout_sent: `${who}My payout for order${ref} has not arrived yet.`,
    marketplace_seller_review_request: `${who}I have some feedback about selling on BundledMum.`,
    marketplace_seller_dispute_raised: `${who}A buyer reported a problem with order${ref} and I want to explain my side.`,
    marketplace_seller_dispute_resolved: `${who}I have a question about the decision on order${ref}.`,
    marketplace_seller_return_incoming: `${who}A buyer is returning the item from order${ref} and I have a question.`,
    marketplace_seller_return_sent: `${who}The buyer says they have sent back order${ref} and I need help.`,

    marketplace_admin_new_sale: `Internal, new sale on order${ref}.`,
    marketplace_admin_new_seller: `Internal, new seller signed up.`,
    marketplace_admin_new_listing: `Internal, listings are waiting for review.`,
    marketplace_admin_listing_submitted: `Internal, a listing was submitted for review.`,
    marketplace_admin_seller_suspended: `Internal, a seller has been suspended.`,
    marketplace_admin_payout_digest: `Internal, payouts are due.`,
    marketplace_admin_buyer_confirmed: `Internal, buyer confirmed order${ref}, payout due.`,
    marketplace_admin_dispute_raised: `Internal, a dispute was raised on order${ref}.`,
    marketplace_admin_return_overdue: `Internal, a return is overdue on order${ref}.`,
    marketplace_admin_payment_anomaly: `Internal, payment problem on order${ref}.`,
    marketplace_admin_confirm_nudge_1: `Internal, buyer confirmation overdue on order${ref}.`,
    marketplace_admin_confirm_nudge_2: `Internal, buyer confirmation still overdue on order${ref}.`,
  };

  const msg = map[slug] ?? (reference
    ? `${who}I need help with my order${ref}.`
    : `${who}I need some help with BundledMum Marketplace.`);

  return `https://wa.me/${BM_WA}?text=${encodeURIComponent(msg)}`;
}

function layout(inner: string, preheader: string, wa: string): string {
  return `<div style="background:#FFF8F4;padding:24px 12px;font-family:Lato,Helvetica,Arial,sans-serif;color:#1A1A1A">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<div style="max-width:600px;margin:0 auto">
<div style="background:#2D6A4F;border-radius:16px 16px 0 0;padding:26px 24px;text-align:center">
<img src="${LOGO}" alt="BundledMum" width="150" style="display:block;margin:0 auto 8px;max-width:150px;height:auto" />
<div style="color:#D8EFE5;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700">Marketplace</div>
</div>
<div style="background:#ffffff;padding:28px 24px 24px">${inner}</div>
<div style="background:#D8EFE5;padding:16px 24px">
<p style="margin:0;font-size:13px;line-height:1.65;color:#1A4A33"><strong style="font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Keep it on BundledMum.</strong> Pay and get paid only through the marketplace. If anyone asks you to send money directly, do not, and tell us. Outside the platform we cannot hold the money or help if it goes wrong.</p>
</div>
<div style="background:#1A1A1A;border-radius:0 0 16px 16px;padding:20px 24px;text-align:center">
<p style="margin:0 0 6px;color:#ffffff;font-size:12px;line-height:1.6">Need help? <a href="${wa}" style="color:#D8EFE5;text-decoration:underline">Chat to us on WhatsApp</a></p>
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

function itemCard(title: string, img: string, ref: string, amountLabel: string, amount: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F4;border-radius:12px;margin:0 0 18px">
<tr><td width="88" style="padding:14px 0 14px 14px;vertical-align:top">
<img src="${img}" alt="" width="74" height="74" style="display:block;width:74px;height:74px;object-fit:cover;border-radius:10px;background:#FDE8DF" /></td>
<td style="padding:14px;vertical-align:top">
<p style="margin:0 0 5px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;line-height:1.35">${esc(title)}</p>
<p style="margin:0 0 3px;font-size:13px;color:#666">Order ${esc(ref)}</p>
<p style="margin:0;font-size:13px;color:#666">${amountLabel} <strong style="font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;color:#2D6A4F">${amount}</strong></p>
</td></tr></table>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:block;background:#F4845F;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center;margin:0 0 10px">${esc(label)}</a>`;
}

function secondaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display:block;background:#ffffff;border:2px solid #2D6A4F;color:#2D6A4F;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:13px 20px;border-radius:12px;text-align:center;margin:0 0 4px">${esc(label)}</a>`;
}

function contactBlock(
  who: string, name: string, phone: unknown, item: string, ref: string,
  viewerIsBuyer: boolean
): string {
  const i = intlPhone(phone);
  const head = `<div style="background:#FFF8F4;border:2px solid #D8EFE5;border-radius:14px;padding:18px;margin:0 0 18px">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#2D6A4F;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Your ${who}</p>
<p style="margin:0 0 10px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:19px">${esc(name)}</p>`;

  if (!i) {
    const fallback = `https://wa.me/${BM_WA}?text=${encodeURIComponent(`Hello. I need the ${who} contact details for my order ${ref}.`)}`;
    return head + `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444">We do not have a phone number on file for them yet. Message us and we will connect you.</p>
<a href="${fallback}" style="display:block;background:#25D366;color:#fff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:14px 20px;border-radius:12px;text-align:center">Chat to BundledMum</a></div>`;
  }

  const msg = viewerIsBuyer
    ? `Hello ${name},\n\nI placed an order for the ${item} you listed on BundledMum Marketplace. My order ${ref}.`
    : `Hello ${name},\n\nThis is about the ${item} you bought on BundledMum Marketplace. My order ${ref}.`;

  const callBtn = isNigerian(phone)
    ? `<a href="tel:+${i}" style="display:block;background:#fff;border:2px solid #2D6A4F;color:#2D6A4F;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:13px 20px;border-radius:12px;text-align:center">Call ${pretty(i)}</a>`
    : '';

  return head + `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#444">Message them to agree how the item travels. Your message is already written for you.</p>
<a href="https://wa.me/${i}?text=${encodeURIComponent(msg)}" style="display:block;background:#25D366;color:#fff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center;margin-bottom:${callBtn ? '10px' : '0'}">Message on WhatsApp</a>
${callBtn}</div>`;
}

function outcomeBlock(outcome: string, audience: string, amount: string, sellerAmount: string, sellerName: string): string {
  if (audience === 'buyer') {
    if (outcome === 'rejected') return callout('plain', 'We did not uphold your report', `Having looked at everything, we found the item matched how it was described, so the payment goes to ${esc(sellerName)}. We know this is not the answer you wanted.`);
    if (outcome === 'full_refund') return callout('green', 'You are getting a full refund', `We agreed with you. Your ${amount} is being refunded and the seller will not be paid.`);
    return callout('green', 'You are being made whole', `This looks like a problem in transit rather than anything the seller did. Your ${amount} is being refunded. No fault has been recorded against the seller.`);
  }
  if (outcome === 'rejected') return callout('green', 'The report was not upheld, you are being paid', `We found your item matched its description. Your ${sellerAmount} payout is unblocked and will be sent. No mark has been recorded against your account.`);
  if (outcome === 'full_refund') return callout('red', 'The buyer has been refunded, and a strike recorded', `We found the item did not match how it was described. The buyer has been refunded and this payout is cancelled. A strike has been added to your account. Three strikes suspends your selling, so please describe items very honestly, including every flaw.`);
  return callout('plain', 'Nobody was at fault', `This was a problem in transit, not something you did. The buyer has been refunded, this payout is cancelled, and importantly no strike has been recorded against you.`);
}

function refundTiming(outcome: string | null, amount: string): string {
  if (outcome !== 'full_refund' && outcome !== 'courier_fault') return '';
  return callout('plain', 'How your refund reaches you', `Your ${amount} goes back to you by bank transfer, sent the same day the seller confirms the item arrived back. If it has not appeared by the end of the next working day, message us with your order reference and we will chase it.`);
}

function render(bodyHtml: string, vars: Record<string, string>): string {
  let out = bodyHtml;
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll('{{' + k + '}}', v);
  out = out
    .replace(/<h1 class="h1">([\s\S]*?)<\/h1>/g, (_m, t) => H1(t))
    .replace(/<p class="lead">([\s\S]*?)<\/p>/g, (_m, t) => LEAD(t))
    .replace(/<p class="fine">([\s\S]*?)<\/p>/g, (_m, t) => FINE(t))
    .replace(/<div class="callout-(green|amber|plain|red)">\s*<p class="cal-t">([\s\S]*?)<\/p>\s*<p class="cal-b">([\s\S]*?)<\/p>\s*<\/div>/g,
      (_m, kind, t, b) => callout(kind, t, b));
  out = out.replace(/\{\{primary_button:([^}]*)\}\}/g, (_m, label) => button(vars.__link || SITE + '/marketplace', label));
  out = out.replace(/\{\{secondary_button:([^}]*)\}\}/g, (_m, label) => secondaryButton(vars.__link2 || SITE + '/marketplace', label));
  out = out.replace(/\{\{[a-z_]+\}\}/g, '');
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const { slug, order_id, dispute_id, force } = await req.json().catch(() => ({}));
    if (!slug) return json({ error: 'slug is required' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not configured' }, 500);

    const { data: tpl } = await db.from('email_templates').select('subject, html_body, is_active, internal_recipients').eq('slug', slug).maybeSingle();
    if (!tpl) return json({ error: 'Template not found: ' + slug }, 404);
    if (tpl.is_active === false) return json({ skipped: 'template inactive' });

    const setting = async (k: string, d: unknown) => {
      const { data } = await db.from('site_settings').select('value').eq('key', k).maybeSingle();
      return data?.value ?? d;
    };

    const internalTo = async (): Promise<string[]> => {
      const perTemplate = recipients(tpl.internal_recipients);
      if (perTemplate.length > 0) return perTemplate;
      return recipients(await setting('marketplace_payout_digest_email', ''));
    };

    let toList: string[] = [];
    let vars: Record<string, string> = {};
    let logKey = slug;
    let waRef = '';
    let waName = '';
    let waItem = '';

    if (slug === 'marketplace_admin_payout_digest' || slug === 'marketplace_admin_new_listing') {
      toList = await internalTo();
      if (toList.length === 0) return json({ skipped: 'no internal email configured' });

      const { data: queue } = await db.from('marketplace_payout_queue').select('*').eq('is_eligible', true).neq('settlement_status', 'settled');
      const { count: disputes } = await db.from('marketplace_disputes').select('id', { count: 'exact', head: true }).is('outcome', null);
      const { count: reviews } = await db.from('marketplace_listings').select('id', { count: 'exact', head: true }).eq('status', 'pending_review');
      const { data: refunds } = await db.from('marketplace_orders').select('amount_naira').eq('order_status', 'refunded').neq('settlement_status', 'settled');
      const { data: held } = await db.from('marketplace_orders').select('amount_naira').eq('payment_status', 'paid').neq('settlement_status', 'settled');

      if (slug === 'marketplace_admin_new_listing' && !reviews) return json({ skipped: 'nothing awaiting review' });
      if (slug === 'marketplace_admin_payout_digest' && (!queue || queue.length === 0)) return json({ skipped: 'no payouts due' });

      const total = (queue ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.seller_share_naira || 0), 0);
      const rows = (queue ?? []).map((r: Record<string, unknown>) => `<tr>
<td style="padding:10px 8px;border-bottom:1px solid #EEE7E2;font-size:13px"><strong>${esc(r.seller_name)}</strong><br/><span style="color:#666">${esc(r.bank_name)} ${esc(r.bank_account_number)}</span></td>
<td style="padding:10px 8px;border-bottom:1px solid #EEE7E2;font-size:13px;color:#666">${esc(r.order_reference)}<br/><span style="color:${r.eligible_via === 'buyer_confirmed' ? '#2D6A4F' : '#D4613C'}">${r.eligible_via === 'buyer_confirmed' ? 'Buyer confirmed' : 'Timeout sweep'}</span></td>
<td style="padding:10px 8px;border-bottom:1px solid #EEE7E2;font-size:14px;text-align:right;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">${N(r.seller_share_naira)}${Number(r.outstanding_debit_naira) > 0 ? `<br/><span style="color:#C0392B;font-size:11px;font-weight:400">owes ${N(r.outstanding_debit_naira)}</span>` : ''}</td></tr>`).join('');

      vars = {
        payout_count: String((queue ?? []).length),
        payout_total: N(total),
        payout_table: rows ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${rows}</table>` : '',
        open_disputes: String(disputes ?? 0),
        pending_reviews: String(reviews ?? 0),
        refunds_pending: String((refunds ?? []).length),
        held_funds: N((held ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount_naira || 0), 0)),
        oldest_wait: 'a while',
        __link: SITE + '/admin/marketplace/' + (slug === 'marketplace_admin_new_listing' ? 'review' : 'payouts'),
      };
      logKey = slug + ':' + new Date().toISOString().slice(0, 10);
    } else {
      if (!order_id) return json({ error: 'order_id is required for ' + slug }, 400);
      const { data: o } = await db.from('marketplace_orders').select('*').eq('id', order_id).maybeSingle();
      if (!o) return json({ error: 'Order not found' }, 404);

      const { data: l } = await db.from('marketplace_listings').select('title, image_url, rejection_reason').eq('id', o.listing_id).maybeSingle();
      const { data: s } = await db.from('marketplace_sellers').select('display_name, phone, whatsapp_number, bank_name, bank_account_number, strike_count, customer_id').eq('id', o.seller_id).maybeSingle();
      const { data: b } = await db.from('customers').select('email, full_name, phone, whatsapp_number').eq('id', o.buyer_id).maybeSingle();
      let sellerEmail = '';
      if (s?.customer_id) {
        const { data: sc } = await db.from('customers').select('email').eq('id', s.customer_id).maybeSingle();
        sellerEmail = sc?.email ?? '';
      }

      let dispute: Record<string, unknown> | null = null;
      if (dispute_id) {
        const { data: d } = await db.from('marketplace_disputes').select('*').eq('id', dispute_id).maybeSingle();
        dispute = d;
      } else {
        const { data: d } = await db.from('marketplace_disputes').select('*').eq('order_id', order_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        dispute = d;
      }

      const audience = (slug.includes('_seller_') || slug.includes('_listing_')) ? 'seller' : (slug.includes('_admin_') ? 'admin' : 'buyer');
      if (audience === 'seller') toList = sellerEmail ? [sellerEmail] : [];
      else if (audience === 'admin') toList = await internalTo();
      else toList = b?.email ? [b.email] : [];
      if (toList.length === 0) return json({ skipped: 'no recipient email for ' + audience });

      const windowDays = Number(await setting('marketplace_dispute_window_days', 3));
      const deadline = o.dispatch_confirmed_at ? new Date(new Date(o.dispatch_confirmed_at).getTime() + windowDays * 86400000).toISOString() : null;

      const buyerLink = SITE + '/marketplace/orders/' + o.id;
      const sellerLink = SITE + '/marketplace/sell/orders/' + o.id;
      const adminLink = SITE + '/admin/marketplace/payouts';
      const link = audience === 'seller' ? sellerLink : (audience === 'admin' ? adminLink : buyerLink);

      let finalLink = link;
      if (audience === 'buyer' && b?.email) {
        try {
          const { data: gl } = await db.auth.admin.generateLink({ type: 'magiclink', email: b.email, options: { redirectTo: link } });
          if (gl?.properties?.action_link) finalLink = gl.properties.action_link;
        } catch (_) { /* plain link fallback */ }
      }

      waRef = o.paystack_transaction_reference || '';
      waName = audience === 'seller' ? (s?.display_name || '') : (b?.full_name || '');
      waItem = l?.title || '';

      const dispatchBlock = o.dispatch_photo_url
        ? `<div style="margin:0 0 18px"><p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#2D6A4F;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Seller's dispatch photo</p><img src="${o.dispatch_photo_url}" alt="" width="552" style="display:block;width:100%;max-width:552px;border-radius:12px" /></div>`
        : '';

      // Payout proof lives in a PRIVATE bucket, since these are screenshots of
      // bank transfers. A plain URL would not load in an email client, so a
      // signed link is generated here, valid for 7 days to match the purge job.
      let payoutProofBlock = '';
      if (o.payout_proof_url) {
        let proofSrc = String(o.payout_proof_url);
        try {
          const marker = '/payout-proofs/';
          const idx = proofSrc.indexOf(marker);
          const path = idx >= 0 ? proofSrc.slice(idx + marker.length) : proofSrc;
          const { data: signed } = await db.storage.from('payout-proofs').createSignedUrl(path, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) proofSrc = signed.signedUrl;
        } catch (_) { /* fall back to whatever was stored */ }

        payoutProofBlock = `<div style="margin:0 0 18px"><p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#2D6A4F;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Proof of your payment</p><img src="${proofSrc}" alt="Payment screenshot" width="552" style="display:block;width:100%;max-width:552px;border-radius:12px;border:1px solid #EEE7E2" /><p style="margin:8px 0 0;font-size:12.5px;color:#777">Check this against your bank. If it has not landed within a day, message us.</p></div>`;
      }

      const margin = Number(o.amount_naira || 0) - Number(o.seller_share_naira || 0);

      vars = {
        buyer_name: esc(b?.full_name || 'the buyer'),
        seller_name: esc(s?.display_name || 'the seller'),
        listing_title: esc(l?.title || 'your item'),
        order_reference: esc(o.paystack_transaction_reference || ''),
        order_date: shortDate(o.created_at),
        amount_paid: N(o.amount_naira),
        seller_amount: N(o.seller_share_naira),
        platform_margin: N(margin),
        strike_count: String(s?.strike_count ?? 0),
        seller_phone: esc(s?.whatsapp_number || s?.phone || 'not on file'),
        payout_bank: esc([s?.bank_name, s?.bank_account_number ? '****' + String(s.bank_account_number).slice(-4) : ''].filter(Boolean).join(' ')) || 'your bank account',
        window_days: String(windowDays),
        deadline_date: dateNG(deadline),
        dispute_reason: esc(dispute?.reason || 'No reason was recorded.'),
        outcome_note: esc(dispute?.outcome_notes || ''),
        rejection_reason: esc(l?.rejection_reason || ''),
        dispatch_photo_block: dispatchBlock,
        payout_proof_block: payoutProofBlock,
        refund_timing_block: refundTiming(dispute?.outcome ? String(dispute.outcome) : null, N(o.amount_naira)),
        item_card: itemCard(l?.title || 'your item', l?.image_url || PLACEHOLDER, o.paystack_transaction_reference || '', audience === 'seller' ? 'You receive' : 'You paid', audience === 'seller' ? N(o.seller_share_naira) : N(o.amount_naira)),
        contact_block: audience === 'seller'
          ? contactBlock('buyer', b?.full_name || 'the buyer', b?.whatsapp_number || b?.phone, l?.title || 'item', o.paystack_transaction_reference || '', false)
          : contactBlock('seller', s?.display_name || 'the seller', s?.whatsapp_number || s?.phone, l?.title || 'item', o.paystack_transaction_reference || '', true),
        outcome_block: dispute?.outcome ? outcomeBlock(String(dispute.outcome), audience, N(o.amount_naira), N(o.seller_share_naira), s?.display_name || 'the seller') : '',
        __link: finalLink,
        __link2: audience === 'seller' ? SITE + '/marketplace/sell/new' : SITE + '/marketplace',
      };
      logKey = slug;
    }

    if (!force && order_id) {
      const { data: sent } = await db.from('marketing_email_log').select('id').eq('customer_email', toList[0]).eq('email_type', logKey).eq('order_id', order_id).maybeSingle();
      if (sent) return json({ skipped: 'already sent' });
    }

    const html = layout(
      render(tpl.html_body ?? '', vars),
      (tpl.subject ?? '').replace(/\{\{[^}]+\}\}/g, ''),
      helpLink(slug, waRef, waName, waItem)
    );
    let subject = tpl.subject ?? '';
    for (const [k, v] of Object.entries(vars)) subject = subject.replaceAll('{{' + k + '}}', String(v).replace(/<[^>]*>/g, ''));
    subject = subject.replace(/\{\{[a-z_]+\}\}/g, '').replace(/\s+/g, ' ').trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'BundledMum Marketplace <hello@bundledmum.com>', to: toList, subject, html }),
    });
    const rb = await res.json();
    if (!res.ok) return json({ error: rb?.message ?? 'Could not send' }, 502);

    if (order_id) await db.from('marketing_email_log').insert({ customer_email: toList[0], email_type: logKey, order_id });
    await db.from('email_templates').update({ last_sent_at: new Date().toISOString() }).eq('slug', slug);

    return json({ sent: true, slug, to: toList });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
