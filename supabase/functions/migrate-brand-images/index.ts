import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function extFromContentType(ct: string | null): string {
  if (!ct) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "jpg";
}

// Migrates brand images from external URLs into product-images/catalog/{brand_id}.{ext}
// and writes the public URL into brands.stored_image_url. Self-hosting for email + reliability.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if ((req.headers.get("x-internal-secret") || "") !== (Deno.env.get("PUSH_INTERNAL_SECRET") || "")) return json({ error: "unauthorized" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 25, 50);

    // brands with an external image but no self-hosted stored copy
    const { data: brands, error } = await admin.from("brands")
      .select("id, brand_name, image_url, stored_image_url")
      .or("stored_image_url.is.null,stored_image_url.eq.")
      .ilike("image_url", "http%")
      .limit(limit);
    if (error) return json({ error: error.message }, 500);
    if (!brands || brands.length === 0) return json({ success: true, migrated: 0, note: "none left" }, 200);

    const results: any[] = [];
    let migrated = 0, failed = 0;

    for (const b of brands) {
      try {
        const resp = await fetch(b.image_url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; BundledMumBot/1.0)", "Accept": "image/*" },
          redirect: "follow",
        });
        if (!resp.ok) { failed++; results.push({ id: b.id, name: b.brand_name, status: "fetch_failed_" + resp.status }); continue; }
        const ct = resp.headers.get("content-type");
        if (ct && !ct.startsWith("image/")) { failed++; results.push({ id: b.id, name: b.brand_name, status: "not_image_" + ct }); continue; }
        const buf = new Uint8Array(await resp.arrayBuffer());
        if (buf.length < 200) { failed++; results.push({ id: b.id, name: b.brand_name, status: "too_small" }); continue; }
        const ext = extFromContentType(ct);
        const path = `catalog/${b.id}.${ext}`;
        const { error: upErr } = await admin.storage.from("product-images").upload(path, buf, {
          contentType: ct || "image/jpeg", upsert: true, cacheControl: "86400",
        });
        if (upErr) { failed++; results.push({ id: b.id, name: b.brand_name, status: "upload_failed: " + upErr.message }); continue; }
        const { data: pub } = admin.storage.from("product-images").getPublicUrl(path);
        await admin.from("brands").update({ stored_image_url: pub.publicUrl }).eq("id", b.id);
        migrated++;
        results.push({ id: b.id, name: b.brand_name, status: "ok", url: pub.publicUrl });
      } catch (e) {
        failed++;
        results.push({ id: b.id, name: b.brand_name, status: "error: " + (e instanceof Error ? e.message : "unknown") });
      }
    }

    return json({ success: true, processed: brands.length, migrated, failed, results }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
