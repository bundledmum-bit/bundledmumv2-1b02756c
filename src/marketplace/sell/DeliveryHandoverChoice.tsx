import type { LocalHandover } from "./deliveryPrefs";

/**
 * The same-state handover question, shared by both places that ask it (the
 * blocking modal and the first step of the listing form) so the wording and
 * behaviour can never drift apart. Design 43a, screens S1-S11.
 *
 * Full-width tappable cards, not radio dots or a dropdown, per the design's
 * own reasoning. Each option carries a one-line explanation of what the
 * seller is actually committing to.
 *
 * The safety callout renders for 'collection' AND 'both' — both are cases
 * where a stranger and a seller end up meeting — and it sits directly under
 * the option that triggered it, above the primary button, never behind a
 * "learn more". Care-toned coral, never error red, per the design.
 */

export const HANDOVER_OPTIONS: { value: LocalHandover; label: string; hint: string }[] = [
  { value: "ships", label: "I send it to them", hint: "You arrange delivery to the buyer." },
  { value: "collection", label: "They come for it", hint: "You agree a meeting point with the buyer." },
  { value: "both", label: "Either works", hint: "You decide with each buyer." },
];

/** Meeting a stranger is the case worth warning about, whichever way the
 * seller arrived at it. */
export function needsSafetyCallout(v: LocalHandover | null): boolean {
  return v === "collection" || v === "both";
}

export const SAFETY_CALLOUT =
  "Do not give your home address to someone you have never met. Agree a public place instead: a mall, a filling station, a busy junction near you. If you are genuinely comfortable sharing your address that is your call, but public is safer.";

export default function DeliveryHandoverChoice({
  value, onChange, disabled, layout = "stack",
}: {
  value: LocalHandover | null;
  onChange: (v: LocalHandover) => void;
  disabled?: boolean;
  /** "stack" on mobile and in the modal on small screens; "grid" lets CSS
   * lay the three out across at wider widths, per S6/S10/S11. */
  layout?: "stack" | "grid";
}) {
  return (
    <>
      <div className={layout === "grid" ? "mkt-handover-opts grid" : "mkt-handover-opts"}>
        {HANDOVER_OPTIONS.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              className={selected ? "mkt-handover-opt on" : "mkt-handover-opt"}
              onClick={() => onChange(o.value)}
              disabled={disabled}
              aria-pressed={selected}
            >
              {selected && <span className="tick" aria-hidden>✓</span>}
              <span className="body">
                <span className="lbl">{o.label}</span>
                <span className="hint">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {needsSafetyCallout(value) && (
        <div className="mkt-handover-safety">
          <span className="ic" aria-hidden>💛</span>
          <span>{SAFETY_CALLOUT}</span>
        </div>
      )}
    </>
  );
}
