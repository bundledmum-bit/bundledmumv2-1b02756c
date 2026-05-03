import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useSectionBrands,
  useResetAllSectionBrands,
  useReorderSectionBrands,
  type SectionBrandRow,
} from "@/hooks/useMerchandising";
import { SectionBrandsBrandRow } from "./SectionBrandsBrandRow";

/**
 * Collapsible product row inside a category. Header shows brand counts and
 * a "Reset all" affordance; expanding reveals the editable brand list.
 */
export function SectionBrandsProductRow({
  categorySlug,
  product,
  expanded,
  onToggle,
}: {
  categorySlug: string;
  product: { id: string; name: string; image_url: string | null };
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: brandRows = [], isLoading } = useSectionBrands(categorySlug, product.id, expanded);
  const resetAll = useResetAllSectionBrands();
  const reorder = useReorderSectionBrands();

  const editedCount = useMemo(
    () => brandRows.filter((r: SectionBrandRow) => r.isOverridden).length,
    [brandRows],
  );

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= brandRows.length) return;
    const ids = brandRows.map(r => r.brand.id);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    reorder.mutate({ categorySlug, productId: product.id, brandIdsInOrder: ids });
  };

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="flex items-center gap-2 p-2">
        <button onClick={onToggle} className="p-1 text-text-med hover:text-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <ProductThumb src={product.image_url} alt={product.name} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{product.name}</div>
          {expanded && (
            <div className="text-[11px] text-text-light">
              {brandRows.length} brand{brandRows.length === 1 ? "" : "s"}
              {editedCount > 0 ? ` (${editedCount} edited)` : ""}
            </div>
          )}
        </div>
        {expanded && editedCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm(`Reset all ${editedCount} edited brand${editedCount === 1 ? "" : "s"} to default?`)) {
                resetAll.mutate({ categorySlug, productId: product.id });
              }
            }}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset all brands
          </Button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border p-3 bg-muted/30 space-y-1.5">
          {isLoading ? (
            <div className="text-xs text-text-med">Loading brands…</div>
          ) : brandRows.length === 0 ? (
            <div className="text-xs text-text-med">This product has no brand variants yet.</div>
          ) : (
            brandRows.map((row, i) => (
              <SectionBrandsBrandRow
                key={row.brand.id}
                categorySlug={categorySlug}
                productId={product.id}
                row={row}
                isFirst={i === 0}
                isLast={i === brandRows.length - 1}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return <div className="w-8 h-8 rounded-md bg-muted border border-border shrink-0" aria-label={alt} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className="w-8 h-8 rounded-md object-cover border border-border bg-muted shrink-0"
    />
  );
}
