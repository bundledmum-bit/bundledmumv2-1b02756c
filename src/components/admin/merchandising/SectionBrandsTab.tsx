import { useMemo, useState } from "react";
import { useProductCategories } from "@/hooks/useProductCategories";
import { SectionBrandsCategoryRow } from "./SectionBrandsCategoryRow";

/**
 * "Section Brands" tab in the merchandising admin.
 *
 * Drill-down: category → product → brand. The tab itself does nothing more
 * than render the sorted list of categories; each row is responsible for
 * its own data and realtime subscription so we don't pay the cost of
 * loading every product's brands up front.
 */
export default function SectionBrandsTab() {
  const { data: categories = [], isLoading } = useProductCategories();
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const sorted = useMemo(() => {
    // baby → mum → both → other (consistent with the Categories tab).
    const parentRank = (p: string | null) => {
      if (p === "baby") return 0;
      if (p === "mum") return 1;
      if (p === "both") return 2;
      return 3;
    };
    return [...categories].sort((a, b) => {
      const pa = parentRank(a.parent_category);
      const pb = parentRank(b.parent_category);
      if (pa !== pb) return pa - pb;
      const sa = a.stage_order ?? Number.POSITIVE_INFINITY;
      const sb = b.stage_order ?? Number.POSITIVE_INFINITY;
      if (sa !== sb) return sa - sb;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [categories]);

  if (isLoading) return <div className="text-sm text-text-med">Loading…</div>;
  if (sorted.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-sm text-text-med">No categories.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-med">
        Override how brand swipers render on each <code>/shop/[category]</code> product
        section. Brands without a row use defaults — set a label, hide a brand, or pin
        a custom order. Reset any brand to drop the override.
      </p>
      {sorted.map(cat => (
        <SectionBrandsCategoryRow
          key={cat.slug}
          category={cat}
          expanded={expandedSlug === cat.slug}
          onToggle={() => setExpandedSlug(expandedSlug === cat.slug ? null : cat.slug)}
        />
      ))}
    </div>
  );
}
