import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSeller, hasCompleteDeliveryPrefs } from "./useSeller";
import { useSellerListingInfo } from "./useSellerListingInfo";
import { saveSellerDeliveryPrefs, type LocalHandover } from "./deliveryPrefs";
import DeliveryHandoverChoice from "./DeliveryHandoverChoice";
import { deliveryGateChannel } from "../lib/promptVisibility";

/**
 * The blocking ask, in TWO steps.
 *
 * Step 1 is the question buyers most need answered: will she sell only in
 * her own state, or anywhere in Nigeria. Step 2 is how a same-state buyer
 * receives it. Both are needed — seller_needs_delivery_prefs() and
 * listing_delivery_terms.is_set BOTH require sells_nationwide AND
 * local_handover to be non-null, so answering only one leaves the seller
 * still flagged and every listing still blank to buyers.
 *
 * Saved ONCE at the end via seller_set_delivery_prefs(), which takes both
 * together, rather than a write per step. Nothing is written until both
 * answers exist.
 *
 * SHOWS IMMEDIATELY, with no engagement delay. The install banner delays
 * because Google penalises interstitials shown to visitors arriving from
 * search; that reasoning does not apply here, because this only ever
 * renders for a SIGNED IN SELLER and Googlebot is never signed in.
 *
 * NON-DISMISSIBLE: no close button, no backdrop click handler, Escape
 * swallowed, no dismissal flag anywhere. Focus is trapped and background
 * scroll locked while it is open. A failed save keeps it open with the
 * error visible and never lets the seller through.
 */
export default function SellerDeliveryGate() {
  const { pathname } = useLocation();
  const { seller, loading, refresh } = useSeller();
  const { data: info } = useSellerListingInfo(seller?.id);

  const [step, setStep] = useState<1 | 2>(1);
  const [nationwide, setNationwide] = useState<boolean | null>(null);
  // Pre-seeded from whatever they already answered. Someone re-asked
  // because only sells_nationwide is missing answered the handover question
  // once already, and it was recorded correctly — making them pick it again
  // would imply we lost it.
  const [handover, setHandover] = useState<LocalHandover | null>(null);
  const seededRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Still yields to the WhatsApp inactivity prompt: that fires because
  // someone is hesitating over a real purchase, and two overlays at once
  // reads as broken.

  // Anywhere on the marketplace, not just the seller area — a seller who
  // has not answered should meet this as soon as they arrive. Excluded:
  // create-listing (which asks the same two questions inline, and is the
  // entry point for a seller with nothing listed yet) and checkout
  // (nothing may compete with a payment in progress).
  //
  // Deliberately NOT gated on having listings: a seller who started
  // answering and stopped is incomplete whether or not anything is live,
  // which is exactly what seller_needs_delivery_prefs() now reports.
  const onExcludedRoute = pathname.startsWith("/sell/new")
    || pathname.startsWith("/sell/listings/")
    || pathname.startsWith("/checkout");

  const shouldShow = !loading
    && !!seller
    && !hasCompleteDeliveryPrefs(seller)
    && !onExcludedRoute;

  // Published so every lower-priority prompt can stand down. This gate is
  // now strictly highest: it used to yield to the WhatsApp prompt, but
  // keeping that alongside gate > pending > whatsapp would have formed a
  // cycle and oscillated. See lib/promptVisibility.ts.
  useEffect(() => {
    deliveryGateChannel.set(shouldShow);
    return () => deliveryGateChannel.set(false);
  }, [shouldShow]);

  // Escape must not close this, and the page behind must not scroll. Both
  // are part of "non-dismissible" rather than decoration.
  useEffect(() => {
    if (!shouldShow) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key !== "Tab") return;
      const root = cardRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      cardRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();
    }, 0);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [shouldShow]);

  // Seeds once, the moment the seller row arrives, and never again, so it
  // can not stomp on a choice they have since made themselves.
  useEffect(() => {
    if (seededRef.current || !seller) return;
    seededRef.current = true;
    if (seller.local_handover) setHandover(seller.local_handover as LocalHandover);
    if (seller.sells_nationwide !== null) setNationwide(seller.sells_nationwide);
  }, [seller]);

  // A dismissal record for this prompt has not existed since it became
  // non-dismissible, but sellers who saw the older dismissible version
  // still carry its key in localStorage. Nothing reads it any more, so it
  // cannot suppress anything — cleared anyway so no stale flag is left
  // behind on a device that was asked before this correction.
  useEffect(() => {
    try { localStorage.removeItem("bm-mkt-delivery-prompt-dismissed"); } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    if (!confirmed) return;
    const t = setTimeout(() => { refresh(); }, 1600);
    return () => clearTimeout(t);
  }, [confirmed, refresh]);

  if (!shouldShow) return null;

  // Their real state, from their listings. Falls back to the generic phrase
  // only when no listing carries one, rather than inventing a place.
  const stateName = info?.state || null;
  const onlyHere = stateName ? `only in ${stateName}` : "only in your own state";
  const buyersHere = stateName ? `buyers in ${stateName}` : "buyers in your state";

  async function submit() {
    if (nationwide === null || handover === null || !seller) return;
    setBusy(true); setError(null);
    // One write, both answers. seller_set_delivery_prefs sets
    // delivery_prefs_set_at itself.
    const res = await saveSellerDeliveryPrefs({ sellsNationwide: nationwide, localHandover: handover });
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? "We could not save that just now. Please try again.");
      return;
    }
    setConfirmed(true);
  }

  return (
    /* No onClick on the overlay: a backdrop tap must do nothing at all. */
    <div className="mkt-handover-overlay" role="dialog" aria-modal="true" aria-labelledby="mkt-handover-title">
      <div className="mkt-handover-card" ref={cardRef}>
        {confirmed ? (
          <div className="mkt-handover-done">
            <div className="tick">✓</div>
            <div className="h">Got it, thank you</div>
            <div className="p">
              {nationwide
                ? "Buyers anywhere in Nigeria can now see how they would get your items."
                : `Buyers can now see that you sell ${onlyHere}, and how they would get your items.`}
            </div>
          </div>
        ) : (
          <>
            <div className="mkt-handover-badge" aria-hidden>📦</div>
            <div className="mkt-handover-head">
              <div className="h" id="mkt-handover-title">One quick thing before you carry on</div>
              <div className="p">
                {step === 1
                  ? `Would you sell ${onlyHere}, or anywhere in Nigeria?`
                  : `For ${buyersHere}, how do they get it?`}
              </div>
              <div className="mkt-handover-steps" aria-label={`Step ${step} of 2`}>
                <span className="on" />
                <span className={step === 2 ? "on" : ""} />
              </div>
            </div>

            {step === 1 ? (
              /* Choosing advances on its own — this is two taps total, and
                 a Continue on each step would double that for no gain. */
              <div className="mkt-handover-opts grid">
                <button
                  type="button"
                  className={nationwide === false ? "mkt-handover-opt on" : "mkt-handover-opt"}
                  onClick={() => { setNationwide(false); setStep(2); }}
                  aria-pressed={nationwide === false}
                >
                  {nationwide === false && <span className="tick" aria-hidden>✓</span>}
                  <span className="body">
                    <span className="lbl">{stateName ? `Only in ${stateName}` : "Only in my state"}</span>
                    <span className="hint">You sell to buyers near you.</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={nationwide === true ? "mkt-handover-opt on" : "mkt-handover-opt"}
                  onClick={() => { setNationwide(true); setStep(2); }}
                  aria-pressed={nationwide === true}
                >
                  {nationwide === true && <span className="tick" aria-hidden>✓</span>}
                  <span className="body">
                    <span className="lbl">Anywhere in Nigeria</span>
                    <span className="hint">You send to buyers in any state.</span>
                  </span>
                </button>
              </div>
            ) : (
              <>
                <DeliveryHandoverChoice value={handover} onChange={setHandover} disabled={busy} layout="grid" />
                <button type="button" className="mkt-handover-back" onClick={() => setStep(1)} disabled={busy}>
                  ‹ Back
                </button>
              </>
            )}

            {error && (
              <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>
            )}

            {/* Only on step 2, and only once both answers exist: nothing is
                saved until the seller has answered both. */}
            {step === 2 && (
              <button
                type="button"
                className="mkt-handover-continue"
                onClick={submit}
                disabled={nationwide === null || handover === null || busy}
              >
                {busy ? <><span className="spin" aria-hidden />Saving...</> : "Continue"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
