# Handoff

## AdminProducts query — narrowed brands(*) to stop the on-disk sort (this turn)
The Disk-IO hog (EXPLAIN: `external merge Disk: 3512kB`, `Sort Key: products.display_order`) is
**[AdminProducts.tsx:59](src/pages/admin/AdminProducts.tsx:59)** — the `admin-products` react-query.
It selected `*, brands!brands_product_id_fkey(*), product_sizes(*), product_colors(*), product_tags(*)`
ordered by display_order. `brands(*)` dragged brands' long text columns (description, image_url,
stored_image_url, logo_url, thumbnail_url, images[]) + cost/vendor columns into the sort over all
613 products, exceeding work_mem (2184kB) → on-disk external merge, ~10GB/day of temp files.
- **Fix (frontend-only, one line):** narrowed the brands embed to the 12 columns this screen
  actually reads — `id, brand_name, price, cost_price, tier, is_default_for_tier, display_order,
  sku, in_stock, pack_count, diaper_type, weight_range_kg` (traced: search L136-137, duplicate
  L113, PackInfoCell L446-455, COGS coverage L530). All dropped columns confirmed unread on this
  screen, so behaviour is unchanged. Ordering/filtering/pagination untouched. All 12 columns
  verified to exist on `brands`. `npm run build` passes.
- **Why it runs so often (~2,390/day, not human browsing):** `["admin-products"]` is realtime-
  invalidated by SIX tables (products, brands, product_sizes/colors/tags, product_images —
  [realtime.ts:14-30](src/lib/realtime.ts)) plus `refetchOnWindowFocus: true`
  ([StorefrontApp.tsx:194](src/StorefrontApp.tsx:194)); any write to those tables while the tab is
  open refetches the full-width query.
- **Flagged, NOT changed (per the task's report-don't-touch rules):**
  1. **`image_url` shown to customers (data/behaviour bug).** `getBrandImage` ([brandImage.ts](src/lib/brandImage.ts))
     intentionally falls back to the external `image_url` when `stored_image_url` is empty (~12/1150
     brands) and it renders on customer surfaces. Removing it would break those images, so it was
     left. Proper fix: re-host the ~12 failed `stored_image_url`, then drop `image_url` from the
     customer selects.
  2. `product_sizes(*)/product_colors(*)/product_tags(*)` on `admin-products` are fetched but never
     read (only destructured-to-discard in `duplicateProduct`). Recommend removing those 3 embeds
     separately.
  3. Customer product-list queries (useProducts/useAllProducts/CategoryPage/SubcategoryPage/
     PushGiftsPage) are already narrowed to `brands_public`; only `product_id` + `is_default_for_tier`
     are unused there (tiny, non-text) — not worth a behaviour-risking change.
- **RLS:** no customer-facing site reads `brands` directly (all use `brands_public`); site A is
  admin and legitimately needs `cost_price`. All embeds were already FK-qualified
  (`!brands_product_id_fkey`). No SQL/RLS/edge/cron change.

## Finance report — 3 reconciliation fixes (this turn)
**FIX 1 — Monthly Trend now two-arm.** [financePdf.ts](src/lib/financePdf.ts) Monthly Trend read
`figures.monthly_trend` (finance_monthly_trend, storefront-only) and suppressed any month with
storefront paid_orders=0 AND revenue=0 — which wrongly hid Jul and Aug. Now reads
`company_finance_monthly` with columns Month, Store Orders, Store Revenue, Store Gross Profit, Mkt
Orders, Mkt GMV (volume), Mkt Revenue (take), Company Net Profit. New suppression: hide ONLY months
with 0 orders on BOTH arms AND ~0 company_net_profit (still hides a truly-empty trailing month).
Pre-trading months (Mar/Apr, before launch, flagged `**`) and zero-storefront-revenue months with
activity/pending story (Jul/Aug, flagged `*` "revenue counts paid orders only, see pending pipeline")
now show. Verified: 6 rows Mar–Aug render incl. Jul & Aug.

**FIX 2 — two net-loss figures on page 1 now labelled by scope.** The P&L block (finance_period_metrics,
storefront-only, net profit -4,744,801) and the Company Combined net profit (company_finance_period,
both arms, -4,675,833) were two different unlabelled figures. Chose approach (b) (smaller/safer;
(a) would break the storefront P&L waterfall): heading now "Profit & Loss (storefront only, selected
period)", the Net Profit/EBITDA lines say "storefront only", and a note points to Company Combined
for the company-wide loss.

**FIX 3 — two Capital Remaining figures reconciled.** The Burn & Runway TABLE reads
`figures.runway.capital_remaining` = finance_runway.capital_remaining = **NGN 3,904,993** (correct).
The prose showed **NGN 3,914,793**, which is `company_runway.company_capital_remaining` (a second live
field in the payload, exactly +9,800 = the marketplace take) — the model cited it because nothing
pinned capital remaining. Fix: a system-prompt rule in generate-financial-report pins capital/cash
remaining to `figures.runway.capital_remaining` only. **This is the ONLY edge-function change and it
is NOT yet deployed** — repo copy updated byte-identical, deploy handed to the owner per the process
boundary. Deployed generate-financial-report is still v30; deploying the repo copy applies FIX 3.

financePdf.ts smoke-tested by rendering the PDF with the real figures (6-row trend, storefront-only
P&L labels, capital 3,904,993 in the table all verified). `npm run build` passes. No cron changed.

## Finance report — Company Combined figures + AI narrative fixed (DONE, this turn)
Two bugs in generate-financial-report / financePdf, plus a zero-revenue prompt rule.

**BUG 1 (Company Combined showed wrong company_revenue / net_profit).** The PDF's Company
Combined table read `cfmLatest` = the LAST month of `company_finance_monthly`. In a month the
storefront booked no paid revenue, that latest month carries only the marketplace take, so it
showed company_revenue NGN 9,800 and net_profit NGN -834,654 (marketplace-only, latest month),
not the period totals. Fix: the edge function now also pulls `company_finance_period(p_start,
p_end)` (the range aggregate) into `figures.company_finance_period`, and financePdf's arm +
company-combined summary tables read that (`const cper = figures.company_finance_period; const L
= cper || cfmLatest || {}`), falling back to the latest month only for older cached reports.
Verified: `company_finance_period('2026-05-01', CURRENT_DATE)` → company_revenue **1,541,102**
(= storefront 1,531,302 + marketplace take 9,800), company_net_profit **-4,675,832.93**.

**BUG 2 (every section = "AI narrative unavailable"). ROOT CAUSE FROM A FAITHFUL REPRO (not a
guess):** the model id `claude-sonnet-4-6` is VALID (200 OK) and the API key is fine, so those
weren't it. Reproducing the exact production call (real system prompt + real figures) via a
throwaway `diag-anthropic` function showed the ten-section JSON output runs ~3,900-4,000 tokens
against `max_tokens: 4000` — right at the ceiling. On any run that writes a hair more (and output
grows as more months of data accrue: input was already 5,988 tokens), the response is cut off
(`stop_reason: "max_tokens"`), the JSON never closes, `extractJson` throws, and the WHOLE
`narrative` is nulled, so every section reads "AI narrative unavailable". The failure text was
only ever returned in the response body, never logged, so nothing appeared in function logs.
Fix: `max_tokens` 4000 → **6000** (verified: `stop_reason: end_turn`, output 3,943 tokens,
JSON parses, ~95s wall-clock, under the 150s edge limit; time is driven by output length not the
cap, so this is not slower). Also: on a parse failure the function now sets a precise
`narrative_error` (naming a max_tokens cutoff) AND `console.error`s it so future failures are
diagnosable in logs.

**ADDITIONAL (0 storefront revenue with no context).** System prompt now instructs: revenue
counts PAID orders only; whenever storefront revenue is 0 for a month/period, explain that unpaid/
pending orders are correctly excluded and reference the pending pipeline from `company_pipeline`
(the incoming / unpaid_orders row, value_naira + items, currently NGN 9,327,510 across 49 orders)
so a zero is never shown without that context. It stays labelled PIPELINE, never added to revenue.

Deployed generate-financial-report **v30**; repo byte-identical. financePdf.ts + repo edge copy
committed. `npm run build` passes. No cron changed. (The temporary `diag-anthropic` function was
neutralised after diagnosis and the owner then set `verify_jwt` on it.)

**NEXT LIMIT IS WALL-CLOCK, NOT max_tokens — do NOT just raise the cap again.** The narrative
call now generates ~3,943 output tokens in ~95s, against the edge function's ~150s wall-clock
limit. Generation time tracks OUTPUT LENGTH, not the max_tokens cap. A test with an ~8,000-token
output already hit the 150s idle timeout. So once the report's output grows past roughly 5,000
tokens (more months of data, more sections, longer prose), it will start TIMING OUT instead of
truncating, and bumping max_tokens will not help. The real levers then are: shorten the prompt's
per-section length ("1 to 2 short paragraphs"), drop stale months from `company_finance_monthly`
sent to the model, split the generation into two smaller calls, or stream. Diagnose via
`stop_reason` / the `console.error(narrative_error)` line (a timeout surfaces as a request error,
not `stop_reason: "max_tokens"`).

**PROCESS:** edge-function DEPLOYS are the owner's side of the split. Make the repo change and
keep the repo copy byte-identical, then hand the deploy to the owner; do not call
deploy_edge_function directly. Repo/deployed drift has bitten more than once, and a public
diagnostic function holding an API key is a real risk even briefly. A needed diagnostic should be
deployed by the owner, gated (`verify_jwt` on) from the start.

## Finance — arm AGE / launch-period framing (DONE, this turn)
Additive layer on top of the existing three-view dashboard + company report: both surfaces now
know how OLD each arm is, so a 24-day-old marketplace is not read as a trend and its launch
spend is not read as failed payback. Source: the `business_context` view (storefront 105 days
live; marketplace 24 days, launched 2026-08-07, first paid 2026-08-11, `marketplace_is_launch_period=true`).
- **Dashboard ([src/pages/admin/AdminFinance.tsx](src/pages/admin/AdminFinance.tsx)):** `DashboardTab`
  fetches `business_context` (snapshot, not range-filtered) once and passes it to both sub-views.
  Storefront view shows "Storefront live 105 days (launched 2026-05-18)". `MarketplaceView` gains
  an amber **LAUNCH PERIOD** header (days live + launch date + first paid order) and, while
  `marketplace_is_launch_period`, the direct-spend-vs-revenue callout is reframed (amber, not red)
  as "launch-period acquisition spend … not a payback failure". `CompanyView`'s month-by-month
  note now says the arms launched nearly three months apart, so a given month is NOT like-for-like.
  All null-safe (`acqCount`/`acqNgn` → n/a).
- **Edge function `generate-financial-report` → v28** (deployed from deployed v27 + edits; repo
  byte-identical): reads `business_context` and adds it to the figures payload; system prompt gains
  an ARM-AGE/LAUNCH-PERIOD block — the model must state each arm's age before judging it, must not
  judge the marketplace on payback/trend/steady-state while in the launch period, must not compare
  the arms month-on-month as like-for-like, but MUST still report conversion + reliability defects
  (`pct_checkout_to_paid`, `avg_attempts_per_paid_order`, `worst_attempts_to_pay`).
- **NOTE:** the three-view dashboard + the six company views in the report already existed
  (commits c1d7ca6 / v26–v27); this turn is only the age/launch additions. PDF and cron untouched.
- **Verified live** (dev, isolated mount, real numbers): Storefront 105-days line; Marketplace
  LAUNCH-PERIOD badge + reframed callout (direct spend ₦341,915.42 vs kept ₦9,800, framed as
  acquisition spend), funnel 229→96→3 / 45→4, 5.0 attempts; Company revenue ₦1,541,102, net profit
  −₦4,240,832.93, monthly note "nearly three months apart … NOT like-for-like". `business_context`
  is RLS-limited for the read-only QA account, so its real values were fed as the prop to verify
  rendering; the edge function reads it via service role. `npm run build` passes.

## Finance DASHBOARD screen — Storefront / Marketplace / Company views (DONE, this turn)
The on-screen finance dashboard (not the PDF) now splits into three views. **Only file:
[src/pages/admin/AdminFinance.tsx](src/pages/admin/AdminFinance.tsx).** Pattern: an inner
sub-view switcher inside `DashboardTab` (styled like the existing range buttons), sharing the
ONE existing range picker (`pmRange`). No PDF/edge-function change.
- **Storefront view = the entire existing dashboard, unchanged** (wrapped in
  `{subView==="storefront" && …}`), PLUS a 4-card row (Revenue / Gross Profit / Direct Costs /
  **Contribution**) from the range-driven `company_finance_period` RPC.
- **Marketplace view (new `MarketplaceView`):** a prominent callout comparing
  `marketplace_direct_costs` vs `marketplace_net_revenue` → contribution (red when the take does
  not cover direct costs); revenue cards — **GMV "volume, not revenue"**, seller share
  "pass-through liability", markup vs service fee, revenue kept, blended take, contribution per
  order; and the range-driven funnel (`marketplace_funnel_period`): registered→listed→sold,
  listings live/sold, checkouts→paid→paid out, sell-through %, checkout-to-paid %, avg + worst
  payment attempts.
- **Company view (new `CompanyView`):** company revenue labelled "sum of two types: storefront
  retail + marketplace take"; shared overhead + payroll "belongs to neither arm"; **company net
  profit** (the only "profit"); escrow + pending payouts as **liabilities** ("not revenue or
  cash"); one **company-wide runway** (`company_runway_months_structural`); pipeline grouped by
  kind (incoming / supply / liability); month-by-month `company_finance_monthly` trend.
- **Range wiring:** the date picker drives the two new range RPCs (`company_finance_period`,
  `marketplace_funnel_period`) via the same `pmRange`. Snapshot/month panels (runway, pipeline,
  monthly trend, revenue split, unit economics) are each labelled "not filtered by the date
  range". Nulls/zeros render "n/a" or a dash (via `acqNgn`/`acqPct`/`acqCount` + `toNum`), never
  undefined/NaN.
- **Verified live** (dev server, QA design_viewer, no auth bypass): the two new views + the
  storefront cards were mounted in isolation and rendered REAL range-driven numbers — storefront
  contribution −₦2,384,359.27; marketplace direct spend ₦341,915.42 vs revenue kept ₦9,800 →
  −₦333,125.42, GMV ₦43,800 (volume), funnel 229→96→3 / 45→4, 5.0 avg attempts; company revenue
  ₦1,541,102, shared overhead ₦1,120,748.24, net profit −₦4,240,832.93, pipeline grouped by
  kind. Snapshot-view cards (runway/pipeline/revenue-split/unit-economics) showed the graceful
  n/a path because those views are RLS-restricted for the read-only QA account; a real admin
  (confirmed via service role) sees runway 8.3 months, pipeline 213/49 items, markup 7,300 /
  service 2,500. `npm run build` passes. Existing storefront metrics unchanged.

## Finance PDF — three company-wide sections now RENDER (DONE, this turn)
Wired the v26 edge function's three new narrative keys + six company views into the
delivered PDF (the delivery change scoped out last time). **Only file:
[src/lib/financePdf.ts](src/lib/financePdf.ts)** — appended THREE sections after all
existing content in `generateFinancialStatusReportPdf`, reusing the existing helpers
(`heading`/`para`/`afterTable`) and `autoTable` styling so it reads as the same document.
- **Storefront:** `storefront_section` narrative + grid table (latest + prior month):
  Revenue, Gross profit, Direct costs, **Contribution** (store_* from company_finance_monthly).
- **Marketplace:** `marketplace_section` + two tables — (a) revenue: **GMV (volume, not
  revenue)**, seller share (pass-through liability), markup revenue, service fee revenue,
  revenue kept, blended take rate, **contribution per order**; (b) funnel: sellers
  registered/listed, % listers sold, listings live/sold, checkouts started/paid/paid out,
  sell-through %, checkout-to-paid %, avg payment attempts. Plus a muted line comparing
  marketplace_direct_costs vs marketplace_net_revenue, labelled contribution.
- **Company Combined:** `company_combined_section` + table (company revenue labelled
  storefront retail + marketplace take, shared overhead, shared payroll, **company net
  profit** [only "profit"; red if negative], company-wide runway months) + pipeline grid
  grouped by kind (incoming → supply → liability) with a "liabilities owed to sellers" note.
- **Graceful absence:** each section renders only if its narrative key OR its view is present;
  an older cached report (none of them) omits all three with no empty headings and no crash.
  Individual missing cells show "n/a" (the money/pct/count helpers already do this), never
  "undefined". Money uses "NGN " (no ₦ tofu).
- **Original seven sections unchanged** (appended-only; nothing above moved).
- **Verified live** (dev server, real jsPDF path, real view numbers): 4-page PDF generates
  with all three sections and real figures (NGN 43,800 GMV, NGN 9,800 revenue kept, NGN 2,198
  contribution/order, 22.4% take, 8.3 months runway, funnel 1.4/80.0%/44.4%); parenthesised
  labels confirmed via inner-text search. Old-shape payload → 3 pages, zero new sections, no
  crash. `npm run build` passes.

## generate-financial-report — company-wide (two arms) context (DONE, this turn, v26)
Rebuilt the edge function's DATA + system prompt (not the delivery) so the report models
BundledMum as one company with two arms plus shared overhead.
- **Reads BEFORE:** storefront-era only — `finance_monthly_trend`, `finance_period_metrics`,
  `finance_projection_scenarios`, `finance_marketing_by_channel`, `finance_unit_economics`
  (RPCs) + `finance_runway`, `finance_quote_pipeline` (views).
- **Reads NOW:** all of the above (kept, so the existing PDF still populates) PLUS the six
  company views, added to `figures`: `company_finance_monthly` (6 rows, ordered by month),
  `company_runway` (snapshot), `company_pipeline` (5 rows), `marketplace_funnel` (snapshot),
  `marketplace_revenue_split`, `marketplace_unit_economics`. All read server-side via service
  role; no figure computed in code or by the model.
- **System prompt now carries** the BUSINESS MODEL rules (storefront ≠ marketplace, never
  blend; GMV ≠ revenue; take = markup + service fee reported separately; no marketplace COGS;
  escrow/pending payouts are liabilities; quotes/unpaid = pipeline) and the THREE-LAYER COST
  MODEL (storefront-direct, marketplace-direct, shared overhead never charged to an arm) plus
  the benchmarks. Arm-level figures are described as **contribution, never profit**; "profit"
  is reserved for the company figure. ONE shared runway = `company_runway_months_structural`.
- **Sections:** the model now returns three new keys `storefront_section`,
  `marketplace_section`, `company_combined_section` (STOREFRONT / MARKETPLACE / COMPANY
  COMBINED) in ADDITION to the existing seven keys (nothing that currently renders breaks).
  `max_tokens` raised 2600 → 4000 to fit them.
- **SCOPE FLAG:** the delivered PDF ([src/lib/financePdf.ts](src/lib/financePdf.ts)) renders
  only the seven original narrative keys + storefront figure tables. Per the task's "keep
  delivery unchanged, not a redesign", the PDF was NOT touched — so the three new sections and
  the six views are produced in the report PAYLOAD (returned `narrative` + `figures`) but are
  not yet drawn in the PDF. Wiring them into the PDF is a deliberate follow-up (a delivery
  change the task scoped out).
- **repo == deployed:** repo `supabase/functions/generate-financial-report/index.ts` is
  byte-identical to deployed **v26**. No cron changed.

## meta-catalog-feed availability — AUDITED, already correct (NO CHANGE, this turn)
Asked to set `availability` per row from `brands.in_stock` and keep OOS rows. **The
deployed feed (v31) already does exactly this** — no code change was needed or made.
- **availability (before == after):** `csv(b.in_stock ? 'in stock' : 'out of stock')`
  — Meta's lowercase CSV tokens. OOS rows are KEPT and marked `out of stock`, not dropped
  (preserves Meta history / ad learning; resumes instantly on restock).
- **No `in_stock` filter** in the query; the only filters are
  `products.is_active = true`, `products.deleted_at IS NULL`, `brand_name NOT ILIKE
  'Brand TBD%'`, `price > 0` (plus in-loop skips: `exclude_from_ad_platforms`, no slug,
  no image). Inactive/deleted products ARE excluded — verified, still true.
- **Live feed counts (fetched from the deployed function, CSV-parsed):** X-Row-Count
  **598** total served — **590 "in stock", 8 "out of stock"**; X-Skipped-Ad-Excluded 127,
  X-Skipped-No-Image 2. (The task's "22 OOS rows" was an earlier stock state; now 8, and
  they are already correctly marked out of stock.)
- **repo == deployed:** repo `supabase/functions/meta-catalog-feed/index.ts` is
  byte-identical to deployed v31 (ezbr_sha256 5a897057…). Nothing to deploy; cron untouched.

## Audience chooser — direct/organic homepage entry splitter (DONE, this turn)
A one-screen overlay asking direct/organic homepage visitors which of three
things they came for, routing them to the right place. **New file
[src/components/AudienceChooser.tsx](src/components/AudienceChooser.tsx)**; mounted
once in [src/StorefrontApp.tsx](src/StorefrontApp.tsx) inside `<BrowserRouter>` beside
the other listeners. No DB changes, no marketplace changes, no homepage content
changes, no pixel events.

**Where mounted / how it detects entry.** Global mount, self-gating. A module-level
`ENTRY = { path, search, referrer }` is snapshotted ONCE at import = the true landing
state, so later internal SPA navigation (logo/Home) can never trigger it. Shows only
when ALL are true: `ENTRY.path === "/"`; landing URL has none of
`fbclid/gclid/utm_source/utm_medium/utm_campaign/ref`; `document.referrer` is empty
(typed/bookmark) OR a search host (google/bing/yahoo/duckduckgo/ecosia); and not
already chosen. Guests paint instantly (sync gate, no fetch). Signed-in visitors:
reads `customers.audience_preference` (keyed `auth_user_id = auth.uid()`); renders null
while resolving (no flash), shows only if null.

**Options / memory.** Shop new → dismiss, stay on `/`. Buy used →
`window.location.assign('/marketplace')`. Sell → `.../marketplace/sell'` (BecomeSellerPage
onboarding). A "Just browsing →" link = choose 'new'. Cross-app links MUST be full-page
navigations — the marketplace is a separate app tree chosen from `window.location` at
mount (isMarketplace()), unreachable via the client router. On any choice: write
`sessionStorage['bm_audience_choice']` (guests, resets on browser close) AND, if signed
in, `supabase.rpc('set_audience_preference', { p_choice })` (validates new|used|sell,
updates the customer row) so it's skipped on future sessions.

**NOTE:** the RPC `set_audience_preference` and `customers.audience_preference` column
ALREADY existed (prompt called them "new") — nothing was created.

**Verified live (dev server, mobile):** direct `/` (empty referrer) → chooser shows
(screenshot); `/?fbclid=test` → NOT shown, session untouched; `/products/<slug>` → NOT
shown; logo click (client-side nav) to `/` → NOT shown; click "Shop new" → session='new',
overlay closes, stays on `/`; reload → does not reappear; click "Buy used" → session='used'
→ full-page nav to `/marketplace`.

## Renamed product slugs — old-URL redirect fallback (DONE, this turn)
17 product slugs were renamed in the DB to remove clinical wording from URLs
(`catheter` → `delivery-kit-tube-set`, `sterile-urinary-drainage-bag` →
`delivery-kit-collection-bag`, etc.; NAMES unchanged). Old URLs would 404. A public
RPC `resolve_product_slug(p_slug)` returns the current slug (or null).

**Fix (one file — [src/pages/ProductPage.tsx](src/pages/ProductPage.tsx)):** in
`useProduct`, when the slug AND id lookups both miss, call `resolve_product_slug`. If it
returns a slug that DIFFERS from the requested one, `useProduct` returns `{ redirectTo }`;
ProductPage then `navigate('/products/<current>', { replace: true })` (broken URL leaves
history). Guarded on `resolved !== slug` in BOTH `useProduct` and the effect → no loop.
While redirecting it holds the skeleton instead of flashing not-found. Unknown slug → RPC
null → existing not-found unchanged.

**Only ProductPage needed it.** Audited the other slug routes: `/package/:slug`
(landing_pages, not products), `/quote/:shareToken` + `/list/:token` (products by
`product_id`), `/hospital-list` (products by id), `/p/:slug` (CMS). None resolves a product
by slug, and all product links they render point at `/products/<current-slug>` and flow
through ProductPage's fallback anyway — so every entry point (bookmarks, shared quiz lists,
WhatsApp, Google) is covered by the single change.

**Verified (RPC + DB):** `catheter` → `delivery-kit-tube-set` (name still "Catheter",
active) → redirect lands on the Catheter page, not 404. `delivery-kit-tube-set` (current)
is found directly, no RPC/redirect. `hospital-list-tube-set` (an interim old slug) also
resolves to `delivery-kit-tube-set`. Unknown slug → null → not-found, no loop. NOTE: the
prompt's example targets (`hospital-list-*`) were an interim name; actual current slugs are
`delivery-kit-*` — the fix is RPC-driven so it lands correctly regardless.

## Meta pixel — clinical-signal removal (DONE, this turn)
Meta restricted the storefront pixel as "associated with medical conditions". Root
cause (from the prior audit): clinical product names reached Meta via (a) `content_name`
on ViewContent/AddToCart, (b) name-based product URLs on PageView, (c) `meta-catalog-feed`
shipping the whole clinical inventory. Two new admin-controllable DB flags now gate
ad-platform exposure only (items stay fully shoppable): `products.exclude_from_ad_platforms`
(54 active TRUE) and `bundles.exclude_from_ad_platforms` (9 TRUE).

**Four changes made:**
1. **Catalog feeds** — `meta-catalog-feed`: added `exclude_from_ad_platforms` to the embedded
   products select + an in-loop skip (`skippedAdExcluded` counter + `X-Skipped-Ad-Excluded`
   header). **727 feed rows before → 92 dropped (the 54 flagged products' brand/SKU rows) →
   635 remain.** `marketplace-meta-catalog-feed` **left unchanged** — it draws only from
   `marketplace_listings` (user-generated), never the `products` table, so 0 rows dropped.
2. **Storefront pixel — names removed**: dropped `content_name` from ViewContent
   ([ProductPage.tsx](src/pages/ProductPage.tsx), [BundleDetailPage.tsx](src/pages/BundleDetailPage.tsx))
   and AddToCart ([cart.tsx](src/lib/cart.tsx)). Events now send content_ids/content_type/value/
   currency only (matching Purchase). Applied to ALL products.
3. **Storefront pixel — suppressed for flagged items**: `adaptProduct`/`adaptBundle`
   ([supabaseAdapters.ts](src/lib/supabaseAdapters.ts)) now carry `excludeFromAds` (from the DB
   flag). ProductPage/BundleDetailPage fire NO ViewContent, and cart.tsx fires NO AddToCart,
   when the flag is true. Read from data already fetched (`products.*` / `bundles.*`).
4. **Marketplace pixel + CAPI — titles removed**: dropped `content_name` from ViewContent +
   both AddToCart pixel calls ([ListingDetailPage.tsx](src/marketplace/pages/ListingDetailPage.tsx)),
   from the 3 CAPI bodies, from the [metaConversion.ts](src/marketplace/lib/metaConversion.ts)
   type, and from `custom_data` in `send-meta-conversion-event`. Kept content_id, value,
   currency, and all hashed user-data matching (fbp/fbc/IP/UA/SHA-256 email+phone).

**Untouched (as required):** no slugs/URLs changed; quiz untouched (still clean — no
stage/hospital/delivery/c-section reaches Meta); Search `search_string` left as-is (could be
dropped safely but Meta still captures `?q=` from the URL, so it's only partial). Flagged
items remain fully visible and purchasable — the flag governs ad-platform data only.

**Residual clinical signal still reaching Meta (flagged for a follow-up, NOT in scope here):**
the **name-based product URLs** (`/products/catheter`, `/products/surgical-gloves`, …) are still
captured by PageView for flagged AND unflagged clinical items — suppressing events on flagged
PDPs stops ViewContent/AddToCart but not the PageView URL. De-clinicalising those slugs (a
separate task, explicitly out of scope) is the remaining lever.

**Edge-function deploy note:** repo copies of `meta-catalog-feed` + `send-meta-conversion-event`
are updated and byte-correct; MCP `deploy_edge_function` hit a harness serialization bug this
turn (verify_jwt/files coerced to strings), so they were deployed via the Lovable git-sync on
push to main (same mechanism that redeployed test-smtp→v27 in the gateway sweep). Verify with
`get_edge_function` that both reflect the changes; MCP-redeploy if git-sync lags.

## Lovable connector gateway is DEAD project-wide — ALL email fns migrated to direct Resend (COMPLETE)
- **Finding**: the Lovable connector gateway `https://connector-gateway.lovable.dev/resend/emails`
  (auth `Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${RESEND_API_KEY}`) returns
  `401 "Credential not found"` for EVERY call — its stored Resend credential is dead.
  EVERY older email-sender function used this pattern. The fix everywhere is identical:
  `fetch("https://api.resend.com/emails", { headers: { "Content-Type":"application/json",
  "Authorization": \`Bearer ${RESEND_API_KEY}\` }, body: {from,to,reply_to,subject,html} })`,
  removing `GATEWAY_URL`, the `LOVABLE_API_KEY` bearer and the `X-Connection-Api-Key` header;
  guard requires only `RESEND_API_KEY`. Templates/recipients/scheduling/staging/dedup/logging
  UNCHANGED everywhere. No cron touched.
- **Durability**: repo copies added for EVERY migrated fn (repo == deployed), so a Lovable
  git-sync redeploys the correct code. (Confirmed live: pushing the repo copy of `test-smtp`
  triggered a git-sync redeploy to v27 with the SAME `ezbr_sha256` as my MCP v26 — durable.)

### FINAL REPORT — every function checked (exhaustive scan of all 76 deployed fns)

**MIGRATED off the gateway this sweep (18 fns; all deployed + repo copy committed):**

| Function | Deployed v | Was on gateway? | Change |
|---|---|---|---|
| send-abandoned-cart | v36 | YES | direct Resend. (Confirmed LIVE bug: hourly cron retried forever — only stamps stage_sent after a successful send. **Verified working: returned `{success:true,processed:1,failed:0}`**.) |
| send-order-confirmation | v36 | YES | direct Resend |
| send-reorder-reminders | v32 | YES | direct Resend (renamed helper sendViaGateway→sendReorderEmail) |
| send-quote-email | v26 | YES | direct Resend (kept admin test-send guard) |
| send-new-order-notification | v17 | YES | direct Resend |
| send-hr-notification | v30 | YES | direct Resend (helpers renamed →sendViaResend) |
| send-task-daily-summary | v28 | YES | direct Resend |
| send-approval-notification | v26 | YES | direct Resend (kept gateway_status/response label keys) |
| send-daily-summary | v24 | YES | direct Resend |
| notify-quiz-lead | v24 | YES | direct Resend |
| send-subscription-admin-reminders | v17 | YES (VARIANT: `X-Lovable-Api-Key`/`X-Resend-Api-Key` scheme + misnamed RESEND_URL→gateway) | direct Resend |
| send-subscription-intro | v15 | YES | direct Resend |
| notify-abandoned-checkout | v7 | YES | direct Resend (WhatsApp outreach alert; email_send_log untouched) |
| test-smtp | v26→v27 | YES | direct Resend (kept open-relay security guard: service-role or active admin) |
| bundledmum-health-check | v22 | **YES — MISSED in the original list; caught by the exhaustive scan** | direct Resend (7am/7pm cron health email; all 9 checks + HTML + health_check_log untouched) |

  (Earlier in the same sweep, before this session: `send-transactional-email` v52 +
  `send-internal-order-notification` — see "Storefront order emails" section below.)

**DELIBERATELY LEFT ALONE (flagged, not email-via-gateway):**
- `invite-admin-user` — uses **Supabase auth invite** (`admin.auth.admin.inviteUserByEmail`),
  not the Resend gateway. No LOVABLE_API_KEY. Correct as-is.
- `send-box-topup-reminders` — **already clean**: dispatches via `send-transactional-email`
  (itself direct Resend); never touched the gateway.
- `check-resend-email-status` — **already clean**: read-only Resend status lookup
  (`GET api.resend.com/emails/{id}`), direct.
- The 13 `send-marketplace-*` / marketplace fns — **all already clean** (built later off
  `send-marketplace-email` = direct Resend). Senders POST direct to `api.resend.com`;
  the cron/orchestrator ones (marketplace-daily-emails, marketplace-seller-onboarding-sweep,
  marketplace-return-overdue-sweep, send-marketplace-notification, preview-marketplace-email)
  dispatch to those senders. None on the gateway.
- Already-clean storefront senders: `send-transactional-email`, `send-internal-order-notification`,
  `send-referral-email`.
- No function was found using LOVABLE_API_KEY for a NON-email (AI) purpose — the AI gateway
  (`ai.gateway.lovable.dev`) is not used anywhere; AI fns use ANTHROPIC_API_KEY / GEMINI_API_KEY.

**ZERO remaining active references confirmed (exhaustive scan of all 76 fns):**
`connector-gateway.lovable.dev` = 0, `X-Connection-Api-Key` = 0, LOVABLE_API_KEY-as-email-bearer = 0.
The substring `LOVABLE_API_KEY` now appears ONLY inside the past-tense migration comment
(`// Previously routed through the dead Lovable connector gateway with LOVABLE_API_KEY…`) in the
migrated fns — no live usage. The two just-migrated deployed versions (bundledmum-health-check v22,
test-smtp v27) were re-fetched and grepped clean.

## Referral free gift — shown in the checkout order summary (prior turn)
- **Why**: the chosen free gift was only visible inside the gift picker; she couldn't
  see it among her products before paying. (After the order, the DB trigger
  `trg_add_referral_gift_line` already turns it into a ₦0 `order_items` row for admin/
  fulfilment/email — this task is checkout-only.)
- **What**: added a DISPLAY-ONLY `referralGiftRowNode` in `src/pages/CheckoutPage.tsx`,
  rendered in BOTH order-summary layouts right after `{fipGiftRowsNode}` (mobile
  collapsible summary ~line 2392, desktop sidebar ~line 3036). Shows the gift image +
  "🎁 Free gift" label + product name + "FREE".
- **Shown only when** `partnerRefStatus === "valid" && !belowReferralMin && selectedGift`
  and the option resolves in `giftOptions`. It vanishes automatically when the gift is
  deselected, the code is removed, or the cart drops below the threshold (all already
  flip `selectedGift`/`belowReferralMin`).
- **Image source**: `giftOptions.find(...).imageUrl` — the same anon-safe
  `brands_public.stored_image_url` the gift picker uses (verified live: src is
  `…/storage/v1/object/public/product-images/…`, never an external `image_url`).
- **Totals unaffected — proven live**: grand total was **₦172,400** with the gift line
  shown AND after removing it (cart unchanged). The node reads state only; it is NOT in
  cart state (verified: `bm-cart` held only the product, never the gift) and NOT in the
  order payload's items (those derive from `cart`); `selected_gift_product_id` remains
  the separate, already-handled submission path. No remove/qty control on the line.
- **Verified live** (mobile + desktop): select gift → "🎁 Free gift / Breast Pump /
  FREE" line appears under the product, Subtotal/Total both ₦172,400; Remove → line
  gone, Total still ₦172,400. Screenshots taken. Only `src/pages/CheckoutPage.tsx`
  changed; no DB/RPC/edge/trigger changes.

## Referral gift — minimum order value gate at checkout (prior turn)
- **Why**: the DB trigger `stamp_order_referral_partner` reads `site_settings`
  `referral_min_order_naira` (fallback 150000) and, when the order **`NEW.total`** is
  below it, assigns NO partner and sets `selected_gift_product_id := NULL`. The
  frontend didn't know, so a sub-₦150k cart could apply a code, pick a gift, and get
  nothing — a broken promise. Fixed frontend-only (no DB/RPC/edge changes).
- **Threshold source**: `asInt(settings?.referral_min_order_naira, 150000)` via the
  existing `useSiteSettings()` (same pattern as `express_order_min_subtotal_naira`);
  falls back to 150000 if missing/unreadable. Never hardcoded.
- **Compared against**: `grand` (the displayed final Total, `grandWith(promoDiscount)`)
  — the SAME basis the DB uses (`orders.total`), so UI and DB never disagree.
  `belowReferralMin = grand < referralMinOrder`; `referralRemaining = max(0, min-grand)`.
- **Behaviour** (partner path ONLY; discount + coupon untouched):
  - Below threshold: code is ACCEPTED and HELD; message shows
    "✓ Referred by {name} — add {fmt(remaining)} more to unlock your free gift 🎁
    (minimum {fmt(min)})"; gift picker HIDDEN (`giftPickerEnabled =
    partnerRefStatus==='valid' && !belowReferralMin`, which also gates the options query).
  - Reaches threshold (add items): message auto-changes to
    "✓ Referred by {name} — pick your free gift below 🎁" and the picker APPEARS,
    reactively, with NO re-entry of the code.
  - Drops back below: picker hides again and an effect clears `selectedGift` +
    `clearSelectedGift()` so a stale gift can never be submitted.
  - Payload: `selected_gift_product_id` = `(partnerRefStatus==='valid' && selectedGift
    && !belowReferralMin) ? selectedGift : null` — always null below threshold.
- **Verified live** (single ₦21,550 line, qty driven via a `bm-cart` storage event so
  the code is never re-entered): qty 2 → ₦43,100 → "add ₦106,900 more … (minimum
  ₦150,000)", 0 gift buttons; qty 8 → ₦172,400 → "pick your free gift below", 19 gift
  buttons appear automatically; picked a gift (`bm_ref_gift` set); back to qty 2 →
  picker gone, `bm_ref_gift` cleared to null, code still `TESTMUM`. Screenshots taken.
  Only `src/pages/CheckoutPage.tsx` changed.

## Referral ?ref= capture — hardened the URL strip (prior turn)
- **Reported bugs**: (1) landing on `?ref=TESTMUM` then Add to Cart leaves the cart
  empty; (2) typing TESTMUM at checkout does nothing. Both claimed frontend.
- **Root-cause finding — NEITHER reproduces in the current branch code, proven:**
  - **Bug 1 is structurally impossible here.** `CartProvider` is mounted ABOVE
    `<BrowserRouter>` (StorefrontApp.tsx ~447 vs 449), so a router `setSearchParams`
    (inside the router) cannot remount CartProvider or reset the cart. `addToCart`
    uses a functional `setCart(prev => …)`; only `clearCart`/cross-tab-storage call
    `setCart([])`. Verified LIVE: land on `/shop?ref=TESTMUM`, add an item → cart
    holds it, `bm_ref_code=TESTMUM`, URL stripped, no reload (`window` probe
    survived, no `beforeunload`).
  - The "empty cart on a real click" I saw was an **automation artifact**: the dev
    preview's Supabase realtime WebSocket reconnect loop (`ERR_CONNECTION_CLOSED`)
    keeps the network busy so the click harness times out before dispatching —
    reproduces WITHOUT `?ref` too, so it is unrelated to the referral capture.
  - **Bug 2 works**: checkout prefill from `bm_ref_code` auto-validates on mount, and
    manual type+Apply of `TESTMUM` both show "Referred by Amara" + the 19-card gift
    picker (verified live). No shared root cause; the two are independent.
  - Likely the owner tested an older/stale production deployment.
- **Fix applied anyway (prompt-recommended hardening, zero downside)**:
  `ReferralCaptureListener` (StorefrontApp.tsx) now reads `?ref` straight off
  `window.location.search` and strips it with **`window.history.replaceState`**
  instead of the router's `setSearchParams` — so the URL rewrite triggers NO React
  re-render at all, permanently closing the hypothesised "rewrite disturbs cart/page
  state" class of bug. A `useRef` guard makes the capture + attribution RPC fire at
  most once (survives StrictMode double-invoke). Removed `useSearchParams`.
- **Ref IS still stripped** from the visible URL (via replaceState), preserving every
  other query param, the path and the hash (verified: `/shop?ref=TESTMUM&tab=baby` →
  `/shop?tab=baby`).
- **Untouched**: CheckoutPage (discount + coupon paths unchanged). Build passes.

## Referral programme emails — new send-referral-email function (prior turn, DEPLOYED)
- **New edge function `send-referral-email`** (v1, `verify_jwt:false`), repo copy at
  `supabase/functions/send-referral-email/index.ts`. Built from the DEPLOYED
  `send-internal-order-notification` v32 pattern (renderTemplate, direct-Resend send,
  site_settings recipient resolution). Repo == deployed, so a git-sync won't revert it.
- **Sends the four referral templates** by slug from `email_templates` (respects
  `is_active`), substitutes `{{vars}}` in subject + html, sends DIRECTLY to Resend
  (`https://api.resend.com/emails`, `Authorization: Bearer ${RESEND_API_KEY}` — NOT the
  dead Lovable gateway). Body: `{ email_type, partner_id | commission_id }`.
  1. `referral_partner_intro` (partner_id) → partner; stamps
     `referral_partners.intro_email_sent_at`.
  2. `referral_commission_earned` (commission_id) → partner; stamps
     `referral_commissions.partner_email_sent_at`.
  3. `internal_referral_costs_needed` (commission_id) → admin; stamps
     `referral_commissions.admin_notified_at`.
  4. `internal_referral_payday` (commission_id) → admin; stamps
     `referral_commissions.payday_reminder_sent_at`.
- **Variable building**: first_name/partner_name = `referral_partners.first_name`
  (fallback email local part); amounts (`commission_amount`,`order_total`) formatted
  with thousand separators and NO ₦ (templates already print it); `payment_date` =
  `payable_on` as "Monday 25 August 2026" (en-GB, no comma); bank_* from
  `marketplace_sellers` via `referral_partners.seller_id`.
- **payout_line differs by partner type**: seller WITH a bank account →
  "Paid into the account you registered with, ending {last4}."; buyer OR no bank on
  file → "We will ask for your account details the first time you earn…". Buyers are
  NEVER asked for bank details and never shown a partial account.
- **whatsapp_share_url** (copy refreshed, deployed v5): warmer, gift-led 6-paragraph
  message, real line breaks, `encodeURIComponent`'d onto `https://wa.me/?text=`.
  `buildWhatsappShareUrl(code)` now takes ONLY the code — `{first_name}` was dropped
  from the message body (the sender is the sharer; naming themselves read oddly) but
  `first_name` stays in the `vars` object for the email templates. Contains
  `https://bundledmum.com/quiz?ref={code}` and "(Gifts apply on orders from ₦150,000.)".
  Verified encoding: `₦`→`%E2%82%A6`, 💚→`%F0%9F%92%9A`, 🎁→`%F0%9F%8E%81`, ref present.
- **Auth (FIXED — was a 401 bug)**: the original guard compared the bearer to
  `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. But the DB triggers/cron authenticate
  with the **Vault** secret `service_role_key` (a valid service_role JWT), which is a
  DIFFERENT string from that env var — so the legitimate caller was wrongly rejected
  with 401. `send-internal-order-notification` "works" only because it has NO bearer
  check at all. Fix: authorise on the bearer's **JWT `role` claim** — allow
  `service_role`, reject the public anon key (role `anon`) and any non-JWT/missing
  token. Robust across which service_role key string is used, still rejects anon.
  Verified LIVE via `net.http_post`: the real vault service_role JWT → past auth
  (400 "missing email_type" on an empty test body), a non-JWT bearer → 401. `jwtRole`
  helper decodes the JWT payload (unverified decode is enough to tell service_role
  from anon; `verify_jwt` stays false). Repo == deployed (v3), so a git-sync keeps it.
- **Duplicate protection**: before sending, skips if the relevant stamp column is
  already set OR a `marketing_email_log` row exists for this id + email_type. After a
  successful send it stamps the column AND inserts `marketing_email_log`
  (`customer_email, email_type, order_id, sent_at, metadata{partner_id/commission_id/
  referral_code}`).
- **Internal recipients**: reuses the existing resolution — `site_settings`
  `order_manager_email` → `fulfilment_manager_email` → first active super_admin. No
  hardcoded address (the prompt didn't name a bucket; order_manager fits referral
  finance emails).
- **NOT scheduled** (no cron, per instruction). NEXT: user runs a live admin-only test
  invoke with the service-role key, e.g.
  `{ "email_type": "referral_partner_intro", "partner_id": "<uuid of TESTMUM partner>" }`.

## Checkout referral — TWO inputs merged into ONE (prior turn)
- **Problem**: checkout had two separate referral inputs (discount vs partner);
  customers put a code in the wrong box, saw an error, and abandoned.
- **Merged** both into ONE "🎁 Have a referral code?" block in
  `src/pages/CheckoutPage.tsx`. Coupon block is untouched (separate, third thing).
- **Resolve order on Apply** (`applyReferral`): try PARTNER first
  (`validate_referral_partner_code`, case-insensitive via `normalizeCode`) → on
  valid, clear any discount, show "✓ Referred by {first_name} — pick your free gift
  below 🎁", reveal the gift picker, set partner payload fields (unchanged). Else try
  DISCOUNT (`validate_referral_code`, 4-arg overload, CASE-SENSITIVE) trying the code
  exactly as typed then uppercased → on valid, clear partner/gift state, apply the
  discount as before ("✓ {amount} off applied"). Mutually exclusive with a coupon and
  needs an email (both preserved). Else one gentle non-blocking message
  ("We could not find that code. You can still complete your order.").
- **Refinement**: `validate_referral_code` returns `{valid:false,message}` for a REAL
  code blocked by a rule (e.g. "Minimum order of ₦10000 required…") vs
  `message:"Invalid referral code"` for an unknown code. The merged handler surfaces
  the specific reason (toast) and only shows the generic gentle message when the code
  is genuinely unrecognized — preserving the old discount UX.
- **State**: single `refInput` (prefilled from `bm_ref_code`), unified
  `referralLoading`, `refNotFound`; kept `appliedReferral` (discount → totals +
  `referral_code_used`) and `partnerRefStatus`/`selectedGift` (partner →
  `selected_gift_product_id`). Removed `referralCode`/`checkPartnerRef`; `partnerRef`
  renamed to `refInput`. The input no longer force-uppercases, so the
  exact-then-uppercased discount attempt is meaningful. `clearReferral` (Remove)
  resets BOTH paths, totals, gift picker and localStorage (`bm_ref_code`,`bm_ref_gift`).
- **Overload note**: the prompt cited `validate_referral_code(p_code) → {id,code,
  is_active}` (a real 1-arg overload). Checkout uses the 4-arg overload returning the
  computed `discount_amount` + message; kept that to preserve the discount amount and
  order/email/phone validation exactly as today.
- **Verified live** (cart bumped to ₦10,800 to clear the ₦10k discount minimum):
  one input, both old blocks gone; partner `TESTMUM`/`testmum` → "Referred by Amara"
  + 19-card gift picker, no discount; lowercase discount `bm-af5ea1` → "✓ ₦2,000 off
  applied", total ₦10,800→₦8,800, picker hidden; unknown code → gentle message, not
  blocked; Remove → full reset (total back, localStorage cleared); mutual exclusion
  both ways; coupon block usable under a partner referral, blocked under a discount.

## Marketplace partner referral — gift now PERSISTED + image source fixed (prior turn)
- **Gift persistence (the earlier GAP, now closed)**: `orders.selected_gift_product_id`
  (uuid, nullable, FK products.id) now exists, guarded server-side by
  `trg_guard_referral_gift` (nulls the value if the order has no `referral_partner_id`
  or the product is not an ACTIVE `referral_gift_options` row; never fails the order).
  Added `selected_gift_product_id` to the checkout `order:` payload in
  `src/pages/CheckoutPage.tsx` (next to `referral_code_used`), set to
  `(partnerRefStatus === "valid" && selectedGift) ? selectedGift : null` — the chosen
  gift only when a valid partner code is attributed, else null (never send a stale
  localStorage choice). It flows through `place-order`'s `{...safeOrder}` insert.
  `localStorage['bm_ref_gift']` stays as a convenience copy; the payload is now the
  source of truth.
- **Gift image source CORRECTED (bug fix in `useReferralGiftOptions`)**: the prior
  turn joined `brands.stored_image_url`, but the base `brands` table is RLS-restricted
  to admins ("Admin read brands" policy) — anon checkout users read nothing, so every
  gift showed the 🎁 placeholder. Fixed to read the anon-safe PUBLIC view
  **`brands_public`** (`product_id, stored_image_url`), which the storefront catalog
  already uses. Verified: all 19 active gift products resolve a Supabase-stored image
  via `brands_public`.
- **Verified live with QA code `TESTMUM` (validates as "Amara")**: "✓ Referred by
  Amara" shows, the gift picker renders 19 cards WITH images (Supabase storage URLs,
  not external), selection is single (clicking a second gift replaces the first,
  `bm_ref_gift` updates), and both payload inputs (`partnerRefStatus === "valid"` +
  `selectedGift`) are satisfied so the payload carries the chosen `product_id`. The
  existing "🎁 Referral Code" discount block is unchanged. (Did not place a real test
  order to avoid polluting production orders / firing internal emails; the payload
  field is deterministic from the two verified state inputs.)

## Marketplace partner referral — storefront FRONTEND (prior turn, BUILT)
- **Scope**: frontend only. All DB work (RPCs, tables) is deployed and untouched.
- **RPCs used** (all anon-callable, via the `(supabase as any).rpc(...)` cast):
  `record_referral_attribution(p_code, p_visitor_id, p_email, p_source)` and
  `validate_referral_partner_code(p_code)` → rows of `{ is_valid, first_name }`.
  Tables read for the gift picker: `referral_gift_options` (19 active) joined to
  `products` (name) and `brands` (representative `stored_image_url`).
- **A) `?ref=` capture (every storefront route)**: new `ReferralCaptureListener`
  in `src/StorefrontApp.tsx` (null-render, mounted beside `PasswordRecoveryListener`
  inside `<BrowserRouter>`). Reads `?ref=`, normalizes (upper/trim), stores a stable
  `bm_visitor_id` uuid (reused if present) + `bm_ref_code` in localStorage, calls
  `record_referral_attribution(source:'link')` best-effort, then strips `ref` from
  the URL via `setSearchParams(replace:true)`. New helper `src/lib/referral.ts`
  (mirrors `landingOrigin.ts`: safe wrappers + `makeUuid`; keys `bm_visitor_id`,
  `bm_ref_code`, `bm_ref_gift`). Verified live: capture, uppercase, visitor-id
  REUSE across navigations, URL strip, no console errors.
- **B) Referral field at CHECKOUT ONLY** (user decision — there is NO customer
  "quote request form" in the app; `QuotePage` is a read-only viewer with no email
  field, so the quote side was dropped). New block in `src/pages/CheckoutPage.tsx`
  ("🤝 Referred by a seller or friend?"), DISTINCT from the pre-existing "🎁 Referral
  Code" DISCOUNT field (`validate_referral_code`) which is left untouched. Prefilled
  from `bm_ref_code`; validates on mount + blur via `validate_referral_partner_code`;
  shows "✓ Referred by <first_name>" on valid, a gentle non-blocking message on
  invalid. When the email is known it also calls
  `record_referral_attribution(p_email, source:'manual')` (order is matched by email
  server-side) — fired on successful validation and on the email field's blur.
  Verified live: field renders, prefill works, invalid path shows the gentle message
  and does NOT block submit.
- **C) Free-gift picker**: `src/components/checkout/ReferralGiftPicker.tsx` +
  `src/hooks/useReferralGiftOptions.ts`. Appears ONLY when a partner code validates
  (`enabled` gate). Card grid, single-select, product image from a representative
  `brands.stored_image_url` (never `image_url`), no prices. The valid-path render
  could not be exercised live because `referral_partners` is currently EMPTY (no
  codes exist yet) — data state, not a defect; the options query is verified via SQL
  (19 options, images resolvable).
- **GAP REPORTED — gift not persisted to the order**: there is NO `orders` column
  (or `referral_attributions` column, or RPC) to store the chosen gift. `place-order`
  inserts `{...safeOrder}` directly, so adding an unknown `selected_gift_product_id`
  would make the order insert FAIL and break checkout. Per instruction (do not invent
  a column; DB out of scope), the choice is persisted CLIENT-SIDE ONLY in
  `localStorage['bm_ref_gift']`. To record it against the order later, add a column/
  RPC (DB task), then include the field in the checkout `order:` payload
  (CheckoutPage ~line 1583) — it will flow through `place-order` untouched.
- **Files**: `src/lib/referral.ts`, `src/hooks/useReferralGiftOptions.ts`,
  `src/components/checkout/ReferralGiftPicker.tsx` (new);
  `src/StorefrontApp.tsx`, `src/pages/CheckoutPage.tsx` (edited). Build passes; tsc
  clean on these files (the only tsc error is pre-existing in
  `src/marketplace/checkout/CheckoutPage.tsx`, unrelated).

---

## Storefront order emails — gateway auth FIXED + DEPLOYED (this turn)
- **Symptom**: storefront/order emails failed with `gateway_status 401,
  "Credential not found"`, while marketplace emails sent fine (`sent:true`).
- **Root cause**: the two storefront email edge functions
  (`send-transactional-email`, `send-internal-order-notification`) sent through
  the **Lovable connector gateway** (`https://connector-gateway.lovable.dev/resend/emails`,
  `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${RESEND_API_KEY}`).
  That gateway's stored Resend connector credential is stale/missing → 401. The
  working marketplace functions (`send-marketplace-email` etc.) **never use the
  gateway** — they POST **directly to Resend** (`https://api.resend.com/emails`,
  `Authorization: Bearer ${RESEND_API_KEY}`). (NB: the original task framing said
  the storefront functions "authenticate to the gateway differently" than
  marketplace — actually marketplace doesn't touch the gateway at all, so the fix
  is to move storefront OFF the gateway to direct Resend, matching marketplace.)
- **Fix (auth/credential only — templates, payloads, recipients UNCHANGED)**:
  both functions now `fetch("https://api.resend.com/emails", { headers: {
  "Content-Type": "application/json", "Authorization": \`Bearer ${RESEND_API_KEY}\` }})`;
  removed the `LOVABLE_API_KEY` bearer, the `X-Connection-Api-Key` header, and the
  `GATEWAY_URL`; the startup guard now requires only `RESEND_API_KEY`. Request body
  (from/to/reply_to/subject/html) is byte-identical to before.
- **First deploy (MCP)**: `send-transactional-email` → v50,
  `send-internal-order-notification` → v30. Both verified direct-Resend at deploy time.
- **THEN IT REVERTED (critical lesson)**: a live admin test send still returned the
  `connectors_gateway` 401. Re-fetch showed `send-transactional-email` was back at
  **v51 = the STALE gateway version**, and `send-internal` at **v31**, both with the
  SAME `updated_at` and repo-style `entrypoint_path`
  (`.../source/supabase/functions/<name>/index.ts`). Diagnosis: **pushing commit
  `8a78927` to `main` triggered Lovable's git-sync, which redeployed the whole
  `supabase/functions/*` tree FROM THE REPO.** `send-internal`'s repo copy was my
  fixed one → its redeploy (v31) stayed correct. But I had left
  `send-transactional-email`'s repo copy STALE (gateway-based) → its redeploy (v51)
  clobbered my v50 fix. So **a git push re-reverts any MCP-only edge-function fix
  whose repo copy is not also fixed.** The repo copy — not the MCP deploy — is the
  durable source of truth.
- **Durable fix (this turn)**: rewrote the REPO
  `supabase/functions/send-transactional-email/index.ts` to the FULL correct version
  (direct Resend + admin test-send guard + `check_email_rate_limit` + free-items
  promo rendering — nothing regressed), then redeployed via MCP →
  **send-transactional-email v52**. Re-fetched + grepped v52: `RESEND_URL =
  https://api.resend.com/emails`, single send path on it, ZERO
  `connector-gateway.lovable.dev` / `GATEWAY_URL` / `X-Connection-Api-Key` /
  `LOVABLE_API_KEY`, all features intact. `send-internal` v31 already correct
  (repo + deployed). Now **repo == deployed == correct for BOTH**, so a future
  git-sync redeploys the correct code instead of reverting it.
- **Rule for next time**: to fix a Lovable-managed edge function durably you must
  (1) fix the REPO copy AND (2) deploy via MCP. Fixing only via MCP is undone by the
  next push. Still pull the deployed source via `get_edge_function` before editing,
  because the repo copy may lag what Lovable deployed.
- **NEXT (user action)**: re-run the live **admin-only** test send (order_confirmation)
  to confirm `sent:true` / `recipients_succeeded:1` (test sends require the
  service-role key or a signed-in active admin, per the security guard). If Lovable
  later auto-redeploys from the repo, it now deploys the correct version.

---

# Free Items Promo — Handoff

## Goal
Show the free-items promo (converted/added gift items, countdown, free delivery,
discount) consistently and with correct payable math across the whole funnel a
customer travels, so what they see while shopping matches what they are charged.

## Current state (what's wired, per prior sessions)
- **Admin config**: `/admin/quote-promo` (`QuotePromoAdmin.tsx`) — tiers, live promos, landing-page tier assignment.
- **Admin quote editor**: `AdminQuotes.tsx` `FreeItemsPromoBanner` (tier-aware apply), totals promo line, `QuoteProfitPanel` line.
- **Customer quote page**: `QuotePage.tsx` via `QuoteItemsCard` `ReadOnlyRow` — gift items struck, countdown, discount line. Correct.
- **Order surfaces**: `AdminOrders.tsx` + `OrderConfirmedPage.tsx` show gifts + promo discount post-conversion.
- **Landing page**: `PackagePage.tsx` — reactively upserts a funnel quote once cart ≥ ₦150k (shared `getSessionKey()`), fetches it via `get_landing_page_share_token` → `useQuoteByShareToken`/`useQuoteItemsByShareToken`, shows countdown + gifts + free delivery. Converted-gift value subtracted from `liveTotal`; per-row free treatment in `EditableRow` (via `freeQuantity`); totals deduction line.
- **Checkout**: `CheckoutPage.tsx` — same reactive upsert + fetch; converted gifts subtracted inside `grandWith` (flows to Paystack charge + `order.total`, verified against `verify-payment`); per-row "N free"/struck annotation; free delivery via `delivery_fee_override===0`.
- **Key distinction (live)**: `quote_items.is_promo_gift` + `added_for_promo`. CONVERTED (`is_promo_gift && !added_for_promo`) = existing cart item made free → subtracted from client payable. ADDED (`added_for_promo`) = genuine bonus, never in cart → never subtracted, shown in a "bonus items" block.

## Active files
`src/pages/{PackagePage,CheckoutPage,QuotePage,OrderConfirmedPage}.tsx`,
`src/pages/admin/{AdminQuotes,AdminOrders,QuotePromoAdmin}.tsx`,
`src/components/quote/{QuoteItemsCard,QuotePromoCountdown}.tsx`,
`src/hooks/useQuoteShare.ts`, `src/lib/landingOrigin.ts`.
Backend (already live, do not modify): `upsert_landing_page_quote`,
`get_landing_page_share_token`, `get_quote_by_share_token`,
`get_quote_items_by_share_token` (returns `is_promo_gift` + `added_for_promo`),
`apply_free_items_promo`, `free_items_promo_tier*` tables/views.

## Changes made (this diagnostic turn)
**None. Read-only investigation.** No source files modified. Only this handoff.md created.

## /cart investigation findings (this turn)
- **`/cart` → `src/pages/CartPage.tsx`** (`App.tsx:343`). ~1147 lines.
- **`?share=<token>` on /cart is NOT a quote share_token.** It is a **shared_carts** token: `CartPage.tsx:180` `params.get("share")` → `fetchSharedCart(token)` (`src/lib/sharedCart.ts`) → `get_shared_cart` RPC → reads the `shared_carts` table (`id, share_token, cart_payload, view_count, last_viewed_at, created_at, expires_at`). It hydrates a raw cart payload (items only). Generated by `create_shared_cart` (a "share my cart via short link" feature).
- **Confirmed in DB**: the customer's token `cdc3-123c-c0ad` exists in `shared_carts` (1 row) and NOT in `quotes` (0 rows). That is why the direct `quotes.share_token` lookup found nothing — different table, different concept.
- **CartPage has ZERO promo/quote wiring**: no `free_items_promo`, `is_promo_gift`, `upsert_landing_page_quote`, `get_landing_page_share_token`, or `useQuoteByShareToken`. So "promo not visible on /cart" is a **GAP (never wired), not a regression.**
- **Funnel**: `PackagePage` → `navigate("/checkout")` **directly** (`confirmAndCheckout`, PackagePage.tsx:627). It does not route through `/cart`. `/cart` is a general/alternate shopping-cart page with its own "Proceed to checkout" → `/checkout`.
- **Why it may not "carry through" to checkout**: CheckoutPage's promo depends on `isCartLandingSourced(cart)` (landing origin in `localStorage['bm-landing-origin']`, set by PackagePage) + the shared `bm-session-key`. Hydrating a **shared-cart** link (especially cross-device) replaces the cart but does not set the landing origin, so `saveLandingQuote` would not fire → no quote → no promo at checkout either. (Analysis only — not verified end-to-end this turn.)

## Failed attempts
- None this turn. (Earlier: point-3 "subtract discount like QuotePage" was rejected because CheckoutPage/PackagePage subtotals exclude gifts; resolved via the converted-vs-added distinction.)

## QuotePage: loading state now uses the standard loading screen (VISUAL)
- Swapped the line-skeleton placeholder inside QuotePage's loading branch for the
  site-standard `BMLoadingAnimation` (`src/components/BMLoadingAnimation.tsx`, the
  heart-logo loader used on ComingSoon/Checkout/GiftResults/HomeQuiz/AdminLayout),
  centered full-screen, size 180, no message.
- The loading CONDITION is unchanged — still
  `(shareToken && !viewSettled) || quoteQ.isLoading || itemsQ.isLoading` (the prior
  session's timing fix). Only the JSX inside it changed. record_quote_view /
  viewSettled / query-enabling untouched.
- Verified live: sampled the loader mid-wait (loading_screen_was_shown=true) then
  the quote rendered; on a real full-page load the countdown still appears (3dea).

## QuotePage: countdown now appears on first open (BUG FIXED)
- Bug: on first load of a shared quote, the countdown/free-item display only
  appeared after a manual refresh. Cause was SEQUENCING: the quote data queries
  (useQuoteByShareToken/ItemsByShareToken) fired on mount IN PARALLEL with the
  fire-and-forget `recordQuoteView`, so they read the pre-view state ('applied',
  no expires_at) before record_quote_view flipped it to 'active'. Refresh worked
  only because the prior load had already flipped the DB.
- Fix (QuotePage.tsx only): gate the queries on a new `viewSettled` flag — pass
  `undefined` (query disabled) until `recordQuoteView(shareToken).finally(() =>
  setViewSettled(true))` resolves, then fetch the current (post-view) state. Also
  extended the loading gate to `(shareToken && !viewSettled) || isLoading` because
  a DISABLED react-query reports isLoading===false and would otherwise fall
  through to "Quote not found" during the wait. record_quote_view's own
  logic/signature is UNCHANGED — only its relationship to the fetch.
- No flash: the existing skeleton shows during the ~1-RPC wait, then the correct
  active state renders directly. DO NOT reintroduce a parallel mount-time quote
  fetch on this page — it must stay gated behind record_quote_view settling.
- Verified live on an 'applied' quote (BMQ-20260730-005): countdown shown on
  first load, no refresh; DB flipped applied→active with expiry set.

## QuoteProfitPanel: combined "Discount Applied" (BUILT)
- The panel's "Discount Applied" row now shows discount_amount +
  free_items_promo_discount as one figure; the separate "Free items promo" row
  (added earlier) is removed. A subtitle "includes ₦X free items promo" shows
  when the promo portion > 0 (mirrors the Other Cost note pattern).
- Display only: net_profit and margin_pct are unchanged (straight from
  get_quote_profit, which already subtracts both server-side). No backend change.
  The Klump ceiling's netProfit0 (net_profit + discount_amount) was left as-is —
  it's a separate zero-discount-basis calc, not the display.

## Quote editor: mark items free inline (BUILT)
- `QuoteLineItemCard` (PackageItemsBuilder) now shows an optional "Mark free" /
  "Unmark free" text button per row (matches the existing Remove text-button
  style), via a new OPTIONAL `giftControl` prop. Mark → `add_free_items_promo_item`
  with the row's brand_id + FULL current quantity (RPC converts an existing paid
  line); unmark → `remove_free_items_promo_item` by quote_items.id. Cap/threshold
  rejections shown verbatim; refetch on success updates the row + banner cap.
- Eligibility is single-source: extracted `useActiveFipTiers()` hook +
  `offeredTierFor()` / `giftMarkingTier()` helpers in AdminQuotes.tsx. The banner
  now uses them (behavior-identical) and QuoteEditor uses them for the row
  control (`rowGiftControl`), so both derive the tier from the same query+ladder.
  Control appears only when `canEdit && giftMarkingTier(...) != null` (applied/
  active → started tier; null → offered tier; expired/cancelled → none) and the
  row has a brand_id or is already a gift.
- Additive-safe: AdminLandingPages' PackageItemsBuilder mount passes no
  giftControl → undefined → no toggle → unchanged (landing items also have no
  is_promo_gift column). FreeItemsPromoBanner picker unchanged.

## Gift-display coverage — both admin gaps CLOSED (BUILT)
- **Gap 1 (quote editor main list)**: `QuoteLineItemCard` in
  `PackageItemsBuilder.tsx` now strikes the line total (`text-red-600
  line-through`) + shows the existing red "Free gift" pill
  (`bg-red-100 text-red-700 border border-red-300 … text-[9px] uppercase`, same
  as AdminOrders detail) when `it.is_promo_gift` is true. Purely additive: it
  reads an OPTIONAL field on the raw item; the other mount
  (AdminLandingPages.tsx:350) feeds `landing_page_items`, which has NO
  is_promo_gift column (verified in DB) → undefined → byte-identical rendering.
  PasteListMatcher only imports helpers, not a mount.
- **Gap 2 (orders list)**: `get_admin_orders` now returns
  free_items_promo_tier/discount/delivery_granted per row + is_promo_gift per
  item (verified live — was absent before). Added a "🎁 Free items" pill on any
  row where `free_items_promo_discount > 0`, on both the desktop table
  (AdminOrders.tsx Status cell, `bg-red-100 text-red-700` matching the
  Quiz/Direct/PICKED pills) and the mobile `AdminOrderCard` bottom badge row
  (same style, `text-[10px]`). List-level only; the detail view/query untouched.

### Gift-display coverage audit (original diagnostic — now resolved above)
Two genuine gaps found for admin-side gift visibility (customer/order/email
surfaces are known-good and unchanged):
1. **Quote editor MAIN item list = GAP.** The editor's full item list renders
   via `PackageItemsBuilder` (mounted AdminQuotes.tsx:2329; `items` memo at
   AdminQuotes.tsx:1750 passes ALL quote_items unfiltered, gifts included).
   `PackageItemsBuilder` has NO `is_promo_gift` awareness — `LineItemCard` shows
   `line_total` at full price (PackageItemsBuilder.tsx:314); the only
   `line-through` is for out-of-stock size options (line 92), the only "gift" is
   the "Gift Items" SECTION label. So a gift row (is_promo_gift=true, full
   line_total, e.g. ₦23,100) looks like a normal paid line; the ONLY free-ness
   cue is the separate FreeItemsPromoBanner box. An admin scanning the main list
   can't tell which lines are free without cross-referencing the banner.
2. **Orders LIST page = GAP, and data not even available.** The orders table
   (desktop AdminOrders.tsx:753-810 + mobile AdminOrderCard) has badges for
   Express/PICKED/Subscription/Quiz/Direct and gift-WRAPPING (🎀, separate
   feature) but NO free-items-promo/gift indicator. The list is powered by the
   `get_admin_orders` RPC, which does NOT return free_items_promo_discount /
   free_items_promo_status / is_promo_gift (verified) — so a per-row badge would
   need that RPC extended (DB change), not just frontend.
   The promo display exists ONLY in the single-order DETAIL expansion
   (gift badge on items AdminOrders.tsx:1610, struck price 1624, "Free items
   promo" totals line 1645-1648, via the detail query at :430) — known-good,
   reads is_promo_gift/free_items_promo_discount generically, unaffected by the
   switch to manual picking (assumption confirmed).
Nothing built this turn; awaiting decision on whether to close either gap.

## Admin promo — dynamic tier eligibility (BUILT — bug fix)
- **Bug**: `FreeItemsPromoBanner` (AdminQuotes.tsx) hardcoded eligibility to
  tier_500k/tier_300k and hardcoded the tier label the same way, so a new
  `tier_100k` (and any future tier from the "New tier" button) never showed.
- **Fix (fully generic, no tier-key special-casing anywhere)**: one query for
  `free_items_promo_tiers` where `is_active=true` ordered by `threshold` desc
  (`select tier_key,label,cap,threshold`). `offeredTier` = first row whose
  threshold `realSubtotal` meets (highest qualifying); none → no banner.
  `labelForTier(key)` and `capForTier(key)` look up the fetched rows (label
  falls back to the raw key for a since-deactivated tier). Verified vs live DB:
  500k/300k/100k all resolve; ₦120k subtotal now offers tier_100k.
- **Confirmed already generic (unchanged)**: the picker / cap / add / remove
  flow passes whatever tier string is offered (`offeredTier` or
  `quote.free_items_promo_tier`) to `add_free_items_promo_item`; remove uses only
  `p_item_id`; started-state cap reads `quote.free_items_promo_cap`.
- **Rule for next time**: never hardcode tier keys/thresholds/labels in the
  banner — always read `free_items_promo_tiers`.

## Admin promo — manual item-gifting (BUILT prior turn)
- **Model change**: the one-click "Apply free items promo" (fixed SKU list) is
  retired; `apply_free_items_promo` is **dropped from the DB**. Admins now gift
  catalog items one at a time up to the tier cap.
- **File**: `FreeItemsPromoBanner` in `src/pages/admin/AdminQuotes.tsx` (only
  file changed). Added a local `GiftItemPicker` (replicates the products search
  from PackageItemsBuilder / QuotePromoAdmin's AddItemSearch).
- **RPCs**: `add_free_items_promo_item(p_quote_id,p_tier,p_brand_id,p_quantity=1)`
  (first call starts the promo: validates threshold, snapshots cap/timer, grants
  delivery if the tier does, then adds; enforces cap; converts-vs-adds server-side)
  and `remove_free_items_promo_item(p_quote_id,p_item_id)` (clears promo if it was
  the last gift). Both messages shown **verbatim** on failure (no client-side cap
  pre-validation).
- **States**: null+eligible → "qualifies for up to ₦{cap} ({tier})" + picker
  (first add starts it). applied/active → **unchanged status line** + "₦X of ₦Y
  used" + gift list with per-row remove + picker to add more (same tier).
  expired/cancelled → muted reverted line (cancelled was previously unhandled →
  now covered). Quantity: a picker input (default 1) → `p_quantity`.
- **Refetch**: every add/remove calls `onApplied()` (refetchQuote), so summary,
  list and the totals discount line / QuoteProfitPanel (unchanged, read
  `free_items_promo_discount` generically) all update.
- Tiers: `tier_500k` cap ₦50,000 / `tier_300k` cap ₦17,000 (`free_items_promo_tiers`).
- Not browser-verified (admin is auth-gated); RPCs confirmed live, tsc/lint/build pass.

## Quiz suggested-budget — BUILT (this turn)
- **What changed**: `src/hooks/useBudgetSuggestions.ts` now overrides the three
  budget-card AMOUNTS with engine-accurate values. Labels, sub-copy, ordering,
  the note, and tap-to-`setBudget` are unchanged. `HomeQuiz.tsx` untouched (same
  hook return shape). Only consumer is `HomeQuiz.tsx:420`.
- **RPC now used**: `suggest_quiz_budget(p_scope, p_stage, p_budget_tier, p_gender,
  p_multiples, p_hospital_type)` → bigint (naira, rounded to ₦5,000), called once
  per tier (starter/standard/premium) in parallel, keyed by scope+stage (never
  refetches as she types). Cards still get labels/sub/note/fallback amounts from
  the existing `quiz_budget_suggestions` RPC.
- **Defaults passed** (gender/multiples/hospital aren't answered at the budget
  step): `p_gender='neutral'`, `p_multiples=1`, `p_hospital_type='both'` — same
  defaults `quiz_budget_suggestions` already uses.
- **Tier mapping**: each card's `brand_tier` (already 'starter'/'standard'/
  'premium') is passed straight in as `p_budget_tier`.
- **Fallback**: each tier call resolves to null on error/non-positive; that card
  keeps its `quiz_budget_suggestions` amount. No blank cards, quiz never breaks.
- **Verified**: `suggest_quiz_budget` is engine-floor-derived and verified to
  always build a within-budget complete list. Live on /quiz (hospital-bag,
  expecting): cards now show ₦245k / ₦290k / ₦450k (were 180k / 305k / 620k).

## Quiz suggested-budget investigation (superseded by the BUILT section above)
Goal was: replace the quiz's "frontend budget calculation" on the budget step
with the new `suggest_quiz_budget(p_scope,p_stage,p_budget_tier,p_gender,p_multiples,p_hospital_type)` RPC.
Audit found two blocking mismatches, so nothing was changed:
1. **No frontend budget calculation exists to replace.** The budget-step
   suggestions already come from a backend RPC — `quiz_budget_suggestions`
   (plural), via `useBudgetSuggestions` (`src/hooks/useBudgetSuggestions.ts`),
   rendered as 3 low/mid/high cards in `HomeQuiz.tsx` (~line 699). The only
   frontend budget values are `DEFAULT_BUDGET = 0` (empty placeholder, not a
   suggestion) and `minBudget` (a floor from `site_settings.quiz_min_budget`).
   `budgetTiers.ts` only classifies an amount→tier; it does not estimate cost.
2. **The new RPC's inputs aren't available at the budget step.** Step order
   (`baseSteps`, HomeQuiz.tsx:538-542): scope → [stage] → [babyScope] →
   **budget** → gender → (dynamic: multiples, hospitalType, …). At the budget
   step only **scope** and **stage** are answered. **gender, multiples,
   hospitalType come AFTER budget**, and **tier is derived from the budget
   amount** (`budgetTierFor(budget)`) — circular. The existing
   `quiz_budget_suggestions` call already sends engine defaults (hospital=both,
   delivery=both, multiples=1) for exactly this reason.
Needs a product decision before building (see Next steps 5-6).

## Next steps (to decide/build — NOT done)
1. Decide whether `/cart` should participate in the promo at all, or stay a plain cart. It currently has no connection to the quote/promo system.
2. If yes: decide how a landing-sourced cart's promo should survive a shared-cart hydration (landing origin is not carried by `shared_carts.cart_payload`; consider persisting/restoring landing origin, or upserting a quote from /cart when the cart qualifies + is landing-sourced).
3. Clarify the intended funnel: is `PackagePage → /cart → /checkout` a supported path, or only `PackagePage → /checkout`? The promo wiring currently assumes the latter.
4. Consider whether cross-device shared links should ever show the promo (session key + landing origin are per-browser).
5. **suggest_quiz_budget**: decide whether the tailored RPC should drive the budget-step suggestion given gender/multiples/hospital aren't answered yet there (send engine defaults like `quiz_budget_suggestions` does? move the budget question after those? show it later?).
6. **suggest_quiz_budget / tier**: the RPC needs `p_budget_tier`, but tier is derived from the budget amount — decide whether to call it once per tier (starter/standard/premium) to produce the 3 cards, or use a single assumed tier.

## BNPL nav links hidden (not deleted)
- "Buy Now Pay Later" (route /pay-later, page PayLaterPage) links are HIDDEN from
  all three nav surfaces via a `const SHOW_BNPL_NAV: boolean = false;` feature flag
  in each of Navbar.tsx (desktop Link + mobile flat-links array) and Footer.tsx
  (Help group). Set both flags back to `true` to restore when the in-house
  pay-small-small launches.
- The route and page are UNTOUCHED and still directly reachable:
  StorefrontApp.tsx:345 `/pay-later` + :346 `/buy-now-pay-later` → `/pay-later`
  redirect. Any direct link or running ad still works.
- Note: origin/main was refactored — App.tsx now delegates to StorefrontApp.tsx
  (marketplace path split); storefront routes live in StorefrontApp.tsx.

## Marketplace nav link added (highlighted)
- "Marketplace" link added to the desktop header (Navbar.tsx, forest pill reusing
  the old BNPL highlight classes: `rounded-pill … text-white bg-forest
  hover:bg-forest-deep`), the mobile menu (flat-links row, "highlight"/text-forest
  treatment), and the footer (Footer.tsx "Shop" group, brighter/bold vs the faded
  siblings via a new `fullPage` render branch).
- Points to `https://bundledmum.com/marketplace` via a FULL-PAGE `<a href>` (not a
  client `<Link>`, no target=_blank → same tab). Required because /marketplace is a
  separate top-level app tree gated by `isMarketplace()` at App mount; the
  storefront router has no customer /marketplace route, so a client Link can't
  reach it. Verified live: 3 anchors, correct classes, desktop pill highlighted.
