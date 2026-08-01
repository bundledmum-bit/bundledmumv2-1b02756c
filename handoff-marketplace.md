# BundledMum Marketplace — Handoff

This handoff covers the BundledMum **MARKETPLACE** (marketplace.bundledmum.com),
the secondhand classifieds marketplace. It is a **separate surface** from the
main storefront (bundledmum.com), which is documented in `handoff.md`. The two
share one repo and one build but are different products with different routes,
and **must not be conflated**.

---

## 1. Goal
Stand up the runtime plumbing that lets one build serve two experiences from two
hostnames:
- `bundledmum.com` → existing storefront + admin (unchanged).
- `marketplace.bundledmum.com` → the new secondhand marketplace.

This first pass is **plumbing only**: the marketplace host renders a throwaway
"Coming soon" placeholder confirming the split works. It also fixes cross-
subdomain auth so a customer logged in on one host is recognised on the other.
No marketplace screens, listings, seller dashboards, or checkout in this pass.

## 2. Current state (what's wired now)
- **Hostname split at the router root.** `src/App.tsx` is now a thin shell that
  resolves `isMarketplace()` once and lazy-loads exactly one route tree.
  - `isMarketplace()` is `true` when `window.location.hostname` starts with
    `"marketplace."` **OR** the URL contains `?view=marketplace` (preview
    override for dev + the Lovable preview host, where the real subdomain does
    not resolve). Single boolean, computed once at the top level.
  - Storefront/admin tree → `src/StorefrontApp.tsx` (the previous `App.tsx`
    body, moved **verbatim** — behaviour + appearance unchanged).
  - Marketplace tree → `src/marketplace/MarketplaceApp.tsx` (placeholder).
- **Code splitting.** Both trees are `React.lazy()` + `<Suspense>` (fallback =
  site-standard `BMLoadingAnimation`). Verified in the build output: the
  marketplace chunk is ~0.57 kB vs the storefront chunk at ~5 MB, so a visitor
  on one host does not download the other's bundle.
- **Cross-subdomain auth session.** The Supabase session is now persisted in a
  cookie scoped to `.bundledmum.com` (shared across the root domain and all
  subdomains) — but **only on real bundledmum.com hosts**. On localhost and
  `*.lovable.app` it falls back to the previous default `localStorage` client,
  so dev + preview auth are unchanged. Implemented with `@supabase/ssr`'s
  browser client (it chunks the >4KB session cookie correctly).
- **Verified in preview (localhost:8081):**
  - `/` (no param) → storefront homepage renders as before.
  - `/?view=marketplace` → "BundledMum Marketplace / Coming soon" placeholder.
  - Only console noise is Vite's HMR websocket warning (sandbox artifact, not
    app code). Production `npm run build` passes.

## 3. Active files
- `src/App.tsx` — thin top-level shell; picks the tree via `isMarketplace()`,
  lazy-loads it inside `<Suspense>`.
- `src/lib/isMarketplace.ts` — the single hostname-or-`?view` boolean.
- `src/StorefrontApp.tsx` — **NEW**; the entire previous `App.tsx` body moved
  verbatim (all providers, `BrowserRouter`, storefront + admin + employee-portal
  routes). Only the component/default-export name changed (`App` →
  `StorefrontApp`). Storefront/admin logic untouched.
- `src/marketplace/MarketplaceApp.tsx` — **NEW**; minimal `BrowserRouter` with a
  single `/` placeholder route. This is throwaway — replaced by real marketplace
  screens next.
- `src/integrations/supabase/authStorage.ts` — **NEW**; builds the Supabase
  client with the correct session storage for the current host (cookie on
  `.bundledmum.com` in prod, `localStorage` fallback elsewhere). Lives outside
  the auto-generated `client.ts` on purpose.
- `src/integrations/supabase/client.ts` — auto-generated file; edited to a
  **one-line delegation** to `createBundledmumSupabaseClient(...)`. Kept minimal
  so a regeneration costs at most this one import swap.
- `package.json` / lockfile — added `@supabase/ssr@^0.12.4`.

## 4. Failed attempts (with WHY)
- **Hand-rolled `document.cookie` storage adapter — rejected before building.**
  A Supabase session (access JWT + refresh token + user object) routinely
  exceeds the ~4KB per-cookie limit, so a naive adapter would silently truncate
  and break login. Chose `@supabase/ssr` instead, which chunks cookies
  correctly and is Supabase-maintained. (Decision made in the audit phase; no
  code was written for the rejected path.)
- No approaches were built and reverted during implementation.

## 5. Changes made
- Added the hostname split + lazy route trees (files in §3).
- Added `@supabase/ssr` and switched session storage to a parent-domain cookie
  on bundledmum hosts, with `localStorage` fallback on localhost/preview.
- **localStorage session reads:** audited every `supabase.auth.*` call site
  (App.tsx, AuthAnalyticsListener, IdleTimeoutGuard, useAdmin, useCustomerAuth,
  useHR, useIdleTimeout, useOrderPicking, AccountLoginPage, AccountPage,
  ResetPassword, AdminApprovals, AdminLogin, AdminPermissions,
  AdminPickingHistory, AdminSetPassword, EmployeePortalLayout,
  EmployeePortalLogin). **Every session access goes through the SDK — ZERO code
  reads the Supabase session directly from `localStorage`.** So switching the
  storage mechanism is transparent to all consumers; nothing needed a rewrite.
  (The only raw `localStorage` uses touching "session"/"token" — metaPixel,
  quizSessionTracking, CheckoutPage's `bm_quiz_session_id`, PackagePage's
  `bm-session-key` comment — are non-auth and untouched.)
- **Not changed (deliberately):** auth logic, redirect URLs, magic-link flow,
  `emailRedirectTo`. Only the session storage mechanism changed.
- A second, throwaway Supabase client in
  `src/pages/admin/hr/AdminHREmployees.tsx:418` (`persistSession:false`) is
  irrelevant to the cookie switch and was left as-is.

### Risk / open note on the auto-generated client
`src/integrations/supabase/client.ts` is marked "automatically generated. Do not
edit it directly." Git history shows it has only **3 commits ever** while its
schema-driven sibling `types.ts` has 8+ and they coincided only once — strong
evidence `client.ts` is regenerated **rarely** (on explicit auth/client changes),
**not** per-build or per-schema-change. I could not confirm Lovable's exact
regeneration trigger from inside the repo. **Risk:** if Lovable ever regenerates
`client.ts`, the one-line delegation to `authStorage` is lost and the client
reverts to plain `localStorage` (cross-subdomain sharing silently stops; nothing
crashes). Mitigation already in place: all cookie logic lives in the separate
`authStorage.ts`, so recovery is re-applying a single import + call in
`client.ts`. If it recurs, consider having Lovable's client config point at the
adapter, or move the client construction out of the generated file entirely.

## 6. Next steps
1. Build the real marketplace UI in `src/marketplace/` (replace the placeholder
   `MarketplaceApp` route tree): landings, listing cards, listing detail,
   seller flows, etc. — per the later prompts.
2. Decide the marketplace's own provider needs (it currently shares nothing with
   the storefront). Add a QueryClient / cart / theme as those screens require.
3. Confirm on the real subdomain once DNS is live that the `.bundledmum.com`
   cookie is actually set and the session is shared bundledmum.com ⇄
   marketplace.bundledmum.com (the domain branch only activates on a real
   bundledmum host, so it cannot be end-to-end verified from localhost/preview).
4. **Separate decision, not done here:** whether `emailRedirectTo` / the
   magic-link flow needs to change for the marketplace subdomain (e.g. so a
   login initiated on marketplace.bundledmum.com returns there). Flagged in the
   audit and intentionally left untouched.
5. Watch the `client.ts` regeneration risk above after any Lovable-side change.
