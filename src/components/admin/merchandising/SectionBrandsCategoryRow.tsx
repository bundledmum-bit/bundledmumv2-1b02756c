import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;
import type { ProductCategory } from "@/hooks/useProductCategories";
import { SectionBrandsProductRow } from "./SectionBrandsProductRow";

interface CategoryProductRow {
  id: string;
  name: string;
  image_url: string | null;
}

/**
 * One collapsible row per category. When expanded:
 *   - Loads the active product list for `subcategory = slug`.
 *   - Subscribes to realtime updates on `merch_category_section_brands`
 *     filtered by this category, so admin edits propagate immediately.
 */
export function SectionBrandsCategoryRow({
  category,
  expanded,
  onToggle,
}: {
  category: ProductCategory;
  expanded: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();

  const { data: products = [], isLoading } = useQuery<CategoryProductRow[]>({
    queryKey: ["section_brands_products_in_category", category.slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, image_url")
        .eq("subcategory", category.slug)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data || []) as CategoryProductRow[];
    },
    enabled: expanded,
    staleTime: 60 * 1000,
  });

  // Realtime — keep section_brands queries fresh while the row is open.
  useEffect(() => {
    if (!expanded) return;
    const channel = supabase
      .channel(`section_brands_${category.slug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "merch_category_section_brands",
          filter: `category_slug=eq.${category.slug}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["merch_category_section_brands", category.slug] });
          qc.invalidateQueries({ queryKey: ["section_brands", category.slug] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [expanded, category.slug, qc]);

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="flex items-center gap-2 p-3">
        <button onClick={onToggle} className="p-1 text-text-med hover:text-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {category.icon && <span className="text-lg">{category.icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{category.name}</div>
          <div className="text-[11px] text-text-light">{category.slug}</div>
        </div>
        <span className="text-[11px] bg-muted px-2 py-0.5 rounded font-semibold text-text-med">
          {expanded ? `${products.length} product${products.length === 1 ? "" : "s"}` : "—"}
        </span>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 bg-muted/20 space-y-2">
          {isLoading ? (
            <div className="text-xs text-text-med">Loading products…</div>
          ) : products.length === 0 ? (
            <div className="text-xs text-text-med">No products in this category.</div>
          ) : (
            <ProductList categorySlug={category.slug} products={products} />
          )}
        </div>
      )}
    </div>
  );
}

function ProductList({
  categorySlug,
  products,
}: {
  categorySlug: string;
  products: CategoryProductRow[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {products.map(p => (
        <SectionBrandsProductRow
          key={p.id}
          categorySlug={categorySlug}
          product={p}
          expanded={expandedId === p.id}
          onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
        />
      ))}
    </div>
  );
}
