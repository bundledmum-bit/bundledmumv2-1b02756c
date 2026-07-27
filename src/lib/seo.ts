// Shared SEO constants/helpers for absolute URLs + a default OG image.
// Used by the articles pages (Stage 3) and available to any other
// surface that needs absolute share URLs.

export const SITE_URL = "https://bundledmum.com";

// Site-wide default OG image — must stay in step with the static og:image in
// index.html so a page that supplies no image of its own shares the same card.
// 1200x630, served from our own origin.
export const OG_FALLBACK_IMAGE = `${SITE_URL}/images/og-default.jpg`;

/** Turn a possibly-relative path into an absolute https URL (or null). */
export function buildAbsoluteUrl(u?: string | null): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `${SITE_URL}${u.startsWith("/") ? "" : "/"}${u}`;
}
