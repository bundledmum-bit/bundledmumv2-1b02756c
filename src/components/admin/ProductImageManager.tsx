import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Trash2, Star, GripVertical } from "lucide-react";

interface Props {
  productId: string;
}

export default function ProductImageManager({ productId }: Props) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: images, isLoading } = useQuery({
    queryKey: ["product-images", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", productId)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const hasPrimary = images?.some((img: any) => img.is_primary);
    let order = images?.length || 0;

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const name = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("product-images").upload(name, file);
      if (uploadError) { toast.error(`Failed: ${file.name}`); continue; }
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(name);
      
      await supabase.from("product_images").insert({
        product_id: productId,
        image_url: urlData.publicUrl,
        alt_text: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
        is_primary: !hasPrimary && order === 0,
        display_order: order++,
      });
    }
    toast.success("Images uploaded");
    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
    e.target.value = "";
  };

  const setPrimary = async (id: string) => {
    // Unset all, then set the selected
    for (const img of (images || [])) {
      if (img.is_primary) {
        await supabase.from("product_images").update({ is_primary: false }).eq("id", img.id);
      }
    }
    await supabase.from("product_images").update({ is_primary: true }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
    toast.success("Primary image set");
  };

  const deleteImage = async (img: any) => {
    const path = img.image_url.split("/product-images/")[1];
    if (path) await supabase.storage.from("product-images").remove([path]);
    await supabase.from("product_images").delete().eq("id", img.id);
    queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
    toast.success("Image deleted");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-text-med">Product Images</label>
        <label className={`flex items-center gap-1 text-xs text-forest font-semibold cursor-pointer ${uploading ? "opacity-50" : ""}`}>
          <Upload className="w-3 h-3" /> {uploading ? "Uploading..." : "Upload"}
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {isLoading ? (
        <div className="text-xs text-text-light">Loading images...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {(images || []).map((img: any) => (
            <div key={img.id} className={`relative group rounded-lg overflow-hidden border-2 ${img.is_primary ? "border-coral" : "border-border"}`}>
              <img src={img.image_url} alt={img.alt_text || ""} className="w-full aspect-square object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <button onClick={() => setPrimary(img.id)} title="Set as primary"
                  className="p-1 bg-white/20 rounded hover:bg-white/40"><Star className={`w-3 h-3 ${img.is_primary ? "text-coral fill-coral" : "text-white"}`} /></button>
                <button onClick={() => deleteImage(img)} title="Delete"
                  className="p-1 bg-white/20 rounded hover:bg-red-500/40"><Trash2 className="w-3 h-3 text-white" /></button>
              </div>
              {img.is_primary && (
                <span className="absolute top-1 left-1 bg-coral text-white text-[8px] px-1 rounded font-bold">PRIMARY</span>
              )}
            </div>
          ))}
          {(!images || images.length === 0) && (
            <label className="col-span-4 border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-forest">
              <Upload className="w-6 h-6 mx-auto text-text-light mb-2" />
              <div className="text-xs text-text-light">Drop images here or click to upload</div>
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
