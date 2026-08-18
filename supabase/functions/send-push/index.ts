import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

// VAPID keys come from secrets ONLY. They previously had hardcoded fallbacks,
// which meant a missing or misspelled secret was silently ignored while the
// embedded key carried on working, so nobody would ever notice. Now a missing
// secret fails loudly at the first request instead.
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = "mailto:hello@bundledmum.com";
const INTERNAL_SECRET = Deno.env.get("PUSH_INTERNAL_SECRET") || "";

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
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Shared sender: pushes a prepared campaign to its audience, updates counts. Used by broadcast,
// trigger, and the scheduled-dispatch path. Expects the campaign row already created (campaignId).
async function deliverCampaign(admin: any, opts: {
  campaignId: string; title: string; message: string; url: string; icon: string; image: string | null;
  audience: string; mode: string; targetEmail: string | null;
}) {
  let query = admin.from("push_subscriptions").select("*").eq("is_active", true);
  if (opts.mode === "trigger" && opts.targetEmail) query = query.eq("customer_email", opts.targetEmail);
  else if (opts.audience === "customers") query = query.not("customer_email", "is", null);
  const { data: subs } = await query.limit(10000);

  if (!subs || subs.length === 0) {
    await admin.from("push_campaigns").update({ sent_count: 0, failed_count: 0, status: "sent" }).eq("id", opts.campaignId);
    return { sent: 0, failed: 0, deactivated: 0 };
  }

  const payload = JSON.stringify({
    title: opts.title, body: opts.message, url: opts.url, icon: opts.icon,
    image: opts.image || undefined, campaign_id: opts.campaignId,
  });

  let sent = 0, failed = 0;
  const deadIds: string[] = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) deadIds.push(sub.id);
      failed++;
    }
  }
  if (deadIds.length) await admin.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).in("id", deadIds);
  const liveIds = subs.filter((s: any) => !deadIds.includes(s.id)).map((s: any) => s.id);
  if (liveIds.length) await admin.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).in("id", liveIds);

  await admin.from("push_campaigns").update({ sent_count: sent, failed_count: failed, status: "sent" }).eq("id", opts.campaignId);
  return { sent, failed, deactivated: deadIds.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!vapidReady) {
      return json({ error: "Push is not configured: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set as secrets" }, 500);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "broadcast";

    // ── AUTH ──
    let createdBy: string | null = null;
    const isScheduledDispatch = mode === "scheduled_dispatch";
    if (mode === "trigger" || isScheduledDispatch) {
      const secret = req.headers.get("x-internal-secret") || "";
      if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) return json({ error: "unauthorized" }, 401);
    } else {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "unauthorized" }, 401);
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      );
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
      const { data: permOk } = await userClient.rpc("has_admin_permission", { p_section: "settings", p_action: "manage" });
      if (permOk !== true) return json({ error: "forbidden: settings/manage required" }, 403);
      const { data: au } = await admin.from("admin_users").select("id").eq("auth_user_id", userData.user.id).maybeSingle();
      createdBy = au?.id || null;
    }

    // ── SCHEDULED DISPATCH: send all due scheduled campaigns ──
    if (isScheduledDispatch) {
      const { data: due } = await admin.from("push_campaigns")
        .select("*").eq("status", "scheduled").lte("scheduled_for", new Date().toISOString()).limit(50);
      let dispatched = 0;
      for (const camp of due || []) {
        await deliverCampaign(admin, {
          campaignId: camp.id, title: camp.title, message: camp.body, url: camp.url || "https://bundledmum.com",
          icon: camp.icon || "https://bundledmum.com/bm-pwa-192.png", image: camp.image || null,
          audience: camp.audience || "all", mode: "broadcast", targetEmail: null,
        });
        dispatched++;
      }
      return json({ success: true, dispatched }, 200);
    }

    // ── BUILD MESSAGE ──
    let title = body.title, message = body.body;
    let url = body.url || "https://bundledmum.com";
    let icon = body.icon || "https://bundledmum.com/bm-pwa-192.png";
    let image = body.image || null;
    let audience = body.audience || "all";
    let source = "broadcast";
    let targetEmail: string | null = null;

    if (mode === "trigger") {
      const triggerKey = body.trigger_key;
      if (!triggerKey) return json({ error: "trigger_key required" }, 400);
      const { data: trig } = await admin.from("push_triggers").select("*").eq("trigger_key", triggerKey).maybeSingle();
      if (!trig) return json({ error: "unknown trigger" }, 404);
      if (!trig.is_enabled) return json({ success: true, skipped: "trigger disabled" }, 200);
      source = triggerKey;
      targetEmail = (body.customer_email || "").trim().toLowerCase() || null;
      let firstName = "Mama";
      if (targetEmail) {
        const { data: cust } = await admin.from("customers").select("full_name").ilike("email", targetEmail).maybeSingle();
        firstName = firstNameOrMama(cust?.full_name);
      }
      const vars = { first_name: firstName, order_number: body.order_number || "", ...(body.vars || {}) };
      title = applyVars(trig.title_template, vars);
      message = applyVars(trig.body_template, vars);
      url = applyVars(trig.url_template || url, vars);
    }

    if (!title || !message) return json({ error: "title and body required" }, 400);

    // ── SCHEDULE (broadcast only): save as scheduled, do not send now ──
    if (mode === "broadcast" && body.scheduled_for) {
      const { data: camp, error: cErr } = await admin.from("push_campaigns").insert({
        title, body: message, url, icon, image, audience, source: "broadcast",
        status: "scheduled", scheduled_for: body.scheduled_for, created_by: createdBy,
        sent_count: 0, failed_count: 0,
      }).select("id").single();
      if (cErr) return json({ error: cErr.message }, 500);
      return json({ success: true, scheduled: true, campaign_id: camp.id, scheduled_for: body.scheduled_for }, 200);
    }

    // ── CREATE CAMPAIGN ROW (so we have campaign_id for tracking), then deliver now ──
    const { data: camp, error: cErr } = await admin.from("push_campaigns").insert({
      title, body: message, url, icon, image, audience, source, status: "sent",
      created_by: createdBy, sent_count: 0, failed_count: 0,
    }).select("id").single();
    if (cErr) return json({ error: cErr.message }, 500);

    const result = await deliverCampaign(admin, {
      campaignId: camp.id, title, message, url, icon, image, audience, mode, targetEmail,
    });

    return json({ success: true, campaign_id: camp.id, ...result }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
