// Shared WhatsApp helpers — single source of truth for the customer
// number and the bundle pre-fill message. Used by both
// /bundles/maternity-list-standard (BundleDetailPage) and the
// /products/maternity-bundle-* pages (ProductPage).
//
// Keep this file dependency-free so it can be imported from any page
// or component without dragging in React-Query / Supabase.

export const WHATSAPP_BASE = "https://wa.me/2347040667424";

export interface WhatsAppBundleItem {
  name: string;
  brand?: string | null;
}

export interface BuildBundleMessageArgs {
  // The customer-facing title (e.g. "Maternity + Baby Items Bundle"
  // or "Maternity + Baby Items Bundle - ₦200k").
  title: string;
  // Optional tier label ("Standard"). Renders the
  // "{tier} tier — ₦X,XXX" subline when present; falls back to
  // "Total: ₦X,XXX" when empty. Pass "" for products whose title
  // already encodes the tier (e.g. the maternity-bundle-* slugs).
  tier?: string;
  currentItems: WhatsAppBundleItem[];
  currentTotalPrice: number;
}

export function buildBundleWhatsAppMessage(args: BuildBundleMessageArgs): string {
  const { title, tier, currentItems, currentTotalPrice } = args;
  const lines: string[] = [];
  lines.push("Hi BundledMum, I'd like to order this bundle:");
  lines.push("");
  lines.push(`*${title}*`);
  if (tier && tier.trim()) {
    lines.push(`${tier} tier — ₦${currentTotalPrice.toLocaleString()}`);
  } else {
    lines.push(`Total: ₦${currentTotalPrice.toLocaleString()}`);
  }
  lines.push("");
  lines.push(`Items (${currentItems.length}):`);
  currentItems.forEach((it) => {
    const brand = (it.brand || "").trim();
    lines.push(brand ? `• ${it.name} (${brand})` : `• ${it.name}`);
  });
  lines.push("");
  lines.push("Please let me know next steps.");
  return lines.join("\n");
}

export function buildWhatsAppOrderHref(args: BuildBundleMessageArgs): string {
  return `${WHATSAPP_BASE}?text=${encodeURIComponent(buildBundleWhatsAppMessage(args))}`;
}

/**
 * wa.me link for a single product order (PDP + product quick-view). Number is
 * digits-only — the passed whatsappNumber (e.g. site_settings.whatsapp_number)
 * wins, else the sitewide WHATSAPP_BASE fallback. Message carries the product
 * name (+ optional variant), formatted price, and the canonical product URL.
 */
export function buildProductOrderWhatsAppHref(opts: {
  name: string;
  priceLabel: string; // pre-formatted, e.g. "₦1,234"
  url: string;
  variant?: string | null;
  whatsappNumber?: string | null;
}): string {
  const digits = opts.whatsappNumber && String(opts.whatsappNumber).trim()
    ? String(opts.whatsappNumber).replace(/[^\d]/g, "")
    : WHATSAPP_BASE.replace(/[^\d]/g, "");
  const namePart = opts.variant && opts.variant.trim() ? `${opts.name} (${opts.variant.trim()})` : opts.name;
  const message = `Hi BundledMum, I'd like to order this product: ${namePart} (${opts.priceLabel}). ${opts.url}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
