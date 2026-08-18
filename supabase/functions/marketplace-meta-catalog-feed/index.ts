import { createClient } from 'jsr:@supabase/supabase-js@2';

// Meta commerce catalog feed, TSV, one row per live listing.
//
// TWO layers of exclusion, because category alone leaks: sellers miscategorise,
// and a car seat was found filed under "Baby carriers and wraps".
//
// WHAT IS EXCLUDED, and why it is a short list:
// Meta does NOT ban used cots, cribs or breast pumps. What Meta prohibits is
// RECALLED and banned products. Cots, cribs, bassinets, travel cots and breast
// pumps are therefore allowed through by deliberate decision.
//
// Still excluded, where the risk is specific rather than general:
//   car seats  - banned used on eBay and Etsy, and a used one with unknown
//                crash history is the clearest liability item here
//   walkers    - banned outright in Canada including secondhand and modified
//   helmets    - same reasoning, a used helmet has unknown impact history
//   teats and dummies - hygiene, and already not listable at all
//   sleep positioners and inclined sleepers - the actual recalled category
//                driving CPSC takedowns, tied to roughly 100 infant deaths

const SITE = 'https://bundledmum.com';

// matched against the title, word-boundaried so "cot" would not hit "cotton"
const RISKY_TITLE = new RegExp(
  [
    'car\\s*seat', 'carseat',
    '\\bwalker\\b', '\\bwalkers\\b',
    '\\bteat\\b', '\\bteats\\b', '\\bdummy\\b', '\\bdummies\\b', '\\bpacifier\\b',
    '\\bhelmet\\b',
    'sleep\\s*positioner', 'inclined\\s*sleeper', 'rock\\s*.?n.?\\s*play',
  ].join('|'),
  'i',
);

function tsvEscape(v: unknown): string {
  return String(v ?? '').replace(/\t/g, ' ').replace(/[\r\n]+/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: listings, error } = await db
      .from('marketplace_listings')
      .select(`
        id, title, description, display_description, image_url, gallery_urls,
        final_price_naira, quantity, quantity_sold, condition, is_negotiable,
        location_state,
        marketplace_categories!inner ( name, exclude_from_ads, marketplace_category_groups ( name ) )
      `)
      .eq('status', 'live');

    if (error) return new Response('Feed generation failed: ' + error.message, { status: 500 });

    const header = [
      'id', 'title', 'description', 'availability', 'condition', 'price',
      'link', 'image_link', 'additional_image_link', 'brand',
      'product_type', 'custom_label_0', 'custom_label_1',
    ].join('\t');

    let excludedByCategory = 0;
    let excludedByTitle = 0;

    const rows = (listings ?? []).flatMap((l: Record<string, unknown>) => {
      const cat = (l.marketplace_categories as Record<string, unknown> | null);

      if (cat?.exclude_from_ads === true) { excludedByCategory++; return []; }
      if (RISKY_TITLE.test(String(l.title ?? ''))) { excludedByTitle++; return []; }

      const group = cat?.marketplace_category_groups as Record<string, unknown> | null;
      const categoryName = (cat?.name as string) ?? 'Baby and toddler items';
      const groupName = (group?.name as string) ?? 'BundledMum Marketplace';

      const qty = Number(l.quantity ?? 1);
      const sold = Number(l.quantity_sold ?? 0);
      const available = qty - sold > 0;

      const gallery = (l.gallery_urls as string[] | null) ?? [];
      const secondImage = gallery.find((g) => g && g !== l.image_url) ?? '';

      const desc = (l.display_description as string) || (l.description as string) || (l.title as string);

      return [[
        l.id,
        tsvEscape(l.title).slice(0, 150),
        tsvEscape(desc).slice(0, 5000),
        available ? 'in stock' : 'out of stock',
        'used',
        `${Number(l.final_price_naira)} NGN`,
        `${SITE}/marketplace/listing/${l.id}`,
        l.image_url ?? '',
        secondImage,
        'BundledMum Marketplace',
        `${groupName} > ${categoryName}`,
        l.is_negotiable ? 'negotiable' : 'fixed_price',
        l.location_state ?? '',
      ].join('\t')];
    });

    const tsv = [header, ...rows].join('\n');

    return new Response(tsv, {
      headers: {
        'Content-Type': 'text/tab-separated-values; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Excluded-Category': String(excludedByCategory),
        'X-Excluded-Title': String(excludedByTitle),
      },
    });
  } catch (e) {
    return new Response('Feed generation failed: ' + (e instanceof Error ? e.message : String(e)), { status: 500 });
  }
});
