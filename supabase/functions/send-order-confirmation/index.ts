import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

// ── Brand tokens ──────────────────────────────────────────
const CORAL     = "#F4845F";
const GREEN     = "#2D6A4F";
const BLACK     = "#1A1A1A";
const CREAM     = "#FFF8F4";
const CORAL_LT  = "#FDE8DF";
const GREEN_LT  = "#D8EFE5";
const DIVIDER   = "#E8E0D8";
const MUTED     = "#7A7A7A";
const WHITE     = "#FFFFFF";

const SITE_URL  = "https://bundledmum.com";
const LOGO_URL  = `${SITE_URL}/images/BM-LOGO-CORAL.png`;

// ── Helpers ───────────────────────────────────────────────
function fmt(amount: number): string {
  return "₦" + amount.toLocaleString("en-NG");
}

function buildOrderEmail(order: any, items: any[]): string {
  const firstName = (order.customer_name || "").split(" ")[0] || "there";
  const orderDate = new Date(order.created_at).toLocaleDateString("en-NG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const isBankTransfer = order.payment_method === "transfer";
  const payLabels: Record<string, string> = {
    card: "Card Payment via Paystack",
    transfer: "Bank Transfer",
    ussd: "USSD / Mobile Money",
  };

  // Build item rows
  const itemRows = items.map((item: any) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid ${DIVIDER};font-family:'Lato',Arial,sans-serif;font-size:14px;color:${BLACK};">
        ${item.bundle_name ? `<span style="display:inline-block;background:${CORAL_LT};color:${CORAL};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-bottom:4px;">📦 ${item.bundle_name}</span><br/>` : ""}
        <strong>${item.product_name}</strong>
        ${item.brand_name ? `<br/><span style="color:${MUTED};font-size:12px;">Brand: ${item.brand_name}</span>` : ""}
        ${item.size ? `<br/><span style="color:${MUTED};font-size:12px;">Size / Age: ${item.size}</span>` : ""}
        ${item.color ? `<br/><span style="color:${MUTED};font-size:12px;">Colour: ${item.color === "boy" ? "Boy (Blue)" : item.color === "girl" ? "Girl (Pink)" : item.color === "neutral" ? "Neutral (White)" : item.color}</span>` : ""}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid ${DIVIDER};text-align:center;font-family:'Lato',Arial,sans-serif;font-size:14px;color:${BLACK};">${item.quantity}</td>
      <td style="padding:12px 16px;border-bottom:1px solid ${DIVIDER};text-align:right;font-family:'Lato',Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">${fmt(item.line_total)}</td>
    </tr>
  `).join("");

  // Bank transfer section
  const bankSection = isBankTransfer ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr><td style="background:linear-gradient(135deg,#FFF8E1,#FFE9A8);border:2px solid #F59E0B;border-radius:16px;padding:24px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="font-family:'Nunito','Lato',Arial,sans-serif;font-size:18px;font-weight:900;color:#92400E;padding-bottom:8px;">
            ⏳ Action Required — Complete Your Payment
          </td></tr>
          <tr><td style="font-family:'Lato',Arial,sans-serif;font-size:14px;color:#78350F;padding-bottom:16px;">
            Transfer the exact amount below within <strong>12 hours</strong> to confirm your order.
          </td></tr>
          <tr><td>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${WHITE};border-radius:12px;border:1px solid rgba(245,158,11,0.4);">
              <tr>
                <td style="padding:12px 16px;font-family:'Lato',Arial,sans-serif;font-size:13px;color:${MUTED};width:140px;">Bank</td>
                <td style="padding:12px 16px;font-family:'Lato',Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">${order.bank_name || ""}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-top:1px solid ${DIVIDER};font-family:'Lato',Arial,sans-serif;font-size:13px;color:${MUTED};">Account Name</td>
                <td style="padding:12px 16px;border-top:1px solid ${DIVIDER};font-family:'Lato',Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">${order.bank_account_name || ""}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-top:1px solid ${DIVIDER};font-family:'Lato',Arial,sans-serif;font-size:13px;color:${MUTED};">Account Number</td>
                <td style="padding:12px 16px;border-top:1px solid ${DIVIDER};font-family:'Lato',Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">${order.bank_account_number || ""}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;border-top:2px solid ${DIVIDER};font-family:'Lato',Arial,sans-serif;font-size:13px;color:${MUTED};">Amount</td>
                <td style="padding:12px 16px;border-top:2px solid ${DIVIDER};font-family:'Nunito','Lato',Arial,sans-serif;font-size:20px;font-weight:900;color:${CORAL};">${fmt(order.total)}</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding-top:12px;font-family:'Lato',Arial,sans-serif;font-size:13px;color:#78350F;line-height:1.6;">
            📌 Use your phone number as the transfer reference.<br/>
            ⏱️ Your order will be confirmed within 30 minutes to 1 hour of payment.
          </td></tr>
        </table>
      </td></tr>
    </table>
  ` : "";

  const deliveryEst = (() => {
    const from = order.estimated_delivery_start ? new Date(order.estimated_delivery_start) : null;
    const to = order.estimated_delivery_end ? new Date(order.estimated_delivery_end) : null;
    if (!from || !to) return "We'll notify you";
    const f = (d: Date) => d.toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" });
    return `${f(from)} – ${f(to)}`;
  })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Order Confirmation — BundledMum</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:'Lato',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
<tr><td align="center" style="padding:24px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${WHITE};border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,${GREEN} 0%,#1E5C44 100%);padding:32px 40px;text-align:center;">
    <img src="${LOGO_URL}" alt="BundledMum" width="180" style="display:block;margin:0 auto 16px;"/>
    <div style="font-family:'Nunito','Lato',Arial,sans-serif;font-size:28px;font-weight:900;color:${WHITE};line-height:1.2;">
      Order Confirmed! 🎉
    </div>
    <div style="font-family:'Lato',Arial,sans-serif;font-size:14px;color:rgba(255,255,255,0.75);margin-top:8px;">
      Thank you, ${firstName}! Your bundle is on its way.
    </div>
    <div style="display:inline-block;background:rgba(244,132,95,0.25);border:1px solid rgba(244,132,95,0.5);border-radius:100px;padding:6px 20px;margin-top:16px;">
      <span style="font-family:'Nunito','Lato',Arial,sans-serif;font-size:14px;font-weight:700;color:${CORAL};">Order #${order.order_number || order.id}</span>
    </div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 32px 24px;">

    <!-- Bank Transfer Alert -->
    ${bankSection}

    <!-- Order Items -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr><td style="font-family:'Nunito','Lato',Arial,sans-serif;font-size:18px;font-weight:900;color:${GREEN};padding-bottom:12px;">
        🛒 Your Order
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${DIVIDER};border-radius:12px;overflow:hidden;">
          <tr style="background:${GREEN_LT};">
            <td style="padding:10px 16px;font-family:'Nunito','Lato',Arial,sans-serif;font-size:12px;font-weight:700;color:${GREEN};text-transform:uppercase;letter-spacing:0.5px;">Item</td>
            <td style="padding:10px 16px;font-family:'Nunito','Lato',Arial,sans-serif;font-size:12px;font-weight:700;color:${GREEN};text-transform:uppercase;text-align:center;letter-spacing:0.5px;">Qty</td>
            <td style="padding:10px 16px;font-family:'Nunito','Lato',Arial,sans-serif;font-size:12px;font-weight:700;color:${GREEN};text-transform:uppercase;text-align:right;letter-spacing:0.5px;">Total</td>
          </tr>
          ${itemRows}
        </table>
      </td></tr>
    </table>

    <!-- Order Summary -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};border-radius:12px;padding:4px;margin-bottom:24px;">
      <tr>
        <td style="padding:10px 20px;font-family:'Lato',Arial,sans-serif;font-size:14px;color:${MUTED};">Subtotal</td>
        <td style="padding:10px 20px;font-family:'Lato',Arial,sans-serif;font-size:14px;color:${BLACK};text-align:right;">${fmt(order.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:10px 20px;font-family:'Lato',Arial,sans-serif;font-size:14px;color:${MUTED};">Delivery</td>
        <td style="padding:10px 20px;font-family:'Lato',Arial,sans-serif;font-size:14px;color:${order.delivery_fee === 0 ? GREEN : BLACK};text-align:right;font-weight:${order.delivery_fee === 0 ? "700" : "400"};">${order.delivery_fee === 0 ? "FREE" : fmt(order.delivery_fee)}</td>
      </tr>
      <tr>
        <td style="padding:10px 20px;font-family:'Lato',Arial,sans-serif;font-size:14px;color:${MUTED};">Service & Packaging</td>
        <td style="padding:10px 20px;font-family:'Lato',Arial,sans-serif;font-size:14px;color:${BLACK};text-align:right;">${fmt(order.service_fee)}</td>
      </tr>
      ${order.discount_amount && order.discount_amount > 0 ? `
      <tr>
        <td style="padding:10px 20px;font-family:'Lato',Arial,sans-serif;font-size:14px;color:${CORAL};">Discount</td>
        <td style="padding:10px 20px;font-family:'Lato',Arial,sans-serif;font-size:14px;color:${CORAL};text-align:right;font-weight:700;">−${fmt(order.discount_amount)}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:14px 20px;border-top:2px solid ${DIVIDER};font-family:'Nunito','Lato',Arial,sans-serif;font-size:18px;font-weight:900;color:${BLACK};">Total</td>
        <td style="padding:14px 20px;border-top:2px solid ${DIVIDER};font-family:'Nunito','Lato',Arial,sans-serif;font-size:18px;font-weight:900;color:${GREEN};text-align:right;">${fmt(order.total)}</td>
      </tr>
    </table>

    <!-- Delivery Info -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${DIVIDER};border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <tr><td style="background:${GREEN_LT};padding:12px 20px;font-family:'Nunito','Lato',Arial,sans-serif;font-size:14px;font-weight:800;color:${GREEN};">
        📦 Delivery Details
      </td></tr>
      <tr><td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:6px 0;font-family:'Lato',Arial,sans-serif;font-size:13px;color:${MUTED};width:130px;">Name</td>
            <td style="padding:6px 0;font-family:'Lato',Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">${order.customer_name}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-family:'Lato',Arial,sans-serif;font-size:13px;color:${MUTED};">Phone</td>
            <td style="padding:6px 0;font-family:'Lato',Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">${order.customer_phone}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-family:'Lato',Arial,sans-serif;font-size:13px;color:${MUTED};">Address</td>
            <td style="padding:6px 0;font-family:'Lato',Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">${order.delivery_address}, ${order.delivery_city}, ${order.delivery_state}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-family:'Lato',Arial,sans-serif;font-size:13px;color:${MUTED};">Payment</td>
            <td style="padding:6px 0;font-family:'Lato',Arial,sans-serif;font-size:14px;font-weight:700;color:${BLACK};">${payLabels[order.payment_method] || order.payment_method}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-family:'Lato',Arial,sans-serif;font-size:13px;color:${MUTED};">Estimated Delivery</td>
            <td style="padding:6px 0;font-family:'Lato',Arial,sans-serif;font-size:14px;font-weight:700;color:${GREEN};">${deliveryEst}</td>
          </tr>
        </table>
      </td></tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr><td align="center" style="padding:8px 0;">
        <a href="${SITE_URL}/order-confirmed?order=${order.order_number || ""}" style="display:inline-block;background:${GREEN};color:${WHITE};font-family:'Nunito','Lato',Arial,sans-serif;font-size:15px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:100px;">
          View Order Details →
        </a>
      </td></tr>
    </table>

    <!-- WhatsApp -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${GREEN_LT};border-radius:12px;margin-bottom:16px;">
      <tr><td style="padding:20px;text-align:center;">
        <div style="font-family:'Nunito','Lato',Arial,sans-serif;font-size:15px;font-weight:800;color:${GREEN};margin-bottom:8px;">
          💬 Questions About Your Order?
        </div>
        <div style="font-family:'Lato',Arial,sans-serif;font-size:13px;color:${MUTED};margin-bottom:12px;">
          Chat with us on WhatsApp — we reply within minutes.
        </div>
        <a href="https://wa.me/${order.whatsapp_number || ""}?text=${encodeURIComponent(`Hi! My order number is ${order.order_number || order.id}`)}" style="display:inline-block;background:#25D366;color:${WHITE};font-family:'Lato',Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:10px 28px;border-radius:100px;">
          Chat on WhatsApp 💬
        </a>
      </td></tr>
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:${BLACK};padding:28px 32px;text-align:center;">
    <div style="font-family:'Nunito','Lato',Arial,sans-serif;font-size:13px;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:8px;">
      BundledMum — Everything your baby needs, bundled with love 💚
    </div>
    <div style="font-family:'Lato',Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.35);line-height:1.6;">
      ${orderDate}<br/>
      This email was sent to ${order.customer_email} regarding order #${order.order_number || order.id}.
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Missing order_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch order + items + site settings from DB
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const [orderRes, itemsRes, settingsRes] = await Promise.all([
      supabase.from("orders").select("*").eq("id", order_id).single(),
      supabase.from("order_items").select("*").eq("order_id", order_id).order("created_at"),
      supabase.from("site_settings").select("key, value").in("key", [
        "bank_name", "bank_account_name", "bank_account_number",
        "whatsapp_number", "contact_email",
      ]),
    ]);

    if (orderRes.error || !orderRes.data) {
      console.error("Order not found:", orderRes.error);
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const order = orderRes.data;
    const items = itemsRes.data || [];

    // Merge site settings into order for template
    const settingsMap: Record<string, any> = {};
    for (const s of settingsRes.data || []) {
      settingsMap[s.key] = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
    }
    order.bank_name = settingsMap.bank_name || "";
    order.bank_account_name = settingsMap.bank_account_name || "";
    order.bank_account_number = settingsMap.bank_account_number || "";
    order.whatsapp_number = settingsMap.whatsapp_number || "";

    const html = buildOrderEmail(order, items);

    // Determine from address
    const fromEmail = settingsMap.contact_email
      ? `BundledMum <${settingsMap.contact_email}>`
      : "BundledMum <onboarding@resend.dev>";

    // Send via Resend gateway
    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [order.customer_email],
        subject: `Order Confirmed! 🎉 #${order.order_number || order_id}`,
        html,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`Resend API failed [${response.status}]:`, JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Email send failed", details: data }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[send-order-confirmation] Email sent successfully:", data);

    return new Response(
      JSON.stringify({ success: true, email_id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-order-confirmation error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
