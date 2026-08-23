// Public Meta Commerce Manager catalog feed for BundledMum
//
// Returns a CSV feed in Meta's standard catalog format.
// One row per BRAND (SKU level). Active products only.
// Out-of-stock variants are INCLUDED (marked availability='out of stock')
// per Meta best practice to preserve learning + history.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE = 'https://bundledmum.com';
const CURRENCY = 'NGN';

const GP_CATEGORY: Record<string, string> = {
  'baby-clothing':            'Apparel & Accessories > Clothing > Baby & Toddler Clothing',
  'bedding-blankets':         'Furniture > Baby & Toddler Furniture > Baby & Toddler Bedding',
  'health-safety-baby':       'Baby & Toddler > Baby Health',
  'wipes-diaper-care':        'Baby & Toddler > Diapering & Potty Training',
  'baby-formula':             'Food, Beverages & Tobacco > Food Items > Baby & Toddler Food > Baby Formula',
  'diapers-nappies':          'Baby & Toddler > Diapering & Potty Training > Diapers',
  'bath-grooming':            'Baby & Toddler > Baby Bathing',
  'laundry-household':        'Home & Garden > Household Supplies > Laundry Supplies',
  'maternity-clothing':       'Apparel & Accessories > Clothing > Maternity Clothing',
  'maternity-postpartum':     'Health & Beauty > Personal Care',
  'breastfeeding-equipment':  'Baby & Toddler > Nursing & Feeding',
  'feeding-equipment':        'Baby & Toddler > Nursing & Feeding > Baby Bottles',
  'nursery-furniture':        'Furniture > Baby & Toddler Furniture',
  'toys-learning':            'Toys & Games > Toys',
  'travel-gear':              'Baby & Toddler > Baby Transport',
  'accessories-misc':         'Baby & Toddler',
  'baby-skincare-toiletries': 'Baby & Toddler > Baby Bathing > Baby Soaps',
  'mum-gifts-keepsakes':      'Health & Beauty > Personal Care',
  'vouchers-services':        '',
  // Bundles and gift sets
  'bundles-kits':             'Baby & Toddler > Baby Gifts & Gift Sets',
};

function csv(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  s = s.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.substring(0, max - 3) + '...';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // NOTE: a second FK now exists between products and brands
    // (products.hospital_list_default_brand_id -> brands.id), so the embed
    // MUST name the intended relationship explicitly, otherwise PostgREST
    // returns "more than one relationship was found". We want the
    // brands.product_id -> products.id path: brands_product_id_fkey.
    const { data, error } = await supabase
      .from('brands')
      .select(`
        id, sku, brand_name, price, image_url, images, in_stock, stock_quantity,
        size_variant, variant_type, tier,
        products!brands_product_id_fkey!inner (
          id, name, slug, description, why_included, long_description,
          image_url, category, subcategory,
          is_active, is_consumable, is_convenience, is_gift_box,
          bundle_label, deleted_at, exclude_from_ad_platforms
        )
      `)
      .eq('products.is_active', true)
      .is('products.deleted_at', null)
      .not('brand_name', 'ilike', 'Brand TBD%')
      .gt('price', 0)
      .order('id');

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Database query failed', detail: error.message }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    const headers = [
      'id', 'title', 'description', 'availability', 'condition', 'price',
      'link', 'image_link', 'brand', 'google_product_category', 'item_group_id',
      'additional_image_link', 'quantity_to_sell_on_facebook',
      'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3',
      'size',
    ];

    const rows: string[] = [headers.join(',')];
    let skippedNoImage = 0;
    let skippedNoSlug = 0;
    let skippedAdExcluded = 0;

    for (const b of data ?? []) {
      const p = (b as any).products;
      if (!p) continue;
      // Ad-platform exclusion: products flagged exclude_from_ad_platforms stay
      // fully shoppable on the site but must NOT be shipped to Meta's catalog
      // (clinical/hospital-list items that read as medical to Meta's classifier).
      if (p.exclude_from_ad_platforms === true) { skippedAdExcluded++; continue; }
      if (!p.slug) { skippedNoSlug++; continue; }

      const imageLink = b.image_url || p.image_url || null;
      if (!imageLink) { skippedNoImage++; continue; }

      const isBundle = p.is_gift_box === true;

      const extraImages: string[] = Array.isArray(b.images)
        ? b.images.filter((u: string) => u && u !== b.image_url).slice(0, 19)
        : [];

      const description = truncate(
        p.description || p.why_included || p.long_description || p.name,
        9999
      );

      // Bundle title: product name + bundle_label
      // e.g. "Baby Shower Gift Box - Basic | Basic"
      // Product title: name + brand + size_variant
      let titleBase: string;
      if (isBundle) {
        titleBase = p.bundle_label
          ? `${p.name} — ${p.bundle_label}`
          : p.name;
      } else {
        titleBase = b.brand_name && b.brand_name !== 'Generic'
          ? `${p.name} — ${b.brand_name}`
          : p.name;
        if ((b as any).size_variant && (b as any).variant_type) {
          titleBase = `${titleBase} (${(b as any).size_variant})`;
        }
      }
      const title = truncate(titleBase, 200);

      const itemId = b.sku || b.id;
      const productLink = b.sku
        ? `${SITE}/products/${p.slug}?sku=${encodeURIComponent(b.sku)}`
        : `${SITE}/products/${p.slug}`;

      // custom_label_1: bundle_label for bundles, tier for products
      const customLabel1 = isBundle
        ? (p.bundle_label || '')
        : (b as any).tier || '';

      // custom_label_2: bundle type or variant_type
      const customLabel2 = isBundle
        ? (p.name.includes('Baby Shower') ? 'gift-box'
           : p.name.includes('Postpartum') ? 'recovery-kit'
           : 'maternity-bundle')
        : ((b as any).variant_type || '');

      // custom_label_3: bundles-kits flag for ad targeting
      const customLabel3 = isBundle ? 'bundle' : '';

      // brand field: BundledMum for bundles, brand_name for products
      const brandField = isBundle ? 'BundledMum' : (b.brand_name || 'BundledMum');

      const row = [
        csv(itemId),
        csv(title),
        csv(description),
        csv(b.in_stock ? 'in stock' : 'out of stock'),
        csv('new'),
        csv(`${b.price} ${CURRENCY}`),
        csv(productLink),
        csv(imageLink),
        csv(brandField),
        csv(GP_CATEGORY[p.subcategory] || ''),
        csv(p.id),
        csv(extraImages.join(',')),
        csv(b.stock_quantity ?? ''),
        csv(p.category || ''),
        csv(p.subcategory || ''),
        csv(isBundle ? customLabel2 : (p.is_consumable ? 'consumable' : 'non-consumable')),
        csv(isBundle ? 'bundle' : (p.is_convenience ? 'convenience' : 'standard')),
        // size column — only for non-bundle variant products
        csv(!isBundle && (b as any).variant_type ? ((b as any).size_variant || '') : ''),
      ];

      rows.push(row.join(','));
    }

    const BOM = '﻿';
    const csvBody = BOM + rows.join('\n');

    return new Response(csvBody, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'inline; filename="bundledmum-meta-catalog.csv"',
        'Cache-Control': 'public, max-age=300',
        'X-Row-Count': String(rows.length - 1),
        'X-Skipped-No-Image': String(skippedNoImage),
        'X-Skipped-No-Slug': String(skippedNoSlug),
        'X-Skipped-Ad-Excluded': String(skippedAdExcluded),
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
