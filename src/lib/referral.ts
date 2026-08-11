// Marketplace partner referral — client-side capture and persistence.
//
// A partner (marketplace seller or first-time buyer) shares a link like
// bundledmum.com/quiz?ref=AMARAFCA. When their referred customer later places
// their FIRST storefront order, the partner earns and the customer picks a free
// mum gift. Attribution is matched server-side by visitor id AND email within a
// 30-day window, so both must SURVIVE ACROSS SESSIONS — these keys live in
// localStorage, never sessionStorage.
//
//   bm_visitor_id — stable per-browser uuid, generated once and reused
//   bm_ref_code   — the captured / validated partner referral code
//   bm_ref_gift   — the customer's chosen free-gift product_id
//
// NOTE: there is no DB column yet to store the chosen gift against an order, so
// bm_ref_gift is currently the ONLY record of the selection (see handoff.md).
// Pattern mirrors src/lib/landingOrigin.ts (safe wrappers + makeUuid).

const VISITOR_KEY = "bm_visitor_id";
const CODE_KEY = "bm_ref_code";
const GIFT_KEY = "bm_ref_gift";

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode / quota — ignore */ }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function makeUuid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Uppercase + trim a referral code. Codes are stored and compared uppercased. */
export function normalizeCode(raw: string | null | undefined): string {
  return (raw || "").trim().toUpperCase();
}

/** Stable per-browser visitor id. Reused if already present, else created. */
export function getVisitorId(): string {
  let id = safeGet(VISITOR_KEY);
  if (!id) {
    id = makeUuid();
    safeSet(VISITOR_KEY, id);
  }
  return id;
}

export function getRefCode(): string | null {
  const code = safeGet(CODE_KEY);
  return code ? code : null;
}
export function setRefCode(code: string): void {
  const c = normalizeCode(code);
  if (c) safeSet(CODE_KEY, c);
}
export function clearRefCode(): void {
  safeRemove(CODE_KEY);
}

export function getSelectedGift(): string | null {
  return safeGet(GIFT_KEY);
}
export function setSelectedGift(productId: string): void {
  if (productId) safeSet(GIFT_KEY, productId);
}
export function clearSelectedGift(): void {
  safeRemove(GIFT_KEY);
}
