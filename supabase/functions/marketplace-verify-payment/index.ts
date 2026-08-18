import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const fireEmail = async (slug: string, order_id: string) => {
    try {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-marketplace-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, order_id }),
      });
    } catch (_) { /* email must never break payment handling */ }
  };

  try {
    const { reference } = await req.json().catch(() => ({}));
    if (!reference) return json({ error: 'reference is required' }, 400);

    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) return json({ error: 'Payment is not configured' }, 500);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: order } = await admin
      .from('marketplace_orders')
      .select('id, listing_id, buyer_id, payment_status, order_status, amount_naira, item_price_naira, service_fee_naira')
      .or(`paystack_transaction_reference.eq.${reference},payment_attempt_reference.eq.${reference}`)
      .maybeSingle();
    if (!order) return json({ error: 'Order not found' }, 404);

    if (order.payment_status === 'paid') {
      return json({ status: 'paid', order_id: order.id, already: true });
    }

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await verifyRes.json();

    if (!verifyRes.ok || !body?.status) {
      return json({ error: body?.message ?? 'Could not verify payment' }, 502);
    }

    const tx = body.data;
    if (tx?.status !== 'success') {
      return json({ status: tx?.status ?? 'failed', order_id: order.id });
    }

    const expectedKobo = (Number(order.item_price_naira) + Number(order.service_fee_naira)) * 100;
    if (Number(tx.amount) < expectedKobo) {
      await fireEmail('marketplace_admin_payment_anomaly', order.id);
      return json({ error: 'Amount paid does not match the order', status: 'mismatch', order_id: order.id }, 409);
    }

    const actualCharged = Math.round(Number(tx.amount) / 100);

    const { error: updateError } = await admin
      .from('marketplace_orders')
      .update({
        payment_status: 'paid',
        order_status: 'awaiting_dispatch',
        amount_naira: actualCharged,
        paystack_fee_naira: actualCharged - (Number(order.item_price_naira) + Number(order.service_fee_naira)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('payment_status', 'pending');

    if (updateError) return json({ error: updateError.message }, 500);

    const { data: claimed, error: claimError } = await admin.rpc('claim_marketplace_listing_unit', {
      p_listing_id: order.listing_id,
    });
    if (claimError || claimed === false) {
      await fireEmail('marketplace_admin_payment_anomaly', order.id);
    }

    await fireEmail('marketplace_order_confirmation', order.id);

    // Meta Conversions API, Purchase event. Never blocks or fails the payment,
    // the sender itself skips silently until it is configured.
    //
    // event_source_url is REQUIRED: Meta blocks Conversions API events without
    // it. There is no browser URL here since this runs server side after
    // Paystack redirects back, so the listing page is sent, which is where the
    // purchase genuinely originated.
    try {
      const { data: buyer } = await admin.from('customers').select('email, phone').eq('id', order.buyer_id).maybeSingle();
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-meta-conversion-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: 'Purchase',
          event_id: order.id, // shared with any browser-side Pixel fire, for dedup
          event_source_url: `https://bundledmum.com/marketplace/listing/${order.listing_id}`,
          value: actualCharged,
          content_id: order.listing_id,
          content_type: 'product', // needed for dynamic catalog ads to resolve
          num_items: 1,
          email: buyer?.email,
          phone: buyer?.phone,
        }),
      });
    } catch (_) { /* conversion tracking must never affect the payment result */ }

    return json({ status: 'paid', order_id: order.id, amount_naira: actualCharged });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
