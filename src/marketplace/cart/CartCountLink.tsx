import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCartCount, onCartChange } from "./cartStore";

/**
 * The cart's count in the header, visible across the marketplace.
 *
 * Hidden entirely when the cart is empty, rather than sitting there showing
 * a zero: an empty cart is not a thing anyone needs reminding of, and a
 * permanent "0" reads as clutter on every page.
 *
 * The count comes from localStorage (cartStore), so it subscribes to
 * onCartChange — which covers BOTH the same tab (a custom event, since
 * localStorage's own "storage" event only fires in other tabs) and other
 * tabs. Adding an item anywhere updates this immediately.
 */
export default function CartCountLink({ className = "mkt-hdr-link" }: { className?: string }) {
  const [count, setCount] = useState(0);

  // Read after mount, never during render: localStorage is not available
  // during SSR/prerender, and this keeps the first paint identical there.
  useEffect(() => {
    const sync = () => setCount(getCartCount());
    sync();
    return onCartChange(sync);
  }, []);

  if (count === 0) return null;

  return (
    <Link to="/cart" className={`${className} mkt-cart-count`} aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
      <span className="ic" aria-hidden>🛍️</span>
      <span className="n">{count}</span>
    </Link>
  );
}
