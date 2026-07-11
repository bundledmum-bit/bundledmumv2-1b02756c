import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Lightweight lookup of which products require a size / color, keyed by
// product_id. Used by entry points that build cart payloads WITHOUT the
// product.sizes / product.colors arrays (e.g. quiz / gift recommendation
// cards, which come from RPCs that don't return those relations), so they
// can still gate add-to-cart at the source. Paths that already carry the
// mapped product's sizes/colors don't need this — the cart-level guard and
// their own UI handle them.
//
// Only ~20 products require size and ~5 require color, so this is a tiny,
// cache-friendly pair of id lists (5 min staleTime).
export interface VariantRequirements {
  requiresSize: (productId: string | number | null | undefined) => boolean;
  requiresColor: (productId: string | number | null | undefined) => boolean;
  /** Missing required axes for a given product + current selections. */
  missingAxes: (
    productId: string | number | null | undefined,
    size?: string | null,
    color?: string | null,
  ) => ("size" | "color")[];
  /** A sensible pre-set default size (is_default row, else first by
   *  display_order) — used to auto-assign variants to bundle items. */
  defaultSize: (productId: string | number | null | undefined) => string | null;
  /** Default color (first by display_order). */
  defaultColor: (productId: string | number | null | undefined) => string | null;
  ready: boolean;
}

export function useVariantRequirements(): VariantRequirements {
  const { data } = useQuery({
    queryKey: ["variant-requirements"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [sizeRes, colorRes] = await Promise.all([
        supabase.from("product_sizes").select("product_id, size_label, display_order, is_default"),
        supabase.from("product_colors").select("product_id, color_name, display_order"),
      ]);
      const sizeIds = new Set<string>();
      const colorIds = new Set<string>();
      // Default size per product: prefer is_default, else lowest display_order.
      const defaultSizes = new Map<string, { label: string; order: number; isDefault: boolean }>();
      for (const r of (sizeRes.data || []) as any[]) {
        const pid = String(r.product_id);
        sizeIds.add(pid);
        const cur = defaultSizes.get(pid);
        const cand = { label: r.size_label, order: r.display_order ?? 0, isDefault: !!r.is_default };
        if (!cur || (cand.isDefault && !cur.isDefault) || (cand.isDefault === cur.isDefault && cand.order < cur.order)) {
          defaultSizes.set(pid, cand);
        }
      }
      const defaultColors = new Map<string, { name: string; order: number }>();
      for (const r of (colorRes.data || []) as any[]) {
        const pid = String(r.product_id);
        colorIds.add(pid);
        const cur = defaultColors.get(pid);
        const cand = { name: r.color_name, order: r.display_order ?? 0 };
        if (!cur || cand.order < cur.order) defaultColors.set(pid, cand);
      }
      return { sizeIds, colorIds, defaultSizes, defaultColors };
    },
  });

  const requiresSize = (id: string | number | null | undefined) =>
    !!data && id != null && data.sizeIds.has(String(id));
  const requiresColor = (id: string | number | null | undefined) =>
    !!data && id != null && data.colorIds.has(String(id));

  return {
    requiresSize,
    requiresColor,
    missingAxes: (id, size, color) => {
      const missing: ("size" | "color")[] = [];
      if (requiresSize(id) && !size) missing.push("size");
      if (requiresColor(id) && !color) missing.push("color");
      return missing;
    },
    defaultSize: (id) => (data && id != null ? data.defaultSizes.get(String(id))?.label ?? null : null),
    defaultColor: (id) => (data && id != null ? data.defaultColors.get(String(id))?.name ?? null : null),
    ready: !!data,
  };
}
