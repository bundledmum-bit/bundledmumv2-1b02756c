# Ecommerce Patterns: what top sellers do, the BundledMum way

Patterns distilled from high-converting ecommerce (Jumia, Konga,
babyshopnigeria.com, Amazon) and premium DTC (Glossier, Aesop, Allbirds,
Gymshark). For each: the mechanic that makes it convert, then how to render it
in the BundledMum skin so it stays premium.

## Contents
1. Hero / banner carousel
2. Category navigation (tiles and chips)
3. Product cards
4. Deals, urgency, and scarcity
5. Trust signals
6. Social proof
7. Product detail page (PDP)
8. Cart and checkout
9. Search
10. Conversion checklist

## 1. Hero / banner carousel

**What top sellers do:** Jumia and babyshopnigeria open with a rotating banner
carousel: 3-6 slides, auto-advancing, dots, each a promo with one CTA. It sets
merchandising priorities above the fold and recovers attention on each rotation.

**BundledMum way:** use `HeroCarousel`. Slide 1 is the brand hero (DB copy:
`hero_title`, `hero_subtitle`, `cta_button_text`). Following slides are real
featured bundles (name + image + price). Keep it to 3-5 slides. Prefer a calm
gradient over the photo (not a busy collage), Playfair title, one coral CTA plus
a ghost secondary. Auto-advance ~5s, pause on interaction, dots bottom-left,
arrows on desktop only. Curated banners should eventually come from a backend
field (`home_hero_slides`) rather than being hardcoded.

## 2. Category navigation

**What top sellers do:** Jumia uses a grid of round category icons; babyshopnig
uses lifestyle image tiles by life stage (Feeding, Strollers, Clothing). Both
give a fast "where do I go" answer above the product feed.

**BundledMum way:** two forms.
- **Tiles** (homepage): a `grid grid-cols-2 md:grid-cols-4` of soft cards, each
  `bg-forest-light` or `bg-coral-blush`, with an emoji or small image and a
  label plus arrow. Life-stage framing (Maternity, Baby, Bundles, Gifts) beats
  raw taxonomy.
- **Chips** (Shop): a horizontal `rounded-pill` chip row (All / Baby / Mum /
  Bundles / Gifts), active = filled forest, idle = bordered cream. Mobile-first;
  on desktop the Shop keeps its fuller filter bar.

Real category data should come from the DB (`home_categories`) once the field
exists; until then use documented placeholders.

## 3. Product cards

**What top sellers do:** image-forward card with title (2-line clamp), price,
discount badge, rating, and a fast add affordance. Amazon foregrounds rating +
review count; Jumia foregrounds discount % and "X left".

**BundledMum way (see the snippet in design-system.md):**
- Square image on `bg-warm-cream`, `ProductImage` with emoji fallback.
- Badge priority, top-left: Out of stock > editorial badge > "Save X%".
- Title `line-clamp-2`, price in `font-mono-price` forest bold.
- "from {min}" when a product has multiple brand tiers.
- Quick-add as a coral pill; when in cart, swap to a quantity stepper.
- Hover: `card-hover` lift. Keep the card quiet; one accent max.

Do not strip real affordances (brand-tier chips, size selectors) to match a
simpler mockup; restyle them instead.

## 4. Deals, urgency, scarcity

**What top sellers do:** Jumia's "Flash Sales" with a live countdown and "40
items left" is the archetype of urgency. It works, but it is loud.

**BundledMum way:** borrow the mechanic, lower the volume.
- "Save X%" badge computed from `compareAtPrice` vs `price` (real data).
- Low-stock nudge ("Only 3 left") only when `stockQuantity` is genuinely low.
- A deals rail heading with an optional countdown for a real, admin-set sale
  end time. Never fake a timer. If there is no backend field for the sale
  window, leave the countdown out and note the proposed field in the audit.
- Free-delivery progress bar (below) is the most on-brand urgency: helpful, not
  manipulative.

## 5. Trust signals

**What top sellers do:** babyshopnigeria leads with "Fast Delivery & Simple
Returns", "Buy Online or Pick In-Store", "8 Years of Excellence", and a wall of
authentic brand logos (Pampers, Avent, Medela). Baby shoppers are cautious;
trust converts them.

**BundledMum way:**
- **Free-delivery progress:** a `bg-forest` panel showing "You're {amount} away
  from free delivery" with a coral progress bar, driven by the real cart total
  and `free_delivery_nationwide_threshold_naira`. This is both trust and
  urgency and it is already built.
- **Trust strip:** a compact row of 3 quiet items (fast Lagos delivery,
  authentic brands, easy returns) with small icons. Keep copy short; if it is
  marketing copy that admin should own, source it from the DB or log the field.
- **Brand wall:** a muted, evenly spaced logo row signals legitimacy. Greyscale
  or low-contrast so it supports, never competes.
- Show secure-payment and returns cues near the Add-to-cart and in checkout.

## 6. Social proof

**What top sellers do:** star ratings + counts on cards and PDP, best-seller and
"new" badges, testimonials, "customers also bought".

**BundledMum way:** stars in coral with the review count in muted text; a
best-seller or editorial badge from real product data; a testimonials section
(`TestimonialsSection`) with real quotes. Keep ratings honest and DB-driven.

## 7. Product detail page (PDP)

**What top sellers do:** large gallery + thumbnails, title, rating, price with
was/save, variant selector, concise benefits, delivery promise, sticky
add-to-cart on mobile, and a "you might also like" rail.

**BundledMum way (already close in `ProductPage`):**
- Image with zoom + brand thumbnail strip.
- Playfair title, coral stars + review count, price in `font-mono-price` with
  strikethrough was and a "-X%" pill.
- Brand/tier selector (the tier mechanic maps to budget brands). A short attr
  table plus a delivery-promise pill.
- Sticky bottom bar on mobile: mono price + coral Add to cart.
- Related rail at the bottom. Keep all existing subscription/bundle logic.

## 8. Cart and checkout

**What top sellers do:** persistent free-shipping progress, clear line items with
thumbnails, obvious totals, trust badges, minimal fields, one primary CTA per
step, visible progress.

**BundledMum way:** cream surface, mono prices throughout, the free-delivery
progress bar at top, coral primary CTA ("Checkout", "Place order"), forest for
secondary. Keep steps calm and single-column on mobile. Reassure near the pay
button (secure, returns). Do not introduce surprise costs late.

## 9. Search

**What top sellers do:** prominent, always-available search; it is the highest-
intent entry point.

**BundledMum way:** a `rounded-pill` cream search field with a left search icon,
placed at the top of Home and Shop. On submit, route to `/shop?q=...`. Keep it
visible; it already backs an alias-aware server search.

## 10. Conversion checklist

Before shipping a storefront view, confirm:

- [ ] One clear primary (coral) action; secondaries are quieter.
- [ ] Every price uses `font-mono-price`.
- [ ] A trust cue is visible (delivery promise, returns, authentic brands, or
      free-delivery progress).
- [ ] Social proof is present where it helps (rating, badge, testimonial).
- [ ] Real copy comes from the DB; placeholders are logged in the audit.
- [ ] Mobile-first: 44px targets, rails swipe, nothing clips at ~390px.
- [ ] Desktop centered and composed, not stretched.
- [ ] Motion is subtle; nothing distracts from the buy.
- [ ] No em dashes; grid classes have a base; `tsc` + lint + build pass.
