import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useListing } from "../data/useListings";
import { formatNaira } from "./orders";
import { fetchBuyerOfferForListing, buyerRespondToCounter, isLapsed } from "../offers";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

/**
 * The buyer's own offer on a listing (design 23a O2 waiting, O3 seller
 * countered, O5 declined/lapsed, O9 sold out while pending). Accepted and
 * counter_accepted redirect straight back to listing detail, that is where
 * the personalised price and Buy now live (design O4) — nothing to show
 * here for those two states.
 */
export default function BuyerOfferPage() {
  const { id: listingId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { loading: authLoading, isLoggedIn } = useCustomerAuth();

  if (!authLoading && !isLoggedIn) sendToMarketplaceLogin(`/listing/${listingId}/offer`, "offer");

  const { data: listing, isLoading: listingLoading } = useListing(listingId);
  const { data: offer, isLoading: offerLoading } = useQuery({
    queryKey: ["buyer-offer", listingId],
    enabled: !!listingId && isLoggedIn,
    queryFn: () => fetchBuyerOfferForListing(listingId as string),
  });

  async function respond(accept: boolean) {
    if (!offer) return;
    const ok = await buyerRespondToCounter(offer.id, accept);
    if (ok) {
      qc.invalidateQueries({ queryKey: ["buyer-offer", listingId] });
      if (accept) { navigate(`/listing/${listingId}`, { replace: true }); return; }
    }
  }

  if (authLoading || listingLoading || offerLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  if (!offer) {
    return (
      <div className="mkt-center">
        <div className="mkt-empty-title">No offer here</div>
        <div className="mkt-empty-sub">You have not made an offer on this listing.</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate(listingId ? `/listing/${listingId}` : "/")}>Back to the listing</button>
      </div>
    );
  }

  // Accepted / counter_accepted have nowhere to be here, the personalised
  // price and Buy now live on listing detail itself (design O4).
  if (offer.status === "accepted" || offer.status === "counter_accepted") {
    navigate(`/listing/${listingId}`, { replace: true });
    return null;
  }

  const title = listing?.title || "This item";
  const image = listing?.image_url || null;
  const listedPrice = listing?.final_price_naira ?? 0;

  // Sold out mid-offer (design O9) — shown whether the listing went sold or
  // was otherwise taken down while this offer sat open.
  if (!listing || listing.status !== "live") {
    return (
      <div className="mkt-center">
        <span className="mkt-st sold" style={{ marginBottom: 4 }}>···</span>
        <div className="mkt-empty-title">This one's gone</div>
        <div className="mkt-empty-sub">Someone else bought it before the seller replied to your offer. Nothing was charged to you, and your offer closes here.</div>
        <button className="mkt-primary" style={{ maxWidth: 260 }} onClick={() => navigate("/")}>Browse similar items</button>
      </div>
    );
  }

  const lapsed = isLapsed(offer);

  // Waiting on the seller (design O2)
  if (offer.status === "pending" && !lapsed) {
    return (
      <div className="mkt-offer-page">
        <div className="mkt-sell-head"><div className="inner"><div className="row"><button className="mkt-sell-back" onClick={() => navigate(`/listing/${listingId}`)} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>Your offer</h1></div></div></div>
        <div className="mkt-sell-body">
          <div className="mkt-co-summary">
            <div className="th">{image && <img src={image} alt="" />}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="t">{title}</div><div className="s">Listed at {formatNaira(listedPrice)}</div></div>
          </div>
          <div className="mkt-offer-waiting">
            <div className="ic">⏳</div>
            <div className="hl">Waiting on the seller</div>
            <p>You offered {formatNaira(offer.buyer_discount_naira)} off. They have until {new Date(offer.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to reply. If they do not, this simply lapses and there's no harm done.</p>
          </div>
          <p style={{ textAlign: "center", font: "400 12px/1.4 'Lato', sans-serif", color: "var(--mkt-muted)" }}>You'll hear from us either way, no need to keep checking.</p>
        </div>
      </div>
    );
  }

  // Seller countered (design O3)
  if (offer.status === "countered" && offer.counter_buyer_price_naira != null) {
    const counterDiscount = listedPrice - offer.counter_buyer_price_naira;
    return (
      <div className="mkt-offer-page">
        <div className="mkt-sell-head"><div className="inner"><div className="row"><button className="mkt-sell-back" onClick={() => navigate(`/listing/${listingId}`)} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>They came back with</h1></div></div></div>
        <div className="mkt-sell-body">
          <div className="mkt-co-summary">
            <div className="th">{image && <img src={image} alt="" />}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="t">{title}</div><div className="s" style={{ textDecoration: "line-through" }}>You asked for {formatNaira(offer.buyer_discount_naira)} off</div></div>
          </div>
          <div className="mkt-offer-counter">
            <span className="lbl">Their counter</span>
            <span className="amt">{formatNaira(counterDiscount)} off</span>
            <span className="sub">You'd pay {formatNaira(offer.counter_buyer_price_naira)} if you accept</span>
          </div>
          <p style={{ textAlign: "center", font: "400 12px/1.4 'Lato', sans-serif", color: "var(--mkt-muted)" }}>This is the last round, accept or decline settles it.</p>
          <button className="mkt-primary" onClick={() => respond(true)}>Accept, pay {formatNaira(offer.counter_buyer_price_naira)}</button>
          <button className="mkt-secondary" style={{ borderColor: "var(--mkt-error)", color: "var(--mkt-error)" }} onClick={() => respond(false)}>Decline, buy at {formatNaira(listedPrice)} instead</button>
        </div>
      </div>
    );
  }

  // Declined, counter_declined, or effectively lapsed (design O5)
  const wasDeclined = offer.status === "declined" || offer.status === "counter_declined";
  return (
    <div className="mkt-center">
      <span className="mkt-st sold" style={{ marginBottom: 4 }}>{wasDeclined ? "✕" : "···"}</span>
      <div className="mkt-empty-title">{wasDeclined ? "They said no this time" : "No word back"}</div>
      <div className="mkt-empty-sub">
        {wasDeclined
          ? "No hard feelings, some sellers just cannot move on price. It's still " + formatNaira(listedPrice) + " whenever you're ready."
          : "Your offer window closed. You can still buy at the listed price whenever you like."}
      </div>
      <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate(`/checkout/${listingId}`)}>Buy at {formatNaira(listedPrice)}</button>
      <button className="mkt-secondary" style={{ maxWidth: 240, border: "none" }} onClick={() => navigate("/")}>Keep browsing</button>
    </div>
  );
}
