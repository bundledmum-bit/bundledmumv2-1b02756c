import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const FROM_EMAIL = "BundledMum <hello@bundledmum.com>";
const REPLY_TO   = "hello@bundledmum.ng";
const EMAIL_TYPE = "subscription_intro";
const TEMPLATE_SLUG = "subscription_intro";
// Sends DIRECTLY to Resend (api.resend.com). Previously routed through the dead
// Lovable connector gateway with LOVABLE_API_KEY (401 "Credential not found").
// Only the outbound URL + credential changed.
const RESEND_URL = "https://api.resend.com/emails";

function normEmail(e: string | null | undefined): string {
  return (e || "").trim().toLowerCase();
}
function firstNameOrMama(fullName: string | null | undefined): string {
  const fn = (fullName || "").trim().split(/\s+/)[0];
  if (!fn) return "Mama";
  return fn.charAt(0).toUpperCase() + fn.slice(1);
}
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = Date.now();
    const h24 = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const h48 = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Logs every send attempt (success + failure) to email_send_log so it shows in the admin email log.
    async function logSend(email: string, subject: string, status: string, resendId: string | null, errorMsg: string | null) {
      try {
        await supabase.from("email_send_log").insert({
          template_slug: TEMPLATE_SLUG, recipient_email: email, subject,
          resend_email_id: resendId, send_to_type: "customer",
          status, error_message: errorMsg,
        });
      } catch (_e) { /* logging must never break the send loop */ }
    }

    const body = await req.json().catch(() => ({}));
    const testEmail = normEmail(body.test_email);

    const { data: tmpl } = await supabase.from("email_templates")
      .select("subject, html_body, is_active").eq("slug", TEMPLATE_SLUG).maybeSingle();
    if (!tmpl || !tmpl.is_active) return json({ success: true, skipped: "template inactive" }, 200);

    const { data: settings } = await supabase.from("site_settings").select("key, value").in("key", ["whatsapp_number"]);
    const sm: Record<string, string> = {};
    for (const s of settings || []) sm[s.key] = typeof s.value === "string" ? s.value : JSON.stringify(s.value);
    const whatsapp = (sm.whatsapp_number || "").replace(/^"|"$/g, "");

    const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY")!;

    let candidates: { email: string }[] = [];
    if (testEmail) {
      candidates = [{ email: testEmail }];
    } else {
      const { data: recentlyDelivered } = await supabase.from("orders")
        .select("customer_email, delivered_at")
        .eq("order_status", "delivered")
        .lte("delivered_at", h24)
        .gte("delivered_at", h48)
        .limit(500);
      const seen = new Set<string>();
      for (const o of recentlyDelivered || []) {
        const em = normEmail(o.customer_email);
        if (em && !seen.has(em)) { seen.add(em); candidates.push({ email: em }); }
      }
    }

    let sent = 0, skipped = 0, failed = 0;

    for (const c of candidates) {
      const em = c.email;
      let subject = tmpl.subject;
      try {
        if (!testEmail) {
          const { data: earlier } = await supabase.from("orders")
            .select("id").eq("order_status", "delivered").ilike("customer_email", em)
            .lt("delivered_at", h48).limit(1).maybeSingle();
          if (earlier) { skipped++; continue; }

          const { data: activeSub } = await supabase.from("subscriptions")
            .select("id").ilike("customer_email", em).in("status", ["active", "paused"]).limit(1).maybeSingle();
          if (activeSub) { skipped++; continue; }

          const { data: recentSend } = await supabase.from("marketing_email_log")
            .select("id").ilike("customer_email", em).eq("email_type", EMAIL_TYPE)
            .gte("sent_at", d30).limit(1).maybeSingle();
          if (recentSend) { skipped++; continue; }
        }

        const { data: cust } = await supabase.from("customers")
          .select("full_name").ilike("email", em).limit(1).maybeSingle();
        const firstName = firstNameOrMama(cust?.full_name);

        const vars: Record<string, string> = { first_name: firstName, whatsapp_number: whatsapp };
        let html = tmpl.html_body;
        for (const [k, v] of Object.entries(vars)) {
          html = html.replaceAll(`{{${k}}}`, v ?? "");
          subject = subject.replaceAll(`{{${k}}}`, v ?? "");
        }

        const resp = await fetch(RESEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({ from: FROM_EMAIL, to: [em], reply_to: [REPLY_TO], subject, html }),
        });

        if (resp.ok) {
          let resendId: string | null = null;
          try { const j = await resp.json(); resendId = j?.id || j?.data?.id || null; } catch (_e) { /* ignore */ }
          if (!testEmail) {
            await supabase.from("marketing_email_log").insert({ customer_email: em, email_type: EMAIL_TYPE });
          }
          await logSend(em, subject, "sent", resendId, null);
          sent++;
        } else {
          const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
          await logSend(em, subject, "failed", null, errText.slice(0, 500));
          failed++;
        }
      } catch (e) {
        console.error("[subscription-intro] item error:", e);
        await logSend(em, subject, "failed", null, e instanceof Error ? e.message.slice(0, 500) : "unknown error");
        failed++;
      }
    }

    return json({ success: true, candidates: candidates.length, sent, skipped, failed }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
