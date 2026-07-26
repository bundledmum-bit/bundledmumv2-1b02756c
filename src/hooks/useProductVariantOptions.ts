import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gender / colour / size options for one product, optionally scoped to the
 * brand currently selected on the page.
 *
 * This is the single source of truth for the product page's variant pickers.
 * It replaces two overlapping controls that read product.colors directly —
 * raw product_colors rows, unfiltered by gender, brand or stock and
 * undeduped, which is why Baby Ball Dress listed 18 colours and Baby Skincare
 * Set listed duplicates.
 *
 * requires_color / requires_size come from the same call as the options, so
 * the add-to-cart guard and the pickers can never disagree: a product whose
 * colours belong to another brand does not demand a colour, and one whose
 * selected brand brings its own does.
 */
export interface VariantGender {
  value: string;
  label: string;
  is_default: boolean;
}

export interface VariantColor {
  name: string;
  hex: string | null;
}

export interface VariantSize {
  label: string;
  code: string | null;
  is_default: boolean;
}

export interface ProductVariantOptions {
  product_id: string;
  brand_id: string | null;
  source: "product" | "brand";
  has_gender: boolean;
  default_gender: string;
  genders: VariantGender[];
  colors_by_gender: Record<string, VariantColor[]>;
  default_color: string | null;
  has_sizes: boolean;
  sizes: VariantSize[];
  requires_color: boolean;
  requires_size: boolean;
  /**
   * true  — the colours belong to this brand and are real, so opening on one
   *         is a genuine default (a Cussons pack really is Blue or Pink).
   * false — the colours are the generic palette applied across ~81 products.
   *         Offer them, but presume none: BundledMum sources on demand, so
   *         the choice is hers to make, not ours to assume.
   */
  preselect_default: boolean;
}

export function useProductVariantOptions(
  productId: string | null | undefined,
  brandId: string | null | undefined,
) {
  const query = useQuery({
    // brandId is in the key: switching brand refetches, because a different
    // brand may bring its own colours or none at all.
    queryKey: ["product_variant_options", productId, brandId ?? null],
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProductVariantOptions | null> => {
      const { data, error } = await (supabase as any).rpc("get_product_variant_options", {
        p_product_id: productId,
        p_brand_id: brandId ?? null,
      });
      if (error) {
        console.warn("[ProductVariantOptions] fetch failed:", error.message);
        return null;
      }
      return (data as unknown as ProductVariantOptions) ?? null;
    },
  });

  return { options: query.data ?? null, isLoading: query.isLoading };
}

/** Colours for a gender, in the order the function returned them. */
export function colorsForGender(
  options: ProductVariantOptions | null,
  gender: string,
): VariantColor[] {
  if (!options) return [];
  return options.colors_by_gender?.[gender] ?? [];
}
