import { supabase } from "@/integrations/supabase/client";

/**
 * Process-wide, SYNCHRONOUS record of which products require a size / colour.
 *
 * The cart's add-time guard (see getMissingVariantAxes in cart.tsx) used to
 * decide this purely from the payload's `sizes` / `colors` arrays. Every path
 * that spreads a mapped catalogue product carries those arrays, but the paths
 * that build a payload from an RPC row do not — quiz recommendations, gift
 * recommendations and the cart's "you might also like" rail all hand the cart
 * an object with no `sizes`, so the guard silently saw "no size needed" and
 * let a Nursing Bra or Hospital Slippers through with no size at all.
 *
 * This module gives the guard a second source of truth it can read without
 * awaiting: a set of product ids that have at least one IN-STOCK product_sizes
 * row. It is primed once when the cart provider mounts and cached in
 * localStorage, so it is already warm on the next visit. Nothing here ever
 * invents a size — it only answers "is one required?".
 */

const LS_KEY = "bm_variant_requirements_v1";

let sizeIds: Set<string> | null = null;
let colorIds: Set<string> | null = null;
let inflight: Promise<void> | null = null;

// Warm from the previous visit's snapshot so the very first add on a fresh
// page load is already gated. product_sizes changes rarely, and a stale
// snapshot can only be corrected by the live prime below (plus the
// server-side place-order check, which is the final backstop).
(function hydrateFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.size)) sizeIds = new Set<string>(parsed.size);
    if (Array.isArray(parsed?.color)) colorIds = new Set<string>(parsed.color);
  } catch { /* ignore a corrupt snapshot */ }
})();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify({
      size: sizeIds ? [...sizeIds] : [],
      color: colorIds ? [...colorIds] : [],
    }));
  } catch { /* quota / private mode — the in-memory sets still work */ }
}

/** Publish requirement ids fetched elsewhere (useVariantRequirements shares its fetch). */
export function setVariantRequirementIds(sizes: Iterable<string>, colors: Iterable<string>) {
  sizeIds = new Set<string>(sizes);
  colorIds = new Set<string>(colors);
  persist();
}

/**
 * Load the id sets once. Safe to call repeatedly — concurrent callers share
 * one request, and a resolved cache short-circuits unless `force` is set.
 */
export function primeVariantRequirements(force = false): Promise<void> {
  if (!force && sizeIds && colorIds) return Promise.resolve();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [sizeRes, colorRes] = await Promise.all([
        // in_stock only: a product whose every size is sold out cannot have a
        // size chosen, so demanding one would block the add with no way out.
        supabase.from("product_sizes").select("product_id").eq("in_stock", true),
        supabase.from("product_colors").select("product_id"),
      ]);
      if (sizeRes.error || colorRes.error) return;
      setVariantRequirementIds(
        (sizeRes.data || []).map((r: any) => String(r.product_id)),
        (colorRes.data || []).map((r: any) => String(r.product_id)),
      );
    } catch { /* offline — keep whatever snapshot we have */ } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * true / false when known, null when we have never loaded the sets (so the
 * caller can fall back to inspecting the payload rather than guessing).
 */
export function requiresSizeSync(productId: string | number | null | undefined): boolean | null {
  if (!sizeIds) return null;
  if (productId == null) return false;
  return sizeIds.has(String(productId));
}

export function requiresColorSync(productId: string | number | null | undefined): boolean | null {
  if (!colorIds) return null;
  if (productId == null) return false;
  return colorIds.has(String(productId));
}
