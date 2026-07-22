import { track as pixelTrack, moneyPayload as pixelMoney } from "@/lib/metaPixel";
import { trackEvent } from "@/lib/analytics";

// Single source of truth for "the shopper started checkout". Fires the Meta
// Pixel InitiateCheckout and our internal analytics_events 'checkout_started'
// TOGETHER, so Meta's data and ours always agree, and fires from the
// PROCEED-TO-CHECKOUT ACTION at every entry point (cart, /package landing,
// /quote, hospital list, bundle) plus a fallback on the /checkout page load
// for direct visits.
//
// De-duplicated per browser session via one sessionStorage flag, so a single
// logical checkout initiation produces exactly ONE InitiateCheckout and ONE
// checkout_started no matter how many entry points or /checkout mounts it
// passes through (this preserves the prior once-per-session semantics).
const GUARD_KEY = "bm_checkout_initiated_fired";

export interface CheckoutInitiatedInput {
  /** Cart / order total in whole naira. */
  value: number;
  /** Number of items proceeding to checkout. */
  numItems: number;
  /** Product ids in the checkout, when available in the caller's scope. */
  contentIds?: Array<string | number>;
}

export function trackCheckoutInitiated(input: CheckoutInitiatedInput): void {
  // Dedupe: fire only for the first initiation of the session. If storage is
  // blocked (private mode), fall through and still fire once from this call.
  try {
    if (typeof window !== "undefined" && window.sessionStorage.getItem(GUARD_KEY)) return;
    window.sessionStorage.setItem(GUARD_KEY, "1");
  } catch {
    /* private-browsing / quota: no cross-call dedupe, still fire below */
  }

  const value = Math.round(Number(input.value) || 0);
  const numItems = Math.max(0, Math.round(Number(input.numItems) || 0));
  const contentIds = (input.contentIds || []).filter(Boolean);

  // Meta Pixel InitiateCheckout with value + currency NGN (via moneyPayload),
  // plus num_items and content_ids when we have them.
  pixelTrack(
    "InitiateCheckout",
    pixelMoney(value, {
      num_items: numItems,
      ...(contentIds.length ? { content_ids: contentIds } : {}),
    }),
  );

  // Internal funnel event the marketing dashboards read. Same place, same
  // moment as the pixel so the two datasets stay consistent.
  trackEvent("checkout_started", { item_count: numItems, subtotal: value });
}
