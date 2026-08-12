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

const GREEN="#2D6A4F";const CORAL="#F4845F";const BLACK="#1A1A1A";const CREAM="#FFF8F4";
const GREEN_LT="#D8EFE5";const DIVIDER="#E8E0D8";const MUTED="#7A7A7A";const WHITE="#FFFFFF";
const SITE_URL="https://bundledmum.com";

function fmt(amount: number): string { return "₦" + (Number(amount) || 0).toLocaleString("en-NG"); }

function parseRecipients(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw.split(/[,\n]/).map((e) => e.trim()).filter((e) => e.length > 3 && e.includes("@"));
}

// Split the free-text custom-items request into clean lines.
function parseCustomItems(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw.split(/\r?\n/).map((l) => l.replace(/^[-*•]\s*/, "").trim()).filter((l) => l.length > 0);
}

function buildAdminEmail(order: any, items: any[]): string {
  const itemRows = (items || []).map((it: any) => `
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid ${DIVIDER};font-family:Arial,sans-serif;font-size:13px;color:${BLACK};">
        ${it.bundle_name ? `<span style=\"color:${CORAL};font-size:11px;font-weight:700;\">[${it.bundle_name}]</span> ` : ""}${it.product_name}${it.brand_name ? ` <span style=\"color:${MUTED};\">(${it.brand_name})</span>` : ""}
        ${it.size ? `<br/><span style=\"color:${MUTED};font-size:11px;\">Size: ${it.size}</span>` : ""}${it.color ? `<span style=\"color:${MUTED};font-size:11px;\"> · Colour: ${it.color}</span>` : ""}
      </td>
      <td style="padding:8px 14px;border-bottom:1px solid ${DIVIDER};text-align:center;font-family:Arial,sans-serif;font-size:13px;color:${BLACK};">${it.quantity}</td>
      <td style="padding:8px 14px;border-bottom:1px solid ${DIVIDER};text-align:right;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:${BLACK};">${fmt(it.line_total)}</td>
    </tr>`).join("");

  const payLabel = ({ card: "Card (Paystack)", transfer: "Bank Transfer", ussd: "USSD" } as Record<string,string>)[order.payment_method] || order.payment_method || "-";
  const transferNote = order.payment_method === "transfer"
    ? `<div style=\"margin-top:6px;font-family:Arial,sans-serif;font-size:12px;color:#92400E;background:#FFF8E1;border:1px solid #F59E0B;border-radius:8px;padding:8px 12px;\">⏳ Bank transfer — confirm payment before fulfilling.</div>` : "";

  // Unlisted (custom) items the customer wants but that aren't on the site. Unpriced; needs admin follow-up.
  const customItems = parseCustomItems(order.custom_items_request);
  const customItemsBlock = customItems.length > 0 ? `
  <div style=\"margin-top:18px;border:1px solid #F59E0B;background:#FFF8E1;border-radius:10px;overflow:hidden;\">
    <div style=\"padding:10px 14px;background:#FDECC8;font-family:Arial,sans-serif;font-size:12px;font-weight:800;color:#92400E;text-transform:uppercase;\">⚠️ Unlisted items: ${customItems.length} — needs pricing</div>
    <div style=\"padding:12px 14px;\">
      <div style=\"font-family:Arial,sans-serif;font-size:12px;color:#92400E;margin-bottom:8px;\">Customer wants these items that are not on the site. Reach out with prices for them to pay separately.</div>
      <ul style=\"margin:0;padding-left:18px;\">
        ${customItems.map((l) => `<li style=\"font-family:Arial,sans-serif;font-size:13px;color:${BLACK};padding:2px 0;\">${l.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</li>`).join("")}
      </ul>
    </div>
  </div>` : "";

  return `<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"></head>
<body style=\"margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif;\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:${CREAM};\"><tr><td align=\"center\" style=\"padding:24px 16px;\">
<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"max-width:600px;background:${WHITE};border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);\">
<tr><td style=\"background:${GREEN};padding:24px 28px;\">
  <div style=\"font-family:Arial,sans-serif;font-size:22px;font-weight:900;color:${WHITE};\">\u{1F6CE}️ New Order Received</div>
  <div style=\"font-family:Arial,sans-serif;font-size:14px;color:rgba(255,255,255,0.8);margin-top:4px;\">Order #${order.order_number || order.id} · ${fmt(order.total)}</div>
</td></tr>
<tr><td style=\"padding:24px 28px;\">
  <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"margin-bottom:18px;\">
    <tr><td style=\"font-family:Arial,sans-serif;font-size:13px;color:${MUTED};width:130px;padding:5px 0;\">Customer</td><td style=\"font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};padding:5px 0;\">${order.customer_name || "-"}</td></tr>
    <tr><td style=\"font-family:Arial,sans-serif;font-size:13px;color:${MUTED};padding:5px 0;\">Phone</td><td style=\"font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};padding:5px 0;\">${order.customer_phone || "-"}</td></tr>
    <tr><td style=\"font-family:Arial,sans-serif;font-size:13px;color:${MUTED};padding:5px 0;\">Email</td><td style=\"font-family:Arial,sans-serif;font-size:14px;color:${BLACK};padding:5px 0;\">${order.customer_email || "-"}</td></tr>
    <tr><td style=\"font-family:Arial,sans-serif;font-size:13px;color:${MUTED};padding:5px 0;\">Deliver to</td><td style=\"font-family:Arial,sans-serif;font-size:14px;color:${BLACK};padding:5px 0;\">${order.delivery_address || ""}, ${order.delivery_city || ""}, ${order.delivery_state || ""}</td></tr>
    <tr><td style=\"font-family:Arial,sans-serif;font-size:13px;color:${MUTED};padding:5px 0;\">Payment</td><td style=\"font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};padding:5px 0;\">${payLabel}</td></tr>
  </table>
  ${transferNote}
  <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border:1px solid ${DIVIDER};border-radius:10px;overflow:hidden;margin-top:18px;\">
    <tr style=\"background:${GREEN_LT};\"><td style=\"padding:8px 14px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${GREEN};text-transform:uppercase;\">Item</td><td style=\"padding:8px 14px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${GREEN};text-align:center;text-transform:uppercase;\">Qty</td><td style=\"padding:8px 14px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${GREEN};text-align:right;text-transform:uppercase;\">Total</td></tr>
    ${itemRows}
    <tr><td colspan=\"2\" style=\"padding:12px 14px;font-family:Arial,sans-serif;font-size:15px;font-weight:900;color:${BLACK};border-top:2px solid ${DIVIDER};\">Order Total</td><td style=\"padding:12px 14px;font-family:Arial,sans-serif;font-size:15px;font-weight:900;color:${GREEN};text-align:right;border-top:2px solid ${DIVIDER};\">${fmt(order.total)}</td></tr>
  </table>
  ${customItemsBlock}
  <div style=\"text-align:center;margin-top:22px;\"><a href=\"${SITE_URL}/admin/orders\" style=\"display:inline-block;background:${GREEN};color:${WHITE};font-family:Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:12px 30px;border-radius:100px;\">Open in Admin →</a></div>
</td></tr>
<tr><td style=\"background:${BLACK};padding:18px 28px;text-align:center;\"><div style=\"font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.4);\">Internal notification · BundledMum admin</div></td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const { order_id } = await req.json();
    if (!order_id) return new Response(JSON.stringify({ error: "Missing order_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settingsRows } = await supabase
      .from("site_settings").select("key, value")
      .in("key", ["new_order_notification_email", "new_order_notification_enabled"]);
    const settings: Record<string, any> = {};
    for (const r of settingsRows || []) settings[r.key] = r.value;

    const enabled = settings.new_order_notification_enabled !== false;
    if (!enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "notification disabled" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const recipients = parseRecipients(settings.new_order_notification_email);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no recipients configured" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [orderRes, itemsRes] = await Promise.all([
      supabase.from("orders").select("*").eq("id", order_id).single(),
      supabase.from("order_items").select("*").eq("order_id", order_id).order("created_at"),
    ]);
    if (orderRes.error || !orderRes.data) return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const order = orderRes.data;
    const items = itemsRes.data || [];
    const html = buildAdminEmail(order, items);
    const subject = `\u{1F6CE}️ New Order #${order.order_number || order_id} — ${fmt(order.total)}`;

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to: recipients, subject, html }),
    });
    const data = await response.json();

    if (!response.ok) {
      console.error("[new-order-notification] resend error:", data);
      return new Response(JSON.stringify({ error: "send failed", details: data }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, sent_to: recipients, email_id: data?.id || null }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[new-order-notification] error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
