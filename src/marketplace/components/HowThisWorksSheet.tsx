import { useEffect, useRef } from "react";

/**
 * "How this works", opened from the listing itself (design 45a, W1-W3).
 *
 * Four steps, deliberately. There is a full how-it-works page and an FAQ
 * for anyone who wants more, both linked in the footer, so nothing here
 * links onward: someone opening this wants the shape of it in fifteen
 * seconds and then to go back to deciding.
 *
 * STEP 3 CARRIES THE ARGUMENT. "Amaka is not paid until you confirm" is
 * what separates this from Jiji, so it is the one card in solid green with
 * white text, a coral number badge and heavier type, while the other three
 * sit as plain rows. Equal weighting would bury the only line that answers
 * the actual doubt.
 *
 * Step 4 says "the same day {seller} confirms it arrived back", never
 * "immediately": a seller has marketplace_return_confirm_days to confirm a
 * return, and every other page words it this way. This is the surface that
 * sells trust, so an over-promise here would do more damage than anywhere.
 *
 * NOT a prompt. It is deliberately opened, so it is deliberately NOT wired
 * into the install-banner / WhatsApp-hesitation / delivery-gate
 * suppression bus — those suppress each other because they appear
 * uninvited. This opens even if one of them is on screen.
 */
export default function HowThisWorksSheet({
  sellerName, onClose,
}: {
  /** The seller's first name, resolved by the caller. */
  sellerName: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes, alongside the ✕ and a tap on the backdrop. Capture phase
  // so it works wherever focus happens to be.
  //
  // Scroll position is NOT saved or restored here, deliberately: the
  // listing stays mounted underneath the whole time and the page is never
  // navigated, so there is nothing to restore. What WOULD break it is
  // locking body scroll (position:fixed on body jumps to the top on
  // release), so that is not done — the sheet is short enough not to need
  // it, and the buyer lands back exactly where they were.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const steps = [
    // Carries the MECHANISM, not just the outcome. Step 3 asserts she is
    // not paid until you confirm, which a buyer has no reason to believe
    // if they think their money went straight to her — so "you pay
    // BundledMum, never her directly" belongs here. Recovered from the old
    // inline explainer removed in §130, which was the only place that said
    // it; the protection badge states the outcome, never the mechanism.
    `When you buy this item you pay BundledMum, never ${sellerName} directly, and we connect you with her.`,
    `You can ask her for more details about the item and agree how it reaches you.`,
    `${sellerName} is not paid until the item reaches you and you confirm it is as described.`,
    `If it is not as described, send it back and we refund you the same day ${sellerName} confirms it arrived back.`,
  ];

  return (
    <div className="mkt-htw-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="mkt-htw-title">
      <div className="mkt-htw" onClick={(e) => e.stopPropagation()}>
        <div className="grab" aria-hidden />
        <div className="mkt-htw-head">
          <h3 id="mkt-htw-title">How this works</h3>
          <button ref={closeRef} type="button" className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Steps 1 and 2 pair into a 2-up grid at desktop widths, so step 3
            below them dominates the dialog the instant it opens rather
            than being a third item in a list. On mobile all four stack. */}
        <div className="mkt-htw-pair">
          {[0, 1].map((i) => (
            <div className="mkt-htw-step" key={i}>
              <span className="n">{i + 1}</span>
              <span className="t">{steps[i]}</span>
            </div>
          ))}
        </div>

        <div className="mkt-htw-step hero">
          <span className="n">3</span>
          <span className="t">{steps[2]}</span>
        </div>

        <div className="mkt-htw-step">
          <span className="n">4</span>
          <span className="t">{steps[3]}</span>
        </div>

        <button type="button" className="mkt-htw-done" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
