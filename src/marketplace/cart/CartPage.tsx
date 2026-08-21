import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { formatNaira } from "../checkout/orders";
import { summariseCart, type CartItemSummary } from "./cartOrders";
import { getCartListingIds, removeFromCart, onCartChange } from "./cartStore";
import MarketplaceSeo from "../components/MarketplaceSeo";

/** First two initials of a seller's display name, e.g. "Amaka O." -> "AO",
 * matching the avatar-circle treatment already used on the design. */
function sellerInitialsFrom(name: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface SellerGroup {
  sellerId: string;
  sellerName: string | null;
  items: CartItemSummary[];
  total: number;
}

/**
 * Cart (design C3–C6). Availability is re-checked against summarise_cart
 * every time this page loads — never trusted from what was true when an
 * item was added. A sold-out or delisted item is shown once, greyed and
 * struck through, then actually dropped from the stored cart so it never
 * reappears on the next visit.
 */
export default function CartPage() {
  const navigate = useNavigate();
  const [ids, setIds] = useState<string[]>(() => getCartListingIds());
  const [justRemoved, setJustRemoved] = useState<{ id: string; title: string | null }[]>([]);

  useEffect(() => onCartChange(() => setIds(getCartListingIds())), []);

  const cartQ = useQuery({
    queryKey: ["mkt-cart-summary", ids],
    queryFn: () => summariseCart(ids),
    enabled: ids.length > 0,
  });

  // Prune anything the server says is gone, exactly once per load, and
  // remember what was pruned so this render can still show the "sold while
  // in your cart" row before it disappears for good.
  useEffect(() => {
    if (!cartQ.data) return;
    const returnedIds = new Set(cartQ.data.map((r) => r.listing_id));
    const missing = ids.filter((id) => !returnedIds.has(id));
    const sold = cartQ.data.filter((r) => !r.is_available);
    const gone = [
      ...missing.map((id) => ({ id, title: null as string | null })),
      ...sold.map((r) => ({ id: r.listing_id, title: r.title })),
    ];
    if (gone.length > 0) {
      setJustRemoved(gone);
      gone.forEach((g) => removeFromCart(g.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartQ.data]);

  const available = useMemo(() => (cartQ.data ?? []).filter((r) => r.is_available), [cartQ.data]);

  const groups = useMemo<SellerGroup[]>(() => {
    const bySeller = new Map<string, SellerGroup>();
    for (const item of available) {
      const existing = bySeller.get(item.seller_id);
      if (existing) {
        existing.items.push(item);
        existing.total += item.price;
      } else {
        bySeller.set(item.seller_id, { sellerId: item.seller_id, sellerName: item.seller_name, items: [item], total: item.price });
      }
    }
    return Array.from(bySeller.values());
  }, [available]);

  const itemsTotal = available.reduce((s, r) => s + r.price, 0);
  const sellerCount = groups.length;
  const itemCount = available.length;

  function handleRemove(listingId: string) {
    removeFromCart(listingId);
  }

  if (ids.length === 0 && justRemoved.length === 0) {
    return (
      <div className="mkt-cart-page">
        <MarketplaceSeo title="Your cart" description="Items you've added, ready to check out together." noindex />
        <div className="mkt-cart-header">
          <button className="mkt-back" onClick={() => navigate("/")} aria-label="Back to marketplace">‹</button>
          <h1>Your cart</h1>
        </div>
        <div className="mkt-cart-empty">
          <div className="mkt-cart-empty-icon">🛍️</div>
          <div className="mkt-cart-empty-title">Your cart is empty</div>
          <div className="mkt-cart-empty-sub">Add a few things you like, then check out for all of them at once.</div>
          <Link to="/" className="mkt-primary" style={{ display: "inline-block", textDecoration: "none", textAlign: "center", maxWidth: 260 }}>Start browsing</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mkt-cart-page">
      <MarketplaceSeo title="Your cart" description="Items you've added, ready to check out together." noindex />
      <div className="mkt-cart-header">
        <button className="mkt-back" onClick={() => navigate("/")} aria-label="Back to marketplace">‹</button>
        <h1>{itemCount > 0 ? `Your cart, ${itemCount} item${itemCount === 1 ? "" : "s"}` : "Your cart"}</h1>
      </div>

      {cartQ.isLoading ? (
        <BMLoadingAnimation />
      ) : (
        <>
          {justRemoved.length > 0 && (
            <div className="mkt-cart-sold-alert">
              <span className="m">!</span>
              <span>
                {justRemoved.length === 1
                  ? `${justRemoved[0].title || "An item"} sold to someone else while it sat in your cart. It's been removed, nothing was charged.`
                  : `${justRemoved.length} items sold to someone else while they sat in your cart. They've been removed, nothing was charged.`}
              </span>
            </div>
          )}

          {justRemoved.map((g) => (
            <div key={g.id} className="mkt-cart-item-row sold">
              <div className="th" />
              <div className="body">
                <div className="t">{g.title || "This item"}</div>
                <div className="s">No longer available</div>
              </div>
            </div>
          ))}

          {itemCount > 0 && (
            sellerCount <= 1 ? (
              <div className="mkt-cart-banner single">
                <span className="ic">✓</span>
                <span>
                  All from {groups[0]?.sellerName || "one seller"}, one delivery to arrange with {sellerCount === 1 ? "them" : "them"}.
                </span>
              </div>
            ) : (
              <div className="mkt-cart-banner multi">
                <span className="badge">{sellerCount}</span>
                <div>
                  <div className="head">{sellerCount} sellers, {sellerCount} separate deliveries</div>
                  <div className="body">
                    One payment, but you'll arrange delivery with each seller yourself, on WhatsApp, after you pay
                    {sellerCount > 3 ? `, that's ${sellerCount} separate WhatsApp conversations to arrange` : ""}.
                  </div>
                </div>
              </div>
            )
          )}

          {groups.map((g, i) => (
            <div key={g.sellerId} className="mkt-cart-seller-group">
              <div className="mkt-cart-seller-head">
                <span className="avatar">{sellerInitialsFrom(g.sellerName)}</span>
                <span className="name">{g.sellerName || "Seller"}</span>
                {sellerCount > 1 && (
                  <span className="meta">· {g.items.length} item{g.items.length === 1 ? "" : "s"} · delivery {i + 1} of {sellerCount}</span>
                )}
              </div>
              <div className="mkt-cart-item-list">
                {g.items.map((item) => (
                  <div key={item.listing_id} className="mkt-cart-item-row">
                    <div className="th">{item.image_url && <img src={item.image_url} alt={item.title} />}</div>
                    <div className="body">
                      <div className="t">{item.title}</div>
                      <div className="price">{formatNaira(item.price)}</div>
                    </div>
                    <button className="x" onClick={() => handleRemove(item.listing_id)} aria-label={`Remove ${item.title} from cart`}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {itemCount > 0 && (
            <>
              <Link to="/" className="mkt-cart-continue">← Continue shopping</Link>
              <div className="mkt-cart-footer">
                <div className="items">
                  <span>Items</span>
                  <b>{formatNaira(itemsTotal)}</b>
                </div>
                <button className="mkt-buy" onClick={() => navigate("/cart/checkout")}>Proceed to checkout</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
