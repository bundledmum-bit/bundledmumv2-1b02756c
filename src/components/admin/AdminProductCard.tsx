import { MoreVertical, Pencil, Copy, Trash2, RotateCcw, PackageX, PackageCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import RequestDeleteButton from "@/components/admin/RequestDeleteButton";
import { getBrandImage } from "@/lib/brandImage";

// Mobile (<md) product card for AdminProducts. Desktop keeps the table;
// this is the sibling card view rendered under `md:hidden`. It consumes
// the SAME product row shape the table maps over (a `products` row with
// embedded `brands(*)`), so there is no separate fetch / filter and the
// brand count comes straight off the embedded list.
//
// The desktop row has no whole-row click target (editing is the Pencil
// button → modal), so the card body is non-clickable; Edit lives in the
// meatball. Quick Edit (QE) is a table-inline-only affordance with no
// mobile surface, so it's omitted — the full Edit modal covers it.
// Meatball actions mirror the row's existing handlers exactly (passed in
// from the page); no mutation logic is duplicated here.

// Resolution chain with data actually loaded by the products query:
// products.image_url → first brand image → null. (product_images is NOT
// selected by the query, so that tier is intentionally skipped to avoid
// a per-card fetch.)
function getProductImage(p: any): string | null {
  if (p?.image_url && String(p.image_url).trim()) return p.image_url;
  for (const b of (p?.brands || [])) {
    const img = getBrandImage(b);
    if (img) return img;
  }
  return null;
}

interface AdminProductCardProps {
  product: any;
  trashTab: "active" | "trash";
  canEdit?: boolean;
  canCreate?: boolean;
  canDelete?: boolean;
  onEdit?: (p: any) => void;
  onDuplicate?: (p: any) => void;
  onToggleOos?: (p: any) => void;
  onTrash?: (p: any) => void;
  onRestore?: (p: any) => void;
  onDeletePermanent?: (p: any) => void;
}

export default function AdminProductCard({
  product: p,
  trashTab,
  canEdit = false,
  canCreate = false,
  canDelete = false,
  onEdit,
  onDuplicate,
  onToggleOos,
  onTrash,
  onRestore,
  onDeletePermanent,
}: AdminProductCardProps) {
  const img = getProductImage(p);
  const brandCount = p.brands?.length || 0;
  const isOos = p.is_out_of_stock === true;

  // Meta line: category · subcategory · N brands (brands always shown).
  const meta = [p.category, p.subcategory, `${brandCount} brand${brandCount === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" · ");

  // Active-tab actions vs trash-tab actions mirror the desktop row.
  const hasActiveActions = trashTab === "active" && (canEdit || canCreate || canDelete);
  const hasTrashActions = trashTab === "trash" && (canEdit || canDelete);
  const showMeatball = hasActiveActions || hasTrashActions;

  return (
    <Card className="p-4">
      {/* Top row — image + name + meta */}
      <div className="flex items-start gap-3">
        {img ? (
          <img
            src={img}
            alt={p.name}
            className="w-12 h-12 rounded object-cover bg-muted flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center text-muted-foreground text-lg flex-shrink-0">
            {p.emoji || (p.name || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{p.name}</p>
          <p className="text-xs text-muted-foreground truncate capitalize">{meta}</p>
        </div>
      </div>

      {/* Bottom row — status badges (left) · meatball (right). Active is
          silent; only exceptions render. */}
      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {p.is_active === false && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">Inactive</span>
          )}
          {isOos && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">Out of stock</span>
          )}
          {p.badge && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-coral/10 text-coral">{p.badge}</span>
          )}
          {p.is_featured && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">Featured</span>
          )}
          {p.is_bestseller && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">Bestseller</span>
          )}
        </div>

        {showMeatball && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label="Product actions"
                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted flex-shrink-0"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {trashTab === "active" ? (
                <>
                  {canEdit && onEdit && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(p); }}>
                      <Pencil className="w-4 h-4 mr-2" /> Edit
                    </DropdownMenuItem>
                  )}
                  {canCreate && onDuplicate && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(p); }}>
                      <Copy className="w-4 h-4 mr-2" /> Duplicate
                    </DropdownMenuItem>
                  )}
                  {canEdit && onToggleOos && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleOos(p); }}>
                      {isOos
                        ? <><PackageCheck className="w-4 h-4 mr-2" /> Mark in stock</>
                        : <><PackageX className="w-4 h-4 mr-2" /> Mark out of stock</>}
                    </DropdownMenuItem>
                  )}
                  {canDelete && onTrash && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onTrash(p); }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Trash
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              ) : (
                <>
                  {canEdit && onRestore && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRestore(p); }}>
                      <RotateCcw className="w-4 h-4 mr-2" /> Restore
                    </DropdownMenuItem>
                  )}
                  {canDelete && onDeletePermanent && (
                    <DropdownMenuItem asChild className="text-destructive focus:text-destructive">
                      <RequestDeleteButton
                        table="products"
                        recordId={p.id}
                        recordLabel={p.name}
                        onDeleted={() => onDeletePermanent(p)}
                        className="w-full flex items-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete Permanently
                      </RequestDeleteButton>
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Card>
  );
}
