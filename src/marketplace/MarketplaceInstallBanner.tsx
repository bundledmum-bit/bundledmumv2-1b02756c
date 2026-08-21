import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isStandalone, isIos } from "@/lib/pwa";
import { subscribeToWaPromptVisible } from "./components/WhatsAppInactivityPrompt";
import { subscribeToInstallCtaVisible } from "./components/MarketplaceInstallCta";
import {
  isMarketplacePwaInstalled,
  markMarketplacePwaInstalled,
  isMarketplacePwaBannerDismissed,
  dismissMarketplacePwaBanner,
} from "./lib/installState";

/**
 * Marketplace-scoped "install the app" banner: a prominent bottom sheet,
 * not the storefront's thinner card (design deliberately different, see the
 * intrusive-interstitial note below for why prominence has real limits
 * here). Android/desktop gets the real browser prompt, iOS gets a Home
 * Screen hint — but deliberately NOT sharing the storefront's own
 * install-capture state or "installed" flag. Two reasons:
 *
 * 1. The storefront's beforeinstallprompt capture (lib/pwa.ts) is a single
 *    module-level singleton, registered at app boot. If someone lands on the
 *    storefront first and then client-side-navigates into /marketplace
 *    (App.tsx swaps trees without a full reload), that stashed event was
 *    captured while the STOREFRONT's manifest was the active one — firing it
 *    here would install the storefront app under marketplace-branded copy.
 *    So this banner runs its own beforeinstallprompt/appinstalled listeners,
 *    scoped to whatever's true at the moment they fire while THIS component
 *    is mounted (i.e. while on a marketplace route).
 * 2. The storefront's "already installed" flag (bm_pwa_installed) is one
 *    shared localStorage key for the whole origin — installing the
 *    marketplace app would wrongly suppress the storefront's own banner
 *    forever on that device, and vice versa. This banner keeps its own key.
 *
 * Signal priority (device, never account):
 *  1. isStandalone() — running inside an installed app right now. No storage.
 *  2. bm-mkt-pwa-installed (localStorage, no expiry) — set only on a genuine
 *     `appinstalled` event, and only when it fires while on a marketplace
 *     route. A confirmed install, so it's remembered permanently on this
 *     device, not just for the usual dismissal window. Shared with
 *     MarketplaceInstallCta.tsx via lib/installState.ts, so an install
 *     confirmed from either surface suppresses the other too.
 *  3. bm-mkt-pwa-dismissed (localStorage, 14-day expiry) — a tap on the ✕.
 *     Dismissing isn't installing, so it gets a shorter, resettable record.
 *
 * iOS has no beforeinstallprompt/appinstalled at all, so signal 2 never
 * fires there — someone who installs on iOS and then opens Safari normally
 * (not the installed app) WILL see this banner again, since the only signal
 * left for them is isStandalone(), which is false in a normal Safari tab.
 * That's an honest, unavoidable gap on iOS, not something papered over.
 *
 * Google's intrusive-interstitial penalty was built specifically for app
 * install popups, but explicitly exempts prompts that (a) fire only after
 * genuine engagement — 10s or 30% scroll here — and (b) cover under 30% of
 * the viewport with an easy, visible close. This banner is built to that
 * exemption on purpose, not as an afterthought: never on first paint, never
 * full screen, always dismissible with one visible tap.
 */

const SHOW_DELAY_MS = 10_000;
const SCROLL_TRIGGER_FRACTION = 0.3;

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function MarketplaceInstallBanner() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [installed, setInstalled] = useState(isMarketplacePwaInstalled);
  const [dismissed, setDismissed] = useState(isMarketplacePwaBannerDismissed);
  const [ready, setReady] = useState(false); // past the engagement threshold
  const [bpEvent, setBpEvent] = useState<BIPEvent | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The WhatsApp inactivity prompt (§36a/§85) wins when both would be
  // visible: it fires because someone is hesitating over an actual
  // purchase, a moment-specific signal, while this banner is a standing
  // convenience offer that can simply wait for a later visit. Suppressed
  // entirely while the other is showing, not repositioned — two prompts
  // stacking on a phone reads as broken, which is worse than either alone.
  //
  // This is genuinely order-independent, not just "one-directional" in a
  // way that only happens to work when the WA prompt fires first: the
  // subscription is a LIVE callback (subscribeToWaPromptVisible calls fn
  // immediately with the current value AND on every future change), so if
  // this banner is already showing when the WA prompt later rises, that
  // rise itself notifies this component and forces it to re-render and
  // hide — there's no snapshot to go stale. Verified live on
  // /listing/:id with the banner's new 10s-or-30%-scroll trigger (earlier
  // than the WA prompt's own 10-20s window on many pages, so this
  // reversed ordering is the common case now, not an edge case): the
  // banner appears first, then disappears the instant the WA prompt
  // rises — confirmed via getBoundingClientRect, never both in the DOM
  // at once (§112).
  const [waPromptVisible, setWaPromptVisible] = useState(false);
  useEffect(() => subscribeToWaPromptVisible(setWaPromptVisible), []);

  // Same principle for the dedicated install CTA on the listing-success and
  // order-confirmation screens (MarketplaceInstallCta.tsx) — that's a
  // higher-intent, contextual offer earning its own moment, and this
  // standing banner can simply wait rather than doubling up on the same
  // page.
  const [installCtaVisible, setInstallCtaVisible] = useState(false);
  useEffect(() => subscribeToInstallCtaVisible(setInstallCtaVisible), []);

  // Genuine engagement, not a first-paint interstitial: whichever comes
  // first, 10 seconds on the page or scrolling 30% of the way down it.
  // Google's own intrusive-interstitial exemption requires exactly this —
  // a prompt "triggered after engagement" — so this isn't an arbitrary
  // delay, it's the actual condition the exemption is built on.
  useEffect(() => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setReady(true);
      window.removeEventListener("scroll", onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return; // page too short to measure scroll depth; the timer still covers it
      if (window.scrollY / max >= SCROLL_TRIGGER_FRACTION) settle();
    };
    timerRef.current = setTimeout(settle, SHOW_DELAY_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setBpEvent(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setBpEvent(null);
      markMarketplacePwaInstalled(); // also clears any prior dismissal — see installState.ts
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onListingDetail = pathname.startsWith("/listing/");
  const onInstallPage = pathname === "/install";

  if (installed || dismissed || !ready || onInstallPage || isStandalone() || waPromptVisible || installCtaVisible) return null;

  const dismiss = () => {
    setDismissed(true);
    dismissMarketplacePwaBanner();
  };

  const install = async () => {
    if (bpEvent) {
      await bpEvent.prompt();
      const choice = await bpEvent.userChoice;
      setBpEvent(null);
      if (choice.outcome === "accepted") return; // appinstalled fires separately
      return;
    }
    // iOS (no beforeinstallprompt) or the prompt isn't available yet — lead
    // to the instructions screen built for exactly this, rather than a
    // button that quietly does nothing.
    navigate("/install");
  };

  return (
    <div className={onListingDetail ? "mkt-install-banner clear-bar" : "mkt-install-banner"}>
      <div className="mkt-install-banner-inner">
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="mkt-install-banner-close">
          ×
        </button>
        <div className="mkt-install-banner-row">
          <img src="/bm-mkt-pwa-192.png" alt="" className="mkt-install-banner-icon" />
          <div className="mkt-install-banner-copy">
            <p className="mkt-install-banner-title">Get the BundledMum Marketplace app</p>
            <p className="mkt-install-banner-body">
              {isIos()
                ? "Add it to your home screen for faster browsing and buying, no browser tab needed."
                : "Install it for faster browsing and buying, right from your home screen."}
            </p>
          </div>
        </div>
        <button type="button" onClick={install} className="mkt-install-banner-cta">
          Install app
        </button>
      </div>
    </div>
  );
}
