/**
 * A visibility channel for a floating prompt, so prompts can yield to each
 * other and two never stack on a phone.
 *
 * The two original channels (WhatsAppInactivityPrompt, MarketplaceInstallCta)
 * hand-rolled this same shape. This is the shared version, used by the
 * channels added since, so the boilerplate is not copied a fourth time.
 *
 * PRECEDENCE, highest first. It is a strict total order on purpose: each
 * prompt yields only to strictly higher ones, which makes cycles
 * impossible.
 *
 *   1. SellerDeliveryGate   non-dismissible and blocking, must resolve first
 *   2. PendingActionPrompt  a real person is waiting on this person
 *   3. SellerVideoPrompt     their own listings would sell better
 *   4. WhatsAppInactivityPrompt  a hesitation nudge
 *   5. MarketplaceInstallBanner  a standing convenience offer
 *
 * Note this REVERSED one existing relationship: the delivery gate used to
 * yield to the WhatsApp prompt. Keeping that while adding
 * gate > pending > whatsapp would have formed a cycle
 * (gate -> whatsapp -> pending -> gate) and oscillated, so the gate is now
 * strictly highest, which is what the ordering above already implied.
 */

type VisibilityListener = (visible: boolean) => void;

export interface VisibilityChannel {
  /** Publish this prompt's current visibility. */
  set: (visible: boolean) => void;
  /** Calls fn immediately with the current value, then on every change, so
   * a subscriber mounting after the prompt has already risen still gets the
   * right answer rather than only future changes. Returns the unsubscribe. */
  subscribe: (fn: VisibilityListener) => () => void;
}

export function createVisibilityChannel(): VisibilityChannel {
  const listeners = new Set<VisibilityListener>();
  let visible = false;
  return {
    set(v: boolean) {
      if (visible === v) return;
      visible = v;
      listeners.forEach((fn) => fn(v));
    },
    subscribe(fn: VisibilityListener) {
      listeners.add(fn);
      fn(visible);
      return () => listeners.delete(fn);
    },
  };
}

/** The blocking delivery gate. Highest priority: nothing shows over it. */
export const deliveryGateChannel = createVisibilityChannel();
/** Someone is genuinely waiting on this person. Outranks the nudges. */
export const pendingActionChannel = createVisibilityChannel();
/** A seller's own listings would sell better with a video. Ranks BELOW the
 * pending action prompt, because someone waiting on a reply matters more
 * than a video that can wait, and above the two standing nudges. */
export const sellerVideoChannel = createVisibilityChannel();
