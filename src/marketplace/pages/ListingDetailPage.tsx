import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useListing } from "../data/useListings";
import { mdb } from "../data/mdb";
import {
  formatNaira,
  locationLabel,
  conditionLabel,
  isVerifiedSeller,
  sellerDisplayName,
  sellerTenure,
  sellerInitials,
} from "../lib/format";
import VerifiedBadge from "../components/VerifiedBadge";
import HowThisWorksExplainer from "../components/HowThisWorksExplainer";
import MakeOfferSheet from "../checkout/MakeOfferSheet";
import { fetchBuyerOfferForListing, getOffersEnabled, getMaxDiscountPercent, isLapsed } from "../offers";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";

type FieldType = "select" | "text" | "number" | "boolean";
interface CategoryField {
  id: string;
  field_key: string;
  label: string;
  field_type: FieldType;
  sort_order: number;
}
/** The one field_key seeded on every category, always shown separately with a
 * lighter weight, it is trust context ("why they're selling this"), not a
 * decisive spec like size or brand. */
const REASON_KEY = "reason_for_selling";

/** True when this field actually has something to show: an empty string or a
 * missing key never renders a row, and an explicit boolean false still counts
 * as a real answer (e.g. "Has it been written in? No"), never as unanswered. */
function isAnswered(field: CategoryField, attributes: Record<string, unknown>): boolean {
  const v = attributes[field.field_key];
  if (field.field_type === "boolean") return v === true || v === false;
  if (v === undefined || v === null) return false;
  return String(v).trim() !== "";
}

/**
 * LISTING DETAIL, reskinned to the design: hero photo with back control and
 * thumbnails, price, title, tag chips, seller row, condition and description,
 * an escrow reassurance note, and a sticky Buy now bar. Public, read-only. Buy
 * now is a placeholder for this phase (reveals a "checkout coming soon" note):
 * no payment, no seller contact. All data plumbing is unchanged.
 */
export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: listing, isLoading, isError } = useListing(id);
  const { isLoggedIn } = useCustomerAuth();

  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [offerSheetOpen, setOfferSheetOpen] = useState(false);

  // Make-an-offer (design 23a): whether the feature is on at all, the naira
  // cap (never a percentage), and this buyer's own offer here, if they have
  // made one — at most one ever exists per listing per buyer.
  const { data: offersEnabled = false } = useQuery({
    queryKey: ["mkt-offers-enabled"],
    queryFn: getOffersEnabled,
    staleTime: 60000,
  });
  const { data: maxDiscountPercent = 10 } = useQuery({
    queryKey: ["mkt-max-discount-percent"],
    queryFn: getMaxDiscountPercent,
    enabled: offersEnabled,
    staleTime: 60000,
  });
  const { data: myOffer } = useQuery({
    queryKey: ["buyer-offer", id],
    enabled: !!id && isLoggedIn && offersEnabled,
    queryFn: () => fetchBuyerOfferForListing(id as string),
  });

  // This category's question definitions, so the seller's raw attributes jsonb
  // can be paired with a label, type and sort_order to render. Public readable,
  // read-only here (only create-listing writes an answer).
  const { data: categoryFields = [] } = useQuery({
    queryKey: ["mkt-detail-category-fields", listing?.category_id],
    enabled: !!listing?.category_id,
    queryFn: async (): Promise<CategoryField[]> => {
      const { data } = await mdb.from("marketplace_category_fields")
        .select("id, field_key, label, field_type, sort_order")
        .eq("category_id", listing!.category_id)
        .order("sort_order")
        .order("field_key");
      return (data ?? []) as unknown as CategoryField[];
    },
    staleTime: 60000,
  });

  const attributes = listing?.attributes ?? {};
  // Hard specs: every answered question except the reason-for-selling default,
  // in sort_order. The reason field renders separately, lighter weight, below.
  const hardSpecs = useMemo(
    () => categoryFields.filter((f) => f.field_key !== REASON_KEY && isAnswered(f, attributes)),
    [categoryFields, attributes],
  );
  const reasonField = categoryFields.find((f) => f.field_key === REASON_KEY);
  const reasonAnswer = reasonField && isAnswered(reasonField, attributes) ? String(attributes[REASON_KEY]) : null;

  if (isLoading) {
    return (
      <div className="mkt-center">
        <BMLoadingAnimation size={160} />
      </div>
    );
  }

  // A sold-out item (last unit gone, status flipped to 'sold') is no longer
  // publicly readable, so a saved or shared link resolves here to null. Show a
  // warm "this one has gone" state with a clear route back to browse.
  if (isError || !listing) {
    return (
      <div className="mkt-center">
        <span className="mkt-st sold" style={{ marginBottom: 4 }}>Sold out</span>
        <div className="mkt-empty-title">Ah, this one has gone</div>
        <div className="mkt-empty-sub">
          It sold or was taken down. Things move fast here, especially the good ones. There is plenty more to see.
        </div>
        <button className="mkt-buy" style={{ maxWidth: 220 }} onClick={() => navigate("/")}>
          See what else is there
        </button>
      </div>
    );
  }

  const qty = Number(listing.quantity ?? 1);
  const available = qty - Number(listing.quantity_sold ?? 0);
  const multi = qty > 1;

  // Belt and braces: a live listing with no stock left (should not happen, the
  // trigger flips it to 'sold') still shows the gone state rather than a dead Buy.
  if (available <= 0) {
    return (
      <div className="mkt-center">
        <span className="mkt-st sold" style={{ marginBottom: 4 }}>Sold out</span>
        <div className="mkt-empty-title">Ah, this one has gone</div>
        <div className="mkt-empty-sub">The last one was just bought. There is plenty more to see.</div>
        <button className="mkt-buy" style={{ maxWidth: 220 }} onClick={() => navigate("/")}>See what else is there</button>
      </div>
    );
  }

  const gallery = (listing.gallery_urls ?? []).filter(Boolean);
  const images = [listing.image_url, ...gallery].filter(Boolean) as string[];
  const hero = activeImage ?? listing.image_url ?? images[0] ?? null;
  const verified = isVerifiedSeller(listing);
  const tenure = sellerTenure(listing);

  // Make-an-offer state (design 23a). An accepted/counter_accepted offer is
  // PRIVATE to this buyer — the listing's public final_price_naira is
  // unchanged for everyone else, multi-quantity or not, this only overrides
  // what THIS buyer sees and pays.
  const maxDiscountNaira = Math.round(listing.final_price_naira * maxDiscountPercent / 100);
  const offerAccepted = myOffer && (myOffer.status === "accepted" || myOffer.status === "counter_accepted");
  const myPrice = offerAccepted ? (myOffer.status === "counter_accepted" ? myOffer.counter_buyer_price_naira! : myOffer.buyer_price_naira) : null;
  const myDiscount = offerAccepted && myPrice != null ? listing.final_price_naira - myPrice : 0;
  // Anything else already spent this buyer's one offer here (declined, lapsed,
  // still pending, or awaiting their own reply to a counter) — Buy now stays
  // open at the listed price regardless, per design O10.
  const offerSpent = !!myOffer && !offerAccepted;
  const offerPendingOrCountered = !!myOffer && (myOffer.status === "countered" || (myOffer.status === "pending" && !isLapsed(myOffer)));

  function openOfferSheet() {
    if (!isLoggedIn) { sendToMarketplaceLogin(`/listing/${listing.id}`, "offer"); return; }
    setOfferSheetOpen(true);
  }

  return (
    <div className="mkt-detail">
      {/* Gallery + panel are grouped so the desktop layout (>=1024px) can place them
          as two columns. On mobile both wrappers are display:contents, so the hero,
          thumbs, body and buy bar lay out exactly as before, single column. */}
      <div className="mkt-detail-gallery">
        <div className="mkt-hero">
          {hero ? <img src={hero} alt={listing.title} /> : null}
          <button className="mkt-back" onClick={() => navigate("/")} aria-label="Back to marketplace">
            ‹
          </button>
        </div>

        {images.length > 1 ? (
          <div className="mkt-thumbs">
            {images.map((url) => (
              <button
                key={url}
                className={url === hero ? "mkt-thumb active" : "mkt-thumb"}
                onClick={() => setActiveImage(url)}
                aria-label="View image"
              >
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mkt-detail-panel">
      <div className="mkt-detail-body">
        <div className="mkt-detail-priceblock">
          {offerAccepted && myPrice != null ? (
            <div className="mkt-offer-accepted" style={{ marginBottom: 8 }}>
              <span className="tick">✓</span>
              <span>The seller said yes to your offer</span>
            </div>
          ) : null}
          <div className="mkt-detail-price" style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
            <span>{formatNaira(offerAccepted && myPrice != null ? myPrice : listing.final_price_naira)}{multi ? " each" : ""}</span>
            {offerAccepted && myPrice != null && (
              <>
                <span style={{ font: "400 15px/1 'Lato', sans-serif", color: "var(--mkt-muted-2)", textDecoration: "line-through" }}>{formatNaira(listing.final_price_naira)}</span>
                <span className="mkt-offer-discount-tag">{formatNaira(myDiscount)} off, just for you</span>
              </>
            )}
          </div>
          <h1 className="mkt-detail-title">{listing.title}</h1>
          {offerAccepted && <div className="mkt-help">This price is yours alone, everyone else still sees {formatNaira(listing.final_price_naira)}.</div>}
          {multi && (
            <span className={available === 1 ? "mkt-avail low" : "mkt-avail"}>{available === 1 ? "Last one" : `${available} available`}</span>
          )}
        </div>

        {multi && (
          <div className="mkt-reassure">
            <div className="mkt-reassure-tick">✓</div>
            <div className="mkt-reassure-text">
              {sellerDisplayName(listing)} has confirmed all {qty} are identical. You are buying one, at {formatNaira(listing.final_price_naira)}.
            </div>
          </div>
        )}

        <div className="mkt-tags">
          <span className="mkt-tag cond">{conditionLabel(listing.condition_notes)}</span>
          <span className="mkt-tag loc">{locationLabel(listing)}</span>
          {listing.category?.name ? (
            <span className="mkt-tag cat">{listing.category.name}</span>
          ) : null}
        </div>

        <div className="mkt-seller">
          <div className="mkt-seller-avatar">{sellerInitials(listing)}</div>
          <div className="mkt-seller-text">
            <div className="mkt-seller-name">{sellerDisplayName(listing)}</div>
            {tenure ? <div className="mkt-seller-sub">{tenure}</div> : null}
          </div>
          {verified ? <VerifiedBadge size="lg" /> : null}
        </div>

        {listing.condition_notes ? (
          <div className="mkt-detail-condition">
            <p className="mkt-section-label">Condition notes</p>
            <p className="mkt-detail-text">{listing.condition_notes}</p>
          </div>
        ) : null}

        {/* Category answers (design 17a), between condition notes and description.
            When a category has no hard specs and no reason answered (e.g. bibs),
            neither renders at all, nothing here reads as missing or broken. */}
        {hardSpecs.length > 0 && (
          <div className="mkt-spec">
            <div className="mkt-spec-h">What this listing answers</div>
            {hardSpecs.map((f) => (
              <div className="mkt-spec-row" key={f.id}>
                <span className="k">{f.label}</span>
                {f.field_type === "boolean" ? (
                  attributes[f.field_key] === true ? (
                    <span className="v yes"><span className="ic">✓</span>Yes</span>
                  ) : (
                    <span className="v no"><span className="ic">✕</span>No</span>
                  )
                ) : (
                  <span className="v">{String(attributes[f.field_key])}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {reasonAnswer && (
          <div className="mkt-spec-note">
            <span className="ic">i</span>
            <span>Why they're selling: “{reasonAnswer}”</span>
          </div>
        )}

        <div className="mkt-detail-description">
          <p className="mkt-section-label">Description</p>
          <p className="mkt-detail-text">{listing.description}</p>
        </div>

        <HowThisWorksExplainer sellerName={sellerDisplayName(listing)} />

        {/* Make an offer (design 23a). Hidden entirely when the feature is
            off, or once this buyer has spent their one offer here in any
            direction — both cases simply look like a listing that never had
            one, per design O10, never a broken or greyed-out control. */}
        {offersEnabled && !offerAccepted && (
          offerPendingOrCountered ? (
            <button type="button" className="mkt-offer-entry" onClick={() => navigate(`/listing/${listing.id}/offer`)}>
              {myOffer?.status === "countered" ? "The seller came back with an offer, view it" : "View your offer"}
            </button>
          ) : offerSpent ? (
            <div className="mkt-offer-used">You already made an offer on this</div>
          ) : (
            <button type="button" className="mkt-offer-entry" onClick={openOfferSheet}>Make an offer</button>
          )
        )}
      </div>

      <div className="mkt-buybar">
        <div className="mkt-buybar-price">
          <small>{multi ? "Price each" : "Price"}</small>
          <b>{formatNaira(offerAccepted && myPrice != null ? myPrice : listing.final_price_naira)}</b>
        </div>
        <button className="mkt-buy" onClick={() => navigate(offerAccepted && myOffer ? `/checkout/${listing.id}?offer=${myOffer.id}` : `/checkout/${listing.id}`)}>
          {offerAccepted && myPrice != null ? `Buy now at ${formatNaira(myPrice)}` : multi ? "Buy one now" : "Buy now"}
        </button>
      </div>
      </div>

      {offerSheetOpen && (
        <MakeOfferSheet
          listingId={listing.id}
          listingTitle={listing.title}
          listingImage={listing.image_url}
          listingPrice={listing.final_price_naira}
          maxDiscountNaira={maxDiscountNaira}
          onClose={() => setOfferSheetOpen(false)}
          onSent={() => { setOfferSheetOpen(false); navigate(`/listing/${listing.id}/offer`); }}
        />
      )}
    </div>
  );
}
