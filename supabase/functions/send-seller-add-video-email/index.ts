import { createClient } from 'jsr:@supabase/supabase-js@2';

// ONE email per SELLER covering ALL their listings that have no video, never
// one per listing. A seller with 20 items receiving 20 emails unsubscribes,
// and rightly so.
//
// Built in the same shape as send-marketplace-seller-email (same layout,
// same class-to-style rewriting) rather than going through
// send-marketplace-email, which is built around ORDERS and refuses anything
// with no order_id.
//
// The list leads with the required-category items, because those are the
// ones where a photo genuinely cannot answer the buyer's question, then the
// rest by how many people are looking. Capped, with an honest "and N more".
const SITE = 'https://bundledmum.com';
const LOGO = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/BM-LOGO-WHITE.png';
const MAX_ITEMS = 5;

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

function callout(kind: string, title: string, body: string): string {
  const s: Record<string, string[]> = {
    green: ['#D8EFE5', '#1A4A33', '#1A4A33'],
    plain: ['#FFF8F4', '#2D6A4F', '#444'],
  };
  const [bg, tc, bc] = s[kind] ?? s.plain;
  return `<div style="background:${bg};border-radius:12px;padding:16px 18px;margin:0 0 18px">
<p style="margin:0 0 6px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:14px;color:${tc}">${title}</p>
<p style="margin:0;font-size:14px;line-height:1.65;color:${bc}">${body}</p></div>`;
}

/** One row per listing: the item, why it matters, and what to film. */
function itemBlock(r: Record<string, unknown>): string {
  const title = esc(r.title ?? 'Your listing');
  const guidance = esc(r.video_guidance ?? '');
  const required = r.video_required === true;
  const views = Number(r.view_count ?? 0);
  const seen = views > 0
    ? `${views} ${views === 1 ? 'person has' : 'people have'} looked at this one.`
    : '';
  return `<div style="border:1px solid #F0DDD2;border-radius:12px;padding:14px 16px;margin:0 0 10px">
<p style="margin:0 0 4px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:15px;color:#1A1A1A">${title}</p>
${required ? `<p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#D4613C">Buyers cannot tell this one works from a photo</p>` : ''}
${seen ? `<p style="margin:0 0 6px;font-size:13px;color:#666">${seen}</p>` : ''}
${guidance ? `<p style="margin:0;font-size:13.5px;line-height:1.6;color:#444"><b>Film this:</b> ${guidance}</p>` : ''}
</div>`;
}

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const { seller_id } = await req.json().catch(() => ({}));
    if (!seller_id) return json({ error: 'seller_id is required' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not configured' }, 500);

    const { data: tpl } = await db.from('email_templates')
      .select('subject, html_body, is_active').eq('slug', 'marketplace_seller_add_video').maybeSingle();
    if (!tpl || tpl.is_active === false) return json({ skipped: 'template inactive or missing' });

    const { data: s } = await db.from('marketplace_sellers')
      .select('display_name, customer_id').eq('id', seller_id).maybeSingle();
    if (!s?.customer_id) return json({ skipped: 'seller not found' });

    const { data: c } = await db.from('customers').select('email').eq('id', s.customer_id).maybeSingle();
    if (!c?.email) return json({ skipped: 'no seller email on file' });

    // Every listing of theirs with no video, required first then most
    // viewed. One query, one email, however many listings they have.
    const { data: rows } = await db.from('marketplace_listings_needing_video')
      .select('title, video_required, video_guidance, view_count')
      .eq('seller_id', seller_id)
      .order('video_required', { ascending: false })
      .order('view_count', { ascending: false });

    const all = rows ?? [];
    if (all.length === 0) return json({ skipped: 'nothing without a video' });

    const shown = all.slice(0, MAX_ITEMS);
    const more = all.length - shown.length;
    const blocks = shown.map(itemBlock).join('')
      + (more > 0
        ? `<p style="margin:2px 0 18px;font-size:13.5px;color:#666">And ${more} more ${more === 1 ? 'listing' : 'listings'} with no video yet.</p>`
        : '');

    const vars: Record<string, string> = {
      seller_name: esc(s.display_name || 'there'),
      first_item: esc(shown[0]?.title ?? 'listing'),
      listing_blocks: blocks,
    };

    let body = tpl.html_body ?? '';
    for (const [k, v] of Object.entries(vars)) body = body.replaceAll('{{' + k + '}}', v);
    body = body
      .replace(/<h1 class="h1">([\s\S]*?)<\/h1>/g, (_m, t) => H1(t))
      .replace(/<p class="lead">([\s\S]*?)<\/p>/g, (_m, t) => LEAD(t))
      .replace(/<p class="fine">([\s\S]*?)<\/p>/g, (_m, t) => FINE(t))
      .replace(/<div class="callout-(green|plain)">\s*<p class="cal-t">([\s\S]*?)<\/p>\s*<p class="cal-b">([\s\S]*?)<\/p>\s*<\/div>/g, (_m, kind, t, b) => callout(kind, t, b))
      .replace(/\{\{primary_button:([^}]*)\}\}/g, (_m, label) => `<a href="${SITE}/marketplace/sell/dashboard" style="display:block;background:#F4845F;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center">${esc(label)}</a>`)
      .replace(/\{\{[a-z_]+\}\}/g, '');

    let subject = tpl.subject ?? '';
    for (const [k, v] of Object.entries(vars)) subject = subject.replaceAll('{{' + k + '}}', v.replace(/<[^>]*>/g, ''));

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'BundledMum Marketplace <hello@bundledmum.com>', to: [c.email], subject, html: layout(body) }),
    });
    const rb = await res.json();
    if (!res.ok) return json({ error: rb?.message ?? 'Could not send' }, 502);

    return json({ sent: true, to: c.email, listings: all.length, shown: shown.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
