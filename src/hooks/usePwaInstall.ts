import { useSyncExternalStore } from "react";
import {
  subscribeInstall,
  getDeferredPrompt,
  fireInstallPrompt,
  isStandalone,
  isIos,
  isIosSafari,
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
  return {
    /** Android / desktop Chrome: a native prompt is stashed and usable now. */
    canInstallNative: !!deferred && !standalone,
    /** Fire the native prompt (no-op "unavailable" when none is stashed). */
    promptInstall: fireInstallPrompt,
    /** Already running as an installed app — hide install controls. */
    isStandalone: standalone,
    isIos: isIos(),
    isIosSafari: isIosSafari(),
  };
}
