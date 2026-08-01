# BundledMum Marketplace — Handoff

This handoff covers the BundledMum **MARKETPLACE** (now at
**bundledmum.com/marketplace**), the secondhand classifieds marketplace. It is a
**separate surface** from the main storefront (the rest of bundledmum.com), which
is documented in `handoff.md`. The two share one repo, one build, and — as of the
path move below — **one origin**, but they are different products with different
routes and **must not be conflated**.

> **Routing model changed (subdomain → path).** The marketplace was originally
> built to live on the subdomain `marketplace.bundledmum.com`, selected at
> runtime by a hostname check. That is blocked: **Lovable hosting allows only one
> primary custom domain and redirects all other connected domains to it**, so the
> subdomain cannot serve the app independently. The marketplace now lives on the
> **`/marketplace` path** of the main domain. Same project, repo, deploy, origin.
> This also removes the cross-origin auth problem entirely (see §5 auth note).

---

## 1. Goal
Stand up the runtime plumbing that lets one build serve two experiences from one
origin, split by URL path:
- `bundledmum.com/*` (everything except `/marketplace`) → existing storefront +
  admin (unchanged).
- `bundledmum.com/marketplace` → the new secondhand marketplace.

This pass is **plumbing only**: `/marketplace` renders a throwaway "Coming soon"
placeholder confirming the split works. No marketplace screens, listings, seller
dashboards, or checkout yet.

## 2. Current state (what's wired now)
- **Path split at the router root.** `src/App.tsx` is a thin shell that resolves
  `isMarketplace()` once and lazy-loads exactly one route tree.
  - `isMarketplace()` is `true` when `window.location.pathname` is `"/marketplace"`
    or starts with `"/marketplace/"`. Exact-or-prefix so sibling paths like
    `/marketplace-anything` are NOT captured. Single boolean, computed once at the
    top level.
  - Storefront/admin tree → `src/StorefrontApp.tsx` (the previous `App.tsx` body,
    moved **verbatim** — behaviour + appearance unchanged). Owns every path except
    `/marketplace`.
  - Marketplace tree → `src/marketplace/MarketplaceApp.tsx` (placeholder),
    mounted with `<BrowserRouter basename="/marketplace">` so its internal routes
    are relative to the base (placeholder `"/"` → `/marketplace`; a future
    `"/listings"` → `/marketplace/listings`) without hardcoding the prefix.
  - The two trees are **mutually exclusive** at the top level, so the storefront
    catch-all (`*`→NotFound) never sees `/marketplace`, and `/marketplace` never
    leaks into storefront routing. No storefront route begins with `/marketplace`
    (verified), so there is no collision.
- **Code splitting (unchanged).** Both trees are `React.lazy()` + `<Suspense>`
  (fallback = site-standard `BMLoadingAnimation`). Build output confirms the
  storefront stays its own ~5 MB chunk, loaded only when not on `/marketplace`.
- **Auth session storage: cookie storage RETAINED (not reverted).** See §5.
- **First real screens are live: BROWSE + LISTING DETAIL** (public, read-only),
  replacing the "Coming soon" placeholder at `/marketplace`.
  - `/marketplace` → the browse grid (the marketplace front door). 2-up on
    mobile, image-forward cards (image, `final_price_naira` as ₦, one-line title,
    trust signals: verified badge / location / short condition tag). Search
    (title) + category filter + location filter, all client-side over the fetched
    live listings.
  - `/marketplace/listing/:id` → detail: hero image + gallery thumbs, title,
    price, full condition, full description, category, location, a seller line
    (generic label + verified badge only, NO name/contact), and a single
    "Buy now" CTA that reveals a "checkout coming soon" note (no payment, no
    contact reveal).
  - Reads `public.marketplace_listings` directly with the existing anon client;
    only `status='live'` is fetched (enforced client-side AND by RLS).
- **Verified in preview (localhost:8081):** `/marketplace` shows the live grid
  (23 seeded live listings), a card taps through to detail, Buy now shows the
  coming-soon note, `/` still renders the storefront unchanged. Only console
  noise is Vite's HMR websocket warning (sandbox artifact). `npm run build`
  passes.

### ✅ Verified badge + seller identity are now LIVE (resolved)
The earlier badge blocker is fixed on the DB side by a public-safe view,
`public.marketplace_sellers_public`, granted SELECT to anon/authenticated. It
exposes EXACTLY five columns: `id, display_name, verification_tier, status,
created_at`. The base `marketplace_sellers` table stays locked for anon by design
(it holds bank flags, debit, strike counts, customer_id) and is never queried by
the app.

Seller identity is no longer embedded from the base table. The listing select no
longer embeds a seller; instead the hooks fetch sellers from the view for the
listings' `seller_id`s and join client-side (PostgREST cannot embed a view via
the base table's FK). Result, now verified live:
- The verified badge renders on every browse card and on the detail seller row
  when `verification_tier = 'verified'`.
- The detail page shows the real `display_name` (fallback "BundledMum seller"
  when null) plus a year-only tenure line ("Selling since 2026", omitted when
  `created_at` is missing) and initials-based avatar.
- The browse CARD still shows only its three trust signals (badge, location,
  condition), never the seller name.
- No sensitive seller field is fetched or shown anywhere; no contact reveal.

## 3. Active files
- `src/App.tsx` — thin top-level shell; picks the tree via `isMarketplace()`,
  lazy-loads it inside `<Suspense>`. (This pass: comments updated hostname→path;
  selection logic unchanged.)
- `src/lib/isMarketplace.ts` — the single path-based boolean. (This pass:
  switched from hostname+`?view` to `/marketplace` path.)
- `src/marketplace/MarketplaceApp.tsx` — router (basename `/marketplace`) + its
  OWN `QueryClientProvider`; routes `/`→Browse, `/listing/:id`→Detail; imports
  `marketplace.css`; wraps everything in a `.mkt` div for scoped styling.
- `src/marketplace/marketplace.css` — **NEW**; Nunito/Lato `@import` + brand
  tokens (coral/green/cream) + component classes, all scoped under `.mkt` so the
  storefront (DM Sans/Playfair) is untouched.
- `src/marketplace/types.ts` — **NEW**; local row interfaces for the
  marketplace_* tables (they are NOT in the generated `types.ts`). `price_naira`
  is deliberately omitted so it can never leak to buyers.
- `src/marketplace/lib/format.ts` — **NEW**; `formatNaira` (₦ + thousands),
  `conditionLabel` (short derive, fallback "Used"), `locationLabel`,
  `isVerifiedSeller`.
- `src/marketplace/data/mdb.ts` — **NEW**; untyped anon client handle +
  `LISTING_SELECT` (FK-hinted embeds for category name + seller verification_tier).
- `src/marketplace/data/useListings.ts` — **NEW**; react-query hooks
  `useLiveListings()` and `useListing(id)` (both scoped to `status='live'`).
- `src/marketplace/components/{ListingCard,VerifiedBadge}.tsx` — **NEW**.
- `src/marketplace/pages/{BrowsePage,ListingDetailPage}.tsx` — **NEW**.
- `src/StorefrontApp.tsx` — the previous `App.tsx` body moved verbatim
  (storefront + admin + employee-portal). Untouched this pass.
- `src/integrations/supabase/authStorage.ts` — builds the Supabase client with
  cookie storage on bundledmum hosts, `localStorage` elsewhere. **Untouched this
  pass** (see §5). NOTE: its doc comments still say "cross-subdomain" /
  "marketplace.bundledmum.com"; those are now stale (single origin) but left
  as-is to avoid any risk to working auth — tidy in a later dedicated pass.
- `src/integrations/supabase/client.ts` — auto-generated; one-line delegation to
  `createBundledmumSupabaseClient(...)`. Untouched this pass.
- `package.json` / lockfile — `@supabase/ssr@^0.12.4` (added in the prior pass;
  still used by the retained cookie storage).

## 4. Failed attempts (with WHY)
- **True subdomain `marketplace.bundledmum.com` — BLOCKED by Lovable hosting.**
  The original design served the marketplace from its own subdomain, chosen by a
  `window.location.hostname` check. Lovable only allows one primary custom domain
  and 301-redirects every other connected domain to it, so the subdomain can
  never serve the app independently — it just bounces to the primary. Replaced
  with the `/marketplace` path on the main domain (this pass). The hostname check
  and its `?view=marketplace` dev override were removed with it.
- **`?view=marketplace` query override — dropped, not kept.** The prompt allowed
  keeping it "if cheap"; it is not. With the marketplace router now on
  `basename="/marketplace"`, triggering marketplace mode at a non-`/marketplace`
  URL would mount a basename router on a mismatched path → React Router renders
  blank. It is also now redundant: `/marketplace` resolves directly in dev,
  preview, and prod (all one origin), which was the only reason the override
  existed (the subdomain didn't resolve in dev).
- **Hand-rolled `document.cookie` storage adapter — rejected in the prior pass.**
  Supabase sessions routinely exceed the ~4KB per-cookie limit; a naive adapter
  would truncate and break login. Used `@supabase/ssr` (chunks correctly).
- No approaches were built and reverted during implementation.

## 5. Changes made

### This pass — seller identity from the public-safe view
- Seller data now reads from `public.marketplace_sellers_public` (id,
  display_name, verification_tier, status, created_at only), via a separate
  query joined client-side by `seller_id`. Removed the base-table embed from
  `LISTING_SELECT`; the base `marketplace_sellers` table is never queried by the
  app (stays locked for anon by design). Files: `data/mdb.ts`,
  `data/useListings.ts`, `types.ts`, `lib/format.ts`,
  `pages/ListingDetailPage.tsx`. `ListingCard.tsx` unchanged (badge already read
  `isVerifiedSeller`).
- Verified badge now renders on cards + detail; detail shows real `display_name`
  (fallback "BundledMum seller"), year-only tenure ("Selling since 2026", omitted
  if `created_at` missing), and initials avatar. Card shows NO seller name.
- Only the 5 view columns are ever read; no sensitive field, no contact.
  All existing plumbing preserved (status='live', final_price_naira,
  category/location dropdowns, search, card-to-detail nav). Verified live: 23
  listings load, all show the badge, detail shows "Amaka O." / "Chioma E." plus
  tenure.

### Earlier this branch line — visual reskin to the approved Claude Design
- Browse + listing detail were reskinned to the approved Claude Design mockup
  (project `0afda8cc`, `BundledMum Marketplace.dc.html`) visual language: green
  header carrying brand + search + the two filter pills, cream surfaces, Nunito/
  Lato type scale, the design card anatomy (photo, price, one-line title, three
  trust signals), detail layout (hero + back + thumbnails, price, title, tag
  chips, seller row, condition + description, escrow reassurance note, sticky
  Buy now bar).
- **VISUAL ONLY. Every Supabase connection preserved and untouched:** the data
  layer (`data/useListings.ts`, `data/mdb.ts`, `types.ts`, `lib/format.ts`) was
  not modified. Still: `status='live'` only, `final_price_naira` shown (never
  `price_naira`), category + location filter dropdowns (kept as dropdowns,
  restyled), title search, `isVerifiedSeller` badge logic, card→detail nav, Buy
  now → coming-soon placeholder. Files changed were only `marketplace.css`,
  `pages/{BrowsePage,ListingDetailPage}.tsx`,
  `components/{ListingCard,VerifiedBadge}.tsx`.
- **Design-to-real-data adaptations (design implied fields we do not have):**
  - Seller name / "since 2025" / avatar initials in the mockup → we render a
    generic "BundledMum seller" line + verified badge only (no name/date/contact
    columns exist; verification is still RLS-dormant, see §2 blocker).
  - Detail footer "Total from" with service/Paystack fees → shows the real
    `final_price_naira` + Buy now (fees are a checkout concern, not built).
  - Bottom tab bar (Browse/Orders/Sell/Account) and header "Sell" link →
    omitted, they point to screens that do not exist yet (no dead nav).
  - Category chips in the mockup → kept as the existing dropdown (restyled), per
    the instruction to preserve both filter dropdowns.
- Verified live in preview: grid reads 23 listings, category filter narrows to 3
  strollers, card taps through to the reskinned detail, storefront unchanged.

### Earlier this branch line — browse + listing detail (first real customer screens)
- Built the public, read-only BROWSE grid and LISTING DETAIL page (see §2), all
  new files under `src/marketplace/` (see §3). No storefront/admin/auth changes.
- **Data conventions (important for the next dev):**
  - `final_price_naira` is the ONLY buyer-facing price (already includes markup).
    `price_naira` must NEVER be shown to buyers — it is not even modelled in the
    local types.
  - `image_url` holds a Supabase-stored URL in production; the current TEST data
    uses external URLs. We render whatever is in the field. (In the sandbox
    preview some external test URLs fail to load and show alt text — expected,
    not a bug; production Supabase-hosted images will load.)
  - Reads use the existing anon `supabase` client via an untyped handle
    (`data/mdb.ts`), because the marketplace_* tables are absent from the
    generated `types.ts` and that file is left untouched.
- **Open item — pricing not yet rounded.** `final_price_naira` is the raw
  markup result (price + 10%), so prices can look unrounded (e.g. ₦8,250). This
  is a later pricing/presentation decision, not handled here. Flagged.

### Prior pass — subdomain → path split
- **Split signal switched from hostname to path** (`isMarketplace.ts`), marketplace
  router mounted under `basename="/marketplace"` (`MarketplaceApp.tsx`), App/comment
  updates. Lazy split and storefront/admin behaviour unchanged.

### Auth storage decision — cookie storage RETAINED (deliberately not reverted)
The prompt's preferred cleanup was to revert session storage to the plain
`localStorage` default now that everything is same-origin. **I did NOT revert**,
because reverting would log people out:
- **Existing live sessions are in cookies.** Since the cookie change shipped
  (merge `b92a181`), everyone who logged in on `bundledmum.com` has their session
  in `sb-*` cookies on `.bundledmum.com`, not in `localStorage`.
- **Reverting → forced logout wave.** A `localStorage`-backed client reads
  `localStorage`, finds nothing, and treats them as logged out — a one-time
  re-login for the whole active cohort. No data loss, but real disruption for
  zero functional gain.
- **Cookie storage is harmless same-origin.** A `.bundledmum.com` cookie is sent
  on `bundledmum.com/marketplace` (same origin); login works today (verified live
  after `b92a181`). Per the prompt: *"Auth working is more important than auth
  being tidy… leaving the working cookie storage in place is acceptable."*
- **Net:** `authStorage.ts` and `client.ts` are untouched this pass. Only their
  comments are now stale (they describe the old cross-subdomain rationale).

### Risk / open note on the auto-generated client (still stands)
`client.ts` is marked auto-generated. History: only 3 commits ever vs 8+ for its
schema-driven sibling `types.ts` — evidence it's regenerated rarely, not per
build/schema-change; exact Lovable trigger unconfirmed. **Risk:** a regeneration
would drop the one-line delegation and revert the client to plain `localStorage`
(cookie sessions become invisible → logout wave; nothing crashes). Mitigation:
all storage logic lives in `authStorage.ts`; recovery is re-adding one import +
call in `client.ts`.

## 6. Next steps
1. **Checkout** — the Buy now CTA is a placeholder ("checkout coming soon"). Wire
   real buying (Paystack, seller subaccount, contact reveal post-payment) where
   that button is in `ListingDetailPage.tsx`. Not started.
2. **Seller onboarding** — seller signup, listing creation/submission, the
   pending_review → live workflow. Not started.
4. **Admin** — marketplace moderation (approve/reject listings, manage sellers,
   categories). Not started.
5. **Pricing presentation** — decide rounding for `final_price_naira` (currently
   raw price + 10% markup, so unrounded figures show). See §5 open item.
6. Confirm on live that `bundledmum.com/marketplace` serves the grid and the
   storefront is unaffected, once this branch is merged + deployed.
7. **Auth tidy (optional, later):** if desired, revert to `localStorage` default
   in a dedicated pass — but expect a one-time logout of cookie-session users, so
   only do it deliberately (e.g. alongside comms), not as a drive-by cleanup.
   Also refresh the now-stale "cross-subdomain" comments in `authStorage.ts`.
8. Watch the `client.ts` regeneration risk above after any Lovable-side change.
