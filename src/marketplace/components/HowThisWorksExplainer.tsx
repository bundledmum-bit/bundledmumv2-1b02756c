import { useState } from "react";

/**
 * How this works (design 19a), replacing the old single green reassurance
 * line above Buy now. Collapsed by default; the bold headline plus tick is
 * always visible without any interaction, so a buyer who never taps it still
 * gets the gut-check. Tapping opens six numbered steps in place, no
 * navigation, no modal.
 *
 * Renders two step lists (a long single-column one, a short 2-column one)
 * and toggles which is visible by breakpoint in CSS, matching how the rest
 * of this page's desktop layout works — mobile markup untouched, desktop
 * only added to via @media (min-width:1024px).
 */
export default function HowThisWorksExplainer({ sellerName }: { sellerName: string }) {
  const [open, setOpen] = useState(false);

  const longSteps = [
    `You pay BundledMum, never ${sellerName} directly`,
    `We hold it, ${sellerName} does not have it yet`,
    "Their contact is shared with you right after payment",
    "They ship and upload a photo of the parcel",
    "You confirm it arrived, only then are they paid",
    "Something wrong? Report it instead, a real person reviews it before any money moves",
  ];
  const shortSteps = [
    `You pay us, not ${sellerName}`,
    "We hold it, they do not",
    "Their contact comes to you after payment",
    "They ship with a photo as proof",
    "You confirm, then they are paid",
    "Wrong item? Report it, we step in first",
  ];

  return (
    <div className="mkt-howworks">
      <button type="button" className="mkt-howworks-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="mkt-howworks-icon">✓</span>
        <span className="mkt-howworks-title">
          <span className="long">Your money stays held until you confirm it arrived</span>
          <span className="short">Money held until you confirm it arrived</span>
        </span>
        <span className={open ? "mkt-howworks-chev open" : "mkt-howworks-chev"}>{open ? "▴" : "▾"}</span>
      </button>

      {!open && (
        <div className="mkt-howworks-caption">
          <span className="long">Tap to see exactly how this works</span>
          <span className="short">See exactly how this works</span>
        </div>
      )}

      {open && (
        <div className="mkt-howworks-body">
          <div className="mkt-howworks-divider" />

          <div className="mkt-howworks-steps long">
            {longSteps.map((text, i) => (
              <div className={i === 4 ? "mkt-howworks-step final" : "mkt-howworks-step"} key={i}>
                <span className="num">{i + 1}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
          <div className="mkt-howworks-steps short">
            {shortSteps.map((text, i) => (
              <div className={i === 4 ? "mkt-howworks-step final" : "mkt-howworks-step"} key={i}>
                <span className="num">{i + 1}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>

          <div className="mkt-howworks-trust">
            <span className="tick">✓</span>
            <span>Every seller is checked and every listing reviewed before it goes live</span>
          </div>
        </div>
      )}
    </div>
  );
}
