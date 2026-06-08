import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, ArrowUp, ArrowDown, Pencil, Trash2, Loader2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";

// Admin article editor (create + edit). The `articles` table isn't in the
// generated Supabase types yet, so queries are cast through `any`.

const UPLOAD_URL = "https://rbtyprmkolqfylcbmgrk.supabase.co/functions/v1/admin-upload-article-image";
const UPLOAD_SECRET = "56b88edc-72ae-4294-bad2-58fdc4b61d1c";

const BLOCK_TYPES: { type: string; label: string }[] = [
  { type: "intro", label: "Intro" },
  { type: "outro", label: "Outro" },
  { type: "paragraph", label: "Paragraph" },
  { type: "section", label: "Section" },
  { type: "callout", label: "Callout" },
  { type: "product", label: "Product Card" },
  { type: "text_item", label: "Text Item" },
  { type: "link_cta", label: "Link CTA" },
  { type: "promo_card", label: "Promo Card" },
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function newBlock(type: string): any {
  switch (type) {
    case "intro": case "outro": case "paragraph": return { type, text: "" };
    case "callout": return { type, style: "tip", text: "" };
    case "section": return { type, title: "", banner_url: "", banner_alt: "" };
    case "product": return { type, product_slug: "", display_name: "", why_needed: "" };
    case "text_item": return { type, name: "", note: "", why_needed: "" };
    case "link_cta": return { type, text: "", url: "" };
    case "promo_card": return { type, emoji: "", title: "", description: "", cta_text: "", url: "" };
    default: return { type };
  }
}

function blockBadgeCls(b: any): string {
  switch (b.type) {
    case "intro": case "outro": case "paragraph": return "bg-slate-100 text-slate-600";
    case "section": return "bg-indigo-100 text-indigo-700";
    case "callout": return b.style === "warning" ? "bg-red-100 text-red-700" : b.style === "info" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700";
    case "product": return "bg-green-100 text-green-700";
    case "text_item": return "bg-teal-100 text-teal-700";
    case "link_cta": return "bg-purple-100 text-purple-700";
    case "promo_card": return "bg-orange-100 text-orange-700";
    default: return "bg-muted text-text-light";
  }
}

function blockPreview(b: any): string {
  switch (b.type) {
    case "intro": case "outro": case "paragraph": return (b.text || "").slice(0, 70);
    case "callout": return `${b.style || "tip"}: ${(b.text || "").slice(0, 60)}`;
    case "section": return `Section: ${b.title || ""}`;
    case "product": return `Product: ${b.display_name || ""}`;
    case "text_item": return b.name || "";
    case "link_cta": return `${b.text || ""} → ${b.url || ""}`;
    case "promo_card": return `${b.emoji || ""} ${b.title || ""}`;
    default: return "";
  }
}

const inputCls = "w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-forest/30";
const labelCls = "block text-xs font-semibold text-text-med mb-1";

export default function AdminArticleEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isCreate = !id || id === "new";

  const { data: article, isLoading } = useQuery({
    queryKey: ["admin-article", id],
    enabled: !isCreate,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("articles").select("*").eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const [form, setForm] = useState({
    title: "", slug: "", segment: "pregnancy", excerpt: "",
    meta_title: "", meta_description: "", read_time_minutes: 5, display_order: 1,
    is_published: false, hero_image_url: "", hero_image_alt: "",
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const [body, setBody] = useState<any[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ title?: string; slug?: string; segment?: string }>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const slugManual = useRef(false);
  const inited = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Initialise state from the fetched article (edit mode), once.
  useEffect(() => {
    if (article && !inited.current) {
      inited.current = true;
      setForm({
        title: article.title || "", slug: article.slug || "", segment: article.segment || "pregnancy",
        excerpt: article.excerpt || "", meta_title: article.meta_title || "", meta_description: article.meta_description || "",
        read_time_minutes: article.read_time_minutes ?? 5, display_order: article.display_order ?? 1,
        is_published: !!article.is_published, hero_image_url: article.hero_image_url || "", hero_image_alt: article.hero_image_alt || "",
      });
      setBody(Array.isArray(article.body) ? article.body : []);
      slugManual.current = true; // keep the saved slug; don't auto-overwrite
    }
  }, [article]);

  const onTitleChange = (v: string) =>
    setForm((f) => ({ ...f, title: v, slug: slugManual.current ? f.slug : slugify(v) }));
  const onSlugChange = (v: string) => { slugManual.current = true; set("slug", v); };

  // ── block ops ──
  const addBlock = (type: string) => { setBody((b) => [...b, newBlock(type)]); setEditingIndex(body.length); setShowAdd(false); };
  const updateBlock = (i: number, patch: any) => setBody((b) => b.map((bl, idx) => (idx === i ? { ...bl, ...patch } : bl)));
  const removeBlock = (i: number) => { setBody((b) => b.filter((_, idx) => idx !== i)); setEditingIndex(null); };
  const move = (i: number, dir: -1 | 1) => {
    setBody((b) => {
      const j = i + dir;
      if (j < 0 || j >= b.length) return b;
      const c = [...b]; [c[i], c[j]] = [c[j], c[i]]; return c;
    });
    setEditingIndex(null);
  };

  const validate = () => {
    const e: typeof errors = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.slug.trim()) e.slug = "Slug is required";
    else if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = "Lowercase letters, numbers and hyphens only";
    if (!form.segment) e.segment = "Segment is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async (publish = false) => {
    if (!validate()) { toast.error("Please fix the highlighted fields"); return; }
    setSaving(true);
    const willPublish = publish || form.is_published;
    const payload: any = {
      slug: form.slug, segment: form.segment, title: form.title, excerpt: form.excerpt || null,
      hero_image_url: form.hero_image_url || null, hero_image_alt: form.hero_image_alt || null,
      body, meta_title: form.meta_title || null, meta_description: form.meta_description || null,
      read_time_minutes: Number(form.read_time_minutes) || null, display_order: Number(form.display_order) || null,
      is_published: willPublish,
    };
    if (willPublish && (publish || !article?.published_at)) payload.published_at = new Date().toISOString();
    try {
      if (isCreate) {
        const { data, error } = await (supabase as any).from("articles").insert(payload).select().single();
        if (error) throw error;
        toast.success("Article created");
        navigate(`/admin/articles/${data.id}`);
      } else {
        payload.updated_at = new Date().toISOString();
        const { error } = await (supabase as any).from("articles").update(payload).eq("id", id);
        if (error) throw error;
        if (publish) set("is_published", true);
        toast.success(publish ? "Saved & published" : "Saved");
      }
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const unpublish = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("articles").update({ is_published: false }).eq("id", id);
      if (error) throw error;
      set("is_published", false);
      toast.success("Unpublished");
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const onHeroFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1] || "");
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const resp = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { "x-upload-secret": UPLOAD_SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({ path: `articles/${Date.now()}-${file.name}`, content_base64: b64, content_type: file.type }),
      });
      if (!resp.ok) throw new Error("Upload failed");
      const json = await resp.json();
      set("hero_image_url", json.url);
      toast.success("Image uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!isCreate && isLoading) return <div className="text-center py-10 text-text-med">Loading…</div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/articles" className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="pf text-2xl font-bold">{isCreate ? "New Article" : "Edit Article"}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        {/* ── LEFT: block editor ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-text-med">Article Body</span>
            <div className="relative">
              <button
                onClick={() => setShowAdd((s) => !s)}
                className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-forest-deep"
              >
                <Plus className="w-4 h-4" /> Add Block
              </button>
              {showAdd && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowAdd(false)} />
                  <div className="absolute right-0 mt-1 z-20 bg-card border border-border rounded-lg shadow-lg py-1 w-44">
                    {BLOCK_TYPES.map((bt) => (
                      <button key={bt.type} onClick={() => addBlock(bt.type)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted">
                        {bt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {body.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-xl py-10 text-center text-text-light text-sm">
              No blocks yet. Use “Add Block” to start building the article.
            </div>
          ) : (
            <div className="space-y-2">
              {body.map((block, i) => (
                <div key={i}>
                  <div
                    className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-forest/40"
                    onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                  >
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 ${blockBadgeCls(block)}`}>
                      {block.type}
                    </span>
                    <span className="text-sm text-text-med truncate flex-1 min-w-0">{blockPreview(block)}</span>
                    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"><ArrowUp className="w-4 h-4" /></button>
                      <button onClick={() => move(i, 1)} disabled={i === body.length - 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"><ArrowDown className="w-4 h-4" /></button>
                      <button onClick={() => setEditingIndex(editingIndex === i ? null : i)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => removeBlock(i)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {editingIndex === i && (
                    <div className="border border-t-0 border-border rounded-b-xl bg-muted/30 p-4 -mt-1 space-y-3">
                      <BlockFields block={block} onChange={(patch) => updateBlock(i, patch)} />
                      <button onClick={() => setEditingIndex(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card hover:bg-muted">Done</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: metadata panel ── */}
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <button onClick={() => save(false)} disabled={saving} className="w-full inline-flex items-center justify-center gap-2 bg-forest text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
            {!form.is_published ? (
              <button onClick={() => save(true)} disabled={saving} className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold border border-forest text-forest hover:bg-forest-light disabled:opacity-50">
                Save & Publish
              </button>
            ) : (
              <button onClick={unpublish} disabled={saving || isCreate} className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold border border-border text-text-med hover:bg-muted disabled:opacity-50">
                Unpublish
              </button>
            )}
          </div>

          {/* Basic info */}
          <Panel title="Basic Info">
            <Field label="Title *" error={errors.title}>
              <input className={inputCls} value={form.title} onChange={(e) => onTitleChange(e.target.value)} />
            </Field>
            <Field label="Slug *" error={errors.slug} hint={`/articles/${form.slug || "…"}`}>
              <input className={`${inputCls} font-mono`} value={form.slug} onChange={(e) => onSlugChange(e.target.value)} />
            </Field>
            <Field label="Segment *" error={errors.segment}>
              <select className={inputCls} value={form.segment} onChange={(e) => set("segment", e.target.value)}>
                <option value="pregnancy">Pregnancy</option>
                <option value="parenting">Parenting</option>
              </select>
            </Field>
            <Field label="Excerpt *" hint="Shown on the articles index card">
              <textarea className={inputCls} rows={3} value={form.excerpt} onChange={(e) => set("excerpt", e.target.value)} />
            </Field>
          </Panel>

          {/* SEO */}
          <Panel title="SEO">
            <Field label="Meta Title" hint={`${form.meta_title.length}/60 recommended`}>
              <input className={inputCls} value={form.meta_title} placeholder={`${form.title || "Title"} | BundledMum`} onChange={(e) => set("meta_title", e.target.value)} />
            </Field>
            <Field label="Meta Description" hint={`${form.meta_description.length}/155 recommended`}>
              <textarea className={inputCls} rows={2} value={form.meta_description} onChange={(e) => set("meta_description", e.target.value)} />
            </Field>
          </Panel>

          {/* Settings */}
          <Panel title="Settings">
            <Field label="Read Time (minutes)">
              <input type="number" min={1} className={inputCls} value={form.read_time_minutes} onChange={(e) => set("read_time_minutes", e.target.value)} />
            </Field>
            <Field label="Display Order" hint="Lower = shown first on index page">
              <input type="number" min={1} className={inputCls} value={form.display_order} onChange={(e) => set("display_order", e.target.value)} />
            </Field>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold">Published</span>
              <Switch
                checked={form.is_published}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_published: v }))}
              />
            </div>
          </Panel>

          {/* Hero image */}
          <Panel title="Hero Image">
            {form.hero_image_url ? (
              <div className="space-y-2">
                <img src={form.hero_image_url} alt={form.hero_image_alt || ""} className="w-full rounded-lg max-h-40 object-cover border border-border" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                <button onClick={() => set("hero_image_url", "")} className="inline-flex items-center gap-1 text-xs font-semibold text-destructive hover:underline">
                  <X className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-border rounded-lg py-8 text-center text-sm text-text-light hover:border-forest/40 disabled:opacity-50"
              >
                {uploading ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</span> : "Click to upload hero image"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onHeroFile(e.target.files?.[0])} />
            {form.hero_image_url && (
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="mt-2 text-xs font-semibold text-forest hover:underline disabled:opacity-50">
                {uploading ? "Uploading…" : "Replace image"}
              </button>
            )}
            <Field label="Hero Image Alt Text">
              <input className={inputCls} value={form.hero_image_alt} onChange={(e) => set("hero_image_alt", e.target.value)} />
            </Field>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-text-light mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {error ? <p className="text-xs text-destructive mt-1">{error}</p> : hint ? <p className="text-[11px] text-text-light mt-1 font-mono break-all">{hint}</p> : null}
    </div>
  );
}

// Inline edit fields per block type.
function BlockFields({ block, onChange }: { block: any; onChange: (patch: any) => void }) {
  const t = block.type;
  if (t === "intro" || t === "outro" || t === "paragraph") {
    return (
      <Field label="Text"><textarea className={inputCls} rows={4} value={block.text || ""} onChange={(e) => onChange({ text: e.target.value })} /></Field>
    );
  }
  if (t === "callout") {
    return (
      <>
        <Field label="Style">
          <select className={inputCls} value={block.style || "tip"} onChange={(e) => onChange({ style: e.target.value })}>
            <option value="tip">Tip</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
          </select>
        </Field>
        <Field label="Text"><textarea className={inputCls} rows={3} value={block.text || ""} onChange={(e) => onChange({ text: e.target.value })} /></Field>
      </>
    );
  }
  if (t === "section") {
    return (
      <>
        <Field label="Section Title"><input className={inputCls} value={block.title || ""} onChange={(e) => onChange({ title: e.target.value })} /></Field>
        <Field label="Banner Image URL (optional)"><input className={inputCls} value={block.banner_url || ""} onChange={(e) => onChange({ banner_url: e.target.value })} /></Field>
        <Field label="Banner Alt Text (optional)"><input className={inputCls} value={block.banner_alt || ""} onChange={(e) => onChange({ banner_alt: e.target.value })} /></Field>
      </>
    );
  }
  if (t === "product") {
    return (
      <>
        <Field label="Product Slug" hint="e.g. maternity-pad-bm"><input className={inputCls} value={block.product_slug || ""} onChange={(e) => onChange({ product_slug: e.target.value })} /></Field>
        <Field label="Display Name"><input className={inputCls} value={block.display_name || ""} onChange={(e) => onChange({ display_name: e.target.value })} /></Field>
        <Field label="Why Needed"><textarea className={inputCls} rows={3} value={block.why_needed || ""} onChange={(e) => onChange({ why_needed: e.target.value })} /></Field>
      </>
    );
  }
  if (t === "text_item") {
    return (
      <>
        <Field label="Name"><input className={inputCls} value={block.name || ""} onChange={(e) => onChange({ name: e.target.value })} /></Field>
        <Field label="Note (optional)"><input className={inputCls} value={block.note || ""} onChange={(e) => onChange({ note: e.target.value })} /></Field>
        <Field label="Why Needed"><textarea className={inputCls} rows={3} value={block.why_needed || ""} onChange={(e) => onChange({ why_needed: e.target.value })} /></Field>
      </>
    );
  }
  if (t === "link_cta") {
    return (
      <>
        <Field label="Button Text"><input className={inputCls} value={block.text || ""} onChange={(e) => onChange({ text: e.target.value })} /></Field>
        <Field label="URL" hint="internal /path or https:// for WhatsApp"><input className={inputCls} value={block.url || ""} onChange={(e) => onChange({ url: e.target.value })} /></Field>
      </>
    );
  }
  if (t === "promo_card") {
    return (
      <>
        <Field label="Emoji"><input className={inputCls} value={block.emoji || ""} onChange={(e) => onChange({ emoji: e.target.value })} /></Field>
        <Field label="Title"><input className={inputCls} value={block.title || ""} onChange={(e) => onChange({ title: e.target.value })} /></Field>
        <Field label="Description"><textarea className={inputCls} rows={2} value={block.description || ""} onChange={(e) => onChange({ description: e.target.value })} /></Field>
        <Field label="CTA Button Text"><input className={inputCls} value={block.cta_text || ""} onChange={(e) => onChange({ cta_text: e.target.value })} /></Field>
        <Field label="URL"><input className={inputCls} value={block.url || ""} onChange={(e) => onChange({ url: e.target.value })} /></Field>
      </>
    );
  }
  return null;
}
