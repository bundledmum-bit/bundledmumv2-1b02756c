import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Paystack's dashboard setting "pass transaction fee to customer" is ON, so
// PAYSTACK adds its own fee on top of whatever amount we send. We therefore send
// ONLY the subtotal (item + service fee) and let Paystack add its fee.
//
// This function still ESTIMATES that fee so checkout can tell the buyer what they
// will actually be charged. The estimate mirrors Paystack's own gross up:
//   charge = (subtotal + 100) / (1 - 0.015), flat fee waived under NGN2500,
//   whole fee capped at NGN2000.
// It can differ from Paystack's figure by about a naira because of rounding, so
// it is shown as the amount they will be charged, never treated as exact truth.
// This is Paystack's CARD fee schedule specifically; bank_transfer's real fee
// structure differs (typically a lower flat fee), but no verified schedule for
// it exists in this codebase, so the same estimate is shown for both channels
// rather than guessing at a number — still labelled an estimate either way.
function estimatePaystackAddition(subtotal: number): number {
  const RATE = 0.015;
  const FLAT = 100;
  const CAP = 2000;
  const WAIVER_LIMIT = 2500;

  const chargeWaived = Math.ceil(subtotal / (1 - RATE));
  if (chargeWaived < WAIVER_LIMIT) {
    return chargeWaived - subtotal;
  }

  const charge = Math.ceil((subtotal + FLAT) / (1 - RATE));
  const fee = charge - subtotal;
  return fee > CAP ? CAP : fee;
}

// Paystack opens straight into whichever channel is passed here, set once at
// initialisation (the transaction cannot switch channels after). 'card' is
// the only safe default: an unrecognised or missing value never silently
// becomes bank_transfer or (worse) every channel Paystack has enabled on the
// dashboard, which is the exact "shows its default screen" problem this was
// built to fix.
const ALLOWED_CHANNELS = ['card', 'bank_transfer'] as const;
type Channel = typeof ALLOWED_CHANNELS[number];
function resolveChannel(input: unknown): Channel {
  return ALLOWED_CHANNELS.includes(input as Channel) ? (input as Channel) : 'card';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { order_id, callback_url, channel } = await req.json().catch(() => ({}));
    if (!order_id) return json({ error: 'order_id is required' }, 400);
    const paystackChannel = resolveChannel(channel);

    const { data: order } = await admin
      .from('marketplace_orders')
      .select('id, buyer_id, listing_id, item_price_naira, service_fee_naira, payment_status, paystack_transaction_reference, payment_attempt_count')
      .eq('id', order_id)
      .maybeSingle();
    if (!order) return json({ error: 'Order not found' }, 404);
    if (order.payment_status === 'paid') return json({ error: 'This order is already paid' }, 409);

    const { data: customer } = await admin
      .from('customers')
      .select('email')
      .eq('id', order.buyer_id)
      .maybeSingle();
    if (!customer?.email) return json({ error: 'No email on this order' }, 400);

    const { data: listing } = await admin
      .from('marketplace_listings')
      .select('id, status, title')
      .eq('id', order.listing_id)
      .maybeSingle();
    if (!listing || listing.status !== 'live') return json({ error: 'This item is no longer available' }, 409);

    const { data: feeToggle } = await admin
      .from('site_settings')
      .select('value')
      .eq('key', 'marketplace_buyer_pays_paystack_fee')
      .maybeSingle();
    const buyerPaysFee = feeToggle?.value === true;

    // Always recomputed, never taken from a stored total, so retries cannot compound.
    const subtotal = Number(order.item_price_naira) + Number(order.service_fee_naira);
    const estimatedFee = buyerPaysFee ? estimatePaystackAddition(subtotal) : 0;
    const estimatedTotal = subtotal + estimatedFee;

    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) return json({ error: 'Payment is not configured' }, 500);

    const attempt = Number(order.payment_attempt_count ?? 0) + 1;
    const attemptReference = attempt === 1
      ? order.paystack_transaction_reference
      : `${order.paystack_transaction_reference}-R${attempt}`;

    // SEND THE SUBTOTAL ONLY. Paystack adds its own fee because fee passing is on.
    const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customer.email,
        amount: subtotal * 100,
        reference: attemptReference,
        callback_url,
        channels: [paystackChannel],
        metadata: {
          marketplace_order_id: order.id,
          order_reference: order.paystack_transaction_reference,
          listing_title: listing.title,
        },
      }),
    });

    const initBody = await initRes.json();
    if (!initRes.ok || !initBody?.status) {
      return json({ error: initBody?.message ?? 'Could not start payment' }, 502);
    }

    await admin
      .from('marketplace_orders')
      .update({
        paystack_fee_naira: estimatedFee,
        amount_naira: estimatedTotal,
        payment_attempt_reference: initBody.data.reference,
        payment_attempt_count: attempt,
      })
      .eq('id', order.id);

    return json({
      authorization_url: initBody.data.authorization_url,
      reference: initBody.data.reference,
      subtotal_naira: subtotal,
      paystack_fee_naira: estimatedFee,
      amount_naira: estimatedTotal,
      fee_added_by_paystack: buyerPaysFee,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
