import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { track } from "@/lib/metaPixel";
import { useListing } from "../data/useListings";
import { mdb } from "../data/mdb";
import { sendMarketplaceConversionEvent } from "../lib/metaConversion";
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
import { useSeller } from "../sell/useSeller";
import { useMarketplaceWhatsAppNumber } from "../lib/whatsapp";
import { fetchGoneListingContext, fetchOwnListingIfMine } from "../lib/goneListing";
import NotFoundOrGoneScreen, { type NotFoundCase } from "../components/NotFoundOrGoneScreen";
import MarketplaceTitle from "../components/MarketplaceTitle";

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
  const { isLoggedIn, user } = useCustomerAuth();
  const { seller, loading: sellerLoading } = useSeller();
  const waNumber = useMarketplaceWhatsAppNumber();

  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [offerSheetOpen, setOfferSheetOpen] = useState(false);

  // Not live: figure out which of the four situations this is. Ownership is
  // decided by the database (RLS on marketplace_listings), not client-side —
  // fetchOwnListingIfMine only ever returns a row when this id genuinely
  // belongs to the logged-in seller, regardless of status.
  const goneEnabled = !!id && !isLoading && (isError || !listing);
  const { data: goneContext, isLoading: goneLoading } = useQuery({
    queryKey: ["mkt-gone-context", id],
    enabled: goneEnabled,
    queryFn: () => fetchGoneListingContext(id as string),
  });
  const { data: ownListing, isLoading: ownLoading } = useQuery({
    queryKey: ["mkt-own-listing", id, seller?.id],
    enabled: goneEnabled && !sellerLoading && !!seller?.id,
    queryFn: () => fetchOwnListingIfMine(id as string, seller!.id),
  });

  // Make-an-offer (design 23a): whether the feature is on at all, the naira
  // cap (never a percentage), and this buyer's own offer here, if they have
  // made one — at most one ever exists per listing per buyer.
  const { data: offersEnabled = false } = useQuery({
    queryKey: ["mkt-offers-enabled"],
    queryFn: getOffersEnabled,
    staleTime: 60000,
  });
  const { data: maxDiscountPercent } = useQuery({
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

  // A signed-in buyer's phone, for ViewContent's optional CAPI fields — email
  // comes straight off the auth user, phone needs the customers row (same
  // lookup checkout's own profileQ already does).
  const { data: buyerPhone } = useQuery({
    queryKey: ["mkt-viewcontent-phone"],
    enabled: isLoggedIn,
    staleTime: 60000,
    queryFn: async () => {
      const { data: auth } = await mdb.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return null;
      const { data } = await mdb.from("customers").select("phone").eq("auth_user_id", uid).maybeSingle();
      return (data as { phone: string | null } | null)?.phone ?? null;
    },
  });

  // ViewContent, fired once per genuinely live view — never on the gone,
  // sold, removed or 404 states below, which is why this is gated on the
  // same stock check those branches use, not just "listing loaded". Fire
  // and forget: never blocks render, and any failure is swallowed silently,
  // never visible to the visitor.
  const isLiveView = !isLoading && !isError && !!listing
    && (Number(listing.quantity ?? 1) - Number(listing.quantity_sold ?? 0)) > 0;
  const viewContentFired = useRef(false);
  useEffect(() => {
    if (!isLiveView || !listing || viewContentFired.current) return;
    viewContentFired.current = true;
    const eventId = crypto.randomUUID();
    const email = isLoggedIn ? (user?.email ?? undefined) : undefined;
    const phone = buyerPhone ?? undefined;
    track("ViewContent", { content_ids: [listing.id], content_name: listing.title, value: listing.final_price_naira, currency: "NGN" }, eventId);
    sendMarketplaceConversionEvent({
      event_name: "ViewContent",
      event_id: eventId,
      event_source_url: window.location.href,
      content_id: listing.id,
      content_name: listing.title,
      value: listing.final_price_naira,
      email,
      phone,
    });
  }, [isLiveView, listing?.id]);

  if (isLoading) {
    return (
      <div className="mkt-center">
        <BMLoadingAnimation size={160} />
      </div>
    );
  }

  // A sold-out item (last unit gone, status flipped to 'sold') is no longer
  // publicly readable, so a saved or shared link resolves here to null.
  // Which of the four situations this is (sold / removed / wrong URL / the
  // seller's own view) is still resolving — wait for both queries rather
  // than flash the buyer-facing case before we know it's the seller's own.
  if (isError || !listing) {
    if (goneLoading || sellerLoading || (!!seller && ownLoading)) {
      return (
        <div className="mkt-center">
          <BMLoadingAnimation size={160} />
        </div>
      );
    }

    let notFoundCase: NotFoundCase;
    if (ownListing) {
      notFoundCase = ownListing.status === "sold"
        ? { kind: "ownSold", title: ownListing.title, price: ownListing.final_price_naira, imageUrl: ownListing.image_url }
        : { kind: "ownRemoved", title: ownListing.title, imageUrl: ownListing.image_url, rejectionReason: ownListing.status === "rejected" ? ownListing.rejection_reason : null };
    } else if (goneContext?.status === "sold") {
      notFoundCase = { kind: "sold", listingId: id as string, title: goneContext.title, price: goneContext.final_price_naira, categoryId: goneContext.category_id, categoryName: goneContext.category_name, imageUrl: goneContext.image_url };
    } else if (goneContext?.status === "delisted" || goneContext?.status === "rejected") {
      notFoundCase = { kind: "removed", listingId: id as string, title: goneContext.title, categoryId: goneContext.category_id, categoryName: goneContext.category_name, imageUrl: goneContext.image_url };
    } else {
      // No row: either the id is genuinely unknown, or it exists but is
      // live/pending_review — get_gone_listing_context only ever returns a
      // row for sold/delisted/rejected, so both read as the generic case.
      notFoundCase = { kind: "wrongUrl" };
    }

    return <NotFoundOrGoneScreen c={notFoundCase} waNumber={waNumber} />;
  }

  const qty = Number(listing.quantity ?? 1);
  const available = qty - Number(listing.quantity_sold ?? 0);
  const multi = qty > 1;

  // Belt and braces: a live listing with no stock left (should not happen, the
  // trigger flips it to 'sold') still shows the sold state rather than a dead
  // Buy. All the data the sold case needs is already in hand, no RPC needed.
  if (available <= 0) {
    return (
      <NotFoundOrGoneScreen
        c={{ kind: "sold", listingId: listing.id, title: listing.title, price: listing.final_price_naira, categoryId: listing.category_id, categoryName: listing.category?.name ?? null, imageUrl: listing.image_url }}
        waNumber={waNumber}
      />
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
  const maxDiscountNaira = maxDiscountPercent != null ? Math.round(listing.final_price_naira * maxDiscountPercent / 100) : null;
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
      <MarketplaceTitle title={listing.title} />
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
              <span>The seller said yes to a lower price</span>
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
          <span className="mkt-tag cond">{conditionLabel(listing.condition)}</span>
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
          <p className="mkt-detail-text">{listing.display_description}</p>
        </div>

        <HowThisWorksExplainer sellerName={sellerDisplayName(listing)} />

        {/* Ask for a lower price (design 23a, buyer-facing copy per the
            "Ask for a lower price" pass). Hidden entirely when the feature is
            off, or once this buyer has spent their one ask here in any
            direction — both cases simply look like a listing that never had
            one, per design O10, never a broken or greyed-out control. */}
        {offersEnabled && !offerAccepted && maxDiscountNaira != null && (
          offerPendingOrCountered ? (
            <button type="button" className="mkt-offer-entry" onClick={() => navigate(`/listing/${listing.id}/offer`)}>
              {myOffer?.status === "countered" ? "The seller came back with a different price, view it" : "View your request"}
            </button>
          ) : offerSpent ? (
            <div className="mkt-offer-used">You've already asked for a lower price on this one</div>
          ) : (
            <button type="button" className="mkt-offer-entry" onClick={openOfferSheet}>Ask for a lower price</button>
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

      {offerSheetOpen && maxDiscountNaira != null && (
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
