import { MoreVertical, PackageX, PackageCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { getBrandImage } from "@/lib/brandImage";
import {
  getInventoryStatus,
  inventoryStatusBadge,
  inventoryStatusLabel,
} from "@/pages/admin/AdminInventory";

// Mobile (<md) inventory card for AdminInventory. Desktop keeps the
// table; this is the sibling card view rendered under `md:hidden`. It
// consumes the SAME brand row shape the table maps over (one row of
// `brands` + nested `products`), so there is no separate fetch / filter.
//
// The desktop row has no click target and no dropdown — its actions are
// inline field edits (price/stock onBlur) plus an in_stock toggle. The
// one discrete, menu-able action is that toggle, surfaced here in the
// meatball and wired back to the SAME updateBrand mutation via
// onToggleStock. Per-field price/stock editing stays desktop-only (the
// locked card design is display + toggle). No new actions are invented.

interface AdminInventoryCardProps {
  brand: any;
  // Optional — there is no detail/edit page for a brand row today, so
  // AdminInventory does not pass this; the card body is non-navigating,
  // mirroring the un-clickable desktop row. Kept for API parity.
  onSelect?: (id: string) => void;
  // Mirrors the desktop toggle handler: parent applies `!current`.
  onToggleStock?: (id: string, current: boolean | null | undefined) => void;
  canEdit?: boolean;
}

export default function AdminInventoryCard({
  brand: b,
  onSelect,
  onToggleStock,
  canEdit = true,
}: AdminInventoryCardProps) {
  const status = getInventoryStatus(b);
  const img = getBrandImage(b);
  const product = (b.products as any) || {};
  // Same truthiness rule as the desktop toggle (null/undefined = in stock).
  const inStock = b.in_stock !== false;

  return (
    <Card
      onClick={onSelect ? () => onSelect(b.id) : undefined}
      className={`p-4 ${onSelect ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
    >
      {/* Top row — image + brand / product names */}
      <div className="flex items-start gap-3">
        {img ? (
          <img
            src={img}
            alt={b.brand_name}
            className="w-12 h-12 rounded object-cover bg-muted flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center text-muted-foreground text-base font-semibold flex-shrink-0">
            {(b.brand_name || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{b.brand_name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {product.emoji ? `${product.emoji} ` : ""}{product.name || "—"}
          </p>
        </div>
      </div>

      {/* Bottom row — status badge (left) · meatball (right). The single
          status badge mirrors the table's Status column, which already
          distinguishes Low / Out / N/A. */}
      <div className="flex items-center justify-between gap-2 mt-3">
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${inventoryStatusBadge(status)}`}
        >
          {inventoryStatusLabel(status)}
        </span>

        {canEdit && onToggleStock && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label="Inventory actions"
                className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted flex-shrink-0"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStock(b.id, b.in_stock);
                }}
              >
                {inStock ? (
                  <><PackageX className="w-4 h-4 mr-2" /> Mark out of stock</>
                ) : (
                  <><PackageCheck className="w-4 h-4 mr-2" /> Mark in stock</>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Card>
  );
}
