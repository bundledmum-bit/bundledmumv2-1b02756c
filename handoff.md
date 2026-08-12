# Handoff

## Lovable connector gateway is DEAD project-wide — migrating all email fns to direct Resend (in progress)
- **Finding**: the Lovable connector gateway `https://connector-gateway.lovable.dev/resend/emails`
  (auth `Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${RESEND_API_KEY}`) returns
  `401 "Credential not found"` for EVERY call — its stored Resend credential is dead.
  EVERY older email-sender function used this pattern. The fix everywhere is identical:
  `fetch("https://api.resend.com/emails", { headers: { "Content-Type":"application/json",
  "Authorization": \`Bearer ${RESEND_API_KEY}\` }, body: {from,to,reply_to,subject,html} })`,
  removing `GATEWAY_URL`, the `LOVABLE_API_KEY` bearer and the `X-Connection-Api-Key` header;
  guard requires only `RESEND_API_KEY`. Templates/recipients/logic unchanged.
- **Repo tracked only 8 fns**; the gateway senders are deployed as flat `index.ts` (untracked),
  so an MCP deploy of them is durable (git-sync only redeploys tracked fns). Repo copies added
  for each migrated fn anyway (repo == deployed).
- **MIGRATED + DEPLOYED (direct Resend) this sweep:**
  - `send-abandoned-cart` v36 — the confirmed LIVE bug (hourly cron retried forever; it only
    stamps stage_sent/stageN_sent_at after a successful send, so a real customer got 0 recovery
    emails). Staging/dedup/timing untouched.
  - `send-order-confirmation` v36
  - `send-reorder-reminders` v32
  - `send-quote-email` v26 (kept its admin test-send guard)
- **STILL TO SWEEP/MIGRATE** (older senders, expected same gateway pattern): send-hr-notification,
  send-task-daily-summary, send-approval-notification, send-daily-summary, notify-quiz-lead,
  send-subscription-admin-reminders, send-new-order-notification, send-subscription-intro,
  notify-abandoned-checkout, send-box-topup-reminders, test-smtp, invite-admin-user; plus verify
  the marketplace `send-marketplace-*` set (built later off send-marketplace-email = direct Resend,
  expected clean). Already-clean (direct Resend): send-transactional-email, send-internal-order-notification,
  send-referral-email. NOTE: some fns may use LOVABLE_API_KEY for a NON-email (AI) purpose — leave those.

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
