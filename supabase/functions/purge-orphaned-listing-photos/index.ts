import { createClient } from 'jsr:@supabase/supabase-js@2';

// Sweeps photos in the marketplace-listings bucket that are older than 48h and
// not referenced by anything. Three things must be preserved:
//   1. listing photos (image_url, gallery_urls)
//   2. seller dispatch photos (proof of shipping)
//   3. buyer dispute evidence (proof in a money argument)
Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const extractPath = (url: string): string | null => {
    const marker = '/marketplace-listings/';
    const i = url.indexOf(marker);
    return i >= 0 ? url.slice(i + marker.length) : null;
  };

  const referenced = new Set<string>();
  const addUrl = (u: unknown) => {
    if (typeof u !== 'string') return;
    const p = extractPath(u);
    if (p) referenced.add(p);
  };

  // 1. listing photos
  const { data: listings, error: listingsError } = await supabase
    .from('marketplace_listings')
    .select('image_url, gallery_urls');
  if (listingsError) {
    return new Response(JSON.stringify({ error: listingsError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  for (const l of listings ?? []) {
    addUrl(l.image_url);
    for (const g of l.gallery_urls ?? []) addUrl(g);
  }

  // 2. dispatch photos
  const { data: orders, error: ordersError } = await supabase
    .from('marketplace_orders')
    .select('dispatch_photo_url')
    .not('dispatch_photo_url', 'is', null);
  if (ordersError) {
    return new Response(JSON.stringify({ error: ordersError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  for (const o of orders ?? []) addUrl(o.dispatch_photo_url);

  // 3. dispute evidence and return proof. evidence is jsonb, shape may be an
  // array of urls or an object containing them, so walk it defensively.
  const { data: disputes, error: disputesError } = await supabase
    .from('marketplace_disputes')
    .select('evidence, return_proof_url');
  if (disputesError) {
    return new Response(JSON.stringify({ error: disputesError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const walk = (node: unknown) => {
    if (typeof node === 'string') { addUrl(node); return; }
    if (Array.isArray(node)) { for (const n of node) walk(n); return; }
    if (node && typeof node === 'object') { for (const v of Object.values(node)) walk(v); }
  };
  for (const d of disputes ?? []) {
    walk(d.evidence);
    addUrl(d.return_proof_url);
  }

  const { data: folders, error: folderError } = await supabase.storage
    .from('marketplace-listings')
    .list('', { limit: 1000 });
  if (folderError) {
    return new Response(JSON.stringify({ error: folderError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let removed = 0;
  const errors: string[] = [];

  for (const folder of folders ?? []) {
    if (!folder.name || folder.id === null) continue;
    try {
      const { data: files, error: filesError } = await supabase.storage
        .from('marketplace-listings')
        .list(folder.name, { limit: 1000 });
      if (filesError) throw filesError;

      const toRemove: string[] = [];
      for (const file of files ?? []) {
        const fullPath = `${folder.name}/${file.name}`;
        const created = file.created_at ? new Date(file.created_at) : null;
        if (!referenced.has(fullPath) && created && created < cutoff) {
          toRemove.push(fullPath);
        }
      }
      if (toRemove.length) {
        const { error: removeError } = await supabase.storage.from('marketplace-listings').remove(toRemove);
        if (removeError) throw removeError;
        removed += toRemove.length;
      }
    } catch (e) {
      errors.push(`folder ${folder.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(JSON.stringify({ removed, errors, preserved: referenced.size }), { headers: { 'Content-Type': 'application/json' } });
});
