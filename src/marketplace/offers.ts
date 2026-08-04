import { cdb } from "./checkout/orders";
import { sdb } from "./sell/sellData";

/**
 * Make-an-offer data layer (design 23a). THE MONEY RULE, strictly enforced
 * by which columns each SELECT names: a buyer sees only buyer_discount_naira
 * / buyer_price_naira / counter_buyer_price_naira; a seller sees only
 * seller_amount_naira / counter_seller_amount_naira. Neither query ever
 * names the other side's column, even though RLS (row ownership) would
 * technically allow it — mirrors the same pattern already used for
 * BUYER_ORDER_SELECT / SELLER_ORDER_SELECT. All writes go through the three
 * RPCs below; there is no direct insert/update policy on marketplace_offers
 * for a buyer or seller.
 *
 * status = 'lapsed' is never written by anything server side (checked every
 * function body) — an expired-but-still-'pending' row is only blocked from
 * further action by seller_respond_to_offer's own expires_at check, nothing
 * sweeps its status column. isLapsed() below computes this the same way the
 * return flow's overdue detection does: client side, from expires_at, never
 * trusting status alone.
 */

// ─── Settings, admin editable, never hardcoded ─────────────────────────────

export async function getOffersEnabled(): Promise<boolean> {
  const { data } = await cdb.from("site_settings").select("value").eq("key", "marketplace_offers_enabled").maybeSingle();
  return (data as { value?: unknown } | null)?.value === true;
}

export async function getMaxDiscountPercent(): Promise<number> {
  const { data } = await cdb.from("site_settings").select("value").eq("key", "marketplace_max_discount_percent").maybeSingle();
  const n = Number((data as { value?: unknown } | null)?.value);
  return isFinite(n) && n > 0 ? n : 10;
}

export async function getOfferExpiryHours(): Promise<number> {
  const { data } = await cdb.from("site_settings").select("value").eq("key", "marketplace_offer_expiry_hours").maybeSingle();
  const n = Number((data as { value?: unknown } | null)?.value);
  return isFinite(n) && n > 0 ? n : 48;
}

/** True once an offer's window has passed, regardless of what its stored
 * status column says — see the module note above. */
export function isLapsed(offer: { status: string; expires_at: string }): boolean {
  return offer.status === "pending" && new Date(offer.expires_at).getTime() < Date.now();
}

// ─── Buyer side ─────────────────────────────────────────────────────────────

export interface BuyerOffer {
  id: string;
  listing_id: string;
  status: string;
  buyer_discount_naira: number;
  buyer_price_naira: number;
  counter_buyer_price_naira: number | null;
  expires_at: string;
  responded_at: string | null;
}

const BUYER_OFFER_SELECT = "id, listing_id, status, buyer_discount_naira, buyer_price_naira, counter_buyer_price_naira, expires_at, responded_at";

/** The buyer's own offer on this listing, if they have made one. At most
 * one ever exists per (listing_id, buyer_id), enforced by a DB unique
 * constraint — this is genuinely their one and only offer here. */
export async function fetchBuyerOfferForListing(listingId: string): Promise<BuyerOffer | null> {
  const { data, error } = await cdb.from("marketplace_offers")
    .select(BUYER_OFFER_SELECT)
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as BuyerOffer) ?? null;
}

export async function fetchBuyerOffer(offerId: string): Promise<BuyerOffer | null> {
  const { data, error } = await cdb.from("marketplace_offers").select(BUYER_OFFER_SELECT).eq("id", offerId).maybeSingle();
  if (error) return null;
  return (data as unknown as BuyerOffer) ?? null;
}

/**
 * Makes an offer. Returns the new offer id on success. The five specific
 * rejections the database can raise are mapped to human copy; anything else
 * is logged and shown generically, never raw.
 */
export async function buyerMakeOffer(listingId: string, discountNaira: number): Promise<{ ok: true; offerId: string } | { ok: false; message: string }> {
  const { data, error } = await cdb.rpc("buyer_make_offer", { p_listing_id: listingId, p_discount_naira: Math.round(discountNaira) });
  if (error) {
    const raw = String((error as { message?: string }).message || "");
    let message = "We could not send your offer. Please refresh and try again.";
    if (/not available right now/i.test(raw)) message = "Offers are not available on this item right now.";
    else if (/no longer available/i.test(raw)) message = "This item is no longer available.";
    else if (/already made an offer/i.test(raw)) message = "You have already made an offer on this item.";
    else if (/more than you can ask off/i.test(raw)) message = "That is more than you can ask off this item.";
    else if (/enter how much/i.test(raw)) message = "Enter how much you would like off.";
    else console.error("[marketplace] buyer_make_offer:", error);
    return { ok: false, message };
  }
  return { ok: true, offerId: data as string };
}

/** Accepts or declines a seller's counter. Returns false (never a raw
 * error) when the offer was not in a respondable state. */
export async function buyerRespondToCounter(offerId: string, accept: boolean): Promise<boolean> {
  const { data, error } = await cdb.rpc("buyer_respond_to_counter", { p_offer_id: offerId, p_accept: accept });
  if (error) return false;
  return data === true;
}

// ─── Seller side ────────────────────────────────────────────────────────────

export interface SellerOffer {
  id: string;
  listing_id: string;
  status: string;
  seller_amount_naira: number;
  counter_seller_amount_naira: number | null;
  expires_at: string;
  responded_at: string | null;
}

const SELLER_OFFER_SELECT = "id, listing_id, status, seller_amount_naira, counter_seller_amount_naira, expires_at, responded_at";

export async function fetchSellerOffer(offerId: string): Promise<SellerOffer | null> {
  const { data, error } = await sdb.from("marketplace_offers").select(SELLER_OFFER_SELECT).eq("id", offerId).maybeSingle();
  if (error) return null;
  return (data as unknown as SellerOffer) ?? null;
}

export interface SellerOfferRow extends SellerOffer {
  listing?: { title: string | null; image_url: string | null } | null;
}

/** Offers on this seller's listings that still need their attention:
 * pending (never answered) or an expired-but-unswept pending row. Countered
 * ones are the buyer's move, not shown here. */
export async function fetchSellerOffersNeedingAttention(sellerId: string): Promise<SellerOfferRow[]> {
  const { data, error } = await sdb.from("marketplace_offers")
    .select(`${SELLER_OFFER_SELECT}, listing:marketplace_listings(title, image_url)`)
    .eq("seller_id", sellerId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as SellerOfferRow[];
}

/**
 * Accept, decline, or counter. Countering sends the SELLER'S OWN number,
 * what they would accept — the buyer price is derived server side, this
 * never asks for or sends a buyer-facing figure. The three specific
 * rejections are mapped to human copy.
 */
export async function sellerRespondToOffer(
  offerId: string,
  action: "accept" | "decline" | "counter",
  counterSellerAmount?: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await sdb.rpc("seller_respond_to_offer", {
    p_offer_id: offerId,
    p_action: action,
    p_counter_seller_amount: action === "counter" && counterSellerAmount ? Math.round(counterSellerAmount) : null,
  });
  if (error) {
    const raw = String((error as { message?: string }).message || "");
    let message = "We could not save this. Please refresh and try again.";
    if (/no longer open/i.test(raw)) message = "This offer is no longer open.";
    else if (/no longer available/i.test(raw)) message = "This item is no longer available.";
    else if (/more than they offered/i.test(raw)) message = "Your counter must be more than they offered.";
    else if (/less than your asking price/i.test(raw)) message = "Your counter must be less than your asking price.";
    else console.error("[marketplace] seller_respond_to_offer:", error);
    return { ok: false, message };
  }
  if (data !== true) return { ok: false, message: "This could not be saved. Refresh and check the offer is still open." };
  return { ok: true };
}
