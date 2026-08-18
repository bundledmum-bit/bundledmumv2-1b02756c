import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

// VAPID keys come from secrets ONLY. They previously had hardcoded fallbacks,
// which meant a missing or misspelled secret was silently ignored while the
// embedded key carried on working. Now a missing secret fails loudly instead.
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = "mailto:hello@bundledmum.com";
const INTERNAL_SECRET = Deno.env.get("PUSH_INTERNAL_SECRET") || "";
const DELAY_MINUTES = 30;

const vapidReady = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (vapidReady) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.error("VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is not set, push cannot send");
}

function firstNameOrMama(fullName: string | null | undefined): string {
  const fn = (fullName || "").trim().split(/\s+/)[0];
  if (!fn) return "Mama";
  return fn.charAt(0).toUpperCase() + fn.slice(1);
}
function applyVars(tpl: string, vars: Record<string,string>): string {
  let out = tpl || "";
  for (const [k,v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v ?? "");
  return out;
}
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Server-to-server only (cron). Requires the internal secret.
    const secret = req.headers.get("x-internal-secret") || "";
    if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) return json({ error: "unauthorized" }, 401);

    if (!vapidReady) {
      return json({ error: "Push is not configured: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set as secrets" }, 500);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Is the trigger enabled? If not, no-op (consistent with the other triggers).
    const { data: trig } = await admin.from("push_triggers").select("*").eq("trigger_key", "subscriber_welcome").maybeSingle();
    if (!trig) return json({ error: "trigger missing" }, 404);
    if (!trig.is_enabled) return json({ success: true, skipped: "trigger disabled" }, 200);

    const cutoff = new Date(Date.now() - DELAY_MINUTES * 60 * 1000).toISOString();

    // Subscribers who crossed the delay mark, are still active, and were never welcomed.
    const { data: due, error } = await admin.from("push_subscriptions")
      .select("*")
      .eq("is_active", true)
      .is("welcomed_at", null)
      .lte("created_at", cutoff)
      .limit(500);
    if (error) return json({ error: error.message }, 500);
    if (!due || due.length === 0) return json({ success: true, sent: 0, note: "none due" }, 200);

    const url  = trig.url_template || "https://bundledmum.com/subscriptions";
    const icon = "https://bundledmum.com/bm-pwa-192.png";

    let sent = 0, failed = 0;
    const deadIds: string[] = [];
    const welcomedIds: string[] = [];

    for (const sub of due) {
      try {
        // Personalize if we happen to know the customer; otherwise "Mama".
        let firstName = "Mama";
        if (sub.customer_email) {
          const { data: cust } = await admin.from("customers").select("full_name").ilike("email", sub.customer_email).maybeSingle();
          firstName = firstNameOrMama(cust?.full_name);
        }
        const vars = { first_name: firstName };
        const title = applyVars(trig.title_template, vars);
        const message = applyVars(trig.body_template, vars);

        // One campaign row per send so it shows in history with delivered/opened tracking.
        const { data: camp } = await admin.from("push_campaigns").insert({
          title, body: message, url, icon, audience: "subscriber", source: "subscriber_welcome",
          status: "sent", sent_count: 0, failed_count: 0,
        }).select("id").single();

        const payload = JSON.stringify({ title, body: message, url, icon, campaign_id: camp?.id });
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        if (camp?.id) await admin.from("push_campaigns").update({ sent_count: 1 }).eq("id", camp.id);
        sent++;
        welcomedIds.push(sub.id);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) deadIds.push(sub.id);
        else welcomedIds.push(sub.id); // stamp anyway so we don't retry a soft failure forever
        failed++;
      }
    }

    // Stamp welcomed_at on everyone we attempted (so it sends once), deactivate dead endpoints.
    if (welcomedIds.length) await admin.from("push_subscriptions").update({ welcomed_at: new Date().toISOString() }).in("id", welcomedIds);
    if (deadIds.length) await admin.from("push_subscriptions").update({ is_active: false, welcomed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in("id", deadIds);

    return json({ success: true, sent, failed, deactivated: deadIds.length }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
