import { trackEvent, recordPwaSession } from "@/lib/analytics";

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

/** Chrome on iOS (CriOS) — same iOS "Add to Home Screen" system action as
 * Safari since iOS 16.4, but reached through Chrome's own Share icon next to
 * its address bar rather than Safari's toolbar. See InstallSequence.tsx. */
export function isIosChrome(): boolean {
  if (!isIos()) return false;
  return /CriOS/.test(navigator.userAgent || "");
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
 *
 * Goes through record_pwa_session, NOT the generic analytics insert, and
 * only through it — one path, never both — so every launch carries the
 * stable device id. Without that, session_id changes every visit and the
 * session count cannot tell twenty regular users from two hundred one-time
 * ones. The RPC resolves customer_id from the session itself, so a signed
 * in person is attributed without the client sending anything identifying.
 */
export function trackPwaSession(): void {
  if (!isStandalone()) return;
  try {
    if (sessionStorage.getItem(SESSION_LOGGED_KEY)) return;
    sessionStorage.setItem(SESSION_LOGGED_KEY, "1");
  } catch {
    /* if storage is unavailable, fall through and log once for this load */
  }
  recordPwaSession("standalone");
}

/** Log pwa_installed when the app is installed (Android / desktop Chrome). */
// Remembered across tabs/visits on this browser profile (the only cross-tab
// signal we have — standalone mode only proves install while running in-app).
export const PWA_INSTALLED_KEY = "bm_pwa_installed";

/** True if a previous appinstalled event was recorded on this browser profile. */
export function isPwaInstalledFlag(): boolean {
  try {
    return localStorage.getItem(PWA_INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Best-effort: ask the browser whether a related installed app exists
 * (Chromium-only API; absent on iOS/older browsers). Resolves quickly; never
 * throws. Returns false when unsupported or on error.
 */
export async function hasRelatedInstalledApp(): Promise<boolean> {
  try {
    const nav = navigator as any;
    if (typeof nav.getInstalledRelatedApps !== "function") return false;
    const apps = await nav.getInstalledRelatedApps();
    return Array.isArray(apps) && apps.length > 0;
  } catch {
    return false;
  }
}

export function listenForAppInstalled(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("appinstalled", () => {
    // This listener is registered once at app boot (initPwa() in main.tsx),
    // regardless of route, so it also fires for a MARKETPLACE install — its
    // own separate PWA (see MarketplaceInstallBanner.tsx), not this one.
    const onMarketplace = window.location.pathname.startsWith("/marketplace");

    // COUNT every install, on either surface. This sits ABOVE the guard on
    // purpose. The guard below is about the storefront's localStorage flag,
    // not about analytics, and having one line cover both meant the
    // marketplace recorded no installs at all: 907 install prompts there in
    // 30 days against the storefront's 415, and not one install captured
    // since the guard shipped on 12 August. `surface` keeps the two apart.
    trackEvent("pwa_installed", {
      source: "appinstalled",
      surface: onMarketplace ? "marketplace" : "storefront",
    });

    // The §60 guard, unchanged in effect: writing PWA_INSTALLED_KEY for a
    // MARKETPLACE install would wrongly hide the STOREFRONT's own banner
    // forever on that device, for an install that never happened. The
    // marketplace keeps its own flag (marketplace/lib/installState.ts).
    if (onMarketplace) return;
    // Remember the install so later normal-tab visits suppress the prompts.
    try { localStorage.setItem(PWA_INSTALLED_KEY, "1"); } catch { /* ignore */ }
  });
}

// ── Global install-prompt store ────────────────────────────────────────────
// beforeinstallprompt fires ONCE, early, before most UI mounts. We capture it
// at startup into a module-level store so any control mounted later (footer
// button, /install page, banner) can read the SAME stashed event and trigger
// the native prompt. Components subscribe; the snapshot is the deferred event.

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

const AVAIL_LOGGED_KEY = "bm-pwa-available-logged";
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let captureInitialised = false;
const installListeners = new Set<() => void>();

function emitInstallChange() {
  installListeners.forEach((cb) => cb());
}

/** Capture beforeinstallprompt once (logs pwa_install_available once/session). */
export function initInstallCapture(): void {
  if (typeof window === "undefined" || captureInitialised) return;
  captureInitialised = true;

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault(); // suppress Chrome's default mini-infobar; we present our own
    deferredPrompt = e as BeforeInstallPromptEvent;
    try {
      if (!sessionStorage.getItem(AVAIL_LOGGED_KEY)) {
        sessionStorage.setItem(AVAIL_LOGGED_KEY, "1");
        trackEvent("pwa_install_available", { display_mode: "browser" });
      }
    } catch {
      trackEvent("pwa_install_available", { display_mode: "browser" });
    }
    emitInstallChange();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emitInstallChange();
  });
}

/** Subscribe to install-availability changes (for useSyncExternalStore). */
export function subscribeInstall(cb: () => void): () => void {
  installListeners.add(cb);
  return () => installListeners.delete(cb);
}

/** Current stashed beforeinstallprompt event (or null if not available). */
export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/**
 * Fire the native install prompt. Returns the user's choice, or "unavailable"
 * when no prompt is stashed (e.g. iOS, or already installed). pwa_installed is
 * logged separately by listenForAppInstalled on the appinstalled event.
 */
export async function fireInstallPrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  const evt = deferredPrompt;
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    deferredPrompt = null; // a prompt can only be used once
    emitInstallChange();
    return choice.outcome;
  } catch {
    deferredPrompt = null;
    emitInstallChange();
    return "dismissed";
  }
}

/** One-shot init: register SW, count standalone sessions, watch for install. */
export function initPwa(): void {
  registerServiceWorker();
  trackPwaSession();
  listenForAppInstalled();
  initInstallCapture();
}
