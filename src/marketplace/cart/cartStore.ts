/**
 * Cart contents live in the browser only (localStorage), never server side —
 * guests buy without accounts, so there is nothing to attach a server-side
 * cart to until checkout itself. Follows the same `bm-mkt-` prefixed,
 * best-effort try/catch convention as installState.ts.
 *
 * Only listing IDs are stored. Everything else (title, price, seller,
 * availability) is re-fetched from summarise_cart every time the cart is
 * shown, so a stale price or a since-sold item is never trusted from here.
 */

const CART_KEY = "bm-mkt-cart";
const MAX_ITEMS = 20; // matches create-marketplace-cart-order's own server-side cap

// Same-tab listeners (e.g. a header badge) can subscribe to this to react
// immediately — localStorage's own "storage" event only fires in OTHER tabs.
const CART_EVENT = "bm-mkt-cart-change";

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event(CART_EVENT));
  } catch { /* best-effort */ }
}

export function getCartListingIds(): string[] {
  return readIds();
}

export function getCartCount(): number {
  return readIds().length;
}

export function isInCart(listingId: string): boolean {
  return readIds().includes(listingId);
}

export type AddToCartResult = { ok: true; count: number } | { ok: false; reason: "already_in_cart" | "limit" };

export function addToCart(listingId: string): AddToCartResult {
  const ids = readIds();
  if (ids.includes(listingId)) return { ok: false, reason: "already_in_cart" };
  if (ids.length >= MAX_ITEMS) return { ok: false, reason: "limit" };
  const next = [...ids, listingId];
  writeIds(next);
  return { ok: true, count: next.length };
}

export function removeFromCart(listingId: string): void {
  writeIds(readIds().filter((id) => id !== listingId));
}

export function clearCart(): void {
  writeIds([]);
}

export function onCartChange(handler: () => void): () => void {
  window.addEventListener(CART_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CART_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
