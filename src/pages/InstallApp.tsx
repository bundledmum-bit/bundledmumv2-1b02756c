import { useEffect, useState } from "react";
import { Smartphone, Share, Plus, Download, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { usePromptCopy } from "@/hooks/usePromptCopy";

/**
 * Storefront "Install BundledMum" page — mirrors the admin install screen
 * (AdminInstall.tsx) but branded for the customer site and using the shared
 * install hook. Android/desktop get an inline native install button; iOS gets
 * the manual Add-to-Home-Screen steps. Analytics (pwa_install_available /
 * pwa_installed / pwa_session) are handled globally by lib/pwa.
 */
export default function InstallApp() {
  const { canInstallNative, promptInstall, isStandalone, isIos } = usePwaInstall();
  const { installTitle, installBody, installCta } = usePromptCopy();
  const [installed, setInstalled] = useState(false);

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
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <header className="text-center pt-2">
        <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-3 bg-forest">
          <Smartphone className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-forest">{installTitle}</h1>
        <p className="text-sm text-text-med mt-1">{installBody}</p>
      </header>

      {(installed || isStandalone) && (
        <div className="bg-forest/10 border border-forest/30 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-forest flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-forest">You're all set</div>
            <p className="text-xs text-text-med mt-0.5">
              BundledMum is installed. Open it any time from your home screen.
            </p>
          </div>
        </div>
      )}

      {canInstallNative && !installed && (
        <button
          onClick={triggerInstall}
          className="w-full bg-forest hover:bg-forest/90 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
        >
          <Download className="w-4 h-4" />
          {installCta}
        </button>
      )}

      {!installed && !isStandalone && (
        <section className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-bold text-forest text-sm uppercase tracking-wider">
            {isIos ? "On iPhone / iPad" : isAndroid ? "On Android" : "On your phone"}
          </h2>

          {(!isAndroid || isIos) && (
            <ol className="space-y-3 text-sm text-text-med">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                <span>Open <strong>bundledmum.com</strong> in <strong>Safari</strong> on your iPhone or iPad.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                <span className="flex items-center gap-1 flex-wrap">Tap the <Share className="w-4 h-4 inline" /> <strong>Share</strong> button.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                <span className="flex items-center gap-1 flex-wrap">Choose <Plus className="w-4 h-4 inline" /> <strong>Add to Home Screen</strong>.</span>
              </li>
            </ol>
          )}

          {(!isIos || isAndroid) && (
            <ol className="space-y-3 text-sm text-text-med">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                <span>Open <strong>bundledmum.com</strong> in <strong>Chrome</strong> on Android.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                <span>Tap the ⋮ menu in the top-right corner.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                <span>Choose <strong>Install app</strong> (or <strong>Add to Home Screen</strong>).</span>
              </li>
            </ol>
          )}
        </section>
      )}

      <div className="text-center">
        <Link to="/" className="text-sm text-forest font-semibold hover:underline">
          ← Back to shopping
        </Link>
      </div>
    </div>
  );
}
