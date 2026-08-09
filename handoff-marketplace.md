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

## CURRENT STATE — read this first (accurate as of 2026-08-05)

Everything from §1 onward is a chronological build log spanning many
sessions. Large parts of it, especially §1 through §6, describe an early
state of the project that no longer matches the code: checkout was a
"coming soon" placeholder, admin had three screens, create-listing didn't
read category questions yet, and auth used cookie storage. All of that has
since changed and is superseded below. **Treat any specific technical
claim further down in this file — a file path, a query, a "not yet
built" — as needing a fresh check against the actual code before being
repeated, not as established fact.** §4 records the exact incident (a
stale "DB-blocked" claim, repeated across three sessions before being
caught) that made this rule necessary, and this pass found a second one
(§5, marked in place, also see §17/§18) — there may be others not yet
found.

### What's built and working
Full buyer flow: browse (search, category/location/price/condition
filters), listing detail (gallery, condition Q&A, ask-for-a-lower-price
negotiation), checkout (Paystack primary, bank transfer behind an
admin-off toggle), payment return, buyer orders list + detail (confirm
receipt, report a problem, return an item), and the four gone/404 states
(sold, removed, wrong URL, seller's own view).

Full seller flow: the sell pitch, seller setup, create/edit listing
(condition questions and category-specific questions, both fully
database-driven), seller dashboard, price edit, dispatch (proof-of-send
upload), payouts, responding to a price request.

Full admin marketplace: dashboard, payout queue, listing review queue,
disputes, returns, sellers, buyers, listings, orders, money owed,
category-question manager, settings.

Five policy pages (Terms, Privacy, Buyer protection, Seller protection,
Cookies), per-route browser tab titles across all of the above (§14), and
delivery-arrangement plus shipping-cost copy on both the buyer and seller
sides (§15, §16).

### Genuinely still open
- Admin's coral-dark confirm-dialog buttons (`MarketplaceReview.tsx`'s
  "Confirm rejection", four `MarketplaceSettings.tsx` confirm dialogs)
  measure roughly 3.59:1 contrast, short of AA — found and explicitly
  reported-not-fixed in §10.
- Meta description and Open Graph tags are one static value across every
  marketplace page — worse than the old title problem, since `og:url` on
  a marketplace page currently points at the storefront homepage. Found
  in §14, deliberately not fixed.
- Pricing isn't rounded: `final_price_naira` shows raw markup figures like
  ₦17,600, unlike the storefront catalogue's rounded prices. Open since
  §6, never addressed since.
- `useIdleTimeout.ts`, a second, unused idle-timeout implementation,
  confirmed dead code but not removed.
- `.mkt-wa`'s icon references a path that doesn't exist
  (`src/marketplace/assets/...`), so it silently never renders, across 7
  files — found in §13, not fixed (the newer gone/404 screens import the
  real asset correctly instead of repeating the broken path).
- Seller-facing copy on `SellerProtectionPage.tsx` and
  `SellerDispatchPage.tsx` still uses shipping-only language ("before you
  ship") — §16 fixed three other seller-facing spots but explicitly left
  these two as report-only.
- No `site_settings` key exists for minimum photo count or the strike
  threshold, so both stay hardcoded by necessity — a possible future
  configurability gap, not a bug.
- `marketplace_confirm_nudge_1_hours`/`_2_hours` exist in `site_settings`
  but aren't exposed anywhere in the admin Settings screen.
- A second, hand-rolled WhatsApp link builder in `orders.ts` duplicates
  `lib/whatsapp.ts` — reported in §9, not consolidated.
- A refunded order's dispute panel can briefly render blank before its
  own query resolves — low severity, reported in §9, not fixed.
- `enforce_required_category_fields` only checks category questions, not
  the six condition-question answers — noted in §5, not addressed.
- Whether admin's older error/negative states (built before `#C0392B` was
  adopted) are visually consistent with it — flagged as worth a sweep in
  §6, never followed up on either way since.

**Two claims that were handed into this pass as still-open, and are not**
— kept here because if a stale claim slipped through once, it can again:
- Primary button (coral+cream) contrast was fixed in §10 — black text on
  coral, 6.89:1, applied at the token level (`.mkt-buy`, `.mkt-primary`)
  plus six individual admin call sites. Confirmed still present in the
  live CSS this pass, not just recorded as done.
- Marketplace page titles were fixed in §14 — every route has a distinct,
  often dynamic title. Confirmed still present in the live code this
  pass.

### Deliberately unverified, and why
No buyer, seller, or admin login credentials exist in this environment.
Every screen behind a login — the entire seller flow, buyer orders, and
every admin screen — is built and passes `tsc`/`npm run build`, but has
been **code-reviewed, not watched rendering**, unless a specific section
says otherwise (a few sessions found an already-active browser session
mid-task and spot-checked live; those moments are called out explicitly
where they happen). Read "verified" anywhere in this file as "verified
against what could be reached that session," and check the section for
what that was, rather than assuming a screen has been seen live just
because it's described in detail.

Separately: **no order has ever been paid** (0 rows in
`marketplace_orders` with `payment_status='paid'`, confirmed live). The
entire chain after payment — the confirmation email, seller contact
reveal, dispatch, buyer confirmation, a dispute, a return, a payout — has
never executed against real data. Every screen in that chain is built and
code-reviewed against what it's supposed to do, not observed doing it.

Admin's idle timeout was audited after the cookie→localStorage auth
change and confirmed unaffected (its own storage key is independent of
Supabase's own session storage) — but the full real-time 20-minute firing
itself has still never been watched happen end to end. That's a separate,
always-true caveat, not something the storage change specifically put at
risk.

Storefront (non-marketplace) admin RPC functions are genuinely
anon-callable — confirmed directly this pass via
`information_schema.routine_privileges` — and are understood to each
guard internally via `has_admin_permission`/`is_admin` checks in the
function body, which is why this is treated as defence in depth rather
than an open door. This pass did not re-read every individual function
body to confirm each guard.

### Numbers, verified live just now
11 live listings, 6 active sellers, 0 paid orders, 0 disputes, 34 active
`marketplace_*` email templates, 26 active cron jobs project-wide.

---

## 1. Goal

**Historical from here through §6.** The six sections below are the
original build log — router split, the very first browse/detail screens,
early auth decisions — and describe the project as it stood well before
checkout, the seller flow, or most of admin existed. Left intact because
the reasoning in it (why the subdomain was abandoned, why cookie storage
was tried and later reverted, the RLS/view design for seller identity) is
still useful background. Do not read anything in §1–§6 as a description
of what the app does today — see CURRENT STATE above for that.
Stand up the runtime plumbing that lets one build serve two experiences from one
origin, split by URL path:
- `bundledmum.com/*` (everything except `/marketplace`) → existing storefront +
  admin (unchanged).
- `bundledmum.com/marketplace` → the new secondhand marketplace.

This pass is **plumbing only**: `/marketplace` renders a throwaway "Coming soon"
placeholder confirming the split works. No marketplace screens, listings, seller
dashboards, or checkout yet.

## 2. Current state as of that early pass (historical — not current; see "CURRENT STATE" at the top)
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
- `src/integrations/supabase/authStorage.ts` — builds the Supabase client.
  **Changed this pass** (session persistence fix, see §5, commit `f15858f`):
  now always plain `localStorage`, no more cookie branch. Cookies were
  causing sellers to be silently signed out on mobile (WebKit caps
  `document.cookie`-set cookies to 7 days regardless of Max-Age).
- `src/integrations/supabase/client.ts` — auto-generated; one-line delegation to
  `createBundledmumSupabaseClient(...)`. Untouched this pass, still correct
  (the function signature didn't change, only its body).
- `src/lib/recordLoginEvent.ts` — **NEW** this pass; device fingerprint +
  `record-login-event` invocation for the new-device sign-in alert.
- `package.json` / lockfile — `@supabase/ssr@^0.12.4` is now an UNUSED
  dependency (its only consumer, `authStorage.ts`, no longer imports it).
  Left in place deliberately, not removed this pass — a tidy-up candidate for
  later, not worth the lockfile churn risk in a live-bug-fix pass.

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

### This pass — every WhatsApp link now opens with a contextual pre-filled message
New shared module `src/marketplace/lib/whatsapp.ts`: `useMarketplaceWhatsAppNumber()`
(reads `site_settings.whatsapp_number` live, normalises to international
digits, `2347040667424` fallback only) and `waMessage`/`waHref`/`waContextHref`,
mirroring the deployed `build_whatsapp_link(p_context, p_reference, p_item,
p_name)` database function's exact wording client side rather than calling
it via RPC per button (would mean an async round trip before a link is even
clickable, on pages that mostly render plainly today). **All marketplace
`wa.me` links now go through this module; none import the storefront's
`WHATSAPP_BASE` constant anymore** (confirmed by grep, zero hits left in
`src/marketplace`).
- **7 links were bare (opened an empty chat), each given a real message**:
  `MarketplaceHeader.tsx` "Help on WhatsApp" → generic: *"Hello. I need
  some help with BundledMum Marketplace."* `SellerPayoutsPage.tsx` "Chat"
  → payout_not_received, no single order to reference here (it's an
  aggregate payouts list): *"Hello. My payout has not arrived yet."*
  `AreaCombobox.tsx` (2 sites, shared by both the seller's create-listing
  area picker and the buyer's browse location filter, so no order/listing
  context is available either way) → a bespoke message, not one of the 15
  named contexts since none fit "area not listed": *"Hello. My area is not
  listed when I search, please can you add it."* `CheckoutPage.tsx`
  payments-unavailable state → payment_problem, no order exists yet at
  that point: *"Hello. I am having trouble paying for my order."*
  `CheckoutPage.tsx` negotiated-price-mismatch state → order_help with the
  real order reference (an order does exist by this point). `CheckoutPage.tsx`
  Paystack-init-failed inline error → payment_problem with the order
  reference.
- **9 links already carried a message but used the hardcoded number**,
  fixed by swapping the number source only, wording largely left alone
  since it already satisfied the rule: `AwaitingPaymentPage.tsx` (3 sites),
  `PaymentReturnPage.tsx` (4 sites), `BuyerOrderDetailPage.tsx` (2 sites).
  Two of these were reworded slightly to match the DB helper's own exact
  phrasing where a fitting named context existed:
  `SellerOrderDetailPage.tsx`'s "reach the buyer" link now reads *"I cannot
  reach the buyer about order X"* (was "I need to reach the buyer on order
  X"); `PaymentReturnPage.tsx`'s seller-contact-missing fallback now reads
  *"I need the seller contact details for my order X"* (was "...and need
  the seller's contact", which also named the item — the DB's
  `seller_contact_missing` context only takes a reference, not an item, so
  matching it exactly means that one detail is no longer in the message).
  `SellerDashboardPage.tsx`'s delisted-listing and legal-name-correction
  links, same treatment.
- **Not touched, flagged not fixed**: `CheckoutPage.tsx`'s "Payment details
  are not set up yet, please message us on WhatsApp" is plain text with no
  actual `href` at all, not a real link. Left alone per the explicit
  instruction not to add WhatsApp buttons where none exist, even though
  the copy already promises one.
- **Explicitly out of scope, correctly untouched**: the seller/buyer
  contact blocks (`sellerWhatsAppLink(phone, msg)` in
  `SellerOrderDetailPage.tsx`, `BuyerOrderDetailPage.tsx`,
  `PaymentReturnPage.tsx`) message the *other party's own phone number*,
  not the BundledMum support line, so there was no hardcoding to fix there
  and their behaviour is unchanged.
- `src/lib/whatsapp.ts`'s `WHATSAPP_BASE` constant itself (still hardcoded)
  was deliberately not touched — it is a storefront-shared file used well
  beyond the marketplace, out of scope for a marketplace-only pass; the fix
  here was making marketplace components stop importing it, not editing it.
- **Verified live**: two sites clicked through with a real logged-in
  session (the header's generic help link, and the seller payouts page's
  "Chat" button) — both produced the correct number
  (`wa.me/2347040667424`, matching the live `site_settings.whatsapp_number`)
  and the correct, correctly URL-encoded message. The remaining sites are
  behind logins not reachable in this session (seller dashboard's own
  session unexpectedly required a fresh sign-in partway through, same
  general limitation as every other seller/buyer-gated screen in this
  file) — verified for those via `npx tsc --noEmit` (clean), `npm run
  build` (passes), and a full read of every edited call site's final code.
- **All marketplace WhatsApp links must keep carrying a real, contextual
  message going forward, and the number must always come from
  `site_settings.whatsapp_number`** (via `useMarketplaceWhatsAppNumber()`),
  never hardcoded again.

### Earlier this branch line — markup can be applied to existing listings, stale warning removed
`MarketplaceSettings.tsx` only. Two backend functions were already deployed
and verified live before touching any code:
`preview_markup_change(p_markup)` (dry-run: listings affected, total buyer
value before/after, one worked example including the seller's unchanged
amount) and `admin_apply_markup_to_listings(p_markup, p_include_delisted)`
(the real write, admin-permission gated). Also verified live: the earlier
disconnect this screen used to warn about is genuinely fixed —
`marketplace_listings.markup_percent`'s column default is no longer a
hardcoded `10`, and a new trigger (`trg_aa_set_listing_markup`) now stamps
it from the live `marketplace_markup_percent` setting on insert whenever
the caller hasn't set one. So the old red warning was not just imprecise,
it was actively wrong by the time this pass started.
- **Removed** the red warning under Markup percentage entirely (it was the
  only field in this file using the `warning` mechanism, so the mechanism
  itself was retired rather than left unused).
- **Replaced with a neutral, non-red line** (plain muted text, no red, no
  green, no box): *"Editing this number alone affects new listings only.
  Existing listings only change when you use Apply to existing listings
  below."* Information, not a warning, per the brief.
- **New "Apply to existing listings" button** on the markup card, opening a
  panel that requires seeing the real effect before it can be confirmed:
  enter a markup, an off-by-default "Also update delisted listings"
  checkbox, then "See what this changes" calls `preview_markup_change` for
  real and shows listings affected, total buyer value before/after, and the
  one worked example with the seller's amount explicitly called out as
  unchanged. Only once that preview has loaded does an "Apply now" button
  appear (changing the number or the checkbox after previewing clears the
  stale preview, so an admin can never apply a figure they have not
  actually seen the effect of).
- **Confirm step is honest about the consequence**, styled coral (not error
  red — this is a real but intentional effect of a deliberate action, not a
  problem): *"This changes what every live buyer sees immediately. Anyone
  who saw or shared a price on one of these listings will find it
  different."*
- **Editing the plain number, unchanged**: still goes through the existing
  edit-save-confirm path, still only writes `site_settings`, still affects
  new listings only. The two are entirely separate code paths — applying
  to existing listings is never a side effect of saving the number.
- **Verified live against the real database** (not just built): called
  `preview_markup_change(15)` directly — returned exactly the figures this
  task's own brief quoted (30 listings, ₦484,000 → ₦506,000, the Graco pram
  ₦74,800 → ₦78,200, seller unchanged at ₦68,000) — confirming both the
  function and this screen's parsing of its response are correct. Did
  **not** call `admin_apply_markup_to_listings` live, since that would
  actually reprice 30 real listings, a real consequential write beyond what
  proving the UI wiring needed. `npx tsc --noEmit` and `npm run build` both
  pass; the settings route itself is admin-login gated, same
  no-credentials limitation as every other admin screen in this file.
- Preserved: every other setting and its own confirm step, the
  confirm-day-vs-dispute-window and both-payment-methods-off warnings
  (still red, still valid, untouched), categories, locations, per-alert
  recipients, bank details. `price_naira` (the seller's asking price) is
  never touched anywhere in this pass — `admin_apply_markup_to_listings`
  only ever writes `markup_percent`, which the price-compute trigger then
  uses to recompute `final_price_naira`, the buyer-facing figure.

### Earlier this branch line — checkout merges service fee + Paystack fee into one line
`CheckoutPage.tsx` only, display change, nothing computed differently.
Breakdown goes from four lines to three: item price, "Service & Paystack
fee", total. Applies in every load state (details-pending, order-created,
resolved), not just the final one.
- **New line**: label "Service & Paystack fee", amount
  `serviceFee + paymentFee` (both still sourced from
  `marketplace-initialize-payment`'s response, nothing computed a different
  way, `service_fee_naira`/`paystack_fee_naira` still stored separately on
  the order row, unchanged). Sub-line: **"Non refundable"** — a follow-up
  request simplified this from the original longer wording ("Covers
  BundledMum's service fee and Paystack's payment processing, non
  refundable"), which had explicitly named both parties. The quiet line
  below the box (see next bullet) is now the only place the Paystack-vs-
  BundledMum split is disclosed.
- **Kept the existing quiet line separate**, not folded in: *"This fee is
  set by Paystack, not BundledMum, so it may change if their rates do."*
  Judged that folding a second idea (rate drift) into the same sub-line
  would stop it being "one short line, warm not legalistic" as asked, so
  two short lines each doing one job stays clearer than one longer one
  doing two.
- **One deliberate exception, not in the prompt, flagged here:** when
  `marketplace_buyer_pays_paystack_fee` is off (Paystack's fee absorbed by
  BundledMum instead of the buyer), the line reverts to plain "Service fee"
  at `serviceFee` alone, not merged. Merging there would show a number that
  doesn't match item price + fee = total (the buyer genuinely isn't paying
  a Paystack portion in that state), which would reintroduce a real
  arithmetic mismatch worse than the trust-cost problem this pass fixes.
  The setting currently defaults `true` (buyer pays) in `site_settings`, so
  this branch is dormant today, live only if an admin switches it off.
- **Verified live, real order, not just built:** created a real guest
  checkout order, breakdown showed "Service & Paystack fee" with the new
  sub-line, amount ₦1,151 (= ₦1,000 + ₦151, confirmed arithmetically
  correct), Total unchanged at ₦3,351, pay button unchanged at "Pay
  ₦3,351", the quiet Paystack-rates line still present below the box. Test
  order and its guest customer row deleted afterward, confirmed via
  read-back.
- **Other places the two fees still appear split, reported, NOT changed
  here (each needs its own decision):**
  - `BuyerOrderDetailPage.tsx` (lines ~157-158): "Service fee" and "Payment
    fee" as two separate lines, reading `order.service_fee_naira` /
    `order.paystack_fee_naira` directly. Inconsistent with checkout now.
  - `TermsPage.tsx` §4: describes them separately in prose — "Buyers also
    pay a {service fee} service fee per order, which is non refundable,
    plus Paystack's own processing fee." Inconsistent with checkout now.
  - **The buyer order confirmation email is a bigger finding than a simple
    split-vs-merged question.** `send-marketplace-order-confirmation`
    (edge function) prepares `{{item_price}}`, `{{service_fee}}`,
    `{{payment_fee}}` as separate template placeholders. But the live
    `marketplace_order_confirmation` template's actual `html_body` never
    references any of the three — it uses `{{item_card}}` and
    `{{contact_block}}` instead, neither of which this function's `fill()`
    replaces (it only replaces `{{seller_contact_block}}`, a different
    name). So today this email likely sends with unresolved `{{item_card}}`
    / `{{contact_block}}` text, showing no fee breakdown at all, split or
    merged. This is a pre-existing mismatch between the function and the
    template, unrelated to today's change, surfaced only because this pass
    went looking for every place the two fees appear. Not touched, per the
    explicit instruction not to change email templates here — flagging for
    a separate fix.
- `npx tsc --noEmit` and `npm run build` both pass.

### Earlier this branch line — condition questions, layout fix only (design 25a)
`CreateListingPage.tsx` + `marketplace.css` only. Same six questions, same
copy, same chip options and follow-ups as before, purely a visual rework —
no fields added, removed, or renamed, `condition_answers` still built the
same way.
- **Root cause fixed:** every chip in a row was `flex: 1`, forcing equal
  width regardless of text length, so long options ("Used a few times",
  "Small marks, shown in the photos") wrapped across 2-3 lines while short
  ones ("None at all") sat oversized next to them. Chips inside a condition
  question now size to their own content (`flex: 0 0 auto`, wrap onto a new
  row via `flex-wrap` on the row, individually wrap internally via
  `white-space: normal` only if a single option is too long for the row on
  its own) — scoped under `.mkt-condition-chips .mkt-chip` so every OTHER
  `.mkt-chip` usage in the app (the condition picker, category yes/no,
  browse filters, the negotiability toggle) is untouched.
- **Each question is now its own card** (`.mkt-condition-q`): a check
  circle that fills green once genuinely answered (main option chosen, and
  its follow-up filled in if that option needs one), the question label,
  an optional coral hint line, the chip row, and — when triggered — a
  follow-up text field connected back to the label with a thin vertical
  line rather than reading as a separate, unrelated field.
  `ConditionQuestionField` (the shared component both create and edit use)
  was rewritten to render this structure; the six questions' data and
  validation logic (`missingConditionAnswers`, `buildConditionAnswers`)
  are untouched.
- **Mobile**: a lightweight header replaces the plain label — "Tell us the
  condition", a step-count pill ("N of 6"), and a thin progress bar, both
  driven by a new `conditionAnsweredCount` derived value (counts a question
  as done only when its follow-up, if required, is also filled in — not
  just the main chip clicked). All six questions still render in one
  scrollable column, in order, exactly as before — no pagination, no
  hidden questions, per the original brief's own scope (layout only).
- **Desktop (≥1024px)**: a genuine composition, not the mobile column
  stretched wide. `.mkt-condition-grid` becomes a
  `grid-template-columns: 1fr 1fr 280px` — two columns of three questions
  each (split via a plain array slice, `conditionQuestions.slice(0,3)` /
  `.slice(3)`, since the six are fixed) — plus a third, sticky "So far"
  summary rail recapping every answer live (a green tick or empty dot per
  question, the chosen option, and any follow-up detail typed), reading
  directly off the same `conditionAnswers` state, no separate data source
  to drift out of sync. Below 1024px the same DOM collapses to the single
  mobile column via `.mkt-condition-col { display: contents }` (the same
  pattern already used for the desktop split elsewhere in this app), the
  summary rail hidden, the header's step count gains "answered" via a CSS
  `::after` so no extra JSX branching was needed for that one word.
- **Could not click through live**: `CreateListingPage.tsx` is seller-login
  gated and redirects with a full-page `window.location.assign` the
  instant it detects no session, which this environment cannot follow (no
  seller credentials available, same limitation noted for this exact page
  throughout this handoff). Verified instead by `npx tsc --noEmit` (clean),
  `npm run build` (passes), and a careful structural re-read of the final
  JSX/CSS against the approved design file section by section.

### Earlier this branch line — policy "Last updated" date is admin editable, no longer hardcoded
The `POLICY_LAST_UPDATED` constant (`policySettings.ts`, was `"1 August
2026"`, already stale against the live setting's `"04 August 2026"`) is
**removed entirely** — grepped the whole marketplace tree afterward to
confirm nothing still imports it. All five policy pages (Terms, Privacy,
Buyer protection, Seller protection, Cookies) now read the date from
`site_settings.marketplace_policies_updated_at` via
`useMarketplacePolicySettings()`, the same hook they already used for every
other value on these pages.
- **Missing or empty hides the line, no fallback, no blank line.** The
  hook's new `policiesUpdatedAt` field is `string | null` (no default
  string, unlike every other field on this hook, which all get a sensible
  fallback), and each page renders `{s.policiesUpdatedAt && <span>...}`.
  Verified live: temporarily set the setting to an empty string via SQL,
  confirmed the "Last updated" line disappeared entirely on the Cookies
  page (heading straight into body copy, no gap), zero console errors, then
  reverted and confirmed the line came back.
- **Now editable from admin**, added as its own new group, "Policy pages",
  in `MarketplaceSettings.tsx` (placed after Notifications) — none of the
  five existing groups (Pricing and fees / Negotiation / Orders and
  disputes / Payments / Notifications) fit a policy-page-content date, so a
  dedicated group was more honest than forcing it under an unrelated
  heading. Its help text: *"The date shown as 'Last updated' on the five
  customer policy pages (Terms, Privacy, Buyer protection, Seller
  protection, Cookies). Update this whenever any policy page's content
  actually changes, so the date stays true. Leave empty to hide the
  last-updated line on those pages rather than show a wrong date."* This is
  the one text field on the whole settings screen allowed to save empty on
  purpose (a new `allowEmpty` flag on `SettingField`, since every other text
  field there, e.g. the SMS sender ID, must never be blank) — its own-value
  display reads "Empty, last-updated line is hidden" rather than a blank
  space, so an admin looking at the list doesn't mistake it for unset by
  accident.
- **Verified live, real save through the app's own confirm-step flow, not a
  SQL shortcut:** edited the field in admin, confirmed the modal, saved,
  confirmed the public Terms page picked up the new value on next load with
  no cache staleness issue, then reverted both via the same real save path
  and via SQL back to the original `"04 August 2026"`.
- `npx tsc --noEmit` and `npm run build` both pass. **This setting must be
  updated by hand whenever any of the five policy pages' content changes**
  — nothing automates that, it is exactly the same discipline the old
  hardcoded constant needed, just now changeable without a code deploy.

### Earlier this branch line — footer reorganised into labelled groups
`MarketplaceFooter.tsx` + its CSS in `marketplace.css` only. The one flat,
wrapping `.mkt-ftr-links` list (nine links plus the storefront link all in a
row) is now: a brand column (logo + "Marketplace" wordmark + the protection
line, kept as-is); two headed nav groups, "Marketplace" (Browse, Sell, My
orders, Seller dashboard when logged in) and "Policies" (Buyer protection,
Seller protection, Terms, Privacy, Cookies); and a separate bottom bar below
a hairline divider holding the copyright and the `bundledmum.com` link.
Desktop puts brand left, groups right, bottom bar as one row; mobile stacks
brand then the two groups side by side then the divider and bottom bar.
Same links, same destinations, same suppression rules, nothing added or
removed. Verified live at both mobile (375px) and desktop (1280px), zero
console errors. `npx tsc --noEmit` and `npm run build` both pass.

### Earlier this branch line — verification audit of the five policy pages, one factual error fixed
Not a rebuild. Confirmed all five (`TermsPage.tsx`, `PrivacyPage.tsx`,
`BuyerProtectionPage.tsx`, `SellerProtectionPage.tsx`, `CookiesPage.tsx`)
exist as routes (`/terms`, `/privacy`, `/buyer-protection`,
`/seller-protection`, `/cookies`) and are linked from both the footer and
the shared `PolicyNav`, none missing.
- **Values re-checked against live site_settings, all already dynamic,
  nothing hardcoded found**: service fee (₦1,000, not the design's stale
  ₦750), markup 10%, max discount 10%, dispute window 3 days, return confirm
  4 days all read live via `useMarketplacePolicySettings()`. Negotiation
  expiry (48h) and confirm-prompt day (day 1) are not stated as numbers on
  any of the five pages, so there was nothing to fix there.
- **One factual error found and fixed**: `BuyerProtectionPage.tsx` step 1
  said "within 48 hours of it arriving" to report a problem. Re-read
  `raise_marketplace_dispute` directly — it enforces no such deadline at
  all, only that the order hasn't already settled. The real closing
  mechanism is the same dispute window already used correctly two lines
  above it on this same page. Fixed to read the live
  `disputeWindowDays` value instead of the stale, wrong "48 hours": *"Open
  your order and tap Report a problem. You have until {disputeWindowDays}
  days after dispatch, before your money would otherwise release to the
  seller automatically."* Verified live, renders "3 days", zero console
  errors.
- **Every other behavioural claim checked against the real code, all
  correct, none changed**: buyer pays BundledMum not the seller (Terms §6,
  Buyer protection); refunds by bank transfer not the card, same day the
  seller confirms a return arrived (Terms §9, matches
  `buyerMarkReturnSent`'s flow exactly); the three dispute outcomes
  `rejected`/`full_refund`/`courier_fault` (Terms §8, re-checked against
  `admin_resolve_dispute`'s actual outcome enum); three strikes suspends a
  seller and auto-delists their listings (Terms §10, Seller protection,
  re-checked against `auto_suspend_seller_on_strikes` and
  `delist_listings_on_seller_suspension`); delivery arranged between buyer
  and seller, BundledMum not the courier (Terms §7); passwordless sign-in,
  no stored passwords (Privacy §6); guest checkout, buying needs no account
  (nothing on any page claims otherwise); negotiation only on listings
  marked negotiable, one ask, one counter (Terms §5); seller bank details
  for payouts, buyer bank details only when a refund is due (Privacy §1).
- **Contact email discrepancy still present, still not resolved, re-flagged
  as instructed**: `site_settings.contact_email` is `hello@bundledmum.ng`;
  `send-transactional-email`'s actual `FROM_EMAIL` is
  `hello@bundledmum.com` (its `REPLY_TO` is `.ng`, matching the setting).
  The five pages use `contact_email` (so `.ng`), which lines up with where
  a reply lands, not the visible From address. Needs a human decision on
  which is canonical; not guessed at here.
- **Last-updated date, re-assessed**: `POLICY_LAST_UPDATED` in
  `policySettings.ts` is still a single hardcoded string, not
  database-backed. One place to change instead of five, but still not
  meaningfully maintainable, nothing reminds anyone to update it when
  content changes. Unchanged this pass, flagged again per this task's own
  instruction to report on it.
- `npx tsc --noEmit` and `npm run build` both pass. **These five pages must
  be re-checked whenever marketplace fee, timing, dispute-outcome, or
  strike behaviour actually changes** — their prose, not just their
  numbers, describes that behaviour and can drift the same way the ₦750
  figure and the 48-hours claim both already did.

### Earlier this branch line — admin Settings exposes all eighteen marketplace_* settings
`MarketplaceSettings.tsx` only. Before this pass only 7 of the 18 live
`marketplace_*` keys in `site_settings` were editable from admin (markup
percent, service fee, dispute window, payout digest email, the three bank
fields) — the other 11 were live and enforced but only changeable by editing
the database directly. All 18 now editable, grouped exactly as specified
(Pricing and fees / Negotiation / Orders and disputes / Payments /
Notifications), each behind the same confirm-step modal already used for
every other change here (toggles and the SMS-provider select act on the
first interaction and still route through that same modal, number/text
fields keep the existing edit-save-cancel pattern). Help text is each
setting's own `site_settings.description`, already real prose, not
invented. No values changed, no new settings added, no migrations or edge
functions touched.
- **Important, found while tracing the markup setting per this pass's own
  audit requirement:** `marketplace_markup_percent` does **not** reprice
  existing live listings, and — more than that — it does not correctly
  apply to *new* listings either. `compute_marketplace_listing_price()`
  computes `final_price_naira` from `new.markup_percent`, a column stored on
  each listing row whose schema default is a hardcoded `10`; neither
  `CreateListingPage.tsx`'s insert nor `SellerPriceEditPage.tsx`'s update
  ever writes `markup_percent` into the payload (confirmed by grep), so a
  listing's stored markup is always the hardcoded column default regardless
  of this setting. The setting is only actually read by the client-side
  buyer-price preview shown while listing, and by the negotiation RPC's
  seller-share math (which also reads the listing's own stored
  `markup_percent`, not this setting). **Changing this setting today has no
  effect on what any buyer is actually charged.** Flagged as a standing
  coral warning directly under that field in the admin UI, and here — needs
  either the column default changed via a migration or the insert/update
  payloads wired to read the live setting, neither of which is in scope for
  a settings-screen pass.
- **Two live warnings**, computed from the real current values, not static
  copy: a coral banner under Orders and disputes when the confirm-receipt
  prompt day is at or after the dispute-window day (this has caused a real
  problem before, a buyer gets prompted to confirm at the exact moment their
  money is already auto-releasing); a coral banner under Payments when both
  Paystack and bank transfer are off (checkout becomes impossible). Neither
  fires today: confirm day is 1, dispute window is 3; Paystack is on.
- Validation: percentages 0-100, day/hour counts must be a positive whole
  number, fees and the markup/discount percentages cannot be negative, the
  SMS sender ID cannot be saved empty.
- Preserved untouched: the per-alert recipient overrides, categories,
  locations, and every other admin/marketplace/storefront screen.
  `marketplace_payout_digest_email` was already exposed, left exactly as it
  was, just now visually grouped under Notifications alongside the per-alert
  overrides that already sit next to it.
- Admin is password-gated, verified by `npx tsc --noEmit` (clean) +
  `npm run build` (passes) + a live check that the route renders cleanly
  (redirects to admin sign-in, zero console errors besides the sandbox's own
  known Vite HMR warning) — the actual field-by-field save flow could not be
  clicked through live, same limitation as every other admin-gated screen in
  this file.

### Earlier this branch line — checkout drops the Paystack-fee hedging, all figures verified exact
Copy-only, `CheckoutPage.tsx` only. The §"checkout shows Paystack fee as an
ESTIMATE" entry further down this file documented the original reasoning
(dashboard fee-passing meant our number could differ from what Paystack
actually charged by rounding); that has now been verified to match exactly,
so the hedging language is no longer accurate. Nothing about how any figure
is calculated changed, this is wording only, and the underlying
`fee_added_by_paystack` branching (merchant-absorbs vs buyer-pays-fee) is
untouched.
- **Pay button**: `Pay ${formatNaira(paystackTotal)}` — the `about ` prefix
  is gone entirely, not conditional on anything anymore.
- **Fee line**: label "Paystack fee" (was "Payment fee"), sub-line "Payment
  process fee by paystack" (was "Estimated, added by Paystack" — new wording
  used verbatim as given, including its lowercase "paystack").
- **Total line**: label normalised to "Total" (was "You will be charged" in
  this branch only) so both the fee-added and fee-absorbed branches read the
  same now that neither hedges. Both amounts lost their "about " prefix.
- **Removed**: the info line "Paystack adds its fee at the point of payment,
  so the amount on the next page may differ by a naira or two. That is
  normal." — this was the one other place on checkout describing the total
  as subject to change; nothing else matched a grep for
  estimat/approx/about/may differ/subject to change across the whole
  `checkout/` folder.
- **Kept, reworded**: one quiet `.mkt-help` line in the same spot, no icon,
  no box: *"This fee is set by Paystack, not BundledMum, so it may change if
  their rates do."* — still true regardless of the estimate/exact question,
  since Paystack's own rates are genuinely outside BundledMum's control.
- **Verified live**, not just built: created a real guest order end to end
  (name/phone/email → order created → `marketplace-initialize-payment`
  called for real), breakdown rendered "Paystack fee ₦151 / Payment process
  fee by paystack", "Total ₦3,351", pay button "Pay ₦3,351", the quiet
  Paystack-rates line present, zero app console errors (only the sandbox's
  known Vite HMR websocket warning). The test order and the guest customer
  row it created were deleted afterward, confirmed via a follow-up read.
- `npx tsc --noEmit` and `npm run build` both pass.

### Earlier this branch line — buyer negotiation copy renamed from "offer" to "ask for a lower price"
Copy-only pass, no identifiers, routes, DB columns or RPCs touched. Landed at
"Ask for a lower price" instead of the earlier-planned "Negotiate price" —
that rename was started in a prior pass but **stopped after the design was
found not to cover it, and was never implemented or committed**, confirmed
by grepping the code and this file before starting. The live code still said
"Make an offer" / "offer" everywhere, including several places that were
already violating the "offer is internal only, never shown to users" rule.
- **Buyer-facing:** `ListingDetailPage.tsx` button "Ask for a lower price";
  already-used state "You've already asked for a lower price on this one";
  the pending/countered entry point "View your request" / "The seller came
  back with a different price, view it"; accepted-offer banner "The seller
  said yes to a lower price". `MakeOfferSheet.tsx` heading "Ask for a lower
  price", sub "You get one ask on this listing...", button "Send request".
  `BuyerOfferPage.tsx`: no-request state "Nothing here yet" / "You have not
  asked for a lower price on this listing."; sold-out-mid-request state
  ("...replied to your request... your request closes here"); waiting state
  title "Your request" and body "You asked for {X} off..."; lapsed state
  "Your request window closed...". `marketplaceLogin.ts`'s `offer` reason
  copy: "To ask for a lower price, we need your email" (the reason KEY
  itself stays `"offer"`, an internal identifier, only its display copy
  changed). `CheckoutPage.tsx`'s price-mismatch message: "The price you
  agreed with the seller could not be applied to this order...".
  `TermsPage.tsx` §5: "a buyer may ask once for a lower price, capped at
  X%..." (the section heading "Negotiating a price" and the "Is this price
  negotiable?" / "Negotiable" wording elsewhere are unchanged, per the task).
- **Seller-facing, reworded to "buyer asking for less" framing** (also
  fixing "offer" leaking to sellers, out of the task's named list but
  directly required by the same "never shown to users" rule the task asked
  me to confirm): `SellerOfferPage.tsx` title "Someone asked for a lower
  price" / "Their request"; "Request not found"; "...or suggest a number in
  between"; "This request has closed"; "You suggested {X}. They'll accept or
  decline...". `SellerDashboardPage.tsx` group title "Price requests on your
  listings". The negotiability toggle's Yes option, in both
  `CreateListingPage.tsx` and `SellerPriceEditPage.tsx`: "Yes, buyers can ask
  for less" (was "Yes, open to offers"; "No, firm price" unchanged).
- **Unchanged, exactly as instructed:** the seller's "Is this price
  negotiable?" question at listing time; the "Negotiable" label beside a
  price on browse and listing detail; every code identifier (`offerId`,
  `offers.ts`, `LoginReason = "offer"`, the `?offer=` checkout query param,
  every `mkt-offer-*` CSS class, every react-query key) — none of these are
  user-visible copy.
- **Verified live:** listing detail shows "Ask for a lower price"; the
  `?reason=offer` login page shows "To ask for a lower price, we need your
  email"; zero console errors. Re-grepped the whole marketplace tree
  afterward for any remaining user-visible "offer" string — none found,
  only internal identifiers remain. `npx tsc --noEmit` and `npm run build`
  both pass.

### Earlier this branch line — the five policy pages (Terms, Privacy, Buyer/Seller protection, Cookies), design 24a
New routes in the marketplace tree: `/terms`, `/privacy`, `/buyer-protection`,
`/seller-protection`, `/cookies`. All five wired into the footer (previously
omitted, per the footer's own comment, because they had no page) and into a
new shared `PolicyNav` at the top of each page so a reader can hop sideways
without going back to the footer.
- **Every fee and timing amount reads live from `site_settings`**, never
  hardcoded, via a new `useMarketplacePolicySettings()` hook
  (`src/marketplace/policy/policySettings.ts`) reading
  `marketplace_service_fee_naira`, `marketplace_markup_percent`,
  `marketplace_max_discount_percent`, `marketplace_dispute_window_days`,
  `marketplace_offer_expiry_hours`, `marketplace_return_confirm_days`,
  `contact_email` in one query. **Made dynamic**: the ₦ service fee (Terms
  §4 — the design's own figure was ₦750, stale, live value is ₦1,000, this
  is the exact failure mode the task called out), the markup percent (Terms
  §4, Seller protection), the max discount percent (Terms §5), the dispute
  window in days (Terms §6, Buyer protection, Seller protection), the
  return-confirm window in days (Terms §9). `marketplace_offer_expiry_hours`
  is fetched but the design text never states a number for it anywhere on
  these five pages, so nothing needed swapping there, it stays fetched for
  when/if a future edit adds it.
- **Contact email discrepancy, reported not resolved:** `site_settings.contact_email`
  is `hello@bundledmum.ng`, but `send-transactional-email`'s actual
  `FROM_EMAIL` is `hello@bundledmum.com` (its own `REPLY_TO` IS
  `hello@bundledmum.ng`, matching the setting). Two different domains. The
  policy pages' contact lines (Terms, Privacy, Cookies) use
  `contact_email` as instructed, which lines up with where a reply
  actually goes, not where the email visibly comes from — flagged here for
  a human decision, not silently picked.
- **Last-updated date is NOT database driven.** No setting for it exists and
  adding one is out of scope this pass. `POLICY_LAST_UPDATED` is a single
  exported string constant (`policySettings.ts`), read by all five pages, so
  there is exactly one line to change rather than five — better than
  duplicating it, but still a plain string nobody is reminded to update. Not
  claiming this is maintainable, flagging it honestly per the task's own
  instruction that a hardcoded date nobody remembers is worse than none.
- **Design accuracy check, contradictions found and left as-is (not silently
  corrected), for a human to decide:**
  - Buyer protection's step 1 says "within 48 hours of it arriving" for
    reporting a problem. Read `raise_marketplace_dispute` directly: it
    enforces no such deadline at all, only that the order is still
    `awaiting_dispatch`/`awaiting_confirmation`. The real mechanism that
    actually closes the window is `marketplace_dispute_window_days`
    (currently 3) via the auto-settle path, not a 48-hour post-arrival
    clock. Left the design's literal "48 hours" text in place (it is not
    one of the six named settings, so there was nothing to swap it FOR
    without inventing new policy content) and am reporting the mismatch
    here instead.
  - Everything else checked matches actual behaviour exactly, verified
    against the real deployed code, not assumed: the fee structure (service
    fee + Paystack fee, non-refundable, confirmed in `CheckoutPage.tsx`);
    the money flow (buyer pays BundledMum, seller paid after confirm or the
    dispute window); refunds by bank transfer, never back to the card
    (`BuyerReturnPage.tsx`); the three dispute outcomes — `rejected` (not
    upheld), `full_refund` (seller at fault, strike applied), `courier_fault`
    (nobody at fault, no strike) — read directly off
    `admin_resolve_dispute`'s actual outcome enum; the three-strike
    suspension rule, read directly off `auto_suspend_seller_on_strikes`
    (`strike_count >= 3`); delivery arranged between buyer and seller only
    after payment, BundledMum never the courier; passwordless magic-link
    sign in, no stored passwords; guest checkout, buying needs no account.
- **Layout**: Terms and Privacy are dense reference pages, numbered sections
  with anchor ids, a 640px reading column, and a sticky right-rail jump-link
  TOC at `>=1024px` (hidden on mobile, per design). Buyer and Seller
  protection are the warm/visual treatment, a green hero, tick-row
  checklist, numbered steps card, and a "what this doesn't cover" /
  "about strikes" callout, no TOC (design drops it here deliberately).
  Cookies is short, no TOC, plain sections. All five reuse existing brand
  CSS variables and several existing component classes (`.mkt-step`,
  `.mkt-card2-label`) rather than inventing new visual language, plus new
  `.mkt-policy-*` classes appended to `marketplace.css`.
- **Footer**: still omits only "Help" (no page exists for it, unchanged).
- Verified live in the browser: Terms shows ₦1,000 (not the design's stale
  ₦750), 10% markup, 10% discount cap, 3-day window, all four other pages
  render with zero console errors, desktop Terms shows the sticky TOC with
  all 13 sections. `npx tsc --noEmit` and `npm run build` both pass.
- **Not built, out of scope**: no Supabase migration or edge function
  changes; no new policy content beyond what design 24a specifies; not
  added to the storefront. These pages should be reviewed again whenever
  fee, timing, dispute-outcome or strike behaviour actually changes, since
  their prose (not just the numbers) describes that behaviour and could
  drift the same way the ₦750 figure already did.

### Earlier this branch line — seller listing edit gains the six condition questions and per-listing negotiability, plus a display-tag fix
The seller listing-edit screens (dashboard entry points, price-only live edit,
full edit reusing create-listing, delist-then-edit) were already built in an
earlier pass, to design 21a. This pass found that two backend features had
been deployed since then — `marketplace_listings.is_negotiable` and the
condition_answers/marketplace_condition_questions system — with **no frontend
ever built against either**, and wired both in.

- **Real prompt/code mismatch found and reported before building:** the task
  described "condition questions" as something to preserve/reuse from
  create-listing. They did not exist there. Create-listing only ever had a
  3-option condition picker (`condition` enum: almost_new/good/fair) plus a
  single free-text notes box, written straight into `condition_notes`.
  Separately, and fully deployed already: `marketplace_condition_questions`
  (6 seeded rows — use_level, marks, works, completeness, cleaned, repaired,
  each with fixed options and some with a conditional required follow-up text
  box), `marketplace_listings.condition_answers` (jsonb, `{}` on every listing
  today), and a trigger `sync_condition_notes_from_answers` that **derives
  condition_notes from condition_answers itself** the moment it is non-empty
  (`build_condition_notes`, already deployed, own wording per question).
  Built the six-question UI into `CreateListingPage.tsx` (shared by create
  and full-edit) reading this table live, same select→answer pattern already
  used for the per-category questions. The 3-option condition picker is
  UNCHANGED, still writes the `condition` enum. The old free-text notes field
  and its short-notes nudge are gone; the form now sends `condition_answers`
  and never writes `condition_notes` directly, the database owns that text.
- **Display-tag fix, found while tracing this:** `conditionLabel()` (used on
  browse cards and listing detail, `lib/format.ts`) parsed `condition_notes`
  for words like "good"/"fair" to show a short tag. Once condition_notes
  starts being database-derived text ("Used a few times, marks: ...") it no
  longer reliably contains those words, so every listing using the new system
  would have silently shown "Used" regardless of actual condition. Fixed to
  read the reliable `condition` enum directly instead (same source the browse
  filter already uses, per this file's own earlier note not to parse
  condition_notes). Verified live: browse and listing detail both still show
  "Almost new" / "Good" correctly, zero console errors.
- **`is_negotiable`** (boolean, default false, already deployed) is now
  written by create-listing ("Is this price negotiable?" yes/no, default no)
  and toggleable on a **live** listing from `SellerPriceEditPage.tsx` —
  confirmed by reading `guard_seller_listing_edits`' actual current SQL that
  `is_negotiable` is genuinely absent from its content-changed check, so it
  saves in the same update as a price drop, no separate write and no delist
  needed. Verified live with a real listing: updated `price_naira` down and
  `is_negotiable` to true in one write, succeeded, reverted both, confirmed
  via a follow-up read. The price field on that screen now also pre-fills
  with the current price (was blank-with-placeholder before), so a seller can
  save the toggle alone without being forced to also retype an unchanged
  price.
- **Full-edit rejected-listing path tested end to end via SQL** (no seller
  login available in this environment, same limitation as every other
  auth-gated screen in this file): set a real live listing to `rejected` with
  a rejection reason, wrote a realistic `condition_answers` payload matching
  exactly what `CreateListingPage.tsx`'s new `buildConditionAnswers()`
  produces, moved status to `pending_review` — confirmed `condition_notes`
  came back correctly derived by the database ("Used a few times, marks: A
  small mark on the toe, everything works, all parts included, cleaned
  before listing."), then reverted the listing completely (status, rejection
  reason, condition_answers, condition_notes) back to its original values,
  confirmed via a follow-up read.
- **Not database-enforced:** `enforce_required_category_fields` only checks
  `marketplace_category_fields`, not `condition_answers` — the six
  questions' `is_required` flag is data only, nothing server side blocks an
  empty answer. Client validation (mirrors the category-questions pattern
  exactly: missing questions highlighted, scrolled to, submit blocked) is a
  good-experience layer only, same caveat as the category questions already
  had.
- **Design (21a) re-confirmed present and matching** for the 4 explicitly
  required screens (dashboard entry points per status, price-only live edit
  incl. blocked-raise state, full edit with rejection reason leading and
  resubmit, delist-then-edit confirm) — none of those needed rebuilding, only
  the two new fields layered in. The design does not show the six condition
  questions or the negotiability toggle at all (predates both), so their UI
  follows this task's own spec plus the live database shape, not a mock.
- Preserved untouched: create-listing's photo pipeline, honesty guidance,
  category questions, contact-leak block, area select; the dashboard's five
  status groups and per-status edit button labels; the return flow, the
  make-an-offer negotiation flow and its "offer" wording (out of scope this
  pass — still says "Make an offer", not renamed); the contextual login.
  `npx tsc --noEmit` and `npm run build` both pass.

### Earlier this branch line — per-alert recipients for the 7 internal marketplace emails, commit `783deba`
Until now all seven internal marketplace alerts shared one address
(`site_settings.marketplace_payout_digest_email`). Each can now have its own
recipients on `email_templates.internal_recipients` (text, nullable,
deployed). Both senders already read `internal_recipients` first and fall
back to the shared setting only when it is blank — deployed, not touched
this pass, so a blank field never silently switches an alert off.
- **New "Recipients per alert" section** added directly below the existing
  shared-fallback field in `MarketplaceSettings.tsx` (same screen, not a new
  route) — the two sit next to each other so the fallback relationship is
  visible without navigating. The 7 slugs, in display order: `..._new_sale`,
  `..._dispute_raised`, `..._payment_anomaly`, `..._new_seller`,
  `..._seller_suspended`, `..._payout_digest`, `..._new_listing`. Each row's
  plain-language name + description is read live from `email_templates.name`
  / `.description` (already seeded, not hardcoded in the frontend, so an
  admin editing those elsewhere stays in sync automatically).
- **Empty is explicitly allowed here** (unlike the shared field, which still
  requires at least one address) — the read view names the actual current
  fallback address, "Falls back to bundledmum@gmail.com", not a vague
  placeholder, so an admin sees exactly where a blank one routes.
  Validation, chip display, and the confirm-dialog pattern all mirror the
  existing shared field exactly, just targeting `email_templates` instead of
  `site_settings`.
- **Real inconsistency found and reported, not fixed:** `email_templates`'
  own RLS requires `content/edit_settings`, not `marketplace/manage` (which
  gates this whole screen) — confirmed by reading both the policy and the
  existing general-purpose `AdminEmailTemplates.tsx`, itself gated by
  `content/edit_settings`. Checked `admin_role_defaults`: the standard
  `admin` role has both granted by default and `super_admin` bypasses
  everything, so there's no practical gap today for either real role — but a
  hypothetical narrower custom role granted only `marketplace/manage` would
  hit an RLS wall here. Worth aligning in a future pass; not fixable without
  a migration, so left as-is per this pass's non-goals.
- **Verified live end to end** against the real, already-deployed database:
  all 7 rows render their real name/description/current recipient; cleared
  one field and confirmed both the confirm dialog and the saved read view
  correctly show "Falls back to bundledmum@gmail.com" (DB stored `NULL`,
  confirmed via SQL); typed an invalid address and got the exact expected
  inline error naming it; entered two valid addresses and confirmed the
  confirm dialog ("2 recipients: ..."), the chip display, and the stored
  value all matched. All test data reverted via SQL afterward; confirmed via
  a fresh page reload that all 7 are back to their original
  `bundledmum@gmail.com` value. `npm run build` passes, zero console errors.
  Every other setting on this screen (markup, fee, dispute window, bank
  details, categories, locations) untouched and unaffected.

### Earlier this branch line — display_name now derived by the database, legal name locked once set, commit `f18437b`
Two more backend rules went live, both database-owned, neither rebuilt here.
- **`display_name` is derived, never typed.** `trg_a_derive_seller_display_name`
  (BEFORE INSERT/UPDATE, deployed) sets `display_name` automatically from
  `legal_first_name` + `legal_last_name` whenever both are present — reuses
  the SAME `format_seller_display_name` formatter from the bank-match pass
  above (first token capitalised, last token → single uppercase initial).
  **Anything the client sends as `display_name` is silently overwritten.**
  Confirmed live: "Marvellous" + "Esevbode" → stored `display_name` is
  exactly "Marvellous E.".
- **Legal name is locked once set.** `trg_lock_seller_legal_name` (BEFORE
  UPDATE, deployed) blocks a non-admin from changing `legal_first_name` or
  `legal_last_name` once either was already non-null, raising *"Your legal
  name cannot be changed once set. Message BundledMum if it needs
  correcting."* Admins bypass (checked via `admin_users`). This exists so a
  seller can't register truthfully, pass the bank-match check, then rewrite
  their legal name to match a different account.
- **`SellerSetupPage.tsx`:** the free-text Display name field is **gone
  entirely** — it was already dead (overwritten regardless) and now actively
  misleading. Collects only legal first/last name, with a live preview
  ("Buyers will see: Marvellous E.") and a warm explanation of why only the
  surname initial is public. The insert no longer sends `display_name` at
  all; after saving, the existing `refresh()` + navigate-to-dashboard flow
  means the seller always sees the REAL stored value next, never a
  client-side guess (task's own "read the stored value back" requirement,
  satisfied by structure already in place).
- **`SellerDashboardPage.tsx`'s `EditProfile`:** distinguishes a seller who
  already has both legal names on file (`!!(seller.legal_first_name &&
  seller.legal_last_name)`) from one who doesn't. **Locked:** shown read-only,
  tagged "Private, locked", with the derived public name spelled out and a
  WhatsApp link (reuses the existing `WHATSAPP_BASE` pattern) to request a
  correction. **Not yet set** (every seller who registered before this
  change): still-editable inputs, same live preview, same bank-match
  validation from the prior pass. Bank details stay editable either way. Also
  removed its own free-text Display name field, for the same reason as setup
  — a judgment call slightly beyond the prompt's literal point 2 (which only
  asked for the legal-name fields to lock), justified by the backend rule
  being unconditional, not setup-specific.
- **`sellData.ts`:** `previewDisplayName` ports `format_seller_display_name`'s
  exact algorithm client-side (clean → collapse whitespace → split → first
  token capitalised, last token → single initial, single-word input has no
  initial) — explicitly PREVIEW ONLY, verified against the real stored value.
  `parseLegalNameLockError` recognises the lock trigger's exact message,
  turns it into a human message with the WhatsApp path forward, never shown
  raw. `validateDisplayName` is now unused (both call sites removed) but left
  exported — zero risk, not worth the removal churn this pass.
- **Verified live** against the real, already-deployed database and a real
  seller account: `EditProfile` correctly showed the locked read-only legal
  name with the derived "Marvellous E." and working WhatsApp link; a save
  with unchanged legal names succeeded (no false lock rejection, confirmed
  via SQL); `previewDisplayName` checked directly against the real seller's
  own name (produced "Marvellous E.", matching the actual stored value
  exactly), plus a single-word name, an apostrophe, and digits. One real
  surprise caught and traced rather than assumed: a direct lock-trigger test
  unexpectedly succeeded — turned out the test account also holds admin
  privileges (confirmed via `is_admin()` RPC), which the trigger's own
  documented admin-bypass clause correctly allows; not a bug, test data
  reverted via SQL afterward. `npm run build` passes, zero console errors.

### Earlier this branch line — legal name fields + bank account name match, commit `242aade`
New backend rule: a seller's real first and last name must be on file and
must genuinely match the name on the bank account they provide, enforced at
the database level regardless of what the frontend does.
- **New private columns, distinct from the public `display_name`:**
  `marketplace_sellers.legal_first_name` / `legal_last_name` (text, nullable).
  Confirmed absent from `marketplace_sellers_public`'s column list — never
  shown to buyers, never public anywhere.
- **Enforced at the database level, not just here:**
  `trg_enforce_seller_bank_name_match` (BEFORE INSERT/UPDATE on
  `marketplace_sellers`, already deployed) blocks a write whenever
  `legal_first_name`, `legal_last_name` and `bank_account_name` are all
  present but `bank_account_name` does not contain both names
  (case/punctuation-insensitive — `normalize_name_for_match` strips
  everything but letters and uppercases). Raises `'The bank account name
  must include your first and last name. We could not match "X Y" against
  the account name "Z"'`, which this pass parses and never shows raw.
- **The existing form has one free-text `display_name` field, not separate
  first/last inputs.** A DB trigger (`format_seller_display_name`) already
  keeps only the first token as typed and reduces the last token to a single
  initial (e.g. "Amaka Okafor" → "Amaka O.") — the full surname was never
  stored anywhere, which is the exact problem this pass's new columns solve.
  Rather than parse that free-text field, added two new, clearly-labelled,
  dedicated fields ("Legal first name" / "Legal last name", tagged Private).
  `display_name` and its public "Firstname L." formatting are completely
  unchanged.
- **`sellData.ts`:** `normalizeNameForMatch` mirrors the database function
  exactly. `missingNameParts` runs the identical substring check the trigger
  runs, for live client guidance (never the safety net, the database
  enforces this regardless). `parseBankNameMismatch` recognises the trigger's
  exact raised message and turns it into *"The account name needs to include
  your name, [first] and [last], so we can confirm it is yours."*
- **`useSeller.ts`:** `SellerRow` + its select gain `legal_first_name`/
  `legal_last_name` (purely additive; no other consumer of this shared hook
  destructures them).
- **`SellerSetupPage.tsx`** (new sellers): an onboarding notice (reuses
  `.mkt-reassure`, warm tone — *"This protects you as much as it protects
  buyers... not a suspicion of you specifically"*) sits right above the new
  fields, inside the bank card, not buried. Live inline guidance on the
  account-name field once all three fields have content; blocks submit with
  a specific message if it still doesn't match, before ever hitting the
  database.
- **`SellerDashboardPage.tsx`'s `EditProfile` — an EXISTING profile-edit
  screen, confirmed to already update `bank_account_name`** via the seller
  dashboard's "Edit profile" panel — gets the identical treatment, since the
  trigger fires on UPDATE too. This is also where a seller who set up before
  this change (legal name still null) adds it for the first time.
- **Verified live against the real, already-deployed database and a real
  existing seller account** (not just build + code review): opened
  "Edit profile" on a live seller, confirmed the notice and empty legal-name
  fields render; typed a wrong last name and saw "This does not look like it
  includes your last name yet", confirmed it cleared once corrected; Save
  against the real database succeeded once the names genuinely matched,
  confirmed via direct SQL read afterward (`legal_first_name`/
  `legal_last_name` correctly set, `display_name` untouched). Separately
  called `supabase.update` directly with a deliberate mismatch, bypassing the
  UI entirely, to confirm the live database's raised error is exactly the
  format `parseBankNameMismatch` expects, that the parser produces the
  specified human message from it, and that the trigger correctly rolled the
  bad write back (`legal_last_name` unchanged in the database afterward, data
  integrity intact). `npm run build` passes, zero console errors throughout.

### Earlier this branch line — session persistence fixed (off cookies), new-device sign-in alerts, commit `f15858f`

**Diagnosis, confirmed by reading the installed library source, not assumed.**
Sellers were being signed out unexpectedly, specifically on mobile. Root cause:
the session cookie was written via `document.cookie` in the page's own
JavaScript (`@supabase/ssr`'s `cookies.js`, `documentCookieSetAll`), not a
server `Set-Cookie` header — this is a pure client SPA with no server in the
request path that could set one. **WebKit (Safari on iOS/macOS, and every iOS
browser, since all iOS browsers are WebKit-based by Apple policy) enforces a
hard 7-day cap on any cookie set this way, regardless of the Max-Age
requested.** Neither this app's configured 1-year `maxAge` nor even
`@supabase/ssr`'s own internal 400-day default (confirmed: the app's value
was being silently discarded and replaced with the library's own on every
write, in `cookies.js`'s `setItem`) ever survived that cap. This is exactly
why the symptom was mobile-specific and silent: after roughly a week without
the session being actively refreshed (trivially reached by a backgrounded
mobile tab), the cookie was simply gone, no error, nothing in this app's own
code did it.
- **Two other investigative angles were checked and ruled out with evidence:**
  `autoRefreshToken`/`persistSession` were both already `true`. Cross-tab
  refresh races: the installed `auth-js` version's own source marks
  `navigator.locks`-based coordination as **deprecated and a no-op** — *"The
  auth client coordinates refreshes itself (deduping in-instance callers onto
  a shared in-flight promise) and lets the GoTrue server resolve
  cross-instance races... passing `{ lock: navigatorLock }` has no effect."*
  Not the cause in this supabase-js version (2.111.0), nothing to add. Every
  `auth.signOut()` call site in the codebase was grepped — all explicit
  (header button, account page, admin idle timeout), none fire on a
  mishandled network/auth error.
- **The fix:** `authStorage.ts` now always builds the plain
  `localStorage`-backed client (Supabase's own SPA default, the exact config
  already proven working on localhost/preview in this codebase). The
  cross-subdomain rationale for cookies is genuinely obsolete now that the
  marketplace lives on the `/marketplace` path of this same origin —
  `localStorage` is scoped per-*origin*, not per-*path*, so it already covers
  every route (`/`, `/marketplace`, `/admin`, `/account`) with zero special
  config. `localStorage` carries no equivalent hard cap; Safari's separate
  rule for script-writable storage only evicts after 7 days of the user never
  visiting the site at all, reset by any return visit — a far more forgiving
  bar for a returning seller checking their shop periodically.
- **Known, accepted tradeoff:** this forces a **one-time re-login** for
  everyone currently holding a cookie session — the exact wave the earlier
  handoff entry (§ "Auth storage decision") chose to avoid. Accepted this
  time because the alternative is an unfixable, recurring bug hitting mobile
  sellers indefinitely. `client.ts` and `package.json`/lockfile untouched
  (`@supabase/ssr` is now an unused dependency, left in place deliberately —
  removing it wasn't needed for the fix and risks lockfile churn; a tidy-up
  candidate for a later dedicated pass, not this one).
- **Admin boundary respected.** `IdleTimeoutGuard.tsx`, `useIdleTimeout.ts`,
  `useAdmin.ts`, `AdminLogin.tsx`, `AdminSetPassword.tsx` were read (for the
  audit) but **not edited**. Both idle-logout mechanisms are pure
  `setTimeout` timers that call `supabase.auth.signOut()` directly — neither
  inspects cookie or `localStorage` expiry, so switching the storage medium
  should not change their behaviour. **Could not verify this live** — admin
  login is password-gated and no credentials were available in this
  environment. The admin login page itself was confirmed to render cleanly
  post-change with zero console errors, but the actual "wait past 20 minutes
  idle, confirm signed out on schedule" test was **not completed. Flagged as
  UNVERIFIED — needs a human to sign in as admin, wait past the idle timeout,
  and confirm it still fires exactly as before**, before this is fully
  trusted.

**New-device sign-in alert wired in (customer facing only).**
`record-login-event` (already deployed, `verify_jwt: true`) is called from a
new `src/lib/recordLoginEvent.ts`: hashes `navigator.userAgent` + screen
dimensions + timezone (SHA-256 via Web Crypto) into a stable per-device
fingerprint, then `supabase.functions.invoke("record-login-event", { body })`.
Fire-and-forget, every error swallowed — never blocks or gates the sign-in it
follows, exactly as required.
- Wired into **both** magic-link completion points for the shared customer
  account: `MarketplaceLoginPage.tsx` and its storefront equivalent,
  `AccountLoginPage.tsx` (found and wired — same shared customer account
  either way). Both add a dedicated `onAuthStateChange` listener that fires
  **only** on the `SIGNED_IN` event: confirmed in `auth-js`'s source that
  `SIGNED_IN` fires specifically when a sign-in flow (the magic link) just
  completed, while a page load that finds an already-valid session fires
  `INITIAL_SESSION` instead — deliberately ignored, so this never fires on
  every page load or token refresh, only once per genuine new sign-in.
- **Not** wired into any admin sign-in path — `AdminLogin.tsx` untouched,
  uses `signInWithPassword` directly with no listener added.
- No password auth introduced anywhere; magic link stays the only method.
- Verified live (as much as possible without completing a real magic-link
  email): both login pages render cleanly with zero console errors under the
  new client; the device-fingerprint hash (SHA-256, 64 hex chars) runs
  without error in-browser; a direct unauthenticated `fetch` to
  `record-login-event` confirmed the function is live and correctly rejects
  with `401 UNAUTHORIZED_NO_AUTH_HEADER`, proving the endpoint `functions.invoke`
  targets is reachable and enforcing auth as expected. The actual "magic link
  → SIGNED_IN fires → email arrives for a genuinely new device" path could
  not be completed end to end here (no email inbox access), same limitation
  noted for other auth-gated flows in this handoff.

### Earlier this branch line — listing detail displays category answers, commit `df0d443`
Listing detail now shows the seller's category-question answers from
`marketplace_listings.attributes`, read-only, on both mobile and the desktop
two-column layout. Built to design 17a ("Category details, on listing
detail", screens S1-S4), which places the spec block between condition notes
and description — confirmed and matched exactly.
- **`mdb.ts`:** `LISTING_SELECT` now selects `attributes`. **`types.ts`:**
  `MarketplaceListing` gains a typed `attributes: Record<string, string |
  number | boolean>` (jsonb NOT NULL, never null). Both purely additive,
  checked against every consumer (`ListingCard`, the admin listing screens,
  `useListings.ts`) — none destructure it, zero risk.
- **`ListingDetailPage.tsx`:** fetches `marketplace_category_fields` for the
  listing's `category_id` (public readable), pairs each by `field_key`
  against `attributes`. A field renders only when actually answered: text/
  select/number need a non-empty value, boolean needs an explicit `true` or
  `false` (an unanswered boolean never renders, but a real `false` always
  does — "Has it been written in? No" is a genuine answer, not a gap).
  select/text/number render as plain text; boolean renders as a green
  check-circle "Yes" or a red cross-circle "No", never the raw word true or
  false. `reason_for_selling` (the one field_key seeded on every category) is
  pulled out of the hard-spec list and shown separately, lighter weight,
  italic: `Why they're selling: "..."` — the design mock uses gendered
  "she's", swapped for neutral "they're" to match this app's tone.
- **Empty state:** when a category has no hard specs and no reason answered
  (every one of the 25 live seeded listings, today, since nobody has yet
  submitted through the new create-listing form), NEITHER the spec card nor
  the reason note renders at all — condition notes and description carry the
  page. Matches the design's explicit instruction: "nothing reads as missing
  since those two sections already carry the page."
- **Placement:** same position and order on mobile (single column) and
  desktop (inside the existing sticky purchase panel, `.mkt-detail-panel`,
  built in the prior two-column-layout pass) — condition notes → spec card →
  reason note → description → held-funds notice → Buy now. New CSS only
  (`.mkt-spec`, `.mkt-spec-row`, `.mkt-spec-note`), no edits to the existing
  desktop-layout or sticky-panel rules.
- **Design deviation noted:** the S4 desktop mockup shows the entire purchase
  panel as one big white card; the ACTUAL desktop build (from the prior pass)
  only boxes the sticky Buy-now footer in a card, the rest of the panel sits
  on the page background. Preserved that structure exactly rather than
  rebuilding it; the new spec card carries its own white/bordered look either
  way, so it still reads as a distinct block in both contexts.
- **Verified live with temporary test data, then reverted:** set real-shaped
  `attributes` (real JSON types, boolean as boolean) on one live Baby
  clothing listing (`size` text + a reason quote) and one live Books listing
  (`all_pieces_present: false`, since no live "Toddler school books" listing
  currently exists — Books carries the identical boolean field_type, so it
  exercises the same code path and specifically proves `false` renders as a
  real red-cross "No", not as unanswered). Confirmed on both mobile and
  desktop, zero console errors, then reverted both listings to `{}` and
  confirmed via SQL that all 25 live listings are back to empty. The empty
  state was also verified on a real, untouched listing (Graco double pram):
  no spec card, no reason note, page reads calm and complete.
- Preserved untouched: the desktop two-column layout and sticky purchase
  panel, the verified badge, seller name and tenure, condition/location
  chips, held-funds notice, quantity and sold-out states (no live
  multi-quantity listing exists to test that combination today, but the code
  path above the new block is unmodified), `price_naira`/
  `seller_share_naira` never shown to buyers. Browse, checkout, payment
  return, buyer/seller orders, header, footer, the entire admin, and
  create-listing (which writes these answers) are untouched.
- **All 25 seeded live listings show the empty state today** — nobody has
  submitted through the category-questions form yet (deployed last pass).
  This is expected and correct, not a bug; the spec block will start
  appearing organically as real sellers list under the new form.

### Earlier this branch line — create-listing renders and submits category questions, commit `af7677d`
Create listing now renders `marketplace_category_fields` for the chosen
category and submits the seller's answers into `marketplace_listings.attributes`.
Built to design 16a ("Category questions, on create listing", screens C1-C4),
which sits between condition and description — reuses existing input styles
throughout, no new visual language.
- **The database already enforces required answers, this pass does not add
  that enforcement, only a good frontend experience around it.**
  `trg_enforce_required_category_fields` (BEFORE INSERT/UPDATE on
  `marketplace_listings`, already deployed) blocks any write into
  `pending_review` if a required field for that category has no answer in
  `attributes`, or an empty string, raising `Missing required details: Label,
  Label`. A JSON `false` or `0` counts as answered (the trigger only
  special-cases an empty STRING), so `attributes` values are written with
  real JSON types per `field_type` — boolean stays a boolean, number a
  number — never stringified.
- **Position and rendering:** the questions block sits between the condition
  textarea and the description textarea, exactly where design 16a places it.
  Nothing renders until a category is picked and its fields have loaded.
  select → `.mkt-native-select`; text → `.mkt-input`, `help_text` shown below
  when present; number → `.mkt-input`, digits only; boolean → a two-button
  Yes/No pair reusing the `.mkt-chip` condition-picker style (a tactile
  toggle, not a bare checkbox — and tracked as `true | false | undefined` in
  state, an unanswered required boolean must never silently default to
  `false`, which would already satisfy the trigger). Every row gets a
  Required (coral) / Optional (neutral grey) pill, new
  `.mkt-qpill`/`.mkt-qpill.req`/`.mkt-qpill.opt` classes, deliberately not the
  green `.mkt-avail` availability pill so it can never read as stock status.
- **Short-form state (design C2):** when a category has only the default
  optional "Why are you selling this" question (real categories like "Baby
  bath and grooming" have exactly this), a green reassurance box ("That is
  everything specific to X. On to description and price.") replaces the
  missing rows, reusing the existing `.mkt-reassure` component so the section
  reads as complete, never sparse or broken.
- **Client validation (design C3):** on submit, every required question with
  no real answer blocks submission with a specific message (the single
  field's label, or a joined list for several), scrolls to the questions
  block, and turns each offending row red (border, label colour, and an
  inline reason using the question's own `help_text` when present — Size's
  `help_text` "Required, buyers cannot ask before buying" reads exactly as
  the design's per-field reasoning — falling back to a generic "This is
  required. Buyers cannot ask before buying." otherwise).
- **Server-rejection recovery (design C4):** the trigger's `Missing required
  details: ...` message is parsed (never shown raw), its labels matched back
  to their `field_key`s, those rows highlighted red, and a bottom sheet
  (reuses `.mkt-sheet`) opens naming the field(s), "nothing else was lost",
  with a "Take me to it" action that scrolls to and focuses the first one.
  Any other error keeps the existing generic `.mkt-errbox` handling
  unchanged. This path is a rare-recovery net (e.g. a category question added
  by an admin mid-session), client validation is expected to catch it first
  every normal time.
- **Category change after questions are answered:** ALL category-question
  answers and validation state are cleared the instant `categoryId` changes.
  Decided this over trying to carry answers forward, because a different
  category's `field_key`s carry different meaning or may not exist at all
  (the unique constraint is per-category, not globally reserved), so nothing
  is ever submitted keyed to the wrong category.
- Verified against real live data (not placeholder): Baby clothing (2
  questions — the optional default plus required `size` with its own
  `help_text`), Toddler school books and workbooks (3 — the shared required
  `all_pieces_present` bulk-applied in the prior pass, alongside the
  category-unique required `written_in`), and single-question categories
  trigger the short-form state. `npx tsc --noEmit` and `npm run build` both
  pass. The route was smoke-tested live: `/marketplace/sell/new` redirects
  correctly to `/marketplace/login` with zero console errors after this
  change (confirms the module loads and mounts cleanly); the authenticated
  form itself needs a completed magic-link login to reach, which could not be
  done here, consistent with how other seller/admin auth-gated screens in
  this codebase have been verified — build + typecheck + code review +
  real-data cross-check.
- Preserved untouched: 4-photo minimum + image standard/watermark,
  `display_name` enforcement, the contact-detail block, the searchable area
  select, the buyer price preview, `pending_review` status,
  `final_price_naira`/`markup_percent` staying trigger-owned. Browse,
  listing detail, checkout, payment return, buyer/seller orders, header,
  footer, the entire admin (including the category questions manager) are
  untouched.

### Earlier this branch line — admin category questions manager, commit `1ca74de`
New admin screen manages `marketplace_category_fields`, the per-category
questions a seller will answer when creating a listing. Built to design 15a
("Admin, category questions manager", screens Q1-Q8) — the frame did not exist
on the first check this pass, was added mid-conversation, then found and read
in full on the retry.
- **Schema (already deployed, no migration this pass):**
  `marketplace_category_fields` — `id, category_id (FK -> marketplace_categories
  ON DELETE CASCADE), field_key, label, field_type ('select'|'text'|'number'|
  'boolean' CHECK), options jsonb (select only), is_required, help_text,
  sort_order, created_at`. **Unique `(category_id, field_key)`.** RLS: public
  read, `Admin manage category fields` on `has_admin_permission('marketplace',
  'manage')`, same pattern as every other admin table here.
  `marketplace_listings.attributes jsonb NOT NULL` also exists — **nothing
  writes to it yet, and the seller create-listing form does not read these
  question definitions yet either. Both are a later phase.**
  [**CORRECTED, this claim is stale**: that later phase landed —
  commit `af7677d`, documented below at "create-listing renders and
  submits category questions." Create-listing has rendered and required
  these questions for a long time; this exact stale claim (in a
  paraphrased form, "help_text is fetched but never rendered") was
  carried into a later task before being traced and found wrong — see §17
  and §18. If you're reading this section for current behaviour, don't:
  see CURRENT STATE at the top of this file instead.] This screen only
  manages question DEFINITIONS.
- **Real seeded data this pass (verified live, not placeholder):** 39
  categories across the 7 groups, 66 questions total. `reason_for_selling`
  ("Why are you selling this", select, optional) on nearly every category;
  `size` (text, required) on Clothing+shoes and Maternity; `all_parts_present`/
  `all_pieces_present` (boolean, required) on Feeding/Play+learning;
  `brand_model` (text, required) on Travel and carriers; `written_in` ("Has it
  been written in", boolean, required) exists ONLY on "Toddler school books
  and workbooks", nowhere else in Play and learning, the one-off case the
  design calls out explicitly.
- **New file** `pages/admin/marketplace/MarketplaceCategoryFields.tsx`. New
  sidebar nav item **"Categories"** (between Money owed and Settings, icon
  `ListTree`) — this is DELIBERATELY separate from the existing category
  enable/disable chip list inside `MarketplaceSettings.tsx`, which is
  untouched. Two routes on one component sharing one data layer:
  `/admin/marketplace/categories` (grouped list, Q1) and
  `/admin/marketplace/categories/:categoryId` (per-category editor, Q2-Q4).
- **List**: categories grouped by the same 7 groups the buyer filter accordion
  uses, each row showing "N required, M optional" and a "N questions" pill; a
  coral tag when a category carries a question unique to it, plus a
  group-level "N categories carry a one-off question" line.
- **Editor**: reorder via up/down buttons (not drag, works identically on
  mobile and desktop, no drag-drop library); inline add/edit form (label, type
  as 4 segmented buttons, required toggle, help text, a live "Seller sees"
  preview); remove sits behind a danger `ConfirmDialog` stating the REAL
  "answered on N live listings" count, read via
  `attributes->>field_key is not null` scoped to that category and
  `status='live'` — correctly 0 today since nothing writes to attributes yet,
  this becomes accurate the moment that later phase lands.
- **`field_key` stability, the concern called out in the brief:** on ADD, the
  key is auto-suggested from the label (lowercase, underscored) and shown
  editable, the admin confirms or edits it before the row is created. On EDIT
  of an EXISTING question the key is LOCKED by default; a "Change key
  (advanced)" link reveals it behind a coral warning explaining that any
  answer already stored under the old key becomes orphaned and the question
  starts fresh under the new key. Client-side key pattern `^[a-z][a-z0-9_]*$`
  enforced before save (also keeps the `attributes->>key` query path safe).
- **Bulk apply (design Q5, in scope, built):** its own dialog, off by default,
  reachable from the list page ("Apply a question to a group"). Copies an
  EXISTING question already used somewhere in the chosen group (never invents
  a new shape) to every other category in that group; the preview pre-checks
  every category that does not already have that `field_key` and disables/
  greys the checkbox for ones that already do (would violate the unique
  constraint), the admin can uncheck any row for judgement reasons before
  confirming "Add to N categories".
- Preserved untouched: the existing category enable/disable list and
  `MarketplaceLocations` inside `MarketplaceSettings.tsx`, every other
  marketplace admin screen, the customer marketplace, all seller screens,
  checkout, buyer/seller orders, the storefront.
- Admin is password-gated so this could not be live-rendered; verified by
  `npx tsc --noEmit` (clean) + `npm run build` (passes) + code review, same as
  every prior admin-ops pass. Diff is minimal and scoped: one new file plus a
  3-line route addition in `StorefrontApp.tsx` and a 2-line nav addition in
  `AdminLayout.tsx`.

### Earlier this branch line — listing detail, genuine desktop two-column layout, commit `b9fa20a`
Listing detail had no real desktop layout: it was the mobile design stretched
wide (4/3 hero letterboxed, no max width, the sticky bottom buy bar spanning the
full viewport like an oversized mobile control). Implements the design's
desktop layout, **frame `14a — Listing detail, desktop`** (screens `D1`, `D2`),
confirmed present via a fresh design import before any code changed.
- **Design spec (14a):** breakpoint **1024px**; below it the mobile stack + fixed
  bottom bar stay exactly as built. Max width **1200px**, centred, 32px page
  gutters. Columns **58/42** (gallery/panel), 40px gap; panel clamped
  **380–480px**. Main photo **1:1, never letterboxed**; **5** thumbnails beneath
  at 1:1 (drop to **4** between 1024–1200px), selected one green-bordered. The
  whole right panel is **sticky at 24px** from the top; the page-width bottom
  bar is gone on desktop.
- **`ListingDetailPage.tsx`:** existing elements only, no new content/data. Hero
  + thumbs wrapped in `.mkt-detail-gallery`; body + buy bar wrapped in
  `.mkt-detail-panel`. Both wrappers are `display:contents` by default, so on
  mobile the DOM lays out exactly as before (verified below). Did NOT add the
  mock's breadcrumb, "More from Amaka" related row, image count/watermark
  overlays or "Total with fees" subline — those are new content not on the
  page today; the ask was rearrange existing elements only.
- **`marketplace.css`:** `@media (min-width:1024px)` turns `.mkt-detail` into
  the 1200px 2-col grid; `.mkt-hero` goes `aspect-ratio:1/1`; `.mkt-thumbs`
  becomes a `repeat(4,1fr)` grid (→ `repeat(5,1fr)` at `min-width:1200px`);
  `.mkt-detail-panel` gets `position:sticky;top:24px`; `.mkt-buybar` flips from
  `position:fixed` full-width to the panel's static purchase footer (same
  `.mkt-buy` button, same `navigate(/checkout/:id)` call, untouched).
- **Verified live:** at 1280px the grid is `616px 480px` (panel clamped to its
  480 ceiling), `max-width:1200px`, panel `position:sticky;top:24px`, hero
  `1/1`, thumbnails 5-wide. At 1050px (1024–1200 band) thumbnails drop to
  4-wide, panel still clamped at 480, gallery shrinks. At 1023px (one px below
  breakpoint) everything reverts: `.mkt-detail` back to `flex`, `.mkt-buybar`
  back to `fixed;bottom:0`, hero back to `4/3`, thumbs back to horizontal
  scroll. **Mobile explicitly verified unchanged:** stashed this change,
  captured every rect/display/position for `.mkt-detail/.mkt-hero/.mkt-thumbs/
  .mkt-detail-body/.mkt-buybar/.mkt-buy` at 375px, popped the stash, recaptured
  the same set — every value matched exactly (pixel-for-pixel). Buy now tested
  on both breakpoints, navigates to `/checkout/:id` both times. Verified badge,
  seller card + tenure, condition/location chips, held-funds notice, header,
  footer all render unchanged. `npm run build` passes. Preview left on browse,
  mobile view.

### Earlier pass — grouped collapsible category filter (7 groups), commit `f829035`
The browse category filter (desktop panel + mobile drawer) is now an accordion of
the 7 category groups instead of one flat list.
- **Backend was already deployed, no schema work:** `marketplace_category_groups`
  (`id, name, sort_order`, 7 rows, public-read policy `qual true`) and
  `marketplace_categories.group_id` + `.sort_order`. Live data: 37 allowed categories,
  ALL grouped, ALL have icons, 0 ungrouped (brief said 39; built from live 37). Counts:
  Clothing and shoes 4, Feeding 6, Travel and carriers 7, Nursery 7, Play and learning
  6, Maternity 4, Bath and care 3.
- **`useListings.ts`:** `useAllowedCategories` now selects `id, name, icon, group_id,
  sort_order` (types `CategoryOption`); new `useCategoryGroups` returns the 7 groups.
  Grouping/ordering is done client side (`groupCategories` in BrowsePage) — NO hardcoded
  name→group map, so an admin regroup needs no deploy. Any allowed category with an
  unknown/null group falls through to a loose list (`ungrouped`), never hidden.
- **`BrowsePage.tsx`:** new `CategoryFilter` accordion (used by both the desktop
  `.mkt-fpanel` and the mobile `FilterSheet` via the shared `FilterControls`, which now
  takes a `groups` prop). "All categories" stays always-visible above the groups; the
  chip design (icon + name, `.mkt-fopt`) is unchanged. Home tiles now source their six
  from group display order (`tileCats`).
- **Design decisions (this is the deliverable spec):**
  - Default: EVERY group collapsed, identical mobile + desktop — the 7 headers +
    counts are the scannable index over ~37 items.
  - Active-selection-forces-open: the group holding `filters.categoryId` is force-opened
    (real entry in the `open` Set, added on mount via the initialiser and via an effect
    whenever the selection moves in; only ever adds, so a group the buyer opened never
    auto-closes). That group's count pill turns coral (`.has-active .ct`) as a
    breadcrumb even if later collapsed; the applied-filter chip above the grid also
    shows the pick. So the selection is never lost.
  - Interaction: header button = name + count pill + chevron, `aria-expanded` /
    `aria-controls`. Chevron ▾ rotates 180°→▴ (`transform .2s`); body fades/slides in
    (`@keyframes mkt-catg-in`, .18s); both stilled under `prefers-reduced-motion`.
    Tap targets: header 48px (52px in the drawer), category rows 44px in the drawer.
- **`marketplace.css`:** `.mkt-catgroups/.mkt-catgroup/.mkt-catgroup-h (.nm/.ct/.chev)/
  .mkt-catgroup-body` + the keyframe, reduced-motion, and `.mkt-fsheet` touch bumps.
- Verified live: desktop panel 7 headers all collapsed at 48px with correct counts,
  expanding Feeding reveals its 6 chips + chevron rotates (`matrix(-1,0,0,-1,0,0)`).
  Mobile drawer: headers 52px, options 44px; selected Monitors (in Nursery), applied,
  reopened drawer → only Nursery open with a coral count pill, the pick visible inside.
  `npm run build` passes. Preview left on browse, mobile view.

### Earlier pass — single consolidated desktop browse header (design B4), commit `6e1e133`
The desktop marketplace header is now ONE green bar instead of two stacked strips.
- **Problem:** on desktop, browse showed the shared `MarketplaceHeader` (logo + nav)
  AND `BrowsePage`'s `.mkt-topbar` (tagline/search/location stacked full-width, since
  the topbar was `flex-direction:column` at every width) — two green bars. Design B4
  wants one row: logo · tagline · search · location · nav.
- **`MarketplaceHeader.tsx`:** on the browse route (`pathname === "/"`) the header now
  carries `mkt-hdr--browse`, which CSS hides at `>=1024px`. So on desktop browse the
  shared header disappears and BrowsePage renders the whole bar; mobile browse keeps the
  shared header (hamburger); the reduced checkout header is untouched.
- **`BrowsePage.tsx`:** topbar children wrapped in `.mkt-topbar-inner`. Added a
  DESKTOP-ONLY brand lockup (reusing the header's `.mkt-hdr-lockup` markup + `logoWhite`)
  and a DESKTOP-ONLY `.mkt-topbar-nav` (Browse active / Sell / `My orders` when logged
  in via `useCustomerAuth`, else `Log in`). Search input wrapped in `.mkt-searchwrap`
  with a leading magnifier SVG. Tagline h1 holds both `.mkt-hl-long` ("...baby and
  toddler items", mobile) and `.mkt-hl-short` ("...baby items", desktop per design).
- **`marketplace.css`:** base rules for `.mkt-topbar-inner`, `.mkt-searchwrap`
  (`:focus-within` ring), hidden brand/nav/short-line. `@media (min-width:1024px)`:
  hides `.mkt-hdr--browse`; inner becomes a centered 1240px row (`padding 12px 24px`);
  shows brand + nav; home-line compacts (green-light, short copy, Sell pill hidden);
  search flexes; location pill restyled dark-green `#1A4A33` (label `#8FB6A2`, value
  cream) at height 40 with popover widened to 300px right-aligned; Browse link gets the
  coral (`--mkt-coral`) 2px active underline. The location overrides are scoped under
  `.mkt-topbar-inner` so they beat the later base `.mkt-loc-*` rules (media queries add
  no specificity).
- Verified live at 1280px: one bar only (shared header `display:none`), brand + nav
  visible, nav = Browse/Sell/Log in, Browse underline coral 2px, Where pill
  `rgb(26,74,51)`, popover 300px within viewport, 25 cards render. At 375px: shared
  header + burger back, topbar column, brand/nav hidden, long tagline, Sell pill, white
  location pill. `npm run build` passes. Preview left on browse, mobile view.

### Earlier pass — colourful category treatment, icons from the database
Home and desktop category sections now show each category's real emoji.
- **`marketplace_categories.icon`** (text, nullable, one emoji per category; all 11
  populated, deployed) is the SINGLE source for the icon. It is read live via
  `useAllowedCategories` (now selects `id, name, icon`) and rendered per row. There is
  NO hardcoded name→icon map in the frontend, so an admin-added category shows its icon
  with no deploy. A null/missing icon falls back to `🏷️` (`CATEGORY_FALLBACK_ICON`);
  the "All categories" entry uses a fixed `🛒` (it is not a real category).
- **Colour is NOT in the database** and needs no migration: the home tile chip colour
  is a fixed rotation of two existing brand-palette colours (coral-light `#FDE8DF` /
  green-light `#D8EFE5`) by tile index, set inline in `BrowsePage`. The design derives
  colour from the palette, not per category, so admin-added categories need nothing.
- Home (mobile, design B1): the six category tiles show the emoji in a 40px rounded
  chip with the alternating brand colour. Desktop + mobile sheet (design B4): the
  category filter list shows the emoji before each name (`.mkt-fopt .fopt-ic`).
- Verified live: tiles render 🛁/🤱/👕/👟/📚/🚗 with alternating coral/green chips;
  desktop panel lists every category with its emoji; a category with icon set to null
  falls back to 🏷️ (tested by temporarily nulling one and reverting). No console
  errors; the location/price/condition/sort filters and result count are unchanged.
- Admin category management was NOT touched (the design shows no icon picker there);
  icons are edited directly in `marketplace_categories`.

### Earlier this branch line — location + city filter beside the search bar (design 13a B1b/B1c)
Adds the state-then-city location filter beside browse search, on top of the admin
edit + browse filters already shipped. The create-listing structured `condition`
write and the admin listing edit view (see the section below) were already built and
are unchanged this pass.
- **`LocationControl`** (in `BrowsePage`) sits beside the search bar in the topbar, a
  "Where: {label} ▾" button opening a panel with a native state `<select>` (default
  "All Nigeria" + allowed states) and, once a state is chosen, the shared
  **`AreaCombobox`** for the searchable city/area (disabled until a state is picked, so
  a city can never be chosen first; changing state clears the city). This REUSES the
  create-listing dependent state+area pattern, not a second implementation. The plain
  "Where" state select was removed from the filter panel/sheet.
- **`BrowseFilters` gained `city`**; `buildBrowseQuery` now applies BOTH
  `.eq("location_state", state)` and `.eq("location_city", city)` SERVER SIDE (never a
  client string match). `useAllowedStates` returns `{id,name}` and a new
  `useAreasForState(stateId)` feeds the area list from `marketplace_areas` (is_allowed).
  Applied chip shows "{city}, {state}" and clears both.
- Verified live: All Nigeria = 24, Lagos = 16, Lagos + Yaba = 2 (matches SQL), city
  gated on state, chip clears both, no console errors. Note: some seeded listings'
  location_city values ("Ikeja", "Lekki") predate the granular allowed-area list, so
  those exact cities may not be selectable from the area search; new listings use the
  allowed areas. Filtering itself is exact server-side on location_city.

### Earlier this branch line — admin listing edit + browse filters (design 13a)
- **New `condition` column** (deployed): text `almost_new`|`good`|`fair`, nullable, the
  reliable source for the condition filter (do NOT parse condition_notes). 25/26 seed
  rows backfilled, 1 null by design. `CreateListingPage` now writes `condition`
  directly from the picker (via a label→enum `CONDITION_VALUE` map) ALONGSIDE the
  existing free-text `condition_notes`. Added to `LISTING_SELECT` + `MarketplaceListing`.
- **Admin listing edit view** (`pages/admin/marketplace/MarketplaceListingEdit.tsx`,
  route `/admin/marketplace/listings/:id/edit`, gated marketplace/manage; reachable via
  an Edit action in the listings table). Edits title, description, condition_notes,
  `condition` (same picker), category_id (allowed cats), location_state + location_city
  (dependent state select + a searchable datalist area input — the seller AreaCombobox
  is `.mkt`-scoped so a native datalist is used in the admin shell), price_naira,
  quantity, photos (reorder / make main / remove), and status. Writes go straight to
  marketplace_listings under "Admin manage listings". Includes: (1) a live buyer-price
  preview computed from price × (1+markup%); final_price_naira/markup_percent are NEVER
  written; (2) a warning when the listing is sold or has a paid order attached, with an
  Open orders link, non-blocking; (3) choosing 'rejected' requires a rejection_reason
  and warns the seller is emailed the exact words, and any status change to rejected /
  live / delisted shows the email warning (pending_review and sold do not email); (4)
  Relist as its own action for delisted listings with stock, via `admin_relist_listing`
  behind a confirm, false handled honestly; (5) an edit-history panel reading
  `marketplace_listing_edits` (id, listing_id, edited_by, field, old_value, new_value,
  created_at; admin-readable, TRIGGER-written, this only reads it; edited_by resolved to
  admin email); (6) the seller display name linking to the Sellers screen. Admin
  listings table also links each row to Edit.
- **Browse redesign with server-side filters** (`BrowsePage` + `useBrowseListings` /
  `useBrowseCount` / `useAllowedCategories` / `useAllowedStates`): six category tiles on
  the home then the grid; filters on top of search — price range (min/max on
  final_price_naira, never price_naira), condition (the new column, multi-select),
  location, and sort (newest / price asc / price desc) — with a live matching count. ALL
  filtering is built into ONE Supabase query server side (`.eq status live` + `.ilike` /
  `.eq` / `.gte`/`.lte` / `.in` / `.order`, `{ count: 'exact' }`), so it scales past the
  seed. Mobile: a bottom sheet that keeps the grid behind it and shows "Show N items"
  updating live (a head-count query on the draft) before applying; desktop: a persistent
  left panel; applied chips + clear-all above the grid; empty state suggests loosening a
  filter. Verified live: condition Good 24→17, Fair 24→2, sheet live count, apply, clear
  all restores 24; desktop panel and mobile sheet both work. The status='live' public
  filter and price-hiding are preserved.

### Earlier this branch line — listing quantity, sold out, relisting (design 12a)
- **Data model (deployed, not built here):** `marketplace_listings.quantity` (int,
  default 1, NOT NULL, >0), `quantity_sold` (int, default 0), `delisted_by` ('seller'
  | 'admin', set by a trigger when status becomes delisted), `delisted_at`. Available
  stock = quantity − quantity_sold. Stock is claimed SERVER SIDE at payment; a listing
  flips to 'sold' automatically when the last unit is claimed. The client NEVER writes
  quantity_sold or status. `LISTING_SELECT` and `MarketplaceListing` now include
  quantity + quantity_sold.
- **Create listing:** a "How many" stepper defaulting to 1 (the one-off case stays
  effortless). Above 1 it requires an "all N are identical" confirmation checkbox
  before submit, states the price is per item, and shows "sell all N and you receive
  ₦X". Submit sends `quantity` (never quantity_sold). Image standard/watermark, 4-photo
  min, validations all preserved.
- **Browse card + listing detail:** availability shows ONLY when quantity > 1 (badge
  top-left on the photo: "N available", or "Last one" at 1 left; single-item cards
  unchanged). Detail shows "₦X each", an availability pill, the "seller confirmed all N
  are identical, you are buying one" line, and a "Buy one now" button. Browse still
  filters status='live' (sold listings never appear). A sold/gone listing (RLS blocks
  public read of non-live rows) resolves to a warm "Ah, this one has gone" state with a
  browse CTA; the sold item's specifics cannot be shown to a buyer without a backend
  read (non-goal).
- **Seller dashboard listings, bug fixed:** all FIVE status groups now render (Live,
  Waiting on us, Sold out, Not approved, Delisted), each with a header + count and a
  one-line card when empty, so the header count always matches what is shown (the old
  bug counted delisted but rendered nothing). Multi-qty rows show remaining vs sold;
  sold-out rows are visually distinct (dim) from delisted.
- **Who delisted decides who relists (`delisted_by`):** a seller-delisted listing gets
  a working "Put it back up" button → `seller_relist_listing` behind a confirm (design
  Q6); a false result is surfaced honestly. An ADMIN-delisted listing shows "Removed by
  BundledMum" and a WhatsApp contact route, with NO relist button (it would only fail).
- **RPCs:** `seller_relist_listing({ p_listing_id })` (seller's own, only when
  delisted_by='seller', active, no debit, stock remains) and `admin_relist_listing`
  ({ p_listing_id }) (admin, any delisted incl. admin-delisted and sold-with-stock),
  both return boolean, re-enter the review queue.
- **Admin listings:** a Stock column (quantity_sold/quantity), a "Taken down by" column
  (BundledMum/Seller), and a Relist action on delisted rows → `admin_relist_listing`
  behind a confirm, false handled honestly.
- Verified live (public): detail shows "₦49,500 each / 3 available / all 3 identical /
  Buy one now" and browse shows exactly one "3 available" badge when a listing is
  multi-qty (temporarily flipped in the DB and reverted); single-item listings show
  nothing extra. Create/dashboard/admin screens verified by build + code review (auth
  gated). No console errors.

### Earlier this branch line — central scroll reset on forward nav, restore on back/forward
Marketplace routes did not open at the top: client-side navigation kept the
previous page's scroll (open an item from mid-grid, land mid-detail). Fixed ONCE,
centrally, no per-screen scroll code.
- **`MarketplaceScrollManager`** (new, `src/marketplace/MarketplaceScrollManager.tsx`,
  returns null) is rendered once inside `<BrowserRouter>` in `MarketplaceApp.tsx`,
  so it covers every marketplace route.
- **Forward navigation (PUSH / REPLACE) opens at the top**; **browser back/forward
  (POP) RESTORES** the scroll position for that entry, so returning from an item to
  the browse grid keeps the buyer's place.
- **Detection:** react-router v6 `useNavigationType()` returns "POP" for back/forward
  and "PUSH"/"REPLACE" for new navigations. This tree uses a non-data
  `<BrowserRouter>`, so the data-router `<ScrollRestoration>` is not available and a
  custom manager is used instead.
- **Manual restoration:** `main.tsx` sets `history.scrollRestoration="manual"`
  globally (browser never auto-restores), so the manager records `window.scrollY`
  per `location.key` on scroll and puts it back on POP (re-applied once on rAF for
  cached content that lays out just after commit). The window is the scroller (`.mkt`
  is a plain min-height:100vh block), so window.scrollTo is correct and sticky bars
  are untouched.
- **Hash-only navigations are skipped** (same pathname+search) so in-page anchors
  keep working; the marketplace has none today, this is a safeguard.
- Verified live (mobile): browse scrolled to 1400 → open item lands at 0 → back
  restores browse to 1400 → forward restores the item; a PUSH link to /sell opens at
  0. No console errors; sticky topbar, Buy-now bar, header and footer unaffected.
- **Storefront** already resets to top on every navigation via its own `ScrollToTop`
  (it does NOT preserve scroll on back, by its own design), so it does not have this
  bug and was left untouched.

### Earlier this branch line — seller pitch rebuilt, compact footer, home line, photo standard (design 11a)
- **Become a seller (`BecomeSellerPage`, /marketplace/sell):** rebuilt to R1. Removed
  the ₦750 service fee and the markup explanation entirely, that fee is the BUYER's
  and showing it here put sellers off a cost they never pay. It now leads with the
  one true promise ("you get exactly the price you asked for, we take nothing from
  it"), then the four-step protection story (buyer pays BundledMum, we hold, buyer
  confirms, we transfer to your bank), free-to-list, and the every-listing-checked
  line. No calculator, earnings estimator, markup explanation or invented stats. CTA
  behaviour unchanged: logged out routes through the marketplace login and back;
  existing sellers redirect to the dashboard.
- **Compact footer (`MarketplaceFooter` + `.mkt-ftr*` in marketplace.css):** rebuilt
  to R2/R2b, about a third of the old height (measured ~162px on mobile vs ~560px).
  Removed the brand tagline paragraph, the held-payment paragraph and the WhatsApp
  CTA. New single protection line "Sellers checked, listings reviewed, and your
  money held until you confirm the item arrived." replaces the old Paystack line;
  copyright is "© 2026 BundledMum Ltd, Lagos." Links kept to real destinations only:
  Browse, Sell, My orders, Seller dashboard (seller only), bundledmum.com. Help,
  Terms and Privacy omitted (no pages). Suppression rules (/checkout*, dispatch,
  /orders/:id*, /login) and the listing-detail clear-bar clearance are unchanged and
  verified (copyright clears the fixed Buy now bar).
- **Home header line (`BrowsePage`, R3):** added "Buy or sell used baby and toddler
  items" (Nunito 900, 22px mobile / 26px desktop) on the BROWSE home only, on a
  compact row above the search with a coral "Sell" pill (→ /sell), sitting where the
  old greeting was so the grid is not pushed down. It renders only on browse, not on
  every route. Placement note: the design puts it inline in the green bar on desktop;
  it is placed above the search row on both breakpoints to avoid restructuring the
  shared header's two variants.
- **Listing photo standard + watermark (`processListingImage` in sellData.ts, used by
  `CreateListingPage`):** every NEWLY uploaded listing photo is normalised in ONE
  canvas pass to a 1:1 square (1200x1200), cropped to fill and centre-weighted, on a
  cream #FFF8F4 backdrop (the design's pad colour), and has the "Uploaded on
  BundledMum" watermark burned in: a lozenge bottom-left, inset 5% of width, height
  ~8%, Nunito 800 cream text, with a luminance-adaptive scrim (black 30% on light
  corners, cream 22% on dark) chosen from the measured corner brightness so it reads
  on both light and dark photos. Applied on photo ADD, so the seller sees the exact
  stored result in the preview and the same blob is uploaded (one pass). Typical
  output is ~150 to 250KB (measured ~170KB). Applied to LISTING photos only, NOT
  dispatch or dispute photos (those keep plain compressImage, since proof photos are
  not shown in the grid and cropping could cut the waybill). ONLY affects photos
  uploaded from now on; the 24 seeded listings keep their images, no backfill. The
  optional per-photo crop-nudge / auto-pad in the design was not built (needs a
  cropping UI); the default crop-to-fill is used.
- Preserve verified: 4-photo minimum, camera/gallery chooser, compression,
  display-name validation, contact-leak block, searchable area select, buyer price
  preview, auth-uid upload path, first→image_url rest→gallery_urls, pending_review;
  browse / listing detail / checkout / return / order screens / header / admin /
  storefront untouched.

### Earlier this branch line — Settings: internal alert recipients (multiple, comma separated)
`site_settings.marketplace_payout_digest_email` now drives ALL SEVEN internal
alerts, not just the payout digest: the daily payout digest, a new sale, a new
dispute, a new seller registering, a seller auto suspended, a payment amount
anomaly, and the review backlog nudge. It also supports MULTIPLE recipients as a
comma separated string, and every internal alert goes to all of them.
- The marketplace admin Settings field (`MarketplaceSettings.tsx`) was relabelled
  from "Daily payout digest to" to "Internal alert recipients", with help text
  listing the seven alerts and explaining comma-separated multiple recipients.
- Storage is UNCHANGED: same key `marketplace_payout_digest_email`, still a comma
  separated STRING (not an array). The edge functions split it server side. The UI
  normalises entries back to `join(", ")` on save.
- Validation before save: every entry must be a valid email (bad entry named in a
  friendly inline error); whitespace trimmed; an empty value is refused (it would
  silently switch off every internal alert). Saved addresses show as chips, one per
  address, behind the existing confirm step. Current value: bundledmum@gmail.com.

### Earlier this branch line — checkout shows Paystack fee as an ESTIMATE (dashboard fee-passing is on)
Paystack's "pass transaction fee to customer" is ON, so Paystack adds its own fee
to whatever we send. We now send only the subtotal (item price + service fee) and
Paystack adds its fee at the point of payment, so the fee and total shown at
checkout are estimates and are labelled as such. Buyers seeing a slightly
different number on the Paystack page must not think something is wrong.
- **marketplace-initialize-payment is v5.** INPUT `{ order_id, callback_url }` →
  `{ authorization_url, reference, subtotal_naira, paystack_fee_naira, amount_naira,
  fee_added_by_paystack }`. subtotal_naira = what we send to Paystack (item +
  service fee); paystack_fee_naira = ESTIMATE of what Paystack adds (can be ~a
  naira off their rounding); amount_naira = subtotal + estimate; fee_added_by_paystack
  is true when Paystack adds the fee. ALL figures come from this response, none are
  computed client side. `InitPayment` in `checkout/orders.ts` was widened to match.
- **Breakdown (`checkout/CheckoutPage.tsx`), four lines:** Item price · Service fee
  (non refundable) · Payment fee "Estimated, added by Paystack" shown as "about
  ₦X" · total labelled "You will be charged" "about ₦X". A note reads "Paystack
  adds its fee at the point of payment, so the amount on the next page may differ
  by a naira or two. That is normal." The Pay button says "Pay about ₦X". When
  `fee_added_by_paystack` is false, the payment-fee line and note are hidden and
  the total is exact ("Total", "Pay ₦X"). Verified live: with fee-passing on the
  breakdown reads Item ₦49,500 · Service ₦1,000 · Payment fee about ₦867 · "You
  will be charged about ₦51,117" and the button "Pay about ₦51,117".
- Everything else in checkout is unchanged: the Pay redirect to authorization_url,
  the held-funds box, listing-unavailable / payments-unavailable / own-listing
  states, the reduced header, guest-no-login, the transfer fallback, and the
  ownerless-order guard.

### Earlier this branch line — ADMIN marketplace operations (payouts, disputes, sellers, listings, orders, money owed, dashboard)
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

### Auth storage decision — SUPERSEDED, see "session persistence fixed" pass above (commit `f15858f`)
The decision below (cookie storage retained) was reversed in the pass at the
top of §5, after diagnosing a real, confirmed bug: WebKit caps any
`document.cookie`-set cookie's real lifetime to 7 days regardless of the
Max-Age requested, which was silently logging mobile sellers out. Session
storage is now plain `localStorage` again, same as this section originally
weighed against. Left the original reasoning below for the historical record
of why it was retained at the time — it was the right call THEN, given what
was known then; new evidence changed the tradeoff.

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

### Security hardening pass (XSS audit, admin idle timeout audit, upload error handling, error-message leakage)
Four-item pass, each item audited/fixed independently.

**Item 1 — XSS on user-supplied text: audited, no vulnerability found, no fix
needed.** Grepped the entire repo for `dangerouslySetInnerHTML`, `.innerHTML =`,
`.outerHTML =`, `insertAdjacentHTML`, `document.write`, and sanitizer libraries.
Every marketplace user-text field (listing titles, descriptions,
`condition_notes`, seller display names, dispute reasons, category answers in
`marketplace_listings.attributes`, admin rejection reasons, dispute
`outcome_notes`) is rendered exclusively through React `{}` interpolation, which
escapes by default — confirmed no raw-HTML sink touches any of it anywhere in
the app. Repo-wide raw-HTML sinks found, all confirmed safe:
- `Breadcrumb.tsx` — `dangerouslySetInnerHTML` on `JSON.stringify(jsonLd)` inside
  a `<script type="application/ld+json">` tag. Data is storefront/category/product
  titles, not marketplace user free text, but `JSON.stringify` doesn't escape
  `<`, so this is a real (low-risk, out-of-marketplace-scope) script-tag-breakout
  vector. Left unfixed per this task's scope (marketplace only) and flagged as a
  separate background task instead of fixed inline.
- `DbPageContent.tsx` — renders CMS `pages.content` (admin-authored Privacy/
  Terms/About pages) via `dangerouslySetInnerHTML`. This is exactly the
  "trusted CMS content" case the task expected to find — no fix needed.
- `components/ui/chart.tsx` — shadcn/ui internal boilerplate, not user data — no
  fix needed.
- `PrintInvoice.tsx`, `AdminFinance.tsx`, `AdminOrders.tsx` — each uses
  `document.write` for print views, but each has its own `esc()`/`escapeHtml()`
  function applied consistently to every piece of customer/employee text
  (address, phone, name, product name, etc.) before interpolation. Confirmed
  properly escaped — no fix needed.

**Item 2 — Admin idle timeout after the cookie→localStorage auth change:
audited, confirmed unaffected, no fix needed.** Two idle-timeout
implementations exist: `IdleTimeoutGuard.tsx` (the live one — mounted
unconditionally for every authenticated admin in `AdminLayout.tsx`, 20-minute
idle timeout, 60s warning, 12h absolute cap, resets on
mousedown/keydown/touchstart/click, cross-tab synced via `BroadcastChannel`,
signs out via `supabase.auth.signOut()` + redirect on expiry) and
`useIdleTimeout.ts` (a separate, simpler 30-minute version — confirmed dead
code, imported nowhere; noted as a discrepancy worth cleaning up later, not
touched). Traced `IdleTimeoutGuard`'s only storage dependency: a `sessionStorage`
key (`admin_session_start`) it owns itself for its own absolute-cap bookkeeping
— entirely separate from Supabase's own session storage medium (which the
auth-storage work above already settled back to plain `localStorage`). No code
path in the guard reads Supabase session/cookie state at all, so the storage
medium change cannot affect it. Supplemented the static trace with a live check
in an active admin session (inspected `sessionStorage.admin_session_start`
directly) — confirmed present and behaving as expected. The full real-time
20-minute firing was not observed live; to confirm by hand: log in as admin,
stay idle (no mouse/keyboard/touch/click) for 19 minutes and confirm the
60-second warning appears, then let it run out and confirm it signs out and
redirects to `/admin/login`.

**Item 3 — Storage rejections now surface a clear, actionable message
everywhere a photo is uploaded.** Found 3 upload sites: listing photos
(`CreateListingPage.tsx`), seller dispatch photo (`SellerDispatchPage.tsx`),
buyer dispute evidence photos (`BuyerDisputePage.tsx`) — all go through
`compressImage`/`processListingImage` in `sellData.ts` before uploading to the
`marketplace-listings` bucket (5MB limit, JPEG/PNG/WebP/HEIC/HEIF only,
enforced server-side by Supabase Storage). Previously, the whole pipeline
(decode + canvas compress + upload) was wrapped in one try/catch per call site
that on failure showed either nothing actionable or a generic
connection-sounding message, even for a size/type rejection — misleading, and a
genuinely undecodable file (e.g. a PDF renamed `.jpg`) would silently fall back
to uploading the raw unprocessed file rather than erroring clearly. Fixed by
adding to `sellData.ts`:
- `UnsupportedImageError` — thrown by a new `decodeBitmap()` helper only when
  BOTH an orientation-aware and a plain `createImageBitmap()` decode fail (i.e.
  the file genuinely isn't a readable image); all other failure points in the
  canvas/toBlob pipeline keep their own local fallback-to-original behaviour
  unchanged, preserving the existing "never lose a legitimate quirky photo"
  resilience.
- `describeUploadError(error)` — maps `UnsupportedImageError` to "that file
  doesn't look like a photo," Supabase Storage's size-rejection message to "file
  too large" (max 5MB), its MIME-rejection message to "not a supported photo
  type" (jpg/png/webp/heic/heif only), and anything unrecognized to a generic
  retry message while logging the real error to console for debugging.
Wired `describeUploadError` into the catch blocks of all 3 upload sites'
submit handlers. Also added per-file error handling in `CreateListingPage.tsx`'s
`addPhotos()` so one undecodable file among a multi-photo batch is skipped and
named in an inline message, instead of aborting the whole batch or failing
silently.

**Item 4 — Raw DB/RPC error strings could reach the screen in 3 places;
fixed.** Audited every Supabase/RPC call site across create listing, seller
setup, checkout, dispute raising, and the seller dashboard. Deliberately
human-readable trigger errors (missing category details, bank account name
mismatch, legal name locked) are correctly parsed and shown already — left
untouched. `orders.ts`/`CheckoutPage.tsx` (checkout) and `buyerOrders.ts`
(dispute raising) already never show a raw message — confirmed correct, not
touched. Found and fixed 3 unguarded fallbacks that would have shown a raw
`error.message` to the user for any unrecognized DB error: `CreateListingPage.tsx`
(listing insert fallback), `SellerSetupPage.tsx` (customer-link insert and
seller insert fallback), `SellerDashboardPage.tsx` (`EditProfile` save
fallback). Added `genericErrorMessage(context, error)` to `sellData.ts` — logs
the real error to console and returns one fixed friendly string — and wired it
into all 3 fallbacks. Scoping note: admin screens' equivalent raw-`.message`
passthroughs were left untouched — admins are trusted internal staff, the task
named only customer/seller-facing areas, and the pattern is a consistent,
established convention across every admin screen in this codebase, not an
oversight specific to marketplace.

Build (`npm run build`) and `npx tsc --noEmit` both pass after all changes.

### Genuine desktop, seven screens (design 18a)
Implemented the approved Claude Design doc's desktop layouts for the seven
buyer/seller order-management screens that didn't already have one (browse
and listing detail already had desktop layouts from B4/14a). Same approach as
those two precedents: additive `@media (min-width:1024px)` rules only, mobile
markup untouched below 1024px. Screens: my orders, buyer order detail, report
a problem, seller dashboard, seller order detail, seller dispatch, seller
payouts.

- **My orders** (`BuyerOrdersListPage.tsx`) — single column, widened to
  760px, centred. The "needs your action" row's status pill gets a
  desktop-only button treatment (padding/radius bump via a new `.cta` class),
  no markup change on mobile.
- **Buyer order detail** (`BuyerOrderDetailPage.tsx`) — splits 55/45 at
  960px: item, price breakdown, timeline and dispatch photo left; countdown,
  seller contact and the confirm/report actions right, sticky at 24px. Body
  content is re-parented into two new `.mkt-od-left`/`.mkt-od-right` wrapper
  divs that are `display:contents` below 1024px (same technique as the
  existing `.mkt-detail-gallery`/`.mkt-detail-panel` split from design 14a),
  so mobile order and rendering are unchanged. The confirm/report button
  block keeps its `.mkt-sell-foot` class (still a fixed bottom bar on
  mobile, since `position:fixed` escapes the `display:contents` ancestor
  regardless of nesting) and becomes the static foot of the sticky right
  column at desktop.
- **Report a problem** (`BuyerDisputePage.tsx`) — single column, widened to
  620px, centred. No grid change needed for the evidence photo tiles, they
  already wrap in a flex row, so the wider column just fits more per row
  (the "4 tiles becomes 6" the design doc describes happens for free).
- **Seller dashboard** (`SellerDashboardPage.tsx`) — splits into a
  persistent 300px left column at 1080px: an "owed to you" balance card and
  a "list something new" button. Both are NEW desktop-only elements
  (duplicating the equivalent mobile-only "owed" card that lives inside the
  Orders tab, and the mobile-only fixed "list another item" footer button)
  rather than moved/hoisted, specifically so the existing tab-scoped mobile
  behaviour is not touched — they're hidden by default and only shown
  ≥1024px. Right column holds the existing edit-profile panel, debit
  warning, tabs and rows unchanged.
- **Seller order detail** (`SellerOrderDetailPage.tsx`) — same
  left/right re-parenting technique as buyer order detail, splits 55/45 at
  900px: item, payout figure and buyer contact left; dispatch photo,
  timeline and the mark-as-dispatched action right (sticky).
- **Seller dispatch** (`SellerDispatchPage.tsx`) — max content width is
  unchanged at 560px per the design doc (a single confirmation step reads
  better narrow even on a wide screen); only the photo drop/preview tile
  grows taller (220px) at desktop.
- **Seller payouts** (`SellerPayoutsPage.tsx`) — single column, widened to
  700px. Each row gains a date and a "to" bank account column (desktop-only,
  hidden on mobile) since there's room; a labelled header row sits above the
  list. Date is `created_at` (no separate payout-sent timestamp exists in the
  schema); bank is the seller's single account, same for every row.

Every new desktop-only element (balance card, list button, payout date/to
columns, header row) is hidden by default and shown only inside the
`@media (min-width:1024px)` blocks, so nothing new renders or is computed
differently on mobile. Build and typecheck both pass. **Not verified live**:
this session's browser preview tool is capped at ~453px viewport width and
these pages need a real login (magic-link auth, no test credentials
available here), so the ≥1024px layouts have been reviewed by code only, not
visually confirmed in a browser. Worth a human pass at a real desktop
viewport, logged in as both a buyer with an order and a seller with
orders/listings, before calling this fully verified.

### Held-funds promise, standardised wording
The standard, taken from listing detail's how-it-works explainer (already
live, not changed here): **"...until you confirm the item arrived as
described."** The email templates were already updated to match in the
database. This pass aligned every other buyer-facing instance of the same
promise so it reads identically everywhere:
- `CheckoutPage.tsx` — the pay-now held-funds box, and the bank-transfer
  fallback's held-funds box (behind the transfer toggle, still live code).
- `PaymentReturnPage.tsx` — the payment-succeeded screen's reassurance line.
- `BuyerOrderDetailPage.tsx` — the timeline's "Payment held by us" step, and
  the held-reassurance paragraph shown while awaiting dispatch/confirmation.
- `MarketplaceFooter.tsx` — the sitewide "Sellers checked..." protection line.

Deliberately left alone, because they answer a different question rather
than restating this promise inconsistently: the disputed-state copy in
`BuyerOrderDetailPage.tsx`/`BuyerDisputePage.tsx` (describes dispute-review
timing, not the confirm trigger); the confirm button and confirm-sheet copy
in `BuyerOrderDetailPage.tsx` (the confirm *prompt* itself, which already
says "and is as described"); `AwaitingPaymentPage.tsx`'s three-step preview
(doesn't state a trigger/condition at all, so there's nothing to conflict
with); and `SellerOrderDetailPage.tsx`'s "buyer will confirm" copy (seller-
facing, telling the seller what the buyer needs to do, not a promise made to
a buyer).

### Listing detail: how-this-works explainer (design 19a), replacing the single green line
The old one-line reassurance above Buy now ("Your money is held safely until
you confirm the item arrived as described. Seller details are shared right
after payment.") is replaced with a collapsible explainer,
`src/marketplace/components/HowThisWorksExplainer.tsx`, following design 19a
exactly: collapsed by default, headline + tick always visible with no
interaction required, tapping opens six numbered steps in place (no
navigation, no modal). Same position on mobile as the line it replaces
(directly above the fixed Buy now bar, last item in the body); on desktop it
stays inside the sticky right purchase panel (never the left gallery
column), immediately before Buy now in both layouts. Desktop switches to a
2×3 step grid with shorter step copy instead of the mobile long list, since
the sticky panel is narrower than a full page but wider than a phone; the
"every seller checked, every listing reviewed" trust line renders in both
expanded states. No gendered pronouns anywhere in the copy (the design's own
mockup illustrates with "Amaka/she", not a literal instruction) — the
seller's real display name and "they/their" are used instead, consistent
with the rest of this codebase, which never genders sellers or buyers.

One placement judgement call, flagged in case the literal mockup was wanted:
the desktop mockup (screens T3/T4) shows the widget positioned immediately
after the seller row, above condition notes, the spec block and the
description. That mockup is a zoomed, standalone "purchase card," not the
full real page, none of those other sections appear in it. Reproducing that
exact adjacency on the real page would need CSS `order` applied to every
sibling in `.mkt-detail-body` (fragile: any future new field would silently
jump ahead of Buy now unless someone remembers to give it an order value
too). The design's stated requirement is narrower — "not the left column...
must sit beside Buy now" — which this implementation satisfies without that
risk, by leaving the widget in its existing last-before-Buy-now position on
both breakpoints (unchanged from where the old line always sat). Revisit if
the exact seller-row adjacency turns out to matter.

**Wording mismatch to flag**: the design's headline and step 5 both say
"confirm it arrived" (not "arrived as described"), folding the described-
condition nuance into step 6 ("something wrong? report it") instead of the
promise sentence. This is narrower than the "arrived as described" standard
just aligned across checkout, the payment-succeeded screen, buyer order
detail, the footer, and the confirmation email template in the previous
pass. Implemented the design literally rather than inventing a variant of
it; flagging so a human can decide whether the explainer's headline/step 5
should also gain "as described" for full consistency, or whether the
six-step structure (a short promise plus an explicit dispute step) is
intentionally a different, acceptable framing for this specific widget.

### Create listing: honesty guidance, condition fields
Added a guidance card (`.mkt-honesty` in `marketplace.css`) directly between
the condition chips and the condition-notes textarea in
`CreateListingPage.tsx` — at the point disclosure actually happens, not a
top-of-form banner and not in seller onboarding. Replaces the old generic
line ("Mention any scuff or missing part, honesty prevents disputes.") with
the concrete consequence: a buyer cannot ask questions before buying, so an
undisclosed flaw only surfaces once the parcel is open; declaring a flaw
does not cost the sale, but a mismatch does, since the buyer can report it,
BundledMum reviews it, and a seller found at fault is refunded-against on
that order, unpaid, and struck, three strikes suspends selling. Prompts for
the specific things that actually cause disputes: marks or stains, missing
parts, fading, a stiff or broken zip, worn soles, anything that no longer
works, and whether it has been washed. Styled as advice (green-light, same
register as `.mkt-reassure`/`.mkt-heldbox`), not a warning (no coral, no
red). The phone-number instruction stays as its own separate help line
underneath, unrelated topic, still necessary. Not verified live: this page
needs a real seller login (magic-link, no test credentials available this
session); confirmed by build + typecheck and by reading the rendered CSS in
the build output only.

**Condition notes has no minimum length, client or database.** Submit-time
validation is `!conditionNotes.trim()` only, a seller can currently submit
a single word or character. Confirmed no DB-side CHECK constraint or
trigger enforces any length either (checked directly against the database).
Not adding a minimum this pass, per the prompt, flagging for a separate
decision.

### Return flow (design 20a): send-back, refund by bank transfer, admin returns queue
Backend was already deployed (no migrations this pass): `marketplace_disputes`
gained `return_requested_at, return_sent_at, return_received_at,
return_confirmed_by, refund_bank_name, refund_account_name,
refund_account_number, refund_paid_at, refund_paid_by`, alongside the
existing `return_required, return_proof_url, return_shipping_cost_naira`.
Four RPCs, all boolean:
1. `buyer_mark_return_sent({ p_dispute_id, p_return_proof_url, p_bank_name, p_account_name, p_account_number, p_return_shipping_cost_naira })`
   — proof + all three bank fields required, buyer-only, only once,
   only when `return_required` is true.
2. `seller_confirm_return_received({ p_dispute_id })` — seller only, their
   own order, only after the buyer marked it sent. **This releases the
   refund** and sets the order `refunded`.
3. `admin_confirm_return_received({ p_dispute_id })` — admin can confirm
   on the seller's behalf at any time, not gated on overdue.
4. `admin_mark_return_refund_paid({ p_dispute_id })` — records the refund
   bank transfer was actually sent; only after the return is confirmed
   received. Sets `settlement_status = 'settled'` on the order (bookkeeping
   only, doesn't move money, same pattern as the existing
   `admin_mark_refund_paid`/`admin_mark_payout_released`).

**Refunds go out by bank transfer, never back to the card**, which is why
bank details are collected at return time (`BuyerReturnPage.tsx`), not at
checkout — almost no buyer ever needs one. **All six emails are fully
automatic**, fired by two DB triggers on `marketplace_disputes`
(`trg_marketplace_return_emails` for the five return-lifecycle ones,
`trg_marketplace_dispute_emails` already existed for raise/resolve) plus a
daily overdue sweep; nothing here calls any email function.

**Two gaps found in the database that were not part of this task's stated
scope, but were required for the feature to be reachable at all:**
- `admin_resolve_dispute`'s `p_return_required`/`p_return_shipping_payer`
  params existed but nothing in the admin UI ever set them (defaulted to
  `false`/`null` always) — extended `MarketplaceDisputes.tsx`'s ruling panel
  with a "does the buyer need to send this back?" toggle + shipping-payer
  chips, shown only for the two outcomes that actually refund the buyer
  (`full_refund`, `courier_fault`), wired through the existing RPC params.
- `return_requested_at` is never written by any function in the database
  (checked every function body). Genuinely orphaned. Not relied on anywhere
  in this pass; `resolved_at` is used instead wherever a "since when" is
  needed. Flagging for whoever owns the schema, not fixed here (no
  migrations this pass).
- `groupBuyerOrders()`/`groupSellerOrders()` had no bucket at all for
  `order_status === 'refunded'` — such orders were invisible on My orders
  and the seller dashboard (pre-existing, not caused by this task, but it
  would have made the return flow unreachable from the list page). Both
  now include `refunded` in an existing bucket.
- `marketplace_returns_awaiting_confirmation` does not expose the refund
  bank columns despite being the obvious place an operator would want them.
  `MarketplaceReturns.tsx` reads those directly off `marketplace_disputes`
  for the "refund transfers to record" section instead (admin already has
  full `SELECT` there, confirmed via RLS policy, same pattern the disputes
  screen already uses for its manual joins).

**What was built:**
- **Buyer, mark return sent** — new `BuyerReturnPage.tsx`
  (`/orders/:orderId/return`), single proof photo (same upload pattern as
  dispute evidence, buyer's own auth uid folder), bank name/account
  name/account number as free text (no bank-picker dropdown — the RPC takes
  free text, no banks reference table exists to pick from), optional
  shipping cost. The two specific RPC rejections get exact human copy.
- **Buyer, waiting/resolved** — `BuyerOrderDetailPage.tsx` gained a
  `refunded` branch covering all of: return needed but not sent, waiting on
  the seller (with the overdue safety-net line, using
  `site_settings.marketplace_return_confirm_days`, never hardcoded), refund
  released, refund sent, and an outright refund with no return at all.
- **Seller, confirm return received** — `SellerOrderDetailPage.tsx` gained
  disputed + return-in-progress states: item, the buyer's proof of posting,
  a "before you confirm" consequence box, the confirm action behind a
  confirm-step bottom sheet (this app's existing pattern), and the same
  overdue safety-net line from the seller's side.
- **Admin returns queue** — new `MarketplaceReturns.tsx`
  (`/admin/marketplace/returns`, nav link added), two sections: returns
  awaiting confirmation (overdue rows in error red `#C0392B`, two actions —
  confirm now / confirm on seller's behalf, identical RPC either way, just
  different labels for context) and refund transfers to record (bank
  details shown here, where the operator actually needs them, both actions
  behind `ConfirmDialog`).
- **Listing detail + checkout copy** — one line folded into the existing
  `HowThisWorksExplainer` step 6 (both long and short variants), one 4th
  tick added to checkout's existing held-funds box. No new section, no
  layout change, Buy now stays exactly where it was — verified live in the
  browser on both public pages.
- **Short condition-notes nudge** — coral, non-blocking, shown under
  `SHORT_NOTES_LENGTH = 20` characters (the design says "quite short" but
  gives no exact number, chose 20 and am stating it explicitly rather than
  picking silently). Visually distinct from `.mkt-input.error` red.

**Wording note**: I corrected "she has N days from delivery" (RT2's mockup
text) to "N days from when you posted it" in the actual implementation —
the database view's overdue calculation (`is_overdue`) measures from
`return_sent_at`, there is no separate "delivery" timestamp for a returned
item, so the mockup's literal phrase would have described a date the app
does not actually track.

**Not verified live**: buyer/seller return states, the admin ruling toggle,
and the admin returns queue all need a real login this session doesn't have
credentials for (buyer/seller magic-link, admin password) — confirmed by
build + typecheck + code review only. Listing detail's step 6 and checkout's
4th tick ARE both verified live (screenshots, no console errors).

### Seller listing edit, status-aware (design 21a)
Sellers previously could not edit a listing at all after submitting — the
rejection email tells them to fix and resend, and "Fix and resend" on the
dashboard actually opened a blank new-listing form. That is the bug this
pass fixes.

Backend was already deployed (no migrations this pass): a "Seller updates
own listing" UPDATE policy on `marketplace_listings`, plus the
`guard_seller_listing_edits` trigger enforcing, per status:
- **`live`**: `price_naira` may only be lowered, nothing else may change
  (a content change bundled into the same update that also delists it is
  blocked, so edited content can never sneak back up without review).
- **`rejected` / `delisted` / `pending_review`**: anything editable, status
  may only move within that same trio or to `pending_review`.
- **`sold`**: nothing editable.
- **Never, any state**: a seller cannot set `status = 'live'` (only admin
  review does that), nor touch `quantity_sold`, `seller_id`, `reviewed_by`.
Traced the trigger's actual SQL (not just the prompt's summary) to confirm
this precisely, including one detail worth flagging: the trigger does not
itself restrict what `new.status` a seller can set FROM `live` (only price
and content), which is exactly what makes a plain `{ status: 'delisted' }`
update — no RPC — the correct, working mechanism for delist-then-edit;
`track_marketplace_delisting` auto-stamps `delisted_by = 'seller'` on that
transition. `enforce_required_category_fields` (the existing "Missing
required details" trigger) fires on UPDATE too whenever status moves into
`pending_review`, confirmed a resubmit is validated exactly like a fresh
submission.

**What was built:**
- **`CreateListingPage.tsx`** now handles both create (`/sell/new`, no
  `:id`, unchanged behaviour) and full edit (`/sell/listings/:id/edit`) —
  the design's own instruction was "full create-listing form reused as-is",
  so this is the same component and JSX, not a duplicate file. Edit mode
  fetches the existing listing (own listings only, redirects away for
  `live`/`sold`), pre-fills every field including category answers,
  reverse-maps the `condition` enum back to its chip label and strips the
  `"{Label}. "` prefix create-listing composes onto `condition_notes` (new
  `stripConditionPrefix` in `sellData.ts`) so the notes field shows just the
  seller's own text, and resolves `location_state`'s name back to a
  `stateId` for the dependent selects. Existing photos carry over without
  re-uploading (`PhotoDraft.blob` null vs a newly added one); only new
  photos go through the compress/upload pipeline, order preserved so the
  first stays the cover. Submit does a direct `UPDATE` (never an RPC) with
  `status: 'pending_review'` always, never `seller_id`/`quantity_sold`/
  `reviewed_by`/`final_price_naira`/`markup_percent`. The rejection reason
  shows as a prominent banner at the top for a `rejected` listing. Success
  screen text differs for edit ("Sent back for review... not live yet")
  from create.
- **New `SellerPriceEditPage.tsx`** (`/sell/listings/:id/price`) — the
  live-only price screen: current price struck through, new price input,
  live buyer-price preview, the rest of the listing shown dimmed with a
  plain-language "locked while live" explanation, a "Delist it first" link
  always present (not just when blocked). Raising the price is caught
  client-side (button disabled, red inline message, an extra "Delist and
  edit fully" box) and the same database rejection is handled the same way
  if it ever slips through — `parseListingEditError` (new, `sellData.ts`)
  passes the three known trigger messages through as human copy, never raw.
- **Delist-then-edit**: a confirm sheet (this app's existing
  `.mkt-sheet-overlay` pattern) reachable from both the plain and blocked
  states on the price-edit screen, honest that it delists immediately and
  needs review again, then navigates straight into the full edit for that
  now-delisted listing.
- **Dashboard** (`SellerDashboardPage.tsx`): three distinct action labels
  per status group, per the design — "Lower price" (live, new), "Fix and
  resend" (rejected, now actually goes to the listing being edited instead
  of a blank form), "Edit & resubmit" (delisted+seller-owned, new, sits
  alongside the existing "Put it back up" relist-as-is action, doesn't
  replace it), "Edit" (pending_review, new). Sold rows unchanged, no action.

**Tested against the database directly**: temporarily set a real live
listing (`8c20a4c1-04c4-4e86-bbcc-d4f2f816e2f8`, "Baby christening/Newborn
shoe") to `status = 'rejected'` with a `rejection_reason`, confirmed the
exact field shapes and reverse-mapping logic the edit form depends on
against that real row (condition/condition_notes prefix strip, location
state name → id lookup all checked out), then **reverted it to its original
`status = 'live'`, `rejection_reason = null`** — confirmed by re-reading the
row after revert. **Could not complete a full browser walkthrough**: no
active seller session exists in this environment and there are no
credentials to receive the passwordless magic-link email, same limitation
as every other authenticated page this session. So: verified by tracing the
real trigger SQL, verified real data shapes against the code's
expectations, build + typecheck pass — not verified by clicking through the
UI as a logged-in seller. Worth a human walkthrough before calling this
fully done: rejected → edit → resubmit → pending_review, and live → lower
price / delist → edit → resubmit.

### Make an offer (design 23a) — buyer/seller negotiation, and a real remaining gap
Backend already deployed (no migrations this pass): `marketplace_offers`
(`listing_id, buyer_id, seller_id, buyer_discount_naira, buyer_price_naira,
seller_amount_naira, counter_seller_amount_naira, counter_buyer_price_naira,
status, expires_at, responded_at`, unique on `(listing_id, buyer_id)` — one
offer per buyer per listing forever, whichever way it goes). `status` ∈
`pending, accepted, declined, countered, counter_accepted, counter_declined,
lapsed, void`. `marketplace_orders` gained `offer_id`, `offer_discount_naira`
(not yet written by anything, see below). Three RPCs, read in full against
the live database, not just summarised: `buyer_make_offer({p_listing_id,
p_discount_naira})`, `seller_respond_to_offer({p_offer_id, p_action,
p_counter_seller_amount})` (`p_action` ∈ accept/decline/counter),
`buyer_respond_to_counter({p_offer_id, p_accept})`. Settings, all read live,
never hardcoded: `marketplace_offers_enabled`, `marketplace_max_discount_percent`
(the cap is computed against the buyer-facing marked-up price, confirmed
from the RPC body — this is why the cap is shown to buyers as a naira
figure derived from that percent, never the percent itself),
`marketplace_offer_expiry_hours`.

**THE MONEY RULE, enforced by which columns are ever SELECTed, not by
convention**: `src/marketplace/offers.ts` keeps two disjoint column lists,
`BUYER_OFFER_SELECT` (never names `seller_amount_naira`/
`counter_seller_amount_naira`) and `SELLER_OFFER_SELECT` (never names
`buyer_discount_naira`/`buyer_price_naira`/`counter_buyer_price_naira`) —
mirrors the existing `BUYER_ORDER_SELECT`/`SELLER_ORDER_SELECT` pattern
exactly. `SellerOfferPage.tsx` and the dashboard's offers block never fetch
or render a buyer-facing figure at all; a seller countering enters what
*they* would take, the buyer price is computed server side inside the RPC,
this never asks a seller for a buyer number. A seller also never learns the
buyer's identity at the offer stage (matches this app's whole
"seller contact only revealed after payment" model) — the design's own
mockup confirms this ("Someone made an offer", no name).

**`status = 'lapsed'` is never written by anything** — checked every
function body in the database, same class of gap as `return_requested_at`
last pass. `seller_respond_to_offer` blocks acting on an offer past
`expires_at`, but nothing ever flips its `status` column to `'lapsed'`.
`isLapsed(offer)` in `offers.ts` computes this client side
(`status === 'pending' && expires_at < now()`) rather than trusting the
stored value, and both `BuyerOfferPage.tsx` and `SellerOfferPage.tsx` use it
instead of a raw status check.

**What was built**: `MakeOfferSheet.tsx` (O1, its own overlay class so only
this sheet becomes a centred desktop modal, no other confirm sheet in the
app changed); `BuyerOfferPage.tsx` at `/listing/:id/offer` (O2 waiting, O3
countered, O5 declined/lapsed, O9 sold-out-mid-offer — accepted/
counter_accepted redirect straight back to listing detail, nothing to show
here for those); `SellerOfferPage.tsx` at `/sell/offers/:offerId` (O6
incoming, O7 counter sheet, O8 waiting + outcomes), reusing the seller
order detail two-column desktop wrapper class for visual consistency (not
literally embedded in the orders page, offers aren't orders yet). Listing
detail gained: the entry point (hidden when `offers_enabled` is false, or
once this buyer has spent their one offer here in any direction — both
cases render identically to a listing that never had offers, design O10);
an accepted-offer personal price with strikethrough + "just for you" tag,
private to that buyer only, the public `final_price_naira` untouched for
everyone else even on a multi-quantity listing (design O4/edge case).
Seller dashboard gained an "Offers on your listings" block, own numbers
only, shown only when one exists.

**The one piece that is genuinely NOT safe to rely on yet — flagging this
clearly rather than letting it look finished**: "accepted offers lead into
checkout at the negotiated price" requires `create-marketplace-order` to
change, and I did not touch it (non-goal, reporting only). I read its full
deployed source (v5): it derives `item_price_naira` from
`listing.final_price_naira` and `seller_share_naira` from `listing.price_naira`
directly off the listing row — **there is no `offer_id` concept in the
function at all today**. What it needs: accept an optional `offer_id` in
the request body; when present, verify it belongs to this buyer+listing and
is `status IN ('accepted','counter_accepted')` and has not already been
consumed by a prior order; use `counter_buyer_price_naira ?? buyer_price_naira`
in place of `listing.final_price_naira` and `counter_seller_amount_naira ??
seller_amount_naira` in place of `listing.price_naira`; write `offer_id` and
`offer_discount_naira` onto the inserted order; mark the offer consumed
(`status: 'void'`, the schema's own reserved value for exactly this) so it
cannot fund a second order.

Until that ships, `createMarketplaceOrder()` (`orders.ts`) already sends
`offer_id` when checking out from an accepted offer — forward-compatible,
currently a no-op the function ignores. `CheckoutPage.tsx` shows the
negotiated price pre-order, but **once the real order comes back from the
server, it is compared against the expected negotiated price** — today they
will not match, and checkout deliberately stops before the Pay button ever
renders, showing "we need to sort this out first" rather than silently
charging the full listing price after showing the buyer a lower one. Do not
consider the offer flow safe to advertise to real buyers until the edge
function change lands and that mismatch stops firing.

**Not verified live**: the make-an-offer entry point and its hide/show
behaviour under `marketplace_offers_enabled` WERE verified live (screenshots,
toggled the setting off then back on directly in the database, confirmed and
reverted). Everything past the login wall — actually sending an offer,
seller responding, countering, accept/decline, the dashboard offers block —
could not be walked through, same credential limitation as every other
authenticated page this session. Verified instead by reading all three RPC
bodies directly and matching the code's queries/payloads to them exactly.

### Contextual marketplace login
The marketplace login (`auth/MarketplaceLoginPage.tsx`) used to show the same
generic "Sign in" copy no matter what sent someone there. `sendToMarketplaceLogin`
(`auth/marketplaceLogin.ts`) now takes an optional second argument, a
`LoginReason` — a closed TypeScript union (`offer | sell | seller | orders |
dispute | return | payment`), not a bare string, so a new gate has to
either pick one of these or add a new one with its own copy; it cannot
silently ship reasonless. Each reason's `{ lead, sub }` copy lives in one
map, `LOGIN_REASON_COPY`, the single source of truth the login page reads
from via `?reason=`. **Any future gate in the marketplace must call
`sendToMarketplaceLogin(returnTo, reason)` with a real reason, not just
`sendToMarketplaceLogin(returnTo)`** — the type system won't stop the old
one-argument form (reason is optional so the fallback always works), but
the whole point of this pass is that a bare reasonless gate is now the
exception needing a good excuse, not the default.

**Every gate found and its reason**, all traced individually, not assumed:
`offer` — `ListingDetailPage.tsx` (make an offer), `BuyerOfferPage.tsx`
(view your own offer). `sell` — `BecomeSellerPage.tsx`, `SellerSetupPage.tsx`,
`CreateListingPage.tsx` (listing with no account yet). `seller` —
`SellerDashboardPage.tsx`, `SellerPayoutsPage.tsx`, `SellerOrderDetailPage.tsx`,
`SellerDispatchPage.tsx`, `SellerPriceEditPage.tsx`, `SellerOfferPage.tsx`.
`orders` — `BuyerOrdersListPage.tsx`, `BuyerOrderDetailPage.tsx`. `dispute` —
`BuyerDisputePage.tsx`. `return` — `BuyerReturnPage.tsx`. `payment` —
`AwaitingPaymentPage.tsx` (the bank-transfer fallback, already sign-in-bound
before this pass, off by default). `MarketplaceHeader.tsx`'s two "Log in"
links (desktop nav + mobile menu) deliberately carry no reason — there
genuinely isn't a specific action behind them, so they correctly land on
the generic fallback rather than an invented one.

**Bug found and fixed in the same pass**: `SellerOfferPage.tsx` read
`isLoggedIn` but never actually redirected a logged-out visitor — it fell
through silently to "Offer not found" instead of "please sign in". Added
the missing gate (reason `seller`), matching every other seller page.

**Confirmed no bug on buying**: `CheckoutPage.tsx` uses `isLoggedIn` only to
decide which contact fields to collect, it never redirects — guest checkout
has no login gate at all, and none of the `LOGIN_REASON_COPY` entries
describe or imply buying.

**Verified live**: every `LOGIN_REASON_COPY` entry renders correctly by
navigating straight to `/marketplace/login?reason=<key>` (screenshotted:
`offer`, `seller`); a made-up `reason=bogus` and no `reason` at all both
fall back cleanly to "Sign in / The marketplace uses your BundledMum
account..." with no blank space or broken layout; clicking the real "Make
an offer" gate on listing detail end to end confirmed the resulting URL
carries both `returnTo` and `reason` correctly encoded
(`?returnTo=%2Flisting%2F...&reason=offer`), so the existing return-to
destination handling is untouched. No console errors on any of the above.

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

## 7. Pre-launch audit (2026-08-05)

**Historical — a findings snapshot, not current status.** Most of Part 2
and Part 3's findings were fixed the same day in §8. Read this section for
what was *found*, not for what's still true — check CURRENT STATE at the
top of this file, or §8, before treating any specific item here as still
open.

Full six-part audit, report-only except Part 1 (which needed no change). No
design or copy was changed. No migrations or edge functions touched. Some
screens are login-gated and could only be checked by reading the code, not
by walking them live — flagged below wherever that's the case.

### Part 1 — dispute/return/offer writes, RPC vs direct insert

**No fix needed.** `raiseDispute()` in `checkout/buyerOrders.ts` already
calls `cdb.rpc("raise_marketplace_dispute", { p_order_id, p_reason,
p_evidence })` — it was never a direct insert, so removing the direct-INSERT
policy on `marketplace_disputes` closed a hole the frontend was never using.
Checked every other write to a marketplace table:
- `offers.ts` — `buyer_make_offer`, `buyer_respond_to_counter`,
  `seller_respond_to_offer`, all RPCs.
- `sellerOrders.ts` — `mark_marketplace_order_dispatched`,
  `seller_confirm_return_received`, both RPCs.
- `buyerOrders.ts` — `confirm_marketplace_order_receipt`,
  `buyer_mark_return_sent`, both RPCs.
- Direct `.insert()`/`.update()` calls exist only on `marketplace_sellers`
  (`SellerSetupPage.tsx:76`, `SellerDashboardPage.tsx:409`) and
  `marketplace_listings` (`SellerPriceEditPage.tsx:103`,
  `CreateListingPage.tsx:512-513`) — confirmed live via `pg_policies` that
  both tables still grant seller-scoped INSERT/UPDATE, so these are
  intentional and still work.

Nothing was built or committed for this part.

### Part 2 — hardcoded values that have a `site_settings` key

Live values confirmed by direct query, not assumed from the task prompt
(one mismatch found: the task said offer expiry is "currently 2," live is
actually 24 hours):

| Setting | Live value | Stale fallback found |
|---|---|---|
| `marketplace_service_fee_naira` | 1000 | `CheckoutPage.tsx:122` — `?? 750` |
| `marketplace_max_discount_percent` | 25 | `ListingDetailPage.tsx:70` default `10`; `policySettings.ts` `num(..., 10)` |
| `marketplace_offer_expiry_hours` | 24 | `offers.ts:39` fallback `48` |
| `marketplace_markup_percent` | 10 | `SellerPriceEditPage.tsx:62`, `CreateListingPage.tsx:177` both default `10` — matches today, but drifts silently the next time markup is changed (same latent pattern, now more likely to bite given "apply to existing listings" is a normal admin action) |

`policySettings.ts`'s `maxDiscountPercent`/`offerExpiryHours` fallbacks are
higher severity than the page-level ones above because they feed the
**public** `TermsPage.tsx`, which is likely to be read literally by a buyer
during a dispute.

No `site_settings` key exists at all for two of the values the task asked
about, so these are hardcoded by necessity, not a "not reading live" bug —
worth flagging as a possible future configurability gap rather than fixing
now:
- Minimum photo count — `CreateListingPage.tsx:75`, `const MIN_PHOTOS = 4`.
- Strike threshold — enforced only inside the `auto_suspend_seller_on_strikes`
  DB trigger (`strike_count >= 3`); referenced in prose in `TermsPage.tsx`,
  `SellerProtectionPage.tsx`, `CreateListingPage.tsx`. No single source of
  truth if the DB threshold ever changes.

Low severity, not user-visible: stale "₦750" mentioned in code comments only
in `BecomeSellerPage.tsx:11` and `TermsPage.tsx:25`.

Also found, not part of the ask but adjacent: two live `site_settings` keys
(`marketplace_confirm_nudge_1_hours` = 24, `marketplace_confirm_nudge_2_hours`
= 48) exist in the DB but aren't exposed anywhere in the admin Settings
screen.

Nothing fixed in this pass, per instruction.

### Part 3 — visual/layout walkthrough

- **Footer not pinned to bottom on short pages — confirmed still present.**
  `.mkt` in `marketplace.css` is still only `min-height: 100vh`, no
  flex-column layout to pin the footer. Verified live at 1280×900 on
  `/marketplace/cookies`: footer sits mid-page with a large empty gap below
  it. The later footer-content-reorganization commit only changed what's
  inside the footer, not the root layout, so this is unchanged from when it
  was first flagged. **Medium-high** — affects every short static/policy
  page (cookies, privacy, buyer/seller protection, and any browse result
  with very few matches, e.g. the "0 items" search state, though that one
  currently has enough content above the footer to avoid it in practice).
  Fix: give `.mkt` `display: flex; flex-direction: column; min-height: 100vh`
  and let the main content area take `flex: 1`.
- **No 404 / not-found route inside the marketplace SPA.** `MarketplaceApp.tsx`'s
  `<Routes>` (lines 60-89) has no wildcard `<Route path="*">`. Navigating to
  any unmatched marketplace URL (mistyped or stale link) renders only the
  header and footer with a totally blank content area between them — no
  message, no link back. **Medium.** Fix: add a catch-all route with a
  simple "page not found, back to browse" state.
- **Mobile tap targets on condition-question Yes/No chips are small.**
  `.mkt-condition-chips .mkt-chip` (`marketplace.css:1280`) is `padding: 8px
  12px; font-size: 12px` on mobile — the actual clickable Yes/No buttons for
  each condition question in `CreateListingPage.tsx:926-928` and `:969`, not
  just decorative chips. Effective tap height is roughly 30px, under the
  ~44px usual minimum, on what the task calls out as a specifically
  important control. **Medium.** Fix: bump mobile padding/min-height on this
  specific chip variant.
- **Filters button is 38px tall on mobile** (`marketplace.css:985`,
  `.mkt-filters-btn`, `height: 38px`). Smaller than ideal but not drastically
  so. **Low.**
- **Desktop listing-detail two-column layout at 1024–1200px: confirmed
  holding correctly.** Measured live at 1100px viewport width — gallery
  column 511px + detail panel 480px sit side by side with no wrap, no
  overflow (verified via computed layout, not just a screenshot — the
  in-tool screenshot renderer produced a visually misleading
  downscaled/stale-looking capture at this viewport size that did not match
  the live DOM measurements; trust the DOM numbers here).
- **No horizontal scroll found** on listing detail at 375px mobile width
  (`scrollWidth`/`clientWidth` equal) or on the browse empty-results state.
- **Browse empty-results state (search with no matches) is clean** — "Nothing
  matches just now" copy plus a working "Clear all filters" button, verified
  live.
- **Not checked live (login-gated), code-reviewed only:** seller dashboard
  no-listings empty state, buyer orders list empty state, admin queue empty
  states, admin loading/skeleton behavior generally. No credentials were
  available in this environment to reach these as a real seller/buyer/admin
  session. Cannot claim these were visually verified.
- **Not separately re-checked this pass:** long-content overflow for very
  long listing titles/seller names/category names beyond what the sample
  listing happened to have, and loading-state (blank vs skeleton) behavior
  across screens generally — spot-checked nothing broken on the pages
  visited live, but not exhaustively swept.

### Part 4 — dead ends (no way forward)

- **`CheckoutPage.tsx:455`** — bank-transfer-not-configured state: "Please
  message us on WhatsApp to complete your purchase" is plain text, no link.
  Buyer is fully stuck. **High** (already flagged once before, still
  unfixed as of this pass, since this pass's own scope was report-only).
- **`SellerDashboardPage.tsx:95`** (relist-failure error inside the relist
  confirm sheet, rendered ~line 361) — "Message us and we will help" as
  plain text, no WhatsApp link anywhere in that sheet, only retry/cancel.
  **Medium.**
- **`BrowsePage.tsx:188-192`** — generic fetch-error state ("Please check
  your connection and try again in a moment") has no retry button and no
  `refetch()` wiring, on the single highest-traffic page in the whole
  marketplace. **High.**
- **No 404 route** (see Part 3) is also a dead end in the same sense — a
  mistyped/stale link leaves the visitor on a blank page with no way out
  except browser back.
- Checked clean, has a working exit every time: `ListingDetailPage.tsx`,
  `CheckoutPage.tsx`'s other error states (listing-gone, own-listing,
  payments-down, offer-mismatch — all carry a WhatsApp link + back button),
  `BuyerOrderDetailPage.tsx`, `BuyerDisputePage.tsx`, `BuyerReturnPage.tsx`,
  `BuyerOfferPage.tsx`, `SellerOfferPage.tsx`, `SellerOrderDetailPage.tsx`,
  `SellerDispatchPage.tsx`, `SellerPriceEditPage.tsx`, `CreateListingPage.tsx`
  not-found states, `PaymentReturnPage.tsx`, `AwaitingPaymentPage.tsx`,
  `MarketplaceLoginPage.tsx`, `AreaCombobox.tsx`, `SellerPayoutsPage.tsx`'s
  empty state (no CTA needed, nothing actionable to offer there).

### Part 5 — consistency

- **WhatsApp pre-fill: effectively consistent**, one structural note —
  `checkout/orders.ts:178-181` hand-rolls its own `sellerWhatsAppLink()` /
  `wa.me` builder with its own phone-number normalizer, separate from
  `lib/whatsapp.ts`'s `waHref`/`normalizeNumber`. Used for buyer↔seller
  contact (different number than the support line, so the duplication may
  be intentional), but it's a second parallel implementation that could
  drift. **Low.** Consider folding into `lib/whatsapp.ts` as the one source
  of truth, or leave a comment explaining why it's deliberately separate.
- **Held-funds wording: consistent** across `MarketplaceFooter.tsx`,
  `HowThisWorksExplainer.tsx`, `CheckoutPage.tsx`, `BuyerOrderDetailPage.tsx`,
  `BuyerProtectionPage.tsx`, `TermsPage.tsx` — always "held, not sent" /
  "released once you confirm." No contradictions found.
- **The word "offer" is fully hidden from users.** Buyer copy says "ask for
  a lower price" / "request"; seller copy says "price request" / "would you
  take." The literal word only appears in code identifiers, comments, and
  route paths, never in rendered text.
- **Price formatting: consistent.** Every rendered price goes through
  `formatNaira()` (`sell/sellData.ts`), which coerces via `Number()` and
  falls back to `₦0` rather than rendering `NaN`. Raw `₦` literals found are
  only static labels next to numeric inputs, not actual price renders.
- **No em-dashes found in user-facing text** — every `—` match in the
  codebase is inside a `//` or `/* */` comment.
- **Heading case: consistent sentence case** across every heading sampled.

### Part 6 — untested paths (dispute / return / payout)

Read in full: `BuyerDisputePage.tsx`, `BuyerReturnPage.tsx`,
`BuyerOrderDetailPage.tsx`'s dispute/return rendering, `SellerPayoutsPage.tsx`.

- No null-rendered-as-blank or NaN-arithmetic issues found. Money always
  goes through `formatNaira()` (falls back to `₦0` on a non-finite value,
  `sell/sellData.ts:16-20`); dates are always guarded
  (`field ? new Date(...).toLocaleDateString() : ""`); `maskAccount()`
  returns `"Not set"` for an empty account number; `SellerPayoutsPage.tsx`'s
  bank line falls back to `"your bank"` if `bank_name` is null.
- `SellerPayoutsPage.tsx:76` has an explicit "No payouts yet" empty state.
- `BuyerDisputePage.tsx` / `BuyerReturnPage.tsx` both guard on `!order` and
  on invalid order state before rendering the form, with a clear way back —
  no path to a broken mid-form state.
- **One soft risk, low severity:** `BuyerOrderDetailPage.tsx`'s return-flow
  booleans (`returnNeeded`, `returnWaiting`, `returnReleased`,
  `returnSentBack`, `refundedNoReturn`, lines 87-91) are derived from the
  fetched `dispute` record. If `order.order_status === "refunded"` and the
  `dispute` query is still loading, none of these booleans are true yet, so
  none of the refunded-state boxes (lines 251-295) render for a moment — the
  right column briefly shows nothing but the held-funds reassurance line.
  Self-resolves once the query settles; no crash, no `NaN`. Fix: show a
  loading state (or skip the block) until `dispute` has loaded whenever
  `order_status` is `disputed`/`refunded`.

### What could not be verified live

No admin, seller, or buyer login credentials are available in this
environment. Everything gated behind a real session — seller dashboard with
real listings, buyer order history, any admin queue, and any dispute/return/
payout screen actually rendering real (as opposed to hypothetical) data —
was checked by reading the code, not by walking it as a logged-in user.
Treat Part 6 in particular as "the code looks safe for real data," not
"this was seen rendering real data," since per the task's own premise none
of those flows has ever produced a real record yet.

## 8. Audit fixes (2026-08-05, same day as §7)

Targeted fixes for the items above that were called out to fix now. No
redesign, no copy changes beyond what a fix required, no migrations or
edge functions touched.

**1. Footer not pinned to bottom — fixed.** `.mkt` in `marketplace.css` is
now `display: flex; flex-direction: column`, and the route content is
wrapped in a new `.mkt-main { flex: 1 0 auto }` in `MarketplaceApp.tsx`, so
the footer always sits flush with the end of the document, whether that's
mid-viewport-height content or a long page. Verified live: `/cookies`
(short) now shows the footer immediately after content with no trailing
gap; `/terms` (long) is unaffected, footer still follows naturally after
all 13 sections. The sticky Buy now bar on listing detail (still
`position: fixed`, unaffected by a flex ancestor) and the footer-suppressed
routes (`/checkout*`, dispatch, order-action, `/login`) are untouched — all
confirmed by reading `MarketplaceFooter.tsx`'s existing suppression logic,
which was not touched.

**2. No 404 route — fixed.** Added `<Route path="*" element={<MarketplaceNotFoundPage />} />`
as the last route in `MarketplaceApp.tsx`, and a new
`src/marketplace/MarketplaceNotFoundPage.tsx`. Copy reuses the same
`.mkt-center` / `.mkt-empty-title` / `.mkt-empty-sub` pattern as
`ListingDetailPage.tsx`'s "gone" state, and reads "We cannot find that
page... The link may be mistyped, or the item it pointed to has sold or
been taken down," with a "Back to browse" button — deliberately worded so
a stale listing link doesn't read as a technical error. Verified live at
`/marketplace/this-does-not-exist`.

**3. Stale fallback values — fixed, by removing the fallbacks rather than
updating the numbers.** Per the instruction, a number that matches today's
live value just resets the same drift for next time, so every fallback
below now resolves to a loading/omitted state instead of a guess, and only
shows the real number once it has actually loaded:
- `CheckoutPage.tsx` — `serviceFee` no longer has a `?? 750` fallback
  (`Number(settings?.marketplace_service_fee_naira) || 0`); the price
  breakdown already had a "..." loading pattern for other fields, extended
  to cover this one (`!settingsLoaded` branch added ahead of the existing
  ones). The bank-transfer panel (`TransferFallback`) got the same
  treatment plus its own loading branch.
- `ListingDetailPage.tsx` — `maxDiscountPercent` has no default; the "Ask
  for a lower price" entry point and the offer sheet now also require
  `maxDiscountNaira != null` before rendering, so a buyer never sees (or
  opens a sheet using) a guessed cap.
- `offers.ts` — `getMaxDiscountPercent()` and `getOfferExpiryHours()` both
  now return `number | null`, no more `10`/`48` fallback baked in.
  (`getOfferExpiryHours` turned out to have no callers anywhere in the
  codebase — fixed anyway for correctness, flagged here as it's currently
  dead code, worth a look separately.)
- `policySettings.ts` — `maxDiscountPercent` and `offerExpiryHours` in
  `MarketplacePolicySettings` are now `number | null`, no fallback,
  mirroring the existing `policiesUpdatedAt: string | null` pattern already
  in this same file. `TermsPage.tsx`'s one sentence that uses
  `maxDiscountPercent` now reads "capped at a percentage we set" in the
  (rare, load-only-then-resolved) case it's null.  `offerExpiryHours` has
  no consumer in any of the five policy pages, so nothing else needed
  changing there.
- `SellerPriceEditPage.tsx` and `CreateListingPage.tsx` — both `markupPct`
  queries dropped their `= 10` default. `SellerPriceEditPage.tsx`'s "Buyers
  will now see" preview card now only renders once `markupPct` has loaded.
  `CreateListingPage.tsx`'s price card (always visible, so hiding it
  entirely would jump the layout) now shows "…" for the buyer-facing price
  and "adds its markup" instead of a guessed percent until the real value
  is in.

Verified live: Terms page now shows the correct live numbers throughout
(10% markup, ₦1,000 service fee, 25% discount cap, 3-day dispute window) —
confirms the removed fallbacks were never masking the correct value, they
were just a latent risk for the next time a number changes.

**4. Dead ends — fixed for the three listed:**
- `BrowsePage.tsx` — the generic fetch-error state now has a "Try again"
  button wired to the query's own `refetch()`.
- `CheckoutPage.tsx` — the bank-transfer-not-configured message now links
  to WhatsApp (`waContextHref(waNumber, "payment_problem", { reference })`)
  instead of naming WhatsApp as plain text. This state is behind the
  transfer-payment admin toggle, currently off, so it could not be reached
  live in this environment; verified by reading the change and the
  passing build.
- `SellerDashboardPage.tsx` — the relist-failure message now ends with a
  working WhatsApp link (`listing_removed` context, carrying the listing's
  title), instead of "Message us and we will help" as plain text.

**5. Small tap targets — fixed.** `.mkt-condition-chips .mkt-chip` (the
per-question Yes/No buttons) now has `min-height: 44px` on mobile, with
`display: inline-flex; align-items: center; justify-content: center` so
the text stays centred at the new height. Verified via a live computed-style
check: the chip now renders at exactly 44px tall. Because each question's
chip row is independent, this adds roughly 10-14px per question rather
than multiplying across the six-question block, so it does not make the
block dramatically taller.

**Report-only items, not fixed, per instruction:**
- **Second hand-rolled WhatsApp builder in `orders.ts`.** Worth
  consolidating into `lib/whatsapp.ts` at some point, but it's low risk
  (it targets a different number — the seller's own — for a different
  purpose than the support-line contexts `lib/whatsapp.ts` handles), and
  not urgent enough to bundle into this pass. Do it as its own small
  cleanup, not a drive-by inside an unrelated change.
- **Refunded-order dispute panel briefly blank while loading.** Still low
  severity — self-resolves the moment the `dispute` query settles, no
  crash, no wrong number ever shown, just a brief incomplete render for an
  already-rare page (a refunded order, viewed in the exact window before
  its dispute record has loaded). Worth a loading guard next time that file
  is touched for another reason, not worth a dedicated pass on its own.

Build passed (`npm run build`, clean except pre-existing chunk-size
warnings unrelated to this change). Committed and pushed to `main`.

## 9. Pre-launch design and UX audit, second pass (2026-08-05)

**Historical — a findings snapshot, not current status.** The three items
this section itself picked as top priority were fixed the same day in
§10 (primary button contrast, the non-clickable "Policies ›" crumb, the
admin markup-percent stale fallback) — §10's own "before" check re-read
the code fresh and confirmed all three were still present at that point,
so trust §10 over this section for those three specifically. The 404
button-inflation bug found here was fixed later in §13 alongside a larger
rebuild. Everything else below is exactly what it says: found, reported,
left unfixed at the time — check CURRENT STATE at the top of this file
before assuming any specific item is still open today.

Report only, no code changed. Screens actually loaded in the Browser pane at
390px and 1440px (768/1100 checked where a layout genuinely changes width);
where a screen sits behind login and could not be reached, that is stated
plainly below and the note is code-review only, not a claim of having seen
it render. Does not repeat anything from §7/§8 that is already fixed and
still holds (footer pinning, the 404 route, browse's retry button, the
checkout/relist WhatsApp links, mobile tap targets, the removed stale
fallbacks) — those were spot-checked live again and are all still correct.

One methodology note: partway through this pass the screenshot tool in this
environment started returning stale/cached captures after a click (a repeat
of the same downscaled-desktop-screenshot issue noted in §7). Where that
happened, findings below were confirmed a different way — DOM text
(`get_page_text`), computed layout (`getBoundingClientRect`), or a fresh
full navigation — never left as an unverified guess from a stale image.

### Site-wide (found on public screens, but the same CSS/classes are shared everywhere)

- **Primary button text fails contrast — highest-impact finding in this
  pass.** `.mkt-primary` / `.mkt-buy` (used for Buy now, Sign in, every
  seller/buyer submit button, and reused as-is on the admin "Approve and
  publish" button) is cream text `#FFF8F4` on coral `#F4845F`. Measured
  contrast ratio ≈ **2.4:1**. WCAG AA needs 4.5:1 for normal text or 3:1
  for large/bold text — this fails even the relaxed large-text bar, and
  these buttons are the single most-tapped element on the entire site.
  **High.** Fix: darken the button background (e.g. use `--mkt-coral-dark
  #D4613C`, which the pill/tag components already use) or use `--mkt-black`
  text instead of cream on the current coral — either clears 4.5:1.
- **Small pill/tag text is also under contrast**, same root cause, smaller
  scale: `--mkt-coral-dark` text on `--mkt-coral-light` background (area
  tags, condition badges, discount tags, the "pending" status pill) ≈
  **3.19:1**. These are small (10-12px) and mostly bold, so they don't
  qualify as "large text" under WCAG either — fails AA. **Medium.** Same
  fix direction, needs a slightly darker foreground or lighter background.
- Also measured and clean, no action needed: muted body text on cream
  (6.15:1), cream on the green header (6.08:1), footer link green-on-green
  (8.4:1), black headings on cream (16.56:1). One borderline: the small
  grey meta line under a listing card ("Ogudu · Fair", `--mkt-muted-2`) on
  cream is 3.91:1 — fails AA for normal text by a small margin. **Low.**
- **Focus states are fine** — verified properly this time with real Tab-key
  navigation (an earlier programmatic `.focus()` check gave a false
  negative, corrected before reporting). Listing cards get the browser's
  default focus ring, form inputs and the search bar get a custom coral
  ring via `:focus-within` on their wrapper. No fix needed.
- **Mobile keyboard types are handled correctly everywhere I checked** —
  `inputMode`/`type` set appropriately across 10 files (email, tel,
  numeric) for phone, price, and OTP-style fields. No fix needed.
- **Broken images have no fallback.** Three seed listings (Avent Bottle
  Set, Chicco Bravo Stroller, Ride-on Push Car) hotlink to dead Unsplash
  URLs and render as a raw broken-image glyph with the alt text showing as
  visible on-card text, over the card's coral-stripe placeholder
  background. `ListingCard.tsx`'s `<img>` has no `onError` handler.
  **Medium** — these three are very likely seed/demo data rather than
  something a real seller will hit, but the missing fallback is real: any
  future photo host hiccup on a genuine listing would show the same raw,
  unpolished result. Fix: an `onError` that swaps to a simple placeholder
  icon rather than a bare broken image.

### Browse (public, `/marketplace`)

- Would a first-time visitor understand it cold? **Yes** — title, search,
  location, six category tiles, and a "checked by our team" trust line are
  all above the fold on mobile.
- Filters sheet (mobile) is well built: sort, category groups with live
  counts, price range, condition, a sticky "Show N items" footer that
  updates as you tap. No dedicated close/✕ button, only tap-outside and
  "Clear all" — a normal bottom-sheet pattern, not flagging as a defect,
  just noting there's no visible way to back out without submitting or
  clearing if a user doesn't know backdrop-tap closes it. **Low.**
- Desktop (1440px): persistent left filter panel + a genuine 4-column grid,
  not a stretched single mobile column — uses the width properly.
- The three broken-image listings noted above live here (site-wide finding).

### Listing detail (public)

- Would a cold visitor understand it? **Yes** — price, condition, seller
  card with verified badge, "held until you confirm" reassurance, and the
  buy bar are all visible without much scrolling on mobile.
- **Duplicate gallery thumbnail on at least one live listing.** The sample
  listing's `image_url` is also present inside its own `gallery_urls`, so
  `images = [image_url, ...gallery]` (`ListingDetailPage.tsx`) shows the
  same photo twice in the thumbnail strip. **Low-medium**, and
  data-dependent rather than guaranteed on every listing, but worth a
  defensive dedup where that array is built.
- Two-column desktop layout (gallery + sticky purchase panel) still holds
  correctly, re-verified via computed layout.
- One sample listing's own content is rough — title "Generic- Baby
  Starter-chair" (stray hyphen), one-line description ("Age 0-12"). This is
  seller-authored content, not an app bug, so not a "fix this code" item,
  but worth a product note: nothing in `CreateListingPage.tsx` nudges a
  seller toward a substantive description the way it already nudges toward
  condition honesty — worth considering, not urgent.

### The five policy pages (public)

- **"Policies ›" crumb looks tappable but isn't, and is inconsistent
  across the five pages.** `BuyerProtectionPage.tsx` and
  `SellerProtectionPage.tsx` both render `<span className="crumb">Policies
  ›</span>` in the green hero — styled like a breadcrumb, with a trailing
  chevron that implies "tap to go back to a policies index," but it's a
  plain `<span>` with no `href`/`onClick`. Terms, Privacy, and Cookies
  don't have this element at all. **Medium** — a first-time user (exactly
  this product's audience) tapping a thing that looks like a link and
  getting nothing is a small trust cost, and it's inconsistent besides.
  Fix: either wire it to a real destination or drop the trailing "›" so it
  reads as a plain label, and make it consistent across all five pages.
- Buyer Protection and Seller Protection both contain one comma-spliced
  sentence each — "Simply changing your mind isn't covered, this
  protection is for items that don't match their listing, not preference
  after the fact" and "Arranging payment outside the platform breaks these
  protections for both of you" (the latter is fine; the spliced one is
  "...isn't covered either, that's exactly why we ask..."). **Low** — could
  be an intentional conversational-voice choice, but reads as a run-on.
  Worth a copy pass to split these two into two sentences.
- Everything else re-checked clean: correct live values throughout (10%
  markup, ₦1,000 fee, 25% discount cap, 3-day windows), no em-dashes,
  consistent sentence case, footer pins correctly on every one of these
  (all five are "short" pages and were exactly what the footer bug used to
  affect).

### 404 and login (public)

- 404 re-verified live at a nonsense URL: correct copy, working "Back to
  browse" button, footer/header intact. Clean.
- Login re-verified live: the redirect copy is contextual per route ("To
  see your orders, we need your email" from `/orders`, "To start selling,
  we need your email" from `/sell`) rather than one generic message — a
  genuinely good detail, calling it out as something done right, not a
  defect.
- The disabled "Email me a login link" button (before a valid email is
  typed) is very low contrast, light-tan-on-cream. **Very low** — WCAG
  explicitly exempts disabled controls from the contrast requirement, and
  it becomes the full-contrast coral button (same finding as above) the
  moment the email is valid, so this is a note, not a "before launch" item.

### Buyer screens — code-reviewed only

`/checkout`, `/checkout/return`, `/checkout/awaiting/:reference`, `/orders`,
`/orders/:id`, `/orders/:id/problem`, `/orders/:id/return` all sit behind
the marketplace's passwordless email-link login. No credentials exist in
this environment, and there is no way to receive the login email here, so
none of these were seen rendering live in this pass — confirmed by hitting
`/orders` directly and getting the contextual login prompt above, not a
guess. §7 already did a thorough code read of this whole area (Parts 1, 4,
and 6), and re-reading it now, the state matches: every dispute/write goes
through an RPC, every dead-end from §7 already has a fix from §8, and the
money-rendering code still guards nulls/NaN the way §7 found. The one
addition from this pass: the site-wide button-contrast finding above
applies to every primary action on these screens too (Buy now, "I have
sent the transfer," confirm receipt, submit a dispute/return), since they
all share `.mkt-primary`/`.mkt-buy`.

### Seller screens — code-reviewed only

Same access limit — `/sell/setup`, `/sell/new`, `/sell/dashboard`, and
everything under it require a logged-in seller. `/sell` itself (become a
seller) and its back-button fix were both already verified live earlier
this session and are not re-litigated here. Re-reading the dashboard,
create-listing, price-edit, dispatch, payouts, and offer-response code
against §7/§8: nothing new found beyond the same site-wide button-contrast
issue applying here too (every "Send it for review," "Buy now," "Approve"
style CTA).

### Admin marketplace — code-reviewed only, could not load a single admin screen live

`/admin/marketplace` requires a real email + password sign-in (confirmed by
navigating there directly — a proper login form, not a bypass or an
unauthenticated peek at anything). No admin credentials exist in this
environment. Everything below is from reading `MarketplaceDashboard.tsx`,
`MarketplaceReview.tsx`, `MarketplaceDisputes.tsx`, `MarketplaceSellers.tsx`,
`MarketplaceListings.tsx`, `MarketplaceOrders.tsx`, `MarketplaceMoneyOwed.tsx`,
`MarketplacePayouts.tsx`, `MarketplaceReturns.tsx`, `MarketplaceSettings.tsx`,
`MarketplaceCategoryFields.tsx`, and `MarketplaceLocations.tsx` — not from
seeing them rendered, so treat spacing/layout/responsive claims here as
unverified.

- **Design language is Tailwind + inline styles, not the customer-facing
  `.mkt-*` stylesheet — but it does reuse the same brand tokens** (coral
  `#F4845F`/`#D4613C`, green `#1A4A33`/`#2D6A4F`, cream `#FFF8F4`, Nunito
  headings) throughout. So it reads as related to the customer side, just
  built with a denser component system appropriate for an internal tool,
  not a disconnected one. Not a defect, noting it because the brief asked
  specifically whether admin feels related to the customer side.
- **Same button-contrast issue is present here too** —
  `MarketplaceReview.tsx`'s "Approve and publish" button is
  `background:"#F4845F"` with white text, the identical ~2.4:1 pairing
  flagged above. Confirms this is a genuine site-wide token issue, not a
  customer-side-only one.
- **The review queue (`MarketplaceReview.tsx`) looks well designed on
  read** — one listing at a time, seller-asking vs. buyer-sees price shown
  side by side, an automatic contact-leak warning ("a phone number pattern
  was found") before approving, and rejection requires a written reason.
  No defects found in the code; genuinely could not verify how it looks
  rendered.
- **`MarketplaceReview.tsx:17`** — `useState<number>(10)` as the initial
  value for the markup-percent label shown on every listing ("Buyer sees,
  with {markupPct}% markup"), before the real `site_settings` value loads.
  This is the exact stale-fallback pattern fixed on the customer side in
  §8 (`CheckoutPage.tsx`, `ListingDetailPage.tsx`, etc.), just not applied
  here. Currently matches the live value (10%) so nothing looks wrong
  today, but it's the same latent drift risk the moment an admin changes
  markup — and this screen is precisely where an admin would be looking at
  that number while approving listings. **Medium**, same fix as before: no
  fallback, or an explicit loading state for that one line.
- **Empty and loading states are consistent and good** — every list screen
  uses a shared `OpsEmpty` component with an explanation of why it's empty
  and what makes it fill (e.g. payouts: "Rows appear here once a buyer
  confirms receipt, or the dispute window elapses after dispatch"), not
  just "nothing here." Loading is a consistent centered spinner everywhere.
  No fix needed.
- **Raw database error messages are shown to the admin user** on most
  write failures — `setError(err.message)` / `setError(error.message)`
  appears across `MarketplaceListingEdit.tsx`, `MarketplaceCategoryFields.tsx`,
  `MarketplaceLocations.tsx`, `MarketplaceListings.tsx`, `MarketplaceSellers.tsx`,
  `MarketplaceSettings.tsx`, `MarketplaceReview.tsx`, `MarketplaceDisputes.tsx`,
  `MarketplaceReturns.tsx`, `MarketplacePayouts.tsx`, and
  `MarketplaceMoneyOwed.tsx`. **Low** — this is an internal tool for staff,
  not a customer, so a raw Postgres message is a more acceptable audience
  than on the customer side, but it's a consistent pattern across nearly
  every admin write path, matching what the brief asked to flag ("a raw
  technical message").
- **Dashboard (`MarketplaceDashboard.tsx`) reads well** — a held-funds hero
  card leading (correctly framed as buyer money, not seller money) plus
  four tiles (payouts due, review queue, open disputes, refunds pending),
  each tapping straight into its own queue. Good "glanceable ops picture"
  structure on read; could not verify the actual rendered spacing.
- Could not check at all, and saying so plainly rather than guessing: any
  admin screen's actual visual spacing/alignment, responsive behaviour at
  390 vs. 1440, hover/interaction states, or how any screen looks with a
  genuinely large dataset rather than whatever is currently in the table.

### Opinions beyond defects

- The seller-entered content quality problem noted under listing detail
  (typo'd titles, one-line descriptions) is the kind of thing that will
  matter more at real scale than any of the visual findings above — worth
  more product thought than this pass gives it room for.
- The admin review queue's contact-leak detector and side-by-side
  seller/buyer price display are genuinely good ideas, better than what
  most marketplaces ship at this stage — calling that out since the brief
  asked for opinions, not only defects.

### What I'd fix first, if only three

1. **The site-wide coral/cream button contrast** (2.4:1) — one CSS token
   change fixes every primary button across buyer, seller, and admin at
   once, and it's the most-used interactive element on the whole product.
2. **Missing `onError` fallback on listing images** — cheap fix, and
   directly affects how trustworthy a browse page looks the moment any
   photo fails to load, seed data or real.
3. **The non-clickable "Policies ›" crumb** — small, but it's exactly the
   "looks tappable, isn't" trap that costs trust with a first-time,
   unfamiliar-with-online-marketplaces user, which is this product's
   actual audience.

Nothing in this pass required a code change, so nothing was built. Only
this file was touched and committed.

## 10. Fixes for the top three from §9 (2026-08-05, same day)

Before: all three still present, confirmed by re-reading the code fresh
(not assumed from §9) — `.mkt-buy`/`.mkt-primary` still cream-on-coral, the
`crumb` span still on Buyer/Seller Protection only, `MarketplaceReview.tsx`
still `useState<number>(10)`.

**1. Primary button contrast — fixed, black text on coral, kept.**
Measured both routes before choosing:
- Black `#1A1A1A` on coral `#F4845F` → **6.89:1**.
- Cream `#FFF8F4` on coral-dark `#D4613C` → **3.59:1**.

Chose black-on-coral. Reasons: it clears AA (4.5:1) for normal-size text
outright, where the coral-dark route only clears the large-text bar
(3:1) — and the button font (`800 16px`) doesn't actually qualify as
"large text" under WCAG (needs ~18.66px bold), so the coral-dark route
would still have failed the real requirement. Black-on-coral also leaves
the coral itself untouched, so the primary action color doesn't change at
all, only the label on top of it — the smaller, safer edit of the two.
Hover state (coral-dark, unchanged) with black text measures **4.62:1**,
also clean.

Changed at the token level in `marketplace.css` so it's one edit per
class, not per screen: `.mkt-buy`, `.mkt-primary` (buyer + seller, since
both classes are shared across every screen that uses them — Buy now,
Sign in, every submit button, confirm/cancel sheets). Also found and
fixed two more instances of the exact same coral+cream token pairing
while checking smaller sizes as asked:
- `.mkt-card-qty.low` — the "only 1 left" badge on a listing card
  (10px bold, smaller text than the buttons, was already failing worse).
- `.mkt-home-sell` — the "Sell" pill in the header (13px bold), both its
  base and `:hover` state.

Two `.mkt-primary` buttons override the background inline to a **darker**
color (`SellerOfferPage.tsx`'s "Accept" button → green, `SellerPriceEditPage.tsx`'s
"Delist and edit" → error red) — these correctly need cream text, not
black, so the base-class change would have broken them. Added an explicit
`color: var(--mkt-cream)` alongside each background override so they keep
their own correct (already-passing) contrast rather than inheriting the
new black default.

Admin reuses the identical coral hex directly (not the CSS variable), six
places, all `background:"#F4845F"` with Tailwind's `text-white`:
`MarketplaceListingEdit.tsx` (Save changes), `MarketplaceReview.tsx`
(Approve and publish), and four Save buttons in `MarketplaceSettings.tsx`.
Same fix applied — `color: "#1A1A1A"` inline, `text-white` class removed.

**Confirmed applies across buyer, seller, and admin** — the buyer/seller
fix is a shared-class CSS change (every screen using `.mkt-buy`/`.mkt-primary`
picks it up automatically, verified live on the browse header's "Sell"
pill and the listing-detail "Buy now" button), and the admin fix touched
all six admin call sites individually since admin doesn't share the same
stylesheet.

**Also found, reported per the instruction, not fixed (different token,
out of the literal "same coral+cream pair" scope):** `--mkt-coral-dark`
`#D4613C` with white/cream text is used on several admin "Confirm" buttons
(`MarketplaceReview.tsx`'s "Confirm rejection", four `MarketplaceSettings.tsx`
confirm dialogs) at `text-sm` (14px bold, also short of the large-text
bar). Measured **3.59:1**, same failing ratio as the coral-dark route I
didn't take above, for the same reason. This is a related but distinct
color pairing from the one this task named, so it wasn't changed — flagging
it here as the next thing worth a similar look.

**2. Non-clickable "Policies ›" breadcrumb — removed from both pages.**
Chose removal over wiring it to a destination because there is no sensible
place for it to go: the real breadcrumb row directly above it already
links to all five policy pages, so a second, decorative "Policies" crumb
would need a new index page to point to, which is a small build, not a
targeted fix, and this pass's non-goals rule that out. Removed the
`<span className="crumb">Policies ›</span>` from `BuyerProtectionPage.tsx`
and `SellerProtectionPage.tsx`, and removed the now-dead `.mkt-policy-hero
.crumb` CSS rule rather than leave orphaned styles behind. Verified live —
the green hero now goes straight from the page header into the `<h1>`,
no gap, no leftover spacing artifact. All five policy pages are now
consistent (none of them have this element).

**3. Admin review markup fallback — fixed, same "show nothing until
loaded" treatment as §8.** `MarketplaceReview.tsx`'s `markupPct` is now
`useState<number | null>(null)`, no `10` default. The "Buyer sees, with
X% markup" label now reads "Buyer sees, with ...% markup" until the real
`site_settings` value resolves, then shows the true number. Note: the
naira amount shown next to that label was never at risk — it's
`current.final_price_naira`, already computed and stored server-side, not
derived from `markupPct` client-side — only the percentage in the label
text could ever have been stale.

**Found while checking the rest of admin for the same pattern, reported
not fixed (a new instance, not one of the three named for this pass):**
`MarketplaceListingEdit.tsx:50` has the identical
`isFinite(v) ? v : 10` fallback for the same `marketplace_markup_percent`
setting, and unlike the Review screen's cosmetic label, it feeds a real
computed number — `buyerPreview` (`MarketplaceListingEdit.tsx:128`), the
live buyer-facing price preview shown while an admin edits a listing.
Currently matches the live value (10%) so nothing looks wrong today, same
latent-drift risk as everything else in this family. Worth the identical
fix next time this file is touched.

Build passed (`npm run build`, `tsc --noEmit` clean). Verified live: the
button-text fix on the browse header's "Sell" pill and the listing-detail
"Buy now" button, and the breadcrumb removal on Buyer Protection. The
admin-side fixes (six buttons + the markup label) could not be verified
live — no admin credentials in this environment — confirmed by reading the
compiled output and a passing typecheck/build instead. Committed and
pushed to `main`.

## 11. Login screen redesign (2026-08-05)

Implemented from a Claude Design file (`BundledMum Marketplace.dc.html`,
screens L1-L7, project `0afda8cc-a981-4d3a-9e96-76e4ca05ec27`), read via the
DesignSync MCP tool (`get_project`/`list_files`/`get_file`, read-only —
this project is `PROJECT_TYPE_PROJECT` not a design-system project, so it
doesn't show up in `list_projects`, but direct file reads by path still
worked). The design file itself is a much larger canvas covering many
future screens (condition questions, offers, seller edit flows, returns,
policy pages, admin) — only the login section (L1-L7) was in scope here
and is what got built; the rest is that project's own future work, not
touched.

**What changed**, same eight-headline contextual-copy system, same
passwordless-magic-link mechanism, both untouched:
- A reason-specific icon-in-circle above the headline (₦ for offer/payment,
  a shopping bag for sell/seller, a package for orders/return, a flag for
  dispute, an arrow for the generic/no-reason case). Colors and glyph live
  in `marketplaceLogin.ts`'s new `LOGIN_REASON_ICON` map, next to the
  existing copy map, same "closed union, add a case or fall back to
  generic" pattern.
- The CTA ("Send my sign in link", copy changed from "Email me a login
  link") is now always enabled rather than disabled-until-the-field-looks-
  valid; validation runs on submit, and a live green border + checkmark
  shows once the typed address looks valid, before submitting.
- The blank cream space below the form is now a "Why we sign you in this
  way" card (three reassurance lines), filling what used to be empty.
  When a *submit* actually fails (valid address, API/network error) that
  same card slot becomes an error card instead; a *format* error (bad
  address) stays a small inline message under the input, card unchanged —
  two different failure shapes get two different treatments, matching the
  design file's own L3/L5 distinction.
- The sent state dropped the borrowed `.mkt-heldbox` (the same card used
  for held-funds messaging elsewhere) and got its own full-bleed dark-green
  identity on mobile: an envelope icon, "Check {email}", a waiting card,
  and a single resend button that toggles between a live `m:ss` countdown
  and "Resend the link" rather than swapping between a span and a button.
- A "‹ Back" link now exists (there wasn't one before). Every gate that
  sends someone here passes its own page as `returnTo`, so `returnTo`
  doubles safely as "back" for every named reason — worded "Back to
  listing" specifically for `offer` since that's a real listing page,
  plain "Back" otherwise. The bare `/login` case (header's "Log in" link,
  no reason, no reliable `returnTo`) uses real browser-history back
  instead, rather than force it to `returnTo`'s "/orders" default, which
  isn't necessarily where that person actually came from.
- Desktop (≥1024px) gets a real two-pane shell — a fixed 42% green trust
  rail (brand promise + 3 checkmarks, or the sent-state copy) beside the
  form column — instead of the same mobile card just centered on a wider
  page. Rail and form column stretch to equal height via flexbox rather
  than the design file's fixed 760px mock frame, since real content height
  varies by stage (an error line, a longer headline) and a fixed height
  would risk clipping.

**One judgment call, not in the source file**: the design file's own note
says "a flag for dispute" but never mocks a dispute screen, so there was
no color pairing to copy. Gave it the same error-tinted pair
(`--mkt-error-bg`/`--mkt-error`) already used everywhere else in the
marketplace for "something needs attention," kept deliberately muted
rather than alarming, since landing on this screen isn't itself bad news.

New CSS lives in its own `/* Marketplace login, redesigned shell */`
section at the end of `marketplace.css`, all `.mkt-login-*` classes (no
existing shared classes were touched, so nothing else that reuses
`.mkt-sell-head`/`.mkt-sell-body`/`.mkt-primary`/`.mkt-heldbox` elsewhere
was put at risk).

Verified live at 390px and 1440px: offer/dispute/generic reasons, the
live valid-checkmark state, the format-error state, and a real send
through to the full sent state (both breakpoints) via an actual
`signInWithOtp` call. `npm run build` and `tsc --noEmit` both clean.

## 12. Admin, Buyers screen (2026-08-05)

New: `src/pages/admin/marketplace/MarketplaceBuyers.tsx`. Read only, the
counterpart to Sellers, built to match its exact shape (two-pane
list/detail, `hidden lg:...` breakpoint collapse, local types + query in
the file rather than centralized in `opsData.ts`) rather than inventing a
new pattern. Wired into `AdminLayout.tsx`'s `MARKETPLACE_NAV` right after
Sellers (new `Contact` icon, since `Users` was already Sellers') and into
`StorefrontApp.tsx` as `marketplace/buyers`, gated by the same
`has_admin_permission('marketplace','manage')` `PermissionGate` every
other marketplace admin route uses.

**Backend, read only, not touched**: `public.marketplace_buyers` (one row
per customer with ≥1 marketplace order — verified live, exactly 3 rows
today, all test accounts, zero paid orders, zero disputes) and
`admin_buyer_purchases(p_customer_id)` (SECURITY DEFINER, already checks
`has_admin_permission` internally, orders newest-first). The view has
`security_invoker=true`, confirmed by reading `pg_class.reloptions` before
trusting it — its own broad `anon`/`authenticated` GRANT looked concerning
at first glance, but with `security_invoker` on, the underlying
`customers` RLS (admin-wide read via `has_admin_permission('orders','view')`,
or own-row only for a regular customer) genuinely applies per querying
user, so this is not a data exposure. Confirmed via `pg_get_functiondef`
and `pg_get_viewdef` directly, not assumed.

**first_name/last_name**: present on the row type but never used in this
file. `full_name` is the only name shown anywhere (list, detail header,
the WhatsApp message). The view derives first/last by splitting on the
first space, per its own comment a one-word name yields no surname and a
middle name folds into the last — exactly why nothing here lays a buyer's
name out as two fields.

**The disputes_open / disputes_raised distinction**: the design's own
framing for this screen, matched exactly. `disputes_open > 0` is the only
thing that gets error red — a card border on the list row, a `StatusPill`,
the section header on detail. `disputes_raised` (or the non-open
remainder, `disputes_raised - disputes_open`) is always plain grey text
sitting next to order count and spend, same weight, no pill, no colour.
No score, rating, or risk label anywhere.

**Two things in the prompt that didn't match the code, resolved and
reported rather than built silently**:
- **WhatsApp/Call use the buyer's own number**
  (`whatsapp_number ?? phone` from the view), not `site_settings` as the
  prompt literally said. `site_settings.whatsapp_number` is BundledMum's
  own support line, a single global number — it can't be the target of a
  "message this buyer" button, and the design itself shows the buyer's own
  number in the contact card. The message is pre-filled and names the
  buyer plus their most recent order reference (from
  `admin_buyer_purchases`, already newest-first): `"Hello {full_name},
  this is BundledMum regarding your order {reference}."` Verified live —
  correct international-format `wa.me`/`tel:` links, correct message text.
- **A resolved dispute has nowhere to link to.** `MarketplaceDisputes.tsx`
  only ever fetches `outcome IS NULL` (open) disputes; there is no
  historical-dispute view anywhere in the current admin. Building one is a
  real, separate feature, not part of "add a Buyers screen," so it wasn't
  built. An **open** dispute row on the buyer detail page genuinely
  deep-links (see below); a **resolved** one renders as plain read-only
  text (reference, reason snippet, outcome via the existing
  `DISPUTE_OUTCOMES` title mapping) with no arrow and no link, rather than
  linking to nothing.

**Two small, additive changes to existing screens**, needed to make
"linking through to that order/dispute" actually work, both backward
compatible (do nothing when their param is absent), both verified live:
- `MarketplaceOrders.tsx` now reads `?order=<id>` and scrolls/highlights
  that row (coral-light background). Verified live: clicking a purchase
  row lands on Orders with the right order highlighted.
- `MarketplaceDisputes.tsx` now reads `?disputeId=<id>` and auto-selects
  it if it's among the (open-only) fetched disputes — reuses the existing
  two-pane detail view entirely, no new UI. Not exercised live this pass
  since none of the 3 test buyers currently has a dispute; verified by
  code and `tsc`/build only.

**Purchase-history status pills reuse `orderMoneyState()`** (the same
helper Orders itself uses), not new copy — `admin_buyer_purchases` doesn't
return `settlement_status`, so it's fetched with one small extra query
against `marketplace_orders` for the returned order ids, keeping the pill
on a buyer's purchase row identical to what the same order shows on the
Orders screen. `had_dispute` (a separate boolean the RPC does return) adds
a small "· previously disputed" note when true but the order's current
status isn't itself `disputed` — the fact isn't lost once a dispute
resolves, without inventing a new coloured state for it.

**A real bug found and fixed during verification, not by design review**:
the detail panel overflowed horizontally on mobile (390px viewport
measured 425px of content) — a classic Tailwind `truncate`-inside-flex
issue, where `truncate` needs `min-width:0` on every flex ancestor to
actually constrain instead of forcing the row wider. Fixed by adding
`min-w-0` up the chain (the grid container, the detail root, the purchase
and dispute row buttons, the truncating spans themselves). Confirmed via
`document.documentElement.scrollWidth` before (425px) and after (390px,
exactly matching the viewport) — not just a visual glance, since a
slightly-too-wide layout is easy to miss on a screenshot alone.

**Verified live** (a real admin session was available in this environment
this pass, unlike most of this session's other admin work): list renders
all 3 real buyers with correct stats; search filters by name/email; every
sort (newest/most spent/most orders/open disputes) reorders correctly;
the near-empty note shows with the live count; detail panel shows correct
contact info (WhatsApp falling back to `phone` since `whatsapp_number` is
null for all 3 today), correct 2×2 stats, correct purchase history
(including unpaid/awaiting-payment orders, since the RPC doesn't filter
on payment status); WhatsApp/Call hrefs are correct; a purchase row
click lands on the highlighted order in Orders; the nav shows "Buyers"
right after "Sellers" on both desktop and mobile; the mobile overflow bug
above was caught and fixed live, not just assumed fixed from the diff.
Not exercised live: the Disputes section and the `?disputeId=` deep link
(none of the 3 test buyers has ever raised one) — code-reviewed and
`tsc`/build-verified only for that path.

`npm run build` and `tsc --noEmit` both clean.

## 13. Not found / gone listing, four distinct situations (2026-08-05)

Implemented from the Claude Design file (screens N1-N5, section `28a`).
Replaces the single blanket "Ah, this one has gone" message with four
situations that actually differ: **sold** (knows the item, shows similar
live items), **removed/delisted/rejected** (never says why, may come back),
**wrong URL** (a true 404, knows nothing, most generic), and **the
seller's own view** of their dead listing (different information,
reasonable to tell them why since it's their item).

**The button bug, fixed at the root.** `.mkt-buy` is `flex: 1`, correct
inside its real home (`.mkt-buybar`'s horizontal row), but two screens
reused it inside `.mkt-center` (`flex-direction: column; min-height:
70vh`) — in a vertical flex container, `flex:1` makes the item grow to
fill the column, which is what inflated the button to ~800px tall. Both
occurrences (`ListingDetailPage.tsx`'s old gone-state, and
`MarketplaceNotFoundPage.tsx`, the same bug in two places) are replaced by
the new screen, whose buttons (`.mkt-notfound-cta` / `--primary` in
`marketplace.css`) are explicitly sized: `min-height: 52px`, `width:
auto`, an explicit `max-width` (320px mobile, 260px desktop), never
`flex` or `width: 100%`. Measured, not eyeballed: **52px at both 390px and
1440px**, confirmed via `getBoundingClientRect()`.

**Backend, read only, not touched**:
`get_gone_listing_context(p_listing_id)` (only returns a row for
`sold`/`delisted`/`rejected` — a live or `pending_review` id returns
nothing, which is indistinguishable from an id that doesn't exist at all,
so both correctly fall through to the generic wrong-URL case per the
routing rule) and `get_similar_live_listings(p_listing_id, p_limit)`
(same-category first, falls back to the wider category group, flagged via
`from_same_category`). Both confirmed `SECURITY DEFINER` with `anon`
`EXECUTE` granted, read directly via `pg_get_functiondef` before trusting
either claim.

**How the four cases are told apart** (`ListingDetailPage.tsx`): when
`useListing()` returns null, `get_gone_listing_context` runs. No row →
wrong URL. `status: 'sold'` → sold. `'delisted'`/`'rejected'` → removed.
**Ownership is decided by the database, not the client** — a second,
separate query (`fetchOwnListingIfMine`) reads `marketplace_listings`
directly, scoped to `.eq("seller_id", seller.id)`; this only ever returns
a row when the id genuinely belongs to the logged-in seller (confirmed
live via `pg_policies`: `"Seller reads own listings"` grants this
regardless of status). When it returns a row, that wins over whatever
`get_gone_listing_context` said — case 4 instead of case 1/2. This is why
case 4 can safely show `rejection_reason` (surfaced only for the seller's
own rejected listing) even though `get_gone_listing_context` deliberately
never exposes it to a buyer.

**One live-verified negative case worth recording**: a seller session was
active while testing (rare in this environment) — visiting *another*
seller's delisted listing correctly rendered the generic removed case,
not the seller's-own case, confirming the ownership check doesn't
false-positive.

**Similar items, `from_same_category` used exactly as the task described,
with one refinement found while testing live**: the design doesn't word
same-category vs. wider-group cards differently, so the cards themselves
are identical either way — but the section heading and the body sentence
needed to agree with each other, and initially didn't. Live-tested with a
real listing (a rejected "Baby Cot" whose exact category has zero other
live items): the heading correctly said "More like this" instead of
naming a category none of the shown items are actually from, but the
body sentence still said "...here's more in cots and cribs" — a real,
caught-live inconsistency, fixed so both the heading and the body key off
the same `anySameCategory` signal, and the primary CTA no longer offers
to "Browse {category}" when that exact category is empty (would have been
a dead end), widening to "Browse everything" instead. **Empty result**
(zero rows from either source): the whole similar-items block is dropped,
matching N2b, verified by code (a plain `.length > 0` gate) rather than
found live — the current seed data always has at least a wider-group
fallback to show.

**Missing images degrade gracefully**: sold listing photos are purged 30
days after sale, so `image_url` on a gone listing may be null or dead.
The gone-listing's own thumbnail already handles null (shows the coral
striped placeholder, no `<img>` rendered at all); similar-items cards
additionally get an `onError` handler that hides a genuinely broken image
rather than showing a broken-image glyph — fixing, in new code, the exact
gap the §9 audit flagged as missing on `ListingCard.tsx` (that one
remains unfixed, out of scope here, but nothing new repeats the pattern).

**WhatsApp, every buyer-facing case, deliberately not the seller's-own
case**: pre-filled messages naming the item per case (sold: "...do you
know if similar ones come up often?"; removed: "...is it likely to come
back..."; wrong URL: "...can you help me find what I was after?"), number
read live via `useMarketplaceWhatsAppNumber()` (`site_settings.whatsapp_number`),
confirmed live at case 3 (`wa.me/2347040667424?text=...`, correctly
encoded). **Case 4 (seller's own view) has no WhatsApp button** — the
design's own N4 mockup shows only "Go to my dashboard" / "List something
new", no green button, even though the prompt said "every version." Went
with the design: a seller doesn't need to message support about their own
sold item from this screen, they have dashboard access. Reported rather
than built to satisfy the word "every" literally.

**Desktop is a real second layout, not a stretch**: `.mkt-notfound-wrap`
is `max-width: 1000px`, a 360px message column beside the similar-items
grid (`repeat(3, 1fr)`) when both are present, or `.single` (column,
centered, 640px max) when there's nothing to show beside the message —
matching N5's own stated rule that this is the shared skeleton for all
four cases, not just sold. Verified live at 1440px: two-column for sold
(`flex-direction: row`, wrap width exactly 1000px) and for the
wider-group-fallback case, single-column-centered for wrong URL (wrap
width exactly 640px). `scrollWidth` measured equal to `clientWidth` at
both 390px and 1440px on every case checked — no horizontal overflow.

**Also added, additive and backward compatible**: `BrowsePage.tsx` now
reads an optional `?category=<id>` param as its initial filter (it had no
URL-driven filtering at all before), needed so a gone-listing's "Browse
{category}" button actually lands filtered rather than on the full grid.

**Found, not fixed, reported instead**: `.mkt-wa`'s icon
(`marketplace.css`) references `url("../assets/whatsapp-logo.svg")`,
which resolves to `src/marketplace/assets/...` — a path that doesn't
exist; the real asset lives at `src/assets/whatsapp-logo.svg`. Used
across 7 files site-wide, the icon has silently never rendered. Not part
of this task's scope, so left alone; the new WhatsApp buttons built here
import the real asset properly (`import waLogo from "@/assets/whatsapp-logo.svg"`)
rather than repeat the broken relative path.

**Not exercised live, code-reviewed and RLS-confirmed only**: the
positive case-4 path (a seller viewing their *own* sold/removed listing)
— no test seller account currently has a sold/delisted/rejected listing
of their own, and deliberately did not mutate a real seller's listing
status just to force the scenario. The negative path (confirmed above)
and the direct SQL confirmation of the `"Seller reads own listings"` RLS
policy stand in for it.

New files: `src/marketplace/lib/goneListing.ts` (RPC wrappers, category
count, ownership check), `src/marketplace/components/NotFoundOrGoneScreen.tsx`
(the shared shell for all four cases). Edited: `ListingDetailPage.tsx`,
`MarketplaceNotFoundPage.tsx` (now case 3, same catch-all route, not
replaced), `BrowsePage.tsx` (category param), `marketplace.css`.

`npm run build` and `tsc --noEmit` both clean.

## 14. Per-route browser tab titles (2026-08-05)

**Before**: every marketplace page — all 24 routes — inherited the one
static `<title>` in `index.html`
("BundledMum: Hospital Bags & Baby Bundles for Nigerian Mums"), confirmed
live on `/marketplace/terms`, `/privacy`, `/cookies`. No per-route title
handling existed anywhere in `src/marketplace`. Admin marketplace screens
had the exact same problem — `AdminLayout.tsx` sets PWA/theme-color meta
tags via `Helmet` but never a `<title>`.

**The storefront already has a mechanism**: `src/components/Seo.tsx`, a
`react-helmet-async`-based component used on every storefront page, that
sets title, description, canonical link, Open Graph, Twitter tags, and
BreadcrumbList JSON-LD all from one `title`/`description` pair.

**Deliberately NOT reused as-is** — two real reasons, not a style
preference:
1. `Seo`'s canonical link and `og:url` are built from
   `useLocation().pathname`. The marketplace router is mounted with
   `basename="/marketplace"`, so inside it `useLocation()` returns the
   path with that basename already stripped (confirmed: every `navigate()`
   call in this codebase already omits it). Reusing `Seo` as-is would have
   emitted a canonical/`og:url` missing `/marketplace` — for a route like
   `/terms` that would collide with the storefront's own top-level page at
   the same bare path.
2. `Seo` requires a `description` and always renders `og:title`/`og:description`.
   Using it would have fixed Open Graph as a side effect, which this task
   explicitly says not to do this pass.

**What was built instead**: `src/marketplace/components/MarketplaceTitle.tsx`
— same underlying library (`react-helmet-async`), scoped to only
`<title>`, so it structurally cannot touch canonical/OG/description. Every
title is composed as `{page} · BundledMum Marketplace` (the suffix lives
in one place inside the component, so it can't be forgotten per-page), and
defensively truncated to 60 chars before the suffix if a dynamic value
(a listing title) ever runs long. One component, no mix of approaches.

**Every marketplace route covered** (24 total): Browse ("Buy and sell used
baby and toddler items"), listing detail (dynamic, the listing's own
`title`), all four gone/404 cases from §13 (title lives *inside*
`NotFoundOrGoneScreen` itself, keyed to the case — "{title} has sold",
"{title} isn't available", "Page not found", "{title} is off the
marketplace" for the seller's own view — never claims the item is still
available, and this one change covers every place that screen is used:
`ListingDetailPage`'s sold/removed/own-view states, the belt-and-braces
sold-out branch, and `MarketplaceNotFoundPage`), the five policy pages
(each named distinctly), login (contextual: "Sign in" / "Check your
email"), checkout and all its dead-end states, all of `PaymentReturnPage`'s
branches (checking / paid / mismatch / failed / no-reference) plus
`AwaitingPaymentPage`'s two states, my orders, buyer order detail
(dynamic, `Order {reference}`, falls back to "My order" before it loads),
report a problem, send it back, the ask-for-a-lower-price screens (titled
around "your request" / "their counter", never the word "offer" — matches
the established §9 rule that the word stays hidden from users), the sell
pitch page, seller setup, create/edit listing (three distinct labels
reusing the page's own existing `pageTitle` variable — "List an item" /
"Fix and resend" / "Edit listing" — plus its own not-found and
sent-for-review states), price edit, seller dashboard, payouts, seller
order detail (dynamic, same reference pattern), dispatch, and the seller's
side of a price request.

**Admin marketplace, confirmed it shared the same problem, fixed it
too** — 13 registered routes (`MarketplaceLocations.tsx` looked like a
14th file but has no route of its own, it's a sub-section rendered inside
Settings, correctly not given its own title). 11 of the 13 already share
one component, `OpsHeader` (`src/pages/admin/marketplace/opsUi.tsx`), so
adding one `<Helmet>` there covers Dashboard, Payouts, Disputes, Returns,
Sellers, Buyers, Listings, the listing-edit sub-route (dynamic, "Edit
{title}"), Orders, Money owed, and Categories all at once, suffixed
`· BundledMum Marketplace Admin` (deliberately distinct from the
customer-facing suffix — an internal tool, not a public marketplace page).
The remaining two (Review queue, Settings) don't use `OpsHeader` and got
the same one-line `<Helmet>` added directly.

**Verified on real in-app navigation, not fresh loads, as required** —
loaded `/marketplace` once, then: clicked a real listing card
(`document.title` went from "Buy and sell used baby and toddler items ·
BundledMum Marketplace" to "B Fashion Baby Girl Cover Shoes · BundledMum
Marketplace", confirmed against `location.href` changing to that
listing's URL with no page reload), then clicked the footer's Terms link
from the listing detail page (title correctly became "Terms and
conditions · BundledMum Marketplace"). Two consecutive client-side
navigations, two correct title changes, checked via `document.title`
directly rather than trusting the browser tool's own tab-label report —
which, worth recording, showed one stale/incorrect reading during this
check (briefly reporting a listing title while `location.href` still said
`/marketplace`), the same class of tool-side staleness already noted in
§9; re-checking with a direct JS read resolved it immediately and it did
not recur. Admin marketplace titles could not be verified live (no admin
credentials in this environment, confirmed the login gate is real by
navigating to `/admin/marketplace` and getting the email+password form) —
code-reviewed and `tsc`-clean only for that side.

**Meta description**: confirmed it has the exact same one-static-value
problem as titles did. Live-checked on `/marketplace/terms`: `<meta
name="description">` reads the storefront homepage's own description
("Curated maternity and baby bundles for Nigerian mums...") verbatim.
Not fixed this pass, as instructed.

**Open Graph**: also static and, worse, actively wrong rather than just
generic — live-checked the same page: `og:title` is literally the
storefront homepage's title, `og:image` is the storefront's default image,
and `og:url` is literally `https://bundledmum.com/` on a
`/marketplace/terms` page. A shared marketplace listing link would preview
with the wrong title, the wrong image, and a canonical URL pointing at the
storefront homepage instead of the listing. Same class of problem as the
title bug this pass fixed, same fix shape (a per-route value, and for the
canonical/`og:url` specifically, built with the `/marketplace` basename
put back — see the `MarketplaceTitle.tsx` docstring for exactly why `Seo`
can't be reused as-is for this either). Not fixed this pass, as
instructed.

`npm run build` and `tsc --noEmit` both clean.

## 15. Buyers told delivery is arranged directly with the seller (2026-08-05)

**Before**: nothing told a buyer, before paying, that BundledMum is not a
courier — `HowThisWorksExplainer.tsx`'s step 4 ("They ship and upload a
photo of the parcel") assumed shipping was the only method; checkout's
held-box said only "...to arrange delivery," no mention collection is an
option; `PaymentReturnPage.tsx`'s seller-contact reveal and
`BuyerOrderDetailPage.tsx`'s awaiting-dispatch note both said only "agree
where and when," not what the two actual options are. `TermsPage.tsx`
already states this explicitly ("BundledMum is not a courier...") but
that's legal fine print, not something read pre-purchase.

**Fixed, four places, edited existing lines wherever possible rather than
adding new ones:**

- **Listing detail** (`HowThisWorksExplainer.tsx`) — one new step inserted
  into the existing 6-step list (now 7): *"You agree with them directly,
  collect it in person or have them send it"* (short: *"Collect in person
  or have them send it, you two agree"*). The list is collapsed by default
  behind a tap, and the Buy now bar is `position: fixed`, so this adds zero
  visible content until a buyer chooses to expand it and has zero effect on
  the buy button's position either way — confirmed live (screenshot at
  390px, button still pinned at the same spot, expanded or not). The
  "confirm and paid" step's highlighted-final-step index had to move from
  4 to 5 to stay pointed at the right step now that the list is longer —
  easy to miss, checked and fixed.
- **Checkout** (`CheckoutPage.tsx`) held-box — **edited the existing line
  in place, zero new lines added**: "You get the seller's contact once you
  sign in, to arrange delivery." → *"You get the seller's contact once you
  sign in, to collect it yourself or agree a send."* Still exactly 4
  lines. Nothing was cut because nothing needed to grow — confirmed live,
  "Continue to payment" still directly follows with no added gap.
- **Payment succeeded** (`PaymentReturnPage.tsx`'s `SellerContact`, where
  the seller's contact is actually revealed) — this one genuinely has more
  room per the instruction, so a real sentence was added ahead of the
  existing prefill-message caption: *"Message them to agree whether you'll
  collect it in person or have it sent, and roughly when. Opens ready to
  send, with your item and order number."*
- **Buyer order detail, awaiting dispatch** (`BuyerOrderDetailPage.tsx`) —
  same reasoning, same treatment. "Their details are yours now. Agree
  where and when it reaches you." → *"Their details are yours now. Agree
  whether you'll collect it in person or have them send it, and roughly
  when."*

**Tone**: written as a normal two-mums arrangement, not a disclaimer — no
"unfortunately," no "please note," no suggestion BundledMum won't help
(the money-held/protection promise is untouched and still stated
separately at each of these spots).

**Verified live**: listing detail (expanded steps render correctly at the
right position, final-step highlight confirmed still on the correct step
via computed class check, Buy now bar unaffected) and checkout (held-box
still 4 lines, submit button unaffected) — both loaded and read at 390px.
`PaymentReturnPage.tsx` and `BuyerOrderDetailPage.tsx` could not be
exercised live (both require a real completed payment and a signed-in
session with an order in progress, neither available in this
environment) — code-reviewed and `tsc`/build-verified only for those two.

**Other places that would benefit, reported, not changed (all seller-facing,
explicitly out of scope this pass):**
- `BecomeSellerPage.tsx` (the sell pitch) says nothing about delivery at
  all, from either side.
- `SellerSetupPage.tsx` already has "...so the two of you can arrange
  delivery," same gap as checkout had — doesn't name collection as an
  option.
- `SellerProtectionPage.tsx` uses shipping-only phrasing twice ("before
  you ship," "when you ship").
- `SellerDispatchPage.tsx` assumes a courier waybill, consistent with the
  same shipping-only framing.
- **Email template** `marketplace_order_confirmation` (stored in the
  `email_templates` DB table, not source-controlled) has the identical
  gap: "Message {{seller_name}} and agree how your item reaches you...
  They have been emailed too and asked to **send it** and photograph the
  parcel as proof" — never mentions collection. Not touched, per
  instruction, flagging for a separate pass.

`npm run build` and `tsc --noEmit` both clean.

## 16. Shipping cost stated, and sellers told delivery is theirs to arrange too (2026-08-05)

Follow-up to §15, which only covered the buyer side and never mentioned
who pays for delivery if the seller sends it. This pass adds the
shipping-cost clause to all four §15 buyer locations, and — new — tells
sellers the same thing at three points, which previously said nothing at
all about it.

**Buyer side, cost clause folded into the existing §15 line at each spot
(no new lines added anywhere on this side):**
- Listing detail (`HowThisWorksExplainer.tsx`, step 4 of 7): *"You agree
  with them directly, collect it in person or have them send it, cost
  agreed between you."*
- Checkout (`CheckoutPage.tsx` held-box, still exactly 4 lines): *"You get
  the seller's contact once you sign in, to collect it yourself or agree
  a send and who covers it."*
- Payment succeeded (`PaymentReturnPage.tsx`): *"Message them to agree
  whether you'll collect it in person or have it sent, who covers the
  cost if sent, and roughly when."*
- Buyer order detail, awaiting dispatch (`BuyerOrderDetailPage.tsx`):
  *"Their details are yours now. Agree whether you'll collect it in
  person or have them send it, who covers the cost if sent, and roughly
  when."*

**Seller side, previously silent on this entirely, now three places:**
- **Sell pitch** (`BecomeSellerPage.tsx`) — the existing lead paragraph
  ("You get exactly the price you asked for, we take nothing from it")
  was left untouched as instructed. The 4-step "nobody can run off with
  your item" list gained one step (now 5): step 2 changed from "while you
  send the item" to the delivery-neutral "while you get it to them," and
  a new step 3 was inserted: *"You agree delivery together, in person or
  by post, and who covers the cost."* The list already keys its
  highlighted final step off `steps.length - 1` rather than a hardcoded
  index, so no off-by-one risk from the extra step (unlike
  `HowThisWorksExplainer.tsx` in §15, which hardcodes the index and had
  to be fixed by hand — this file didn't need that).
- **Seller setup** (`SellerSetupPage.tsx`) — the existing phone-number
  help text edited in place: "...so the two of you can arrange delivery,
  and you get theirs too" → *"...so the two of you can agree delivery, in
  person or by post, and who covers the cost if you're posting it. You
  get their number too."*
- **Seller order screen** (`SellerOrderDetailPage.tsx`), the exact seller-side
  counterpart of `BuyerOrderDetailPage.tsx`'s note, same treatment: "Agree
  the drop off with them before you send it." → *"Message them to agree
  collection or a send, and who covers the cost if you're sending, then
  mark it dispatched."*

**Email templates: already fixed, not by this pass.** Checked live in the
`email_templates` table (not source-controlled) rather than assumed:
`marketplace_order_confirmation` and `marketplace_seller_sale` both
already state collection vs. sending and "who covers the postage,
BundledMum does not handle delivery or its cost" — someone updated these
directly in the DB since §15 flagged them. Nothing to report as
outstanding.

**Tone**: same as §15, a normal two-mums arrangement, never framed as a
limitation or disclaimer — "who covers it" / "who covers the cost," never
"unfortunately" or "please note." The money-held and dispute-review
promises are untouched and stated separately at every spot.

**Verified live**: listing detail (expanded step text confirmed via
computed DOM read, final-step highlight still on the correct step, Buy
now bar's `getBoundingClientRect()` confirmed fixed at the same position
regardless), checkout (held-box still exactly 4 lines via `get_page_text`,
"Continue to payment" unaffected), and the sell pitch page (5-step list
renders correctly, final step still highlighted green via the dynamic
index, existing lead paragraph unchanged, "Log in to start selling" CTA
still present and reachable, not hidden). `SellerSetupPage.tsx` and
`SellerOrderDetailPage.tsx` are both login-gated and no session was
active this pass — code-reviewed and `tsc`/build-verified only for those
two, consistent with how every other login-gated screen in this handoff
has been reported.

`npm run build` and `tsc --noEmit` both clean.

## 17. Condition question copy: confirmed live from the database, one guidance line added (2026-08-05)

**Audited first, nothing was hardcoded.** `CreateListingPage.tsx`'s
`ConditionQuestionField` (the six universal condition questions) selects
`label, options, is_required, help_text, followup_required_for,
followup_label, followup_placeholder` straight from
`marketplace_condition_questions` and renders every one of them from that
row — `question.label`, `question.help_text`, `question.options.map(...)`,
`question.followup_label`, `question.followup_placeholder`. The only
literal strings in the component are graceful fallbacks for a genuinely
null DB value (`|| "Tell us more"`, `|| \`Add ${...}\``), never a
substitute for real content. Same finding for `QuestionField` (the
category-specific questions, `marketplace_category_fields`): `field.label`,
`field.options`, and `field.help_text` (line 938) are all read live too.
Confirmed the two updated placeholders directly in the database rather
than assuming: `completeness` → "One cup holder, and the rain cover",
`marks` → "A small stain on the left sleeve, and fading on the back" —
both fragments now, both will render the moment the create-listing page
is loaded (or the question query's 60s `staleTime` expires), no code
change needed or made for this part.

**The one real change**: a short guidance line added under every
follow-up input (`ConditionQuestionField`, next to the placeholder), since
a placeholder alone doesn't stop a seller answering a question with a full
sentence out of habit. Exact wording: *"A few words is enough, we turn it
into a sentence for you."* Styled with the existing `.mkt-help` class
(small, muted grey, already used throughout this same page for every
other secondary hint) rather than anything alarming or coral — deliberately
calm, so the field doesn't read as more demanding than it is. No
validation was added forcing a fragment; a seller who writes a full
sentence can still submit, exactly as instructed.

**Not verified live**: create-listing is behind seller login, no session
was active this pass — confirmed by hitting `/marketplace/sell/new` and
landing on the sign-in gate. The finding above (nothing hardcoded, the
two placeholders already correct) is confirmed directly against the live
database, and the new hint line is `tsc`/build-verified only, not seen
rendered.

**Record for future changes**: condition question labels, options, help
text, and follow-up label/placeholder are ALL read live from
`marketplace_condition_questions`; category question labels, options, and
help text are ALL read live from `marketplace_category_fields`. Neither
needs a frontend deploy when an admin edits either table — confirmed by
this audit, not assumed.

`npm run build` and `tsc --noEmit` both clean.

## 18. Category-question help text no longer disappears on error (2026-08-05)

§17's premise turned out to be wrong (traced to an earlier report that was
passed on without independent verification) — `help_text` was never
"fetched and discarded," it was already rendering in `QuestionField`
(`CreateListingPage.tsx`). The real, narrower bug, found while checking
that claim: it was gated on `!invalid`, so it disappeared the instant a
field failed validation — exactly the moment a seller most wants "Required,
buyers cannot ask before buying" (Size's own `help_text`), not less.

**Fixed**: removed the `!invalid` guard, so `field.help_text` now renders
unconditionally (still only for non-`select` types — unchanged, and still
a no-op today since zero `select` fields carry `help_text`). The two no
longer compete: `fieldErrorText()` used to reuse a field's own `help_text`
as the error message when present, which would now have shown the exact
same line twice (once calm, once red) the moment a field went invalid.
Changed it to always return the generic "This is required. Buyers cannot
ask before buying." — the specific guidance and the generic alert are now
two distinct, complementary lines rather than one repeated. The error
line also got `fontWeight: 700` (on top of its existing red colour and "!"
icon) so it stays the visually louder of the two regardless of order —
help text above, in muted grey; error below, bold and red.

**Condition questions checked for the same pattern, found clean**:
`ConditionQuestionField`'s `question.help_text` (line 975) and the
follow-up's "A few words is enough..." hint (added in §17) were both
already unconditional, no `!invalid` guard on either — nothing to fix
there. Its own error line doesn't reuse `help_text` either (it uses
`followup_label` or a generic string), so no duplication risk existed
there to begin with.

**Not verified live**: create-listing remains seller-login-gated, no
session available this pass — `tsc --noEmit` and `npm run build` clean
only.

`npm run build` and `tsc --noEmit` both clean.

## 19. Checkout no longer flashes "payment not set up" while settings load (2026-08-05)

**The race, precisely.** `CheckoutPage.tsx`'s payment-settings `useQuery`
(no `enabled` gate, fires on mount) leaves `settings` as `undefined` until
it resolves. `paystackEnabled = settings?.marketplace_payment_paystack_enabled
=== true` reads as `false` during that window — correctly `false` once
truly off, but indistinguishable from "not loaded yet." The
`paymentsDown` early-return was already correctly gated on `settingsLoaded`
(`settingsLoaded && !paystackEnabled && !transferEnabled`), so that
wasn't the bug. The actual bug was one ternary further down, in the main
render: `{paystackEnabled ? <PaystackUI/> : <TransferFallback .../>}` —
this has no `settingsLoaded` gate at all, so while settings are loading it
picks the transfer-fallback branch (since `paystackEnabled` reads false),
which then evaluates `bankReady` — also derived from the same not-yet-loaded
settings, also `false` — and renders its own `!bankReady` state: *"Payment
details are not set up yet... message us on WhatsApp to complete your
purchase."* Two settings-driven branch points, only one of them guarded.

**Fix**: extended the existing top-of-render early loading return
(`if (authLoading || isLoading) return <spinner>`) to also cover
`!settingsLoaded`. Nothing downstream — the `paystackEnabled` ternary
included — can render until settings are genuinely known, so the wrong
branch can no longer be picked. One line changed, same pattern as §8's
stale-numeric-fallback fix (never render "not loaded yet" as a real
value), reusing the exact loading treatment already used for
auth/listing.

**Audited for the same pattern elsewhere in the marketplace, one other
candidate found, correctly not fixed**: `offersEnabled` in
`ListingDetailPage.tsx` (`{ data: offersEnabled = false }`) drives whether
the "Ask for a lower price" entry point renders at all — while loading it
renders **nothing**, not a wrong state, matching the one case this task
explicitly says to report rather than fix. `feeAdded` in `CheckoutPage.tsx`
is already nested behind its own `!payQ.data` loading check, no exposure.
No other boolean settings toggle is read anywhere else in the marketplace
frontend. The numeric settings already addressed in §8 (markup, discount
cap, dispute/return windows) display a *number*, never pick between two
different UI branches, so they're a different class of bug and untouched
here.

**Verified with the network genuinely slow, not just at normal speed, as
required** — real DevTools throttling isn't exposed by the tools
available here, so this was simulated deterministically instead: a
temporary `await new Promise(r => setTimeout(r, N))` was added directly
inside the settings `queryFn` (removed before commit, confirmed absent
via `git diff` and a `grep` for the word `TEMP`), then the page was
hard-reloaded fresh each time so react-query's cache couldn't mask the
delay.
- **Before the fix**, mid-delay: item summary and price render correctly,
  but the payment section shows "Transfer exactly ..." (the wrong
  section entirely — Paystack is what's actually on) with a red
  *"Payment details are not set up yet, please message us on WhatsApp to
  complete your purchase"* box. Screenshotted live at this exact moment,
  confirming the bug precisely as described, not inferred from code alone.
- **After the fix**, mid-delay: the full page shows only the same
  BundledMum loading animation already used for auth/listing loading —
  no payment section, no error, no empty gap. Once the delay elapses it
  resolves straight into the correct Paystack checkout (item price,
  details form, the four-line held-box, "Continue to payment") with no
  flash of the wrong state at any point in between. Confirmed both the
  mid-delay state and the eventual correct resolution, not just the end
  state.

**Preserved, confirmed unbroken**: the genuinely-unavailable state
(`paymentsDown`, untouched, still fires once settings are loaded and both
methods are actually off), the transfer fallback behind
`marketplace_payment_transfer_enabled`, the four-line breakdown, the Pay
button, the negotiated-price path, guest checkout.

`npm run build` and `tsc --noEmit` both clean.

## 20. Meta Pixel scoped per app, ViewContent + InitiateCheckout wired, Privacy Policy discloses it (2026-08-07)

**The storefront and marketplace are two separate Meta pixels by design**,
not a config mistake to reconcile:
- Storefront (bundledmum.com): `947693044571219`
- Marketplace (`/marketplace`): `1737624674564707`, already configured
  server side via `site_settings.meta_pixel_id` and already sending a real
  `Purchase` event through the Conversions API (unchanged by this pass).

**The bug this pass fixed**: `index.html` is the shared HTML shell for
both apps (see `App.tsx`'s `isMarketplace()` split — one React root, two
lazy-loaded trees, only one of which ever mounts per page load). It
hardcoded `fbq('init', '947693044571219')` and `fbq('track', 'PageView')`
directly in the `<head>`, unconditionally, before React ever runs and
before it's known which app is being requested. Every marketplace page
load was therefore also logging a PageView against the storefront's
pixel — cross-contamination in one direction (marketplace → storefront
pixel), silent because nothing downstream ever checked.

**Fix**: `index.html` now only loads the `fbq` queue function and
`fbevents.js` — no `init`, no `track`. Pixel init moved into
`PixelRouteListener.tsx` (`src/components/PixelRouteListener.tsx`),
generalised to take a required `pixelId` prop: it calls `initPixel(pixelId)`
once (via a ref, not re-initing on every route change) then fires
`track("PageView")` on every route change, same as before. Each app tree
mounts its own instance with its own literal pixel ID —
`StorefrontApp.tsx` passes `947693044571219`, `MarketplaceApp.tsx` (new
import, mounted inside its own `<BrowserRouter>` alongside
`MarketplaceScrollManager`) passes `1737624674564707`. Because the two
trees are separate lazy-loaded chunks (confirmed in the build output:
`StorefrontApp-*.js` and `MarketplaceApp-*.js` are already distinct
bundles) and neither pixel ID literal lives in a file both trees import,
a storefront visitor's browser never even downloads the marketplace pixel
ID and vice versa — not just "doesn't fire to it," genuinely never sees
it. `src/lib/metaPixel.ts` itself stays pixel-ID-agnostic (no ID literal
in that file at all), so it was safe to keep shared and just extend:
added `initPixel(pixelId)` and gave `track()` a third, optional `eventID`
parameter (Meta's `fbq` 4th argument), backward compatible with every
existing call site.

**Known, deliberately unaddressed edge case**: the `<noscript>` pixel
`<img>` fallback in `index.html` still hardcodes the storefront ID and
fires unconditionally for no-JS requests. Not fixed, because a no-JS
visitor to `/marketplace` never renders anything at all (the whole route
split lives in React) — the only traffic this could affect is bots/no-JS
crawlers hitting a blank marketplace page, which is a negligible, already
degenerate case, not a real visitor seeing marketplace content logged as
a storefront view.

**ViewContent** (`ListingDetailPage.tsx`) and **InitiateCheckout**
(`CheckoutPage.tsx`) are now wired, dedup-meaningful since both sides
target the same real pixel:
- Both fire a browser Pixel event (`track(..., eventId)`) **and** a
  server-side Conversions API call
  (`src/marketplace/lib/metaConversion.ts`'s
  `sendMarketplaceConversionEvent`, POSTing to the already-deployed
  `send-meta-conversion-event` edge function) with the **same**
  `crypto.randomUUID()` `event_id`, so Meta dedups them into one event on
  the marketplace pixel.
- **ViewContent**: gated on a `isLiveView` check
  (`!isLoading && !isError && !!listing && available > 0`) computed
  *before* the loading/gone/sold/404 early returns (hooks can't follow a
  conditional return), guarded by a `useRef` so it fires at most once per
  mount. Sends `content_id`/`content_name`/`value` from the listing, plus
  email (from `useCustomerAuth()`'s `user.email`) and phone (a new,
  small `customers` lookup, same shape as checkout's existing
  `profileQ`) only for a signed-in buyer — never prompted, never blocks.
- **InitiateCheckout**: fires once a real `order` exists and the total is
  the *authoritative* figure the breakdown itself displays —
  `paystackTotal` (from `payQ.data`) once Paystack has priced it, or
  `transferTotal` on the bank-transfer fallback — never a value computed
  separately. Guarded by a `useRef`, not `sessionStorage` (this only
  needs to not re-fire within one page load, unlike the storefront's
  session-scoped `checkoutTracking.ts` pattern, which was not reused here
  since it doesn't carry an `event_id`/CAPI dedup story at all). Email and
  phone come from the signed-in buyer's profile, or from the guest
  `emailInput`/`phoneInput` fields *if already filled at the moment the
  effect fires* — never blocking on them, simply omitted if empty then.

**Master switch (Part 4 equivalent)**: chose to always call the edge
function and let it self-skip, rather than also gating client side. The
function already checks `site_settings.meta_conversions_api_enabled`
(note: **not** `marketplace_conversions_api_enabled` — that key does not
exist; the real key is un-prefixed) and returns a clean `{ skipped }` when
off or unconfigured, so a client-side check would only save one network
call while adding a second settings read and another place this exact
class of stale-value race (§8, §19) could recur. No Supabase changes made
this pass — both pixel IDs and the master switch were already correctly
configured.

**Privacy Policy**: added the Meta advertising disclosure as its own
paragraph in the "Who we share it with" section
(`PrivacyPage.tsx`, section 3), between the Paystack/Resend/SMS paragraph
and "We do not sell personal data to anyone" — exact wording as given.
`site_settings.marketplace_policies_updated_at` bumped from
`04 August 2026` to `07 August 2026` via direct `UPDATE`, same mechanism
prior policy-copy changes have used.

**Preserved, confirmed unbroken**: the storefront's own Pixel tracking,
unaffected in behaviour (still inits `947693044571219` and fires PageView
on every route change, just via a prop now instead of a hardcoded value);
the backend `Purchase`/`CompleteRegistration`/`Lead` events already firing
server side against the marketplace pixel; listing detail's gone/sold/
removed/404 states and the how-it-works explainer; checkout's four-line
breakdown, Pay button, and negotiated-price path.

`npm run build` clean.

## 21. Become-a-seller (/marketplace/sell) rebuilt as a conversion landing page (design 29a) (2026-08-07)

**Replaced** the old value-screen version of `BecomeSellerPage.tsx` with the
design's frame 29a: a hero (singular decluttering message, "Sell the baby &
children's items you don't need anymore"), a live category showcase, four
core-message cards, a distinct reseller callout, a closing CTA, and (mobile)
a sticky footer CTA. No buyer-side fees, price breakdown, calculator, or
invented stats anywhere — carried forward from the version this replaces.

**Category showcase reads live, no hardcoding**: reused the existing
`useAllowedCategories()` / `useCategoryGroups()` hooks
(`src/marketplace/data/useListings.ts`), the same source already driving
browse's filter accordion —
`marketplace_categories.select("id, name, icon, group_id, sort_order").eq("is_allowed", true)`
joined client side to `marketplace_category_groups.select("id, name, sort_order")`.
The 7 tiles are the 7 groups, in `sort_order`; each tile's icon is that
group's first allowed category (by the category's own `sort_order`, then
name) since `marketplace_category_groups` itself has no icon column — the
only way to source a "group icon" without hardcoding one. **Known deviation
from the design mockup**: the mockup's hand-picked icons for Travel &
carriers (🚼) and Nursery (🛏️) don't match what this live rule actually
returns today (🍼 and 🌙 — Travel's first category, "Strollers and prams,"
happens to share an icon with Feeding). The other 5 groups match. A
per-group icon map would fix this but means hardcoding, which the task
explicitly forbade — left as-is, live and correct by rule, not by the
mockup's specific emoji.

**Logged-in-seller behaviour changed, not just restyled**: the old page
auto-redirected an existing seller straight to `/sell/dashboard` on mount
(`useEffect` + `navigate(..., {replace:true})`) before they ever saw this
page. The design's own seller state (S2) is different in kind — it keeps
the seller on `/sell` with its own small hero ("Got something else to
sell?"), two CTAs (List a new item → `/sell/new`, My dashboard →
`/sell/dashboard`), and skips the category showcase/message
cards/reseller section entirely. Implemented per the design: the
auto-redirect effect is gone, replaced with a conditional render on
`seller` from `useSeller()`.

**CSS is a new, dedicated `.mkt-sl-*` prefix**, not a reuse of
`.mkt-sell-head`/`.mkt-sell-body`/`.mkt-sell-foot` — those three are shared
across the dashboard, payouts, order detail, dispute and price-edit
screens with their own page-scoped overrides, so restyling this page under
the same class names would have risked bleeding into all of them. Buttons
are explicit-sized (`min-height`, `width: auto`, never `flex:1` or
`width:100%` other than the mobile sticky bar's own full-width button),
the same fix shape as `.mkt-notfound-cta` (§11/§12), not the stretch bug it
fixed.

**A real bug found and fixed during live verification, not just a code
review**: the page initially blew out to 640px wide on a 375px mobile
viewport (headline unwrapped, horizontal scroll on the whole page).
Root cause: `.mkt-main` (the shared route container) is `display:flex;
flex-direction:column`, and `.mkt-sell-landing` — sized only with
`max-width:640px; margin:0 auto`, no explicit `width` — resolved to a
shrink-to-fit width based on its widest descendant's max-content size (the
horizontally-scrolling category row's ~732px of un-wrapped tiles) rather
than stretching to the container's actual 375px. Fixed by adding
`width: 100%; box-sizing: border-box;` alongside the existing
`max-width`/`margin: 0 auto` — the same pattern `.mkt-notfound-wrap`
already uses for exactly this reason. Confirmed via
`document.documentElement.scrollWidth === window.innerWidth` at 375px,
and separately at 1280px (desktop hero, 2×2 icon preview, full 7-across
grid, 4-across message row) with no horizontal overflow at either.

**Verified live** (public page, no login needed) at 375px mobile — hero
wraps correctly, category row scrolls within its own bounds, all 4 message
cards, reseller callout, closing CTA, and sticky footer CTA all render —
and at 1280px desktop — row-direction hero, 1100px max content width, no
overflow. The logged-in-seller state (S2) was **not** live-verified — no
seller login credentials exist in this environment — code-reviewed against
`useSeller()`'s `seller` value only.

**Preserved, confirmed unbroken**: the seller login gate
(`sendToMarketplaceLogin("/sell", "sell")`) and its return-destination
handling, create-listing/seller-setup/every other seller screen downstream
(none of their files were touched), category data still reading live per
the principle already established for browse's icons.

`npm run build` clean.

## 22. Admin featured categories manager (design 30a), wired into browse home and the sell page (2026-08-07)

**New admin screen**: `/admin/marketplace/featured-categories`
(`src/pages/admin/marketplace/MarketplaceFeaturedCategories.tsx`, sidebar
entry "Featured categories" right after "Categories" in `AdminLayout.tsx`,
gated `PermissionGate module="marketplace" action="manage"` like every
other marketplace admin screen). Curates `marketplace_featured_categories`
(deployed ahead of this pass, not built here) for two independent
surfaces — `browse_home` and `sell_page` — mobile tabs / desktop
side-by-side columns per the design, up/down buttons to reorder (swaps
`sort_order` between adjacent rows, same pattern
`MarketplaceCategoryFields.tsx`'s `moveField` already uses — no drag
library exists anywhere in this codebase, and the task this shipped from
explicitly allowed either), a ✕ to remove, and a search-and-pick add
sheet sorted by live count (highest first), reusing the
`BulkApplyDialog`-style modal shell.

**Live counts**: one query, not one per category —
`marketplace_listings.select("category_id").eq("status","live")`,
aggregated into a `Record<category_id, count>` client side, reused across
both tabs and the add picker, refetched after any mutation. With order-of-
tens of live listings today this is trivial; a per-category count loop or
a realtime subscription would both have been overkill.

**Duplicate prevention**: the add picker excludes categories already
featured on that surface (the primary defence — a duplicate is simply
never offered). The database's own unique `(surface, category_id)`
constraint is the backstop for a race between two admins; if it fires,
the insert's Postgres error code (`23505`) is caught and shown as "That
category is already featured on this surface." rather than the raw
constraint error.

**Zero-stock styling differs deliberately by surface**, per the design:
on `browse_home` a 0-live category gets a red border and a red count pill
(a quiet nudge, since the whole point of that surface is showing what
actually exists); on `sell_page` the same 0-live count renders as a
neutral grey pill, since that surface sells category breadth to a
prospective seller, not current stock, and 0 there is a perfectly valid
pick.

**Both consuming surfaces switched, with a fallback each, verified live**:
- **Browse home** (`BrowsePage.tsx`): the "6 home tiles" row used to be
  `groupCategories(categories, groups).grouped.flatMap(...).slice(0, 6)`
  unconditionally. Now tries `useFeaturedCategories("browse_home")` first
  (joined against the already-fetched allowed-categories list for
  name/icon, filtering out anything that fails to resolve); **falls back
  to the exact same old computation** whenever the curated list is empty.
  Live-verified at 375px: tiles now read "Baby carriers and wraps, Baby
  shoes, Baby bath and grooming, Feeding bottles and accessories, Diaper
  bags, Cot and nursery furniture" — exactly the seeded `browse_home` rows
  in `sort_order`, not the old group-order default.
- **Sell page** (`BecomeSellerPage.tsx`): the 7 `groupTiles` used to
  always be one-per-group with a synthetic label (the group's own name,
  icon borrowed from that group's first category). Now tries
  `useFeaturedCategories("sell_page")` first, showing the curated
  category's own real name and icon (not a group label, since a featured
  row is a specific category, not a group); **falls back to the exact
  same old one-per-group computation** whenever nothing is curated. Live-
  verified: tiles now read "Baby clothing, Feeding bottles and
  accessories, Strollers and prams, Nursery decor, Toys and games,
  Maternity wear, Baby bath and grooming" — the real category names from
  the seeded `sell_page` rows, not the old group names.
- Neither fallback is new code — both are the exact pre-existing
  computation each page already had, simply no longer short-circuited
  when there's something curated to prefer instead. Neither page can ever
  render its category section empty just because admin hasn't configured
  it yet.

**Auto-removal on disable**: `trg_remove_disallowed_from_featured`
(deployed ahead of this pass) already drops a category out of every
featured list the moment it's disabled elsewhere in admin — confirmed
present via `information_schema.triggers`, nothing new needed here.

**Not live-verified**: the admin manager screen itself — no admin login
credentials exist in this environment, same standing limitation as every
other admin screen. Code-reviewed against the design and against
`MarketplaceCategoryFields.tsx`'s established conventions (`adb` client,
`OpsHeader`, Tailwind, inline hex styles) only.

`npm run build` clean.

## 23. Browse home "See more categories" and per-category "no stock yet" notify flow (design 31a) (2026-08-07)

**See more, `BrowsePage.tsx`**: the 6 featured tiles are unchanged; below
them, "See more categories `N` ▾" reveals the remainder 6 at a time, in
place, no navigation, no scroll position lost. Everything needed
(`categories`, `groups`) was already fetched client side by the existing
`useAllowedCategories()`/`useCategoryGroups()` hooks, so a tap never
triggers a fetch — a `revealCount` state just grows by 6 and slices
further into an already-in-hand `remainderCats` array. Ordering: the
remainder is `defaultTileCats` (the existing group-then-category
`sort_order` computation, already used as the featured-tiles fallback)
minus whatever's currently featured — matches the design's stated logic
exactly, no deviation to report. A small uppercase group-label header is
inserted wherever the group changes within the currently-revealed slice
(computed from the slice itself, so a header is never dangling without at
least one tile under it). Once every category is shown, the control is
replaced by the design's closing line, a centred rule plus "That's all
`N`, for now" — not just removed with dead space beneath it. Revealed
tiles reuse `.mkt-cat`/`.ic`/`.nm` completely unchanged from the featured
ones, no visual split, per the design's explicit "a visible split would
read as second class categories."

**Live-verified end to end** (mobile, 375px): tapping through revealed
"Clothing and shoes group" → "Feeding group" → ... → "Bath and care
group" in the correct order, count pill decrementing 33 → 27 → ... → 0,
landing on "That's all 39, for now" with the control gone.

**One number in the task prompt didn't match live data**: it assumed 37
allowed categories; the real count is 39 (confirmed both live in the UI
and via `count(*) from marketplace_categories where is_allowed`). Not a
bug to fix, since the count is read live everywhere, never hardcoded —
flagging only because a stale assumption repeated as fact is exactly the
kind of thing this handoff has burned on before (§4).

**No stock yet, `CategoryNoStockYet.tsx` (new) + `categoryInterest.ts`
(new)**: shown inside `BrowsePage.tsx`'s existing zero-results branch, but
only when a `categoryOnly` gate is true — the category filter is the
**only** active filter (no search, price, condition or location also
set). A combined filter that happens to return zero results still falls
through to the pre-existing, untouched "Nothing matches just yet" state —
confirmed live by searching a nonsense string (no category set): still
shows the old generic message and "Clear all filters", not the notify
form. This was deliberate, matching the task's explicit instruction not
to conflate the two.

Submitting calls `register_category_interest(p_category_id, p_email)`
(anon-executable, `SECURITY DEFINER`, confirmed writing into
`marketplace_category_notify_requests` with an
`on conflict (category_id, email) do nothing`). The only error surfaced
is the database's own `'Please enter a valid email address'`, shown
verbatim inline, matching the existing `buyerMakeOffer`-style error
mapping convention; anything else is logged and shown as a generic retry
prompt. A first-time and a repeat submission for the same (email,
category) both land on the identical success confirmation — verified live
by submitting a real test email against a genuinely empty category
(`Cots and cribs`), confirming the row landed in
`marketplace_category_notify_requests`, then deleting that test row
afterward so no fake data was left behind.

Because the RPC is silently idempotent (same `true` regardless of
first-time or repeat), the design's "returning visitor, already watching"
state (no form, just a confirmation chip) can only come from a **client
side** signal — a localStorage flag
(`bm_mkt_category_interest_<categoryId>` → the submitted email), written
at the moment of a successful submit, read on mount. Live-verified: after
submitting once, reloading the same category URL immediately shows "Still
nothing here, but you'll know first" with the stored email in a chip and
no email field, not the form again.

`npm run build` clean.

## 24. Home page category section (featured tiles + See more) made mobile only (2026-08-07)

**Deliberate decision, not a bug fix to the data**: the whole home
category section from §23 — the 6 featured tiles, the "See more
categories" button, its grouped expansion, and the "That's all N, for
now" closing line — no longer renders on desktop at any width. Desktop
browsers by category via the persistent filter panel instead
(`.mkt-fpanel`, already existed, untouched).

**The gap this closed**: `.mkt-cats` (the featured 6) was already hidden
at `@media (min-width: 1024px)`, the one breakpoint used throughout
`marketplace.css` for every mobile/desktop layout difference — but
`.mkt-cats-more`, `.mkt-cat-seemore` and `.mkt-cats-done` (all added in
§23) were not in that same rule, so a desktop visitor saw no featured
tiles yet still saw a floating "See more categories" button, and could
expand the grouped list beneath it. Fixed by adding the three missing
selectors to the existing hide list — same breakpoint, same `display:
none` mechanism, no new breakpoint introduced. `BrowsePage.tsx` itself is
untouched: the data fetching and reveal state still run on desktop, they
just render into elements CSS removes from layout.

**Verified live**: at 1280px, the section (tiles, button, expansion) is
completely absent — no DOM element renders, confirmed via
`getComputedStyle(...).display === 'none'` — and the gap between the
green topbar and the results bar measures 0px, no leftover spacing. At
375px mobile, the section is pixel-for-pixel unchanged: 6 featured tiles
plus "See more categories 33 ▾" render exactly as in §23.

`npm run build` clean.

## 25. Bug hunt: seller's magic link left them signed out on marketplace login (2026-08-07)

**Reported**: a seller tapped their real magic link from their inbox
(preview-bot consumption ruled out for this incident) and landed on
`/marketplace/login` still signed out, instead of being carried through
to `/sell`.

**The hypothesis this task asked me to check for — a mount-time-vs-event-only
session-detection race — does NOT apply here.** `useCustomerAuth.ts` already
does a mount-time `supabase.auth.getSession()` check (not event-only), and
I verified at the library level (`@supabase/auth-js@2.111.0`,
`GoTrueClient.js:2401`) that `getSession()` itself awaits
`this.initializePromise` — the exact promise that runs `detectSessionInUrl`,
auto-started in the client constructor — so it cannot resolve before a
redirect-detected session has finished establishing, regardless of when the
component mounts. `returnTo` decoding was also confirmed correct: the real
link's `%252Fsell` resolves to `/sell` after Supabase's own redirect decode
plus one `useSearchParams()` decode.

**Actual root cause, confirmed by reading the library source and then
reproducing live**: when Supabase rejects a magic-link token (expired, or
already used — an ordinary occurrence, not only the ruled-out preview-bot
case) it redirects to `redirect_to` with
`#error=access_denied&error_code=otp_expired&error_description=...`
instead of a session. `GoTrueClient.js`'s `_initialize()`
(lines ~392-407) explicitly does not establish a session or notify any
subscriber in this case ("*don't remove existing session on URL login
failure*"), and `getSession()` doesn't surface that error either — it just
falls through to reading storage, finds nothing (a first-time sign-in),
and returns `{session: null}`. `MarketplaceLoginPage.tsx` had **zero**
code reading `error`/`error_code`/`error_description` from the URL, so the
result was the plain sign-in form rendering again with no explanation at
all — indistinguishable from never having clicked anything.

**Live-reproduced against the unmodified code** by navigating the preview
browser to
`/marketplace/login?returnTo=%2Fsell&reason=sell#error=access_denied&error_code=otp_expired&error_description=...`
(the exact shape Supabase produces for an expired/reused token): the plain
"To start selling, we need your email" form rendered, no error, no
console warning — the reported symptom exactly.

**Fix** (`MarketplaceLoginPage.tsx` only): a one-time mount effect parses
`window.location.hash` for `error`/`error_code`/`error_description`; if
present, shows "That link has expired or was already used. Please send
yourself a new one below." (reusing the existing `.mkt-login-senderr`
style) and strips the hash via `history.replaceState` so a reload doesn't
re-trigger it. Cleared again on a successful resend. Verified live
post-fix: the same synthetic error URL now shows the message, with the
hash cleaned from the address bar (`returnTo`/`reason` query params
preserved); a plain, error-free load of the same URL still renders
exactly as before, no new banner.

**Storefront's `AccountLoginPage.tsx` has the identical gap** (same
`useCustomerAuth()` pattern, zero `error`-hash handling) — independently
duplicated UI, not shared code, so this fix doesn't touch or resolve it.
Flagging as a real, worth-fixing-separately finding, left untouched per
this task's scope.

**Still worth guarding against generally** (not chased further per
instruction, since ruled out for this specific incident): any automated
link-visiting system reachable from an inbox — corporate email security
scanners (Safe Links, Proofpoint, Mimecast-style), not just chat-app link
previews — would consume a one-time magic-link token before the real
click, producing this exact same `otp_expired`-shaped failure. The fix
above at least makes that failure visible and recoverable instead of
silent, but doesn't prevent the token from being consumed early.

**Manual test for a human to confirm in production** (the same
reload-and-recheck test used to narrow this down, now with the fix
live): tap a magic link a second time after already using it once (or
wait past its expiry, then tap it) — the login page should now show the
"link has expired or was already used" message with a ready email field,
not a silent blank form. Separately, to confirm the original mount-time
session-detection path (never actually broken) still works: sign in
normally once, then directly load `/marketplace/sell` in a fresh tab —
it should show as signed in immediately, no reload needed.

`npm run build` clean.

## 26. Marketplace description updated: "baby and toddler" → "baby and children's" (2026-08-07)

The marketplace genuinely expanded beyond baby/toddler items (new School
age category group — school bags, uniforms, children's bicycles and
scooters, sports gear, children's furniture — plus two new older-children
categories under Clothing and shoes, plus Board games and puzzles).
General descriptive copy across the marketplace updated to say so.

**Full sweep** (`grep -rniE "baby|babies|toddler|toddlers" src/marketplace/`)
found 9 hits. 4 already read "baby and children's"/"baby & children's"
from earlier passes this session, unchanged. 5 genuinely said "baby and
toddler" or bare "baby" and were rewritten, not blind-replaced:
- `MarketplaceLoginPage.tsx` — "a safer way to buy and sell used baby
  things" → "...used baby and children's things"
- `TermsPage.tsx` §1 — "...selling their own used baby and toddler
  things" → "...baby and children's things"
- `BrowsePage.tsx` — page title, `.mkt-hl-long` (mobile hero) and
  `.mkt-hl-short` (desktop compact topbar) all updated from "baby and
  toddler items" / bare "baby items" to "baby and children's items"; the
  short version specifically re-verified live at 1024px (the tightest
  breakpoint) to confirm the longer string still fits on one line with no
  wrap or overflow — it does.

**No category name was touched or was ever at risk** — every category
name is read live from the database, none are hardcoded as literal
strings anywhere in the marketplace frontend, so there was no ambiguity
between "keep this" and "change this" to resolve.

**"Kids" was used once by mistake mid-edit** (the desktop short tagline)
and caught and corrected to "children's" before verifying live, per the
explicit brand rule against that word.

**Email templates**: confirmed already (all 37 checked directly against
the database contain zero mentions of baby/toddler/children) — no
template needed changing for this pass.

`npm run build` clean.

## 27. Per-route meta descriptions and Open Graph tags for the marketplace, extending Seo.tsx (2026-08-07)

**New**: `src/marketplace/components/MarketplaceSeo.tsx`, a thin wrapper
around the storefront's existing `src/components/Seo.tsx` — same
mechanism (react-helmet-async), not a second system. It exists only to
correct two things `<Seo>` can't handle unmodified inside this router:
the marketplace mounts with `basename="/marketplace"`, so
`useLocation()` here already has that prefix stripped (`<Seo>`'s own
canonical/`og:url` default would be wrong, and would collide with the
storefront's own page at the same bare path, e.g. `/terms`); and every
marketplace page needs a real, non-blank description/image even when the
caller has nothing specific to say, so both default to an accurate
generic marketplace summary and BundledMum's existing default share
image (`https://bundledmum.com/images/og-default.jpg` — no
marketplace-specific image asset exists, and generating one was out of
scope) rather than being silently omitted.

**Listing detail** (`ListingDetailPage.tsx`), genuinely dynamic, only on
a live listing (the same render branch that was already gated past every
gone/sold/removed/404 check): real title, `display_description` truncated
to ~155 characters at a word boundary (never mid-word), `og:type=product`,
real `image_url` with the same default fallback image when a listing has
none (e.g. a sold listing whose photos were purged after 30 days), and a
correct per-listing canonical `og:url`. Live-verified against a real
listing — `og:image` resolved to the listing's actual Supabase Storage
photo, `og:url` to
`https://bundledmum.com/marketplace/listing/<id>`, description a real
truncated sentence.

**Gone/sold/removed/404** (`NotFoundOrGoneScreen.tsx`, also covers the
site-wide `MarketplaceNotFoundPage.tsx` catch-all): generic tags, not the
listing's own — the case-specific title it already computed (e.g. "X has
sold"), the default description/image, plus `noindex,nofollow` (a gone
URL is never the canonical page for that item and shouldn't be indexed —
not explicitly asked for, but clearly correct here; NOT applied to the
five policy pages, since noindexing legitimate public content wasn't
requested and is a real SEO call this pass didn't make unilaterally).
Live-verified.

**Browse home, the sell pitch page (both its new-visitor and
existing-seller hero states), and all five policy pages** each get a
distinct, accurate title and description — reusing the exact "baby and
children's" wording corrected in §26, not a third variant. Live-verified
on Browse and Buyer protection.

**Checkout and order pages** (8 files under `checkout/`, ~20 call sites):
mechanically swapped to `MarketplaceSeo` with `noindex` added — private,
per-user pages, a plain default description is enough, and they have no
reason to be indexed at all.

**Safety, confirmed with evidence, not assumed**: read `Seo.tsx` and the
installed `react-helmet-async@3.0.0` source directly.
`dangerouslySetInnerHTML` exists in that library ONLY for the
`<script>`/`<style>`/`<noscript>` `innerHTML`/`cssText` path (used solely
by `Seo.tsx`'s JSON-LD `jsonLd` prop, which `MarketplaceSeo` never passes
— it always sets `breadcrumbs={[]}`). Every `<meta>`/`<title>`/`<link>`
tag — everything a listing's seller-supplied title and
`display_description` actually flow through — is built via
`React.createElement(type, props)` with the value as a plain prop, or (on
direct DOM update) the browser's native `element.setAttribute()`, exactly
like ordinary JSX. No raw string concatenation anywhere in this path.

**A real limitation found, not fixed here, worth surfacing plainly**: the
site is a client-rendered SPA. `og-prerender.ts`
(`netlify/edge-functions/`) already documents and solves this exact
class of problem for `/articles/*` — its own comment: *"Social crawlers
don't run JS, so the client-side react-helmet OG tags never reach them —
they'd see the generic index.html."* It intercepts known bot user agents
(WhatsApp explicitly among them) and serves a server-rendered HTML stub
built by a dedicated Supabase edge function, falling through to the
normal SPA for everyone else. **That prerendering is scoped only to
`/articles/*`** (`netlify.toml`) — `/marketplace/listing/*` is not
covered. Confirmed live: `MarketplaceSeo`'s tags render correctly and
dynamically in a real browser (any JS-executing consumer — Googlebot,
in-app browsers that unfurl after opening — sees them correctly), but a
non-JS crawler hitting a listing URL directly still only ever receives
`index.html`'s static site-wide tags, unchanged, exactly as before this
pass. **This pass's own non-goals explicitly excluded Supabase edge
function changes**, and extending `og-prerender` to listings would need
one (mirroring the articles pattern) plus a `netlify.toml` path addition
— genuinely out of scope here, not overlooked, but the literal
"WhatsApp preview" outcome the task opened with needs that follow-up
piece to actually land, on top of everything shipped in this pass.

`npm run build` clean.

## 28. Investigation: neither prerendering mechanism (§27's follow-up) is actually live — resolved with evidence, no code changed (2026-08-08)

**The question going in**: earlier project notes described a Supabase
edge function handling social-preview prerendering, live, with a
separate Cloudflare Worker version paused pending a DNS migration from
Namecheap to Cloudflare. §27 separately found
`netlify/edge-functions/og-prerender.ts` in the repo, handling
`/articles/*`. Before extending anything to marketplace listings, which
one is actually real?

**Answer, with direct evidence: neither is receiving live traffic
today.** Confirmed multiple independent ways, not by reading code alone:

1. **Direct crawler-simulated requests to the live domain**, same real
   article URL, four different user agents (WhatsApp's real UA,
   Googlebot's, `facebookexternalhit/1.1`, and plain `curl`) — **all four
   returned byte-identical generic HTML**, the static site-wide
   `index.html` tags, not the article's real title/image. If the Netlify
   function were intercepting WhatsApp's UA as its own code claims, that
   specific request would have differed from the others. It didn't.
2. **Response headers show no Netlify anywhere** — `server: cloudflare`,
   a `cf-ray` header, a custom `x-deployment-id` header consistent with
   Lovable's own hosting, no Netlify signature of any kind.
3. **DNS**: `bundledmum.com`'s nameservers are still
   `dns1/dns2.namecheaphosting.com` — the Namecheap→Cloudflare DNS
   migration mentioned in the earlier notes has not happened. The site is
   already served through Cloudflare's network regardless (consistent
   with Lovable's own hosting sitting behind Cloudflare), independent of
   that migration.
4. **Supabase edge function invocation logs**, scanned across the full
   recent window for every function in the project: dozens of other
   functions fire routinely in that same window (cron sweeps,
   marketplace emails, `meta-catalog-feed`, etc.) — `og-prerender` has
   **zero** invocations anywhere in it.
5. **Called the Supabase `og-prerender` function directly** (not through
   the site) — it works correctly in isolation, returning genuinely
   correct per-article tags pulled from the real `articles` row. The
   renderer logic is sound. Nothing in production calls it.
6. **`git log`**: `netlify.toml` and `og-prerender.ts` were added in
   exactly one commit (`b5cf881`, 2026-06-09, by an earlier session),
   whose own commit message claims *"Fixes WhatsApp and Facebook link
   previews."* No commit since has touched, verified, or referenced it
   again. Nothing in this repo suggests it was ever actually verified
   against live production traffic before being declared fixed — the
   evidence above shows it was not.

**Not chased further, out of reach from this environment**: whether a
Cloudflare Worker equivalent exists anywhere is unverifiable from here —
`grep` for "cloudflare" across the entire codebase returns nothing, so
if it exists it lives outside this repo. Confirming or fixing any of
this needs access this session doesn't have: Lovable's own
hosting/domain configuration, a Netlify account (to check whether a site
is even connected to this repo, and if so to which domain), and the
Namecheap DNS dashboard.

**Decision, given this finding**: presented live to the user before any
code was written for the marketplace-listing extension this was
supposed to be paired with (see the task that opened this
investigation). Chosen path: **stop here, resolve `/articles/*`
prerendering in production first**, before extending anything to
`/marketplace/listing/:id` — extending a mechanism that isn't in the
live request path would not make WhatsApp previews work for listings
either, so building on it now would just repeat the same unverified
claim this investigation found. No code changed this pass. The
marketplace's own `MarketplaceSeo` work from §27 is complete and correct
for any consumer that executes JavaScript; the crawler-specific gap
described above is what still needs a real hosting-layer fix before a
server-rendered listing preview is possible.

No `npm run build` needed — no source files changed, docs only.

## 29. Admin seller detail: "Suggested outreach" nudges (2026-08-08)

**`MarketplaceSellers.tsx`** (`SellerDetail`) now calls the deployed
`get_seller_nudge_suggestions(p_seller_id)` RPC and shows a "Suggested
outreach" card listing every lifecycle stage the seller currently
matches — zero, one, or several at once — sorted by `urgency` ascending
so the most time-sensitive nudge (a sale awaiting dispatch, a return
awaiting confirmation, both urgency 0) surfaces first. Confirmed by
reading the function's own definition that its seven stages are checked
and returned in a **fixed order that does not already match ascending
urgency** (e.g. stage 1 is urgency 1, stage 5 is urgency 0), so the
client-side sort is load-bearing, not redundant. Also confirmed the
function is gated by `has_admin_permission('marketplace', 'manage')` —
the same permission this whole screen already requires.

The seven stages: never listed anything, a rejected listing not yet
resubmitted, bank details or legal name incomplete, a live listing with
no sale after a few days, a sale awaiting dispatch, a buyer's price
request awaiting reply, a return sent back awaiting the seller's
confirmation.

Each row shows the `label` plainly plus a WhatsApp button reusing the
exact styling already established for buyer contact
(`MarketplaceBuyers.tsx`, `#25D366` background, white text) — `href` is
`whatsapp_link` exactly as the function returns it, no client-side
reconstruction or re-encoding. Zero matches renders nothing — no
placeholder card — since that's a real, correct state for a seller with
nothing currently needing outreach, not a broken query.

Not live-verified — no admin login credentials exist in this
environment, the same standing limitation as every other admin screen.
Code-reviewed against the function's actual deployed definition (read
directly, not assumed) and the established `adb.rpc()` call pattern
already used elsewhere in this file's siblings
(`MarketplaceListings.tsx`, `MarketplaceBuyers.tsx`,
`MarketplaceSettings.tsx`).

`npm run build` clean.

## 30. Admin seller detail: full contact and legal identity, read only (2026-08-08)

**`MarketplaceSellers.tsx`**'s seller detail panel now shows a
"Contact and identity" card (right after the stat card, before
Suggested outreach and Bank details): **Legal name**
(`legal_first_name` + `legal_last_name` together, "Not on file yet" if
either is missing — locked by a database trigger once both are set,
correcting it is a separate future piece, not this pass; label kept
distinct from the public `display_name` shown in the header above it),
**Phone**, **WhatsApp**, and **Email** (via a `customer_id` embed to
`customers`, not previously joined anywhere in this file). Entirely
display-only — no new mutation, no new editable field.

**WhatsApp shown against `phone_is_whatsapp`, not a raw string
compare**: `phone` is stored local-format (`"08160040499"`),
`whatsapp_number` international-format (`"2348160040499"`) for the same
number — comparing the two strings directly would call every current
seller's numbers "different" when they're not. Every seller today has
`phone_is_whatsapp = true`; when true, WhatsApp shows "Same as phone,"
otherwise the distinct `whatsapp_number` value.

**A real RLS caveat found and reported, not fixed** (no migrations this
pass): `customers`' own SELECT policy requires
`has_admin_permission('orders', 'view')`, a **different** permission
than the `marketplace`/`manage` this whole screen is gated on. Checked
`has_admin_permission()`'s actual definition — only `super_admin`
bypasses automatically, every other role falls through to per-user
overrides then `admin_role_defaults`. Today this is harmless (the
`admin` role's own defaults grant both permissions together), but a
custom-role admin individually granted `marketplace:manage` without
also being granted `orders:view` would see the email silently come back
empty via RLS, not an error — worth knowing if a future custom role hits
this.

Not live-verified — no admin login credentials exist in this
environment, the same standing limitation as every other admin screen.
Code-reviewed against the real deployed schema (`legal_first_name`,
`legal_last_name`, `phone`, `whatsapp_number`, `phone_is_whatsapp`,
`customer_id` all confirmed directly, plus the
`marketplace_sellers_customer_id_fkey` embed name) rather than assumed.

`npm run build` clean.

## 31. Frontend migrated to the tiered service fee, the old flat setting audited and left in place (2026-08-08)

**Backend already deployed and correct** (not built here):
`marketplace_service_fee_threshold_naira` (10000),
`marketplace_service_fee_below_naira` (500),
`marketplace_service_fee_at_or_above_naira` (1000) — `create-marketplace-order`
already charges from these three. The old flat `marketplace_service_fee_naira`
(still ₦1,000 in the database) was deliberately left in place specifically so
this pass could find every surviving reference to it.

**Full audit, every hit found and resolved**:
- `CheckoutPage.tsx` — this is where the real bug was, not just a stale
  display. The Paystack path's actual **total** was already correct
  (server-authoritative via `initializePayment`), but the itemized "Service
  fee" line shown above it was still computed from the old flat setting —
  so a sub-₦10,000 order showed a line reading "Service fee ₦1,000" sitting
  over a total that only actually contained ₦500 of it. The bank-transfer
  path was worse: `transferTotal` itself (the amount a buyer is told to
  send) was wrong for any item under the threshold. Fixed by computing
  `serviceFee` from `itemPrice >= feeThreshold ? feeAtOrAbove : feeBelow`
  right where `itemPrice` becomes known, the same threshold logic the
  server already uses, on the same price — so the two can't disagree.
  Live-verified against two real listings, matching the task's own
  verification: a real ₦1,800 item now shows the ₦500 tier (visible inside
  the combined "₦536 Service & Paystack fee" line, ₦500 service + ₦36
  Paystack's own), a real ₦90,000 item shows the ₦1,000 tier (inside
  "₦2,488", ₦1,000 + ₦1,488 Paystack). `BuyerOrderDetailPage.tsx`'s
  `order.service_fee_naira` was already correct and untouched — that reads
  the real order's own stored column, the actual historical charge, never
  the flat setting.
- `policySettings.ts` — `serviceFeeNaira` (one number) replaced with
  `serviceFeeThresholdNaira` / `serviceFeeBelowNaira` /
  `serviceFeeAtOrAboveNaira`, reading the three new keys.
- `TermsPage.tsx` §4 — the fee sentence now states both tiers plainly,
  reading live values, no hardcoded numbers: "₦500 for items under
  ₦10,000, ₦1,000 for items ₦10,000 and above." Live-verified.
- `BecomeSellerPage.tsx` — a stale code comment ("the ₦750 fee is the
  buyer's" — already wrong before this pass per policySettings.ts's own
  history note, doubly wrong now) corrected to a generic, driftproof
  description. Not user-facing, low priority, fixed while in the area.

**Admin Settings screen**: the single "Service fee" field replaced with
three (`Service fee threshold`, `Service fee, below threshold`, `Service
fee, at or above threshold`), each reusing the screen's existing per-field
edit → confirm-modal → save mechanism unchanged. Added a `positive`
validation flag (existing validation only rejected negative, not zero;
these three now require a whole number strictly greater than zero) and a
live-computed summary banner under the group — "As one structure: below
₦10,000, buyers pay ₦500. At ₦10,000 and above, they pay ₦1,000." —
matching the same computed-banner pattern this file already uses twice
(the dispute-window clash warning, the no-payment-method warning). Not
live-verified (no admin credentials in this environment, the standing
limitation for every admin screen); code-reviewed against the existing
pattern only.

**Recommendation on `marketplace_service_fee_naira`**: safe to remove.
Confirmed by direct grep that nothing in the frontend reads it anymore
after this pass, and the task's own verification already confirmed the
backend order-creation path reads the three new keys, not this one. Not
deleted here — that's a database change and explicitly out of this
pass's scope — but there is no remaining reason to keep it once this is
reviewed.

`npm run build` clean.

## 32. Listing split into one-per-photo, both the review queue and the general listings screen (2026-08-08)

**Backend already deployed and proven, not built here**:
`admin_split_listing_by_image(p_listing_id uuid)` returns one row per new
listing (`new_listing_id`, `image_used`). It takes every image on the source
listing (`image_url` plus every `gallery_urls` entry), creates one new listing
per image copying title, description, price, category, condition, condition
answers, category attributes, negotiability and location verbatim, duplicates
that one photo to four to satisfy the photo minimum, sets quantity to 1, and
goes straight to `live`. The source listing is set to `delisted` (not
deleted), with `split_from_listing_id` on each child pointing back to it.
Already run for real against "Children First Grade Clothes" (8 photos, 8
separate clothing pieces sold as one unit) — 8 real listings created, original
correctly retired. Confirmed both the RPC signature and the
`split_from_listing_id` column directly against the live schema before
building against them.

**Where it's reachable**:
- **Review queue** ([`MarketplaceReview.tsx`](src/pages/admin/marketplace/MarketplaceReview.tsx)) — a "Split into separate listings, one per photo" link appears next to Approve/Reject whenever the pending listing has more than one photo (`image_url` plus `gallery_urls` count). This queue previously had no shared confirm dialog at all (Approve fired immediately, Reject used its own bespoke inline reason panel) — the split action introduces the app's real shared `ConfirmDialog` (from `opsUi.tsx`, already used on the general listings and edit screens) into this file for the first time, since the task called for the confirm pattern already used elsewhere in the admin, not a third bespoke variant.
- **General listings screen** ([`MarketplaceListings.tsx`](src/pages/admin/marketplace/MarketplaceListings.tsx)) — a "Split" row action appears for any `live` listing with more than one photo, alongside the existing Edit/Delist/Relist actions, using the same `ConfirmDialog` already wired up for Delist and Relist on this screen. This covers the retroactive case (an existing multi-photo listing split after the fact).

Both confirm dialogs are plain text, no photo preview (explicitly decided
against), stating the exact resulting count, e.g. "This will create 8 separate
listings, one per photo, and retire this combined listing. Continue?"
Confirming calls the RPC immediately.

**Success signal**: on both screens, a green confirmation banner reports the
real count returned by the RPC ("Split into 8 separate listings, one per
photo. The combined listing is now retired.") before the list refetches. On
the general listings screen the banner is dismissible and stays until the
next action; on the review queue it shows above the next pending listing
until another action replaces it.

**Audit trail made visible**: [`MarketplaceListingEdit.tsx`](src/pages/admin/marketplace/MarketplaceListingEdit.tsx) now selects `split_from_listing_id` and, when set, shows a note above the edit form ("This listing was created by splitting a combined listing into one per photo") with a link back to the source listing's own edit page, resolving the source's title for the link text.

**Preserved untouched**: Approve, Reject-with-reason, Edit, Delist, Relist —
none of their logic changed, the split action is purely additive on both
screens. Sections 7 through 29 unaffected.

Not live-verified — no admin login credentials exist in this environment, the
standing limitation for every admin screen. Code-reviewed against the real
deployed RPC signature and column, and against this file's own established
`ConfirmDialog` pattern, rather than assumed.

`npm run build` clean.

## 33. Sellers and buyers lists reordered, risk sinks on one screen, pulls up on the other (2026-08-08)

**Sellers** ([`MarketplaceSellers.tsx`](src/pages/admin/marketplace/MarketplaceSellers.tsx)):
previously ordered by `strike_count` descending only, with `created_at` not
even selected. Now two groups stacked: everyone with `status !== 'suspended'`,
newest first, then everyone `status === 'suspended'`, newest first,
regardless of how recently either group joined. Sorted client-side after
fetch (added `created_at` to the select), deliberately reusing the exact
`(status || "") === "suspended"` check the detail/list rendering already
uses, rather than trusting `status` to sort correctly as plain text — today
only `active`/`suspended` exist (16/3 rows, confirmed directly against the
table), but a future third status value added to the column wouldn't
silently break this the way a DB-level `.order("status")` could.

**Buyers** ([`MarketplaceBuyers.tsx`](src/pages/admin/marketplace/MarketplaceBuyers.tsx)):
the mirror direction, not the same rule copied over — buyers have no
suspended state, so a buyer with `disputes_open > 0` (the same flag already
driving the red "Open dispute" pill and the existing "Open disputes" sort
option, no second definition of "open" introduced) is pulled to the top
instead of sunk to the bottom, newest first within both the open-dispute and
no-dispute groups. This screen already sorts client-side today via its
`filtered` useMemo behind a "Newest / Most spent / Most orders / Open
disputes" selector the seller screen has no equivalent of — the new pin-to-
top rule was applied specifically inside the **"Newest"** branch only, since
that is the direct equivalent of the seller screen's now-only ordering. The
other three explicit sort choices (`spent`, `orders`, `disputes`) are
untouched, left exactly as a user picking them today would expect.

**Search and filters preserved on both**: sellers has no search control to
begin with (untouched either way); buyers' name/email search box (`search`
state) still filters the list first, the new ordering only decides how the
already-filtered result is arranged, same as the pre-existing sort selector
did. Nothing about the seller detail panel (Suggested outreach, contact and
identity card) or the buyer detail view changed, no seller status or dispute
state was written anywhere. Sections 7 through 30 unaffected.

Not live-verified — no admin login credentials exist in this environment,
the standing limitation for every admin screen. Code-reviewed against the
real deployed `status` values (queried directly: only `active` and
`suspended` exist today) and against each screen's own existing sort logic.

`npm run build` clean.

## 34. Full date and time added to seller and buyer detail panels (2026-08-08)

**New shared helper** — `formatDateTime()` in
[`opsData.ts`](src/pages/admin/marketplace/opsData.ts), full date and time in
`Africa/Lagos`, e.g. `"12 August 2026, 3:41 PM"` (verified against a real UTC
timestamp). Both screens already import from `opsData.ts`, so this is the one
place a shared format lives rather than duplicating it.

**Sellers** ([`MarketplaceSellers.tsx`](src/pages/admin/marketplace/MarketplaceSellers.tsx)):
`created_at` was already fetched (added in §33 purely to drive the sort) but
never rendered. Added a "Seller since" stat to the existing top `OpsCard`
account-summary grid (Verification / Live listings / Strikes / Owed to
platform), not a new card.

**Buyers** ([`MarketplaceBuyers.tsx`](src/pages/admin/marketplace/MarketplaceBuyers.tsx)):
both `joined_at` and `last_order_at` were already fetched *and* already
rendered before this pass — the gap was format, not visibility. `joined_at`
(header, "Joined ...") and `last_order_at` (the Orders/Total spent/Offers
asked stat grid) both switched from the existing date-only `fmtDate` helper
(no explicit timezone) to `formatDateTime`, in their existing locations, no
new section added. Confirmed directly against the live `marketplace_buyers`
view definition that `last_order_at` is genuinely
`max(created_at) FILTER (WHERE payment_status = 'paid')` — the last
*successful* purchase, not the last order attempted, matching the label
change from "Last order" to **"Last purchase"**. Null case (a buyer with no
paid orders, true for most buyers today) now reads **"No purchases yet"**
instead of the generic "Not yet" `fmtDate` fallback. `fmtDate` itself is
untouched and still used for the dispute list and purchase history rows,
which this pass wasn't asked to change.

Preserved: the sort order built in §33 on both screens (unrelated to
display formatting), every other field on both panels, sections 7 through
30.

Not live-verified — no admin login credentials exist in this environment,
the standing limitation for every admin screen. Code-reviewed against the
real deployed `marketplace_buyers` view definition and the real column
types, and the date/time format spot-checked against a real timestamp in
Node before use.

`npm run build` clean.

## 35. Sticky detail panel on Sellers and Buyers, desktop only (2026-08-08)

**Problem**: on both screens, selecting someone near the bottom of a long
list opened their detail panel off the bottom of the viewport, with no way
to keep it in view while scrolling the list.

**Reused, not reinvented**: the app's one established sticky pattern is
`position: sticky; top: 24px; align-self: start;`, scoped inside
`@media (min-width: 1024px)`, used identically on the listing detail
purchase panel (`.mkt-detail-panel`,
[`marketplace.css:451`](src/marketplace/marketplace.css:451)) and repeated
verbatim on both order-detail right rails. Neither `MarketplaceSellers.tsx`
nor `MarketplaceBuyers.tsx` had any sticky behaviour before this pass
(confirmed by grep). Applied the same three properties via Tailwind
(`lg:sticky lg:top-6 lg:self-start`, `top-6` = 24px, `lg:` = the same
1024px breakpoint) directly on each screen's detail column div, the same
element the CSS pattern styles on the reference page (not a wrapper).

**Same underlying problem found, not fixed**: `MarketplaceDisputes.tsx`
uses the identical `grid gap-5 lg:grid-cols-[list_detail]` list+detail shape
and has the same missing-sticky gap. Left untouched per this pass's scope,
flagged here for whoever picks it up next.

**Mobile unaffected**: `lg:` prefixes only apply at 1024px and above; below
that the existing `hidden lg:block` (Sellers) / `hidden lg:block` (Buyers)
single-view-at-a-time mobile behaviour is untouched, and sticky positioning
never applies at those widths either way.

Preserved: everything on both detail panels including §33 and §34's work,
the §33 list sort order, mobile layout, sections 7 through 30.

Not live-verified — no admin login credentials exist in this environment,
the standing limitation for every admin screen. Code-reviewed against the
real deployed sticky pattern's exact values.

`npm run build` clean.

## 36. Sticky detail panel extended to Disputes, now all three list-plus-detail admin screens covered (2026-08-08)

**Same fix, third screen**: [`MarketplaceDisputes.tsx`](src/pages/admin/marketplace/MarketplaceDisputes.tsx) has the identical `grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]` shape flagged (not fixed) in §35 — `hidden lg:flex` list column, `hidden lg:block` detail column, no sticky class anywhere. Applied the exact same values as §35, no new pattern: `lg:sticky lg:top-6 lg:self-start` on the detail column div itself, matching `.mkt-detail-panel`'s `position: sticky; top: 24px; align-self: start;`.

**All three list-plus-detail admin screens now covered**: Sellers, Buyers (§35), and Disputes (this pass) all keep their detail panel in view while the list scrolls beside it at desktop width. Mobile untouched on all three — `lg:` only applies at 1024px+, the existing single-view-at-a-time toggle is unaffected.

Preserved: every field and action on the dispute detail panel (outcome selection, notes, return/shipping-payer fields, confirm dialog), the §35 fix on Sellers/Buyers, mobile layout, sections 7 through 30.

Not live-verified — no admin login credentials exist in this environment, the standing limitation for every admin screen. Code-reviewed against the same real deployed sticky pattern already verified in §35.

`npm run build` clean.

## 37. Listing Q&A: ask a question, seller answers, both nudge functions wired in (2026-08-08)

**Backend already deployed and proven, not built here**: `marketplace_detect_bypass_attempt(p_text)` blocks phone numbers (digits and spelled-out words), WhatsApp/call/phone mentions, social platform mentions, and links other than `bundledmum.com`/`.ng` — called automatically inside both write RPCs. `buyer_ask_listing_question(p_listing_id, p_question)` (one per buyer per listing, enforced) and `seller_answer_listing_question(p_question_id, p_answer)` write to `marketplace_listing_questions` (columns: `id, listing_id, buyer_id, seller_id, question, answer, answered_at, created_at`). RLS: buyer reads own, seller reads own listings', admin reads all, and **public reads any row where `answer IS NOT NULL`**. `get_seller_nudge_suggestions` gained an 8th stage (`unanswered_question`, urgency -1, highest priority); `get_buyer_nudge_suggestions(p_customer_id)` is new, same row shape.

**Client-side bypass mirror**: fetched the deployed function's actual source (`pg_get_functiondef`) and ported each regex and each exact reason string into `detectBypassAttempt()` in the new [`questions.ts`](src/marketplace/questions.ts) — same categories, same order, same wording, so instant feedback never disagrees with what the server enforces. The server RPCs still run the real check regardless of what this returns; nothing here can approve something the server would reject.

**1. Ask a question** — [`ListingDetailPage.tsx`](src/marketplace/pages/ListingDetailPage.tsx): a new "Ask a question" entry reuses the exact one-ask pattern already built for "Ask for a lower price" (`myOffer`/`offerSpent` → `myQuestion`/its `.answer` state) — entry button hidden and replaced by a status line once this buyer has asked (`"...waiting for the seller to answer"` or `"...see the seller's answer above"`), same `.mkt-offer-entry`/`.mkt-offer-used` classes. Logged-out click routes through `sendToMarketplaceLogin` with a new `"question"` reason added to the closed `LoginReason` union in [`marketplaceLogin.ts`](src/marketplace/auth/marketplaceLogin.ts) (copy + a green `?` icon, grouped with `offer` as another trust-building buyer ask). New [`AskQuestionSheet.tsx`](src/marketplace/checkout/AskQuestionSheet.tsx) reuses the app's generic `.mkt-sheet` (not `MakeOfferSheet`'s own special-cased sheet classes), runs `detectBypassAttempt` client side first, then calls `buyer_ask_listing_question` and surfaces `error.message` verbatim — the RPC's own rejections are already human-readable, no remapping. A blocked bypass attempt gets a distinct 🚫 icon and a bold "Blocked:" prefix inside the same `--mkt-error` (`#C0392B`) red family, so it reads differently from a plain "write something first" validation miss.

**2. Answer a question** — new route `/sell/questions/:id` → new [`SellerQuestionDetailPage.tsx`](src/marketplace/sell/SellerQuestionDetailPage.tsx), added to [`MarketplaceApp.tsx`](src/marketplace/MarketplaceApp.tsx) next to the sibling `/sell/offers/:offerId` route. Built to the exact `SellerOrderDetailPage`/`SellerOfferPage` skeleton: waits for `useSeller()`'s own loading flag, then redirects via a `useEffect` (never a render-time bail) to login with `reason: "seller"` and this exact path as `returnTo` once logged-out is confirmed — proven live as a cold direct link (navigated straight to `/sell/questions/:fake-id` with no prior session) and it correctly showed "To open your seller dashboard, we need your email" rather than a false "not found". Answering runs the same client-side bypass check, then `seller_answer_listing_question`, invalidating both this question's query and the seller's own nudge query so the now-cleared `unanswered_question` stage disappears without a manual refresh.

**3. Answered questions on listing detail** — public Q&A list added to `ListingDetailPage.tsx` between the description and `HowThisWorksExplainer`, reusing the `.mkt-spec` card shell (new `.mkt-qa-row`/`.mkt-qa-q`/`.mkt-qa-a` classes added to `marketplace.css`, styled to match `.mkt-spec-row`). Reads through `mdb` (no auth needed, matching how this page already reads category fields publicly) filtered to `answer IS NOT NULL`, oldest first.

**4. Sellers admin nudge section** — confirmed no change needed. [`MarketplaceSellers.tsx`](src/pages/admin/marketplace/MarketplaceSellers.tsx)'s `Suggested outreach` card renders every row `get_seller_nudge_suggestions` returns generically (`stage_key` used only as the React key, sorted purely by `urgency`), so the new `unanswered_question` stage appears automatically, unmodified.

**5. Buyers admin nudge section** — none existed before this pass (confirmed: no `.rpc(` call, no `NudgeSuggestion` type, no such `OpsCard` anywhere in [`MarketplaceBuyers.tsx`](src/pages/admin/marketplace/MarketplaceBuyers.tsx)). Built as an exact structural copy of the seller one, calling `get_buyer_nudge_suggestions({ p_customer_id })`, placed in `BuyerDetail` right after the contact card and before the stat grid.

**Live-verified where possible** (public pages only, per the standing no-admin-credentials limitation): navigated to a real live listing, confirmed the "Ask a question" entry renders and its login gate shows the new copy exactly ("To ask a question, we need your email"); confirmed the seller question page's cold-direct-link redirect fires correctly for a logged-out visitor. The admin nudge sections and the actual ask/answer RPC round-trip were code-reviewed only (no admin or seller/buyer login credentials in this environment).

Preserved: every existing seller and buyer flow, the offer entry point untouched, all 7 existing seller nudge stages, sections 7 through 30.

`npm run build` clean.

## 38. Phone fields now ask specifically for WhatsApp, honest before-state recorded (2026-08-09)

**The true prior state, confirmed by grep of the whole marketplace tree before touching anything** — exactly three genuine phone-collection form fields exist (not the four locations the task assumed): Seller Setup, guest/incomplete-profile Checkout, and nowhere else. Nothing in this codebase previously claimed WhatsApp collection was complete; there simply was no WhatsApp framing anywhere:
- **Seller Setup** ([`SellerSetupPage.tsx`](src/marketplace/sell/SellerSetupPage.tsx)) — labelled plain "Phone number", no format validation at all (only a non-empty check), no WhatsApp mention anywhere in the file, inserted only `phone` into `marketplace_sellers`.
- **Guest checkout** ([`CheckoutPage.tsx`](src/marketplace/checkout/CheckoutPage.tsx)) — labelled plain "Phone number", validated with a Nigerian-format regex, but again no WhatsApp framing, and only `phone` was ever sent to `create-marketplace-order`.
- **Seller profile edit** — the task assumed this exists as its own location; it does not. It's the inline `EditProfile` component inside `SellerDashboardPage.tsx`, and **it has no phone field at all**, editable or otherwise (only legal name, bank name, account name, account number). There is currently no in-app way for an onboarded seller to change their phone/WhatsApp number after setup — flagged here, not built, since this task is about relabelling and validating existing collection points, not adding a brand-new editable field.
- Everything else checked (dispute form, return form, listing creation, listing Q&A) either has no phone field or is itself the anti-contact-info filter blocking a phone/WhatsApp mention in free text — the opposite of a collection point.

**Backend confirmed already correct, nothing rebuilt**: `phone_is_whatsapp` defaults to `true` on both `customers` and `marketplace_sellers`. `marketplace_sellers` has a real `BEFORE INSERT/UPDATE` trigger (`sync_seller_whatsapp_number`) that already derives and normalises `whatsapp_number` from `phone` whenever `phone_is_whatsapp` is true — confirmed live against real seller rows, every one already has a correctly normalised `whatsapp_number` despite the frontend never explicitly sending it. `customers` has **no equivalent trigger**, and confirmed live that `customers.whatsapp_number` is null for almost every real checkout row — because `create-marketplace-order` (fetched and read directly, not guessed) already fully supports `phone`, `whatsapp_number`, and `phone_is_whatsapp` in its payload, but the frontend was never sending the latter two.

**The fix, same shape on both forms**: a new shared [`lib/phone.ts`](src/marketplace/lib/phone.ts) (`isValidNigerianPhone`) validates the three common formats, mirroring `create-marketplace-order`'s own `normalisePhone` exactly. Both forms now lead with **"Your WhatsApp number"** as the primary label, a line explaining why ("This is how the seller reaches you, so please make sure it's really on WhatsApp."), and a new checkbox, unchecked by default (assume same): **"My phone number is different from my WhatsApp"**, which reveals a second "Your phone number" field only when checked, using a new generic `.mkt-chk` class.

- **Checkout**: `createMarketplaceOrder()` (`checkout/orders.ts`) gained `whatsappNumber`/`phoneIsWhatsapp` params, forwarded as `whatsapp_number`/`phone_is_whatsapp` — fields `create-marketplace-order` already reads. When the toggle is off, the WhatsApp field's value is sent as `phone` with `phone_is_whatsapp: true`; when on, the WhatsApp field becomes `whatsapp_number` and the second field becomes `phone`, with `phone_is_whatsapp: false` — exactly the mapping the edge function expects.
- **Seller setup**: the insert now explicitly sends `phone_is_whatsapp` and, when the toggle is on, `whatsapp_number`, so a seller whose WhatsApp genuinely differs from their phone is no longer silently assumed to be the same by the trigger.

**Validation**: both fields use `isValidNigerianPhone` (accepts `08012345678`, `2348012345678`, `+2348012345678`), with a friendly inline message, and `inputMode="numeric"` for a numeric keypad on mobile (checkout's WhatsApp field also keeps `type="tel"` for autofill).

**Live-verified**: guest checkout at a real listing — the field renders as "YOUR WHATSAPP NUMBER" with the explanatory line, the "My phone number is different from my WhatsApp" checkbox is present, and clicking it correctly reveals a second "YOUR PHONE NUMBER" field. Seller setup requires a logged-in session (no seller credentials in this environment) — code-reviewed only, applying the identical pattern already verified live on checkout.

Preserved: every other field on both forms, phone remaining required everywhere it already was, guest checkout still requiring no login, the bank name match validation and legal name lock on seller setup (untouched), sections 7 through 30.

`npm run build` clean.

## 39. Client-side bypass filter re-synced with the hardened server function (2026-08-09)

**Before**: the client copy lived in `detectBypassAttempt()` in
[`questions.ts`](src/marketplace/questions.ts), a byte-for-byte port of
`marketplace_detect_bypass_attempt` as it existed when §37 built the Q&A
feature — 5 rules (phone digits, spelled-out digits at a 5-word threshold,
WhatsApp/call/phone, social platforms, links), no normalisation step at
all. The server had since been hardened twice and the two had drifted: a
person typing a newly-blocked phrase would see it accepted client side and
only rejected on actual submit (the server always enforced it correctly
regardless, so this was the safe direction of failure, just a poor
experience).

**Re-synced from the deployed function's actual source**
(`pg_get_functiondef`), not guessed: added the normalisation step that is
the real structural change (`dot`/`(dot)`/`d0t` → `.`, `at`/`(at)` → `@`,
spaces around dots collapsed, plus a separate de-lettered copy that
collapses spacing between consecutive single-letter tokens so
`w h a t s a p p` reads as `whatsapp`), lowered the spelled-digit threshold
from 5 to 3, and added the two brand new rules: address/meet-up intent, and
price-negotiation intent — 8 rules total now, same order, same exact
messages as the server.

**Verified against the live server function directly**, not just
self-consistently: ran all 27 test phrases (the required "must still pass"
list — including the three price ones the task called out specifically:
"how much did it cost originally", "I paid 15000 for mine", "does the
price include the extra parts" — plus 15 phrases that should now be
blocked, one per rule including the normalisation/de-letter/negotiation
edge cases) through both `marketplace_detect_bypass_attempt()` live via SQL
and the new client function side by side. **Every single result matched
exactly**, same verdict, same message text, both directions.

Preserved: the ask-a-question and answer flows themselves, `AskQuestionSheet.tsx` and `SellerQuestionDetailPage.tsx` untouched, only the shared filter function changed. Sections 7 through 30 unaffected. Not made stricter than the server anywhere — every new rule is a direct port, no invented patterns.

`npm run build` clean.

## 40. WhatsApp number field accepts any country, phone stays Nigerian (2026-08-09)

**The bug**: both the WhatsApp field AND its "different from phone" secondary field required `isValidNigerianPhone` on Seller Setup and Checkout, locking out a Nigerian mum living abroad or anyone whose WhatsApp runs on a non-Nigerian line entirely.

**The fix**: a country code picker ([`CountryCodePicker.tsx`](src/marketplace/components/CountryCodePicker.tsx), a native `<select>` over a new [`countries.ts`](src/marketplace/lib/countries.ts) full dial-code list, Nigeria first/default) sits beside the WhatsApp field on both Seller Setup and Checkout. The Nigerian-only phone field (used when it genuinely differs) has no picker and is unchanged. New functions in [`lib/phone.ts`](src/marketplace/lib/phone.ts): `isValidWhatsappNumber(dialCode, raw)` routes to `isValidNigerianPhone` when Nigeria is selected, or the new permissive `isValidInternationalPhone` (7-15 digits after the trunk zero is stripped) otherwise; `toInternationalDigits(dialCode, raw)` produces the stored format.

**The leading-zero problem, solved**: `stripLeadingTrunkZero()` drops exactly one leading `0` from the typed digits before the dial code is prefixed, applied universally (not Nigeria-special-cased) since dropping the trunk prefix before adding a country code is the standard convention almost everywhere. Tested directly: `toInternationalDigits("234", "0803 123 4567")` and `toInternationalDigits("234", "803 123 4567")` both produce the identical, correct `"2348031234567"` (verified in a Node script alongside UK and US examples, all correct).

**A genuine edge case surfaced and resolved, not left implicit**: a non-Nigerian WhatsApp number cannot also serve as the required Nigerian delivery phone, so picking a non-Nigerian country now implies "different from phone" on its own (`impliedDifferent = waDialCode !== "234"`), on top of the existing checkbox (`effectiveDifferent = differentWhatsapp || impliedDifferent`). The checkbox itself still defaults unchecked exactly as before; it's shown checked and disabled only when the picker forces it, with a short explanatory line ("Since your WhatsApp isn't a Nigerian number, we also need your Nigerian number here for delivery.").

**Messages** (exact wording): phone field unchanged — `"Enter a valid Nigerian phone number, for example 0803 123 4567."`; WhatsApp field — `"Enter a valid WhatsApp number, any country is fine, for example 0803 123 4567 or +44 7911 123456."`, with a matching help line under the field itself. Also fixed a latent mislabel from §38: `CheckoutPage.tsx`'s server-error mapping for the required-phone rejection had been changed to say "WhatsApp" in that pass; reverted to "Please enter a valid Nigerian phone number so the seller can reach you." since that error is specifically about the `phone` column, which is still always Nigerian.

**Storage**: `whatsapp_number` is now always sent as full international digits, no plus sign, via `toInternationalDigits` — the same `2348012345678` shape already used for Nigerian numbers, so a `wa.me` link built from it works directly for any country. Confirmed compatible with `marketplace_sellers`' `sync_seller_whatsapp_number` trigger: its own normalisation block only recognises three Nigerian-shaped digit patterns and leaves anything else (any non-Nigerian number) exactly as sent, so a pre-normalised international value passes through untouched.

**Live-verified** at 390px on guest checkout: the picker (fixed 84px) sits beside the WhatsApp input with room to spare (placeholder "e.g. 0803 123 4567" fully visible, not crowded); selecting "+44 United Kingdom" correctly auto-checked and disabled the "different from phone" checkbox and revealed the required Nigerian phone field with its explanatory note, with no console errors from the change. Seller Setup applies the identical pattern, code-reviewed only (no seller credentials in this environment).

Preserved: the toggle defaulting to same-as-phone, the WhatsApp-first framing, both fields still required, guest checkout requiring no login, sections 7 through 30.

`npm run build` clean.

*(Small follow-up in the same pass, not its own section: the picker's option text was changed from "+234 Nigeria" to a flag emoji + code only, "🇳🇬 +234", computed from each ISO code via `flagEmoji()` in `countries.ts`, and the picker's fixed width shrunk from 84px to 72px to match.)*

## 41. The forced Nigerian phone was itself a lockout, removed; contact blocks now honour can_call (2026-08-09)

**The bug §40 introduced**: selecting a non-Nigerian WhatsApp country auto-forced the separate Nigerian phone field open, required, and disabled the checkbox controlling it — meaning an expat or temporary resident whose only number is genuinely international could not finish Seller Setup or Checkout at all. Having no Nigerian number is a legitimate state; it was being treated as an error.

**Fixed on both `SellerSetupPage.tsx` and `CheckoutPage.tsx`**: the Nigerian phone field is now optional everywhere. A non-Nigerian country selection still surfaces it as a helpful courtesy (`showAltPhone = differentWhatsapp || waDialCode !== "234"`, since a local number genuinely helps with delivery), but leaving it blank is valid client side (`altPhoneValid = empty || isValidNigerianPhone(...)`) and submits successfully. The "different from WhatsApp" checkbox itself is only rendered at all when the WhatsApp country is Nigeria (its only genuinely meaningful state) — for any other country the field is offered unconditionally, so a checkbox sitting beside it, checked-and-disabled, would just be a confusing redundant control. It is never disabled anywhere now.

**Submitted payload**, both screens: when the WhatsApp country is Nigeria and the checkbox is unchecked, the single field still serves as both `phone` and `whatsapp_number` exactly as before. Otherwise, `whatsapp_number` is always the full international digits from the WhatsApp field; `phone` is the optional Nigerian field's value if given, or genuinely omitted (`null`/`undefined`) if not — `marketplace_sellers.phone` is nullable with no format constraint, confirmed directly against the schema, so Seller Setup's direct table insert fully supports a phone-less, WhatsApp-only seller end to end.

**A real, verified limitation surfaced, not silently left broken**: `create-marketplace-order` (the checkout edge function, unchanged per this task's own non-goals) still hard-requires `payload.phone` for a **guest** (not-logged-in) buyer specifically — `if (!phone) return json({ error: 'A valid Nigerian phone number is required so the seller can reach you' }, 400)`. Live-verified: filled the checkout form with a UK WhatsApp number and no Nigerian phone as a guest, client-side validation passed and the order-creation call fired, and the edge function correctly rejected it with exactly that message, surfaced via the existing `friendlyCreateError` mapping (reverted in §40 back to saying "phone", not "WhatsApp", which turns out to matter here). A **logged-in** buyer has no such block — the edge function's authenticated branch never requires `phone` to already exist. This is a genuine gap for anonymous guest checkout specifically, real and current, left as-is because fixing it needs an edge function change, explicitly out of scope for this pass.

**Part 2, contact blocks now use `can_call`**. `get_marketplace_order_contact` and `get_marketplace_seller_order_contact` were confirmed already deployed with `seller_whatsapp`/`buyer_whatsapp` (`coalesce(whatsapp_number, phone)`, read directly from the live function source) and `can_call` (true only when `phone` itself is Nigerian-shaped, confirmed the same way). Updated all three contact-rendering locations — `BuyerOrderDetailPage.tsx`, `SellerOrderDetailPage.tsx`, `PaymentReturnPage.tsx` — identically: the WhatsApp link now builds from `*_whatsapp`, not `*_phone`; the Call button only renders when `can_call` is true (its sibling WhatsApp button already has `flex: 1`, so with Call absent it simply fills the row, no gap or dead space); nothing implies a limitation or a broken state when Call is hidden, it just isn't there. `OrderContact` (`checkout/orders.ts`) and `SellerOrderContact` (`sell/sellerOrders.ts`) interfaces both extended with the new fields.

**Every other `tel:`/call-link builder checked**: `sellerCallLink`/`sellerWhatsAppLink` in `checkout/orders.ts` are the only ones in the marketplace tree (grep confirmed), used in exactly the three files above — no others exist. No frontend-generated email template builds a call or WhatsApp link either; the only `mailto:` links anywhere in the tree are the static BundledMum contact-email footer on the three policy pages, unrelated to buyer/seller numbers and untouched.

Preserved: the country picker defaulting to +234 and the silent leading-zero stripping (§40, unaffected), the WhatsApp-first framing, guest checkout requiring no login (still true, just now blocked by phone specifically rather than the form itself), sections 7 through 30.

`npm run build` clean.

## 42. Paid page: refund sticker, and exact WhatsApp prefill wording everywhere it's built (2026-08-09)

**Paid page (`PaymentReturnPage.tsx`)**: `SellerContact`'s prefill hint line now says "You can also ask them for more pictures, videos and details about the item" instead of "Opens ready to send, with your item and order number". Added a rotated "We refund you if it's not as described" sticker (new `.mkt-sticker` class, dashed coral border on cream, `transform: rotate(-4deg)`) beside the checkmark on the paid page, distinct from the `.mkt-pill-held` pill directly below it.

**Exact WhatsApp prefill wording, every place a buyer/seller contact link is built** (3 locations, confirmed exhaustive by grepping every `sellerWhatsAppLink(` call site — a 4th, `AwaitingPaymentPage.tsx`, messages BundledMum's own support number, not a buyer/seller contact, left untouched):
- `BuyerOrderDetailPage.tsx` (buyer → seller): `` `Hello ${sellerName},\n\nI placed an order for the ${item} you listed on BundledMum Marketplace. My order ${ref}.` ``
- `PaymentReturnPage.tsx`'s `SellerContact` (buyer → seller, post-payment variant): same template.
- `SellerOrderDetailPage.tsx` (seller → buyer): `` `Hello ${buyerName},\n\nThis is about the ${item} you bought on BundledMum Marketplace. My order ${ref}.` ``

**The blank line, verified not just assumed**: each template uses a real `\n\n` in the JS string, not literal `%0A%0A` text — `sellerWhatsAppLink()` (`checkout/orders.ts`) already runs the message through `encodeURIComponent()`, which is what actually produces `%0A%0A` in the final `wa.me` URL. Confirmed with a real Node reproduction of `sellerWhatsAppLink`'s exact logic on both message shapes: the generated href genuinely contains `%0A%0A` (not any other encoding), and decoding it back reproduces a true blank line between two paragraphs, exactly as WhatsApp renders it — not literal characters.

`npm run build` clean.

## 43. Original price ("what it cost new") and the accepted-price 24-hour countdown, both ends (2026-08-09)

**Backend confirmed deployed, not rebuilt**: `marketplace_listings.original_price_naira` (integer, nullable), its `validate_original_price` trigger (fires *after* `compute_marketplace_listing_price`, confirmed by trigger name ordering, so it genuinely compares against `final_price_naira` — the buyer-facing, markup-included price — not the seller's raw asking price); `get_buyer_accepted_offer(p_listing_id)` returning `offer_id, buyer_price_naira, discount_naira, accepted_price_expires_at, seconds_remaining, has_expired` (`SECURITY DEFINER`, scoped to `auth.uid()`); `marketplace_accepted_price_hours` = 24. Also pulled the live `create-marketplace-order` source directly (v9) to confirm exactly how the expiry is enforced — see below, this corrected a stale comment in the codebase.

**Original price, seller side** — both `CreateListingPage.tsx` (create and full edit) and `SellerPriceEditPage.tsx` (live-listing price-only edit, so it can be added to an already-posted listing, not just at creation) get a new optional "What did it cost new?" field, `mkt-field`/`mkt-input` styled identically to every other optional field on these forms. Client-side validation mirrors the trigger exactly — compared against the live "buyers will now see" preview price, not the raw asking price typed into the field above it — with the trigger's own message shown verbatim on both submit-time rejection and inline as-you-type feedback. The trigger's exact message is also now passed through `parseListingEditError()` (`sellData.ts`) verbatim (added as a new matched case) as the rare-recovery path for a stale preview slipping past client validation.

**Original price, buyer side** — `ListingDetailPage.tsx` shows "Bought brand new at ₦X" (the amount bold) in green (`var(--mkt-green)`) as a single `mkt-help` line under the title, still understated in size relative to the actual price above it. Originally also showed a "save ₦Y" clause; removed per direct follow-up feedback (kept the naira figure, dropped the savings clause) — a person can subtract the two prices shown on the page themselves, so it wasn't left implicit. Renders nothing at all when `original_price_naira` is null or not genuinely higher than `final_price_naira`. `LISTING_SELECT` (`data/mdb.ts`) and `MarketplaceListing` (`types.ts`) both extended with the new column. **Live-verified twice**: temporarily set a real listing's `original_price_naira` to ₦40,000 against its real ₦24,000 selling price at 375px — first confirming "Bought brand new at ₦40,000, save ₦16,000," then after the follow-up, "Bought brand new at **₦40,000**" in green with no savings clause — and confirmed a second real listing with no original price shows nothing, no empty state, before reverting the test value both times.

**Accepted-price countdown, listing detail**: a new `fetchBuyerAcceptedOffer()` (`offers.ts`) wraps the RPC. `ListingDetailPage.tsx` now distinguishes `offerAccepted` (the offer's own status, permanently true once accepted, mirroring why `isLapsed()` exists — status never flips on its own) from a new `priceExpired` (`has_expired` from the server, or the local tick reaching zero, whichever comes first) and `showAcceptedPrice` (`offerAccepted && !priceExpired`) — the discounted price, strikethrough and "seller said yes" banner now gate on `showAcceptedPrice`, not `offerAccepted`, everywhere they render (price block, buy bar, buy button, and whether `?offer=` is appended to the checkout link). While live: a ticking `Xh Ym` / `Xm Ys` / `Xs` countdown (same local-integer + `setInterval` pattern already used for the two resend-cooldowns elsewhere in the marketplace, the only existing precedent for a live timer in this app) plus an honest line — "The item is not reserved though, someone else can still buy it at the normal price while you decide" — worded as a true statement, not a scarcity push. Once expired: the discount banner is replaced by an `mkt-errbox` (`#C0392B`, per this task's own brand spec for an expired price specifically) reading "Your agreed price has run out, so this is back to the normal price now," and every price display on the page reverts to `final_price_naira` — never a silent revert.

**Checkout, the real bug this surfaced**: fetched `create-marketplace-order`'s actual deployed source (v9) rather than trusting `orders.ts`'s own doc comment, which claimed "does not yet read offer_id at all" — **stale, and now corrected**. The function does look up and apply the buyer's accepted/counter_accepted offer, but by `listing_id` + `buyer_id` directly, never by the `offer_id` the client sends (that field is accepted but genuinely never read) — and it enforces `accepted_price_expires_at` at that exact point, falling back to the normal price and returning `offer_expired: true` when it's passed. Without this pass, an expired-but-not-yet-known-locally offer would have made `CheckoutPage.tsx`'s existing `offerPriceMismatch` guard fire incorrectly — the alarming "We need to sort this out first, message us" screen, for what is actually a completely normal, expected outcome. Fixed: `offerPriceMismatch` now explicitly excludes the `offer_expired` case, and a new `mkt-errbox` banner ("The lower price you agreed with the seller has run out, so this order is at the normal price of ₦X. Nothing has been charged yet.") renders above the existing four-line price breakdown — before the Pay button, on both the Paystack and bank-transfer paths — whenever `offer_expired` comes back true. `createMarketplaceOrder()`'s return type extended with `offer_expired?: boolean`.

Preserved: the negotiation flow's one-ask-per-buyer-per-listing and every seller response path (untouched — this only reads `has_expired`/`offer_expired`, never writes to `marketplace_offers`), the tiered service fee (§31, `itemPrice`/`serviceFee` computation untouched), sections 7 through 30.

Not live-verified beyond what's noted above — both price screens (seller-authenticated) and the full accepted-offer countdown (buyer-authenticated, needs a real accepted offer on a real logged-in session) hit the standing limitation, no seller or buyer login credentials exist in this environment. The countdown RPC is itself `SECURITY DEFINER` scoped to `auth.uid()`, confirmed directly against its source, so it cannot be exercised via a service-role SQL session either — code-reviewed against the real function signature and logic instead.

`npm run build` clean.

## 44. City and state shown together, a state badge on every photo, now the marketplace covers all 37 states (2026-08-09)

**Before**: `locationLabel()` (`lib/format.ts`), the one function both `ListingCard.tsx` and `ListingDetailPage.tsx` already shared, returned `location_city || location_state`, so a listing with both fields set (every live listing today, confirmed) only ever showed the city — "Ikorodu," never "Ikorodu, Lagos." Both fields were already selected in `LISTING_SELECT` (`data/mdb.ts`) for both surfaces, no query change needed. No overlay of any kind sat on the card image beyond the availability qty badge (top-left, quantity > 1 only), and none at all on the detail hero beyond the back button (top-left) — **the prompt's assumption of an existing "Negotiable" label or a sold-state overlay on the image doesn't match the code**: `is_negotiable` is used internally on the seller forms and in the terms-page copy, never rendered as a badge anywhere; a sold/removed listing renders an entirely separate `NotFoundOrGoneScreen`, not an overlay on the live card or hero.

**City and state together**: `locationLabel()` now returns `"${city}, ${state}"` when both are set, falling back to whichever single one is present (never a stray comma) and finally "Nigeria" if neither is set. Live-verified on the real browse grid and a real listing detail page: every card and the detail tag chip now read "Ikorodu, Lagos" / "Ago Palace, Lagos" etc.

**The state badge, and the duplication call**: added a second function, `stateBadgeLabel()`, state only, feeding a new small solid-fill badge (`.mkt-card-state` on the card, `.mkt-hero-state` on the detail hero) in the opposite corner from every existing overlay — top-right, vs. the qty badge's and back button's top-left — so the two coexist by construction rather than needing conditional logic, live-verified with a real 2-available listing showing both badges at once with no collision. Chose **state for the badge, full "City, State" for the text below** (not city for the badge, despite the near-term repetition every reviewer will notice today, since all 33 live listings are still in Lagos): the badge's whole job is glanceability while scanning a grid of photos before reading any text, and state is the dimension this exact task is about making visible — the marketplace just opened from 2 states to 37, so a state badge is what lets a buyer spot their own state from the photos alone as inventory diversifies. A city badge would only re-state the first word of the text line directly below it, genuinely adding nothing city couldn't already show there. The visible "Lagos, Lagos, Lagos..." today is real but temporary, a direct consequence of every current listing being in one state, not a flaw in the arrangement.

**Legibility, by construction not luck**: both badges use a solid, fully opaque fill (`var(--mkt-green-dark)`, cream text) — the same non-translucent-overlay idiom the existing qty badge already uses — so contrast never depends on the photo's own brightness. Live-verified over both a light product photo (breast pump, white/cream box) and darker areas within it (dark tubing) at 375px: legible throughout.

Preserved: card grid layout and image aspect ratio, the qty badge, the detail gallery's desktop two-column layout (live-verified at 1280px, unaffected) and mobile stack, condition capture on create-listing (untouched), sections 7 through 30.

`npm run build` clean.

## 45. Meta conversion tracking passes fbp/fbc, and a real synchronous-throw gap closed (2026-08-09)

**Backend already fixed and deployed, not rebuilt**: `send-meta-conversion-event` now never returns an error under any circumstance — an anonymous event with no matching signal returns a clean `HTTP 200` skip instead of the `502` it used to raise (the actual original bug: Meta rejects any event with no way to match it to a person, and the old function surfaced that rejection as its own error).

**Audit finding, reported plainly per the task's own instruction**: both call sites — `ViewContent` in `ListingDetailPage.tsx`, `InitiateCheckout` in `CheckoutPage.tsx` — were already correctly fire-and-forget. Neither awaits `sendMarketplaceConversionEvent()` (called as a plain statement inside a `useEffect`, `void` return), and `git log` on `lib/metaConversion.ts` confirms the `.catch(() => {})` around the `mdb.functions.invoke(...)` call has been there since the file's original commit (`dff0f63`), never missing. So the historical 502 was always being swallowed at that specific point — the described blank screens were not caused by a missing `.catch()` there.

**A real, narrower gap found and closed anyway**: the old code only wrapped the *promise* `invoke()` returns — nothing caught a *synchronous* throw before that promise existed (cookie access, argument setup). Since neither caller wraps this call in its own try/catch, a synchronous throw here would have propagated straight out of the `useEffect` uncaught. `sendMarketplaceConversionEvent()` now wraps its entire body in `try/catch`, not just the invoke chain, closing that gap regardless of whether it was the actual historical cause.

**fbp/fbc now passed**: a new `readCookie()` reads `_fbp`/`_fbc` (set by the Meta Pixel already running on the marketplace, not by this code) from `document.cookie`, itself wrapped so a read failure returns `undefined` rather than throwing. Both are attached to the request body only when present — an absent cookie (Pixel hasn't set one yet) sends without them exactly as before, letting the function's own clean-skip handle it. **Live-verified end to end, not just code-reviewed**: loaded a real listing page anonymously (no login) in the browser preview, confirmed a genuine `_fbp` cookie was present (`fb.0.1786013466302...`, the real Pixel having actually fired), then replicated the exact same cookie-read-and-send logic directly against the real deployed edge function from that browser session — response came back `{"sent":true,"event_name":"ViewContent","meta_response":{"events_received":1,...}}`, meaning Meta itself genuinely accepted the anonymous event. Confirmed the listing page rendered fully throughout, no blank screen, no console error tied to this call.

**Other callers**: grepped the entire `src/` tree for `send-meta-conversion-event` / `sendMarketplaceConversionEvent` — exactly 3 files reference it: the two call sites above and `metaConversion.ts` itself. No admin, storefront, or other caller exists.

Preserved: the backend Purchase event (untouched, a separate server-side flow), the Meta Pixel's own browser-side `track()` calls (`@/lib/metaPixel`, already independently guarded, untouched), sections 7 through 30.

`npm run build` clean.

## 46. Seller answer-a-question page: right login reason, calm non-owner message (2026-08-09)

**Database enforcement untouched, confirmed by design, not by choice**: `seller_answer_listing_question` is `SECURITY DEFINER` and only updates a question the caller's own authenticated identity genuinely owns — this task is entirely about the experience around that, no RPC or RLS change.

**Logged out**: `SellerQuestionDetailPage.tsx` was sending people through the `"seller"` login reason ("To open your seller dashboard...") — generic dashboard framing, wrong for "a buyer is waiting on your answer to this specific question." Added a new `LoginReason`, `answer_question` ("To answer their question, we need your email" / "This confirms it's really you, the seller, so your answer goes out under your name."), deliberately separate from the existing `question` reason (which is worded for the *buyer asking*, "we'll send you their answer" — wrong direction for a seller here). **Live-verified**: visited a real question's cold link logged out, confirmed the exact new copy renders, and confirmed the URL carries `returnTo=/sell/questions/<id>&reason=answer_question` — the existing redirect-then-load pattern was already returning to the exact question, not the dashboard, unchanged.

**Logged in, not the owner**: `fetchSellerQuestion` reads through the authenticated `sdb` client, RLS-scoped to "seller reads questions on own listings" — a non-owner's read returns `null`, indistinguishable client-side from the question genuinely not existing (RLS filters both to the same empty result, on purpose, never leaking whether a question with that id exists at all to someone who isn't its owner). The old fallback read flatly "Question not found." Reworded to be honest and calm either way — "Only the seller can see this" / "This question belongs to someone else's listing, or the link is no longer valid. If you're a seller, check you're signed in to the right account." — not a raw error, not a technical permission message, not blank.

**Already answered**: confirmed this already worked correctly before this pass — `question.answer ? <shows it> : <shows the form>` — no change needed, reported rather than rebuilt.

Preserved: the content filter on answers (untouched, `detectBypassAttempt` unchanged), the contextual login system and every other gate's return destination, sections 7 through 30.

Not live-verified beyond the logged-out path above — the non-owner and already-answered branches need a real authenticated seller session, the standing limitation for every seller screen in this environment. Code-reviewed against the real RLS policy name already documented in `questions.ts`'s own comments.

`npm run build` clean.

## 47. Admin follow-up outreach queue, a new top-level section (2026-08-09)

**New screen**: [`MarketplaceOutreach.tsx`](src/pages/admin/marketplace/MarketplaceOutreach.tsx), route `/admin/marketplace/outreach`, nav entry "Follow up" (Megaphone icon) added to `MARKETPLACE_NAV` in `AdminLayout.tsx` right after Review queue — no existing entry moved or removed.

**Backend confirmed deployed, not rebuilt**: `get_outreach_queue()` returns `TABLE(person_type, person_id, person_name, stage_key, label, urgency, context, whatsapp_link)`, admin-gated (`has_admin_permission('marketplace','manage')`, confirmed directly against its source — it genuinely rejects a service-role call with no real `auth.uid()`, so it could not be exercised via SQL, only code-reviewed). **Its own source confirms this is literally the same system as the existing per-seller "Suggested outreach" panel**, not a new one: it loops every non-suspended seller through `get_seller_nudge_suggestions()` and every customer with an answered question through `get_buyer_nudge_suggestions()` — the exact two functions `MarketplaceSellers.tsx`'s panel already calls, unchanged.

**The nine types, real labels pulled from the deployed functions' own source** (not the design mockup's paraphrased chip wording, which differs): seller — `unanswered_question` "A buyer is waiting on an answer" (-1), `sale_awaiting_dispatch` "Sale awaiting dispatch" (0), `return_awaiting_confirmation` "A return is waiting on confirmation" (0), `offer_awaiting_response` "A buyer is waiting on a price reply" (1), `no_listings` "Never listed anything" (1), `rejected_not_resubmitted` "Has a rejected listing" (2), `incomplete_setup` "Bank details incomplete" (2), `listed_no_sales` "Live but not selling yet" (3); buyer — `answered_question_no_purchase` "Question answered, has not bought yet" (2). Suspended sellers excluded server side, confirmed in the function body. All nine are hardcoded as the canonical filter-chip set in `opsData.ts` (`SELLER_OUTREACH_STAGES`, `BUYER_OUTREACH_STAGES`) specifically so every chip shows even at zero rows, greyed rather than hidden — five of nine currently return nothing, this was designed for, not worked around.

**Design source**: imported `BundledMum Marketplace.dc.html` from the linked claude.ai/design project via the design MCP, frame `32a`. Contained every required element (populated seller side, empty buyer side, a multi-match person, the full all-clear) — nothing missing, no invented frames.

**Grouping, the design's own chosen treatment**: the RPC returns one row per person per matching type — a person matching several types gets grouped client-side into a single row (`groupByPerson()`), primary = lowest-urgency match as the lead pill, the rest listed as "+N more" (mobile: tap-to-expand; desktop: every match shown in the sticky detail panel, each with its own message and Send button). Sort is urgency ascending, then person name alphabetically as a stable secondary order (the design didn't specify one beyond urgency).

**Layout**: reuses the exact `grid gap-5 lg:grid-cols-[list_detail]` / `lg:sticky lg:top-6 lg:self-start` pattern already shared by Sellers, Buyers and Disputes for desktop. Mobile diverges from that shared pattern on purpose, matching the design's own mobile treatment: every row is a full inline card (message preview + working Send button already on the card), no separate detail step needed since nothing is hidden behind a click.

**WhatsApp links opened verbatim**: every `href` is `whatsapp_link` unchanged, `target="_blank" rel="noreferrer"`, the same pattern as the existing per-seller panel. For the message *preview* shown on cards and in the detail panel (not present in the RPC's own columns — `context` is just the listing title), a new `previewWhatsAppMessage()` reads the `text` param back out of the real link purely for display. Caught a real bug fixing this myself: `URLSearchParams.get()` already fully decodes the value, so an extra `decodeURIComponent()` call would double-decode and could throw on a literal `%` in a message — removed before shipping. This never touches or rebuilds the actual link opened.

**No "sent" state**: the design's own note says plainly — "No 'contacted' state is designed since nothing currently records a send, that would need a new sent_at column and a fresh design pass, flagged rather than invented here." No such column exists. Not built.

Preserved: the per-seller "Suggested outreach" panel (untouched, still calls `get_seller_nudge_suggestions` directly), every existing admin nav entry and route (added to, none moved), sections 7 through 30.

Not live-verified — no admin login credentials exist in this environment, the standing limitation for every admin screen, and the RPC itself is real-session-gated so it can't be exercised via SQL either. Code-reviewed against the real deployed function sources (`get_outreach_queue`, `get_seller_nudge_suggestions`, `get_buyer_nudge_suggestions`, `wa_encode`) rather than assumed, and against the imported design file directly.

`npm run build` clean.
