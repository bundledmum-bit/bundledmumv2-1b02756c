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
}

/**
 * Per-route SEO tags. Sets a unique <title>, meta description, canonical
 * link, and Open Graph tags. Mount once near the top of each page.
 */
export default function Seo({ title, description, path, image, type = "website", noindex }: SeoProps) {
  const loc = useLocation();
  const url = `${SITE}${path ?? loc.pathname}`;
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
    </Helmet>
  );
}
