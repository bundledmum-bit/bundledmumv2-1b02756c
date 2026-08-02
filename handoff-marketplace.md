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

### This pass — ADMIN marketplace operations (payouts, disputes, sellers, listings, orders, money owed, dashboard)
Completes the operator side so the transaction can close: money can be released to
sellers and disputes resolved. Money moves MANUALLY (a person sends the bank
transfer, then records it here); nothing in this UI moves money by itself. All
seven screens replace the `MarketplaceComingSoon` placeholders and sit behind
`PermissionGate module="marketplace" action="manage"` (super_admin + admin only).
Built to design 9a ("Admin: marketplace operations") and 10a ("Admin money states
and friction").
- **New files** under `src/pages/admin/marketplace/`: `opsData.ts` (types, RPC
  wrappers, `STRIKE_THRESHOLD = 3`, `orderMoneyState`), `opsUi.tsx` (StatusPill,
  CopyField, ConfirmDialog, OpsHeader/Empty/Card), and one page each:
  `MarketplaceDashboard`, `MarketplacePayouts`, `MarketplaceDisputes`,
  `MarketplaceSellers`, `MarketplaceListings`, `MarketplaceOrders`,
  `MarketplaceMoneyOwed`. Routes wired in `StorefrontApp.tsx`; `MarketplaceComingSoon`
  removed. Reuses `adb`/`formatNaira` from `./data`.
- **Payout queue view** `public.marketplace_payout_queue` (security_invoker, admin
  readable): order_id, order_reference, seller_share_naira, settlement_status,
  payout_released_at, payout_failed_reason, dispatch_confirmed_at, buyer_confirmed_at,
  order_status, listing_title, seller_id, seller_name, bank_name, bank_account_name,
  bank_account_number, outstanding_debit_naira, eligible_via ('buyer_confirmed' |
  'timeout_sweep'), is_eligible. Eligibility (paid, not settled, not disputed, buyer
  confirmed or window elapsed) is encoded in the view; the client filters on
  `is_eligible` and never reimplements it.
- **The four admin RPCs (deployed, boolean, raise 'Not permitted' for non-admins):**
  1. `admin_mark_payout_released({ p_order_id, p_note })` → settlement_status 'settled'.
  2. `admin_mark_payout_failed({ p_order_id, p_reason })` (reason required) →
     settlement_status 'payout_failed'; the row shows red and never reads as pending.
  3. `admin_resolve_dispute({ p_dispute_id, p_outcome, p_notes, p_return_required,
     p_return_shipping_payer })` — p_outcome ∈ 'rejected' | 'full_refund' |
     'courier_fault'; p_notes >= 5 chars.
  4. `admin_mark_refund_paid({ p_order_id })` — records a refund actually transferred.
- **The three dispute outcomes and consequences (shown before commit):**
  - `rejected` → claim not upheld, order completed, settlement unblocked, seller
    paid, NO strike.
  - `full_refund` → seller at fault, order refunded, payout blocked, seller gets a
    STRIKE.
  - `courier_fault` → nobody at fault, order refunded, payout blocked, NO strike.
- **Held funds** (dashboard hero, and the reconciliation on money-owed) = Σ
  amount_naira for orders `payment_status='paid'` AND `settlement_status != 'settled'`
  (settlement_status is NOT NULL, default 'unsettled', so the filter is exact). It is
  buyer money, never labelled with a seller figure. **Refunds pending** = orders
  `order_status='refunded'` AND `settlement_status != 'settled'`. **Money owed out**
  = payouts pending (Σ seller_share of eligible unsettled rows) + refunds pending;
  reconciles against held funds with a buffer line.
- **Order money-state pill** (`orderMoneyState`): disputed → Disputed; refunded →
  Refunded; settled → Payout released; payout_failed → Payout failed; paid → Funds
  held; else Awaiting payment.
- **Sellers**: strike threshold is 3 (no site_settings key exists); strike_count >= 2
  shows the red risk stripe + negative pill. Suspend/reinstate/mark-verified are
  direct `marketplace_sellers` updates under the "Admin manage" RLS, each behind a
  confirm. NOTE: suspend sets status only; it does not itself pull the seller's live
  listings, so the confirm asks the operator to review and delist them from Listings.
- **Assumptions / notes:** buyer refund bank details are not stored (customers has no
  bank columns), so the money-owed refund row shows buyer + amount + order, not a
  buyer account. Admin reads `customers` (buyer names) via
  `has_admin_permission('orders','view')`; a marketplace-only operator without it
  degrades to "Buyer" gracefully. Every irreversible action (release, refund paid,
  suspend, delist, dispute ruling) sits behind a ConfirmDialog restating amount,
  recipient and destination account.
- Verified: build passes; the admin app mounts with all seven screens and no console
  errors; `/admin/marketplace` redirects unauthenticated users to `/admin/login`
  (gate works). The authed screens could not be live-rendered here (admin is
  password-gated), so they were verified by build + parity with the working Review
  screen + code review; with zero paid orders every screen shows its empty state.

### Earlier this branch line — checkout collects buyer NAME + PHONE + email (seller needs to reach the buyer)
Guest checkout previously collected only an email, so the seller order screens
(get_marketplace_seller_order_contact) got an empty buyer_name/buyer_phone and the
seller could not arrange delivery. In this marketplace the two parties coordinate
delivery directly, so name and phone are REQUIRED, not optional.
- **create-marketplace-order is now v4** (already deployed, not built here):
  INPUT `{ listing_id, email, full_name, phone }`.
  - GUEST: all four required. Errors: 'A valid email address is required',
    'Please give your name so the seller knows who to send to', 'A valid Nigerian
    phone number is required so the seller can reach you', plus the existing 'This
    item is no longer available' and 'You cannot buy your own listing'.
  - LOGGED IN: email comes from the account (sent email ignored); full_name and
    phone are optional and only FILL GAPS in the customer record, never overwrite.
  - Phone is normalised SERVER SIDE (08031234567, 2348031234567, +234... all work),
    so the client sends the raw typed value. Verified: typing 08031234567 stored
    2348031234567 on the customer row.
- **Checkout (`checkout/CheckoutPage.tsx`):**
  - Guest sees three fields (name, phone, email) with the honest framing that the
    seller arranges delivery directly so needs name + number, and the receipt/order
    link go to the email. Not an account, no password.
  - Logged-in buyers: a profile query reads their own `customers` row
    (`full_name, phone` where `auth_user_id = auth.uid()`). Complete profile →
    silent checkout, order created on load as before. Missing name and/or phone →
    only the missing field(s) are asked for. The order is NOT created for a
    logged-in buyer until this profile query has loaded, so an incomplete profile
    is never skipped.
  - Client validation before calling: name >= 2 chars; Nigerian phone
    `/^(0\d{10}|234\d{10}|\d{10})$/` on the digits; standard email. Friendly inline
    errors per field; server error strings mapped to human copy via
    `friendlyCreateError`. Mobile keypads: phone `type="tel" inputMode="tel"`,
    email `type="email" inputMode="email"`, name `type="text"`.
  - Ownerless-order guard preserved: order query `enabled` only when
    `isLoggedIn ? (profileLoaded && (!needAnyDetail || committed)) : committed`.
    Verified: no create-marketplace-order call fires before valid details are
    committed, and invalid input shows inline errors without creating an order.
  - Everything else unchanged: 4-line breakdown, Pay button, Paystack redirect,
    held-funds box, listing-gone / payments-down / own-listing states, reduced
    header, guest paid screen + resend, seller contact still hidden until sign-in.
- Files: edited `checkout/CheckoutPage.tsx` and `checkout/orders.ts`
  (createMarketplaceOrder now takes optional full_name + phone).

### Earlier this branch line — GUEST CHECKOUT (nothing blocks a purchase; sign-in moves to AFTER payment)
Supersedes the "login before Buy now" model. A logged-out buyer now pays as a
guest with just an email, and signs in afterwards only to see the seller's contact
and manage the order. The login gate is removed from checkout.
- **Backend already deployed (not built here), verify_jwt now FALSE on the three
  checkout functions:**
  1. `create-marketplace-order` — INPUT `{ listing_id, email }` (email required for
     guests, ignored when a session exists) → `{ order, email, reused? }`. Finds or
     creates a customer from the email. Errors: 'A valid email address is required'
     400, 'This item is no longer available' 409, 'You cannot buy your own listing'
     400.
  2. `marketplace-initialize-payment` — INPUT `{ order_id, callback_url }`; email
     comes from the order's customer, never the body.
  3. `marketplace-verify-payment` — INPUT `{ reference }`; on success it ALSO sends
     the buyer's confirmation email SERVER SIDE. The frontend sends no email.
  4. `send-marketplace-order-confirmation` — `{ order_id, force? }`. Idempotent per
     order (a refresh does not resend). The email carries a one-time sign-in link
     that authenticates the buyer and lands on `/marketplace/orders/{order_id}`.
     Called from the frontend ONLY for the "resend" action, with `force: true`.
  5. `get_marketplace_order_contact` — UNCHANGED, still needs a session, so a guest
     cannot see the seller's phone until signed in (by design).
- **Checkout (`checkout/CheckoutPage.tsx`):** login gate removed. A logged-in buyer
  is used silently (no email field). A guest sees one email field (format-validated,
  "for your receipt and order link") and a "Continue to payment" action; the order
  is created only after a valid email is committed (`enabled: isLoggedIn ||
  !!committedEmail`), so a logged-out page view never mints an ownerless order.
  Verified live: guest reaches checkout with no redirect, no create call fires
  before the email, and after Continue the order is created and the Pay button
  appears. The 4-line breakdown, held box, Pay redirect and transfer fallback are
  unchanged. Added a friendly "This is your own listing" state.
- **Data helpers (`checkout/orders.ts`):** `createMarketplaceOrder({ listingId,
  email? })` now sends the email when present; added `resendOrderConfirmation(orderId)`
  (invokes send-marketplace-order-confirmation with `force: true`).
- **Payment return (`checkout/PaymentReturnPage.tsx`):** the paid state branches on
  `useCustomerAuth`. Logged in → the seller-contact block as before. Guest → NO
  seller details; instead the order reference as proof, a "check your email"
  explanation (one-time link that opens the order and signs them in, works once and
  expires, and they can sign in later with the same email), and a rate-limited
  Resend (disabled 60s after a send) calling `resendOrderConfirmation`. No email is
  sent from the frontend; verification already sent it.
- **Marketplace login (`auth/MarketplaceLoginPage.tsx`):** default post-login
  destination is now `/orders` (the marketplace orders list), never the storefront.
  emailRedirectTo is unchanged: `https://bundledmum.com/marketplace/login?returnTo=
  <url-encoded destination>` (default `/orders`).
- **⚠️ SUPABASE ALLOW-LIST (unchanged requirement, still needed):**
  `https://bundledmum.com/marketplace/**` must be in Auth → URL Configuration →
  Redirect URLs. It covers both the login redirect and the server confirmation
  email's `/marketplace/orders/{id}` sign-in link. Without it Supabase falls back to
  the Site URL (the 404).
- **Transfer fallback (`AwaitingPaymentPage`) still needs a session** (it reads the
  order via the "Buyer reads own orders" RLS policy), so its login gate is kept.
  Guest checkout is the Paystack path (checkout → Paystack → payment return); the
  bank-transfer fallback remains sign-in-bound, which is acceptable as it is off by
  default.
- Files: edited `checkout/CheckoutPage.tsx`, `checkout/orders.ts`,
  `checkout/PaymentReturnPage.tsx`, `auth/MarketplaceLoginPage.tsx`.

### Earlier this branch line — MARKETPLACE login (magic link, in-marketplace), fixes the stranded-buyer bug
A logged-out marketplace visitor was handed to the STOREFRONT login
(/account/login), whose magic link landed on the storefront /account (a 404), so
they never got back to the item they were buying. Now the marketplace has its own
passwordless login inside /marketplace and the round trip returns them where they
left off.
- **New route `/marketplace/login`** (`src/marketplace/auth/MarketplaceLoginPage.tsx`),
  rendered inside the `.mkt` shell with the marketplace header. Passwordless magic
  link ONLY, using the SAME shared Supabase client and `useCustomerAuth` (no second
  client, no password, no signup, no reset). Idle / sent / error states; an
  already-logged-in visitor (or one whose magic link just established the session)
  is auto-forwarded, never shown the form. Footer is suppressed on /login.
- **emailRedirectTo (the thing that broke):**
  `https://bundledmum.com/marketplace/login?returnTo=<url-encoded marketplace-relative path>`.
  The base is hardcoded (never window.location.origin, per the storefront's
  Lovable-preview note). The link lands back on the marketplace login; the shared
  client's detectSessionInUrl establishes the session and the page forwards to
  returnTo (default `/` browse, never the storefront). returnTo is sanitised to a
  single-leading-slash path (no `//` or absolute URLs) to prevent open redirects.
- **returnTo is marketplace-RELATIVE** (no /marketplace prefix) because the login
  forwards with react-router `navigate()` under basename="/marketplace"; a full
  `/marketplace/...` path would double-prefix.
- **⚠️ SUPABASE ALLOW-LIST REQUIREMENT (cannot be set from the repo):** the pattern
  **`https://bundledmum.com/marketplace/**`** MUST be added to Supabase Auth → URL
  Configuration → Redirect URLs. Without it Supabase silently falls back to the
  Site URL and the bug persists. Keep the existing storefront entries too.
- **Every marketplace auth gate repointed** at the new login via one helper,
  `src/marketplace/auth/marketplaceLogin.ts` (`sendToMarketplaceLogin(returnToRel)`,
  full-page nav to `/marketplace/login?returnTo=...`, same mechanism the gates used
  before). Gates: CheckoutPage (x2), AwaitingPaymentPage, BuyerOrdersListPage,
  BuyerOrderDetailPage, BuyerDisputePage, BecomeSellerPage, SellerSetupPage,
  CreateListingPage, SellerDashboardPage, SellerPayoutsPage, SellerOrderDetailPage,
  SellerDispatchPage, and the shared header "Log in" (now a react-router `Link` to
  `/login`, desktop nav + mobile menu). No `/account/login` reference remains in the
  marketplace tree.
- **Untouched:** the storefront login (`src/pages/AccountLoginPage.tsx`) and its
  flow, the shared Supabase cookie session, and browse + listing detail staying
  public (verified: logged-out listing detail still shows the Buy now bar and does
  not redirect).
- Files: new `auth/MarketplaceLoginPage.tsx`, `auth/marketplaceLogin.ts`; edited
  `MarketplaceApp.tsx` (route), `MarketplaceHeader.tsx` (Log in link),
  `MarketplaceFooter.tsx` (suppress on /login), and the 12 gate files above.

### Earlier this branch line — BUYER ORDER screens (my orders, detail, confirm receipt, dispute)
Closes the loop after payment (design T3/T3b tracking, T4 confirm-or-dispute, T4b
dispute form, T4c confirmed). A buyer can now find their orders, talk to the
seller, confirm receipt (which releases the payout) or report a problem (which
pauses it). No admin arbitration or payout-queue screen yet (non-goals).
- **THE MONEY RULE (enforced):** the buyer sees ONLY what THEY paid, `amount_naira`
  and its breakdown (`item_price_naira`, `service_fee_naira`, `paystack_fee_naira`).
  `BUYER_ORDER_SELECT` in `checkout/buyerOrders.ts` never selects
  `seller_share_naira`, `platform_share_naira` or the listing's `price_naira`, even
  though the "Buyer reads own orders" RLS policy would allow the order columns.
  Held-money copy never states an amount tied to the seller.
- **Backend already deployed (not built here), four contracts:**
  1. Buyers SELECT their own orders via the "Buyer reads own orders" RLS policy
     (safe columns only).
  2. RPC `get_marketplace_order_contact({ p_order_id })` → at most one row
     `{ order_id, listing_title, amount_naira, seller_display_name, seller_phone }`,
     only when the caller is the buyer AND payment_status 'paid'. Only source of the
     seller phone; `seller_phone` may be null (handled). Reused from `checkout/orders.ts`.
  3. RPC `confirm_marketplace_order_receipt({ p_order_id })` → boolean. True on
     success; false means not confirmable / not this buyer's (surfaced honestly,
     never faked). Sets order_status 'completed', buyer_confirmation_status
     'confirmed', buyer_confirmed_at, funds_release_trigger 'buyer_confirmed'.
  4. RPC `raise_marketplace_dispute({ p_order_id, p_reason, p_evidence })` →
     dispute uuid. p_reason must be >= 10 chars (validated client-side first for a
     friendly message); p_evidence is a jsonb array of photo URLs or null. Raises
     on an un-disputable / already-open order; those are mapped to human copy, not
     raw errors. Sets order_status 'disputed', settlement_status 'blocked_dispute'.
- **The clock:** the confirm-by window is read from `site_settings`
  `marketplace_dispute_window_days` (currently 3), NEVER hardcoded
  (`getDisputeWindowDays`, falls back to 3 only if unreadable). The deadline is
  measured from `marketplace_orders.dispatch_confirmed_at` and shown as days-left
  plus the date, with the honest statement that doing nothing releases the payout.
- **Dispute evidence storage:** photos upload to the `marketplace-listings` bucket
  under a folder named after the buyer's AUTH UID (`${user.id}/dispute-...`),
  exactly like listing and dispatch photos, then their public URLs go into
  p_evidence. Reuses `compressImage` and the camera-or-gallery input.
  **ACTION NEEDED (backend, not done here):** the orphan-cleanup job only preserves
  files referenced by listings and dispatch photos, so it would delete dispute
  evidence. Dispute evidence URLs must be added to that job's preserve set.
- **My orders list (`/orders`):** grouped Needs your action (awaiting_confirmation,
  dominant, coral) / Being looked into (disputed) / On the way (awaiting_dispatch) /
  Complete (completed). Each row: item photo + title, "Paid ₦X", reference, status
  pill; links to detail. Encouraging empty state with a Browse CTA.
- **Order detail (`/orders/:orderId`):** item, reference, what they paid (breakdown),
  a paid → dispatched → confirmed timeline, seller contact from the RPC (WhatsApp
  with a pre-filled item+ref message and a Call button, Nigerian→international
  formatting via the existing helpers, BundledMum fallback when phone is null,
  never a dead button), the seller's dispatch photo once sent, the deadline
  countdown + auto-release honesty when awaiting confirmation, held-money
  reassurance, and the completed / disputed states. Confirm receipt sits behind a
  confirm sheet (states the consequence, false handled honestly).
- **Report a problem (`/orders/:orderId/problem`):** category chips + free-text
  reason (combined into p_reason, >= 10 chars validated client-side) + up to 5
  compressed evidence photos; honest expectations (a person reviews it, the payout
  is paused, reply within one working day); guards non-awaiting_confirmation orders.
- **My orders menu link is now LIVE:** the shared header (desktop nav + mobile menu)
  shows "My orders" → /orders when logged in (previously omitted because the route
  did not exist). "How BundledMum works" stays omitted (still no such page).
- **Footer suppressed on the confirm/dispute screens:** `MarketplaceFooter` now also
  returns null on `/orders/:id` and `/orders/:id/problem` (they end in the primary
  action), matching the design's footer rule; the `/orders` LIST keeps the footer.
- Files: new `checkout/buyerOrders.ts`, `checkout/BuyerOrdersListPage.tsx`,
  `checkout/BuyerOrderDetailPage.tsx`, `checkout/BuyerDisputePage.tsx`; edited
  `MarketplaceApp.tsx` (3 routes), `MarketplaceHeader.tsx` (My orders link),
  `MarketplaceFooter.tsx` (suppression). No new CSS (reused existing classes).
- Reported design mismatch: T3 shows "she has until Thursday to dispatch" but there
  is no seller-dispatch-deadline field, so that line is softened to "Waiting on
  {seller} to send it" with no fabricated date.

### Earlier this branch line — one shared marketplace footer on every screen (design 7a)
Mirrors how the header was done: ONE `MarketplaceFooter` component rendered ONCE
in `MarketplaceApp`, inside the `.mkt` div, immediately after `<Routes>`, so every
marketplace route gets it with no per-page duplication.
- **Green-dark (`#1A4A33`) footer**, mobile stacks / desktop opens into columns at
  the header's `720px` breakpoint. Carries the trust promise, not marketing. Brand
  lockup ("B" mark + "BundledMum Marketplace"), tagline, a "Chat to us on
  WhatsApp" button (reuses `.mkt-wa`, `WHATSAPP_BASE`, never a hardcoded number),
  the held-payment promise line (word for word), and the ©/Paystack legal line.
- **Links implemented (all destinations verified to exist):** Browse (`/`), Start
  selling (`/sell`), Seller dashboard (`/sell/dashboard`, shown only when `seller`,
  mirroring the header), and Back to bundledmum.com (`<a href="/">`, a FULL
  navigation to the origin root / storefront, not a client route).
- **Links OMITTED because their destinations do not exist** (reported, not shipped
  as dead nav, no placeholder pages created): "How buying works", "What sells
  fastest", "Getting paid", "Help centre", "Refunds and disputes", "Terms",
  "Privacy"; the category shortcuts "Prams and strollers" / "Cots and furniture" /
  "Maternity wear" (browse category filters are in-page state, not routable URLs);
  and the mobile secondary links row (help/terms/privacy/refunds).
- **Bottom tab bar NOT built.** The mobile mock shows a white Browse/Orders/Sell/
  Account tab bar under the footer. That is a separate bottom-nav element the app
  does not have (nav is the hamburger header), and "Orders" would be a dead buyer
  route, so building it is out of scope. The footer simply ends the page.
- **Suppressed where a fixed action bar owns the bottom of the screen** (design's
  own rule + the reduced-header rationale): all `/checkout*` routes and the
  dispatch-upload route (`/sell/orders/:id/dispatch`). The footer returns `null`
  there so a scrolling footer never fights the primary button and a buyer
  mid-payment is not lured away. Kept on `/sell/new` (its submit bar is in-flow,
  and the design does not list create-listing among the suppressed screens).
- **Listing detail clearance:** `/listing/:id` carries a `position:fixed`
  `.mkt-buybar` at every breakpoint, so the footer gets a `clear-bar` modifier
  (extra `padding-bottom`) so the fixed Buy now bar never obscures the copyright
  line. Verified: on mobile the legal line sits above the bar, not behind it.
- **Never on admin:** admin lives in `StorefrontApp` (a separate tree), so it never
  receives this footer, and the storefront's own footer is untouched.
- Files: new `src/marketplace/MarketplaceFooter.tsx`; edited `MarketplaceApp.tsx`
  (render it once) and `marketplace.css` (footer classes, all scoped under `.mkt`).
- Verified live (mobile + desktop): footer renders on browse, listing detail
  (clears the Buy now bar), seller order detail, and the sell screens; suppressed
  on checkout and dispatch; desktop shows the column layout; no link points at a
  missing route. Storefront and admin were NOT touched.

### Earlier this branch line — one shared marketplace header on every screen
Design section 5a. Added a single `MarketplaceHeader` component rendered ONCE in
`MarketplaceApp` inside the router, above `<Routes>`, so every marketplace route
gets it with no per-page duplication.
- **Green strip, logo lockup** (white BundledMum logo + small uppercase
  "Marketplace" label). Mobile: hamburger opens a full-screen green menu; desktop
  (>=720px): links inline. Auth-aware via `useCustomerAuth`, seller-aware via
  `useSeller`. Static (not sticky) so it never fights browse's sticky topbar.
- **Links implemented:** Browse (/), Sell an item (/sell), Seller dashboard
  (/sell/dashboard, shown only to sellers), Back to bundledmum.com (storefront /,
  full navigation), Help on WhatsApp (WHATSAPP_BASE), and account (logged in:
  email + Sign out via supabase.auth.signOut; logged out: Log in ->
  /account/login?returnTo=/marketplace).
- **Links OMITTED because their routes do not exist** (reported, not shipped as
  dead nav): "My orders" (no orders route) and "How BundledMum works" (no such
  page). No placeholder pages were created.
- **Search stays on the browse screen**, not lifted into the shared header. The
  design shows search in the desktop header, but a sitewide header driving
  browse's search state would couple the header to one screen; kept decoupled.
- **Checkout and payment return get a REDUCED header:** logo only, no hamburger,
  no nav links, logo not a link, so a buyer mid-payment cannot casually navigate
  away. Variant chosen by `pathname.startsWith("/checkout")`. The header never
  touches routing or the payment `?reference`, verified.
- **Only per-page edit:** removed BrowsePage's now-duplicate brand line (chrome
  only; search, filters, count, data untouched). All other screens get the header
  for free and keep their own content and sub-chrome.
- Files: new `src/marketplace/MarketplaceHeader.tsx`; edited `MarketplaceApp.tsx`
  (render it), `pages/BrowsePage.tsx` (brand line), `marketplace.css`.
- Verified live: header on browse (full + working menu), listing detail (Buy now
  preserved), checkout (reduced, fresh-order breakdown + Pay button work),
  payment return (reduced, reference + failed state intact). Storefront and admin
  were NOT touched.

### This pass — SELLER ORDER screens (list, detail, dispatch-with-photo, payouts)
Design section 6a (O1–O5). The seller side of the order lifecycle: a seller sees
a paid order, contacts the buyer, ships it, uploads proof, and tracks what
BundledMum owes them. Buyer confirm/dispute and the admin payout queue are NOT in
scope (non-goals).

- **THE MONEY RULE (enforced):** a seller sees ONLY their own payout,
  `marketplace_orders.seller_share_naira`. The seller order queries NEVER select
  `item_price_naira`, `amount_naira`, `platform_share_naira`, `service_fee_naira`
  or `paystack_fee_naira`, even though the "Seller reads own orders" RLS policy
  would technically allow it. `SELLER_ORDER_SELECT` in `sell/sellerOrders.ts` is
  the single safe column list. Audit at build time: no seller-facing file renders
  any buyer-total column; the only place those columns appear is the buyer-facing
  checkout flow (AwaitingPaymentPage / PaymentReturnPage / CheckoutPage /
  checkout/orders.ts), where the buyer is looking at their own total — correct.
- **Backend already deployed (not built here), two contracts:**
  1. RPC `get_marketplace_seller_order_contact({ p_order_id })` → at most one row
     `{ order_id, listing_title, order_reference, seller_share_naira, buyer_name,
     buyer_phone }`, and ONLY when the caller is the seller on that order AND
     payment_status is 'paid'. `buyer_phone` may be null. This is the ONLY source
     of the buyer's contact details.
  2. RPC `mark_marketplace_order_dispatched({ p_order_id, p_dispatch_photo_url })`
     → boolean. Returns false (not an error) when the order is not this seller's
     or is not awaiting dispatch. Cannot change payment/settlement status. A false
     result is surfaced honestly to the seller; success is never faked.
- **Dispatch photo storage:** uploaded to the `marketplace-listings` bucket under
  a folder named after the seller's **auth uid** (`${user.id}/dispatch-...`). The
  bucket's upload policy is `foldername[1] = auth.uid()`, so the path MUST use the
  auth uid, NOT the `marketplace_sellers.id`.
- **Orders list (O1):** replaces the empty "Orders" tab on the seller dashboard.
  Grouped **Needs your action** (`awaiting_dispatch`, coral-outlined rows),
  **In progress** (`awaiting_confirmation`), **Complete** (`completed`). Each row:
  item photo + title, "You get ₦X" (seller_share only), status pill; links to the
  detail. A payout summary card (owed = sum of seller_share for needsAction +
  inProgress) sits on top and links to /sell/payouts. The encouraging empty state
  is kept for sellers with no orders. The tab count is now real.
- **Order detail (O2/O4):** item + order reference; a green payout box "You will
  receive ₦X" from seller_share_naira ONLY, with copy explaining BundledMum holds
  the buyer's payment and transfers after the buyer confirms; buyer contact box
  (WhatsApp with a pre-filled message + Call, via `sellerWhatsAppLink` /
  `sellerCallLink` from checkout/orders, Nigerian→international formatting) shown
  only for paid orders; if `buyer_phone` is null it degrades to a BundledMum
  WhatsApp fallback, never a dead button; a 3-step timeline reflecting current
  state; the dispatch photo once sent. "Mark as dispatched" CTA only when
  awaiting_dispatch.
- **Mark as dispatched (O3/O3b):** photo REQUIRED (framed as protection for the
  seller if the buyer later claims non-delivery), guidance (packed item + waybill
  in the shot), camera-or-gallery via a single `accept="image/*"` input, reuses
  `compressImage`, a confirm sheet, then upload-then-RPC. Guards non-
  awaiting_dispatch orders. On RPC false or upload failure it shows a clear error
  and does NOT navigate to success. (The design's optional waybill text field was
  omitted — there is no DB column to store it; reported.)
- **Payouts (O5):** what the seller is owed and which orders, grouped Waiting on a
  buyer / Waiting on you to send / Already paid; bank masked to last 4; an honest
  note that payouts are sent by hand, not automatically.
- **Latent bug fixed in passing:** `CreateListingPage` uploaded listing photos to
  `${seller.id}/...` (the marketplace_sellers row id), which violates the storage
  policy (`foldername[1] = auth.uid()`) and would fail RLS. Changed to
  `${user.id}/...` (auth uid) to match the policy and the new dispatch upload.
- Files: new `sell/sellerOrders.ts` (data + money-safe select + grouping),
  `sell/SellerOrderDetailPage.tsx`, `sell/SellerDispatchPage.tsx`,
  `sell/SellerPayoutsPage.tsx`; edited `sell/SellerDashboardPage.tsx` (Orders tab +
  payout card + real count), `sell/CreateListingPage.tsx` (upload path fix),
  `MarketplaceApp.tsx` (routes /sell/payouts, /sell/orders/:orderId,
  /sell/orders/:orderId/dispatch), `marketplace.css` (payout box/card, buyer box,
  dispatch drop/preview, group title).

### Earlier this branch line — payment moved to Paystack (bank transfer kept as a toggle)
Money-in is now a hosted Paystack payment; the money model is unchanged
(BundledMum holds the money, seller paid manually after the buyer confirms
delivery, refunds manual). Design section 4a (P1 checkout, P1b listing gone, P1c
payments unavailable, P2 verifying, P3 paid, P4 failed).
- **Backend already deployed (not built here), four contracts:**
  1. `create-marketplace-order` (verify_jwt) input `{ listing_id }` → `{ order }`
     or `{ order, reused: true }`. References use a **BMM-** prefix.
  2. `marketplace-initialize-payment` (verify_jwt) input `{ order_id,
     callback_url }` → `{ authorization_url, reference, amount_naira,
     paystack_fee_naira }`. Computes the Paystack fee server-side, updates the
     order, initialises the transaction. Errors: 'This is not your order' 403,
     'This order is already paid' 409, 'This item is no longer available' 409,
     'Payment is not configured' 500.
  3. `marketplace-verify-payment` (verify_jwt FALSE) input `{ reference }` →
     `{ status: 'paid'|'failed'|'abandoned'|'mismatch', order_id, already? }`.
     Idempotent; flips the order to paid + awaiting_dispatch and marks the
     listing sold.
  4. RPC `get_marketplace_order_contact({ p_order_id })` → at most one row
     `{ order_id, listing_title, amount_naira, seller_display_name, seller_phone
     }`, and ONLY when the caller is the buyer on that order AND payment_status
     is 'paid'. This is the ONLY source of the seller phone (not in
     marketplace_sellers_public by design).
- **Checkout (P1):** creates/reuses the order on load, then calls
  initialize-payment on load so the FOUR-line breakdown (item = final_price_naira,
  service ₦750 non-refundable, Paystack payment fee, total) comes straight from
  the server. One button "Pay ₦X" redirects to `authorization_url`; callback is
  `${origin}/marketplace/checkout/return`. Verified live: fee ₦854, total ₦51,104.
- **Transfer fallback gated:** the old bank-transfer UI (bank box, reference,
  "I have sent the transfer", confirm sheet, awaiting screen) is kept but only
  renders when `marketplace_payment_paystack_enabled` is false AND
  `marketplace_payment_transfer_enabled` is true (paystack takes priority). Both
  off → a "payments unavailable" state. Nothing was deleted.
- **Payment return (`/checkout/return`, new):** reads `?reference=`, calls
  verify-payment, shows verifying (P2), paid (P3) with the seller contact block,
  failed/abandoned/error (P4, error red #C0392B, no blame, retry returns to that
  order's checkout, WhatsApp offered, explicit that nothing was charged), and
  mismatch ("we are checking, will be in touch" + WhatsApp, never "failed").
  Idempotent `already` lands on paid.
- **Seller contact block (buyer only, after payment only):** name + WhatsApp
  (international number, pre-filled message naming the item and order) + Call
  (`tel:`). Nigerian numbers normalised (0803... → 234803..., already-234 kept).
  No phone or no row → seller name + a BundledMum WhatsApp fallback, never a dead
  button. One order is one seller (the design's multi-seller list and the on-site
  "Chat here" button were dropped: no cart, no on-site chat).
- **Seller phone policy changed:** seller setup now says the number is shared
  with the buyer after a sale to arrange delivery (was "never shown to buyers"),
  and phone stays required (it is load-bearing for the transaction).
- **Buyer never sees the seller's share:** price_naira and seller_share_naira
  appear nowhere in the buyer UI; the held-funds copy never states a held amount
  different from what the buyer paid.
- Files: `checkout/orders.ts` (initializePayment, verifyPayment, getOrderContact,
  phone helpers), `checkout/CheckoutPage.tsx` (rework + gating),
  `checkout/PaymentReturnPage.tsx` (new), `sell/SellerSetupPage.tsx` (copy),
  `MarketplaceApp.tsx` (route), `marketplace.css`. Browse, listing detail, sell
  flow, admin, storefront untouched.

### Earlier this branch line — payment reference moved SERVER SIDE + edge function wired live
The `create-marketplace-order` edge function is deployed, and the payment
reference is now generated by the SERVER, not the client. WHY: if the client
chose the reference, a buyer could submit a reference matching another buyer's
order, and the awaiting screen (which looks up an order by reference) would leak
that stranger's order. So the server generates, stores and returns it.
- **New edge function contract:** input `{ listing_id }` ONLY (any client
  reference is ignored). Output `{ order }` (order carries the reference in
  `paystack_transaction_reference`), or `{ order, reused: true }` when an existing
  pending order for this buyer and listing is returned instead of a duplicate.
  verify_jwt is on; `functions.invoke` forwards the session (confirmed live).
  Errors come back as `{ error }` with a non-200 status; known codes handled:
  "This item is no longer available" (409), "You cannot buy your own listing"
  (400), "No customer record found" (400), "Not authenticated" (401).
- `orders.ts`: removed the client reference generator and its sessionStorage
  entirely; `createMarketplaceOrder({ listingId })` sends only `{ listing_id }`,
  parses the `{ error }` body into a `CheckoutError` with the server code, and
  returns `{ order, reused? }`. The reference is read from
  `order.paystack_transaction_reference`.
- **Ordering problem, approach chosen: (a) create the order when checkout loads.**
  The reference only exists after creation, and the buyer must see the real one
  at the moment they transfer. So the order is created on load (once logged in
  and the bank is configured); the reference and bank details appear together;
  "I have sent the transfer" (confirm sheet) then navigates to awaiting. The
  edge function's reused behavior makes create-on-load idempotent, so a reload
  returns the same pending order and the same reference (this replaces the old
  sessionStorage stability). Verified live: same reference on reload, no duplicate.
- **reused** is treated as success (proceed to awaiting), not an error. Error
  codes are shown as friendly human messages; "no longer available" renders a
  friendly card with a route back to browse.
- **Bank details are now set** (Kuda Bank, BundledMum Limited, 3003758996), so the
  empty-bank fallback no longer triggers; it is left in place as defensive
  behaviour if the settings are ever cleared. Verified live: bank renders,
  reference shows, awaiting reads the order back.

### Earlier this branch line — buyer checkout + awaiting payment (manual bank transfer)
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
- **Payment reference** (SUPERSEDED this pass, see above): originally generated
  client-side and kept in sessionStorage. It is now generated server-side and
  read back from `paystack_transaction_reference`; the client generator was
  removed.
- **Awaiting (T2/T2b):** reads the order back from `marketplace_orders` by
  reference (buyers can SELECT their own), so it survives refresh and is
  reachable later. Shows amount, item, reference (copy), what-happens-next, and
  reassurance. If the order is still pending and older than 12h it shows the
  "waiting too long" variant with a WhatsApp receipt route. Cancel is a WhatsApp
  contact, not a client write (UPDATE is blocked).
- **Empty bank settings handled:** if the bank detail settings are blank checkout
  shows a clear "payment details are not set up yet" card with a WhatsApp route
  and hides the transfer step, instead of a broken screen. (Bank is now filled,
  see above, so this is defensive only.)
- **Order creation is isolated** in `checkout/orders.ts` →
  `createMarketplaceOrder()` calls the edge function `create-marketplace-order`
  via `supabase.functions.invoke`. `marketplace_orders` has no public INSERT or
  UPDATE (only admin + service role write), so this is deliberate and NOT worked
  around. (The function is now deployed, see above.)
- Preserved: browse, listing detail, the whole sell flow, and admin unchanged.

### ✅ RESOLVED: edge function `create-marketplace-order` is deployed
(This block was previously "outstanding". The function is live; see the current
contract in the "This pass" section above.) It authenticates the buyer, loads the
live listing, computes the money fields server-side (including
`seller_share_naira = listing.price_naira`, which the buyer must never see),
generates the reference, inserts with the service role, and returns `{ order }`
or `{ order, reused: true }`. Input is `{ listing_id }` only. The bank detail
settings are now filled, so checkout shows the transfer step.

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
1. **Checkout is live on Paystack** (checkout, hosted payment, payment-return
   states, seller contact reveal; bank transfer kept behind an admin toggle,
   currently off). Not yet verified with a real completed Paystack payment by a
   human, so the paid state + seller contact block are code-verified only, walk
   one real payment through. Still to build next: admin marks payout, order
   tracking (design T3), and confirm-or-dispute (T4).
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
