import { createClient } from 'jsr:@supabase/supabase-js@2';

// Negotiation emails. Separate sender because these need offer context, and
// because buyer and seller must see completely different figures.
const SITE = 'https://bundledmum.com';
const BM_WA = '2347040667424';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';
const PLACEHOLDER = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/bundledmum-box.png';

const N = (n: unknown) => '₦' + Number(n || 0).toLocaleString('en-NG');
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function layout(inner: string, wa: string): string {
  return `<div style="background:#FFF8F4;padding:24px 12px;font-family:Lato,Helvetica,Arial,sans-serif;color:#1A1A1A">
<div style="max-width:600px;margin:0 auto">
<div style="background:#2D6A4F;border-radius:16px 16px 0 0;padding:26px 24px;text-align:center">
<img src="${LOGO}" alt="BundledMum" width="150" style="display:block;margin:0 auto 8px;max-width:150px;height:auto" />
<div style="color:#D8EFE5;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-weight:700">Marketplace</div>
</div>
<div style="background:#ffffff;padding:28px 24px 24px">${inner}</div>
<div style="background:#D8EFE5;padding:16px 24px">
<p style="margin:0;font-size:13px;line-height:1.65;color:#1A4A33"><strong style="font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Keep it on BundledMum.</strong> Agree prices and pay only through the marketplace. If anyone asks you to settle directly, do not, and tell us.</p>
</div>
<div style="background:#1A1A1A;border-radius:0 0 16px 16px;padding:20px 24px;text-align:center">
<p style="margin:0 0 6px;color:#ffffff;font-size:12px;line-height:1.6">Need help? <a href="${wa}" style="color:#D8EFE5;text-decoration:underline">Chat to us on WhatsApp</a></p>
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
    const { slug, offer_id } = await req.json().catch(() => ({}));
    if (!slug || !offer_id) return json({ error: 'slug and offer_id are required' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not configured' }, 500);

    const { data: tpl } = await db.from('email_templates').select('subject, html_body, is_active').eq('slug', slug).maybeSingle();
    if (!tpl) return json({ error: 'Template not found' }, 404);
    if (tpl.is_active === false) return json({ skipped: 'template inactive' });

    const { data: o } = await db.from('marketplace_offers').select('*').eq('id', offer_id).maybeSingle();
    if (!o) return json({ error: 'Offer not found' }, 404);

    const { data: l } = await db.from('marketplace_listings')
      .select('id, title, image_url, price_naira, final_price_naira').eq('id', o.listing_id).maybeSingle();
    const { data: s } = await db.from('marketplace_sellers')
      .select('display_name, customer_id').eq('id', o.seller_id).maybeSingle();
    const { data: b } = await db.from('customers').select('email, full_name').eq('id', o.buyer_id).maybeSingle();

    let sellerEmail = '';
    if (s?.customer_id) {
      const { data: sc } = await db.from('customers').select('email').eq('id', s.customer_id).maybeSingle();
      sellerEmail = sc?.email ?? '';
    }

    const audience = slug.includes('_seller_') ? 'seller' : 'buyer';
    const to = audience === 'seller' ? sellerEmail : (b?.email ?? '');
    if (!to) return json({ skipped: 'no recipient for ' + audience });

    const { data: hoursSetting } = await db.from('site_settings').select('value').eq('key', 'marketplace_offer_expiry_hours').maybeSingle();

    // Send each person to the page where they can actually act, not just to the
    // listing. A buyer told the seller countered needs the accept and decline
    // buttons, which live on the offer page, not the listing page.
    const offerPage = SITE + '/marketplace/listing/' + o.listing_id + '/offer';
    const listingPage = SITE + '/marketplace/listing/' + o.listing_id;
    const sellerDash = SITE + '/marketplace/sell/dashboard';

    let link: string;
    if (audience === 'seller') {
      link = sellerDash;
    } else if (slug === 'marketplace_buyer_offer_countered') {
      link = offerPage;            // accept or decline lives here
    } else if (slug === 'marketplace_buyer_offer_accepted') {
      link = listingPage;          // they are buying now, the listing is right
    } else {
      link = listingPage;          // declined, the item is still there at full price
    }

    if (audience === 'buyer' && b?.email) {
      try {
        const { data: gl } = await db.auth.admin.generateLink({ type: 'magiclink', email: b.email, options: { redirectTo: link } });
        if (gl?.properties?.action_link) link = gl.properties.action_link;
      } catch (_) { /* plain link fallback */ }
    }

    const waMsg = audience === 'seller'
      ? `Hello. I need help with a price request on my listing ${l?.title ?? ''}.`
      : `Hello. I need help with the lower price I asked for on ${l?.title ?? ''}.`;
    const wa = `https://wa.me/${BM_WA}?text=${encodeURIComponent(waMsg.replace(/\s+/g, ' ').trim())}`;

    const counterOutcome = o.status === 'counter_accepted' ? 'accepted' : 'declined';
    const counterBlock = o.status === 'counter_accepted'
      ? callout('green', 'They accepted, and can now buy it',
          `You will receive ${N(o.counter_seller_amount_naira)} if they complete the purchase. The item is still listed until they pay.`)
      : callout('plain', 'They decided not to go ahead',
          'Your item stays listed at your normal price, nothing has changed.');

    const itemCard = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F4;border-radius:12px;margin:0 0 18px">
<tr><td width="88" style="padding:14px 0 14px 14px;vertical-align:top">
<img src="${l?.image_url || PLACEHOLDER}" alt="" width="74" height="74" style="display:block;width:74px;height:74px;object-fit:cover;border-radius:10px;background:#FDE8DF" /></td>
<td style="padding:14px;vertical-align:top">
<p style="margin:0 0 5px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;line-height:1.35">${esc(l?.title ?? 'your item')}</p>
</td></tr></table>`;

    const vars: Record<string, string> = {
      listing_title: esc(l?.title ?? 'your item'),
      seller_name: esc(s?.display_name ?? 'the seller'),
      buyer_name: esc(b?.full_name ?? 'a buyer'),
      item_card: itemCard,
      offer_expiry_hours: String(hoursSetting?.value ?? 48),
      offer_seller_amount: N(o.seller_amount_naira),
      seller_asking: N(l?.price_naira),
      counter_outcome: counterOutcome,
      counter_outcome_block: counterBlock,
      listing_price: N(l?.final_price_naira),
      offer_buyer_price: N(o.buyer_price_naira),
      offer_discount: N(o.buyer_discount_naira),
      counter_buyer_price: N(o.counter_buyer_price_naira),
      counter_discount: N(Number(l?.final_price_naira ?? 0) - Number(o.counter_buyer_price_naira ?? 0)),
    };

    let body = tpl.html_body ?? '';
    for (const [k, v] of Object.entries(vars)) body = body.replaceAll('{{' + k + '}}', v);
    body = body
      .replace(/<h1 class="h1">([\s\S]*?)<\/h1>/g, (_m, t) => H1(t))
      .replace(/<p class="lead">([\s\S]*?)<\/p>/g, (_m, t) => LEAD(t))
      .replace(/<p class="fine">([\s\S]*?)<\/p>/g, (_m, t) => FINE(t))
      .replace(/<div class="callout-(green|amber|plain|red)">\s*<p class="cal-t">([\s\S]*?)<\/p>\s*<p class="cal-b">([\s\S]*?)<\/p>\s*<\/div>/g, (_m, kind, t, bb) => callout(kind, t, bb))
      .replace(/\{\{primary_button:([^}]*)\}\}/g, (_m, label) => `<a href="${link}" style="display:block;background:#F4845F;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center">${esc(label)}</a>`)
      .replace(/\{\{[a-z_]+\}\}/g, '');

    let subject = tpl.subject ?? '';
    for (const [k, v] of Object.entries(vars)) subject = subject.replaceAll('{{' + k + '}}', String(v).replace(/<[^>]*>/g, ''));
    subject = subject.replace(/\{\{[a-z_]+\}\}/g, '').replace(/\s+/g, ' ').trim();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'BundledMum Marketplace <hello@bundledmum.com>', to: [to], subject, html: layout(body, wa) }),
    });
    const rb = await res.json();
    if (!res.ok) return json({ error: rb?.message ?? 'Could not send' }, 502);

    await db.from('email_templates').update({ last_sent_at: new Date().toISOString() }).eq('slug', slug);
    return json({ sent: true, slug, to, link_target: audience === 'seller' ? 'dashboard' : (slug.includes('countered') ? 'offer page' : 'listing') });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
