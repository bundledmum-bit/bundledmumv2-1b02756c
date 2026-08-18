import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "product-images";
const TIME_BUDGET_MS = 110000; // stop starting new work after ~110s
const CHUNK = 10;             // brands fetched per inner loop
const FETCH_TIMEOUT_MS = 12000;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB cap per image

const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-secret",
};

// Basic SSRF guard: reject non-http(s) and private/internal hosts
function isUnsafeUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".internal") || h.endsWith(".local")) return true;
    if (h === "0.0.0.0" || h === "::1") return true;
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
        /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    return false;
  } catch {
    return true;
  }
}

function extFromContentType(ct: string): string {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("svg")) return "svg";
  if (ct.includes("avif")) return "avif";
  return "jpg";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── Custom auth: validate the trigger secret ──
  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const provided = body?.secret || req.headers.get("x-ingest-secret") || "";

  const { data: secretRow, error: secretErr } = await supabase
    .from("internal_function_secrets")
    .select("secret")
    .eq("key", "ingest_product_images")
    .single();

  if (secretErr || !secretRow || provided !== secretRow.secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  }

  const start = Date.now();
  const results = { processed: 0, failed: 0, skipped_unsafe: 0, failures: [] as any[] };

  while (Date.now() - start < TIME_BUDGET_MS) {
    const { data: brands, error: selErr } = await supabase
      .from("brands")
      .select("id, image_url")
      .is("stored_image_url", null)
      .not("image_url", "is", null)
      .neq("image_url", "")
      .limit(CHUNK);

    if (selErr) {
      return new Response(JSON.stringify({ error: "select failed: " + selErr.message, ...results }), { status: 500, headers: cors });
    }
    if (!brands || brands.length === 0) break;

    for (const brand of brands) {
      if (Date.now() - start >= TIME_BUDGET_MS) break;
      const url = brand.image_url as string;
      try {
        if (isUnsafeUrl(url)) {
          results.skipped_unsafe++;
          results.failures.push({ brand_id: brand.id, url, error: "unsafe/blocked URL" });
          // Mark with empty string sentinel so we don't reprocess forever
          await supabase.from("brands").update({ stored_image_url: "" }).eq("id", brand.id);
          continue;
        }

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const resp = await fetch(url, { signal: controller.signal, redirect: "follow" });
        clearTimeout(t);

        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const ct = resp.headers.get("content-type") || "";
        if (!ct.startsWith("image/")) throw new Error("not an image: " + ct.slice(0, 40));

        const buf = new Uint8Array(await resp.arrayBuffer());
        if (buf.length === 0) throw new Error("empty body");
        if (buf.length > MAX_BYTES) throw new Error("too large: " + buf.length);

        const ext = extFromContentType(ct);
        const path = brand.id + "." + ext;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, buf, { contentType: ct, upsert: true });
        if (upErr) throw new Error("upload: " + upErr.message);

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const { error: updErr } = await supabase
          .from("brands")
          .update({ stored_image_url: pub.publicUrl })
          .eq("id", brand.id);
        if (updErr) throw new Error("db update: " + updErr.message);

        results.processed++;
      } catch (e: any) {
        results.failed++;
        results.failures.push({ brand_id: brand.id, url, error: String(e?.message || e).slice(0, 120) });
        // Sentinel so a permanently-dead URL doesn't block the queue forever
        await supabase.from("brands").update({ stored_image_url: "" }).eq("id", brand.id);
      }
    }
  }

  // Remaining count (NULL stored_image_url with a usable external url)
  const { count: remaining } = await supabase
    .from("brands")
    .select("id", { count: "exact", head: true })
    .is("stored_image_url", null)
    .not("image_url", "is", null)
    .neq("image_url", "");

  // Trim failures list in response to avoid huge payloads
  const trimmedFailures = results.failures.slice(0, 25);

  return new Response(JSON.stringify({
    processed: results.processed,
    failed: results.failed,
    skipped_unsafe: results.skipped_unsafe,
    remaining: remaining ?? null,
    elapsed_ms: Date.now() - start,
    sample_failures: trimmedFailures,
  }), { status: 200, headers: cors });
});
