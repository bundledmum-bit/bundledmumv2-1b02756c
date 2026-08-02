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
 * Full-page navigation to the marketplace login, carrying the intended
 * destination. Full nav (not react-router) so it works from any gate, including
 * those firing in effects before the router is ready, and mirrors how the gates
 * behaved before (they used window.location.assign to the storefront login).
 */
export function sendToMarketplaceLogin(returnToRelative: string): void {
  const rt = safeReturnTo(returnToRelative);
  window.location.assign(`${MARKETPLACE_LOGIN_URL}?returnTo=${encodeURIComponent(rt)}`);
}
