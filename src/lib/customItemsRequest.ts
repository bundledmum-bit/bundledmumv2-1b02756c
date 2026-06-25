// Carries the hospital-list "other items you'd like (not listed)" free text
// from /hospital-list to checkout. It's an UNPRICED note — it must never touch
// any total; checkout only forwards it onto the order as custom_items_request.
const KEY = "bm-hl-custom-items";

export function getCustomItemsRequest(): string {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setCustomItemsRequest(value: string): void {
  try {
    if (value && value.trim()) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function clearCustomItemsRequest(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Split into trimmed non-empty lines (one requested item per line). */
export function customItemsLines(value: string): string[] {
  return value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
