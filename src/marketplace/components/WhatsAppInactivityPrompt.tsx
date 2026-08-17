import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMarketplaceWhatsAppNumber, waHref } from "../lib/whatsapp";
import { buildMessage, listingUrlFor, markContactedUs, hasContactedUs, type WhatsAppHelpContext } from "./WhatsAppHelpLink";

/**
 * The floating WhatsApp prompt from the Claude Design mobile marketplace
 * design system project, section 36a ("Inactivity prompt, surfacing the
 * WhatsApp link in 35a"). Surfaces the SAME quiet WhatsAppHelpLink already
 * in the page (never removed, never replaced) at the moment someone looks
 * like they're about to leave, rather than waiting for her to notice a
 * plain text link under the price.
 *
 * Reuses buildMessage()/listingUrlFor() from WhatsAppHelpLink.tsx directly
 * — the message sent is byte-identical to what the quiet link itself
 * sends, per the task's own "reuse, do not rebuild" instruction. Only the
 * card's headline/subtext are new UI copy (the design specifies these two
 * verbatim, see PROMPT_COPY below).
 */

const TIMINGS_MS: Record<WhatsAppHelpContext, { mobile: number; desktop: number }> = {
  // Sits inside the researched 8-50s workable range; mobile ~40% longer
  // than desktop (phone processing is slower); checkout pulled toward the
  // fast end since a buyer there already knows what she wants — payment
  // fires soonest of all, the single highest-anxiety moment.
  listing: { mobile: 20000, desktop: 12000 },
  checkoutDetails: { mobile: 12000, desktop: 8000 },
  checkoutPayment: { mobile: 10000, desktop: 8000 },
};

/** listing and checkoutPayment headlines are the design's own two example
 * screens, verbatim. checkoutDetails has no example screen in the design
 * (only two of the three moments were mocked up) — written here in the
 * same voice ("invite rather than name the fear") to match, not invented
 * from nothing: same sentence shape, same "we're right here" close as the
 * listing card. Flagged in the handoff as the one headline not given
 * directly by the design. */
const PROMPT_COPY: Record<WhatsAppHelpContext, { headline: string; sub: string }> = {
  listing: { headline: "Any questions before you buy?", sub: "We're right here on WhatsApp" },
  checkoutDetails: { headline: "Need a hand with your details?", sub: "We're right here on WhatsApp" },
  checkoutPayment: { headline: "Still deciding? We're here", sub: "Message us on WhatsApp any time" },
};

const SESSION_SHOWN_KEY = "bm-mkt-wa-prompt-shown";
function alreadyShownThisSession(): boolean {
  try { return sessionStorage.getItem(SESSION_SHOWN_KEY) === "1"; } catch { return false; }
}
function markShownThisSession(): void {
  try { sessionStorage.setItem(SESSION_SHOWN_KEY, "1"); } catch { /* best effort */ }
}

/** Sharp upward scroll, the mobile stand-in for exit intent — there is no
 * cursor to track. More than ~40% of viewport height, upward, inside one
 * second: the physical gesture of scrolling back toward the address bar
 * to leave, not ordinary reading. */
const SCROLL_UP_FRACTION = 0.4;
const SCROLL_UP_WINDOW_MS = 1000;

/**
 * This prompt vs. the PWA install banner (MarketplaceInstallBanner.tsx):
 * both float above the fixed Buy now bar at the same clearance and the
 * same z-index tier, and were observed genuinely overlapping when both
 * happened to be visible at once. Two prompts stacking on a phone reads
 * as broken at the exact moment someone is deciding whether to trust the
 * site with money — worse than either prompt alone.
 *
 * This prompt wins: it fires because someone is hesitating over an actual
 * purchase, a moment-specific signal. The install banner is a standing
 * convenience offer with no real urgency — it can simply wait and show
 * on a later visit. So the loser is SUPPRESSED while the winner shows,
 * not repositioned — stacking two prompts is the problem, not where they
 * sit. One-directional: the install banner subscribes to this and hides
 * itself; this prompt never needs to know the banner exists.
 *
 * A plain module-level pub/sub rather than React context, since the two
 * components share no parent in the tree (MarketplaceInstallBanner mounts
 * once in MarketplaceApp.tsx; this mounts per listing/checkout page) —
 * this is the smallest thing that lets an unrelated sibling react to a
 * state change without lifting state up through the whole app.
 */
type VisibilityListener = (visible: boolean) => void;
const visibilityListeners = new Set<VisibilityListener>();
let promptCurrentlyVisible = false;
function setPromptVisible(v: boolean): void {
  if (promptCurrentlyVisible === v) return;
  promptCurrentlyVisible = v;
  visibilityListeners.forEach((fn) => fn(v));
}
/** Subscribe to this prompt's risen/dismissed state. Calls fn once
 * immediately with the current value (so a subscriber mounting AFTER the
 * prompt has already risen still gets the right answer, not just future
 * changes), then again on every change. Returns the unsubscribe. */
export function subscribeToWaPromptVisible(fn: VisibilityListener): () => void {
  visibilityListeners.add(fn);
  fn(promptCurrentlyVisible);
  return () => visibilityListeners.delete(fn);
}

export default function WhatsAppInactivityPrompt({ context, listingId, itemName, price }: {
  context: WhatsAppHelpContext;
  listingId: string;
  itemName: string;
  price: string | null;
}) {
  const isMobile = useIsMobile();
  const number = useMarketplaceWhatsAppNumber();
  const [risen, setRisen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || alreadyShownThisSession() || hasContactedUs()) return;

    const timing = TIMINGS_MS[context];
    const ms = isMobile ? timing.mobile : timing.desktop;

    function fire() {
      if (firedRef.current) return;
      firedRef.current = true;
      markShownThisSession();
      setRisen(true);
    }

    let timer: ReturnType<typeof setTimeout>;
    function armTimer() {
      clearTimeout(timer);
      timer = setTimeout(fire, ms);
    }
    armTimer();

    // Sustained-inactivity reset: any real activity pushes the clock back
    // out, so this only fires after ms of genuine silence, never simply
    // "ms after the page loaded" regardless of what she's doing.
    const activityEvents: Array<keyof WindowEventMap> = isMobile
      ? ["scroll", "touchstart", "focusin"]
      : ["mousemove", "scroll", "keydown", "click"];
    activityEvents.forEach((ev) => window.addEventListener(ev, armTimer, { passive: true }));

    // Mobile: sharp upward scroll. Desktop: exit intent (cursor leaving
    // toward the top of the viewport). Genuinely different mechanisms —
    // there is no cursor on mobile to track leaving toward browser chrome.
    let cleanupSecondTrigger: () => void;
    if (isMobile) {
      let lastY = window.scrollY;
      let lastT = Date.now();
      const onScroll = () => {
        const y = window.scrollY;
        const t = Date.now();
        const dy = lastY - y; // positive = scrolled up
        const dt = t - lastT;
        if (dy > window.innerHeight * SCROLL_UP_FRACTION && dt < SCROLL_UP_WINDOW_MS) fire();
        lastY = y;
        lastT = t;
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      cleanupSecondTrigger = () => window.removeEventListener("scroll", onScroll);
    } else {
      const onMouseOut = (e: MouseEvent) => {
        if (!e.relatedTarget && e.clientY <= 0) fire();
      };
      document.addEventListener("mouseout", onMouseOut);
      cleanupSecondTrigger = () => document.removeEventListener("mouseout", onMouseOut);
    }

    return () => {
      clearTimeout(timer);
      activityEvents.forEach((ev) => window.removeEventListener(ev, armTimer));
      cleanupSecondTrigger();
    };
  }, [context, isMobile]);

  // Tell MarketplaceInstallBanner (or anything else that ever cares) exactly
  // when this is genuinely on screen — reset on unmount too, e.g. navigating
  // away from this page mid-prompt must not leave the banner suppressed
  // forever for a card that no longer exists.
  useEffect(() => {
    setPromptVisible(risen && !dismissed);
    return () => setPromptVisible(false);
  }, [risen, dismissed]);

  if (!risen || dismissed) return null;

  const message = buildMessage(context, itemName, price, listingUrlFor(listingId));
  const copy = PROMPT_COPY[context];

  return createPortal(
    <a
      className="mkt-wa-prompt"
      href={waHref(number, message)}
      target="_blank"
      rel="noreferrer"
      onClick={markContactedUs}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" className="ic">
        <path fill="#25D366" d="M12 0C5.373 0 0 5.373 0 12c0 2.116.552 4.103 1.518 5.828L0 24l6.335-1.482A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
        <path fill="#FFF" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.198.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.372-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      </svg>
      <span className="body">
        <span className="headline">{copy.headline}</span>
        <span className="sub">{copy.sub}</span>
      </span>
      <button
        type="button"
        className="close"
        aria-label="Dismiss"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDismissed(true); }}
      >
        ✕
      </button>
    </a>,
    document.body,
  );
}
