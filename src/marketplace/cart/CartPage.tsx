import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { formatNaira } from "../checkout/orders";
import { summariseCart, type CartItemSummary } from "./cartOrders";
import { getCartListingIds, removeFromCart, onCartChange } from "./cartStore";
import MarketplaceSeo from "../components/MarketplaceSeo";
import UndeliverableCard from "../components/UndeliverableCard";
import { checkCartDeliverable, deliveryMessage } from "../deliverability";
import { getBuyerState, onBuyerStateChange } from "../lib/buyerState";
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

  // Whether each item can actually reach this buyer. Only meaningful once
  // we know their state, and deliverable is TRUE whenever we cannot say —
  // an unknown state or a seller who never set terms never costs anyone
  // anything here.
  const [buyerState, setBuyerState] = useState<string | null>(() => getBuyerState());
  useEffect(() => onBuyerStateChange(() => setBuyerState(getBuyerState())), []);
  const deliverQ = useQuery({
    queryKey: ["mkt-cart-deliverable", ids, buyerState],
    enabled: ids.length > 0 && !!buyerState,
    staleTime: 30_000,
    queryFn: () => checkCartDeliverable(ids, buyerState),
  });
  const blockedItems = useMemo(
    () => (deliverQ.data ?? []).filter((d) => !d.deliverable),
    [deliverQ.data],
  );
  const blockedIds = useMemo(() => new Set(blockedItems.map((d) => d.listing_id)), [blockedItems]);

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

          {/* An item that cannot reach this buyer. Kept contained to that one
              item — the other seller cards stay completely normal, so the
              disruption reads as one item's problem, not the whole cart's. */}
          {blockedItems.map((d) => (
            <UndeliverableCard
              key={d.listing_id}
              item={d}
              message={deliveryMessage(d, buyerState)?.text ?? d.reason ?? ""}
              onRemove={() => handleRemove(d.listing_id)}
            />
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
              {groups
                // A group whose only items are undeliverable is rendered
                // above as its own card, so skipping it here avoids an
                // empty seller card with nothing under the heading.
                .filter((g) => g.items.some((it) => !blockedIds.has(it.listing_id)))
                .map((g, i) => (
                <div key={g.sellerId} className="mkt-cartcard">
                  <div className="mkt-cartcard-head">
                    <span>From {g.sellerName || "a seller"}</span>
                    {sellerCount > 1 && <span className="meta">delivery {i + 1} of {sellerCount}</span>}
                  </div>
                  {g.items.filter((item) => !blockedIds.has(item.listing_id)).map((item) => (
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
                {/* ONE FEE PER ITEM, not one per cart.
                    This said "Service fee, once" from before the fee became a
                    percentage per item, and it kept saying it afterwards. So a
                    buyer with three items was told one fee here and charged
                    three at checkout: three separate fees totalling N2,400 on
                    a real three-item order. That is the exact thing the FAQ
                    answer was written to prevent, being contradicted one screen
                    earlier, mid-purchase.
                    The count is stated because the buyer already knows how many
                    items they have, so "3 items, 3 fees" is checkable on the
                    spot rather than a surprise at the next screen. */}
                <div className="row">
                  <span>Service fee{itemCount > 1 ? `, ${itemCount} items` : ""}</span>
                  <b>Shown at checkout</b>
                </div>
                <div className="rule" />
                <div className="row total"><span>Total</span><b>{formatNaira(itemsTotal)}</b></div>
                <div className="note">
                  {itemCount > 1
                    ? "A service fee is charged on each item, so there are " + itemCount + ". Checkout shows every fee before you pay."
                    : "The service fee and Paystack fee are added at checkout."}
                </div>
                {/* Blocked while anything in the cart cannot reach them.
                    Disabled rather than hidden, with the reason named, so
                    it is obvious what to do rather than mysteriously
                    missing. */}
                <button
                  className="mkt-buy"
                  disabled={blockedItems.length > 0}
                  onClick={() => { if (blockedItems.length === 0) navigate("/checkout/cart"); }}
                >
                  Proceed to checkout
                </button>
                {blockedItems.length > 0 && (
                  <div className="mkt-cart-blocked-note">
                    Remove {blockedItems.length === 1 ? "that item" : "those items"} to proceed.
                  </div>
                )}
                <Link to="/" className="mkt-cart-continue desktop-only">Continue shopping</Link>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
