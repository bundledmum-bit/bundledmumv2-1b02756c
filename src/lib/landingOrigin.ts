// Landing-page origin tagging for the funnel-quote hook.
//
// When a visitor adds items to their cart from a /package/<slug> landing page,
// we stamp the cart's origin here so the checkout can later create a real quote
// in the funnel (source='landing_page') tagged with which landing page it came
// from. Nothing here writes to the database; it is purely local bookkeeping that
// the checkout reads.
//
// Design:
//  - A stable per-visitor session key persisted once in localStorage, reused for
//    the whole journey so repeated upserts update the SAME quote (the RPC is
//    idempotent on this key).
//  - An origin tag { landingPageId, sessionKey, productIds } stored alongside the
//    cart. `productIds` is the set of product ids the landing page put in the
//    cart, used to decide whether the current cart still reflects that origin so
//    a later, unrelated cart is never mislabeled as landing-sourced.

const SESSION_KEY_STORAGE = "bm-session-key";
const ORIGIN_STORAGE = "bm-landing-origin";

export interface LandingOrigin {
  landingPageId: string;
  sessionKey: string;
  productIds: string[];
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// A lightweight uuid — crypto.randomUUID when available, else a v4-ish fallback.
function makeUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* ignore */ }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Stable per-session key, generated once and reused for the whole journey. */
export function getSessionKey(): string {
  let key = safeGet(SESSION_KEY_STORAGE);
  if (!key) {
    key = makeUuid();
    safeSet(SESSION_KEY_STORAGE, key);
  }
  return key;
}

/**
 * Tag the cart as originating from a landing page. Called by the /package page
 * when its items are loaded into the cart. Reuses the existing stable session
 * key so the checkout upsert always targets one quote.
 */
export function setLandingOrigin(landingPageId: string, productIds: string[]): LandingOrigin {
  const origin: LandingOrigin = {
    landingPageId,
    sessionKey: getSessionKey(),
    productIds: [...new Set(productIds.filter(Boolean).map(String))],
  };
  safeSet(ORIGIN_STORAGE, JSON.stringify(origin));
  return origin;
}

export function getLandingOrigin(): LandingOrigin | null {
  const raw = safeGet(ORIGIN_STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.landingPageId === "string" && typeof parsed.sessionKey === "string") {
      return { landingPageId: parsed.landingPageId, sessionKey: parsed.sessionKey, productIds: Array.isArray(parsed.productIds) ? parsed.productIds.map(String) : [] };
    }
  } catch { /* ignore */ }
  return null;
}

export function clearLandingOrigin(): void {
  safeRemove(ORIGIN_STORAGE);
}

/**
 * Whether the given cart should be treated as landing-sourced. True only when an
 * origin tag exists AND the current cart still contains at least one of the
 * landing page's products, so a visitor who cleared the cart and built a totally
 * different, non-landing cart is never mislabeled. Editing quantities keeps the
 * origin; replacing the cart wholesale drops it.
 */
export function isCartLandingSourced(cart: Array<{ id: string | number }>): LandingOrigin | null {
  const origin = getLandingOrigin();
  if (!origin) return null;
  if (!Array.isArray(cart) || cart.length === 0) return null;
  // No recorded product ids (defensive) — fall back to trusting the tag while a
  // non-empty cart exists.
  if (origin.productIds.length === 0) return origin;
  const inCart = cart.some((i) => origin.productIds.includes(String(i.id)));
  return inCart ? origin : null;
}
