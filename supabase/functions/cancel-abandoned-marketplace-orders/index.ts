import { createClient } from 'jsr:@supabase/supabase-js@2';

// Checkout creates an order on page load so the buyer can see their real payment
// reference next to the bank details. That means every abandoned checkout leaves a
// pending order behind. This sweeps them so the orders table and the admin
// awaiting-payment view do not fill with ghosts.
//
// Only touches orders that are BOTH payment_status 'pending' AND order_status
// 'awaiting_payment'. Anything an admin has already confirmed, disputed or settled
// is never touched.
Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('marketplace_orders')
    .update({ order_status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('payment_status', 'pending')
    .eq('order_status', 'awaiting_payment')
    .lte('created_at', cutoff)
    .select('id, paystack_transaction_reference');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(
    JSON.stringify({ cancelled: data?.length ?? 0, references: (data ?? []).map((o) => o.paystack_transaction_reference) }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
