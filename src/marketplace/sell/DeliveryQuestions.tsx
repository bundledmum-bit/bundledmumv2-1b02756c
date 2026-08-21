import type { LocalHandover } from "./deliveryPrefs";

/**
 * The two delivery questions, asked ONCE and shared by both places that ask
 * them: inline on a seller's first listing (straight after they choose their
 * location) and in the one-time prompt for sellers who joined before this
 * existed. One component so the wording can never drift between them.
 *
 * Deliberately framed as "this applies to everything you list, and you can
 * change it on any single item later" — a seller who feels locked in by a
 * question they have not thought about before is the one most likely to
 * abandon the form here.
 */
export default function DeliveryQuestions({
  sellsNationwide, localHandover, onNationwide, onHandover, showErrors, compact,
}: {
  sellsNationwide: boolean | null;
  localHandover: LocalHandover | null;
  onNationwide: (v: boolean) => void;
  onHandover: (v: LocalHandover) => void;
  showErrors?: boolean;
  /** The prompt version drops the explainer, which its own copy already covers. */
  compact?: boolean;
}) {
  const stateWord = "your own state";
  return (
    <div className="mkt-delivery-qs">
      {!compact && (
        <p className="mkt-delivery-intro">
          Two quick questions about getting your items to buyers. Your answers apply to
          everything you list, and you can change them on any single item later.
        </p>
      )}

      <div className="mkt-field">
        <span className="mkt-delivery-q">Will you sell anywhere in Nigeria, or only near you?</span>
        <div className="mkt-chips">
          <button
            type="button"
            className={sellsNationwide === true ? "mkt-chip on" : "mkt-chip"}
            onClick={() => onNationwide(true)}
          >
            Anywhere in Nigeria
          </button>
          <button
            type="button"
            className={sellsNationwide === false ? "mkt-chip on" : "mkt-chip"}
            onClick={() => onNationwide(false)}
          >
            Only buyers in {stateWord}
          </button>
        </div>
        {showErrors && sellsNationwide === null && (
          <span className="mkt-field-error">Please choose where you are willing to sell.</span>
        )}
      </div>

      <div className="mkt-field">
        <span className="mkt-delivery-q">For buyers in your state, how do they get it?</span>
        <div className="mkt-chips">
          <button type="button" className={localHandover === "ships" ? "mkt-chip on" : "mkt-chip"} onClick={() => onHandover("ships")}>
            I send it to them
          </button>
          <button type="button" className={localHandover === "collection" ? "mkt-chip on" : "mkt-chip"} onClick={() => onHandover("collection")}>
            They collect it
          </button>
          <button type="button" className={localHandover === "both" ? "mkt-chip on" : "mkt-chip"} onClick={() => onHandover("both")}>
            Either is fine
          </button>
        </div>
        {showErrors && localHandover === null && (
          <span className="mkt-field-error">Please choose how buyers near you receive the item.</span>
        )}
        {/* The one thing a seller must not be left guessing about, said where
            the choice is actually made rather than buried in a policy page. */}
        {(localHandover === "collection" || localHandover === "both") && (
          <span className="mkt-delivery-privacy">
            Your address is never shown on your listings. Buyers only see your area and state.
            You share where to come only after they have paid, in your own chat with them.
          </span>
        )}
      </div>
    </div>
  );
}
