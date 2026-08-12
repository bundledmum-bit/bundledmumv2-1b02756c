import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sends DIRECTLY to Resend (api.resend.com). Previously routed through the dead
// Lovable connector gateway with LOVABLE_API_KEY (401 "Credential not found").
// Only the outbound URL + credential changed.
const RESEND_URL = "https://api.resend.com/emails";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { test_email } = await req.json();
    if (!test_email) return new Response(JSON.stringify({ error: "test_email required" }), { status: 400, headers: corsHeaders });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return new Response(JSON.stringify({ error: "RESEND_API_KEY missing" }), { status: 500, headers: corsHeaders });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // SECURITY: the caller chooses the recipient, so without a check this is
    // an open relay: anyone with the public anon key could send mail from
    // this domain to any address. Requires the service role key or a
    // signed-in active admin.
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

    const { data: settings } = await supabase.from("site_settings").select("key,value").eq("key", "contact_email").single();
    const fromEmail = settings?.value ? `BundledMum <${settings.value}>` : "BundledMum <onboarding@resend.dev>";

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [test_email],
        subject: "[TEST] BundledMum Email is Working",
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FFF8F4;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F4;"><tr><td align="center" style="padding:24px 16px;"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);"><tr><td style="background:linear-gradient(135deg,#2D6A4F 0%,#1E5C44 100%);padding:32px 40px;text-align:center;"><img src="https://bundledmum.com/images/BM-LOGO-CORAL.png" alt="BundledMum" width="160" style="display:block;margin:0 auto 16px;"/><div style="font-size:26px;font-weight:900;color:#fff;">Email is Working!</div><div style="font-size:14px;color:rgba(255,255,255,0.75);margin-top:8px;">Your Resend integration is set up correctly.</div></td></tr><tr><td style="padding:40px 32px;text-align:center;"><p style="font-size:15px;color:#4A4A4A;line-height:1.7;">This is a test email from BundledMum confirming that Resend is connected and emails are sending correctly from <strong>${settings?.value || 'hello@bundledmum.com'}</strong>.</p></td></tr><tr><td style="background:#1A1A1A;padding:24px 32px;text-align:center;"><div style="font-size:13px;color:rgba(255,255,255,0.5);">BundledMum — making being a mum easier</div></td></tr></table></td></tr></table></body></html>`,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Resend failed", details: data }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, email_id: data.id, sent_to: test_email, sent_from: fromEmail }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
