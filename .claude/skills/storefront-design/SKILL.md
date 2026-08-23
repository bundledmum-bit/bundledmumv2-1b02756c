---
name: storefront-design
description: >-
  Design system and playbook for the BundledMum storefront (Nigerian baby & mum
  ecommerce). Use this WHENEVER you are designing, building, restyling, or
  reviewing any customer-facing storefront UI: home page, Shop, Product (PDP),
  Cart, Checkout, category and landing pages, or any section/component like a
  hero, carousel, product card, category tile, deals rail, trust bar, or
  promo banner. Trigger it even when the user does not say "design" - phrases
  like "make this look better", "more premium", "add a carousel/hero", "redesign
  the homepage", "theme-fit this page", "improve conversion", or "match the
  prototype" all apply. Encodes the palette, fonts, tokens, reusable components,
  and conversion patterns learned from high-selling ecommerce sites. Do NOT use
  for admin UI (/admin/*), which keeps its own look.
---

# BundledMum Storefront Design

Build storefront UI that feels **premium and editorial** while borrowing the
**conversion mechanics of high-selling ecommerce** (Jumia, Konga,
babyshopnigeria.com, Amazon) and the **restraint of premium DTC brands**
(Glossier, Aesop, Allbirds). The north star: take what makes marketplaces
convert (clear hierarchy, trust, urgency, merchandising rails) and dress it in a
calm, warm, confident brand skin instead of the usual loud orange density.

Think "elevated Jumia": the same shopper affordances, half the visual noise.

## Before you start

1. **Study the prototype.** The visual target lives in
   `~/Downloads/BundledMum Prototype.html` (self-unpacking; decode the
   `<script type="__bundler/template">` as a JSON string). If it is unavailable,
   the shipped homepage `src/components/home/PrototypeHome.tsx` is the canonical
   reference for spacing, rhythm, and tone.
2. **Reuse before you build.** Check the component inventory below. Most needs
   are already met by `HeroCarousel`, `CuratedSections`, or existing card
   markup. Extend or restyle these before writing new ones.
3. **Read the reference files** when you need depth:
   - `references/design-system.md` - every token, font, utility class, and
     copy-paste snippets for buttons, cards, prices, section headers, rails.
   - `references/ecommerce-patterns.md` - the cross-site patterns (hero,
     category tiles, product cards, deals/urgency, trust, social proof, PDP,
     cart) with the BundledMum way to do each.
   - `references/page-recipes.md` - section-by-section recipes for Home, Shop,
     Product, and Cart.

## Non-negotiable rules

These are project constraints, not stylistic preference. Breaking them creates
real bugs (wrong data, admin drift, failed lint).

- **Storefront only.** Never theme `/admin/*`. The theme is scoped to
  `body.theme-bundled` (toggled off on admin in `App.tsx`).
- **Copy resolves from the database.** Real text comes from `site_settings`
  (e.g. `hero_title`, `hero_subtitle`, `cta_button_text`, `announcement_text`,
  `most_loved_heading`, `free_delivery_nationwide_threshold_naira`), `products`,
  and `bundles`. Never hardcode admin-editable text. Short UI chrome labels
  ("Shop by Category", "Featured bundle", "See all") are fine - full marketing
  copy is not.
- **When a design needs copy with no backend field yet**, use a sensible
  placeholder derived from real data and record the proposed field in
  `docs/storefront-redesign-backend-audit.md` for the backend engineer. Do not
  invent a permanent hardcoded string.
- **Prices use DM Mono.** Apply `font-mono-price` to every naira amount. This is
  a brand signature, not decoration.
- **No em dashes** in code comments or UI copy. Use a period, comma, or "and".
- **Mobile-first, always.** Design the ~390px view first, then add `md:`
  enhancements. Touch targets are at least 44px. Verify both widths.
- **Grid classes need a base.** Always pair a breakpoint grid with a base
  (`grid-cols-2 md:grid-cols-4`, never `md:grid-cols-4` alone) or
  `lint:grid-cols` fails.

## Design principles (the cross-site distillation)

1. **One confident primary action per view.** Coral pill = the primary CTA
   (Add to cart, Build my bundle, Shop bundle). Everything else is a quieter
   forest outline or text link. Marketplaces bury the CTA in noise; premium
   brands make it obvious. Be the latter.
2. **Trust is a feature, show it everywhere.** Free-delivery threshold progress,
   fast Lagos delivery, authentic brands, easy returns, secure payment. Baby
   shoppers are cautious and high-intent. babyshopnigeria leads with "Fast
   Delivery & Simple Returns" and a wall of real brand logos for a reason.
3. **Merchandise in rails, not walls.** Horizontal, swipeable rails
   (`CuratedSections`) with a clear heading and a "See all" link outperform
   dense grids on mobile and read as curated, not dumped.
4. **Social proof and scarcity, used with restraint.** Star ratings, review
   counts, best-seller/new badges, "Save X%", low-stock nudges. Jumia leans hard
   on countdowns and "3 items left"; borrow the mechanic, dial the intensity
   down so it stays premium.
5. **Photography does the selling; type does the talking.** Big, clean imagery
   with a legibility gradient. Playfair for headings (editorial), DM Sans for
   body, DM Mono for numbers. Generous whitespace. Let products breathe.
6. **Warm, calm palette with a single hot accent.** Forest and cream carry the
   surface; coral is reserved for what you want tapped. Never flood coral.
7. **Motion is subtle and purposeful.** Auto-advancing hero, gentle hover lift
   (`card-hover`), fade-up on load. Nothing bounces or distracts from the buy.

## The design system in one breath

Full detail in `references/design-system.md`. The essentials:

- **Palette (Tailwind semantic classes, theme-tinted via CSS vars):**
  `forest` / `forest-deep` / `forest-light`, `coral` / `coral-dark` /
  `coral-blush`, `warm-cream`, `mint`, `midnight` (ink), `muted` /
  `muted-foreground`, `border`, `background`, `card`. `primary` == coral,
  `secondary` == forest.
- **Prototype hexes:** forest `#586B47`, deep forest `#46552F`, coral `#ED7A52`,
  creams `#FBF8F2` / `#F0E8DA`, ink `#20251A`.
- **Fonts:** Playfair Display via the `.pf` class or any `h1-h6`; DM Sans is the
  body default; DM Mono via `.font-mono-price` for prices.
- **Shape & depth:** `rounded-pill` (buttons/chips), `rounded-card` and
  `rounded-[14px]`/`rounded-[24px]` (cards/heroes), soft shadows. `card-hover`
  for the lift, `interactive` for small press affordances.

## Component inventory (reuse first)

Storefront home/section components in `src/components/home/`:

- **`HeroCarousel`** - premium auto-rotating hero banner carousel (embla, no
  extra dependency): autoplay, swipe, pagination dots, desktop arrows. Slides
  are `HeroSlide[]` built from DB data. Use for any hero/banner carousel.
- **`CuratedSections`** - admin-configured horizontal product rails with a
  coloured header bar, "(see all)" link, and swipe hint. The Shop browse view
  is built from these. Use for merchandised product/bundle rows.
- `PrototypeHome` - the assembled homepage (hero + category tiles + popular
  bundles + free-delivery progress + deals). Read it as the reference layout.
- `TrustBar`, `TestimonialsSection`, `HowItWorksSection`, `ShopShortcuts`,
  `FeaturedProductsRail`, `HomeQuiz` - supporting sections.

Shared: `ProductImage` (CORS-safe image with emoji fallback), `fmt()` from
`@/lib/cart` (naira formatting), `getBrandForBudget()` (tier/brand selection).

## Workflow for a design task

1. Identify the page/section and open the current implementation.
2. Pull the visual target from the prototype (or `PrototypeHome`).
3. Reuse tokens and components; restyle rather than rebuild so functionality
   (merchandising, brand/size selectors, cart, analytics) is preserved.
4. Wire real copy from the DB; log any missing backend field in the audit.
5. Build mobile-first, then layer `md:`/`lg:` for desktop (center wide content
   in a `max-w-[1180px] mx-auto` container so it does not stretch).
6. Verify in the running preview at both ~390px and ~1280px: check the hero,
   a product card, a price (mono), and one interaction. Screenshot the result.
7. Run `tsc --noEmit`, `lint:grid-cols`, and `npm run build` before you call it
   done.

Match the surrounding code's density and idioms. When in doubt, choose the
calmer, more spacious option. Premium is mostly restraint.
