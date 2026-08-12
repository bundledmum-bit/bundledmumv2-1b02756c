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
const SITE_URL    = "https://bundledmum.com";

function fmt(amount: number): string {
  return "₦" + (amount || 0).toLocaleString("en-NG");
}

function replacePlaceholders(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}

function buildItemRows(items: any[]): string {
  return items.map((item: any) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #E8E0D8;font-size:14px;color:#1A1A1A;">
        <strong>${item.product_name}</strong>
        ${item.brand_name ? `<br/><span style="color:#7A7A7A;font-size:12px;">Brand: ${item.brand_name}</span>` : ""}
        ${item.size ? `<br/><span style="color:#7A7A7A;font-size:12px;">Size: ${item.size}</span>` : ""}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #E8E0D8;text-align:center;font-size:14px;color:#1A1A1A;">${item.quantity}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #E8E0D8;text-align:right;font-size:14px;font-weight:700;color:#1A1A1A;">${fmt(item.line_total)}</td>
    </tr>
  `).join("");
}

function tableHeader(): string {
  return `
      <tr style="background:#D8EFE5;">
        <td style="padding:10px 16px;font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;">Item</td>
        <td style="padding:10px 16px;font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;text-align:center;">Qty</td>
        <td style="padding:10px 16px;font-size:12px;font-weight:700;color:#2D6A4F;text-transform:uppercase;text-align:right;">Total</td>
      </tr>`;
}

function sectionHeaderRow(label: string): string {
  return `
      <tr>
        <td colspan="3" style="padding:12px 16px;background:#2D6A4F;color:#FFFFFF;font-size:13px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;border-top:3px solid #1E5C44;">
          <span style="display:inline-block;vertical-align:middle;">${label}</span>
        </td>
      </tr>`;
}

function buildQuoteItemsTable(items: any[]): string {
  if (!items || !items.length) return "<p style=\"color:#7A7A7A;font-size:14px;\">(No items)</p>";

  const usesSections = items.some((it: any) => it.section === "baby" || it.section === "mother" || it.section === "hospital");

  if (!usesSections) {
    return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      ${tableHeader()}
      ${buildItemRows(items)}
    </table>
  `;
  }

  const sectionOrder: { key: string; label: string }[] = [
    { key: "baby",     label: "Baby Items" },
    { key: "mother",   label: "Mother Items" },
    { key: "hospital", label: "Hospital Items" },
  ];

  let body = "";
  for (const sec of sectionOrder) {
    const secItems = items.filter((it: any) => it.section === sec.key);
    if (secItems.length === 0) continue;
    body += sectionHeaderRow(sec.label) + buildItemRows(secItems);
  }

  const otherItems = items.filter((it: any) => !it.section || (it.section !== "baby" && it.section !== "mother" && it.section !== "hospital"));
  if (otherItems.length > 0) {
    body += sectionHeaderRow("Other Items") + buildItemRows(otherItems);
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      ${tableHeader()}
      ${body}
    </table>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    const body = await req.json();
    const { quote_id, test_email } = body;

    if (!quote_id) {
      return new Response(JSON.stringify({ error: "quote_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const isTestMode = !!test_email;

    // SECURITY: test_email lets the caller choose the recipient, which without
    // a check makes this a relay for sending mail from this domain to any
    // address. Test sends require the service role key or a signed-in admin.
    if (isTestMode) {
      const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
      const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      let allowed = bearer.length > 0 && bearer === serviceKey;

      if (!allowed && bearer.length > 0) {
        try {
          const { data: userRes } = await supabase.auth.getUser(bearer);
          const uid = userRes?.user?.id;
          if (uid) {
            const { data: adminRow } = await supabase
              .from("admin_users")
              .select("id")
              .eq("auth_user_id", uid)
              .eq("is_active", true)
              .maybeSingle();
            allowed = !!adminRow;
          }
        } catch (_authErr) {
          allowed = false;
        }
      }

      if (!allowed) {
        return new Response(
          JSON.stringify({ error: "Test sends require an admin session." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const [quoteRes, itemsRes, templateRes, settingsRes] = await Promise.all([
      supabase.from("quotes").select("*").eq("id", quote_id).maybeSingle(),
      supabase.from("quote_items").select("*").eq("quote_id", quote_id).order("display_order", { ascending: true }),
      supabase.from("email_templates").select("subject, html_body").eq("slug", "quote_sent").eq("is_active", true).maybeSingle(),
      supabase.from("site_settings").select("key, value").in("key", ["whatsapp_number", "contact_email", "payment_method_klump_enabled"]),
    ]);

    if (quoteRes.error || !quoteRes.data) {
      return new Response(JSON.stringify({ error: "Quote not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!templateRes.data) {
      return new Response(JSON.stringify({ error: "Quote email template 'quote_sent' not found or inactive" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const quote = quoteRes.data;
    const items = itemsRes.data || [];

    const settingsMap: Record<string, string> = {};
    for (const s of settingsRes.data || []) {
      settingsMap[s.key] = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
    }

    let sendTo = isTestMode ? test_email : quote.customer_email;
    if (!sendTo) {
      return new Response(JSON.stringify({
        error: "No recipient email. Quote has no customer_email and no test_email provided."
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const firstName = (quote.customer_name || "").split(" ")[0] || "there";
    const whatsapp = (settingsMap.whatsapp_number || "").replace(/^\"|\"$/g, "");
    const quoteDate = new Date(quote.created_at).toLocaleDateString("en-NG", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
    const expiresAt = quote.expires_at ? new Date(quote.expires_at).toLocaleDateString("en-NG", {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    }) : "";

    const deliveryFee = quote.delivery_fee_override ?? quote.estimated_delivery_fee ?? 0;
    const quoteUrl = `${SITE_URL}/quote/${quote.share_token}`;

    const klumpRaw = String(settingsMap["payment_method_klump_enabled"] ?? "").toLowerCase();
    const klumpEnabled = klumpRaw === "true" || klumpRaw === "1";
    const klumpCta = klumpEnabled ? `
          <div style="margin-top:16px;">
            <a href="${quoteUrl}?pay=klump" style="display:inline-block;background:#2D6A4F;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;">🛍️ Buy Now, Pay Later with Klump</a>
            <div style="margin-top:8px;font-size:12px;color:#7A7A7A;">Split your payment into instalments at checkout with Klump.</div>
          </div>` : "";

    const hasDeliveryAddress = !!(quote.delivery_address && String(quote.delivery_address).trim() !== "");
    const hasOverride = quote.delivery_fee_override !== null && quote.delivery_fee_override !== undefined;
    const isBypassed = quote.bypass_delivery_threshold === true;
    const canResolveFee = hasDeliveryAddress || hasOverride || isBypassed;

    const deliveryFeeDisplay = canResolveFee
      ? (deliveryFee === 0 ? "FREE" : fmt(deliveryFee))
      : "Calculated after your delivery details";

    const vars: Record<string, string> = {
      first_name: firstName,
      customer_name: quote.customer_name || "",
      quote_number: quote.quote_number,
      quote_date: quoteDate,
      quote_url: quoteUrl,
      klump_cta: klumpCta,
      expires_at: expiresAt,
      subtotal: fmt(quote.subtotal || 0),
      service_fee: fmt(quote.service_fee || 0),
      delivery_fee: deliveryFeeDisplay,
      discount_amount: quote.discount_amount > 0 ? `-${fmt(quote.discount_amount)}` : fmt(0),
      discount_reason: quote.discount_reason || "",
      total: fmt(quote.total || 0),
      customer_notes: quote.customer_notes || "",
      items_table: buildQuoteItemsTable(items),
      whatsapp_number: whatsapp,
    };

    const htmlBody = replacePlaceholders(templateRes.data.html_body, vars);
    const subject = replacePlaceholders(templateRes.data.subject, vars);

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [sendTo],
        reply_to: [REPLY_TO],
        subject: (isTestMode ? "[TEST] " : "") + subject,
        html: htmlBody,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[send-quote-email] Resend failure:", data);
      return new Response(JSON.stringify({ error: "Email send failed", details: data }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!isTestMode && quote.status === "draft") {
      await supabase.from("quotes").update({
        status: "sent",
        sent_at: new Date().toISOString(),
      }).eq("id", quote_id);
    }

    return new Response(JSON.stringify({
      success: true,
      email_id: data.id,
      sent_to: sendTo,
      quote_url: quoteUrl,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[send-quote-email] Exception:", err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error"
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
