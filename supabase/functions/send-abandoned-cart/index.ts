import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "BundledMum <hello@bundledmum.com>";
const REPLY_TO   = "hello@bundledmum.ng";

const STAGES = [
  { stage: 1, minAgeHours: 1,  slug: "abandoned_cart"   },
  { stage: 2, minAgeHours: 24, slug: "abandoned_cart_2" },
  { stage: 3, minAgeHours: 48, slug: "abandoned_cart_3" },
];

function fmtNaira(n: number): string {
  return "₦" + Math.round(n).toLocaleString("en-NG");
}
function normEmail(e: string | null | undefined): string {
  return (e || "").trim().toLowerCase();
}
function firstNameOrMama(fullName: string | null | undefined): string {
  const fn = (fullName || "").trim().split(/\s+/)[0];
  if (!fn) return "Mama";
  return fn.charAt(0).toUpperCase() + fn.slice(1);
}
function isHttpUrl(s: any): boolean {
  return typeof s === "string" && s.trim().startsWith("http");
}
function isSelfHosted(s: any): boolean {
  return isHttpUrl(s) && String(s).includes("supabase.co");
}
// Prefer the SELF-HOSTED (supabase storage) image over the external (jumia/konga) one.
// Order: stored_image_url -> a supabase-hosted images[] entry -> external image_url (last resort).
function pickImageFromRow(src: any): string | null {
  if (!src) return null;
  // 1. stored_image_url if it's a real self-hosted URL
  if (isSelfHosted(src.stored_image_url)) return String(src.stored_image_url).trim();
  // 2. any self-hosted entry in images[]
  if (Array.isArray(src.images)) {
    const hosted = src.images.find((u: any) => isSelfHosted(u));
    if (hosted) return String(hosted).trim();
  }
  // 3. stored_image_url even if non-supabase (still better than external catalog)
  if (isHttpUrl(src.stored_image_url)) return String(src.stored_image_url).trim();
  // 4. external image_url as the absolute last resort
  if (isHttpUrl(src.image_url)) return String(src.image_url).trim();
  // 5. first images[] entry
  if (Array.isArray(src.images) && isHttpUrl(src.images[0])) return String(src.images[0]).trim();
  return null;
}
// Item carried its own image at cart time. Prefer it ONLY if self-hosted; an external
// captured url should still be overridden by a self-hosted brand image when we can find one.
function itemOwnImage(it: any): { url: string | null; selfHosted: boolean } {
  const candidates = [it.image, it.image_url, it.imageUrl, it.stored_image_url, it.storedImageUrl,
    Array.isArray(it.images) ? it.images[0] : null];
  let external: string | null = null;
  for (const c of candidates) {
    if (!isHttpUrl(c) || String(c).includes("/placeholder")) continue;
    if (isSelfHosted(c)) return { url: String(c).trim(), selfHosted: true };
    if (!external) external = String(c).trim();
  }
  return { url: external, selfHosted: false };
}

function buildCartItemsHtml(items: any[], cartTotal: number): string {
  if (!items || items.length === 0) return "";
  const rows = items.map((item: any) => {
    const qty = Number(item.qty) || 1;
    const price = Number(item.price) || 0;
    const lineTotal = price * qty;
    const img = item._resolvedImage as string | null;
    const imgCell = img
      ? `<img src="${img}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid #E8E0D8;background:#FFF8F4;"/>`
      : `<div style="width:48px;height:48px;border-radius:8px;border:1px solid #E8E0D8;background:#FFF8F4;display:flex;align-items:center;justify-content:center;"><span style="font-size:20px;">📦</span></div>`;
    return `
    <tr>
      <td style="padding:12px 12px 12px 16px;border-bottom:1px solid #E8E0D8;width:48px;">${imgCell}</td>
      <td style="padding:12px 8px;border-bottom:1px solid #E8E0D8;font-size:14px;color:#1A1A1A;">
        <strong>${item.name || "Item"}</strong>
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #E8E0D8;text-align:center;font-size:14px;color:#1A1A1A;">
        ×${qty}
      </td>
      <td style="padding:12px 16px 12px 8px;border-bottom:1px solid #E8E0D8;text-align:right;font-size:14px;font-weight:700;color:#1A1A1A;">
        ${fmtNaira(lineTotal)}
      </td>
    </tr>`;
  }).join("");
  return `
    <p style="color:#1A1A1A;font-weight:700;font-size:14px;margin:0 0 12px;">🛒 Items in your cart:</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:16px;">
      <tr style="background:#D8EFE5;">
        <td style="padding:10px 16px;font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;" colspan="2">Item</td>
        <td style="padding:10px 8px;font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;text-align:center;">Qty</td>
        <td style="padding:10px 16px;font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;text-align:right;">Total</td>
      </tr>
      ${rows}
    </table>
    <p style="text-align:right;font-size:15px;font-weight:800;color:#1A1A1A;margin:0 0 24px;">Cart total: ${fmtNaira(cartTotal)}</p>`;
}

// Image resolution preferring SELF-HOSTED images (so emails never embed jumia/konga URLs).
// Order:
//   1. item's own SELF-HOSTED image (captured at cart time)
//   2. brand_id  -> brand.stored_image_url (self-hosted)
//   3. product_id -> that product's brand stored_image_url (self-hosted)
//   4. item's own EXTERNAL image (only if nothing self-hosted found)
//   5. external brand/product image (last resort)
// No fuzzy name matching.
async function resolveItemImages(supabase: any, items: any[]): Promise<void> {
  // pass 1: self-hosted captured image wins immediately; remember any external captured as fallback
  for (const it of items) {
    const own = itemOwnImage(it);
    it._resolvedImage = own.selfHosted ? own.url : null;
    it._externalFallback = own.selfHosted ? null : own.url;
  }

  const needBrand   = items.filter(i => !i._resolvedImage && (i.brand_id || i.brandId));
  const needProduct = items.filter(i => !i._resolvedImage && (i.product_id || i.productId));

  // 2. brand_id -> brands.stored_image_url
  const brandIds = [...new Set(needBrand.map(i => i.brand_id || i.brandId).filter(Boolean))];
  if (brandIds.length) {
    try {
      const { data: brandsById } = await supabase.from("brands")
        .select("id, image_url, stored_image_url, images").in("id", brandIds);
      const byId: Record<string, any> = {};
      for (const b of brandsById || []) byId[b.id] = b;
      for (const it of needBrand) {
        const bid = it.brand_id || it.brandId;
        if (bid && byId[bid]) it._resolvedImage = pickImageFromRow(byId[bid]);
      }
    } catch (_e) { /* best-effort */ }
  }

  // 3. product_id -> that product's brand stored image (products.image_url is external-only, so go via brands)
  const productIds = [...new Set(needProduct.filter(i => !i._resolvedImage).map(i => i.product_id || i.productId).filter(Boolean))];
  if (productIds.length) {
    try {
      const { data: prodBrands } = await supabase.from("brands")
        .select("product_id, image_url, stored_image_url, images").in("product_id", productIds);
      // choose the best (self-hosted) brand image per product
      const bestByProduct: Record<string, string> = {};
      for (const b of prodBrands || []) {
        if (bestByProduct[b.product_id]) continue;
        const img = pickImageFromRow(b);
        if (img) bestByProduct[b.product_id] = img;
      }
      for (const it of needProduct) {
        if (it._resolvedImage) continue;
        const pid = it.product_id || it.productId;
        if (bestByProduct[pid]) it._resolvedImage = bestByProduct[pid];
      }
    } catch (_e) { /* best-effort */ }
  }

  // 4. fall back to a captured external image if nothing self-hosted was found
  for (const it of items) {
    if (!it._resolvedImage && it._externalFallback) it._resolvedImage = it._externalFallback;
    delete it._externalFallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

    async function logSend(slug: string, email: string, subject: string, status: string, resendId: string | null, errorMsg: string | null) {
      try {
        await supabase.from("email_send_log").insert({
          template_slug: slug, recipient_email: email, subject,
          resend_email_id: resendId, send_to_type: "customer",
          status, error_message: errorMsg,
        });
      } catch (_e) { /* logging must never break the send loop */ }
    }

    const { data: carts, error } = await supabase
      .from("abandoned_carts").select("*").eq("recovered", false).lt("stage_sent", 3)
      .order("created_at", { ascending: true }).limit(100);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!carts?.length) return new Response(JSON.stringify({ success: true, processed: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: templates } = await supabase.from("email_templates").select("slug, subject, html_body, is_active").in("slug", STAGES.map(s => s.slug));
    const tmplBySlug: Record<string, any> = {};
    for (const t of templates || []) tmplBySlug[t.slug] = t;

    const { data: settings } = await supabase.from("site_settings").select("key, value").in("key", ["whatsapp_number"]);
    const sm: Record<string, string> = {};
    for (const s of settings || []) sm[s.key] = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
    const whatsapp = sm.whatsapp_number?.replace(/^"|"$/g, "") || "";

    // Sends DIRECTLY to Resend (api.resend.com), matching send-transactional-email.
    // Previously routed through the dead Lovable connector gateway with LOVABLE_API_KEY,
    // which returned 401 "Credential not found" — because this function only stamps its
    // stage_sent / stageN_sent_at columns AFTER a successful send, the hourly cron retried
    // forever. Only the outbound URL + credential changed; templates, recipients, staging
    // windows and dedup are untouched.
    const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY")!;

    let processed = 0, failed = 0, skippedRecentPurchase = 0, notDue = 0;

    for (const cart of carts) {
      const cartEmail = normEmail(cart.email);
      let subject = "";
      let slug = "";
      try {
        const ageHours = (now - new Date(cart.created_at).getTime()) / (60 * 60 * 1000);
        const nextStageNum = (cart.stage_sent ?? 0) + 1;
        const stageDef = STAGES.find(s => s.stage === nextStageNum);
        if (!stageDef) { notDue++; continue; }
        if (ageHours < stageDef.minAgeHours) { notDue++; continue; }
        if (!cartEmail) { notDue++; continue; }
        slug = stageDef.slug;

        const { data: recentPaid } = await supabase.from("orders").select("id")
          .eq("payment_status", "paid").ilike("customer_email", cartEmail).gte("created_at", twoHoursAgo).limit(1).maybeSingle();
        if (recentPaid) {
          await supabase.from("abandoned_carts").update({ recovered: true, recovered_at: new Date().toISOString() }).eq("id", cart.id);
          skippedRecentPurchase++; continue;
        }

        const template = tmplBySlug[stageDef.slug];
        if (!template || !template.is_active) { notDue++; continue; }

        const { data: customer } = await supabase.from("customers").select("full_name").ilike("email", cartEmail).limit(1).maybeSingle();
        const firstName = firstNameOrMama(customer?.full_name);

        const items = Array.isArray(cart.cart_items) ? cart.cart_items : [];
        await resolveItemImages(supabase, items);
        const cartTotal = Number(cart.cart_total) || 0;

        const vars: Record<string, string> = {
          first_name: firstName, customer_email: cart.email, whatsapp_number: whatsapp,
          cart_total: fmtNaira(cartTotal), cart_items_html: buildCartItemsHtml(items, cartTotal),
        };

        let htmlBody = template.html_body;
        subject = template.subject;
        for (const [k, v] of Object.entries(vars)) {
          htmlBody = htmlBody.replaceAll(`{{${k}}}`, v ?? "");
          subject  = subject.replaceAll(`{{${k}}}`, v ?? "");
        }

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({ from: FROM_EMAIL, to: [cart.email], reply_to: [REPLY_TO], subject, html: htmlBody }),
        });

        if (response.ok) {
          let resendId: string | null = null;
          try { const j = await response.json(); resendId = j?.id || j?.data?.id || null; } catch (_e) { /* ignore */ }
          const stampCol = `stage${stageDef.stage}_sent_at`;
          await supabase.from("abandoned_carts").update({
            stage_sent: stageDef.stage, email_sent_at: new Date().toISOString(), [stampCol]: new Date().toISOString(),
          }).eq("id", cart.id);
          await logSend(slug, cartEmail, subject, "sent", resendId, null);
          processed++;

          if (stageDef.stage === 1) {
            try { await supabase.rpc("fire_push_trigger", { p_trigger_key: "abandoned_cart", p_customer_email: cartEmail, p_order_number: null }); } catch (_e) { /* best-effort */ }
          }
        } else {
          const errText = await response.text().catch(() => `HTTP ${response.status}`);
          await logSend(slug, cartEmail, subject, "failed", null, errText.slice(0, 500));
          failed++;
        }
      } catch (e) {
        console.error("[send-abandoned-cart] item error:", e);
        if (slug && cartEmail) await logSend(slug, cartEmail, subject, "failed", null, e instanceof Error ? e.message.slice(0, 500) : "unknown error");
        failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, processed, failed, skipped_recent_purchase: skippedRecentPurchase, not_due: notDue }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
