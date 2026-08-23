# Page Recipes

Section-by-section blueprints for the main storefront pages, aligned to the
prototype and the components already in the repo. Treat these as the default
composition; adapt to real merchandising and DB data.

## Home (`PrototypeHome.tsx`)

Order, top to bottom:

1. **Search** - pill cream field, left icon, routes to `/shop?q=...`.
2. **Hero carousel** - `HeroCarousel`. Fixed brand copy + CTAs (DB copy) with
   real images cross-fading behind a strong legibility scrim. Only the image
   moves; the text, CTAs, arrows, and dots stay static.
3. **Shop by Category** - `grid-cols-2 md:grid-cols-4` image tiles (real photos,
   gradient scrim, white label). Compact on mobile, larger on desktop. DB
   `home_categories` (with image_url) when available.
4. **Our Most Loved Baby Items** - rail of ~10 premium baby brand cards (real
   images + mono "from" prices), each linking to a scoped search. Curate via
   `home_loved_baby_brands` when available.
5. **Free-delivery progress** - forest panel, coral bar, real cart total vs
   threshold.
6. **Flash Deals** - `FlashDeals`: live countdown, "Save X%" + strikethrough
   was price, low-stock/FOMO cue, and in-place add-to-cart with a quantity
   stepper. Slash shows from real `compare_at_price`; a flagged preview demo
   fills in until sale data exists.

Wrap the page in `max-w-[1180px] mx-auto` and keep a `sr-only` h1 for SEO
(the visible hero title lives in the carousel as an h2).

Optional premium additions (if wanted): a slim trust strip under the hero, a
muted brand-logo wall, a testimonials section, a "How it works" band for the
bundle proposition.

## Shop (`ShopPage.tsx`)

- **Header** - cream, not a dark hero. Page title (`All/Baby/Mum Shop`),
  short subtitle, pill search, and on mobile a category chip row
  (All / Baby / Mum / Bundles / Gifts). Desktop keeps the fuller filter bar.
- **Browse (default)** - `CuratedSections` rails, admin-ordered, coloured header
  bars, "(see all)", swipe hints. Do not replace this with a flat grid; it is
  the merchandising system.
- **Search / push-gift** - the flat responsive product grid
  (`grid-cols-2 md:grid-cols-3 lg:grid-cols-4`) with the restyled `ProductCard`.
- **Filter/sort** - mobile filter + sort sheet; keep the drawer. Mono prices on
  every card.

## Product / PDP (`ProductPage.tsx`)

1. Breadcrumb.
2. Image with zoom + brand thumbnail strip.
3. Playfair title, coral rating stars + review count.
4. Price: `font-mono-price` current, strikethrough was, "-X%" pill.
5. Brand/tier selector (maps to budget brands), short attribute table, delivery
   promise pill.
6. Add to cart (coral) + secondary (WhatsApp / subscribe) as they exist.
7. Sticky mobile bottom bar: mono price + coral Add to cart.
8. Product details, reviews, and a "you might also like" related rail.

Preserve all subscription, bundle, and WhatsApp logic; restyle, do not remove.

## Cart / Checkout

- Cream surface, single column on mobile, mono prices throughout.
- Free-delivery progress bar pinned near the top.
- Line items with thumbnails, quantity steppers, clear remove.
- Sticky summary with the total in mono and a coral primary CTA
  ("Checkout" / "Place order"); secondary actions in forest.
- Reassurance near the pay button: secure payment, easy returns. Minimal
  fields, visible step progress, no surprise costs late.

## Deals page (`DealsPage.tsx`, route `/deals`)

- **Header** - small and wide, not a full hero: a compact gradient strip
  (`forest-deep` to `forest`) with the deals title, one-line subtitle, and a
  live countdown badge. Deals should feel fast and current; do not give this
  page an editorial hero.
- **Feature strip** - a slim row of deal-specific reassurances (new deals
  daily, fast delivery, easy returns), distinct from generic site trust copy.
- **Filter + sort** - category chips (All/Baby/Mum) and a sort select (biggest
  savings / price). Keep both client-side and simple; this is a filtered view
  of the same deal set, not a second merchandising system.
- **Grid** - reuse `FlashDealCard` from `FlashDeals.tsx` (pass `className` for
  grid vs rail sizing) so pricing, urgency, and add-to-cart stay identical to
  the homepage rail. `grid-cols-2 md:grid-cols-4 lg:grid-cols-5`.
- Wire the homepage Flash Deals "See all" link here.

## New landing or campaign page

Compose from the same parts: a hero (carousel or single banner), one or two
merchandised rails, a trust cue, social proof, and a single clear CTA. Keep the
palette discipline (coral only for the primary action) and pull all copy from
the DB or log the field in `docs/storefront-redesign-backend-audit.md`.
