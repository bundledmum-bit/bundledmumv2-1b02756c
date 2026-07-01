# Storefront Redesign — Backend Audit (for the backend engineer)

Branch: `redesign/bundledmum-theme-preview` (PREVIEW ONLY, not merged).

This document lists text/content that the redesigned storefront currently
renders from hardcoded placeholders because there is no admin-editable backend
field to resolve from yet. Everything else in the redesign already resolves from
the database (`site_settings`, `products`, `bundles`). The goal is to replace
each placeholder below with a real column so admin stays the single source of
truth for copy.

No em dashes in any proposed copy fields.

## Already resolving from the DB (no change needed)

- Homepage hero: `site_settings.hero_title`, `hero_subtitle`, `cta_button_text`
- Popular bundles heading: `site_settings.most_loved_heading`
- Announcement bar: `site_settings.announcement_text`
- Free delivery progress: `site_settings.free_delivery_nationwide_threshold_naira`
  (falls back to `default_free_threshold`)
- All bundle and product names, prices, images, ratings, brands/tiers

## Proposed new fields

### Homepage (from the earlier homepage rebuild)

1. `site_settings.home_categories` — JSON array for the "Shop by Category" tiles.
   Shape: `[{ label, href, image_url, tone }]` where `tone` is `"forest"` or
   `"coral"`. Currently hardcoded in `PrototypeHome.tsx` (`PLACEHOLDER_CATEGORIES`):
   Maternity, Baby, Bundles, Gifts.

2. Deals rail source. Either:
   - `site_settings.deals_product_ids` (uuid[]) for a hand-curated list, or
   - a sale rule (compare_at_price > price), which is the current placeholder
     behaviour, plus `site_settings.deals_heading` for the rail title
     (currently the hardcoded string "Deals for you").

3. `site_settings.popular_bundles_heading` — optional. Today the code reuses
   `most_loved_heading` with a fallback of "Shop Popular Bundles".

4. `site_settings.hero_product_id` — optional. Pins the hero image product
   instead of "first bundle, else first product with an image".

4b. `site_settings.home_hero_slides` — JSON array for the homepage hero
    carousel banners. Shape:
    `[{ eyebrow, title, subtitle, image_url, cta_label, href, tone }]` where
    `tone` is `"brand"`, `"coral"`, or `"forest"`. Currently the carousel
    derives slides from real data: slide 1 is the brand hero (hero_title /
    hero_subtitle / cta_button_text) and the rest are featured bundles
    (name + image + price from the DB). The "Featured bundle" eyebrow and
    "Shop bundle" label are UI chrome. This field would let admin curate the
    banners directly (order, imagery, copy, and links).

### Homepage (revision 2: static hero, brand showcase, flash deals)

7. `site_settings.home_categories` image support. The "Shop by Category" tiles
   now show real images (no emoji). With no admin field, the imagery is derived
   from real category products/bundles (first baby product image, first mum
   product image, a bundle image, a gift bundle image). The proposed
   `home_categories` shape should therefore include `image_url` per tile so
   admin controls the picture, label, and link.

8. `site_settings.home_loved_baby_brands` — the "Our Most Loved Baby Items"
   section shows five premium baby brands (WaterWipes, Huggies, Mustela, Tommee
   Tippee, Kendamil). These are matched against a canonical premium-brand list
   in `PrototypeHome.tsx` because the raw `brand_name` data is inconsistent
   (some values carry pack info like "Waterwipes (54pcs)"). A field
   `[{ name, image_url, href }]` would let admin curate the showcase directly.
   Also: the section heading is shown as "Our Most Loved Baby Items" (a preview
   label). Update `site_settings.most_loved_heading` to this value so it stays
   DB-driven.

9. Real sale data for Flash Deals. NO product has a `compare_at_price` set
   (0 of 518 brands), so there is nothing genuine to slash. The Flash Deals
   cards render the "-X%" badge and strikethrough automatically from real
   `compare_at_price`, but for the preview a clearly-flagged illustrative "was"
   price is shown (constant `PREVIEW_DEMO_SALES` in `FlashDeals.tsx`). To make
   deals real: set `compare_at_price` on discounted brands (and optionally add
   `site_settings.deals_ends_at` timestamptz for a true countdown window and
   `deals_product_ids` for a curated set). Turn `PREVIEW_DEMO_SALES` off once
   real sale prices exist.

10. Hero copy/imagery. The hero now keeps fixed brand copy (hero_title /
    hero_subtitle / cta_button_text) with a set of real images cross-fading
    behind it. `home_hero_slides` (item 4b) would let admin curate that image
    set and the copy per campaign.

### Shop page (surfaced during the Shop theme-fit)

5. Shop hero heading + subtitle. Currently hardcoded in `ShopPage.tsx`:
   - Heading: "All Shops" / "Baby Shop" / "Mum Shop" (varies by shop variant)
   - Subtitle: "Shop baby essentials, mum items, and baby gifts without
     stepping foot in any market."
   Proposed: `site_settings.shop_hero_title` and `shop_hero_subtitle`, ideally
   per variant (all / baby / mum) so admin can tune each shop landing.

6. Shop mobile category chips. Currently hardcoded in `ShopPage.tsx`
   (All / Baby / Mum / Bundles / Gifts, each linking to a route). These mirror
   the homepage tiles, so they can reuse `home_categories` (item 1) rather than
   a separate field. If kept separate, propose `site_settings.shop_category_chips`
   with the same `[{ label, href }]` shape.

## Notes

- Nothing above changes any schema today. This is a proposal for the backend
  engineer to wire real columns; the frontend already reads `site_settings`
  and will switch from the placeholders to the new fields once they exist.
- Pre-existing UI copy elsewhere uses em dashes (for example the bundle add bar
  "Add bundle — NGN..."). Those were not introduced by the redesign and were
  left unchanged; flagging only so the copy pass is intentional if the team
  wants them normalised.
