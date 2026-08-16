import { mdb } from "../data/mdb";

interface MarketplaceConversionEvent {
  event_name: "ViewContent" | "AddToCart" | "InitiateCheckout" | "AddPaymentInfo";
  event_id: string;
  event_source_url: string;
  content_id?: string;
  content_name?: string;
  value?: number;
  email?: string;
  phone?: string;
}

/** Reads a single cookie by name, e.g. Meta Pixel's own `_fbp`/`_fbc` — set
 * by the Pixel script already running on the marketplace, not by us. Never
 * throws: an absent cookie (a visitor whose Pixel hasn't set one yet) or a
 * document.cookie access failure both simply return undefined. */
function readCookie(name: string): string | undefined {
  try {
    if (typeof document === "undefined") return undefined;
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fire and forget call to the send-meta-conversion-event edge function, which
 * itself no-ops cleanly (HTTP 200, { skipped }) whenever an event carries no
 * way to match it to a person — including an anonymous visitor with neither
 * a signed-in identity nor a Meta Pixel cookie yet — so this is safe to call
 * unconditionally. The whole body is wrapped in try/catch, not just the
 * invoke() promise: a synchronous failure before that promise even exists
 * (cookie reading, argument setup) must be caught too, not only a rejected
 * network call, since callers never wrap this in their own try/catch. Never
 * awaited by callers, never throws, never surfaces to the visitor: a failed
 * or slow tracking call must not be visible in any way.
 */
export function sendMarketplaceConversionEvent(event: MarketplaceConversionEvent): void {
  try {
    const body: MarketplaceConversionEvent & { fbp?: string; fbc?: string } = { ...event };
    const fbp = readCookie("_fbp");
    const fbc = readCookie("_fbc");
    if (fbp) body.fbp = fbp;
    if (fbc) body.fbc = fbc;
    mdb.functions.invoke("send-meta-conversion-event", { body }).catch(() => {
      /* tracking is best-effort only */
    });
  } catch {
    /* tracking is best-effort only, must never be visible to the visitor */
  }
}
