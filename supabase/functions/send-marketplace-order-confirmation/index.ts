import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE = 'https://bundledmum.com';
const BM_WHATSAPP = '2347040667424';

function naira(n: number): string {
  return `₦${Number(n || 0).toLocaleString('en-NG')}`;
}

function toIntlPhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.startsWith('234') && d.length === 13) return d;
  if (d.startsWith('0') && d.length === 11) return `234${d.slice(1)}`;
  if (d.length === 10) return `234${d}`;
  return null;
}

function prettyPhone(intl: string): string {
  const local = `0${intl.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sellerBlock(sellerName: string, phone: string | null, itemTitle: string, reference: string): string {
  const intl = toIntlPhone(phone);
  const heading = '<div style="background:#ffffff;padding:8px 24px 20px"><div style="background:#FFF8F4;border:2px solid #D8EFE5;border-radius:14px;padding:20px"><p style="margin:0 0 4px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#2D6A4F;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800">Your seller</p><p style="margin:0 0 4px;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:20px">' + esc(sellerName) + '</p>';

  if (!intl) {
    return heading + '<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#444">We do not have a phone number on file for this seller yet. Message us and we will connect you.</p><a href="https://wa.me/' + BM_WHATSAPP + '" style="display:block;background:#25D366;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:14px 20px;border-radius:12px;text-align:center">Chat to BundledMum</a></div></div>';
  }

  const msg = encodeURIComponent('Hello ' + sellerName + ', I just bought your "' + itemTitle + '" on BundledMum Marketplace. My order reference is ' + reference + '. Please let me know how you will send it.');

  return heading + '<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444">Message ' + esc(sellerName) + ' now to agree how your item gets to you. Your message is already written for you.</p><a href="https://wa.me/' + intl + '?text=' + msg + '" style="display:block;background:#25D366;color:#ffffff;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:15px 20px;border-radius:12px;text-align:center;margin-bottom:10px">Message on WhatsApp</a><a href="tel:+' + intl + '" style="display:block;background:#ffffff;border:2px solid #2D6A4F;color:#2D6A4F;text-decoration:none;font-family:Nunito,Helvetica,Arial,sans-serif;font-weight:800;font-size:16px;padding:13px 20px;border-radius:12px;text-align:center">Call ' + prettyPhone(intl) + '</a></div></div>';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const { order_id, force } = await req.json().catch(() => ({}));
    if (!order_id) return json({ error: 'order_id is required' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: order } = await admin
      .from('marketplace_orders')
      .select('id, buyer_id, seller_id, listing_id, amount_naira, item_price_naira, service_fee_naira, paystack_fee_naira, payment_status, paystack_transaction_reference')
      .eq('id', order_id)
      .maybeSingle();
    if (!order) return json({ error: 'Order not found' }, 404);
    if (order.payment_status !== 'paid') return json({ error: 'Order is not paid' }, 409);

    const { data: customer } = await admin
      .from('customers')
      .select('id, email')
      .eq('id', order.buyer_id)
      .maybeSingle();
    if (!customer?.email) return json({ error: 'No email on this order' }, 400);

    const { data: listing } = await admin
      .from('marketplace_listings')
      .select('title, image_url')
      .eq('id', order.listing_id)
      .maybeSingle();

    const { data: seller } = await admin
      .from('marketplace_sellers')
      .select('display_name, phone')
      .eq('id', order.seller_id)
      .maybeSingle();

    if (!force) {
      const { data: already } = await admin
        .from('marketing_email_log')
        .select('id')
        .eq('customer_email', customer.email)
        .eq('email_type', 'marketplace_order_confirmation')
        .eq('order_id', order.id)
        .maybeSingle();
      if (already) return json({ skipped: 'already sent' });
    }

    const { data: template } = await admin
      .from('email_templates')
      .select('subject, html_body, is_active')
      .eq('slug', 'marketplace_order_confirmation')
      .maybeSingle();
    if (!template) return json({ error: 'Template not found' }, 500);
    if (template.is_active === false) return json({ skipped: 'template inactive' });

    const destination = SITE + '/marketplace/orders/' + order.id;
    let orderLink = destination;
    try {
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: customer.email,
        options: { redirectTo: destination },
      });
      if (!linkError && linkData?.properties?.action_link) {
        orderLink = linkData.properties.action_link;
      }
    } catch (_) { /* fall back to plain destination */ }

    const sellerName = seller?.display_name || 'your seller';
    const itemTitle = listing?.title || 'your item';
    const reference = order.paystack_transaction_reference || '';
    const placeholderImg = 'https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/site-images/bundledmum-box.png';

    const fill = (s: string) => s
      .replaceAll('{{order_reference}}', esc(reference))
      .replaceAll('{{listing_title}}', esc(itemTitle))
      .replaceAll('{{seller_name}}', esc(sellerName))
      .replaceAll('{{item_image}}', listing?.image_url || placeholderImg)
      .replaceAll('{{amount_paid}}', naira(order.amount_naira))
      .replaceAll('{{item_price}}', naira(order.item_price_naira))
      .replaceAll('{{service_fee}}', naira(order.service_fee_naira))
      .replaceAll('{{payment_fee}}', naira(order.paystack_fee_naira))
      .replaceAll('{{order_link}}', orderLink)
      .replaceAll('{{seller_contact_block}}', sellerBlock(sellerName, seller?.phone ?? null, itemTitle, reference));

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return json({ error: 'Email is not configured' }, 500);

    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'BundledMum Marketplace <hello@bundledmum.com>',
        to: [customer.email],
        subject: fill(template.subject ?? ''),
        html: fill(template.html_body ?? ''),
      }),
    });

    const sendBody = await sendRes.json();
    if (!sendRes.ok) return json({ error: sendBody?.message ?? 'Could not send email' }, 502);

    await admin.from('marketing_email_log').insert({
      customer_email: customer.email,
      email_type: 'marketplace_order_confirmation',
      order_id: order.id,
    });

    await admin
      .from('email_templates')
      .update({ last_sent_at: new Date().toISOString() })
      .eq('slug', 'marketplace_order_confirmation');

    return json({ sent: true, to: customer.email, signed_in_link: orderLink !== destination, seller_phone_present: !!toIntlPhone(seller?.phone ?? null) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
