import { useState } from "react";
import { useSeller } from "./useSeller";
import { saveListingDelivery, type LocalHandover } from "./deliveryPrefs";

/**
 * Per-listing delivery, on the seller dashboard.
 *
 * Every listing follows the seller's default until it is overridden here.
 * The distinction is shown plainly rather than left to be inferred: a row
 * either says "Following your default" or carries an "Overridden" chip, and
 * an override can always be cleared back to the default — that clearing is
 * the whole point of passing null to seller_set_listing_delivery.
 */
export default function ListingDeliveryControl({
  listingId, sellsNationwide, localHandover, onSaved,
}: {
  listingId: string;
  /** The listing's OWN override columns. null on both means it is simply
   * following the seller default, NOT that nothing is set anywhere. */
  sellsNationwide: boolean | null;
  localHandover: LocalHandover | null;
  onSaved: () => void;
}) {
  const { seller } = useSeller();
  const overridden = sellsNationwide !== null || localHandover !== null;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nw, setNw] = useState<boolean | null>(sellsNationwide);
  const [lh, setLh] = useState<LocalHandover | null>(localHandover);

  // What this listing actually resolves to right now, for the summary line:
  // its own override if it has one, otherwise the seller's default.
  const effNw = sellsNationwide !== null ? sellsNationwide : seller?.sells_nationwide ?? null;
  const effLh = localHandover !== null ? localHandover : (seller?.local_handover as LocalHandover | null) ?? null;
  const summary = effNw === null || effLh === null
    ? "Not set yet"
    : `${effNw ? "Anywhere in Nigeria" : "Your state only"} · ${effLh === "ships" ? "you send it" : effLh === "collection" ? "they collect" : "either"}`;

  async function apply(next: { sellsNationwide: boolean | null; localHandover: LocalHandover | null }) {
    setBusy(true); setError(null);
    const res = await saveListingDelivery({ listingId, ...next });
    setBusy(false);
    if (!res.ok) { setError(res.message ?? "We could not save that just now. Please try again."); return; }
    setOpen(false);
    onSaved();
  }

  return (
    <div className="mkt-listing-delivery">
      <div className="row">
        <span className="sum">{summary}</span>
        {overridden
          ? <span className="chip">Just this item</span>
          : <span className="chip default">Following your default</span>}
        <button type="button" className="mkt-lrow-action" onClick={() => setOpen((v) => !v)}>{open ? "Close" : "Change"}</button>
      </div>

      {open && (
        <div className="edit">
          <span className="mkt-delivery-q">Where will you sell this one?</span>
          <div className="mkt-chips">
            <button type="button" className={nw === true ? "mkt-chip on" : "mkt-chip"} onClick={() => setNw(true)}>Anywhere in Nigeria</button>
            <button type="button" className={nw === false ? "mkt-chip on" : "mkt-chip"} onClick={() => setNw(false)}>Only my state</button>
          </div>
          <span className="mkt-delivery-q">For buyers in your state</span>
          <div className="mkt-chips">
            <button type="button" className={lh === "ships" ? "mkt-chip on" : "mkt-chip"} onClick={() => setLh("ships")}>I send it</button>
            <button type="button" className={lh === "collection" ? "mkt-chip on" : "mkt-chip"} onClick={() => setLh("collection")}>They collect</button>
            <button type="button" className={lh === "both" ? "mkt-chip on" : "mkt-chip"} onClick={() => setLh("both")}>Either</button>
          </div>

          {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}

          <div className="acts">
            <button
              type="button" className="mkt-secondary" style={{ flex: 1 }} disabled={busy || nw === null || lh === null}
              onClick={() => apply({ sellsNationwide: nw, localHandover: lh })}
            >
              {busy ? "Saving..." : "Save for this item"}
            </button>
            {/* Clearing sends null for both, which is exactly what returns
                this listing to the seller default. */}
            {overridden && (
              <button type="button" className="mkt-secondary" style={{ flex: 1 }} disabled={busy}
                onClick={() => apply({ sellsNationwide: null, localHandover: null })}>
                Use my default
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
