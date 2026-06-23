import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { isStandalone, isIosSafari } from "@/lib/pwa";

// A non-intrusive, dismissible "Install BundledMum" prompt.
//  • Android / desktop Chrome: captures beforeinstallprompt and offers a button
//    that calls the stashed native prompt; logs pwa_install_available once.
//  • iOS Safari: shows a tiny one-time "Add to Home Screen via Share" hint
//    (iOS can't fire beforeinstallprompt).
// Dismissal is remembered for the session so it never nags.

const DISMISS_KEY = "bm-pwa-install-dismissed";
const AVAIL_LOGGED_KEY = "bm-pwa-available-logged";

type BipEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BipEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    // Never show inside the installed app, on admin routes, or once dismissed.
    if (isStandalone()) return;
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { /* ignore */ }
    if (dismissed) return;

    const onPrompt = (e: Event) => {
      // Stop Chrome's default mini-infobar; we present our own button.
      e.preventDefault();
      setDeferred(e as BipEvent);
      setShowInstall(true);
      try {
        if (!sessionStorage.getItem(AVAIL_LOGGED_KEY)) {
          sessionStorage.setItem(AVAIL_LOGGED_KEY, "1");
          trackEvent("pwa_install_available", { display_mode: "browser" });
        }
      } catch {
        trackEvent("pwa_install_available", { display_mode: "browser" });
      }
    };
    const onInstalled = () => { setShowInstall(false); setShowIosHint(false); setDeferred(null); };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari can't fire beforeinstallprompt — offer the subtle A2HS hint.
    if (isIosSafari()) setShowIosHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setShowInstall(false);
    setShowIosHint(false);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice; // appinstalled fires separately → logs pwa_installed
    } catch { /* user dismissed native dialog */ }
    setDeferred(null);
    setShowInstall(false);
  };

  if (!showInstall && !showIosHint) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-border bg-card shadow-lg p-3 flex items-center gap-3">
        <img src="/bm-pwa-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
        {showInstall ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-forest leading-tight">Install BundledMum</p>
              <p className="text-[11px] text-text-med leading-tight">Add the app to your home screen for faster shopping.</p>
            </div>
            <button
              onClick={install}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-forest text-white text-sm font-semibold px-3.5 h-9"
            >
              <Download className="w-4 h-4" /> Install
            </button>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-forest leading-tight">Add BundledMum to your Home Screen</p>
            <p className="text-[11px] text-text-med leading-tight inline-flex items-center gap-1 flex-wrap">
              Tap <Share className="w-3.5 h-3.5 inline" /> Share, then “Add to Home Screen”.
            </p>
          </div>
        )}
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 p-1.5 rounded-full hover:bg-muted/40 text-text-med">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
