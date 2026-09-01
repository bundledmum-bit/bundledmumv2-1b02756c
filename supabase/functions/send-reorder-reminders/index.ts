import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sends DIRECTLY to Resend (api.resend.com). Previously routed through the dead
// Lovable connector gateway with LOVABLE_API_KEY (401 "Credential not found").
// Only the outbound URL + credential changed.
const RESEND_URL  = "https://api.resend.com/emails";
const FROM_EMAIL  = "BundledMum <hello@bundledmum.com>";
const REPLY_TO    = "hello@bundledmum.ng";

function stripQ(v: any): string { return String(v ?? '').replace(/^"|"$/g, ''); }

function productUrl(slug: string | null | undefined): string {
  return slug ? `https://bundledmum.com/products/${slug}` : `https://bundledmum.com/shop`;
}

// Small product-image cell for a reorder/recommendation row. Self-hosted image preferred;
// neutral placeholder box when missing (never a broken-image icon).
function imgCell(imageUrl: string | null | undefined, name: string): string {
  const size = 48;
  const alt = String(name ?? "").replace(/"/g, "&quot;");
  if (imageUrl && String(imageUrl).trim()) {
    return `<img src="${String(imageUrl).replace(/"/g, "&quot;")}" width="${size}" height="${size}" alt="${alt}" style="width:${size}px;height:${size}px;border-radius:8px;object-fit:cover;border:1px solid #E8E0D8;display:block;background:#F3F1EE;" />`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:8px;background:#F3F1EE;border:1px solid #E8E0D8;"></div>`;
}

function buildReorderItemsHtml(items: any[]): string {
  if (!items.length) return "";
  const rows = items.map(item => `
    <tr>
      <td style="padding:12px 8px 12px 16px;border-bottom:1px solid #E8E0D8;width:48px;vertical-align:top;">${imgCell(item.image_url, item.product_name)}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #E8E0D8;vertical-align:top;">
        <strong style="color:#1A1A1A;font-size:14px;">${item.product_name}</strong>
        ${item.brand_name ? `<br/><span style="color:#7A7A7A;font-size:12px;">${item.brand_name}</span>` : ""}
        <br/><span style="color:#F4845F;font-size:11px;font-weight:700;">${item.reorder_label || "Time to restock"}</span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #E8E0D8;text-align:right;vertical-align:top;">
        <a href="${productUrl(item.slug)}" style="background:#2D6A4F;color:#fff;text-decoration:none;padding:8px 16px;border-radius:100px;font-size:12px;font-weight:700;display:inline-block;">Reorder</a>
      </td>
    </tr>`).join("");
  return `<p style="color:#1A1A1A;font-weight:700;font-size:14px;margin:0 0 12px;">&#128260; Time to restock:</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;">${rows}</table>`;
}

function buildSubscriptionCtaHtml(whatsapp: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#2D6A4F 0%,#1E5C44 100%);border-radius:16px;margin-bottom:24px;overflow:hidden;">
    <tr><td style="padding:28px;text-align:center;">
      <div style="font-size:22px;font-weight:900;color:#FFFFFF;margin-bottom:8px;">Subscribe &amp; Save 5%</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-bottom:20px;">Free delivery on every subscription order.</div>
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr>
          <td style="padding:0 6px;"><a href="https://bundledmum.com/subscriptions?frequency=monthly" style="display:inline-block;background:#F4845F;color:#FFFFFF;font-size:13px;font-weight:800;text-decoration:none;padding:12px 28px;border-radius:100px;">Subscribe Monthly</a></td>
        </tr>
      </table>
    </td></tr></table>`;
}

function buildRecommendationsHtml(recs: any[]): string {
  if (!recs.length) return "";
  const rows = recs.map(item => `
    <tr>
      <td style="padding:12px 8px 12px 16px;border-bottom:1px solid #E8E0D8;width:48px;vertical-align:top;">${imgCell(item.image_url, item.name)}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #E8E0D8;vertical-align:top;"><strong style="color:#1A1A1A;font-size:14px;">${item.name}</strong><br/><span style="color:#7A7A7A;font-size:12px;">${item.why}</span></td>
      <td style="padding:12px 16px;border-bottom:1px solid #E8E0D8;text-align:right;vertical-align:top;"><a href="${productUrl(item.slug)}" style="background:#FFF8F4;color:#2D6A4F;border:1px solid #2D6A4F;text-decoration:none;padding:8px 16px;border-radius:100px;font-size:12px;font-weight:700;display:inline-block;">View</a></td>
    </tr>`).join("");
  return `<p style="color:#1A1A1A;font-weight:700;font-size:14px;margin:0 0 12px;">&#128161; Other mums also bought:</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;">${rows}</table>`;
}

async function sendReorderEmail(supabase: any, order: any, sendTo: string, isTest: boolean, RK: string): Promise<boolean> {
  // Pull consumable items WITH product slug for per-product reorder links + brand image via brand_id.
  const { data: consumableItems } = await supabase.from("order_items")
    .select("product_name, brand_name, product_id, brand_id, products!inner(name, slug, category, subcategory, is_consumable, reorder_days, reorder_label)")
    .eq("order_id", order.id).eq("products.is_consumable", true);

  // Resolve brand images for the consumable items.
  const itemBrandIds = Array.from(new Set((consumableItems || []).map((i: any) => i.brand_id).filter(Boolean)));
  const itemImageByBrand: Record<string, string> = {};
  if (itemBrandIds.length) {
    const { data: bRows } = await supabase.from("brands").select("id, stored_image_url, image_url").in("id", itemBrandIds);
    for (const b of bRows || []) {
      const img = b.stored_image_url || b.image_url || null;
      if (img) itemImageByBrand[b.id] = img;
    }
  }

  const reorderItems = consumableItems?.length > 0
    ? consumableItems.map((i: any) => ({
        product_name: i.product_name,
        brand_name: i.brand_name,
        slug: i.products?.slug ?? null,
        reorder_label: i.products?.reorder_label || "Time to restock",
        image_url: i.brand_id ? (itemImageByBrand[i.brand_id] || null) : null,
      }))
    : isTest ? [
        { product_name: "Baby Wipes (80pcs)", brand_name: "WaterWipes", slug: "baby-wipes", reorder_label: "Runs out in ~30 days", image_url: null },
        { product_name: "Newborn Nappy Pack (50pcs)", brand_name: "Pampers", slug: "baby-nappies", reorder_label: "Runs out in ~30 days", image_url: null }
      ] : [];

  if (!isTest && reorderItems.length === 0) return false;

  const { data: allItems } = await supabase.from("order_items").select("product_id").eq("order_id", order.id);
  const boughtIds = (allItems || []).map((i: any) => i.product_id).filter(Boolean);
  const subcats = [...new Set((consumableItems || []).map((i: any) => i.products?.subcategory).filter(Boolean))];
  // Pull recommendations WITH slug for per-product view links, and each product's brand image.
  const { data: recs } = await supabase.from("products")
    .select("id, name, slug, why_included, brands!brands_product_id_fkey(stored_image_url, image_url)")
    .in("subcategory", subcats.length ? subcats : ["nappies-wipes"])
    .eq("is_active", true).eq("is_consumable", true)
    .not("id", "in", `(${boughtIds.join(",") || "'00000000-0000-0000-0000-000000000000'"})`).limit(3);

  const recImageOf = (p: any): string | null => {
    const bs = Array.isArray(p?.brands) ? p.brands : [];
    for (const b of bs) { const img = b?.stored_image_url || b?.image_url; if (img) return img; }
    return null;
  };

  const recItems = (isTest && !recs?.length)
    ? [{ name: "Breast Milk Storage Bags", slug: "breast-milk-storage-bags", why: "Commonly used when breastfeeding", image_url: null }]
    : (recs || []).map((p: any) => ({
        name: p.name,
        slug: p.slug ?? null,
        why: p.why_included || "Commonly used at this stage",
        image_url: recImageOf(p),
      }));

  const { data: template } = await supabase.from("email_templates").select("subject, html_body").eq("slug", "reorder_reminder").eq("is_active", true).single();
  if (!template) return false;

  const { data: settings } = await supabase.from("site_settings").select("key, value").in("key", ["whatsapp_number"]);
  const whatsapp = stripQ(settings?.find((s: any) => s.key === "whatsapp_number")?.value || "");
  const firstName = (order.customer_name || "").split(" ")[0] || "there";

  const { data: existingSub } = await supabase.from("subscriptions").select("id").eq("customer_email", order.customer_email).eq("status", "active").maybeSingle();
  const subCta = existingSub ? "" : buildSubscriptionCtaHtml(whatsapp);

  let html = template.html_body
    .replace(/{{first_name}}/g, firstName).replace(/{{customer_email}}/g, sendTo)
    .replace(/{{whatsapp_number}}/g, whatsapp)
    .replace(/{{reorder_items_html}}/g, buildReorderItemsHtml(reorderItems))
    .replace(/{{recommendations_html}}/g, buildRecommendationsHtml(recItems))
    .replace(/{{subscription_cta}}/g, subCta);

  const subject = (isTest ? "[TEST] " : "") + template.subject.replace(/{{first_name}}/g, firstName);

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RK}` },
    body: JSON.stringify({ from: FROM_EMAIL, to: [sendTo], reply_to: [REPLY_TO], subject, html }),
  });
  return response.ok;
}

// Authorise a privileged caller WITHOUT a naive string compare that would break
// the Vault key. Accepts: (1) the runtime service-role env key (exact); (2) any
// GENUINE service_role JWT (e.g. the Vault key), verified by a service-role-only
// operation so a FORGED token fails at Supabase, not at an unverified decode;
// (3) a signed-in ACTIVE admin. False otherwise.
async function isPrivilegedCaller(req: Request, supabaseUrl: string, serviceRoleKey: string): Promise<boolean> {
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return false;
  if (bearer === serviceRoleKey) return true;
  try {
    const asKey = createClient(supabaseUrl, bearer, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await asKey.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (!error) return true;
  } catch (_e) { /* fall through */ }
  try {
    const svc = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userRes } = await svc.auth.getUser(bearer);
    const uid = userRes?.user?.id;
    if (uid) {
      const { data: adminRow } = await svc
        .from("admin_users").select("id").eq("auth_user_id", uid).eq("is_active", true).maybeSingle();
      if (adminRow) return true;
    }
  } catch (_e) { /* fall through */ }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const RK = Deno.env.get("RESEND_API_KEY");
    if (!RK) throw new Error("Missing API keys");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const { test_email } = body;
    const isTest = !!test_email;

    if (isTest) {
      // SECURITY: test_email lets the caller choose the recipient and leaks the
      // latest paying customer's first name + purchased items. Lock it to a
      // privileged caller. The daily cron sweep below sends NO Authorization and
      // takes no caller-chosen recipient (it emails real customers matched by
      // date window, deduped), so it stays open — only the test path is gated.
      if (!(await isPrivilegedCaller(req, supabaseUrl, serviceRoleKey))) {
        return new Response(JSON.stringify({ error: "Admin authorization required for test sends" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: latest } = await supabase.from("orders").select("id, order_number, customer_name, customer_email").eq("payment_status", "paid").order("created_at", { ascending: false }).limit(1).single();
      if (!latest) return new Response(JSON.stringify({ error: "No paid orders found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const ok = await sendReorderEmail(supabase, latest, test_email, true, RK);
      return new Response(JSON.stringify({ sent: ok ? 1 : 0, test: true, sent_to: test_email }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    const { data: orders, error } = await supabase.from("orders")
      .select("id, order_number, customer_name, customer_email, created_at")
      .eq("payment_status", "paid")
      .gte("created_at", new Date(now.getTime() - 33 * 86400000).toISOString())
      .lte("created_at", new Date(now.getTime() - 28 * 86400000).toISOString());
    if (error) throw error;
    if (!orders?.length) return new Response(JSON.stringify({ sent: 0, skipped: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let sent = 0, skipped = 0;
    for (const order of orders) {
      try {
        const { data: already } = await supabase.from("marketing_email_log").select("id").eq("customer_email", order.customer_email).eq("email_type", "reorder_reminder").eq("order_id", order.id).maybeSingle();
        if (already) { skipped++; continue; }
        const ok = await sendReorderEmail(supabase, order, order.customer_email, false, RK);
        if (ok) { await supabase.from("marketing_email_log").insert({ customer_email: order.customer_email, email_type: "reorder_reminder", order_id: order.id }); sent++; }
        else { skipped++; }
      } catch { skipped++; }
    }
    return new Response(JSON.stringify({ sent, skipped, total: orders.length }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
