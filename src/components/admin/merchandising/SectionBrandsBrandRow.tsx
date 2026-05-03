import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  useUpsertSectionBrandOverride,
  useToggleSectionBrandActive,
  useResetSectionBrand,
  type SectionBrandRow,
} from "@/hooks/useMerchandising";

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function formatNaira(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return NGN.format(n);
}

/**
 * One brand row inside an expanded product. Inline label/active edits
 * auto-save; arrows reorder; the Reset button drops the override row.
 */
export function SectionBrandsBrandRow({
  categorySlug,
  productId,
  row,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  categorySlug: string;
  productId: string;
  row: SectionBrandRow;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const upsert = useUpsertSectionBrandOverride();
  const toggleActive = useToggleSectionBrandActive();
  const resetOne = useResetSectionBrand();

  const serverLabel = row.override?.display_label ?? "";
  const [labelDraft, setLabelDraft] = useState(serverLabel);
  useEffect(() => { setLabelDraft(serverLabel); }, [serverLabel]);

  const onBlurLabel = () => {
    const trimmed = labelDraft.trim();
    const next = trimmed === "" ? null : trimmed;
    const cur = serverLabel.trim() === "" ? null : serverLabel;
    if (next !== cur) {
      upsert.mutate({
        categorySlug,
        productId,
        brandId: row.brand.id,
        fields: { display_label: next },
      });
    }
  };

  const inStock = row.brand.in_stock !== false;

  return (
    <div className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-card border border-border rounded-lg p-2">
      <GripVertical className="w-4 h-4 text-text-light shrink-0" />
      <BrandThumb src={row.brand.image_url} alt={row.brand.brand_name} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold truncate">{row.brand.brand_name}</span>
          <Badge variant={row.isOverridden ? "default" : "outline"} className="text-[10px] py-0 px-1.5">
            {row.isOverridden ? "Edited" : "Default"}
          </Badge>
          {!inStock && (
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-muted text-text-med">
              Out of stock
            </Badge>
          )}
          {inStock && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"
              aria-label="In stock"
              title="In stock"
            />
          )}
        </div>
        <div className="text-[10px] text-text-light">
          Cost {formatNaira(row.brand.cost_price)} · Price {formatNaira(row.brand.price)}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 min-w-[160px]">
        <span className="text-[10px] text-muted-foreground">Display label</span>
        <Input
          value={labelDraft}
          onChange={e => setLabelDraft(e.target.value)}
          onBlur={onBlurLabel}
          placeholder={row.brand.brand_name}
          className="h-7 text-xs"
        />
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] text-muted-foreground">Active</span>
        <Switch
          checked={row.effectiveActive}
          onCheckedChange={(v) =>
            toggleActive.mutate({
              categorySlug,
              productId,
              brandId: row.brand.id,
              nextActive: v,
            })
          }
        />
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 rounded hover:bg-muted disabled:opacity-30"
          title="Move up"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 rounded hover:bg-muted disabled:opacity-30"
          title="Move down"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() =>
            resetOne.mutate({ categorySlug, productId, brandId: row.brand.id })
          }
          className="p-1 rounded hover:bg-destructive/10 text-destructive"
          title="Reset to default"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function BrandThumb({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return <div className="w-10 h-10 rounded-md bg-muted border border-border shrink-0" aria-label={alt} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className="w-10 h-10 rounded-md object-cover border border-border bg-muted shrink-0"
    />
  );
}
