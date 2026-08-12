import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Sends DIRECTLY to Resend (api.resend.com). Previously routed through the dead
// Lovable connector gateway with LOVABLE_API_KEY (401 "Credential not found").
// Only the outbound URL + credential changed.
const RESEND_URL  = "https://api.resend.com/emails";
const FROM_EMAIL  = "BundledMum <hello@bundledmum.com>";

function fmt(amount: number): string {
  return "₦" + (Number(amount) || 0).toLocaleString("en-NG");
}
function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function waNumber(raw: string): string {
  let d = (raw || "").replace(/[^0-9]/g, "");
  if (d.startsWith("0")) d = "234" + d.slice(1);
  else if (d.startsWith("234")) { /* intl */ }
  else if (d.length === 10) d = "234" + d;
  return d;
}

// Internal notification: a customer abandoned checkout with a phone number, prompting
// staff to reach out on WhatsApp to help them complete the order. NOT customer-facing.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return json({ error: "Email not configured" }, 500);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const cartCaptureId: string | undefined = body?.cart_capture_id;
    if (!cartCaptureId) return json({ error: "cart_capture_id required" }, 400);

    const { data: cart, error: cartErr } = await supabase
      .from("cart_captures")
      .select("id, email, phone, customer_name, delivery_address, delivery_city, delivery_state, cart_total, status")
      .eq("id", cartCaptureId)
      .maybeSingle();
    if (cartErr || !cart) return json({ error: "Cart not found" }, 404);

    if (!cart.phone || String(cart.phone).trim() === "") {
      return json({ skipped: "no phone" }, 200);
    }

    const { data: settingsRows } = await supabase
      .from("site_settings").select("key, value")
      .in("key", ["order_manager_email", "daily_summary_email"]);
    const settings: Record<string, string> = {};
    for (const s of settingsRows || []) settings[s.key] = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
    const adminEmail = (settings.order_manager_email || settings.daily_summary_email || "").replace(/^\"|\"$/g, "");
    if (!adminEmail) return json({ error: "No internal email configured" }, 500);

    const hasName = !!(cart.customer_name && String(cart.customer_name).trim());
    // Generic WhatsApp help message (staff -> customer). If no name, use a warm generic greeting.
    const custWa = waNumber(cart.phone);
    const firstName = hasName ? (String(cart.customer_name).split(" ")[0]) : "";
    const greeting = firstName ? `Hi ${firstName}!` : "Hello!";
    const waMessage = `${greeting} This is BundledMum. We noticed you started an order but did not finish it. If you would like any help completing your order, we are right here and happy to assist you.`;
    const waUrl = `https://wa.me/${custWa}?text=${encodeURIComponent(waMessage)}`;

    const addr = [cart.delivery_address, cart.delivery_city, cart.delivery_state].filter(Boolean).map(esc).join(", ");
    const displayName = hasName ? esc(cart.customer_name) : "Not captured";

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFF8F4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF8F4;"><tr><td align="center" style="padding:24px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
  <tr><td style="background:linear-gradient(135deg,#F4845F 0%,#E86A45 100%);padding:24px 32px;">
    <div style="font-size:20px;font-weight:900;color:#FFFFFF;">🛒 Abandoned Checkout</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">A customer left without completing their order. Reach out to help them finish.</div>
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
      <tr><td style="padding:6px 0;font-size:13px;color:#7A7A7A;width:110px;">Name</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#1A1A1A;">${displayName}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#7A7A7A;">Phone</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#1A1A1A;">${esc(cart.phone)}</td></tr>
      ${cart.email ? `<tr><td style="padding:6px 0;font-size:13px;color:#7A7A7A;">Email</td><td style="padding:6px 0;font-size:14px;color:#1A1A1A;">${esc(cart.email)}</td></tr>` : ""}
      ${addr ? `<tr><td style="padding:6px 0;font-size:13px;color:#7A7A7A;vertical-align:top;">Address</td><td style="padding:6px 0;font-size:14px;color:#1A1A1A;">${addr}</td></tr>` : ""}
      <tr><td style="padding:6px 0;font-size:13px;color:#7A7A7A;">Cart Total</td><td style="padding:6px 0;font-size:16px;font-weight:900;color:#2D6A4F;">${fmt(cart.cart_total)}</td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
      <a href="${esc(waUrl)}" style="display:inline-block;background:#25D366;color:#FFFFFF;font-size:15px;font-weight:800;text-decoration:none;padding:14px 40px;border-radius:100px;">💬 Chat on WhatsApp to Help</a>
    </td></tr></table>
    <div style="font-size:12px;color:#A0A0A0;text-align:center;margin-top:14px;">Opens a WhatsApp chat to ${esc(cart.phone)} with a friendly message ready to send.</div>
  </td></tr>
</table>
</td></tr></table></body></html>`;

    const subjName = hasName ? cart.customer_name : cart.phone;
    const resp = await fetch(RESEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to: [adminEmail], subject: `🛒 Abandoned checkout — ${subjName} (${fmt(cart.cart_total)})`, html }),
    });
    const data = await resp.json().catch(() => ({}));

    try {
      await supabase.from("email_send_log").insert({
        template_slug: "internal_abandoned_checkout", recipient_email: adminEmail,
        subject: `Abandoned checkout ${subjName}`,
        resend_email_id: resp.ok ? (data?.id || null) : null, send_to_type: "admin",
        status: resp.ok ? "sent" : "failed", error_message: resp.ok ? null : JSON.stringify(data).slice(0, 800),
      });
    } catch (_) { /* non-fatal */ }

    return json({ success: resp.ok, email_id: resp.ok ? data?.id : null, sent_to: adminEmail }, resp.ok ? 200 : 500);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
