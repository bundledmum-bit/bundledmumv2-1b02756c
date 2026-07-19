import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_EMAIL  = "BundledMum <hello@bundledmum.com>";
const REPLY_TO    = "hello@bundledmum.ng";
const SITE_URL    = "https://bundledmum.com";

function fmt(amount: number): string {
  return "₦" + amount.toLocaleString("en-NG");
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function waNumber(raw: string): string {
  return (raw || "").replace(/[^0-9]/g, "").replace(/^0+/, "");
}

function paymentConfirmedMessage(paymentMethod: string): string {
  const m = (paymentMethod || "").toLowerCase();
  if (m === "klump") {
    return "Klump has approved your instalment plan and your order is now being processed. You will receive a shipping notification once your bundle is on its way.";
  }
  if (m === "transfer") {
    return "Your bank transfer has been confirmed and your order is now being processed. You will receive a shipping notification once your bundle is on its way.";
  }
  return "Your payment has been confirmed and your order is now being processed. You will receive a shipping notification once your bundle is on its way.";
}

function reasonDisplay(slug: string): string {
  const map: Record<string, string> = {
    wrong_item: "Wrong item received",
    damaged: "Item was damaged",
    changed_mind: "Changed mind",
    not_as_described: "Item not as described",
    quality_issue: "Quality issue",
    not_packed: "Item was not delivered",
    other: "Other",
  };
  return map[slug] || slug;
}

function replacePlaceholders(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}

function itemImageCell(imageUrl: string | null | undefined, name: string): string {
  const size = 48;
  if (imageUrl && String(imageUrl).trim()) {
    return `<img src="${esc(imageUrl)}" width="${size}" height="${size}" alt="${esc(name || "")}" style="width:${size}px;height:${size}px;border-radius:8px;object-fit:cover;border:1px solid #E8E0D8;display:block;background:#F3F1EE;" />`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:8px;background:#F3F1EE;border:1px solid #E8E0D8;"></div>`;
}

function buildGiftWrapRow(order: any, emailType: string): string {
  if (!order?.gift_wrapping) return "";
  const fee = order.gift_wrap_fee || 0;
  if (emailType === "order_confirmation") {
    return `<tr><td colspan="2" style="padding:10px 20px;font-size:14px;color:#7A7A7A;">Gift wrapping</td><td style="padding:10px 20px;font-size:14px;color:#1A1A1A;text-align:right;">${fmt(fee)}</td></tr>`;
  }
  if (emailType === "order_updated") {
    return `<tr><td colspan="2" style="padding:12px 16px;font-size:14px;color:#7A7A7A;border-top:1px solid #E8E0D8;">Gift wrapping</td><td style="padding:12px 16px;font-size:14px;color:#1A1A1A;text-align:right;border-top:1px solid #E8E0D8;">${fmt(fee)}</td></tr>`;
  }
  return "";
}

function buildReorderList(items: any[], slugMap: Record<string, string>): string {
  if (!items || !items.length) return "";
  const rows = items.map((item: any) => {
    const slug = item.product_id ? slugMap[item.product_id] : null;
    const name = esc(item.product_name || "Item");
    const brand = item.brand_name ? `<span style="color:#7A7A7A;font-size:12px;"> &middot; ${esc(item.brand_name)}</span>` : "";
    const qty = item.quantity && item.quantity > 1 ? `<span style="color:#7A7A7A;font-size:12px;"> &times;${item.quantity}</span>` : "";
    const label = `<strong>${name}</strong>${brand}${qty}`;
    const img = itemImageCell(item._image_url, item.product_name || "");
    const labelCell = `
      <td style="padding:10px 12px 10px 16px;border-bottom:1px solid #E8E0D8;width:48px;">${img}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #E8E0D8;font-size:14px;color:#1A1A1A;">${label}</td>`;
    if (slug) {
      const url = `${SITE_URL}/products/${slug}`;
      return `<tr>${labelCell}<td style="padding:10px 16px;border-bottom:1px solid #E8E0D8;text-align:right;"><a href="${url}" style="display:inline-block;background:#2D6A4F;color:#FFFFFF;font-size:12px;font-weight:700;text-decoration:none;padding:6px 16px;border-radius:100px;white-space:nowrap;">Order again</a></td></tr>`;
    }
    return `<tr>${labelCell}<td style="padding:10px 16px;border-bottom:1px solid #E8E0D8;text-align:right;font-size:12px;color:#A0A0A0;">&mdash;</td></tr>`;
  }).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#D8EFE5;"><td colspan="3" style="padding:10px 16px;font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;">Order these items again</td></tr>
      ${rows}
    </table>`;
}

function buildCancellationNote(order: any, items: any[], slugMap: Record<string, string>): string {
  const isPaid = (order?.payment_status || "").toLowerCase() === "paid";
  const total = fmt(order?.total || 0);
  if (isPaid) {
    return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <div style="font-size:14px;font-weight:800;color:#92400E;margin-bottom:6px;">\u{1F4B0} Your Refund Is On The Way</div>
        <div style="font-size:13px;color:#78350F;line-height:1.6;">Because you had already paid, we are refunding your full payment of <strong>${total}</strong>. Refunds are processed via bank transfer and typically arrive within <strong>1 to 3 business days</strong>. If you paid by card, the time to appear on your statement depends on your bank. We will be in touch if we need any details to complete it.</div>
      </td></tr>
    </table>`;
  }
  const reorderList = buildReorderList(items, slugMap);
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#D8EFE5;border:1px solid #A7D7C5;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <div style="font-size:14px;font-weight:800;color:#2D6A4F;margin-bottom:6px;">No Payment Was Taken</div>
        <div style="font-size:13px;color:#1A1A1A;line-height:1.6;">We cancelled this order because we did not receive payment after it was placed, so you have not been charged. If you are still interested, you can order the items again below. They are only reserved once payment is complete.</div>
      </td></tr>
    </table>
    ${reorderList}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr><td align="center">
        <a href="${SITE_URL}/bundles/maternity-bundles" style="display:inline-block;background:#F4845F;color:#FFFFFF;font-size:15px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:100px;">Reorder the full list</a>
      </td></tr>
    </table>`;
}

function buildItemsTable(items: any[]): string {
  if (!items || !items.length) return "<p style=\"color:#7A7A7A;font-size:14px;\">(No items)</p>";
  const rows = items.map((item: any) => `
    <tr>
      <td style="padding:12px 8px 12px 16px;border-bottom:1px solid #E8E0D8;width:48px;vertical-align:top;">
        ${itemImageCell(item._image_url, item.product_name || "")}
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #E8E0D8;font-size:14px;color:#1A1A1A;vertical-align:top;">
        ${item.bundle_name ? `<span style="display:inline-block;background:#FDE8DF;color:#F4845F;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-bottom:4px;">${esc(item.bundle_name)}</span><br/>` : ""}
        <strong>${esc(item.product_name || "")}</strong>
        ${item.brand_name ? `<br/><span style="color:#7A7A7A;font-size:12px;">Brand: ${esc(item.brand_name)}</span>` : ""}
        ${item.size ? `<br/><span style="color:#7A7A7A;font-size:12px;">Size: ${esc(item.size)}</span>` : ""}
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #E8E0D8;text-align:center;font-size:14px;color:#1A1A1A;vertical-align:top;">${item.quantity}</td>
      <td style="padding:12px 16px 12px 8px;border-bottom:1px solid #E8E0D8;text-align:right;font-size:14px;font-weight:700;color:#1A1A1A;vertical-align:top;">${fmt(item.line_total)}</td>
    </tr>
  `).join("");
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <tr style="background:#D8EFE5;">
        <td colspan="2" style="padding:10px 16px;font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;">Item</td>
        <td style="padding:10px 8px;font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;text-align:center;">Qty</td>
        <td style="padding:10px 16px;font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;text-align:right;">Total</td>
      </tr>
      ${rows}
    </table>
  `;
}

function buildOrderSummaryBlock(order: any, items: any[]): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <tr><td style="background:#D8EFE5;padding:12px 20px;font-size:14px;font-weight:800;color:#2D6A4F;">Order Summary</td></tr>
      <tr><td style="padding:0;">
        ${buildItemsTable(items)}
      </td></tr>
      <tr><td style="padding:0 20px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:6px 0;font-size:14px;color:#7A7A7A;">Order Total</td>
              <td style="padding:6px 0;font-size:16px;font-weight:800;color:#1A1A1A;text-align:right;">${fmt(order.total || 0)}</td></tr>
        </table>
      </td></tr>
    </table>`;
}

function buildRefundNote(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:12px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <div style="font-size:14px;font-weight:800;color:#92400E;margin-bottom:6px;">⚠️ Refund Coming</div>
        <div style="font-size:13px;color:#78350F;line-height:1.6;">We have removed one or more items from your order. Your refund will be processed via bank transfer within <strong>30 minutes</strong>. You will receive a separate notification once the refund completes.</div>
      </td></tr>
    </table>`;
}

function buildRefundActionNote(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:12px;margin-bottom:20px;">
      <tr><td style="padding:14px 18px;">
        <div style="font-size:13px;font-weight:800;color:#92400E;margin-bottom:4px;">⚠️ ACTION REQUIRED</div>
        <div style="font-size:13px;color:#78350F;">Customer has been told a refund will arrive within 30 min. Process the bank transfer now.</div>
      </td></tr>
    </table>`;
}

const LAGOS_ALIASES = [
  "lagos", "lagos island", "lagos mainland", "ikeja", "victoria island",
  "lekki", "ajah", "surulere", "yaba", "maryland", "ikorodu",
];

function isLagos(city: string, state: string): boolean {
  const s = (state || "").toLowerCase().trim();
  const c = (city  || "").toLowerCase().trim();
  if (s === "lagos") return true;
  return LAGOS_ALIASES.some(a => s.includes(a) || c.includes(a));
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) added++;
  }
  return d;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-NG", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Africa/Lagos",
  });
}

function computeDeliveryWindow(order: any): {
  label: string; startDate: Date; endDate: Date; display: string;
} {
  const inLagos = isLagos(order.delivery_city || "", order.delivery_state || "");
  const [minDays, maxDays] = inLagos ? [1, 2] : [3, 5];
  const label = inLagos ? "1-2 business days" : "3-5 business days";
  let startDate: Date;
  let endDate: Date;
  if (order.estimated_delivery_start && order.estimated_delivery_end) {
    startDate = new Date(order.estimated_delivery_start);
    endDate   = new Date(order.estimated_delivery_end);
  } else {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
    startDate = addBusinessDays(now, minDays);
    endDate   = addBusinessDays(now, maxDays);
  }
  return { label, startDate, endDate, display: `${fmtDate(startDate)} to ${fmtDate(endDate)}` };
}

function buildTrackingBlock(
  trackingNumber: string,
  logisticsCompany: string | null,
  trackingUrl: string | null,
  websiteUrl: string | null,
): string {
  if (!trackingNumber || trackingNumber.trim() === "") return "";
  const company = logisticsCompany?.trim() || null;
  const safeCompany = company ? esc(company) : null;
  const safeTracking = esc(trackingNumber);
  let trackLinkHtml = "";
  if (company && trackingUrl) {
    const fullUrl = trackingUrl.replace("{tracking_number}", encodeURIComponent(trackingNumber));
    trackLinkHtml = `<div style="margin-top:12px;"><a href="${esc(fullUrl)}" style="display:inline-block;background:#2D6A4F;color:#FFFFFF;font-size:13px;font-weight:700;text-decoration:none;padding:8px 20px;border-radius:100px;">Track on ${safeCompany} website &#8594;</a></div>`;
  } else if (company && websiteUrl) {
    trackLinkHtml = `<div style="margin-top:10px;font-size:13px;color:#7A7A7A;">You can track this shipment on the <a href="${esc(websiteUrl)}" style="color:#2D6A4F;font-weight:700;text-decoration:none;">${safeCompany} website</a>.</div>`;
  } else if (company) {
    trackLinkHtml = `<div style="margin-top:10px;font-size:13px;color:#7A7A7A;">Shipped via <strong>${safeCompany}</strong>. Contact them with your tracking number to check delivery status.</div>`;
  }
  const companyRow = company ? `<div style="font-size:12px;color:#7A7A7A;margin-top:4px;">via <strong>${safeCompany}</strong></div>` : "";
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;"><tr><td style="background:#D8EFE5;padding:12px 20px;font-size:14px;font-weight:800;color:#2D6A4F;">Tracking Information</td></tr><tr><td style="padding:16px 20px;"><div style="font-size:20px;font-weight:900;color:#1A1A1A;letter-spacing:1px;">${safeTracking}</div>${companyRow}<div style="font-size:12px;color:#7A7A7A;margin-top:4px;">Keep this number — you can use it to track your delivery.</div>${trackLinkHtml}</td></tr></table>`;
}

function buildPaymentInstructions(order: any, settingsMap: Record<string, string>): string {
  const method = (order?.payment_method || "").toLowerCase();
  const total = fmt(order?.total || 0);
  if (method === "klump") {
    const url = `${SITE_URL}/order-confirmed?order=${encodeURIComponent(order?.order_number || "")}&token=${encodeURIComponent(order?.share_token || "")}`;
    return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #A7D7C5;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <tr><td style="background:#D8EFE5;padding:12px 20px;font-size:14px;font-weight:800;color:#2D6A4F;">Complete Your Klump Payment</td></tr>
      <tr><td style="padding:16px 20px;">
        <div style="font-size:13px;color:#1A1A1A;line-height:1.6;margin-bottom:14px;">Your order of <strong>${total}</strong> is reserved. Finish your Klump instalment plan to confirm it. It takes about a minute.</div>
        <div style="text-align:center;"><a href="${esc(url)}" style="display:inline-block;background:#2D6A4F;color:#FFFFFF;font-size:15px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:100px;">Complete Klump Payment</a></div>
      </td></tr>
    </table>`;
  }
  if (method === "transfer") {
    const bankName = esc(settingsMap.bank_name || "");
    const acctName = esc(settingsMap.bank_account_name || "");
    const acctNo   = esc(settingsMap.bank_account_number || "");
    return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #A7D7C5;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <tr><td style="background:#D8EFE5;padding:12px 20px;font-size:14px;font-weight:800;color:#2D6A4F;">Complete Your Bank Transfer</td></tr>
      <tr><td style="padding:16px 20px;">
        <div style="font-size:13px;color:#1A1A1A;line-height:1.6;margin-bottom:14px;">Please transfer <strong>${total}</strong> to the account below, then send your receipt on WhatsApp so we can confirm your order.</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF8F4;border-radius:10px;">
          <tr><td style="padding:10px 16px;font-size:13px;color:#7A7A7A;">Bank</td><td style="padding:10px 16px;font-size:14px;font-weight:700;color:#1A1A1A;text-align:right;">${bankName}</td></tr>
          <tr><td style="padding:10px 16px;font-size:13px;color:#7A7A7A;">Account Name</td><td style="padding:10px 16px;font-size:14px;font-weight:700;color:#1A1A1A;text-align:right;">${acctName}</td></tr>
          <tr><td style="padding:10px 16px;font-size:13px;color:#7A7A7A;">Account Number</td><td style="padding:10px 16px;font-size:18px;font-weight:900;color:#2D6A4F;text-align:right;letter-spacing:1px;">${acctNo}</td></tr>
          <tr><td style="padding:10px 16px;font-size:13px;color:#7A7A7A;border-top:1px solid #E8E0D8;">Amount</td><td style="padding:10px 16px;font-size:16px;font-weight:900;color:#1A1A1A;text-align:right;border-top:1px solid #E8E0D8;">${total}</td></tr>
        </table>
      </td></tr>
    </table>`;
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!RESEND_API_KEY)  throw new Error("RESEND_API_KEY is not configured");

    const body = await req.json();
    const { email_type, test_email, refund_pending, edited_by, notification_type, return_id } = body;
    let { order_id } = body;

    if (!email_type) return new Response(JSON.stringify({ error: "Missing email_type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const isTestMode = !!test_email;
    const isInternal = email_type.startsWith("internal_");
    const isPickerNotification = email_type === "picker_ready_to_pick";

    if (!order_id) {
      const { data: latestOrder } = await supabase.from("orders").select("id").eq("payment_status", "paid").order("created_at", { ascending: false }).limit(1).single();
      if (!latestOrder) return new Response(JSON.stringify({ error: "No paid orders found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      order_id = latestOrder.id;
    }

    const [orderRes, itemsRes, settingsRes, templateRes, returnRes] = await Promise.all([
      supabase.from("orders").select("*").eq("id", order_id).single(),
      supabase.from("order_items").select("*").eq("order_id", order_id).order("created_at"),
      supabase.from("site_settings").select("key, value").in("key", ["bank_name","bank_account_name","bank_account_number","whatsapp_number","contact_email","order_manager_email","daily_summary_email","picker_notification_emails"]),
      supabase.from("email_templates").select("subject, html_body").eq("slug", email_type).eq("is_active", true).single(),
      return_id ? supabase.from("order_returns").select("id, refund_amount, return_reason, return_reason_notes, return_type").eq("id", return_id).single() : Promise.resolve({ data: null, error: null }),
    ]);

    if (orderRes.error || !orderRes.data) return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!templateRes.data) return new Response(JSON.stringify({ error: "Template not found or inactive" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const order     = orderRes.data;
    const items     = itemsRes.data || [];
    const returnRow = returnRes.data || null;

    if (items.length) {
      const brandIds = Array.from(new Set(items.map((it: any) => it.brand_id).filter(Boolean)));
      if (brandIds.length) {
        const { data: brandRows } = await supabase.from("brands").select("id, stored_image_url, image_url").in("id", brandIds);
        const imageByBrand: Record<string, string> = {};
        for (const b of brandRows || []) {
          const img = b.stored_image_url || b.image_url || null;
          if (img) imageByBrand[b.id] = img;
        }
        for (const it of items) {
          it._image_url = it.brand_id ? (imageByBrand[it.brand_id] || null) : null;
        }
      }
    }

    const settingsMap: Record<string, string> = {};
    for (const s of settingsRes.data || []) settingsMap[s.key] = typeof s.value === "string" ? s.value : JSON.stringify(s.value);

    const isUnpaidCancel = email_type === "order_cancelled" && (order.payment_status || "").toLowerCase() !== "paid";
    let slugMap: Record<string, string> = {};
    if (isUnpaidCancel && items.length) {
      const productIds = Array.from(new Set(items.map((it: any) => it.product_id).filter(Boolean)));
      if (productIds.length) {
        const { data: prods } = await supabase.from("products").select("id, slug").in("id", productIds);
        for (const p of prods || []) { if (p.slug) slugMap[p.id] = p.slug; }
      }
    }

    const orderEmail = order.customer_email || "";
    const { data: referralByEmail } = await supabase.from("referral_codes").select("code").eq("referrer_email", orderEmail).maybeSingle();

    let logisticsName: string | null = null;
    let logisticsTrackingUrl: string | null = null;
    let logisticsWebsiteUrl: string | null = null;
    if (order.logistics_company) {
      const { data: lc } = await supabase.from("logistics_companies").select("name, short_name, tracking_url, website_url").eq("name", order.logistics_company).eq("is_active", true).maybeSingle();
      if (lc) { logisticsName = lc.short_name || lc.name; logisticsTrackingUrl = lc.tracking_url || null; logisticsWebsiteUrl = lc.website_url || null; }
      else { logisticsName = order.logistics_company; }
    }

    const deliveryWindow = computeDeliveryWindow(order);
    const deliveryEst = (email_type === "order_shipped" || email_type === "tracking_updated")
      ? deliveryWindow.display
      : (() => {
          const from = order.estimated_delivery_start ? new Date(order.estimated_delivery_start) : null;
          const to   = order.estimated_delivery_end   ? new Date(order.estimated_delivery_end)   : null;
          if (!from || !to) return "We’ll notify you";
          const f = (d: Date) => d.toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" });
          return `${f(from)} – ${f(to)}`;
        })();

    if (email_type === "order_shipped" && !order.estimated_delivery_start) {
      await supabase.from("orders").update({
        estimated_delivery_start: deliveryWindow.startDate.toISOString().split("T")[0],
        estimated_delivery_end:   deliveryWindow.endDate.toISOString().split("T")[0],
      }).eq("id", order_id);
    }

    let paymentLink = "";
    if (email_type === "payment_link_klump") {
      const { data: linkRow } = await supabase.rpc("get_order_payment_link", { p_order_id: order_id });
      paymentLink = typeof linkRow === "string" ? linkRow : "";
      if (!paymentLink) {
        return new Response(
          JSON.stringify({ error: "No Klump payment link exists for this order. Create the payment link first." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const orderDate = new Date(order.created_at).toLocaleDateString("en-NG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const firstNameRaw = (order.customer_name || "").split(" ")[0] || "there";
    const whatsapp  = waNumber(settingsMap.whatsapp_number || "");

    const orderSummaryBlock = isUnpaidCancel ? "" : buildOrderSummaryBlock(order, items);

    // SECURITY: customer-controlled free-text fields (name, phone, address, city,
    // state) are escaped before entering email HTML. Without this a customer could
    // inject an <a> phishing link or misleading HTML via, e.g., their delivery
    // address or name, which would render live in the email, INCLUDING internal
    // notification emails sent to admins/staff. Email clients strip <script>, so
    // this is HTML/link injection rather than JS execution; escaping < > & " stops
    // it. Amounts/dates/order number are system-generated. The *_block/*_html vars
    // are pre-built, already-escaped HTML and must NOT be re-escaped (double-encode).
    const vars: Record<string, string> = {
      first_name:            esc(firstNameRaw),
      order_id:              order.id,
      order_number:          esc(order.order_number || order.id),
      share_token:           order.share_token || "",
      order_date:            orderDate,
      customer_name:         esc(order.customer_name || ""),
      customer_email:        esc(isTestMode ? (test_email || order.customer_email) : (order.customer_email || "")),
      customer_phone:        esc(order.customer_phone || ""),
      subtotal:              fmt(order.subtotal || 0),
      delivery_fee:          order.delivery_fee === 0 ? "FREE" : fmt(order.delivery_fee || 0),
      service_fee:           fmt(order.service_fee || 0),
      gift_wrap_fee:         fmt(order.gift_wrap_fee || 0),
      gift_wrap_row:         buildGiftWrapRow(order, email_type),
      total:                 fmt(order.total || 0),
      order_total:           fmt(order.total || 0),
      payment_link:          esc(paymentLink),
      payment_confirmed_message: paymentConfirmedMessage(order.payment_method || ""),
      delivery_address:      esc(`${order.delivery_address || ""}, ${order.delivery_city || ""}, ${order.delivery_state || ""}`),
      delivery_city:         esc(order.delivery_city || ""),
      delivery_state:        esc(order.delivery_state || ""),
      estimated_delivery:    deliveryEst,
      delivery_window_label: deliveryWindow.label,
      tracking_number:       esc(order.tracking_number || ""),
      logistics_company:     esc(logisticsName || ""),
      tracking_number_block: buildTrackingBlock(order.tracking_number || "", logisticsName, logisticsTrackingUrl, logisticsWebsiteUrl),
      payment_method:        esc(order.payment_method || ""),
      order_status:          esc(order.order_status || ""),
      whatsapp_number:       whatsapp,
      referral_code:         esc(referralByEmail?.code || "[Your code will appear here]"),
      items_table:           buildItemsTable(items),
      order_summary_block:   orderSummaryBlock,
      payment_instructions:  (email_type === "order_received") ? buildPaymentInstructions(order, settingsMap) : "",
      reorder_items_html:    "",
      recommendations_html:  "",
      refund_note:           (email_type === "order_updated" && refund_pending === true) ? buildRefundNote() : "",
      cancellation_note:     (email_type === "order_cancelled") ? buildCancellationNote(order, items, slugMap) : "",
      edited_by:             esc(edited_by || ""),
      notification_type:     esc(notification_type || (refund_pending ? "Items removed — refund pending" : "Items updated")),
      refund_action_note:    (isInternal && refund_pending === true) ? buildRefundActionNote() : "",
      refund_amount:         returnRow ? fmt(returnRow.refund_amount || 0) : fmt(order.total || 0),
      return_reason_display: returnRow ? esc(reasonDisplay(returnRow.return_reason)) : "",
      return_reason_notes:   esc(returnRow?.return_reason_notes || ""),
      return_type:           esc(returnRow?.return_type || ""),
    };

    const htmlBody = replacePlaceholders(templateRes.data.html_body, vars);
    const subject  = replacePlaceholders(templateRes.data.subject, vars);

    let recipients: string[] = [];
    let sendToType: "customer" | "admin" | "test";

    if (isTestMode) {
      recipients = [test_email]; sendToType = "test";
    } else if (isPickerNotification) {
      const pickerEmailsRaw = settingsMap.picker_notification_emails?.replace(/^\"|\"$/g, "") || "";
      recipients = pickerEmailsRaw.split(",").map((e) => e.trim()).filter((e) => e.length > 0 && e.includes("@"));
      sendToType = "admin";
      if (recipients.length === 0) return new Response(JSON.stringify({ error: "No picker_notification_emails configured", recipients_attempted: 0 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else if (isInternal) {
      const adminEmail = settingsMap.order_manager_email?.replace(/^\"|\"$/g, "") || settingsMap.daily_summary_email?.replace(/^\"|\"$/g, "") || "";
      if (!adminEmail) return new Response(JSON.stringify({ error: "No admin email configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      recipients = [adminEmail]; sendToType = "admin";
    } else {
      recipients = [order.customer_email]; sendToType = "customer";
    }

    const finalSubject = (isTestMode ? "[TEST] " : "") + subject;
    const results: any[] = [];

    for (const sendTo of recipients) {
      let response, data: any, success = false;
      try {
        response = await fetch(`${GATEWAY_URL}/emails`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": RESEND_API_KEY },
          body: JSON.stringify({ from: FROM_EMAIL, to: [sendTo], reply_to: [REPLY_TO], subject: finalSubject, html: htmlBody }),
        });
        data = await response.json(); success = response.ok;
      } catch (fetchErr) { data = { error: fetchErr instanceof Error ? fetchErr.message : "fetch failed" }; }
      try {
        await supabase.from("email_send_log").insert({ template_slug: email_type, recipient_email: sendTo, subject: finalSubject, resend_email_id: success ? (data?.id || null) : null, send_to_type: sendToType, order_id: order.id, return_id: return_id || null, status: success ? "sent" : "failed", error_message: success ? null : JSON.stringify(data).slice(0, 1000) });
      } catch (logErr) { console.error("Failed to write email_send_log:", logErr); }
      results.push({ to: sendTo, success, email_id: success ? data?.id : null, error: success ? null : data });
    }

    const allOk = results.every((r) => r.success);
    const anyOk = results.some((r) => r.success);
    return new Response(JSON.stringify({ success: anyOk, all_ok: allOk, recipients_total: recipients.length, recipients_succeeded: results.filter((r) => r.success).length, results, email_id: results[0]?.email_id || null, sent_to: results[0]?.to || null }), { status: anyOk ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});