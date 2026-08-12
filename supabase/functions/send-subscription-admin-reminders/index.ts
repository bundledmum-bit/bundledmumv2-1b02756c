import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
// Sends DIRECTLY to Resend (api.resend.com). Previously routed through the dead
// Lovable connector gateway (X-Lovable-Api-Key/X-Resend-Api-Key), which returned
// 401 "Credential not found". Only the outbound URL + credential changed.
const RESEND_URL = "https://api.resend.com/emails";

function naira(n: number) { return "₦" + Math.round(n).toLocaleString("en-NG"); }
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function capitalize(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

async function sendEmail(to: string[], subject: string, html: string, rk: string) {
  return fetch(RESEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${rk}` },
    body: JSON.stringify({ from: "BundledMum <hello@bundledmum.com>", to, subject, html }),
  });
}

function renderTemplate(html: string, subject: string, vars: Record<string, string>) {
  let h = html, s = subject;
  for (const [k, v] of Object.entries(vars)) {
    h = h.replaceAll(`{{${k}}}`, v ?? "");
    s = s.replaceAll(`{{${k}}}`, v ?? "");
  }
  return { html: h, subject: s };
}

function buildItemList(items: any[]) {
  return items.filter((i) => i.is_active)
    .map((i) => `${i.brands?.brand_name ? i.brands.brand_name + " " : ""}${i.products?.name ?? "Item"} ×${i.quantity}`)
    .join("<br/>");
}

function calcPerDelivery(items: any[], pct: number) {
  const sub = items.filter((i) => i.is_active).reduce((s, i) => s + i.unit_price * i.quantity, 0);
  return Math.round(sub * (1 - pct / 100));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const rk = Deno.env.get("RESEND_API_KEY")!;

    const body = await req.json().catch(() => ({}));
    const testMode = body.test_email ?? null;

    // Resolve the configured recipient(s) from site_settings.
    const { data: recRow } = await supabase.from("site_settings")
      .select("value").eq("key", "subscription_notification_email").single();
    let rawRecipient: string = recRow?.value ?? "";
    if (typeof rawRecipient !== "string") rawRecipient = String(rawRecipient ?? "");
    const recipients = rawRecipient.split(",").map((e) => e.trim()).filter(Boolean);

    if (!testMode && recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No subscription_notification_email configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const sendTo = testMode ? [testMode] : recipients;

    // Recipient display name (first recipient local-part) for the greeting.
    const recipientName = (testMode ?? recipients[0] ?? "").split("@")[0] || "team";

    // Load the template.
    const { data: tmpl } = await supabase.from("email_templates")
      .select("html_body, subject, is_active").eq("slug", "internal_subscription_delivery_reminder").single();
    if (!tmpl) {
      return new Response(JSON.stringify({ error: "Template not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!tmpl.is_active && !testMode) {
      return new Response(JSON.stringify({ skipped: "template inactive" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Two reminder windows: 48h (2 days out) and 24h (1 day out).
    const today = new Date();
    const in2 = new Date(today.getTime() + 2 * 86400000).toISOString().split("T")[0];
    const in1 = new Date(today.getTime() + 1 * 86400000).toISOString().split("T")[0];
    const windows: { type: "48h" | "24h"; date: string; label: string }[] = [
      { type: "48h", date: in2, label: "in 48 hours" },
      { type: "24h", date: in1, label: "in 24 hours" },
    ];

    let sent = 0, skipped = 0;
    const results: any[] = [];

    for (const w of windows) {
      // Active subscriptions whose next delivery (next_charge_date) lands on this window date.
      const { data: subs, error: subErr } = await supabase.from("subscriptions")
        .select(`id, customer_email, customer_name, customer_phone, frequency, discount_pct,
          next_charge_date, total_cycles, delivery_day, delivery_address, delivery_city, delivery_state,
          subscription_items(id, quantity, unit_price, is_active, products(name), brands(brand_name))`)
        .eq("status", "active")
        .eq("next_charge_date", w.date)
        .is("paused_until", null);

      if (subErr) { results.push({ window: w.type, error: subErr.message }); continue; }

      for (const sub of subs ?? []) {
        // Idempotency: skip if already sent for this subscription + date + window.
        // (Skipped entirely in test mode so a test always sends.)
        if (!testMode) {
          const { data: already } = await supabase.from("subscription_delivery_reminders")
            .select("id").eq("subscription_id", sub.id).eq("scheduled_date", w.date)
            .eq("reminder_type", w.type).maybeSingle();
          if (already) { skipped++; continue; }
        }

        const items = (sub.subscription_items as any[]) ?? [];
        const perDelivery = calcPerDelivery(items, sub.discount_pct ?? 0);
        const cycleNum = (sub.total_cycles ?? 0) + 1;

        const vars: Record<string, string> = {
          recipient_name: recipientName,
          reminder_window: w.label,
          delivery_date: fmtDate(w.date),
          delivery_day: capitalize(sub.delivery_day ?? ""),
          customer_name: sub.customer_name ?? sub.customer_email?.split("@")[0] ?? "Customer",
          customer_phone: sub.customer_phone ?? "N/A",
          cycle_number: String(cycleNum),
          frequency: capitalize(sub.frequency ?? ""),
          delivery_address: sub.delivery_address ?? "",
          delivery_city: sub.delivery_city ?? "",
          delivery_state: sub.delivery_state ?? "",
          total_naira: naira(perDelivery),
          item_list: buildItemList(items),
        };

        const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
        await sendEmail(sendTo, subject, html, rk);

        if (!testMode) {
          await supabase.from("subscription_delivery_reminders").insert({
            subscription_id: sub.id,
            scheduled_date: w.date,
            reminder_type: w.type,
            recipient_email: sendTo.join(", "),
          });
        }
        sent++;
        results.push({ window: w.type, subscription_id: sub.id, customer: vars.customer_name });

        if (testMode) break; // one sample email per window in test mode
      }
    }

    return new Response(JSON.stringify({ sent, skipped, test_mode: !!testMode, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("send-subscription-admin-reminders error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
