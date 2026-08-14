import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import MarketplaceSeo from "./components/MarketplaceSeo";
import InstallSequence, { type SeqBrowser } from "./components/InstallSequence";

/**
 * Marketplace "Install the app" screen — mirrors the storefront's InstallApp.tsx
 * and the admin panel's AdminInstall.tsx (same usePwaInstall hook, same
 * Android/desktop-gets-a-real-prompt vs iOS-gets-manual-steps split), branded
 * for the marketplace and reached at /marketplace/install.
 *
 * Deliberately NOT using usePromptCopy — that reads storefront-specific
 * site_settings keys (pwa_install_title etc.), and this screen also needs to
 * say something none of the other install screens do: the iOS sign-in caveat
 * below. Copy is hardcoded here, same as AdminInstall.tsx's own pattern.
 */
export default function InstallPage() {
  const { canInstallNative, promptInstall, isStandalone, isIos, isIosChrome } = usePwaInstall();
  const [installed, setInstalled] = useState(false);
  // Detection picks the default; the switch inside InstallSequence covers the
  // rest (detection reading the wrong thing, or someone reading on one device
  // to set another up). Any iOS browser we can't tell apart from Safari or
  // Chrome (Firefox, Edge, an in-app browser) defaults to Safari, since that
  // path always works — some third-party browsers on older iOS can't A2HS at all.
  const initialSeqBrowser: SeqBrowser = isIosChrome ? "chrome" : "safari";

  useEffect(() => {
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isAndroid = /Android/.test(ua);

  const triggerInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") setInstalled(true);
  };

  return (
    <>
      <MarketplaceSeo
        title="Install the app"
        description="Add BundledMum Marketplace to your home screen for faster browsing and buying."
      />
      <div className="mkt-policy-head">
        <h1>Install the marketplace app</h1>
        <p className="lead">Add it to your home screen and open it like any other app, no browser tabs, no re-typing the address.</p>
      </div>

      <div className="mkt-policy-body">
        <div className="mkt-policy-col">
          {(installed || isStandalone) && (
            <div className="mkt-policy-section">
              <h2>You're all set</h2>
              <p>The marketplace app is installed. You can close this tab and open it from your home screen any time.</p>
            </div>
          )}

          {canInstallNative && !installed && (
            <button type="button" className="mkt-primary" style={{ maxWidth: 260 }} onClick={triggerInstall}>
              Install app
            </button>
          )}

          {!installed && !isStandalone && (
            <div className="mkt-policy-section">
              <h2>{isIos ? "On iPhone / iPad" : isAndroid ? "On Android" : "On your phone"}</h2>

              {isIos && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="mkt-step">
                    <span className="mkt-step-num">1</span>
                    <span>Open <strong>bundledmum.com/marketplace</strong> in <strong>Safari</strong> or <strong>Chrome</strong>.</span>
                  </div>
                  <div className="mkt-step">
                    <span className="mkt-step-num">2</span>
                    <span>Tap the <strong>Share</strong> icon (shown below for your browser).</span>
                  </div>
                  <div className="mkt-step">
                    <span className="mkt-step-num final">3</span>
                    <span>Scroll down and choose <strong>Add to Home Screen</strong>.</span>
                  </div>
                </div>
              )}

              {isIos && (
                <div style={{ marginTop: 20 }}>
                  <InstallSequence initial={initialSeqBrowser} />
                </div>
              )}

              {!isIos && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="mkt-step">
                    <span className="mkt-step-num">1</span>
                    <span>Open <strong>bundledmum.com/marketplace</strong> in <strong>Chrome</strong>.</span>
                  </div>
                  <div className="mkt-step">
                    <span className="mkt-step-num">2</span>
                    <span>Tap the ⋮ menu in the top-right corner.</span>
                  </div>
                  <div className="mkt-step">
                    <span className="mkt-step-num final">3</span>
                    <span>Choose <strong>Install app</strong> (or <strong>Add to Home Screen</strong>).</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {isIos && !installed && !isStandalone && (
            <div className="mkt-policy-section" style={{ background: "var(--mkt-cream)", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ margin: 0 }}>
                Already signed in here? The installed app keeps its own sign in, separate from Safari, so you'll just enter the 6-digit code we email you once to get set up in the app. After that, it stays signed in.
              </p>
            </div>
          )}

          <div className="mkt-policy-contact">
            <Link to="/">← Back to browsing</Link>
          </div>
        </div>
      </div>
    </>
  );
}
