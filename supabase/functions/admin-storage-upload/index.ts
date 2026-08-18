import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const secret = req.headers.get("x-internal-secret") || "";
    if (secret !== (Deno.env.get("PUSH_INTERNAL_SECRET") || "")) return json({ error: "unauthorized" }, 401);

    const { bucket, path, content_base64, content_type } = await req.json();
    if (!bucket || !path || !content_base64) return json({ error: "bucket, path, content_base64 required" }, 400);

    const bin = Uint8Array.from(atob(content_base64), c => c.charCodeAt(0));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await admin.storage.from(bucket).upload(path, bin, {
      contentType: content_type || "image/jpeg", upsert: true,
    });
    if (error) return json({ error: error.message }, 500);
    const { data } = admin.storage.from(bucket).getPublicUrl(path);
    return json({ success: true, public_url: data.publicUrl }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
