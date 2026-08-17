import { useMarketplaceWhatsAppNumber, waHref } from "../lib/whatsapp";

/**
 * Contextual WhatsApp help, per the Claude Design mobile marketplace design
 * system project, section 35a ("Contextual WhatsApp help, three moments").
 *
 * This messages BUNDLEDMUM, not the seller. It is deliberately NOT a button:
 * the design's own reasoning is that "a second button next to Buy now or Pay
 * reads as a second decision, exactly the competition the brief rules out."
 * So it is unstyled underlined text with only the WhatsApp glyph for colour,
 * sitting under the primary action rather than beside it — visually a
 * different kind of control from "Ask a question", which stays a bordered
 * chip-style button and goes to the SELLER, answered publicly on the listing.
 *
 * The glyph is inline SVG, exactly as the design specifies, so it renders
 * identically everywhere rather than depending on a device emoji or on
 * .mkt-wa's background-image asset.
 *
 * The number is never hardcoded: useMarketplaceWhatsAppNumber() reads
 * site_settings.whatsapp_number, and waHref() runs the message through
 * encodeURIComponent, which is what turns the real "\n" characters below
 * into %0A / %0A%0A in the final wa.me URL — so WhatsApp renders them as
 * genuine line and paragraph breaks, not literal text. Same construction
 * every other marketplace WhatsApp link already uses (see lib/whatsapp.ts,
 * and the bespoke-message precedent in NotFoundOrGoneScreen.tsx).
 */

export type WhatsAppHelpContext = "listing" | "checkoutDetails" | "checkoutPayment";

const LABELS: Record<WhatsAppHelpContext, string> = {
  listing: "Got questions about this item? Chat with us",
  checkoutDetails: "Got questions about this order? Chat with us",
  checkoutPayment: "Got questions about this order? Chat with us",
};

/**
 * The three moments are genuinely different worries, so the three messages
 * are genuinely different — never one generic line reused. Each is written
 * in the BUYER's voice so all she has to do is press send, and each carries
 * the item, the price she is looking at, and a link straight back to the
 * exact listing.
 *
 * `price` is already formatted (₦42,500). On the payment step it is the
 * TOTAL she is about to pay, not the item price — that is the number
 * causing the hesitation there. It is optional only for the brief moment
 * before Paystack has priced the order: rather than send a wrong or zero
 * figure, the amount clause is simply left out and the sentence still reads
 * naturally.
 */
function buildMessage(context: WhatsAppHelpContext, item: string, price: string | null, url: string): string {
  switch (context) {
    case "listing":
      return `Hi, I was looking at the ${item}${price ? ` (${price})` : ""}.\n${url}\n\nA couple of things I wanted to check before buying, is the seller genuine and are the photos accurate to the actual item?`;
    case "checkoutDetails":
      return `Hi, I'm filling in my details to buy the ${item}${price ? ` (${price})` : ""}.\n${url}\n\nQuick question before I continue, why do you need my phone number, and who actually sees it?`;
    case "checkoutPayment":
      return `Hi, I'm about to pay${price ? ` ${price}` : ""} for the ${item} but I'm a bit unsure.\n${url}\n\nIs it possible to pay on delivery instead, or can you explain how my money is protected if I pay now?`;
  }
}

/** Absolute link to the listing itself, built from the origin the buyer is
 * already on — same pattern CheckoutPage already uses for Paystack's
 * callback URL, so it is right on every environment without a constant. */
export function listingUrlFor(listingId: string): string {
  return `${window.location.origin}/marketplace/listing/${listingId}`;
}

export default function WhatsAppHelpLink({ context, listingId, itemName, price }: {
  context: WhatsAppHelpContext;
  listingId: string;
  itemName: string;
  /** Already formatted, e.g. formatNaira(...). Null only while a total is still being worked out. */
  price: string | null;
}) {
  const number = useMarketplaceWhatsAppNumber();
  const message = buildMessage(context, itemName, price, listingUrlFor(listingId));

  return (
    <a className="mkt-whatsapp-help" href={waHref(number, message)} target="_blank" rel="noreferrer">
      <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#25D366" d="M12 0C5.373 0 0 5.373 0 12c0 2.116.552 4.103 1.518 5.828L0 24l6.335-1.482A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
        <path fill="#FFF" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.198.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.372-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      </svg>
      <span className="txt">{LABELS[context]}</span>
    </a>
  );
}
