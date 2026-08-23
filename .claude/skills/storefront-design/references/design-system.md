# BundledMum Design System Reference

Full token, type, and utility reference plus copy-paste snippets. All colours
are Tailwind semantic classes backed by CSS variables, so they re-tint
automatically under `body.theme-bundled` (the storefront theme). Use the
semantic class names, not raw hexes, so the theme stays the single source.

## Contents
1. Colour tokens
2. Typography
3. Shape, shadow, motion utilities
4. Snippets: buttons, chips, prices, section header, product card, rail, hero
5. Spacing and layout conventions

## 1. Colour tokens

| Purpose | Tailwind class | Prototype hex | Notes |
|---|---|---|---|
| Page surface | `bg-background` | `#FBF8F2` | warm cream |
| Card surface | `bg-card` | near-white warm | product/section cards |
| Ink / text | `text-foreground` | `#20251A` | primary text |
| Muted text | `text-muted-foreground` | `#6E6B5F` | secondary text |
| Faint text | `text-text-light` | `#9A9384` | placeholders, meta |
| Primary accent | `coral` / `bg-coral` | `#ED7A52` | THE call-to-action colour |
| Accent pressed | `coral-dark` | `#C85B39` | hover/active coral |
| Accent tint | `coral-blush` | `#FBEEE7` | soft coral background |
| Brand green | `forest` / `bg-forest` | `#586B47` | headings on cream, solid bars |
| Deep green | `forest-deep` | `#46552F` | gradients, deep fills |
| Green tint | `forest-light` | `#EDF1E7` | soft green background |
| Green wash | `mint` | `#DDE6D2` | subtle section tint |
| Warm panel | `bg-warm-cream` | `#F0E8DA` | image placeholders |
| Hairline | `border-border` | `#E7E1D5` | 1px borders |
| Sale / alert | `text-destructive` / `bg-destructive` | red | discounts, errors |

Aliases: `primary` == coral, `secondary` == forest, `midnight` == ink.
`primary-foreground` is the cream text used on coral/forest fills.

**Usage discipline:** cream and forest carry surfaces and structure; coral is
reserved for the single primary action in a view. If two things are coral, one
of them is wrong.

## 2. Typography

| Role | Font | How to apply |
|---|---|---|
| Headings | Playfair Display | `.pf` class, or any `h1`-`h6` (styled globally) |
| Body / UI | DM Sans | default body font, no class needed |
| Prices / numerals | DM Mono | `font-mono-price` (adds `letter-spacing: -0.01em`) |

Heading scale (mobile -> desktop): section title `text-lg md:text-xl`, page
title `text-2xl md:text-[40px]`, hero title `text-[30px] md:text-[48px]`. Keep
headings tight: `leading-[1.1]`.

**Every naira value gets `font-mono-price`.** Example:
`<span className="font-mono-price text-forest font-bold">{fmt(price)}</span>`.

## 3. Shape, shadow, motion

- **Radius:** `rounded-pill` (buttons, chips, badges), `rounded-card` (default
  card), `rounded-[14px]` (compact cards/tiles), `rounded-[24px]` (hero,
  feature panels).
- **Shadow:** prefer soft, low, warm shadows. For a hero:
  `shadow-[0_18px_50px_-24px_rgba(32,37,26,0.5)]`. For cards, `shadow-card` or
  the hover lift below.
- **Motion utilities (in index.css):**
  - `card-hover` -> lifts 5px + soft shadow on hover (product/bundle cards).
  - `interactive` -> lifts 2px on hover (small buttons/pills).
  - `animate-fade-up`, `-2`, `-3`, `-4` -> staggered entrance for hero content.
  - `animate-float`, `animate-pulse-scale`, `animate-pulse-badge` -> accents,
    use sparingly.
- **Aspect-ratio image containers (`aspect-square`, `aspect-[4/3]`, etc.):
  always add `overflow-hidden` on the SAME element.** Without it, a browser
  will let a non-square source image's natural ratio override the CSS
  aspect-ratio and stretch the box to match the photo instead of cropping it.
  Because most product photos happen to already be near-square, this bug
  hides until a tall/wide outlier appears in a rail, then that one card looks
  broken next to uniform neighbours. `overflow-hidden` forces the aspect-ratio
  to win, so `object-cover` can do its job. Check this every time you add a
  new image container, not just when something looks wrong.
- **Scroll rails:** `flex gap-3 overflow-x-auto snap-x scrollbar-none` (or
  `scrollbar-hide` / `filter-scroll`) with `snap-start shrink-0` children.

## 4. Snippets

### Primary CTA (coral pill)
```tsx
<Link to="/quiz" className="rounded-pill bg-coral text-primary-foreground px-6 py-3 text-sm font-semibold hover:bg-coral-dark transition-colors inline-flex items-center gap-1.5">
  {ctaLabel} <ArrowRight className="w-4 h-4" />
</Link>
```

### Secondary CTA (forest outline)
```tsx
<Link to="/shop" className="rounded-pill border border-forest text-forest px-5 py-3 text-sm font-semibold hover:bg-forest/5 transition-colors">
  Shop now
</Link>
```

### Selectable chip (active vs idle)
```tsx
<button className={`rounded-pill px-4 py-2 text-[13px] font-semibold border transition-colors min-h-[40px] ${active ? "bg-forest border-forest text-primary-foreground" : "bg-card border-border text-muted-foreground"}`}>
  {label}
</button>
```

### Price (with optional sale)
```tsx
<div className="flex items-baseline gap-2">
  <span className="font-mono-price text-forest font-bold text-[17px]">{fmt(price)}</span>
  {onSale && <span className="font-mono-price text-muted-foreground text-[10px] line-through">{fmt(was)}</span>}
</div>
```

### Section header with "See all"
```tsx
<div className="px-4 md:px-6 flex items-center justify-between mb-3">
  <h2 className="text-lg md:text-xl font-bold text-foreground">{heading}</h2>
  <Link to="/shop" className="text-xs font-semibold text-forest hover:underline inline-flex items-center gap-0.5">
    See all <ArrowRight className="w-3.5 h-3.5" />
  </Link>
</div>
```

### Product card (rail item)
```tsx
<Link to={`/products/${p.slug}`} className="snap-start shrink-0 w-[150px] rounded-[14px] border border-border bg-card overflow-hidden card-hover">
  <div className="aspect-square bg-warm-cream relative">
    <ProductImage imageUrl={p.imageUrl} emoji={brand.img} alt={p.name} className="w-full h-full" emojiClassName="text-5xl" />
    {onDeal && (
      <span className="absolute top-2 left-2 rounded-pill bg-coral text-primary-foreground text-[10px] font-bold px-2 py-0.5">
        Save {pct}%
      </span>
    )}
  </div>
  <div className="p-2.5">
    <p className="font-semibold text-xs text-foreground line-clamp-2 leading-snug">{p.name}</p>
    <p className="mt-1 font-mono-price text-forest font-bold text-sm">{fmt(brand.price)}</p>
  </div>
</Link>
```

### Horizontal rail wrapper
```tsx
<div className="flex gap-3 overflow-x-auto px-4 md:px-6 pb-1 snap-x scrollbar-none">
  {items.map(/* card */)}
</div>
```

### Hero carousel
Do not rebuild it. Import and feed it slides:
```tsx
import HeroCarousel, { type HeroSlide } from "@/components/home/HeroCarousel";

const slides: HeroSlide[] = [
  { key: "brand", title: heroTitle, subtitle: heroSubtitle, ctaLabel, ctaHref: "/quiz",
    secondaryLabel: "Shop now", secondaryHref: "/shop", image: heroImage, tone: "brand" },
  // plus featured bundles: { key, eyebrow: "Featured bundle", title: b.name,
  //   ctaLabel: "Shop bundle", ctaHref: `/bundles/${b.slug}`, image: b.imageUrl,
  //   price: b.price, tone: "coral" | "forest" }
];
<HeroCarousel slides={slides} />
```
`tone` picks the overlay: `brand` (forest wash for the branded slide), `coral`
and `forest` (ink gradients for photo-led slides).

## 5. Spacing and layout

- Section vertical rhythm: `py-5` mobile, a touch more on desktop.
- Horizontal padding: `px-4 md:px-6`. Keep left edges aligned across sections so
  the page reads as one column on desktop.
- Center wide pages in `max-w-[1180px] mx-auto` so content does not stretch on
  desktop; the homepage does this.
- Cards on a rail: mobile `w-[150px]`-`w-[190px]`; let them peek past the edge
  to signal swipeability.
- Respect the fixed navbar: pages start with top padding (`pt-[76px]` on the
  homepage, `pt-[68px]` on Shop) so content clears it.
