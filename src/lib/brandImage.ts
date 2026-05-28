// Single source of truth for "which URL do we display for a brand image".
//
// Every brand row carries two image fields:
//   • stored_image_url — self-hosted Supabase Storage copy (same-origin,
//     reliable, won't rot or block hotlinking)
//   • image_url        — the ORIGINAL external URL (konga/lagmart/etc),
//     which can rot or block over time
//
// Rule: prefer the stored copy when present, otherwise fall back to the
// external URL.
//
// CRITICAL: an EMPTY STRING ('') in stored_image_url means "re-host
// FAILED" — it is NOT a usable URL. ~12 of 1,150 brands are in this
// state. Treating '' as a URL would render a broken image on those
// products, so we guard with a trim()-and-truthiness check. null and ''
// are handled identically: both fall through to image_url.
//
// This logic must live ONLY here. Do not inline the ternary in
// components — import getBrandImage so the empty-string guard can never
// be gotten wrong in one place and right in another.
export function getBrandImage(
  brand: { stored_image_url?: string | null; image_url?: string | null } | null | undefined,
): string | null {
  if (!brand) return null;
  const stored = brand.stored_image_url?.trim();
  if (stored) return stored;          // non-null AND non-empty
  const ext = brand.image_url?.trim();
  return ext || null;                  // fall back, or null if both empty
}
