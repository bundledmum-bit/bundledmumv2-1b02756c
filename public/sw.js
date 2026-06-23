/*
 * BundledMum service worker — minimal, for installability (not full offline).
 *
 * It pre-caches the app shell entry so the PWA opens when offline, and serves
 * navigations from network-first (falling back to the cached shell). Static
 * assets are passthrough. Bump CACHE_VERSION to invalidate old caches.
 */
const CACHE_VERSION = "bm-pwa-v2";
const SHELL = ["/", "/index.html"];

// Supabase project (anon key is public — same as the web app embeds).
const SUPABASE_URL = "https://rbtyprmkolqfylcbmgrk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJidHlwcm1rb2xxZnlsY2JtZ3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0NzA4NzYsImV4cCI6MjA5MTA0Njg3Nn0.ndpLfN1umOmf7xzxcjYeI8syqJzhZ1pX3KylzYy_wxA";

// Report a push delivery/click to the track-push-event edge function so the
// admin history can show delivered/opened counts.
async function trackPushEvent(campaignId, eventType) {
  if (!campaignId) return;
  try {
    const sub = await self.registration.pushManager.getSubscription();
    await fetch(`${SUPABASE_URL}/functions/v1/track-push-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        endpoint: sub ? sub.endpoint : null,
        event_type: eventType,
      }),
    });
  } catch (e) {
    /* best-effort — never block the notification */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Web push ────────────────────────────────────────────────────────────────
// Render a notification from the payload sent by the send-push edge function.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: "BundledMum", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "BundledMum";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/bm-pwa-192.png",
    badge: "/bm-pwa-192.png",
    data: { url: payload.url || "/", campaign_id: payload.campaign_id || null },
    tag: payload.tag || undefined,
  };
  // Large hero image (Android/desktop) when the campaign carries one.
  if (payload.image) options.image = payload.image;
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      await trackPushEvent(payload.campaign_id, "delivered");
    })()
  );
});

// Focus an existing tab on the target URL, or open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || "/";
  event.waitUntil(
    (async () => {
      // Record the open before navigating.
      await trackPushEvent(data.campaign_id, "clicked");
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        // Reuse a same-origin tab if one is open.
        if ("focus" in client) {
          try {
            client.navigate(url);
            return client.focus();
          } catch (e) {
            return client.focus();
          }
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle GET; let everything else (POST analytics inserts, etc.) pass.
  if (req.method !== "GET") return;

  // Navigations: network-first, fall back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  // Other GETs: passthrough, but cache successful same-origin responses lazily.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
