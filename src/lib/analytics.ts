import { supabase } from "@/integrations/supabase/client";

// ── Session ID ────────────────────────────────
function getSessionId(): string {
  let sid = sessionStorage.getItem("bm-session-id");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("bm-session-id", sid);
  }
  return sid;
}

// ── Session Context ───────────────────────────
// Must be called before any INSERT/UPDATE to sessions or page_views tables.
let sessionContextSet = false;

async function ensureSessionContext(): Promise<void> {
  if (sessionContextSet) return;
  const sid = getSessionId();
  try {
    await supabase.rpc("set_session_context", { p_session_id: sid });
    sessionContextSet = true;
  } catch (e) {
    console.error("Failed to set session context:", e);
  }
}

// ── UTM & Traffic Attribution ─────────────────
interface TrafficAttribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  landing_page: string | null;
  traffic_source: string;
  traffic_medium: string;
  channel_group: string;
}

function parseUserAgent() {
  const ua = navigator.userAgent;
  let device_type = "desktop";
  if (/Mobi|Android/i.test(ua)) device_type = "mobile";
  else if (/Tablet|iPad/i.test(ua)) device_type = "tablet";

  let browser = "other";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = "chrome";
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "safari";
  else if (/Firefox\//.test(ua)) browser = "firefox";
  else if (/Edg\//.test(ua)) browser = "edge";

  let os = "other";
  if (/Windows/.test(ua)) os = "windows";
  else if (/Mac OS/.test(ua)) os = "macos";
  else if (/Linux/.test(ua)) os = "linux";
  else if (/Android/.test(ua)) os = "android";
  else if (/iPhone|iPad/.test(ua)) os = "ios";

  return { device_type, browser, os, user_agent: ua };
}

function deriveTrafficSource(utmSource: string | null, referrer: string | null): string {
  if (utmSource) return utmSource;
  if (!referrer) return "direct";
  const r = referrer.toLowerCase();
  if (r.includes("google")) return "google";
  if (r.includes("facebook") || r.includes("instagram")) return "meta";
  if (r.includes("tiktok")) return "tiktok";
  if (r.includes("twitter") || r.includes("x.com")) return "twitter";
  return "referral";
}

function deriveTrafficMedium(utmMedium: string | null, utmSource: string | null, trafficSource: string): string {
  if (utmMedium) return utmMedium;
  if (utmSource) return "cpc";
  if (["google"].includes(trafficSource)) return "organic";
  if (["meta", "tiktok", "twitter"].includes(trafficSource)) return "social";
  if (trafficSource === "direct") return "(none)";
  return "referral";
}

function deriveChannelGroup(trafficSource: string, trafficMedium: string, utmMedium: string | null): string {
  const m = (utmMedium || trafficMedium).toLowerCase();
  if (m === "cpc" || m === "ppc" || m === "paid") {
    if (["meta", "tiktok", "twitter"].includes(trafficSource)) return "paid_social";
    return "paid_search";
  }
  if (m === "organic") return "organic_search";
  if (m === "social") return "social";
  if (m === "email") return "email";
  if (m === "sms") return "sms";
  if (m === "display" || m === "banner") return "display";
  if (m === "affiliate") return "affiliate";
  if (trafficSource.includes("whatsapp") || m === "whatsapp") return "whatsapp";
  if (trafficSource === "direct") return "direct";
  if (trafficSource === "referral") return "referral";
  return "other";
}

const ATTRIBUTION_KEY = "bm-traffic-attribution";

function captureAttribution(): TrafficAttribution {
  const existing = sessionStorage.getItem(ATTRIBUTION_KEY);
  if (existing) {
    try { return JSON.parse(existing); } catch {}
  }

  const params = new URLSearchParams(window.location.search);
  let utm_source = params.get("utm_source") || null;
  let utm_medium = params.get("utm_medium") || null;
  const utm_campaign = params.get("utm_campaign") || null;
  const utm_content = params.get("utm_content") || null;
  const utm_term = params.get("utm_term") || null;
  const referrer = document.referrer || null;
  const landing_page = window.location.pathname + window.location.search;

  // Google Ads clicks carry a click identifier (gclid / gad_source / gbraid /
  // wbraid) and usually NO utm_medium, so they were misclassified as Google
  // Organic. Normalize them to google/cpc (also an explicit google + cpc/ppc/
  // paid utm) so the DB classifier returns "Google Ads" (paid). Meta logic is
  // untouched — this only fires for Google Ads signals.
  const hasGoogleAdsClick = ["gclid", "gad_source", "gbraid", "wbraid"].some(k => !!params.get(k));
  const isGooglePaidUtm = utm_source?.toLowerCase() === "google"
    && ["cpc", "ppc", "paid"].includes((utm_medium || "").toLowerCase());
  if (hasGoogleAdsClick || isGooglePaidUtm) {
    utm_source = "google";
    utm_medium = "cpc";
  }

  const traffic_source = deriveTrafficSource(utm_source, referrer);
  const traffic_medium = deriveTrafficMedium(utm_medium, utm_source, traffic_source);
  const channel_group = deriveChannelGroup(traffic_source, traffic_medium, utm_medium);

  const attribution: TrafficAttribution = {
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    referrer, landing_page, traffic_source, traffic_medium, channel_group,
  };

  // First-of-session attribution, session-scoped only (never localStorage).
  sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));

  return attribution;
}

function getAttribution(): TrafficAttribution {
  try {
    const s = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return captureAttribution();
}

// ── Page View Counter ──────────────────────────
function incrementPageCount() {
  const key = "bm-page-count";
  const count = parseInt(sessionStorage.getItem(key) || "0", 10) + 1;
  sessionStorage.setItem(key, String(count));
  return count;
}

// ── Initialize Session ─────────────────────────
let sessionInitialized = false;

async function initSession() {
  if (sessionInitialized) return;
  sessionInitialized = true;

  // Set session context BEFORE any writes to sessions/page_views
  await ensureSessionContext();

  captureAttribution();
  const sid = getSessionId();
  const attribution = getAttribution();
  const ua = parseUserAgent();

  // Track session_start event
  trackEvent("session_start", {
    ...attribution,
    ...ua,
  });

  // Upsert session in sessions table (fire and forget)
  supabase.from("sessions" as any).upsert({
    session_id: sid,
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    page_count: 1,
    landing_page: attribution.landing_page,
    exit_page: window.location.pathname,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    utm_content: attribution.utm_content,
    utm_term: attribution.utm_term,
    traffic_source: attribution.traffic_source,
    traffic_medium: attribution.traffic_medium,
    referrer: attribution.referrer,
    device_type: ua.device_type,
    browser: ua.browser,
    os: ua.os,
    is_bounce: true,
    converted: false,
  } as any, { onConflict: "session_id" } as any).then(() => {});
}

// ── Track Event ────────────────────────────────
function trackEvent(eventType: string, eventData?: Record<string, unknown>) {
  const attribution = getAttribution();
  const ua = parseUserAgent();

  const payload = {
    event_type: eventType,
    session_id: getSessionId(),
    page_url: window.location.pathname,
    referral_source: attribution.utm_source || attribution.traffic_source,
    event_data: (eventData || null) as any,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    utm_content: attribution.utm_content,
    utm_term: attribution.utm_term,
    traffic_source: attribution.traffic_source,
    traffic_medium: attribution.traffic_medium,
    referrer: attribution.referrer,
    device_type: ua.device_type,
    browser: ua.browser,
    os: ua.os,
    user_agent: ua.user_agent,
  };

  supabase.from("analytics_events").insert([payload]).then(({ error }) => {
    if (error) console.error("Analytics error:", error);
  });
}

// ── Track Page View ────────────────────────────
async function trackPageView() {
  await initSession();
  const pageCount = incrementPageCount();
  const sid = getSessionId();

  // Insert page_view
  supabase.from("page_views").insert({
    session_id: sid,
    page_url: window.location.pathname,
    page_title: document.title,
    referrer: document.referrer || null,
  }).then(() => {});

  // Update session exit_page and page_count, is_bounce
  supabase.from("sessions" as any).update({
    last_seen_at: new Date().toISOString(),
    exit_page: window.location.pathname,
    page_count: pageCount,
    is_bounce: pageCount <= 1,
  } as any).eq("session_id", sid).then(() => {});
}

// ── Mark Session Converted ─────────────────────
function markSessionConverted() {
  const sid = getSessionId();
  supabase.from("sessions" as any).update({ converted: true } as any).eq("session_id", sid).then(() => {});
}

// ── Referral Source (legacy compat) ────────────
function getReferralSource(): string | null {
  return getAttribution().utm_source || null;
}

export {
  getSessionId,
  getReferralSource,
  trackEvent,
  trackPageView,
  getAttribution,
  captureAttribution,
  markSessionConverted,
  initSession,
  parseUserAgent,
};
export type { TrafficAttribution };
