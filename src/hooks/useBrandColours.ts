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
 * Batched deliberately: one request covers every card on the page, keyed on
 * the result set's product ids. The brand_colours(uuid, text) RPC answers for
 * a single brand, so using it would mean one call per card — this reads the
 * same product_colors rows with the same filters (gender_match, in_stock,
 * display_order) in a single round trip. Only 8 of ~1,466 colour rows carry a
 * brand_id at all, so the response is tiny.
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
      const { data, error } = await (supabase as any)
        .from("product_colors")
        .select("brand_id, color_name, color_hex, display_order")
        .in("product_id", ids)
        // brand_id NOT NULL is what makes a colour brand-specific; every other
        // row is product-level and belongs to the global palette path.
        .not("brand_id", "is", null)
        .eq("gender_match", key)
        .eq("in_stock", true)
        .order("display_order");
      if (error) {
        console.warn("[BrandColours] lookup failed:", error.message);
        return new Map<string, BrandColour[]>();
      }
      const map = new Map<string, BrandColour[]>();
      (data || []).forEach((r: any) => {
        const list = map.get(r.brand_id) || [];
        list.push({ name: r.color_name, hex: r.color_hex });
        map.set(r.brand_id, list);
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
