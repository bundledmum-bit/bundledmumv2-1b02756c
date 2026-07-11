# New Design — Backend & Admin Readiness Spec (for go-live)

Branch: `redesign/bundledmum-theme-preview` (preview only, not merged).
Audience: backend + admin engineer. Goal: make the database, RPCs, and admin
tooling ready so the redesigned storefront works correctly on go-live with no
missing data, broken links, or empty pages.

The redesign is **frontend-only** so far. It reads from the **existing** schema
(`products`, `brands_public`, `product_categories`, `site_settings`,
`shop_sections`, quiz tables, and the recommendation RPCs). Nothing below asks
you to change the storefront code. It tells you (a) what data must be correct,
(b) what admin must be able to manage, and (c) the few new fields to add.

No em dashes in any copy fields.

---

## 1. New URL structure (routes)

| Route | Page | Notes |
|---|---|---|
| `/shop` | ShopPage (all) | Marketplace grid of all products |
| `/shop/baby` | ShopPage (baby) | Grid scoped to `products.category = 'baby'` |
| `/shop/mum` | ShopPage (mum) | Grid scoped to `products.category = 'mum'` |
| `/shop?tab=push-gift` | ShopPage (Gifts) | Grid scoped to `products.category = 'push-gift'` |
| `/shop/baby/:category` | **SubcategoryPage** (NEW) | Products where `products.subcategory = :category` |
| `/shop/mum/:category` | **SubcategoryPage** (NEW) | Products where `products.subcategory = :category` |
| `/shop/:slug` | CategoryPage | Legacy single-segment category, same query (`subcategory = :slug`) |
| `/products/:slug` | ProductPage | Group page if multi-brand, standalone if `?sku=` |
| `/products/:slug?sku=<sku>` | ProductPage | Standalone brand PDP (pre-selects the brand) |
| `/quiz` | QuizPage | Step-by-step wizard |
| `/quiz/gift-results` | GiftResultsPage | Gift recommendation results |

**Critical:** the new category/subcategory URLs are built from
`product_categories.slug` and `product_categories.parent_category`. The link
builder is `/shop/{parent}/{slug}` where `parent = (parent_category === 'mum' ? 'mum' : 'baby')`.
So a category with `parent_category = 'both'` is only reachable under
`/shop/baby/:slug`. See §3.1.

---

## 2. Page-by-page: what renders and from where

### 2.1 Shop landings (`/shop`, `/shop/baby`, `/shop/mum`, Gifts)
- **Search**: server RPC `search_products` (alias-aware). Zero-result queries
  call `record_search_miss` (already wired). No change needed.
- **Section tabs**: All / Baby / Mum / Gifts. Baby & Mum are path routes; Gifts
  sets `?tab=push-gift`. Bundles link was removed from these tabs.
- **Category quick-nav** (circular icons, desktop side-scroll / mobile dropdown):
  built from `product_categories` (the section's categories + an "All" item).
  Needs correct `icon`, `name`, `slug`, `parent_category`, `display_order`.
- **Filter + Sort toolbar** (same on mobile + desktop): opens the filter drawer
  (Category, Brand, Price) and a Sort sheet (popularity, price). Budget filter
  was removed.
- **Product grid**: the flat, filterable product list (`grid-cols-2` mobile up
  to `5` desktop). Uses `products` + `brands_public`.
- Toggles: `site_settings.shop_show_price_filter`, `shop_show_instock_filter`
  (default `true`), `shop_enabled_sorts` (which sort options appear).

### 2.2 Subcategory / Category page (`/shop/baby/:cat`, `/shop/mum/:cat`, `/shop/:slug`)
- Query: `products` where `subcategory = :category`, `is_active = true`,
  `deleted_at IS NULL`, ordered by `stage_order` then `name`.
- Header: reads the category's `name`, `icon`, `merch_page_label` (optional
  override of the heading).
- Sibling category nav (same circular nav as shop).
- CategoryPage additionally honours admin **category pins** (see §4) for order.

### 2.3 Product page (`/products/:slug`)
Two modes, decided by the data:
- **Group page** — product has **more than one brand** and no `?sku=`. Shows a
  "Choose your brand" grid; each brand card can Add to cart (flips to a qty
  stepper) or open the standalone brand page. Uses `brands_public` rows.
- **Standalone brand PDP** — `?sku=<sku>` present, or product has a single
  brand. Full detail with gallery, subscription, WhatsApp, sticky Add to cart.
- Breadcrumb links use `products.category` + `products.subcategory` to build
  `/shop/{parent}/{subcategory}`.

### 2.4 Quiz (`/quiz`) — step-by-step wizard
- Screen 1 is now a 3-step wizard: **Budget → What do you need → Gender**, then
  the optional WhatsApp step, then results. Same data + same recommendation
  engine as before.
- All labels resolve from `site_settings` (see §5). Min budget from
  `site_settings.quiz_min_budget`.
- Category step options: Bundles & Kits (maternity), Baby Things (baby), Gifts
  (gift + a required gift subcategory: `postpartum_kits`, `baby_shower_boxes`,
  `push_gifts`).
- Recommendation RPCs (unchanged): `run_quiz_recommendation` (non-gift),
  `run_push_gift_recommendation` (gift). Lead capture: `save_quiz_lead`.

### 2.5 Quiz results (`/quiz` results + `/quiz/gift-results`)
- Product sections bucketed by `products.quiz_section`
  (`mum_essentials` | `hospital_consumables` | `baby_essentials` | null) with a
  category fallback. **This column must be populated** for correct grouping.
- Redesigned: compact hero, clean section headers, sticky mobile checkout bar.
  All recommendation logic unchanged.

---

## 3. Data the new design depends on (must be correct for go-live)

### 3.1 `product_categories` (drives all category nav + subcategory pages)
Columns used: `id, name, slug, parent_category, display_order, icon, is_active,
stage_order, merch_page_label`.
- `slug` — used directly in URLs (`/shop/baby/<slug>`). Must be URL-safe,
  unique, and stable. **Changing a slug breaks links and SEO.**
- `parent_category` — `'baby' | 'mum' | 'both' | null`. Decides which section a
  category shows under and the URL parent. `'both'` shows under baby + mum
  landings but its URL is always `/shop/baby/<slug>`. `null` categories won't
  appear in the section navs.
- `icon` — an emoji, shown in the circular nav and tiles. Should be set for
  every active category or it falls back to a generic bag.
- `display_order` — nav ordering.
- `is_active` — only active categories are fetched.
- `merch_page_label` — optional heading override on the category page.

### 3.2 `products`
Columns used by the new pages: `category` (`'baby' | 'mum' | 'push-gift'`),
`subcategory` (**must equal a `product_categories.slug`** to appear on that
subcategory page), `slug` (product URL), `is_active`, `deleted_at`,
`stage_order` (ordering), `quiz_section`, `badge`, plus the standard name /
images / rating.
- **Every product must have `subcategory` set to a valid category slug**, or it
  will not appear on any `/shop/{parent}/{slug}` page.
- The Gifts tab needs products with `category = 'push-gift'`.

### 3.3 `brands_public` (per-product brands)
Fields used: `brand_name, price, compare_at_price, tier, size_variant,
in_stock, stock_quantity, sku, image_url` (+ diaper/pack fields).
- Product with >1 brand → renders the group page. `sku` must be present and
  unique per brand (the "Full details" links use `?sku=`).
- `compare_at_price > price` drives the "Save X%"/sale badges.
- `in_stock=false` / `stock_quantity<=0` → sold-out state.

### 3.4 Merchandising (`shop_sections`, category pins)
- `site_settings.shop_sections` still drives the curated section feed component
  (retained but the shop landings now default to the flat grid; keep the data
  valid for any surface that still uses it).
- Category page ordering honours admin pins via the existing merchandising
  hooks (`useCategoryPagePins`). Keep that admin tool working.

### 3.5 RPCs the redesign calls (must exist/behave unchanged)
`search_products`, `record_search_miss`, `run_quiz_recommendation`,
`run_push_gift_recommendation`, `save_quiz_lead`.

---

## 4. Admin section — what must be manageable for go-live

1. **Categories** (`product_categories`): create/edit with `name`, `slug`,
   `parent_category` (baby/mum/both), `icon` (emoji), `display_order`,
   `is_active`, and optional `merch_page_label`. This is now the backbone of the
   whole shop nav and the subcategory pages — it must be fully editable and
   validated (unique slugs, emoji icon, a parent).
2. **Product → subcategory assignment**: admin must be able to set each
   product's `subcategory` to a category slug (and `category` to
   baby/mum/push-gift). Products without a valid `subcategory` are invisible on
   subcategory pages. A bulk assignment / validation view is strongly advised.
3. **Brands** (`brands_public`): manage price, compare_at_price, tier,
   size_variant, stock, and **sku** per brand. SKUs must be unique per product.
4. **Merchandising**: keep `shop_sections` editor and category pins working.
5. **Shop filter/sort config** (`site_settings`): `shop_enabled_sorts`,
   `shop_show_price_filter`, `shop_show_instock_filter`.
6. **Quiz config**: the quiz label/copy `site_settings` keys (§5),
   `quiz_min_budget`, and the existing quiz engine tables
   (`quiz_questions`, `quiz_options`, `quiz_routing_rules`,
   `quiz_target_counts`, `quiz_adjustment_rules`) and lead list
   (`quiz_customers` / `save_quiz_lead`). `products.quiz_section` must be
   editable per product (drives results grouping).
7. **Gift subcategories**: the gift flow expects the three gift categories to
   resolve products (`postpartum_kits`, `baby_shower_boxes`, `push_gifts`) via
   the push-gift engine. Ensure eligible products exist for each.

---

## 5. site_settings keys the new design reads

Shop:
- `shop_enabled_sorts` (which sort options show)
- `shop_show_price_filter` (default true)
- `shop_show_instock_filter` (default true)
- `shop_sections` (curated section feed data)
- `free_delivery_nationwide_threshold_naira` (spend-more banner)

Quiz labels/copy (all have hardcoded fallbacks; admin should own them):
- `quiz_label_budget`, `quiz_label_what_you_need`,
  `quiz_label_what_you_need_hint`, `quiz_label_gender`, `quiz_cta_label`
- `quiz_min_budget`
- `quiz_category_maternity_title` / `_sub`, `quiz_category_baby_title` / `_sub`,
  `quiz_category_gift_title` / `_sub`
- `quiz_gender_boy_title` / `_sub`, `quiz_gender_girl_title` / `_sub`,
  `quiz_gender_surprise_title` / `_sub`

---

## 6. New / placeholder copy fields to add (backend TODO)

These strings are currently hardcoded in the redesign (no admin field yet). Add
columns so admin owns them; until then they render sensible placeholders.

1. **Shop landing subtitles** — the short line under each shop title
   ("Everything for mum and baby in one place…", the baby and mum variants).
   Propose `site_settings.shop_all_subtitle`, `shop_baby_subtitle`,
   `shop_mum_subtitle`.
2. **Trust strip items** — "Fast Lagos delivery / Authentic brands / Easy
   returns" are UI chrome; if marketing wants them editable, propose
   `site_settings.shop_trust_items` (JSON `[{icon,label}]`).
3. **Quiz step helper lines** — the one-line helper under each wizard step
   ("We match products to what you want to spend.", "This helps us pick
   colours…"). Optional: `quiz_help_budget`, `quiz_help_gender`.
4. Anything from the earlier **homepage** audit still applies — see
   `docs/storefront-redesign-backend-audit.md` (home_categories, hero slides,
   deals source, etc.).

Everything else (product names, prices, images, ratings, brands, category
names/icons, bundle content, announcement bar, free-delivery threshold) already
resolves from the DB.

---

## 7. Analytics events fired by the new flows (for GA/pipeline readiness)

Quiz: `quiz_start`, `quiz_step`, `quiz_complete`, `quiz_abandon`,
`quiz_results_view`, `quiz_add_to_cart`. Ecommerce: `view_item_list`,
`select_item`, `add_to_cart`. Meta pixel: `Search`, `ViewContent`, `Lead`.
No backend change required unless you consume these server-side.

---

## 8. Go-live data checklist

- [ ] Every active `product_categories` row has: unique URL-safe `slug`,
      a `parent_category` (baby/mum/both), an `icon` emoji, a `display_order`.
- [ ] Every live `product` has `category` set (baby/mum/push-gift) and
      `subcategory` set to a valid category slug.
- [ ] Multi-brand products have unique `sku` on every `brands_public` row.
- [ ] `products.quiz_section` populated for items that should group in quiz
      results.
- [ ] At least some products exist for `category = 'push-gift'` (Gifts tab) and
      for each gift subcategory used by the gift quiz.
- [ ] `search_products`, `run_quiz_recommendation`,
      `run_push_gift_recommendation`, `save_quiz_lead`, `record_search_miss`
      RPCs deployed and healthy.
- [ ] Quiz `site_settings` labels + `quiz_min_budget` set.
- [ ] Shop filter toggles + `shop_enabled_sorts` set as desired.
- [ ] Admin can edit categories, product subcategory/category, brands+SKUs,
      merchandising sections, and quiz config.
- [ ] Redirects for any old category URLs if slugs changed
      (old `/shop/:slug` query-param links → new `/shop/{parent}/{slug}`).
