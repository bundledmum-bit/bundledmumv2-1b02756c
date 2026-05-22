/**
 * Self-contained shareable cart URLs. The full cart is packed into the URL
 * as URL-safe base64 JSON so no server storage, no DB row, no login.
 *
 * Payload shape (short keys to keep URLs compact):
 *   [{ p: productId, b: brandId|null, s: size|null, c: color|null, q: qty }]
 *
 * Validation:
 *   - product/brand ids must look like UUIDs
 *   - quantity is clamped to 1..99
 *   - max 50 items per shared link
 *   - empty / malformed → decode returns null so callers can show a graceful
 *     "shared cart no longer available" toast.
 */

export interface SharedCartItem {
  product_id: string;
  brand_id: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCartToUrl(items: SharedCartItem[], origin?: string): string {
  const payload = items
    .filter(i => !!i.product_id)
    .slice(0, 50)
    .map(i => ({
      p: i.product_id,
      b: i.brand_id ?? null,
      s: i.size ?? null,
      c: i.color ?? null,
      q: Math.max(1, Math.min(99, Math.floor(i.quantity || 1))),
    }));
  const json = JSON.stringify(payload);
  // URL-safe base64 (RFC 4648 §5): + → -, / → _, drop = padding.
  const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "https://bundledmum.com");
  return `${base}/cart?items=${b64}`;
}

/**
 * Pretty WhatsApp message body for a cart share. Filters out the generic
 * brand label so the line reads cleanly, hides empty size/color, and
 * comma-separates Naira totals. The cart URL gets appended at the end.
 */
export function buildWhatsappMessage(
  items: Array<{
    product_name: string;
    brand_label?: string | null;
    size?: string | null;
    color?: string | null;
    quantity: number;
    unit_price: number;
  }>,
  cartUrl: string,
): string {
  const lines: string[] = ["Hi! Here's my BundledMum cart:", ""];
  let subtotal = 0;
  items.forEach((it, i) => {
    subtotal += (it.unit_price || 0) * (it.quantity || 1);
    const brand = it.brand_label && !/^generic$/i.test(it.brand_label) ? `${it.brand_label} ` : "";
    const extras: string[] = [];
    if (it.size) extras.push(`Size: ${it.size}`);
    if (it.color) extras.push(it.color);
    const extra = extras.length ? ` (${extras.join(", ")})` : "";
    lines.push(`${i + 1}. ${brand}${it.product_name}${extra} - Qty ${it.quantity} - ₦${Number(it.unit_price).toLocaleString("en-NG")} each`);
  });
  lines.push("");
  lines.push(`Products subtotal: ₦${subtotal.toLocaleString("en-NG")}`);
  lines.push("");
  lines.push(`View on website: ${cartUrl}`);
  lines.push("");
  lines.push("— Sent from BundledMum");
  return lines.join("\n");
}

export function decodeCartFromUrl(b64: string): SharedCartItem[] | null {
  try {
    const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return null;
    if (arr.length === 0 || arr.length > 50) return arr.length === 0 ? [] : null;
    const out: SharedCartItem[] = [];
    for (const x of arr) {
      if (!x || typeof x !== "object") continue;
      if (typeof x.p !== "string" || !UUID_RE.test(x.p)) continue;
      const brandId = typeof x.b === "string" && UUID_RE.test(x.b) ? x.b : null;
      const qty = Math.max(1, Math.min(99, parseInt(x.q, 10) || 1));
      out.push({
        product_id: x.p,
        brand_id: brandId,
        size: typeof x.s === "string" ? x.s : null,
        color: typeof x.c === "string" ? x.c : null,
        quantity: qty,
      });
    }
    return out;
  } catch {
    return null;
  }
}
