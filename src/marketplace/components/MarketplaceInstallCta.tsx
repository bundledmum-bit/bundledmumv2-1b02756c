import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isStandalone } from "@/lib/pwa";
import { isMarketplacePwaInstalled, markMarketplacePwaInstalled } from "../lib/installState";

/**
 * A dedicated install offer for a page someone reached deliberately — the
 * listing-success screen (CreateListingPage.tsx) and the order-confirmation
 * screen (PaymentReturnPage.tsx). NOT the standing MarketplaceInstallBanner:
 * that's a recurring convenience offer respecting a 14-day dismissal; this
 * is a one-off, contextual moment that earns its own attention and doesn't
 * check the dismissal (it isn't the same nag repeating), only whether the
 * app is already installed or already running.
 *
 * Runs its own beforeinstallprompt/appinstalled capture, same reasoning as
 * MarketplaceInstallBanner.tsx's own (scoped to whatever's true while this
 * component is mounted on a marketplace route, never sharing state with the
 * storefront's global capture in lib/pwa.ts). Multiple independent
 * listeners each stashing their own reference to the same
 * beforeinstallprompt event is fine — the browser fires it to all of them.
 *
 * Publishes its own visibility (see subscribeToInstallCtaVisible) so the
 * standing banner can suppress itself while this is showing — the same
 * "two prompts never stack" principle already used between the banner and
 * the WhatsApp inactivity prompt.
 */

type VisibilityListener = (visible: boolean) => void;
const visibilityListeners = new Set<VisibilityListener>();
let ctaCurrentlyVisible = false;
function setCtaVisible(v: boolean): void {
  if (ctaCurrentlyVisible === v) return;
  ctaCurrentlyVisible = v;
  visibilityListeners.forEach((fn) => fn(v));
}
export function subscribeToInstallCtaVisible(fn: VisibilityListener): () => void {
  visibilityListeners.add(fn);
  fn(ctaCurrentlyVisible);
  return () => visibilityListeners.delete(fn);
}

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function MarketplaceInstallCta({ title, body }: { title: string; body: string }) {
  const navigate = useNavigate();
  const [installed, setInstalled] = useState(isMarketplacePwaInstalled);
  const [bpEvent, setBpEvent] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setBpEvent(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setBpEvent(null);
      markMarketplacePwaInstalled();
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Never shown to someone already running the installed app, and never
  // shown once this device has a confirmed install — regardless of the
  // dismissal window that only governs the standing banner.
  const visible = !installed && !isStandalone();

  useEffect(() => {
    setCtaVisible(visible);
    return () => setCtaVisible(false);
  }, [visible]);

  if (!visible) return null;

  const install = async () => {
    if (bpEvent) {
      await bpEvent.prompt();
      const choice = await bpEvent.userChoice;
      setBpEvent(null);
      if (choice.outcome === "accepted") return; // appinstalled fires separately
      return;
    }
    // iOS, or the prompt hasn't fired yet — the instructions screen built
    // for exactly this, same as the standing banner does.
    navigate("/install");
  };

  return (
    <div className="mkt-install-cta">
      <div className="mkt-install-cta-row">
        <img src="/bm-mkt-pwa-192.png" alt="" className="mkt-install-cta-icon" />
        <div className="mkt-install-cta-copy">
          <p className="mkt-install-cta-title">{title}</p>
          <p className="mkt-install-cta-body">{body}</p>
        </div>
      </div>
      <button type="button" onClick={install} className="mkt-install-cta-btn">
        Install app
      </button>
    </div>
  );
}
