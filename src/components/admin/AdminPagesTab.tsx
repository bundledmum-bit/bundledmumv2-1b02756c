import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, X, Eye, ExternalLink } from "lucide-react";

const BLANK_PAGE = {
  title: "",
  slug: "",
  content: "",
  hero_text: "",
  meta_title: "",
  meta_description: "",
  is_published: true,
};

/**
 * Pages tab inside Admin → Content. Mirrors the standalone /admin/pages route
 * but integrated alongside testimonials/faqs/announcements. Supports create,
 * edit of title/slug/hero_text/content/meta/is_published, preview, and delete.
 */
export default function AdminPagesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<any>(null);

  const { data: pages, isLoading } = useQuery({
    queryKey: ["admin-pages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pages").select("*").order("title");
      if (error) throw error;
      return data;
    },
  });

  const savePage = useMutation({
    mutationFn: async (page: any) => {
      const payload = {
        title: page.title,
        slug: page.slug,
        content: page.content,
        hero_text: page.hero_text || null,
        meta_title: page.meta_title || null,
        meta_description: page.meta_description || null,
        is_published: page.is_published ?? true,
      };
      if (page.id) {
        const { error } = await supabase.from("pages").update(payload).eq("id", page.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pages").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pages"] });
      queryClient.invalidateQueries({ queryKey: ["page"] });
      setEditing(null);
      toast.success("Page saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deletePage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pages"] });
      toast.success("Deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-text-med text-xs">
          Static pages editable from the DB. Also accessible at <code className="bg-muted px-1.5 py-0.5 rounded">/p/:slug</code>.
        </p>
        <button onClick={() => setEditing({ ...BLANK_PAGE })}
          className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
          <Plus className="w-4 h-4" /> New Page
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Title</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Slug</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Updated</th>
                <th className="px-4 py-3 text-right font-semibold text-text-med">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(pages || []).map((p: any) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3 font-semibold">{p.title}</td>
                  <td className="px-4 py-3 text-xs text-text-light font-mono">/{p.slug}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${p.is_published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {p.is_published ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-light">{new Date(p.updated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <a href={`/p/${p.slug}`} target="_blank" rel="noopener" title="View page" className="p-1.5 hover:bg-muted rounded"><Eye className="w-3.5 h-3.5" /></a>
                      {["privacy", "terms", "cookies", "returns", "about"].includes(p.slug) && (
                        <a href={`/${p.slug}`} target="_blank" rel="noopener" title="View legacy route" className="p-1.5 hover:bg-muted rounded"><ExternalLink className="w-3.5 h-3.5" /></a>
                      )}
                      <button onClick={() => setEditing(p)} title="Edit" className="p-1.5 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { if (confirm("Delete this page?")) deletePage.mutate(p.id); }} title="Delete" className="p-1.5 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {(pages || []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-text-light text-sm">No pages yet. Click "New Page" to add one.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center" onClick={() => setEditing(null)}>
          <div className="bg-card border border-border rounded-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold">{editing.id ? "Edit Page" : "New Page"}</h3>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Title *</label>
                  <input value={editing.title}
                    onChange={e => setEditing((p: any) => ({ ...p, title: e.target.value, slug: p.id ? p.slug : e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Slug *</label>
                  <input value={editing.slug} onChange={e => setEditing((p: any) => ({ ...p, slug: e.target.value }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background font-mono" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-text-med block mb-1">Hero Text</label>
                <input value={editing.hero_text || ""} onChange={e => setEditing((p: any) => ({ ...p, hero_text: e.target.value }))}
                  placeholder="Subtitle shown under page title in the hero"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-med block mb-1">Content (HTML)</label>
                <textarea value={editing.content} onChange={e => setEditing((p: any) => ({ ...p, content: e.target.value }))}
                  rows={18} placeholder="<h2>Section</h2><p>Paragraph...</p>"
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background font-mono" />
                <p className="text-[10px] text-text-light mt-1">HTML allowed. Use &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;ol&gt;, &lt;strong&gt;, &lt;a&gt;, &lt;em&gt;.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Meta Title (SEO)</label>
                  <input value={editing.meta_title || ""} onChange={e => setEditing((p: any) => ({ ...p, meta_title: e.target.value }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Meta Description (SEO)</label>
                  <input value={editing.meta_description || ""} onChange={e => setEditing((p: any) => ({ ...p, meta_description: e.target.value }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.is_published} onChange={e => setEditing((p: any) => ({ ...p, is_published: e.target.checked }))} className="rounded" />
                Published
              </label>
            </div>
            <div className="flex gap-2 p-4 border-t border-border">
              <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted">Cancel</button>
              <button onClick={() => savePage.mutate(editing)} disabled={!editing.title || !editing.slug || savePage.isPending}
                className="flex-1 px-4 py-2 bg-forest text-primary-foreground rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
                {savePage.isPending ? "Saving..." : "Save Page"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
