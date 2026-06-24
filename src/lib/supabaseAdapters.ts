/**
 * Adapters to transform Supabase query results into the existing
 * component-friendly types used throughout the storefront.
 */
import { getProductImage } from "@/assets/products";
import { getBrandImage } from "@/lib/brandImage";

// ─── Legacy types used by components ───────────────────────────

export interface Brand {
  id: string;
  label: string;
  price: number;
  compareAtPrice?: number | null;
  img: string;
  imageUrl?: string | null;
  /** Gallery images for this brand variant. Falls back to [imageUrl]
   *  when the DB array is empty — populated from brands.images (TEXT[]). */
  images?: string[];
  logoUrl?: string | null;
  tier: number;
  color: string;
  stockQuantity?: number | null;
  inStock?: boolean;
  sizeVariant?: string | null;
  /** Diaper-category attributes (also useful for any pack-based product). */
  weightRangeKg?: string | null;
  packCount?: number | null;
  diaperType?: "Tape" | "Pant" | "Underlay" | string | null;
  sku?: string | null;
  displayOrder?: number | null;
  /** Optional variant axis for products that ship in multiple ages/sizes
   * (e.g. baby bouncer ages, bedding-set sizes). NULL → no variant axis. */
  variantType?: "age_range" | "size" | null;
}

export interface Product {
  id: string;
  name: string;
  baseImg: string;
  imageUrl?: string;
  rating: number;
  reviews: number;
  tags: string[];
  badge: string | null;
  brands: Brand[];
  category: string;
  subcategory?: string | null;
  // Quiz-result section assignment (DB-canonical). Drives the
  // Hospital/Mum/Baby grouping in HomeQuiz.tsx → sectionFor().
  quiz_section?: "mum_essentials" | "baby_essentials" | "hospital_consumables" | null;
  productSlot?: string | null;
  stage: string[];
  priority: "essential" | "recommended" | "nice-to-have";
  tier: string[];
  hospitalType: string[];
  deliveryMethod: string[];
  genderRelevant: boolean;
  genderColors?: { boy: string; girl: string; neutral: string };
  // Catalog colours from product_colors (e.g. Nylon Bag: Black/Red). Distinct
  // from genderColors (boy/girl/neutral). A product "has colours" iff this is
  // non-empty, which drives the data-driven colour-required rule.
  colors?: { name: string; hex?: string | null }[];
  multiplesBump: number;
  scope: string[];
  firstBaby: boolean | null;
  description: string;
  whyIncluded: string | Record<string, string>;
  sizes?: string[];
  contents?: string[];
  material?: string;
  allergenInfo?: string;
  packInfo?: string;
  stock?: number;
  slug?: string;
  safetyInfo?: string;
  /** True when the product-level OOS flag is set, regardless of brand stock. */
  isOutOfStock: boolean;
}

// ─── OOS helper ───────────────────────────────────────────────

/**
 * Returns true if:
 *   - product.isOutOfStock is true, OR
 *   - every brand on the product has inStock === false
 */
/**
 * A product is "shoppable" on the storefront if at least one of its real
 * brand variants is currently in stock. Use this as the customer-facing
 * gate for category pages, search, recommendations, cart cross-sell, etc.
 *
 * Note: `product.brands` is already pruned by adaptProduct to drop admin
 * placeholders (price=0 or 'Brand TBD%'), so a brand reaching this point
 * is by definition a real one — the only thing left to check is in-stock.
 */
export function isProductShoppable(product: Product): boolean {
  if (!product) return false;
  if (!Array.isArray(product.brands) || product.brands.length === 0) return false;
  return product.brands.some(b => b && b.inStock !== false && (b.price || 0) > 0);
}

export function isProductOOS(product: Product): boolean {
  if (product.isOutOfStock) return true;
  if (product.brands.length > 0 && product.brands.every(b => b.inStock === false)) return true;
  return false;
}

export interface BundleItem {
  name: string;
  brand: string;
  forWhom: "baby" | "mum";
  price: number;
  emoji?: string;
  imageUrl?: string | null;
  productId?: string | null;
  brandId?: string | null;
  section?: "mum" | "baby" | "hospital" | "convenience";
}

export interface Bundle {
  id: string;
  name: string;
  // Customer-facing title (DB column bundles.display_name). Internal `name`
  // stays the source of truth for admin/orders; pages render displayName
  // when present and fall back to name.
  displayName?: string | null;
  price: number;
  separateTotal: number;
  icon: string;
  imageUrl?: string | null;
  color: string;
  lightColor: string;
  tagline: string;
  badge?: string;
  tier: "Starter" | "Standard" | "Premium";
  hospitalType: "public" | "private" | "gift";
  deliveryType?: "vaginal" | "csection";
  babyItems: BundleItem[];
  mumItems: BundleItem[];
  hospitalItems: BundleItem[];
  convenienceItems: BundleItem[];
  upsellBundleId?: string | null;
  upsellText?: string | null;
  slug?: string;
  description?: string;
  deliveryMethod?: string | null;
  itemCount?: number;
  discountPercent?: number;
  priceMode?: string;
}

// ─── Tier mapping ──────────────────────────────────────────────

const TIER_MAP: Record<string, number> = { starter: 0, standard: 1, premium: 2 };
const TIER_COLORS: Record<string, string> = {
  starter: "#E3F2FD",
  standard: "#E8F5E9",
  premium: "#FCE4EC",
};

// ─── Image helper ──────────────────────────────────────────────

export function getProductImageUrl(product: any, selectedBrand?: Brand | null): string | null {
  if (selectedBrand?.imageUrl) return selectedBrand.imageUrl;
  const images = product.product_images || [];
  const primary = images.find((i: any) => i.is_primary) || images[0];
  if (primary?.image_url) return primary.image_url;
  if (product.imageUrl || product.image_url) return product.imageUrl || product.image_url;
  return null;
}

// ─── Product adapter ───────────────────────────────────────────

export function adaptProduct(row: any): Product {
  const tags = (row.product_tags || []) as any[];
  const images = (row.product_images || []) as any[];
  const primaryImage = images.find((i: any) => i.is_primary) || images[0];
  const imageUrl = primaryImage?.image_url || row.image_url || getProductImage(row.slug) || null;
  const tierTags = tags.filter((t: any) => t.tag_type === "tier").map((t: any) => t.tag_value);
  const hospitalTags = tags.filter((t: any) => t.tag_type === "hospital_type").map((t: any) => t.tag_value);
  const deliveryTags = tags.filter((t: any) => t.tag_type === "delivery_method").map((t: any) => t.tag_value);
  const scopeTags = tags.filter((t: any) => t.tag_type === "scope").map((t: any) => t.tag_value);
  const stageTags = tags.filter((t: any) => t.tag_type === "stage").map((t: any) => t.tag_value);

  // Strip admin placeholders before adapting. A brand is "real" only if
  // it has a positive price AND a name that isn't the "Brand TBD..."
  // sentinel sales/marketing uses while a SKU is being sourced. These
  // placeholders must never reach customer-facing UI — they show as
  // "₦0" and pollute the variant picker.
  // OOS real brands (in_stock=false but priced + named) are kept on
  // purpose so the product detail page can still surface them with
  // their "out of stock" badge.
  const brands: Brand[] = ((row.brands || []) as any[])
    .filter((b: any) => {
      const price = Number(b?.price) || 0;
      const name = String(b?.brand_name || "");
      if (price <= 0) return false;
      if (/^brand tbd/i.test(name.trim())) return false;
      return true;
    })
    .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
    .map((b: any) => {
      // Gallery images: prefer the DB array, fall back to the single
      // brand image (stored copy first via getBrandImage) so older
      // variants still render something.
      const dbImages: string[] = Array.isArray(b.images) ? b.images.filter(Boolean) : [];
      const fallback = getBrandImage(b) || b.thumbnail_url;
      const images = dbImages.length > 0 ? dbImages : (fallback ? [fallback] : []);
      return {
        id: b.id,
        label: b.brand_name,
        price: b.price,
        compareAtPrice: b.compare_at_price || null,
        img: row.emoji || "📦",
        imageUrl: getBrandImage(b),
        images,
        logoUrl: b.logo_url || null,
        tier: TIER_MAP[b.tier] ?? 1,
        color: TIER_COLORS[b.tier] || "#E8F5E9",
        stockQuantity: b.stock_quantity,
        inStock: b.in_stock !== false,
        sizeVariant: b.size_variant || null,
        weightRangeKg: b.weight_range_kg || null,
        packCount: b.pack_count != null ? Number(b.pack_count) : null,
        diaperType: b.diaper_type || null,
        sku: b.sku || null,
        variantType: b.variant_type || null,
        displayOrder: b.display_order != null ? Number(b.display_order) : null,
      };
    });

  const sizes = ((row.product_sizes || []) as any[])
    .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
    .map((s: any) => s.size_label);

  const colors = ((row.product_colors || []) as any[])
    .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
    .map((c: any) => ({ name: c.color_name, hex: c.color_hex || null }))
    .filter((c: any) => !!c.name);

  const genderColors = row.gender_colors as any;
  const contentsArr = row.contents
    ? row.contents.split(",").map((c: string) => c.trim()).filter(Boolean)
    : undefined;

  return {
    id: row.id,
    name: row.name,
    baseImg: row.emoji || "📦",
    imageUrl: imageUrl || undefined,
    rating: Number(row.rating) || 4.5,
    reviews: row.review_count || 0,
    tags: tags.map((t: any) => `${t.tag_type}:${t.tag_value}`),
    badge: row.badge || null,
    brands,
    category: row.category,
    subcategory: row.subcategory || null,
    quiz_section: row.quiz_section ?? null,
    productSlot: row.product_slot || null,
    stage: stageTags.length ? stageTags : ["expecting", "newborn", "0-3m"],
    priority: row.priority as any,
    tier: tierTags,
    hospitalType: hospitalTags.length ? hospitalTags : ["both"],
    deliveryMethod: deliveryTags.length ? deliveryTags : ["both"],
    genderRelevant: row.gender_relevant || false,
    genderColors: genderColors || undefined,
    multiplesBump: Number(row.multiples_bump) || 1,
    scope: scopeTags.length ? scopeTags : ["hospital-bag", "general-baby-prep"],
    firstBaby: row.first_baby,
    description: row.description || "",
    whyIncluded: row.why_included_variants || row.why_included || "",
    sizes: sizes.length ? sizes : undefined,
    colors: colors.length ? colors : undefined,
    contents: contentsArr,
    material: row.material || undefined,
    allergenInfo: row.allergen_info || undefined,
    safetyInfo: row.safety_info || undefined,
    packInfo: row.pack_count || undefined,
    stock: undefined,
    slug: row.slug,
    isOutOfStock: row.is_out_of_stock ?? false,
  };
}

/**
 * Adapt a list of product rows. Defaults to filtering OUT inactive/soft-deleted
 * rows — this is the storefront safety net so a forgotten `.eq('is_active', true)`
 * upstream can never leak an inactive product onto a customer-facing surface.
 *
 * Admin call sites that legitimately need to see inactive/trashed products MUST
 * pass `{ includeInactive: true }`. As of writing, no admin path goes through
 * adaptProducts — admin pages render raw rows directly from supabase queries —
 * but the option is here for future-proofing.
 */
export function adaptProducts(
  rows: any[],
  opts: { includeInactive?: boolean; includeUnshoppable?: boolean } = {}
): Product[] {
  const safe = opts.includeInactive
    ? rows || []
    : (rows || []).filter((r: any) => r && r.is_active !== false && !r.deleted_at);
  const adapted = safe.map(adaptProduct);
  if (opts.includeUnshoppable) return adapted;
  // Drop products with no shoppable brand variant — they can't be added
  // to cart so showing them on listings is pure dead-end UX.
  return adapted.filter(isProductShoppable);
}

// ─── Bundle adapter ────────────────────────────────────────────

const HOSPITAL_COLORS: Record<string, { color: string; light: string }> = {
  public: { color: "#1565C0", light: "#E3F2FD" },
  private: { color: "#880E4F", light: "#FCE4EC" },
  gift: { color: "#C62828", light: "#FFEBEE" },
};

export function adaptBundle(row: any): Bundle {
  // Belt-and-braces: drop any bundle_item whose joined product is inactive
  // or soft-deleted. The query layer already pushes this filter down via
  // PostgREST (`bundle_items.products.is_active = true`), but if a future
  // refactor accidentally drops that filter, this guard ensures inactive
  // products never render on the storefront.
  const items = ((row.bundle_items || []) as any[])
    .filter((bi: any) => {
      // If there's no joined product (e.g. brand-only line), keep the item.
      if (!bi || bi.products == null) return true;
      const p = bi.products;
      if (p.is_active === false || p.deleted_at) return false;
      // Drop bundle items whose chosen brand is an admin placeholder
      // (Brand TBD or ₦0). These would render as a ₦0 line item and
      // confuse the bundle's stated price.
      const b = bi.brands;
      if (b) {
        const price = Number(b.price) || 0;
        const name = String(b.brand_name || "");
        if (price <= 0) return false;
        if (/^brand tbd/i.test(name.trim())) return false;
      }
      return true;
    })
    .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));

  const babyItems: BundleItem[] = [];
  const mumItems: BundleItem[] = [];
  const hospitalItems: BundleItem[] = [];
  const convenienceItems: BundleItem[] = [];

  items.forEach((bi: any) => {
    const prod = bi.products;
    const brand = bi.brands;
    const item: BundleItem = {
      name: prod?.name || "Unknown",
      brand: brand?.brand_name || "Standard",
      forWhom: (prod?.category === "mum" ? "mum" : "baby") as "baby" | "mum",
      price: (brand?.price || 0) * (bi.quantity || 1),
      emoji: prod?.emoji || "📦",
      imageUrl: brand?.image_url || prod?.image_url || null,
      productId: bi.product_id || prod?.id || null,
      brandId: bi.brand_id || brand?.id || null,
      section: bi.section || undefined,
    };
    const itemSection = bi.section;
    if (itemSection === "convenience") convenienceItems.push(item);
    else if (itemSection === "hospital" || prod?.subcategory === "maternity-postpartum") hospitalItems.push(item);
    else if (item.forWhom === "mum") mumItems.push(item);
    else babyItems.push(item);
  });

  const separateTotal = [...babyItems, ...mumItems, ...hospitalItems, ...convenienceItems].reduce((s, i) => s + i.price, 0);
  const colors = HOSPITAL_COLORS[row.hospital_type] || HOSPITAL_COLORS.public;

  const priceMode = row.price_mode || "fixed";
  const discountPercent = Number(row.discount_percent) || 0;

  // Compute effective price
  let effectivePrice = row.price;
  if (priceMode === "percentage" && separateTotal > 0 && discountPercent > 0) {
    effectivePrice = Math.round(separateTotal * (1 - discountPercent / 100));
  }

  return {
    id: row.slug || row.id,
    name: row.name,
    displayName: row.display_name ?? null,
    price: effectivePrice,
    separateTotal: separateTotal || Math.round(effectivePrice * 1.2),
    icon: row.emoji || "📦",
    imageUrl: row.image_url || null,
    color: colors.color,
    lightColor: colors.light,
    tagline: row.description || "",
    tier: row.tier === "premium" ? "Premium" : row.tier === "standard" ? "Standard" : "Starter",
    hospitalType: row.hospital_type as any,
    deliveryType: row.delivery_method as any || undefined,
    babyItems,
    mumItems,
    hospitalItems,
    convenienceItems,
    upsellBundleId: row.upsell_bundle_id || null,
    upsellText: row.upsell_text || null,
    slug: row.slug,
    description: row.description || "",
    deliveryMethod: row.delivery_method || null,
    itemCount: row.item_count || items.length,
    discountPercent,
    priceMode,
  };
}

export function adaptBundles(rows: any[]): Bundle[] {
  return (rows || []).map(adaptBundle);
}

// ─── Browser ID ────────────────────────────────────────────────

export function getBrowserId(): string {
  const KEY = "bm-browser-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getSessionId(): string {
  let sid = sessionStorage.getItem("bm-session-id");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("bm-session-id", sid);
  }
  return sid;
}
