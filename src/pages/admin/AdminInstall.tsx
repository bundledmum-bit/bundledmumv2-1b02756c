import { useEffect, useState } from "react";
import { Smartphone, Share, Plus, Download, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Standalone page that explains how to install the admin panel to the
 * home screen on iOS and Android, plus an inline install button that
 * fires the native beforeinstallprompt on supported browsers.
 */
export default function AdminInstall() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const installedHandler = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const triggerInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <header className="text-center pt-2">
        <div
          className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
          style={{ background: "#F4845F" }}
        >
          <Smartphone className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-forest">Install BM Admin</h1>
        <p className="text-sm text-text-med mt-1">
          Run the admin panel as a standalone app on your phone — one tap from your home screen.
        </p>
      </header>

      {(installed || isStandalone) && (
        <div className="bg-forest/10 border border-forest/30 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-forest flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-forest">You're all set</div>
            <p className="text-xs text-text-med mt-0.5">
              The admin app is installed. You can close this tab and open BM Admin from your home screen.
            </p>
          </div>
        </div>
      )}

      {deferred && !installed && (
        <button
          onClick={triggerInstall}
          className="w-full bg-coral hover:bg-coral/90 text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
        >
          <Download className="w-4 h-4" />
          Install admin app
        </button>
      )}

      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-bold text-forest text-sm uppercase tracking-wider">
          {isIOS ? "On iPhone / iPad" : isAndroid ? "On Android" : "On your phone"}
        </h2>

        {(!isAndroid || isIOS) && (
          <ol className="space-y-3 text-sm text-text-med">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                1
              </span>
              <span>
                Open <strong>bundledmum.com/admin</strong> in <strong>Safari</strong> on your iPhone or iPad.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                2
              </span>
              <span className="flex items-center gap-1 flex-wrap">
                Tap the <Share className="w-4 h-4 inline" /> <strong>Share</strong> button.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                3
              </span>
              <span className="flex items-center gap-1 flex-wrap">
                Choose <Plus className="w-4 h-4 inline" /> <strong>Add to Home Screen</strong>.
              </span>
            </li>
          </ol>
        )}

        {(!isIOS || isAndroid) && (
          <ol className="space-y-3 text-sm text-text-med">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                1
              </span>
              <span>
                Open <strong>bundledmum.com/admin</strong> in <strong>Chrome</strong> on Android.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                2
              </span>
              <span>Tap the ⋮ menu in the top-right corner.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-forest text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                3
              </span>
              <span>
                Choose <strong>Install app</strong> (or <strong>Add to Home Screen</strong>).
              </span>
            </li>
          </ol>
        )}
      </section>

      <div className="text-center">
        <Link to="/admin" className="text-sm text-forest font-semibold hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
