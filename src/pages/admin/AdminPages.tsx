import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, X, Eye, FileText, ArrowUp, ArrowDown } from "lucide-react";
import { ABOUT_DEFAULTS, type AboutBlocks } from "@/pages/AboutPage";

// Generated supabase types may not yet include `body_blocks` /
// `last_updated_label`; cast the client like useMerchandising does.
const supabase = supabaseTyped as any;

// ---------------------------------------------------------------------------
// Editor state types — match the `pages` row shape we read/write here.
// ---------------------------------------------------------------------------

interface PageEditState {
  id?: string;
  title: string;
  slug: string;
  content: string;
  hero_text: string;
  meta_title: string;
  meta_description: string;
  is_published: boolean;
  last_updated_label: string;
  body_blocks: AboutBlocks | null;
}

const blankPage = (): PageEditState => ({
  title: "",
  slug: "",
  content: "",
  hero_text: "",
  meta_title: "",
  meta_description: "",
  is_published: true,
  last_updated_label: "",
  body_blocks: null,
});

function rowToState(row: any): PageEditState {
  return {
    id: row.id,
    title: row.title ?? "",
    slug: row.slug ?? "",
    content: row.content ?? "",
    hero_text: row.hero_text ?? "",
    meta_title: row.meta_title ?? "",
    meta_description: row.meta_description ?? "",
    is_published: row.is_published ?? true,
    last_updated_label: row.last_updated_label ?? "",
    body_blocks: row.body_blocks ?? null,
  };
}

export default function AdminPages() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PageEditState | null>(null);

  const { data: pages, isLoading } = useQuery({
    queryKey: ["admin-pages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pages").select("*").order("title");
      if (error) throw error;
      return data;
    },
  });

  const savePage = useMutation({
    mutationFn: async (page: PageEditState) => {
      // Build payload conditionally: About-only writes body_blocks; legal
      // pages write last_updated_label. Both always send the common fields.
      const isAbout = page.slug === "about";
      const payload: any = {
        title: page.title,
        slug: page.slug,
        content: page.content,
        hero_text: page.hero_text || null,
        meta_title: page.meta_title || null,
        meta_description: page.meta_description || null,
        is_published: page.is_published ?? true,
        last_updated_label: isAbout ? null : (page.last_updated_label || null),
        body_blocks: isAbout ? page.body_blocks : null,
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-pages"] }); toast.success("Deleted"); },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="pf text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6" /> Pages</h1>
        <button onClick={() => setEditing(blankPage())}
          className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
          <Plus className="w-4 h-4" /> Add Page
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
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
                      <a href={`/${p.slug}`} target="_blank" rel="noopener" className="p-1.5 hover:bg-muted rounded"><Eye className="w-3.5 h-3.5" /></a>
                      <button onClick={() => setEditing(rowToState(p))} className="p-1.5 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { if (confirm("Delete?")) deletePage.mutate(p.id); }} className="p-1.5 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PageEditorModal
          editing={editing}
          setEditing={setEditing}
          onSave={() => savePage.mutate(editing)}
          saving={savePage.isPending}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal — picks editor template by slug.
// ---------------------------------------------------------------------------

function PageEditorModal({
  editing, setEditing, onSave, saving,
}: {
  editing: PageEditState;
  setEditing: (p: PageEditState | null) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const isAbout = editing.slug === "about";

  // For About rows, ensure body_blocks is initialized to defaults so the
  // structured form never has to deal with null. We do this once per modal
  // open, after slug becomes "about" — keeps the user's edits if they flip
  // the slug back and forth.
  useEffect(() => {
    if (isAbout && !editing.body_blocks) {
      setEditing({ ...editing, body_blocks: ABOUT_DEFAULTS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAbout]);

  return (
    <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center" onClick={() => setEditing(null)}>
      <div className="bg-card border border-border rounded-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-bold">{editing.id ? "Edit Page" : "New Page"}</h3>
          <button onClick={() => setEditing(null)}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          {/* Common fields (title/slug/meta/published) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Title *</label>
              <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value, slug: editing.id ? editing.slug : e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Slug *</label>
              <input value={editing.slug} onChange={e => setEditing({ ...editing, slug: e.target.value })}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background font-mono" />
            </div>
          </div>

          {isAbout ? (
            <AboutEditor editing={editing} setEditing={setEditing} />
          ) : (
            <LegalEditor editing={editing} setEditing={setEditing} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Meta Title</label>
              <input value={editing.meta_title || ""} onChange={e => setEditing({ ...editing, meta_title: e.target.value })}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Meta Description</label>
              <input value={editing.meta_description || ""} onChange={e => setEditing({ ...editing, meta_description: e.target.value })}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editing.is_published} onChange={e => setEditing({ ...editing, is_published: e.target.checked })} className="rounded" />
            Published
          </label>
        </div>
        <div className="flex gap-2 p-4 border-t border-border">
          <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted">Cancel</button>
          <button onClick={onSave} disabled={!editing.title || !editing.slug || saving}
            className="flex-1 px-4 py-2 bg-forest text-primary-foreground rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
            {saving ? "Saving..." : "Save Page"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legal-prose editor (Template B)
// ---------------------------------------------------------------------------

function LegalEditor({
  editing, setEditing,
}: {
  editing: PageEditState;
  setEditing: (p: PageEditState) => void;
}) {
  return (
    <>
      <div>
        <label className="text-xs font-semibold text-text-med block mb-1">Last updated label</label>
        <input value={editing.last_updated_label} onChange={e => setEditing({ ...editing, last_updated_label: e.target.value })}
          placeholder="Last updated: April 2026"
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
        <p className="text-[10px] text-text-light mt-1">Shown as the small subtitle under the page title in the green hero. Preferred over the legacy hero subtitle for legal pages.</p>
      </div>
      <div>
        <label className="text-xs font-semibold text-text-med block mb-1">Hero subtitle (legacy)</label>
        <input value={editing.hero_text || ""} onChange={e => setEditing({ ...editing, hero_text: e.target.value })}
          placeholder="Used only when 'Last updated label' is empty"
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
      </div>
      <div>
        <label className="text-xs font-semibold text-text-med block mb-1">Content (HTML)</label>
        <textarea value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })}
          rows={20} placeholder="<h2>Section</h2><p>Paragraph...</p>"
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background font-mono" />
        <p className="text-[10px] text-text-light mt-1">HTML allowed. Use &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;ol&gt;, &lt;strong&gt;, &lt;a&gt;, &lt;em&gt;.</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// About structured editor (Template A)
// ---------------------------------------------------------------------------

function AboutEditor({
  editing, setEditing,
}: {
  editing: PageEditState;
  setEditing: (p: PageEditState) => void;
}) {
  const blocks = editing.body_blocks ?? ABOUT_DEFAULTS;
  const update = (next: AboutBlocks) => setEditing({ ...editing, body_blocks: next });

  // Paragraph helpers — operate on a flat string[] in body_blocks.narrative.
  const addParagraph = () => update({ ...blocks, narrative: [...blocks.narrative, ""] });
  const removeParagraph = (idx: number) =>
    update({ ...blocks, narrative: blocks.narrative.filter((_, i) => i !== idx) });
  const setParagraph = (idx: number, value: string) =>
    update({ ...blocks, narrative: blocks.narrative.map((p, i) => i === idx ? value : p) });
  const moveParagraph = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= blocks.narrative.length) return;
    const arr = blocks.narrative.slice();
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    update({ ...blocks, narrative: arr });
  };

  // Value helpers — fixed at 3 slots; mutate in place.
  const setValue = (idx: number, patch: Partial<{ icon: string; title: string; body: string }>) =>
    update({ ...blocks, values: blocks.values.map((v, i) => i === idx ? { ...v, ...patch } : v) });

  return (
    <div className="space-y-5 border-t border-border pt-4">
      <p className="text-[11px] text-text-light italic">Editing the structured About page. Title and meta still come from the common fields above.</p>

      {/* Hero */}
      <section>
        <h4 className="font-semibold text-sm mb-2">Hero</h4>
        <div className="flex gap-3 mb-2">
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Emoji</label>
            <input value={blocks.hero.emoji}
              onChange={e => update({ ...blocks, hero: { ...blocks.hero, emoji: e.target.value } })}
              className="w-16 border border-input rounded-lg px-3 py-2 text-sm bg-background text-center" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-text-med block mb-1">Headline</label>
            <input value={blocks.hero.headline}
              onChange={e => update({ ...blocks, hero: { ...blocks.hero, headline: e.target.value } })}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-text-med block mb-1">Subtitle</label>
          <input value={blocks.hero.subtitle}
            onChange={e => update({ ...blocks, hero: { ...blocks.hero, subtitle: e.target.value } })}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
        </div>
      </section>

      {/* Paragraphs */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-sm">Paragraphs</h4>
          <p className="text-[10px] text-text-light">Wrap text in <code className="bg-muted px-1 rounded">**bold**</code> for forest-coloured emphasis.</p>
        </div>
        <div className="space-y-2">
          {blocks.narrative.map((p, idx) => (
            <div key={idx} className="border border-border rounded-lg p-2 bg-muted/20">
              <textarea value={p} onChange={e => setParagraph(idx, e.target.value)}
                rows={3} className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background" />
              <div className="flex items-center justify-end gap-1 mt-1">
                <button onClick={() => moveParagraph(idx, -1)} disabled={idx === 0}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30" title="Move up">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => moveParagraph(idx, 1)} disabled={idx === blocks.narrative.length - 1}
                  className="p-1 hover:bg-muted rounded disabled:opacity-30" title="Move down">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => removeParagraph(idx)}
                  className="flex items-center gap-1 px-2 py-1 text-destructive hover:bg-destructive/10 rounded text-xs">
                  <X className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addParagraph}
          className="mt-2 flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted">
          <Plus className="w-3.5 h-3.5" /> Add paragraph
        </button>
      </section>

      {/* Values — fixed 3 slots */}
      <section>
        <h4 className="font-semibold text-sm mb-2">Values (3 cards)</h4>
        <div className="space-y-3">
          {blocks.values.map((v, idx) => (
            <div key={idx} className="border border-border rounded-lg p-3 bg-muted/20 space-y-2">
              <div className="flex gap-2">
                <input value={v.icon} onChange={e => setValue(idx, { icon: e.target.value })}
                  className="w-16 border border-input rounded px-2 py-1.5 text-sm bg-background text-center" placeholder="🌿" />
                <input value={v.title} onChange={e => setValue(idx, { title: e.target.value })}
                  className="flex-1 border border-input rounded px-2 py-1.5 text-sm bg-background" placeholder="Title" />
              </div>
              <textarea value={v.body} onChange={e => setValue(idx, { body: e.target.value })}
                rows={2} className="w-full border border-input rounded px-2 py-1.5 text-sm bg-background" placeholder="Body" />
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section>
        <h4 className="font-semibold text-sm mb-2">CTA panel</h4>
        <div className="space-y-2">
          <input value={blocks.cta.heading} onChange={e => update({ ...blocks, cta: { ...blocks.cta, heading: e.target.value } })}
            placeholder="Heading" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
          <textarea value={blocks.cta.body} onChange={e => update({ ...blocks, cta: { ...blocks.cta, body: e.target.value } })}
            rows={2} placeholder="Body"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
          <div className="grid grid-cols-2 gap-2">
            <input value={blocks.cta.button_label} onChange={e => update({ ...blocks, cta: { ...blocks.cta, button_label: e.target.value } })}
              placeholder="Button label" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            <input value={blocks.cta.button_link} onChange={e => update({ ...blocks, cta: { ...blocks.cta, button_link: e.target.value } })}
              placeholder="/quiz or https://…" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background font-mono" />
          </div>
        </div>
      </section>
    </div>
  );
}
