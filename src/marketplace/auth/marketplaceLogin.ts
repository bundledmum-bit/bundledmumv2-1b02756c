/**
 * Single source of truth for sending a marketplace visitor to the marketplace
 * login. Every auth gate in the marketplace tree uses this so nobody is handed
 * off to the storefront login again.
 *
 * returnTo is a marketplace-RELATIVE path (no /marketplace prefix), because the
 * login page forwards with react-router navigate() under basename="/marketplace".
 * A full path like /marketplace/checkout/x would double-prefix to
 * /marketplace/marketplace/checkout/x.
 */
export const MARKETPLACE_LOGIN_URL = "/marketplace/login";

/** Marketplace-relative path guard: must be a single-leading-slash path. */
export function safeReturnTo(returnTo: string | null | undefined): string {
  const rt = String(returnTo || "");
  // Reject empty, protocol-relative (//host) and absolute URLs (http://...).
  if (!rt.startsWith("/") || rt.startsWith("//")) return "/";
  return rt;
}

/**
 * Every reason a gate can send someone to login for. Deliberately a closed
 * union (not a bare string) so a new gate MUST pick one of these, or add a
 * new one here with its own copy, rather than silently landing on the
 * generic fallback. Grouped the same way the gates naturally group:
 * offer (negotiate/view an offer), sell (become a seller, seller setup,
 * list an item), seller (dashboard, orders, payouts, dispatch, price edit),
 * orders (my orders, order detail), dispute (report a problem), return
 * (send an item back), payment (bank-transfer confirmation).
 */
export type LoginReason = "offer" | "sell" | "seller" | "orders" | "dispute" | "return" | "payment";

/**
 * The copy for each reason, always leading with what the person was doing,
 * not the word "login", and always honest that this is an emailed link, not
 * a password. Never implies buying needs an account, guest checkout stays
 * gate-free (see CheckoutPage.tsx) and no reason here describes buying.
 */
export const LOGIN_REASON_COPY: Record<LoginReason, { lead: string; sub: string }> = {
  offer: {
    lead: "To ask for a lower price, we need your email",
    sub: "The seller needs to know who's asking, and we'll send you their answer. We'll email you a link, no password to set.",
  },
  sell: {
    lead: "To start selling, we need your email",
    sub: "This becomes your seller account, so buyers and your payouts can find you. We'll email you a link, no password to remember.",
  },
  seller: {
    lead: "To open your seller dashboard, we need your email",
    sub: "This keeps your listings, orders and payouts private to you. We'll email you a link, no password needed.",
  },
  orders: {
    lead: "To see your orders, we need your email",
    sub: "This is how we know which orders are yours, so nobody else can see them. We'll email you a link, no password to remember.",
  },
  dispute: {
    lead: "To report a problem, we need your email",
    sub: "This ties your report to your order, so our team can look into it and get back to you. We'll email you a link, no password needed.",
  },
  return: {
    lead: "To send this back, we need your email",
    sub: "This confirms it's really your order, so your refund goes to the right person. We'll email you a link, no password to set.",
  },
  payment: {
    lead: "To check on your transfer, we need your email",
    sub: "This is how we match your payment to your order. We'll email you a link, no password needed.",
  },
};

/**
 * Full-page navigation to the marketplace login, carrying the intended
 * destination and, optionally, why. Full nav (not react-router) so it works
 * from any gate, including those firing in effects before the router is
 * ready, and mirrors how the gates behaved before (they used
 * window.location.assign to the storefront login).
 */
export function sendToMarketplaceLogin(returnToRelative: string, reason?: LoginReason): void {
  const rt = safeReturnTo(returnToRelative);
  const params = new URLSearchParams({ returnTo: rt });
  if (reason) params.set("reason", reason);
  window.location.assign(`${MARKETPLACE_LOGIN_URL}?${params.toString()}`);
}
