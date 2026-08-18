import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

function stripEmDashes(s: string): string {
  return (s || "").replace(/—/g, ", ").replace(/\s*,\s*,/g, ",").trim();
}

function buildPrompt(row: any): string {
  const brand = (row.brand_name || "").trim();
  const isGenericish = /generic|brand tbd|tbd|unbranded|assorted|n\/?a/i.test(brand) || brand === "";
  return `You are writing the Brand Details description for one item in BundledMum, a Nigerian maternity and baby store. Write in a warm, knowledgeable Nigerian-mum voice (Lagos context where natural). Exactly 2 short sentences. NO em dashes anywhere, use commas or full stops. Do not repeat the product description verbatim, add the brand or variant angle.

ITEM:
- Brand label: ${brand || "(none)"}
- Product: ${row.product_name}
- Product description (for context, do not copy): ${row.product_desc || "n/a"}
- Variant/size: ${row.size_variant || "n/a"}
- Pack count: ${row.pack_count || "n/a"}
- Type: ${row.diaper_type || row.item_type || "n/a"}

RULES:
- ${isGenericish ? "This is a GENERIC or unbranded item. Do NOT invent any brand reputation or brand-specific claims. Describe THIS specific product and variant well: what it is, who it suits, why a Nigerian mum would want it." : "If '" + brand + "' is a brand you can describe accurately, you may add ONE accurate, well-known characteristic of it. If you are NOT confident what this brand actually makes, do NOT invent brand claims, instead describe the specific product and variant well (brand-neutral). Never state a brand specific that might be wrong."}
- Keep it specific to this item, not generic filler.

Return ONLY the 2-sentence description as plain text, no quotes, no preamble.`;
}

async function generateOne(row: any, apiKey: string): Promise<string | null> {
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: buildPrompt(row) }],
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const text = (data.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ").trim();
  const clean = stripEmDashes(text).replace(/^["']|["']$/g, "").slice(0, 600);
  return clean || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: active super admin only.
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: adminRow } = await admin.from("admin_users").select("role, is_active").eq("auth_user_id", userData.user.id).maybeSingle();
    if (!adminRow || adminRow.role !== "super_admin" || !adminRow.is_active) {
      return new Response(JSON.stringify({ error: "Super admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(Number(body.batch_size) || 15, 1), 25);

    // Step 1: pull the next N active brands missing a description. No embedded join.
    const { data: brandRows, error: selErr } = await admin
      .from("brands")
      .select("id, brand_name, size_variant, pack_count, diaper_type, item_type, product_id")
      .is("description", null)
      .eq("is_active", true)
      .limit(batchSize);
    if (selErr) {
      return new Response(JSON.stringify({ error: "Select failed (brands)", detail: selErr.message, code: (selErr as any).code, hint: (selErr as any).hint }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!brandRows || brandRows.length === 0) {
      const { count } = await admin.from("brands").select("id", { count: "exact", head: true }).is("description", null).eq("is_active", true);
      return new Response(JSON.stringify({ done: true, processed: 0, remaining: count ?? 0, message: "No active brands left without a description." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 2: separately fetch the matching products (no embed/join).
    const productIds = [...new Set(brandRows.map((r) => r.product_id).filter(Boolean))];
    const { data: productRows, error: prodErr } = await admin
      .from("products")
      .select("id, name, description")
      .in("id", productIds);
    if (prodErr) {
      return new Response(JSON.stringify({ error: "Select failed (products)", detail: prodErr.message, code: (prodErr as any).code, hint: (prodErr as any).hint }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const productById = new Map((productRows || []).map((p) => [p.id, p]));

    let processed = 0;
    const failures: string[] = [];
    for (const r of brandRows) {
      const prod = productById.get(r.product_id);
      const ctx = {
        brand_name: r.brand_name,
        product_name: prod?.name,
        product_desc: prod?.description,
        size_variant: r.size_variant,
        pack_count: r.pack_count,
        diaper_type: r.diaper_type,
        item_type: r.item_type,
      };
      const descr = await generateOne(ctx, ANTHROPIC_API_KEY);
      if (descr) {
        const { error: upErr } = await admin.from("brands").update({ description: descr }).eq("id", r.id);
        if (upErr) failures.push(r.id); else processed++;
      } else {
        failures.push(r.id);
      }
    }

    const { count: remaining } = await admin.from("brands").select("id", { count: "exact", head: true }).is("description", null).eq("is_active", true);

    return new Response(JSON.stringify({
      done: (remaining ?? 0) === 0,
      processed,
      failed: failures.length,
      remaining: remaining ?? 0,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error", stack: err instanceof Error ? err.stack : undefined }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
