import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Auth session storage for BundledMum.
 *
 * HISTORY: this used to persist the session in a cookie on ".bundledmum.com"
 * so the storefront and the marketplace, then living on the SEPARATE origin
 * marketplace.bundledmum.com, could share one login. The marketplace now
 * lives on the /marketplace PATH of this same origin, so that cross-origin
 * need is gone — localStorage, scoped per-origin, already covers every route
 * on bundledmum.com (/, /marketplace, /admin, /account, ...) with no special
 * configuration.
 *
 * REVERTED FROM COOKIES (deliberately, not a stray cleanup): the cookie
 * approach had a real, confirmed bug. @supabase/ssr's browser client sets the
 * session cookie via `document.cookie` in the page's own JavaScript, not a
 * server Set-Cookie response header (this is a pure client-side SPA, there is
 * no server in the request path that could set one). WebKit (Safari on iOS
 * and macOS, and every iOS browser, since all iOS browsers are WebKit-based
 * by Apple's policy) enforces a hard 7-day cap on any cookie set this way,
 * REGARDLESS of the Max-Age requested — the 1-year value this file used to
 * configure, and even @supabase/ssr's own 400-day internal default, were both
 * silently truncated to 7 days by the browser. That is why sellers on mobile
 * specifically were being signed out unexpectedly: after roughly a week
 * without the session being actively refreshed (easily reached by a mobile
 * browser tab sitting backgrounded), the cookie was simply gone, no error,
 * nothing in this app's own code did it. localStorage carries no such cap —
 * Safari's separate rule for script-writable storage only evicts it after 7
 * days of the user never visiting the site at all, which any return visit
 * resets, a far more forgiving bar for a returning seller checking their shop
 * every so often.
 *
 * KNOWN, ACCEPTED TRADEOFF: reverting logs out everyone currently holding a
 * cookie session, once. Worth it: the alternative is the bug above repeating
 * indefinitely for every mobile seller.
 *
 * Every auth access in the app goes through the SDK (supabase.auth.*), so
 * this storage choice is transparent to every consumer.
 */
export function createBundledmumSupabaseClient(
  url: string,
  key: string,
): SupabaseClient<Database> {
  return createClient<Database>(url, key, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
