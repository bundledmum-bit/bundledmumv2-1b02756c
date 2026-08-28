import { supabase } from "@/integrations/supabase/client";
import { trackEvent, getSessionId, parseUserAgent } from "@/lib/analytics";
import { isStandalone, isIos } from "@/lib/pwa";

// VAPID public key — safe to embed in the frontend (it's the public half).
const VAPID_PUBLIC_KEY =
  "BBhWBod0khr1-HDFmLb8_U0Jig81tTtLGyHlLuQvO6OcOISHKsoErVWRw_eVfjHBF6P_oxUPBjzyBE60-3_ugfc";

export type PushStatus =
  | "unsupported" // browser can't do web push, or iOS Safari not installed as PWA
  | "denied" // user blocked notifications
  | "granted-subscribed" // permission granted and a push subscription exists
  | "needs-signin" // supported, but we do not know who this is yet
  | "default"; // supported, not yet decided

/** Convert a base64url VAPID key to the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** True when the Push API + service workers + Notifications are all available. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * iOS only delivers web push when the site is installed to the home screen as a
 * PWA — in Safari (not standalone) the APIs may be missing or non-functional.
 * Treat that as unsupported so the UI can show an "install the app first" hint.
 */
export function isIosNeedsInstall(): boolean {
  return isIos() && !isStandalone();
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    // The SW is registered on load by initPwa; ready resolves once active.
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Current push status for the storefront UI. */
export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported() || isIosNeedsInstall()) return "unsupported";
  const perm = Notification.permission;
  if (perm === "denied") return "denied";
  if (perm === "granted") {
    const reg = await getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? "granted-subscribed" : "default";
  }
  return "default";
}

/**
 * Request permission, subscribe via the Push API, and persist the subscription
 * server-side (manage-push-subscription edge fn). Returns the resulting status.
 * Pass the logged-in customer's email so the row can be linked to them.
 */
export async function subscribeToPush(customerEmail?: string | null): Promise<PushStatus> {
  if (!isPushSupported() || isIosNeedsInstall()) return "unsupported";

  // WITHOUT AN EMAIL THERE IS NO SUBSCRIPTION. A row with customer_email
  // null cannot be targeted by any trigger, so it is not a subscriber, it
  // is a permission burned for nothing: 22 of 28 rows were in exactly that
  // state, and a browser only ever answers this question once. Refusing
  // here is what stops the 23rd.
  const email = (customerEmail || "").trim();
  if (!email) return "needs-signin";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return permission === "denied" ? "denied" : "default";
  }

  const reg = await getRegistration();
  if (!reg) return "unsupported";

  // Reuse an existing subscription if present, else create one.
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  }

  const ua = parseUserAgent();
  await supabase.functions.invoke("manage-push-subscription", {
    body: {
      action: "subscribe",
      subscription: subscription.toJSON(),
      customer_email: email,
      session_id: getSessionId(),
      device_type: ua.device_type,
      browser: ua.browser,
      os: ua.os,
      user_agent: ua.user_agent,
    },
  });

  trackEvent("push_subscribed", { os: ua.os, browser: ua.browser });
  return "granted-subscribed";
}

/**
 * Attach an email to a subscription this browser already has.
 *
 * The one route by which an existing email-less row becomes reachable: the
 * edge function upserts on `endpoint`, so re-sending the same subscription
 * with an email fills it in rather than creating a second row. Called when
 * someone signs in, which is the moment we first learn who a browser
 * belongs to.
 *
 * Deliberately silent and side effect free otherwise: it never asks for
 * permission, never subscribes, and does nothing at all unless permission
 * is already granted and a subscription already exists.
 */
export async function syncPushEmail(customerEmail?: string | null): Promise<boolean> {
  const email = (customerEmail || "").trim();
  if (!email) return false;
  if (!isPushSupported() || isIosNeedsInstall()) return false;
  if (Notification.permission !== "granted") return false;

  try {
    const reg = await getRegistration();
    const subscription = reg ? await reg.pushManager.getSubscription() : null;
    if (!subscription) return false;

    const ua = parseUserAgent();
    await supabase.functions.invoke("manage-push-subscription", {
      body: {
        action: "subscribe",
        subscription: subscription.toJSON(),
        customer_email: email,
        session_id: getSessionId(),
        device_type: ua.device_type,
        browser: ua.browser,
        os: ua.os,
        user_agent: ua.user_agent,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Unsubscribe locally and tell the backend to deactivate the row. */
export async function unsubscribeFromPush(): Promise<PushStatus> {
  const reg = await getRegistration();
  const subscription = reg ? await reg.pushManager.getSubscription() : null;
  if (subscription) {
    const endpoint = subscription.endpoint;
    try {
      await subscription.unsubscribe();
    } catch {
      /* ignore — still deactivate server-side below */
    }
    await supabase.functions.invoke("manage-push-subscription", {
      body: { action: "unsubscribe", endpoint },
    });
    trackEvent("push_unsubscribed", {});
  }
  return isIosNeedsInstall() || !isPushSupported() ? "unsupported" : "default";
}
