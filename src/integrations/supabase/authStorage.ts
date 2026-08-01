import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Cross-subdomain auth session setup for BundledMum.
 *
 * The storefront (bundledmum.com) and the marketplace
 * (marketplace.bundledmum.com) are different browser ORIGINS. Supabase's
 * default session storage is localStorage, which is scoped per-origin, so a
 * customer logged in on one host appears logged out on the other. To share a
 * single session across the root domain and all its subdomains we persist the
 * session in a cookie scoped to the parent domain ".bundledmum.com".
 *
 * We use @supabase/ssr's browser client for this because a Supabase session
 * (access JWT + refresh token + user object) routinely exceeds the ~4KB
 * per-cookie limit; @supabase/ssr chunks the cookie correctly, which a
 * hand-rolled document.cookie adapter would get wrong.
 *
 * IMPORTANT: the ".bundledmum.com" cookie domain is applied ONLY on real
 * bundledmum.com hosts. On localhost and on the Lovable preview host
 * (*.lovable.app) a ".bundledmum.com" cookie cannot be set and would silently
 * break login, so we fall back to the previous default localStorage-backed
 * client on those hosts — keeping local dev and preview auth working exactly
 * as they did before this change.
 *
 * This module deliberately lives OUTSIDE the auto-generated client.ts so the
 * cross-subdomain logic survives any regeneration of that file.
 */

const PARENT_COOKIE_DOMAIN = ".bundledmum.com";

/** True for bundledmum.com and any of its subdomains (marketplace., www., ...). */
function isBundledmumHost(hostname: string): boolean {
  return hostname === "bundledmum.com" || hostname.endsWith(".bundledmum.com");
}

/**
 * Creates the app-wide Supabase client with the correct session storage for
 * the current host. All auth access in the app goes through the SDK
 * (supabase.auth.*), so swapping the storage mechanism here is transparent to
 * every consumer — no code reads the session out of localStorage directly.
 */
export function createBundledmumSupabaseClient(
  url: string,
  key: string,
): SupabaseClient<Database> {
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "";

  // Production bundledmum hosts → shared cookie session across all subdomains.
  if (isBundledmumHost(hostname)) {
    return createBrowserClient<Database>(url, key, {
      cookieOptions: {
        domain: PARENT_COOKIE_DOMAIN,
        path: "/",
        sameSite: "lax",
        secure: true,
        // ~1 year, so the shared session lives as long as a refresh session.
        maxAge: 60 * 60 * 24 * 365,
      },
    });
  }

  // localhost / *.lovable.app / anything else → unchanged default behaviour
  // (localStorage). This preserves dev + preview auth precisely as before.
  return createClient<Database>(url, key, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
