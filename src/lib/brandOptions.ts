type BrandNameLike = { label?: string | null; sku?: string | null; id?: string };

/**
 * Display name for a brand within its product's brand list.
 *
 * Some products carry several genuinely different variants (different designs
 * or patterns) that were all saved under the same brand_name — e.g. a product
 * with 7 "Generic" brands. Rendered as-is in a picker they read as identical,
 * unpickable options. When two or more brands on the SAME product share a name,
 * we append the SKU (unique and stable per brand row) so every option is
 * distinct and selectable, e.g. "Generic - CLO-045".
 *
 * When a product's brand names are already unique there is no collision and the
 * name is returned exactly as-is — no suffix is added. Use this everywhere a
 * product's brands are listed for selection so the rule stays consistent.
 */
export function brandOptionName(brand: BrandNameLike, brands: BrandNameLike[]): string {
  const name = (brand.label ?? "").trim();
  const collides = brands.filter((b) => (b.label ?? "").trim() === name).length > 1;
  if (!collides) return name;
  // Prefer the SKU; fall back to a short id slice so the option is still unique
  // even on the rare brand row with no SKU.
  const suffix = (brand.sku && brand.sku.trim()) || (brand.id ? brand.id.slice(0, 6) : "");
  return suffix ? `${name} - ${suffix}` : name;
}
