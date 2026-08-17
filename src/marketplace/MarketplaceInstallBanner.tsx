import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isStandalone, isIos } from "@/lib/pwa";
import { subscribeToWaPromptVisible } from "./components/WhatsAppInactivityPrompt";

/**
 * Marketplace-scoped "install the app" banner, matching the storefront's own
 * PwaInstallBanner.tsx in shape (dismissible card, Android/desktop gets the
 * real prompt, iOS gets a Home Screen hint) but deliberately NOT sharing its
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
 *     device, not just for the usual dismissal window.
 *  3. bm-mkt-pwa-dismissed (localStorage, 14-day expiry) — a tap on the ✕.
 *     Dismissing isn't installing, so it gets a shorter, resettable record.
 *
 * iOS has no beforeinstallprompt/appinstalled at all, so signal 2 never
 * fires there — someone who installs on iOS and then opens Safari normally
 * (not the installed app) WILL see this banner again, since the only signal
 * left for them is isStandalone(), which is false in a normal Safari tab.
 * That's an honest, unavoidable gap on iOS, not something papered over.
 */

const INSTALLED_KEY = "bm-mkt-pwa-installed";
const DISMISSED_KEY = "bm-mkt-pwa-dismissed";
const DISMISS_DAYS = 14;
const SHOW_DELAY_MS = 20_000;

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function readInstalled(): boolean {
  try { return localStorage.getItem(INSTALLED_KEY) === "1"; } catch { return false; }
}

function readDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY) || "0");
    if (!at) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function MarketplaceInstallBanner() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [installed, setInstalled] = useState(readInstalled);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [ready, setReady] = useState(false); // past the arrival delay
  const [bpEvent, setBpEvent] = useState<BIPEvent | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The WhatsApp inactivity prompt (§36a/§85) wins when both would be
  // visible: it fires because someone is hesitating over an actual
  // purchase, a moment-specific signal, while this banner is a standing
  // convenience offer that can simply wait for a later visit. Suppressed
  // entirely while the other is showing, not repositioned — two prompts
  // stacking on a phone reads as broken, which is worse than either alone.
  const [waPromptVisible, setWaPromptVisible] = useState(false);
  useEffect(() => subscribeToWaPromptVisible(setWaPromptVisible), []);

  // Someone arriving from an ad hasn't decided they care yet — wait until
  // they've actually spent a bit of time browsing before asking, rather than
  // greeting them with an install pitch on their very first paint (the
  // storefront's own banner has no such delay; that's not right here).
  useEffect(() => {
    timerRef.current = setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setBpEvent(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setBpEvent(null);
      try {
        localStorage.setItem(INSTALLED_KEY, "1");
        localStorage.removeItem(DISMISSED_KEY); // a real install supersedes any prior dismissal
      } catch { /* best-effort */ }
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

  if (installed || dismissed || !ready || onInstallPage || isStandalone() || waPromptVisible) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* best-effort */ }
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
        <img src="/bm-mkt-pwa-192.png" alt="" className="mkt-install-banner-icon" />
        <div className="mkt-install-banner-copy">
          <p className="mkt-install-banner-title">Install the BundledMum Marketplace App</p>
          <p className="mkt-install-banner-body">
            {isIos()
              ? "Add it to your home screen to buy and sell faster, no browser tab needed."
              : "Get to browsing and listing faster, right from your home screen."}
          </p>
        </div>
        <button type="button" onClick={install} className="mkt-install-banner-cta">
          Install app
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="mkt-install-banner-close">
          ×
        </button>
      </div>
    </div>
  );
}
