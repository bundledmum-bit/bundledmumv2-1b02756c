import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Trash2, RotateCcw, Plus, Pencil } from "lucide-react";
import BulkActionsBar from "@/components/admin/BulkActionsBar";
import TrashTabs from "@/components/admin/TrashTabs";
import { Checkbox } from "@/components/ui/checkbox";
import AdminBundleForm from "./AdminBundleForm";
import AdminGiftBoxes, { useCanManageGiftBoxes } from "./AdminGiftBoxes";
import AdminMaternityBundles from "./AdminMaternityBundles";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

type Section = "legacy" | "gift-boxes" | "recovery-kits" | "maternity-bundles";

export default function AdminBundles() {
  const queryClient = useQueryClient();
  const { adminUser } = usePermissions();
  const canManageGiftBoxes = useCanManageGiftBoxes(adminUser?.role);
  const [section, setSection] = useState<Section>("legacy");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trashTab, setTrashTab] = useState<"active" | "trash">("active");
  const [showForm, setShowForm] = useState(false);
  const [editingBundle, setEditingBundle] = useState<any>(null);

  const { data: bundles, isLoading } = useQuery({
    queryKey: ["admin-bundles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bundles").select("*, bundle_items(count)").order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: string }) => {
      if (action === "activate") await supabase.from("bundles").update({ is_active: true, deleted_at: null }).in("id", ids);
      else if (action === "deactivate") await supabase.from("bundles").update({ is_active: false }).in("id", ids);
      else if (action === "trash") await supabase.from("bundles").update({ is_active: false, deleted_at: new Date().toISOString() }).in("id", ids);
      else if (action === "restore") await supabase.from("bundles").update({ is_active: true, deleted_at: null }).in("id", ids);
      else if (action === "delete_permanent") await supabase.from("bundles").delete().in("id", ids);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-bundles"] }); setSelected(new Set()); toast.success("Done"); },
  });

  const duplicateBundle = async (b: any) => {
    const { bundle_items, id, created_at, updated_at, deleted_at, ...rest } = b;
    const { error } = await supabase.from("bundles").insert({ ...rest, name: `${rest.name} (Copy)`, slug: `${rest.slug}-copy-${Date.now()}` }).select("id").single();
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-bundles"] });
    toast.success("Duplicated");
  };

  const allBundles = bundles || [];
  const activeBundles = allBundles.filter((b: any) => !b.deleted_at);
  const trashedBundles = allBundles.filter((b: any) => !!b.deleted_at);
  const displayList = trashTab === "active" ? activeBundles : trashedBundles;

  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const allSelected = displayList.length > 0 && displayList.every((b: any) => selected.has(b.id));

  const bulkActions = trashTab === "active"
    ? [{ label: "Activate", value: "activate" }, { label: "Deactivate", value: "deactivate" }, { label: "Move to Trash", value: "trash", destructive: true }]
    : [{ label: "Restore", value: "restore" }, { label: "Delete Permanently", value: "delete_permanent", destructive: true }];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="pf text-2xl font-bold">
          {section === "legacy" ? `Bundles (${displayList.length})`
            : section === "gift-boxes" ? "Gift Boxes"
            : section === "recovery-kits" ? "Recovery Kits"
            : "Maternity Bundles"}
        </h1>
        {section === "legacy" && (
          <button onClick={() => { setEditingBundle(null); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
            <Plus className="w-4 h-4" /> Add Bundle
          </button>
        )}
      </div>

      {/* Section switcher — new product-table-backed bundle panes are gated
          to super_admin / admin roles. */}
      {canManageGiftBoxes && (
        <div className="flex gap-1 mb-5 border-b border-border flex-wrap">
          {[
            { id: "legacy" as const, label: "Bundles (Legacy)" },
            { id: "gift-boxes" as const, label: "Gift Boxes" },
            { id: "recovery-kits" as const, label: "Recovery Kits" },
            { id: "maternity-bundles" as const, label: "Maternity Bundles" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSection(t.id)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${section === t.id ? "border-forest text-forest" : "border-transparent text-text-med hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {section === "gift-boxes" && canManageGiftBoxes ? (
        <AdminGiftBoxes filter="gift-box" />
      ) : section === "recovery-kits" && canManageGiftBoxes ? (
        <AdminGiftBoxes filter="recovery-kit" />
      ) : section === "maternity-bundles" && canManageGiftBoxes ? (
        <AdminMaternityBundles />
      ) : (
      <>
      <TrashTabs activeTab={trashTab} onTabChange={t => { setTrashTab(t); setSelected(new Set()); }} activeCount={activeBundles.length} trashCount={trashedBundles.length} />

      <BulkActionsBar selectedCount={selected.size} actions={bulkActions}
        onApply={a => { const ids = Array.from(selected); if (a === "delete_permanent" && !confirm("Permanently delete?")) return; bulkMutation.mutate({ ids, action: a }); }}
        onSelectAll={() => setSelected(new Set(displayList.map((b: any) => b.id)))}
        onDeselectAll={() => setSelected(new Set())} totalCount={displayList.length} allSelected={allSelected} />

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading bundles...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-3 w-8">
                  <Checkbox checked={allSelected} onCheckedChange={c => c ? setSelected(new Set(displayList.map((b: any) => b.id))) : setSelected(new Set())} />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Bundle</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Tier</th>
                <th className="px-4 py-3 text-right font-semibold text-text-med">Price</th>
                <th className="px-4 py-3 text-center font-semibold text-text-med">Active</th>
                <th className="px-4 py-3 text-right font-semibold text-text-med">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((b: any) => (
                <tr key={b.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-3">
                    <Checkbox checked={selected.has(b.id)} onCheckedChange={() => toggleSelect(b.id)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{b.emoji}</span>
                      <span className="font-semibold">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize">{b.tier}</td>
                  <td className="px-4 py-3 text-right font-semibold">₦{b.price.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${b.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {b.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      {trashTab === "active" ? (
                        <>
                          <button title="Edit" onClick={() => { setEditingBundle(b); setShowForm(true); }}
                            className="p-1.5 rounded hover:bg-muted"><Pencil className="w-3.5 h-3.5" /></button>
                          <button title="Duplicate" onClick={() => duplicateBundle(b)} className="p-1.5 rounded hover:bg-muted"><Copy className="w-3.5 h-3.5" /></button>
                          <button title="Trash" onClick={() => bulkMutation.mutate({ ids: [b.id], action: "trash" })}
                            className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => bulkMutation.mutate({ ids: [b.id], action: "restore" })} className="p-1.5 rounded hover:bg-forest/10 text-forest"><RotateCcw className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { if (confirm("Permanently delete?")) bulkMutation.mutate({ ids: [b.id], action: "delete_permanent" }); }}
                            className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      </>
      )}

      {showForm && (
        <AdminBundleForm bundle={editingBundle}
          onClose={() => { setShowForm(false); setEditingBundle(null); }}
          onSaved={() => { setShowForm(false); setEditingBundle(null); queryClient.invalidateQueries({ queryKey: ["admin-bundles"] }); }} />
      )}
    </div>
  );
}
