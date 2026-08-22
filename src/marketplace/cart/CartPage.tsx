import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { formatNaira } from "../checkout/orders";
import { summariseCart, type CartItemSummary } from "./cartOrders";
import { getCartListingIds, removeFromCart, onCartChange } from "./cartStore";
import MarketplaceSeo from "../components/MarketplaceSeo";
import SellerDeliveryLine, { useDeliveryTerms } from "../components/SellerDeliveryLine";

/** One item row, with its seller's delivery terms underneath. The terms
 * query is per listing, so a card renders the instant its own resolves
 * rather than waiting on the others — and renders nothing at all when the
 * seller has not answered, which is the common case. */
function CartItemRow({ item, onRemove }: { item: CartItemSummary; onRemove: () => void }) {
  const { data: terms } = useDeliveryTerms(item.listing_id);
  // The listing's own area, never an address. "Ikeja, Lagos" -> "Ikeja".
  const area = (item.location || "").split(",")[0]?.trim() || null;
  return (
    <div className="mkt-cartcard-row">
      <div className="th">{item.image_url && <img src={item.image_url} alt="" />}</div>
      <div className="body">
        <div className="t">{item.title}</div>
        <div className="price">{formatNaira(item.price)}</div>
        <SellerDeliveryLine terms={terms} sellerName={item.seller_name} area={area} size="sm" />
      </div>
      <button className="rm" onClick={onRemove} aria-label={`Remove ${item.title} from cart`}>Remove</button>
    </div>
  );
}

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
          <div className="mkt-cart-empty-icon" aria-hidden />
          <div className="mkt-cart-empty-title">Nothing here yet</div>
          <div className="mkt-cart-empty-sub">Find something in prams, clothing or feeding, it lands here when you add it to your cart.</div>
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

          {/* Deliveries banner only when there is genuinely more than one:
              a "1 delivery" version of this would be noise. */}
          {sellerCount > 1 && (
            <div className="mkt-cart-deliveries">
              {itemCount} item{itemCount === 1 ? "" : "s"} from {sellerCount} sellers, that means {sellerCount} separate deliveries once you pay.
            </div>
          )}

          {/* Two real layouts, not one reflowed: mobile stacks the cards
              then the summary, desktop puts the cards in a column beside a
              sticky summary rail that stays in view while scrolling. */}
          <div className="mkt-cart-layout">
            <div className="mkt-cart-col">
              {groups.map((g, i) => (
                <div key={g.sellerId} className="mkt-cartcard">
                  <div className="mkt-cartcard-head">
                    <span>From {g.sellerName || "a seller"}</span>
                    {sellerCount > 1 && <span className="meta">delivery {i + 1} of {sellerCount}</span>}
                  </div>
                  {g.items.map((item) => (
                    <CartItemRow key={item.listing_id} item={item} onRemove={() => handleRemove(item.listing_id)} />
                  ))}
                </div>
              ))}
              <Link to="/" className="mkt-cart-continue mobile-only">Continue shopping</Link>
            </div>

            {itemCount > 0 && (
              <aside className="mkt-cart-summary">
                <div className="h">Order summary</div>
                <div className="row"><span>Items ({itemCount})</span><b>{formatNaira(itemsTotal)}</b></div>
                {/* The fee is charged once for the whole cart, not per item
                    and not per seller — worth stating where the number is. */}
                <div className="row"><span>Service fee, once</span><b>Shown at checkout</b></div>
                <div className="rule" />
                <div className="row total"><span>Total</span><b>{formatNaira(itemsTotal)}</b></div>
                <div className="note">Service fee and Paystack fee are added at checkout.</div>
                <button className="mkt-buy" onClick={() => navigate("/checkout/cart")}>Proceed to checkout</button>
                <Link to="/" className="mkt-cart-continue desktop-only">Continue shopping</Link>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
