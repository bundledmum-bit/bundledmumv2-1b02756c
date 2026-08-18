import { createClient } from 'jsr:@supabase/supabase-js@2';

// Daily. Finds returns the buyer has posted back that the seller has not
// confirmed within the window, and alerts the operator. Without this a seller
// who simply ignores it leaves the buyer with no item and no money.
Deno.serve(async () => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: overdue, error } = await db
      .from('marketplace_returns_awaiting_confirmation')
      .select('dispute_id, order_id, is_overdue')
      .eq('is_overdue', true);

    if (error) return json({ error: error.message }, 500);

    let alerted = 0;
    for (const r of overdue ?? []) {
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-marketplace-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: 'marketplace_admin_return_overdue',
            order_id: r.order_id,
            dispute_id: r.dispute_id,
            force: true,
          }),
        });
        if (res.ok) alerted++;
      } catch (_) { /* one failure must not stop the batch */ }
    }

    return json({ overdue: (overdue ?? []).length, alerted });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
