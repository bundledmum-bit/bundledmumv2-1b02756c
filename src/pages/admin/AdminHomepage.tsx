import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, GripVertical, Layout as LayoutIcon, Plus, Save, Search, Star, Trash2 } from "lucide-react";
import {
  useAllHomepageSections, useUpdateHomepageSection,
  useAllHowItWorksSteps, useUpsertHowItWorksStep, useDeleteHowItWorksStep,
  useToggleProductFlag,
  type HomepageSection,
} from "@/hooks/useHomepage";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";
const btnPrimary = "inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40";

export default function AdminHomepage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-forest flex items-center gap-2">
          <LayoutIcon className="w-6 h-6" /> Homepage
        </h1>
        <p className="text-xs text-text-light mt-1">
          Control which sections appear on the homepage, their order, copy, and the products featured in each rail.
        </p>
      </header>

      <SectionsEditor />
      <FeaturedBestsellerPicker />
      <HowItWorksEditor />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections editor — drag to reorder, edit title/subtitle/visibility/settings
// ---------------------------------------------------------------------------

function SectionsEditor() {
  const { data: sections, isLoading } = useAllHomepageSections();
  const upd = useUpdateHomepageSection();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [local, setLocal] = useState<HomepageSection[]>([]);

  useEffect(() => { if (sections) setLocal(sections); }, [sections]);

  const handleDrop = async (targetId: string) => {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); return; }
    const next = [...local];
    const fromIdx = next.findIndex(s => s.id === draggingId);
    const toIdx = next.findIndex(s => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0) { setDraggingId(null); return; }
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setLocal(next);
    setDraggingId(null);
    // Persist the new display_order values (0-indexed).
    try {
      await Promise.all(next.map((s, i) => upd.mutateAsync({ id: s.id, display_order: i })));
      toast.success("Order saved");
    } catch (e: any) {
      toast.error(e?.message || "Reorder failed");
    }
  };

  if (isLoading) return <div className="text-center py-10 text-text-med text-sm">Loading homepage sections…</div>;
  if (!local.length) return null;

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="font-bold text-sm">Sections</h2>
        <p className="text-[11px] text-text-light mt-0.5">Drag to reorder. Toggle visibility, update copy, and adjust per-section settings.</p>
      </div>
      <div className="divide-y divide-border">
        {local.map(s => (
          <SectionRow
            key={s.id}
            section={s}
            draggingId={draggingId}
            onDragStart={() => setDraggingId(s.id)}
            onDragOver={e => { e.preventDefault(); }}
            onDrop={() => handleDrop(s.id)}
            onDragEnd={() => setDraggingId(null)}
          />
        ))}
      </div>
    </section>
  );
}

function SectionRow({
  section, draggingId, onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  section: HomepageSection;
  draggingId: string | null;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const upd = useUpdateHomepageSection();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<HomepageSection>(section);
  useEffect(() => { setDraft(section); }, [section]);

  const settings = (draft.settings || {}) as Record<string, any>;
  const setSetting = (k: string, v: any) => setDraft({ ...draft, settings: { ...settings, [k]: v } });

  const dirty = JSON.stringify(draft) !== JSON.stringify(section);
  const isDragging = draggingId === section.id;

  const toggleVisible = () => upd.mutateAsync({ id: section.id, is_visible: !section.is_visible })
    .then(() => toast.success(`${section.section_label} ${!section.is_visible ? "shown" : "hidden"}`))
    .catch(e => toast.error(e?.message || "Failed"));

  const save = () => upd.mutateAsync({
    id: draft.id,
    title: draft.title || null,
    subtitle: draft.subtitle || null,
    settings: draft.settings || {},
  }).then(() => toast.success("Saved")).catch(e => toast.error(e?.message || "Save failed"));

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`p-3 ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-text-light cursor-grab flex-shrink-0" />
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 text-left">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <div>
            <div className="font-semibold text-sm">{section.section_label}</div>
            <div className="text-[10px] text-text-light">key: <code className="bg-muted/60 px-1 rounded">{section.section_key}</code></div>
          </div>
        </button>
        <label className="relative inline-flex cursor-pointer items-center ml-2">
          <input type="checkbox" className="peer sr-only" checked={section.is_visible} onChange={toggleVisible} />
          <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-forest peer-checked:after:translate-x-4" />
        </label>
      </div>

      {open && (
        <div className="mt-3 pl-7 space-y-3">
          <div className="grid md:grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Title</label>
              <input value={draft.title || ""} onChange={e => setDraft({ ...draft, title: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Subtitle</label>
              <input value={draft.subtitle || ""} onChange={e => setDraft({ ...draft, subtitle: e.target.value })} className={inputCls} />
            </div>
          </div>

          {/* Known settings per section_key — keeps the admin from editing raw JSON */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {"max_items" in settings || ["featured_products", "most_loved", "testimonials"].includes(draft.section_key) ? (
              <div>
                <label className={labelCls}>Max items</label>
                <input type="number" min={1} max={20} value={settings.max_items ?? ""} onChange={e => setSetting("max_items", e.target.value ? Number(e.target.value) : null)} className={inputCls} />
              </div>
            ) : null}
            {"show_prices" in settings || draft.section_key === "bundle_tiers" ? (
              <label className="flex items-center gap-2 text-xs mt-4">
                <input type="checkbox" checked={!!settings.show_prices} onChange={e => setSetting("show_prices", e.target.checked)} />
                Show prices
              </label>
            ) : null}
            {"show_quiz_cta" in settings || draft.section_key === "hero" ? (
              <label className="flex items-center gap-2 text-xs mt-4">
                <input type="checkbox" checked={!!settings.show_quiz_cta} onChange={e => setSetting("show_quiz_cta", e.target.checked)} />
                Show quiz CTA
              </label>
            ) : null}
            {draft.section_key === "hero" ? (
              <label className="flex items-center gap-2 text-xs mt-4">
                <input
                  type="checkbox"
                  checked={settings.show_search !== false}
                  onChange={e => setSetting("show_search", e.target.checked)}
                />
                Show search bar
              </label>
            ) : null}
          </div>

          <div className="flex justify-end">
            <button onClick={save} disabled={!dirty || upd.isPending} className={btnPrimary}>
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured / Bestseller product picker + badge label editor
// ---------------------------------------------------------------------------

function FeaturedBestsellerPicker() {
  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-homepage-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, category, is_featured, is_bestseller, featured_order, badge_label, is_active")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  const toggle = useToggleProductFlag();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"featured" | "bestsellers">("featured");

  const filtered = useMemo(() => {
    const base = (products || []).filter(p =>
      tab === "featured" ? true : true // all products — checkbox filters which get the flag
    );
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter(p => p.name.toLowerCase().includes(q));
  }, [products, tab, search]);

  if (isLoading) return null;

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-sm flex items-center gap-2"><Star className="w-4 h-4" /> Featured & Bestsellers</h2>
          <p className="text-[11px] text-text-light mt-0.5">
            Toggle products into the <b>Featured</b> rail (appears on the homepage) or mark them as <b>Bestsellers</b>.
            Badge labels appear next to the product name.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
            <button onClick={() => setTab("featured")} className={`px-2.5 py-1 rounded-md ${tab === "featured" ? "bg-card font-semibold" : ""}`}>Featured</button>
            <button onClick={() => setTab("bestsellers")} className={`px-2.5 py-1 rounded-md ${tab === "bestsellers" ? "bg-card font-semibold" : ""}`}>Bestsellers</button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" className="pl-7 pr-3 py-1.5 border border-input rounded-lg text-xs bg-background" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-center">Featured</th>
              <th className="px-3 py-2 text-center">Bestseller</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Badge label</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <ProductFlagRow
                key={p.id}
                product={p}
                onUpdate={payload => toggle.mutateAsync({ id: p.id, ...payload }).then(() => toast.success("Saved"))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductFlagRow({ product: p, onUpdate }: { product: any; onUpdate: (payload: Partial<{ is_featured: boolean; is_bestseller: boolean; featured_order: number | null; badge_label: string | null }>) => Promise<any> }) {
  const [badge, setBadge] = useState(p.badge_label || "");
  const [order, setOrder] = useState<string>(p.featured_order == null ? "" : String(p.featured_order));
  useEffect(() => { setBadge(p.badge_label || ""); setOrder(p.featured_order == null ? "" : String(p.featured_order)); }, [p.badge_label, p.featured_order]);

  return (
    <tr className="border-t border-border hover:bg-muted/20">
      <td className="px-3 py-1.5 font-medium">{p.name}</td>
      <td className="px-3 py-1.5 text-text-light capitalize">{p.category || "—"}</td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={!!p.is_featured} onChange={e => onUpdate({ is_featured: e.target.checked })} />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input type="checkbox" checked={!!p.is_bestseller} onChange={e => onUpdate({ is_bestseller: e.target.checked })} />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          value={order}
          onChange={e => setOrder(e.target.value)}
          onBlur={() => onUpdate({ featured_order: order === "" ? null : Number(order) })}
          className="w-16 border border-input rounded px-1.5 py-0.5 text-xs bg-background"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          value={badge}
          onChange={e => setBadge(e.target.value)}
          onBlur={() => onUpdate({ badge_label: badge.trim() || null })}
          placeholder="e.g. Bestseller"
          className="w-32 border border-input rounded px-1.5 py-0.5 text-xs bg-background"
        />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// How It Works editor (drag to reorder + inline edit)
// ---------------------------------------------------------------------------

function HowItWorksEditor() {
  const { data: steps } = useAllHowItWorksSteps();
  const upsert = useUpsertHowItWorksStep();
  const del = useDeleteHowItWorksStep();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState(steps || []);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => { if (steps) setDrafts(steps); }, [steps]);

  const addStep = () => {
    const nextOrder = (drafts[drafts.length - 1]?.display_order ?? 0) + 1;
    upsert.mutateAsync({
      step_number: drafts.length + 1,
      icon: "✨",
      title: "New step",
      description: "Describe what happens here",
      is_active: true,
      display_order: nextOrder,
    } as any).then(() => toast.success("Step added"));
  };

  const handleDrop = async (targetId: string) => {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); return; }
    const next = [...drafts];
    const fromIdx = next.findIndex(s => s.id === draggingId);
    const toIdx = next.findIndex(s => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0) { setDraggingId(null); return; }
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setDrafts(next);
    setDraggingId(null);
    try {
      await Promise.all(next.map((s, i) => upsert.mutateAsync({ id: s.id, display_order: i, step_number: i + 1 } as any)));
      toast.success("Order saved");
    } catch (e: any) {
      toast.error(e?.message || "Reorder failed");
    }
  };

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full p-4 flex items-center justify-between border-b border-border">
        <div className="text-left">
          <h2 className="font-bold text-sm">How It Works steps</h2>
          <p className="text-[11px] text-text-light mt-0.5">3 steps shown on the homepage. Drag to reorder, inline-edit any field.</p>
        </div>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {open && (
        <div className="p-3 space-y-2">
          {drafts.map(s => (
            <HowItWorksRow
              key={s.id}
              step={s}
              draggingId={draggingId}
              onDragStart={() => setDraggingId(s.id)}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={() => handleDrop(s.id)}
              onDragEnd={() => setDraggingId(null)}
              onSave={patch => upsert.mutateAsync({ id: s.id, ...patch } as any).then(() => toast.success("Saved"))}
              onDelete={() => { if (confirm("Delete this step?")) del.mutateAsync(s.id).then(() => toast.success("Deleted")); }}
            />
          ))}
          <button onClick={addStep} className="text-xs font-semibold text-forest hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add step</button>
        </div>
      )}
    </section>
  );
}

function HowItWorksRow({
  step, draggingId, onDragStart, onDragOver, onDrop, onDragEnd, onSave, onDelete,
}: {
  step: any;
  draggingId: string | null;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onSave: (p: Partial<{ icon: string; title: string; description: string; is_active: boolean }>) => Promise<any>;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(step);
  useEffect(() => { setDraft(step); }, [step]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(step);
  const isDragging = draggingId === step.id;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`border border-border rounded-lg p-2 flex items-center gap-2 ${isDragging ? "opacity-50" : ""}`}
    >
      <GripVertical className="w-4 h-4 text-text-light cursor-grab flex-shrink-0" />
      <input value={draft.icon} onChange={e => setDraft({ ...draft, icon: e.target.value })} className="w-12 border border-input rounded px-2 py-1 text-center text-sm bg-background" />
      <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Title" className="flex-1 border border-input rounded px-2 py-1 text-xs bg-background" />
      <input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Description" className="flex-[2] border border-input rounded px-2 py-1 text-xs bg-background" />
      <label className="flex items-center gap-1 text-[10px]">
        <input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />
        Active
      </label>
      <button onClick={() => onSave({ icon: draft.icon, title: draft.title, description: draft.description, is_active: draft.is_active })} disabled={!dirty} className="text-forest hover:underline text-xs font-semibold disabled:text-text-light disabled:no-underline">Save</button>
      <button onClick={onDelete} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  );
}
