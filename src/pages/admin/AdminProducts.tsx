import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Copy, RotateCcw, Check, X, TrendingUp } from "lucide-react";
import AdminProductForm from "./AdminProductForm";
import BulkActionsBar from "@/components/admin/BulkActionsBar";
import TrashTabs from "@/components/admin/TrashTabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ExportButton, ImportButton } from "@/components/admin/ExcelImportExport";
import RequestDeleteButton from "@/components/admin/RequestDeleteButton";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { useAdminUser } from "@/hooks/useAdminPermissions";
import { useProductCategories } from "@/hooks/useProductCategories";

export default function AdminProducts() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { data: adminUser } = useAdminUser();
  // Margins dashboard is a privileged view — only super_admin / admin see the
  // entry point. Fail closed if the role lookup is loading or errored.
  const canSeeMargins = adminUser?.role === "super_admin" || adminUser?.role === "admin";
  const [urlParams, setUrlParams] = useSearchParams();

  const [search, setSearch] = useState(urlParams.get("q") || "");
  const [catFilter, setCatFilter] = useState(urlParams.get("shop") || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">((urlParams.get("status") as any) || "active");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>(urlParams.get("category") || "");
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trashTab, setTrashTab] = useState<"active" | "trash">("active");
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [quickEditData, setQuickEditData] = useState<any>({});
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);

  const { data: allCategories = [] } = useProductCategories();

  // Mirror filters → URL so admins can bookmark filtered views.
  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (catFilter !== "all") next.set("shop", catFilter);
    if (statusFilter !== "active") next.set("status", statusFilter);
    if (subcategoryFilter) next.set("category", subcategoryFilter);
    setUrlParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, catFilter, statusFilter, subcategoryFilter]);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, brands(*), product_sizes(*), product_colors(*), product_tags(*)")
        .order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action, value }: { ids: string[]; action: string; value?: string }) => {
      if (action === "activate") await supabase.from("products").update({ is_active: true, deleted_at: null }).in("id", ids);
      else if (action === "deactivate") await supabase.from("products").update({ is_active: false }).in("id", ids);
      else if (action === "trash") await supabase.from("products").update({ is_active: false, deleted_at: new Date().toISOString() }).in("id", ids);
      else if (action === "restore") await supabase.from("products").update({ is_active: true, deleted_at: null }).in("id", ids);
      else if (action === "delete_permanent") await supabase.from("products").delete().in("id", ids);
      else if (action === "change_category" && value) await supabase.from("products").update({ subcategory: value }).in("id", ids);
      else if (action === "mark_oos") await supabase.from("products").update({ is_out_of_stock: true } as any).in("id", ids);
      else if (action === "mark_in_stock") await supabase.from("products").update({ is_out_of_stock: false } as any).in("id", ids);
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      const n = vars.ids.length;
      setSelected(new Set());
      toast.success(`Updated ${n} product${n === 1 ? "" : "s"} successfully`);
    },
  });

  const quickSave = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("products").update(data).eq("id", quickEditId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-products"] }); setQuickEditId(null); toast.success("Updated"); },
  });

  const duplicateProduct = async (p: any) => {
    const { brands, product_sizes, product_colors, product_tags, id, created_at, updated_at, deleted_at, ...rest } = p;
    const { data, error } = await supabase.from("products").insert({ ...rest, name: `${rest.name} (Copy)`, slug: `${rest.slug}-copy-${Date.now()}` }).select("id").single();
    if (error) { toast.error(error.message); return; }
    if (brands?.length) {
      await supabase.from("brands").insert(brands.map((b: any) => ({ product_id: data.id, brand_name: b.brand_name, price: b.price, tier: b.tier, is_default_for_tier: b.is_default_for_tier, display_order: b.display_order })));
    }
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    toast.success("Product duplicated");
  };

  const allProducts = products || [];
  const activeProducts = allProducts.filter((p: any) => !p.deleted_at);
  const trashedProducts = allProducts.filter((p: any) => !!p.deleted_at);
  const displayList = trashTab === "active" ? activeProducts : trashedProducts;

  // Combined search: matches product name, slug, and any brand_name / sku
  // on the product's brand list. Case-insensitive substring match.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return displayList.filter((p: any) => {
      if (catFilter !== "all" && p.category !== catFilter) return false;
      if (statusFilter === "active" && !p.is_active) return false;
      if (statusFilter === "inactive" && p.is_active) return false;
      if (subcategoryFilter && p.subcategory !== subcategoryFilter) return false;
      if (!q) return true;
      const haystack: string[] = [p.name, p.slug || ""];
      for (const b of (p.brands || [])) {
        if (b.brand_name) haystack.push(b.brand_name);
        if (b.sku) haystack.push(b.sku);
      }
      return haystack.some(h => h.toLowerCase().includes(q));
    });
  }, [displayList, catFilter, statusFilter, subcategoryFilter, search]);

  const toggleSelect = (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); };
  const allSelected = filtered.length > 0 && filtered.every((p: any) => selected.has(p.id));

  const handleBulkAction = (action: string) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === "change_category") { setBulkCategoryOpen(true); return; }
    if (action === "trash" && !confirm(`Are you sure? This will hide ${ids.length} product${ids.length === 1 ? "" : "s"} from the shop. Order history is preserved.`)) return;
    if (action === "delete_permanent" && !confirm("Permanently delete selected products?")) return;
    bulkMutation.mutate({ ids, action });
  };

  const bulkActions = trashTab === "active"
    ? [
        ...(can("products", "edit") ? [
          { label: "Activate", value: "activate" },
          { label: "Deactivate", value: "deactivate" },
          { label: "Change Category", value: "change_category" },
          { label: "Mark Out of Stock", value: "mark_oos" },
          { label: "Mark In Stock", value: "mark_in_stock" },
        ] : []),
        ...(can("products", "delete") ? [{ label: "Delete", value: "trash", destructive: true }] : []),
      ]
    : [
        ...(can("products", "edit") ? [{ label: "Restore", value: "restore" }] : []),
        ...(can("products", "delete") ? [{ label: "Delete Permanently", value: "delete_permanent", destructive: true }] : []),
      ];

  const showCogs = can("finance", "view_cogs");

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="pf text-2xl font-bold">Products ({filtered.length})</h1>
        <div className="flex items-center gap-2">
          {canSeeMargins && (
            <Link
              to="/admin/products/margins"
              className="flex items-center gap-1.5 border border-border bg-card text-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted"
            >
              <TrendingUp className="w-4 h-4" /> View Margins
            </Link>
          )}
          {can("products", "export") && <ExportButton products={allProducts} />}
          {can("products", "import") && <ImportButton />}
          {can("products", "create") && (
            <button onClick={() => { setEditingProduct(null); setShowForm(true); }}
              className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
              <Plus className="w-4 h-4" /> {adminUser?.role === "super_admin" ? "Add Product" : "Request to add Product"}
            </button>
          )}
        </div>
      </div>

      <CogsCoverageBanner products={activeProducts} />

      <TrashTabs activeTab={trashTab} onTabChange={t => { setTrashTab(t); setSelected(new Set()); }} activeCount={activeProducts.length} trashCount={trashedProducts.length} />

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, slug, brand or SKU…"
            className="w-full pl-9 pr-3 py-2 border border-input rounded-lg text-sm bg-background outline-none focus:ring-2 focus:ring-forest" />
        </div>

        {/* Status pill toggle */}
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
          {(["all","active","inactive"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md font-semibold capitalize ${statusFilter === s ? "bg-card" : "text-text-med"}`}>
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>

        {/* Shop pill toggle */}
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
          {[
            { v: "all",  label: "All Shops" },
            { v: "baby", label: "👶 Baby" },
            { v: "mum",  label: "💛 Mum" },
            { v: "both", label: "Both" },
          ].map(o => (
            <button key={o.v} onClick={() => setCatFilter(o.v)}
              className={`px-3 py-1.5 rounded-md font-semibold ${catFilter === o.v ? "bg-card" : "text-text-med"}`}>
              {o.label}
            </button>
          ))}
        </div>

        {/* DB-driven category dropdown — 19 entries */}
        <select value={subcategoryFilter} onChange={e => setSubcategoryFilter(e.target.value)}
          className="border border-input rounded-lg px-2 py-2 text-xs bg-background min-w-[180px]">
          <option value="">All Categories</option>
          {allCategories.map(c => (
            <option key={c.slug} value={c.slug}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
          ))}
        </select>

        {(search || statusFilter !== "active" || catFilter !== "all" || subcategoryFilter) && (
          <button
            onClick={() => { setSearch(""); setStatusFilter("active"); setCatFilter("all"); setSubcategoryFilter(""); }}
            className="text-xs text-text-light hover:text-foreground underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {bulkActions.length > 0 && (
        <BulkActionsBar selectedCount={selected.size} actions={bulkActions} onApply={handleBulkAction}
          onSelectAll={() => setSelected(new Set(filtered.map((p: any) => p.id)))}
          onDeselectAll={() => setSelected(new Set())} totalCount={filtered.length} allSelected={allSelected} />
      )}

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading products...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-3 w-8">
                  <Checkbox checked={allSelected} onCheckedChange={c => c ? setSelected(new Set(filtered.map((p: any) => p.id))) : setSelected(new Set())} />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Product</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Category</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Priority</th>
                <th className="px-4 py-3 text-center font-semibold text-text-med">Brands</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Pack Info</th>
                <th className="px-4 py-3 text-center font-semibold text-text-med">Active</th>
                <th className="px-4 py-3 text-center font-semibold text-text-med">Out of Stock</th>
                <th className="px-4 py-3 text-right font-semibold text-text-med">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => quickEditId === p.id ? (
                <tr key={p.id} className="border-t border-border bg-forest/5">
                  <td className="px-3 py-2" />
                  <td className="px-4 py-2">
                    <input value={quickEditData.name} onChange={e => setQuickEditData((d: any) => ({ ...d, name: e.target.value }))}
                      className="w-full border border-input rounded px-2 py-1 text-xs bg-background" />
                  </td>
                  <td className="px-4 py-2">
                    <select value={quickEditData.category} onChange={e => setQuickEditData((d: any) => ({ ...d, category: e.target.value }))}
                      className="border border-input rounded px-2 py-1 text-xs bg-background">
                      <option value="baby">baby</option><option value="mum">mum</option><option value="both">both</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select value={quickEditData.priority} onChange={e => setQuickEditData((d: any) => ({ ...d, priority: e.target.value }))}
                      className="border border-input rounded px-2 py-1 text-xs bg-background">
                      <option value="essential">essential</option><option value="recommended">recommended</option><option value="nice-to-have">nice-to-have</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input type="number" value={quickEditData.display_order} onChange={e => setQuickEditData((d: any) => ({ ...d, display_order: parseInt(e.target.value) || 0 }))}
                      className="w-16 border border-input rounded px-2 py-1 text-xs bg-background text-center" />
                  </td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => quickSave.mutate({ name: quickEditData.name, category: quickEditData.category, priority: quickEditData.priority, display_order: quickEditData.display_order })}
                        className="p-1.5 rounded hover:bg-forest/10 text-forest"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setQuickEditId(null)} className="p-1.5 rounded hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-3"><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{p.emoji}</span>
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        {p.badge && <span className="text-[10px] px-1.5 py-0.5 bg-coral/10 text-coral rounded font-semibold">{p.badge}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize">{p.category}</td>
                  <td className="px-4 py-3 capitalize">{p.priority}</td>
                  <td className="px-4 py-3 text-center">{p.brands?.length || 0}</td>
                  <td className="px-4 py-3 text-xs"><PackInfoCell brands={p.brands || []} /></td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${p.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <OosToggle productId={p.id} isOos={p.is_out_of_stock ?? false} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      {trashTab === "active" ? (
                        <>
                          {can("products", "edit") && (
                            <button title="Quick Edit" onClick={() => { setQuickEditId(p.id); setQuickEditData({ name: p.name, category: p.category, priority: p.priority, display_order: p.display_order }); }}
                              className="p-1.5 rounded hover:bg-muted text-text-med text-[10px] font-semibold">QE</button>
                          )}
                          {can("products", "edit") && (
                            <button title="Edit" onClick={() => { setEditingProduct(p); setShowForm(true); }}
                              className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                          )}
                          {can("products", "create") && (
                            <button title="Duplicate" onClick={() => duplicateProduct(p)}
                              className="p-1.5 rounded hover:bg-muted"><Copy className="w-3.5 h-3.5" /></button>
                          )}
                          {can("products", "delete") && (
                            <button title="Trash" onClick={() => bulkMutation.mutate({ ids: [p.id], action: "trash" })}
                              className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </>
                      ) : (
                        <>
                          {can("products", "edit") && (
                            <button title="Restore" onClick={() => bulkMutation.mutate({ ids: [p.id], action: "restore" })}
                              className="p-1.5 rounded hover:bg-forest/10 text-forest"><RotateCcw className="w-3.5 h-3.5" /></button>
                          )}
                          {can("products", "delete") && (
                            <RequestDeleteButton
                              table="products"
                              recordId={p.id}
                              recordLabel={p.name}
                              onDeleted={() => { if (confirm("Permanently delete?")) bulkMutation.mutate({ ids: [p.id], action: "delete_permanent" }); }}
                              className="p-1.5 rounded hover:bg-destructive/10 text-destructive inline-flex items-center cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </RequestDeleteButton>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showForm && (
        <AdminProductForm product={editingProduct}
          onClose={() => { setShowForm(false); setEditingProduct(null); }}
          onSaved={() => { setShowForm(false); setEditingProduct(null); queryClient.invalidateQueries({ queryKey: ["admin-products"] }); }} />
      )}

      {bulkCategoryOpen && (
        <BulkChangeCategoryModal
          count={selected.size}
          categories={allCategories}
          onClose={() => setBulkCategoryOpen(false)}
          onConfirm={(slug) => {
            bulkMutation.mutate({ ids: Array.from(selected), action: "change_category", value: slug });
            setBulkCategoryOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Compact pack-info cell for the product list — derived from the cheapest in-stock brand. */
function PackInfoCell({ brands }: { brands: any[] }) {
  if (!brands || brands.length === 0) return <span className="text-text-light">—</span>;
  const inStock = brands.filter(b => b.in_stock !== false);
  const pool = inStock.length > 0 ? inStock : brands;
  const distinctPacks = new Set(pool.filter(b => b.pack_count != null).map(b => b.pack_count));
  if (distinctPacks.size > 1) return <span className="italic text-text-light">Multiple</span>;
  const cheapest = [...pool].sort((a, b) => (a.price || 0) - (b.price || 0))[0];
  if (!cheapest) return <span className="text-text-light">—</span>;
  const parts: string[] = [];
  if (cheapest.pack_count) parts.push(String(cheapest.pack_count));
  if (cheapest.diaper_type) parts.push(cheapest.diaper_type);
  if (cheapest.weight_range_kg) parts.push(cheapest.weight_range_kg);
  // Shipping weight per single unit — surfaced for spot-checking that
  // every brand variant has a weight set (courier costs depend on it).
  if (cheapest.weight_kg != null) parts.push(`${Number(cheapest.weight_kg).toFixed(2)}kg`);
  return parts.length > 0 ? <span className="text-text-med">{parts.join(" / ")}</span> : <span className="text-text-light">—</span>;
}

/** Modal that lets bulk-action update subcategory across selected products. */
function BulkChangeCategoryModal({
  count, categories, onClose, onConfirm,
}: {
  count: number;
  categories: Array<{ slug: string; name: string; icon: string | null }>;
  onClose: () => void;
  onConfirm: (slug: string) => void;
}) {
  const [slug, setSlug] = useState<string>("");
  return (
    <div className="fixed inset-0 z-50 bg-foreground/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">Change category for {count} product{count === 1 ? "" : "s"}</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted inline-flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-text-med">Pick the new subcategory. Existing brand variants and pricing stay the same.</p>
          <select value={slug} onChange={e => setSlug(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
            <option value="">— Select category —</option>
            {categories.map(c => (
              <option key={c.slug} value={c.slug}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
            ))}
          </select>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
            <button onClick={() => onConfirm(slug)} disabled={!slug} className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">
              Apply to {count} product{count === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Inline toggle for the products.is_out_of_stock column. */
function OosToggle({ productId, isOos }: { productId: string; isOos: boolean }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    setPending(true);
    await (supabase as any).from("products").update({ is_out_of_stock: !isOos }).eq("id", productId);
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    setPending(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title={isOos ? "Mark In Stock" : "Mark Out of Stock"}
      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${isOos ? "bg-orange-100 text-orange-700 hover:bg-orange-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
    >
      {pending ? "…" : isOos ? "OOS" : "In Stock"}
    </button>
  );
}

// Summary banner — counts brands (across all active products) that have a
// non-zero cost_price. Drives the auto-COGS % tracked figure on the P&L.
function CogsCoverageBanner({ products }: { products: any[] }) {
  const brandTotals = products.reduce<{ total: number; withCost: number }>((acc, p) => {
    const brands = Array.isArray(p.brands) ? p.brands : [];
    brands.forEach((b: any) => {
      acc.total += 1;
      if ((b.cost_price || 0) > 0) acc.withCost += 1;
    });
    return acc;
  }, { total: 0, withCost: 0 });

  if (brandTotals.total === 0) return null;
  const pct = Math.round((brandTotals.withCost / brandTotals.total) * 100);
  const green = pct === 100;
  return (
    <div className={`mb-3 rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${green ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: green ? "#10B981" : "#F59E0B" }} />
      <span>
        <b>{brandTotals.withCost}</b> of <b>{brandTotals.total}</b> brand variants have cost prices set —
        auto-COGS tracking active for <b>{pct}%</b>.
      </span>
    </div>
  );
}
