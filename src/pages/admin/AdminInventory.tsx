import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Download, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import AdminInventoryCard from "@/components/admin/AdminInventoryCard";

// Stock status helpers — module-level + exported so the mobile
// AdminInventoryCard renders IDENTICAL status logic + badge colours as
// the desktop table rows. Pure functions (no component state).
export const getInventoryStatus = (b: any): string => {
  if (b.stock_quantity === null) return "untracked";
  if (b.stock_quantity === 0) return "out";
  if (b.stock_quantity < 10) return "low";
  return "in";
};

export const inventoryStatusBadge = (s: string): string => {
  const map: Record<string, string> = {
    in: "bg-green-100 text-green-700", low: "bg-yellow-100 text-yellow-700",
    out: "bg-red-100 text-red-700", untracked: "bg-gray-100 text-gray-500",
  };
  return map[s] || "";
};

export const inventoryStatusLabel = (s: string): string =>
  s === "untracked" ? "N/A" : s === "in" ? "In Stock" : s === "low" ? "Low Stock" : "Out of Stock";

export default function AdminInventory() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data: brands, isLoading } = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        // Disambiguate: a reverse FK products.hospital_list_default_brand_id ->
        // brands.id makes a bare products embed ambiguous (PGRST201). Pin the
        // intended brands.product_id relationship by name.
        .select("*, products!brands_product_id_fkey(name, emoji, is_active)")
        .order("brand_name");
      if (error) throw error;
      return data;
    },
  });

  const updateBrand = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase.from("brands").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-inventory"] }); toast.success("Updated"); },
  });

  const getStatus = getInventoryStatus;

  const filtered = (brands || []).filter((b: any) => {
    const status = getStatus(b);
    if (filter === "in" && status !== "in") return false;
    if (filter === "low" && status !== "low") return false;
    if (filter === "out" && status !== "out") return false;
    if (search) {
      const s = search.toLowerCase();
      return b.brand_name.toLowerCase().includes(s) || ((b.products as any)?.name || "").toLowerCase().includes(s);
    }
    return true;
  });

  const exportCSV = () => {
    const rows = filtered.map((b: any) => [(b.products as any)?.name, b.brand_name, b.price, b.compare_at_price || "", b.stock_quantity ?? "N/A", getStatus(b)].join(","));
    const csv = "Product,Brand,Price,Compare-at Price,Stock,Status\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "inventory.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = inventoryStatusBadge;

  const lowCount = (brands || []).filter((b: any) => getStatus(b) === "low").length;
  const outCount = (brands || []).filter((b: any) => getStatus(b) === "out").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="pf text-2xl font-bold">Inventory</h1>
        <button onClick={exportCSV} className="flex items-center gap-1.5 border border-border px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {(lowCount > 0 || outCount > 0) && (
        <div className="flex gap-3 mb-4">
          {lowCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <span className="font-semibold text-yellow-700">{lowCount} low stock</span>
            </div>
          )}
          {outCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="font-semibold text-red-700">{outCount} out of stock</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 border border-input rounded-lg text-sm bg-background" />
        </div>
        {["all", "in", "low", "out"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize ${filter === s ? "border-forest bg-forest-light text-forest" : "border-border text-text-med"}`}>
            {s === "all" ? "All" : s === "in" ? "In Stock" : s === "low" ? "Low Stock" : "Out of Stock"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <>
          <div className="hidden md:block text-center py-10 text-text-med">Loading...</div>
          <div className="md:hidden flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[88px] w-full rounded-lg" />)}
          </div>
        </>
      ) : (
        <>
        {/* Desktop (md+) — existing table, unchanged. */}
        <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Product</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Brand</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Tier</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Price</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Compare-at</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Stock</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">In Stock</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b: any) => {
                const status = getStatus(b);
                return (
                  <tr key={b.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs font-semibold">{(b.products as any)?.emoji} {(b.products as any)?.name}</td>
                    <td className="px-4 py-3 text-xs">{b.brand_name}</td>
                    <td className="px-4 py-3 text-xs capitalize">{b.tier}</td>
                    <td className="px-4 py-3">
                      <input type="number" defaultValue={b.price} min={0}
                        onBlur={e => {
                          const val = parseInt(e.target.value);
                          if (val !== b.price) updateBrand.mutate({ id: b.id, updates: { price: val } });
                        }}
                        className="w-24 border border-input rounded px-2 py-1 text-xs bg-background" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" defaultValue={b.compare_at_price || ""} min={0}
                        onBlur={e => {
                          const val = e.target.value === "" ? null : parseInt(e.target.value);
                          if (val !== b.compare_at_price) updateBrand.mutate({ id: b.id, updates: { compare_at_price: val } });
                        }}
                        className="w-24 border border-input rounded px-2 py-1 text-xs bg-background" placeholder="—" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" defaultValue={b.stock_quantity ?? ""} min={0}
                        onBlur={e => {
                          const val = e.target.value === "" ? null : parseInt(e.target.value);
                          if (val !== b.stock_quantity) updateBrand.mutate({ id: b.id, updates: { stock_quantity: val } });
                        }}
                        className="w-20 border border-input rounded px-2 py-1 text-xs bg-background" placeholder="∞" />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => updateBrand.mutate({ id: b.id, updates: { in_stock: !b.in_stock } })}
                        className={`w-9 h-5 rounded-full relative transition-colors ${b.in_stock !== false ? "bg-forest" : "bg-border"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary-foreground shadow transition-transform ${b.in_stock !== false ? "left-4" : "left-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${statusBadge(status)}`}>
                        {status === "untracked" ? "N/A" : status === "in" ? "In Stock" : status === "low" ? "Low Stock" : "Out of Stock"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>

        {/* Mobile (<md) — card list. Consumes the SAME `filtered` array
            as the table; no separate fetch / filter / sort. */}
        <div className="md:hidden flex flex-col gap-3">
          {filtered.map((b: any) => (
            <AdminInventoryCard
              key={b.id}
              brand={b}
              onToggleStock={(id, current) => updateBrand.mutate({ id, updates: { in_stock: !current } })}
            />
          ))}
        </div>
        </>
      )}
    </div>
  );
}
