import { Link } from "react-router-dom";
import type { Deliverability } from "../deliverability";

/**
 * An item that cannot reach this buyer (design 45a B2/B3/B6).
 *
 * Always three things: what is wrong, said plainly and without blame on
 * either side; a way to remove the item; and a same-weight link straight to
 * its category, so this reads as a swap rather than a dead end.
 *
 * On a single-item Buy now there is nothing to keep, so `onRemove` is
 * omitted and the category link becomes the single primary action — the
 * only genuine way forward from that screen.
 */
export default function UndeliverableCard({
  item, message, onRemove, variant = "row",
}: {
  item: Deliverability;
  /** The personalised sentence, already built. */
  message: string;
  onRemove?: () => void;
  variant?: "row" | "full";
}) {
  const catName = item.category_name?.toLowerCase() || "items";
  const catHref = item.category_slug ? `/?category=${encodeURIComponent(item.category_slug)}` : "/";

  if (variant === "full") {
    return (
      <div className="mkt-undeliv full">
        <div className="ic" aria-hidden>···</div>
        <div className="h">{item.seller_first_name || "This seller"} can't send this one to you</div>
        <p className="p">{message} Nobody's done anything wrong here, her items just don't reach every state yet.</p>
        <div className="item">
          <div className="t">{item.title}</div>
        </div>
        <Link className="mkt-primary" style={{ textAlign: "center", textDecoration: "none", display: "block" }} to={catHref}>
          See other {catName}
        </Link>
        <Link className="back" to="/">Back to browse</Link>
      </div>
    );
  }

  return (
    <div className="mkt-undeliv">
      <div className="body">
        <div className="t">{item.title}</div>
        <div className="why">{message}</div>
      </div>
      <div className="acts">
        {onRemove && (
          <button type="button" className="rm" onClick={onRemove}>Remove item</button>
        )}
        <Link className="alt" to={catHref}>See other {catName}</Link>
      </div>
    </div>
  );
}
