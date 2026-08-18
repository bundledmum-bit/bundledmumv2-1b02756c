import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SITE_URL = 'https://bundledmum.com'
const OG_FALLBACK_IMAGE = 'https://bundledmum.com/og-image.jpg'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      }
    })
  }

  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')

  if (!slug) {
    return new Response('Missing slug parameter', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data: article, error } = await supabase
    .from('articles')
    .select('title, meta_title, meta_description, hero_image_url, hero_image_alt, slug, excerpt, published_at')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (error) {
    console.error('DB error:', error.message)
  }

  const title = article?.meta_title ?? 'BundledMum | Nigerian Maternity Platform'
  const description = article?.meta_description ?? 'Curated maternity bundles for Nigerian mums. Find your perfect hospital bag, postpartum recovery kit, and newborn essentials.'
  const image = article?.hero_image_url ?? OG_FALLBACK_IMAGE
  const imageAlt = article?.hero_image_alt ?? 'BundledMum maternity bundles'
  const canonicalUrl = `${SITE_URL}/articles/${slug}`
  const publishedTime = article?.published_at ?? new Date().toISOString()

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="BundledMum" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="article:published_time" content="${escapeHtml(publishedTime)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(canonicalUrl)}">${escapeHtml(title)}</a>...</p>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    }
  })
})
