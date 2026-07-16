// Shared "add to cart" tracking for flows that populate the cart via setCart()
// instead of the central addToCart() in cart.tsx (the quote page and the landing
// /package page). Fires BOTH the Meta pixel AddToCart and the GA add_to_cart with
// the same aggregated payload shape the central addToCart uses: content_ids /
// items from the cart lines, value = the subtotal being added, currency NGN,
// integer naira. Non-blocking: the underlying helpers already swallow errors.

import { track as pixelTrack, moneyPayload as pixelMoney } from "@/lib/metaPixel";
import { trackEcommerce } from "@/lib/ga";
import type { CartItem } from "@/lib/cart";

/**
 * Fire AddToCart (pixel) + add_to_cart (GA) for a batch of cart lines that were
 * just loaded into the cart. Aggregates the whole batch into one event (value =
 * sum of price * qty). Call once per real add-to-cart action.
 */
export function trackCartItemsAdded(cartItems: CartItem[]): void {
  const lines = (cartItems || []).filter((i) => i && i.id != null);
  if (lines.length === 0) return;

  const value = lines.reduce((s, i) => s + (Number(i.price) || 0) * Math.max(1, Number(i.qty) || 1), 0); // integer naira

  // Meta pixel AddToCart (mirrors cart.tsx shape, aggregated across the batch).
  pixelTrack(
    "AddToCart",
    pixelMoney(value, {
      content_type: "product",
      content_ids: lines.map((i) => String(i.id)),
      num_items: lines.reduce((s, i) => s + Math.max(1, Number(i.qty) || 1), 0),
      contents: lines.map((i) => ({ id: String(i.id), quantity: Math.max(1, Number(i.qty) || 1) })),
    }),
  );

  // GA4 add_to_cart (mirrors cart.tsx item shape).
  trackEcommerce("add_to_cart", {
    currency: "NGN",
    value,
    items: lines.map((i) => ({
      item_id: String(i.id),
      item_name: i.name,
      item_brand: i.selectedBrand?.label ?? "",
      item_variant: i.selectedBrand?.sku ?? i.selectedSize ?? "",
      price: Number(i.price) || 0,
      quantity: Math.max(1, Number(i.qty) || 1),
    })),
  });
}
