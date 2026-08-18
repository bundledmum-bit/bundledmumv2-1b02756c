import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: listings, error } = await supabase
    .from('marketplace_listings')
    .select('id, image_url, gallery_urls')
    .eq('status', 'sold')
    .lte('sold_at', thirtyDaysAgo)
    .is('images_purged_at', null)
    .not('image_url', 'is', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const extractPath = (url: string): string | null => {
    const marker = '/marketplace-listings/';
    const i = url.indexOf(marker);
    return i >= 0 ? url.slice(i + marker.length) : null;
  };

  let purged = 0;
  const errors: string[] = [];

  for (const listing of listings ?? []) {
    try {
      const paths: string[] = [];
      if (listing.image_url) {
        const p = extractPath(listing.image_url);
        if (p) paths.push(p);
      }
      for (const g of listing.gallery_urls ?? []) {
        const p = extractPath(g);
        if (p) paths.push(p);
      }
      if (paths.length) {
        const { error: removeError } = await supabase.storage.from('marketplace-listings').remove(paths);
        if (removeError) throw removeError;
      }
      const { error: updateError } = await supabase
        .from('marketplace_listings')
        .update({ image_url: null, gallery_urls: [], images_purged_at: new Date().toISOString() })
        .eq('id', listing.id);
      if (updateError) throw updateError;
      purged++;
    } catch (e) {
      errors.push(`listing ${listing.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(JSON.stringify({ purged, errors }), { headers: { 'Content-Type': 'application/json' } });
});
