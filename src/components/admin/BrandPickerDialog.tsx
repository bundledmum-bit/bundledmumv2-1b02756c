import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useAllBrandsForPicker } from "@/hooks/useVendors";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pass true to filter out brands already linked to a vendor. */
  hideLinked?: boolean;
  onSelect: (brand: { id: string; brand_name: string; sku: string | null; vendor_id: string | null }) => void;
}

export default function BrandPickerDialog({ open, onOpenChange, hideLinked = true, onSelect }: Props) {
  const { data: brands = [], isLoading } = useAllBrandsForPicker();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const list = (brands as any[]).filter(b => (hideLinked ? !b.vendor_id : true));
    if (!q.trim()) return list;
    const lower = q.toLowerCase();
    return list.filter((b: any) => {
      const product = b.products?.name?.toLowerCase() || "";
      return (
        b.brand_name?.toLowerCase().includes(lower) ||
        (b.sku || "").toLowerCase().includes(lower) ||
        product.includes(lower)
      );
    });
  }, [brands, q, hideLinked]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Pick a Brand / Product</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border border-border rounded-md px-2 py-1 mb-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by brand, SKU, or product"
            className="flex-1 text-sm bg-transparent outline-none py-1"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No brands match</div>
          ) : (
            filtered.map((b: any) => (
              <button
                key={b.id}
                onClick={() => { onSelect(b); onOpenChange(false); }}
                className="w-full text-left px-3 py-2 hover:bg-muted/40 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{b.brand_name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {b.products?.name || "—"}
                    {b.sku ? ` · SKU ${b.sku}` : ""}
                  </div>
                </div>
                {b.vendor_id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
                    linked
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Re-export the hook used by the dialog so consumers can prefetch if needed.
export { useAllBrandsForPicker } from "@/hooks/useVendors";
