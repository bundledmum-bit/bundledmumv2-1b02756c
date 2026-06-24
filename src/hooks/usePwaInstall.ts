import { useEffect, useState, useSyncExternalStore } from "react";
import {
  subscribeInstall,
  getDeferredPrompt,
  fireInstallPrompt,
  isStandalone,
  isIos,
  isIosSafari,
  isPwaInstalledFlag,
  hasRelatedInstalledApp,
} from "@/lib/pwa";

/**
 * Single source of truth for the PWA install control, shared by the storefront
 * footer button, the /install steps page, and the banner. Reads the globally
 * captured beforeinstallprompt (see initInstallCapture in lib/pwa) so a control
 * mounted long after page load still sees the stashed event.
 */
export function usePwaInstall() {
  const deferred = useSyncExternalStore(subscribeInstall, getDeferredPrompt, () => null);
  const standalone = isStandalone();

  // "Already installed" — combine the reliable in-app signal (standalone) with
  // the remembered per-profile flag and the best-effort related-apps check.
  // The flag/standalone are sync (no flash); the async related-apps check only
  // ever flips suppression ON, so it can't cause a prompt to flash either.
  const [installed, setInstalled] = useState(() => standalone || isPwaInstalledFlag());
  useEffect(() => {
    if (standalone || isPwaInstalledFlag()) { setInstalled(true); return; }
    let alive = true;
    hasRelatedInstalledApp().then((related) => { if (alive && related) setInstalled(true); });
    return () => { alive = false; };
  }, [standalone]);

  return {
    /** Android / desktop Chrome: a native prompt is stashed and usable now. */
    canInstallNative: !!deferred && !standalone && !installed,
    /** Fire the native prompt (no-op "unavailable" when none is stashed). */
    promptInstall: fireInstallPrompt,
    /** Already running as an installed app — hide install controls. */
    isStandalone: standalone,
    /** Treat as installed (standalone OR remembered flag OR related app) → suppress prompts. */
    installed,
    isIos: isIos(),
    isIosSafari: isIosSafari(),
  };
}
