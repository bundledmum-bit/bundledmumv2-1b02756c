import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSeller, hasDeliveryPrefs } from "./useSeller";
import DeliveryQuestions from "./DeliveryQuestions";
import { saveSellerDeliveryPrefs, type LocalHandover } from "./deliveryPrefs";
import { isDeliveryPromptDismissed, dismissDeliveryPrompt } from "../lib/deliveryPromptState";
import { subscribeToWaPromptVisible } from "../components/WhatsAppInactivityPrompt";

/**
 * The one-time ask for sellers who were already here before these two
 * questions existed. Their listings currently say nothing about delivery,
 * which is the single most common reason a buyer leaves without asking.
 *
 * Built to the SAME rules as the install banner (§60/§111), deliberately,
 * because those rules exist for a real reason and this is the same kind of
 * surface:
 *  - never on arrival: 10 seconds on the page, or 30% scroll, whichever
 *    comes first, so it only ever appears after genuine engagement;
 *  - a bottom sheet well under 30% of the viewport, never full screen;
 *  - one visible ✕, and dismissing is remembered (90 days, see
 *    lib/deliveryPromptState.ts) so it does not reappear every visit.
 *
 * Shown only to a signed-in SELLER who has not answered. A buyer never sees
 * it, and it disappears for good the moment the answers are saved — gated on
 * their own saved prefs, not on the dismissal flag, so answering is what
 * really ends it.
 *
 * Publishes nothing to the suppression bus but DOES subscribe to it: if the
 * WhatsApp inactivity prompt is up (someone hesitating over a real
 * purchase), that wins and this waits, exactly as the install banner
 * already yields to it. Two sheets stacking on a phone reads as broken.
 */

const SHOW_DELAY_MS = 10_000;
const SCROLL_TRIGGER_FRACTION = 0.3;

export default function SellerDeliveryPrompt() {
  const { pathname } = useLocation();
  const { seller, loading, refresh } = useSeller();

  const [dismissed, setDismissed] = useState(isDeliveryPromptDismissed);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [sellsNationwide, setSellsNationwide] = useState<boolean | null>(null);
  const [localHandover, setLocalHandover] = useState<LocalHandover | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [waPromptVisible, setWaPromptVisible] = useState(false);
  useEffect(() => subscribeToWaPromptVisible(setWaPromptVisible), []);

  // Genuine engagement, never a first-paint interstitial — the same
  // condition Google's own intrusive-interstitial exemption is built on.
  useEffect(() => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setReady(true);
      window.removeEventListener("scroll", onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return; // too short to measure; the timer still covers it
      if (window.scrollY / max >= SCROLL_TRIGGER_FRACTION) settle();
    };
    timerRef.current = setTimeout(settle, SHOW_DELAY_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Never on top of the create-listing form, which asks these two questions
  // inline itself, nor mid-payment where nothing may compete for attention.
  const onSuppressedRoute = pathname.startsWith("/sell/new")
    || pathname.startsWith("/sell/listings/")
    || pathname.startsWith("/checkout");

  const shouldShow = !loading
    && !!seller
    && !hasDeliveryPrefs(seller)
    && !dismissed
    && ready
    && !waPromptVisible
    && !onSuppressedRoute;

  if (!shouldShow) return null;

  const dismiss = () => {
    setDismissed(true);
    dismissDeliveryPrompt();
  };

  async function save() {
    if (sellsNationwide === null || localHandover === null) { setShowErrors(true); return; }
    setBusy(true); setError(null);
    const res = await saveSellerDeliveryPrefs({ sellsNationwide, localHandover });
    setBusy(false);
    if (!res.ok) { setError(res.message ?? "We could not save that just now. Please try again."); return; }
    // Nothing else needed to hide this: refreshing the seller row makes
    // hasDeliveryPrefs true, which gates the whole component off for good.
    await refresh();
  }

  return (
    <div className="mkt-delivery-prompt">
      <div className="mkt-delivery-prompt-inner">
        <button type="button" className="mkt-delivery-prompt-close" onClick={dismiss} aria-label="Not now">×</button>

        {!open ? (
          <>
            <p className="mkt-delivery-prompt-title">Can buyers outside your state buy from you?</p>
            <p className="mkt-delivery-prompt-body">
              Your listings do not say yet, so buyers further away often move on without asking.
              Two taps sorts it for everything you have listed.
            </p>
            <button type="button" className="mkt-delivery-prompt-cta" onClick={() => setOpen(true)}>Answer two questions</button>
          </>
        ) : (
          <>
            <p className="mkt-delivery-prompt-title">Two quick questions</p>
            <p className="mkt-delivery-prompt-body">
              These apply to everything you have listed, and you can change them on any single item later.
            </p>
            <DeliveryQuestions
              compact
              sellsNationwide={sellsNationwide}
              localHandover={localHandover}
              onNationwide={(v) => { setSellsNationwide(v); setShowErrors(false); }}
              onHandover={(v) => { setLocalHandover(v); setShowErrors(false); }}
              showErrors={showErrors}
            />
            {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
            <button type="button" className="mkt-delivery-prompt-cta" onClick={save} disabled={busy}>
              {busy ? "Saving..." : "Save for all my listings"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
