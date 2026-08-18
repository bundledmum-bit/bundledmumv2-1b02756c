import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const BUCKET = "product-images";
const STORAGE_PREFIX = "https://rbtyprmkolqfylcbmgrk.supabase.co/storage/v1/object/public/";
const extFromType: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};

function isSelfHosted(u: string): boolean {
  return typeof u === "string" && u.startsWith(STORAGE_PREFIX);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ---- auth: verified JWT + active admin (super_admin or admin) ----
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: adminRow } = await admin.from("admin_users")
      .select("id, role, is_active").eq("auth_user_id", userData.user.id).maybeSingle();
    if (!adminRow || !adminRow.is_active || !["super_admin", "admin"].includes(adminRow.role)) {
      return json({ error: "Admin only" }, 403);
    }

    const body = await req.json();
    const action = String(body.action || "");
    const brandId = String(body.brand_id || "");
    if (!brandId) return json({ error: "brand_id required" }, 400);

    // current state
    const { data: brand, error: bErr } = await admin.from("brands")
      .select("id, stored_image_url, stored_images").eq("id", brandId).maybeSingle();
    if (bErr) return json({ error: bErr.message }, 500);
    if (!brand) return json({ error: "Brand not found" }, 404);

    const gallery: string[] = Array.isArray(brand.stored_images) ? brand.stored_images.slice() : [];
    let primary: string | null = brand.stored_image_url || null;

    // ---------------- ADD (upload a new self-hosted gallery image) ----------------
    if (action === "add") {
      const contentBase64 = String(body.content_base64 || "");
      const contentType = String(body.content_type || "image/jpeg");
      if (!contentBase64) return json({ error: "content_base64 required for add" }, 400);
      const ext = extFromType[contentType] || "jpg";
      const uuid = crypto.randomUUID();
      const path = `gallery/${brandId}/${uuid}.${ext}`;

      const bin = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bin, { contentType, upsert: true });
      if (upErr) return json({ error: `upload failed: ${upErr.message}` }, 500);
      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;

      // If brand has no primary yet, the first uploaded image becomes primary.
      if (!primary) {
        primary = url;
      } else if (!gallery.includes(url)) {
        gallery.push(url);
      }
      const { error: wErr } = await admin.from("brands")
        .update({ stored_image_url: primary, stored_images: gallery }).eq("id", brandId);
      if (wErr) return json({ error: wErr.message }, 500);
      return json({ success: true, uploaded_url: url, stored_image_url: primary, stored_images: gallery });
    }

    // ---------------- SET PRIMARY (swap a gallery image into the primary slot) ----------------
    if (action === "set_primary") {
      const target = String(body.image_url || "");
      if (!isSelfHosted(target)) return json({ error: "image_url must be a self-hosted gallery image" }, 400);
      if (!gallery.includes(target)) return json({ error: "image_url is not in this brand's gallery" }, 400);
      const newGallery = gallery.filter((u) => u !== target);
      if (primary) newGallery.unshift(primary); // old primary drops into gallery, no image lost
      const { error: wErr } = await admin.from("brands")
        .update({ stored_image_url: target, stored_images: newGallery }).eq("id", brandId);
      if (wErr) return json({ error: wErr.message }, 500);
      return json({ success: true, stored_image_url: target, stored_images: newGallery });
    }

    // ---------------- REMOVE (drop a gallery image; never the primary here) ----------------
    if (action === "remove") {
      const target = String(body.image_url || "");
      if (!gallery.includes(target)) return json({ error: "image_url is not in this brand's gallery" }, 400);
      const newGallery = gallery.filter((u) => u !== target);
      const { error: wErr } = await admin.from("brands")
        .update({ stored_images: newGallery }).eq("id", brandId);
      if (wErr) return json({ error: wErr.message }, 500);
      // note: storage object left in place intentionally (cheap, avoids orphaning if reused).
      return json({ success: true, stored_image_url: primary, stored_images: newGallery });
    }

    // ---------------- REORDER (rewrite gallery order; must be same set) ----------------
    if (action === "reorder") {
      const order: string[] = Array.isArray(body.order) ? body.order.map(String) : [];
      const same = order.length === gallery.length &&
        order.every((u) => gallery.includes(u)) && gallery.every((u) => order.includes(u));
      if (!same) return json({ error: "order must contain exactly the current gallery images" }, 400);
      const { error: wErr } = await admin.from("brands")
        .update({ stored_images: order }).eq("id", brandId);
      if (wErr) return json({ error: wErr.message }, 500);
      return json({ success: true, stored_image_url: primary, stored_images: order });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
