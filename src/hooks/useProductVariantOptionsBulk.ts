import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProductVariantOptions } from "@/hooks/useProductVariantOptions";

/**
 * Variant options for a whole page of rows in ONE request.
 *
 * The answer depends on the brand selected for each row, so the input is a
 * list of (product_id, brand_id) pairs rather than a list of ids. The result
 * is keyed by product_id and each value has exactly the shape the single
 * get_product_variant_options returns, so both callers share one set of rules.
 *
 * A 44-row hospital list is one call, not 44.
 */
export interface VariantPair {
  product_id: string;
  brand_id: string | null;
}

export function useProductVariantOptionsBulk(pairs: VariantPair[]) {
  // Stable key: the same rows with the same brands must not refetch on every
  // render, but changing a row's brand must.
  const signature = useMemo(
    () =>
      pairs
        .map((p) => `${p.product_id}:${p.brand_id ?? ""}`)
        .sort()
        .join(","),
    [pairs],
  );

  const query = useQuery({
    queryKey: ["product_variant_options_bulk", signature],
    enabled: pairs.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_product_variant_options_bulk", {
        p_pairs: pairs,
      });
      if (error) {
        console.warn("[VariantOptionsBulk] fetch failed:", error.message);
        return new Map<string, ProductVariantOptions>();
      }
      const map = new Map<string, ProductVariantOptions>();
      Object.entries((data || {}) as Record<string, ProductVariantOptions>).forEach(([pid, opts]) => {
        if (opts) map.set(pid, opts);
      });
      return map;
    },
  });

  const byProduct = query.data ?? new Map<string, ProductVariantOptions>();
  return useMemo(
    () => (productId: string | null | undefined): ProductVariantOptions | null =>
      (productId ? byProduct.get(productId) : undefined) ?? null,
    [byProduct],
  );
}
