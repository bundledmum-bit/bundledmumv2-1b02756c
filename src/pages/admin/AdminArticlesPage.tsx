import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";

// Admin articles list. The `articles` table isn't in the generated
// Supabase types yet, so queries are cast through `any` (same pattern
// the storefront article pages use).

function timeAgo(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date).getTime();
  if (Number.isNaN(d)) return "—";
  const secs = Math.round((Date.now() - d) / 1000);
  const mins = Math.round(secs / 60), hrs = Math.round(mins / 60), days = Math.round(hrs / 24);
  if (secs < 60) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(date).toLocaleDateString();
}

const isProductListing = (body: any) =>
  Array.isArray(body) && body.some((b: any) => b?.type === "product");

export default function AdminArticlesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: articles, isLoading } = useQuery({
    queryKey: ["admin-articles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("articles")
        .select("id, slug, title, segment, is_published, display_order, read_time_minutes, updated_at, body")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const list = articles || [];
  const total = list.length;
  const published = list.filter((a) => a.is_published).length;
  const drafts = total - published;

  const publishToggle = useMutation({
    mutationFn: async (article: any) => {
      const next = !article.is_published;
      const patch: any = { is_published: next };
      if (next) patch.published_at = new Date().toISOString();
      const { error } = await (supabase as any).from("articles").update(patch).eq("id", article.id);
      if (error) throw error;
      return next;
    },
    onMutate: async (article: any) => {
      // Optimistic flip.
      await queryClient.cancelQueries({ queryKey: ["admin-articles"] });
      const prev = queryClient.getQueryData<any[]>(["admin-articles"]);
      queryClient.setQueryData<any[]>(["admin-articles"], (old) =>
        (old || []).map((a) => (a.id === article.id ? { ...a, is_published: !a.is_published } : a)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["admin-articles"], ctx.prev);
      toast.error("Could not update. Please try again.");
    },
    onSuccess: (next) => toast.success(next ? "Published" : "Unpublished"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin-articles"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-articles"] }); toast.success("Article deleted"); },
    onError: () => toast.error("Could not delete. Please try again."),
  });

  const segmentBadge = (seg: string) =>
    seg === "pregnancy" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="pf text-2xl font-bold">Articles</h1>
          <p className="text-text-med text-sm">Manage your SEO content</p>
        </div>
        <Link
          to="/admin/articles/new"
          className="inline-flex items-center justify-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep self-start"
        >
          <Plus className="w-4 h-4" /> New Article
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Articles", value: total },
          { label: "Published", value: published },
          { label: "Drafts", value: drafts },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-3">
            <div className="text-text-light text-[10px] sm:text-xs font-semibold uppercase tracking-wide leading-tight">{s.label}</div>
            <div className="text-xl sm:text-2xl font-bold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading…</div>
      ) : list.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl py-12 text-center text-text-light text-sm">
          No articles yet. Click “New Article” to create one.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="hidden md:table w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-border text-left text-text-light text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Segment</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Blocks</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const productListing = isProductListing(a.body);
                const title = (a.title || "").length > 60 ? `${a.title.slice(0, 60)}…` : a.title;
                return (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-semibold max-w-[280px]">
                      <Link to={`/admin/articles/${a.id}`} className="hover:text-forest break-words">{title}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${segmentBadge(a.segment)}`}>{a.segment}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${a.is_published ? "bg-green-100 text-green-700" : "bg-muted text-text-light"}`}>
                        {a.is_published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${productListing ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                        {productListing ? "Product Listing" : "Informational"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-med">{Array.isArray(a.body) ? a.body.length : 0}</td>
                    <td className="px-4 py-3 text-text-med">{a.display_order ?? "—"}</td>
                    <td className="px-4 py-3 text-text-med whitespace-nowrap">{timeAgo(a.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => navigate(`/admin/articles/${a.id}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border border-border hover:bg-muted"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => publishToggle.mutate(a)}
                          title={a.is_published ? "Unpublish" : "Publish"}
                          className="p-1.5 rounded hover:bg-muted text-text-med"
                        >
                          {a.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete “${a.title}”? This cannot be undone.`)) remove.mutate(a.id); }}
                          title="Delete"
                          className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile card list (table is hidden below md) */}
          <div className="md:hidden space-y-3 p-3">
            {list.map((a) => {
              const productListing = isProductListing(a.body);
              return (
                <div key={a.id} className="bg-background border border-border rounded-xl p-4 space-y-3">
                  <div className="font-semibold text-sm text-foreground leading-snug break-words">{a.title}</div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${segmentBadge(a.segment)}`}>{a.segment}</span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${a.is_published ? "bg-green-100 text-green-700" : "bg-muted text-text-light"}`}>{a.is_published ? "Published" : "Draft"}</span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${productListing ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{productListing ? "Product Listing" : "Informational"}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{Array.isArray(a.body) ? a.body.length : 0} blocks</span>
                    <span>Order: {a.display_order ?? "—"}</span>
                    <span>{timeAgo(a.updated_at)}</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => navigate(`/admin/articles/${a.id}`)}
                      className="flex-1 text-sm border border-border rounded-lg py-2 font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => publishToggle.mutate(a)}
                      className={`flex-1 text-sm border border-border rounded-lg py-2 font-medium transition-colors ${a.is_published ? "text-amber-600 hover:bg-amber-50" : "text-green-700 hover:bg-green-50"}`}
                    >
                      {a.is_published ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete “${a.title}”? This cannot be undone.`)) remove.mutate(a.id); }}
                      className="px-3 text-sm border border-red-200 rounded-lg py-2 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
