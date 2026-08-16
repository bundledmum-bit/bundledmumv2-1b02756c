import type { CSSProperties } from "react";

/**
 * The buyer protection reassurance, word for word wherever it appears. This
 * file is the ONLY place the sentence is written — everywhere else imports
 * it. It was written on the payment confirmation page (PaymentReturnPage.tsx)
 * to be accurate about what the platform actually guarantees: a dispute can
 * be rejected when the item is found to match its description, so this is
 * never reworded or varied per page, only ever reused verbatim (see
 * marketplace handoff §75).
 *
 * `style` is for placement only (e.g. centering it in a flex column footer)
 * — it never touches the wording or the .mkt-sticker visual treatment.
 */
export default function ProtectionBadge({ style }: { style?: CSSProperties }) {
  return (
    <div className="mkt-sticker" style={style}>
      <span className="ic">🛡</span>We refund you if it's not as described
    </div>
  );
}
