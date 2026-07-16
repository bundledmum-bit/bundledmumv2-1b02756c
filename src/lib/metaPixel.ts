/**
 * Meta Pixel helper — thin, type-safe wrapper around the global `fbq`
 * function injected by the base code in index.html. Every call is
 * guarded so ad-blockers, SSR, or a blocked network never break the
 * app. No PII in any params — ids, counts, and amounts only.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

type StandardEvent =
  | "PageView"
  | "ViewContent"
  | "Search"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "Subscribe"
  | "StartTrial"
  | "Schedule"
  | "CustomizeProduct"
  | "Lead"
  | "CompleteRegistration"
  | "Contact";

function safeFbq(...args: unknown[]): void {
  try {
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq(...args);
    }
  } catch {
    /* ad-blocker or SSR — silently ignore */
  }
}

export function track(event: StandardEvent, params?: Record<string, unknown>): void {
  if (params) safeFbq("track", event, params);
  else safeFbq("track", event);
}

export function trackCustom(name: string, params?: Record<string, unknown>): void {
  if (params) safeFbq("trackCustom", name, params);
  else safeFbq("trackCustom", name);
}

/**
 * Fire an event only once for a given key. Guards against double-counting
 * moments-of-truth (Purchase, Subscribe, CompleteRegistration) when the user
 * refreshes or back-navigates. By default the guard is per browser session
 * (sessionStorage). Pass `{ persistent: true }` to dedup across sessions
 * (localStorage), so a moment like Purchase fires at most once per key EVER
 * (e.g. reopening the confirmation page in a new session cannot re-fire it).
 */
const FIRE_ONCE_NAMESPACE = "bm_meta_pixel_fired_";
export function trackOnce(
  storageKey: string,
  event: StandardEvent,
  params?: Record<string, unknown>,
  opts?: { persistent?: boolean },
): void {
  try {
    if (typeof window === "undefined") return;
    const store = opts?.persistent ? window.localStorage : window.sessionStorage;
    const k = FIRE_ONCE_NAMESPACE + storageKey;
    if (store.getItem(k)) return;
    store.setItem(k, "1");
  } catch {
    /* private-browsing or quota — still fire, just without idempotency */
  }
  track(event, params);
}

/** Convenience: naira money payload with the defaults Meta expects. */
export function moneyPayload(valueNaira: number, extra: Record<string, unknown> = {}) {
  return { value: Math.round(Number(valueNaira) || 0), currency: "NGN", ...extra };
}
