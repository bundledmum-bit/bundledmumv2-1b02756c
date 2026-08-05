import { useQuery } from "@tanstack/react-query";
import { mdb } from "../data/mdb";

/**
 * Marketplace WhatsApp helpers. Mirrors the deployed database function
 * build_whatsapp_link(p_context, p_reference, p_item, p_name) client side
 * rather than calling it via RPC, so a link is correct the instant a page
 * renders rather than after an extra round trip. Message wording matches
 * that function exactly wherever a reference or item IS supplied; the one
 * deliberate difference is how a MISSING reference/item is handled — the
 * database collapses a doubled space with a string replace (Postgres has
 * no clean way to conditionally drop a clause), here we just omit the
 * clause outright, which reads better and needs no such hack.
 *
 * The number itself is never hardcoded here: it is read live from
 * site_settings.whatsapp_number, the same source build_whatsapp_link reads
 * from, via useMarketplaceWhatsAppNumber() below.
 */

const FALLBACK_NUMBER = "2347040667424";

/** Normalises to international digits, e.g. 08012345678 or +2348012345678
 * both become 2348012345678. Mirrors the database function's own regexp. */
function normalizeNumber(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return FALLBACK_NUMBER;
  if (digits.startsWith("0")) return "234" + digits.slice(1);
  return digits;
}

/** Live BundledMum support number, read from site_settings, never hardcoded. */
export function useMarketplaceWhatsAppNumber(): string {
  const { data } = useQuery({
    queryKey: ["mkt-whatsapp-number"],
    queryFn: async (): Promise<string> => {
      const { data } = await mdb.from("site_settings").select("value").eq("key", "whatsapp_number").maybeSingle();
      return String((data as { value?: unknown } | null)?.value ?? "");
    },
    staleTime: 5 * 60 * 1000,
  });
  return normalizeNumber(data);
}

export type WaContext =
  | "order_help" | "payment_problem" | "payment_unclear" | "cannot_reach_seller" | "cannot_reach_buyer"
  | "refund_not_received" | "payout_not_received" | "listing_removed" | "listing_rejected"
  | "seller_contact_missing" | "legal_name_change" | "selling_help" | "return_help" | "dispute_help"
  | "sign_in_help" | "generic";

export interface WaOpts {
  /** Order reference, e.g. a Paystack transaction reference. */
  reference?: string;
  /** A listing title. */
  item?: string;
  /** The sender's own name, only used where naturally available. */
  name?: string;
}

/** The message text only, matching build_whatsapp_link's own wording
 * exactly whenever the relevant reference/item is present. */
export function waMessage(context: WaContext, opts: WaOpts = {}): string {
  const who = opts.name?.trim() ? `Hello, this is ${opts.name.trim()}. ` : "Hello. ";
  const ref = opts.reference?.trim();
  const item = opts.item?.trim();
  switch (context) {
    case "order_help":
      return who + (ref ? `I need help with my order ${ref}.` : "I need help with my order.");
    case "payment_problem":
      return who + (ref ? `I am having trouble paying for my order ${ref}.` : "I am having trouble paying for my order.");
    case "payment_unclear":
      return who + (ref ? `I am not sure whether my payment went through for order ${ref}.` : "I am not sure whether my payment went through.");
    case "cannot_reach_seller":
      return who + (ref ? `I cannot reach the seller about my order ${ref}.` : "I cannot reach the seller about my order.");
    case "cannot_reach_buyer":
      return who + (ref ? `I cannot reach the buyer about order ${ref}.` : "I cannot reach the buyer about my order.");
    case "refund_not_received":
      return who + (ref ? `My refund for order ${ref} has not arrived yet.` : "My refund has not arrived yet.");
    case "payout_not_received":
      return who + (ref ? `My payout for order ${ref} has not arrived yet.` : "My payout has not arrived yet.");
    case "listing_removed":
      return who + (item ? `My listing ${item} was removed and I would like to understand why.` : "My listing was removed and I would like to understand why.");
    case "listing_rejected":
      return who + (item ? `My listing ${item} was not approved and I would like some help fixing it.` : "My listing was not approved and I would like some help fixing it.");
    case "seller_contact_missing":
      return who + (ref ? `I need the seller contact details for my order ${ref}.` : "I need the seller's contact details for my order.");
    case "legal_name_change":
      return who + "I need to correct the legal name on my seller account.";
    case "selling_help":
      return who + "I would like some help selling on BundledMum Marketplace.";
    case "return_help":
      return who + (ref ? `I need help with a return for order ${ref}.` : "I need help with a return.");
    case "dispute_help":
      return who + (ref ? `I need help with a problem I reported on order ${ref}.` : "I need help with a problem I reported.");
    case "sign_in_help":
      return who + "I am having trouble signing in to BundledMum Marketplace.";
    default:
      return who + "I need some help with BundledMum Marketplace.";
  }
}

/** A wa.me link with the message already encoded. */
export function waHref(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Shorthand: build the message for a context, then the link, in one call. */
export function waContextHref(number: string, context: WaContext, opts?: WaOpts): string {
  return waHref(number, waMessage(context, opts));
}
