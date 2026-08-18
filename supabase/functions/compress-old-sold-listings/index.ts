import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('marketplace_listings')
    .update({ description: null, condition_notes: null, compressed_at: new Date().toISOString() })
    .eq('status', 'sold')
    .lte('sold_at', ninetyDaysAgo)
    .is('compressed_at', null)
    .select('id');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ compressed: data?.length ?? 0 }), { headers: { 'Content-Type': 'application/json' } });
});
