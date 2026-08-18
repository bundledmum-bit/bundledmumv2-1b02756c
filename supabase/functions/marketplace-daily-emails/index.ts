import { createClient } from 'jsr:@supabase/supabase-js@2';

// Cron driven. Sends the buyer confirm-receipt nudge a set number of days after
// dispatch, chases the operator at two escalating points when the buyer stays
// silent, auto completes orders once the dispute window closes, and sends the
// daily operator payout digest.
Deno.serve(async () => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const base = Deno.env.get('SUPABASE_URL') + '/functions/v1/send-marketplace-email';

    const setting = async (k: string, d: number) => {
      const { data } = await db.from('site_settings').select('value').eq('key', k).maybeSingle();
      return Number(data?.value ?? d);
    };

    const send = async (slug: string, order_id: string) => {
      try {
        const r = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, order_id }),
        });
        return r.ok;
      } catch (_) { return false; }
    };

    const promptDay = await setting('marketplace_confirm_prompt_day', 1);
    const cutoff = new Date(Date.now() - promptDay * 86400000).toISOString();

    // buyers whose item was dispatched at least promptDay ago and who have not
    // yet confirmed or disputed
    const { data: due } = await db
      .from('marketplace_orders')
      .select('id')
      .eq('payment_status', 'paid')
      .eq('order_status', 'awaiting_confirmation')
      .eq('buyer_confirmation_status', 'pending')
      .not('dispatch_confirmed_at', 'is', null)
      .lte('dispatch_confirmed_at', cutoff)
      .is('buyer_confirmation_prompt_sent_at', null);

    let prompted = 0;
    for (const o of due ?? []) {
      if (await send('marketplace_buyer_confirm_prompt', o.id)) {
        await db.from('marketplace_orders')
          .update({ buyer_confirmation_prompt_sent_at: new Date().toISOString() })
          .eq('id', o.id);
        prompted++;
      }
    }

    // operator chases. Two escalating nudges with call and WhatsApp buttons, so
    // a silent buyer gets a human touch before the order closes itself.
    const nudge = async (stage: 1 | 2, hoursKey: string, defHours: number, column: string, slug: string) => {
      const hours = await setting(hoursKey, defHours);
      const before = new Date(Date.now() - hours * 3600000).toISOString();
      const { data: rows } = await db
        .from('marketplace_orders')
        .select('id')
        .eq('payment_status', 'paid')
        .eq('order_status', 'awaiting_confirmation')
        .is('buyer_confirmed_at', null)
        .not('dispatch_confirmed_at', 'is', null)
        .lte('dispatch_confirmed_at', before)
        .is(column, null);
      let n = 0;
      for (const o of rows ?? []) {
        // never chase an order that already has an open dispute
        const { count } = await db.from('marketplace_disputes')
          .select('id', { count: 'exact', head: true })
          .eq('order_id', o.id).is('outcome', null);
        if (count && count > 0) continue;
        if (await send(slug, o.id)) {
          await db.from('marketplace_orders').update({ [column]: new Date().toISOString() }).eq('id', o.id);
          n++;
        }
      }
      return n;
    };

    const nudged1 = await nudge(1, 'marketplace_confirm_nudge_1_hours', 24, 'confirm_nudge_1_sent_at', 'marketplace_admin_confirm_nudge_1');
    const nudged2 = await nudge(2, 'marketplace_confirm_nudge_2_hours', 48, 'confirm_nudge_2_sent_at', 'marketplace_admin_confirm_nudge_2');

    // close out orders whose dispute window has passed with no buyer response
    let autoCompleted = 0;
    try {
      const { data: ac } = await db.rpc('auto_complete_marketplace_orders');
      autoCompleted = Number(ac ?? 0);
    } catch (_) { /* the digest below still matters */ }

    // daily operator digests
    let digest = 'skipped';
    let backlog = 'skipped';
    try {
      const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'marketplace_admin_payout_digest', force: true }) });
      digest = r.ok ? 'sent' : 'failed';
    } catch (_) { digest = 'failed'; }
    try {
      const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: 'marketplace_admin_new_listing', force: true }) });
      backlog = r.ok ? 'sent' : 'failed';
    } catch (_) { backlog = 'failed'; }

    return json({ prompted, candidates: (due ?? []).length, nudged1, nudged2, autoCompleted, digest, backlog });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
