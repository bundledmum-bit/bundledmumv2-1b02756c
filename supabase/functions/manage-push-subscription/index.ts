import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "subscribe";

    if (action === "unsubscribe") {
      const endpoint = body.endpoint;
      if (!endpoint) return json({ error: "endpoint required" }, 400);
      await supabase.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("endpoint", endpoint);
      return json({ success: true, unsubscribed: true });
    }

    // subscribe / upsert
    const sub = body.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return json({ error: "invalid subscription" }, 400);
    }
    const email = (body.customer_email || "").trim().toLowerCase() || null;

    const row = {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      customer_email: email,
      session_id: body.session_id || null,
      device_type: body.device_type || null,
      browser: body.browser || null,
      os: body.os || null,
      user_agent: body.user_agent || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Upsert on endpoint (one row per browser). Reactivates if it had been deactivated.
    const { error } = await supabase.from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" });
    if (error) return json({ error: error.message }, 500);

    return json({ success: true, subscribed: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
