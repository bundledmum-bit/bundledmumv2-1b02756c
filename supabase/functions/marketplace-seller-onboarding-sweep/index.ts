import { createClient } from 'jsr:@supabase/supabase-js@2';

// Sends the first-listing guide 12 hours after a seller signs up, once, and only
// if they have not started listing yet, so someone who already listed does not
// get told how to do the thing they have already done.
Deno.serve(async () => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: due } = await db
      .from('marketplace_sellers')
      .select('id')
      .lte('created_at', cutoff)
      .is('first_listing_guide_sent_at', null);

    let sent = 0;
    let skippedHasListing = 0;

    for (const s of due ?? []) {
      const { count } = await db
        .from('marketplace_listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', s.id);

      if ((count ?? 0) > 0) {
        skippedHasListing++;
        // still mark as handled, so a seller who lists on day 3 does not get this
        // guide retroactively once some unrelated future run notices them
        await db.from('marketplace_sellers').update({ first_listing_guide_sent_at: new Date().toISOString() }).eq('id', s.id);
        continue;
      }

      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-marketplace-seller-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: 'marketplace_seller_first_listing_guide', seller_id: s.id }),
        });
        if (res.ok) {
          await db.from('marketplace_sellers').update({ first_listing_guide_sent_at: new Date().toISOString() }).eq('id', s.id);
          sent++;
        }
      } catch (_) { /* one failure must not stop the batch */ }
    }

    return json({ candidates: (due ?? []).length, sent, skippedHasListing });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
