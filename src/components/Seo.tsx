import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const SITE = "https://bundledmum.com";

interface SeoProps {
  title: string;
  description: string;
  /** Override canonical path (defaults to current pathname). */
  path?: string;
  image?: string;
  type?: "website" | "article" | "product";
  noindex?: boolean;
  /** JSON-LD structured data object(s). Rendered as <script type="application/ld+json"> tag(s). */
  jsonLd?: Record<string, any> | Record<string, any>[];
  /** Override the auto-generated breadcrumb trail. Pass [] to disable. */
  breadcrumbs?: { name: string; path: string }[];
  /** Override the displayed leaf-segment name (defaults to the current page title). */
  breadcrumbLeafName?: string;
}

/**
 * Humanise a URL segment for breadcrumb display: "push-gifts" → "Push Gifts".
 * UUID-looking slugs get a generic label so we don't surface raw IDs.
 */
function humanise(seg: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return "Detail";
  return decodeURIComponent(seg)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Build a BreadcrumbList trail from the current pathname. Always starts
 * with Home, then one entry per path segment. Caller can override via
 * the `breadcrumbs` prop, or pass [] to disable entirely.
 */
function buildBreadcrumbs(
  pathname: string,
  leafName?: string,
): { name: string; path: string }[] {
  const segs = pathname.split("/").filter(Boolean);
  const trail: { name: string; path: string }[] = [{ name: "Home", path: "/" }];
  let acc = "";
  segs.forEach((seg, i) => {
    acc += `/${seg}`;
    const isLeaf = i === segs.length - 1;
    trail.push({ name: isLeaf && leafName ? leafName : humanise(seg), path: acc });
  });
  return trail;
}

/**
 * Per-route SEO tags. Sets a unique <title>, meta description, canonical
 * link, Open Graph tags, BreadcrumbList JSON-LD, and any extra JSON-LD
 * schemas. Mount once near the top of each page.
 */
export default function Seo({
  title,
  description,
  path,
  image,
  type = "website",
  noindex,
  jsonLd,
  breadcrumbs,
  breadcrumbLeafName,
}: SeoProps) {
  const loc = useLocation();
  const canonicalPath = path ?? loc.pathname;
  const url = `${SITE}${canonicalPath}`;

  const trail = breadcrumbs ?? buildBreadcrumbs(canonicalPath, breadcrumbLeafName ?? title);

  const schemas: Record<string, any>[] = [];
  if (trail.length > 1) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        item: `${SITE}${b.path}`,
      })),
    });
  }
  if (jsonLd) {
    const extras = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    schemas.push(...extras);
  }

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && <meta property="og:image" content={image} />}
      {image && <meta name="twitter:image" content={image} />}
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(s)}</script>
      ))}
    </Helmet>
  );
}
