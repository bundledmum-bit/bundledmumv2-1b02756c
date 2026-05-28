// Shared image helpers for client-side document generation (quote PDF,
// order invoice). Both surfaces need to turn a remote (CORS-safe Supabase
// Storage) image URL into an embeddable base64 PNG data URL:
//   - jsPDF's addImage() requires a data URL, not a network URL.
//   - HTML print invoices inline base64 so images reliably appear in the
//     printed output instead of racing the print dialog.
//
// Only CORS-safe URLs (e.g. brands.stored_image_url) can be fetched here;
// external brands.image_url is CORS-blocked and will fail (→ null).

export interface LoadedImage {
  dataUrl: string;
  w: number;
  h: number;
}

// Re-encode any fetched image to a PNG data URL via canvas. This both
// normalises the format (source could be jpeg/webp/png) and yields the
// intrinsic dimensions in one pass for aspect-ratio fitting. The blob is
// inlined as a data URL before it touches the canvas, so the canvas is
// never CORS-tainted. Returns null on any failure so a single bad image
// can't break the document.
export async function loadImageAsPng(url: string): Promise<LoadedImage | null> {
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    const blob = await res.blob();
    const srcDataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error || new Error("FileReader failed"));
      r.readAsDataURL(blob);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image decode failed"));
      i.src = srcDataUrl;
    });
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0);
    const pngDataUrl = canvas.toDataURL("image/png");
    return { dataUrl: pngDataUrl, w, h };
  } catch (e) {
    console.warn("[pdfImages] product image unavailable, skipping thumbnail", url, e);
    return null;
  }
}

// Pre-load every unique image URL to a PNG data URL in parallel. Each
// fetch is independently isolated — one rejection cannot fail the batch.
export async function preloadProductImages(urls: string[]): Promise<Map<string, LoadedImage>> {
  const unique = Array.from(new Set(urls.filter((u): u is string => !!u && u.trim() !== "")));
  const map = new Map<string, LoadedImage>();
  await Promise.all(
    unique.map(async (u) => {
      const loaded = await loadImageAsPng(u);
      if (loaded) map.set(u, loaded);
    }),
  );
  return map;
}
