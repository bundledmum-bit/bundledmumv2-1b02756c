// Shared quote display helpers.
//
// A quote's delivery fee defaults to 0 in the DB and stays 0 until the
// customer provides an address (or an admin overrides it / bypasses the
// threshold). Showing "FREE" for that 0 reads as "delivery is waived",
// which is misleading — it simply hasn't been calculated yet.
//
// formatQuoteDeliveryFee mirrors the send-quote-email edge function so
// the email and the linked quote page show the same string.

export interface QuoteDeliveryInput {
  delivery_address?: string | null;
  delivery_fee_override?: number | null;
  estimated_delivery_fee: number;
  bypass_delivery_threshold?: boolean;
}

export const QUOTE_DELIVERY_TBD = "Calculated after your delivery details";

/**
 * Resolve the delivery-fee label for a quote.
 * - address given OR override set OR threshold bypassed → fee (or "FREE" if 0)
 * - otherwise → QUOTE_DELIVERY_TBD
 *
 * `format` is the caller's currency formatter (QuotePage uses `fmt`,
 * AdminQuotes uses `fmtN`) so each surface keeps its own styling.
 */
export function formatQuoteDeliveryFee(
  quote: QuoteDeliveryInput,
  format: (n: number) => string,
): string {
  const fee = quote.delivery_fee_override ?? quote.estimated_delivery_fee ?? 0;
  const hasAddress = !!(quote.delivery_address && quote.delivery_address.trim() !== "");
  const hasOverride =
    quote.delivery_fee_override !== null && quote.delivery_fee_override !== undefined;
  const isBypassed = quote.bypass_delivery_threshold === true;

  const canResolveFee = hasAddress || hasOverride || isBypassed;
  if (!canResolveFee) return QUOTE_DELIVERY_TBD;

  return fee === 0 ? "FREE" : format(fee);
}
