import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSeller, hasAnsweredHandover } from "./useSeller";
import { useSellerListingCount } from "./useSellerListingCount";
import { saveLocalHandover, type LocalHandover } from "./deliveryPrefs";
import DeliveryHandoverChoice from "./DeliveryHandoverChoice";

/**
 * ENTRY POINT 1 — the blocking ask (design 43a, S1-S8).
 *
 * Shows on entering the seller area when the seller has NOT answered
 * (delivery_prefs_set_at is null) AND already has at least one listing.
 * A seller with zero listings gets the same question as the first step of
 * the listing form instead (see CreateListingPage), so the two never both
 * fire.
 *
 * NON-DISMISSIBLE, deliberately and completely: no close button, no X, no
 * backdrop click handler, and Escape is swallowed. There is no dismissal
 * flag anywhere — this replaced an earlier dismissible bottom sheet, whose
 * 90-day localStorage dismissal directly contradicted the requirement. The
 * only way out is to answer.
 *
 * Focus is trapped: focus moves into the card on open, Tab and Shift+Tab
 * cycle within it, and nothing outside is reachable by keyboard while it is
 * up. Background scroll is locked for the same reason.
 *
 * On a failed save the modal STAYS OPEN with the error shown. It never
 * fails silently and never lets the seller through.
 */
export default function SellerDeliveryGate() {
  const { pathname } = useLocation();
  const { seller, loading, refresh } = useSeller();
  const { data: listingCount } = useSellerListingCount(seller?.id);

  const [value, setValue] = useState<LocalHandover | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // The whole seller area, which is where this is required to appear. The
  // create-listing routes are excluded only because a zero-listing seller
  // is answering the identical question inline there; a seller WITH
  // listings is still gated the moment they touch any other seller screen.
  const inSellerArea = pathname === "/sell"
    || (pathname.startsWith("/sell/") && !pathname.startsWith("/sell/new") && !pathname.startsWith("/sell/listings/"));

  const shouldShow = !loading
    && !!seller
    && !hasAnsweredHandover(seller)
    && (listingCount ?? 0) > 0
    && inSellerArea;

  // Escape must not close this, and the page behind must not scroll. Both
  // are part of "non-dismissible" rather than decoration.
  useEffect(() => {
    if (!shouldShow) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key !== "Tab") return;
      // Focus trap: cycle within the card, never past it.
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
    // Move focus in, so a keyboard user is inside the trap immediately.
    const t = setTimeout(() => {
      const root = cardRef.current;
      const firstBtn = root?.querySelector<HTMLElement>("button:not([disabled])");
      firstBtn?.focus();
    }, 0);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [shouldShow]);

  // Confirmation fades out on its own, then the gate is gone for good —
  // refresh() makes hasAnsweredHandover true, which is the real gate.
  useEffect(() => {
    if (!confirmed) return;
    const t = setTimeout(() => { refresh(); }, 1600);
    return () => clearTimeout(t);
  }, [confirmed, refresh]);

  if (!shouldShow) return null;

  async function submit() {
    if (!value || !seller) return;
    setBusy(true); setError(null);
    const res = await saveLocalHandover(seller.id, value);
    setBusy(false);
    if (!res.ok) {
      // Stays open, error visible. The seller is not let through.
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
              {value === "ships"
                ? "Buyers in your state will see that you send it to them."
                : "Buyers in your state will see collection as an option from now on."}
            </div>
          </div>
        ) : (
          <>
            <div className="mkt-handover-badge" aria-hidden>📦</div>
            <div className="mkt-handover-head">
              <div className="h" id="mkt-handover-title">One quick thing before you carry on</div>
              <div className="p">For buyers in your state, how do they get it?</div>
            </div>

            <DeliveryHandoverChoice value={value} onChange={setValue} disabled={busy} layout="grid" />

            {error && (
              <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>
            )}

            <button
              type="button"
              className="mkt-handover-continue"
              onClick={submit}
              disabled={!value || busy}
            >
              {busy ? <><span className="spin" aria-hidden />Saving...</> : "Continue"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
