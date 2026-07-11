import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Star, Trash2, ArrowLeft, ArrowRight, Upload, ImageOff } from "lucide-react";

/**
 * Multi-image gallery manager for a single brand. Every action persists
 * immediately through the admin-brand-image-upload edge function (verify_jwt,
 * admin-gated; the SDK attaches the session JWT). The storefront display order
 * is [stored_image_url, ...stored_images]; images are self-hosted only (a DB
 * trigger rejects external URLs), so this offers uploads only, no URL input.
 */
export default function BrandGalleryManager({
  brandId,
  initialPrimary,
  initialGallery,
}: {
  brandId: string;
  initialPrimary: string | null;
  initialGallery: string[];
}) {
  const [primary, setPrimary] = useState<string | null>(initialPrimary || null);
  const [gallery, setGallery] = useState<string[]>(Array.isArray(initialGallery) ? initialGallery : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Invoke the edge function and refresh local state from its response.
  async function call(body: Record<string, any>) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-brand-image-upload", { body });
      if (error) {
        let msg = error.message || "Request failed";
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep msg */ }
        setError(msg);
        return false;
      }
      const d = (data || {}) as any;
      if (d.error) { setError(d.error); return false; }
      setPrimary(d.stored_image_url ?? null);
      setGallery(Array.isArray(d.stored_images) ? d.stored_images : []);
      return true;
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // allow re-picking the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setError("Could not read the file");
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result; // strip data: prefix
      if (!base64) { setError("Could not read the file"); return; }
      void call({ action: "add", brand_id: brandId, content_base64: base64, content_type: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
  }

  const setAsPrimary = (url: string) => call({ action: "set_primary", brand_id: brandId, image_url: url });
  const remove = (url: string) => call({ action: "remove", brand_id: brandId, image_url: url });
  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= gallery.length) return;
    const next = [...gallery];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return call({ action: "reorder", brand_id: brandId, order: next });
  };

  const Thumb = ({ url, className = "" }: { url: string | null; className?: string }) =>
    url ? (
      <img src={url} alt="" className={`w-full h-full object-cover ${className}`} />
    ) : (
      <div className="w-full h-full bg-muted flex items-center justify-center"><ImageOff className="w-4 h-4 text-muted-foreground" /></div>
    );

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#2D6A4F]">Product Images</h3>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-[#2D6A4F] text-[#2D6A4F] px-3 py-1.5 text-xs font-semibold hover:bg-[#2D6A4F]/5 disabled:opacity-50 max-md:min-h-[44px]">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Add image
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {/* Primary */}
        <div className="w-24">
          <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-[#2D6A4F]">
            <Thumb url={primary} />
            <span className="absolute top-0 left-0 bg-[#2D6A4F] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-br inline-flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-white" /> Primary
            </span>
          </div>
        </div>

        {/* Gallery images (additional, in order) */}
        {gallery.map((url, i) => (
          <div key={url} className="w-24">
            <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border">
              <Thumb url={url} />
              <button type="button" onClick={() => remove(url)} disabled={busy}
                title="Remove" className="absolute top-0 right-0 bg-destructive text-white p-0.5 rounded-bl disabled:opacity-50">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between gap-1">
              <div className="flex gap-0.5">
                <button type="button" onClick={() => reorder(i, i - 1)} disabled={busy || i === 0}
                  title="Move left" className="p-1 rounded border border-border disabled:opacity-30"><ArrowLeft className="w-3 h-3" /></button>
                <button type="button" onClick={() => reorder(i, i + 1)} disabled={busy || i === gallery.length - 1}
                  title="Move right" className="p-1 rounded border border-border disabled:opacity-30"><ArrowRight className="w-3 h-3" /></button>
              </div>
              <button type="button" onClick={() => setAsPrimary(url)} disabled={busy}
                title="Set as primary" className="p-1 rounded border border-border text-[#2D6A4F] disabled:opacity-50"><Star className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>

      {!primary && gallery.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No images yet. Use Add image to upload the first one.</p>
      )}
      <p className="text-[10px] text-muted-foreground">Uploads are self-hosted. Display order is primary first, then the gallery left to right.</p>
    </section>
  );
}
