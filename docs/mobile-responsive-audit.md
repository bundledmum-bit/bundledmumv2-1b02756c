# Mobile Responsive Audit — Customer-Facing Pages

**Generated:** 2026-06-04
**Scope:** All customer-facing routes in `App.tsx` (everything NOT under `/admin/*`) plus the shared storefront layout chrome. **Excludes:** all `/admin/*` routes (Waves 2B–2I, already done) and the premium minimalist bundle product path on `/products/:slug` (`isInlineEditableBundle === true`, already responsive).

**Method:** Read-only static read of each page's JSX at a 375px target viewport, tagging issues by category (A–L) and priority (P0–P3). No fixes proposed; no code changed. This commit adds only this file.

> Tap-target note: the project's established minimum (from prior waves) is **h-9 (36px)**; the spec for this audit flags anything **< 40px** as borderline (category E). Most E findings are small icon/dismiss controls and are rated P2/P3 accordingly.

---

## Summary

- **Total routes audited:** 36 route entries → 30 distinct page components + 5 shared layout/chrome components
- **P0 issues:** 0
- **P1 issues:** 5
- **P2 issues:** 25
- **P3 issues:** 17
- **Total issues:** 47

No P0 (fully-broken-on-mobile) issues were found. The codebase is broadly mobile-first; the recurring real problems are: **forced multi-column grids with no single-column fallback** (category C), **sub-40px tap targets** clustered on cart/bundle/push-gift item controls (category E), and a few **off-canvas decorative elements / crowded flex rows** (categories K/J).

---

## Routes audited

- [x] `/` — HomePage (`src/pages/HomePage.tsx`)
- [x] `/shop`, `/shop/baby`, `/shop/mum` — ShopPage (`src/pages/ShopPage.tsx`)
- [x] `/shop/:slug` — CategoryPage (`src/pages/CategoryPage.tsx`)
- [x] `/products/:slug` — ProductPage, **legacy / regular-SKU path only** (`src/pages/ProductPage.tsx`)
- [x] `/p/:slug` — DynamicPage (`src/pages/DynamicPage.tsx`) — body delegates to `DbPageContent` (component, not audited)
- [x] `/bundles` — BundlesPage (`src/pages/BundlesPage.tsx`)
- [x] `/bundles/:bundleId` — BundleDetailPage (`src/pages/BundleDetailPage.tsx`)
- [x] `/bundles/baby-shower-gift-boxes`, `/bundles/postpartum-recovery-kits`, `/bundles/maternity-bundles` — BundleCategoryPage (`src/pages/BundleCategoryPage.tsx`)
- [x] `/cart` — CartPage (`src/pages/CartPage.tsx`)
- [x] `/checkout` — CheckoutPage (`src/pages/CheckoutPage.tsx`)
- [x] `/quote/:shareToken` — QuotePage (`src/pages/QuotePage.tsx`)
- [x] `/order-confirmed` — OrderConfirmedPage (`src/pages/OrderConfirmedPage.tsx`)
- [x] `/payment-received` — PaymentReceivedPage (`src/pages/PaymentReceivedPage.tsx`)
- [x] `/quiz` — QuizPage → HomeQuiz (`src/pages/QuizPage.tsx`, `src/components/home/HomeQuiz.tsx`)
- [x] `/quiz/gift-results` — GiftResultsPage (`src/pages/GiftResultsPage.tsx`)
- [x] `/subscribe` — SubscribeLanding (`src/pages/SubscribeLanding.tsx`)
- [x] `/subscriptions` — SubscriptionPage (`src/pages/SubscriptionPage.tsx`)
- [x] `/subscriptions/checkout` — SubscriptionCheckout (`src/pages/SubscriptionCheckout.tsx`)
- [x] `/subscriptions/thank-you` — SubscriptionThankYou (`src/pages/SubscriptionThankYou.tsx`)
- [x] `/account` — AccountPage (`src/pages/AccountPage.tsx`)
- [x] `/account/login` — AccountLoginPage (`src/pages/AccountLoginPage.tsx`)
- [x] `/account/orders` — AccountOrdersPage (`src/pages/AccountOrdersPage.tsx`)
- [x] `/account/profile` — AccountProfilePage (`src/pages/AccountProfilePage.tsx`)
- [x] `/account/referral` — AccountReferralPage (`src/pages/AccountReferralPage.tsx`)
- [x] `/account/subscriptions` — AccountSubscriptions (`src/pages/account/AccountSubscriptions.tsx`)
- [x] `/account/subscriptions/new` — NewSubscription (`src/pages/account/NewSubscription.tsx`) — pure redirect, no UI
- [x] `/reset-password` — ResetPassword (`src/pages/ResetPassword.tsx`)
- [x] `/track-order` — TrackOrderPage (`src/pages/TrackOrderPage.tsx`)
- [x] `/push-gifts` — PushGiftsPage (`src/pages/PushGiftsPage.tsx`)
- [x] `/about` — AboutPage (`src/pages/AboutPage.tsx`)
- [x] `/contact` — ContactPage (`src/pages/ContactPage.tsx`)
- [x] `/privacy` — PrivacyPage (`src/pages/PrivacyPage.tsx`)
- [x] `/terms` — TermsPage (`src/pages/TermsPage.tsx`)
- [x] `/cookies` — CookiesPage (`src/pages/CookiesPage.tsx`)
- [x] `/returns` — ReturnsPage (`src/pages/ReturnsPage.tsx`)
- [x] `/blog` — BlogPage (`src/pages/BlogPage.tsx`)
- [x] `*` — NotFound (`src/pages/NotFound.tsx`)
- [x] **Shared chrome** — StorefrontShell (`src/App.tsx`), Navbar, Footer, AnnouncementBar, AnnouncementEngine, SkipNav

**Category legend:** A=fixed widths · B=table without overflow-x-auto · C=non-responsive grid · D=text overflow · E=tap target <40px · F=non-responsive image · G=modal not bottom-sheet · H=horizontal form · I=sticky/fixed overlap · J=card/list fixed dims · K=horizontal overflow · L=interactive element covered

---

## Issues by route

### Shared layout chrome (every page)
Files: `src/components/Navbar.tsx`, `src/components/AnnouncementBar.tsx`, `src/components/AnnouncementEngine.tsx`

- **[P2]** Mobile menu drawer fixed `w-[280px]` — File: `src/components/Navbar.tsx:L97` — fn: `Navbar` — cat: A
- **[P3]** Hamburger + cart icon wrappers (`p-2` / `p-1.5`) under 40px hit area — File: `src/components/Navbar.tsx:L80-L88` — fn: `Navbar` — cat: E
- **[P2]** Announcement bar `px-10` (40px gutters) crowds text beside the absolute dismiss button at 375px (guarded by `truncate`) — File: `src/components/AnnouncementBar.tsx:L43` — fn: `AnnouncementBar` — cat: A
- **[P3]** Dismiss button `p-1` + 14px X under 40px hit area — File: `src/components/AnnouncementBar.tsx:L67-L73` — fn: `AnnouncementBar` — cat: E
- **[P2]** Engine bar `px-10` crowds message text at 375px — File: `src/components/AnnouncementEngine.tsx:L265` — fn: `AnnouncementEngine` — cat: A
- **[P3]** Engine bar dismiss button `p-1` + 14px X under 40px — File: `src/components/AnnouncementEngine.tsx:L284-L290` — fn: `AnnouncementEngine` — cat: E
- **[P3]** Engine popup close button (`absolute top-3 right-3 p-1` + 18px X) under 40px — File: `src/components/AnnouncementEngine.tsx:L312-L319` — fn: `AnnouncementEngine` — cat: E

CLEAN: `src/components/Footer.tsx`, `src/components/SkipNav.tsx`, `src/App.tsx` (StorefrontShell chrome uses a responsive spacer + `topOffset` math).

### `/` (Homepage)
File: `src/pages/HomePage.tsx`

- **[P2]** Hero search `input` uses `pr-20` for an absolute submit button; at 375px the placeholder is heavily clipped (layout holds) — File: `src/pages/HomePage.tsx:L38-L51` — fn: `HeroSearch` — cat: D
- **[P2]** `StickyMobileCTA` is `fixed bottom-14` (56px up), assuming a 56px bottom nav; height mismatch would overlap/float — File: `src/pages/HomePage.tsx:L400-L402` — fn: `StickyMobileCTA` — cat: I

> Note: homepage's imported section components (CuratedSections, BundleSections, ShopSectionsRenderer, FeaturedProductsRail, etc.) live in separate files and were out of this inline read — candidates for a follow-up component-level pass.

### `/shop`, `/shop/baby`, `/shop/mum`
File: `src/pages/ShopPage.tsx`

- **[P3]** ProductCard image is a fixed `h-[170px]` block (non-fluid height; width is fluid) — File: `src/pages/ShopPage.tsx:L76` — fn: `ProductCard` — cat: J
- **[P3]** Loading skeleton cards use fixed `h-[380px]` / `h-[320px]` heights — File: `src/pages/ShopPage.tsx:L674` — fn: `ShopPage` — cat: J

> Verified clean: filter/sort bars gate by `md:` and wrap overflow in `overflow-x-auto scrollbar-hide`; filter & sort sheets are already bottom-sheet drawers.

### `/shop/:slug`
File: `src/pages/CategoryPage.tsx`

- **[P2]** `BrandCard` fixed `w-[35vw]` (~131px at 375px) holds price + "+ Add"; tight inside the intentional horizontal snap-scroll carousel — File: `src/pages/CategoryPage.tsx:L376` — fn: `BrandCard` — cat: J

### `/products/:slug` (legacy / regular-SKU path)
File: `src/pages/ProductPage.tsx`

- **[P3]** Trust-badges `grid-cols-3` with no responsive variant (3 tiny icon+label cells; physically fits at 375px) — File: `src/pages/ProductPage.tsx:L1196-L1209` — fn: `ProductPageContent` — cat: C

> Verified clean in the in-scope legacy path: main layout `grid md:grid-cols-2` (collapses to 1 col), thumbnail gallery wrapped in `overflow-x-auto` (L958), selector pills use `flex flex-wrap` + `min-h-[44px]`, add-to-cart `min-h-[48px]`, breadcrumb name `truncate max-w-[200px]`, sticky CTA `bottom-[56px]` + `safe-area-bottom` `md:hidden`.

### `/bundles`
File: `src/pages/BundlesPage.tsx` — **CLEAN**

### `/bundles/:bundleId`
File: `src/pages/BundleDetailPage.tsx`

- **[P2]** Legacy hero collage `grid-cols-2` (2×2 image cells) has no single-column fallback — File: `src/pages/BundleDetailPage.tsx:L906-L924` — fn: `BundleDetailPage` (legacy hero) — cat: C
- **[P2]** Brand selector pills `px-3 py-1.5` (~28px tall) under 40px tap target — File: `src/pages/BundleDetailPage.tsx:L789-L797` — fn: `BundleDetailPage` attrPicker (legacy) — cat: E
- **[P2]** Size selector pills same sub-40px height — File: `src/pages/BundleDetailPage.tsx:L811-L817` — fn: `BundleDetailPage` attrPicker (legacy) — cat: E
- **[P2]** Redesigned-hero attribute pills also sub-40px — File: `src/pages/BundleDetailPage.tsx:L662-L699` — fn: `BundleDetailPage` attrPicker (standard) — cat: E
- **[P3]** "All Bundles" back link (`text-xs … py-2 -my-2`, ~32px effective) under 40px — File: `src/pages/BundleDetailPage.tsx:L878-L880` — fn: `BundleDetailPage` (legacy hero) — cat: E
- **[P3]** Minimalist hero `h1 text-[44px] tracking-tight`; a long single-word bundle name could overflow at 375px without break control — File: `src/pages/BundleDetailPage.tsx:L329-L331` — fn: `BundleDetailPage` (standard) — cat: D

### `/bundles/baby-shower-gift-boxes`, `/postpartum-recovery-kits`, `/maternity-bundles`
File: `src/pages/BundleCategoryPage.tsx` — **CLEAN**

### `/cart`
File: `src/pages/CartPage.tsx`

- **[P1]** Cross-sell grid `grid-cols-3` with no responsive variant — 3 columns at 375px squeeze cards to ~110px — File: `src/pages/CartPage.tsx:L588-L600` — fn: `CartPage` — cat: C
- **[P2]** Quantity steppers `h-7 w-7` (28px) below 40px tap target — File: `src/pages/CartPage.tsx:L545-L551` — fn: `CartPage` (item row) — cat: E
- **[P2]** Save/remove icon buttons `p-1` on a 16px icon (~24px hit area) — File: `src/pages/CartPage.tsx:L506-L511` — fn: `CartPage` (item row) — cat: E
- **[P2]** "Remove" (unavailable item) button `px-2.5 py-1 text-[11px]` (~26px) below 40px — File: `src/pages/CartPage.tsx:L460` — fn: `CartPage` (item row) — cat: E
- **[P2]** Saved-for-later row: 40px image + truncated text + pill + X in a single non-wrapping flex row crowds at 375px — File: `src/pages/CartPage.tsx:L571-L579` — fn: `CartPage` (saved items) — cat: K
- **[P2]** Saved-for-later remove X `p-1` on 14px icon (~22px) below 40px — File: `src/pages/CartPage.tsx:L578` — fn: `CartPage` (saved items) — cat: E
- **[P2]** Empty-state CTA links carry conflicting `inline-block` + `flex` classes (latent narrow-width layout smell) — File: `src/pages/CartPage.tsx:L386-L391` — fn: `CartPage` (empty state) — cat: K
- **[P3]** "Edit" button `px-2.5 py-1 text-[11px]` (~26px) below 40px — File: `src/pages/CartPage.tsx:L552-L557` — fn: `CartPage` (item row) — cat: E

> Verified clean: the sticky mobile checkout bar (L757–L786) sits above `MobileBottomNav` and the page reserves `pb-[calc(1rem+56px+72px)]`, so no overlap.

### `/checkout`
File: `src/pages/CheckoutPage.tsx`

- **[P1]** Express-order card heading `⚡ {expressDisplayName} (₦150,000+ orders)` can overflow on one line at 375px — File: `src/pages/CheckoutPage.tsx:L1618-L1654` — fn: `CheckoutPage` (Express card) — cat: D
- **[P1]** Two bottom-pinned elements: sticky Place-Order bar `fixed bottom-0` (L1945) with `pb-[calc(1rem+64px)]` reserve (L1296); express/recovery content just above can sit under the bar on short viewports — File: `src/pages/CheckoutPage.tsx:L1944-L1978` — fn: `CheckoutPage` (sticky CTA) — cat: L
- **[P2]** Mobile order-summary row: 48px image + name + "Out of stock" `text-[9px]` badge + price in one flex can crowd at 375px — File: `src/pages/CheckoutPage.tsx:L1328-L1343` — fn: `CheckoutPage` (mobile order summary) — cat: K
- **[P2]** Coupon/Referral `input` + Apply button `flex gap-2` (no wrap) is tight at 375px (holds) — File: `src/pages/CheckoutPage.tsx:L1704-L1711` — fn: `CheckoutPage` (coupon) — cat: H
- **[P3]** Bank-transfer detail rows `min-w-[90px]` label + value in `flex gap-2` — File: `src/pages/CheckoutPage.tsx:L1783-L1785` — fn: `CheckoutPage` (transfer details) — cat: A
- **[P3]** Step indicator row "Delivery Details › Payment" fixed two-step (fits 375px) — File: `src/pages/CheckoutPage.tsx:L1302-L1310` — fn: `CheckoutPage` (header) — cat: K

> Verified clean: all field pairs use `flex flex-col md:flex-row gap-3` (stack on mobile — no category-H violations); share/recovery modals already render bottom-sheet (`max-md:items-end max-md:rounded-t-2xl`).

### `/quote/:shareToken`
File: `src/pages/QuotePage.tsx`

- **[P2]** Line-item row: 56px thumb + name + qty/price in one non-wrapping flex; only `truncate` prevents overflow (names clip aggressively at 375px) — File: `src/pages/QuotePage.tsx:L299-L335` — fn: `QuotePage` — cat: J

### `/order-confirmed`
File: `src/pages/OrderConfirmedPage.tsx` — **CLEAN** (bank-detail rows use `min-w-[120px]` label + `break-all` value; holds at 375px)

### `/payment-received`
File: `src/pages/PaymentReceivedPage.tsx` — **CLEAN**

### `/quiz`
Files: `src/pages/QuizPage.tsx`, `src/components/home/HomeQuiz.tsx`

- **[P3]** Decorative blobs use fixed `700px`/`500px` sizes positioned off-canvas (parent has `overflow-hidden`) — File: `src/pages/QuizPage.tsx:L38-L39` — fn: `QuizPage` — cat: A

> Verified clean: `HomeQuiz`/QuizScreen uses single-column option stacks (`space-y-1.5`), full-width buttons `py-2.5`/`py-3.5` (>40px), large centered budget input.

### `/quiz/gift-results`
File: `src/pages/GiftResultsPage.tsx` — **CLEAN** (responsive product grids, bottom-sheet modal, stacked hero buttons)

### `/subscribe`
File: `src/pages/SubscribeLanding.tsx`

- **[P2]** Mobile VS-purchase comparison uses a fixed 2-column grid with no breakpoint guard; long row labels crowd at 375px — File: `src/pages/SubscribeLanding.tsx:L224` — fn: `SubscribeLanding` (mobile compare) — cat: C

> Note: the desktop comparison table is correctly `hidden md:block` with a dedicated mobile stacked-card fallback.

### `/subscriptions`
File: `src/pages/SubscriptionPage.tsx` — **CLEAN** (`grid-cols-1 md:grid-cols-2`; sticky summary above bottom nav via safe-area calc; tap targets meet minimum)

### `/subscriptions/checkout`
File: `src/pages/SubscriptionCheckout.tsx` — **CLEAN** (`max-w-[720px]` single column; City/State `grid-cols-2` is two short fields; pay button `min-h-[48px]`)

### `/subscriptions/thank-you`
File: `src/pages/SubscriptionThankYou.tsx` — **CLEAN**

### `/account`
File: `src/pages/AccountPage.tsx` — **CLEAN**

### `/account/login`
File: `src/pages/AccountLoginPage.tsx` — **CLEAN**

### `/account/orders`
File: `src/pages/AccountOrdersPage.tsx`

- **[P3]** Expanded delivery/courier detail grid stays 2-col on narrow viewport — File: `src/pages/AccountOrdersPage.tsx:L159` — fn: `AccountOrdersPage` — cat: C

> Category B does not apply: order history renders as expandable `<article>` cards, not `<table>`.

### `/account/profile`
File: `src/pages/AccountProfilePage.tsx`

- **[P2]** Address action row (Edit / Set as default / Delete) can wrap and crowd; controls under 40px tall — File: `src/pages/AccountProfilePage.tsx:L256-L262` — fn: `AddressesSection` — cat: E
- **[P3]** AddressForm city/phone/state two-up only collapses below `md`; state select + notes can crowd at 375px — File: `src/pages/AccountProfilePage.tsx:L315` — fn: `AddressForm` — cat: C

### `/account/referral`
File: `src/pages/AccountReferralPage.tsx`

- **[P2]** Stats grid fixed `grid-cols-3` with no breakpoint variant; three ₦ values can overflow/truncate at 375px — File: `src/pages/AccountReferralPage.tsx:L116-L120` — fn: `AccountReferralPage` — cat: C

### `/account/subscriptions`
File: `src/pages/account/AccountSubscriptions.tsx`

- **[P2]** Item action row (Change-brand button + qty stepper) is a non-wrapping `flex gap-1` inside a justify-between row; alongside a long brand+product name it can overflow the card at 375px — File: `src/pages/account/AccountSubscriptions.tsx:L242-L267` — fn: `SubscriptionCard` — cat: K

### `/account/subscriptions/new`
File: `src/pages/account/NewSubscription.tsx` — **CLEAN** (pure `<Navigate>` redirect, no UI)

### `/reset-password`
File: `src/pages/ResetPassword.tsx`

- **[P1]** Decorative absolute circles `500px`/`300px` wider than the 375px viewport (`-right-[200px]` anchor); mitigated by parent `overflow-hidden` but a horizontal-overflow risk to verify — File: `src/pages/ResetPassword.tsx:L77-L78` — fn: `ResetPassword` — cat: K

### `/track-order`
File: `src/pages/TrackOrderPage.tsx`

- **[P2]** Order line items use `flex justify-between` with long product+brand+size text and no `truncate`/`min-w-0` — long names push price off-screen at 375px — File: `src/pages/TrackOrderPage.tsx:L103-L108` — fn: `TrackOrderPage` — cat: D
- **[P3]** Status-label row vs timeline dots can misalign (labels evenly spaced, dots not) — cosmetic — File: `src/pages/TrackOrderPage.tsx:L96-L98` — fn: `TrackOrderPage` — cat: D

### `/push-gifts`
File: `src/pages/PushGiftsPage.tsx`

- **[P1]** Product grid forced `grid-cols-2` at 375px with no single-column fallback — cards pack tier-brand pills, rating, price, and Add button into a ~170px column (cramped/overflow) — File: `src/pages/PushGiftsPage.tsx:L218` — fn: `PushGiftsPage` — cat: C
- **[P2]** Card image fixed `h-[200px]` regardless of the narrow 2-up column width — File: `src/pages/PushGiftsPage.tsx:L83` — fn: `PushGiftCard` — cat: J
- **[P3]** Tier brand-select pills `px-2 py-0.5` well under 40px tall (hard to tap in 2-up layout) — File: `src/pages/PushGiftsPage.tsx:L109-L113` — fn: `PushGiftCard` — cat: E

### `/blog`
File: `src/pages/BlogPage.tsx` — **CLEAN** (`grid gap-5 md:grid-cols-2`; `max-w-[900px] px-4`; responsive text)

### `/p/:slug`
File: `src/pages/DynamicPage.tsx` — **CLEAN** (loading/not-found states only; body renders in `DbPageContent`, a separate component not in this read)

### `/about`, `/contact`, `/privacy`, `/terms`, `/cookies`, `/returns`, `*` (NotFound)
Files: `src/pages/AboutPage.tsx`, `ContactPage.tsx`, `PrivacyPage.tsx`, `TermsPage.tsx`, `CookiesPage.tsx`, `ReturnsPage.tsx`, `NotFound.tsx` — **ALL CLEAN** (uniformly mobile-first: `md:grid-cols-*` stacking single-col, `flex-col sm:flex-row` action rows, capped `max-w` containers, responsive text).

---

## Issues by category (cross-route roll-up)

### A. Fixed widths
- Navbar mobile drawer `w-[280px]` (P2)
- AnnouncementBar `px-10` gutters (P2)
- AnnouncementEngine `px-10` gutters (P2)
- CheckoutPage transfer-detail `min-w-[90px]` (P3)
- QuizPage decorative blobs fixed `700/500px` (P3)
**Total: 5**

### B. Tables without horizontal scroll
- None found. (Customer-facing "tables" are either real card lists — AccountOrders — or already `hidden md:block` with a mobile fallback — SubscribeLanding.)
**Total: 0**

### C. Non-responsive grids
- CartPage cross-sell `grid-cols-3` (P1)
- PushGiftsPage product grid `grid-cols-2` (P1)
- ProductPage trust badges `grid-cols-3` (P3)
- BundleDetailPage legacy hero collage `grid-cols-2` (P2)
- SubscribeLanding mobile compare 2-col (P2)
- AccountReferralPage stats `grid-cols-3` (P2)
- AccountOrdersPage detail grid 2-col (P3)
- AccountProfilePage AddressForm two-up (P3)
**Total: 8**

### D. Text overflow
- HomePage hero search placeholder clip (P2)
- CheckoutPage express heading overflow (P1)
- TrackOrderPage line-item names no truncate (P2)
- BundleDetailPage minimalist `h1` long name (P3)
- TrackOrderPage status-label alignment (P3)
**Total: 5**

### E. Tap targets < 40px
- Navbar hamburger/cart wrappers (P3)
- AnnouncementBar dismiss (P3)
- AnnouncementEngine bar dismiss (P3)
- AnnouncementEngine popup close (P3)
- CartPage qty steppers `h-7 w-7` (P2)
- CartPage save/remove icon `p-1` (P2)
- CartPage "Remove" unavailable (P2)
- CartPage saved-row remove X (P2)
- CartPage "Edit" button (P3)
- BundleDetailPage legacy brand pills (P2)
- BundleDetailPage legacy size pills (P2)
- BundleDetailPage redesign attribute pills (P2)
- BundleDetailPage back link (P3)
- AccountProfilePage address actions (P2)
- PushGiftsPage tier pills (P3)
**Total: 15**

### F. Non-responsive images
- None found (images use fluid widths; only fixed *heights* — see category J).
**Total: 0**

### G. Modals/dialogs not bottom-sheet
- None found — all audited customer-facing modals already use the `max-md:items-end max-md:rounded-t-2xl` bottom-sheet pattern (CheckoutPage share/recovery, GiftResults, QuotePage, AccountSubscriptions, bundle modals).
**Total: 0**

### H. Horizontal forms
- CheckoutPage coupon input + Apply, no wrap (P2)
**Total: 1** (all multi-field address/profile forms correctly use `flex-col md:flex-row`.)

### I. Sticky/fixed overlap
- HomePage `StickyMobileCTA` `bottom-14` assumption (P2)
**Total: 1**

### J. Card/list fixed dims
- ShopPage ProductCard `h-[170px]` (P3)
- ShopPage skeleton heights (P3)
- CategoryPage BrandCard `w-[35vw]` (P2)
- QuotePage line-item row (P2)
- PushGiftsPage card image `h-[200px]` (P2)
**Total: 5**

### K. Horizontal overflow
- CartPage saved-for-later row crowd (P2)
- CartPage empty-state class smell (P2)
- CheckoutPage mobile order-summary crowd (P2)
- CheckoutPage step indicator (P3)
- AccountSubscriptions item action row (P2)
- ResetPassword off-canvas circles (P1)
**Total: 6**

### L. Interactive element covered
- CheckoutPage stacked bottom-pinned elements (P1)
**Total: 1**

---

## Recommended fix sequence

Ordered by P0/P1 density × traffic importance (checkout funnel first, then high-traffic discovery, then account/utility, then polish):

1. **`/checkout`** (2× P1) — highest-value funnel. Fix the express-card heading overflow (D) and the stacked bottom-pinned Place-Order bar overlap (L); sweep the mobile order-summary crowding (K).
2. **`/cart`** (1× P1 + tap-target cluster) — fix the cross-sell `grid-cols-3` (C) and batch the sub-40px item-control tap targets (E) + saved-for-later row crowding (K).
3. **`/push-gifts`** (1× P1) — convert the forced `grid-cols-2` to `grid-cols-1 sm:grid-cols-2` (C); make the card image height fluid (J); enlarge tier pills (E).
4. **`/reset-password`** (1× P1) — contain/clip the off-canvas decorative circles to eliminate the horizontal-overflow risk (K).
5. **`/` (Homepage)** — top of the funnel: reconcile `StickyMobileCTA` bottom offset with the actual bottom-nav height (I); ease hero search placeholder clipping (D). Then schedule a **follow-up component-level pass** over the homepage section components (CuratedSections, BundleSections, ShopSectionsRenderer, FeaturedProductsRail) not covered by this page-level read.
6. **`/bundles/:bundleId`** — batch the legacy + redesign attribute-pill tap targets (E) and the 2×2 hero collage fallback (C); guard the long-name hero `h1` (D).
7. **Shared chrome** (Navbar / AnnouncementBar / AnnouncementEngine) — reduce `px-10` → responsive gutters (A) and bump the dismiss/menu icon hit areas (E). Low effort, applies site-wide.
8. **Account & utility** (`/account/referral` stats grid C, `/account/profile` address actions E, `/track-order` line-item truncation D, `/account/subscriptions` action-row K, `/subscribe` mobile compare C) — medium-traffic, mostly single-issue pages; batch by category.
9. **Polish (P3)** — ShopPage/CategoryPage fixed card heights (J), ProductPage trust-badge grid (C), QuizPage blobs (A), and the remaining P3 tap targets.

### Batching note
The two cheapest cross-cutting batches are **(E) tap targets** (15 instances, mostly `p-1`/`h-7`/`px-2 py-0.5` → standardize to `h-9`/`h-10` hit areas) and **(C) non-responsive grids** (8 instances → add a `grid-cols-1` base + `sm:`/`md:` step-up). Doing those two categories repo-wide would clear ~half of all findings.

---

*Read-only audit. No page component, layout, or style file was modified. Fix work follows in subsequent commits, per route or per category.*
