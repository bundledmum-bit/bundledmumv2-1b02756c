import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SERVICE FEE IS NOW A PERCENTAGE with a floor and a cap, decided by the
// marketplace_service_fee function so this and the cart path cannot drift.
//
// A flat fee punished cheap items: one buyer paid N1,800 plus a N500 fee, 28%
// on top, and took seven attempts to complete. 23 live listings under N2,000
// averaged 34% on top while a N360,000 item paid 1%.
//
// Charged PER ORDER now. The once-a-day rule existed only because a flat fee
// made buying several cheap things absurd, and a percentage does not.

function generateReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `BMM-${out}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function normalisePhone(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const payload = await req.json().catch(() => ({}));
    const { listing_id } = payload;
    if (!listing_id) return json({ error: 'listing_id is required' }, 400);

    let customerId: string | null = null;
    let customerEmail: string | null = null;

    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) {
        const { data: c } = await admin
          .from('customers')
          .select('id, email, full_name, phone, whatsapp_number')
          .eq('auth_user_id', userData.user.id)
          .maybeSingle();
        if (c) {
          customerId = c.id;
          customerEmail = c.email;
          const phone = payload.phone ? normalisePhone(payload.phone) : null;
          const patch: Record<string, unknown> = {};
          if (!c.phone && phone) patch.phone = phone;
          if (!c.full_name && typeof payload.full_name === 'string' && payload.full_name.trim()) {
            patch.full_name = payload.full_name.trim();
          }
          if (!c.whatsapp_number) {
            const wa = payload.whatsapp_number ? normalisePhone(payload.whatsapp_number) : null;
            if (payload.phone_is_whatsapp === false && wa) patch.whatsapp_number = wa;
            else if (phone) patch.whatsapp_number = phone;
          }
          if (typeof payload.phone_is_whatsapp === 'boolean') patch.phone_is_whatsapp = payload.phone_is_whatsapp;
          if (Object.keys(patch).length) {
            await admin.from('customers').update(patch).eq('id', c.id);
          }
        }
      }
    }

    if (!customerId) {
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      if (!email || !isValidEmail(email)) {
        return json({ error: 'A valid email address is required' }, 400);
      }

      const fullName = typeof payload.full_name === 'string' ? payload.full_name.trim() : '';
      if (!fullName || fullName.length < 2) {
        return json({ error: 'Please give your name so the seller knows who to send to' }, 400);
      }

      const phone = payload.phone ? normalisePhone(payload.phone) : null;
      if (!phone) {
        return json({ error: 'A valid phone number is required so the seller can reach you' }, 400);
      }

      const waRaw = payload.phone_is_whatsapp === false ? payload.whatsapp_number : payload.phone;
      const whatsapp = waRaw ? normalisePhone(waRaw) : phone;

      const { data: existing } = await admin
        .from('customers')
        .select('id, email, full_name, phone, whatsapp_number')
        .eq('email', email)
        .maybeSingle();

      if (existing) {
        customerId = existing.id;
        customerEmail = existing.email;
        const patch: Record<string, unknown> = {};
        if (!existing.full_name) patch.full_name = fullName;
        if (!existing.phone) patch.phone = phone;
        if (!existing.whatsapp_number && whatsapp) patch.whatsapp_number = whatsapp;
        if (typeof payload.phone_is_whatsapp === 'boolean') patch.phone_is_whatsapp = payload.phone_is_whatsapp;
        if (Object.keys(patch).length) {
          await admin.from('customers').update(patch).eq('id', existing.id);
        }
      } else {
        const { data: created, error: createError } = await admin
          .from('customers')
          .insert({
            email,
            full_name: fullName,
            phone,
            whatsapp_number: whatsapp,
            phone_is_whatsapp: payload.phone_is_whatsapp !== false,
            acquisition_channel: 'marketplace',
          })
          .select('id, email')
          .single();
        if (createError) return json({ error: createError.message }, 500);
        customerId = created.id;
        customerEmail = created.email;
      }
    }

    const { data: listing } = await admin
      .from('marketplace_listings')
      .select('id, seller_id, status, price_naira, final_price_naira, markup_percent')
      .eq('id', listing_id)
      .maybeSingle();
    if (!listing) return json({ error: 'Listing not found' }, 404);
    if (listing.status !== 'live') return json({ error: 'This item is no longer available' }, 409);

    const { data: buyerSeller } = await admin
      .from('marketplace_sellers')
      .select('id')
      .eq('customer_id', customerId)
      .maybeSingle();
    if (buyerSeller && buyerSeller.id === listing.seller_id) {
      return json({ error: 'You cannot buy your own listing' }, 400);
    }

    let itemPrice = Number(listing.final_price_naira);
    let sellerShare = Number(listing.price_naira);
    let offerId: string | null = null;
    let offerDiscount = 0;
    let offerExpired = false;

    const { data: offer } = await admin
      .from('marketplace_offers')
      .select('id, status, buyer_price_naira, seller_amount_naira, counter_buyer_price_naira, counter_seller_amount_naira, accepted_price_expires_at')
      .eq('listing_id', listing_id)
      .eq('buyer_id', customerId)
      .in('status', ['accepted', 'counter_accepted'])
      .maybeSingle();

    if (offer) {
      const expiresAt = offer.accepted_price_expires_at ? new Date(offer.accepted_price_expires_at) : null;
      offerExpired = expiresAt !== null && expiresAt.getTime() <= Date.now();

      if (!offerExpired) {
        offerId = offer.id;
        if (offer.status === 'counter_accepted') {
          itemPrice = Number(offer.counter_buyer_price_naira);
          sellerShare = Number(offer.counter_seller_amount_naira);
        } else {
          itemPrice = Number(offer.buyer_price_naira);
          sellerShare = Number(offer.seller_amount_naira);
        }
        offerDiscount = Number(listing.final_price_naira) - itemPrice;
      }
    }

    const { data: existingOrder } = await admin
      .from('marketplace_orders')
      .select('*')
      .eq('listing_id', listing_id)
      .eq('buyer_id', customerId)
      .eq('payment_status', 'pending')
      .maybeSingle();
    if (existingOrder) return json({ order: existingOrder, email: customerEmail, reused: true });

    // ONE place decides the fee, shared with the cart path
    const { data: feeRaw } = await admin.rpc('marketplace_service_fee', {
      p_item_price_naira: itemPrice,
    });
    const serviceFee = Number(feeRaw ?? 0);

    const amount = itemPrice + serviceFee;
    const platformShare = amount - sellerShare;

    let order = null;
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = generateReference();
      const { data, error } = await admin
        .from('marketplace_orders')
        .insert({
          listing_id: listing.id,
          buyer_id: customerId,
          seller_id: listing.seller_id,
          item_price_naira: itemPrice,
          service_fee_naira: serviceFee,
          paystack_fee_naira: 0,
          amount_naira: amount,
          seller_share_naira: sellerShare,
          platform_share_naira: platformShare,
          offer_id: offerId,
          offer_discount_naira: offerDiscount,
          paystack_transaction_reference: reference,
          payment_status: 'pending',
          settlement_status: 'unsettled',
          order_status: 'awaiting_payment',
        })
        .select()
        .single();
      if (!error) { order = data; break; }
      lastError = error;
      if (!String(error.message).includes('idx_marketplace_orders_payment_reference')) break;
    }

    if (!order) return json({ error: lastError?.message ?? 'Could not create order' }, 500);

    return json({
      order,
      email: customerEmail,
      negotiated: offerId !== null,
      discount_naira: offerDiscount,
      service_fee_naira: serviceFee,
      service_fee_waived: false,
      offer_expired: offerExpired,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
