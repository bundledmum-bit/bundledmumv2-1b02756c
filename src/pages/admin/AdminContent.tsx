import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, RotateCcw, Edit2, X } from "lucide-react";
import BulkActionsBar from "@/components/admin/BulkActionsBar";
import TrashTabs from "@/components/admin/TrashTabs";
import { Checkbox } from "@/components/ui/checkbox";
import AdminAnnouncementsTab from "@/components/admin/AdminAnnouncementsTab";
import AdminPagesTab from "@/components/admin/AdminPagesTab";

const BLANK_TESTIMONIAL = {
  customer_name: "",
  customer_city: "",
  customer_initial: "",
  quote: "",
  rating: 5,
  display_order: 0,
};

const BLANK_FAQ = {
  question: "",
  answer: "",
  category: "general",
  display_order: 0,
};

export default function AdminContent() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"testimonials" | "faqs" | "announcements" | "pages">("testimonials");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trashTab, setTrashTab] = useState<"active" | "trash">("active");
  const [editingTestimonial, setEditingTestimonial] = useState<any>(null);
  const [editingFaq, setEditingFaq] = useState<any>(null);

  const { data: testimonials } = useQuery({
    queryKey: ["admin-testimonials"],
    queryFn: async () => { const { data, error } = await supabase.from("testimonials").select("*").order("display_order"); if (error) throw error; return data; },
  });

  const { data: faqs } = useQuery({
    queryKey: ["admin-faqs"],
    queryFn: async () => { const { data, error } = await supabase.from("faq_items").select("*").order("display_order"); if (error) throw error; return data; },
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ table, ids, action }: { table: string; ids: string[]; action: string }) => {
      const tbl = table as "testimonials" | "faq_items";
      if (action === "activate") await supabase.from(tbl).update({ is_active: true, deleted_at: null }).in("id", ids);
      else if (action === "deactivate") await supabase.from(tbl).update({ is_active: false }).in("id", ids);
      else if (action === "trash") await supabase.from(tbl).update({ is_active: false, deleted_at: new Date().toISOString() }).in("id", ids);
      else if (action === "restore") await supabase.from(tbl).update({ is_active: true, deleted_at: null }).in("id", ids);
      else if (action === "delete_permanent") await supabase.from(tbl).delete().in("id", ids);
      else if (action === "feature") await supabase.from("testimonials").update({ is_featured: true }).in("id", ids);
      else if (action === "unfeature") await supabase.from("testimonials").update({ is_featured: false }).in("id", ids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
      queryClient.invalidateQueries({ queryKey: ["admin-faqs"] });
      setSelected(new Set());
      toast.success("Done");
    },
  });

  const saveTestimonial = useMutation({
    mutationFn: async (t: any) => {
      const payload = {
        customer_name: t.customer_name,
        customer_city: t.customer_city || null,
        customer_initial: t.customer_initial || (t.customer_name ? t.customer_name.charAt(0).toUpperCase() : ""),
        quote: t.quote,
        rating: Number(t.rating) || 5,
        display_order: Number(t.display_order) || 0,
      };
      if (t.id) {
        const { error } = await supabase.from("testimonials").update(payload).eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("testimonials").insert({ ...payload, is_active: true, is_featured: false });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
      queryClient.invalidateQueries({ queryKey: ["testimonials"] });
      setEditingTestimonial(null);
      toast.success("Testimonial saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveFaq = useMutation({
    mutationFn: async (f: any) => {
      const payload = {
        question: f.question,
        answer: f.answer,
        category: f.category || "general",
        display_order: Number(f.display_order) || 0,
      };
      if (f.id) {
        const { error } = await supabase.from("faq_items").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("faq_items").insert({ ...payload, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-faqs"] });
      queryClient.invalidateQueries({ queryKey: ["faq_items"] });
      setEditingFaq(null);
      toast.success("FAQ saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const currentTable = tab === "testimonials" ? "testimonials" : "faq_items";
  const allItems = (tab === "testimonials" ? testimonials : faqs) || [];
  const activeItems = allItems.filter((i: any) => !i.deleted_at);
  const trashedItems = allItems.filter((i: any) => !!i.deleted_at);
  const displayList = trashTab === "active" ? activeItems : trashedItems;

  const toggleSelect = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const allSelected = displayList.length > 0 && displayList.every((i: any) => selected.has(i.id));

  const bulkActions = trashTab === "active"
    ? [
      { label: "Activate", value: "activate" }, { label: "Deactivate", value: "deactivate" },
      ...(tab === "testimonials" ? [{ label: "Feature", value: "feature" }, { label: "Unfeature", value: "unfeature" }] : []),
      { label: "Move to Trash", value: "trash", destructive: true },
    ]
    : [{ label: "Restore", value: "restore" }, { label: "Delete Permanently", value: "delete_permanent", destructive: true }];

  return (
    <div>
      <h1 className="pf text-2xl font-bold mb-6">Content</h1>
      <div className="flex gap-2 mb-4">
        {(["testimonials", "faqs", "announcements", "pages"] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelected(new Set()); setTrashTab("active"); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize ${tab === t ? "bg-forest text-primary-foreground" : "border border-border text-text-med"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "announcements" ? (
        <AdminAnnouncementsTab />
      ) : tab === "pages" ? (
        <AdminPagesTab />
      ) : (
      <>
      <div className="flex items-center justify-between mb-4">
        <TrashTabs activeTab={trashTab} onTabChange={t => { setTrashTab(t); setSelected(new Set()); }} activeCount={activeItems.length} trashCount={trashedItems.length} />
        {trashTab === "active" && (
          tab === "testimonials" ? (
            <button onClick={() => setEditingTestimonial({ ...BLANK_TESTIMONIAL })}
              className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
              <Plus className="w-4 h-4" /> New Testimonial
            </button>
          ) : (
            <button onClick={() => setEditingFaq({ ...BLANK_FAQ })}
              className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
              <Plus className="w-4 h-4" /> New FAQ
            </button>
          )
        )}
      </div>

      <BulkActionsBar selectedCount={selected.size} actions={bulkActions}
        onApply={a => { const ids = Array.from(selected); if (a === "delete_permanent" && !confirm("Permanently delete?")) return; bulkMutation.mutate({ table: currentTable, ids, action: a }); }}
        onSelectAll={() => setSelected(new Set(displayList.map((i: any) => i.id)))}
        onDeselectAll={() => setSelected(new Set())} totalCount={displayList.length} allSelected={allSelected} />

      {tab === "testimonials" && (
        <div className="space-y-3">
          {displayList.map((t: any) => (
            <div key={t.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{t.customer_name}</span>
                    <span className="text-text-light text-xs">— {t.customer_city}</span>
                    <span className="text-xs text-coral">{"⭐".repeat(t.rating)}</span>
                  </div>
                  <p className="text-text-med text-sm italic">"{t.quote}"</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {trashTab === "active" ? (
                    <>
                      <span className={`px-2 py-1 rounded text-[10px] font-semibold ${t.is_featured ? "bg-coral/10 text-coral" : "bg-muted text-text-light"}`}>
                        {t.is_featured ? "Featured" : "Not Featured"}
                      </span>
                      <span className={`px-2 py-1 rounded text-[10px] font-semibold ${t.is_active ? "bg-forest/10 text-forest" : "bg-muted text-text-light"}`}>
                        {t.is_active ? "Active" : "Hidden"}
                      </span>
                      <button onClick={() => setEditingTestimonial(t)}
                        className="p-1 rounded hover:bg-muted text-text-med"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => bulkMutation.mutate({ table: "testimonials", ids: [t.id], action: "trash" })}
                        className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => bulkMutation.mutate({ table: "testimonials", ids: [t.id], action: "restore" })}
                        className="p-1 rounded hover:bg-forest/10 text-forest"><RotateCcw className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { if (confirm("Permanently delete?")) bulkMutation.mutate({ table: "testimonials", ids: [t.id], action: "delete_permanent" }); }}
                        className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "faqs" && (
        <div className="space-y-3">
          {displayList.map((f: any) => (
            <div key={f.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggleSelect(f.id)} className="mt-1" />
                <div className="flex-1">
                  <div className="font-semibold text-sm mb-1">{f.question}</div>
                  <p className="text-text-med text-xs line-clamp-2">{f.answer}</p>
                  <span className="text-[10px] text-text-light mt-1 inline-block capitalize">{f.category}</span>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {trashTab === "active" ? (
                    <>
                      <span className={`px-2 py-1 rounded text-[10px] font-semibold ${f.is_active ? "bg-forest/10 text-forest" : "bg-muted text-text-light"}`}>
                        {f.is_active ? "Active" : "Hidden"}
                      </span>
                      <button onClick={() => setEditingFaq(f)}
                        className="p-1 rounded hover:bg-muted text-text-med"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => bulkMutation.mutate({ table: "faq_items", ids: [f.id], action: "trash" })}
                        className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => bulkMutation.mutate({ table: "faq_items", ids: [f.id], action: "restore" })}
                        className="p-1 rounded hover:bg-forest/10 text-forest"><RotateCcw className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { if (confirm("Permanently delete?")) bulkMutation.mutate({ table: "faq_items", ids: [f.id], action: "delete_permanent" }); }}
                        className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {editingTestimonial && (
        <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center max-md:items-end max-md:p-0" onClick={() => setEditingTestimonial(null)}>
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">{editingTestimonial.id ? "Edit Testimonial" : "New Testimonial"}</h3>
              <button onClick={() => setEditingTestimonial(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Customer Name *</label>
                  <input value={editingTestimonial.customer_name} onChange={e => setEditingTestimonial((p: any) => ({ ...p, customer_name: e.target.value }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Customer City</label>
                  <input value={editingTestimonial.customer_city || ""} onChange={e => setEditingTestimonial((p: any) => ({ ...p, customer_city: e.target.value }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Initial</label>
                  <input maxLength={2} value={editingTestimonial.customer_initial || ""} onChange={e => setEditingTestimonial((p: any) => ({ ...p, customer_initial: e.target.value.toUpperCase() }))}
                    placeholder="Auto from name" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Rating</label>
                  <select value={editingTestimonial.rating} onChange={e => setEditingTestimonial((p: any) => ({ ...p, rating: Number(e.target.value) }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{"⭐".repeat(n)} ({n})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Display Order</label>
                  <input type="number" value={editingTestimonial.display_order ?? 0} onChange={e => setEditingTestimonial((p: any) => ({ ...p, display_order: e.target.value }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-text-med block mb-1">Quote *</label>
                <textarea value={editingTestimonial.quote} onChange={e => setEditingTestimonial((p: any) => ({ ...p, quote: e.target.value }))}
                  rows={5} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border">
              <button onClick={() => setEditingTestimonial(null)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted">Cancel</button>
              <button onClick={() => saveTestimonial.mutate(editingTestimonial)} disabled={!editingTestimonial.customer_name || !editingTestimonial.quote || saveTestimonial.isPending}
                className="flex-1 px-4 py-2 bg-forest text-primary-foreground rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
                {saveTestimonial.isPending ? "Saving..." : "Save Testimonial"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingFaq && (
        <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center max-md:items-end max-md:p-0" onClick={() => setEditingFaq(null)}>
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">{editingFaq.id ? "Edit FAQ" : "New FAQ"}</h3>
              <button onClick={() => setEditingFaq(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Category</label>
                  <input value={editingFaq.category || ""} onChange={e => setEditingFaq((p: any) => ({ ...p, category: e.target.value }))}
                    placeholder="general" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Display Order</label>
                  <input type="number" value={editingFaq.display_order ?? 0} onChange={e => setEditingFaq((p: any) => ({ ...p, display_order: e.target.value }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-text-med block mb-1">Question *</label>
                <textarea value={editingFaq.question} onChange={e => setEditingFaq((p: any) => ({ ...p, question: e.target.value }))}
                  rows={2} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-med block mb-1">Answer *</label>
                <textarea value={editingFaq.answer} onChange={e => setEditingFaq((p: any) => ({ ...p, answer: e.target.value }))}
                  rows={6} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border">
              <button onClick={() => setEditingFaq(null)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted">Cancel</button>
              <button onClick={() => saveFaq.mutate(editingFaq)} disabled={!editingFaq.question || !editingFaq.answer || saveFaq.isPending}
                className="flex-1 px-4 py-2 bg-forest text-primary-foreground rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
                {saveFaq.isPending ? "Saving..." : "Save FAQ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
