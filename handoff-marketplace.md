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
- **Stale "DB-blocked" claim repeated across three sessions — corrected.** This
  file long stated the seller flow was blocked by a missing
  `marketplace_sellers` INSERT policy and a missing `marketplace-listings`
  bucket. Both were resolved on Supabase well before, but the claim kept getting
  inherited and repeated, which made the create-listing and dashboard screens get
  reported as unreachable when they were not. WHY it persisted: Claude Code
  cannot see database state from a git diff, so a stale assertion written into
  the handoff was trusted as fact each session. **Going forward, treat any
  DB-state claim in this file as needing verification against Supabase (list the
  policy, bucket, trigger or table) before repeating it, not as established
  fact.**
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

### This pass — buyer checkout + awaiting payment (manual bank transfer)
Replaces the "checkout coming soon" placeholder on listing detail with a real
bank-transfer checkout and an awaiting-payment state. Scope was checkout +
awaiting only (no tracking, dispute, or admin). Matches design section 3a
(T1 checkout, T1b confirm sheet, T2 awaiting, T2b waiting-too-long).
- New files: `src/marketplace/checkout/{orders.ts, CheckoutPage.tsx,
  AwaitingPaymentPage.tsx}`. Routes `/checkout/:listingId` and
  `/checkout/awaiting/:reference` in `MarketplaceApp.tsx`. `ListingDetailPage`
  Buy now now navigates to `/checkout/:id` (placeholder note removed).
- **Checkout (T1):** login-gated (returnTo to the storefront login). Order
  summary (photo, title, seller display_name), price breakdown as separate lines
  (item = `final_price_naira`, service fee ₦750 non-refundable, total; never
  `price_naira`), BundledMum bank details with copy-to-clipboard on the account
  number, a prominent payment reference with copy and narration instruction, an
  escrow reassurance block, and "I have sent the transfer" behind a confirm
  bottom sheet (T1b).
- **Payment reference** generated client-side (`BM-` + 8 crypto chars from an
  unambiguous alphabet), stored in `sessionStorage` per listing so a refresh
  mid-transfer keeps it stable. Stored server-side in
  `paystack_transaction_reference` (reused as the buyer payment reference, no new
  column needed).
- **Awaiting (T2/T2b):** reads the order back from `marketplace_orders` by
  reference (buyers can SELECT their own), so it survives refresh and is
  reachable later. Shows amount, item, reference (copy), what-happens-next, and
  reassurance. If the order is still pending and older than 12h it shows the
  "waiting too long" variant with a WhatsApp receipt route. Cancel is a WhatsApp
  contact, not a client write (UPDATE is blocked).
- **Empty bank settings handled:** the bank detail settings are currently blank,
  so checkout shows a clear "payment details are not set up yet" card with a
  WhatsApp route and hides the reference box and the transfer action, instead of
  a broken screen. Verified live.
- **Order creation is isolated** in `checkout/orders.ts` →
  `createMarketplaceOrder()` calls the edge function `create-marketplace-order`
  via `supabase.functions.invoke`. `marketplace_orders` has no public INSERT or
  UPDATE (only admin + service role write), so this is deliberate and NOT worked
  around. Until the function is deployed the call fails and checkout shows a
  clear "secure checkout is being set up" message.
- Preserved: browse, listing detail, the whole sell flow, and admin unchanged.

### 🛑 OUTSTANDING: edge function `create-marketplace-order` (needed for checkout to complete)
The client cannot write to `marketplace_orders` (RLS). Deploy an edge function
that:
- authenticates the buyer (auth.uid → `customers.id` = buyer_id),
- loads the listing server-side and requires `status='live'`,
- computes `item_price_naira = final_price_naira`, `service_fee_naira` from
  `site_settings` (750), `paystack_fee_naira = 0`, `amount_naira = item + fee`,
  `seller_share_naira = listing.price_naira` (the seller's asking price, which
  the buyer must never see, this is the core reason it is server-side), and
  `platform_share_naira = amount_naira - seller_share_naira`,
- sets `payment_status='pending'`, `order_status='awaiting_payment'`,
  `settlement_status='unsettled'`, `paystack_transaction_reference = <ref from
  the client>`, `listing_id`, `buyer_id`, `seller_id = listing.seller_id`,
- inserts with the service role and returns the order row.
Input: `{ listing_id, payment_reference }`. Also worth considering: reject if the
buyer already has an open order for the same listing. The bank detail settings
(`marketplace_bank_name`, `marketplace_bank_account_name`,
`marketplace_bank_account_number`) must also be filled for checkout to show the
transfer step at all.

### Earlier this branch line — searchable area select on create listing
- The area field on `/marketplace/sell/new` is now a searchable type-ahead
  combobox (`sell/AreaCombobox.tsx`), because the allowed area lists have grown:
  **Lagos has 164 allowed areas, FCT has 33, both states open.** A 164-option
  plain select was unusable on a phone.
- Matching is case-insensitive and matches anywhere in the name (verified live:
  "gud" surfaces Aguda, Ogudu and Ogudu GRA; "lekki" surfaces Ibeju-Lekki, Lekki
  Free Trade Zone, Lekki Phase 1 and Lekki Phase 2). Keyboard arrow/enter and
  touch friendly, capped-height scrollable list.
- The seller must pick from the list: only a real selection commits to the
  value; typed text that matches nothing shows an empty state with a WhatsApp
  invite (existing `WHATSAPP_BASE`) and reverts on blur, it is never stored.
  Disabled until a state is chosen; keyed by stateId so changing state clears the
  area and the search. The chosen NAMES are still written to `location_state` and
  `location_city`, schema unchanged.
- **Implementation note:** the repo has `cmdk` (and a shadcn `command.tsx`), and
  it was tried first, but importing cmdk into the marketplace tree threw an
  "invalid hook call / more than one copy of React" runtime error in this app's
  Vite setup. Rather than add config or a dependency, the combobox is hand-rolled
  with plain React in the scoped `.mkt` styling. No new dependency.
- **Browse location filter left unchanged (audited):** it is a plain select of
  distinct `location_state` values from live listings (state level, a handful of
  options), not areas, so it is not unwieldy and did not need converting.
- Preserved and unchanged: 4-photo minimum + camera-or-gallery + compression,
  display_name validation, contact-detail block, buyer-price preview, upload to
  marketplace-listings (first->image_url), no writing final_price_naira /
  markup_percent, status pending_review, the "Almost new" label. Files:
  `sell/AreaCombobox.tsx` (new), `sell/CreateListingPage.tsx` (area field swap),
  `marketplace.css` (combobox styles).

### Earlier this branch line — create-listing changes + admin location management
Functional changes to `/marketplace/sell/new` plus a new admin Locations section.
- **Minimum 4 photos, camera or gallery, compressed.** Submission is blocked
  below 4 with encouraging copy (buyers cannot ask questions, so angles explain).
  The photo input is `accept="image/*" multiple` with NO `capture` attribute, so
  mobile browsers present the OS chooser (camera or gallery); adding `capture`
  would force camera-only, which we deliberately avoid. Each photo is compressed
  client-side before upload (`compressImage` in `sellData.ts`: createImageBitmap
  with EXIF orientation, canvas draw at longest edge <=1600px, JPEG quality 0.8,
  falls back to the original on any failure). A 3 to 4MB phone photo comes out
  around 200 to 350KB, uploaded as image/jpeg. First photo still image_url, rest
  gallery_urls.
- **Condition label "Like new" renamed to "Almost new".** It is a pure frontend
  string composed into `condition_notes` (no column/enum). The customer
  `conditionLabel()` in `lib/format.ts` now maps "almost new" AND the legacy
  "like new"/"as new" to the display label "Almost new", so the 4 pre-existing
  rows that stored "Like new" stay in the DB unchanged but display consistently.
  No data migration.
- **State and area are now admin-controlled dependent dropdowns** reading
  `public.marketplace_states` and `public.marketplace_areas` (public read where
  is_allowed=true, admin manage). State lists allowed states by sort_order; area
  is dependent on the chosen state and resets when state changes. Only Lagos and
  FCT are open (others exist but is_allowed=false, so sellers never see them).
  The chosen NAMES are still written to the existing `location_state` /
  `location_city` columns, so the listings schema and browse filtering are
  unchanged. Browse derives its location filter from listing values, so it keeps
  working with cleaner canonical values, no browse change needed.
- **Admin location management** added to marketplace Settings
  (`MarketplaceLocations.tsx`): lists states with allowed/disabled pill and area
  count, toggle per state behind a confirm, expand to areas (toggle + add area),
  and add a state. Copy explains disabling removes a place from the seller form.
  Error red #C0392B for disabled/negative. Verified live: Lagos and FCT show On
  with 20 and 6 areas, the other 35 states show Disabled.
- Files: `sell/CreateListingPage.tsx`, `sell/sellData.ts`, `lib/format.ts`,
  new `pages/admin/marketplace/MarketplaceLocations.tsx`, and
  `pages/admin/marketplace/MarketplaceSettings.tsx` (renders it).
- Preserved: display_name validation, contact-detail block, buyer-price preview,
  upload to marketplace-listings (first->image_url), no writing
  final_price_naira/markup_percent, status pending_review, bank masking.
- New tables in use: `marketplace_states` (id, name, is_allowed, sort_order),
  `marketplace_areas` (id, state_id, name, is_allowed).

### Earlier this branch line — sell screens reskinned to the approved Claude Design
- Applied the approved design (project `0afda8cc`, "Sell flow, four screens":
  S1 become a seller, S2 setup + S2b validation, S3 create listing + S3b contact
  block + S3c awaiting review, S4 dashboard + S4b orders empty) to the existing
  working sell components. Visual only. Files changed: `marketplace.css` (sell
  block) and `sell/{BecomeSellerPage,SellerSetupPage,CreateListingPage,
  SellerDashboardPage}.tsx`. Data files `useSeller.ts` and `sellData.ts` are
  untouched.
- **Every data connection and validation preserved:** display_name rejects
  digits/@/URL (now shown in the design's red error box + red field border);
  description + condition_notes contact-detail block (design red block + footer
  message); at least one photo required (design shows six, our real rule is one,
  kept as one, styled to match, first photo is MAIN); buyer-price preview
  (asking x (1 + markup/100) from marketplace_markup_percent); photo upload to
  the `marketplace-listings` bucket with first->image_url, rest->gallery_urls;
  final_price_naira and markup_percent left to the DB trigger; status stays
  pending_review; bank details masked to last 4 and never public.
- Design-to-real-data adaptations reported: "6 photos required" kept as "at
  least one"; "Save draft" and the "Remove it for me" auto-fix button omitted (no
  such behaviour); dashboard "views" omitted (no field), showing the seller's
  take (price_naira) as "You get". The design's semantic error red (#C0392B) is
  used only for validation and rejected states; coral stays the action accent.
- Verified live: become-a-seller matches the design; setup renders and the
  display-name validation fires with the new styling; contact-leak and price
  logic confirmed. Create listing and dashboard are build + code verified; the DB
  dependencies that gate them are now resolved (see below), but the full seller
  flow has not yet been walked end to end by a human. Browse, listing detail,
  admin and storefront unchanged.

### Earlier this branch line — sell side (seller onboarding + listing creation)
- Self-serve model: any logged-in BundledMum customer can become a seller and
  immediately create listings. Seller row is created with status='active',
  verification_tier='basic', no approval gate. Every listing still goes to admin
  review (status='pending_review') before it can go live, that is the safety net.
- Four screens under `/marketplace/sell*` in `MarketplaceApp.tsx`, all new files
  in `src/marketplace/sell/`:
  - `/sell` BecomeSellerPage (public value screen, honest payment explanation);
    logged-out CTA routes through the storefront login with returnTo, existing
    sellers are sent to the dashboard.
  - `/sell/setup` SellerSetupPage (creates the seller row; display_name + phone +
    bank details).
  - `/sell/new` CreateListingPage (photos, title, allowed category, location,
    condition picker + notes, description, price with live buyer-price preview).
  - `/sell/dashboard` SellerDashboardPage (listings grouped by status with
    rejection_reason, empty orders state, masked payout details, edit profile).
- Auth: uses the existing `useCustomerAuth` (shared customer session). A new
  `useSeller` hook resolves the customer (by auth_user_id) and their seller row
  (by customer_id).
- Storage: listing photos upload to a dedicated public bucket
  **`marketplace-listings`**; first photo becomes `image_url`, the rest
  `gallery_urls`; public URLs are stored. `final_price_naira` (and
  `markup_percent`) are left to the DB trigger, never written client-side.
- Anti-leakage controls: display_name rejects digits, @ and URLs (it is public);
  description + condition_notes are blocked on submit if they contain a phone
  pattern (7+ digits), +234, or whatsapp / call me / dm me. Mirrors the admin
  review check.
- Sensitive data (bank, phone) is only ever rendered in the seller's own
  dashboard (bank masked to last 4) and to admin, never anywhere public.
- No storefront, admin, browse or listing-detail changes. No migrations.
- Verified live: `/sell` value screen renders, `/sell/setup` renders and the
  display-name validation fires on a name with digits; leak detector and buyer
  price preview (asking x (1 + markup/100), e.g. 45,000 -> 49,500 at 10%) confirmed.
  `/sell/new` and `/sell/dashboard` are build + code verified. The DB
  dependencies that once gated them are now resolved (see the resolved note
  below); a human end-to-end walkthrough is still outstanding.

### ✅ DB state for the sell side, RESOLVED and verified live in Supabase
The items once described here as "blocking" the sell side are DONE. The sell side
is NOT DB-blocked. (See §4 for why that stale claim persisted across sessions.)

1. **`marketplace_sellers` INSERT policy exists** ("Customer creates own seller
   row"): a logged-in customer can create their OWN seller row, constrained to a
   safe initial state (status active, verification_tier basic, strike_count 0,
   outstanding_debit_naira 0, bank_account_verified false). Alongside "Seller
   reads own row" (SELECT), "Seller updates own row" (UPDATE) and "Admin manage
   sellers" (ALL).
2. **`marketplace-listings` public bucket exists**, with these storage.objects
   policies: "Authenticated upload own listing photos" (INSERT, scoped so a user
   can only write into a folder named after their own auth uid), "Authenticated
   update own listing photos" (UPDATE) and "Authenticated delete own listing
   photos" (DELETE) with the same per-user-folder scoping, and "Public read
   listing photos" (SELECT) so photos are publicly viewable, which browse needs.
3. **Seller protected-fields trigger** (BEFORE UPDATE on `marketplace_sellers`):
   a seller cannot change their own `verification_tier`, `status`,
   `strike_count`, `outstanding_debit_naira` or `bank_account_verified`; admins
   bypass it. So a seller cannot grant themselves a verified badge or clear their
   own strikes or debt.
4. **Location tables** `marketplace_states` and `marketplace_areas`, admin
   controlled, public read of allowed rows. Lagos is open with 164 areas, FCT is
   open with 33; the other 35 states exist but are disabled.
5. **Sold-listing lifecycle**: a `sold_at` timestamp set by trigger, plus three
   scheduled jobs, `purge-sold-listing-images` (30 days after sale, deletes the
   photos), `compress-old-sold-listings` (90 days, strips description and
   condition_notes while keeping title, prices, category and sold_at forever),
   and `purge-orphaned-listing-photos` (sweeps unreferenced uploads after 48
   hours).
6. **Marketplace settings** live in `site_settings` under `marketplace_*` keys.

The sell side is therefore fully DB-backed. What remains is a human end-to-end
walkthrough, still outstanding (see Next steps).

### Earlier this branch line — minimum operator admin (context switcher, review queue, settings)
- **Context switcher** added to the admin sidebar (`AdminLayout.tsx`): two tabs,
  BundledMum and Marketplace, shown ONLY to admins where
  `can("marketplace","manage")` is true (admin + super_admin bypass; other roles
  resolve false, so they never see it). The active world is derived from the path
  (`/admin/marketplace*` = marketplace) and swaps the ENTIRE left nav. The
  storefront nav render is untouched, just wrapped in a `world === "bundledmum"`
  guard, so the storefront admin is byte-identical for everyone.
- **Marketplace nav** (green rail, coral accents), in order: Dashboard, Payout
  queue, Review queue, Disputes, Sellers, Listings, Orders, Money owed, Settings.
  Review queue carries a live coral count badge of `status='pending_review'`
  listings. Only Review queue and Settings are functional this phase; the rest
  render a `MarketplaceComingSoon` placeholder in the same shell (visible, not
  hidden).
- **Review queue** (`/admin/marketplace/review`): lists pending_review listings
  one at a time with "N of M" progress; shows photo + gallery, title, category,
  location, condition notes, description, seller display_name (from the
  `marketplace_sellers_public` view, safe), and BOTH prices (Seller asking =
  price_naira, admin facing only; Buyer sees with X% markup = final_price_naira,
  X read from `marketplace_markup_percent`). Approve sets status='live', Reject
  requires a written reason and sets status='rejected'; both record `reviewed_by`
  (admin_users.id) and `reviewed_at`.
- **Contact leak warning (anti-leakage control):** the review queue scans
  description + condition_notes and shows a coral warning when a phone-number
  pattern (7+ digits with separators), a +234 prefix, or the words whatsapp /
  call me / dm me appear, so sellers cannot route buyers off platform. Verified
  it fires on phone/WhatsApp/+234 and not on clean text or short prices.
- **Settings** (`/admin/marketplace/settings`): reads and writes the
  `marketplace_*` keys in `public.site_settings` (markup percent, service fee,
  dispute window, payout digest email, and the checkout bank name / account name
  / account number), each edited and saved behind a confirm step because they
  affect live buyers and sellers. Category management lists
  `marketplace_categories`, adds a category, and toggles `is_allowed` (also
  behind confirm); disabled categories render greyed with a "disabled" label
  (the seeded Car seats category shows disabled). Disabling removes a category
  from the customer marketplace, this is how banned categories are kept out.
- All marketplace admin routes are gated by
  `<PermissionGate module="marketplace" action="manage">`. Reads/writes go
  through the authenticated client (admin RLS policies already exist). Only
  seller display_name is surfaced, no sensitive seller field.
- **Note on permissions:** there is no `admin_permission_definitions` row for
  module `marketplace`, but gating is correct anyway: admin + super_admin bypass
  the permission map (see `useAdminPermissionsContext` and `usePagePermission`)
  and all other roles resolve `marketplace/manage` to false. Not adding a DB row
  (no migrations this phase).
- Files: new `src/pages/admin/marketplace/{MarketplaceReview,MarketplaceSettings,
  MarketplaceComingSoon}.tsx` + `data.ts`; edited `AdminLayout.tsx` (switcher +
  nav + badge) and `StorefrontApp.tsx` (routes). Storefront admin unchanged.

### Earlier this branch line — seller identity from the public-safe view
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
1. **Checkout, finish the loop.** The bank-transfer checkout and awaiting-payment
   UI are built (see §5). To make it work end to end: (a) deploy the
   `create-marketplace-order` edge function detailed in §5, and (b) fill the bank
   detail settings in admin settings (`marketplace_bank_name`,
   `marketplace_bank_account_name`, `marketplace_bank_account_number`), which are
   currently blank so checkout shows the "not set up yet" state. Still to build
   after that: admin marks payment received, order tracking, and confirm-or-
   dispute (design T3/T4).
2. **THE SELLER FLOW HAS NOT YET BEEN WALKED THROUGH END TO END BY A HUMAN.**
   The UI is built and the DB dependencies are all resolved (INSERT policy,
   storage bucket + policies, protected-fields trigger, see §5). But nobody has
   completed the full path live: complete seller setup, create a real listing
   with photos, approve it in the admin review queue, and confirm it appears on
   browse. That verification is outstanding and should happen before further
   phases. Do not report these screens as "done" until it has.
3. **Admin, remaining surfaces.** Built this phase: context switcher, review
   queue, settings (with category management). Still placeholders, to build next:
   marketplace dashboard (held funds and the daily counts), payout queue,
   disputes arbitration, sellers management, listings management, marketplace
   orders, money owed out. The approved design for all of these is in the admin
   design mockup.
5. **Pricing presentation, not rounded (open).** `final_price_naira` is the raw
   markup result, so buyers see awkward figures like ₦17,600, unlike the main
   catalogue which rounds to clean values like ₦25. Decide a presentation
   rounding rule for the buyer price.
6. **Admin negative/error states predate the error red #C0392B (open).** Some
   admin negative or error states were built before #C0392B was adopted, so they
   may be visually inconsistent with the newer error-red styling. Worth a sweep.
7. Confirm on live that `bundledmum.com/marketplace` serves the grid and the
   storefront is unaffected, once this branch is merged + deployed.
7. **Auth tidy (optional, later):** if desired, revert to `localStorage` default
   in a dedicated pass — but expect a one-time logout of cookie-session users, so
   only do it deliberately (e.g. alongside comms), not as a drive-by cleanup.
   Also refresh the now-stale "cross-subdomain" comments in `authStorage.ts`.
8. Watch the `client.ts` regeneration risk above after any Lovable-side change.
