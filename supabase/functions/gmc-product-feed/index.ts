import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GMC_CATEGORIES: Record<string, string> = {
  'diapers-nappies':            'Baby & Toddler > Diapering > Diapers',
  'wipes-diaper-care':          'Baby & Toddler > Diapering > Diaper Care',
  'baby-formula':               'Food, Beverages & Tobacco > Food Items > Baby Food',
  'baby-skincare-toiletries':   'Baby & Toddler > Baby Care > Baby Skin Care',
  'bath-grooming':              'Baby & Toddler > Baby Care > Baby Bathing & Grooming',
  'bedding-blankets':           'Baby & Toddler > Nursery > Baby Bedding',
  'baby-clothing':              'Apparel & Accessories > Clothing > Baby & Toddler Clothing',
  'feeding-equipment':          'Baby & Toddler > Feeding > Baby Bottles & Accessories',
  'nursery-furniture':          'Baby & Toddler > Nursery > Baby & Toddler Furniture',
  'travel-gear':                'Baby & Toddler > Strollers',
  'toys-learning':              'Toys & Games > Toys',
  'breastfeeding-equipment':    'Baby & Toddler > Nursing & Feeding > Breastfeeding',
  'maternity-clothing':         'Apparel & Accessories > Clothing > Maternity Clothing',
  'maternity-postpartum':       'Health & Beauty > Health Care > Reproductive Health',
  'accessories-misc':           'Baby & Toddler',
  'laundry-household':          'Baby & Toddler > Baby Care',
  'health-safety-baby':         'Baby & Toddler > Safety',
  'mum-gifts-keepsakes':        'Baby & Toddler',
  // Bundle category — gift sets and curated bundles
  'bundles-kits':               'Baby & Toddler > Baby Gifts & Gift Sets',
};

function xmlEscape(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // A second FK now exists between products and brands
    // (products.hospital_list_default_brand_id -> brands.id). The embed MUST
    // name the intended relationship (brands.product_id -> products.id) or
    // PostgREST errors with "more than one relationship was found".
    const { data: rows, error } = await supabase
      .from('brands')
      .select(`
        sku,
        brand_name,
        price,
        image_url,
        images,
        in_stock,
        size_variant,
        variant_type,
        tier,
        products!brands_product_id_fkey (
          id,
          name,
          slug,
          description,
          category,
          subcategory,
          is_active,
          deleted_at,
          is_gift_box,
          bundle_label,
          gender_relevant,
          gender_colors
        )
      `)
      .eq('in_stock', true)
      .gt('price', 0)
      .not('image_url', 'is', null)
      .neq('image_url', '');

    if (error) throw error;

    const eligible = (rows || []).filter((r: any) =>
      r.products?.is_active === true &&
      r.products?.deleted_at === null &&
      r.price > 0 &&
      r.image_url
    );

    const now = new Date().toISOString();
    const baseUrl = 'https://bundledmum.com';

    const items = eligible.map((r: any) => {
      const p = r.products;
      const isBundle = p.is_gift_box === true;
      const category = GMC_CATEGORIES[p.subcategory] || 'Baby & Toddler';
      const productUrl = `${baseUrl}/products/${p.slug}?sku=${encodeURIComponent(r.sku)}`;

      // Bundle title: use product name + bundle_label
      // e.g. "Baby Shower Gift Box — Basic" or "Maternity Bundle — ₦200,000"
      // Non-bundle: product name + brand name
      let title: string;
      if (isBundle) {
        title = p.bundle_label
          ? `${p.name} — ${p.bundle_label}`
          : p.name;
      } else {
        title = r.brand_name && r.brand_name !== 'Generic' && r.brand_name !== 'BundledMum'
          ? `${p.name} - ${r.brand_name}`
          : p.name;
        if (r.size_variant && r.variant_type) {
          title = `${title} (${r.size_variant})`;
        }
      }

      const additionalImages = (r.images || [])
        .filter((img: string) => img && img !== r.image_url)
        .slice(0, 9)
        .map((img: string) => `<g:additional_image_link>${xmlEscape(img)}</g:additional_image_link>`)
        .join('\n        ');

      const priceNaira = Number(r.price).toFixed(2);

      let gender = 'unisex';
      if (!isBundle && p.gender_relevant && r.brand_name) {
        const lower = r.brand_name.toLowerCase();
        if (lower.includes('girl') || lower.includes('female')) gender = 'female';
        else if (lower.includes('boy') || lower.includes('male')) gender = 'male';
      }

      const sizeTag = (!isBundle && r.size_variant && r.variant_type)
        ? `<g:size>${xmlEscape(r.size_variant)}</g:size>`
        : '';

      // custom_label_1 for bundles: bundle_label (e.g. 'Basic', '₦200,000')
      // custom_label_1 for products: tier (starter/standard/premium)
      const customLabel1 = isBundle
        ? (p.bundle_label || r.tier || '')
        : (r.tier || '');

      // custom_label_3 for bundles: bundle type
      const bundleTypeLabel = isBundle
        ? (p.name.includes('Baby Shower') ? 'gift-box'
          : p.name.includes('Postpartum') ? 'recovery-kit'
          : 'maternity-bundle')
        : '';

      return `
    <item>
      <g:id>${xmlEscape(r.sku)}</g:id>
      <g:title>${xmlEscape(title)}</g:title>
      <g:description>${xmlEscape(p.description || p.name)}</g:description>
      <g:link>${xmlEscape(productUrl)}</g:link>
      <g:image_link>${xmlEscape(r.image_url)}</g:image_link>
      ${additionalImages}
      <g:availability>${r.in_stock ? 'in_stock' : 'out_of_stock'}</g:availability>
      <g:price>${priceNaira} NGN</g:price>
      <g:brand>BundledMum</g:brand>
      <g:condition>new</g:condition>
      <g:google_product_category>${xmlEscape(category)}</g:google_product_category>
      <g:product_type>${xmlEscape(p.subcategory?.replace(/-/g, ' ') || '')}</g:product_type>
      <g:identifier_exists>no</g:identifier_exists>
      <g:shipping>
        <g:country>NG</g:country>
        <g:service>Standard Delivery</g:service>
        <g:price>0 NGN</g:price>
      </g:shipping>
      <g:gender>${gender}</g:gender>
      <g:age_group>infant</g:age_group>
      ${sizeTag}
      <g:custom_label_0>${xmlEscape(p.subcategory || '')}</g:custom_label_0>
      <g:custom_label_1>${xmlEscape(customLabel1)}</g:custom_label_1>
      <g:custom_label_2>${xmlEscape(r.variant_type || '')}</g:custom_label_2>
      <g:custom_label_3>${xmlEscape(bundleTypeLabel)}</g:custom_label_3>
    </item>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>BundledMum Products</title>
    <link>https://bundledmum.com</link>
    <description>BundledMum — Nigeria's trusted maternity and baby product store</description>
    <lastBuildDate>${now}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/rss+xml; charset=UTF-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (err) {
    console.error('[gmc-product-feed] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
