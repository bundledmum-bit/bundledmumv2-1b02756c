import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Brand-specific colours for the result cards.
 *
 * Some brands only come in their own colours — a Cussons gift pack is Pink or
 * Blue and nothing else — so offering her the full gender palette on that card
 * would promise a colour we cannot ship. When a brand has its own colours they
 * REPLACE the palette for that card; when it has none (the overwhelming
 * majority) the card keeps showing her ticked palette colours.
 *
 * One call for the whole page: brand_colours_bulk(uuid[], text) takes every
 * product id on the results page and returns an object keyed by brand id. A
 * brand with no colours of its own is simply absent from that object, which
 * is exactly the "fall back to the global palette" signal the resolver wants.
 *
 * This deliberately does NOT query product_colors directly. The colour rules
 * (which rows count as brand-specific, how gender is matched, stock and
 * ordering) belong in one place; duplicating them here would let the two
 * drift apart silently the next time they change.
 */
export interface BrandColour {
  name: string;
  hex: string;
}

export function useBrandColours(productIds: string[], gender: string | null) {
  const key = gender === "boy" || gender === "girl" ? gender : "neutral";
  const ids = useMemo(() => [...new Set(productIds.filter(Boolean))].sort(), [productIds]);

  const query = useQuery({
    queryKey: ["brand_colours", key, ids.join(",")],
    enabled: ids.length > 0 && !!gender,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("brand_colours_bulk", {
        p_product_ids: ids,
        p_gender: key,
      });
      if (error) {
        // A failure here must not strip the palette off every card, so the
        // empty map falls everything back to the global palette.
        console.warn("[BrandColours] brand_colours_bulk failed:", error.message);
        return new Map<string, BrandColour[]>();
      }
      const map = new Map<string, BrandColour[]>();
      Object.entries((data || {}) as Record<string, BrandColour[]>).forEach(([brandId, colours]) => {
        if (Array.isArray(colours) && colours.length) map.set(brandId, colours);
      });
      return map;
    },
  });

  const byBrand = query.data ?? new Map<string, BrandColour[]>();

  /**
   * Colours for one brand, or [] when it has none of its own. Switching brand
   * on a card is just another lookup in this map — no new request.
   */
  return useMemo(
    () => (brandId: string | null | undefined): BrandColour[] =>
      (brandId ? byBrand.get(brandId) : undefined) ?? [],
    [byBrand],
  );
}
