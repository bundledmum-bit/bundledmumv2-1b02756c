import { createClient } from 'jsr:@supabase/supabase-js@2';

// Sends review requests a day after a buyer confirms receipt, and only where
// nothing went wrong. Asking immediately would be asking before someone knows
// whether it actually went fine, and asking someone who raised a dispute to rate
// the experience would be tone deaf.
//
// Buyers are asked per order. Sellers are asked once ever, after their first
// completed sale.
Deno.serve(async () => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: due, error } = await db.rpc('get_due_review_requests');
    if (error) return json({ error: error.message }, 500);

    let buyerSent = 0;
    let sellerSent = 0;
    let failed = 0;

    for (const row of (due ?? []) as Array<{ order_id: string; audience: string }>) {
      const slug = row.audience === 'seller'
        ? 'marketplace_seller_review_request'
        : 'marketplace_buyer_review_request';

      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-marketplace-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, order_id: row.order_id }),
        });
        const body = await res.json().catch(() => ({}));

        // a skip is still a handled outcome, mark it so the sweep does not
        // retry the same order every hour forever
        if (res.ok) {
          const col = row.audience === 'seller' ? 'seller_review_asked_at' : 'buyer_review_asked_at';
          await db.from('marketplace_orders')
            .update({ [col]: new Date().toISOString() })
            .eq('id', row.order_id);
          if (body?.sent) {
            if (row.audience === 'seller') sellerSent++; else buyerSent++;
          }
        } else { failed++; }
      } catch (_) { failed++; }
    }

    return json({ due: (due ?? []).length, buyerSent, sellerSent, failed });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
