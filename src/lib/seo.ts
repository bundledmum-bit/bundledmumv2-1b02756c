// Shared SEO constants/helpers for absolute URLs + a default OG image.
// Used by the articles pages (Stage 3) and available to any other
// surface that needs absolute share URLs.

export const SITE_URL = "https://bundledmum.com";

// Site-wide default OG image — mirrors the static og:image in index.html
// so social shares of pages without their own image still get a card.
export const OG_FALLBACK_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/76b136ee-a23a-4cd0-88d4-4878bb1e87d0/id-preview-bebcbab3--03d6b7f3-44eb-47ba-a4a0-feac5dc63184.lovable.app-1775354939615.png";

/** Turn a possibly-relative path into an absolute https URL (or null). */
export function buildAbsoluteUrl(u?: string | null): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `${SITE_URL}${u.startsWith("/") ? "" : "/"}${u}`;
}
