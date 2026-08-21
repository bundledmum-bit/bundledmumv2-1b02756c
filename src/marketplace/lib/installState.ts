/**
 * Marketplace-scoped "is the app installed on this device" / "was the
 * banner dismissed" state — kept entirely separate from the storefront's
 * own bm_pwa_installed flag in src/lib/pwa.ts. See
 * MarketplaceInstallBanner.tsx's own comment for why: installing one app
 * must never suppress the other's banner, since they're two different
 * PWAs sharing one origin.
 *
 * Shared by every marketplace surface that offers an install action — the
 * standing banner, and the dedicated CTAs on the listing-success and
 * order-confirmation screens — so they all read and write the exact same
 * device-local signal rather than each keeping (and risking drifting) its
 * own copy.
 */

const INSTALLED_KEY = "bm-mkt-pwa-installed";
const DISMISSED_KEY = "bm-mkt-pwa-dismissed";
const DISMISS_DAYS = 14;

export function isMarketplacePwaInstalled(): boolean {
  try { return localStorage.getItem(INSTALLED_KEY) === "1"; } catch { return false; }
}

/** Call on a genuine `appinstalled` event only. Also clears any prior
 * dismissal, since a real install supersedes it. */
export function markMarketplacePwaInstalled(): void {
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
    localStorage.removeItem(DISMISSED_KEY);
  } catch { /* best-effort */ }
}

export function isMarketplacePwaBannerDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY) || "0");
    if (!at) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function dismissMarketplacePwaBanner(): void {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* best-effort */ }
}
