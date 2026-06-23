import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { Bell, X, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { usePush } from "@/hooks/usePush";
import { usePromptCopy } from "@/hooks/usePromptCopy";

// Soft, dismissible push opt-in. Never calls requestPermission on load — it
// only shows a small card; the browser permission prompt fires solely when the
// user taps "Allow". Dismissal is remembered permanently (localStorage) so it
// doesn't nag; users can still enable later via the footer toggle / account.
const DISMISS_KEY = "bm-push-optin-dismissed";

export default function PushOptInCard() {
  const { status, busy, subscribe, iosNeedsInstall, supported } = usePush();
  const { optinTitle, optinBody, optinCta, optinDecline } = usePromptCopy();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  // Hide on admin / the install page / once dismissed.
  if (dismissed || pathname.startsWith("/admin") || pathname.startsWith("/install")) return null;

  // iOS Safari (not installed) can't do web push — show an install-first nudge
  // instead of a dead Allow button. Otherwise only prompt when undecided.
  const showIosInstall = iosNeedsInstall;
  const showAllow = supported && !iosNeedsInstall && status === "default";
  if (!showIosInstall && !showAllow) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const allow = async () => {
    const result = await subscribe();
    if (result === "granted-subscribed") {
      toast.success("You're subscribed — we'll notify you about orders, restocks & offers.");
      dismiss();
    } else if (result === "denied") {
      toast.error("Notifications are blocked. Enable them in your browser settings to opt in.");
      dismiss();
    }
  };

  return (
    <div className="fixed left-3 right-3 sm:left-auto sm:right-4 bottom-20 sm:bottom-4 z-50 pointer-events-none">
      <div className="mx-auto sm:mx-0 max-w-sm pointer-events-auto rounded-2xl border border-border bg-card shadow-lg p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-forest/10 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-forest" />
        </div>
        {showIosInstall ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-forest leading-tight">Get order & offer alerts</p>
              <p className="text-[11px] text-text-med leading-tight">Install the app first to enable notifications on iPhone.</p>
            </div>
            <Link
              to="/install"
              onClick={dismiss}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-forest text-white text-xs font-semibold px-3 h-9"
            >
              <Smartphone className="w-3.5 h-3.5" /> Install
            </Link>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-forest leading-tight">{optinTitle}</p>
              <p className="text-[11px] text-text-med leading-tight">{optinBody}</p>
            </div>
            <button
              onClick={allow}
              disabled={busy}
              className="shrink-0 inline-flex items-center rounded-full bg-forest text-white text-xs font-semibold px-3.5 h-9 disabled:opacity-60"
            >
              {busy ? "…" : optinCta}
            </button>
          </>
        )}
        <button onClick={dismiss} aria-label={optinDecline} title={optinDecline} className="shrink-0 p-1.5 rounded-full hover:bg-muted/40 text-text-med">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
