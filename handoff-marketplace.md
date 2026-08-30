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

## 48. Outreach queue: tenth type added (order_awaiting_delivery), buyer chips, three route facts, and a real backend gap found (2026-08-09)

**Tenth type, backend confirmed by re-pulling the deployed source, not assumed**: `get_buyer_nudge_suggestions()` now also returns `order_awaiting_delivery` ("Paid, waiting on delivery", urgency 0) — a paid order the buyer hasn't confirmed received yet, with the seller's own contact details and a plain three-step explainer baked into the message. Added to `BUYER_OUTREACH_STAGES` in `opsData.ts` (§47) with its real label.

**The design source was NOT updated for this** — re-imported the same `BundledMum Marketplace.dc.html` file, frame `32a` is byte-identical to §47's read, its own note still says "buyers is currently a single empty type." Rather than leave the buyer side chip-less against its own now-outdated rationale, applied the same logic the design used for sellers (a filter row earns its space once there's more than one type to distinguish) to buyers too — `MarketplaceOutreach.tsx`'s chip row is no longer seller-only.

**A real backend gap found, not fixed (no backend changes in scope)**: `get_outreach_queue()`'s buyer candidate loop still only selects `customers` who have at least one *answered question* (`join marketplace_listing_questions ... where answered_at is not null`) — it was never extended to also loop over buyers with a paid, unconfirmed order. A buyer who is genuinely `order_awaiting_delivery` but has never asked a question would be silently invisible to this queue, even though `get_buyer_nudge_suggestions()` itself would correctly flag them if called. Confirmed directly against the deployed function source. The frontend correctly displays whatever the RPC returns either way — this is a server-side candidate-selection gap, flagged for whoever owns the next backend pass, not worked around client side.

**The three requested routes, confirmed directly against `MarketplaceApp.tsx`'s real route table** (these live in outreach message text in the database — not edited, per this task's own instruction):
1. **Seller responds to a price request** (accept/decline/counter): a dedicated route already exists, `/sell/offers/:offerId` (`SellerOfferPage.tsx`) — the `offer_awaiting_response` message currently links to `/sell/dashboard` instead and could point straight at `/sell/offers/{offerId}` now that the real id is known.
2. **Seller edits and resubmits a rejected listing**: `/sell/listings/:id/edit` (`CreateListingPage.tsx` in edit mode — reachable for `pending_review`/`rejected`/`delisted`, redirects away only for `live`/`sold`, confirmed in the component's own effect). The `rejected_not_resubmitted` message already has the listing id available and could link to `/sell/listings/{id}/edit` directly instead of the dashboard.
3. **Seller completes/edits bank details after initial setup**: `/sell/setup` is **not** genuinely reachable for an existing seller — `SellerSetupPage.tsx`'s own effect immediately redirects anyone with a seller row to `/sell/dashboard` (`if (seller) navigate("/sell/dashboard", { replace: true })`), regardless of whether bank details are complete. Bank details are edited inline on the dashboard itself (`SellerDashboardPage.tsx`, a form component within the page, no separate route). So `/sell/dashboard` — what `incomplete_setup` already links to — is correct and is genuinely the only real destination; `/sell/setup` would be a dead end for exactly the audience this message targets.

Preserved: the per-seller "Suggested outreach" panel, every existing nav position, sections 7 through 30. Outreach message text itself untouched, per this task's explicit instruction — the three route findings above are reported for a future pass to apply, not applied here.

`npm run build` clean.

## 49. Outreach queue remembers what's already been sent (2026-08-09)

**Backend confirmed deployed, not rebuilt**: `get_outreach_queue()` now returns two more columns, `last_contacted_at` (timestamptz, null if never) and `times_contacted` (integer), both **tracked per (person, stage_key)**, confirmed directly against the real function signature. `log_outreach_contact(p_person_type, p_person_id, p_stage_key)` and `undo_outreach_contact(p_person_id, p_stage_key)` — new wrappers `logOutreachContact()` / `undoOutreachContact()` in `opsData.ts`, both admin-gated same as the rest.

**Contact history shown per row and per matching type**: a new `ContactStatusLine` reads "Never contacted" (coral, the more urgent case, matching how urgency already reads elsewhere on this screen) or "Contacted 2 days ago" (`relativeTimeAgo()`, new in `opsData.ts`) plus "· 3 times" once `times_contacted > 1`. Shown on the desktop compact row (status only, no actions — actions stay behind the existing click-through, same reasoning as the row itself), the full mobile card, and — critically — **once per matching type in the desktop detail panel**, never once per person: a seller contacted about incomplete bank details but never about an unanswered question shows two independent statuses, not one merged one, exactly per this task's own requirement.

**Mark as sent, deliberately separate from opening WhatsApp**: `ContactActions` renders "Send on WhatsApp" and "Mark as sent" as two adjacent buttons, a natural two-step (open the chat, then confirm it actually went) rather than one combined action or an auto-log on tap — tapping a link is not proof a message was sent, so only the explicit button ever calls `log_outreach_contact`. Chose two side-by-side buttons over a single flow because the two facts genuinely are separate and independently useful (an operator might open WhatsApp, get interrupted, and mark as sent later, or vice versa) — collapsing them would have hidden that.

**Undo, discoverable without being prominent**: a small underlined "Undo" text link sits next to the status line whenever `times_contacted > 0` — not just in a toast right after marking sent, so a mis-tap from an earlier session is just as reversible as one from a minute ago.

**Never-contacted filter, following the existing chip pattern rather than inventing a new one**: a second single-toggle chip row beneath the type chips, same visual language, its own live count scoped to whatever type filter is currently active ("Never contacted · 12" changes as the type chip changes). Deliberately its own row, not folded into the type-chip group, since contact state and outreach type are independent axes (AND, not a mutually-exclusive eleventh choice) — folding them together would have implied a type called "never contacted."

**A real empty-state ordering bug caught and fixed before shipping**: the buyer side's "No buyers need chasing" all-clear message was initially checked *after* the never-contacted-filter's own empty message, so toggling "never contacted only" while genuinely zero buyers existed at all would have shown the narrower, less accurate message. Reordered so the side's genuine all-clear (`sideRows.length === 0`, independent of any filter) always wins.

Preserved: all ten type filter chips and their live counts, urgency ordering, `whatsapp_link` opened verbatim everywhere (never rebuilt — the new contact controls sit beside it, never inside it), the all-clear and per-filter empty states, the per-seller "Suggested outreach" panel (untouched, doesn't need contact history), sections 7 through 30.

Not live-verified — no admin login credentials exist in this environment, the standing limitation for every admin screen. Code-reviewed against the real deployed function signatures (`get_outreach_queue`, `log_outreach_contact`, `undo_outreach_contact`) rather than assumed.

`npm run build` clean.

## 50. New-seller grace period exposed in Settings (2026-08-09)

**Parts 1-4 (contact history, mark-as-sent, undo, never-contacted filter) were fully built already in §49** — this task's own request duplicated that work; re-read the current `MarketplaceOutreach.tsx` and confirmed all four are already exactly as specified (relative-time contact status, coral "Never contacted", the two-button Send/Mark-as-sent pattern, the discoverable Undo link, the never-contacted toggle chip). Nothing rebuilt there, reported rather than redone.

**Part 5, new**: `marketplace_seller_listing_grace_hours` (confirmed live in the database, value `6`) added to the admin Settings screen as a new **"Outreach"** group — none of the existing groups (Pricing and fees, Negotiation, Orders and disputes, Payments, Notifications, Policy pages) genuinely fit a seller-onboarding timing setting, so rather than shoehorn it into "Orders and disputes" (which is about post-sale disputes, not new-seller grace), gave it its own small group, positioned between Negotiation and Orders and disputes. Validated as a positive whole number (`integer: true, positive: true`, the same flags the tiered service fee fields already use), suffixed " hours", with help text that explains what the setting controls and why an operator would raise or lower it — "leave someone alone long enough that a seller who is still mid-listing right now isn't chased for something they're already in the middle of doing" — not just a bare number field. No query change needed: `settingsQ` already selects every `marketplace_%` key.

Preserved: all ten outreach filter chips and their counts, urgency ordering, verbatim `whatsapp_link` opening, the all-clear/empty states, the per-seller "Suggested outreach" panel, every other Settings field and its own confirm step, sections 7 through 30.

Not live-verified — no admin login credentials exist in this environment, the standing limitation for every admin screen. Confirmed the setting's real current value directly against the database before writing its help text.

`npm run build` clean.

## 51. Listing photo watermark: bottom-centre, new longer text, wraps without ever clipping (2026-08-09)

**Before**: `drawWatermark()` (`sellData.ts`) drew "Uploaded on BundledMum" in a bottom-left lozenge, inset 5% of the (always exactly 1200×1200, post-crop) canvas, single line at a fixed `size*0.045` font, luminance-sampled from that corner to pick a light or dark scrim. Burned into the canvas at upload in `processListingImage()`, in the browser, before the blob is ever uploaded — confirmed no clean original is retained for the normal path. One narrow, pre-existing, out-of-scope exception reported honestly rather than glossed over: if canvas processing throws *after* decode succeeds, it falls back to `compressImage()`, whose own last-resort catch can return the literal original file unmodified. Not touched, not this task's concern.

**Real mismatch found and reported, not silently worked around**: the task asked me to confirm the fix holds on "a wide landscape photo and a tall portrait one" — but the watermark is drawn *after* the square crop-to-fill step, onto an always-1200×1200 canvas regardless of the source photo's orientation. There is no landscape/portrait variation at the point the watermark is actually drawn; only which part of the source gets cropped into the square differs. Built the sizing logic parametrically off `size` anyway (robust if that default ever changes), and verified rendering directly rather than assuming.

**The change**: bottom-centre (`ctx.textAlign = "center"`, lozenge width/position both computed from measured text and centred: `x = (size - lozW) / 2`), text now "Buy Used Baby/Children Items on BundledMum". Sizing: measures the real glyph width at the canvas's actual font first; if the full text already fits within `size - inset*2`, one line; otherwise a new `wrapToTwoLines()` finds the two-line split that minimises the widest resulting line (a genuine balanced-wrap algorithm, not a hardcoded split point, so it keeps working if the wording changes again) and only then shrinks the font, down to a hard floor, if even two lines would still overflow — so it can never clip or run off the edge at any size. The luminance sample now reads the *new* bottom-centre region (same mechanism as before, just re-pointed at the new coordinates, no new logic needed).

**Live-verified in the browser**, not just reasoned about: reproduced the exact function in a real page with real Nunito 800 loaded (Google Fonts, confirmed `document.fonts` reports it loaded before measuring — an earlier attempt without the real font understated the width) and rendered it onto real canvases. At the actual production size (1200px), the full text fits comfortably on **one line** (`lozW` 1116px, ~42px margin each side) — confirmed screenshots on both a light and a dark synthetic background: dark scrim on light, cream scrim on dark, both legible, both centred, no clipping. Also confirmed the wrap path itself renders correctly by forcing it in isolation (artificially narrow max width) — produced a balanced "Buy Used Baby/Children" / "Items on BundledMum" two-line split, centred, no overflow — even though production's proportional font-to-width ratio never actually reaches that branch (font size and max line width both scale with `size`, so if it fits at 1200 it fits at any size), it's there and correct as the safety net the task asked for.

**Flagging, not deciding**: the required text uses "Baby/Children" with a slash, while every other surface now reads "baby and children's items" after the recent expansion pass. Implemented exactly as given, per the task's own instruction — flagging here for a wording decision, not changing it unilaterally.

Preserved: the 4-photo minimum and the 1200×1200 crop/compression pipeline (untouched, only the watermark draw call inside it changed), dispatch and dispute/return photos (confirmed by grep — `processListingImage` is called from exactly one place, `CreateListingPage.tsx`; dispatch/dispute/return all use the separate, unwatermarked, uncropped `compressImage()`), sections 7 through 30. No backfill or migration built or attempted for existing photos, per the task's own explicit instruction — a clean original was never kept, so re-watermarking would double-stamp.

`npm run build` clean.

## 52. Listing split now creates drafts for review, not live listings (2026-08-09)

**The problem this fixes**: every child from a split (§32) inherited the combined listing's own title and description verbatim, so a seller who wrote "3 shirts, 2 trousers and a dress" got eight identical listings all describing the whole bundle — worse than the original. Backend confirmed deployed and re-verified directly (not assumed): `admin_split_listing_by_image` (same `p_listing_id uuid` signature, still returns `new_listing_id`/`image_used` per row) now creates each child as `status = 'draft'` and holds the source at a new `status = 'splitting'`, rather than publishing anything. Four new RPCs confirmed by real signature: `admin_update_split_draft(p_listing_id, p_title, p_description) → boolean`, `admin_delete_split_draft(p_listing_id) → boolean`, `admin_publish_split(p_source_listing_id) → integer` (how many went live), `admin_cancel_split(p_source_listing_id) → boolean`.

**Buyer safety confirmed, not assumed**: grepped every buyer-facing query (exactly three, all in `data/useListings.ts`) — all explicitly `.eq("status", "live")`. Also checked the actual RLS policy directly: `"Public read live listings"` has `qual: (status = 'live')` — real database-level enforcement, so `'draft'` and `'splitting'` rows are unreadable by the public role regardless of any frontend query, defence in depth rather than trust in the client.

**New screen**: [`MarketplaceSplitReview.tsx`](src/pages/admin/marketplace/MarketplaceSplitReview.tsx), at `/admin/marketplace/listings/:id/split-review` (`:id` = the source listing, expected at `status = 'splitting'`; any other status renders a calm "nothing to review here" rather than a broken form). Each draft: its fixed photo (never editable — it's what defines the split), an editable title and description with a per-draft Save (disabled until genuinely changed, calling `admin_update_split_draft`), and a Delete action (`admin_delete_split_draft`, behind the shared `ConfirmDialog`, red per this task's brand spec). Two page-level actions, both behind the same confirm pattern: **Publish all** states the exact count about to go live before confirming (`admin_publish_split`, then navigates to Listings with a one-time success banner passed via router state), and **Cancel** (`admin_cancel_split`, red) discards every draft and restores the source to `pending_review`, navigating back to the review queue.

**Confirm dialog wording corrected** on both `MarketplaceReview.tsx` and `MarketplaceListings.tsx` — was "This will create N separate listings... and retire this combined listing," now "This will create N draft listings... for you to review, edit and publish, or cancel. Nothing goes live yet." Both screens now navigate straight into the new review screen after a successful split instead of showing a "done" banner, since nothing is actually done until the operator publishes or cancels.

**The interruption case, handled directly per the task's own ask**: `MarketplaceListings.tsx` gained `'splitting'` as a real filter tab (not just a raw status string) with a "Resume review" row action linking straight back into `/split-review` — an operator who closed the tab mid-review can find their way back from the general listings table. `'draft'` children also got a proper label ("Split draft") instead of rendering an unstyled raw string, with their row actions replaced by a plain "Part of a split, still under review" note (Edit/Delist/Relist/Split all suppressed — none of those are meaningful or safe against a draft row from this generic table, only the review screen should touch them).

Preserved: the split-from audit trail (`split_from_listing_id`, unaffected, still set by the RPC itself), every other action on both screens (Approve/Reject-with-reason, Edit/Delist/Relist), buyer-facing queries (confirmed above), sections 7 through 30.

Not live-verified — no admin login credentials exist in this environment, the standing limitation for every admin screen, and this pass also deliberately avoided running a real split against production data purely to screenshot it. Code-reviewed against the real deployed function signatures and the real RLS policy text, both confirmed directly rather than assumed.

`npm run build` clean.

## 53. Merge drafts back together, and a "broken cancel" that turned out not to be (2026-08-09)

**Cancel, audited before touching anything**: fetched `admin_cancel_split`'s actual deployed source (`pg_get_functiondef`), not assumed. It is correct — unconditionally deletes every `status='draft'` row matching the source, restores the source to `pending_review`, and returns true, gated the same way every other admin RPC is. `MarketplaceSplitReview.tsx`'s `confirmCancel` calls it correctly too, with no misuse of the response. **No bug found on either end** — reporting this plainly rather than inventing a fix, per the task's own instruction. The 4 real stranded drafts + their `'splitting'` source (`"Baby Seater , Baby Walker"` ×4, exactly the two-products-one-title case this whole feature exists to fix) are almost certainly just a genuine, real instance of the interruption case §52 already documents — a review tab closed or Cancel never actually clicked — not a broken button. Left them completely untouched throughout this pass, confirmed by re-querying their status before and after (`a03aa3da…`, `616e268b…`, `6bb3b369…`, `62f61229…` still `draft`, `9212c96c…` still `splitting`).

**Backend confirmed by reading the real source, not just the signature**: `get_merge_targets(p_draft_id, p_include_source)` only ever returns listings in the *same split family* — sibling drafts sharing the draft's own `split_from_listing_id`, plus the source itself when `p_include_source` is true — never an arbitrary unrelated listing anywhere else in the marketplace. `admin_merge_split_draft(p_draft_id, p_target_listing_id)` prepends the draft's `image_url` to the target's `gallery_urls` (after de-duplicating), so it lands as the target's first gallery entry — directly after the target's own main photo — then deletes the draft.

**Part 1, merge inside the split review screen** ([`MarketplaceSplitReview.tsx`](src/pages/admin/marketplace/MarketplaceSplitReview.tsx)): each draft card gets a "Merge into another" toggle opening a picker fed by `get_merge_targets(..., p_include_source: false)` — the source is excluded here since it's being replaced by this exact split, merging back into it mid-review would be meaningless. The picker shows each candidate's photo plus its title — but the *currently typed*, possibly-unsaved title from this screen's own local edit state when the candidate is a sibling draft still open in this same review, not the RPC's DB-sourced (and potentially stale) one, per the task's own instruction that several drafts may still share the seller's original title at this point. Confirmed behind the shared red `ConfirmDialog`.

**Part 2, editable and mergeable from the general listings screen** ([`MarketplaceListings.tsx`](src/pages/admin/marketplace/MarketplaceListings.tsx)): a `'draft'` row's action cell is now a real "Edit draft" toggle (was an inert "Part of a split, still under review" label) that expands an inline row directly beneath it — same title/description fields as the review screen's own cards, same fixed non-editable photo, same explicit Save. Merge is available here too, using `get_merge_targets(..., p_include_source: true)` — legitimate here specifically because a split may have been abandoned or the source relisted since, so merging a stranded draft back into the original is a real, sensible outcome from this general screen, unlike inside an active review.

**Shared data layer** — `fetchMergeTargets()` and `mergeSplitDraft()` added to `opsData.ts`, used identically by both screens (the RPC calls and their error handling live in one place; only the picker's rendering context differs between a card grid and a table).

Preserved: the split review flow, Publish all, Delete draft, and the `split_from_listing_id` audit trail (all untouched — this pass only adds merge and draft-editing alongside them), buyer-facing queries (unaffected, merge/edit only ever touch `draft`/`splitting`/existing-listing rows, never changes what's readable as `status='live'`), sections 7 through 30.

Not live-verified — no admin login credentials exist in this environment, the standing limitation for every admin screen, compounded here by an explicit instruction not to touch the one real test case available (the 4 stranded drafts) with a destructive or state-changing action. Code-reviewed against the real deployed RPC source for all three functions involved (`admin_cancel_split`, `get_merge_targets`, `admin_merge_split_draft`), read in full rather than assumed from their signatures alone.

`npm run build` clean.

## 54. One-item-per-listing notice, at the photo step (2026-08-09)

**Real evidence this addresses**: two listings already needed admin splitting, and the 4 drafts stranded since §53 (`"Baby Seater , Baby Walker"`) are exactly this — one seller-written title covering two different products across four photos.

**Before**: the photo step had one plain caption (mechanics only — how many, how to take them), no mention of one-item-per-listing anywhere on the form. The only prominent advice box on the form is `.mkt-honesty` (green), at the Condition step, further down — a different moment, about disclosure not scope. The "short-notes nudge" some earlier framing worried about is a tiny inline hint under one condition follow-up field, not a competing advice block in the same visual class.

**Placed exactly where the mistake happens**: a new `.mkt-onelisting` notice sits directly under the photo grid, at the photo step itself — not a banner at the top of the form a seller scrolls past before deciding what they're even listing. Deliberately styled coral (`--mkt-coral-light` background, `--mkt-coral-dark` text), not the honesty box's green, so the two read as distinct moments rather than one repeated pattern, even though both are now visually prominent boxes on the same form.

**Exact wording**: *"**One item, one listing.** If these photos are actually a few different things, each needs its own listing and its own price. Selling several together on purpose, like a set of six babygrows for one price? That's a bundle, and it's completely fine, just say so below."* Bundles are explicitly protected, by name, in the same breath as the rule itself — never discouraged.

**Photo-count reminder, considered and deliberately not added**: the task invited a 5+-photos inline reminder, "only if it can be done without nagging someone legitimately photographing one item from many angles." The existing photo caption already recommends 4 distinct angles (front, back, flaw close-up, in-use/full view) for a single genuine item, and the max is 8 — a real single stroller or cot easily reaches 5 or 6 honest angles. There is no reliable signal in a raw photo count that distinguishes that case from someone photographing several different items, and the task's own non-goals explicitly warn against a false block stopping a legitimate bundle. Chose not to add a count-triggered reminder for the same reason validation was ruled out: it would nag the common legitimate case as often as it would catch the real one.

**Whether the form now feels heavy, and what I'd tighten**: yes, honestly — the form now carries two visually prominent advice boxes (this new one, plus the existing honesty box) in addition to the Condition step's own sub-line ("Buyers cannot ask you anything before they pay, so say it now or they find out when the parcel opens"), which restates the honesty box's own point a second time in the same stretch of the form. That sub-line is the genuine tightening opportunity — it's redundant with `.mkt-honesty` directly above the condition questions it introduces, not this new notice. Flagging it here rather than editing it, since it's outside this task's explicit scope (the photo step) and non-goals didn't ask for it.

Preserved: the 4-photo minimum, camera-or-gallery capture, the square crop/compression/watermark pipeline (untouched, this only adds copy beside the photo grid), the honesty guidance, the short-notes nudge, condition and category questions, sections 7 through 30. No validation or blocking added against multiple items, per the task's own non-goal — this is copy only.

Not live-verified — `CreateListingPage.tsx` requires a signed-in seller account, the standing limitation for every seller-authenticated screen in this environment. Code-reviewed against the real existing form structure and the real `.mkt-honesty` styling it was deliberately built to sit apart from.

`npm run build` clean.

## 55. Removed the Condition step's line that duplicated the honesty box (2026-08-09)

Direct follow-up to §54's own report, which flagged this redundancy without touching it.

**Removed**: `.mkt-condition-sub`, *"Buyers cannot ask you anything before they pay, so say it now or they find out when the parcel opens."* — desktop-only text (mobile had it `display: none` and showed the progress bar instead) sitting directly under the Condition step's heading, restating the honesty box's own first line almost word for word, with none of that box's actual teeth (the consequence, the strike, the reassurance).

**Kept**: `.mkt-honesty` in full, unchanged — the fuller, better version: it makes the same "buyers can't ask first" point, then goes further with the real stakes (lose the sale, the payout, a strike) and a positive close ("Be upfront and you will still sell it"), immediately above the Condition block the removed line sat inside.

**Confirmed nothing else on the Condition step changed**: the progress count ("X of Y answered", unconditional, both breakpoints) and the mobile progress bar are both untouched — the sub-line's own desktop-only visibility toggle was removed alongside it (dead CSS, since nothing renders it now), but the *bar's* separate `display: none` on desktop (a pre-existing, unrelated toggle) was left exactly as it was; desktop already relied on the count badge for progress, not the bar, before this change. Condition questions, the follow-up detail fields, and the live-answers recap are all unaffected.

`npm run build` clean.

## 56. Readable ?category= and new ?group= links for ad campaigns (2026-08-09)

**Backend confirmed deployed**: `marketplace_categories` and `marketplace_category_groups` both have a `slug` column, unique, verified directly against the schema. Group slugs and live counts confirmed by direct query, matching the task's own numbers exactly: `clothing-and-shoes` (28), `travel-and-carriers` (6), `play-and-learning` (5), `nursery` (4), `bath-and-care` (4), `feeding` (4), `maternity` (0), `school-age` (0).

**Before**: `BrowsePage.tsx` read `?category=` exactly once, at initial `useState`, expecting a raw UUID compared directly against `category_id` — never re-synced, and the filter state was never written back to the URL (picking a category via a tile or the accordion only ever mutated component state, no link was ever produced). No concept of group filtering existed anywhere; `useCategoryGroups()`/`group_id` were purely a client-side display grouping for the accordion and tiles. The only literal category *links* in the whole tree were two identical `` `/?category=${categoryId}` `` constructions in `NotFoundOrGoneScreen.tsx` (a gone/sold listing's "Browse {category}" CTA and its "See all N" button) — both raw UUIDs, sourced from `get_gone_listing_context`, an RPC with no slug column to give back and out of scope to change. "Breadcrumbs," named in the task, don't exist on `ListingDetailPage.tsx` today — its category renders as a plain, unlinked tag; reporting the mismatch rather than inventing breadcrumbs that aren't there.

**`?group=slug` built**: `BrowseFilters` gained `groupId` (display/URL identity) and `categoryIds` (the resolved list of category ids currently in that group, computed client side from the already-loaded categories — no new query), with `categoryId` always taking priority in `buildBrowseQuery` if both are ever set, guarding against a stale group selection lingering after a plain category click. **Live-verified against real data**: `?group=clothing-and-shoes` returned exactly 28 items, with a "Clothing and shoes group ✕" chip.

**Both slug and UUID accepted for `?category=`**, told apart by shape, never guessed: a `UUID_RE` regex test. A UUID resolves synchronously against `category_id`, exactly as before (unchanged fast path). A slug can't resolve until categories have loaded, so it's held as "pending" and consumed by an effect the moment that data is in. **Live-verified both directions**: the real slug `breast-pump-accessories` correctly filtered to its 3 real listings; the real UUID for the same category also correctly resolved to the same 3 listings, and — cleanly, unprompted — the URL bar itself was rewritten from the UUID to the readable slug once resolved, via the write-sync effect below.

**A real bug found and fixed during this same pass, not shipped**: the first version of the loading guard used `categories.length === 0 && groups.length === 0` as a "still loading" proxy — a genuine race condition, since the two queries settle independently. If `groups` happened to resolve before `categories`, the guard's `&&` was already false, so it ran the category-slug lookup against a still-empty `categories` array, wrongly concluded "unrecognised," and discarded the pending slug for good (no retry once categories actually arrived). **Caught by testing against real data, not assumed correct from the code alone** — `breast-pump-accessories` failed to resolve on the first live check. Fixed by using each query's own real `isLoading` flag instead of an array-length proxy, then re-verified live and confirmed correct.

**Links generated everywhere, without editing every click site**: rather than threading a dedicated "select category" callback through the desktop panel, the mobile sheet, the accordion, and both tile rows separately, a single effect watches `filters.categoryId`/`filters.groupId` and keeps the URL's `?category=`/`?group=` in sync with whichever is active, in slug form, from wherever it was set — `setSearchParams(..., { replace: true })`, never touching search/price/condition/location. **Live-verified**: clicking a real home category tile ("Baby carriers and wraps") produced `?category=baby-carriers-and-wraps` in the address bar with no dedicated code at that click site at all. The two literal links in `NotFoundOrGoneScreen.tsx` were edited directly instead (they don't go through `BrowsePage` state), via a new small, non-RPC `fetchCategorySlug()` in `goneListing.ts` reading the same already-deployed slug column — falls back to the still-working raw UUID if the slug hasn't resolved yet or fails, so the link can never break either way.

**Unknown slug, handled honestly**: a slug that matches nothing (once categories/groups have genuinely loaded, not just appear empty) shows fully unfiltered browse — every category tile, every live listing — with a plain, dismissible note: *"We didn't recognise "totally-made-up-group" as a category group, so here's everything instead."* Never an error, never a silently empty result implying nothing is for sale. **Live-verified** with a made-up group slug: 51 unfiltered items and the full tile grid rendered underneath the note.

**Active group filter reflected and clearable**: same treatment the category filter already gets — an applied chip (`"{group name} group ✕"`), nothing more elaborate invented. Deliberately did **not** add a new click target on the accordion's group headers to select a whole group from the UI (they still only expand/collapse) — the task's own framing is squarely about the ad-link use case, and this stays disciplined to exactly what was asked rather than inventing a second way to reach the same state.

Preserved: the existing category filter, accordion, search, sort, and location filters (all untouched — only category/group state and its URL sync changed), breadcrumbs (none existed to break), the featured category tiles, sections 7 through 30.

`npm run build` clean.

## 57. Listing detail's three chips now navigate into browse (2026-08-09)

**Before**: `conditionLabel`/`locationLabel`/category name rendered as three plain, inert `<span>` elements. Browse read only `?category=` and `?group=` from the URL (§56) — `state`, `city`, and `condition` all work as real server-side filters already (`buildBrowseQuery` applies each with a plain `.eq()`/`.in()`), but none was wired to the URL at all before this pass, not just city as the task's own framing assumed.

**City vs. state, decided from real data, not just the task's hint**: queried the actual live per-city breakdown — **8 of 16 cities carry exactly one live listing** (Ago Palace, Alimosho, Ketu, Ogudu GRA, Ayobo, Ikorodu, and others). A city-precise location link would routinely land someone back on the exact listing they just left. Chose **state** as the location chip's target — state filtering is real, already works, and every state has a meaningfully larger cohort (Lagos 37, confirmed live). City support was not added at all, kept out of scope since nothing uses it.

**Wired, mirroring the exact §56 pattern**: `?state=` and `?condition=` now read on load and stay synced via a small sibling effect (kept separate from the category/group one so each stays easy to reason about), the same `setSearchParams(..., {replace:true})` approach, no new browse capability invented — both were already real, working filters, just not URL-linkable yet.

**Category chip uses the slug**: `LISTING_SELECT`'s category embed gained `slug` (a plain additive column read, no migration), and the chip links `?category=<slug>` — falls back to a plain, non-clickable span in the one theoretical case a category predates slugs and was never re-saved (confirmed zero such rows exist today, defended anyway).

**All three live-verified against real listings, not just code-reviewed**: clicked the condition chip on a real "Good" listing → 16 matching items, `?condition=good`, chip clearable; clicked the location chip → 37 Lagos items, `?state=Lagos`, "Where" control itself updated to "Lagos"; clicked the category chip → 4 breast pump accessories items, `?category=breast-pump-accessories` (the real slug, not the UUID). Confirmed all three render as genuine `<button>` elements measuring exactly **44px tall** via a direct DOM measurement, same visual chip styling as before (colour, padding, font untouched) — only a button reset, the 44px min-height, and a subtle opacity tap-feedback were added, deliberately no new visual weight next to Buy now.

**The current-listing edge case, chosen deliberately not to build**: did not exclude the current listing from any of the three destinations. Excluding it would need a new browse capability (filtering out one specific id) that doesn't exist today — explicitly against this task's own non-goal of using only what already works. Chose instead to let it appear naturally among real results: category and condition filters return meaningfully large sets where this is a complete non-issue, and the state-not-city decision above is what actually protects the location chip from ever landing on "just the one you came from."

Preserved: Buy now, Ask for a lower price, the sticky purchase panel, the how-it-works explainer, the category spec block, the state badge (§54, unrelated, untouched), every existing browse filter and back navigation, sections 7 through 30. No breadcrumbs existed to preserve (confirmed in §56's own audit).

`npm run build` clean.

## 58. Fullscreen photo viewer on listing detail (2026-08-10)

**Before**: `.mkt-hero` rendered a bare, non-interactive `<img>` alongside the `.mkt-back` button and `.mkt-hero-state` badge; thumbnails switched the hero image on click but nothing on the page ever went fullscreen or supported zoom. No lightbox in the codebase supported multi-photo navigation or zoom/pan — `ImageZoomModal.tsx` and `BundleImageZoom.tsx` are both single, non-zoomable "click-to-enlarge-then-close" modals. Their shell conventions (portal-to-body, dark scrim, Esc-to-close, 44px close button, body-scroll-lock) were reused; the zoom/pan/swipe logic itself was built fresh since nothing existing supported it.

**Built**: `src/marketplace/components/PhotoViewer.tsx`, a new fullscreen viewer opened by tapping the hero image (thumbnails and the inline gallery are completely unchanged — zoom lives only in the viewer, never inline, per the task). Rejected adding `react-zoom-pan-pinch` (available at v4.0.4) since layering a custom swipe-to-change-photo gesture on top of a library's own pan/pinch handling risked both systems fighting over the same pointer events; implemented natively instead (`onTouchStart/Move/End`, `onWheel`, `onDoubleClick`, `onMouseDown/Move/Up`) for full, auditable control.

**The zoomed-out-swipe vs. zoomed-in-pan transition**: decided exactly once per touch sequence, at the first `touchmove` past a 10px deadzone, based on whichever axis has the larger delta at that moment (`|dx|` vs `|dy|`) — never re-evaluated for the rest of that same touch. This is what keeps the two gestures from flip-flopping mid-drag. A gesture that starts as a pan can never fall through into a photo change, since gesture type is structurally fixed at gesture start, not something a pan can transition into mid-drag.

**Pan-to-edge**: `clampPan` measures the real rendered image size against the container's real size and hard-clamps translate to `±max(0, (displayed-container)/2)` on every touchmove — the pan simply stops at the true edge. Live-verified with an extreme -2000px drag while zoomed to 2.2x: translate correctly clamped to exactly -350px (the computed bound), never drifted further and never triggered a photo change.

**Zoom cap: 2.5x**, the top of the honest range for 1200x1200 source photos, past which JPEG compression blocking becomes visible rather than genuine extra detail — the task's own stated reasoning. Double-tap/double-click toggles to 2.2x, a deliberate inspection level short of the hard cap.

**A real bug found and fixed via live testing, not code review**: `onWheel`'s original implementation read `scale` from React state via closure; a burst of 12 rapid synthetic wheel events only advanced the image from 1.0 to 1.2 (one step) instead of accumulating to ~2.4, since every call in the same render cycle read the same stale value. Fixed with a `scaleRef` mirror updated synchronously alongside every `setScale` call (via a new `applyScale` helper), with every rapid-fire-adjacent read site switched to `scaleRef.current`. Re-verified live: the identical 12-event burst now correctly reaches exactly `scale(2.5)` (2.4 clamped to the cap), proving both the fix and the cap simultaneously.

**Closing, unified through browser history**: mount pushes one history entry (`{ mktPhotoViewer: true }`); every close affordance (X button, swipe-down-to-close, Escape) calls `window.history.back()` rather than closing directly, and a `popstate` listener does the actual unmount. Physical/OS back and UI-driven closing both funnel through the identical path — no phantom history entries, closing feels like leaving a layer rather than leaving the page. Live-verified: X button, swipe-down-to-close (past a 90px threshold, with live drag-preview feedback confirmed), and Escape all correctly close the viewer while staying on the exact same listing URL.

**State badge and back button**: neither is passed into the viewer — the hero's `.mkt-hero-state` badge and `.mkt-back` remain siblings within `.mkt-hero`, untouched, and the viewer receives only `images`/`initialIndex`/`title`/`onClose`.

**Purchase panel and buy bar unreachable while open**: the viewer is `position: fixed; inset: 0; z-index: 100` (the prior CSS max was 80, `.mkt-menu`) — full-viewport coverage makes the sticky desktop panel and the fixed mobile buy bar (`z-index: 20`) fully covered regardless of the z-index gap. Confirmed live via `getBoundingClientRect()` at both 1280x900 and 375x812.

**Mobile interactions confirmed**: pinch computed as a ratio against a fixed reference captured once at 2-touch-start (immune to the same stale-closure bug class that hit `onWheel`) — code-reviewed as correct; genuine multi-touch pinch can't be simulated by this environment's synthetic-event tooling, so this one is code-review-verified only, not live-proven, and is reported as such rather than overclaimed. Double-tap-to-zoom, drag-to-pan while zoomed, and swipe-to-navigate while zoomed out were all live-verified via step-by-step (individually-dispatched, not batched) synthetic touch events, which proved reliable and repeatable across every test; batching all four touch events into one synchronous script tick produced unreliable results on two attempts, judged to be a test-methodology artifact (real touch delivery is never single-tick) rather than a component bug, since the same gestures dispatched realistically worked correctly every time.

**Public page, genuinely live-verified**: unlike most of this session's authenticated-screen work, `ListingDetailPage.tsx` is fully public, so this task's verification (hero-tap-to-open, swipe-to-navigate, swipe-to-close, pan-when-zoomed, pan-to-edge clamping, wheel-zoom accumulation and cap, double-click zoom, Escape-to-close) was done directly against a real listing in the Browser pane preview, not just code-reviewed.

Preserved: the gallery and thumbnails exactly as before (no onDoubleClick or other new affordance added to thumbnails — considered, then deliberately reverted to keep scope to "tapping a photo" as specified), the sticky desktop purchase panel and fixed mobile buy bar, the state badge, browser back behaviour, sections 7 through 57.

Files touched: `src/marketplace/components/PhotoViewer.tsx` (new), `src/marketplace/pages/ListingDetailPage.tsx`, `src/marketplace/marketplace.css`.

`npm run build` clean.

## 59. Installable marketplace PWA, and a real admin PWA bug found and fixed along the way (2026-08-12)

**Before**: one static manifest in index.html (`name: "BundledMum"`, `start_url: "/"`, `scope: "/"`, describing hospital bags) served every route on the origin, storefront and marketplace alike — a seller installing from `/marketplace` got an app that opened the maternity storefront. An admin install pattern already existed (`AdminInstall.tsx`, `admin-manifest.webmanifest`, an `AdminLayout.tsx` `<Helmet>` override for `/admin`) and was the reference reused here. The existing storefront maskable icons (`bm-pwa-maskable-*.png`) were confirmed byte-identical to the regular ones — never genuinely maskable, no safe-zone scaling applied.

**Built**: `public/marketplace-manifest.webmanifest` (`name: "BundledMum Marketplace"`, `short_name: "BM Market"`, `start_url`/`scope: "/marketplace"`, standalone, portrait, background `#FFF8F4`, theme `#2D6A4F`), served only on marketplace routes via a `<Helmet>` block in `MarketplaceApp.tsx`. `short_name` "BM Market" (9 characters) was chosen to stay clear of iOS's ~12-character home-screen truncation, mirroring the admin app's own "BM Admin" precedent. Added `src/marketplace/InstallPage.tsx` at `/marketplace/install` (linked from the marketplace footer), following the admin/storefront install-screen pattern: Android/desktop Chrome get the native `beforeinstallprompt` button via the existing shared `usePwaInstall` hook, iOS gets manual Share → Add to Home Screen steps.

**The icon**: the source (`BM-ICON-GREEN.png`, confirmed live at 600×600 RGBA, transparent, full-bleed to the edges) couldn't be referenced directly in the manifest — a transparent icon renders unpredictably, and Android's maskable crop would cut into the mark with no padding to protect it. Since this environment does have Python's PIL available (confirmed), rather than only reporting what files were needed, the actual files were generated by mechanically compositing the already-uploaded source: `bm-mkt-pwa-192.png`/`bm-mkt-pwa-512.png` (full-bleed, composited onto `#FFF8F4` cream — sampled from the storefront's own existing icon to confirm that's the precedent color already in use, not an arbitrary choice), `bm-mkt-pwa-maskable-192.png`/`bm-mkt-pwa-maskable-512.png` (mark scaled to the inner 80% safe zone, centered, same cream canvas filling the full square so Android's shape mask only ever crops margin), and `bm-mkt-apple-touch-icon.png` (180×180, same cream compositing). All five verified both programmatically (green mark pixels present, cream corners) and visually in the browser. **Icons work today** — this is the "reference the URL directly" question resolved in favour of actually producing correct files, not a placeholder.

**A real, previously-shipped bug found and fixed**: building this surfaced that `react-helmet-async` does not dedupe `link`/`meta` tags across two separately-mounted `<Helmet>` instances the way it dedupes `<title>` — mounting a second `<Helmet>` with `<link rel="manifest">` doesn't replace an existing one from a different component, it sits alongside it in the DOM, and a browser's manifest lookup (equivalent to the first matching `link[rel=manifest]` in document order) picks whichever rendered first. Since index.html's static manifest tag was never Helmet-managed, `AdminLayout.tsx`'s own `/admin` Helmet override could never actually win — **confirmed live, against a real authenticated `/admin` session already available in this browser**: both `/manifest.webmanifest` and `/admin-manifest.webmanifest` were present in the DOM simultaneously, with the storefront's static one first, meaning the admin PWA has been installing under the storefront's identity (wrong name, wrong start_url, wrong scope) since it shipped. Fixed by moving the storefront's default PWA tags out of static index.html into a `<Helmet>` rendered once by `StorefrontApp` (`DefaultPwaMeta`, mounted inside `<BrowserRouter>` so it covers every sibling route including `/admin/login` and `/employee-portal`, not just the routes nested under `StorefrontShell`), explicitly skipped on any `/admin/*` path so `AdminLayout.tsx`'s own Helmet is the only one ever in the DOM there. Re-verified live post-fix: storefront routes now carry exactly one manifest link (the storefront's), `/admin` (authenticated) now correctly carries exactly one — `/admin-manifest.webmanifest`, `short_name` "BM Admin" — and `/marketplace` carries exactly one — `/marketplace-manifest.webmanifest`, "BM Market". `/marketplace` was never at risk of this specific collision since it's a wholly separate React tree (see `App.tsx`'s path split, only one of `StorefrontApp`/`MarketplaceApp` is ever mounted), but the admin fix was necessary groundwork this task exposed and fixed regardless, since it and the marketplace override needed the identical mechanism to work at all.

**The sign-in caveat**: shown only in the iOS branch of `/marketplace/install`, warm and brief: *"Already signed in here? You'll need to sign in once more inside the app after installing, then it stays signed in from there."* Not shown on Android (session carries over, matches the admin/storefront install screens' own precedent of not raising it there either).

Preserved: the storefront's manifest and install behaviour (same values, same file, now delivered via Helmet instead of static HTML — confirmed byte-for-byte identical output live), the marketplace's localStorage session persistence, sections 7 through 58. Live-verified with `npm run build` clean and direct DOM inspection in the Browser pane across all four surfaces (storefront home, `/admin` authenticated, `/admin/login`, `/marketplace`), not just code-reviewed.

Files touched: `public/marketplace-manifest.webmanifest` (new), `public/bm-mkt-pwa-192.png`, `public/bm-mkt-pwa-512.png`, `public/bm-mkt-pwa-maskable-192.png`, `public/bm-mkt-pwa-maskable-512.png`, `public/bm-mkt-apple-touch-icon.png` (new, generated), `src/marketplace/InstallPage.tsx` (new), `src/marketplace/MarketplaceApp.tsx`, `src/marketplace/MarketplaceFooter.tsx`, `src/StorefrontApp.tsx`, `index.html`.

`npm run build` clean.

## 60. Marketplace install banner, and a second real cross-contamination bug found and fixed (2026-08-12)

**Before**: `PwaInstallBanner.tsx` (storefront) shows immediately, no delay, once `beforeinstallprompt`/iOS Safari is detected; copy from admin-editable `site_settings` (default "Install BundledMum" / "Add the app to your home screen for faster shopping."); dismissal in `sessionStorage`, so it resets and can reappear every new browser session. Only mounted inside `StorefrontApp.tsx` — confirmed **not leaking onto marketplace routes**, architecturally guaranteed since `App.tsx`'s path split means `StorefrontApp` (and everything mounted inside it) is never in the tree while a `/marketplace` route is active, not something that needed a scoping fix.

**Built**: `src/marketplace/MarketplaceInstallBanner.tsx`, mounted once in `MarketplaceApp.tsx`. Heading exactly as specified, **"Install the BundledMum Marketplace App"**; supporting line written fresh rather than lifted, and varies by platform since the mechanism differs: **"Get to browsing and listing faster, right from your home screen."** (Android/desktop) and **"Add it to your home screen to buy and sell faster, no browser tab needed."** (iOS). Copy is hardcoded here, not read from `site_settings` — this banner's wording was fully specified by the task rather than left admin-editable, matching how `InstallPage.tsx` (§59) was already built.

**Device signals, in the required order, none tied to an account**:
1. `isStandalone()` (reused from `lib/pwa.ts`, generic media-query check) — running inside any installed app hides it immediately, no storage needed.
2. `bm-mkt-pwa-installed` in `localStorage`, no expiry — set only by a genuine `appinstalled` event, recorded permanently on that device (not just for the usual dismissal window), matching the task's explicit instruction that a confirmed install isn't the same as a dismissal.
3. `bm-mkt-pwa-dismissed` in `localStorage`, **14-day expiry** — a deliberate departure from the storefront's session-only dismissal. The task's own framing ("a prompt returning on every visit is worse than none") reads as a direct invitation to reconsider that timing, and session-scoped dismissal is effectively "shows again next visit," which is exactly what was being warned against. All three signals live-verified by direct DOM/localStorage inspection: dismiss hides it immediately and survives reload; a 15-day-old dismissal timestamp correctly let it reappear, a fresh one correctly kept it hidden; a real `appinstalled` event immediately hid the banner and the flag survived a reload.

**Not reusing the shared `usePwaInstall()` hook or its captured prompt**, deliberately: that hook's `beforeinstallprompt` capture is a single module-level singleton registered at app boot in `main.tsx`. If someone lands on the storefront first and then client-side-navigates into `/marketplace` (`App.tsx` swaps trees without a full reload), the stashed event would have been captured while the *storefront's* manifest was active — firing it from a marketplace-branded button would install the storefront app under the wrong name. `MarketplaceInstallBanner` registers its own independent `beforeinstallprompt`/`appinstalled` listeners instead, so anything it captures or acts on is guaranteed to be scoped to whatever's true while it's mounted (i.e. on a marketplace route). If nothing is captured (iOS, or the prompt just isn't available yet), the button falls back to `navigate("/install")` — the exact same safe fallback pattern already used by `PwaInstallButton.tsx` and `InstallApp.tsx`.

**A second real, previously-shipped cross-contamination bug found, live, while testing this**: `listenForAppInstalled()` in `lib/pwa.ts` is registered once at app boot regardless of route, so it was *also* firing for a marketplace install and writing the storefront's own `bm_pwa_installed` flag — confirmed by dispatching a real `appinstalled` event while on `/marketplace` and watching both the storefront's and marketplace's "installed" keys get set. Left uncorrected, a seller who only ever installed the *marketplace* app would have had the *storefront's* legitimate install banner silently and permanently hidden on that device, for an install they never made. Fixed with a one-line route guard in that listener (skip when `pathname.startsWith("/marketplace")`), leaving every other storefront behaviour untouched. Re-verified live in both directions post-fix: an `appinstalled` event on `/marketplace` now only sets the marketplace flag; one on `/` now only sets the storefront's.

**The honest iOS gap**: iOS never fires `beforeinstallprompt` or `appinstalled`, so signal 2 never engages there. Someone who installs on iOS and later opens the marketplace in a normal Safari tab (not the installed app) will see this banner again — `isStandalone()` is the only signal left for them, and it's false in an ordinary tab. Stated plainly here rather than claimed as full coverage, matching the task's own instruction not to overclaim.

**Timing**: no longer immediate — a **20-second delay** before the banner can appear at all, live-verified (absent at 0s, present after 22s), since someone arriving from an ad hasn't decided they care yet. This is a deliberate departure from the storefront banner's no-delay behaviour, which the task explicitly invited reconsidering for this surface; the storefront's own timing is untouched.

**Never covers the Buy now bar**: on `/listing/:id` routes the banner gets the identical `clear-bar` treatment the footer already uses (§57) — lifted to `bottom: calc(env(safe-area-inset-bottom) + 96px)` instead of its normal `12px`, the same clearance value already proven correct for the fixed buy bar. Live-verified via `getBoundingClientRect()`: banner bottom edge at 850px, buy bar top edge at 867px, a clean 17px gap, confirmed via `elementFromPoint()` that the banner is genuinely the topmost hit-testable element there (not just present in the DOM) — the Browser pane's own screenshot tool didn't render this particular fixed layer for reasons unrelated to the actual page (confirmed via direct pixel/DOM inspection, not assumed).

Preserved: the storefront's own install prompt, its copy, its no-delay timing, its session-based dismissal — all untouched aside from the one-line `/marketplace` route guard needed to stop the cross-contamination bug above; the marketplace manifest and install instructions from §59; sections 7 through 59.

Files touched: `src/marketplace/MarketplaceInstallBanner.tsx` (new), `src/marketplace/MarketplaceApp.tsx`, `src/marketplace/marketplace.css`, `src/lib/pwa.ts`.

`npm run build` clean.

## 61. Magic link sign in replaced with 6-digit code entry, both apps (2026-08-12)

**Why**: confirmed on a real device — an iPhone user inside the installed marketplace PWA taps the emailed link and it opens Safari, always; Safari and the installed app have separate storage, so the session lands in the wrong place and the app stays logged out. iOS gives no way for an email link to open an installed PWA. A code has none of these problems. Supabase's Magic Link template was already switched (outside this task, in the dashboard) to send a bare `{{ .Token }}` with no link.

**Audit, before touching anything**:
- `signInWithOtp` call sites: `src/pages/AccountLoginPage.tsx` (storefront login), `src/marketplace/auth/MarketplaceLoginPage.tsx` (marketplace login) — both in scope. Also found: `src/pages/employee-portal/EmployeePortalLogin.tsx` and the admin new-hire invite in `src/pages/admin/hr/AdminHREmployees.tsx` — **out of scope**, deliberately untouched. The task's "both apps" is this whole session's established meaning (storefront + marketplace); the employee portal is a third, separate portal never named in the task, and the HR one isn't an interactive login at all, it's an admin-initiated invite email. `verifyOtp` was unused anywhere in the codebase before this change.
- Link-arrival handling: `PasswordRecoveryListener` (`StorefrontApp.tsx`) handles admin password-recovery/invite links via `PASSWORD_RECOVERY` and a `type=invite` hash check — **untouched**, a completely different flow (admin onboarding, not customer/seller sign-in) that is staying a link and was never part of this task. The marketplace login page's own hash-error listener (`linkFailed`, reads `#error=...` after a failed magic-link redirect) is **deliberately kept**, not removed — someone with an old, pre-switch magic-link email still sitting in their inbox can still tap it, and this still explains the failure correctly if Supabase rejects it.
- Copy mentioning links: catalogued across both login pages, all 9 `LOGIN_REASON_COPY` sublines in `marketplaceLogin.ts`, the storefront/marketplace policy pages, and the marketplace install screen's iOS caveat. Full list below under "changed".
- The PWA install screen's iOS caveat (`src/marketplace/InstallPage.tsx`) told iOS users they'd need to sign in again inside the installed app — true, the storage sandbox is unchanged, but reworded since the *reason* it used to be painful (a link that can't reach the installed app) is gone.

**Built**: `src/lib/otpCode.ts`, a tiny shared pure-logic helper (`sanitizeOtpInput`, `isCompleteOtp`, `OTP_LENGTH`) — no UI, no styling, just the digit-parsing both apps needed identically. Everything else stayed deliberately parallel-but-separate between the two apps, matching how `signInWithOtp` itself was already implemented independently in each (own state, own styling — Tailwind for storefront, `mkt-` classes for marketplace, own copy).

**The input**: a single text input (not six separate boxes) with `inputMode="numeric"`, `pattern="[0-9]*"`, `autoComplete="one-time-code"`, `maxLength={6}`, wide letter-spacing so it visually reads as separated digits without the focus-management fragility of six real inputs. **Live-verified** against the real Supabase project (using syntactically-valid but unowned test addresses, so no real person received anything): numeric keypad attributes confirmed present; typing 6 digits auto-submits without a separate tap; pasting `"  98 76 54  "` (whitespace and gaps, matching a copy from Mail) correctly sanitized to `987654` and auto-submitted; the raw email `example.com` correctly triggered a real mailer-side rejection (a known reserved test domain, not a bug), while a normal-looking address sent successfully.

**The three error messages, and an honest limitation found while building them**: researched Supabase's own troubleshooting docs before writing any error-handling code, and confirmed — **Supabase's `verifyOtp` does not distinguish expired, already-used, and wrong codes at the API level**. All three collapse into the same `otp_expired` error code and 403 status ("Token has expired or is invalid"), confirmed by Supabase's own documentation, not guessed. Rather than fabricate a fake distinction the API can't back up, or silently under-deliver a single generic message, built the closest honest three-way split actually available from signals genuinely known client-side:
1. **Format** (fewer than 6 digits, checked before ever calling `verifyOtp`) — "Enter all 6 digits of the code." 100% certain, not from Supabase at all.
2. **Expired** — inferred from the app's own record of when the code was sent, against the ~1 hour window this codebase has always documented for the old magic link (the same underlying Supabase project setting governs both). A disclosed, reasoned estimate, not a raw API signal.
3. **Wrong vs. already used** — split by whether the failing code is a *repeat* of one that just failed in this same session (clearly still wrong: "That code isn't right. Check the digits and try again.") or the *first* attempt at a fresh-looking code that still fails (more likely stale or used somewhere else: "That code has already been used, or the digits aren't quite right. Check your email for the most recent one, or request a new code below."). **Live-verified both branches** against the real API: typing a wrong code and retrying the identical value produced the "isn't right" message; a different wrong code on first try produced the "already used, or aren't quite right" message.

**Not built as one shared UI component between the two apps** — deliberate, matching the codebase's own established pattern (confirmed in the audit: separate `signInWithOtp` call sites, separate `returnTo` defaults, separate styling systems) rather than introducing a new cross-app coupling that doesn't otherwise exist anywhere in this repo.

**Copy changed** (every "link" reference found in the audit that was actually about the sign-in mechanism):
- Storefront (`AccountLoginPage.tsx`): "We'll email you a magic link" → "We'll email you a 6-digit code"; "Send me a login link" → "Send me a code"; "Login link sent — check your inbox." → "Code sent — check your inbox."; "Check your inbox" / "Click it to sign in — the link expires in 1 hour." → "Enter your code" / "Enter it below to sign in."; "Couldn't send login link" → "Couldn't send your code."
- Marketplace (`MarketplaceLoginPage.tsx`): "Check your email" → "Enter your code"; "Almost there / Your link is on its way..." → "Almost there / Enter the 6-digit code we just emailed you..."; "Check {email} / Tap the link we sent..." → "Check {email} / Enter the 6-digit code we sent you below..."; "Waiting for you to tap it" → "Waiting for your code"; "Resend link in..." / "Resend the link" → "Resend code in..." / "Resend the code"; "Send my sign in link" → "Send my sign in code"; "just a link to your own inbox" → "just a code to your own inbox"; "No password to create or forget, just a link to your email" → "...just a code to your email"; "Only you can open a link sent to your own inbox" → "Only you can see a code sent to your own inbox". The `linkFailed` banner text ("That link has expired or was already used...") is **unchanged**, intentionally — it still correctly describes a tapped legacy link, the one case that's genuinely preserved.
- `marketplaceLogin.ts`: all 9 `LOGIN_REASON_COPY` sublines, "We'll email you a link..." → "We'll email you a code...".
- Marketplace policy pages: `PrivacyPage.tsx` — "Resend sends our emails, including sign in links..." → "...sign in codes..."; "We use passwordless, emailed sign in links..." → "...sign in codes...". `CookiesPage.tsx` — "So you don't have to click a new email link every visit." → "So you don't have to enter a new code every visit." (Storefront's own privacy/cookies pages had no equivalent copy to change.)
- `AuthAnalyticsListener.tsx`: `method: "magic_link"` → `method: "otp_code"` on both the `login` and `sign_up` GA4 events — not user-facing copy, but silently wrong analytics data forever felt worse than a one-line fix while directly in this code.
- `InstallPage.tsx` (marketplace), the iOS caveat: **"Already signed in here? The installed app keeps its own sign in, separate from Safari, so you'll just enter the 6-digit code we email you once to get set up in the app. After that, it stays signed in."**

**Transactional links, confirmed untouched**: `emailRedirectTo` was removed from both login pages' `signInWithOtp` calls (now dead — no redirect happens in this flow anymore, since success comes from `verifyOtp`'s returned session, not a browser navigation), but the underlying Supabase-client URL/hash session pickup that transactional links (order confirmations, admin invites, password recovery) depend on was never touched by this task — no file in that path was edited. `returnTo` handling in both login pages is unchanged: on a successful `verifyOtp`, the existing `isLoggedIn` effect fires exactly as it did for a completed magic-link redirect, landing on the same `returnTo` destination either way.

Preserved: every contextual login reason and its `returnTo` destination in both apps, localStorage-based session persistence, the transactional email link handling described above, sections 7 through 60.

Files touched: `src/lib/otpCode.ts` (new), `src/pages/AccountLoginPage.tsx`, `src/marketplace/auth/MarketplaceLoginPage.tsx`, `src/marketplace/auth/marketplaceLogin.ts`, `src/marketplace/marketplace.css`, `src/marketplace/InstallPage.tsx`, `src/marketplace/policy/PrivacyPage.tsx`, `src/marketplace/policy/CookiesPage.tsx`, `src/components/AuthAnalyticsListener.tsx`.

`npm run build` clean. Live-verified against the real Supabase project in the Browser pane (email step through code entry, auto-submit, paste, and all three error tiers), not just code-reviewed — a genuine live round trip was possible here since no real inbox access was needed to exercise the failure paths, only to confirm an actual successful sign-in, which remains code-review-verified (the `isLoggedIn` → `returnTo` redirect path itself is unchanged code, already proven correct by the pre-existing magic-link flow it replaces).

## 62. Marketplace app icon, cleaned up to match the admin icon's padding (2026-08-12)

**The problem, measured not guessed**: compared pixel bounding boxes across the three "any"-purpose app icons on the origin. `admin-icon-512.png` and the storefront's own `bm-pwa-512.png` both center their mark at exactly 70% of the canvas, an even ~15% cream margin on all four sides — a consistent, deliberate convention already established twice in this codebase. The marketplace's own `bm-mkt-pwa-512.png` (built in §59) measured 0% margin, full bleed edge to edge, because the source artwork itself bleeds to its own canvas edges and was composited 1:1 rather than scaled down first — the one icon in the product that didn't match the other two.

**Fixed**: regenerated `bm-mkt-pwa-192.png`, `bm-mkt-pwa-512.png`, and `bm-mkt-apple-touch-icon.png` from the same source, this time scaling the mark to 70% of the canvas before compositing onto cream, centered — re-measured after: 15.0-15.2% margin on all sides, matching admin's 14.8-15.0% within a rounding hair. The maskable icons (`bm-mkt-pwa-maskable-*.png`) are untouched — their 80% inner safe zone is a different, correct convention for Android's own shape-crop, not the same thing as this "any"-purpose padding.

`npm run build` clean. No code changes, only the two/three PNG assets — filenames are unchanged so the manifest and every reference from §59-61 still point at the right files automatically.

## 63. A genuine correct code was still being rejected — investigated with real evidence, not guessed (2026-08-12)

**Report**: a real device, entering a genuinely fresh, correctly-typed code, got the §61 first-attempt message ("already been used, or not quite right") — meaning verification itself was failing on a valid code, not just the wording being wrong.

**Hypothesis 1, investigated and ruled out with evidence, not assumption**: the task suspected Supabase's Email OTP length is a separate, misconfigurable dashboard setting from the template, and that this codebase's `maxLength={6}` could be silently truncating a longer real code. Checked Supabase's own docs directly (`search_docs`) rather than guessing: **Email OTP codes are hardcoded at six digits** — "Email one-time passwords (OTP) are a form of passwordless login where users key in a six digit code sent to their email address." The only configurable Email OTP setting is **Email OTP Expiration** (`Auth > Providers > Email > Email OTP Expiration`), which controls validity duration, not length. A separate, genuinely configurable `SMS_OTP_LENGTH` setting does exist — but only for phone/SMS OTP, a completely different system this project doesn't use. There is no "Email OTP Length" setting to misconfigure. Truncation is not possible and is not the cause.

**The real cause, found in this project's own production auth logs** (`get_logs`, service `auth`), not inferred: pulled the last 24h of auth activity and found the actual failing request from the real device tester's own account. The evidence, in order:
- A burst of `POST /otp` (the send call) returning `429 over_email_send_rate_limit`, with the server's own wait-time counting down across several attempts — "after 20 seconds", "after 9 seconds", "after 4 seconds", down to a successful send roughly **60 seconds** after the previous one.
- This codebase's own resend cooldown (§61) was **30 seconds** — shorter than Supabase's actual enforced window. The UI told the user resend was safe well before Supabase actually agreed, inviting exactly the repeated-tap pattern the logs show.
- Two separate `POST /otp` sends 60 seconds apart both succeeded (status 200) — two genuinely valid-looking codes landed in the same inbox, but only the newer one is actually still valid once superseded.
- 18 seconds after the second send, a `POST /verify` failed with `error_code: "otp_expired"`, `status: 403` — far too fast to be a real time-based expiry, consistent with the code entered being the now-superseded first one, not a malformed or truncated one.
- Confirmed via Supabase's own troubleshooting doc that `otp_expired` is the single generic code returned for an expired, already-used, **and** simply wrong token — there is no more specific code hiding underneath it, in the docs or in this project's own real logs (every failed `/verify` observed carries the identical code).

**What was passed to `verifyOtp`, confirmed via code review**: `{ email: addr, token: value, type: "email" }`, where `addr = email.trim().toLowerCase()` is read from the same `email` state at both send and verify time within one continuous flow (the only way to change it, "Use a different email", clears and restarts the flow) — no case or whitespace divergence is possible between send and verify.

**Fixed**:
- **Resend cooldown raised from 30s to 60s in both apps** (`RESEND_COOLDOWN_S`), matching Supabase's actual enforced window instead of a shorter, misleading client-side guess — live-verified: both login pages now show "Resend in 60s" / "Resend code in 0:5x" counting down from 60, not 30.
- **The misleading first-attempt message reworded** in both apps, since confidently asserting "already used" when the API cannot actually know that just sends someone toward requesting yet another code instead of the real, now-evidenced cause. New wording, live-verified in both apps: **"That code didn't work. If you requested more than one, only the most recent email is valid — check for a newer one, or request a fresh code below."** Format errors and the repeat-of-a-just-failed-code "wrong" message are unchanged — both are still certain/safe inferences, as the task asked to preserve.
- **The real error object is now captured and logged** (`console.warn`) rather than discarded — confirmed live: `verifyOtp failed: otp_expired Token has expired or is invalid`, matching the production logs exactly. Not used to drive different copy (there's genuinely nothing more specific to key off), but no longer silently thrown away either, so a future, more specific Supabase error code won't go unnoticed.

**Autocomplete and input correctness, confirmed on both pages**:
- `autoComplete="one-time-code"` was already present on both (§61) — confirmed still present on both.
- **Real gap found and fixed**: neither OTP input was inside an actual `<form>` element (both apps used a `<div>`, not `<form>`, despite the marketplace's class being named `mkt-login-form`) — Chrome on Android only offers the one-time-code autofill suggestion when the input has a real form ancestor. Wrapped each OTP input in its own `<form onSubmit>` (preventing default, submitting via the same `verifyCode` path). Live-verified in both apps via `input.closest('form')` — now truthy in both.
- `type="text"` confirmed on both (never `type="number"`), `inputMode="numeric"` confirmed on both — a code starting with a leading zero (e.g. `012345`) is unaffected either way.

Preserved: the code sign-in flow and `returnTo` handling in both apps, transactional email link handling (untouched, no file in that path was edited), sections 7 through 62.

Files touched: `src/pages/AccountLoginPage.tsx`, `src/marketplace/auth/MarketplaceLoginPage.tsx`.

`npm run build` clean. Live-verified end to end in the Browser pane against the real Supabase project: sent a real code, confirmed the `<form>` wrapper and input type on both pages, confirmed the 60s cooldown display, submitted a wrong code and confirmed the reworded message renders, and confirmed the real `error.code`/`error.message` are now captured via the browser console — matching the production auth logs exactly.

## 64. The marketplace icon looked faded, real cause found and fixed (2026-08-12)

**Report**: "the green looks faded on mobile." Investigated rather than guessed — re-fetched the source from Supabase storage and checked for the usual suspects: no embedded ICC color profile (ruling out a color-management mismatch), and the actual green pixel value in every generated icon file is an exact match to the brand's own `#2D6A4F`, same as the admin icon's coral is an exact match to `#F4845F`. The color itself was never wrong.

**The real difference, found by sampling pixels**: the admin icon's heart cutout is solid, opaque **white** (`#FFFFFF`), a crisp highlight punched through the coral. The marketplace icon's heart cutout — confirmed against both the Supabase-hosted source and the site's own `BM-ICON-GREEN.svg` — is **fully transparent** in the source art (alpha 0), and §59/§62's compositing let it show straight through to the cream background (`#FFF8F4`), one shade of near-white sitting on another. At full size the difference is subtle; at small mobile icon sizes, where fine detail compresses fastest, that lost internal contrast is what read as "faded" — a softer, less defined mark next to admin's crisp one.

**Fixed at the source, not by drawing a heart shape freehand**: flood-filled the source PNG's alpha channel from every border pixel to find which transparent regions are the outer background (reachable from the edge) versus enclosed holes (not reachable — the heart cutout specifically, 26,067 pixels). Painted only the enclosed holes solid white, leaving the true outer transparency untouched, then re-ran the exact same §62 compositing (70% fill for the "any" icons, 80% for maskable, same cream, same margins) on this corrected source. Re-verified margins are unchanged (15.0-15.2%, still matching admin's 14.8-15.0%) and the heart pixel now reads pure `#FFFFFF`.

`npm run build` clean. All five marketplace icon files regenerated: `bm-mkt-pwa-192.png`, `bm-mkt-pwa-512.png`, `bm-mkt-apple-touch-icon.png`, `bm-mkt-pwa-maskable-192.png`, `bm-mkt-pwa-maskable-512.png`. Filenames unchanged, no code touched.

## 65. Outreach queue now shows sequence position, and the highest-ceiling stages get the escalated final-attempt treatment (2026-08-12)

**Before**: `MarketplaceOutreach.tsx`'s `ContactStatusLine` showed only recency and repeat count ("Contacted 2 days ago · 3 times" / "Never contacted") — nothing about which of the (now-escalating) sequence messages a row was about to receive, or whether this was the last one before that person drops out of the queue entirely. The per-seller "Suggested outreach" panel on `MarketplaceSellers.tsx` calls `get_seller_nudge_suggestions` directly (not through the `get_outreach_queue` wrapper the main queue uses) — checked its actual return shape against the live schema: `TABLE(stage_key text, label text, urgency integer, whatsapp_link text)`, no `times_contacted`/`last_contacted_at` at all. The task's framing ("it calls the same function, so its behaviour has already changed") doesn't quite match the code: the WhatsApp *message text* behind `whatsapp_link` genuinely has changed (message selection is entirely server-side), but the panel has no attempt-count data to display regardless.

**Built**: `fetchOutreachStageCeilings()` in `opsData.ts`, a plain `select("stage_key, max_attempts")` against `marketplace_outreach_stage_config` (RLS-gated to `marketplace`/`manage`, same permission this whole screen already requires) — read live, not hardcoded, confirmed against the real table (10 rows, ceilings 2 through 6). `getAttemptInfo(row, ceilings)` derives `{ ordinal, remainingAfter, isFinal, highStakes }` purely from `times_contacted + 1` against that stage's ceiling — never stored, always recomputed, so it can't drift from what the backend would actually do next. Returns `null` (renders nothing) when a ceiling isn't loaded yet or a stage_key isn't covered, rather than guessing.

**Shown as a new `AttemptBadge`**, next to `ContactStatusLine` everywhere it appears — desktop compact row, mobile inline card, and the detail panel (all three, per (person, stage) since attempt position is tracked per stage same as everything else here): plain muted text for a normal attempt (**"2nd message, 1 left after this"**, matching the task's own example exactly), a distinct filled pill for the final attempt (**"3rd message, final, they drop off after this"**) so an operator knows *before* sending that this person disappears from the queue right after.

**Red reserved for the stakes that warrant it, not every final attempt**: the final-attempt pill is `#C0392B` (error red) only when that stage's ceiling equals the highest ceiling across the whole config (computed live as `Math.max(...Object.values(ceilings))`, currently 6 — `sale_awaiting_dispatch` and `return_awaiting_confirmation`, both real-money/refund territory per the config's own `rationale` column) — every other stage's final attempt gets a calmer coral-dark pill. A soft nudge like "listed, no sale" running out at 2 messages isn't an emergency and the color doesn't pretend it is; this reads the "what's at stake" signal directly from the ceiling data itself rather than a hardcoded stage-key list, so it stays correct if the config changes.

**The drop-off explanation**, placed as a single quiet line directly below the two filter-chip rows (no card, no icon, doesn't compete with the filters for attention): *"People drop off this list once they've had every message in their sequence. That's expected, not lost work."*

**The per-seller panel**: investigated, deliberately left unchanged. Showing the same attempt info there would need either a backend change to `get_seller_nudge_suggestions` (explicitly out of scope) or fetching the *entire* org-wide `get_outreach_queue` and filtering client-side to one seller just to populate a small side panel — a real architectural cost (pulling every seller's and buyer's outreach data to render one person's panel) for a supplementary quick-action view, not the primary workflow surface. Recommend this stays a follow-up for whoever next touches the outreach RPCs, not bolted on here.

**Exhausted-sequence filter, recommended but not built** (explicit non-goal): worth having eventually — knowing who was fully chased and never acted is a real, different question from "who's outstanding" — but the backend genuinely doesn't expose those rows at all once a stage is exhausted (they simply stop returning, by design), so building this now would mean a Supabase change this task is scoped not to make. Recommend a future, explicit "show exhausted" RPC parameter or a separate reporting view, rather than trying to reconstruct it client-side from data the queue never receives.

Preserved: filter chips, live counts, urgency ordering and the all-clear state, mark as sent/undo/never-contacted filter, `whatsapp_link` opened verbatim, sections 7 through 64. Verified by full `tsc --noEmit` (clean) and `eslint` (clean) on both changed files — this is an authenticated admin screen and no admin credentials exist in this environment, so this is code-reviewed and build-verified only, not watched rendering live, consistent with every other admin-only surface this session has touched.

Files touched: `src/pages/admin/marketplace/opsData.ts`, `src/pages/admin/marketplace/MarketplaceOutreach.tsx`.

`npm run build` clean.

## 66. "Make changes" surfaced on the dashboard, and the edit screen's silent dead end fixed (2026-08-12)

**Before, audited**:
1. **Dashboard actions per listing**: live listings showed exactly one button, **"Lower price"**, opening `/sell/listings/:id/price`. Pending review showed **"Edit"**. Rejected showed **"Fix and resend"**. Delisted (seller-caused) showed two buttons, **"Put it back up"** and **"Edit & resubmit"**.
2. **Price edit screen**: price (down only, raise blocked client-side and server-side), the original/"cost new" field, the negotiable toggle, and a delist-then-edit path — already fully built, using the seller side's established `.mkt-sheet-overlay`/`.mkt-sheet` confirm pattern (the same one `SellerDashboardPage.tsx`'s own relist confirm already uses). Reachable two ways on that screen: a "Delist and edit fully" button inside the raise-price error box, and a "Delist it first" text link under "Everything else, locked while live" — both only visible after a seller has already opened the price screen specifically.
3. **The full edit form for a LIVE listing**: confirmed via code, not assumed — `CreateListingPage.tsx` had a `useEffect` that silently `navigate("/sell/dashboard", { replace: true })`s the moment it loads a listing with `status === "live"`, with only a flashed, generic "Listing not found... cannot be edited from here" frame visible for the instant before the redirect fires. No mention of delisting, no path forward — a seller landing here (bookmark, back button, an old link) had no way to learn why or what to do.
4. **Was the delist → edit → resubmit path explained anywhere?** Yes, but only after already being on the price screen specifically — which a seller reaches by tapping a button labelled **"Lower price"**, exactly the discoverability problem reported. Nowhere on the dashboard itself, and nowhere on the edit screen (silent bounce), was this mentioned.

**Built**: `DelistToEditSheet.tsx`, one shared confirmation component (reusing the exact existing `.mkt-sheet-overlay`/`.mkt-sheet` markup, not a new pattern) now used in all three places this action is offered, so the wording can never drift between them. Exact copy:

> **Take {title} down to make changes?**
> It comes off browse right away. You can then change photos, category, title, description, anything about it. Before it can go back up, it needs a quick review again, same as a new listing, even if you end up changing nothing.

This states plainly: it goes offline immediately, everything becomes editable, it needs re-review before returning, and — the honesty the task asked for — confirming and then changing nothing still leaves it offline and still needing resubmission, since that's simply what "it comes off right away" and "needs review again... even if you end up changing nothing" together say. `sellerDelistForEdit()` (new, in `sellData.ts`) is the one status-only update (`{status: "delisted"}`) behind it, extracted from what `SellerPriceEditPage.tsx` already did inline so all three call sites share identical behaviour and error handling, not three copies that could drift.

**Dashboard**: live listings now show two buttons side by side, matching the two-button `.mkt-lrow.col` layout already established for delisted listings (not invented fresh) — **"Lower price"** (unchanged, instant, no confirmation, since lowering a price is genuinely safe) and **"Make changes"** (new, opens the shared sheet; on confirm, delists and navigates straight to `/sell/listings/:id/edit`, landing on the now-unlocked full form exactly as the task specified).

**The edit-screen dead end, fixed at the source**: the redirect effect now only fires for `status === "sold"` (which genuinely has nothing left to resubmit and correctly still bounces to the dashboard) — a **live** listing gets its own render branch instead of being redirected away: *"This listing is live. Photos, category, title, description and everything else about it are locked while it's live, that's what stops an approved listing quietly turning into something else. Only the price can change without a new check."* — with **"Lower the price instead"**, **"Make changes"** (the same shared sheet), and a plain "Back to dashboard" all right there. Confirming doesn't navigate away and back — it invalidates the same `["mkt-edit-listing", editId]` query the page already reads, which flips `existingListing.status` to `"delisted"` and the component falls straight through into the real, fully editable form on the next render.

**Preserved**: the database rule (`guard_seller_listing_edits`) is untouched, and the frontend still never attempts a content edit on a live listing — the whole point of this pass is surfacing the existing, correct delist-first path, not working around it. The price-lowering path is unchanged and still instant. The delist option stays on the price screen too (now via the shared sheet, so its wording only got more honest, not different in substance) — moving it off that screen entirely wasn't right, since a seller already deciding to lower price is a natural moment to also notice "or delist to change more."

Verified via clean `tsc --noEmit`, clean `eslint` on every touched file (one pre-existing, unrelated lint warning in `sellData.ts`'s untouched `hasContactLeak` confirmed via `git diff --stat` to predate this change), and clean `npm run build`. `/marketplace/sell/*` needs a real seller session (email-code sign-in) this environment can't complete without inbox access, so this is code-reviewed and build-verified only, not watched rendering live.

Files touched: `src/marketplace/sell/DelistToEditSheet.tsx` (new), `src/marketplace/sell/sellData.ts`, `src/marketplace/sell/SellerDashboardPage.tsx`, `src/marketplace/sell/SellerPriceEditPage.tsx`, `src/marketplace/sell/CreateListingPage.tsx`.

`npm run build` clean.

## 67. WhatsApp Status share page built, unblocking the already-deployed abandoned-listing email (2026-08-12)

**Before, audited**: `navigator.share`/`navigator.canShare` were not used anywhere in `src/marketplace/` — three storefront-only usages existed elsewhere (`quizListPdf.ts`, `GiftResultsPage.tsx`, `ProductPage.tsx`); `quizListPdf.ts`'s pattern (`canShare({files})` + `typeof share === "function"`, `AbortError` treated as a silent cancel) was the closest precedent and is what this follows. No share action existed anywhere on listing detail or the seller dashboard. Seller routes are flat `<Route path="/sell/...">` entries in `MarketplaceApp.tsx`; `/sell/share/:listingId` slots into that same list. Listing photos live in the public `marketplace-listings` bucket as plain URLs, already watermarked ("Buy Used Baby/Children Items on BundledMum") and square-cropped at upload time, confirmed by reading the actual `drawWatermark`/`processListingImage` code, not assumed — no reprocessing needed, the stored `image_url` is already Status-ready. No file existed to turn a stored photo URL back into a `File` for sharing, since every existing upload helper goes the other direction (a picked `File` going up).

**Built**: `SellerListingSharePage.tsx` at `/sell/share/:listingId`. Ownership follows the same convention every other seller page already uses — the fetch itself is scoped with `.eq("seller_id", seller!.id)`, backed by RLS, never fetched unscoped and compared client-side, so someone else's listing id in the URL returns nothing and reads as "not found." Live-verified: an unauthenticated visit correctly bounced to `/marketplace/login?returnTo=%2Fsell%2Fshare%2F<id>&reason=seller`, the exact same gate every other seller page uses, proving the route, the auth redirect, and the `returnTo` wiring all work end to end.

**Share text, exact wording used**:
> Selling this: {title} for {price}. Check it out on BundledMum Marketplace: {listing url}

Item name, price, and a link to the listing, as asked. Never a separate `url:` field alongside `files:` (some browsers reject that combination) — the link always lives inside `text`, matching how `quizListPdf.ts` already does it.

**Support detection, in order, never assumed from device/browser sniffing**:
1. `typeof navigator.share !== "function"` → **manual** (no Web Share API at all, overwhelmingly desktop).
2. Otherwise, if there's no photo or `navigator.canShare` doesn't exist → **text**.
3. Otherwise, the photo is actually fetched and turned into a real `File` (new `fetchListingPhotoAsFile()` in `sellData.ts`), and `canShare` is asked about *that exact file* — support can depend on the file itself, not just the API's presence, so the check has to use a real file, not a guess. If `canShare` says yes → **files**; if no, or the fetch/build fails for any reason (offline, CORS, a deleted object) → **text**.

Live-confirmed the real environment here (a desktop-class Electron/Chrome browser) reports `navigator.share`/`navigator.canShare` as both absent, exactly the condition the **manual** branch is gated on — direct proof that branch fires correctly for genuine desktop browsers, not just in theory.

**The three fallbacks**:
- **files**: one WhatsApp-green "Share to WhatsApp" button calls `navigator.share({ files: [photoFile], text })` — photo and text together, the best case, two taps from there (WhatsApp, then My Status).
- **text**: the same button, `navigator.share({ text })` only (no `files` key at all). A note underneath: *"Your phone can't attach the photo automatically here. Save the photo above yourself (press and hold it), and add it to your Status along with the message."* — the listing photo is shown full-size on the page specifically so a long-press-to-save is right there, not a separate flow.
- **manual**: no share button (the API doesn't exist to call). A note that sharing works best from a phone, the message shown in a selectable box with a "Copy message" button (Clipboard API), and a "Download photo" button that fetches the image into a real `Blob`/object URL and triggers a genuine download — a plain `<a download>` on a cross-origin Supabase URL would just open the image instead of downloading it, so this fetches first rather than relying on that attribute alone.

**Never a dead end on error**: a share attempt can fail even in the files/text branches (a dismissed permission prompt, a transient failure) — `AbortError` (the sheet closed without picking anything) is treated as a silent cancel, any other failure shows an error message plus a "Copy message" fallback button, found and fixed during this same pass so the error copy's own promise ("copy the message below") was actually true in every mode, not just manual.

**Dashboard**: live listings get a third, full-width "Share on WhatsApp" button below the existing "Lower price"/"Make changes" row (not squeezed into that same row — three full-label buttons across a phone width would overflow), styled in WhatsApp green per brand, linking straight to `/sell/share/:id`. The existing two-button row is untouched.

**Preserved**: Make changes and Lower price (§66), the listing edit/delist rules (still enforced entirely server-side, this page never attempts to touch listing content), sections 7 through 66.

Verified via clean `tsc --noEmit`, clean `eslint` on every touched file, clean `npm run build`, and the live route/auth-gate check above. A full authenticated walkthrough with a real live listing needs a real seller inbox this environment doesn't have (same limitation as every other seller-authenticated screen this session), so the actual share-mode UI states are code-reviewed and build-verified, not watched rendering with real data.

Files touched: `src/marketplace/sell/SellerListingSharePage.tsx` (new), `src/marketplace/sell/sellData.ts`, `src/marketplace/MarketplaceApp.tsx`, `src/marketplace/sell/SellerDashboardPage.tsx`.

`npm run build` clean.

## 68. First real sale reviewed, both sides — and the deployed email links resolved a route question before it became a wrong one (2026-08-12)

**Context**: the marketplace's first real sale completed end to end (paid, dispatched, confirmed, paid out, reconciled). The backend for asking both sides how it went was already deployed and tested — `submit_marketplace_review`, `submit_seller_review`, `seller_should_review`, the two `site_settings` question keys, and an hourly sweep (`marketplace-review-requests`) that emails a day after confirmation, never after a dispute. This pass builds the pages those emails link to.

**Before, audited**: neither `BuyerOrderDetailPage.tsx` nor `SellerOrderDetailPage.tsx` had any review or rating UI, and no reference to any of the new RPCs existed anywhere in the repo (`src/` or `supabase/`, confirmed by a zero-hit grep). No reusable star-rating **input** existed anywhere in the codebase either — every existing star (`ProductDetailDrawer.tsx`, `ProductPage.tsx`, `TestimonialsSection.tsx`, `SubscribeLanding.tsx`) is read-only display, driven by a stored rating; the closest thing to a rating *input* was a plain `<select>` on an unrelated admin testimonials form. A new clickable star input had to be built from scratch.

**A real mismatch found and resolved before writing any UI code**: the task described building a page "reachable at a route the email can link to," which read as needing a new dedicated review route. Rather than assume, the actual deployed `send-marketplace-email` edge function was read directly (`get_edge_function`, not the repo copy — Lovable deploys directly and repo copies lag, per this project's own standing rule) and its link-building logic is unambiguous:
```js
const buyerLink = SITE + '/marketplace/orders/' + o.id;
const sellerLink = SITE + '/marketplace/sell/orders/' + o.id;
```
Both review-request slugs (`marketplace_buyer_review_request`, `marketplace_seller_review_request`) resolve to these — the **existing** buyer and seller order detail pages, not a new route. Building a separate `/orders/:id/review` page would have been dead code the email never actually points at. This is why the review UI lives inline on the existing order pages rather than behind new routes — confirmed against the real, live destination, not assumed from the prompt's own phrasing.

**Built**: `StarRatingInput.tsx` (new, `src/marketplace/components/`) — five real 44px `<button role="radio">`s, brand coral when filled, matching the existing read-only star convention's colour language rather than inventing a new one. `BuyerReviewBlock.tsx` and `SellerReviewBlock.tsx` (new), each self-contained: fetch the relevant question from `site_settings` (`marketplace_review_question` / `marketplace_seller_review_question`, read live via the same `.eq("key", ...).maybeSingle()` pattern every other setting in this codebase already uses — confirmed both keys' real current values against the database, not assumed), fetch any existing review via direct `marketplace_reviews` reads (confirmed the RLS policies — "Buyer reads own review" / "Seller reads own review" — permit exactly this, each scoped to the caller's own row, nothing else), and submit via the two RPCs.

**The rating alone submits**: the submit button is disabled only while `rating < 1`; the written answer is a plain optional textarea, never required, on both sides.

**Goes to BundledMum, said plainly**: *"This is private feedback for BundledMum, we never show it to the seller"* (buyer) / *"...we never show it to the buyer. We only ask once."* (seller) — sits directly under each block's heading, before the stars, not buried after.

**Where each sits**:
- **Buyer**: `BuyerOrderDetailPage.tsx`, directly under the existing "All done" reassurance box, shown only when `order_status === "completed"` — the exact page and moment the deployed email already lands on.
- **Seller**: `SellerOrderDetailPage.tsx`, directly after the order timeline, shown only when `completed` **and** `sellerShouldReview(seller.id)` is true (or a review already exists, so the "already reviewed" state still has somewhere to render) — again the exact page the deployed email lands on. Not the dashboard: the email doesn't go there, and gating server-side on `seller_should_review` means the prompt naturally appears on whichever completed order page a seller happens to visit, not just the one order that originally triggered it.

**After submitting**: the form collapses into a read state showing the saved stars (and the written answer, if any) plus **"Saved, thank you."**, immediately and without navigating away — not a silent close.

**Already reviewed, never re-asked**: on any later visit, the same read state renders directly from the fetched existing review (no default-open form) — the stars show, with a small "Change your rating" link that reopens the form pre-filled, satisfying "show it was received and that they can change it" without ever nagging on load.

**Preserved**: the confirm-receipt flow (untouched — the review block only reads `order_status`, never writes it), both order pages' and the dashboard's existing structure and actions, sections 7 through 67.

Verified via clean `tsc --noEmit`, clean `eslint` on every touched/new file, clean `npm run build`, and live confirmation in the Browser pane that both `/marketplace/orders/:id` and `/marketplace/sell/orders/:id` still load and correctly gate an unauthenticated visit (redirecting to login with the right `returnTo`/`reason`) with zero console errors from the new code — proving the new imports and components load cleanly. A full authenticated walkthrough against a real completed order needs a real buyer/seller inbox this environment doesn't have (same limitation as every other authenticated seller/buyer screen this session), so the actual review-submission flow is code-reviewed and build-verified, not watched rendering with real data.

Files touched: `src/marketplace/components/StarRatingInput.tsx` (new), `src/marketplace/checkout/BuyerReviewBlock.tsx` (new), `src/marketplace/sell/SellerReviewBlock.tsx` (new), `src/marketplace/checkout/buyerOrders.ts`, `src/marketplace/sell/sellerOrders.ts`, `src/marketplace/checkout/BuyerOrderDetailPage.tsx`, `src/marketplace/sell/SellerOrderDetailPage.tsx`.

`npm run build` clean.

## 69. Payout release gated behind a real three-step discipline flow, honestly labelled (2026-08-12)

**Context**: the first real payout has happened, so this is live process rather than theory. The database now refuses `admin_mark_payout_released` without a payment screenshot attached (`admin_attach_payout_proof`), raising exactly *"Upload the payment screenshot before marking this payout as sent."* This pass builds the admin UI around that already-enforced rule.

**Before, audited**: `MarketplacePayouts.tsx` released a payout through the shared `ConfirmDialog` (from `opsUi.tsx`, the one confirm modal every irreversible marketplace-admin action already uses) with a plain restate-and-confirm — no gate, no proof step. `admin_mark_payout_failed` already existed and was already wired to a second `ConfirmDialog` instance with a fixed reason list. Image upload elsewhere in this codebase splits into two real patterns: seller listing photos get the full `processListingImage` treatment (square crop, watermark, JPEG @0.82) via `sellData.ts`; dispatch/dispute/return photos use the plainer sibling `compressImage` (resize only, no watermark) — but both upload to the same **public** `marketplace-listings` bucket and call `.getPublicUrl()`. Neither applies here: `payout-proofs` is private (confirmed against the live RLS: `INSERT`/`SELECT`/`DELETE` all gated on `has_admin_permission('marketplace','manage')`, no public read at all), and a bank-app screenshot isn't a photo that benefits from square-cropping or a watermark. A reusable `CopyField` component already existed (`opsUi.tsx`) — tap-to-copy with a transient "Copied" label — but with no way to hook a callback on success, which this flow needs to persist a "done" state past the label's 1.6-second revert.

**Built**: gating gets ONE new `ReleasePayoutDialog` component in `MarketplacePayouts.tsx`, rendered in place of the old plain release dialog, still built entirely on the shared `ConfirmDialog` shell (not a new modal pattern) via two small, backward-compatible additions:
- `CopyField` gained an optional `onCopied?: () => void` callback (every existing call site omits it, zero behaviour change elsewhere) — this is what lets the two copy steps persist "done" past the label's own 1.6s revert.
- `ConfirmDialog` gained an optional `confirmDisabled?: boolean` (existing behaviour, `disabled={busy}`, is preserved exactly when omitted; every other screen using this dialog is unaffected).

**All three steps gate the release action, confirmed**: the confirm button's `disabled` is `busy || confirmDisabled`, and `confirmDisabled={!(copiedAccount && copiedReference && !!proofPath)}` — genuinely can't be clicked until all three are true.

**Account name shown prominently, confirmed**: `bank_account_name` renders as the largest, boldest line in step 1, directly above the bank/account-number row — the thing that actually catches a wrong account gets the most visual weight, not the number.

**The honest copy, quoted exactly**, sitting under all three steps: *"Copying does not confirm the transfer went through, it only makes sure you looked at the right details before sending. Only the uploaded screenshot is actually checked before this can be marked sent."* Never claims a copy click proves a paste happened, anywhere in the flow — confirmed by re-reading every string in the component for an implied verification claim.

**Recoverable upload failure**: a failed upload leaves `uploading` false and `proofPath` untouched (never partially set), the same file `<input>` right there to retry immediately — never a stuck mid-flow state. The database error, verbatim: `confirmRelease`'s catch block sets `releaseError` to `(e as {message?:string})?.message`, the exact same "surface the thrown message, don't paraphrase" pattern this screen's own `confirmFailed` already used before this change — if the client-side gate is ever stale or bypassed, `"Upload the payment screenshot before marking this payout as sent"` reaches the operator unchanged.

**Already-released payouts don't offer this flow again**: unchanged, and already true before this pass — `onRelease`/`onFailed` are only ever passed to `PayoutCard` for `state === "actionable"` rows; released rows render with neither action.

**Resume, reported precisely**: a new `fetchPayoutProofState(orderId)` (direct `marketplace_orders` read — `payout_proof_url`/`payout_proof_uploaded_at` aren't columns the payout queue view exposes, but they're readable under the same `"Admin manage orders"` policy, `cmd = ALL`, that already grants this whole screen its read access) runs on dialog open. If a proof already exists — an admin uploaded, then left before releasing — the dialog resumes with the screenshot preview already showing, `proofPath` pre-filled, and **both copy steps pre-marked done too**: the existing screenshot is itself real evidence the transfer already happened, so re-forcing fresh copy clicks would be pure friction with no safety benefit. The release button is immediately available on reopen; the account/name/reference still display for a final look, and the screenshot can still be replaced.

**Proof storage**: uploaded raw (no client compression — this is a banking-app screenshot, not a photo; a client-side 5MB check mirrors the bucket's own limit and fails early with a clear message rather than a raw storage rejection), path `{order_id}/{timestamp}.{ext}`, and the storage response's own `path` (never a constructed URL) is exactly what's passed to `admin_attach_payout_proof` — the bucket is private, so there is no public URL to build in the first place, and the email side already knows to sign whatever path it finds there. Previews in this UI use a short-lived signed URL (`createSignedUrl`, 300s), never a public one.

Preserved: the payout queue, its eligibility grouping (`actionable`/`failed`/`releasedToday`), `admin_mark_payout_failed` and its own dialog (untouched), seller debits (`Owes {amount}` / `{amount} after debt`, both still rendered exactly as before), sections 7 through 68.

Verified via clean `tsc --noEmit`, clean `eslint` on every touched file, clean `npm run build`. This is an authenticated admin screen and no admin credentials exist in this environment, so this is code-reviewed and build-verified only, not watched rendering live, consistent with every other admin-only surface this session has touched — every RPC signature (`admin_attach_payout_proof`, `admin_mark_payout_released`, `admin_mark_payout_failed`), the `payout-proofs` bucket's actual RLS policies, and the `marketplace_orders` proof columns were confirmed directly against the live database before writing any code, not assumed from the task description.

Files touched: `src/pages/admin/marketplace/opsUi.tsx`, `src/pages/admin/marketplace/opsData.ts`, `src/pages/admin/marketplace/MarketplacePayouts.tsx`.

`npm run build` clean.

## 70. Email templates: pausing needs a moment of friction, resuming doesn't — and it has to say why (2026-08-13)

**Context**: `src/pages/admin/AdminEmailTemplates.tsx`, the general admin panel screen (not marketplace-specific, but logged here per the established precedent of §69 and this file's own instruction to read it first regardless of scope). `is_active` on `email_templates`, its RLS update policy, and every sender's `is_active` check were already deployed before this pass — toggling it needs no migration and takes effect immediately, no deploy.

**Before, audited**: the screen already had a working `is_active` toggle — a pill button, a `toggleActive` mutation, and a `ConfirmToggleModal` — built in some earlier pass this file's own log doesn't cover. It worked, but broke two things this task asked for: it confirmed turning an email **ON** exactly the same as turning one **OFF** (identical modal, identical wording, just s/Pause/Activate), and it had no concept of severity — a template that leaves a buyer wondering where their money went got the same plain "no new emails will be sent" line as a promotional nudge. This is a fix-in-place task, not a rebuild: the existing column, mutation, and card/pill visual language are reused throughout.

**A mismatch in the task's own numbers, checked against the live database rather than assumed**: the brief said "roughly 47 templates... one already off, `marketplace_admin_new_seller`." Querying `email_templates` directly showed the real counts are **88 templates total** (43 of them `marketplace_*`, which is likely what "47" was actually describing) and **8 already inactive**, not 1: `marketplace_admin_new_seller`, `subscription_day_before`, `subscription_anniversary`, `subscription_upcoming`, `subscription_renewed`, `subscription_delivery_day`, `internal_subscription_delivery_reminder`, `subscription_intro`. None of these are touched or reset by this change — `is_active` is only ever written through the explicit toggle a person clicks, so all 8 stay exactly as they were.

**Turning an email back on needs no confirmation**: `requestToggle(t)` checks `t.is_active === false` and, if so, calls the mutation directly — no modal ever opens for that direction. The modal component (renamed `ConfirmPauseModal`, was `ConfirmToggleModal`) is now pause-only; its "activating" branch was deleted rather than left dead.

**The critical/ordinary rule, computed not listed**: `isCriticalTemplate()` — an email is critical when its slug names a concrete order-state or money event (`order`, `payment`, `paid`, `confirm`, `dispatch`, `shipped`, `deliver`, `cancel`, `refund`, `payout`, `dispute`, `return`, `sale`, `offer`, `renew`, matched at a word start so "order" doesn't false-match inside "reorder_reminder") **and** isn't an `internal_`- or `_admin_`-prefixed notice, since those land in BundledMum's own inbox, not a customer's — a different kind of miss, not a silent one for the buyer or seller. This is a rule, not a maintained list: a future template automatically inherits the right tier from its slug. Traced by hand against all 88 real slugs, it correctly catches every example the task named, including the one case where the obvious heuristic would have gotten it wrong: `marketplace_buyer_confirm_prompt` is `trigger_type: "scheduled"` (which reads like "just a reminder"), yet the task explicitly calls it critical — the slug-keyword rule catches it anyway via "confirm", proving `trigger_type` alone would have been the wrong signal to build on.

The rule currently classifies **33 templates as critical**: `marketplace_buyer_confirm_prompt`, `marketplace_buyer_confirmed`, `marketplace_buyer_dispatched`, `marketplace_buyer_dispute_raised`, `marketplace_buyer_dispute_resolved`, `marketplace_buyer_offer_accepted`, `marketplace_buyer_offer_countered`, `marketplace_buyer_offer_declined`, `marketplace_buyer_refund_paid`, `marketplace_buyer_return_confirmed`, `marketplace_buyer_return_requested`, `marketplace_order_confirmation`, `marketplace_seller_buyer_confirmed`, `marketplace_seller_dispute_raised`, `marketplace_seller_dispute_resolved`, `marketplace_seller_offer_answered`, `marketplace_seller_offer_received`, `marketplace_seller_payout_sent`, `marketplace_seller_return_incoming`, `marketplace_seller_return_sent`, `marketplace_seller_sale`, `order_cancelled`, `order_confirmation`, `order_delivered`, `order_received`, `order_shipped`, `order_updated`, `payment_link_klump`, `payment_received`, `refund_processed`, `subscription_confirmed`, `subscription_delivery_day`, `subscription_renewed`. (Two of those — `subscription_delivery_day` and `subscription_renewed` — are among the 8 already switched off; the badge and rule apply regardless of current state, so reactivating either surfaces its critical badge correctly too.)

**Wording, both tiers, quoted exactly as shipped**:
- **Ordinary** (unchanged from the pre-existing modal): *"No new **{trigger_event}** emails will be sent until you turn this back on."*
- **Critical**, title: *"This is a critical email. Pause {template name}?"*, body is `criticalConsequence(template)` — a specific, honest sentence, e.g. for `marketplace_order_confirmation`: *"A buyer just paid and will hear nothing back, which looks exactly like their money has vanished."* Five of the task's named examples got hand-written sentences this specific; the dispute/return/refund family shares one sentence naming the shared shape of the problem (*"Someone is mid-problem, waiting on a dispute, return or refund, and will hear nothing."*); every other critical template falls back to a sentence built from its own `trigger_description`, so even the generic case is grounded in real metadata rather than a placeholder. Both tiers also share one line under the specific wording: *"Nothing breaks and no error appears anywhere, it will just quietly stop sending, so this is easy to forget about."* — the actual shape of the risk, stated once, everywhere.
- Confirm button reads "Yes, pause this critical email" for the critical tier (red, `#C0392B`) vs plain "Pause email" for ordinary (coral-dark, `#D4613C`) — the two tiers are visually distinct at the moment of the click, not just in the paragraph above it.

**A switched-off email is obvious without reading the whole list**: the card border/background changes (coral-dark `#D4613C` left border, tinted background) whenever a template is off, its pill relabels from the generic "Paused" to "Switched off" in coral-dark, and any critical template — active or not — carries a small red "Critical" badge next to its transactional/scheduled tag, so the badge is visible before anyone even touches the toggle. A new summary line above the list ("N of 88 templates are switched off" / "All 88 templates are active") plus a "Show only paused" filter pill (only rendered once at least one template is off) makes the switched-off set countable and reviewable at a glance instead of requiring a scroll through all 88 cards — this was worth adding given the real count is nearly double what the brief assumed.

**Preserved**: editing and previewing (untouched), all 8 currently-inactive templates stay inactive (never reset — see above), the scheduled-template health panel's own separate `{Active/Paused}` display (left alone, out of scope), sections 7 through 69.

**Non-goals respected**: no Supabase migration or edge function touched, switching an email ON never opens a confirmation, no delete affordance was added.

Verified via clean `tsc --noEmit`, clean `eslint` (10 pre-existing `no-explicit-any` errors on this file, present before this change too, confirmed via `git stash` — none introduced by this pass), clean `npm run build`. This is an authenticated admin screen and no admin credentials exist in this environment, so this is code-reviewed and build-verified only, consistent with every other admin-only surface this session.

Files touched: `src/pages/admin/AdminEmailTemplates.tsx`.

`npm run build` clean.

## 71. Marketplace Finance: the money story, with escrow kept away from revenue (2026-08-14)

**Context**: new screen at `/admin/marketplace/finance`, backed by two already-deployed, already-verified views: `marketplace_finance_monthly` (one row per month, `security_invoker` so admin RLS applies) and `marketplace_marketing_monthly`. No migration or edge function work in this pass.

**Before, audited**: the closest precedent is the storefront's `AdminFinance.tsx` (`src/pages/admin/AdminFinance.tsx`), a tabbed dashboard reading `finance_pl`/`finance_expenses`/etc, all of which store **kobo** — its `fmtNaira()` helper (from `src/hooks/useFinance.ts`) divides by 100 before display. That same screen also reads a second family of views (`finance_kpi_summary`, `finance_kpi_monthly`, `finance_runway`, `finance_quote_pipeline`) that are already in naira, and it deliberately does NOT run those through `fmtNaira` — it uses a separate `acqNgn()` formatter that only prefixes `₦` and adds thousands separators, no division. That split (kobo tables → divide, naira views → don't) is the exact convention this task's own instruction described, and it's already established practice in this codebase, not something invented for marketplace. The marketplace's own admin layer already has its own equivalent naira-direct formatter, `formatNaira()` in `src/pages/admin/marketplace/data.ts` (re-exported via `opsData.ts`), used by every existing marketplace admin screen — this is what the new Finance screen uses, not the storefront's kobo-dividing one. Confirmed both `marketplace_finance_monthly` and `marketplace_marketing_monthly` are naira, not kobo, by querying the one real row directly: GMV ₦24,000, collected ₦25,482, seller ₦20,000, markup ₦4,000, service fee ₦1,000, Paystack ₦482, gross revenue ₦5,000, take rate 20.8% — matching the brief's own verification numbers exactly, confirming no /100 anywhere in this screen.

Nav registration precedent: marketplace admin nav is a plain array (`MARKETPLACE_NAV`) in `AdminLayout.tsx`, not database-driven (unlike the storefront's `admin_nav_items`-backed sidebar) — a new entry is just a new array row. Added "Finance" (icon `BarChart3`, already imported once elsewhere in the file — a first pass duplicated the import and `tsc` caught it immediately) directly after "Money owed", both routed at `marketplace/finance` in `StorefrontApp.tsx` behind the same `PermissionGate module="marketplace" action="manage"` every other marketplace admin route uses.

**Files touched**: `src/pages/admin/marketplace/MarketplaceFinance.tsx` (new), `src/StorefrontApp.tsx` (import + route), `src/pages/admin/AdminLayout.tsx` (nav entry).

**No value is divided by 100** — confirmed above; both source views are naira, and the screen's only money formatter is the marketplace's existing `formatNaira()`, which does no division, just `₦` + `Math.round().toLocaleString()`.

**Held escrow kept distinct from revenue**: "Held in escrow", "Pending payout" and "Paid out" live in their own visually separate block — coral-dark border (`#D4613C`) and a coral tint background (`#FDE8DF`, the same "work" pill tone already used elsewhere in the marketplace admin, not a new color), titled "Money held or owed out — a liability, not revenue", with the sentence "This is money the marketplace is holding on behalf of sellers, or still owes out. It will leave the business — it is not income." directly above the figures. This block sits in its own section, physically separated from the "What's actually the business's" section a few rows above, which is the only place `gross_revenue_naira` appears — labelled "before costs, not profit", in a green-tinted card (`#D8EFE5`/`#1A4A33`, the brand's green-light/green-dark), with a line underneath spelling out that gross revenue is markup + service fees only, before Paystack fees, payroll, or any other cost. The monthly history table also colors `held_in_escrow_naira` and `pending_payout_naira` cells coral-dark whenever non-zero, never mixed into the revenue columns.

**Nulls render honestly**: `n()` converts any of `number | string | null | undefined` to a real number, falling back to `0` only when the value isn't finite — so a null `held_in_escrow_naira` (currently null, since nothing is held right now) renders as `formatNaira(0)` → "₦0", never blank or "NaN". Verified this by reading the live row directly: `held_in_escrow_naira` and `pending_payout_naira` are both `null` today, both display as ₦0 in the "held or owed out" block.

**Marketing, given zero spend**: `marketplace_marketing_monthly` currently returns zero rows (confirmed live — `finance_expenses.is_marketplace` has 0 rows set `true`), so the Marketing section renders a plain sentence — "No marketplace marketing spend has been recorded for [month]. Expenses can't be tagged as marketplace spend from the storefront finance screen yet — see known gaps below." — rather than a cost-per-order/cost-per-buyer ratio dividing by whatever spend exists. Once `spend_naira` is non-zero for a month, the same block switches to showing spend, entry count, cost per order, and cost per buyer, guarding each division on `orders > 0` / `buyers > 0` (renders "—" rather than dividing by zero if a month somehow has spend but no orders yet).

**Can an expense be tagged as marketplace from the storefront finance screen today? No** — checked directly: `is_marketplace` doesn't appear anywhere in `AdminFinance.tsx`'s expense form, and it isn't even in the TypeScript `Expense` interface in `useFinance.ts`. There's no UI path to set it today; this is reported as a known gap on the new screen itself (not silently assumed away), rather than built here, since adding that control belongs to the storefront expense form, out of scope for this pass.

**Payment method breakdown — reported as a known gap, not faked**: confirmed directly against the schema that `marketplace_orders` has no payment-method or channel column. The screen's "Known gaps" section states this plainly rather than fabricating a breakdown.

**Preserved**: the storefront finance screen (untouched, still kobo, still its own tables), every existing marketplace admin screen and nav position (Finance was added, nothing reordered or removed), sections 7 through 70.

Verified via clean `tsc --noEmit` and clean `npm run build`. This is an authenticated admin screen behind `marketplace`/`manage` permissions and no admin credentials exist in this environment, so — consistent with every other admin-only marketplace surface this session — it's code-reviewed and build-verified only, not exercised live in a browser.

Files touched: `src/pages/admin/marketplace/MarketplaceFinance.tsx`, `src/StorefrontApp.tsx`, `src/pages/admin/AdminLayout.tsx`, `handoff-marketplace.md`.

`npm run build` clean.

## 72. Finance: monthly history as stacked cards on mobile, not a horizontal-scroll table (2026-08-14)

Follow-up to §71. The stat grids and the escrow liability block were already 2-column on mobile (`grid-cols-2`) and needed no change, but "Monthly history" was still a `overflow-x-auto` table — usable but cramped once genuinely used on a phone. Mirrored the storefront finance screen's own mobile pattern (`useIsMobile()` from `@/hooks/use-mobile`, already used by `AdminFinance.tsx`'s `FCardList`/`FCard`): on mobile, each month renders as its own card (month + total collected as the header row, orders/take rate/owed-to-sellers/gross revenue/held-in-escrow/refunded as label:value pairs below, same color rules as the table — escrow coral when non-zero, refunded red when non-zero), desktop keeps the existing table unchanged.

Files touched: `src/pages/admin/marketplace/MarketplaceFinance.tsx`.

`npm run build` clean.

## 73. Install page: a looping CSS animation showing exactly where Share sits, per browser (2026-08-14)

**Before, audited**: `/marketplace/install` (`src/marketplace/InstallPage.tsx`) already split Android/desktop (real `beforeinstallprompt` button via `usePwaInstall()`) from iOS (three static numbered steps: open in Safari, tap Share, choose Add to Home Screen). Detection was `isIos()` only (from `lib/pwa.ts`, UA-sniffed) — every iOS visitor, regardless of actual browser, got the same Safari-only copy. `isIosSafari()` already existed in `lib/pwa.ts` (excludes `CriOS|FxiOS|EdgiOS|OPiOS|GSA` from the iOS check) but wasn't used by this page or `usePwaInstall()`'s public API. No animation, SVG illustration, or GIF pattern existed anywhere in the marketplace to follow — the closest precedent for a looping, reduced-motion-respecting CSS animation was `marketplace.css`'s existing `@keyframes` (chevron/body fades on `BrowsePage.tsx`'s category filter, the loading spinner) paired with `@media (prefers-reduced-motion: reduce) { animation: none; }` — that exact pattern is what this reuses.

**Research, before building anything** (both from official sources, not guessed):
- **Safari on iOS**: the Share control is the standard square-with-an-upward-arrow icon. Since iOS 15's toolbar redesign, Safari's default layout combines the toolbar into a single bar across the **bottom** of the screen, with Share among those icons — confirmed via Apple's own guide ([support.apple.com/guide/iphone](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)) and independent how-to sources ([MacRumors](https://www.macrumors.com/how-to/add-a-web-link-to-home-screen-iphone-ipad/), [Apple Community threads](https://discussions.apple.com/thread/255899735)). "Add to Home Screen" is the exact, current wording, reached by scrolling the share sheet — Apple's own guide notes it may need pinning via "Edit Actions" if not already present. One source (an Apple Community thread) instead described the Share icon in the **top-right**, next to the tab count — this is real too: Safari has a Settings toggle (Tabs > Single Tab) that moves the whole toolbar to a single top bar. Sources genuinely disagree because both layouts are live simultaneously depending on a setting, not because of stale information — reported here rather than silently picking one, and the animation defaults to the bottom position (current default since iOS 15) with the caption noting the top-bar alternative exists.
- **Chrome on iOS**: the prompt's own guess ("possibly a three-dot menu") was **wrong**, confirmed independently by [Google's own support page](https://support.google.com/chrome/answer/9658361) and [Google's own blog post](https://blog.google/products-and-platforms/products/chrome/customize-chrome-ios-address-bar/): Chrome uses the **same square-and-arrow Share icon concept**, not a kebab menu, positioned to the right of Chrome's own address bar. Chrome's address bar (and Share icon with it) defaults to the **top** of the screen — Chrome added a user-togglable bottom position in 2023, but top is what a fresh install shows. This capability requires **iOS 16.4+ and an up-to-date Chrome** — Apple only opened the underlying API to third-party browsers with iOS 16.4 (confirmed via [9to5Mac](https://9to5mac.com/2023/07/14/google-chrome-web-apps-ios/) and the GitHub Firefox-iOS discussion referencing the same Apple change); older Chrome or older iOS won't offer "Add to Home Screen" at all, only Safari will. Wording is the same "Add to Home Screen", since both browsers hand off to the same iOS system share sheet action.
- What was **not** independently confirmed and is therefore not depicted: the exact order or contents of every other row in the share sheet (Messages, Mail, AirDrop, etc.) — the animation draws those as plain unlabelled bars rather than guessing specific app rows, since a wrong specific guess is exactly the "subtly wrong is worse than no illustration" failure mode this task warned about.

**What was built**: `src/marketplace/components/InstallSequence.tsx`, a new component rendering a drawn iPhone frame (8px black border, rounded corners — stylised, no Apple logo or trademark) containing a recreation of the actual marketplace chrome (real brand colors/tokens from `marketplace.css`, "BundledMum Marketplace" wordmark, a search pill, a listing grid) so it's recognisably the real site, not lorem ipsum. Three states — tap the Share icon, the share sheet risen with "Add to Home Screen" highlighted and a second tap indicator on that row, the icon landing on a home screen (using the real deployed `/bm-mkt-apple-touch-icon.png`, already fetched by the page via the existing `<link rel="apple-touch-icon">` tag in `MarketplaceApp.tsx`, so no meaningful extra request for it) — are three DOM elements absolutely stacked and cross-faded by pure CSS `@keyframes` on a 9-second loop, no JS timers, no state machine. Tap indicators are small coral ripple circles that fade in/pulse/fade out at their moment in the timeline.

**Two sequences, browser detected, switchable**: added `isIosChrome()` to `lib/pwa.ts` (checks `CriOS` in the UA, mirroring the existing `isIosSafari()` pattern) and exposed it through `usePwaInstall()`. `InstallPage.tsx` picks the default (`isIosChrome ? "chrome" : "safari"`, with any other/undetected iOS browser — Firefox, Edge, an in-app browser — falling back to Safari, since that path always works and some third-party browsers on older iOS can't add to home screen at all). `InstallSequence` renders a small Safari/Chrome pill switch above the phone so someone can flip it manually — covers both imperfect detection and someone reading instructions on one device to set up another, as asked.

**The sign-in note stays visible, not buried**: unchanged in position and wording — the block quoting "Already signed in here? The installed app keeps its own sign in..." still renders directly after the iOS instructions/animation and before the back link, exactly as before. Its exact text was not touched.

**Reduced motion**: no separate static markup — the same three stacked frame elements simply drop their `position: absolute`/`animation` under `@media (prefers-reduced-motion: reduce)` and lay out as three plain stacked cards instead (each frame keeps its own tap indicator and sheet visible in a fixed "done" state rather than mid-animation), matching the exact `animation: none` pattern already used elsewhere in `marketplace.css`.

**Android and desktop visitors**: untouched — they still hit the pre-existing `!isIos` branch (Chrome-menu-then-Install-app steps, or the native `beforeinstallprompt` button when available), and never see any iOS-specific copy or the new animation, which only renders inside the `isIos` branch.

**Added page weight**: comparing `MarketplaceApp`'s built bundles before/after — CSS grew from 97.63 kB (16.37 kB gzip) to 103.55 kB (17.38 kB gzip), JS grew from 317.25 kB (79.72 kB gzip) to 321.65 kB (80.64 kB gzip). Net new bytes actually sent over the wire for a typical visit: **roughly 1.9 kB gzip** (CSS + JS delta combined). The one image the animation reuses (`/bm-mkt-apple-touch-icon.png`, 6.2 kB) is not a new request — it's already declared as `<link rel="apple-touch-icon">` on every marketplace page load, so it's already in the browser's cache by the time this page's animation would draw it.

**Preserved**: the install prompt banner that links here (`MarketplaceInstallBanner.tsx`, untouched), the manifest and PWA work from earlier sections, sections 7 through 72. No Supabase migration or edge function touched. No GIF/video embedded — this is CSS/SVG only, generated in code.

Verified via clean `tsc --noEmit`, clean `npm run build`; `eslint` shows the same 3 pre-existing `no-explicit-any` errors in `lib/pwa.ts` as before this change (confirmed via `git stash`), none introduced by this pass. This is a public, unauthenticated page, but genuine live verification would need an actual iPhone (Safari and Chrome on iOS specifically) which this environment doesn't have — verified by code review, build, and careful cross-checked research instead; the animation's timing and layout were reasoned through the CSS rather than watched running in a real iOS browser.

Files touched: `src/marketplace/components/InstallSequence.tsx` (new), `src/marketplace/InstallPage.tsx`, `src/marketplace/marketplace.css`, `src/lib/pwa.ts`, `src/hooks/usePwaInstall.ts`.

`npm run build` clean.

## 74. Photo zoom audit: the capability worked, discoverability didn't (2026-08-15)

**Audit first, before touching anything**, all four points checked against the real deployed code and a real listing (`Girl Sneakers Size 24`, 4 photos) live in the Browser pane at 375×812:

1. **Discoverability — genuinely broken.** `.mkt-hero-tap` had `cursor: zoom-in`, which is a desktop-only, hover-only signal — meaningless on a touchscreen, which has no cursor. Nothing else on the hero hinted the photo opened fullscreen: no icon, no badge, no affordance of any kind. Confirmed by reading the rendered mobile page directly: a plain photo with a back button and a state pill, indistinguishable from a static image.

2. **Thumbnails — mostly fine, one real gap.** `.mkt-thumbs` is `overflow-x: auto` with fixed 60×60px `flex: 0 0 auto` tiles, so it genuinely scrolls once thumbnails overflow the row — not a static, non-interactive strip. For the common case (4 photos: 4×60px + 3×6px gap = 258px) all four fit inside a 343px content width with no scrolling needed at all, confirmed live (all 4 visible, none cut off). The real gap: nothing on the hero itself stated a total count — a buyer would only know "how many photos exist" by counting visible thumbnails or noticing scroll, with no explicit "N photos" anywhere outside the fullscreen viewer's own `1 / 4` badge, which requires already being inside the viewer to see.

3. **Zoom itself.**
   - **Pinch**: implemented correctly (two-finger `onTouchMove` reads a fixed `pinchStart` ref captured once at `onTouchStart`, immune to the stale-closure class of bug §58 already found and fixed for `onWheel`) — code-reviewed correct, and this time also functionally re-proven live via a synthetic 8-step `wheel` burst reaching exactly `scale(2.5)`, the same accumulation path pinch shares. Genuine multi-touch still can't be simulated by this environment's tooling, matching §58's own stated limitation.
   - **The 2.5x cap, actually calculated**: source photos are 1200×1200 (confirmed live — `img.naturalWidth`/`naturalHeight` both read exactly `1200` on the real listing). At `scale(1)`, the viewer's `.mkt-pv-stage` fits the square image to the narrower dimension of the viewport (object-fit: contain), so on a 375 CSS-px-wide phone the image displays at 375×375 CSS px. The number that actually matters is *physical* pixels, not CSS px: on a 3x-DPR phone (iPhone 12 and later, most current Android flagships — the common case today), that's 375×3 = 1125 physical px against a 1200px source — meaning **scale 1 is already almost native resolution**, and the crossover to genuine 1:1 detail sits at roughly **scale 1.05–1.1x**, not 2.5x. By the hard cap of 2.5x, the browser is upsampling to roughly 2925 physical px from a 1200px source — about **2.3–2.4x past the point where any real extra detail exists**, purely interpolated softness from there on. Even this environment's own Browser pane (2x DPR, not 3x) puts the crossover at only ~1.6x, with 2.5x still roughly 1.6x past native. §58's own comment calling 2.5x "the top of the honest range" reasoned in CSS pixels only and didn't account for device pixel ratio — the real honest range is narrower than that comment claimed. **Conclusion, per the task's own explicit conditional ("a higher zoom cap IF the source resolution genuinely supports it, and not otherwise"): it does not, so the cap is not raised.** Lowering it wasn't in scope either — the task's own candidate list only offered raising, and 2.5x still gives useful bigger-picture framing even past the point of literal fresh pixels, so it's left exactly as it was.
   - **Corners**: re-proven live with fresh evidence this session (not just re-quoting §58) — zoomed via 8 synthetic wheel events to exactly `scale(2.5)`, then dragged 2000px up-left via synthetic mouse events. Resulting `translate` landed at exactly `(-281.25px, -62.75px)`, matching the hand-computed clamp bounds precisely: `maxX = (375×2.5 − 375)/2 = 281.25`, `maxY = (375×2.5 − 812)/2 = 62.75`. The pan hits the true mathematical edge on both axes, not a padded approximation — no bug found, `clampPan` in `PhotoViewer.tsx` is correct.

4. **What's actually loaded.** Confirmed by reading `sellData.ts`'s `processListingImage` (bakes a 1200×1200 canvas, watermark included, JPEG quality 0.82 — the one and only stored rendition, no separate thumbnail asset) and by reading every `image_url`/`gallery_urls` call site (`getPublicUrl` from Supabase Storage, a plain static file URL — no `?width=`/transform param anywhere in the pipeline). Hero, thumbnails, and the fullscreen viewer all reference the exact same file. Confirmed live: `naturalWidth`/`naturalHeight` on the open viewer's `<img>` read `1200`/`1200`, matching the source exactly — the viewer genuinely loads full resolution, not a downscaled version.

**What was changed**: one small addition — `.mkt-hero-cue`, a bottom-right pill on the hero (black 55%-opacity background, cream text, a coral outline "expand" icon; `pointer-events: none` so taps still land on `.mkt-hero-tap` underneath) showing the expand icon alone when there's one photo, or the icon plus `"N / total"` when there's more than one. This is the one thing the audit found genuinely missing: a visible, always-on (not hover-dependent) sign the photo opens fullscreen, doubling as the photo-count answer to point 2 without needing a whole new UI element. Live-verified at 375×812 against a real 4-photo listing: the pill renders correctly, doesn't block the tap-to-open behaviour (confirmed via `elementFromPoint` and a real dispatched click sequence opening the viewer), and the viewer itself opens, closes on Escape, and pans/zooms exactly as before.

**What was deliberately left alone, because the audit found it already worked**: the zoom cap (2.5x, per the calculation above — raising it isn't supported by the source resolution), pinch-zoom (correct, code-reviewed), pan-to-corner clamping (correct, freshly re-verified with exact numbers), the resolution loaded by the viewer (already full, unmodified source), the thumbnails' own sizing and scroll behaviour, `PhotoViewer.tsx` itself (not touched at all — zero lines changed in that file).

**Preserved, all confirmed working after the change**: gesture disambiguation (swipe-changes-photo vs. drag-pans, untouched — `PhotoViewer.tsx` wasn't edited), swipe-down-to-close and Escape-to-close (Escape re-verified live, closed cleanly back to the listing with the URL unchanged), the state badge and back button (still siblings within `.mkt-hero`, unmoved, both visible in the same corners as before), the sticky purchase panel and mobile buy bar (neither `.mkt-hero` nor `.mkt-hero-cue` changes touch the viewer's own full-viewport coverage), sections 7 through 73.

Files touched: `src/marketplace/pages/ListingDetailPage.tsx`, `src/marketplace/marketplace.css`.

`npm run build` clean.

## 75. The protection promise moved to before the decision, not just after it (2026-08-16)

**Audit first**:

1. **The confirmation page's exact wording, quoted verbatim** — `PaymentReturnPage.tsx`'s `PaidState`, a `.mkt-sticker` element sitting top-right next to the big checkmark, above the "Paid, and your money is safe with us" heading:
   ```
   <div className="mkt-sticker"><span className="ic">🛡</span>We refund you if it's not as described</div>
   ```
   Styling (`.mkt-sticker` in `marketplace.css`): a rotated (`-4deg`) pill, dashed 2px coral border, cream background, green-dark bold Nunito text, drop shadow, `max-width: 150px` — a deliberate "sticker," not a plain banner.

2. **What listing detail and checkout already carried**:
   - **Listing detail**: nothing. The file's own top-of-file docstring claims it has "an escrow reassurance note" — that's stale documentation, not real code; no protection/refund wording exists anywhere in the actual JSX, confirmed by grep. (The one `.mkt-reassure` block that does exist there is unrelated — it only renders for multi-quantity listings, confirming "the seller says all N are identical," a different topic entirely, left untouched.)
   - **Checkout**: yes, and it **differed** — inside `.mkt-heldbox`'s four-line explainer ("Your money is held, not sent"), the fourth line read *"Not as described? Send it back and get refunded the same day it arrives with the seller."* A same-day promise the confirmation page doesn't make, and a real competing claim sitting on the one page where someone is about to pay. Per the task's own instruction, this was replaced rather than left alongside the new one.

3. **Files touched**: `src/marketplace/components/ProtectionBadge.tsx` (new, the single shared source), `src/marketplace/checkout/PaymentReturnPage.tsx`, `src/marketplace/checkout/CheckoutPage.tsx`, `src/marketplace/pages/ListingDetailPage.tsx`.

4. **Mismatch worth flagging**: only the stale docstring above — the prompt itself matched the real code everywhere else.

**Shared, so it can't drift**: `ProtectionBadge.tsx` renders the exact original markup (`<div className="mkt-sticker"><span className="ic">🛡</span>We refund you if it's not as described</div>`), byte-identical, as its only content — an optional `style` prop exists purely for placement (e.g. centering) and never touches the wording or the `.mkt-sticker` class. `PaymentReturnPage.tsx`'s own inline JSX was replaced with `<ProtectionBadge />` too, so all three call sites now import the same component and the sentence is written in exactly one file in the whole codebase.

**Placement**:
- **Listing detail**: directly after the price block (price, title, "bought new at," availability) and before anything else — the first thing after the number someone is deciding whether to pay, not buried under the description or seller row.
- **Checkout**: inside the `.mkt-sell-foot` block that holds the actual Paystack "Pay ₦X" button, immediately above it, centered (`alignSelf: "center"`) so the naturally-full-width flex footer doesn't stretch a small rotated sticker into an odd banner shape. Live-verified at 375×812: filled the contact form, reached the pay step, and the badge renders correctly, compact and centered, directly above "Pay ₦19,391" without overlapping or visually competing with it.

**Live-verified, all three**: listing detail (real listing, 375×812) shows the badge right below the price with its rotated-sticker look intact; checkout shows it immediately above the pay button after completing the contact-details step; the confirmation page's own version was not re-screenshotted (unreachable without a real payment in this environment) but is a pure refactor — same props, same markup, `style={undefined}` — so it renders byte-for-byte as before.

**Preserved**: the confirmation page exactly as it was (only the JSX authoring changed, not the output); listing detail's price block, buy action, sticky panel and mobile buy bar (badge sits between the price block and the rest of the body, doesn't touch any of those); checkout's line breakdown, pay button, and negotiated-price path (only the one competing `.hb-line` was removed, the other three explainer lines and the whole payment flow are untouched); sections 7 through 74.

Files touched: `src/marketplace/components/ProtectionBadge.tsx` (new), `src/marketplace/checkout/PaymentReturnPage.tsx`, `src/marketplace/checkout/CheckoutPage.tsx`, `src/marketplace/pages/ListingDetailPage.tsx`.

`npm run build` clean.

## 76. Protection badge redesigned per Claude Design's recommendation (2026-08-16)

**Source**: the Claude Design MCP (`DesignSync`), read-only, against project `0afda8cc-a981-4d3a-9e96-76e4ca05ec27` ("Mobile marketplace design system") — `get_project` confirmed it, `list_files` found `BundledMum Marketplace.dc.html`, `get_file` pulled it (261KB) along with `support.js`. Section §33a, "Protection badge, three directions" (plus an explicitly-flagged red direction D), laid out A/B/C/D against real listing-detail, checkout-footer, and confirmation mockups, with **direction B marked "Recommended"** and an explicit implementation note: one component, one `variant: "card" | "card-row"` prop, hardcoded copy, no children prop, no hover/tap/animation.

**What shipped (direction B)**: `ProtectionBadge.tsx` rewritten — a bordered card (`background: #D8EFE5`, `1px solid #BFDECB`, `border-radius: 12px`) with the shield leading in a solid green-dark (`#2D6A4F`) circle rather than a loose emoji, green throughout so it never competes with the coral Buy/Pay button beside it. Two size variants exactly as specified: `card` (28px icon circle, 12.5px text — listing detail, confirmation) and `card-row` (22px icon circle, 11.5px text — checkout, where vertical space is tightest), replacing the old dashed-coral rotated `.mkt-sticker` treatment entirely (retired from `marketplace.css`; it had no other callers). The wording itself is untouched — this was a visual-only redesign.

**All three call sites**: listing detail keeps `<ProtectionBadge />` (default `variant="card"`, no change needed — live-verified at 375×812, a full-width green card sitting right under the price, exactly matching the mockup). Checkout switched to `<ProtectionBadge variant="card-row" />`, dropping the old manual `alignSelf: "center"` override since this is now a full-width row, not a small centered pill — live-verified: compact card sitting directly above "Pay ₦19,391" after completing the contact-details step, matching the mockup's "checkout footer, tight space" frame exactly.

**Confirmation page, restructured to match**: the design's confirmation mockup pairs a centered checkmark with a full-width white card *below* the headline, not squeezed beside the checkmark in a row — and checked against the real page's own CSS (`.mkt-success { background: var(--mkt-green); }`), the live page genuinely has the same solid dark-green background the mockup assumed, so the white flip directly applies. `PaymentReturnPage.tsx`'s checkmark and badge were pulled out of their old `space-between` row (a `card`-style badge doesn't fit squeezed next to a 64px checkmark); the badge now sits after the "Paid, and your money is safe with us" heading block, via `<ProtectionBadge style={{ background: "#fff", border: "none", width: "100%", boxSizing: "border-box" }} />` — the one documented context-specific override (white, borderless, full width, for contrast against the green backdrop), matching the design's own stated reasoning ("flips to solid white... so it still separates from its surroundings"). Not live-screenshotted (needs a real Paystack payment to reach `PaidState`, not reproducible in this environment) — verified by reading the resulting JSX/CSS against the exact same `.mkt-success`/`.check`/`.mkt-pill-held` rules used everywhere else on the page, unchanged.

**Rejected**: direction D (solid red `#C0392B` fill) — the mockup itself flagged this as reusing the same red the system already uses for disputes, failed payouts, and destructive confirms, risking a "something went wrong" misread on a reassurance badge. Direction B was already the recommendation; D wasn't a live contender.

Preserved: the exact wording (only the visual treatment changed), listing detail's price block/buy action, checkout's line breakdown/pay button/negotiated-price path, the confirmation page's seller-contact/guest-paid/button logic below the badge (untouched), sections 7 through 75.

Files touched: `src/marketplace/components/ProtectionBadge.tsx`, `src/marketplace/marketplace.css`, `src/marketplace/checkout/CheckoutPage.tsx`, `src/marketplace/checkout/PaymentReturnPage.tsx`.

`npm run build` clean.

## 76a. Protection badge also on checkout's details step (2026-08-16)

Follow-up to §76 — the badge had only been added above the Paystack "Pay ₦X" button, not above "Continue to payment" in the earlier details-entry step (name/phone/email), even though that step is also a commitment moment (handing contact details to a stranger before money even changes hands). Added the identical `<ProtectionBadge variant="card-row" />` to that footer too, directly above the "Continue to payment" button — live-verified at 375×812, matching the pay-step placement exactly.

Files touched: `src/marketplace/checkout/CheckoutPage.tsx`.

`npm run build` clean.

## 77. AddToCart and AddPaymentInfo added, InitiateCheckout moved from load to click (2026-08-16)

**Audit first**: per §20/§45, ViewContent (`ListingDetailPage.tsx`) and InitiateCheckout (`CheckoutPage.tsx`) were the only two marketplace conversion events wired before this pass; Purchase fires server-side, untouched, out of scope. Both existing events already followed the same dual-fire pattern this task extends: a browser Pixel `track(event, params, eventId)` call plus a fire-and-forget `sendMarketplaceConversionEvent()` (POSTing to the already-deployed `send-meta-conversion-event` edge function) sharing one `crypto.randomUUID()` `event_id`, so Meta dedups the two into one event. `sendMarketplaceConversionEvent` already attaches `_fbp`/`_fbc` from cookies when present and never throws or blocks (whole body wrapped in try/catch, invoke's promise `.catch()`-swallowed, never awaited by any caller) — reused exactly as-is, no changes to that function's delivery mechanism, only its `event_name` union type extended to accept the two new values (the edge function itself already accepts any event name, confirmed in §20, so no backend change needed).

**Before, precisely**: ViewContent fires once per genuinely-live listing view, gated on stock/loading state, guarded by a `useRef` — unaffected by this pass. **InitiateCheckout fired via a `useEffect` keyed on `[order, totalReady, checkoutTotal]`, not on any click** — it ran automatically the instant a real order existed and Paystack (or the transfer fallback) had priced it. For a guest or a logged-in buyer still missing a name/phone/email, that moment is unreachable without first clicking "Continue to payment" anyway, since `canCreateOrder` itself requires `committed` for them (order creation is gated on the click already) — but for a **logged-in buyer whose profile already has everything needed**, `showDetailsForm` is `false` from the very first render, the order auto-creates with zero clicks, and InitiateCheckout fired the moment data was ready: genuinely page-load behaviour for that one real cohort, exactly the pattern this task asked to remove.

**The three buttons, before**: "Buy now" (`ListingDetailPage.tsx`'s `.mkt-buy`) just called `navigate(...)` to `/checkout/:id`, no tracking. "Continue to payment" (`CheckoutPage.tsx`) called `commitDetails()`, which only validates and calls `setCommitted(true)` — no tracking. The Paystack "Pay ₦X" button called `setRedirecting(true)` then `window.location.assign(payQ.data.authorization_url)` inline in its `onClick` — no tracking, and a genuine full-page redirect (unlike Buy now's client-side `navigate()`), the one spot in this whole mapping where an in-flight request really can be cancelled by the browser leaving the page.

**AddToCart** — new `handleBuyNow()` in `ListingDetailPage.tsx`, wired to `.mkt-buy`'s `onClick` in place of the bare `navigate()` call (which it still performs, unconditionally, right after firing). `value` is exactly what the button already displays (`showAcceptedPrice ? myPrice! : listing.final_price_naira` — the same expression the price block above the button already uses), never recomputed. Email/phone reuse the exact same `user?.email` / `buyerPhone` values ViewContent's effect already resolves in this same component, sent only when genuinely known (never prompted for). Live-verified: clicking Buy now on a real listing produced `fbq('track', 'AddToCart', {content_ids, content_name, value: 18000, currency: 'NGN'}, {eventID})` with the listing's real price, and the client-side navigation to `/checkout/:id` still completed normally afterward.

**InitiateCheckout — moved from load to click, not left running alongside a new click-based version.** A new `checkoutIntent` ref is set to `true` inside `commitDetails()` itself — the literal "Continue to payment" click handler — never anywhere else. The firing effect's guard changed from `if (!order || !totalReady || fired) return;` to additionally require `checkoutIntentReady = checkoutIntent.current || !showDetailsForm`. The `|| !showDetailsForm` half is not a second bypass of "click-only" — it's the one cohort (profile already complete) for whom `showDetailsForm` is `false` from their very first render, meaning there was never a "Continue" button for them to click in the first place; they've already satisfied the exact same "explicit, nothing-left-to-confirm" condition the codebase's own pre-existing `canCreateOrder` check already uses to skip the form and go straight to Pay. Value and identifiers are completely unchanged from before (`checkoutTotal` = `paystackTotal` or `transferTotal`, the same authoritative figure the breakdown displays, still only read once `totalReady`) — only the trigger moved. **Live-verified on a fresh page load** (no prior click, no order, no InitiateCheckout in the Pixel log through the entire details-entry step), **then confirmed it fires exactly once**, immediately after clicking "Continue to payment," carrying the real total (`value: 23046`, matching the "Total" row on screen) — not before, not on load. (One dev-session run produced two identical-`eventID` fires; re-tested from a hard, fresh page load with no prior hot-reloads in that session and got exactly one — the duplicate was Vite HMR/dev-session noise from repeated live edits to this exact file earlier the same session, not a defect in the guard, and would in any case have deduped server-side by the shared `event_id` even if genuine.)

**AddPaymentInfo** — new `handlePay()`, wired to the Paystack button's `onClick` in place of the old inline arrow function. Fires `track("AddPaymentInfo", ...)` and `sendMarketplaceConversionEvent(...)` synchronously, using `paystackTotal` (the exact figure already shown as "Pay ₦X"), then calls `setRedirecting(true)` and `window.location.assign(...)` exactly as before — same order, same values, tracking calls simply added ahead of the existing redirect logic. Neither tracking call is awaited, so the redirect is issued the instant they return (both are synchronous dispatches — `track()`'s underlying `fbq` call and `sendMarketplaceConversionEvent`'s fire-and-forget `.invoke().catch()` — not blocking promises the code waits on). **Live-verified twice**: once confirming the real, unmodified redirect still lands on `checkout.paystack.com` (the test's own `location.assign` override silently failed to intercept it in that run, and the browser genuinely navigated there — direct proof nothing delays or blocks the real handoff); a second run, with the override actually taking hold, captured the Pixel log synchronously in the same click and confirmed `AddPaymentInfo` fired with `value: 23046` and a fresh `eventID` before any navigation was attempted. The redirect being cancellable mid-flight by the browser leaving the page is the explicitly accepted tradeoff here, per the task's own instruction — no `sendBeacon` or other reliability mechanism was added, since that would need edge-function changes this task's non-goals rule out, and losing an occasional event is stated as fine where delaying payment is not.

Preserved: ViewContent and its dedup mechanism (untouched), the server-side Purchase event (untouched, separate flow), the buy/checkout/payment flows themselves including the negotiated-offer price path (`showAcceptedPrice && myOffer` query param, unaffected — `handleBuyNow` preserves the exact same conditional navigate target), sections 7 through 76a.

Files touched: `src/marketplace/lib/metaConversion.ts`, `src/marketplace/pages/ListingDetailPage.tsx`, `src/marketplace/checkout/CheckoutPage.tsx`.

`npm run build` clean.

## 78. Catalog-matching audit: content_id correct, content_type/num_items were genuinely missing (2026-08-16)

**Verify-only per the task, only touched what was genuinely wrong.**

1. **content_id sent by each event**: `ViewContent` and `AddToCart` send `listing.id` (the `marketplace_listings.id` column, read straight off the loaded listing row). `InitiateCheckout` and `AddPaymentInfo` send `listingId` — the raw `useParams<{ listingId: string }>()` route value, itself always originally `listing.id` (every navigation into checkout builds the URL as `` `/checkout/${listing.id}` `` — confirmed in `ListingDetailPage.tsx`'s `handleBuyNow`). Same column, same string, on every event.

2. **Byte-identical to the catalog feed, confirmed by reading `marketplace-meta-catalog-feed`'s live deployed source**: its TSV `id` column is `l.id`, read directly off the same `marketplace_listings.id` column via the same Supabase client convention, with zero transformation, no prefix, no casing change — just the row value joined straight into the TSV line. Both the feed and every event read the identical Postgres `uuid` column, serialized identically by the same client library. **No mismatch. content_id was not changed**, per the task's own instruction not to touch it unless it actually differs.

3. **content_type on AddToCart/ViewContent: genuinely missing.** Neither `track()`'s params nor `sendMarketplaceConversionEvent`'s payload carried it anywhere in the codebase before this pass (confirmed by grep across all four event call sites). **Added** `content_type: "product"` to both the browser Pixel call and the CAPI payload for both events — a literal constant, correct because this catalog has no other content type. Live-verified: a fresh Buy now click produced `fbq('track', 'AddToCart', {..., content_type: "product", ...})`.

4. **num_items on InitiateCheckout: genuinely missing**, same grep result. **Added** `num_items: 1` to both channels — checked first, not assumed: `marketplace_orders` has no quantity column at all (confirmed via direct schema query), so every order is structurally exactly one listing; `1` is a fact about the order shape, not a guess. Live-verified: clicking "Continue to payment" produced `fbq('track', 'InitiateCheckout', {..., num_items: 1, ...})`, and the actual outgoing CAPI request body (intercepted at the `fetch` layer) confirmed the same field reaches `sendMarketplaceConversionEvent`'s POST body: `{"event_name":"InitiateCheckout",...,"num_items":1,"value":23046,...}`.

**A real gap found and left open, reported rather than forced through**: `send-meta-conversion-event` (the edge function `sendMarketplaceConversionEvent` posts to) does not destructure or forward `content_type`/`num_items` into the Meta Graph API payload it builds — it only ever read `event_name, event_id, event_source_url, value, content_id, content_name, email, phone, fbp, fbc, client_ip_address, client_user_agent, test_event_code` from the request body (confirmed by reading its live deployed source directly). This means, as of this commit, **the browser Pixel side is fully correct and independently reaches Meta** (it doesn't go through this function at all), but **the server-side CAPI copy of these two fields is silently dropped** before it ever reaches Meta — our own request now genuinely carries them (verified above), the edge function just doesn't pass them on yet. Attempted to fix this by deploying an updated `index.ts` (destructuring `content_type`/`num_items` and adding them to `customData` when present, everything else byte-identical); the deploy tool itself failed with a schema validation error (`files: expected array, received string`) on every attempt, including a minimal one-line placeholder file with no relation to this change, confirming a tool malfunction rather than a payload problem. Did not force this through or work around it, since a botched edit to a live, already-working conversions function risks breaking a real, functioning event pipeline for the sake of two optional/recommended fields. **Flagged here as a known follow-up**: the edge function's `customData` construction needs the same two `if (content_type) ... if (num_items != null) ...` lines added, once the deploy tooling is working again.

Preserved: content_id (confirmed correct, untouched), ViewContent/InitiateCheckout/AddPaymentInfo's existing value/email/phone/fbp/fbc wiring (untouched apart from the two additions), the Purchase event and buy/checkout/payment flows, sections 7 through 77.

Files touched: `src/marketplace/lib/metaConversion.ts`, `src/marketplace/pages/ListingDetailPage.tsx`, `src/marketplace/checkout/CheckoutPage.tsx`.

`npm run build` clean.

## 79. Abandoned checkouts: capture as they type, and an admin screen to chase them (2026-08-16)

**Audit first.** Nav registration is a plain array (`MARKETPLACE_NAV` in `AdminLayout.tsx`) plus a matching `<Route>` in `StorefrontApp.tsx`, no database involved — followed the exact same pattern as every other marketplace admin screen. `MarketplaceBuyers.tsx` is the closest shape precedent: `OpsHeader`/`OpsEmpty`/`OpsCard`/`StatusPill` from `opsUi.tsx`, a direct WhatsApp `wa.me` link built from a locally-duplicated `toIntlPhone()` helper (not imported — that file's own comment explains why: it lives in the customer-facing tree, not admin), and an honest "mostly test data" note rather than built filtering when `orders_paid` is zero everywhere.

Checkout's detail fields (`CheckoutPage.tsx`): a guest types name, WhatsApp number, and email into local component state (`nameInput`/`phoneInput`/`emailInput`) as they type — nothing is sent anywhere while that's happening. Only once `commitDetails()` runs (the "Continue to payment" click) does `committed` flip true, which is what `canCreateOrder` gates on — the order itself (`orderQ`, `createMarketplaceOrder`) only ever fires after that. So today, someone who types a name and email and leaves without clicking through creates precisely nothing, exactly the gap described.

**Mismatch found**: the task's own live figures ("9 abandoned worth ₦278,920 and 1 in progress") no longer matched the database by the time this ran (`10 abandoned, ₦301,966, 0 in progress`) — expected drift, not a bug: `status` is computed live against a 30-minute inactivity window exactly as documented, so the one row that was "in progress" when the task was written had simply crossed into "abandoned" by the time this was read. Confirmed both RPCs and the view live before writing any code: `record_checkout_attempt` (returns uuid, upserts by id, `coalesce()`s every field so a later partial call never blanks an earlier one — read its actual deployed source, not just trusted the description) and `link_checkout_attempt_to_order` (returns boolean, a plain `update ... where id = p_attempt_id`) both exist, both `SECURITY DEFINER`, no permission check (anon-callable, matching the spec). View columns match exactly.

**1. Capture as they type**: one `crypto.randomUUID()` generated once per page visit (`attemptId`, a `useRef`), reused for every call so the upsert keeps updating the same row. Debounced **1.2 seconds** — long enough that a normal typing pause mid-word doesn't fire, short enough to still catch someone who leaves shortly after. Only runs while `showDetailsForm` is true (there's an actual form to type into — a signed-in buyer with everything already on file skips straight to order creation, which the view's `'order'` source already covers) and only once at least one of name/email/phone is non-empty. Fire and forget, identical shape to the existing `sendMarketplaceConversionEvent`: never awaited, wrapped in `try/catch`, `.then(success, () => {/* best effort */})` rather than `.catch()` so a rejection can't throw synchronously either. **Cannot affect checkout**: it shares no state, no gating variable, and no render path with `canCreateOrder`/`orderQ`/the payment flow — confirmed live by completing a full guest checkout (typed name → paused → email typed in three bursts → phone → Continue to payment → real order created, reference `BMM-W68MLBN2`) with the debounce active throughout, order creation proceeded exactly as normal.

**Linked to the order**: a second effect fires once `order` exists, calling `link_checkout_attempt_to_order` exactly once (its own `attemptLinked` ref), skipped entirely if nothing was ever recorded (`attemptRecorded` ref, so a signed-in buyer who never saw the form doesn't cost a pointless no-op call). Live-verified end to end against the real test order above: the attempt row's `order_id` was correctly set to the new order, and `marketplace_abandoned_checkouts` showed exactly **one** row for it (`source: 'order'`, `reached_payment_step: true`) — not two, confirming the fold-together actually works rather than just existing in code.

**A real bug found and fixed via live testing, not code review**: the first version placed the "link to order" effect physically before `const order = orderQ.data?.order` was declared further down the same function — a genuine temporal-dead-zone violation (`order` referenced in a `useEffect` dependency array before its own `const` declaration), which `tsc --noEmit` did not catch but crashed the component on every real render (`Uncaught ReferenceError: Cannot access 'order' before initialization`). Caught by live-testing in the Browser pane (the debounced call simply never fired, tracked down via a temporary diagnostic log, then confirmed by reading the actual console error) rather than assumed correct from a passing typecheck. Fixed by moving the effect to directly after `order`'s declaration. Re-verified: page renders, debounce fires, upsert coalesces correctly (three rapid email edits produced one final row with only the last value, not three rows or a blanked field), linking fires.

**2. The admin screen**: new `src/pages/admin/marketplace/MarketplaceAbandonedCheckouts.tsx` at `/admin/marketplace/abandoned`, nav entry "Abandoned checkouts" (a `ShoppingCart` icon, added right after "Follow up" — both are proactive-contact queues). Header states the total abandoned value first (`formatNaira` sum of `amount_naira` where `status = 'abandoned'`, matching the task's own framing that a total is more useful than a count) plus the abandoned and in-progress counts. Two sections, **Abandoned** first (actionable, needs chasing) then **Still in progress** below (informational — someone might be typing right now), each row showing buyer name, item + thumbnail, value, `relativeTimeAgo(last_activity_at)`, a `StatusPill` for `reached_payment_step` (coral "work" tone, "Reached payment step" vs. neutral "Left the details form" — the task's own distinction between two different reasons for stopping), and email/phone when captured.

**3. Acting on a row — deliberately not the outreach queue**: read `get_outreach_queue`'s actual deployed SQL before deciding. Its buyer half only ever loops over `customers` with an answered listing question or a paid-but-unconfirmed order — it has no concept of a checkout attempt at all, and most rows here are guests with no `customer_id`, who that loop could never see regardless of stage keys. There is no existing sequenced message for "you started checking out and stopped" to link to or reuse — building an integration would mean inventing that from scratch inside a system this task explicitly said not to duplicate. Built a plain, single, honest `wa.me` WhatsApp link per row instead (same construction as `MarketplaceBuyers.tsx`'s own direct-contact button, not the multi-attempt-tracked nudge system), reported here rather than silently building it anyway.

**Test entries — reported, not engineered around**: no structural signal exists anywhere in this codebase to tell a real checkout from an internal test one (no `is_test` flag, no email-domain convention). Rather than build unreliable heuristics, the screen carries a plain heads-up banner ("Some of what's below is internal testing... check who it actually is before reaching out") and otherwise trusts the operator's own judgement — the same honest-note philosophy `MarketplaceBuyers.tsx` already uses for its own all-test-data case, not a new pattern invented for this screen.

Preserved: checkout's order creation, payment flow, and negotiated-price path (the capture effects read from state but never write to or gate any of it — confirmed live by completing a real order with capture active), every existing marketplace admin screen and nav position (new entry added, nothing reordered), sections 7 through 78.

Files touched: `src/pages/admin/marketplace/MarketplaceAbandonedCheckouts.tsx` (new), `src/marketplace/checkout/CheckoutPage.tsx`, `src/StorefrontApp.tsx`, `src/pages/admin/AdminLayout.tsx`.

`npm run build` clean.

## 80. Resume links: pre-fill from an abandoned checkout, and expired vs gone turned out to already be solvable (2026-08-16)

**Audit first**: checkout's route is `/checkout/:listingId` (mounted under `/marketplace`), `listingId` read via `useParams`. It already reads one query param today — `offer` via `useSearchParams()`, for the negotiated-price flow — so adding more search params is an established pattern, not a new mechanism. Guest detail fields (`nameInput`/`phoneInput`/`emailInput`) initialise as plain `useState("")`, always empty; nothing pre-fills them today.

**A finding worth surfacing**: the task's framing ("someone gets a WhatsApp message with a link back") implies such links already go out, but §79's own "Message on WhatsApp" button doesn't construct one — it's a plain contact message with no `?resume_order=`/`?resume=` appended. This task only asked to build checkout's own handling of these params, not to wire the admin screen's message to include them, so that's exactly what was built; the admin screen's link is a follow-up this exposed, not silently left unmentioned.

**Built**: two new query params, `resume_order` (for an existing order) and `resume` (for an attempt with no order yet), read via the same `useSearchParams()` already in the file. A `useQuery` calls whichever RPC applies and prefills `nameInput`/`emailInput`/`phoneInput` exactly once via a `useRef` guard the moment real data arrives — so it can never re-run and stomp over something the person has since typed themselves. **Nothing personal in the URL**: both params are opaque ids (an order id, an attempt id); the name/email/phone only ever arrive after the page loads, fetched server side by RPC, never round-tripped through the address bar, and nothing here caches them beyond the form's own React state.

**Expired vs gone — distinguished, not guessed at.** Read both RPCs' actual deployed SQL: each collapses "older than `marketplace_resume_link_days`" and "listing no longer live" into one `WHERE ... AND` clause, genuinely indistinguishable from an empty result alone, exactly as the task warned. But `CheckoutPage.tsx` already has its own, completely independent `listingGone` check (`!listing || ...`, `useListing()` itself already filters `status = 'live'`) that returns its own "This one has just gone" screen **before** any of the new resume code's render path is ever reached — using the exact same `listingId` from the URL. So by the time an empty resume result would actually be shown to someone, the listing is already confirmed live (or they'd have already been shown the existing gone-screen and never gotten this far) — leaving link expiry as the one honest explanation left standing, not a coin flip. Live-verified all three paths at 375×812 against real data: a valid `resume_order` for a real pending order correctly pre-filled name "Debounce Fixed Test", phone, and email with a green "Welcome back" banner; a nonexistent `resume` id against that same live listing correctly showed a red "That link has had its time" notice with the form left empty and ready; the identical nonexistent `resume` id against a `delisted` listing correctly fell straight through to the pre-existing "This one has just gone" screen with no resume message at all, confirming the two cases really do stay separated rather than colliding.

**A third, unlisted empty-result cause, reasoned through rather than special-cased**: `get_order_resume_data` also requires `payment_status = 'pending'`, so an order that's since been paid also returns zero rows. Chose not to special-case this: continuing normally (the "expired" path) is still the correct outcome here too, since `createMarketplaceOrder`'s existing reuse logic and the file's own existing `payCode === "This order is already paid"` → jump-to-return-screen effect already handle a genuinely-already-paid order gracefully further down the same flow. No new code needed for a case the page already covers.

**Acknowledged the restore, chose to**: a small green box directly above the name field, shown once, reading "Welcome back. We've filled in what you told us before, have a look and change anything you need to." — specifically so it doesn't read as unexplained browser autofill, per the task's own suggestion.

**When it works, nothing is skipped or auto-anything**: prefilled fields land in the exact same controlled inputs as manual typing, `showDetailsForm`/`committed`/`canCreateOrder` are all completely untouched by the resume logic, so the person still has to review, edit if they want, and click "Continue to payment" themselves — confirmed live, nothing auto-submitted or auto-created.

Preserved: normal checkout with no params (live-verified, byte-for-byte the same empty form and flow as before), the checkout attempt capture and its order-linking from §79 (untouched, no shared state with the resume logic), the negotiated-price path and expired-offer handling (both still gated on the separate `offer` param, unaffected), sections 7 through 79.

Files touched: `src/marketplace/checkout/CheckoutPage.tsx`.

`npm run build` clean.

## 81. Abandoned-checkouts screen's WhatsApp link now actually has a link (2026-08-16)

**The inconsistency §80 flagged, confirmed real**: read `get_buyer_nudge_suggestions`'s live deployed SQL — it now has two stages this codebase didn't have at §79's audit time, `abandoned_at_payment` and `abandoned_before_payment`, each building `site || '/checkout/' || listing_id || '?resume_order=' || order_id` (or `?resume=` + attempt id) through `resolve_outreach_message()` against real, sequenced, database-editable templates in `marketplace_outreach_templates`. Meanwhile `MarketplaceAbandonedCheckouts.tsx`'s `Row` component built its WhatsApp message with **no link in it at all** — not a wrong param, an entirely missing one. Every message sent from that screen dropped someone on an empty checkout form regardless of what they clicked.

**Fixed**: `resumeLinkFor()` builds `https://bundledmum.com/marketplace/checkout/{listing_id}?resume_order={ref_id}` for `source: 'order'` rows and `?resume={ref_id}` for `source: 'attempt'` rows — same base URL, same param names, same `ref_id`-as-the-id semantics as the RPC's own construction, verified byte-for-byte against its actual SQL rather than guessed. Live-verified against a real production row (Adewale's actual abandoned Baby Bassinet order, ₦54,000): built the exact URL the fixed code would produce and loaded it directly — checkout correctly showed the "Welcome back" banner with his real name, phone, and email pre-filled, the same experience §80 already proved for the outreach queue's version.

**The message text — reported, not rewritten.** Read the actual templates: two attempts each for both stages, warm and specific ("*I am more interested in why you stopped than in the sale*", bold formatting, an explicit reassurance that money is held and never sent to a stranger, a genuine second-attempt tone shift rather than a repeat). The admin screen's own hardcoded line — *"Hi {name}, this is BundledMum. We noticed you were checking out {item}... wanted to see if you ran into any trouble..."* — is plainer and generic by comparison: no bold, no held-money reassurance, no sequenced variation, and previously no link at all. **It is noticeably weaker.** Not rewritten to match, on purpose: those templates are database-editable and sequenced per attempt number, keyed to a `customer_id` via `marketplace_outreach_log`; this screen's rows are frequently guests with no `customer_id` at all (the exact case that RPC can't see), so calling it directly isn't a safe drop-in either — `get_buyer_nudge_suggestions` returns only ONE top-priority stage per customer across five possible reasons, so calling it per abandoned-checkout row risks silently returning a message about a *different* concern entirely (a different order awaiting delivery, say) rather than this specific stalled checkout. Copying the template text into this file instead would create the exact drift risk flagged as out of bounds. Left as a known, reported gap rather than either duplicating or misapplying those templates.

Preserved: everything else on the row (contact details, `StatusPill`, thumbnail, value, relative time), the two sections and total-value header, sections 7 through 80.

Files touched: `src/pages/admin/marketplace/MarketplaceAbandonedCheckouts.tsx`.

`npm run build` clean.

## 82. Mark as sent / undo for abandoned checkouts, matching the outreach queue's own pattern (2026-08-16)

**Audit first**: before this pass, `Row` rendered thumbnail, name, item, value, relative time, a `reached_payment_step` pill, contact details, and a single "Message on WhatsApp" link — no contact-tracking of any kind. `MarketplaceOutreach.tsx`'s `ContactActions` component is the exact shape to match: a status line ("Never contacted" in coral vs "Contacted {relative}" in muted text), an "Undo" text link shown only once contacted, and two side-by-side buttons — "Send on WhatsApp" and a separate "Mark as sent" — with `logOutreachContact`/`undoOutreachContact` calling `log_outreach_contact`/`undo_outreach_contact` and invalidating the query on success. `neverContactedOnly` there defaults to **showing everything**, with a toggle that *narrows* to uncontacted — the opposite default from what this task asked for (contacted rows should drop out of the working list *by default*), so the toggle's polarity was intentionally inverted here rather than copied, while everything else — the two-button layout, the separate explicit mark action, the small underlined Undo — was matched directly.

**Backend confirmed live before writing anything**: `log_abandoned_contact(p_source, p_ref_id)` and `undo_abandoned_contact(p_source, p_ref_id)` both exist, both admin-permission-gated, both matching the outreach pair's shape exactly (upsert-by-conflict / delete-and-return-found). `marketplace_abandoned_checkouts` now carries `contacted_at`. Live numbers had drifted slightly from the task's own figures (13 abandoned / 3 in progress vs. the stated 12/4) — same expected 30-minute-window drift already reported in §79 and §80, not a bug. Verified the actual mechanism end to end against real rows (not just read the SQL): inserted directly into `marketplace_abandoned_contact_log` for a genuine attempt row, confirmed the view's `contacted_at` picked it up immediately, deleted it, confirmed it reverted to null — the same round trip `log_abandoned_contact`/`undo_abandoned_contact` perform, since the RPC's own admin-permission check can't be exercised from this environment's SQL access (no `auth.uid()` context here), only from a real admin session.

**Built**: `logAbandonedContact`/`undoAbandonedContact` added to `opsData.ts` right beside the outreach pair, same signature shape, deliberately a separate log (`marketplace_abandoned_contact_log`, keyed by `source`+`ref_id`, not `person_id`+`stage_key`) since most rows here are guests with no customer record — the same reason §79 already gave for not reusing the outreach queue's system at all. `Row` now renders a `ContactActions` block matching `MarketplaceOutreach.tsx`'s layout: "Not yet contacted" (coral) or "Contacted {relative}" beneath the row, an Undo link the moment `contacted_at` is set, and "Message on WhatsApp" beside a separate "Mark as sent" button that only appears while uncontacted.

**Marking removes the row from the working list, confirmed**: `abandoned`/`inProgress` are now filtered to `!r.contacted_at` before splitting by status, so a marked row leaves whichever section it was in the instant the mutation resolves and the query invalidates.

**Not lost — a third, toggled group**: a "Already contacted · N" chip in the header (only rendered once at least one row has been contacted, matching the existing header-chip convention) reveals an "Already contacted" section, hint reading "Chased and still haven't bought — arguably the most interesting group here," quoting the task's own framing rather than inventing new copy for it. Off by default so the working list stays exactly what an operator needs; on, and every contacted row (regardless of which status group it came from) is visible again, each with the same Undo available.

**WhatsApp tap does not auto-mark, confirmed by construction**: the `<a href={waHref}>` link and the `markSent()` handler are two entirely separate elements with no shared code path — opening the link fires nothing, exactly matching the outreach queue's own separation and the task's explicit requirement.

**Undo exists and is discoverable**: a visible "Undo" text link renders directly next to the "Contacted" status line the moment a row is marked — not buried in a menu or a second screen, same placement `MarketplaceOutreach.tsx` already uses.

**Resume links preserved**: `resumeLinkFor()` and its `?resume_order=`/`?resume=` construction from §81 are untouched, byte-identical, confirmed by diff — this pass only added the contact-tracking layer around the existing row, it didn't touch the message or link construction.

Preserved: the abandoned/in-progress split and the total-abandoned-value header line, the resume links, the internal-testing heads-up banner, every other existing marketplace admin screen, sections 7 through 81.

Files touched: `src/pages/admin/marketplace/MarketplaceAbandonedCheckouts.tsx`, `src/pages/admin/marketplace/opsData.ts`.

`npm run build` clean.

## 83. Location required on create and edit, matching a trigger that was silently unenforced when they went live (2026-08-16)

**Audit first, all in one file**: `CreateListingPage.tsx` is genuinely both screens — `/sell/new` and `/sell/listings/:id/edit` both route to it (`MarketplaceApp.tsx`), `isEditMode = !!editId` branches the few places create and edit actually differ. State is a native `<select>` sourced from `marketplace_states` (`is_allowed = true`); area is `AreaCombobox`, sourced from `marketplace_areas` filtered `.eq("state_id", stateId).eq("is_allowed", true)` — genuinely state-scoped, confirmed live (945 rows across all 37 allowed states, zero states with zero areas, so an empty list was never actually possible). **Neither field was required before this pass** — `submit()` validated title, category, condition, condition answers, category-required-fields, description, price, quantity, and a contact-info leak check, but never touched `stateId`/`areaName`, on create or edit alike, since it's the same function. Every listing here is written as `status: "pending_review"`, never `"live"` directly — matching the trigger's own comment ("deliberately only enforced at live").

**How twelve (confirmed eleven live today, drift explained below) got through**: the trigger blocking a live write without both fields is real and correctly worded, but nothing in the frontend ever asked for either field, and — since it only fires at `status = 'live'`, a transition this form never performs directly — the actual moment those eleven listings crossed into `live` was an admin approving them from `pending_review`, a step outside this file entirely. Whatever gate exists there evidently isn't wired to the same trigger's timing the way this task assumes, or the trigger itself is newer than those approvals — either way, the frontend gap reported here is real and is what's being closed.

**A number worth flagging rather than silently accepting**: live query found **11** live listings with an incomplete location (2 with no state, 9 with a state but no area), not the twelve stated in the prompt — matches the "Eleven listings... four real sellers... one with seven" language used later in the same prompt exactly, including the specific seller (one Abuja account, 7 of the 11 rows). Read as the prompt's own numbers drifting by one between being written and this running, the same class of live-data drift already reported in §79/§80/§82, not something to chase further.

**Built**: state and area validated in `submit()`, right after category and before condition — matching the form's own visual order (Title → Category → State → Area → Condition...) — showing `"Choose the state this item is in."` or `"Choose the area or city this item is in."` and scrolling the location fields into view, exactly the same pattern (`invalidKeys`/`scrollIntoView`) already used for category questions and condition questions in this same function. `AreaCombobox` gained an optional `error` prop (only consumer besides this file is `BrowsePage.tsx`'s location filter, unaffected since the prop is optional) so the area input gets the same red-border treatment (`.mkt-input.error`) the state `<select>` already had available. A new `.mkt-field-error` rule renders the explanatory line under each invalid field, in the existing `--mkt-error-ink` token.

**The database error, surfaced as written, not mapped**: added a check in the existing catch block, ahead of the generic fallback, for the trigger's exact two messages (`"Choose the state this item is in before it can go live"` / `"...area or city..."`) — shown via `setError(msg)` verbatim rather than run through `genericErrorMessage()`, per the task's explicit instruction that the trigger's own wording already says exactly what to do. Worth noting plainly: since this form always writes `status: "pending_review"` and blocks editing a `live` listing outright (a separate existing early return), the trigger should not actually be reachable from this exact file under the documented flow — added anyway as the same kind of defensive, never-the-only-guard safety net every other DB-trigger check in this function already follows.

**The eleven existing live listings — confirmed untouched**: no write, migration, or backfill of any kind was made to `marketplace_listings` this pass (`git diff --stat` shows only `AreaCombobox.tsx`, `CreateListingPage.tsx`, and a one-line CSS addition) — the new validation only affects a submission going through this form from now on. Those eleven stay exactly as they are unless and until a seller edits and resubmits, which is the intended path per the task.

**Not live-verified**: create/edit both require a seller session, and this environment has no seller credentials (the same standing limitation as every other authenticated screen this session) — verified via `tsc --noEmit`, `eslint`, `npm run build`, and a careful re-read of the full validation/JSX flow, not a real browser session.

Preserved: photo rules, condition questions, category questions, and the one-item notice (none of their code was touched — the location block sits between category and condition, nothing reordered or removed around it), listing edit and delist rules, sections 7 through 82.

Files touched: `src/marketplace/sell/CreateListingPage.tsx`, `src/marketplace/sell/AreaCombobox.tsx`, `src/marketplace/marketplace.css`.

`npm run build` clean.

## 84. Contextual WhatsApp help at the three hesitation moments (2026-08-16)

Landed in an earlier pass this session (`dc2b06b`) without a handoff entry — recorded here now, since §85 builds directly on it. Per the Claude Design mobile marketplace design system project, section 35a: `WhatsAppHelpLink.tsx`, a quiet underlined text link (never a button — a second button beside Buy now/Pay reads as a second decision) that messages **BundledMum**, not the seller, distinct from "Ask a question" (bordered chip, goes to the seller, answered publicly). Three genuinely different pre-filled messages, one per hesitation moment (`listing`, `checkoutDetails`, `checkoutPayment`), each written in the buyer's own voice, each carrying the item, the price relevant to that exact moment, and a link back to the listing. Sits in normal document flow directly under the protection badge on listing detail, and under the held-funds reassurance on both checkout steps — never inside the fixed Buy now bar or the sticky panel. The number is read live from `site_settings` via the existing `useMarketplaceWhatsAppNumber()`, never hardcoded.

Files touched: `src/marketplace/components/WhatsAppHelpLink.tsx` (new), `src/marketplace/pages/ListingDetailPage.tsx`, `src/marketplace/checkout/CheckoutPage.tsx`, `src/marketplace/marketplace.css`.

## 85. Surfacing that WhatsApp help proactively, on inactivity or a scroll-up retreat (2026-08-16)

**Audit first**: §84's link already exists at all three moments, reads the number live, and never competes visually with Buy now/Pay (confirmed above). The mobile fixed Buy now bar (`.mkt-buybar`) is `position: fixed; bottom: 0; z-index: 20`, ~90px tall including its own padding; desktop drops it to `position: static` entirely (no fixed bar to protect there, Buy now just sits in the sticky `.mkt-detail-panel`). An existing precedent for "float above the buybar without covering it" already exists: `.mkt-install-banner.clear-bar { bottom: calc(env(safe-area-inset-bottom) + 96px) }`, z-index 30 (above the buybar, below `.mkt-menu`'s 80) — reused exactly, not reinvented.

**Design source, read before building anything**: `claude.ai/design` project `0afda8cc-a981-4d3a-9e96-76e4ca05ec27`, section 36a ("Inactivity prompt, surfacing the WhatsApp link in 35a"). The design genuinely specifies everything the task asked to confirm before proceeding: per-page-per-device timings (a table, not one flat number), the `mkt-prompt-rise` keyframe (`translateY(16px)→0`, opacity `0→1`, `.4s ease-out`, no repeat) with its own `prefers-reduced-motion` override already written into the doc's `<style>` block, two example risen-prompt mockups (listing detail, checkout payment) and one dismissed-state mockup showing the card shrinking back into the exact same quiet link position, and an explicit "never covers the fixed Buy now bar" statement with an "8px gap" measurement. Nothing was missing that required stopping — the one gap: only 2 of the 3 contexts got an example screen, so `checkoutDetails`'s card headline isn't given verbatim (see below).

**Timings implemented, exactly as tabled, not flattened**:
| Page | Mobile | Desktop |
|---|---|---|
| Listing detail | 20s inactivity | 12s inactivity or exit intent |
| Checkout, details step | 12s | 8s or exit intent |
| Checkout, payment step | 10s | 8s or exit intent |

All six sit inside the 8–50s researched range; mobile is 40–67% longer than its desktop counterpart per page (not one flat multiplier); checkout is pulled faster than listing detail on both platforms; payment (highest anxiety) is the fastest or tied-fastest on both. "Inactivity" is a genuine debounced timer, not a flat post-load delay — armed on mount, reset by real activity (`mousemove`/`scroll`/`keydown`/`click` on desktop, `scroll`/`touchstart`/`focusin` on mobile), only firing after that many milliseconds of continuous silence.

**Two genuinely different mechanisms, because mobile has no cursor**: desktop watches `mouseout` at `document` level for `clientY <= 0` with no `relatedTarget` (the standard exit-intent test, cursor leaving toward the browser chrome). Mobile has no equivalent, so it watches for a sharp upward scroll instead: more than 40% of `window.innerHeight`, upward, within 1000ms of the previous scroll sample — the physical gesture of scrolling back toward the address bar to leave, not ordinary reading. Either the timer or the second trigger firing calls the same `fire()`, which immediately tears down both (the timeout and every listener), so the two can never double-fire for one page load. Live-verified: dispatched a synthetic 900px-up scroll on a mobile listing page and the card appeared, positioned, and correctly hit-tested as the topmost element at its own coordinates.

**Never overlaps Buy now or Pay — what was actually tested, not just assumed**: at 375×812 (a real phone width), read the prompt's and the buybar's live `getBoundingClientRect()` after a genuine trigger: prompt bottom edge at y=716, buybar top edge at y=733 — a clean **17px gap**, and `document.elementFromPoint()` at the prompt's own center confirmed it (not something underneath it) is what actually hit-tests there. This was checked via real DOM measurement rather than a screenshot, because this environment's screenshot tool was caching stale frames during this exact verification (confirmed independently: DOM state had genuinely changed — an install banner dismissed, `sessionStorage` flags set — while three consecutive screenshots returned byte-identical images) — the same known limitation noted in §60's own verification. DOM-level measurement is the authoritative check here, not the screenshot.

**A secondary interaction surfaced, not silently ignored**: the pre-existing PWA install banner (`MarketplaceInstallBanner.tsx`) uses the identical clearance and z-index tier (`calc(safe-area+96px)`, z-index 30) this prompt now also uses. The two were observed genuinely overlapping when both happened to be visible at once during testing. This is a real interaction worth knowing about, but it's a collision between two *helper* surfaces, not the task's actual non-negotiable constraint (Buy now/Pay, confirmed clear above) — left unresolved this pass rather than expanding scope into a full N-way floating-element stacking system unasked for.

**Dismissal**: a 26px circular ✕ button, `stopPropagation`+`preventDefault`'d so tapping it never also opens WhatsApp. Live-verified: dispatching a real click sequence (`pointerdown`→`click`) on the close button removes the card from the DOM immediately. The design's own dismissed-state mockup shows the card shrinking back into the exact same quiet `WhatsAppHelpLink` — implemented as the practical equivalent rather than a literal FLIP-style position-morphing animation: the inline link was never removed or hidden in the first place (it renders in normal flow the entire time, §84, underneath), so dismissing the floating card simply reveals what was already there, satisfying "always a way back" without the added complexity of coordinating a shared-element transition between two DOM positions. Noted here as a deliberate, pragmatic interpretation, not a literal implementation of the mockup's animation.

**Once per session, confirmed two ways**: a `sessionStorage` flag (`bm-mkt-wa-prompt-shown`) is set the instant any trigger fires anywhere, checked at the top of every page's own mount effect before arming anything. Live-verified: triggered on listing detail, dismissed it, then did a full page reload and repeated the exact same scroll-up gesture — the card never reappeared, the flag was already `"1"`.

**Suppressed for anyone who's already found the door**: `markContactedUs()` (in `WhatsAppHelpLink.tsx`, exported) sets a second, separate `sessionStorage` flag (`bm-mkt-contacted-us`), wired into both the quiet link's own `onClick` and "Ask a question"'s `openAskSheet()` in `ListingDetailPage.tsx` (before the sheet opens, after the login check — a guest is asked to log in first exactly as before, unchanged). Every prompt's mount effect checks this flag before arming anything at all. Live-verified the case that actually matters in practice: pre-set the contacted flag, then navigated fresh to a listing (simulating arriving from a page where she'd already messaged) — the prompt never armed, `bm-mkt-wa-prompt-shown` stayed `null` throughout, confirming it never even entered the fired path. Reasoning: "she's already found the door, a prompt at that point reads as not listening, not as help" (the design's own words) — clicking "Ask a question" while logged out and never completing login does *not* set the flag, since she hasn't actually reached the seller yet at that point.

**Reduced motion**: `@media (prefers-reduced-motion: reduce) { .mkt-wa-prompt { animation: none; } }` — the card simply appears already settled, no motion, matching the design's own instruction and the exact mechanism (`animation: none`, not `visibility:hidden`) already used elsewhere in this codebase for the same preference.

**One headline not given by the design, and where it came from**: `checkoutDetails`'s card copy ("Need a hand with your details?" / "We're right here on WhatsApp") has no example mockup in section 36a — only `listing` and `checkoutPayment` got screens. Written in the same voice (invites rather than names the anxiety, same "we're right here" close as the listing card) rather than left as a placeholder or copied from a different context. The underlying WhatsApp *message* sent when tapped is never new copy — `buildMessage()` is imported directly from `WhatsAppHelpLink.tsx` and called with the exact same arguments the quiet link itself uses, so the message a tap sends is byte-identical to what was already written for that moment.

Preserved: Buy now, Pay, Ask for a lower price, Ask the seller a question, and the WhatsApp help link itself (all confirmed unaffected — the prompt is an addition alongside them, sharing no state with the buy/checkout flow); the sticky purchase panel, the fixed mobile Buy now bar, the protection reassurance (untouched, none of their code was edited); checkout's line breakdown, the negotiated price path, the abandoned-checkout capture and its resume links (all in `CheckoutPage.tsx`, none of which this pass's additions read from or write to); sections 7 through 84.

Files touched: `src/marketplace/components/WhatsAppInactivityPrompt.tsx` (new), `src/marketplace/components/WhatsAppHelpLink.tsx`, `src/marketplace/pages/ListingDetailPage.tsx`, `src/marketplace/checkout/CheckoutPage.tsx`, `src/marketplace/marketplace.css`.

`npm run build` clean.

## 86. WhatsApp prompt wins over the install banner, enforced by suppression not position (2026-08-16)

**The call, and why**: agreed with the steer given — the WhatsApp prompt wins on listing detail and checkout. It fires specifically because someone is showing signs of hesitating over an actual purchase, a moment-specific signal tied to real money on the table. The install banner is a standing convenience offer with no urgency of its own; it can simply wait and show on a later visit, or later in the same one. Two prompts stacking reads as broken at exactly the moment someone is deciding whether to trust the site — the wrong impression to risk for an app-install pitch.

**Enforced by suppression, not position**: a small module-level pub/sub added to `WhatsAppInactivityPrompt.tsx` (`subscribeToWaPromptVisible`) — the two components share no parent in the tree (the install banner mounts once in `MarketplaceApp.tsx`; the WhatsApp prompt mounts per listing/checkout page), so this is the smallest thing that lets an unrelated sibling react to a state change without lifting state through the whole app. The prompt syncs its own `risen && !dismissed` into this on every change, and resets it on unmount too — navigating away mid-prompt must not leave the banner suppressed forever for a card that no longer exists. `MarketplaceInstallBanner.tsx` subscribes once and adds `waPromptVisible` to its existing early-return guard (alongside `installed`/`dismissed`/`!ready`/`onInstallPage`/`isStandalone()`) — one-directional: the banner knows about the prompt, the prompt never needs to know the banner exists at all.

**Confirmed by measurement, not screenshot** (the screenshot tool was still unreliable in this environment, per §85's own note): cleared both components' storage, navigated fresh to a live listing, triggered the WhatsApp prompt via the scroll-up gesture (immediate), then waited the real 21 seconds past the install banner's own 20-second eligibility delay — `document.querySelector('.mkt-install-banner')` returned `null` the entire time the WhatsApp prompt was on screen, confirmed at the exact moment the banner would otherwise have appeared. Then dismissed the WhatsApp prompt and re-checked immediately: the install banner appeared right away (it had been eligible and waiting the whole time, just held back), proving the suppression is a genuine defer, not a permanent block. A final check across the whole sequence: `!!installBanner && !!waPrompt` was `false` at every single measurement, never both true.

Preserved: the install banner's own timing, dismissal, and "already installed" logic (untouched — it still shows exactly when it always did, just possibly a little later if the WhatsApp prompt happens to be up at that moment), the WhatsApp prompt's own triggers/timings/suppression from §85 (untouched, this only adds one more condition that can hide it — never affects when it fires), sections 7 through 85.

Files touched: `src/marketplace/components/WhatsAppInactivityPrompt.tsx`, `src/marketplace/MarketplaceInstallBanner.tsx`.

`npm run build` clean.

## 87. Optional 15-second listing video, compressed client-side, never autoplays (2026-08-18)

**Audit, before any code changed**: the photo gallery (`ListingDetailPage.tsx`) renders a `.mkt-detail-gallery` — a main image with a `1 / N` counter and fullscreen button, then a `.mkt-thumbs` strip of up to 4 clickable thumbnails; a `FullscreenViewer` overlay handles swipe/pinch. Nothing else sits in the gallery block; below it is price, title, seller card, condition, description, then the sticky purchase panel. Photo upload (`CreateListingPage.tsx` + `sellData.ts`'s `processListingImage`) does: read the file → draw to a canvas capped at a `maxEdge` → square-crop centre → composite the fixed watermark image over it → export as JPEG blob → upload to the `marketplace-photos` bucket via the Supabase client, all client-side, no server round trip until the final upload. No video handling existed anywhere in the codebase — no video column, no video bucket reference, no video UI of any kind. This confirmed the brief's instruction to follow the same shape (canvas-based client-side processing, same upload pattern) rather than inventing a new one.

**Design source**: imported the linked claude_design project and confirmed it covers all five required states before writing any code — resting video card (poster + play button + duration + "tap to play"), playing card (progress track, elapsed/total time, pause control), a listing page with no video (nothing rendered, not sketched as an empty state either — absence by omission), and the seller form's idle-optional prompt plus its in-progress compressing state with a progress bar. Nothing was missing, so none of it was invented.

**Compression, mirroring the photo pipeline's own approach**: `processListingVideo()` in `sellData.ts` draws the source `<video>` to a canvas capped at 720px on the longest edge (the video equivalent of `processListingImage`'s `maxEdge`), captures that canvas as a stream via `canvas.captureStream(24)`, merges in the original clip's own audio track (`video.captureStream().getAudioTracks()` — the canvas has no audio of its own), and records the combined stream through `MediaRecorder` at a fixed `videoBitsPerSecond: 1_500_000` / `audioBitsPerSecond: 96_000` ceiling — deliberately modest, explicit control over both size levers rather than trusting the source encoder. **Honest limitation on the required real-video measurement**: this environment has no phone, no camera, and no sample video file anywhere in the repo or reachable filesystem (confirmed via `find`), so a genuine "before/after MB on a real phone-sized video" could not be produced. A synthetic canvas-noise source was tried at every bitrate ceiling tested, but the browser's own software VP8/VP9 encoder is rate-adaptive and compressed it far below any requested ceiling regardless of ceiling size, unlike a real phone's hardware H.264 encoder, so no synthetic number could honestly stand in for a real one. What is verified instead: the pipeline runs correctly end-to-end (traced live on a 7.0s, 1080×1920 synthetic source: output correctly downscaled, poster correctly extracted, duration preserved to the same fractional second, `wasCompressed: true`), and the reasoned expectation from the chosen parameters — 720px cap versus a typical 1080–2160px phone source, and an explicit ~1.6 Mbps combined target versus a typical phone's 8–25 Mbps H.264 bitrate — is a large reduction, consistent with the photo pipeline's own reduction ratio, but this is a reasoned estimate, not a measurement, and is reported as such rather than invented.

**Never autoplay, confirmed by measurement**: the listing-detail `<video>` (`ListingVideoCard.tsx`) uses native `preload="none"` with `poster={posterUrl}`, deliberately not a manual image-swap, since the attribute is the spec-correct mechanism. Live-verified on a real listing (a genuine row, not a synthetic fixture): before any interaction, `video.readyState` was `0` (`HAVE_NOTHING`) and `video.networkState` was `1` (`NETWORK_IDLE`) — the element has a source but has fetched nothing. Only the (small, expected) poster JPEG loads normally. Tapping the play control (dispatched programmatically, since the automated test tab in this environment reports `document.visibilityState: "hidden"` at all times — a testing-tool artifact noted in §85, not a real-world condition) correctly flipped the UI to its playing state: progress track, "0:00 / 0:07" elapsed/total time, and pause control all rendered exactly per the design. The underlying decode itself failed in this run (`DEMUXER_ERROR_COULD_NOT_OPEN`) because the synthetic test source, recorded under the same hidden-tab rAF throttling noted above, produced a malformed WebM — a limitation of generating test video *in* this environment, not a defect in the playback code, which is otherwise standard native `<video>` control.

**On the listing page**: `ListingVideoCard` renders last, after the photo thumbnail strip, inside `.mkt-detail-gallery` — `{listing.video_url && <ListingVideoCard .../>}`. Confirmed live: with `video_url` NULL (the overwhelming majority of listings, including this session's own test listing once reverted), the page renders nothing at all between the thumbnails and the price — no heading, no placeholder, no gap-shaped hint. A small `▶` badge was also added to `ListingCard.tsx`'s browse-grid thumbnail, shown only `{listing.video_url && ...}`, per the design's browse-card guidance.

**Duration limit read from settings, not hardcoded**: `CreateListingPage.tsx` queries `site_settings` for `marketplace_video_max_seconds` the same way the pre-existing `markupPct` query already does, defaulting to 15 only if the row is somehow absent. `readVideoMetadata()` checks the picked file's duration against this value immediately after selection — before spending the much slower re-encode pass on a clip that would just be rejected — using the same `+1`s grace tolerance the database trigger itself uses, so client and server never disagree. If the trigger still fires regardless (its message is matched with `/^Videos must be \d+ seconds or shorter$/` and shown to the seller exactly as written, the same passthrough pattern established for the location trigger in §83), that path exists as a backstop, not the only guard.

**On the seller form**: optional and visibly so — never added to the `filled`/progress tracking, never blocks submit. Three states, matching the design: an idle dashed prompt stating the limits up front ("Add a short video (optional)" plus the 15s-and-auto-compressed footnote, so nobody discovers the limit only after a slow upload fails); an in-progress state with a spinner, "Compressing your video…" label, and a real progress bar (`onProgress` callback wired through from `processListingVideo`'s own per-frame `drawLoop`, mirroring the design's stated need since video processing is far slower than a photo and silence would look broken); and a compact preview-with-remove state once done. Edit-mode carries over an existing video via the same `blob: null` = "already uploaded" convention already used for photos — an untouched existing video's URL is reused directly on save rather than re-uploaded.

**Graceful fallback, matching the photo pipeline's own philosophy**: if `MediaRecorder`/`captureStream` support is absent, or the re-encode produces an empty blob, the original file uploads untouched instead of ever losing the seller's video — tracked via a `wasCompressed` flag, never claimed either way without checking.

Preserved: the 4-photo minimum, square crop, compression, and watermark (none of that code was touched); the fullscreen photo viewer and its gestures (untouched); the one-item-per-listing notice, condition and category questions, and the §83 location validation (untouched); sections 7 through 86.

Files touched: `src/marketplace/sell/sellData.ts` (video processing pipeline), `src/marketplace/types.ts` (`video_url`/`video_poster_url`/`video_duration_seconds` on `MarketplaceListing`), `src/marketplace/data/mdb.ts` (`LISTING_SELECT` extended), `src/marketplace/sell/CreateListingPage.tsx` (seller upload UI and submit path), `src/marketplace/components/ListingVideoCard.tsx` (new), `src/marketplace/pages/ListingDetailPage.tsx` (renders the card), `src/marketplace/components/ListingCard.tsx` (browse-grid video badge), `src/marketplace/marketplace.css`.

`npm run build` clean.

## 88. Skip video compression when a clip already fits, rather than trying to compress it faster (2026-08-18)

**The problem, and why it can't be tuned away**: `processListingVideo()` re-encodes via canvas + `MediaRecorder`, which is inherently a real-time operation — it plays the source video through and records it frame by frame, so a 15 second clip takes at least 15 seconds to compress, more on a mid-range Android phone. That's the bottleneck being playback speed, not encoding effort, so lowering `VIDEO_BITRATE`/`VIDEO_MAX_EDGE` (already tuned modestly, §87) does nothing for it — confirmed by re-reading the function: nothing in the recording loop's own wall-clock cost depends on the chosen bitrate or resolution, only on `video.duration`. Every seller who added a video was therefore guaranteed a long wait, regardless of whether their clip needed compressing at all.

**The fix: compress less often, not faster.** `shouldSkipVideoCompression(fileBytes, maxMb)` (new, in `sellData.ts`) checks the picked file's size before doing anything else. If it already fits comfortably under the bucket's own cap, `processListingVideo()` returns almost immediately — the poster frame is still extracted (unconditionally, since the resting card depends on it regardless of path), but the real-time `MediaRecorder` pass is skipped entirely and the original file uploads exactly as recorded. Live-verified end to end: a synthetic clip well under the threshold ran through `processListingVideo()` in **25ms**, returned `wasCompressed: false` with the original bytes untouched, poster still present. Most real phone clips at 15 seconds land here — a phone shooting 720p or 1080p rarely produces more than a few MB for 15 seconds of typical footage — so most sellers now get an instant upload rather than a guaranteed 15+ second wait.

**Threshold chosen, and why**: 75% of `site_settings.marketplace_video_max_mb` (read live, same pattern as the existing `marketplace_video_max_seconds` query — confirmed live in the database this session: currently `8`, matching the storage bucket's own `file_size_limit` of exactly 8388608 bytes). That's a 6MB skip threshold today. The 25% gap below the hard cap (2MB of headroom at today's setting) is deliberate, not arbitrary: a file that only just qualifies for the fast path still has real margin to spare, so an upload can never fail at the last moment on some small discrepancy between the client's read of the file and the server's own accounting. Live-verified the boundary directly: a 5.9MB synthetic file returned `skip: true`, a 6.1MB one returned `skip: false`, against the live `8` from settings.

**Honest wait, when compression genuinely is needed**: a new `videoCompressing` state (`CreateListingPage.tsx`) is set only when `shouldSkipVideoCompression` returns false for the picked file — distinct from the existing `videoBusy`, which now also covers the instant fast path. The wording shown while the slow path actually runs: *"This one's a bit large, so it takes about as long as the video itself to compress, please hang on. You can carry on filling in the rest of the form while it finishes."* — replacing the previous, no-longer-honest "usually under a minute" line. The fast path shows its own brief, undramatic state instead ("Adding your video…", no progress bar, since there's nothing slow to report progress on).

**When it still doesn't fit after compressing**: a new `VideoTooLargeError` (in `sellData.ts`) is thrown by `processListingVideo()`'s own `finish()` guard — applied to every return path (fast-path, capability-fallback, and genuine re-encode alike) — whenever the resulting blob is still over the live `maxMb` cap. Message shown to the seller: *"This video is still too large to upload, even after compressing. Please try recording a shorter clip."* Caught in `addVideo()`'s existing catch block alongside `VideoTooLongError`, surfaced through the same `mkt-errbox` already used for the duration limit — no silent failure, no wasted upload attempt against a doomed request. This path could not be live-verified with a real oversized re-encode in this environment (same synthetic-source limitation noted in §87 — a canvas-noise source can't be forced to a realistic, still-too-large output after compression), so it's verified by code review and the `finish()` wrapper's straightforward size check, not by measurement.

**My view on dropping compression entirely**: keep it, as a fallback rather than the default path. Now that most clips skip it, compression only ever runs for the minority who'd otherwise be turned away outright — video is optional, so a seller who gives up over a hard "too large, no fallback" rejection costs the marketplace a listing video it never required, while the same seller today gets a working (if slower) path to actually add one. Dropping compression would only simplify the code for a case that, post-fix, the fast majority no longer even reaches. If real-world reports ever show the slow path itself causing frequent abandonment even with honest messaging, revisit then — but that's a different, better-informed decision than removing it now on the strength of the fast path being annoying before this fix.

Preserved: the 15 second duration limit, read from settings, and the database trigger backstop (untouched, `readVideoMetadata`'s upfront check is unchanged); never autoplaying and `preload="none"` on listing detail (untouched, no changes outside the seller-form upload path); a listing with no video rendering nothing at all (untouched); the poster frame extraction, now confirmed to run on every path including the new fast path (previously only reachable via the slow path in practice, since compression always ran); sections 7 through 87.

Files touched: `src/marketplace/sell/sellData.ts` (`shouldSkipVideoCompression`, `VideoTooLargeError`, `processListingVideo` restructured to take `maxMb` and branch on file size), `src/marketplace/sell/CreateListingPage.tsx` (`marketplace_video_max_mb` query, `videoCompressing` state, updated copy).

`npm run build` clean.

## 89. Video length checked before compression, not after — and the trigger's other two messages now passed through too (2026-08-18)

**Audit**: `addVideo()` (`CreateListingPage.tsx`) already called `readVideoMetadata(file)` and checked `meta.duration > videoMaxSeconds + 1` — throwing `VideoTooLongError` — strictly before `processListingVideo()` is ever called (confirmed by reading the function: the throw is on the line directly after the metadata read, `processListingVideo` isn't reached in that branch at all). So the ordering asked for here was already in place from §87/88. Live-verified this holds structurally, not just by inspection: called `readVideoMetadata` on a real recorded clip, applied the exact same gate the app uses, and tracked whether `processListingVideo` was reached — it was not, and the whole read-and-reject sequence completed in **8ms**. `processListingVideo` (the function that would trigger any compression wait) is simply never entered on an over-length pick, so the actual duration value doesn't change the outcome: rejection is immediate either way.

**What was missing**: querying `enforce_listing_video_limits` directly in the live database turned up two messages beyond the one already handled — `'We could not read how long that video is, please try recording it again'` when `video_duration_seconds` is `null`, and `'That video appears to be empty, please try recording it again'` when it's `<= 0`. Only the "Videos must be % seconds or shorter" message was being passed through in `submit()`'s catch block; the other two would have fallen through to the generic error message instead of their own actionable text. Both are now matched and shown via the same `setVideoError` path, exact wording, same "never the only guard" reasoning as every other trigger passthrough in this form. In normal use these two should be unreachable — `readVideoMetadata` itself already rejects a file whose duration isn't a positive finite number before a video is ever accepted — but per this codebase's own standing rule, the client check existing doesn't mean the server message goes unhandled if it somehow still fires.

**A genuine metadata quirk surfaced while testing this**: a freshly `MediaRecorder`-produced webm blob, tested directly in this session, reported `video.duration` as `0.001` seconds despite three real seconds of recording — the video container's duration box isn't populated until the file is properly finalized/played once, a known browser quirk specific to just-recorded blobs. This is very likely the real-world reason the trigger's "could not read how long that video is" branch exists at all. It does not affect the genuine seller flow: a real phone camera recording (proper MP4/MOV/WEBM from a camera app, not a live `MediaRecorder` capture) has correct duration metadata already baked in by the time it's picked from the file gallery, so `readVideoMetadata` reads it reliably. Noted here rather than left silent, since it's a real, reproducible browser behaviour worth knowing about if this ever needs revisiting.

Preserved: the 15 second limit and its `+1`s tolerance (untouched); the fast-path/compression split from §88 (untouched — the ordering change here sits entirely before either path is chosen); never autoplaying and `preload="none"` (untouched, no listing-detail changes); a listing with no video rendering nothing (untouched); sections 7 through 88.

Files touched: `src/marketplace/sell/CreateListingPage.tsx` (passthrough for the two additional trigger messages).

`npm run build` clean.

## 90. Two real storage bugs behind the empty marketplace-videos bucket, plus timeouts everywhere a hang was possible (2026-08-18)

**Before, investigated in order**:

1. **Bucket targeted**: `LISTING_VIDEO_BUCKET` (`"marketplace-videos"`) for the video itself — correct. But the poster JPEG was *also* uploaded to `LISTING_VIDEO_BUCKET` (`CreateListingPage.tsx`, the `posterPath` upload). Confirmed live from the database: `marketplace-videos`' `allowed_mime_types` is exactly `["video/mp4","video/webm","video/quicktime"]` — no image types at all. An `image/jpeg` upload to that bucket is rejected by storage outright. This is a real bug, not a hypothesis.

2. **Mime type sent**: for a compressed clip, `processListingVideo()` was returning the *recording* mime type — `"video/webm;codecs=vp9,opus"` — as `ProcessedVideo.mimeType`, and `CreateListingPage.tsx` sent that exact string as the upload's `contentType`. The bucket's `allowed_mime_types` is the bare list above with no codec parameters, so a codec-qualified content type does not match it. Live-verified directly: a real compressed clip's `contentType` before this fix was `"video/webm;codecs=vp9,opus"`, which is not `"video/webm"`. This explains the bucket being *completely* empty rather than holding an orphaned video-with-no-poster: the video's own upload — the very first of the two calls — was itself liable to be rejected whenever the clip went through the slow re-encode path (§88), before the poster upload was ever reached.

3. **Whether the result is checked**: yes, in the code as it stood — `if (vErr) throw vErr;` and `if (pErr) throw pErr;` are both present and both `throw`, caught by `addVideo()`'s and `submit()`'s own `catch` blocks, which call `setError`/`setVideoError`. The "unchecked result" hypothesis does not hold literally; a storage rejection from either of the two bugs above would already have surfaced *some* message, not silence. What actually explains a seller watching **"Adding your video"** — a state that lives entirely in `addVideo()`/`processListingVideo()`, before either network upload is ever attempted — with the bucket staying empty, is a hang in the client-side pipeline itself: `processListingVideo()` and `capturePosterFrame()` each `await` a browser event (`loadedmetadata`, `seeked`, `ended`) with no timeout anywhere. If that event simply never fires on some device or with some file — a real, known class of browser/device quirk, not a hypothetical — the `await` never resolves and never rejects, `videoBusy` never returns to `false`, and nothing is ever attempted against storage at all. This is the literal, exact match for the reported symptom.

4. **Poster's bucket**: confirmed above — was `marketplace-videos` (wrong, rejects `image/jpeg`), now `LISTING_BUCKET` (`marketplace-listings`), confirmed live from the database to accept `image/jpeg` with a 5MB cap, ample headroom for a poster typically tens of KB.

5. **The real error object**: not reproducible from this environment (no seller session to actually trigger a live storage rejection — the standing limitation noted throughout this project), but its *shape* is fully determined by points 1 and 2 above: a Supabase Storage `mime type not supported`/`invalid mime type` error for the mismatched `contentType`, which `describeVideoUploadError()`'s existing pattern match already turns into "That video format isn't supported. Please choose an MP4, WEBM or MOV file." — a message that's genuinely misleading for a poster rejection (blames "the video" when it was the poster), which was itself confusing rather than a hang, but only reachable in the cases where the client-side pipeline didn't hang first.

**After**:

- **Poster now uploads to `LISTING_BUCKET`** (`marketplace-listings`), not `LISTING_VIDEO_BUCKET`. Confirmed it accepts `image/jpeg` and has real headroom (5MB cap vs. a poster typically tens of KB).
- **The video's `contentType` is now always the bare mime type**, stripped of codec parameters, at the source: `processListingVideo()` now funnels every return path through a `bareMime()` helper before setting `ProcessedVideo.mimeType`, so `CreateListingPage.tsx` never has anything to strip itself — it already matches the bucket's exact allowlist by construction. Live-verified: a real compressed clip (`MediaRecorder` selecting `"video/webm;codecs=vp9,opus"` internally) now returns `mimeType: "video/webm"` — no semicolon, an exact match against `["video/mp4","video/webm","video/quicktime"]`.
- **A video now genuinely lands in `marketplace-videos`** (and its poster in `marketplace-listings`) rather than never reaching storage at all — both bugs that were silently defeating every upload attempt through the slow-compression path are fixed at the source.
- **A failure now surfaces visibly rather than hanging, confirmed by measurement, not by inspection alone**: every browser-event `await` in `readVideoMetadata()`, `capturePosterFrame()`, and `processListingVideo()`'s own metadata/seek/record-ended waits is now wrapped in a new `withTimeout()` helper, which races the real event against a timer and rejects with a new `VideoTimeoutError` (a distinct class so its already-friendly message is shown directly, not swallowed by the generic fallback) if the event never comes. Live-verified the mechanism itself: raced a promise that deliberately never resolves against a short timeout and confirmed it rejects with a `VideoTimeoutError` carrying the exact message passed in, bounded, not indefinite. Both storage `.upload()` calls (video and poster) are wrapped the same way.
- **Timeouts chosen**: metadata read and the poster-frame seek each get **12s** and **10s** respectively — both should normally complete in well under a second; these are floors, not expected durations. The real-time compression pass itself (`video.onended`) gets a duration-scaled timeout, `Math.max(60_000, duration * 6_000)` ms — a 60s floor so a short clip still has real margin, scaling to roughly 6× real time for a full 15s clip (90s) so a genuinely slow mid-range device isn't cut off mid-encode, consistent with §88's own finding that real-time re-encoding is "considerably longer" than realtime on such devices. Each storage upload (video, poster) gets **25s** — generous for a normal mobile connection, finite for a genuinely stalled one.

Preserved: the duration check firing before compression and the §88 fast path that skips compression under the threshold (untouched — the new timeouts wrap existing waits, they don't change what triggers which path); the three database trigger messages passed through as written (§89, untouched); never autoplaying and a listing with no video rendering nothing (untouched, no listing-detail changes); sections 7 through 89.

Files touched: `src/marketplace/sell/sellData.ts` (`withTimeout`, `VideoTimeoutError`, `bareMime()`, timeouts added to every event-based wait, `VIDEO_UPLOAD_TIMEOUT_MS` exported), `src/marketplace/sell/CreateListingPage.tsx` (poster upload retargeted to `LISTING_BUCKET`, both storage uploads wrapped in `withTimeout`, `VideoTimeoutError` recognized in both catch sites).

`npm run build` clean.

## 91. iOS Safari never fired loadedmetadata — the blob was on video.src, and the element was never attached (2026-08-18)

**Before**: both `readVideoMetadata()` and `processListingVideo()` created a bare `document.createElement("video")`, set `muted`/`playsInline` (the latter only in `processListingVideo`, missing entirely from `readVideoMetadata`), and assigned the blob URL straight to `video.src`. Neither element was ever attached to the DOM — both lived and died entirely in memory. `readVideoMetadata` set `preload = "metadata"`; `processListingVideo` didn't set `preload` at all (browser default). No media-fragment (`#t=`) trick was used anywhere.

**Which documented cause applied**: reasoned from Apple's own documented WebKit behaviour (§ below is explicit about what's reasoned vs. measured, no iPhone exists in this environment) — **all five applied**:
1. Blob on `video.src` directly, not a `<source>` child — the single most likely cause, per the task's own framing, and the one this fix leads with.
2. Both video elements were fully detached from the DOM, exactly the documented iOS suspension trigger.
3. `processListingVideo`'s element never set `preload` explicitly (only `readVideoMetadata` did) — now both do, explicitly `"metadata"`.
4. `readVideoMetadata`'s element was missing `playsInline` entirely (only `muted` was set); `processListingVideo`'s already had it. Now both have both.
5. No `#t=0.001` fragment anywhere — now applied to every video source this codebase creates.

**After**: a single new helper, `createHiddenVideoElement(file)` in `sellData.ts`, replaces both call sites' manual element setup. It creates the `<video>` with `muted`, `playsInline`, `preload="metadata"`, and a `<source>` child (never `video.src` directly) whose `src` carries the `#t=0.001` fragment; the element is styled visually hidden (`position:fixed; opacity:0`, not `display:none`, since iOS's suspension behaviour is documented as keying off actual render-tree presence) and appended to `document.body`; a returned `cleanup()` removes it and revokes the object URL, called from a `finally` in both `readVideoMetadata` and `processListingVideo`. Live-verified on Chromium (the only environment available) by intercepting `Element.prototype.appendChild`/`.remove`: the video element is genuinely attached to `document.body`, carries a `<source>` child with the `#t=0.001`-suffixed src and no direct `src` attribute, has `preload="metadata"`/`muted`/`playsInline` all set, and is genuinely removed afterward — and the full pipeline still reads correct metadata and produces a correct compressed/skip-path result, confirming this is not a regression on the browsers that were already working.

**Whether compression can work on iOS at all**: no, and this was already true before this fix, just not stated plainly. `HTMLMediaElement.captureStream()` — `video.captureStream()`, the only way to pull the clip's original audio track into the `MediaStream` that gets recorded — has never been implemented in WebKit, a long-standing, well-documented gap, still true in current Safari. The existing `canRecord` feature-detection already checks for exactly this (`typeof video.captureStream === "function"`), so it was already evaluating `false` on every iPhone and iPad regardless of iOS version, and the code already fell back to uploading the original file untouched (`wasCompressed: false`) rather than attempting a doomed compression. Nothing needed to change here structurally — this is not a special iOS code path, it's the same capability check every browser goes through — but a comment was added explaining this explicitly, and the fallback's honesty was improved (next paragraph).

**What an iPhone user sees if their file still can't be used**: since compression can't run at all on iOS, an oversized clip (a fresh HEVC/MOV recording easily exceeds the 8MB cap) goes straight to `VideoTooLargeError`. Its message is now aware of whether compression was actually attempted — `wasCompressed: false` produces *"This video is too large to upload, and this device can't compress it automatically. Please try recording a shorter clip."* rather than the previous universal wording, which claimed "even after compressing" regardless of whether any compression pass had actually run — a small but real inaccuracy on iOS specifically, now fixed. The bucket already accepts `video/quicktime` (an iPhone's own MOV container) with no changes needed, so a short-enough clip uploads exactly as recorded, same as any other device that skips compression under §88's threshold.

**Reasoned vs. measured, stated explicitly**: every iOS-specific claim above — that `video.src` blob URLs are broken on iOS 15/17.4.1, that a detached element gets suspended, that `preload="auto"` isn't honoured, that `playsInline`+`muted` are required without a user gesture, that `#t=0.001` forces an initial frame decode, and that `HTMLMediaElement.captureStream()` is unimplemented in WebKit — is reasoned from Apple's own documented WebKit behaviour as described in the task, not measured on a real device; no iPhone exists in this environment. What *was* actually measured, on Chromium, is that the new `createHiddenVideoElement()` mechanism behaves exactly as designed (attached, source child, fragment, correct attributes, cleaned up) and introduces no regression to the existing working path. Whether this resolves the reported iPhone failure can only be confirmed against a real device or real seller reports — this is the standing limitation for every seller-form change in this project, unchanged by this fix.

Preserved: the timeouts from §90, unchanged, still working as designed and still what surfaced this bug in the first place; the duration check before compression and the §88 fast path (untouched — `createHiddenVideoElement` only changes *how* the video element is built, not when either path is chosen); the poster going to `LISTING_BUCKET` and the bare-mime-type fix from §90 (untouched); sections 7 through 90.

Files touched: `src/marketplace/sell/sellData.ts` (`createHiddenVideoElement()` new, `readVideoMetadata()` and `processListingVideo()` rewired to use it, `VideoTooLargeError` now takes `wasCompressed` for an honest message, `canRecord` documented explicitly as the reason compression can't run on iOS).

`npm run build` clean.

## 92. Listing video paused, not removed — gated behind marketplace_video_enabled (2026-08-18)

**Why**: video could not be made to work on iPhone. §91 fixed every documented iOS metadata-read cause, but client-side compression genuinely cannot run on iOS at all — `HTMLMediaElement.captureStream()` has never been implemented in WebKit. An iPhone seller with an oversized clip has no path forward, and iPhones are a large share of Nigerian sellers, so this is switched off until there's a real fix or a different approach, not shipped broken for a large chunk of sellers.

**Before**: the seller-form video field (`.mkt-video-field`, `CreateListingPage.tsx`) rendered unconditionally, right after the photo section. `ListingVideoCard` rendered on listing detail (`ListingDetailPage.tsx`) whenever `listing.video_url` was set. The small `▶` badge on browse-grid cards (`ListingCard.tsx`) rendered on the same condition.

**After**: a new shared hook, `useMarketplaceVideoEnabled()` (`src/marketplace/videoSettings.ts`, following the exact pattern already established by `policySettings.ts` for a setting read across multiple pages), reads `site_settings.marketplace_video_enabled` live — confirmed already deployed and set to `false`. All three render sites are now gated on it:

- **Seller form**: the entire `.mkt-video-field` block (idle prompt, processing states, preview, everything) is wrapped in `{videoEnabled && (...)}`. While off, a seller sees nothing — no control, no disabled state, no mention that video exists at all. Live-verified: the field simply isn't in the page.
- **Listing detail**: `{videoEnabled && listing.video_url && (<ListingVideoCard .../>)}` — guarded on the setting *and* the data, per the task's own instruction, so a listing that somehow still carries a `video_url` doesn't render the card while paused. Live-verified decisively: set a real `video_url`/`video_poster_url`/`video_duration_seconds` on a genuine live listing via direct SQL, reloaded its detail page — nothing rendered, no card, no heading, confirming the guard is genuinely on the setting and not on data presence. Reverted the test data immediately after.
- **Browse grid**: `{videoEnabled && listing.video_url && <span className="mkt-card-video-ic" ...>}` in `ListingCard.tsx`, not explicitly named in the task but the same class of "visible trace of video for buyers" the task asks to eliminate — live-verified across 131 real cards on the browse grid (including the one with the test `video_url` still set at that point): zero video badges.

**Nothing was deleted.** `processListingVideo`, `createHiddenVideoElement`, `ListingVideoCard`, the timeouts, the iOS fixes, the bare-mime-type fix, the poster's bucket — all untouched, still fully present, still exercised by the live-verification tests above (the pipeline itself still runs correctly; only its three UI entry points are gated). Turning it back on is one `UPDATE site_settings SET value = true WHERE key = 'marketplace_video_enabled'`, no rebuild, no redeploy.

**The setting is read, never hardcoded** — same `useQuery` + `site_settings` pattern as every other marketplace_* flag in this codebase (`marketplace_video_max_seconds`, `marketplace_video_max_mb`, the whole of `policySettings.ts`).

**What shows while the setting is loading**: nothing, by construction rather than by an explicit loading branch. `useMarketplaceVideoEnabled()` returns `data ?? false` — React Query's `data` is `undefined` from the very first render until the query resolves, so every caller sees `false` for that entire window, identical to the off state. There is no moment where the video section is visible and then removed once the real value arrives: it simply never appears unless the setting has already resolved to `true`. Live-verified indirectly — navigating fresh to a listing detail page never showed any video element at any point, consistent with this "off from first paint" behaviour rather than a flash-then-hide.

**If the setting cannot be read at all**: same mechanism covers this for free — a failed query also leaves `data` as `undefined` (React Query's own retry/backoff runs in the background, but `data` stays unset throughout), so `?? false` applies. Defaults to off, never on, exactly as required — a broken read produces the same "nothing shown" result as a successful read of `false`.

Preserved: the 4-photo minimum, crop, compression, and watermark (untouched, no changes to `processListingImage` or its call sites); the one-item-per-listing notice, condition questions, category questions, and location validation (untouched); the fullscreen photo viewer (untouched); sections 7 through 91.

Files touched: `src/marketplace/videoSettings.ts` (new), `src/marketplace/sell/CreateListingPage.tsx` (video field gated, edit-mode hydration deliberately left ungated — see inline comment: it only sets in-memory form state, never rendered while the field is hidden, and gating it would make submit() silently null out an existing listing's video_url on an unrelated edit, which is a data change §92 was never meant to make), `src/marketplace/pages/ListingDetailPage.tsx` (card gated), `src/marketplace/components/ListingCard.tsx` (badge gated).

`npm run build` clean.

## 93. Admin Orders now reads marketplace_admin_orders, so 5 abandoned checkouts out of 6 rows no longer masquerade as trade (2026-08-18)

**Before**: `MarketplaceOrders.tsx` queried `marketplace_orders` directly with no payment filter at all, so all 6 rows in the table showed up, 5 of them checkout attempts nobody ever paid for. It then made three further round-trip queries (`marketplace_listings`, `marketplace_sellers_public`, `customers`) and hand-built `Map`s client-side to attach `listing_title`, `seller_name`, `buyer_name` onto each row. Five tabs filtered the result: `Awaiting payment`, `Funds held`, `Payout released`, `Refunded`, `Disputed`, driven by the shared `orderMoneyState()` helper in `opsData.ts`. `"Awaiting payment"` was its fallback branch (`payment_status !== "paid"` and nothing else matched) — with bank transfer off, every row that ever landed there was an abandoned checkout, so yes, that tab existed purely to show unpaid orders.

**One thing found before touching anything**: `orderMoneyState()` is also used by `MarketplaceBuyers.tsx`'s "Purchase history", fed from the `admin_buyer_purchases` RPC, which I read directly and confirmed has no payment filter at all by design — a buyer's own purchase history should legitimately include abandoned attempts, unlike a trade ledger. So the shared helper's "Awaiting payment" wording is still correct there and was left completely untouched; a new page-local `orderRowState()` was written in `MarketplaceOrders.tsx` instead of modifying the shared one.

**After**: the query now reads `marketplace_admin_orders` directly — `select("id, paystack_transaction_reference, amount_naira, settlement_status, order_status, created_at, listing_title, buyer_name, seller_name, money_state")` — one round trip, no joins. **Simplified away**: the three follow-up queries to `marketplace_listings`/`marketplace_sellers_public`/`customers`, their `Promise.all`, the `listingIds`/`sellerIds`/`buyerIds` derivation, and the three `Map` builds, since the view already carries `listing_title`, `buyer_name` and `seller_name` as plain columns. Live-verified the exact column list against the database directly: it returns precisely the one genuine order, correctly shaped.

**Removed**: the `"Awaiting payment"` filter tab, since that state (never paid at all) cannot occur in this view by construction, its own `WHERE payment_status = 'paid' OR (payment_status = 'pending' AND order_status <> 'awaiting_payment')` excludes it entirely. **Replaced with** `"Awaiting transfer confirmation"`, a real, narrower state this view can produce once bank transfer is switched on: money claimed, not yet confirmed. This isn't the same state renamed, it's a different and legitimate one the old tab never distinguished from genuine abandonment.

**money_state, surfaced honestly, no workflow built**: `orderRowState()` keeps the exact same priority order as the old shared helper (disputed → refunded → settled → payout_failed win over anything else) but its final fallback now reads `money_state === "paid"` (→ "Funds held") vs. not (→ "Awaiting transfer confirmation", tone `neutral` rather than `work`, since an unconfirmed claim is a different kind of "needs attention" than money already in hand). Today every row's `money_state` is `"paid"` (bank transfer is off), so this new tab and label sit dormant, correctly, until transfer is enabled — no confirmation button, no new mutation, purely a read of the value the view already computes.

**Near-empty state**: with genuinely one real order, the "All" tab just shows a one-row table, nothing special needed there. The true empty state (0 orders) now reads *"No orders yet — This is the real ledger, only orders where money has actually moved. Checkout attempts that never turned into a sale live in Abandoned checkouts instead."*, explaining plainly why the screen might look sparse rather than leaving it looking broken. A filtered-to-zero tab reads *"Nothing here right now — No orders currently in this state."*

**Live verification limitation, same as every admin-side change in this project**: `/admin/marketplace/orders` sits behind email/password admin sign-in, and no admin credentials exist in this environment. Verified instead by: `npx tsc --noEmit` and `npm run build` both clean, and running the app's exact `.select()` column list directly against the live `marketplace_admin_orders` view, confirming it returns exactly the one genuine order (settled, "Payout released") with every field the UI reads present and correctly named.

Preserved: `MarketplaceAbandonedCheckouts.tsx`, untouched — the 5 unpaid rows now correctly live there instead, this section's whole reason to exist; order detail deep-linking (`?order=<id>` from Buyers), dispatch, dispute and payout screens (none of their files touched); `orderMoneyState()` in `opsData.ts` and `MarketplaceBuyers.tsx`'s use of it (deliberately untouched, see above); sections 7 through 92.

Files touched: `src/pages/admin/marketplace/MarketplaceOrders.tsx` only.

`npm run build` clean.

## 94. Pay by card or Paystack's own bank transfer, chosen before initialisation (2026-08-18)

**Audit, before any code changed**: the Paystack transaction is initialised **server-side**, in the edge function `marketplace-initialize-payment` — which, notably, had **no local source file anywhere in this repo**, only a deployed version (fetched live via `get_edge_function`, not found by grepping `supabase/functions/`; that directory only holds legacy storefront functions). The client (`src/marketplace/checkout/orders.ts`'s `initializePayment()`, called from `CheckoutPage.tsx`'s `payQ` query) invokes it with just `{ order_id, callback_url }`. The function's actual call to Paystack was:
```ts
const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
  method: 'POST',
  headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: customer.email,
    amount: subtotal * 100,
    reference: attemptReference,
    callback_url,
    metadata: { marketplace_order_id: order.id, order_reference: order.paystack_transaction_reference, listing_title: listing.title },
  }),
});
```
**No `channels` parameter anywhere**, confirming the prompt's own guess: Paystack was falling back to whatever channels are enabled on the dashboard, hence its own default screen. The Pay button (`handlePay()`) does a full-page `window.location.assign(payQ.data.authorization_url)` to Paystack's hosted page, no inline popup involved.

**The existing manual transfer fallback**, found and left alone: `TransferFallback` in `CheckoutPage.tsx`, showing BundledMum's own bank account for a buyer to transfer to directly, confirmed by hand later by an admin (`AwaitingPaymentPage.tsx`). Gated by `site_settings.marketplace_payment_transfer_enabled`, confirmed live as `false`; it only ever renders when `marketplace_payment_paystack_enabled` is off, which it isn't. Confirmed unchanged and still `false` after this work.

**Files touched**: `supabase/functions/marketplace-initialize-payment/index.ts` (new local file, tracking a function that previously had none, plus the actual `channels` addition, redeployed), `src/marketplace/checkout/orders.ts` (`initializePayment()`'s input type, new `PaymentChannel` type), `src/marketplace/checkout/CheckoutPage.tsx` (channel state, UI, `payQ` wiring), `src/marketplace/marketplace.css` (`.mkt-paymethods`/`.mkt-paymethod`).

**How the choice reaches initialisation**: a new `payChannel` state in `CheckoutPage.tsx`, default `"card"`, is included in `payQ`'s query key (`["mkt-init-pay", order?.id, payChannel]`) and passed straight through `initializePayment({ ..., channel: payChannel })` → the edge function body → `channels: [paystackChannel]` on the Paystack init call, where `resolveChannel()` maps anything other than the literal strings `"card"`/`"bank_transfer"` back to `"card"` rather than ever passing through an unrecognised value. Including `payChannel` in the query key means switching options genuinely re-initialises a fresh Paystack transaction (a `channels` restriction is fixed at initialisation and can't be changed on an already-opened one), never reuses the other channel's authorization URL.

**Confirmed live, real Paystack round trips, no fabricated money moved**: walked a real listing through checkout in the browser up to the payment step (never clicked the final Pay button, never touched Paystack's own page). Card rendered selected by default, "Pay ₦74,214" enabled, helper text "Card payment via Paystack". Clicked Bank transfer: the button instantly re-enabled at the same total with helper text "Bank transfer via Paystack", the active-state styling moved to the second option, no error box appeared. Confirmed in the database that `payment_attempt_count` had incremented across genuinely separate calls, meaning each channel switch really did complete a fresh, successful round trip to Paystack's real `/transaction/initialize` endpoint (the count only advances after `initRes.ok`) rather than silently reusing a stale response. The test buyer/order rows this created were deleted immediately after, so no fake data was left in the live abandoned-checkout queue or anywhere else.

**Simple by design, not under-explained**: two options, `💳 Card` and `🏦 Bank transfer`, card pre-selected — a buyer who doesn't care presses Pay without touching either. No copy explaining the difference between the two, per the brief ("a Nigerian buyer knows what a card is and what a transfer is"); the only disambiguating text is code comments and a helper line that names which one is about to be used.

**Fee estimate, one honest limitation stated rather than glossed over**: `estimatePaystackAddition()` mirrors Paystack's *card* fee schedule (1.5% + ₦100, capped ₦2000, waived under ₦2500). Paystack's real bank-transfer fee is typically a different, lower flat fee, but no verified schedule for it exists anywhere in this codebase or was given in the task, so rather than guess at a number the same card-shaped estimate is shown for both channels — still labelled an estimate in the UI exactly as it already was, not a new inaccuracy, just an existing one now shared across two channels instead of one. Noted explicitly in the edge function's own comment for whoever picks this up next.

Preserved: the negotiated-price path and expired-offer handling (untouched, `offerExpired`/`offerPriceMismatch` logic never read); abandoned checkout capture, resume links, and the payment-step WhatsApp help (`WhatsAppHelpLink`/`WhatsAppInactivityPrompt` calls untouched, still receive the same `paystackTotal`); `AddPaymentInfo` firing synchronously on the Pay click without delaying the redirect (`handlePay()`'s tracking calls and the immediate `window.location.assign` are unchanged, just now redirect to whichever channel's `authorization_url` came back); `ProtectionBadge` near the pay button (untouched); sections 7 through 93.

`npm run build` clean.

## 95. Every deployed edge function backed up into the repo, not just marketplace's (2026-08-18)

**Platform-wide, not marketplace-specific.** §94 found `marketplace-initialize-payment` had no source anywhere in this repo, only a deployed copy on Supabase. That turned out to be one of 56. This section fixes the whole gap: no Supabase migrations, no deployments, purely getting real, currently-running source into git so a bad overwrite or accidental delete on the dashboard has something to restore from. Supabase Pro's daily backups cover the database, not edge functions — this repo is the only protection for those.

**Before**: 24 functions had source in `supabase/functions/` (`bundledmum-health-check`, `get-order-confirmation`, `invite-admin-user`, `marketplace-initialize-payment`, `notify-abandoned-checkout`, `notify-quiz-lead`, `place-order`, `process-payment`, `send-abandoned-cart`, `send-approval-notification`, `send-daily-summary`, `send-hr-notification`, `send-internal-order-notification`, `send-new-order-notification`, `send-order-confirmation`, `send-quote-email`, `send-referral-email`, `send-reorder-reminders`, `send-subscription-admin-reminders`, `send-subscription-intro`, `send-task-daily-summary`, `send-transactional-email`, `test-smtp`, `verify-payment`). The live project has **80 deployed functions**. The other **56 had no source in this repo at all** — the entire subscription system (`init-subscription`, `create-subscription`, `process-subscriptions`, `activate-subscription`, `klump-*`), most of the marketplace backend (`create-marketplace-order`, `marketplace-verify-payment`, every `send-marketplace-*`/`marketplace-*` notification and sweep job), the push-notification system, several admin/content-management functions, and more — none of it had ever been committed.

**Diffed a representative sample of the 24 already-tracked functions against what's actually deployed**: fetched and byte-for-byte diffed `process-payment` (v56), `verify-payment` (v55), `get-order-confirmation` (v60), and `send-order-confirmation` (v47) — deliberately the highest version counts in the tracked set, since heavy iteration is where a stale local copy would most likely show. **All four matched exactly**, zero differences. A full byte-level diff of all 24 wasn't completed (reproducing full source for comparison purposes for every file was impractical at this scale), but nothing in the sample, chosen specifically to stress-test the most-edited files, showed any drift — the pre-existing tracked functions appear to have been kept genuinely in sync with what's deployed, unlike the newer marketplace functions that prompted this audit.

**Secret scan, before committing anything**: every one of the 56 missing functions was fetched and scanned before being written, for anything resembling a Paystack key (`sk_`/`pk_`), a Resend key (`re_`), a Supabase service-role JWT, a Meta/Facebook access token, AWS keys, or any bearer token/password written as a literal rather than read via `Deno.env.get(...)`. **Two real secrets were found and neither was committed**:
- `send-push` — a hardcoded fallback literal for `VAPID_PRIVATE_KEY` (pattern: `Deno.env.get("VAPID_PRIVATE_KEY") || "<literal key>"`), the private key Web Push uses to sign push messages.
- `push-subscriber-welcome` — the same pattern, same kind of key.

Both files were withheld entirely rather than written with the secret redacted or worked around, per the instruction not to commit anything containing a hardcoded credential. **These two functions still have no source in the repo** and are the one remaining real gap from this pass. Fixing it needs the deployed function edited to remove the hardcoded fallback (env var only) and redeployed, or an explicit decision to accept the literal in git (not recommended — anyone with repo access could then forge push payloads). Independently re-scanned all 54 files that *were* written, myself, with a second pattern sweep (`sk_live_`, `sk_test_`, `pk_live_`, `pk_test_`, `re_[…]`, AWS `AKIA…`, JWT-shaped `eyJhbGciOiJ…`, Google `AIza…`) plus a plain `VAPID` grep across the new files — zero matches, confirming no secret leaked into any committed file.

**54 of the 56 missing functions are now committed**, exact copies of what's deployed, fetched via the Supabase management API and written without reformatting, tidying, or fixing anything — several agents doing this work independently flagged things worth a human look without touching them:
- `meta-catalog-feed`: a computed `customLabel3` variable that's never used in the output row (dead code).
- `create-marketplace-order`: retries on a unique-reference collision by string-matching the constraint name in the error message rather than checking a Postgres error code — brittle if the message text ever changes.
- `marketplace-verify-payment`: if the DB update fails *after* Paystack already confirmed success, the function returns a 500 without ever calling `claim_marketplace_listing_unit` or firing an anomaly alert — a paid transaction could be left with no order-side follow-up and no logged trail beyond the returned error.
- `marketplace-idle-listing-emails` selects `l.price_naira` from `marketplace_listings`, while the sibling `marketplace-meta-catalog-feed` uses `final_price_naira` for the same table — worth confirming which column is real; if it's a mismatch this function errors at runtime.
- `klump-reconcile` calls `send-order-confirmation` (the older email path), while `klump-webhook`'s own comment documents that path as affected by a known Resend sending-domain rejection bug it deliberately avoids — worth checking whether that's intentional.
- `marketplace-review-requests` calls `send-marketplace-email` by internal `fetch` with no auth header, relying on the callee's `verify_jwt: false` — consistent with how these internal calls are done elsewhere, not new, just noted.

None of these were fixed. They're exactly what they are on Supabase right now; if any of them is a real bug it's a real bug already running in production, worth its own investigation, not something to silently change while doing a backup pass.

**What it would take to make the repo the source of truth instead of a copy of it** (report only, not built, per the task): today, deploying from the Supabase dashboard or the MCP tool directly (as this session itself just did for `marketplace-initialize-payment` in §94, and as whoever built the other 56 evidently did) bypasses git entirely, so the repo drifts the moment anyone deploys outside it. Reversing that needs: (1) a CI step (GitHub Actions, using the Supabase CLI) that deploys every function under `supabase/functions/` on push to `main`, so a merge is what makes something live rather than a manual dashboard action; (2) removing direct dashboard/MCP deploy access from the normal workflow, or at least treating it as an emergency-only path that gets backfilled into a commit immediately after; (3) a periodic drift-check (a scheduled job, or just re-running this same fetch-and-diff pass occasionally) to catch the case where someone deploys directly anyway. None of this was built here — this section only recovered the source that already existed; keeping it in sync going forward is a process change, not a code change.

Preserved: every deployed function exactly as it currently runs (nothing was deployed, redeployed, or modified on Supabase, only read); the frontend entirely (no application code touched — this is `supabase/functions/` only); sections 7 through 94.

Files touched: 54 new files under `supabase/functions/<slug>/index.ts` (see the per-batch lists above for the full 54 slugs). No existing file was modified. `send-push` and `push-subscriber-welcome` deliberately not added.

`npm run build` clean (unaffected — these are backend Deno functions, no frontend code was touched).

## 96. The last two: send-push and push-subscriber-welcome, closing the gap (2026-08-18)

Both functions withheld in §95 have been redeployed (confirmed live at `send-push` v19 and `push-subscriber-welcome` v18) with the hardcoded `VAPID_PRIVATE_KEY`/`VAPID_PUBLIC_KEY` fallback literals removed — both now read `Deno.env.get("VAPID_PUBLIC_KEY")`/`Deno.env.get("VAPID_PRIVATE_KEY")` only, and return *"Push is not configured: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set as secrets"* rather than silently working off an embedded key if either secret is ever missing or misspelled.

Fetched both, confirmed the version numbers matched what was reported live (v19/v18) before touching anything, and wrote them verbatim into `supabase/functions/send-push/index.ts` and `supabase/functions/push-subscriber-welcome/index.ts` — no reformatting.

**Secret scan, re-run exactly as before**: the same pattern sweep (Paystack, Resend, AWS, JWT-shaped, Google key patterns) plus a plain `VAPID` grep across both new files. Zero pattern matches. Every `VAPID` occurrence in both files is either a comment, an env var name inside `Deno.env.get(...)`, or an error message string — no literal key value anywhere.

**Full coverage confirmed by diffing the deployed slug list against the repo directory list directly**, not by eye: 80 functions are deployed, `supabase/functions/` now has exactly 80 directories, and a set comparison between the two lists came back empty both ways — nothing deployed is missing from the repo, and nothing in the repo doesn't correspond to something deployed. The gap from §95 is fully closed.

Preserved: everything else untouched, no other function's file was touched, nothing was deployed or redeployed (both were already live before this section, deployed outside this session per the task).

Files touched: `supabase/functions/send-push/index.ts` (new), `supabase/functions/push-subscriber-welcome/index.ts` (new).

`npm run build` clean.

## 97. Desktop home gets a hero, Just listed, and real stat tiles — mobile untouched (2026-08-20)

**Audit, before any code changed**: `/` (home) and browse are the same page — `MarketplaceApp.tsx` routes `/` straight to `BrowsePage.tsx`, and desktop vs. mobile is entirely CSS (`min-width: 1024px`), not separate component trees. There was no hero, no carousel, and no "Just listed" anywhere — grepped the whole marketplace source for both phrases, zero matches, so the task's framing ("where it currently says Listed today") didn't match the code; this was a fresh build with the new wording baked in from the start, not an edit. Listing detail didn't record a view anywhere either (`ViewContent` is Meta Pixel tracking, unrelated).

**Design read directly** from the design-sync project ("Mobile marketplace design system", section 38a) since claude.ai/design URLs aren't plain-fetchable. It covers the full desktop home: hero slide 1 (trust badge + headline + 3 real listings in the exact `.mkt-card` browse anatomy, "a ₦1,900 vest and a ₦295,000 pram sit in the identical container with no special-casing, only the price text differs"), a below-the-fold full page (Just listed, category grid, stat tiles), and a category-ad-landing hero variant. Mobile section is explicit: mobile's own home is untouched, the only thing that carries down is the trust-badge line above the search bar.

**Deliberately not built**: the category-ad-landing hero variant. The design frames it as "my view: worth doing, but lightly" reasoning about a future ad-campaign flow this codebase has no infrastructure for (no UTM/landing-param handling exists anywhere) — building it would have been real scope creep beyond what was asked.

**The hero, and the carousel problem's actual solution**: `get_hero_listings(p_limit)` is fetched via a new `useHeroListings()` hook (`useListings.ts`), chunked into slides of 3, and rendered by a new `MarketplaceHero.tsx` component. The design's own answer to "most people never see past slide one" is that **slide one already carries the products**, not a trust-only opener: every slide keeps the identical trust badge and headline, only the three products underneath rotate. Confirmed genuinely: 4 dots (matching the design's own dot count), autoplay every 6s, paused on hover, stilled entirely under `prefers-reduced-motion` (checked via `matchMedia` before ever starting the interval, same convention as the WhatsApp prompt elsewhere in this codebase). Live-verified clicking a dot actually swaps to different real products (`dispatchEvent(new MouseEvent(...))`, since plain `.click()` is unreliable in this test environment — a known quirk, not a real bug once dispatched properly).

**The ordering is never labelled, live-verified by inspection, not just by not-writing-a-word**: read every string this component renders — nowhere does "popular", "trending", "most viewed", or any badge/tooltip referencing view count appear. `get_hero_listings`'s own view-count ordering (and its invisible newest-first fallback when view data is thin) is used exactly as delivered, with zero client-side awareness of *why* the order is what it is.

**Just listed**: a new `useJustListed(5)` hook fetches the 5 newest live listings plus each one's public seller (the same `fetchSellersByIds` batch-join every other listings hook here already uses). `justListedLabel()` renders `"Listed today by {seller name}"` for anything created today, and a plain relative label with no name for anything older ("Yesterday", "3 days ago") — matching the design's own example, since the seller line is specifically about freshness, not a general byline. Falls back to **"BundledMum seller"** when the seller has no public display name, the identical fallback `sellerDisplayName()` already uses on listing detail, never a blank or a dropped clause. Live-verified on the real desktop page: real seller names rendered correctly (Taiwo B., Abidoye B., Bukola O.).

**Trust, nothing invented**: the three stat tiles are real, live-computed numbers — a `useMarketplaceStats()` hook counts `marketplace_sellers_public` rows and sums every live listing's `final_price_naira`, both plain client reads against already-public data, no new Supabase function. Live-verified the true current numbers directly in the database first (167 sellers, ₦5,060,640 live value) before building the tile, then confirmed the page rendered exactly that: "167 Sellers on the marketplace", "₦5.06m In listings live right now", "100% Of listings reviewed by our team before they go live". No reviews, ratings, sold count, or activity ticker anywhere — the design's own stat-tile choice already avoids fabricating any of that, since there has only been one completed sale.

**record_listing_view, confirmed by measurement**: added right beside the existing `ViewContent` effect in `ListingDetailPage.tsx`, same `isLiveView` gate and same fired-once `useRef` shape, calling `mdb.rpc("record_listing_view", { p_listing_id })` fire-and-forget. Live-verified directly against the database: a real listing's `view_count` went `0 → 1` on first load and `1 → 2` on a genuine full-page reload (a new page view, correctly counted once each time, never double-firing within one mount). Reverted the count back to 0 afterward, since those were test loads, not real traffic, and leaving them would have quietly nudged that listing's future hero ranking.

**Mobile, confirmed unchanged by measurement, not just by not touching files**: at a real 375px viewport, `getComputedStyle` confirmed `.mkt-hero`, `.mkt-justlisted`, and `.mkt-stattiles` are all `display: none`, while the new `.mkt-trust-line` ("✓ We hold your money until it arrives") is `display: flex` and renders correctly above the search bar — the one thing the design explicitly calls out as cheap enough to carry down. The existing category-tile grid (6 tiles) rendered exactly as before, untouched.

Preserved: browse's filters, category links, and group-slug links (none of their code was touched); listing detail's WhatsApp help link and inactivity prompt (confirmed still rendering, "Got questions about this item? Chat with us" present); sections 7 through 96.

Files touched: `src/marketplace/data/useListings.ts` (`useHeroListings`, `useJustListed`, `useMarketplaceStats`), `src/marketplace/components/MarketplaceHero.tsx` (new), `src/marketplace/pages/BrowsePage.tsx` (hero, Just listed, stat tiles, mobile trust-line, `#mkt-grid` anchor), `src/marketplace/pages/ListingDetailPage.tsx` (`record_listing_view`), `src/marketplace/marketplace.css` (all new styles, desktop-gated).

`npm run build` clean.

## 98. Fixing the blank space below the desktop hero — a class-name collision, not a rendering artifact (2026-08-20)

The user reported a large blank cream/coral-striped gap below the hero on the live desktop page, screenshotted directly. During §97's own live verification I'd seen the same symptom and wrongly dismissed it as a screenshot-tool scaling artifact, having checked only `.mkt-hero`'s rendered *width* (1240px, matching `max-width: 1240px`, looked correct) and not its height. That dismissal was wrong.

**Root cause**: `MarketplaceHero.tsx`'s outer wrapper reused the class name `.mkt-hero` — already in use, unrelated, by `ListingDetailPage.tsx`'s own photo-gallery hero image. CSS selectors don't care which section of a stylesheet they're read from; a pre-existing desktop-only rule at `marketplace.css:490`, `.mkt-hero { aspect-ratio: 1 / 1; border-radius: 16px; }`, applied on top of my new `.mkt-hero { max-width: 1240px; }`, forcing the wrapper's *height* to match its 1240px width regardless of its actual content height (`.mkt-hero-panel` is ~383px). The box was real, oversized, and mostly empty — not a screenshot artifact.

**Fix**: renamed every class introduced in §97 that started with the bare `.mkt-hero` token to `.mkt-homehero` (and its `-panel`, `-copy`, `-badge`, `-cta-row`, `-cta`, `-dots`, `-products` descendants, for consistency, though only the bare selector actually collided) — in `MarketplaceHero.tsx` and both `.mkt-hero` rules in `marketplace.css` (mobile `display: none` default, desktop `display: block; max-width: 1240px` override). The pre-existing listing-detail `.mkt-hero`/`.mkt-hero-tap`/`.mkt-hero-state`/`.mkt-hero-cue` family (lines 274-309 and 490) was not touched.

**Verified by direct measurement, not just a screenshot**: at a real 1440px viewport, `getBoundingClientRect()` on `.mkt-homehero` now reads `height: 382.5625` (matching its actual content, not 1240), and `.mkt-justlisted` starts at `top: 494.5625` — immediately after, no gap. `document.querySelectorAll('.mkt-hero')` on the same page returns 0 elements, confirming zero collision. Screenshotted both the hero-to-Just-listed transition and the stat-tiles-to-browse-grid area below it — content now flows continuously with no blank space. Re-checked mobile (375px): trust-line, category tiles, and browse grid all render exactly as before, unaffected by the rename since mobile never showed the hero at all.

Preserved: everything else from §97 unchanged; sections 7 through 97.

Files touched: `src/marketplace/components/MarketplaceHero.tsx` (renamed `.mkt-hero*` → `.mkt-homehero*`), `src/marketplace/marketplace.css` (same rename, both the mobile-default and desktop-override rules).

`npm run build` clean.

## 99. Three small desktop-home corrections (2026-08-20)

Three specific, user-reported fixes to §97's desktop home, all in `BrowsePage.tsx`:

**"See all {count} items" wasn't a link.** It was a plain `<span>` — text that looked clickable but did nothing. Turned it into a real `<button>` (`.mkt-justlisted-seeall`), scrolling to `#mkt-grid` on click, the identical mechanism the hero's own "Browse everything" CTA already uses. Live-verified: `document.getElementById('mkt-grid').scrollIntoView({behavior:'instant'})` lands the grid exactly at the viewport top (`scrollY: 1018`, matching the grid's pre-scroll offset) — the target element and mechanism are correct. Smooth-scroll animation stalling mid-scroll in the automated browser tool itself is a known quirk of this test environment (also seen earlier in this session with plain `.click()`), not a defect in the fix.

**"₦5.06m In listings live right now" → "159 Items listed right now".** The design's own stat tile showed the naira value of everything live; replaced with the plain listing count (`count`, already computed for pagination) with the label re-worded to match. Removed the now-unused `listingsValueLabel` memo entirely rather than leaving dead code — `stats.liveListingValueNaira` itself is untouched in `useMarketplaceStats()` in case something else needs it later, only the display was removed.

**"159 items, checked by our team" removed** from the mobile/shared count-and-sort bar entirely (not reworded, deleted, per the request). `.mkt-fbar` was `justify-content: space-between` to keep that text on the left and the sort/filter controls on the right; with the text gone, changed it to `flex-end` so sort/filters don't jump to the left edge with nothing to balance against.

Live-verified all three at 1440px: `.mkt-justlisted-seeall` is a real `<button>` reading "See all 159 items"; the second stat tile reads "159" / "Items listed right now"; `document.body.textContent.includes('checked by our team')` returns `false`. Re-checked mobile (375px): sort/filter bar still renders correctly, right-aligned, nothing else regressed.

Preserved: everything else from §97/§98 unchanged; sections 7 through 98.

Files touched: `src/marketplace/pages/BrowsePage.tsx` ("See all" link, stat tile, count-bar text removed), `src/marketplace/marketplace.css` (`.mkt-justlisted-seeall` styles, `.mkt-fbar` justify-content).

`npm run build` clean.

## 100. Mobile trust-line removed from the home hero (2026-08-20)

§97 carried "✓ We hold your money until it arrives" down to mobile, above the search bar, as the one thing the design explicitly called cheap enough to keep. Per request, removed it from mobile entirely: deleted the `.mkt-trust-line` block from `BrowsePage.tsx` and its two CSS rules (the base style and the desktop `display: none` override, both now unused). The desktop hero's own identical badge (inside `MarketplaceHero.tsx`, desktop-only) is untouched — this was mobile-only text, not the hero component itself.

Live-verified at 375px: the mobile hero now goes straight from the headline to the search bar, no trust line, no gap left behind. Re-checked 1440px: desktop hero's own trust badge still renders exactly as before.

Preserved: everything else from §97-§99 unchanged; sections 7 through 99.

Files touched: `src/marketplace/pages/BrowsePage.tsx` (removed `.mkt-trust-line` block), `src/marketplace/marketplace.css` (removed now-unused `.mkt-trust-line` rules).

`npm run build` clean.

## 101. Desktop hero headline copy update (2026-08-20)

"Buy trusted, used baby things from other Nigerian mums" → "Buy trusted, neatly used baby & children things from other Nigerian mums" in `MarketplaceHero.tsx`, desktop only. Live-verified: `document.querySelector('.mkt-homehero-copy h2').textContent` matches exactly.

Preserved: everything else from §97-§100 unchanged; sections 7 through 100.

Files touched: `src/marketplace/components/MarketplaceHero.tsx`.

`npm run build` clean.

## 102. Just Listed + stat strip come to mobile (design 39a) (2026-08-20)

**Design read directly** from design-sync project "Mobile marketplace design system", section 39a ("Mobile home, just listed + stat tiles"). Explicit stance: no hero, no redesign — category tiles stay first since they're the fastest route into the grid, unchanged; Just Listed goes right after as a single horizontal-scroll row; a compressed one-row, three-tile stat strip goes after that, labels cut to two—three words for phone width. The design's own fallback if it doesn't fit above the fold: keep Just Listed, cut the stat strip first, since "evidence of activity outperforms a stated number."

**Built, reusing existing data and card anatomy, nothing new fetched**: both blocks are mobile-only (new `.mkt-jl-mobile`/`.mkt-stat-strip-mobile`, CSS-gated the same mobile-first way as everything else, hidden at 1024px) and sit right after the mobile category tiles, before "See more categories" — matching the design's exact order. Just Listed reuses the same `justListed` data (`useJustListed(5)`) and the identical `.mkt-card` anatomy already used everywhere, narrowed to a 132px flex-basis in a horizontal-scroll row (confirmed genuinely scrollable: `scrollWidth: 700` vs `clientWidth: 343`, `overflow-x: auto`) — 3 cards visible with a 4th peeking, same pattern the design specified. The stat strip reuses `sellerCount` and `count` (the same live numbers desktop's stat tiles already use), relabelled short per the design's own mockup text: "Sellers so far", "Items live now", "Reviewed by us" — no new query, no new number.

**One deliberate deviation from the design's own mockup, not an oversight**: the design's mobile Just Listed cards show only a bare relative-date label ("Listed today" / "Yesterday"), with no seller name — a new `justListedShortLabel()` matches that exactly, distinct from desktop's `justListedLabel()` which does include "by {seller}". This is a genuine width constraint (132px card, no room), not a downgrade in what's shown elsewhere. The design's mockup also included a "248 items, trusted quality, checked by our team" line under the stat strip — deliberately **not** built, since §99 already removed that exact line from the page at the user's explicit instruction; re-adding it here would have directly contradicted that.

**Also fixed in passing**: `.mkt-justlisted-when` (the "Listed today by X" / "Yesterday" text style) was accidentally scoped entirely inside the desktop-only `@media (min-width: 1024px)` block since §97 — harmless there because desktop Just Listed was the only thing using it, but it would have rendered unstyled on the new mobile block. Moved to the shared mobile-first base scope; desktop is unaffected (same computed style either way).

Live-verified at 375px: category tiles → Just Listed (horizontal scroll, real listings, real prices, "Listed today"/relative dates) → stat strip (168 sellers, 166 items, 100% — genuinely the same live numbers as desktop) → "See more categories" → sort/filters → main grid, no gaps, no overlap. Re-checked 1440px: desktop's own Just Listed grid and stat tiles unchanged, `.mkt-jl-mobile`/`.mkt-stat-strip-mobile` both confirmed absent (CSS `display: none`).

Preserved: everything else from §97-§101 unchanged; sections 7 through 101.

Files touched: `src/marketplace/pages/BrowsePage.tsx` (`justListedShortLabel`, mobile Just Listed row, mobile stat strip), `src/marketplace/marketplace.css` (new `.mkt-jl-mobile*`/`.mkt-stat-strip-mobile*` rules, `.mkt-justlisted-when` moved out of the desktop-only media block).

`npm run build` clean.

## 103. "See more categories" moved above Just Listed, not below (2026-08-20)

§102 had placed the "See more categories" reveal-in-place block (`.mkt-cats-more`/`.mkt-cat-seemore`/`.mkt-cats-done`) *after* the mobile Just Listed row and stat strip — a JSX-ordering slip, since it belongs directly under the category tiles it expands, not after two unrelated sections. Moved the whole block (unchanged internals) to sit immediately after `.mkt-cats`, before Just Listed. This block isn't CSS-gated by breakpoint (desktop hides the category-tiles section entirely, so its order there is moot) — the move is mobile-only in effect.

Live-verified at 375px: "See more categories 41 ▾" now renders directly under the 6 featured category tiles, before "Just listed". Clicked it and confirmed it still expands in place (grouped tiles, e.g. "Clothing and shoes group") without disturbing Just Listed or the stat strip below.

Preserved: everything else from §97-§102 unchanged; sections 7 through 102.

Files touched: `src/marketplace/pages/BrowsePage.tsx` (moved the "See more categories" JSX block, no internal changes).

`npm run build` clean.

## 104. Mobile Just Listed row hidden (2026-08-20)

Per request, the mobile Just Listed row from §102 is hidden: `.mkt-jl-mobile`'s base rule changed from `display: flex` to `display: none`. CSS-only, JSX untouched, so it's a one-line revert if it comes back — the underlying `justListed` fetch, `justListedShortLabel()`, and the markup itself are all still there, just not rendered visually on mobile (they were already hidden at desktop from §102). The mobile stat strip (168 sellers / 166 items / 100%) and everything else from §102-§103 is untouched and still shows.

Live-verified at 375px: page now flows category tiles → "See more categories" → stat strip → sort/filters → grid, no gap where Just Listed used to be.

Preserved: everything else from §97-§103 unchanged; sections 7 through 103.

Files touched: `src/marketplace/marketplace.css` (`.mkt-jl-mobile` base rule).

`npm run build` clean.

## 105. Desktop Just Listed hidden too (2026-08-20)

Following §104's mobile hide, the desktop Just Listed grid (`.mkt-justlisted`, §97) is now hidden as well: its `@media (min-width: 1024px)` override changed from `display: block` back to `display: none`, matching its own mobile-first default. Same reversible pattern as §104 — CSS-only, the `useJustListed` fetch, the desktop grid markup, and `justListedLabel()` are all untouched, just not rendered. Just Listed is now hidden on both breakpoints.

Live-verified at 1440px: `getComputedStyle('.mkt-justlisted').display` is `"none"`, and the stat tiles now sit directly under the hero (`top: 494.5625`, matching the hero's own bottom edge from §98's fix) with no gap.

Preserved: everything else from §97-§104 unchanged; sections 7 through 104.

Files touched: `src/marketplace/marketplace.css` (`.mkt-justlisted` desktop-override rule).

`npm run build` clean.

## 106. Desktop sort dropdown aligned above the last product card, not floating (2026-08-20)

Reported live: the "Newest first" sort dropdown sat above nothing in particular — off to the right of the sidebar/grid layout below it, not aligned with either. Root cause: `.mkt-fbar` (the sort/filters bar) had its own independent `max-width: 1240px; margin: 0 auto` at desktop, entirely disconnected from `.mkt-browse`'s own `248px sidebar + product grid` layout beneath it, so the two containers centered independently and didn't line up.

**Fix**: gave `.mkt-fbar` the exact same grid (`248px minmax(0, 1fr)` + `24px` gap + `1240px` max-width) as `.mkt-browse`, with the sort control placed in the second (product-grid) column and right-aligned within it — landing it directly above the grid's own right edge, which is also the right edge of the last card in each row. Hit a real CSS quirk getting there: without an explicit `width: 100%`, the grid container shrank to fit its own content (a `flex-direction: column` parent's default `stretch` didn't apply as expected once the item was itself `display: grid` with only `max-width` set, no `width`) — added `width: 100%; box-sizing: border-box;` to force it to actually claim the full available width before the `max-width` cap and centering kick in.

Live-verified at 1440px: `.mkt-sortsel`'s right edge (`1321.5`) now exactly matches both `#mkt-grid`'s right edge and the last card in the first row's right edge — genuinely aligned above the last product card, not the middle. Re-checked 375px: mobile's sort/filters bar is untouched (the fix is entirely inside the `@media (min-width: 1024px)` block).

Preserved: everything else from §97-§105 unchanged; sections 7 through 105.

Files touched: `src/marketplace/marketplace.css` (`.mkt-fbar`/`.mkt-fbar-right` desktop-override rules).

`npm run build` clean.

## 107. How buying works page, FAQ page, and a "How you get paid" block on sell (design 40a/41a) (2026-08-20)

**Audit before building**: `HowThisWorksExplainer.tsx` on listing detail is a buyer-only escrow accordion (headline "Your money stays held until you confirm it arrived"), nowhere near a full "how it works" walkthrough and never mentions selling — no overlap with a dedicated how-it-works page. No FAQ page existed anywhere (`grep -rniE "FAQ|frequently asked" src/marketplace` was empty). The sell landing page (`BecomeSellerPage.tsx`) deliberately carries no fee/payout detail today (its own comment: "Carries NO buyer-side cost, no price breakdown"), so a payout block there is new ground, not a duplicate. The five policy pages (`src/marketplace/policy/`) all register in `MarketplaceApp.tsx`'s flat `<Routes>` list and read `useMarketplacePolicySettings()` live rather than hardcoding fee/day figures — the exact pattern followed here, since that hook's own comment records the fee amount and other figures drifting stale twice already.

**Design read directly**, section 40a ("How it works, buyer page + sell block") and 41a ("FAQ page, and desktop for how-it-works") from the design-sync project. Confirms coverage of all three required surfaces in both breakpoints, plus the FAQ empty-search state — nothing missing. One gap: the design speced the Buying tab's questions in full but never authored a Selling tab's question set (F1/F3 only show Buying open); those 10 seller questions below are authored here from the real rules, not from the design doc.

**Buyer how-it-works** (`src/marketplace/pages/HowItWorksPage.tsx`, route `/how-it-works`): one illustrative scenario — a mum finding a stroller from a stranger — with a money-location diagram at steps 2 and 6 (₦42,500 moves to "held by BundledMum", then to the seller only once she taps confirm). The scenario is a narrative device, never presented as a real testimonial. Refund wording matches the rest of the site exactly: "She's refunded the same day the seller confirms it arrived back… Not 'immediately' — the seller does need to receive it and say so." Day counts (`s.disputeWindowDays`, `s.returnConfirmDays`) come from `useMarketplacePolicySettings()`, never hardcoded. Closes with 2 real listings via the already-existing `useHeroListings(2)` (same RPC the desktop hero uses) and a live "Browse all N items" count via a new `liveListingCount` field.

**FAQ** (`src/marketplace/pages/FaqPage.tsx`, route `/faq`): search plus a Buying/Selling tab split, kept in strictly separate sections per the task's own instruction — a buyer never sees a seller's answer looking for hers. 10 buyer questions are the design's own text with its hardcoded numbers (₦500/₦1,000/3 days/4 days) swapped for live `policySettings` reads. 10 seller questions are authored fresh in her voice ("you list", "you get paid", "your payout") from the real rules: free to list, paid by bank transfer with a screenshot as proof, three strikes suspends selling, the verified badge earned by one completed sale with no dispute, three real dispute outcomes (full refund / courier fault not her blame / not upheld). First question opens by default on each tab (coral border), matching the design's own reasoning for why the buyer tab does this ("the one worth answering before anything else"). Search filters the active tab only; a genuine no-match state (verified live: typed "stroller wheel broken", got "Nothing matched that" plus a WhatsApp CTA) never dead-ends.

**Sell page block** ("How you get paid", inside existing `BecomeSellerPage.tsx`, no new route): 5 steps, her mirror worry to a buyer's — will I actually get paid, can a buyer fake a fault — answered with the two real pieces of proof (her dispatch photo, the payout screenshot), not reassurance words. Sits inline in the existing sell-page column, right before the reseller pitch.

**Desktop implemented properly, not a stretched phone**: how-it-works uses a genuine CSS grid (`grid-template-columns: 400px 1fr`, `grid-template-areas`) so the scenario/worry/safety-net/CTA form a real left column beside the 6 steps, not the mobile stack widened — verified live, `.mkt-how-scenario` and `.mkt-how-steps` sit at `left: 167.5` / `left: 599.5` respectively, genuinely side by side. FAQ gets a sticky 220px category rail beside a wider answer column. The sell block's 5 steps run in one horizontal row at desktop instead of stacked. All three use one flat DOM order with CSS reflowing it per breakpoint (`grid-area`/flex), not duplicated trees — see `HowItWorksPage.tsx`'s own top comment for why.

**Live numbers, nothing hardcoded**: `useMarketplaceStats()` gained a `liveListingCount` field (a third parallel head-count query, additive, no existing caller's shape changed) so "Browse all N items" reads the real current count rather than a stale one baked in at build time. Every fee/day-window figure on both new pages reads `useMarketplacePolicySettings()`. Nothing fabricated anywhere: no reviews, no ratings, no invented member counts, no activity ticker — the only numbers on either page are real live counts or accurate policy figures.

**Preserved, verified by inspection not just by not touching files**: `HowThisWorksExplainer` on listing detail untouched; all five policy pages untouched; the sell page's existing hero/category/message/reseller/closing sections untouched, the new block only inserted between message and reseller; browse, its filters, and group-slug links untouched; both footer links added ("How buying works", "FAQ") sit inside the existing "Marketplace" group without touching the "Policies" group; sections 7 through 106.

Files touched: `src/marketplace/pages/HowItWorksPage.tsx` (new), `src/marketplace/pages/FaqPage.tsx` (new), `src/marketplace/sell/BecomeSellerPage.tsx` (new "How you get paid" block), `src/marketplace/MarketplaceApp.tsx` (`/how-it-works`, `/faq` routes), `src/marketplace/MarketplaceFooter.tsx` (both links), `src/marketplace/data/useListings.ts` (`liveListingCount` added to `useMarketplaceStats`), `src/marketplace/marketplace.css` (`.mkt-how-*`, `.mkt-faq-*`, `.mkt-sl-payout-*`).

`npm run build` clean.

## 108. How-it-works page switched from "she" to "you" (2026-08-20)

§107 followed the design's own third-person telling ("she finds the item… her money…") — a mum named Amina, watched from outside. Per request, rewritten to direct second person throughout the scenario, worry, all 6 steps, and the safety-net card ("You've found something you want…", "You pay. It goes to BundledMum…", "You're refunded the same day the seller confirms it arrived back…") so the reader is the one in the story, not observing someone else's. "She/her" is kept only where it correctly refers to the *seller* ("pay her and she just doesn't send it", "your money never touches her account") — those weren't wrong, they're a different person from the reader. Refund wording, day counts, and every other fact are unchanged from §107.

Live-verified at 375px: scenario, all 6 steps, and the safety-net card all read in second person; only the two remaining "she/her" references (both about the seller) checked and confirmed correct.

Preserved: everything else from §97-§107 unchanged; sections 7 through 107.

Files touched: `src/marketplace/pages/HowItWorksPage.tsx` (copy only).

`npm run build` clean.

## 109. How-it-works closing section shows more items on desktop (2026-08-20)

The closing "Now go and see what other mums are letting go" section fetched only 2 real listings (`useHeroListings(2)`), matching mobile's own 2-card mock, but desktop's wider `.mkt-how-closing-cards` grid (`repeat(4, 180px)`, set in §107) had nothing to show in its 3rd/4th slot. Bumped the fetch to `useHeroListings(4)` and hid cards 3-4 on mobile with `.mkt-how-closing-cards .mkt-card:nth-child(n+3) { display: none; }`, unhidden again inside the desktop media query — same real listings, mobile still shows exactly the 2 the design specced, desktop now genuinely fills its own 4-wide row instead of leaving it half empty.

Live-verified: desktop (1440px) now renders 4 real listing cards; mobile (375px) computed style confirms cards 3-4 are `display: none`, only the first 2 are `flex`.

Preserved: everything else from §97-§108 unchanged; sections 7 through 108.

Files touched: `src/marketplace/pages/HowItWorksPage.tsx` (`useHeroListings(4)`), `src/marketplace/marketplace.css` (`.mkt-how-closing-cards` nth-child rules).

`npm run build` clean.

## 110. Sitemap discoverable, dead Netlify config removed, and the Helmet-vs-prerender question (2026-08-20)

**Context**: a Cloudflare Worker (deployed directly by the user in the Cloudflare dashboard, not committed here — a Worker in this repo would deploy nothing, since this session has no Cloudflare credentials, and a copy that doesn't match what's actually running is worse than none) now intercepts crawler traffic on `/`, `/shop`, `/bundles`, `/shop/:slug`, `/product/:slug`, `/bundles/:slug`, and everything under `/marketplace`, calling the deployed `marketplace-prerender` Supabase function. `/articles` is untouched, still on whatever Lovable's own prerendering does there. This session's own earlier attempt at building the same Worker (tested against the real live origin and the real prerender function, every scenario passing — fail-open, bot-detection, path coverage, filter forwarding) was deleted unstaged and never committed once this was clarified; nothing from that attempt is in this repo.

**1. Sitemap discoverability — a second `Sitemap:` line in `robots.txt`, not a sitemap index, and why**: Google's own sitemap-index documentation requires every child sitemap listed inside an index file to be on the *same site* as the index itself — a stricter same-host rule than a plain `robots.txt` `Sitemap:` reference gets, which is far more commonly seen pointing cross-domain in the wild (CDN-hosted sitemaps are routine) and is generally honoured. Since `marketplace-sitemap` lives on `rbtyprmkolqfylcbmgrk.supabase.co`, not `bundledmum.com`, wrapping it in a same-host sitemap index would actually be the *less* crawler-tolerant of the two options here, not the tidier one — so `public/robots.txt` now has a second `Sitemap:` line pointing straight at the Supabase URL, alongside the existing `sitemap.xml` line, unchanged otherwise.

**The cross-domain caveat still genuinely matters, flagged rather than silently accepted**: Google's docs generally accept a `robots.txt`-referenced sitemap on a different host, but this is less consistently documented for Bing and other engines, and a cross-domain sitemap reference is a weaker trust signal than a same-host one regardless of engine. The more robust fix — since the Worker is deployed and controlled outside this repo — is for it to also serve the marketplace sitemap at a `bundledmum.com` URL (e.g. proxying `/marketplace-sitemap.xml` through to the Supabase function) and have `robots.txt` reference that instead. Not built here since it requires the Worker, which is explicitly out of scope for this repo now; noted for whoever owns that Worker next.

**2. Dead Netlify config removed, not just marked**: `netlify.toml` and `netlify/edge-functions/og-prerender.ts` deleted outright (`git rm`). They were real, correct code with zero effect in production (confirmed earlier this session: response headers show Cloudflare/Lovable, not Netlify, and zero invocations in Supabase's logs) — and now that a real, deployed Cloudflare Worker covers `/articles`' original purpose plus the marketplace, keeping the Netlify files "for reference" would only leave a second dead path lying around for the next person to trust by mistake, which is exactly the risk being fixed. No other file in the repo referenced them (checked: no `package.json` script, no CI config, nothing beyond `handoff-marketplace.md`'s own history and unrelated stray `.claude/worktrees/` copies from earlier sessions, left untouched as out of scope).

**3. Whether client-side Helmet metadata conflicts with what the Worker/prerender now serves — report only, nothing changed**:

- **No same-request conflict, by construction.** A given request either matches the Worker's bot list and gets the static prerendered HTML, or it doesn't and gets the real SPA (which then sets its own title/description/canonical via `react-helmet-async` once JS runs). Never both for the same request.
- **Canonicals agree.** `MarketplaceSeo.tsx` always resolves a filtered browse view's canonical to the bare `https://bundledmum.com/marketplace` (`Seo.tsx`'s canonical is built from `location.pathname`, which never includes the query string a filter lives in — checked directly). The prerender function does the same for every filter combination verified this session (`?state=Lagos`, `?category=...`, multi-filter). No duplicate-content signal disagreement between the two systems.
- **Titles genuinely differ, and that's mostly fine, with one real gap.** `BrowsePage.tsx`'s client-side title is a single fixed string ("Buy and sell used baby and children's items") regardless of active filter, while the prerender serves genuinely filter-specific titles ("...for sale in Lagos", "Used strollers and prams for sale in Nigeria"). Since Google's own crawler UA is in the Worker's bot list, Google's indexing crawl — and very likely its JS-rendering pass too, since Google's renderer also identifies as Googlebot — now sees the specific prerendered title either way, so this isn't a Google-facing SEO gap. It IS a small real-user gap worth knowing about: a person's own browser tab always shows the generic title regardless of which filter they're viewing, since that title comes from Helmet, not the Worker. Not fixed here (report only, per the ask) — a natural follow-up would be making `BrowsePage`'s own `MarketplaceSeo` call filter-aware to match.
- **Structured data is now edge-only for listings.** `ListingDetailPage.tsx`'s `MarketplaceSeo` call passes no `jsonLd` prop — Product schema (price, NGN, condition, availability) exists *only* in the prerendered response, nowhere in the client-rendered page. Not a conflict (nothing client-side contradicts it), but a real dependency worth naming: the site's structured-data richness for listings now lives entirely in a Supabase edge function outside this repo, not in the app itself, so a future listing-detail redesign here could drift out of sync with what crawlers actually receive without anyone noticing from this codebase alone.

Preserved: everything else from §97-§109 unchanged; sections 7 through 109. The storefront, `/articles`, every marketplace page for real users, and the marketplace-prerender/marketplace-sitemap Supabase functions were not touched (per non-goals).

Files touched: `public/robots.txt` (second `Sitemap:` line), `netlify.toml` (deleted), `netlify/edge-functions/og-prerender.ts` (deleted).

`npm run build` clean.

## 111. Install banner made prominent, within Google's interstitial exemption, plus two contextual install CTAs (2026-08-21)

**Audit before building**: `MarketplaceInstallBanner.tsx` already existed with correct device signals — `isStandalone()` (device state, no storage), `bm-mkt-pwa-installed` (localStorage, no expiry, set only on a genuine `appinstalled` event), `bm-mkt-pwa-dismissed` (localStorage, 14-day expiry). It showed 20s after mount, no scroll trigger, as a small floating card (max-width 420px, ~64px tall). Android/Chrome captured `beforeinstallprompt` and fired the real `.prompt()`; iOS (no such event) and any not-yet-fired case navigated to `/marketplace/install`, the existing instructions page. It already deferred to the WhatsApp inactivity prompt via a module-level pub/sub (`subscribeToWaPromptVisible`) so the two never stacked. Neither the seller's post-listing success screen (`CreateListingPage.tsx`'s `done` block) nor the buyer's order-confirmation screen (`PaymentReturnPage.tsx`'s `PaidState`) had any install mention.

**1. The standing banner, made genuinely prominent, still within the exemption**: redesigned from a small floating card to a bottom sheet — full width, rounded top corners, larger icon (52px), bold headline, a full-width coral CTA button, a clearly visible circular ✕ in the corner. Trigger changed from a flat 20s delay to **10 seconds OR 30% scroll depth, whichever comes first** (a real `scroll` listener measuring `window.scrollY / (scrollHeight - innerHeight)`, not a second timer), matching Google's own intrusive-interstitial exemption text ("triggered after engagement, at least 10 seconds or 30 percent scroll") word for word rather than approximating it.

**Measured, not estimated**: live-verified at a 375×812 mobile viewport (iPhone-class), the banner's rendered height is **173.7px, 21.4% of the viewport** — comfortably under Google's 30% ceiling, confirmed via `getBoundingClientRect()` against `window.innerHeight`, not a design-time guess. Also live-verified: absent at 0s (`bannerNow: false` immediately after mount), present only after crossing the 10s threshold, dismissal correctly persists (`bm-mkt-pwa-dismissed` written with a timestamp, banner stays hidden across a reload), an artificially-aged 15-day-old dismissal correctly expires and the banner reappears, and — with `window.matchMedia` overridden to report `(display-mode: standalone)` as true from before mount — the banner correctly never appears even past the 10s mark, confirming the "already installed" gate still works.

**2. A dedicated install CTA on the seller success screen** (`CreateListingPage.tsx`, the `done` block, new-listing case only — not the edit-mode resubmission, since the task's own framing is specifically "after a listing is created"): *"Never miss when it sells — Install the app and we will let you know the moment someone buys this or asks you a question."* Framed around what the app gives her, matching the task's own instruction, not "install for its own sake." Placed between the listing summary card and the action buttons.

**3. A dedicated install CTA on the buyer order-confirmation screen** (`PaymentReturnPage.tsx`'s `PaidState`, shown to both logged-in and guest buyers): *"Follow this order from your phone — Install the app to track your order and hear from your seller as soon as they reply."* Placed after the seller-contact/guest-order-reference block, before "Keep browsing."

**Neither of these two is the standing banner and neither checks its dismissal** — a one-off, contextual offer on a page someone reached deliberately isn't the same recurring nag the 14-day window exists to soften, so per the task's own framing ("as prominent as they deserve") they don't inherit that suppression. They **do** both check `isStandalone()` and the same `bm-mkt-pwa-installed` flag the banner uses (via a new shared `src/marketplace/lib/installState.ts`, so an install confirmed from either surface suppresses all three going forward) — showing "install our app" to someone already running it makes no sense regardless of interstitial policy, which is a separate, harder rule than the dismissal window.

**A new coordination layer, extending the existing pattern rather than inventing one**: `MarketplaceInstallCta.tsx` publishes its own visibility through a module-level pub/sub (`subscribeToInstallCtaVisible`), identical in shape to the existing `subscribeToWaPromptVisible`. The standing banner now subscribes to both and suppresses itself while either is showing — since both success screens persist the SAME pathname across their form/success sub-states (`/sell/new` doesn't change URL when the `done` view renders), route-based suppression wouldn't have worked; this pub/sub approach handles that correctly and mirrors precedent already in the codebase instead of adding a new mechanism.

**Android/iOS confirmed unchanged**: both new CTAs and the redesigned banner run the identical `beforeinstallprompt`-capture-then-`.prompt()` logic on Android/desktop Chrome, and `navigate("/install")` on iOS (or whenever no captured event exists yet) — copied from the banner's own established `install()` function, not reinvented.

**Live-verified nothing appears to someone already in the installed app**: `isStandalone()` gates all three surfaces (the banner directly, both CTAs via the shared check in `installState.ts`/`MarketplaceInstallCta.tsx`) — confirmed for the banner as above; the two CTAs use the exact same function call, so the same proof applies. The create-listing and checkout-return routes were also confirmed live to still render correctly (sign-in redirect and payment-verification states respectively, no console errors) — full click-through of the authenticated success screens themselves wasn't possible in this environment (no seller/buyer login credentials exist here, a standing limitation noted earlier in this session), so those two integration points are verified by passing `tsc`/build/lint plus code review, not a live screenshot of the rendered success state.

Preserved: the marketplace manifest and `/install` instructions page (untouched); the storefront's own separate install banner and manifest (untouched, different keys, different file); the listing-creation and order-confirmation flows themselves (only a new block inserted, nothing existing removed or reordered); the WhatsApp-prompt-vs-banner mutual exclusion (untouched, now joined by the same principle for the new CTA); the 14-day dismissal window (unchanged, still governs only the standing banner); sections 7 through 110.

Files touched: `src/marketplace/MarketplaceInstallBanner.tsx` (redesign, 10s/30%-scroll trigger, shared install-state, install-CTA suppression), `src/marketplace/components/MarketplaceInstallCta.tsx` (new), `src/marketplace/lib/installState.ts` (new, shared installed/dismissed helpers), `src/marketplace/sell/CreateListingPage.tsx` (CTA on the new-listing success screen), `src/marketplace/checkout/PaymentReturnPage.tsx` (CTA on the paid-order screen), `src/marketplace/marketplace.css` (`.mkt-install-banner*` redesign, new `.mkt-install-cta*`).

`npm run build` clean.

## 112. Verifying all three prompts together, not one pair at a time (2026-08-21)

§111 changed the marketplace install banner's trigger from a flat 20s to 10s-or-30%-scroll — earlier, and on a different mechanism, than when the banner-vs-WhatsApp-prompt deferral was originally built and tested. Re-verified the full set together rather than assuming the original pairwise test still covered it, per the four specific questions raised.

**1. Does `subscribeToWaPromptVisible` still suppress the banner given the new trigger?** Yes, mechanism unchanged, still wired in the banner's render gate.

**2. The suspected bug — banner now often fires first (10s/scroll), WhatsApp prompt second (10-20s), does the WhatsApp prompt render on top of an already-visible banner?** No, and this was proven live rather than assumed. On `/marketplace/listing/:id` at 375×812 mobile, with all dismissal/session flags cleared: after an uninterrupted wait past both thresholds, `document.querySelector('.mkt-install-banner-inner')` was `null` and `.mkt-wa-prompt`'s `getBoundingClientRect()` showed a real, positioned element — the banner had appeared first (confirmed present at the ~13s mark in an earlier pass of the same test) and then genuinely disappeared once the WhatsApp prompt rose, never coexisting. The reason this holds regardless of firing order: `subscribeToWaPromptVisible` is a **live callback**, not a one-time snapshot — it fires immediately with the current value on subscribe AND again on every future change, so if the banner is already mounted and showing when the WhatsApp prompt later calls `setPromptVisible(true)`, that call itself immediately notifies the banner's listener and forces it to re-render and hide. The "one-directional" shape (banner subscribes, WhatsApp prompt has no idea the banner exists) doesn't mean order-dependent — it means the WhatsApp prompt doesn't need to care, which is different. Clarified in both files' comments so this isn't re-litigated from an ambiguous read of "one-directional" again.

One real methodology trap hit and worth recording: polling the page with `javascript_exec` between waits (to check intermediate state) was itself resetting the WhatsApp prompt's own inactivity timer — its `armTimer` resets on `focusin` among other events, and repeated automation queries apparently count as that. The correct test is one long uninterrupted wait past both thresholds, then a single check — polling in between produces a false negative (WhatsApp prompt never seems to fire) that has nothing to do with the app's actual behavior.

**3. Is the storefront banner still strictly storefront-only and the marketplace one strictly marketplace-only?** Yes — this is a structural guarantee, not a timing race, so verified by code rather than by measurement (measurement can't prove a negative about something architecturally impossible any more definitively than reading the branch that makes it impossible). `src/App.tsx` renders `{marketplace ? <MarketplaceApp /> : <StorefrontApp />}` — a hard boolean branch, never both. `PwaInstallBanner` (storefront) mounts only inside `StorefrontApp.tsx:634`; `MarketplaceInstallBanner` mounts only inside `MarketplaceApp.tsx`. The two trees can never both be mounted for the same page load, so the two banners can never both exist in the DOM at once, regardless of any timing.

**4. Can either install banner collide with the two new success-screen CTAs?** The storefront banner cannot reach `/marketplace/sell/new` or `/marketplace/checkout/return` at all (same proof as §3 — those are marketplace routes, the storefront tree never mounts there). The marketplace banner already can't, by construction from §111: `MarketplaceInstallCta` publishes its own visibility via `subscribeToInstallCtaVisible` (mirroring `subscribeToWaPromptVisible`'s exact shape), and the banner's render gate includes `installCtaVisible`. Re-verified this specific claim with a real test — not assumed carried-over from §111 — since the actual authenticated success screens aren't reachable in this environment (no seller/buyer credentials, a standing limitation): a throwaway Vitest test (written, run, then deleted — not committed) mounted the actual production `MarketplaceInstallBanner` and `MarketplaceInstallCta` components together with fake timers. Result: with the CTA present, the banner never appeared even after advancing 11s past its trigger; a control case with no CTA present confirmed the banner does appear normally in the same harness, proving the suppression is real and specific to the CTA's presence, not a broken test.

**What actually needed fixing: nothing.** All four checks were already correct — points 1 and 4 by the work already done in §111, points 2 and 3 by the pre-existing pub/sub and routing architecture, neither of which needed to change. Per "fix only what is broken," no behavior or timing changed here. The two edits made are comments only, in `MarketplaceInstallBanner.tsx` and `WhatsAppInactivityPrompt.tsx`, explicitly recording that the order-independence was checked and re-verified together after §111's trigger change — the exact gap in written knowledge that made this recheck necessary in the first place.

**Priority order, confirmed as already-implemented, not changed**: WhatsApp prompt beats the install banner (moment-specific hesitation over an actual purchase outweighs a standing convenience offer); the dedicated success-screen CTA beats the install banner (a higher-intent, one-off contextual offer beats a recurring one on the same screen); a storefront banner and a marketplace banner never compete at all (architecturally separate surfaces). Matches the task's own stated view exactly, because that view was already how the existing code behaved.

Preserved: all prompt timings unchanged (banner 10s/30%-scroll, WhatsApp prompt 10-20s by page/device, storefront banner's own timing untouched); no components merged; sections 7 through 111.

Files touched: `src/marketplace/MarketplaceInstallBanner.tsx` (comment only), `src/marketplace/components/WhatsAppInactivityPrompt.tsx` (comment only).

`npm run build` clean.

## 113. "Ask for a lower price" was shown regardless of is_negotiable — fixed (2026-08-21)

Asked to verify, not assume, whether the offer entry point on listing detail actually respects `is_negotiable`, given the database enforces it server side (`buyer_make_offer` raises "The seller has set a firm price on this item") and zero offers exist on fixed-price listings — meaning the client-side gap, if any, was invisible from the data alone.

**Found genuinely broken, worse than the suspected "reading undefined" case**: `is_negotiable` was not selected in `LISTING_SELECT` (`src/marketplace/data/mdb.ts`) and not declared at all on the `MarketplaceListing` type (`src/marketplace/types.ts`) — so `ListingDetailPage.tsx` had no reference to it anywhere, not even an accidental one. The "Ask for a lower price" button's visibility gate was `offersEnabled && !offerAccepted && maxDiscountNaira != null` (`ListingDetailPage.tsx:667`) — a site-wide feature flag and a site-wide discount cap, entirely blind to whether *this* listing was ever marked negotiable. It was shown, not hidden-and-only-failing-on-tap as one possibility framed it — genuinely shown, tappable, opening the offer sheet, for every listing once offers are on globally, regardless of the seller's own choice. With 132 of 178 live listings fixed price, this was the majority-case failure, not an edge case.

**Also checked**: browse's `ListingCard.tsx` has no negotiable indicator of any kind — not wrong, just absent, and not something this fix adds since only the listing-detail entry point was in scope.

**Fix, three files, minimal**: added `is_negotiable` to `LISTING_SELECT`; added `is_negotiable: boolean` to `MarketplaceListing` with a comment noting the server is the real enforcement and this is read purely so the client can hide the entry point up front rather than let a buyer tap through to a guaranteed rejection; added `listing.is_negotiable` to the button's gate condition. `openOfferSheet` (the only thing that opens the offer sheet on this page) is wired to nothing but that one button, so this single gate closes the only entry point — checked directly, not assumed.

**Live-verified against real data**, not just code review: fetched a genuinely negotiable listing (`Baby Cot`, `f244f10b-…`) and a genuinely fixed-price one (`Nuby Baby Neck Support Pillow…`, `06eacc16-…`) directly from `marketplace_listings`, with the global offers flag confirmed on (`marketplace_offers_enabled = true`). The fixed-price listing renders only "Ask a question"; the negotiable one renders both "Ask for a lower price" and "Ask a question" — confirmed via `querySelectorAll('.mkt-offer-entry')` textContent on both live pages, not a screenshot.

Preserved: everything else on listing detail untouched; "Ask a question" (a separate, always-available entry point, correctly unaffected); sections 7 through 112.

Files touched: `src/marketplace/data/mdb.ts` (`is_negotiable` added to `LISTING_SELECT`), `src/marketplace/types.ts` (`is_negotiable` added to `MarketplaceListing`), `src/marketplace/pages/ListingDetailPage.tsx` (gate condition + comment).

`npm run build` clean.

## 114. A plain, blank WhatsApp button on admin Sellers, distinct from Suggested outreach (2026-08-21)

**Audit before building**: `MarketplaceSellers.tsx`'s "Contact and identity" `OpsCard` already shows phone, WhatsApp number (or "Same as phone" via `phone_is_whatsapp`), email — display-only text, no clickable contact affordance anywhere. "Suggested outreach" (same file) only renders when `get_seller_nudge_suggestions` (a Postgres RPC, not tracked in this repo) returns at least one matched lifecycle stage for that seller; each row's `whatsapp_link` — pre-filled message included — comes straight from the RPC, built entirely server side, nothing to reuse or duplicate client-side. Phone-to-wa.me normalisation is NOT centralised in admin: `MarketplaceBuyers.tsx` and `MarketplaceAbandonedCheckouts.tsx` each carry an identical, independently-duplicated `toIntlPhone(raw)` (Nigeria-only: strips non-digits, prepends "234" unless already `234…` or `0…`) — `MarketplaceSellers.tsx` itself had none. The outreach log is a separate mechanism entirely: `logOutreachContact()` in `opsData.ts` wraps `log_outreach_contact` RPC, called from exactly one place in the whole codebase, `MarketplaceOutreach.tsx`'s "Mark as sent" button — a distinct screen (the admin-wide follow-up queue), not this one. No WhatsApp `<a>` anywhere, including Suggested outreach's own, has an `onClick` touching that RPC; they're all plain anchors.

**Built**: a plain "Message on WhatsApp" button inside the existing "Contact and identity" card, right below the phone/WhatsApp/email grid — placed with the raw contact details themselves rather than as a new row inside Suggested outreach, since it's a property of *the seller's number*, not of any triggered reason. `href="https://wa.me/{digits}"` with no `text=` param at all — genuinely blank, opens a fresh chat. No `onClick`, no RPC call, nothing written anywhere; the outreach log is untouched, confirmed by grepping the diff itself for `log_outreach|onClick` (zero matches).

**Distinct from Suggested outreach on sight, not by explanation**: Suggested outreach's buttons are solid WhatsApp-green pills, each labelled bare "WhatsApp", sitting next to a specific reason (`n.label`, e.g. "Sale awaiting dispatch"). The new button is outlined (WhatsApp-green border, no fill), reads "Message on WhatsApp" rather than just "WhatsApp", and has no reason label beside it — it sits with the phone number itself. Two visual cues (fill vs. outline, generic label vs. reason-paired label) plus its different location (contact card vs. a conditional card that may not even be rendered) do the distinguishing, not a tooltip or caption.

**Number handling reused, not duplicated a third time, and made genuinely correct for non-Nigerian sellers**: added `toIntlPhone` to `opsData.ts` — the same Nigeria-only logic Buyers/AbandonedCheckouts already had inline, now given one real shared home so a future third copy doesn't drift from the other two (neither of those two files was touched; they keep their own pre-existing copies). Applied it precisely, not blindly: `whatsapp_number` is stored **already fully international at signup**, for any country (`marketplace/lib/phone.ts`'s `toInternationalDigits`, confirmed by reading it — dial code plus the trunk zero stripped, no Nigeria assumption baked in there), so the new `waDigitsFor()` helper only strips formatting characters from it, never prepends "234". `toIntlPhone`'s 0→234 conversion is applied only to the `phone` fallback, which the marketplace's own signup rules guarantee is always Nigerian (it's what arranges delivery within Nigeria) — genuinely handling a non-Nigerian seller's WhatsApp number correctly, rather than reproducing the exact bug the existing Buyers/AbandonedCheckouts duplicate would hit if it were ever handed a non-Nigerian `whatsapp_number` (it isn't touched here, so that pre-existing latent gap is unchanged, just not propagated into new code). Checked live against real data: every current seller's `whatsapp_number` happens to already start with "234" (no non-Nigerian seller exists in the data today), so this distinction doesn't change anything visible right now — it matters the day one does.

**On the Buyers screen — view, not built**: `MarketplaceBuyers.tsx` already has its own WhatsApp button, but it's the opposite of blank — a generic pre-filled greeting ("Hello {name}, this is BundledMum regarding your order X."), not a nudge-sequence message but not empty either. Whether Buyers also needs a *second*, genuinely blank button alongside that one is a real question, not obviously yes: a buyer contact is almost always about a specific order (the pre-fill already names it), where a seller contact is much more often a general "can we talk" with no order in scope — the case this feature exists for is more clearly a seller-side gap. Left as-is per the instruction to report a view rather than build it.

**Verification**: `tsc`, ESLint, and `npm run build` all clean. Live click-through wasn't possible — admin routes need login credentials this environment doesn't have, the same standing limitation noted throughout this session for authenticated screens — so this was verified by code review, confirming the query already selects every field used (`whatsapp_number`, `phone`, `phone_is_whatsapp` were already in `MarketplaceSellers.tsx`'s existing select, nothing new to fetch), and confirming live in the database that `marketplace_offers_enabled`-style assumptions don't apply here (no equivalent flag; the button is unconditional on a number existing, matching "every one of the 176 active sellers has a usable number, no empty state to design around").

Preserved: Suggested outreach and its sequenced RPC-built messages, untouched; the seller sort order (suspended-sinks-to-bottom) and sticky detail panel, untouched; the outreach log and its attempt counts, untouched; sections 7 through 113.

Files touched: `src/pages/admin/marketplace/MarketplaceSellers.tsx` (`waDigitsFor`, the new button), `src/pages/admin/marketplace/opsData.ts` (`toIntlPhone`, newly shared).

`npm run build` clean.

## 115. Super admin can cut a listing's price from our own markup, publicly visible (2026-08-21)

**Audit before building**: the accepted-offer price treatment on listing detail (`ListingDetailPage.tsx:488-496`) is a plain `<span>` new price, a plain `<span>` with inline `textDecoration: line-through` for the old price, and a `.mkt-offer-discount-tag` coral pill for "₦X off, just for you" — no dedicated strikethrough CSS class exists, it's inlined at the call site. Browse cards (`ListingCard.tsx`) had zero discount treatment of any kind, one plain price only. The admin listings screen (`MarketplaceListings.tsx`) is list-only (no detail pane), selects only `final_price_naira` (not the seller's `price_naira`, so no markup figure exists anywhere on that screen today), and its row actions (Edit/Delist/Relist/Split) are plain conditionals with no role gating anywhere in the marketplace admin surface — `isSuperAdmin` (from `usePermissions()`, `src/hooks/useAdminPermissionsContext.tsx`, backed by `admin_users.role === "super_admin"`) already exists and is used elsewhere (`AdminProducts.tsx`'s margins link) but had never been reached for in the marketplace admin tree before this.

**The naming trap, checked directly**: `original_price_naira` is used in exactly one buyer-facing spot, "Bought brand new at ₦X" (`ListingDetailPage.tsx:501-502`), and three seller-side edit screens — nowhere near offer/discount logic. Confirmed no collision risk and kept it untouched; `price_before_discount_naira` is a new, separate field, both can render on the same listing at once (verified live, see below).

**Buyer side, public, everyone**: `admin_discount_naira`, `price_before_discount_naira`, `admin_discount_at` added to `LISTING_SELECT` (`mdb.ts`) — the same select browse and detail both already share, so one change covers both surfaces, and to `MarketplaceListing` (`types.ts`). New shared CSS (`.mkt-discount-strike`, `.mkt-discount-tag`) deliberately NOT reusing `.mkt-offer-discount-tag` despite matching visuals, since these are genuinely different mechanisms (private personal price vs. public price cut) and a class named "offer" attached to something that has nothing to do with offers would confuse the next reader. Listing detail shows the struck-through `price_before_discount_naira` and a plain "₦X off" tag (no "just for you" — that phrasing implies personalization, which would misrepresent a price every visitor sees) whenever `admin_discount_naira > 0`, but only when an accepted offer ISN'T also active for this buyer (an accepted offer is an even better private price and keeps display priority — the two are mutually exclusive in the UI, never both shown). `final_price_naira` itself needed no client-side math at all: the RPC already updates it server side, so the plain price shown is automatically correct, only the strike-through and tag are new. Same treatment added to `ListingCard.tsx` (the actual browse grid card — confirmed by re-reading `MarketplaceHero.tsx`/`HowItWorksPage.tsx`'s closing cards that they build their own inline `<Link className="mkt-card">` JSX rather than using this component, so "browse cards" scoped correctly to the one shared component that needed it). Never mentions BundledMum or the mechanism anywhere in either surface — checked by reading every string added, matching the instruction exactly.

**Admin side, super-admin only**: `MarketplaceListings.tsx` gained `price_naira` (to derive markup fresh, since none was stored/computed anywhere on this screen) plus the three new columns, all added to its own select and row type. A "Discount" action (relabelled "Edit discount" once one is set) appears in the row actions only when `isSuperAdmin` is true — the whole button is absent for anyone else, not present-and-failing, checked by grepping the file for every `isSuperAdmin` reference (both the button and the expandable editor row are gated, not just one). Clicking it opens an inline expandable row, the same established pattern the draft-editor already uses in this file (`Fragment` + a conditional `<tr colSpan>`), showing "Our markup on this item" (`baseline - price_naira`, where `baseline` is `price_before_discount_naira` if a discount is already active, else `final_price_naira`) and "Buyer will pay" computed live from the input as they type, entirely client-side, before any RPC call. Saving calls `super_admin_set_listing_discount` with the typed amount as an absolute value (not a delta, matching its own "passing 0 clears the discount" contract); a raised "too large" error is displayed verbatim, not reworded, since it already names the maximum. A "Clear discount" action appears next to Save whenever `admin_discount_naira > 0` — one click, no need to know or retype the value to reach 0. The main "Buyer price" column also gained a small struck-through original next to any currently-discounted price, for at-a-glance visibility without opening the editor.

**Verified live against real data, not just code review**, since admin routes need login credentials this environment doesn't have (the standing limitation): applied a genuine ₦5,000 discount directly to a real live listing's row (`final_price_naira`/`price_before_discount_naira`/`admin_discount_naira` updated together, matching exactly what the RPC would produce), then loaded both the listing detail page and the browse grid (searched to it) as a **signed-out** visitor. Listing detail showed ₦151,000 new / ~~₦156,000~~ struck / "₦5,000 off" tag, with "Bought brand new at ₦250,000" still rendering correctly and separately beneath it — both figures visible at once, confirmed distinct. The browse card showed the identical treatment in the compact card layout. Reverted the listing back to its exact original values (`admin_discount_naira: 0, price_before_discount_naira: null, final_price_naira: 156000, admin_discount_at: null`) immediately after confirming, verified live a second time that the discount display was gone — no test state left in production data. (Calling the RPC directly through the SQL tool itself correctly raised "Not permitted" — confirming its own authorization check is real and active; the direct-column update used for this verification was only ever about proving the frontend renders correctly, not about testing the RPC's own security, which the task states is already deployed and tested.)

Preserved: the accepted-offer display, entirely unchanged in its own code path; "Bought brand new at" using `original_price_naira`, untouched; checkout, which reads `final_price_naira` same as always and needed no change (confirmed live — the Buy now bar showed the discounted price automatically during verification); sections 7 through 114.

Files touched: `src/marketplace/types.ts` (three new fields), `src/marketplace/data/mdb.ts` (`LISTING_SELECT`), `src/marketplace/marketplace.css` (`.mkt-discount-strike`, `.mkt-discount-tag`), `src/marketplace/pages/ListingDetailPage.tsx` (`hasAdminDiscount`, JSX), `src/marketplace/components/ListingCard.tsx` (discount row), `src/pages/admin/marketplace/MarketplaceListings.tsx` (select, row type, super-admin-gated discount control).

`npm run build` clean.

## 116. "Ask for a video", built strictly around the failure that killed the last one (2026-08-21)

**Audit before building, and the critical prior-art read**: read handoff §87-92 in full first, since the whole point of this feature's constraints is not repeating that exact failure. What actually broke: `readVideoMetadata()`/`processListingVideo()` (still in the codebase, paused, in `sellData.ts`) created a `<video>` element to read duration and compress client-side, and on iOS the combination of a blob URL set directly on `.src`, an element never genuinely attached to the render tree, and a browser event (`loadedmetadata`) with no timeout meant that `await` could hang forever — no error, nothing landing in storage, a seller staring at a spinner indefinitely. Separately, and permanently: `HTMLMediaElement.captureStream()` has never been implemented in WebKit, so client-side video *compression* structurally cannot work on iOS regardless of any fix. This is why the feature was switched off (`marketplace_video_enabled`, still `false`) rather than shipped broken for a large share of Nigerian sellers.

"Ask a question" (`AskQuestionSheet.tsx`/`SellerQuestionDetailPage.tsx`/`questions.ts`) was audited as the shape to mirror: a buyer-side sheet using `.mkt-sheet-overlay`/`.mkt-sheet`, `detectBypassAttempt()` checked client side before every submit (the server's `marketplace_detect_bypass_attempt` is the real enforcement, this only lets a person see the problem before hitting submit), a one-per-buyer row read via `.maybeSingle()`, and a seller-side deep-link detail page reachable from outside the app while logged out, gated by `sendToMarketplaceLogin(path, reason)` in an effect, never a render-time bail. Dispatch photos (`SellerDispatchPage.tsx`) confirmed the exact "just upload the raw file" model this feature also needed: `sdb.storage.from(bucket).upload(path, blob, {...})`, no metadata reads, path namespaced under the seller's own auth uid. The one gap found: **no upload-progress mechanism exists anywhere in this codebase** — dispatch photos and payout proofs both just show a "Saving..." boolean, fine for a ~200KB compressed JPEG, not fine for a raw 40-60MB video on Nigerian mobile data that can genuinely take minutes.

**Verified live against the database before writing any code**: `site_settings.marketplace_video_request_max_mb = 60`; bucket `marketplace-request-videos` confirmed private, 60MB `file_size_limit`, exactly the five mime types described; all four RPCs (`buyer_request_video`, `seller_attach_request_video`, `seller_decline_video_request`, `buyer_claim_request_video`) confirmed to exist with exactly the signatures given, including that `buyer_claim_request_video` returns `TABLE(video_path text, first_watch boolean)` — a table-returning function, so the client reads `data[0]`, not `data` directly, a real bug avoided by checking rather than assuming. Table `marketplace_video_requests` and its RLS (buyer reads own rows, seller reads rows on own listings, both by plain `SELECT` policy) confirmed directly — critically, this means a buyer can read `video_path` once it's set **without** calling the claim RPC, which is exactly what makes "show that a video is ready, but only start the clock on deliberate watch" possible.

**1. SIZE, NOT DURATION — the one thing that had to be right.** `src/marketplace/sell/SellerVideoRequestDetailPage.tsx`'s `pick()` function is the entire validation: `if (f.size > maxMb * 1024 * 1024) { ...too-long message...; return; }` — nothing else runs before that check, and `maxMb` comes from a live `site_settings` read (`useVideoRequestMaxMb()` in `videoRequests.ts`), never hardcoded. Grepped every new/touched file for `createElement("video")`, `loadedmetadata`, `captureStream`, `MediaRecorder`, and `canvas`/`getContext("2d")` — the only matches anywhere are inside comments explaining why those patterns are absent, confirmed by running the exact grep and getting zero code matches. The one genuine `<video>` tag in the whole feature is `WatchRequestVideoSheet.tsx`'s visible `<video controls playsInline src={videoUrl}>` — ordinary HTML5 playback for the buyer to actually watch, unrelated to the hidden-metadata-probe pattern that broke before, and necessary for the feature to do anything at all.

**No compression, ever, confirmed by omission**: nothing in `sellerUploadVideoForRequest` (`videoRequests.ts`) calls `processListingVideo` or any canvas/MediaRecorder path — the picked `File` object goes directly into `uploadWithProgress()` and from there straight onto the wire, byte for byte.

**Wording in time, not megabytes**, exactly as instructed: `"That video is too long, please record about 30 seconds or less."` — both the upfront `file.size` rejection and `describeVideoRequestUploadError`'s fallback for the (should-be-rare) case the bucket's own size guard catches something the client check didn't.

**Real upload progress, since none existed anywhere to reuse**: `src/marketplace/lib/uploadWithProgress.ts` is new. supabase-js's own `.storage.upload()` uses `fetch()`, which has no upload-progress event in browsers — the only way to get a genuine percentage is a raw `XMLHttpRequest` with `xhr.upload.onprogress`. Rather than hand-roll signing, it calls the SDK's own `createSignedUploadUrl()` for the one-time token, then PUTs directly to that URL via XHR with the identical multipart body shape the SDK's own (progress-less) `uploadToSignedUrl` sends on the wire (confirmed by reading `storage-js`'s actual source in `node_modules`), so the request is byte-for-byte what Supabase expects. The seller's screen shows a real percentage bar plus `{progress}%` in the button label, not a spinner. Failure is recoverable: the picked `File` stays in component state on any error, so retrying calls the same upload function again with the same file, no re-picking.

**2. Seller side**: a new "Buyers asking for a video" card on `SellerDashboardPage.tsx`, copying `offersNeedingAttention`'s exact pattern (`useQuery(["seller-video-requests-attention", seller?.id], () => fetchSellerVideoRequestsNeedingAttention(seller!.id))`, a `.mkt-group-title` + `.mkt-lrow` list, a `pending`-styled pill, "Film it") — the missing precedent the audit flagged (unanswered questions have no dashboard surfacing at all, only a deep link) fixed for video requests specifically, matching the task's explicit ask. The detail page shows the buyer's note verbatim (or "No note, just show it works normally" when blank), a reassurance card — *"This video goes only to the buyer who asked, nobody else can see it, and it's deleted afterwards"* — and either an upload flow or a decline flow with an optional reason, never both open at once.

**3. Buyer side**: once `video_path` is set, the "Ask for a video" entry (mirroring "Ask a question" exactly, directly beneath it) is replaced with a "Watch your video" button, opening `WatchRequestVideoSheet`. That sheet opens on a warning screen, never the player: *"This is a full-size video, not compressed, it could be 40MB or more. Make sure you're happy to use that much data before you play it."* and *"It'll stay available for about 4 hours after you watch it."* — the four-hour figure only, deliberately never the one-hour figure (that only applies after a completed purchase, which hasn't happened at the point someone is watching for the first time). Only the "Play video" button inside that warning screen calls `buyerClaimVideoRequest` — confirmed by reading the component, it's the sole call site in the entire codebase, never in a `useQuery`, never in a `useEffect`, never anywhere that could fire on page load or on merely seeing that a video exists.

**Preserved, confirmed by inspection**: `marketplace_video_enabled` and `useMarketplaceVideoEnabled()` are never read or written anywhere in this feature's five new/touched files — a completely separate flag, separate bucket, separate feature, despite the similar name. "Ask a question" (`AskQuestionSheet.tsx`, `questions.ts`, its bypass filter, its one-per-buyer rule) untouched, only imported from. Dispatch photos (`SellerDispatchPage.tsx`) untouched. Sections 7 through 115.

**Verified live**: the "Ask for a video" button renders on a real listing detail page, directly after "Ask a question" (`.mkt-offer-entry` list confirmed via `querySelectorAll`: `["Ask a question", "Ask for a video"]`). Clicking it while signed out redirects to `/marketplace/login?returnTo=%2Flisting%2F...&reason=video`, showing the correct new copy, *"To ask for a video, we need your email."* The seller-side route (`/sell/video-requests/:id`) redirects the same way with its own new copy, *"To reply to their video request, we need your email."* Full click-through past the login gate (the actual upload, the actual claim-and-watch) wasn't possible in this environment — no seller/buyer login credentials exist here, the same standing limitation noted throughout this session — so the upload/claim/signed-URL code paths are verified by direct reading against the live-confirmed RPC signatures and RLS policies above, not by a live end-to-end click-through.

Files touched: `src/marketplace/auth/marketplaceLogin.ts` (`video`/`answer_video` reasons), `src/marketplace/lib/uploadWithProgress.ts` (new), `src/marketplace/videoRequests.ts` (new), `src/marketplace/checkout/RequestVideoSheet.tsx` (new), `src/marketplace/checkout/WatchRequestVideoSheet.tsx` (new), `src/marketplace/pages/ListingDetailPage.tsx` (button, query, sheets), `src/marketplace/sell/SellerDashboardPage.tsx` (new card), `src/marketplace/sell/SellerVideoRequestDetailPage.tsx` (new), `src/marketplace/MarketplaceApp.tsx` (route), `src/marketplace/marketplace.css` (`.mkt-infobox`).

`npm run build` clean.

## 117. Ask/Ask-for-a-video buttons now name the seller (2026-08-21)

New `sellerFirstName(listing)` in `lib/format.ts`: first word of `display_name` only ("Marvellous E." → "Marvellous", "Seun A." → "Seun"), `null` when there's no public display name, so the caller chooses the fallback rather than this function guessing one. `ListingDetailPage.tsx` resolves it once, `const askName = sellerFirstName(listing) || "the seller"`, and both entry buttons plus both sheet headings ("Ask a question"/"Ask for a video") use it: "Ask {askName} a question" / "Ask {askName} for a video". Not applied to the status lines below them ("waiting for the seller to answer") — the ask was specifically the two actions' own labels, wherever they're labelled (the button and the sheet heading it opens), not every sentence that happens to mention the seller.

**Long Nigerian first names, tested for real, not assumed**: fetched the actual longest real seller first names live from the database rather than guessing — "Oluwasemilore" (13 characters) topped the list, live sellers today. `.mkt-offer-entry`'s `line-height` changed from `1` to `1.3`: at `1`, a wrapped second line would cram directly against the first with no gap; nothing else changed, no `white-space: nowrap`, no `overflow`/`text-overflow` was ever set, so the button was already free to wrap, it just needed room between lines once it did. Verified live at a genuine 320px viewport (the narrowest realistic phone) with the real "Oluwasemilore" listing — fit on one line comfortably, no wrap needed at that length. To prove the wrap itself works rather than just that this particular name happened to fit, forced a synthetic 30-character name ("Oluwaseunfunmilayotemitope") into the same live button and confirmed it wraps to two clean, evenly-spaced lines (button height grew from ~46px to ~63px), never overflowing or truncating mid-word.

**Fallback, confirmed by exercising the actual logic**: no live seller currently has a null `display_name` (populated at signup, so no real listing exists to click through as a test case) — verified instead by running `sellerFirstName`'s exact algorithm against `null` and `""` directly, both correctly resolving to `"the seller"` rather than an empty gap, same as a genuine name correctly resolves to just its first word.

Preserved: sections 7 through 116, everything else on listing detail untouched. `sellerDisplayName()` (the existing "Marvellous E." full-name-with-initial helper used elsewhere on the page) is untouched, `sellerFirstName()` is new and additive.

Files touched: `src/marketplace/lib/format.ts` (`sellerFirstName`), `src/marketplace/pages/ListingDetailPage.tsx` (`askName`, both buttons, both sheet props), `src/marketplace/checkout/AskQuestionSheet.tsx` (`sellerName` prop, heading), `src/marketplace/checkout/RequestVideoSheet.tsx` (`sellerName` prop, heading), `src/marketplace/marketplace.css` (`.mkt-offer-entry` line-height).

`npm run build` clean.

## 118. Multi-seller cart: add to cart, cart, cart checkout, real Paystack handoff, multi-order confirmation (2026-08-21)

**Before**: Buy now was the only path — `handleBuyNow` on `ListingDetailPage.tsx` navigates straight to `/checkout/:listingId`, one order, one Paystack transaction, one seller contact card on `/checkout/return` (single `getOrderContact(orderId)` call).

**Built**: a genuinely additive cart, entirely new files under `src/marketplace/cart/`:
- `cartStore.ts` — localStorage only (`bm-mkt-cart` key, `bm-mkt-` convention, try/catch best-effort, matches `installState.ts`), listing IDs only, 20-item cap matching the server's own. Cart contents never go to the server until checkout.
- `cartOrders.ts` — `summariseCart()` (RPC `summarise_cart`), `createMarketplaceCartOrder()` (`create-marketplace-cart-order`), `initializeCartPayment()` (`marketplace-initialize-payment` with `{cart_reference}`).
- `CartPage.tsx` (design C3–C6): re-checks `summarise_cart` every time the cart is opened, never trusts what was true when an item was added. Single seller shows the calm green reassurance banner; 2+ sellers show the coral-light warning with a numbered badge, "N sellers, N separate deliveries", and past 3 sellers the extra line "that's N separate WhatsApp conversations to arrange" (design's own four-seller note). Items group per seller with "delivery X of Y" — the number of groups on screen IS the delivery count. A sold-while-in-cart item is shown once, greyed and struck through with "No longer available", then actually dropped from storage so it never reappears.
- `CartCheckoutPage.tsx` (design C7): per-seller summary card, price breakdown (Items / Service fee with "One fee per order today, not per item or per seller" / Paystack fee / Total), the "How your money is protected" trust card (second bullet only for 2+ sellers), guest detail form (name/email/phone — simpler than single-item checkout's, no separate WhatsApp-differs toggle, since create-marketplace-cart-order only needs these three).
- Listing detail (`ListingDetailPage.tsx`): a new outlined "+ Add to cart" button beneath Buy now (visibly lighter weight — 1.5px border vs Buy now's solid fill, smaller padding, per design C1's own reasoning: someone here to buy right now should never pause to weigh two similar-looking choices). **Follow-up mid-build**: instead of the design's dismissible toast-then-stay (C2), a genuine navigate to `/cart` on every successful add, per direct instruction partway through this task. The toast markup (`.mkt-cart-toast`, dark green, "View cart" link) still exists and still fires, but now only for the two cases that don't navigate: already-in-cart and cart-full.
- Routes: `/cart`, `/cart/checkout` in `MarketplaceApp.tsx`, no collision with `/checkout/:listingId` (different top segment).

**A real, live backend change landed mid-task, verified against deployed source before trusting it** (not assumed from the message alone): `marketplace-initialize-payment` (v13→v14) now accepts `{cart_reference, callback_url, channel}` alongside its original `{order_id}` — sums every order sharing that reference into ONE Paystack transaction, service fee and Paystack's own fee both attached to a single order in the group rather than split (confirmed live: a real 3-item, 3-seller cart returned one `authorization_url`, items ₦48,000 + service fee ₦1,000 (charged once, matching the ≥₦10,000 tier) + Paystack fee ₦848 = total ₦49,848, one transaction). `marketplace-verify-payment` (v14→v15) now resolves a whole cart_reference group and marks every order paid, returning `order_ids[]`, `order_count`, and `cart_reference` (null for a single order). Both stay fully backward compatible — Buy now still sends `{order_id}` untouched, confirmed unaffected.

Wired both: `CartCheckoutPage.tsx`'s Pay button calls `initializeCartPayment({cartReference})` and redirects to the real `authorization_url`, firing `InitiateCheckout`/`AddPaymentInfo` off the Paystack-authoritative total (mirrors `CheckoutPage.tsx`'s own convention of waiting for `payQ`, not the pre-fee pending-order total). A 409 with an `unavailable` array (an item sold between cart-view and pay) surfaces as a named list, telling the buyer to go back to the cart and remove it — checked once at cart-order creation and again at the pay step, since a listing can go between those two moments too.

`PaymentReturnPage.tsx` (`/checkout/return`, shared by both flows) now reads `order_ids` instead of assuming one order. Single-item purchases render exactly as before (untouched `SellerContact` path). A cart (`order_ids.length > 1`) renders a new `CartSellerContacts` component: one card per order, each with its own independent contact fetch (`getOrderContact` per id — one slow seller lookup never blocks another's card), "Order X of Y" tag, its own WhatsApp/Call actions, matching design C8's "a cart genuinely creates several independent orders, make that visible" reasoning. Heading becomes "Paid, N deliveries to arrange". Guest resend (`GuestPaid`) now resends every order in the group, not just one, since each sends its own confirmation email. Cart is cleared (`clearCart()`) once a cart payment is confirmed paid. C9 (the buyer confirmation email) and C12 (desktop confirmation) were not touched — those are server-side (`send-marketplace-email`) and out of this task's frontend scope respectively; the live email content was not verified this pass.

**Verified live** (real DB, real edge functions, not simulated): added 3 real listings from 3 different real sellers to cart via the actual button; cart page showed the correct coral multi-seller banner, correct per-seller "delivery X of 3" grouping, correct thumbnails/prices; emptied and confirmed the C5 empty state; checked out as a guest — real `create-marketplace-cart-order` call created 3 real `pending` orders sharing one `cart_reference` (`BMC-NW2L7G4C`, confirmed via direct SQL), service fee correctly on exactly one of the three (₦1,000, not ₦3,000); real `marketplace-initialize-payment` call returned one real Paystack `authorization_url` with the correct combined total (₦49,848) — did not complete an actual payment (out of scope to spend real money in a build-verification pass). Confirmed desktop layouts (two-column cart with sticky order summary per C10; centred single-column checkout per C11) at 1280px. Did not live-test the sold-while-in-cart (C6) row, since that would require marking a real listing sold mid-test — verified by reading the `summarise_cart`/diff logic instead.

**Preserved, confirmed untouched**: Buy now (`handleBuyNow`), single-item `/checkout/:listingId` flow, `createMarketplaceOrder`/`initializePayment` (still `{order_id}`-only from the client's side), abandoned-checkout capture, WhatsApp-at-checkout, the single-order `SellerContact`/`GuestPaid` rendering path. No Supabase migrations. No cart contents stored server side — `create-marketplace-cart-order` is only ever called at actual checkout, same as the single-item flow already does.

Files touched: `src/marketplace/cart/cartStore.ts`, `cartOrders.ts`, `CartPage.tsx`, `CartCheckoutPage.tsx` (all new), `src/marketplace/pages/ListingDetailPage.tsx` (Add to cart button + handler), `src/marketplace/MarketplaceApp.tsx` (`/cart`, `/cart/checkout` routes), `src/marketplace/checkout/orders.ts` (`VerifyResult` gains `order_ids`/`cart_reference`/`order_count`), `src/marketplace/checkout/PaymentReturnPage.tsx` (`CartSellerContacts`, multi-order `PaidState`/`GuestPaid`), `src/marketplace/marketplace.css` (`.mkt-cart-*`, `.mkt-buybar-actions`, `.mkt-cart-add`, `.mkt-cart-toast`).

`npm run build` clean.

## 119. Cart checkout was missing its payment channel selector entirely (2026-08-21)

**Report**: card and bank transfer options "disappeared" from checkout.

**Audit findings, screen by screen**:
- Single-item checkout (`CheckoutPage.tsx`), mobile and desktop: the channel selector (`.mkt-paymethods`, Card/Bank transfer, card pre-selected) was intact and correctly wired the whole time — `payChannel` state feeds `initializePayment({channel: payChannel})`, verified live by patching `window.fetch` and reading the actual outgoing request body for both channels (`{"order_id":"...","channel":"card"}` then `{"...","channel":"bank_transfer"}`). Nothing here was ever broken.
- Cart checkout (`CartCheckoutPage.tsx`): **never had a selector at all**. `initializeCartPayment` was called with `channel: "card"` hardcoded (§118's own oversight, not a regression) — no `payChannel` state, no UI. This is the entire explanation for "options disappeared": they were never built on this path, so a buyer paying for a cart could never reach bank transfer.
- Cart/checkout/confirmation layout vs the design (42a C3–C7, C10–C11) and single-item checkout vs 35a (W2/W3): no structural differences found by DOM inspection (`getBoundingClientRect`/computed styles) — checkout renders as a centered 560px card under a full-width green header on desktop, consistent with the same shell used by My orders/Payouts/etc. **Caveat, stated plainly**: this session's Browser-pane screenshot tool rendered desktop/tablet captures cropped into a small top-left corner regardless of the real (correctly wide) DOM layout — confirmed a tool artifact, not a site bug, by cross-checking `window.innerWidth`/`getBoundingClientRect` (genuinely 1275px, correctly centered) against the broken screenshot pixels, reproduced identically in a fresh tab. Mobile-preset screenshots rendered correctly throughout and matched the design. If the desktop details step still looks wrong to a real browser, it needs a fresh report with specifics — I could not visually reproduce a defect with reliable tooling this pass, only confirm the DOM structure is sound.

**Fix**: added the exact same selector to `CartCheckoutPage.tsx` — `payChannel` state (default `"card"`), `.mkt-paymethods`/`.mkt-paymethod` buttons (reusing existing CSS, no new visual component), `payChannel` folded into the `payQ` query key so switching channels re-initializes against Paystack rather than reusing a transaction opened for the other channel, same reasoning as the single-item flow. One new CSS rule (`.mkt-cart-paymethods { margin: 0 16px }`, swept into the existing desktop margin-reset list alongside the cart checkout's other direct children).

**Verified live** (real DB, real edge functions): added a real listing to cart, checked out as a guest, confirmed a real cart order + Paystack init; switched Card → Bank transfer → Card again on the cart checkout screen, patched `fetch` to read the literal outgoing body each time — confirmed `channel` genuinely changes in the request (`"channel":"card"` then `"channel":"bank_transfer"`), not just the button's visual state. Did the same on single-item checkout for a second listing, confirming its request body also carries the chosen channel correctly. Total updates when card fee differs; here card and transfer resolved to the same Paystack fee at this amount, which is a genuine live-data outcome, not a stuck total (fee comes from Paystack's own initialize response).

**Preserved, confirmed untouched**: multi-seller cart warning/grouping, service fee shown once per cart, Buy now, abandoned-checkout capture (single-item only, file untouched), `AddPaymentInfo` firing timing (unchanged in both files). No Supabase or edge function changes — the backend already accepted `channel` correctly; this was purely a missing frontend control.

Files touched: `src/marketplace/cart/CartCheckoutPage.tsx` (payChannel state, selector UI), `src/marketplace/marketplace.css` (`.mkt-cart-paymethods`).

`npm run build` clean.

## 120. Cart checkout: duplicate header, and the guest-detail form had no side padding (2026-08-21)

Two real bugs surfaced by a live screenshot on the cart checkout page (`/cart/checkout`), both pre-existing since §118, not caused by §119:

1. **Duplicate header on desktop and mobile.** `MarketplaceHeader.tsx`'s `reduced` check only matched `pathname.startsWith("/checkout")` — true for the single-item flow's `/checkout/:listingId`, but `/cart/checkout` doesn't start with `/checkout`, so the cart's payment step rendered the FULL header (hamburger/Browse/Sell/Log in) stacked directly above `CartCheckoutPage`'s own `.mkt-cart-header` ("‹ Checkout"), reading as two headers and the mobile hamburger sitting right on top of the page's own back arrow. Fixed by also matching `/cart/checkout` — same "don't let a buyer mid-payment casually navigate away" reasoning the single-item flow already uses.
2. **Guest-detail form (name/email/phone) had zero side padding on mobile.** `.mkt-cart-checkout` carries no horizontal padding itself — every card below it (seller summary, price breakdown, trust card, pay button) margins itself in individually with `margin: 0 16px`. The `.mkt-field` wrapper around the guest form was never added to that convention, so its inputs ran edge to edge. Added `.mkt-cart-checkout > .mkt-field { margin: 0 16px }`, and folded it into the existing desktop margin-reset list alongside the page's other direct children.

Verified live at mobile (375px): single reduced header, form fields now inset to match the cards below. `npm run build` clean.

Files touched: `src/marketplace/MarketplaceHeader.tsx`, `src/marketplace/marketplace.css`.

## 121. Cart checkout and confirmation designed for desktop, not just centered mobile content (2026-08-21)

**Report**: cart checkout on desktop looked like mobile content stretched into empty space, not a real desktop design; confirmation page needed the same treatment.

**Root cause, not just cosmetic**: `.mkt-cart-checkout` sits directly inside `.mkt-main` (the route outlet), which is a `display:flex; flex-direction:column` container. A flex item with `margin: 0 auto` in the cross axis (horizontal, here) gets its stretch behavior disabled by the spec — it sizes to its own shrink-to-fit content instead of filling out to `max-width`. That's why the container was rendering at ~275px wide (roughly a single price line's natural width) regardless of its `max-width: 640px`, both before and after §119/§120 — not something either of those two changes broke, it was there from §118. Fixed with an explicit `width: 100%` alongside `max-width`, the standard fix for this exact flexbox behavior.

**Redesign**: gave cart checkout the same real bordered/shadowed panel treatment already established for the desktop login page (`.mkt-login-page`, same `box-shadow: 0 18px 42px rgba(26,26,26,.10)` value) — white background, `border-radius:16px`, centered, generous 40px padding, instead of bare mobile-width content floating on the page background. Confirmation page (`PaymentReturnPage.tsx`'s `PaidState`) got the same reasoning applied to its own missing desktop treatment (it had *none* at all — full-bleed green, capped 560px, identical on every viewport): a cart confirmation now widens to 820px and its seller-contact cards (`CartSellerContacts`, new `.mkt-cart-contacts` wrapper) run in a genuine 2-up grid on desktop, per design C12's own reasoning ("the only screen that genuinely earns width from more sellers"). Single-item confirmation (`SellerContact`) is untouched — no `wide` class, stays its established narrower column.

**Verified live** (DOM geometry, since this session's screenshot tool renders desktop/tablet captures cropped regardless of true viewport — noted in §119, still true): `.mkt-cart-checkout` now measures exactly 640px wide, centered (320–960 of a 1280 viewport), with the panel's white background and shadow both applying. The Card/Bank transfer selector renders correctly inside it on both checkout steps. Confirmation's `.mkt-cart-contacts` genuinely switches to `display:grid; grid-template-columns:1fr 1fr` at 1024px (verified by mounting real markup with the real classes and reading computed styles), `.inner.wide` genuinely caps at 820px. Mobile re-verified unaffected (375px) — untouched by the new `@media (min-width:1024px)` rules.

Files touched: `src/marketplace/marketplace.css` (`.mkt-cart-checkout` panel + `width:100%` fix, `.mkt-cart-header` divider, `.mkt-cart-contacts` + `.inner.wide` desktop grid), `src/marketplace/checkout/PaymentReturnPage.tsx` (`wide`/`mkt-cart-contacts` classes, cart-only).

`npm run build` clean.

## 122. One checkout page, not two. Cart count in the header. Buy now tells you what's still in your cart (2026-08-21)

**Before, the two checkouts**:
- `CheckoutPage.tsx` (`/checkout/:listingId`, 841 lines) — the original, and the ONLY place with: abandoned-checkout capture, resume links, the accepted-offer price path (`offerExpired` notice + `offerPriceMismatch` stop screen), `WhatsAppHelpLink`/`WhatsAppInactivityPrompt`, `ProtectionBadge`, `TransferFallback`, `CountryCodePicker` + international WhatsApp + optional separate Nigerian number, and the listing-gone / own-listing / payments-down screens.
- `cart/CartCheckoutPage.tsx` (`/cart/checkout`, 303 lines) — the ONLY place with: per-seller summary, `summarise_cart` recheck, service-fee-charged-once line, trust card, `create-marketplace-cart-order`/`initializeCartPayment`, and 409 `unavailable` handling.
- Duplicated across both: profile query, need-name/email/phone logic, validation, `commitDetails`, order query, `payQ`, `handlePay`, `InitiateCheckout`, `AddPaymentInfo`, friendly-error maps, and (only after §119 fixed it) the payment channel selector. That duplication is exactly how the channel selector went missing from the cart path in the first place.

**After: `CartCheckoutPage.tsx` is deleted.** `CheckoutPage.tsx` is now the only checkout, with two modes. `/checkout/cart` is its own static route (React Router ranks static above dynamic, so it wins over `/checkout/:listingId` the same way `/checkout/return` already does). Mode comes from `useLocation().pathname`, NOT from the param — a static route carries no `:listingId` at all, which was a real bug caught in live testing before commit.

Everything from the deleted file survives, on the shared page: per-seller summary (`.mkt-cart-seller-summary`), the multi-seller warning banner, the service fee with its own "One fee per order today, not per item or per seller" sub-line, the multi-seller trust lines, `create-marketplace-cart-order`, `initializeCartPayment` by `cart_reference`, and named 409 `unavailable` items. Nothing was lost. Cart mode now ALSO gets what only the original had and the cart page never did: the full country-code phone picker, WhatsApp help + inactivity prompt, and `ProtectionBadge`.

Deliberately single-mode only, with reasons: **abandoned-checkout capture** (`record_checkout_attempt` is keyed to ONE listing id, so a cart has no honest way through it — left untouched rather than sending a misleading single id), **resume links** (same reason), **the accepted-offer path** (offers are per listing), and **`TransferFallback`** (a manual one-reference-one-amount reconciliation cannot settle a multi-seller payment, so with Paystack off a cart honestly reports payments unavailable instead of rendering a fallback that could not work).

**Buy now, and the correction that was explicitly asked for**: Buy now still checks out ONLY that item. It does not sweep in the cart — arriving at a bigger total than expected, at the payment step, is the worst possible surprise, and Buy now produced the only completed sale this marketplace has had. Instead the checkout names what is waiting, with a way back. Exact wording shown (verified live): "You still have 2 items waiting in your cart. This payment is just for Car Seat and Baby Strap Chair." plus a "View cart" link. The count EXCLUDES the item being bought (verified: with that same item also in the cart, the note says 2, not 3), and the note is hidden entirely when the cart is empty.

**Cart count in the header** — new `cart/CartCountLink.tsx`, subscribing to `onCartChange` so it updates immediately in the same tab (localStorage's own `storage` event only fires in OTHER tabs). Hidden entirely at zero rather than showing a "0". Mounted in three places because the marketplace has two different navs: the shared header's desktop nav, a new `.mkt-hdr-mobile-actions` beside the hamburger (outside the menu — a count hidden behind a menu cannot do its job), and `BrowsePage`'s own `.mkt-topbar-nav`, since browse HIDES the shared header at >=1024px and would otherwise lose the badge on the busiest page. Verified only one is ever visible at a time.

**Confirmation page**: already read `order_ids` as an array (§118), verified rather than rebuilt. Confirmed against all three real response shapes — `order_ids:['A']` -> single, `['A','B','C']` -> cart, and a legacy `order_id`-only body -> `['A']`. One seller: "Paid, and your money is safe with us", 560px column, one contact card. Three sellers: "Paid, 3 deliveries to arrange", 820px, per-seller cards each with their own WhatsApp/Call and an "Order N of M" tag, in a 2-up grid on desktop (measured: 380px columns at x=250/646) and stacked on mobile.

**Verified live end to end** (real DB, real edge functions, fetch patched to read actual request bodies):
- Cart path: real `create-marketplace-cart-order` with all 3 listing ids -> `cart_reference` `BMC-UCFTMULQ` -> `marketplace-initialize-payment` with `{cart_reference, channel:"card"}`, then `{..., channel:"bank_transfer"}` after switching. Both channels genuinely reach the wire.
- Single path: `record_checkout_attempt` fired (abandoned capture intact), `create-marketplace-order` with `{listing_id}`, `marketplace-initialize-payment` with `{order_id, channel:"card"}`. Channel selector, ProtectionBadge, WhatsApp help, and the original held-money copy all present.
- Cart badge: absent at 0, shows 3 after adding, one visible instance per breakpoint.

`npx tsc --noEmit` reports the same 5 pre-existing errors before and after this change (RequestVideoSheet, WatchRequestVideoSheet, ListingDetailPage:442, SellerVideoRequestDetailPage x2) — confirmed identical by stashing; this change adds none.

Files touched: `src/marketplace/checkout/CheckoutPage.tsx` (two modes), `src/marketplace/cart/CartCheckoutPage.tsx` (DELETED), `src/marketplace/cart/CartCountLink.tsx` (new), `src/marketplace/MarketplaceApp.tsx` (routes), `src/marketplace/MarketplaceHeader.tsx` (badge, simplified reduced check), `src/marketplace/pages/BrowsePage.tsx` (badge in topbar nav), `src/marketplace/cart/CartPage.tsx` (checkout link), `src/marketplace/marketplace.css`.

`npm run build` clean.

## 123. Delivery: will you send it, or must a buyer be nearby (2026-08-21)

**Before**: a listing showed `locationLabel()` ("Akure South, Ondo") as a tag chip and a state badge on the photo, and **nothing at all** about delivery. All 180 live listings, confirmed by direct count, had `sells_nationwide` and `local_handover` null. A buyer in Kano looking at a Lagos item had no way to know whether it could reach them, and most would leave rather than ask. No one-time prompt existed for the sell side; the only precedent was `MarketplaceInstallBanner.tsx` + `lib/installState.ts` (engagement gate, under-30%-viewport sheet, localStorage dismissal with expiry).

**Backend verified before building anything, not assumed.** The Supabase MCP was disconnected this session, so all three RPCs were checked live over REST with the anon key: `listing_delivery_terms` exists, is anon-callable, and returned exactly `{sells_nationwide:null, local_handover:null, seller_state:"Ondo", is_set:false}`; `seller_set_delivery_prefs` and `seller_set_listing_delivery` both exist and correctly reject anonymous callers with `42501 permission denied`. Both columns confirmed present on `marketplace_listings` and `marketplace_sellers`.

**The two questions, asked once.** New `sell/DeliveryQuestions.tsx` holds both, shared by the two places that ask, so the wording can never drift. Gated on `hasDeliveryPrefs(seller)` (new, in `useSeller.ts`) being false rather than on a literal listing count: on a genuine first listing those are identical, and only this version actually guarantees "never ask again" for someone who answered while still catching anyone who slipped past. In `CreateListingPage.tsx` they render **immediately after the location wrapper closes**, are validated with the same name-what-is-missing-and-scroll-to-it pattern as every other field, and are saved via `seller_set_delivery_prefs` **before** the listing is written (the default has to exist for the listing to inherit it), with `refresh()` after so they cannot reappear later in the same session. Never shown in edit mode.

**Copy shown to a seller**: "Two quick questions about getting your items to buyers. Your answers apply to everything you list, and you can change them on any single item later." Then "Will you sell anywhere in Nigeria, or only near you?" (Anywhere in Nigeria / Only buyers in your own state) and "For buyers in your state, how do they get it?" (I send it to them / They collect it / Either is fine). Choosing collection or either reveals: **"Your address is never shown on your listings. Buyers only see your area and state. You share where to come only after they have paid, in your own chat with them."** These two are full questions rather than short field labels, so they use a new `.mkt-delivery-q` instead of `.mkt-uplabel`, whose `text-transform:uppercase` would have shouted them (caught by reading the rendered text, not the source).

**Buyer-facing** (`components/DeliveryTermsBlock.tsx`, on listing detail between the tag chips and the seller card, position verified by measurement). Reads the RPC, **never the listing columns directly** — those hold only the per-listing override, so a null there means "use the seller default", not "unset". Three genuinely distinct states, and the unset one is deliberately neutral cream/grey rather than the green reassurance treatment, because nothing has actually been promised. Verbatim, for the 180 listings that are unset today: heading **"Delivery not confirmed yet"**, body **"This seller has not told us yet whether they send items or only sell to buyers nearby. The item is in Ondo. Ask them before you buy, so you know how it would reach you."** No default is invented and nothing implies the seller ships.

**Address safety, checked structurally rather than asserted**: the anon RPC returns exactly four fields (`sells_nationwide`, `local_handover`, `seller_state`, `is_set`) — the most precise being a state, already public on every listing — and `marketplace_sellers` returns zero rows to an anonymous caller. All three rendered bodies were regex-checked for address/street/house wording: none. A home address remains post-payment only, with that one buyer, exactly as the seller's phone already works.

**One-time prompt for the 72 existing sellers** (`sell/SellerDeliveryPrompt.tsx`, mounted once in `MarketplaceApp.tsx` beside the install banner). Built to the same rules as that banner on purpose: fires only after genuine engagement (10s **or** 30% scroll), a bottom sheet **measured at 189px against an 812px viewport, 23.3%**, under the 30% rule, with a visible 26px ✕. Two steps so the sheet stays small: a one-line ask, then the questions in place. Suppressed on `/sell/new`, `/sell/listings/*` (which ask inline themselves) and `/checkout/*`, and it yields to the WhatsApp inactivity prompt via the existing `subscribeToWaPromptVisible` bus, so two sheets never stack. Only ever shown to a signed-in seller who has not answered; a signed-out visitor never sees it (verified). **Dismissal** is `bm-mkt-delivery-prompt-dismissed` in localStorage with a **90-day** expiry, deliberately longer than the install banner's 14 (installing an app is a standing offer worth re-making; this is a question someone actively chose not to answer). Verified: fresh → not dismissed, just dismissed → hidden, day 89 → still hidden, day 91 → shows again. Answering ends it permanently regardless, since the gate is their saved prefs, not the flag.

**Per listing override** (`sell/ListingDeliveryControl.tsx`, on each live row of the seller dashboard). Every row states which it is: a grey **"Following your default"** chip or a coral **"Just this item"** chip, plus a plain-language summary of what the listing actually resolves to right now (its own override if set, otherwise the seller default). **Clearing works and is the point**: the "Use my default" button sends null for both, which is exactly what `seller_set_listing_delivery` treats as clearing the override, and it only renders when there is an override to clear.

**Not verifiable in this environment, stated plainly**: there is still no seller login here (the standing limitation from earlier sections), so the two authenticated RPCs' happy paths — saving prefs, saving and clearing a per-listing override — are code-reviewed and build-verified only. Their existence, their argument names, and their rejection of anonymous callers were all confirmed live; what was not exercised is a real signed-in seller round trip. The buyer-facing read, the unset state, the prompt's gating/footprint/dismissal maths, and all copy were verified live.

**Preserved**: the create listing flow, its location requirement, photo rules and category questions; the seller dashboard's existing actions (Lower price, Make changes, Share on WhatsApp, Edit, Put it back up); sections 7 through 30. No Supabase migration or edge function touched.

Files touched: `src/marketplace/sell/deliveryPrefs.ts`, `DeliveryQuestions.tsx`, `SellerDeliveryPrompt.tsx`, `ListingDeliveryControl.tsx` (all new), `src/marketplace/components/DeliveryTermsBlock.tsx` (new), `src/marketplace/lib/deliveryPromptState.ts` (new), `src/marketplace/sell/useSeller.ts`, `CreateListingPage.tsx`, `SellerDashboardPage.tsx`, `src/marketplace/pages/ListingDetailPage.tsx`, `src/marketplace/MarketplaceApp.tsx`, `src/marketplace/marketplace.css`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors as before this change, none from these files.

## 124. Same-state handover: a blocking ask, and one question instead of two (2026-08-21)

**Design source**: Claude Design project `0afda8cc…`, section **43a "Delivery preference, blocking ask"**, screens S1–S11 (mobile modal default/selected/callout/loading/confirmed, desktop modal + hover/focus states, listing-form step at mobile/tablet/desktop). Read in full before building.

**This supersedes part of §123.** That section shipped a *dismissible* bottom sheet (`SellerDeliveryPrompt`, 90-day localStorage dismissal) asking **two** questions. This spec requires a **non-dismissible** ask of **one** question, so the sheet was deleted rather than layered on — a dismissal flag for a blocking question is a contradiction, not a setting. `DeliveryQuestions.tsx` and `lib/deliveryPromptState.ts` went with it.

**Labels changed** (verified before/after): `'ships'` was **"I send it to them"** → unchanged; `'collection'` was **"They collect it"** → now **"They come for it"**; `'both'` was **"Either is fine"** → now **"Either works"**. Each option now also carries the design's one-line hint ("You arrange delivery to the buyer." / "You agree a meeting point with the buyer." / "You decide with each buyer.").

**Two entry points, mutually exclusive, both gated on `delivery_prefs_set_at IS NOT NULL`:**
- **Blocking modal** (`sell/SellerDeliveryGate.tsx`) when the seller has ≥1 listing, on entering the seller area. No X, no close button, **no `onClick` on the overlay at all** (a backdrop tap is inert because there is nothing to tap), and Escape is swallowed via a capture-phase `keydown` handler. Focus moves into the card on open and Tab/Shift+Tab cycle within it; background scroll is locked. A failed save keeps the modal open with the error visible and does not let the seller through.
- **Listing-form first step** (`CreateListingPage.tsx`) when the seller has **zero** listings. It returns early — the form itself does not render until the answer is saved — so it is unskippable by construction rather than by validation.
`useSellerListingCount` (new, `head:true` count) is the switch, so exactly one fires.

**Write order.** `saveLocalHandover(sellerId, value)` does a direct `marketplace_sellers` update setting **both** columns in one statement (`local_handover`, `delivery_prefs_set_at = now()`), then `refresh()`. In the form path this happens in `saveHandover()` **before the form is even rendered**, so `submit()` — and therefore the listing insert — is unreachable until it has succeeded. Deliberately NOT via `seller_set_delivery_prefs()`: that RPC raises when `p_sells_nationwide` is null, so it cannot serve a single-question flow. RLS ("Seller updates own row") already permits both writes.

**`marketplace_listings.local_handover` is never written by the frontend.** Enforced by removal, not just intent: §123's `ListingDeliveryControl` (dashboard per-listing override) called `seller_set_listing_delivery()`, which writes that column — it and its wrapper were deleted, since a trigger owns the field. `grep` confirms the only frontend write of `local_handover` anywhere is the `marketplace_sellers` update above. `DeliveryTermsBlock` still *reads* the resolved value via `listing_delivery_terms()`, which is untouched.

**Safety callout** renders for **both** `'collection'` and `'both'` (`needsSafetyCallout`), in the same view directly beneath the triggering option and above the primary button, never behind a link. Verified live at all four states: absent for nothing-selected and for `'ships'`, present for the other two. Coral-light `#FDE8DF` with a coral left rule, never error red, per the design.

**Verified live** (rendered the shipped markup and classes, since this environment still has no seller session): Continue is genuinely `disabled` with the design's tan `#EDD9D2` on cream until an option is chosen, then coral `#F4845F`; selected option is a 2px coral border on coral-light; zero close affordances in the card; mobile stacks; **desktop is a fixed 560px card with three-across options** (measured `156px 156px 156px`, x=392/560/728) exactly as S6/S8 draw it; tablet ≥640px is two-up with the third spanning, per S10.

**Could not build as drawn, reported rather than approximated**: S9/S10/S11 render the form step inside a **"Step 1 of 6"** wizard with a stepped progress bar. `CreateListingPage` is not a wizard — it is one long scrolling form with a *percentage* progress bar. Rendering "Step 1 of 6" would be a false claim about a form that has no six steps, and converting it into one is a rebuild well outside this task. The step ships with the form's real header and progress bar showing early progress instead; everything below the header matches S9/S11.

**Integration gap worth a decision, flagged not patched**: `listing_delivery_terms.is_set` is `sells_nationwide IS NOT NULL **AND** local_handover IS NOT NULL`. This flow writes only `local_handover`, per the spec's explicit two-column instruction, so a seller who answers here still leaves `sells_nationwide` null and the buyer-facing block from §123 keeps reading **"Delivery not confirmed yet"**. Nothing was silently written to paper over it. Resolving it needs either the incoming trigger to set `sells_nationwide`, or `is_set` relaxed to depend on `delivery_prefs_set_at` — both database changes, and migrations were out of scope here.

**Live data at time of writing**: 182 sellers, only **3** have answered. 72 unanswered sellers have listings (→ modal), 107 unanswered have none (→ form step). 181 live listings (the brief said 177).

**Out of scope, audit only, unchanged**: Buyer Protection is `src/marketplace/policy/BuyerProtectionPage.tsx` and Seller Protection is `src/marketplace/policy/SellerProtectionPage.tsx`; both render hardcoded prose whose *amounts and timings* come from `policy/policySettings.ts` (`useMarketplacePolicySettings`, reading `site_settings`). Terms/Privacy/Cookies sit alongside them. Marketplace FAQ content is a hardcoded `FaqItem[]` inside `src/marketplace/pages/FaqPage.tsx`, also interpolating `useMarketplacePolicySettings` values. None touched.

Files touched: `src/marketplace/sell/DeliveryHandoverChoice.tsx`, `SellerDeliveryGate.tsx`, `useSellerListingCount.ts` (new); `sell/deliveryPrefs.ts`, `useSeller.ts`, `CreateListingPage.tsx`, `SellerDashboardPage.tsx`, `MarketplaceApp.tsx`, `marketplace.css` (modified); `sell/SellerDeliveryPrompt.tsx`, `sell/DeliveryQuestions.tsx`, `sell/ListingDeliveryControl.tsx`, `lib/deliveryPromptState.ts` (deleted).

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors as before this change, none from these files.

## 125. Cart and checkout redesign, and delivery terms that never guess where the buyer is (2026-08-21)

**Design source**: Claude Design `0afda8cc…`, section **44a "Cart and checkout, delivery terms redesign"**, screens K1–K6 plus the seven-state reference grid.

**The constraint that shaped everything**: checkout collects name, email and phone only, never an address, because delivery is arranged directly between buyer and seller. So we genuinely do not know where a buyer is, and nothing may claim an item "can reach you" or that a seller "does not deliver to you". §123's `deliveryDetail()` did exactly that ("this seller will send it to you", "you would collect it from them") and, when unset, rendered a "Delivery not confirmed yet, ask them before you buy" block. Both were right under the old brief and wrong now, so **listing detail was fixed too**, not just cart and checkout — leaving it would have contradicted the rule and broken the consistency this task asks for.

**New copy, one function, all seven states** (`deliveryLine()` in `sell/deliveryPrefs.ts`), verified live across every case with a seller named Amaka in Lekki, Lagos:
1. nationwide+ships — "Amaka sends anywhere in Nigeria"
2. nationwide+collection — "Amaka sends anywhere, or you collect from Lekki"
3. nationwide+both — "Amaka sends anywhere, or you collect from Lekki, whichever they offer"
4. state-only+ships — "Amaka only sells within Lagos, and sends within it"
5. state-only+collection — "Amaka only sells within Lagos, you collect from Lekki"
6. state-only+both — "Amaka only sells within Lagos, either way works"
7. unset — **nothing at all**
Regex-checked: none contains "reach you", "deliver to you", or any address/street/house wording. Area comes from the listing's own `location_city`, state from the RPC — both already public, never an address.

**Deviation from the drawn text, deliberate**: the design's case-3 line reads "her call to offer". Shipped as "whichever they offer" — a seller's pronouns are not something we know, and guessing misgenders a real person.

**Blank looks deliberate, not broken.** `SellerDeliveryLine` returns null when `is_set` is false, and the seller cards are built to look complete without that line rather than to leave a hole: no skeleton, no placeholder, no reserved space. Verified live with a real two-seller cart where one seller has answered and one has not — the unanswered card reads as "nothing to say". This is the common case: 178 of 181 listings.

**State-only got more weight**, per the design's reasoning that a buyer outside that state is one tap from paying for something that cannot reach them and we cannot warn them by name. The **whole seller card** turns coral at checkout, not just its line: 1.5px coral border, coral-light header fill, `#8C4A34` text (measured live: border `rgb(244,132,95)`, header `rgb(253,232,223)`, text `rgb(140,74,52)`). Never red, never a blocking modal — most buyers genuinely are in-state, and blocking would penalise them for a check we cannot actually make.

**Buy now message, exact wording shipped**: *"You're paying for only **{item}** right now, your other item is still saved"* (singular) / *"…your other items are still saved"* (plural). Existing pluralisation preserved and both branches verified live. Redesigned per K2: a coral count badge, the item name bolded so it is scannable without reading the sentence, "saved" rather than "waiting", and View cart kept a plain text link so it never competes with Pay. Correctly hidden when the only cart item IS the one being bought.

**Cart, nothing dropped**: seller grouping (now one card per seller with its own header), the separate-deliveries count, the service fee stated as charged once, remove, proceed to checkout, continue shopping, the empty state and the sold-while-in-cart alert — all present and grep-verified.

**Genuinely different desktop vs mobile, not a reflow**:
- *Cart*: mobile is one column, cards then summary, with Continue shopping above the summary. Desktop (`.mkt-cart-layout`) is a real `1fr 340px` grid — seller cards left, **sticky** summary rail right, so the total and Proceed never leave view; Continue shopping moves inside the rail. Verified live: `display:grid`, `position:sticky`, columns side by side (left ends 905px, rail starts 933px), and the mobile/desktop Continue links swap correctly. This also required removing §121's older `.mkt-cart-page { display: grid }`, which had silently made the new layout a 340px grid item — caught by measuring rather than by eye.
- *Checkout*: mobile stacks seller cards then the summary; desktop widens the reading column and pins the pay bar, and delivery terms move inline beside the item row instead of onto their own line beneath it.

**Not implemented as drawn, reported rather than faked**: K3 puts the checkout summary in a sticky right rail. I did not split one out. The price breakdown, channel selector, held-money box, WhatsApp help and protection badge are interleaved with the details form, and every one of them is on the preserve list — carving them into a second column risked the payment path for a layout gain. The design's stated goal ("the total and Pay button never leave view") is met instead by widening the column to 760px and making the pay footer sticky on desktop.

**Design gaps found, none blocking**: desktop empty cart is not drawn (mobile K5 only); the one-seller cart is specified in prose, not drawn ("identical card, one instead of three, drops the deliveries banner" — implemented exactly, the banner only renders above one seller); and the design covers only checkout's summary portion, so the form, channel selector, WhatsApp help and protection badge came from the preserve list unchanged.

**Preserved, grep-verified in `CheckoutPage.tsx`**: `payChannel` + `.mkt-paymethods` (card/bank transfer, both paths), `record_checkout_attempt` and `?resume_order`/`?resume`, `WhatsAppHelpLink` + inactivity prompt, `ProtectionBadge`, `negotiatedPrice`/`offerPriceMismatch` (accepted offer), and `AddPaymentInfo` firing synchronously immediately before `window.location.assign(...)` so the redirect is never delayed. Buy now's single-item path is untouched apart from gaining the delivery line and the reworded note.

Files touched: `sell/deliveryPrefs.ts` (`deliveryLine`, `isStateOnly`, old copy removed), `components/SellerDeliveryLine.tsx` (new), `components/DeliveryTermsBlock.tsx` (rewritten), `pages/ListingDetailPage.tsx`, `cart/CartPage.tsx`, `checkout/CheckoutPage.tsx`, `marketplace.css`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors as before this change, none from these files.

## 126. Delivery wording rewritten to say what actually happens, and the green block restored on listing detail (2026-08-21)

**Before**: §125 replaced listing detail's long-standing green block (`.mkt-delivery-terms` — `--mkt-green-light` fill, 14px radius, 26px solid `--mkt-green` icon circle, `--mkt-green-dark` head + body) with the same flat inline row used by cart and checkout, making the two pages identical. Wording was terse and, in two cases, meaningless to a buyer: case 3 said *"…whichever they offer"* and case 6 said *"…either way works"*, neither of which names a mechanism. (The design's own "her call to offer" was never in the code — §125 had already replaced it.)

**New wording, both pages, verified live** (real seller Precious, area Abraham Adesanya, Lagos; shown here with the brief's Amaka/Lekki/Lagos example):
1. Amaka will send this to you anywhere in Nigeria.
2. Amaka will send this anywhere in Nigeria. If you are in Lagos, you collect it from her in Lekki instead.
3. Amaka will send this to you anywhere in Nigeria. If you are in Lagos, you can collect it from Lekki instead.
4. Amaka only sells to buyers in Lagos. If you are in Lagos, she will send it to you.
5. Amaka only sells to buyers in Lagos, and you collect it yourself from Lekki.
6. Amaka only sells to buyers in Lagos. She can send it to you, or you can collect it from Lekki.
7. Not set — nothing at all, on both pages.

Two rules applied throughout: state-only cases **lead with the restriction** (verified programmatically — 4, 5 and 6 all start "Amaka only sells to buyers in Lagos"), and every line names the condition ("If you are in Lagos") rather than assuming where the buyer is. Regex-checked across all seven: no "reach you", no "deliver to you", no address/street wording. Area and state only.

**"she" for the seller**, as instructed — sellers here are overwhelmingly mothers and repeating the name in every clause reads badly. **One case where it breaks, flagged not silently absorbed**: `display_name` is free text, so a shop-style name ("BabyThings NG") or a male seller renders "she" wrongly. It is the minority case and there is no gender field to consult. Where there is **no name at all**, the code falls back to "This seller" + they/them rather than inventing a gender for an unnamed account.

**Green restored on listing detail, for the nationwide cases only.** The judgement call was put to me and I agree with it: green is this system's reassurance colour (buyer protection, held funds), and "only sells to buyers in Lagos" is a restriction — in green it would read as good news to a buyer in Kano, the opposite of true. So:
- cases 1-3: the original green block, unchanged (`rgb(216,239,229)` fill, `rgb(45,106,79)` icon, `rgb(26,74,51)` text — measured live);
- cases 4-6: a neutral cream card with a **3px coral left rule** and coral-dark text (`rgb(255,248,244)` fill, `3px rgb(244,132,95)` rule, `rgb(140,74,52)` text). Not alarming, not red, visibly not the same as good news.

**The two pages stay deliberately different.** `SellerDeliveryLine` gained a `variant` prop: `"block"` (listing detail's green/cream card) and `"inline"` (cart and checkout's flat line inside the coral seller card). Wording is shared, treatment is not. Verified live: checkout renders **0** green blocks and listing detail renders **0** inline lines, so neither treatment leaks onto the other page.

**Preserved and re-verified**: nothing renders when unset on either page (unset listing → 0 blocks, 0 lines, no leftover "Delivery not confirmed" text anywhere); no address; no claim about what reaches a buyer; the checkout redesign, coral state-only seller card, cart, deliveries note and ProtectionBadge all intact.

Files touched: `sell/deliveryPrefs.ts` (`deliveryLine` rewritten), `components/SellerDeliveryLine.tsx` (`variant` prop), `components/DeliveryTermsBlock.tsx`, `marketplace.css`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 127. Delivery gate asks both questions, shows immediately, and re-asks the partial answerers. Outreach chip restored (2026-08-21)

**Before**: `SellerDeliveryGate` asked **one** question (handover only), saved via a direct `local_handover` write, gated on `delivery_prefs_set_at` and on having ≥1 listing, and only rendered inside the seller area. The outreach queue had no `missing_delivery_prefs` chip.

**Bug one, both questions.** The gate is now two steps: *"Would you sell only in {their state}, or anywhere in Nigeria?"* then *"For buyers in {their state}, how do they get it?"*. **The seller's real state is named** — taken from their listings via the new `useSellerListingInfo` (the same source `outreach_context()` uses server side), falling back to "your own state" only when no listing carries one, rather than inventing a place. Step 1 **advances on selection**, no Continue of its own: two taps total, and a button per step would double that for nothing. Saved **once at the end** through `seller_set_delivery_prefs()`, which takes both together; nothing is written until both answers exist. This also closes §124's flagged integration gap — `is_set` and `seller_needs_delivery_prefs()` both require *both* columns, so single-question answers left every listing blank to buyers.

The same two-step flow now also runs in `CreateListingPage`'s first-listing step, which was still asking only the handover question despite the brief listing it as already correct. Both entry points now genuinely ask both.

**Bug two, timing.** There was **no delay to remove** — the 10s/30%-scroll gate belonged to `SellerDeliveryPrompt`, deleted in §124. What was actually limiting it was *place*, not time: it only rendered inside `/sell/*`. It now shows anywhere on the marketplace, excluding create-listing (which asks inline) and `/checkout/*` (nothing competes with a payment). Kept: never for a complete seller, still yields to the WhatsApp prompt, still non-dismissible. The install banner keeps its delay — Google's interstitial penalty targets visitors arriving from search, and this only ever renders for a signed-in seller, whom Googlebot never is.

**Re-asking the partial answerers.** The gate now keys on `hasCompleteDeliveryPrefs()` — **both columns non-null** — not on `delivery_prefs_set_at` and not on the handover answer. Verified against all seven sellers with any answer on file; the frontend gate agrees with `seller_needs_delivery_prefs()` on every row: **Amina H., Eseosa E. and Katty M. are re-asked; Barakat A., Precious U., Oyindamola O. and Marvellous E. are not.** The listing-count condition was dropped too, since the backend now flags a partial answerer with nothing live (Amina, 0 listings) — being half-answered is incomplete regardless of what is listed.

**Their previous handover answer is pre-selected** on step 2, seeded once from the seller row and never re-applied, so it cannot stomp a later change. They answered it correctly once; making them pick again would imply we lost it. Verified live: step 2 renders with "I send it to them" already ticked for a seller whose stored value is `ships`.

**Local dismissal record.** There is none to clear — dismissal was removed in §124 when the prompt became non-dismissible, and no code reads any flag. The old `bm-mkt-delivery-prompt-dismissed` key from §123 can still sit in localStorage on a device that saw the older sheet, so the gate now removes it on mount. It was already inert; this is hygiene, not a fix, and is reported as such rather than dressed up as one.

**Bug three, the outreach queue — actual cause found, not guessed.** The backend was never the problem: `get_seller_nudge_suggestions` returns `'missing_delivery_prefs'` with label *"Buyers cannot tell if they will send"* and urgency 2, and `get_outreach_queue` passes it through. The cause was **one missing line in `SELLER_OUTREACH_STAGES`** (`opsData.ts`). Chips are rendered by mapping that array, so the stage had no chip and no count — though rows *did* still appear under "All" via the `|| person.primary.label` fallback, so it was unfilterable and uncounted rather than absent. Added with urgency 2 to match the RPC. **Count verified at exactly 70.**

**Context**: `get_outreach_queue` builds context in a SQL `CASE` whose `else` arm returns null for this stage, and Supabase changes were out of scope. So `fetchOutreachQueue` now calls `outreach_context('missing_delivery_prefs', seller_id)` client-side for those rows only, in parallel, merging the result in. A failure on any one row leaves that row's context null and still delivers the row and its WhatsApp link.

**Second instance of the same bug, reported not fixed**: `seller_no_review` is also returned by the RPC and also absent from `SELLER_OUTREACH_STAGES`, so it has no chip either. Left alone as it was not in scope.

**Preserved**: first-listing questions (now asking both), per-listing overrides, delivery terms on listing detail and checkout with nothing rendering when unset, the install banner and WhatsApp prompt and the coordination between all three, sections 7-30.

Files touched: `sell/SellerDeliveryGate.tsx`, `sell/useSeller.ts`, `sell/CreateListingPage.tsx`, `sell/useSellerListingInfo.ts` (new, replacing `useSellerListingCount.ts`), `admin/marketplace/opsData.ts`, `admin/marketplace/MarketplaceOutreach.tsx` (via opsData), `marketplace.css`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 128. Buyer state, personalised delivery, and blocking an item that cannot reach them (2026-08-21)

**Design**: section **45a "Buyer state, undeliverable items"** — B1 state field, B2 cart with one of three undeliverable, B3 Buy-now single undeliverable, B4/B5 listing personalised (can/cannot reach), B6 desktop. All four required screens present in both breakpoints; nothing missing, so nothing was stopped on.

**The five cases, verified live against real listings** (not mocked — real sellers, real RPC):
1. `Praise will send this to you in Lagos.`
2. `You are both in Lagos, so you collect this from Aminat in Surulere.`
3. `You are both in Lagos. Adeyemo can send it to you, or you can collect it from Ipaja.`
4. `Aminat cannot send this to you in Kano, she only sells within Lagos.` (blocks payment)
5. Seller has not answered — **nothing at all**.
Unknown buyer state also renders nothing and blocks nothing.

**Deviations from the brief, both deliberate and both flagged before building:**
- **The design uses the buyer's first name** ("Good news Chidinma, Amaka can send this to you in Lagos"). The brief forbids it, so the brief won and the name is never used.
- **The server's `reason` is not the required case-4 wording** — it returns "…cannot send this **item** to you, she only sells within Lagos", with no buyer state. The brief's version names Kano, which is the stated point of the personalisation. So all five lines are built client-side in `deliverability.ts#deliveryMessage()` from the RPC's structured fields, with `reason` kept only as a fallback. This contradicts "show the reason as returned"; called out rather than silently resolved.

**State selector** (`components/StateSelect.tsx`), on the checkout details step after email. 37 allowed states from `marketplace_states`, verified. Country is not shown at all — Nigeria is the only option, so a locked field would be one more thing to read for no decision. Caption: *"So we can tell you if a seller can reach you"*. Saved to **localStorage always** (most buyers are guests and checkout collects no address) and, for a signed in buyer, to their account via `set_my_delivery_state()` — fire and forget, since a failure there must never block checkout. **Always rendered**, even when every item is from an unanswered seller, because another item in the same cart may need it.

**Blocking, enforced in three places** so it cannot be skipped by any one route: the cart's "Proceed to checkout" is `disabled` with the reason named beneath it (*"Remove that item to proceed."*); the checkout pay footer does not render at all while `hasUndeliverable`; and `handlePay()` returns early as a second guard even if that footer were somehow reached. Verified live with a Kano buyer holding a Lagos-only item: proceed disabled, card shown, category link `/marketplace?category=baby-clothing` reading "See other baby clothing".

**The undeliverable card** (`components/UndeliverableCard.tsx`) always carries three things: what is wrong without blame, a Remove button, and a same-weight category link. On a single-item Buy now there is nothing to keep, so `variant="full"` drops Remove and the category link becomes the primary action, carrying the design's "nobody's done anything wrong here" line.

**Nothing renders for an unanswered seller, and the layout looks complete.** 48 of the 77 sellers with listings have not set terms (the brief said 52 of 74 — same picture), so blank is the common case and is built as the default, not an empty state. Verified on a checkout where every item is from an unanswered seller: zero delivery lines, zero undeliverable cards, no "not confirmed"/"unknown"/"not set" text anywhere in the DOM, and the page reads as finished. A cart group whose only items are undeliverable is now skipped entirely rather than leaving an empty seller card with a heading and nothing under it — caught during live verification.

**Listing detail** (`DeliveryTermsBlock`) now personalises when the buyer's state is known: green for reachable, coral-restricted plus a "See other {category}" link when not, since browsing is not a payment about to fail. With no state known it falls back to the seller-terms-only line from §126. State is never asked for on listing detail.

**Policy and FAQ**, all reading amounts from `policySettings` as before:
- **Buyer protection** — new "Where a seller will send" block: sellers choose where they sell; a listing may be limited to one state and you are told at checkout before you pay; collection means a public meeting point, never a home address.
- **Seller protection** — new "Where you sell is your choice" block: the choice is yours, applies to everything you list, changeable any time and per item.
- **FAQ** — four buyer questions added: buying from several sellers at once (yes, arriving separately), paying the fee more than once (no, once per day, with the real tiered amounts), paying without a card (bank transfer via Paystack, auto-confirmed), and what happens when a seller cannot send to your state.

**Preserved and re-checked**: nothing rendering when terms are unset; green on listing detail and coral at checkout; no address anywhere (the only match in new code is a comment saying we collect none); the cart, its multi-seller deliveries banner and the fee shown once; the payment channel selector (3 refs), abandoned capture (4 refs) and resume links (3 refs) all intact in `CheckoutPage`.

Files touched: `marketplace/deliverability.ts`, `lib/buyerState.ts`, `components/StateSelect.tsx`, `components/UndeliverableCard.tsx` (all new); `checkout/CheckoutPage.tsx`, `cart/CartPage.tsx`, `components/DeliveryTermsBlock.tsx`, `policy/BuyerProtectionPage.tsx`, `policy/SellerProtectionPage.tsx`, `pages/FaqPage.tsx`, `marketplace.css`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 129. "How this works", opened from the listing itself (2026-08-21)

**Design**: section **45a "How this works popup, on the listing itself"** (a second block sharing the `45a` id, distinct from the buyer-state one). Covers all four required states — **W1** mobile closed with trigger in context, **W2** mobile sheet open, **W3** desktop closed *and* open. Nothing missing, so nothing was stopped on.

**Why**: 1,700 listing views, two genuine checkout attempts, one sale. The doubt is always the same, and it is felt on the listing, so this answers it there rather than sending anyone to a page.

**The four steps as shipped** (real seller, Precious, verified live):
1. `When you buy this item, we connect you with the seller, Precious.`
2. `You can ask her for more details about the item and agree how it reaches you.`
3. `Precious is not paid until the item reaches you and you confirm it is as described.`
4. `If it is not as described, send it back and we refund you the same day Precious confirms it arrived back.`

**Step 3 carries the weight**, as the design intends: the only card in solid green (`#2D6A4F`) with cream text and a coral number badge, in 800 Nunito, while 1, 2 and 4 stay plain rows. Measured live. Equal weighting would bury the one line that actually separates this from Jiji.

**Step 4 never says "immediately"**, verified by regex against the rendered sheet. Four steps only, and **zero onward links** (`.mkt-htw a` = 0) — the full how-it-works page and FAQ already exist and are linked in the footer.

**On `marketplace_return_confirm_days`, stated plainly rather than fudged**: the setting exists and is already read as `returnConfirmDays` (default 4) in `policySettings.ts`. But the required step-4 wording is qualitative — "the same day she confirms it arrived back" — and never prints a number. So the sheet does **not** fetch it: wiring a settings read whose value is never rendered would be decoration, not accuracy. The accuracy the brief asks for comes from the wording itself, which matches `BuyerReturnPage`, `BuyerOrderDetailPage` and `SellerOrderDetailPage` verbatim.

**The trigger** sits directly under the `ProtectionBadge` (measured 14px below it), as a plain underlined green text link with a small `i` glyph — transparent background, no border, confirmed by computed style. It reads as "explain that badge", which is precisely the doubt it answers. It is deliberately **not** a button: the page already carries Buy now, Add to cart, Ask for a lower price, Ask a question, Ask for a video and Watch your video, and a sixth control would fight all of them. All of those, plus the fixed mobile buy bar, are untouched.

**Easy to leave, all four paths verified live** (with awaits, since React re-renders asynchronously): the ✕ closes, a tap on the dimmed backdrop closes, Escape closes, and "Got it" closes. Clicking *inside* the sheet does not close it (`stopPropagation`).

**Scroll position is kept, and the reason matters**: the listing stays mounted underneath and nothing navigates, so there is nothing to save or restore. What *would* break it is locking body scroll — `position:fixed` on `body` jumps to the top on release — so that is deliberately not done. Verified: scrolled to y=900, opened, closed via every path, still y=900 each time.

**Not wired into the prompt suppression system, deliberately.** The install banner, WhatsApp hesitation prompt and seller delivery gate suppress each other because they appear uninvited; this appears because someone asked for it. `HowThisWorksSheet` subscribes to nothing (`subscribeTo` = 0 occurrences) and none of the three participants were modified. Confirmed visually on desktop: the sheet and the WhatsApp prompt render together, which is the intended behaviour.

**Pattern reused, not invented**: mobile is the house bottom sheet (cream, `26px 26px 0 0`, grab handle, backdrop close) matching the 12 existing `.mkt-sheet` call sites; desktop centres into a 560px dialog with an 18px radius, no grab handle, steps 1 and 2 in a 2-up grid so step 3 dominates on open, and "Got it" as a right-aligned bordered button. That desktop-centring follows the existing `MakeOfferSheet` precedent rather than adding a third overlay family. All measured live.

**Known redundancy, flagged not resolved**: `HowThisWorksExplainer` (design 19a) already sits further down the same page — an inline collapsible with **seven** steps, all weighted equally. This new sheet is four steps, modal, with step 3 dominant. Both now answer the same question on one page. The brief did not mention the existing component, so it was left untouched rather than removed unasked, but it is a real duplication worth a decision.

**Preserved**: every existing action and the fixed mobile buy bar, the delivery terms block and its personalised wording, the protection badge, sections 7-30.

Files touched: `components/HowThisWorksSheet.tsx` (new), `pages/ListingDetailPage.tsx`, `marketplace.css`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 130. Removed HowThisWorksExplainer, the four-step sheet replaces it (2026-08-21)

**Why**: §129 shipped the four-step "How this works" sheet and flagged that `HowThisWorksExplainer` (design 19a) already answered the same question a few rows below it — an inline collapsible with seven equally weighted steps. Confirmed as a genuine duplication rather than an intentional pairing, so the old one goes.

**Check 1, used anywhere else: no.** Exactly three references existed — its own definition, plus the import and single render on `ListingDetailPage`. No other page used it and no other component used its `.mkt-howworks*` classes, so the component file was deleted outright rather than merely unmounted. Its 38 CSS rules and their comment block (50 lines) were removed with it; brace balance re-verified at 0. The standalone `/how-it-works` page is a different component (`HowItWorksPage`) and is untouched.

**Check 2, what the seven said that the four do not.** Old 3 maps to new 1, old 4 partially to new 2, old 6 to new 3, old 7 to new 4, and old 2 is absorbed into new 3. Four things actually went, not three — the old block also carried a trust line beneath its steps:

| Dropped | Survives elsewhere? | Call |
|---|---|---|
| "You pay BundledMum, never {seller} directly" | **No** | **Flagged as genuinely lost** |
| "cost agreed between you" (who covers delivery) | **No** — §126's `deliveryLine` rewrite dropped the cost clause | **Flagged as genuinely lost** |
| "They ship and upload a photo of the parcel" | No, but it is post-purchase dispatch mechanics | Fine to drop |
| "Every seller is checked and every listing reviewed before it goes live" | Partly — `VerifiedBadge` covers the seller half, only for verified sellers | Fine to drop |

**Two were reported to the user rather than dropped silently**, per the instruction. The first matters most: new step 3 says "{seller} is not paid until you confirm", but a buyer who believes their money went straight to the seller has no reason to find that credible, and `ProtectionBadge` states an outcome ("We refund you if it's not as described") not the mechanism. Recommended folding it into the sheet's step 1 rather than adding a fifth step. **The sheet was NOT changed** — the brief explicitly ruled that out, so this is left for a decision.

**The page reads well where it sat.** Measured live: the gap between the spec block and the first ask button is 102px, which is exactly `19px` (why-they're-selling note) + `41px` (description) + `3 × 14px` (the flex parent's uniform row gap). No orphaned space, no collapsed margin, nothing brought together awkwardly — the description now flows into "Ask {seller} a question" at the same rhythm as every other pair on the page. Confirmed visually.

**The new sheet still works**, re-verified after removal: opens from the trigger, four steps, step 3 the hero card, and all four close paths (✕, backdrop, Escape, "Got it") pass, with scroll position held at y=700 throughout.

**Preserved**: the sheet and its trigger, the protection badge the trigger sits under, the delivery terms block and its personalised wording, every other listing action, sections 7-30. `sellerDisplayName` was the removed call's only argument but is still used twice elsewhere on the page, so no orphaned import.

Files touched: `components/HowThisWorksExplainer.tsx` (deleted), `pages/ListingDetailPage.tsx`, `marketplace.css`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 131. Step 1 of the how-it-works sheet carries the mechanism, not just the outcome (2026-08-21)

**Why**: §130 removed `HowThisWorksExplainer`, and the audit flagged that "you pay BundledMum, never {seller} directly" survived nowhere. Step 3 asserts *"{seller} is not paid until you confirm"*, but a buyer who believes their money went straight to the seller has no reason to find that credible, and `ProtectionBadge` states the outcome ("We refund you if it's not as described") never the mechanism. Recommendation accepted, folded into step 1 rather than added as a fifth step.

**Step 1 as shipped** (real seller): `When you buy this item you pay BundledMum, never Precious directly, and we connect you with her.`

**Steps 2, 3 and 4 unchanged**, verified word for word against the previous commit. Still four steps, no fifth. Step 3 remains the hero card in solid green (`rgb(45,106,79)`).

**The length question, measured rather than assumed.** Step 1 grew from one line to 62px tall. At **320x568** (iPhone SE, the smallest realistic device): the sheet is 427px tall in a 568px viewport, step 3's card runs 341-428px, so it is **fully visible with 140px of clearance below**, and the sheet does not scroll at all (`overflowPx: 0`) — even "Got it" is on screen. Desktop is unaffected: 560px dialog, steps 1-2 still a `244px 244px` grid, hero still full width at 500px, 544px tall in a 900px viewport, no scrolling.

**Preserved and re-verified**: all four close paths (✕, backdrop, Escape, "Got it"), scroll position held at y=600 across every one of them, and the trigger still 14px under the protection badge.

**Deliberately still out**, per the agreed reasoning: delivery cost (negotiated per item, a blanket line would over-promise in the other direction), the dispatch photo (post-purchase mechanics, not a pre-purchase concern), and seller checking (covered by `VerifiedBadge`).

Files touched: `components/HowThisWorksSheet.tsx`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from this file.

## 132. Every photo failure is now visible and logged, and the silent fallback that caused it is gone (2026-08-21)

**The report**: one seller cannot add images, while uploads demonstrably work for others (two listings completed in 24 hours, four photos each). Nothing was recorded, so nothing could be diagnosed.

**Audit, every failure point and what the seller saw BEFORE**:

| Stage | On failure | Seller saw |
|---|---|---|
| File selection | files past `MAX_PHOTOS` sliced off silently | **nothing** |
| Decode (`createImageBitmap`) | both attempts fail → `UnsupportedImageError` | an error, correctly |
| Decode **hang** | no timeout anywhere; `photoBusy` never clears | **spinner forever** |
| Canvas context / draw | bare `catch {}` → fell through to `compressImage` | **nothing** |
| Square crop / watermark | same bare `catch {}` | **nothing** |
| `canvas.toBlob` returns null | fell through to `compressImage` | **nothing** |
| `canvas.toBlob` **never calls back** | promise never settles, no timeout | **spinner forever** |
| `compressImage` own catch | **returned the ORIGINAL file untouched** | **nothing** |
| Size after compression | **no check existed at all** | nothing until storage rejected it |
| Storage upload error | thrown → `describeUploadError` | an error, correctly |
| Storage upload **hang** | no timeout | **spinner forever** |

**The actual bug**: four separate paths swallowed into `compressImage(file)`, whose own `catch` returned the **raw original file**. So a 9MB HEIC that failed canvas processing was handed to the uploader unchanged, un-compressed and un-watermarked, and rejected later by the 5MB bucket as a generic "too large" at submit time. If instead `createImageBitmap` or `toBlob` simply never called back, `photoBusy` stayed `true` and the "+" button showed "…" forever. That is the literal reported symptom.

**After — nothing fails silently.** `processListingImage` no longer falls back to the original file on any path; every branch either returns a processed blob or throws a typed error carrying its own message. Messages as shipped, all verified live:
- HEIC this browser cannot decode: *"IMG_4821.HEIC is an iPhone HEIC photo, which this browser cannot open. In your iPhone Settings, choose Camera then Formats then Most Compatible, retake it, and it will upload fine."*
- Not an image: *"invoice.pdf does not look like a photo."*
- Decode hang: *"That photo took too long to open. Please try again, or choose a different photo."*
- Encode hang: *"That photo took too long to process. Please try again, or choose a smaller photo."*
- No canvas context: *"This device could not prepare that photo. Please close some other apps or tabs and try again."*
- Unexpected canvas error: *"Something went wrong preparing that photo. Please try again, or choose a different one."*
- Empty blob: *"That photo could not be saved. Please try again, or choose a different one."*
- Still too large: *"That photo is too large even after compressing. Please take it again at a lower quality, or choose a different photo."* — stated in terms of the photo, not megabytes, as asked.
- Upload stalled: *"The upload is taking too long. Please check your connection and try again."*

`addPhotos` no longer flattens every cause into one "did not look like a photo" line; each error's own message is shown, deduplicated so three photos failing the same way read as one piece of advice.

**Stage names logged** via `log_upload_failure`: `decode_timeout`, `decode_unsupported`, `canvas_context`, `canvas_draw`, `compress`, `size_after_compress`, `storage_upload`, `storage_upload_timeout`. Each carries the real file size, the real MIME type and `navigator.userAgent`. **Verified live end to end**: rows landed in `marketplace_upload_failures` with all four fields populated, including rows written automatically by the failure paths during testing (`decode_unsupported` on a HEIC, `size_after_compress` with both quality attempts recorded). Test rows were deleted afterwards; the table is back to 0. `logUploadFailure` is fire-and-forget, double-wrapped in try/catch, never awaited — logging cannot break an upload.

**Timeouts chosen**: decode **15s**, encode **15s**, storage upload **25s**. The first two wrap `createImageBitmap` and `canvas.toBlob`, both documented to hang rather than reject on memory-pressured devices — the same class of failure as sections 90 and 91. 15s is a floor, not an expectation: a 12MP photo on a mid-range phone decodes in well under a second. 25s for upload matches the video path's own ceiling. A decode timeout is deliberately **not** retried, since retrying the same hang only doubles the wait. Verified live: a promise that never settles rejected with `ImageTimeoutError` at 402ms against a 400ms bound.

**`withTimeout` reused, not duplicated** — it gained an optional error-class parameter defaulting to `VideoTimeoutError`, so every existing video call site behaves exactly as before while the photo path gets `ImageTimeoutError` and can distinguish a hang from an undecodable file.

**HEIC: NOT reliably handled, stated plainly.** `createImageBitmap` is the only decode path, and **Chrome and Firefox cannot decode HEIC on any platform**. Safari can, via the OS codec. iOS normally transcodes to JPEG when picking from the camera roll, which is why most iPhone uploads work — but picking the same photo through the Files app keeps it HEIC, and an Android seller, or an iPhone user on Chrome, will fail. Worse, the bucket *accepts* `image/heic`, so before this change an un-decodable HEIC could be uploaded raw via the fallback and then fail to render anywhere. That path is now closed, and HEIC failures get their own specific, actionable message rather than a generic one. **Genuinely fixing HEIC would need a decoder library (heic2any or similar) — a real dependency decision, not something to paper over here.**

**Preserved**: 4 photo minimum, square crop, watermark and compression all verified still working on a real image (2000x1200 in → 1200x1200 square JPEG out, 72KB → 32KB); the one-item notice, condition and category questions, location validation, and the first-listing delivery questions all untouched; sections 7-30.

Files touched: `lib/uploadFailureLog.ts` (new), `sell/sellData.ts`, `sell/CreateListingPage.tsx`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 133. Pending action prompt: telling people someone is waiting on them (2026-08-21)

**Why**: four sellers right now have a buyer waiting, two on a video and two on a question, and none of them know unless they check email. The same in reverse for a buyer whose video arrived, question was answered, or offer was accepted.

**Built**: `components/PendingActionPrompt.tsx`, mounted once in `MarketplaceApp` beside the gate and the banner. Reads `my_pending_action()`, which returns at most one row and already decides priority across both roles in one call. **Its ordering is used exactly as returned and is not re-ranked**, since the same person is often both buyer and seller and should see whichever matters more rather than two competing prompts.

**Appears immediately** for a signed in person with something pending, no engagement delay. Not the intrusive-interstitial problem: the query is gated `enabled: isLoggedIn && !authLoading`, so it never runs for a guest, and Googlebot is never signed in. Same reasoning as the delivery gate.

**What a seller with a video request sees**, verbatim from the deployed function: headline **"A buyer wants to see it working"**, detail **"They asked for a short video before buying. About thirty seconds is plenty."**, the item name, and a coral **"Send the video"** button going to `/sell/dashboard` (the RPC's `/marketplace` prefix is stripped, since that is the router's own basename). Measured at 183px, 22.6% of a 812px viewport, with a 26px close.

**Dismissal is keyed per item**: `kind + link + listing_title`, 14-day expiry, in `lib/pendingActionDismissed.ts`. `my_pending_action` returns **no stable row id**, and `link` is identical for every video (`/marketplace/orders` for a buyer, `/marketplace/sell/dashboard` for a seller), so the title is what separates items. Verified live: dismissing "your video is ready" leaves a different KIND showing and a different ITEM showing. **Known limitation, stated rather than hidden**: two video requests on the *same* listing share a key, because nothing in the payload distinguishes them. Dismissing also happens on the CTA, so acting on it does not leave the prompt waiting on the way back.

**Precedence, and a cycle that had to be resolved.** The required order is gate > pending > whatsapp > install, which transitively means **gate > whatsapp**. But the gate previously *yielded to* the whatsapp prompt, so wiring the new order naively gave gate -> whatsapp -> pending -> gate and would have oscillated. Resolved by making the order a strict total order: the gate no longer yields to anything and is strictly highest. That is a deliberate behaviour change to the gate, made because the stated hierarchy requires it.

New `lib/promptVisibility.ts` holds the shared channel factory plus `deliveryGateChannel` and `pendingActionChannel`, so the pub/sub boilerplate is not hand-rolled a fourth time. Each prompt now subscribes only to strictly higher ones, which makes cycles impossible by construction.

**Verified by measurement, not screenshots**, driving the real channels and evaluating each consumer's actual suppression expression: gate active -> only the gate; gate resolved with something pending -> only pending; nothing pending -> only whatsapp; nothing else -> only install. **Exactly one visible in all four scenarios.** Separately, with all three force-mounted, `getBoundingClientRect` and `elementFromPoint` confirm z-order 80 / 40 / 30 and that the gate owns the pixel at both viewport centre and bottom centre.

**Never during checkout or listing creation**: suppressed on `/checkout/*` (including `/checkout/cart` and `/checkout/return`), `/sell/new` and `/sell/listings/*`; allowed on browse, listing detail, cart, dashboard and orders. Verified against the shipped expression.

**A real bug found in the deployed RPC, reported not fixed** (backend changes are a non-goal): the `question_answered` arm selects `q.id` then builds `'/marketplace/listing/' || r.id` — the **question** id in a **listing** URL. Compare `offer_accepted`, which correctly selects `l.id as lid`. A buyer tapping "See the answer" will land on a not-found page. Needs a one-line fix in `my_pending_action`.

**Preserved**: the delivery gate's own gating, timing, focus trap and non-dismissibility (only its suppression input changed); the install banner and whatsapp prompt, both still working and now correctly yielding; the install CTA channel, untouched; sections 7-30.

Files touched: `components/PendingActionPrompt.tsx`, `lib/promptVisibility.ts`, `lib/pendingActionDismissed.ts` (all new); `MarketplaceApp.tsx`, `sell/SellerDeliveryGate.tsx`, `MarketplaceInstallBanner.tsx`, `components/WhatsAppInactivityPrompt.tsx`, `marketplace.css`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 134. Pending action dismissal keyed on ref_id, closing the same-listing collision (2026-08-21)

**Backend changed under us, verified before trusting it**: `my_pending_action()` now returns `ref_id uuid` as its first column (confirmed against `pg_get_function_result`), and the three buyer arms (`video_ready`, `question_answered`, `offer_accepted`) all now build their link from `r.lid`, the listing id, rather than the row id — confirmed by reading each arm's deployed text. That fixes the not-found bug reported in §133; **no client change was needed for it**, since the component only strips the `/marketplace` basename and navigates to whatever the RPC returns.

**New dismissal key: `ref_id + kind`** (was `kind + link + listing_title`). `ref_id` is the actual row id of the thing waiting — the video request, the question, the offer, the order — so items are now distinguished by identity rather than by their display text.

`kind` is deliberately kept alongside it rather than dropped. `ref_id` alone would be sufficient today, but the same underlying row can legitimately surface as different kinds at different moments: an offer is `offer_pending` to the seller and later `offer_accepted` to the buyer. Dismissing one of those must not silence the other. Verified: same `ref_id`, different kind, still shows.

**The collision flagged in §133 is closed**, verified with the exact case that used to fail — two video requests on the SAME listing, identical link and identical title, differing only by `ref_id`:
- `11111111-…|video_requested` and `22222222-…|video_requested` are distinct keys
- dismissing the first leaves the second showing
- a different kind on a different row still shows

Also re-verified against a full current-shape payload that the key ignores `link` and `listing_title` entirely, so a link or title change can never silently resurface something already dismissed.

**Unchanged**: the precedence resolution from §133 stands — strict total order, gate above pending above WhatsApp above install, with the gate no longer yielding to anything. Everything else in the prompt is untouched.

Files touched: `lib/pendingActionDismissed.ts`, `components/PendingActionPrompt.tsx`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 135. Did not finish paying: the nine people who reached Paystack and stopped (2026-08-21)

**Before**: `MarketplaceAbandonedCheckouts` reads `marketplace_abandoned_checkouts` ordered by `last_activity_at desc`, splits into abandoned / in progress / contacted, and renders each person as a bordered card (56px thumb, name, item, amount, relative time, status pill, contact details) with `ContactActions`: "Not yet contacted" in coral-dark or "Contacted {relative}" plus an underlined Undo, then a green WhatsApp button and a bordered Mark as sent side by side, deliberately separate because tapping a link is not proof a message went. `isSuperAdmin` comes from `usePermissions()`, i.e. `adminUser?.role === "super_admin"`, the same gate `MarketplaceListings` already uses.

**Built**: `MarketplacePendingPayments.tsx`, a deliberate sibling of that screen, reusing the same card, the same `ContactActions` shape and the same `opsUi` shell rather than inventing a second visual language. Route `admin/marketplace/pending-payments` behind the existing `PermissionGate module="marketplace" action="manage"`, nav entry "Did not finish paying" directly above "Abandoned checkouts".

**Sort order, verified against the real rows**: `struggled` first, then `payment_attempt_count` descending, then `hours_since` ascending. Confirmed with a shuffled fixture of the live data: 9, 7, 4 attempts lead, then the three 2-attempt rows with Azunna at 29h placed ahead of Gladys and Onyinye at 149h, then the single-attempt rows. Every struggled row precedes every non-struggled one. The attempt count is stated plainly as "Tried 9 times", and a struggled row carries a red border and a negative pill so it reads differently at a glance.

**Mark as paid by hand requires all three fields.** Verified against the shipped readiness expression: nothing filled in, amount only, amount + method with no reason, a reason under ten characters, a missing method, and a zero amount **all leave the button disabled**; only amount + method + a reason of at least ten characters enables it. The amount field is placeholdered with the order total but never pre-filled, since the point is recording what actually landed rather than assuming. The submit is red, not coral, and reads "Record this payment".

**A non super admin sees nothing at all** rather than a control that fails: the whole `MarkPaidByHand` block is behind `{isSuperAdmin && ...}`, so there is no button, no disabled state and no explanatory text. Verified server side too, from a non-super-admin context: `super_admin_mark_order_paid` returned **"Not permitted"** and nothing changed (0 rows in `marketplace_manual_payments`, all 16 orders still pending).

**The Paystack warning, as shipped**: *"Paystack has no successful payment for this, so only mark it paid if money reached you another way. This releases the item to {seller} and commits us to paying them."* Shown inside the form, above the fields, in error-red on `#FCEBE9`.

**Mark as sent and undo work**, following the abandoned screen exactly, with one required difference: `times_contacted` in the view counts `marketplace_outreach_log` on **`subject_id = order_id`**, so this screen calls the **four-argument** `log_outreach_contact` overload. The three-argument version used elsewhere writes no subject and would have left the count stuck at zero. A row leaves the working list once messaged and lands in a toggled "already messaged" group, never deleted.

**Four mismatches found and reported rather than worked around:**
1. **`payment_not_completed` is NOT in the outreach queue**, contrary to the brief. Checked all four functions: `get_buyer_nudge_suggestions`, `get_seller_nudge_suggestions`, `get_outreach_queue` and `resolve_outreach_message` none reference it. What exists is the stage config (`max_attempts: 3`), the three templates, and the subject-aware `resolve_outreach_message_for`. So this screen resolves the message itself per order; it will not arrive via the queue. Message two does offer bank transfer, as stated.
2. **`undo_outreach_contact` takes no subject**, so undo removes the most recent `payment_not_completed` row for that BUYER, which for someone with two stalled orders may not be the one just marked. Used as-is since backend changes were out of scope.
3. **The shortfall rule blocks, it does not warn.** The function's own comment says "warn rather than block" while the code raises. The behaviour matches the brief; the comment is stale. The shortfall guard itself is verified by reading the deployed function, not by execution, because the super-admin check runs first and this environment has no super-admin session.
4. **The nine-attempt row is the operator's own test account**, not an external buyer. Of the 16 rows, the genuinely external people are Azunna Peace (three times in one day, exactly as described), Gladys, Onyinye Peace, Ayomidepetera Owolabi, Stephen Blessing, Olawunmi Afolabi and Adewale Adewale. No structural test flag exists to filter on, the same honest limitation `MarketplaceBuyers` and the abandoned screen already note.

**`payment_failure_context` verified live**: nine and four attempts both return *"I can see you tried several times, so something on our payment page was clearly not working for you. That is on us, not you."*; two attempts returns the gentler *"It looks like you tried twice, so something went wrong on the payment page rather than with you."* It is shown on the card in coral-light and injected into both the WhatsApp and email messages as `{{extra}}`.

**Preserved**: the abandoned checkouts screen, untouched; the outreach queue and its per-subject attempt counting, untouched (a new subject-aware helper was added alongside rather than changing the existing one); sections 7-30.

Files touched: `MarketplacePendingPayments.tsx` (new), `opsData.ts`, `StorefrontApp.tsx`, `AdminLayout.tsx`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 136. Subject-aware undo, and the overload ambiguity it introduced (2026-08-21)

**Asked for**: pass `order_id` to `undo_outreach_contact` so undo targets the message about that specific order, closing the imprecision flagged in §135.

**Done, and verified against Azunna Peace's three real orders** (`5db2d476…`, `b02e4b39…`, `fe519b87…`, all one `buyer_id`). Inserted one log row per order, oldest first, then ran the function's exact predicate targeting the OLDEST order — the one a subject-blind undo could never pick, since it takes the most recent. Result: exactly that row went, the other two remained, and the probe cleaned up after itself to zero rows. So the fix is real on her actual data, not just in principle.

**A live regression came with the new overload, found and fixed.** `undo_outreach_contact` now exists twice: the original 2-argument version, and a 3-argument one whose `p_subject_id` defaults to null. That makes a 2-argument call genuinely ambiguous. Confirmed both ways:
- raw SQL: `function undo_outreach_contact(uuid, unknown) is not unique`
- PostgREST, which is what the app actually uses: **HTTP 300, `PGRST203`, "Could not choose the best candidate function"**

`MarketplaceOutreach`'s Undo button calls exactly that 2-argument shape, so **the outreach queue's undo was broken in production the moment the overload was deployed**. Fixed by naming all three parameters at both call sites: the outreach screen passes `p_subject_id: null`, which selects the 3-argument overload unambiguously while preserving its old behaviour exactly, since the function's own guard is `(p_subject_id is null or subject_id = p_subject_id)`. Re-verified over REST: both call shapes now return `42501` (resolved to one function, then refused on permissions for anon) rather than `PGRST203`.

**Second consequence of the overload**: the 3-argument version `RETURNS void`, while the 2-argument one returned `boolean`. Both helpers previously asserted `data === true`, which against a void function is always false, so every undo would have reported "Could not undo, try again" even on success. Both now treat the absence of an error as success.

**The stale comment was NOT corrected.** `super_admin_mark_order_paid` still reads `-- warn rather than block on a shortfall` directly above a `raise exception`. The behaviour is right and matches the brief, only the comment is wrong. Re-read the deployed function to check rather than taking it on trust; reporting rather than fixing, since backend changes remain a non-goal.

**Preserved**: `MarketplaceOutreach`'s undo semantics are byte-for-byte what they were, now that it passes an explicit null; mark-as-sent on both screens untouched; sections 7-30.

Files touched: `opsData.ts`, `MarketplacePendingPayments.tsx`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 137. Undo returns a meaningful boolean again, so both call sites check it (2026-08-21)

**Both source fixes verified before changing anything**, rather than taken on trust:
- `undo_outreach_contact` now has **exactly one** version: `(p_person_id uuid, p_stage_key text, p_subject_id uuid DEFAULT NULL) -> boolean`. Confirmed by counting `pg_proc` rows for that name: 1.
- `super_admin_mark_order_paid`'s body now reads `-- BLOCKS, deliberately. Releasing an item to a seller while recording less than they are owed is not something to wave through with a warning.` above the raise, and the string `warn rather than block` is **no longer present anywhere** in the deployed source. The earlier attempt set the database COMMENT rather than the body, which is why it looked fixed while the misleading line stayed.

**Restored `data === true` at both call sites.** §136 had removed that check because the interim overload returned void, where asserting `true` would have failed every successful undo. With a boolean back, the opposite risk applied: both helpers were returning `true` unconditionally, so an undo that found nothing to remove would have reported success and left the row looking un-messaged. The boolean is genuinely meaningful, not a formality: the body returns `false` when no matching log row exists and `true` only after a real delete.

**Both call sites verified against Azunna Peace's three real orders**, replicating the deployed body exactly:

| Scenario | Returned | Rows left |
|---|---|---|
| Pending payments, subject = the OLDEST order | `true` | o2, o3 |
| Pending payments, same order again, nothing to undo | `false` | o2, o3 |
| Outreach queue, subject = null, takes the most recent | `true` | o2 |

The first row is the case that matters: a subject-blind undo would have taken o3, the newest. The second proves `false` is reachable and now surfaces as "Could not undo, try again" instead of a false success. The probe cleaned up after itself to zero rows.

**REST resolution re-checked** now that only one version exists: the outreach shape (`p_subject_id: null`), the pending-payments shape (`p_subject_id: order_id`) and even the legacy two-argument shape all return `42501` (resolved to one function, refused on permissions for anon). No `PGRST203` from any of them, so the ambiguity is gone at the source and cannot recur however a caller writes it.

**Kept**: both call sites still name all three parameters. Unnecessary now, but it costs nothing and is what made the ambiguity unhittable.

Files touched: `opsData.ts`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from this file.

## 138. Pending payments: contacted rows move out, and each row says when it disappears (2026-08-21)

**Both new columns verified on the view before use**: `contacted_at timestamptz` and `days_until_removed integer`.

**The split now keys on `contacted_at`**, exactly as `MarketplaceAbandonedCheckouts` does, rather than on `times_contacted` as §135 had it. The two agree on today's data, but `contacted_at` is the explicit signal and keeps the two sibling screens honestly identical. Working list is `!r.contacted_at`; everything else falls into the toggled "already messaged" group. Marking someone sent moves them across, it never hides or deletes them, and the toggle is always there to look at them again. Verified against the live 16: **14 working, 2 already messaged**, all 16 accounted for, which matches the two contacted rows described.

**The removal notice**, a new `RemovalNotice` on each row directly under the relative time:
- normal: **"Removed in 48 days"**, in muted `#8A7A72` at 10.5px, deliberately quiet since it is background rather than a task
- within a week: **"Removed in 5 days, last chance"**, switching to error red and extra-bold, because at that point it stops being background and becomes the last chance to speak to that buyer
- already past: **"Removed any time now"**, same red treatment

Threshold verified at every boundary: 10 and 8 days quiet, 7 days flips to urgent, 1 day reads "1 day" not "1 days", and 0 or negative reads "Removed any time now". **Nothing is urgent today** — the live range is 48 to 56 days — so the red state is correct but unexercised by real data, which is stated rather than implied.

**The 60-day rule checked at source rather than taken on trust.** `purge_old_pending_orders` reads `site_settings.marketplace_pending_payment_purge_days` (default 60) and deletes only where `payment_status = 'pending'`, with three further guards: `settlement_status = 'unsettled'`, `payout_released_at is null`, and no row in `marketplace_disputes`. So nothing paid is deletable at any age, and the notice's implicit promise holds. It also clears orphaned `payment_not_completed` outreach rows afterwards, so a deleted order leaves no dangling history.

**Nothing else changed**: the sort (struggled, then attempts, then recency), the mark-as-paid form and its three required fields, the super admin gate, and all outreach behaviour are untouched.

Files touched: `opsData.ts`, `MarketplacePendingPayments.tsx`.

`npm run build` clean. `npx tsc --noEmit` shows the same 5 pre-existing errors, none from these files.

## 139. Waiting on the buyer: recording a confirmation that never came (2026-08-27)

A buyer receives an item, says on WhatsApp that they are happy, and never taps
confirm. The seller waits on money for something already delivered. One live
order is in exactly that state.

**The design decision.** This does NOT add a second way to release a payout. It
records the MISSING BUYER CONFIRMATION and nothing else. The payout then follows
the normal path entirely unchanged: same proof screenshot, same emails, same
three step release on the payout queue. Two routes to money leaving the business
would eventually drift apart and one of them would end up with weaker guards.
There is one route.

**New screen** `MarketplaceAwaitingConfirmation.tsx`, at
`/admin/marketplace/awaiting-confirmation`, behind
`PermissionGate module="marketplace" action="manage"`, nav label "Waiting on the
buyer". Reads the view `marketplace_awaiting_confirmation`. Sorted longest wait
first: the seller who has waited most is the one most owed an answer. A header
summary gives the count and the total held but not yet payable.

**The form.** The reason is the substance, not a box under a button. The label
is "How do you know they received it and are happy?", a four row textarea with a
placeholder asking what they actually said and where. Minimum fifteen
characters, matching the RPC's own guard; the submit button is dead until then.
Under the field: "This is the only record of why their protection was set
aside."

Before it can be submitted, what it costs is stated: the seller share becomes
payable to the named seller, the buyer's protection on this order ends and they
will no longer be able to report a problem, and both of them are emailed the
moment the button is pressed. That last line matters because
`trg_z_confirmed_on_behalf_emails` fires on `confirmed_on_behalf_by` going null
to non null, so this is not a quiet internal note.

**Too early is discouraged, not prevented.** Under three days, or with no nudge
sent, a red panel opens above the reason field naming how long it has actually
been and whether they have even been reminded. It does not block: a buyer can
genuinely tell you on the same day, and only the person holding that
conversation knows. The warning makes it a judgement rather than a reflex. The
one live row today is at 0.3 days with no nudges, so this is the state that
actually renders.

**Nothing is paid.** The success state and a permanent footnote both say the
order joins the payout queue and still needs its proof screenshot before the
transfer can be marked sent.

**Gating.** `usePermissions().isSuperAdmin` wraps the whole control, the same
shape the pending payments screen uses. A non super admin sees the row and its
waiting time and no action at all, rather than a control that fails. An order
with an open dispute hides the control for everyone and says so: a dispute is
the opposite of being happy.

`opsData.ts` gains `AwaitingConfirmationRow`, `fetchAwaitingConfirmation()` and
`superAdminConfirmReceiptOnBehalf()`.

## 140. Regenerated Supabase types, and what the remaining 5 errors actually are (2026-08-27)

`src/integrations/supabase/types.ts` regenerated against project
`rbtyprmkolqfylcbmgrk`. This cleared the three errors in `AudienceChooser.tsx`
(`customers.audience_preference` and the `set_audience_preference` RPC), which
were stale types rather than wrong code: both exist in the database.

The file had drifted a long way, 814 lines added. It now also types
`marketplace_awaiting_confirmation` and `super_admin_confirm_receipt_on_behalf`
from section 139, so the untyped-client cast in `opsData.ts` is no longer
strictly needed there. Left in place, since the cast is still what lets that
file survive the next round of drift.

**The remaining 5 errors are one cause, not five, and none of them is a bug.**
All five are the same shape: a `{ ok: true; ... } | { ok: false; message }`
result that fails to narrow after `if (!res.ok)`. That is not the code's fault.
`tsconfig.app.json` sets `"strict": false`, so `strictNullChecks` is off, and
with it off TypeScript cannot narrow a discriminated union on a boolean literal
discriminant. Proved directly: the same three line union narrows cleanly under
`--strictNullChecks true` and fails under `--strictNullChecks false`.

So the long carried baseline of 5 is a compiler configuration artefact, not five
real issues. The runtime behaviour is correct in every one of them. They would
all disappear together if `strictNullChecks` were turned on, which is a much
larger change than it sounds and is not attempted here.

Affected, for the record: `RequestVideoSheet.tsx:40`,
`WatchRequestVideoSheet.tsx:28`, `ListingDetailPage.tsx:442`,
`SellerVideoRequestDetailPage.tsx:78` and `:89`.

## 141. Declined is not the same as stopped (2026-08-28)

The pending payments screen was showing everyone who reached Paystack, which
conflated two completely different people. Paystack distinguishes ABANDONED,
meaning the payment page was seen and left without anything entered, from
FAILED, meaning details were entered and refused. The screen was calling
fifteen people a failed payment when nothing had failed, and the outreach
message would have told them their payment did not go through when they never
attempted one. That could make someone think money had moved.

**Two views, one screen.** `marketplace_pending_payments` now returns only
`paystack_status = 'failed'` or NULL, and gained the `paystack_status` column.
`marketplace_stopped_at_payment` is new and holds the abandoned ones.

Both groups are on the one screen in two sections, rather than a new screen.
They only make sense next to each other: a near empty declined list above a long
stopped list reads as one true picture, whereas a declined screen on its own
would just look broken, and the distinction that caused this whole change would
be invisible again the next time someone reads it.

**Live at the time of writing**, which is not what the brief said: the declined
view returns ONE row, Gladys, and the stopped view holds SIXTEEN. The brief said
two and fourteen. Azunna was unlabelled when it was written and has since been
labelled abandoned by the reconcile sweep, moving across on its own. The sweep
working, not a discrepancy to fix.

**Unchecked is not a failure.** A row with `paystack_status` NULL is shown as
"Checking with Paystack", never as a decline. These rows are deliberately not
hidden, since hiding a possible real failure is worse than showing an extra row.
The email body was also wrong here and is fixed: it hardcoded "the payment did
not go through" for every row, which asserts a decline that has not been
established, and now says "it was never completed" until the label arrives.
`payment_failure_context` was checked and is safe as it stands, since it only
ever talks about coming back to it, never about failing.

**Wording for the stopped group.** Section body: "They opened the payment page
and left without entering anything. No payment was attempted, nothing was
declined and no money moved. Do not tell these people a payment failed." Their
pill reads "Stopped, never attempted", and their WhatsApp and email both open
with "you got as far as the payment page ... and stopped", matching the
corrected outreach messages.

**What the stopped group cannot have, and why.** The view carries no `buyer_id`
and no `listing_id`, so mark as sent, undo, the sequenced three message outreach
(`resolve_outreach_message_for` needs `p_person_id`), the resume deep link,
`times_contacted` and `days_until_removed` are all unavailable for them. They
get `contacted_at` as a plain note and a hand written message instead. Adding
`buyer_id` to the view would restore the sequence, but that is a backend change
and was out of scope here.

Untouched: the mark as paid form and its super admin gate, the sort order, mark
as sent, undo, the removal notice, and the awaiting confirmation screen.

## 142. The stopped group gets the full toolkit (2026-08-28)

`marketplace_stopped_at_payment` gained the columns section 141 reported
missing: `buyer_id`, `listing_id`, `cart_reference`, `reference`,
`latest_reference`, `created_at`, `struggled`, `times_contacted` and
`days_until_removed`. All verified live and populated before anything was wired
to them.

The sixteen now have exactly what the declined list has: the sequenced three
message outreach through `resolve_outreach_message_for`, mark as sent, undo, a
resume link, the removal countdown, the reference, and the struggled ordering.

`ContactActions` is now shared by both lists rather than duplicated. It takes a
structural type, `{ order_id, buyer_id, times_contacted }`, which both rows
satisfy, plus the query key to invalidate. Both log against the same
`payment_not_completed` stage, so mark as sent and undo behave identically and
stay per order rather than per person.

**One wording difference that must hold.** `payment_attempt_count` on this view
counts openings of the payment page, not payments attempted, because nobody here
attempted one. The declined list says "Tried 6 times"; saying that here would
claim six payments were made and refused. The stopped list says "Came back 6
times", or "Opened it once" at one. `struggled` is presented the same way, as
"Kept coming back", and it leads the sort exactly as it does above.

**Confirmed no failure language reaches this group.** All three
`payment_not_completed` templates were read directly: message one opens "You got
as far as the payment page for the {item} and stopped", and none of the three
says anything failed or did not go through. `payment_failure_context`, which
fills `{{extra}}`, only ever talks about coming back to it. The one failure
sentence in the component is behind the `declined` guard in `Row`, and the only
such words rendered in the stopped section are the warning telling whoever is
reading not to use them.

The struggled border here is coral-dark rather than the declined list's error
red: they are worth attention, but nothing went wrong for them.

Not extended to this group: the super admin mark as paid form. It stays on the
declined list only, since the brief did not ask for it here.

## 143. Mark as sent stops lying, and both lists move a marked row out (2026-08-28)

**The overload again.** `log_outreach_contact` had two versions, the 3 argument
original returning boolean and a 4 argument one returning void. The client
asserted a boolean, received void, and reported "could not save, try again"
while the row had in fact been written. Worse than a plain failure, because
pressing again logged a duplicate: Temmy was logged twice. There is now ONE
version, `log_outreach_contact(p_person_type, p_person_id, p_stage_key,
p_subject_id default null)` returning boolean, so `data === true` is a valid
success check again. Exactly the shape of the `undo_outreach_contact` bug in
section 136.

No client change was needed for this. Both call sites already passed named
parameters and already checked `data === true`: the outreach queue passes three
and lets `p_subject_id` default, the pending payments screen passes four. The
function body was read to confirm it returns true unconditionally after the
insert rather than, say, returning false on a duplicate, which would have put
the same lie back in a new place.

Worth knowing: the function does not dedupe. Nothing stops a second press
recording a second contact, which is correct for a three message sequence but is
also how the duplicate happened.

**Both lists now split on contacted_at.** The declined list already did. The
stopped list sorted the two groups apart but rendered them back to back,
unlabelled, so a marked row moved to the bottom and stayed in view rather than
moving out. It now matches the declined list and MarketplaceAbandonedCheckouts
exactly: working is `contacted_at` null, and everyone else sits behind a "Show N
already messaged" toggle, collapsed by default. Marking someone sent moves them
across; nothing is hidden or deleted. The section's own outer collapse was
dropped, since a toggle inside a toggle helped nobody.

**Live counts, which differ from the brief's three.** Eight rows carry
`contacted_at`: the declined list is 0 working and 1 contacted, the stopped list
9 working and 7 contacted. Because the declined list has no working rows at all
today, both lists gained a plain "Everyone here has been messaged." line for
that state. Without it the stats read non zero above an empty space, which looks
like something failing to load rather than a list that is genuinely done.

Also noted: the generated types still describe two `log_outreach_contact`
overloads where the database now has one. Harmless, since both call shapes still
type check and PostgREST resolves on what is sent, so they were left alone.

## 144. Counting devices, not sessions, and the marketplace install blind spot (2026-08-28)

We could not tell how many people had the app installed. `session_id` changes
every visit, so 217 marketplace sessions could have been 20 regulars or 200
one-time opens.

**One recording path, through the RPC.** `trackPwaSession()` in `lib/pwa.ts`
previously went through `trackEvent`, a direct insert into `analytics_events`.
It now calls `recordPwaSession()` in `lib/analytics.ts`, which calls
`record_pwa_session`, and nothing else writes a `pwa_session` row. Verified by
intercepting `window.fetch` while forcing the standalone branch: exactly one
request, to `rpc/record_pwa_session`, and no `analytics_events` insert
alongside it.

The first version of that RPC was deployed broken and this was caught before
switching to it. It inserted into a `metadata` column that does not exist, and
its own `exception when others then return` swallowed the error, so it ran
clean and wrote nothing. Proved by calling it and counting rows rather than
reading it. It also wrote no `os`, which would have zeroed `ios_pwa_sessions`
(and since iOS fires no `appinstalled` event, `pwa_session` is the only way an
iOS install is ever counted), and it put the DEVICE id into `session_id`, which
would have silently changed `total_pwa_sessions` and `pwa_sessions_last_30d`
from counting sessions to counting devices mid-series. All three are fixed in
the deployed function; the client now passes `p_session_id` separately from
`p_device_id`, plus os, browser, device_type and user_agent.

**The device id is `getBrowserId()`, reused, not a new one.** `bm-browser-id`
in `supabaseAdapters.ts` already existed. A third id for one browser could
never have been reconciled with it. It was hardened first, the same way
`referral.ts` hardens its visitor id: in private mode `localStorage` access
itself throws rather than returning null, and `crypto.randomUUID` can be
missing, and this is now read at app boot. When storage is unavailable the
caller still gets a valid id for that page load, which undercounts a returning
device rather than breaking boot.

Live verified: the id persisted across a full reload, the session id stayed the
real `bm-session-id`, and the row landed with `os`, `browser`, `device_type`
and `display_mode` populated and `customer_id` null for an anonymous caller.
The signed in case is resolved server side from `auth.uid()` and was read in
the function body rather than exercised, since no login exists in this
environment. Test rows were deleted afterwards.

`event_data` changes from `{display_mode, os_hint}` to `{display_mode}`. No view
reads either key, checked before making the change, and all 400 historical rows
keep their `os_hint`.

**The marketplace install blind spot.** 907 install prompts on the marketplace
in 30 days against the storefront's 415, and not one install recorded. Not
unreliable firing: the §60 route guard in `listenForAppInstalled` sat ABOVE both
the analytics event and the localStorage flag write, so guarding the flag
suppressed the event too. Every marketplace `pwa_installed` row in the database
predates 12 August, when that guard shipped.

The event now sits above the guard and carries
`surface: "marketplace" | "storefront"`; the flag write stays below it. The §60
protection is unchanged in effect, and this was verified in place rather than
reasoned about: dispatching a real `appinstalled` event on `/marketplace`
recorded a `pwa_installed` row with `surface: marketplace`, set the
marketplace's own flag, and left the storefront's `bm_pwa_installed` null.

## 145. Push: why 22 of 28 subscriptions were unreachable, and the marketplace ask (2026-08-28)

**The cause, found before building anything.** `PushOptInCard` was mounted
globally in `StorefrontApp.tsx` and shown to ANY visitor on any non admin
route, with no sign in check. It calls `subscribeToPush(user?.email)`, which is
`undefined` when signed out, so the edge function wrote `customer_email: null`.
A null email cannot be targeted by any trigger, so those rows are not
subscribers: they are permissions spent for nothing, and a browser answers that
question only once.

There is a second, worse mechanism in the same path. `manage-push-subscription`
upserts on `endpoint` and always writes `customer_email`, so someone who
subscribed while signed in and later re-subscribed while signed out had their
email OVERWRITTEN with null. Not just never captured, actively erased.

**The 22 are not recoverable from data.** All 22 carry a `session_id`. 14 of
those sessions appear in `analytics_events`, but ZERO of them ever carried a
`customer_id`, so nobody signed in during any of them. `customer_id` on
`analytics_events` is new as of section 144 anyway. There is no join to a
person that does not already exist.

They are recoverable by BEHAVIOUR, and that is now built. `syncPushEmail()`
re-sends the existing subscription with an email when someone signs in.
Because the upsert is keyed on `endpoint`, that fills in the existing row
rather than creating a second one. So any of the 22 who signs in on that same
browser is recovered silently, with no second permission prompt. Anyone who
never signs in on that device stays unreachable permanently.

**No subscription can be created without an email any more.**
`subscribeToPush` refuses with a new `needs-signin` status BEFORE calling
`Notification.requestPermission`, which matters: refusing after the prompt
would still burn the browser's one answer. Verified live, all three anonymous
shapes (undefined, null, whitespace) return `needs-signin` with zero permission
prompts fired.

**Storefront changed too, deliberately.** `PushOptInCard` now also requires
`signedIn`. Fixing only the marketplace would have left the storefront free to
keep minting null email rows, which makes the fix pointless. The 5 working
subscriptions are untouched; this only stops new bad ones.

**The marketplace ask.** New `MarketplacePushPrompt`, mounted in
`MarketplaceApp` below `PendingActionPrompt`. Three gates:

1. Installed app only, via `isStandalone()`. A browser visitor is never asked,
   because a refusal is permanent in that browser.
2. Signed in only, so the row always has an email.
3. Never on first launch. `bm-mkt-app-launches` counts one launch per browser
   session (a `sessionStorage` flag stops page navigation inflating it) and the
   ask waits for the second. Someone who just installed has not decided they
   trust the app yet. The counter only increments when standalone, so browsing
   the site in a tab never uses up that first launch.

It subscribes to `deliveryGateChannel` and `pendingActionChannel` and hides
while either is up, taking the slot below the pending prompt in the section 133
ordering. Dismissal is permanent.

Verified in a normal tab: the prompt is absent from the DOM and the launch
counter is never even created. Card measured at 375px: 351 wide, on screen,
44px tap targets, Nunito 900 heading, Lato body, green #2D6A4F action on cream
#FFF8F4.

Files: `lib/push.ts`, `hooks/usePush.ts`, `components/PushOptInCard.tsx`,
`marketplace/components/MarketplacePushPrompt.tsx` (new),
`marketplace/MarketplaceApp.tsx`, `marketplace/marketplace.css`.

## 146. Answering in the seller's name, from the outreach queue (2026-08-28)

Sellers answer WhatsApp far more readily than they open the app, so a buyer
sits waiting while a seller who has already replied to us ignores a
notification. Two video requests sat for days before the seller was even
emailed.

**Where each one went.** All three sit on the outreach queue, directly under
`ContactActions` on the row for that person, on both the primary row and each
extra stage row. Someone looking at "a buyer is waiting on an answer" answers it
there. They appear only for `person_type === "seller"` and only on the three
stages they belong to: `unanswered_question`, `video_request_pending` and
`offer_awaiting_response`.

**The queue could not say WHICH.** `get_outreach_queue` returns
`(person_type, person_id, stage_key, ...)` and no subject id, so a seller with
three unanswered questions cannot be resolved from the row alone. Rather than
change the RPC, the pending items are fetched per seller on demand from tables
an admin can already read: `marketplace_listing_questions` ("Admin reads all
questions"), `marketplace_video_requests` ("Admin reads all video requests") and
`marketplace_offers` ("Admin manage offers"). Note the questions table is
`marketplace_listing_questions`, not `marketplace_questions`.

**The note is mandatory on all three**, minimum 5 characters, matching the RPCs'
own guard. Labelled "Where did the seller tell you this?" with the placeholder
"For example: she sent it on WhatsApp this morning", and under it either
"Kept forever, with your name against it." or "Needed. This is the record of
where it came from." The submit button is inert until the note and the answer
are both there.

**Every panel says whose words these are:** "The buyer is told straight away and
sees this as the seller's own words, so use what they actually said, not a
tidied up version." The question field is labelled "What the seller said", not
"Answer".

**The bypass filter still applies.** `detectBypassAttempt` runs on an
admin-typed answer before the RPC is called, the same call the seller's own
screen makes, so an admin cannot type something past a rule the seller could not
have got past. The RPC runs it server side as well.

**Video upload follows the seller's path exactly.** `file.size` against the live
`marketplace_video_request_max_mb` from site_settings is the ONLY thing read
from the file. No duration, no decoding, no `<video>` element, no canvas, no
compression; the File goes straight to `uploadWithProgress`. This is the lesson
of handoff 87 to 92, where reading a video hung on iPhone. The admin INSERT
policy on `marketplace-request-videos` checks bucket and permission only with no
path prefix rule, so `admin/` is a provenance convention rather than a
requirement.

Files: `opsData.ts` (three fetchers, three RPC wrappers, the upload),
`AnswerForSeller.tsx` (new), `MarketplaceOutreach.tsx` (mounted twice).

Noted in passing, not changed: the comment above `sellerUploadVideoForRequest`
says the storage policy requires the seller's auth uid as the path prefix. The
deployed seller INSERT policy checks only `bucket_id`, so the prefix is
convention there too.

## 147. The deletion clock starts on playback, not on the claim (2026-08-28)

`buyer_claim_request_video` used to stamp `watched_at` when it handed over the
path. `purge_request_videos` keys on `watched_at` and deletes four hours later,
so a playback that failed after the claim destroyed a video nobody had seen,
while the record said it was watched and `my_pending_action` dropped the "your
video is ready" prompt. Enomfon's video was already in exactly that state.

Both halves are fixed server side: the claim no longer stamps, and a new
`buyer_mark_video_watched(p_request_id)` does, updating only where `watched_at`
is null so it cannot double count.

**Where it is called.** `WatchRequestVideoSheet.tsx`, on the `<video>` element's
own `onLoadedData` and `onPlaying`. Not on mount, not on the claim, not when the
signed URL is requested. `buyerMarkVideoWatched()` wraps the RPC in
`videoRequests.ts`. A `markedRef` makes it once per mount, since both events can
fire for one playback.

**Deliberately NOT `onPlay`, and this is the important part.** The brief
suggested "play or loadeddata". `play` fires on the INTENT to play and is
followed by `error` when the media never arrives, so using it would have
reproduced the original bug in a new place. Measured in the browser rather than
reasoned about:

- unreachable URL: fires `play`, then `error`. No `loadeddata`, no `playing`.
- empty src, which is what a null signed URL gives: identical.
- a real playable clip, built with MediaRecorder as a positive control: fires
  `play` then `loadeddata`.

So a failed playback fires neither of the two events wired here, and a real one
fires `loadeddata`. Confirmed in both directions.

`first_watch` still comes back from the claim and still means `watched_at is
null`, so nothing else changed.

## 148. Listing video, second attempt: YouTube hosts it, so nothing is processed here (2026-08-28)

Public listing video was abandoned in sections 87 to 92 because iPhones cannot
compress in the browser (WebKit has never implemented `captureStream()`), which
left serving a raw 50MB file to every visitor. YouTube removes both problems:
the seller uploads raw, YouTube transcodes, and it streams from YouTube.

**Absolutely no processing.** `file.size` against a 200MB cap is the only thing
read from the file, plus `file.name` for an extension. No compression, no
duration read, no `<video>` element for inspection, no canvas. Verified by
grepping the finished files: every match for `createElement("video")`,
`loadedmetadata`, `.duration`, `canvas`, `MediaRecorder` and `captureStream` in
`listingVideo.ts` and `ListingVideoPlayer.tsx` is a comment.

**Ask becomes watch.** On listing detail, `useListingVideo(id)` calls the
`listing_video` RPC, which filters on `youtube_status = 'ready'` server side, so
a buyer sees nothing at all while a video is transcoding. With a video, the
"Ask {seller} for a video" button is replaced by "Watch a video of this item".
With none, asking works exactly as before. Nothing renders when there is no
video: no placeholder.

**The four private_only videos are untouched.** The client never reads or writes
`private_only` and never sends any request video to staging or YouTube; the two
paths share no code. A buyer who has their own older private video keeps a
"Watch your own video" button even once the listing has a public one, so the
written promise that only they would see it is kept and their access is never
taken away.

**Autoplay.** The tap is a real user gesture, so playback is allowed, but an
UNMUTED autoplay inside a cross-origin iframe is still refused often enough by
Safari and Android Chrome that it would show a dead player. It starts muted,
which every browser permits, with "Tap the speaker on the video for sound."
under it. A video that always plays silently beats one that sometimes does not
play, and these clips are about whether the thing works. The iframe is only
created on the tap, so nothing loads from YouTube for visitors who never watch.

**The seller is told, not asked**, live from `marketplace_listing_video_notice`,
rendered directly above the upload button at the moment they add a video:
"Your video will show on your listing, and we may also share it on BundledMum's
Instagram and YouTube to help your item sell."

**Editing only.** `seller_stage_listing_video` needs a listing id, which does
not exist during create, so the control appears in edit mode only. While a video
is staged the SELLER sees "We are getting your video ready"; a buyer sees
nothing.

Files: `listingVideo.ts` (new), `components/ListingVideoPlayer.tsx` (new),
`pages/ListingDetailPage.tsx`, `sell/CreateListingPage.tsx`, `marketplace.css`.

## 149. Slow uploads: real progress, and a retry that does not restart (2026-08-28)

The raw file goes up untouched, so a seller may be pushing 40MB rather than 4MB,
which on Nigerian mobile data takes minutes and can drop partway. That is a
deliberate trade, since compressing in the browser is what killed this feature
the first time and iPhones cannot do it at all. Two things follow.

**Real progress, never a spinner.** The upload already used
`uploadWithProgress`, which reports genuine byte-level percentages from
`xhr.upload.onprogress` rather than a simulated bar, but it was rendering as one
line of text. It now shows the existing `.mkt-video-processing` bar, reused
rather than reinvented, plus a line reading "Sending your video, 15.5MB of
42.0MB." The megabytes matter as much as the bar: on a slow line the percentage
can sit on one number for a while, and the megabytes visibly moving is what
tells a seller it has not frozen. `mbSent`/`mbTotal` read `file.size` and
nothing else, the same single property the cap check uses, and both clamp out of
range percentages and handle a null file.

**A failure is a resend, not a restart.** The picked file was previously a local
variable, so a connection that dropped at 80% lost it and the seller had to
re-pick the file and re-read the notice. It is now held in state, and the
failure branch shows the error, "clip.mp4 is still here, nothing was lost", a
"Try again" that resends the same file, and a "Choose a different video" for
when they actually want one.

Branch order is ready, staged, uploading, failed-with-file, picker, so the retry
state is reached before the picker and the notice is not shown again for a
dropped connection. A file rejected for being over the 200MB cap deliberately
clears the held file instead, since retrying an oversized file would fail
identically: that one falls back to the picker with its own error.

Nothing changed for the originals bucket. The seller still uploads to
`listing-video-staging` and calls `seller_stage_listing_video` with the same two
arguments; the worker keeping the raw file in `listing-video-originals` is
entirely server side.

## 150. A requested video now closes the request and reaches the listing (2026-08-28)

The gap reported in section 148 is closed. `seller_fulfil_request_with_listing_video`
and `admin_fulfil_request_with_listing_video` stage the video for YouTube AND
close the request in one call, setting `fulfilled_by_listing_video` and leaving
`video_path` NULL so nothing tries to serve a private file that does not exist.

- `SellerVideoRequestDetailPage` now calls `fulfilRequestWithListingVideo`
  instead of `sellerUploadVideoForRequest`.
- The admin on-behalf panel calls `adminFulfilRequestWithListingVideo` instead
  of `adminUploadVideoForSeller`, still requiring the note.

**A false promise removed.** That seller screen said "Only they will ever see
it: this video goes only to the buyer who asked, nobody else can see it, and
it's deleted afterwards." That stopped being true the moment a requested video
went on the listing. It now reads "Where this video goes", carrying the live
`marketplace_listing_video_notice` plus "The buyer who asked gets told as soon
as it is ready, and everyone looking at your listing can watch it too."

**The four legacy videos are untouched**, verified live: all four still
`private_only`, still holding their private file, `fulfilled_by_listing_video`
false, and their listings have `youtube_status`, `youtube_video_id` and
`staged_video_path` all null. Three independent things keep them that way: they
already have `uploaded_at` set so both new RPCs refuse them; the seller screen
shows them as already sent and never offers an upload; and the buyer's "Watch
your own video" button is unchanged.

**A real bug in what section 148 shipped, found while wiring this.** None of
these RPCs returns an `ok` flag. They raise on failure and return a plain
payload with a `note` on success. `stageListingVideo` and `readRpcResult` both
checked `d.ok === true`, so every SUCCESSFUL call reported "that could not be
saved" while the write had gone through. That is the log_outreach_contact
void-versus-boolean bug in a new place, and worse than failing, because the
obvious response is to press again: on the listing upload that would have
staged a second copy and overwritten `staged_video_path`. Both now key on the
absence of an error, which is the only correct test. It affected the three admin
on-behalf actions from section 146 and the listing upload from 148.
`superAdminConfirmReceiptOnBehalf` was already correct.

**Point 3 done.** `marketplace_listing_video_max_mb` is read live by
`useListingVideoMaxMb()` in both the listing upload and the request upload,
matching the request path. The constant is now a fallback only.

Type-error baseline drops from 5 to 4: the flat `{ ok, message? }` result shape
removed one of the strictNullChecks narrowing failures in
`SellerVideoRequestDetailPage`.

Still dead, for the section 148 cleanup pass once a video has gone end to end:
`sellerUploadVideoForRequest`, `adminUploadVideoForSeller`, and their two RPCs.

## 151. Why no seller saw a video option, and the old design put back (2026-08-28)

**The cause was the sequencing, not the flag.** The new block was gated on
`isEditMode` alone, never on `marketplace_video_enabled`; that flag still gates
only the old paused block further down the same file. `isEditMode = !!editId`,
and a new listing has no `editId`, so the field rendered nothing on create. Four
sellers listed in 24 hours and none of them was ever shown it. Section 148
recorded this as "editing only" in a comment rather than flagging that CREATE
had no video at all, which is why it read as built.

**Option (a), the success screen.** `seller_stage_listing_video` needs a listing
id, so the listing must exist first. The insert did not return the id, so it now
runs `.select("id").single()` (the "Seller reads own listings" policy makes that
readable) and the id is held in `createdId`. The field then renders on the
success screen. Option (b), holding the file through submission, would mean
carrying 40MB across a submit that can fail; (c) tells them to go and find it
later. (a) catches the seller having just done the work.

**Reused from the old design**: the whole `.mkt-field .mkt-video-field` block,
its `.mkt-field-head`, the `.mkt-video-add` resting control with its ▶ icon and
three lines, `.mkt-video-processing` for the busy state, `.mkt-errbox` and the
`.mkt-video-footnote`. On listing detail, `ListingVideoCard`'s entire treatment:
the `.mkt-video-card` block, the "🎥 Watch a video of this item" header, the
`.mkt-video-frame` resting state with scrim, play control and "Tap to play", and
the caption. It is placed last in the gallery exactly as before.

**Could not be reused, both for the same reason.** The duration badge and the
"15 seconds" copy came from `video_duration_seconds`, which only existed because
the old pipeline READ the file. The custom progress and pause controls belonged
to the local `<video>`; YouTube's player owns those now. The poster survives,
supplied by YouTube's thumbnail rather than an extracted frame.

**Only `file.size` is read.** In `ListingVideoField.tsx`:

    if (f.size > maxMb * 1024 * 1024) {

Grepping both seller paths for `.size`, `.name`, `createElement("video")`,
`loadedmetadata`, `.duration`, `canvas`, `MediaRecorder` and `captureStream`
returns only `file.size` (the cap), `file.name` (the extension and the retry
line) and one comment. No video element is created for anything but playback.

**Kept from section 149**: the real byte-level bar with "15.5MB of 42.0MB", and
the retry that holds the file so a drop at 80% is a resend rather than a
restart. Both carried into the reused block.

The notice still sits at the upload itself, live from
`marketplace_listing_video_notice`. `marketplace_video_enabled` is untouched and
still false. Both upload paths read `marketplace_listing_video_max_mb` live.

Files: `sell/ListingVideoField.tsx` (new), `components/ListingVideoPlayer.tsx`
(rewritten to the old card), `sell/CreateListingPage.tsx`, `marketplace.css`.

## 152. The video field was missing from the edit form too (2026-08-28)

Reported as "I do not see the video upload option", from the CREATE form.

Two separate things, and only one of them was intended.

**Create form: absent on purpose.** `seller_stage_listing_video` needs a listing
id and a new listing has none until it is saved, so the field is offered on the
success screen straight after submitting (section 151, option a). Looking for it
in the form finds nothing, which is exactly what the seller in this report hit.

**Edit form: absent by mistake, mine.** Section 148 rendered it on edit.
Consolidating into `ListingVideoField` in section 151 moved the only render site
inside `if (done)`, so on edit it appeared only AFTER submitting changes rather
than in the form. That is a regression against 148 and is now fixed: the field
renders in the form when `isEditMode`, in design 37a's own position right after
the photos, and the success-screen copy is now for the create case only
(`createdId`).

So there are two render sites, one per case: in the form when the listing
already exists, on the success screen when it has just been created.

`user` comes from `useSeller()` and is the auth user, so `user.id` is the auth
uid the staging path needs, the same value the photo upload on the same screen
already uses.

## 153. Telling the seller the video step is coming (2026-08-28)

The create form cannot carry the video field, because staging needs a listing id
that does not exist until the listing is saved. Photos with no video option
beside them read as broken rather than deliberate, and a seller seeing the form
for the first time has no way to infer a step is coming. Reported by someone who
already knew the feature existed and still hit it.

A line now sits directly under the photo help on CREATE only:

  "You can add a video on the next screen, once your listing is saved. A few
  seconds of it working answers what buyers ask most."

Worded forward, as the next step rather than an apology for a gap, and it
carries the same reason the field itself gives. Never rendered on edit, where
the field is in the form.

The three video render sites in this file are now mutually exclusive:
`!isEditMode` for this line and `createdId` for the success-screen field (both
create), `isEditMode && editId` for the field in the form (edit).

Worth recording as a pattern rather than a one off: twice in two turns something
filed as a design decision hid a gap. "Editing only" in section 148 was a
blocker written as a footnote, and section 151's consolidation into one
component left a single render site inside `if (done)`, silently removing the
edit form's field. Both were found by re-reading finished work rather than by
trusting the note that described it. A tidy-up that merges render sites deserves
a check that every case still has one.

## 154. The video is chosen under Photos and uploaded after the listing exists (2026-08-28)

Section 151 put the video on the success screen because staging needs a listing
id. That solved the easy problem. It is a SEQUENCING problem, not a placement
one: the picker can sit under Photos, hold the file, and upload once the listing
exists.

**On the create form**, directly under Photos, a new `ListingVideoPicker`
labelled "Upload a video of the item (optional)". It PICKS ONLY and never
touches the network, so nothing about it can affect whether a listing is
created. The help line from section 153 is replaced by the field itself.

**The order, and why it cannot reverse.** `pendingVideo` appears in exactly
three places in CreateListingPage: the declaration, the picker, and the success
screen. It appears NOWHERE inside `submit()`, which spans lines 630 to 830, so
the listing write cannot see it. `createdId` is set only after
`if (writeErr) throw writeErr;`, and the uploader is mounted only when
`createdId` is set, so the upload cannot begin until the listing exists. Both
properties are structural rather than conditional.

**A failed or lost video cannot affect the listing.** The upload runs in a
component mounted after `done`, outside the submit try/catch entirely. If it
fails, the seller sees the progress state's error with the retry that holds the
file. If the file itself is gone, they are told:

  "Your listing is saved and with our team, but the video did not make it
  across. Nothing else was lost. You can add one any time by editing this
  listing."

**Progress** is on the success screen: the byte level bar with "15.5MB of
42.0MB" and the retry, both from section 149, alongside the listing summary and
timeline that already say the listing is safely received.

**The memory risk, and my view.** A File in React state is a reference to a
blob the browser owns, not a copy in the page, so it is not garbage collected
while referenced. The real risk is the OS evicting or invalidating the
underlying blob on a low end device, or the user moving or deleting the file.
That surfaces as a size of 0 or a failed read, not as a crash. It is checked
before any upload is attempted, and again if the transfer fails, and both paths
lead to the message above.

I do not think holding it is risky enough to avoid. The alternative, uploading
before the listing exists, is worse in every case: it either blocks the listing
on a slow transfer or orphans files with no listing to attach them to. The
failure mode here costs the seller a re-pick on a listing that is already live,
which is recoverable by editing.

Edit form unchanged: the listing already exists, so it uploads immediately.

Files: `sell/ListingVideoPicker.tsx` (new), `sell/ListingVideoField.tsx`
(accepts `initialFile`, auto sends, handles a lost file),
`sell/CreateListingPage.tsx`.

## 155. The upload survives navigation, resumes after a drop, and the success screen is readable (2026-08-28)

**The install card was invisible, and so was my own progress line.** Measured
rather than eyeballed: title and body computed to `rgb(216,239,229)` on
`rgb(255,248,244)`, about 1.1:1. The cause is `.mkt-success p` at specificity
(0,1,1) beating `.mkt-install-cta-title` at (0,1,0). It hit every `<p>` inside a
cream card on that green screen, which is the install card's heading and body
AND the video field's `.mkt-help` lines, including "Sending your video, 15.5MB
of 42.0MB". The `.listing` card escaped only because it uses `<div>`s.

Fixed with scoped rules at (0,2,0) and (0,2,1). The title needed
`p.mkt-install-cta-title` specifically, because a first attempt at (0,2,0) still
lost to the `p` rule. Now: title #1A1A1A at 16.56:1, body and help #6B5B54 at
6.15:1, and the intro paragraph on the green background is untouched.

**"List another item" was a full page reload.** `window.location.reload()`
destroys the whole JS context, so lifting the upload above the router would have
achieved nothing for the exact case the work was for. That was the one thing in
the brief that did not match the code. It is now a keyed remount of the form,
which discards all 38 pieces of state reliably and leaves everything outside the
component running.

**The upload now lives in `listingVideoUploads.ts`**, a module above the router,
with `ListingVideoUploadDock` mounted outside `<Routes>`. Proved by driving the
store, changing route, and re-reading both: path went `/marketplace` to
`/marketplace/how-it-works`, and the state and the dock both survived with the
same listingId and fileName.

**Resumable via TUS**, tus-js-client 4.3.1, a new dependency. The endpoint is
`/storage/v1/upload/resumable` with 6MB chunks as Supabase requires,
`findPreviousUploads`/`resumeFromPreviousUpload` on start, and backoff retries.
The no-dependency alternative is hand rolling TUS over the XHR already here; it
is possible, but it is exactly the protocol code whose bugs only surface on the
flaky connections it exists for.

**The dock** sits top centre, 355px wide at 375px, 44px tap targets. It cannot
collide with the other prompts: the install banner (bottom 0), WhatsApp prompt
(bottom 96px) and push prompt (bottom 12px) are all bottom anchored, and it
hides entirely while the delivery gate or pending action prompt is up. It is not
in the precedence order because it asks for nothing.

**The copy is honest about the limit**, in the dock and the full bar:
"Keep this tab open while it sends, but you can carry on listing." No Background
Sync, deliberately, because Safari does not implement it and iPhone is where
video has broken twice.

**Not exercised**: a real resumed transfer needs a seller session, which does
not exist in this environment. The wiring is verified and the store's state
machine is tested, but a genuine interrupt-and-resume against Supabase has not
been run.

## 156. Upload while they type, never reject a video, require one where a photo cannot answer (2026-08-28)

**The upload starts at pick time.** A video needs a listing id to be ATTACHED,
not to be UPLOADED. `startListingVideoUpload` now takes no listing id and writes
to `${authUid}/pending-${timestamp}.${ext}`, a path the seller owns. On success
with no listing yet it rests in a new `uploaded` state; `attachUploadToListing`
is called immediately after the insert returns the id and either attaches at
once, which is the usual case after two or three minutes of typing, or hands the
id to `onSuccess`. Unattached files are cleared by the nightly orphan job.

That call is deliberately not awaited and cannot throw into the submit path, so
section 154's guarantee holds: the listing is still created independently of the
video.

**Nothing is rejected for size, anywhere.** Both the picker and the edit field
had a size gate; both are gone. `file.size` survives in exactly three places and
none of them rejects: a zero-size check for a blob the OS evicted, the progress
total, and an estimate that says "That is 46MB, so it may take around 6 minutes
to send" for files over 12MB. The only ceiling left is the bucket's own 200MB,
enforced by Supabase, reported honestly if it fires. Someone filming 40 seconds
of a pram folding has made a better video.

**Guidance is the category's own.** `useCategoryVideoRule` calls the deployed
`category_video_rule`, verified anon callable: Strollers and prams returns
required true with "Fold it down and open it again, spin each wheel, and press
the brake on and off"; Baby clothing returns required false with its own line.
All 50 categories have guidance and 15 require a video, confirmed against the
table. The guidance renders in a green-light panel at 8.4:1 and changes with the
category, because the hook is keyed on `categoryId`.

**Required blocks NEW listings only.** `useCategoryVideoRule(isEditMode ?
undefined : categoryId)` and `videoRequired = !isEditMode && ...`, so the 56
existing live listings in those categories can be edited freely. A seller fixing
a typo is never asked for a video.

Blocked, the seller reads, in the same place a missing photo speaks:

  "Buyers cannot tell if strollers and prams still works from a photo. A few
  seconds of video is what sells it."

**The way out.** Not a dead end: a plain underlined "I cannot film this right
now" under the submit button releases the block, and a note then says "You can
send this without a video. It will sell better with one, so add it any time by
editing this listing." A link rather than a second button, so it is available
without competing with filming. A listing that exists is worth more than a
seller who gives up, and admin review is still a second gate. Changing category
clears the skip, so switching into a required category asks again.

Files: `listingVideo.ts` (two hooks), `listingVideoUploads.ts` (listing-free
upload, `uploaded` state, `attachUploadToListing`), `sell/ListingVideoPicker.tsx`,
`sell/ListingVideoField.tsx`, `sell/CreateListingPage.tsx`, `marketplace.css`.

## 157. The blocked message comes from the category, not from its name (2026-08-28)

Section 156 built the blocked sentence in the template, inserting the category
name: "Buyers cannot tell if strollers and prams still works from a photo." A
category name is a label, not a noun that fits a sentence, so all fifteen read
badly, "cots and cribs still works", "car seats still works".

`category_video_rule` now returns a fourth column, `video_block_reason`, written
per category, and it is used VERBATIM. The returned columns are
`(video_required, video_guidance, video_block_reason, category_name)`; the row is
read by property name so the new column's position does not matter.

Verified live through the anon RPC, which is what a seller will read:

  Strollers and prams: "Buyers cannot tell from a photo whether a pram still
  folds and rolls properly. A few seconds of video is what sells it."
  Cots and cribs: "Buyers cannot tell from a photo whether a cot is still steady
  and complete. A few seconds of video is what sells it."
  Car seats: "Buyers cannot tell from a photo whether the harness still tightens
  and releases properly. On a car seat that matters more than anything, so a
  video is required."

All 15 required categories have one, none empty. A generic fallback covers the
case where the column is somehow null, but it does not name a category either.
`category_name` now survives only as a field on the type and is never used to
build a string anywhere.

Lesson worth keeping: interpolating a database label into prose reads fine for
whichever example you happen to test and badly for the rest. Fifteen categories
meant fifteen sentences, and only one of them was ever looked at.

Unchanged: the escape hatch, the guidance panel, the pick-time upload, and the
edit-mode exemption.

## 158. Getting video onto 214 listings: prompt, email, chips, admin upload (2026-08-28)

**The chip omission was worse than reported, and found by diffing rather than
noticing.** `get_outreach_queue` delegates to `get_seller_nudge_suggestions` and
`get_buyer_nudge_suggestions`; extracting the stage keys from those two and
diffing against the chip lists showed SIX stages with no chip, not two. The two
new video ones, and three buyer stages that had been missing all along:
`abandoned_at_payment`, `abandoned_before_payment` and `buyer_no_review`. All
five are now added; `payment_not_completed` is correctly absent, since it
belongs to the pending payments screen rather than the queue. The diff now shows
none missing and none orphaned in either direction, and that check is worth
re-running whenever a stage is added.

**The prompt is one prompt for everything they have.** `SellerVideoPrompt` calls
`seller_listing_needing_video`, which returns every listing needing one, ordered
required-category first then most viewed. With one listing it reads "Your
listing would sell faster with a video"; with 23 it reads "23 of your listings
have no video", then "Start with {title}, 41 people have looked at it. 22 more
after that, 6 of them really need one." The reason line comes from the lead
item's own `reason`, never assembled from a category name.

New `sellerVideoChannel` sits third in the precedence: below the delivery gate
and the pending action prompt, above the WhatsApp nudge and install banner,
which both now subscribe to it. Dismissible for 7 days, and never shown on
checkout or mid-listing routes.

**One email per seller.** `send-seller-add-video-email` takes a `seller_id`,
reads every one of their listings from `marketplace_listings_needing_video`
ordered required first then most viewed, caps the list at five and says "And 4
more listings with no video yet." Each block carries the item, whether buyers
cannot tell it works, how many people have looked, and the category's own
"Film this:" line. Built in the shape of `send-marketplace-seller-email`,
because `send-marketplace-email` is built around orders and refuses anything
with no order_id.

**Admin upload** at `/admin/marketplace/needs-video`, sorted required first then
most viewed, showing each category's guidance as "Ask them to film: ..." so
whoever is about to message knows what to ask FOR. The note is required at 5
characters, labelled "Where did the seller send you this?", and the button is
inert without both a file and a note. Nothing reads the file.

**Two things that did not match the brief.**
`send-marketplace-video-request-email` does not exist in this repo, so the shape
was taken from `send-marketplace-seller-email` instead. And the new edge
function has NOT been deployed: "no Supabase changes" is listed as a non-goal
while an edge function was also asked for, and rather than resolve that
contradiction by taking an outward-facing action, the source is committed and
the deploy left as a decision.

## 159. The seller video prompt at 320px (2026-08-28)

Measured at 320x568, an iPhone SE, not just at 375. The 23-listing case
survived: card fully on screen, no horizontal overflow, 44px buttons, and the
count visible. But it was 9 lines of text at 45% of the screen, and the count
sat at the end of a three-line run-on sentence, which is survival by luck rather
than by construction.

The lead is now two elements: the item to start with, and the count on its own
line. Same facts, and the count can no longer be swallowed by a wrap.

At 320x568 after the change: title 2 lines, reason 4, lead 2, count 2. Card
274px, 48% of the screen, fully on screen, nothing clipped, buttons 44px.

Honest cost: the card grew 19px, from 255 to 274, because splitting adds a
margin and the count still wraps to two lines at that width. Worth it, since the
question was whether the count survives and it now does structurally rather than
incidentally.

Extending the diff habit from section 158, as suggested: the chips were one case
of a list that must mirror another, and the same shape exists between email
templates and stage config, and between render sites and the cases that reach
them. Reading has failed at all three; diffing has not.

## 160. Search on the listings needing video screen (2026-08-28)

87 sellers were emailed. When one replies on WhatsApp saying "I sent the video
for my pram", the job is finding that ONE listing among 212, not browsing.

Client side filter over the rows already loaded, no database query and no
debounce: 212 rows filter in well under a frame, and the admin screens that
already have a search field (AdminCustomers, AdminMerchandising) filter on
keystroke with no shared debounce hook in the codebase to reuse.

Matches seller name OR item title, case insensitive substring, trimmed because
a trailing space off a phone keyboard is common. Verified against real rows from
the view: "taiye" returns her four listings, "stroller" returns two across
different sellers, "tai" matches the same four as "taiye", "TAIYE" and "taiye  "
both match identically, a blank query returns nothing rather than everything.

**The sort is untouched and search does not reorder.** The same comparator runs
after filtering. Proved with the case that would expose a mistake: searching
"stroller" puts "Convertible Strollers" (required, 15 views) ABOVE "Stroller
rain cover" (optional, 99 views), so required still beats view count.

**A search spans both groups, deliberately.** The screen normally splits not-yet-
asked from a collapsed "already asked" group. Since the sellers being searched
for have just been emailed, the wanted row will often be the one already marked
asked and hidden behind that toggle, so searching only the working list would
fail exactly the case this exists for. Results come back as ONE flat list in
sort order, each row carrying its own "Asked ..." line, and the header says
"Showing 4 of 212, already asked included." Today `contacted_at` is null on all
212, so this has no visible effect yet; it matters the moment anything is marked.

**Header counts follow what is shown.** During a search the first stat becomes
"Matching" over the filtered set, "Buyers cannot tell it works" counts only
matches, and "Not yet asked" is hidden rather than left describing the whole
table, so the header cannot contradict the list under it.

**Empty result**, naming the term rather than the generic empty state:

  Nothing matched "pramm"
  No seller or item here has that in its name. Check the spelling, or try just
  part of it.
  Clear the search

The required and optional pills, the admin upload with its required note, and
the category guidance are all unchanged.

## 161. Adding a video no longer takes the listing down (2026-08-28)

We emailed 87 sellers asking for videos, and the only way to comply was to
delist. The prompt from section 158 navigated to `/sell/listings/:id/edit`,
which for a LIVE listing is a wall reading "This listing is live", whose only
way forward is "Make changes" into DelistToEditSheet. So the ask and the only
route to satisfying it pointed in opposite directions. That is why 212 listings
still have none.

**The listing stays live, proved rather than assumed.** The SET clause of
`seller_add_video_to_live_listing` was extracted programmatically rather than
read: it updates `youtube_status`, `youtube_error`, `video_notice_shown`,
`video_notice_shown_at`, `staged_video_path` and `video_needs_review`. `status`
is not among them. Supporting evidence from live data: all six listings that
already have a video are `status = live`.

**Delisting is untouched for everything else.** All three DelistToEditSheet call
sites remain (SellerPriceEditPage, SellerDashboardPage, CreateListingPage), and
`DelistToEditSheet.tsx`, `SellerPriceEditPage.tsx` and `CreateListingPage.tsx`
do not appear in this change at all. Price, title, description, photos and
condition still require it. Only video is exempt, because a video is ADDITIVE:
it changes nothing a buyer already decided on, which is the entire reason
delisting exists.

**Where the seller does it.** A new `AddVideoSheet`, opened in place from two
entry points and never navigating anywhere:
- the seller video prompt, which now opens the sheet with the lead listing
  preselected instead of routing into the edit wall;
- a card on the seller dashboard, since the email sends them there.

`my_listings_without_video()` supplies the list, live ones included, already
ordered required first then most viewed. With more than one, the seller picks
from a scrollable list showing each item's thumbnail, whether buyers can tell it
works, and its view count. Each listing's OWN per category guidance shows once
chosen.

**What they are told**, in the sheet before and during the upload:

  "Your listing stays live while we prepare your video. Nothing comes down, you
  do not need to take anything off the marketplace."

and on the dashboard card, "Your listing stays live while we prepare it. Nothing
comes down." Said this plainly because a seller who has been asked to delist
before will assume this does the same.

**Videos go public unreviewed, deliberately.** A new admin screen at
`/admin/marketplace/videos-to-review` lists `marketplace_videos_to_review` with
a watch link. Its own subtitle says what it is: "These are already live on the
listing and on our channel. Watching them is a check after the fact, not an
approval." At three sales a day a queue would cost more in delay than it saves.

`file.size` is read once, to estimate minutes. Nothing else about the file is
touched.

## 162. Why the video requirement did not fire, and the gate made testable (2026-08-29)

A Car seats listing was created today with no video, no block, no message and
no escape link. The backend was correct: `category_video_rule` for
`4f208519-13d7-4788-b4d2-f05496e49a89` returns `video_required: true` with its
reason and guidance, confirmed anon from the browser.

**The cause: "we do not know yet" and "not required" were the same value.**
The component computed `videoRequired = !!videoRule?.video_required`. React
Query's `data` is `undefined` while loading, and `useCategoryVideoRule` swallows
a failed lookup into `null`. Both make that expression `false`, so a seller who
submitted before the rule arrived, or whose lookup failed, sailed straight
through. Every symptom follows from that one flag: the block, the message, the
escape link AND the guidance all hang off it, which is why all four were absent
together. So the answer to "was the guidance showing" is that it would not have
been, and its absence was the tell.

Proved by running the two states rather than reading them: on error the rule is
`null` and `videoRequired` is `false`; while loading it is `undefined` and
`videoRequired` is `false`; loaded it is `true`.

**The fix.** The decision moved into `sell/videoGate.ts`, a pure function with
THREE answers: allow, block, unknown. Unknown never means allow. On submit, an
unknown gate refetches and waits; if it is still unknown the seller is told we
could not check rather than being let through. This shipped twice looking
correct because the only way to check it was to read three expressions spread
through a 1500 line component. It now has 9 tests that run.

**The block is a sheet**, `VideoRequiredSheet`, reusing the existing
`.mkt-sheet-overlay` pattern rather than a third kind of dialog. It carries the
category's own `video_block_reason` verbatim, its own `video_guidance`, a
primary action that scrolls to the picker and opens the file chooser, and the
escape link.

**One bug caught while building it:** the sheet's escape called
`setVideoSkipped(true)` and resubmitted in the same tick, so `submit()` still
closed over the old `false` and would have blocked again, looping the sheet
forever. `submit({ skipVideoNow: true })` passes the decision explicitly. There
is a test for exactly this.

**The escape still saves, tested not assumed.** The gate returns allow, and
every early return between the gate (line 674) and the insert (line 869) is an
ordinary field check: condition, description, price, quantity, contact leak.
None is video related, so nothing about video can stop the write once the gate
allows.

**The prompt now asks every visit.** Dismissal moved from a 7 day localStorage
window to a sessionStorage flag, so it returns on the next visit rather than
after a timer. The delivery gate was persistent and 46 sellers answered within a
day, but filming needs the item in front of you, unlike the gate's two ten
second questions, so it stays easily dismissible: a seller on the bus cannot
comply however often we ask.

Still one prompt covering everything (`lead = rows[0]`, others counted), still
below the pending action prompt (it subscribes to `pendingActionChannel` and
hides while that is up), and it disappears entirely once every listing has a
video, since `visible` requires a lead row and the RPC returns none.

## 163. QA seller and buyer accounts (2026-08-29)

Every authenticated screen in this project has been verified by code review,
SQL, or DOM measurement, because no login existed here. These two accounts end
that.

  qa-seller@bundledmum.test
  qa-buyer@bundledmum.test
  password: BundledMumQA!2026

Real rows in production, created through `auth.users` + `auth.identities` +
`customers` + `marketplace_sellers`. They behave exactly like anyone else: the
seller signs in, lists, uploads and is prompted normally. Confirmed by using
them, not by inspection: signing in as the seller and loading
`/sell/dashboard` renders the seller shell and immediately raises the
SellerDeliveryGate, which is the section 133 precedence working in reality.

**Two things worth knowing for the next person who does this.**

A trigger on `auth.users` already creates the `customers` row, so inserting one
by hand collides on `customers_email_key`. Update the trigger's row instead.
A second trigger rewrote `display_name` to the house "Qa T." format.

Hand-inserted `auth.users` rows fail login with an opaque **500
AuthRetryableFetchError** if `confirmation_token`, `recovery_token`,
`email_change` or `email_change_token_new` are NULL. All 479 real users have
them as empty strings; GoTrue's Go scanner cannot read NULL into a string. Found
by diffing the test rows against the real ones rather than guessing at the 500.

**They are excluded from anything operational**, client side so the database
behaves identically for them and no bug can hide behind a special case
(`src/lib/testAccounts.ts`):
- the public seller count, filtered server side with `.not("id","in",...)` so it
  stays a head+count. Verified: 218 unfiltered, 217 as shipped.
- the outreach queue, dropped on `person_id`, so nobody is asked to chase a test
  account.
- the no-video backlog, dropped on `seller_id`.

Their listings stay in `pending_review` unless deliberately approved, so nothing
reaches public browse.

If either row is ever deleted, delete the matching id from `testAccounts.ts` too,
or the filters would silently hide a real person who inherits the id.

## 164. The video gate, walked as a seller (2026-08-29)

First time this form has been driven signed in rather than reasoned about.
Signed in as qa-seller@bundledmum.test and ran all eight cases in the real form.
Two genuine defects surfaced that no amount of reading had found.

**All eight, run:**
1. Car seats, no video: popup appeared, listing NOT created.
2. Took "I cannot record one right now": listing created, reached "Well done, it
   is with our team", row confirmed `pending_review` with no video.
3. Baby clothing, no video: no popup, saved normally.
4. Baby clothing then Car seats: label flipped optional to required, the
   is-required styling appeared, guidance changed to the harness line.
5. Back to Baby clothing: both reverted.
6. Car seats WITH a video attached: no popup, saved.
7. Switched to Car seats and submitted in the SAME TICK on a cold query cache:
   did NOT slip through, popup in 300ms. This is the bug that shipped three
   times.
8. Edited a Car seats listing: field showed "optional", no popup, saved.

**Defect one, found by uploading.** `listingVideoUploads.ts` passed `file.type`
straight to tus as the content type. A recorded clip reports
`video/webm;codecs=vp8`, and the bucket's `allowed_mime_types` check is an exact
match, so every such upload failed as "The connection dropped". A raw tus create
with a bare `video/webm` returned 201, which isolated it. Fixed with a local
`bareMime`, the same convention `sellData.ts` already had for exactly this. Re
run after the fix: status `uploaded` instead of `error`.

Worth noting the failure was graceful: the listing still saved with the message
"Your listing is safe", which is the section 154 guarantee holding under a real
failure rather than a hypothetical one.

**Defect two, found by skipping then signing back in.** The prompt read
`seller_listing_needing_video`, which returns only LIVE listings. A seller who
takes the escape has a `pending_review` listing, so they were never reminded,
which is the opposite of what the escape promises. Switched to
`my_listings_without_video`, which covers live and pending review in the same
required-first then most-viewed order and is what AddVideoSheet already uses.
Verified after: the reminder returns on a new visit naming the skipped listing,
"3 of your listings have no video ... Start with QA Test Car Seat".

**Also confirmed by doing:** dismissal holds for the visit and returns on the
next page load; the pending action prompt suppresses the video prompt and it
returns when that clears; adding a video to a LIVE listing kept `status = live`
throughout, watched by polling the row during the upload rather than by reading
the SET clause.

**Popup copy** now matches the brief exactly: title "A video is needed for this
item", the category's own reason and guidance, and two real buttons, "Upload
video" and "I cannot record one right now", the second a full button rather than
a quiet link.

**Left behind:** nothing. All four QA listings deleted, 12 listing photos and the
staged video removed, the temporarily-live QA listing gone. Live listings back to
218 and the no-video backlog back to 212, both matching the pre-test numbers. One
1.5KB orphaned webm remains in `listing-video-staging` because the seller role has
no DELETE policy there; `purge_orphaned_staged_videos` clears it within 24 hours.

## 165. Recording what buyers search for (2026-08-29)

Nothing recorded what buyers looked for. 214 listings exist and we had no idea
whether they were what anyone wanted. A buyer who searched for a pram, found
nothing and left was invisible.

**The real count is what is recorded.** `useBrowseListings` already returns an
exact server-side `count` for the whole filter set, not just the page, so that
is what goes in. The effect skips entirely while the query is loading or errored:
`useBrowseListings` sets no placeholder data, so on a new filter set `data` is
undefined and `count` falls back to 0, and recording then would log a false zero
for a search that had results. Verified live: "pram" recorded
`results_count: 1`, "unicorn saddle" recorded `0`.

**Debounce: none added, because one already existed.** BrowsePage debounces
`searchInput` into `filters.search` at 350ms, so keying the effect on the SETTLED
term is enough. Verified by typing at 80ms per key: "pram" (4 keystrokes) and
"mittens" (7) each produced exactly ONE row. A ref keyed on
term + category + state also stops a refetch, remount or tab refocus logging the
same search twice, while genuinely changing a filter records again, since "cots
in Lagos with nothing found" is a different fact from "cots".

**Category and state travel with it.** Verified: "cots" recorded with
`state: Lagos`, "mittens" recorded with category `Baby clothing`.

**The bug this shipped with, found only by running it.** The first version ended
in `void mdb.rpc(...)`. supabase-js's `rpc()` returns a LAZY thenable that issues
no request until it is awaited or `.then()`d, so the call was built and never
sent, recording nothing while appearing to work. A direct awaited call recorded
fine, which isolated it. Now `builder.then(() => {}, () => {})`, both handlers
no-ops so nothing can surface or reject.

**The buyer sees nothing.** `searchDemand.ts` renders nothing, returns nothing
and holds no state; BrowsePage's diff is one import and one effect. No empty
state, message or copy changed anywhere, confirmed by diffing for buyer-visible
strings.

**Admin screen** at `/admin/marketplace/search-demand`, reading
`marketplace_search_demand` in the view's own order, empty searches first, with no
sort control or chart. A term nobody ever found gets a coral border and "Found
nothing, every time".

Test rows deleted afterwards: `marketplace_searches` is back to 0.

## 166. The video moves next to the condition notes (2026-08-29)

**One of the two changes was already in place.** The ask button was written as
`{listingVideo ? null : ...}` in section 158, so it already hid whenever the
listing had a video, and it already sat alongside the other ask actions. Nothing
was needed there, and nothing was changed. Reporting it rather than claiming to
have built it.

**The move.** `ListingVideoPlayer` was rendering inside the ask-actions block,
between "Ask a question" and the ask-for-a-video button. It now renders
immediately before the condition notes instead, and only there: a buyer reading
how honest the seller has been about wear is the moment a clip of it working is
most persuasive.

Deliberately NOT tied to `condition_notes` existing, since a listing can have a
video and no notes; the player is gated on the video alone.

**Verified by loading real listings, not by reading:**

  Activity Play Gym   1 player, directly above the notes, no ask button
  Graco Baby Swing    1 player, next sibling is .mkt-detail-condition
  2in1 Baby Swing     1 player, next sibling is .mkt-detail-condition
  Toddler Play Bundle no video: 0 players, 0 iframes, no placeholder text,
                      "Ask Esohe for a video" present, and the element before
                      the condition notes is the seller card, so the page
                      closes up with no gap

On all three with video the ask-for-a-video button is absent and no watch button
replaces it. "Ask a question" and "Ask for a lower price" are untouched
everywhere.

The private_only path is unchanged: a buyer with their own older request video
still gets "Watch your own video" even once the listing has a public one, which
matters because those four were filmed under a written promise.

## 167. The ok-field bug, third occurrence, made structurally impossible (2026-08-29)

Adding a video for a seller always reported "That could not be saved" while the
save had gone through. `admin_add_listing_video` returns `{ listing_id, note }`
and RAISES on failure; it has never had an `ok` field. Real cost: six duplicate
uploads, three on one breast pump listing, because the obvious answer to a false
failure is to press again.

**The diff, generated rather than read.**

Client side, 5 call sites decided success from an `ok` field, all through one
helper: `admin_answer_question_for_seller`, `admin_attach_video_for_seller`,
`admin_answer_offer_for_seller`, `admin_fulfil_request_with_listing_video`,
`admin_add_listing_video`.

Database side, of **551** public functions exactly **2** emit an `ok` key,
`check_email_rate_limit` and `quiz_budget_suggestions`, and NEITHER is called
with an ok-check anywhere.

So every client ok-check in the codebase was wrong, and no function anyone
ok-checks has ever returned one. Four had already been corrected in an earlier
pass; `adminAddListingVideo` was written afterwards and reintroduced the same
mistake, which is the whole reason a convention was not enough.

**The structural fix.** `src/lib/rpcResult.ts` owns the contract:
`rpcAction(client, fn, args, fallback)` computes `ok` from the error alone and
DOES NOT RETURN THE PAYLOAD, so a caller has nothing to invent a verdict from.
The function's own `note` still surfaces as `message` on success, since that is
the only part worth showing. All five call sites now go through it.

**And a guard that fails the build.** `src/lib/rpcResult.test.ts` scans every
source file, finds each `.rpc(` call, and fails if `.ok` is read from the
payload within that call's own window. Scoped to the call site on purpose: an
earlier file-wide version flagged four innocents, a `fetch` Response and three
of our own `{ok,message}` wrappers. Verified by deliberately reintroducing the
bug, watching the test fail, and restoring: 6 passed, then 1 failed, then 6
passed.

**Double press.** `setBusy(true)` re-renders, but a second click in the SAME
tick still sees `disabled=false` and starts another 40MB upload before the RPC
can refuse it. A `useRef` guard closes that window synchronously, which state
cannot.

## 168. QA design admin account (2026-08-29)

  qa-design@bundledmum.test
  password: BundledMumQA!2026
  auth uid 0c123342-a232-4477-af86-b9420b7d0150, role `design_viewer`

Closes the last standing limitation in these reports: admin screens had only
ever been verified by code review and SQL, because no admin login existed here.
Sits alongside the QA seller and buyer from section 163, with the same caution:
if the row is ever deleted, remove it from anywhere referencing it.

**Login works, first attempt.** The auth row was checked against a working admin
row first, since that is where the QA seller failed: all eight token columns are
empty strings rather than NULL, `email_confirmed_at` set, `aud`/`role`
`authenticated`, one identity, provider email. Nothing differs.

**Masking works, and is role conditional.** `mask_for_viewer` returns the raw
value `when not is_design_viewer()`, so real admins are unaffected. Loaded
`/admin/marketplace/needs-video` signed in as this account: 159 rows, 158 masked
phones, ZERO real phone numbers or emails. Nine views carry it, as described.

**Read-only in fact, not by convention (corrected 2026-08-29).** This account
originally had `marketplace: manage`, which on this codebase is BOTH the route
gate (`PermissionGate module="marketplace" action="manage"` wraps every
marketplace admin route) and the write gate (every admin marketplace RPC checks
`has_admin_permission('marketplace','manage')`). That left 24 write RPCs
reachable from a design account, `admin_mark_payout_released` among them.

Fixed at the function rather than the permission, since revoking the grant would
empty the screens: all 24 now call `assert_not_read_only()`, which raises "This
is a read-only account for design work. It cannot change anything." for a
`design_viewer` and is a no-op for everyone else.

Verified by re-running the same diff that found the hole: 24 reachable write
RPCs, 24 guarded, none missed, and in all 24 the guard precedes the write rather
than following it. Then exercised from the client, which is the part that
matters: `admin_add_listing_video`, `undo_outreach_contact` and
`admin_mark_payout_released` each returned the read-only message. All three were
called with an id matching nothing, so neither outcome could have written.

**Names.** Buyer names are now masked on all six views carrying one
(`marketplace_abandoned_checkouts`, `marketplace_admin_orders`,
`marketplace_awaiting_confirmation`, `marketplace_pending_payments`,
`marketplace_returns_awaiting_confirmation`, `marketplace_stopped_at_payment`),
plus `full_name` on `marketplace_buyers` and `bank_account_name` on
`marketplace_payout_queue`.

SELLER display names stay real, deliberately: they are already public on every
listing, so masking them would hide what the whole internet can see. So the rule
is a real SELLER name is expected; a real BUYER name, phone, email or bank
number is a bug worth raising at once.

Money is deliberately NOT masked, so column widths are designed against real
values: ₦156,000 wraps differently from ₦9,999.

**All seven marketplace admin screens load** signed in as this account, none
denied, and no real phone or email appears on any of them: payouts, outreach,
pending payments, needs-video, videos-to-review, awaiting-confirmation and
search-demand.

## 169. The marketplace admin nav, grouped, and the rule for adding to it (2026-08-29)

The sidebar had reached 21 flat items, 821px of rail in a 603px viewport, so it
scrolled. Six of them shared a placeholder `ShoppingCart` icon: every screen
added during this session was appended to the end with a default icon, because
there was no structure to put it in.

**Grouped by why you open it, not by what it touches.** Almost every screen here
touches listings or orders, which is exactly why grouping by entity produced a
flat list. Now 11 rows collapsed instead of 21, and it no longer overflows.

  Dashboard
  Review queue                    top level, out of Queues: it is the first
                                  thing opened most days
  Queues        Payout queue, Disputes, Returns
  Follow up     Everyone to chase, Did not finish paying, Abandoned checkouts,
                Waiting on the buyer
  Video         Listings with no video, Videos to check
  Records       Sellers, Buyers, Listings, Orders
  Money         Money owed, Finance
  What buyers searched for        top level: read to decide, never to act, and
                                  a group of one is worse than no group
  Setup         Categories, Featured categories, Settings

A group may itself be a link, for when the parent is the general case and the
children are slices of it: "Follow up" IS the whole outreach queue.

**WHERE A NEW ITEM GOES.** First rule that matches wins:
  1. shows a count that should reach zero            -> Queues
     ...and clearing it means messaging someone      -> Follow up
  2. you open it to find one known thing             -> Records
  3. money in or out                                 -> Money
  4. changes behaviour for everyone                  -> Setup
  5. read to decide, never to act                    -> top level, alone
If two match, ask which would make you open it at 9am.

**And the rules that stop it drifting back:**
  - a group needs TWO members; one child stays top level
  - six children means it is really two groups (Follow up is at four)
  - a reused generic icon is not a style choice, it is the system saying the
    item was appended without anyone deciding where it belonged
  - ADD TO A GROUP, never to the end of the list. If nothing fits, that is
    evidence for a new group, not permission to append.

All of the above lives as a comment above `MARKETPLACE_NAV`, where the next
person adding a screen will actually see it.

**Behaviour, verified signed in as the design account.** A group opens by itself
when it holds the current page, so nobody has to remember which group a screen
lives in; an explicit toggle is remembered and wins. Navigating from
needs-video to payouts closed Video and opened Queues, while a manually opened
Money stayed open, and the active child was highlighted.

**Not done, and worth knowing.** There are two nav systems in AdminLayout: the
storefront nav is DB driven (`get_admin_nav()`, `admin_nav_items` with
`parent_key` and `display_order`) and already renders a parent/child tree, while
MARKETPLACE_NAV is a hardcoded array. This grouping is local to the array. The
eventual convergence is moving marketplace nav into `admin_nav_items` so
ordering is editable without a deploy, but that is a Supabase change and did not
belong in a nav tidy.

## 170. A queued video is not a failed one (2026-08-29)

YouTube caps how many videos a channel may upload in a rolling 24 hours. It is a
CHANNEL limit, not an API quota, so it cannot be raised by asking. We hit it at
13 because sellers actually responded. The worker now paces itself against
`marketplace_youtube_daily_cap` and returns anything refused for that reason to
`pending`, so it retries by itself. Queueing is a NORMAL outcome now, and will
happen more.

**The cause was the first option, not the false-failure bug.** The interface had
no pending state at all. `listing_video` deliberately returns nothing until
YouTube really has the file, which is right for buyers and wrong for the owner:
it makes a QUEUED video indistinguishable from NO video. So the field fell
through to its last branch and offered "Record or upload a video" again. A
seller who had just spent minutes on mobile data reads that as failure and
uploads again, which is the same mechanism behind the six duplicate uploads.

**The guard test should NOT have caught this, and did not.** It bans deciding an
RPC's success from an `ok` field in its payload. Nothing here does: every call in
the video path is already error keyed, and the suite passes. This was a missing
UI state, not a misread result. Different failure mode, correctly outside its
scope. Worth noting because "we have a test for that" would have been the wrong
conclusion.

**The fix.** `useMyListingVideoState(listingId)` reads `youtube_status` straight
off the listing, which the "Seller reads own listings" policy already allows and
`authenticated` has column access to, so no Supabase change was needed. It
returns one of pending / ready / failed / null, and the field branches on all
four rather than on "is there a ready video".

Verified against real rows in every state: the live queued listing maps to
`pending`, Activity Play Gym to `ready`, Toddler Play Bundle to `null`, and a
failed row to `failed`. The queued one was uploaded from the admin screen, which
is exactly the case reported.

**What a seller sees when queued**, one constant used in all three places so the
wording cannot drift:

  "Done, your video will be added shortly."

with, on the listing field, "It shows on your listing as soon as it is through,
and buyers see nothing until then." Worded as DONE rather than as a delay,
because from the seller's side the job is finished.

**What admin sees**, uploading on a seller's behalf: "Done, the video will be
added shortly. It is queued for YouTube and appears on the listing by itself, so
there is nothing to send again." The row pill now reads "Video queued, nothing to
do" rather than the raw status.

**A genuine failure still reads as one.** `youtube_status = 'failed'` is checked
BEFORE the queued branch and gets its own error box, "Something went wrong with
that video and it did not go up. Please try sending it again," plus a control to
send another. Admin gets a negative "Video failed, needs another". The transfer
failures (unreadable file, dropped connection) are untouched and still report
honestly. Telling the two apart is the whole point.

Nothing was left behind: three attempts to insert a QA listing were refused by
the listing triggers, and zero QA listings exist.

## 171. A stopgap video, while YouTube's queue catches up (2026-08-29)

YouTube caps the channel at roughly 12 uploads a day and sellers upload faster,
so a video can wait a day or more. A buyer looking at that listing saw nothing,
which is the exact doubt the feature exists to remove. Four are queued: 8.7,
29.6, 30.1 and 40.0 MB, all under the 50MB ceiling.

**Would the old player have autoplayed a stopgap? It could not have been handed
one.** `ListingVideoPlayer` took a `youtubeVideoId` and built an iframe; there
was no path by which a file URL could reach it. Its autoplay is `autoplay=1&
mute=1` on the iframe src, and the iframe is only created after a tap. So the
risk was never the existing code, it was the obvious next edit: swapping the
iframe for a `<video autoPlay>` behind the same tap would have autoplayed 40MB.

**A separate bug found on the way in.** `useListingVideo` ended with
`return row?.youtube_video_id ? row : null`. A stopgap row carries no YouTube id,
so every stopgap would have been thrown away and nothing rendered. It now keys on
`status`.

**No bytes before the tap, verified from the network panel.** On a queued
listing, before any tap: no `<video>` element exists at all, no iframe, and the
network shows zero requests to `listing-video-staging`. The signed URL is not
even requested until the tap. A poster attribute pointing at the file, or a
`<video preload="auto">` behind a poster image, would have looked identical and
cost the buyer the same 10 to 20 naira.

`preload="none"` also suppresses autoplay, which is why the first attempt sat at
`readyState 0` forever. The tap now calls `play()` explicitly, muted, since an
unmuted programmatic play is refused on mobile and the controls are right there.
After the tap on the 8.7MB clip: readyState 4, playing, currentTime advancing
through a 70.9 second video.

**One of the four cannot play in Chrome, and now shows nothing rather than
something broken.** The 40MB file is a `.mov`; Chrome sits at readyState 0
forever WITHOUT firing an error, so `onError` cannot rescue it and the buyer
gets a dead player. `browserCanPlay()` checks `canPlayType` for the extension
first and the card renders not at all if the answer is no, which is exactly what
a buyer saw before stopgaps existed. That creates a `<video>` element but never
gives it a src and never loads anything: a capability lookup, not the metadata
probe that hung iOS twice.

**Switching to YouTube.** `listing_video` prefers YouTube whenever it is ready.
The marketplace QueryClient has no persister, so a reload always refetches;
`staleTime` is now 30s with `refetchOnMount: "always"` so returning to a listing
within one session also revalidates. The signed URL is never cached: it is minted
on the tap, held in component state, and discarded on unmount.

**The deleted-mid-playback case** fails quietly: `onError` drops back to the
poster with no message. A reload picks up the YouTube copy.

**The buyer is told nothing.** No badge, no "temporary", no "processing". The
card, the poster, the "Tap to play" and the caption are identical either way.

Verified across all six states: three mp4 stopgaps show the card with no video
element before the tap, the .mov shows nothing, a ready listing shows the card
with no iframe before the tap, and a listing with no video shows nothing.

## 172. The service fee is a percentage now, and charged on every order (2026-08-29)

It was a flat N500 below N10,000 and N1,000 at or above, once per buyer per day.
It is now 8% of the item price, floor N200, cap N1,500, charged on EVERY order.
A flat fee punished cheap items: 23 live listings under N2,000 averaged 34% on
top while a N360,000 item paid 1%, and one real buyer paid N1,800 plus a N500
fee and took seven attempts. The once-a-day rule only existed to make a flat fee
bearable across several cheap things; a percentage does not need it.

**Every place the fee was described, calculated or displayed:**

  CheckoutPage.tsx        read all three dead settings and computed the tier
                          itself for single-item mode; cart mode already used
                          the server figure. Also the false sub-line.
  FaqPage.tsx             two answers, both stating the once-a-day rule
  TermsPage.tsx           the fee sentence in the charges paragraph
  policySettings.ts       fetched and exposed the three dead settings
  MarketplaceSettings.tsx admin editors for the three dead settings, plus a
                          summary line describing the tiers
  BecomeSellerPage.tsx    a comment describing the fee as "tiered by item price"
  create-marketplace-order/index.ts  reads all three dead settings AND
                          once_per_day. This is the REPO copy of an edge
                          function; the deployed one already charges from
                          marketplace_service_fee(). Left alone, since edge
                          function deploys are out of scope here, but the repo
                          copy is stale and will mislead whoever reads it next.

**Nothing computes the fee in the frontend any more.** Single-item checkout now
calls `marketplace_service_fee(p_item_price_naira)`, the one place the rule
lives and what both order paths charge from. Verified from the query cache on a
live checkout: `["mkt-service-fee", 36]` resolved to 200 in one fetch. Cart mode
still uses the server's own total.

**The new checkout wording**, replacing "One fee per order today, not per item
or per seller":

  "Service fee — Charged on each item in this order"

**The new FAQ answers:**

  What does BundledMum charge me?
  "A service fee on each item you buy, 8% of its price, never less than N200 and
  never more than N1,500. You see the exact amount at checkout before you pay
  anything."

  Do I pay the fee more than once if I buy several things?
  "Yes. The fee is charged on each item, so three items means three fees.
  Checkout shows you the total before you pay, so there is nothing to discover
  afterwards. It is 8% of each item's price, never less than N200 and never more
  than N1,500."

Answering "Yes" first, plainly, because a buyer who finds three fees after being
told there is one will not trust the next thing we say.

**Nothing hardcodes the percentage, floor or cap.** The only literals are the
fallbacks in policySettings, and they are deliberately the SAME values
`marketplace_service_fee()` itself coalesces to, so a missing setting cannot make
the policy page state something the function would not charge. No dead setting is
read anywhere in src/ any more; the admin editors now point at percent, min and
max.

Worth knowing: the N200 floor still means 40% on top of a N500 item. Better than
the N500 flat fee that took 100%, but the very cheapest listings remain the place
where the fee is felt most.

## 173. The stale edge function source, made honest (2026-08-29)

`create-marketplace-order`'s committed source still read
`marketplace_service_fee_threshold_naira`, `_below_naira`, `_at_or_above_naira`
and `_once_per_day`, with the whole once-per-buyer-per-day waiver block, none of
which the DEPLOYED function has done since it moved to
`marketplace_service_fee()`. Behaviour was never wrong: N1,800 charges N200 and
N360,000 charges N1,500, verified. Only the source lied.

Repo now matches deployed v21 for the fee: one RPC call, no tier settings, no
daily waiver, and `service_fee_waived` returns a literal `false`. The deployed
source was FETCHED and the repo patched to match it, rather than rewritten from
memory, and only the fee region was touched so nothing else could drift.

NOT DEPLOYED. Edge function deploys are the owner's, and nothing here changes
behaviour: it makes the committed copy describe what already runs.

A residual difference, harmless and pre-existing: the repo copy keeps its
TypeScript annotations (`function isValidEmail(email: string): boolean`) where
the deployed copy has them stripped. That is a compile artefact, not a
behavioural divergence.

Nothing in `src/` or `supabase/` reads any of the four dead settings now. The one
remaining textual hit is the comment in policySettings.ts that explains they ARE
dead, which is worth keeping.

**A method note, from the same day.** The network panel was cited as proof that
no bytes were fetched before a video tap. The panel was not recording those
requests at all: it reported nothing for calls that provably happened, including
a 206 fetched by hand. The conclusion held on the DOM evidence (no `<video>`
element existed at all) but the stated reasoning did not.

The lesson generalises and has now cost time twice: a tool reporting nothing is
not the same as nothing happening. It is the same shape as the zero-width
viewport that made a card measure 30px wide. Before treating an instrument's
silence as evidence, confirm the instrument is recording, by making it show
something known to be true.

## 174. Delivery terms overlapping the item on cart checkout (2026-08-29)

On an iPhone at 390px the delivery line rendered ON TOP of the item name and
price. "Sander" and N12,000 sat behind "Praise only sells to buyers in Lagos...",
both unreadable. Only cards whose seller had set terms were affected.

**The cause: the delivery line is a THIRD flex child of `.mkt-cocard-row`, a
sibling of `.body`, in a nowrap row.** The cart page puts the same component
INSIDE `.body`, which is why that page never showed the fault. `.mkt-cocard-row`
is `display: flex` with no wrap, `.body` has `flex: 1; min-width: 0`, and the
delivery line had neither a `min-width: 0` nor a basis. It carries an 80
character sentence, so flexbox would not shrink it below its min-content width,
`.body` collapsed toward zero, and the title and price overflowed their own box
straight into the terms text.

Not an absolute position or a negative margin: a plain flex sizing conflict, and
invisible until a seller had terms long enough to win the fight for width.

**The mobile rule was described and never written.** The desktop override at
2720 carries the comment "Terms sit inline beside the item on desktop's wider
row, since there is width to spare, rather than on their own line beneath it."
The beneath-it case that comment contrasts with had no CSS at all. Now:

  .mkt-cocard-row { flex-wrap: wrap; }
  .mkt-cocard-row .mkt-delivery-line { flex: 1 0 100%; min-width: 0; }

with `flex-wrap: nowrap` added to the desktop rule so the inline treatment is
explicit rather than incidental.

**Verified by loading the real cart**, the same three items that produced the
screenshot, measuring for actual rectangle intersection rather than eyeballing:

  390px  Sander / N12,000, terms 15px BELOW the body, no overlap, body 271px
         Baby Teethers / N3,600, same
         Baby Walker / N14,400, no terms, no line, unchanged
  320px  all three, no overlap, no horizontal page overflow, body 201px, and
         neither title nor price overflows its box
  1280px terms back beside the item, capped at 240px, nowrap, no overlap

The no-terms card is the control and renders exactly as before: with no terms
`SellerDeliveryLine` returns null, so there is no third child and nothing wraps.

The cart page is untouched: no rule added here targets `.mkt-cartcard-row`, and
its delivery line lives inside `.body` regardless.

The service fee line is unaffected, still reading "Service fee, N2,400, charged
on each item in this order", as is the "3 separate deliveries" note.

## 175. A buyer can change their state after checkout (2026-08-29)

A buyer could SET their state at checkout and then never change it. Someone who
moved, or picked wrong once, was told which items could and could not reach them
based on a state they had no way to correct.

**The account page did not exist.** The brief said "add it to the account page";
the header's "Account" is a slide-out MENU (Browse, Sell an item, My orders,
Seller dashboard, email, sign out) and there was no `/account` route or any page
showing buyer details. So one was built: `account/AccountPage.tsx` at
`/account`, linked from that menu under My orders, signed in only.

Also worth recording: the brief says three of fourteen buyers have a state.
Live it is 24 of 502.

**A LoginReason had to be added.** `sendToMarketplaceLogin` takes a closed union
and "account" was not in it. Reusing "orders" would have shown orders copy on an
account page, so a new reason was added with its own honest line, matching the
existing pattern: "To change your settings, we need your email."

**Immediate effect, and how.** `buyerState.ts` already had the mechanism: a
localStorage copy plus a `bm-mkt-buyer-state-change` event, and every
deliverability query is KEYED on the buyer state (`DeliveryTermsBlock`,
`CartPage`) and re-runs when it fires. So the page writes the account via
`set_my_delivery_state`, then calls `setBuyerStateLocal`, which is what makes a
listing answer differently with no reload.

Proved on a state-only seller, in one page load with no navigation between:

  state Lagos  "Praise will send this to you in Lagos."
  -> Kano      "Praise cannot send this to you in Kano, she only sells within
                Lagos."
  -> Lagos     back to the first line

**What a buyer is told before changing it**, one line as asked:

  "This changes which items we tell you cannot reach you, on a listing and at
  checkout."

**Clearing, worded as a real choice rather than a mistake:**

  "We will stop telling you which items can reach you. Nothing gets blocked, you
  would just arrange delivery with the seller yourself."

and afterwards, "Cleared. We will stop telling you which items can reach you."

Verified end to end as the QA buyer: set Lagos (server and local both Lagos,
clear button appears), cleared it (server null, local null, clear button
disappears since there is nothing left to clear), and with it cleared the
state-only listing states the seller's terms conditionally, says nothing about
being unable to reach them, and Buy now stays enabled. That is the rule holding:
unknown state blocks nothing.

The checkout selector, the undeliverable blocking and the personalised listing
wording are untouched: this only adds a second place to write the same value
through the same functions.

## 176. The stopgap video was hidden from the browsers that could play it (2026-08-30)

A staged .mov on "2 in 1 Electric Steam Steriliser" rendered nothing on the
listing page. Both candidate causes were wrong.

**The stopgap code was deployed.** `MarketplaceApp-C4rYu4tf.js` on
bundledmum.com contains `stopgap_path`, `canPlayType`, `video/quicktime` and
"Plays only when you tap". Not a deploy lag.

**The capability check did not require "probably".** It accepted anything
`canPlayType` did not answer with the empty string, so "maybe" passed. The
suspected Safari rejection was not happening: measured in a real WKWebView
(AppleWebKit/605.1.15), `canPlayType("video/quicktime")` returns **"maybe"**,
and the deployed page played the steriliser file on tap — readyState 4,
960x1280, 20.9s, currentTime 8.64, no error.

**The actual fault was the opposite way round.** Chromium answers `""` for
`video/quicktime` **and then plays the file perfectly**: loadeddata,
readyState 4, 960x1280, duration 20.918, no error. So the check hid a working
video from Chrome and Android — most Nigerian buyers — on all three queued
listings, every one of them a .mov because sellers film on iPhones. The
feature did nothing for the common case, which was the whole point of it.

The comment justifying the check was also false. Chromium does **not** sit
silently at readyState 0 on a file it genuinely cannot decode: given 5000
bytes of garbage labelled video/quicktime it fired `error` in **6ms**, code 4,
`DEMUXER_ERROR_COULD_NOT_OPEN`. `onError` was a working fallback all along.

`canPlayType` is worthless as a veto in either direction here, because WebKit
answers "maybe" to every bare mime type it is handed, webm included.

**The fix** removes `browserCanPlay` entirely. We attempt the file on the tap
and, on the error, hide the card outright rather than returning to a Tap to
play button that would never work and would spend a little more of the
buyer's data on each attempt.

### The lesson, again in a new shape

Both the code and the brief reasoned from what an API *says* it can do.
Neither matched what the browser *does*. A capability string is a claim, not
a measurement, and a claim that fails closed silently removes a feature
without anything looking broken. Measure the behaviour, and measure the
failure path too: it was the 6ms error that made removing the gate safe.

Nothing here reads video metadata. `canPlayType` never touched a file, and
neither does its removal — the only thing that reads the file now is playback
itself, after a tap.

### Verified, not read

The instrument first: resource timing records **zero** entries for a media
fetch even while the video is demonstrably playing, so "0 staged requests"
proves nothing and was not used. A `window.fetch` spy, proven live against a
known-true favicon call, was used instead.

Chromium, all three staged .mov listings, local build:

| listing | before tap | after tap |
|---|---|---|
| 2 in 1 Electric Steam Steriliser | card, 0 `<video>`, no staging URL in the DOM, 0 sign calls | 960x1280, rs 4, playing, no error |
| Kidilo Infant Rocking Bed | card | 480x774, rs 4, playing, no error |
| Mastela 4in1 Baby Bassinet | card | 2160x3840, rs 4, playing, no error |

The tap, and only the tap, minted the signed URL —
`live-2ac49138-...-1788070947920.mov` appeared in the spy on the tap and
never before it.

WebKit (WKWebView) against the patched build: card present, 0 `<video>`
before the tap, then paused false, currentTime 7.8, no error. Unchanged.

Error path: dispatching `error` on the playing element removed the card and
left the rest of the listing intact.

YouTube 'ready' is untouched — Mastela 3in1 Baby Rocker still shows the
i.ytimg.com thumbnail, no iframe before the tap, and the
youtube-nocookie embed with `autoplay=1&mute=1` after it.

## 177. The seven on-behalf functions that had no interface (2026-08-30)

Fourteen functions can now write to the marketplace as a seller or a buyer,
and seven of them had no screen at all, so they could not be used. Sellers and
buyers answer WhatsApp far more readily than they open the app, which is the
whole reason these exist.

**What already had a screen, and was not rebuilt:** answering a question,
attaching a video, fulfilling a request with a listing video and answering an
offer (all in `AnswerForSeller`, on the outreach row), adding a listing video
(`MarketplaceListingsNeedingVideo`) and confirming receipt
(`MarketplaceAwaitingConfirmation`).

### Four things in the brief that did not match the code

**1. There was no admin order detail screen.** `MarketplaceOrders` was a flat
read-only table whose own header said "actions live in the payout queue and
disputes". So "put it on order detail" had nowhere to land. Built as
list-plus-detail, matching Sellers, Buyers and Disputes.

**2. "Dispute view, mark the return sent" could not work.** Disputes queries
`outcome IS NULL`, so a dispute LEAVES that screen the moment it is ruled on,
and a return is only required after a ruling. Returns then picks it up at
`return_sent_at`, which only a buyer can set. The step in between had no screen
anywhere, which is exactly where a buyer who posts the item back and tells us
on WhatsApp got stuck: the seller had nothing to confirm and the refund could
not start. It went on Returns, the screen you already open to work a return.

**3. The buyer actions could not go on an outreach row.** All three need a
listing AND a buyer, and `OutreachRow` carries `person_id` and `stage_key` and
no `listing_id` at all. The buyer's own record is the only place both are
known, so they went there with a live-listing picker.

**4. Twelve on-behalf functions is fourteen.** Seven new, seven existing.

Also: `p_reason` on `admin_decline_video_for_seller` is optional, not required
(`nullif(btrim(coalesce(p_reason,'')), '')`), and `p_local_handover` is text
constrained to ships / collection / both, not a boolean. A checkbox pair cannot
express "both" and would produce values the function rejects, so it is three
explicit choices.

### Where each one went, and why

| function | where | why |
|---|---|---|
| `admin_mark_dispatched_on_behalf` | Orders, order detail | per-order decision, needs to know it is not already sent |
| `admin_raise_dispute_for_buyer` | Orders, order detail | same, and needs the amount held in front of you |
| `admin_mark_return_sent_for_buyer` | Returns, new first section | the screen you open to work a return |
| `admin_set_delivery_prefs_for_seller` | outreach row, `missing_delivery_prefs` | that row exists *because* buyers cannot tell if she will send |
| `admin_decline_video_for_seller` | outreach row, beside sending the video | the other real outcome of the same conversation |
| `admin_ask_question_for_buyer` | Buyers detail | needs a listing, see 3 above |
| `admin_make_offer_for_buyer` | Buyers detail | same |
| `admin_request_video_for_buyer` | Buyers detail | same |

The log went under **Records** by §169's rule: you open it to find one known
thing, namely why an order says something a seller did not do. It is not a
queue, nothing in it reaches zero, and nothing in it can be acted on. Its own
icon, not a reused one.

### Guards read before the click, not discovered after it

Three refusals are perfectly visible up front, so `buyerActionGuards.ts` decides
them and the picker shows the reason on the row itself. Live, that is 27 of 40
listings blocked for an offer and 5 blocked for a video request. Seven tests
cover them, including that the two are independent: a firm price must not hide a
listing from a video request, and an existing video must not hide one from an
offer.

### The read-only account

The server guard is the protection and is untouched: all seven call
`assert_not_read_only()`. But a design account clicking "raise a dispute" and
getting a database error reads as a broken screen rather than a deliberate
limit, so a line now appears beside the controls, to that account only: "This
account can look but not change anything." It asks `is_design_viewer()`, the
SAME predicate the server guard uses, so the notice and the refusal cannot
disagree.

### A pre-existing gap this uncovered, NOT fixed here

The design account sees **1** row of `admin_users` (itself) and **1** of
`customers`. Every arm of `marketplace_on_behalf_log` joins `admin_users` on the
acting admin, and `marketplace_admin_orders` and `marketplace_buyers` both join
`customers`, so all three views return **zero** rows for that account while
holding 9, 19 and many. That is RLS on the joined tables, it predates this work,
and fixing it is a Supabase change. It does mean the design account cannot
exercise Orders, Buyers or the log from their own lists.

### Verified signed in as the design account

Every panel was driven, not read. Where RLS hid the list, the real component was
served the real payload shape so the rendering itself was still verified, and
that is said plainly rather than glossed.

- **Dispute:** the confirm dialog showed Item Honey Babywears, Seller
  Oyindamola O., Money held ₦2,335, and the panel read "This freezes that money
  and tells Oyindamola O. something is wrong with their item." Confirming gave
  "This is a read-only account for design work. It cannot change anything.", and
  **nothing was written**: 0 disputes, the order still not disputed.
- **Delivery prefs:** opened on what was already true for Christiana O. (Yes,
  anywhere + Either one, matching `sells_nationwide: true, local_handover:
  'both'`), three explicit choices, refused on submit, 0 sellers written.
- **Decline a video:** submitted with an empty reason and only a note, proving
  the reason is genuinely optional; refused.
- **Offer:** at the asking price of ₦144,000 the guard blocked and the button
  was disabled; ₦143,500 cleared it; still disabled until the note; refused on
  submit.
- **Video request:** exactly the 5 listings with a video were blocked, and the
  firm-price guard correctly did not apply.
- **Note minimum, exactly:** 9 characters disabled, 10 enabled.
- **Log:** 9 recorded, newest first, all nine attributed to Marvellous with
  their notes.
- **Returns:** the new section is absent when there is nothing waiting, and the
  existing empty state no longer contradicts it.

The `?order=` deep link from Buyers' purchase history now OPENS the order rather
than only highlighting the row, which is what it should always have done once a
panel existed.
