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

### This pass — checkout merges service fee + Paystack fee into one line
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
  question definitions yet either. Both are a later phase.** This screen only
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
