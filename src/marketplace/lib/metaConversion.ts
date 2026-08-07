import { mdb } from "../data/mdb";

interface MarketplaceConversionEvent {
  event_name: "ViewContent" | "InitiateCheckout";
  event_id: string;
  event_source_url: string;
  content_id?: string;
  content_name?: string;
  value?: number;
  email?: string;
  phone?: string;
}

/**
 * Fire and forget call to the send-meta-conversion-event edge function, which
 * itself no-ops cleanly (HTTP 200, { skipped }) when the master switch is off
 * or Meta config is missing — safe to call unconditionally. Never awaited by
 * callers, never throws, never surfaces to the visitor: a failed or slow
 * tracking call must not be visible in any way.
 */
export function sendMarketplaceConversionEvent(event: MarketplaceConversionEvent): void {
  mdb.functions.invoke("send-meta-conversion-event", { body: event }).catch(() => {
    /* tracking is best-effort only */
  });
}
