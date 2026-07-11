import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";

/**
 * Homepage content editor. Writes the homepage site_settings the storefront
 * reads: home_hero_slides, home_categories, home_loved_baby_brands,
 * home_loved_baby_heading. Values are stored as raw JSON (arrays), matching the
 * existing site_settings upsert pattern.
 */

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";

function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

type Slide = { image_url: string; title: string; subtitle: string; cta_text: string; cta_href: string };
type Cat = { label: string; href: string; image_url: string };

export default function AdminHomeContent() {
  const queryClient = useQueryClient();

  const { data: settingsRows } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("*");
      if (error) throw error;
      return data as any[];
    },
  });
  const settingsMap = useMemo(() => new Map((settingsRows || []).map((s) => [s.key, s.value])), [settingsRows]);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [lovedHeading, setLovedHeading] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !settingsRows) return;
    setSlides(asArray(settingsMap.get("home_hero_slides")).map((x: any) => ({
      image_url: x?.image_url || "", title: x?.title || "", subtitle: x?.subtitle || "", cta_text: x?.cta_text || "", cta_href: x?.cta_href || "",
    })));
    setCats(asArray(settingsMap.get("home_categories")).map((x: any) => ({
      label: x?.label || "", href: x?.href || "", image_url: x?.image_url || "",
    })));
    setBrands(asArray(settingsMap.get("home_loved_baby_brands")).map((x: any) => (typeof x === "string" ? x : x?.name || x?.label || "")).filter(Boolean));
    setLovedHeading((settingsMap.get("home_loved_baby_heading") as string) || "");
    setSeeded(true);
  }, [settingsRows, settingsMap, seeded]);

  const save = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const { error } = await supabase.from("site_settings").upsert({ key, value }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["site_settings"] });
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moveItem = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  return (
    <div className="max-w-[1000px]">
      <h1 className="pf text-2xl font-bold mb-1">Homepage</h1>
      <p className="text-text-med text-sm mb-6">
        Curate the homepage hero carousel, category tiles, and most-loved brands. Leave a hero-slide list empty to
        fall back to auto-generated images.
      </p>

      {/* Hero slides */}
      <section className="bg-card border border-border rounded-xl p-4 md:p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">Hero slides</h2>
          <button onClick={() => setSlides([...slides, { image_url: "", title: "", subtitle: "", cta_text: "", cta_href: "" }])}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Plus className="w-3.5 h-3.5" /> Add slide</button>
        </div>
        {slides.length === 0 && <p className="text-sm text-text-med mb-3">No slides. The hero falls back to auto-generated imagery.</p>}
        <div className="space-y-3">
          {slides.map((sl, i) => (
            <div key={i} className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-med">Slide {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setSlides(moveItem(slides, i, -1))} disabled={i === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setSlides(moveItem(slides, i, 1))} disabled={i === slides.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setSlides(slides.filter((_, idx) => idx !== i))} className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Image URL" value={sl.image_url} onChange={(e) => setSlides(slides.map((x, idx) => idx === i ? { ...x, image_url: e.target.value } : x))} />
                <input className={inputCls} placeholder="Title" value={sl.title} onChange={(e) => setSlides(slides.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))} />
                <input className={inputCls} placeholder="Subtitle" value={sl.subtitle} onChange={(e) => setSlides(slides.map((x, idx) => idx === i ? { ...x, subtitle: e.target.value } : x))} />
                <input className={inputCls} placeholder="CTA text" value={sl.cta_text} onChange={(e) => setSlides(slides.map((x, idx) => idx === i ? { ...x, cta_text: e.target.value } : x))} />
                <input className={inputCls} placeholder="CTA link (e.g. /shop)" value={sl.cta_href} onChange={(e) => setSlides(slides.map((x, idx) => idx === i ? { ...x, cta_href: e.target.value } : x))} />
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => save.mutate({ key: "home_hero_slides", value: slides.filter((sl) => sl.title || sl.image_url) })}
          disabled={save.isPending} className="mt-4 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">Save hero slides</button>
      </section>

      {/* Category tiles */}
      <section className="bg-card border border-border rounded-xl p-4 md:p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">Category tiles</h2>
          <button onClick={() => setCats([...cats, { label: "", href: "", image_url: "" }])}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Plus className="w-3.5 h-3.5" /> Add tile</button>
        </div>
        <div className="space-y-2">
          {cats.map((c, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <input className={inputCls} placeholder="Label" value={c.label} onChange={(e) => setCats(cats.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} />
              <input className={inputCls} placeholder="Link (e.g. /shop/baby)" value={c.href} onChange={(e) => setCats(cats.map((x, idx) => idx === i ? { ...x, href: e.target.value } : x))} />
              <input className={inputCls} placeholder="Image URL (optional)" value={c.image_url} onChange={(e) => setCats(cats.map((x, idx) => idx === i ? { ...x, image_url: e.target.value } : x))} />
              <div className="flex items-center gap-1">
                <button onClick={() => setCats(moveItem(cats, i, -1))} disabled={i === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => setCats(moveItem(cats, i, 1))} disabled={i === cats.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => setCats(cats.filter((_, idx) => idx !== i))} className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => save.mutate({ key: "home_categories", value: cats.filter((c) => c.label && c.href) })}
          disabled={save.isPending} className="mt-4 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">Save category tiles</button>
      </section>

      {/* Most loved brands */}
      <section className="bg-card border border-border rounded-xl p-4 md:p-5">
        <h2 className="font-bold text-lg mb-3">Most loved baby brands</h2>
        <label className="text-xs font-semibold text-text-med block mb-1">Section heading</label>
        <input className={`${inputCls} mb-3`} placeholder="Our Most Loved Baby Items" value={lovedHeading} onChange={(e) => setLovedHeading(e.target.value)} />
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-text-med">Brand names (matched against real baby products)</label>
          <button onClick={() => setBrands([...brands, ""])} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Plus className="w-3.5 h-3.5" /> Add brand</button>
        </div>
        <div className="space-y-2">
          {brands.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inputCls} placeholder="Brand name (e.g. WaterWipes)" value={b} onChange={(e) => setBrands(brands.map((x, idx) => idx === i ? e.target.value : x))} />
              <button onClick={() => setBrands(brands.filter((_, idx) => idx !== i))} className="p-2 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => save.mutate({ key: "home_loved_baby_heading", value: lovedHeading })}
            disabled={save.isPending} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">Save heading</button>
          <button onClick={() => save.mutate({ key: "home_loved_baby_brands", value: brands.map((b) => b.trim()).filter(Boolean) })}
            disabled={save.isPending} className="rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">Save brands</button>
        </div>
      </section>
    </div>
  );
}
