import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, X, Share } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { usePromptCopy } from "@/hooks/usePromptCopy";
import { promptWrapperClasses } from "@/lib/promptPosition";

// A non-intrusive, dismissible "Install BundledMum" prompt that complements the
// persistent "Install App" entry point (footer / PwaInstallButton + /install
// page). Install availability + the pwa_install_available analytics event are
// owned by the global capture in lib/pwa; this banner is purely presentational.
//  • Android / desktop Chrome: offers a button that fires the stashed prompt.
//  • iOS Safari: shows a tiny "Add to Home Screen via Share" hint.
// Dismissal is remembered for the session so it never nags.

const DISMISS_KEY = "bm-pwa-install-dismissed";

export default function PwaInstallBanner() {
  const { canInstallNative, promptInstall, isStandalone, isIosSafari } = usePwaInstall();
  const { installTitle, installBody, installCta, installPosition } = usePromptCopy();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  // Hide inside the installed app, once dismissed, on admin, and on the
  // dedicated /install page (which already shows the full install UX).
  if (isStandalone || dismissed || pathname.startsWith("/admin") || pathname.startsWith("/install")) return null;

  const showInstall = canInstallNative;
  const showIosHint = isIosSafari && !canInstallNative;
  if (!showInstall && !showIosHint) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const install = async () => {
    await promptInstall(); // appinstalled fires separately → logs pwa_installed
  };

  return (
    <div className={promptWrapperClasses(installPosition)}>
      <div className="w-full max-w-md pointer-events-auto rounded-2xl border border-border bg-card shadow-lg p-3 flex items-center gap-3">
        <img src="/bm-pwa-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" />
        {showInstall ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-forest leading-tight">{installTitle}</p>
              <p className="text-[11px] text-text-med leading-tight">{installBody}</p>
            </div>
            <button
              onClick={install}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-forest text-white text-sm font-semibold px-3.5 h-9"
            >
              <Download className="w-4 h-4" /> {installCta}
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
