import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Trash2, Copy, Grid, List, Search, X } from "lucide-react";

const BUCKETS = ["product-images", "blog-images", "brand-logos", "sharecards"];

export default function AdminMedia() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const { data: files, isLoading } = useQuery({
    queryKey: ["admin-media", bucketFilter],
    queryFn: async () => {
      const allFiles: any[] = [];
      const bucketsToFetch = bucketFilter === "all" ? BUCKETS : [bucketFilter];
      for (const bucket of bucketsToFetch) {
        const { data, error } = await supabase.storage.from(bucket).list("", { limit: 200, sortBy: { column: "created_at", order: "desc" } });
        if (!error && data) {
          data.forEach(f => {
            if (f.name && !f.name.startsWith(".")) {
              const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(f.name);
              allFiles.push({ ...f, bucket, url: urlData.publicUrl });
            }
          });
        }
      }
      return allFiles.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    },
  });

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList?.length) return;
    setUploading(true);
    const bucket = bucketFilter === "all" ? "product-images" : bucketFilter;
    let count = 0;
    for (const file of Array.from(filesList)) {
      const ext = file.name.split(".").pop();
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(name, file);
      if (error) toast.error(`Failed: ${file.name}`);
      else count++;
    }
    toast.success(`${count} file(s) uploaded`);
    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ["admin-media"] });
    e.target.value = "";
  }, [bucketFilter, queryClient]);

  const handleDelete = async (bucket: string, name: string) => {
    if (!confirm("Delete this file?")) return;
    const { error } = await supabase.storage.from(bucket).remove([name]);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); queryClient.invalidateQueries({ queryKey: ["admin-media"] }); setSelectedFile(null); }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied!");
  };

  const filtered = (files || []).filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="pf text-2xl font-bold">Media Library ({filtered.length})</h1>
        <label className={`flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep cursor-pointer ${uploading ? "opacity-50" : ""}`}>
          <Upload className="w-4 h-4" /> {uploading ? "Uploading..." : "Upload"}
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..."
            className="w-full pl-9 pr-3 py-2 border border-input rounded-lg text-sm bg-background" />
        </div>
        {["all", ...BUCKETS].map(b => (
          <button key={b} onClick={() => setBucketFilter(b)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${bucketFilter === b ? "border-forest bg-forest-light text-forest" : "border-border text-text-med"}`}>
            {b === "all" ? "All" : b}
          </button>
        ))}
        <div className="flex border border-border rounded-lg overflow-hidden ml-auto">
          <button onClick={() => setViewMode("grid")} className={`p-1.5 ${viewMode === "grid" ? "bg-muted" : ""}`}><Grid className="w-4 h-4" /></button>
          <button onClick={() => setViewMode("list")} className={`p-1.5 ${viewMode === "list" ? "bg-muted" : ""}`}><List className="w-4 h-4" /></button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading media...</div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {filtered.map(f => (
            <div key={`${f.bucket}-${f.name}`} onClick={() => setSelectedFile(f)}
              className="bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-forest group">
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                <img src={f.url} alt={f.name} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="p-2">
                <div className="text-[10px] font-semibold truncate">{f.name}</div>
                <div className="text-[9px] text-text-light">{f.bucket}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text-med">File</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Bucket</th>
                <th className="px-4 py-3 text-right font-semibold text-text-med">Size</th>
                <th className="px-4 py-3 text-right font-semibold text-text-med">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={`${f.bucket}-${f.name}`} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2 flex items-center gap-2">
                    <img src={f.url} alt="" className="w-8 h-8 rounded object-cover" />
                    <span className="text-xs truncate max-w-[200px]">{f.name}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-text-light">{f.bucket}</td>
                  <td className="px-4 py-2 text-xs text-text-light text-right">{f.metadata?.size ? formatSize(f.metadata.size) : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => copyUrl(f.url)} className="p-1 hover:bg-muted rounded"><Copy className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(f.bucket, f.name)} className="p-1 hover:bg-destructive/10 text-destructive rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedFile && (
        <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center" onClick={() => setSelectedFile(null)}>
          <div className="bg-card border border-border rounded-xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-sm truncate">{selectedFile.name}</h3>
              <button onClick={() => setSelectedFile(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                <img src={selectedFile.url} alt={selectedFile.name} className="max-w-full max-h-full object-contain" />
              </div>
              <div className="flex items-center gap-2">
                <input readOnly value={selectedFile.url} className="flex-1 border border-input rounded-lg px-3 py-1.5 text-xs bg-background" />
                <button onClick={() => copyUrl(selectedFile.url)}
                  className="px-3 py-1.5 bg-forest text-primary-foreground rounded-lg text-xs font-semibold">Copy URL</button>
              </div>
              <div className="text-xs text-text-light space-y-1">
                <div>Bucket: <strong>{selectedFile.bucket}</strong></div>
                {selectedFile.metadata?.size && <div>Size: {formatSize(selectedFile.metadata.size)}</div>}
                {selectedFile.created_at && <div>Uploaded: {new Date(selectedFile.created_at).toLocaleString()}</div>}
              </div>
              <button onClick={() => handleDelete(selectedFile.bucket, selectedFile.name)}
                className="w-full px-4 py-2 border border-destructive text-destructive rounded-lg text-xs font-semibold hover:bg-destructive/10">
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
