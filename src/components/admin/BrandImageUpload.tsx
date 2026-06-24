import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

interface Props {
  label: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  onRemove: () => void;
  bucket?: string;
  folder?: string;
}

export default function BrandImageUpload({ label, currentUrl, onUploaded, onRemove, bucket = "product-images", folder = "brands" }: Props) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Deterministic path (brands/{Brand}/{filename}) so re-uploading the same
      // file overwrites the existing object instead of piling up duplicates.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${folder}/${safeName}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        upsert: true,            // overwrite same path instead of 409 "resource already exists"
        cacheControl: "3600",
        contentType: file.type || undefined,
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
      // An overwritten object keeps the SAME public URL, so the CDN/browser would
      // serve the stale image — append a cache-bust param so the new one shows.
      onUploaded(`${publicUrl}?v=${Date.now()}`);
      toast.success(`${label} uploaded`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-text-med block">{label}</label>
      {currentUrl ? (
        <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
          <img src={currentUrl} alt={label} className="w-full h-full object-cover" />
          <button type="button" onClick={onRemove} className="absolute top-0 right-0 bg-destructive text-primary-foreground rounded-bl p-0.5">
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <label className={`flex items-center justify-center w-16 h-16 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-forest transition-colors ${uploading ? "opacity-50" : ""}`}>
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
          <Upload className="w-4 h-4 text-text-light" />
        </label>
      )}
    </div>
  );
}
