import { useMemo, useState } from "react";
import { formatNaira } from "./orders";
import { buyerMakeOffer } from "../offers";

/**
 * Make an offer (design 23a O1). Own overlay class (.mkt-offer-sheet), not
 * the shared .mkt-sheet-overlay every other confirm sheet in this app uses,
 * so this alone can become a centred desktop modal without changing any
 * other sheet's behaviour (per the design's desktop note).
 *
 * The cap is shown and enforced in NAIRA only, never a percentage, computed
 * from marketplace_max_discount_percent against the buyer-facing price —
 * the same figure buyer_make_offer itself checks against server side, so
 * the client-side block and the server's are never out of step.
 */
export default function MakeOfferSheet({
  listingId, listingTitle, listingImage, listingPrice, maxDiscountNaira, onClose, onSent,
}: {
  listingId: string;
  listingTitle: string;
  listingImage: string | null;
  listingPrice: number;
  maxDiscountNaira: number;
  onClose: () => void;
  onSent: (offerId: string) => void;
}) {
  const [discount, setDiscount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discountNum = Number(discount);
  const isValid = discount.trim() !== "" && isFinite(discountNum) && discountNum > 0;
  const overCap = isValid && discountNum > maxDiscountNaira;
  const youdPay = useMemo(() => (isValid ? Math.max(0, listingPrice - discountNum) : listingPrice), [isValid, discountNum, listingPrice]);

  async function send() {
    if (!isValid) { setError("Enter how much you would like off."); return; }
    if (overCap) { setError("That is more than you can ask off this item."); return; }
    setBusy(true); setError(null);
    const res = await buyerMakeOffer(listingId, discountNum);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    onSent(res.offerId);
  }

  return (
    <div className="mkt-offer-sheet-overlay" onClick={() => !busy && onClose()}>
      <div className="mkt-offer-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>Make an offer</h3>
        <p className="sub">You get one offer on this listing, so make it count. The seller can accept, decline, or come back with a different number.</p>

        <div className="mkt-co-summary">
          <div className="th">{listingImage && <img src={listingImage} alt="" />}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{listingTitle}</div>
            <b className="nun" style={{ font: "900 16px/1.4 Nunito, sans-serif" }}>{formatNaira(listingPrice)}</b>
          </div>
        </div>

        <div className="mkt-field">
          <span className="mkt-uplabel">How much off</span>
          <input
            className={overCap ? "mkt-input error" : "mkt-input"}
            style={!overCap && isValid ? { borderColor: "var(--mkt-green)", borderWidth: 1.5 } : undefined}
            value={discount}
            onChange={(e) => { setDiscount(e.target.value.replace(/[^0-9]/g, "")); if (error) setError(null); }}
            placeholder="e.g. 4,000"
            inputMode="numeric"
          />
          {overCap ? (
            <span style={{ font: "400 12px/1.4 'Lato', sans-serif", color: "var(--mkt-error)" }}>The most you can ask off this item is {formatNaira(maxDiscountNaira)}.</span>
          ) : (
            <span className="mkt-help">Most they'll consider is <b style={{ color: "var(--mkt-black)" }}>{formatNaira(maxDiscountNaira)} off</b>.</span>
          )}
        </div>

        <div className="mkt-pricecard" style={{ padding: "12px", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <span className="lbl">If they say yes, you'd pay</span>
          <span className="see">{formatNaira(youdPay)}</span>
        </div>

        {error && !overCap && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}

        <button className="mkt-primary" onClick={send} disabled={busy || !isValid || overCap}>{busy ? "Sending..." : "Send offer"}</button>
      </div>
    </div>
  );
}
