import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Trash2, Plus, Upload, Image as ImageIcon } from "lucide-react";

/**
 * Homepage content editor. Writes the homepage site_settings the storefront
 * reads: home_hero_slides, home_categories, home_loved_baby_brands,
 * home_loved_baby_heading. Images upload to the public "site-images" bucket.
 *
 * Recommended image sizes are derived from the actual carousel/tile boxes:
 *   - Hero desktop box ~1132x520 (md:h-520 inside max-w-1180) -> 2x = 2264x1040
 *   - Hero mobile box ~343x440 on a phone (~4:5 portrait)     -> 1080x1350
 *   - Category tile desktop box ~274x220 (grid-cols-4)         -> ~880x700
 */

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const HERO_DESKTOP_REC = "Recommended: 2264 x 1040px (wide landscape). JPG, PNG or WebP, under 500KB.";
const HERO_MOBILE_REC = "Recommended: 1080 x 1350px (portrait 4:5). JPG, PNG or WebP, under 500KB.";
const CAT_REC = "Recommended: 880 x 700px (landscape). JPG, PNG or WebP, under 500KB.";

function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

// Upload to the site-images bucket only. Validates type + size, returns the
// public URL.
async function uploadSiteImage(file: File, folder: "hero" | "categories"): Promise<string> {
  const okTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!okTypes.includes(file.type)) throw new Error("Please upload a JPG, PNG or WebP image.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Image is too large. Keep it under 2MB (recommended under 500KB).");
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
  const path = `${folder}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("site-images").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) throw new Error(error.message || "Upload failed");
  const { data } = supabase.storage.from("site-images").getPublicUrl(path);
  return data.publicUrl;
}

function ImageUploadField({ label, recommended, value, folder, onChange }: {
  label: string; recommended: string; value: string; folder: "hero" | "categories"; onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setBusy(true);
      const url = await uploadSiteImage(file, folder);
      onChange(url);
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <label className="text-xs font-semibold text-text-med block mb-1">{label}</label>
      <div className="flex items-start gap-3">
        <div className="w-20 h-14 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center shrink-0">
          {value ? <img src={value} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-text-light" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <label className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted ${busy ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}>
              <Upload className="w-3.5 h-3.5" /> {busy ? "Uploading…" : value ? "Replace" : "Upload"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPick} disabled={busy} />
            </label>
            {value && <button type="button" onClick={() => onChange("")} className="text-xs text-destructive font-semibold">Remove</button>}
          </div>
          <p className="text-[11px] text-text-light mt-1">{recommended}</p>
        </div>
      </div>
    </div>
  );
}

type Slide = { image_url_desktop: string; image_url_mobile: string; title: string; subtitle: string; cta_text: string; cta_href: string };
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
      image_url_desktop: x?.image_url_desktop || x?.image_url || "",
      image_url_mobile: x?.image_url_mobile || "",
      title: x?.title || "", subtitle: x?.subtitle || "", cta_text: x?.cta_text || "", cta_href: x?.cta_href || "",
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
  const patchSlide = (i: number, patch: Partial<Slide>) => setSlides(slides.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const patchCat = (i: number, patch: Partial<Cat>) => setCats(cats.map((x, idx) => idx === i ? { ...x, ...patch } : x));

  return (
    <div className="max-w-[1000px]">
      <h1 className="pf text-2xl font-bold mb-1">Homepage</h1>
      <p className="text-text-med text-sm mb-6">
        Curate the homepage hero carousel, category tiles, and most-loved brands. Images upload to the
        <code> site-images </code> bucket. Leave a hero-slide image empty to fall back to auto-generated imagery.
      </p>

      {/* Hero slides */}
      <section className="bg-card border border-border rounded-xl p-4 md:p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">Hero slides</h2>
          <button onClick={() => setSlides([...slides, { image_url_desktop: "", image_url_mobile: "", title: "", subtitle: "", cta_text: "", cta_href: "" }])}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Plus className="w-3.5 h-3.5" /> Add slide</button>
        </div>
        {slides.length === 0 && <p className="text-sm text-text-med mb-3">No slides. The hero falls back to auto-generated imagery.</p>}
        <div className="space-y-4">
          {slides.map((sl, i) => (
            <div key={i} className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-text-med">Slide {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setSlides(moveItem(slides, i, -1))} disabled={i === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setSlides(moveItem(slides, i, 1))} disabled={i === slides.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setSlides(slides.filter((_, idx) => idx !== i))} className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <ImageUploadField label="Desktop image" recommended={HERO_DESKTOP_REC} value={sl.image_url_desktop} folder="hero" onChange={(url) => patchSlide(i, { image_url_desktop: url })} />
                <ImageUploadField label="Mobile image (optional)" recommended={HERO_MOBILE_REC} value={sl.image_url_mobile} folder="hero" onChange={(url) => patchSlide(i, { image_url_mobile: url })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Title" value={sl.title} onChange={(e) => patchSlide(i, { title: e.target.value })} />
                <input className={inputCls} placeholder="Subtitle" value={sl.subtitle} onChange={(e) => patchSlide(i, { subtitle: e.target.value })} />
                <input className={inputCls} placeholder="CTA text" value={sl.cta_text} onChange={(e) => patchSlide(i, { cta_text: e.target.value })} />
                <input className={inputCls} placeholder="CTA link (e.g. /shop)" value={sl.cta_href} onChange={(e) => patchSlide(i, { cta_href: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => save.mutate({ key: "home_hero_slides", value: slides.filter((sl) => sl.title || sl.image_url_desktop || sl.image_url_mobile) })}
          disabled={save.isPending} className="mt-4 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">Save hero slides</button>
      </section>

      {/* Category tiles */}
      <section className="bg-card border border-border rounded-xl p-4 md:p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">Category tiles</h2>
          <button onClick={() => setCats([...cats, { label: "", href: "", image_url: "" }])}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"><Plus className="w-3.5 h-3.5" /> Add tile</button>
        </div>
        <div className="space-y-3">
          {cats.map((c, i) => (
            <div key={i} className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-med">Tile {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCats(moveItem(cats, i, -1))} disabled={i === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setCats(moveItem(cats, i, 1))} disabled={i === cats.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setCats(cats.filter((_, idx) => idx !== i))} className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                <input className={inputCls} placeholder="Label" value={c.label} onChange={(e) => patchCat(i, { label: e.target.value })} />
                <input className={inputCls} placeholder="Link (e.g. /shop/baby)" value={c.href} onChange={(e) => patchCat(i, { href: e.target.value })} />
              </div>
              <ImageUploadField label="Tile image (optional)" recommended={CAT_REC} value={c.image_url} folder="categories" onChange={(url) => patchCat(i, { image_url: url })} />
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
