import { trackEvent } from "@/lib/analytics";

// ── PWA helpers ────────────────────────────────────────────────────────────
// Installability + analytics for the customer site. Events reuse trackEvent so
// the existing analytics insert auto-fills os/browser/device_type/session_id —
// the admin PWA card splits installs by os, so this must go through that path.

const SESSION_LOGGED_KEY = "bm-pwa-session-logged";

/** True when the page is running as an installed PWA (any platform incl iOS). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      (window.navigator as any).standalone === true
    );
  } catch {
    return false;
  }
}

/** iOS (iPhone/iPad, incl iPadOS reporting as Mac with touch). */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
}

/** iOS Safari proper (excludes Chrome/Firefox/Edge in-app on iOS, which can't A2HS). */
export function isIosSafari(): boolean {
  if (!isIos()) return false;
  const ua = navigator.userAgent || "";
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
}

/** Register the minimal service worker. Non-blocking — never delays render. */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  // Defer to load so SW registration never competes with first paint.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* installability is best-effort; ignore registration errors */
    });
  });
}

/**
 * Log exactly ONE pwa_session per browser session when launched standalone.
 * This is how iOS installs are counted (Apple fires no appinstalled event).
 */
export function trackPwaSession(): void {
  if (!isStandalone()) return;
  try {
    if (sessionStorage.getItem(SESSION_LOGGED_KEY)) return;
    sessionStorage.setItem(SESSION_LOGGED_KEY, "1");
  } catch {
    /* if storage is unavailable, fall through and log once for this load */
  }
  trackEvent("pwa_session", { display_mode: "standalone", os_hint: isIos() ? "ios" : "other" });
}

/** Log pwa_installed when the app is installed (Android / desktop Chrome). */
export function listenForAppInstalled(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("appinstalled", () => {
    trackEvent("pwa_installed", { source: "appinstalled" });
  });
}

/** One-shot init: register SW, count standalone sessions, watch for install. */
export function initPwa(): void {
  registerServiceWorker();
  trackPwaSession();
  listenForAppInstalled();
}
