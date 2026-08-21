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
  stateBadgeLabel,
  conditionLabel,
  isVerifiedSeller,
  sellerDisplayName,
  sellerTenure,
  sellerInitials,
} from "../lib/format";
import VerifiedBadge from "../components/VerifiedBadge";
import HowThisWorksExplainer from "../components/HowThisWorksExplainer";
import MakeOfferSheet from "../checkout/MakeOfferSheet";
import AskQuestionSheet from "../checkout/AskQuestionSheet";
import { fetchBuyerOfferForListing, fetchBuyerAcceptedOffer, getOffersEnabled, getMaxDiscountPercent, isLapsed } from "../offers";
import { fetchBuyerQuestionForListing, fetchAnsweredQuestionsForListing } from "../questions";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import { useSeller } from "../sell/useSeller";
import { useMarketplaceWhatsAppNumber } from "../lib/whatsapp";
import { fetchGoneListingContext, fetchOwnListingIfMine } from "../lib/goneListing";
import NotFoundOrGoneScreen, { type NotFoundCase } from "../components/NotFoundOrGoneScreen";
import MarketplaceSeo from "../components/MarketplaceSeo";
import PhotoViewer from "../components/PhotoViewer";
import ProtectionBadge from "../components/ProtectionBadge";
import ListingVideoCard from "../components/ListingVideoCard";
import { useMarketplaceVideoEnabled } from "../videoSettings";
import WhatsAppHelpLink, { markContactedUs } from "../components/WhatsAppHelpLink";
import WhatsAppInactivityPrompt from "../components/WhatsAppInactivityPrompt";

const OG_FALLBACK_IMAGE = "https://bundledmum.com/images/og-default.jpg";

/** Meta description length, cut at a word boundary rather than mid-word,
 * roughly the ~155 characters a search snippet or link preview shows. */
function truncateForMeta(text: string, max = 155): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

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

/** Live countdown text, e.g. "23h 59m", "4m 12s", "38s" — always at least
 * one unit down to the second, matching how a person would say it. */
function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

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
  // Paused as of §91 — guarded on the setting, not the data, so a listing
  // that somehow still carries a video_url never renders the card while
  // this is off. Defaults to false while loading/unreadable, so the card
  // never flashes in and back out.
  const videoEnabled = useMarketplaceVideoEnabled();

  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [offerSheetOpen, setOfferSheetOpen] = useState(false);
  const [askSheetOpen, setAskSheetOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

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

  // The accepted price's own 24-hour deadline (accepted_price_expires_at),
  // a different clock from expires_at above (that one is the window to
  // respond to the offer in the first place, already spent by the time an
  // offer reaches accepted/counter_accepted). Only fetched once there is an
  // accepted price to count down at all.
  const acceptedCountdownEnabled = !!id && isLoggedIn && !!myOffer && (myOffer.status === "accepted" || myOffer.status === "counter_accepted");
  const { data: acceptedCountdown } = useQuery({
    queryKey: ["mkt-accepted-countdown", id, myOffer?.id],
    enabled: acceptedCountdownEnabled,
    queryFn: () => fetchBuyerAcceptedOffer(id as string),
  });
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    setSecondsLeft(acceptedCountdown ? acceptedCountdown.seconds_remaining : null);
  }, [acceptedCountdown]);
  // Same ticking-cooldown pattern already used for the login/resend timers
  // elsewhere in the marketplace: a plain local integer, decremented every
  // second, no Date arithmetic inside the interval itself.
  useEffect(() => {
    if (secondsLeft == null || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s == null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  // Ask a question: this buyer's own question on this listing, if they have
  // asked one (at most one ever exists, enforced server side), and every
  // answered question on the listing, public to everyone browsing it.
  const { data: myQuestion, refetch: refetchMyQuestion } = useQuery({
    queryKey: ["buyer-question", id],
    enabled: !!id && isLoggedIn,
    queryFn: () => fetchBuyerQuestionForListing(id as string),
  });
  const { data: answeredQuestions = [] } = useQuery({
    queryKey: ["mkt-answered-questions", id],
    enabled: !!id,
    queryFn: () => fetchAnsweredQuestionsForListing(id as string),
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
    track("ViewContent", { content_ids: [listing.id], content_type: "product", content_name: listing.title, value: listing.final_price_naira, currency: "NGN" }, eventId);
    sendMarketplaceConversionEvent({
      event_name: "ViewContent",
      event_id: eventId,
      event_source_url: window.location.href,
      content_id: listing.id,
      content_type: "product",
      content_name: listing.title,
      value: listing.final_price_naira,
      email,
      phone,
    });
  }, [isLiveView, listing?.id]);

  // record_listing_view, fired once per genuinely live view, same gate and
  // same fired-once-ref shape as ViewContent above so the two stay in sync
  // (a sold/gone/removed view never counts, and a re-render never double
  // counts). Fire and forget, no UI depends on it, and it returns nothing
  // to read — a failure here must never be visible to the visitor.
  const listingViewRecorded = useRef(false);
  useEffect(() => {
    if (!isLiveView || !listing || listingViewRecorded.current) return;
    listingViewRecorded.current = true;
    mdb.rpc("record_listing_view", { p_listing_id: listing.id }).then(({ error }) => {
      if (error) console.error("[marketplace] record_listing_view failed:", error);
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
  const heroState = stateBadgeLabel(listing);

  // Make-an-offer state (design 23a). An accepted/counter_accepted offer is
  // PRIVATE to this buyer — the listing's public final_price_naira is
  // unchanged for everyone else, multi-quantity or not, this only overrides
  // what THIS buyer sees and pays.
  const maxDiscountNaira = maxDiscountPercent != null ? Math.round(listing.final_price_naira * maxDiscountPercent / 100) : null;
  const offerAccepted = myOffer && (myOffer.status === "accepted" || myOffer.status === "counter_accepted");
  const myPrice = offerAccepted ? (myOffer.status === "counter_accepted" ? myOffer.counter_buyer_price_naira! : myOffer.buyer_price_naira) : null;
  const myDiscount = offerAccepted && myPrice != null ? listing.final_price_naira - myPrice : 0;
  // The agreed price's own 24-hour window, separate from offerAccepted
  // (which stays true forever regardless of the clock — the offer's status
  // column never flips on expiry, same reasoning as isLapsed() above).
  // has_expired from the server is trusted first; the local tick reaching
  // zero also flips this immediately rather than waiting on a refetch.
  const priceExpired = !!offerAccepted && (!!acceptedCountdown?.has_expired || secondsLeft === 0);
  const showAcceptedPrice = !!offerAccepted && myPrice != null && !priceExpired;
  // Anything else already spent this buyer's one offer here (declined, lapsed,
  // still pending, or awaiting their own reply to a counter) — Buy now stays
  // open at the listed price regardless, per design O10.
  const offerSpent = !!myOffer && !offerAccepted;
  const offerPendingOrCountered = !!myOffer && (myOffer.status === "countered" || (myOffer.status === "pending" && !isLapsed(myOffer)));

  // A super admin's public price cut (see super_admin_set_listing_discount),
  // entirely different from an accepted offer above: that one is private to
  // one buyer and overrides final_price_naira just for them, this one IS
  // final_price_naira for everyone, signed in or not — the RPC already
  // updated it server side, so the price shown below needs no change at
  // all, only the struck-through "was" price and the tag need adding. An
  // accepted offer's own private price always wins the display when both
  // are somehow true, since it's an even better price than the public one.
  const hasAdminDiscount = !showAcceptedPrice && listing.admin_discount_naira > 0 && listing.price_before_discount_naira != null;

  function openOfferSheet() {
    if (!isLoggedIn) { sendToMarketplaceLogin(`/listing/${listing.id}`, "offer"); return; }
    setOfferSheetOpen(true);
  }

  function openAskSheet() {
    if (!isLoggedIn) { sendToMarketplaceLogin(`/listing/${listing.id}`, "question"); return; }
    markContactedUs(); // she's found the door herself — see WhatsAppHelpLink.tsx
    setAskSheetOpen(true);
  }

  // AddToCart, fired on the Buy now click itself, never on load — this is a
  // real click-navigate handler, not a redirect, so there's no risk of the
  // route change cancelling the in-flight tracking call the way a full page
  // redirect (see Pay, in CheckoutPage.tsx) can. Fire and forget: navigate()
  // runs unconditionally right after, regardless of whether tracking
  // succeeds. value is exactly the price already shown on this button —
  // never recomputed.
  function handleBuyNow() {
    const value = showAcceptedPrice ? myPrice! : listing.final_price_naira;
    const eventId = crypto.randomUUID();
    const email = isLoggedIn ? (user?.email ?? undefined) : undefined;
    const phone = buyerPhone ?? undefined;
    track("AddToCart", { content_ids: [listing.id], content_type: "product", content_name: listing.title, value, currency: "NGN" }, eventId);
    sendMarketplaceConversionEvent({
      event_name: "AddToCart",
      event_id: eventId,
      event_source_url: window.location.href,
      content_id: listing.id,
      content_type: "product",
      content_name: listing.title,
      value,
      email,
      phone,
    });
    navigate(showAcceptedPrice && myOffer ? `/checkout/${listing.id}?offer=${myOffer.id}` : `/checkout/${listing.id}`);
  }

  return (
    <div className="mkt-detail">
      <MarketplaceSeo
        title={listing.title}
        description={truncateForMeta(listing.display_description || listing.title)}
        image={listing.image_url || OG_FALLBACK_IMAGE}
        type="product"
      />
      {/* Gallery + panel are grouped so the desktop layout (>=1024px) can place them
          as two columns. On mobile both wrappers are display:contents, so the hero,
          thumbs, body and buy bar lay out exactly as before, single column. */}
      <div className="mkt-detail-gallery">
        <div className="mkt-hero">
          {hero ? (
            <button type="button" className="mkt-hero-tap" onClick={() => setViewerIndex(Math.max(0, images.indexOf(hero)))} aria-label="View full screen">
              <img src={hero} alt={listing.title} />
            </button>
          ) : null}
          <button className="mkt-back" onClick={() => navigate("/")} aria-label="Back to marketplace">
            ‹
          </button>
          {heroState && <span className="mkt-hero-state">{heroState}</span>}
          {/* The only visible sign the photo opens fullscreen — nothing else on
              the hero hinted at this before (desktop had a hover cursor,
              mobile had nothing). Doubles as the photo count, since a buyer
              scanning past scrollable thumbnails may never notice there are
              more. Sits over the tap button, pointer-events off so the tap
              still lands on the button underneath. */}
          {hero && (
            <span className="mkt-hero-cue" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
              </svg>
              {images.length > 1 && <span>{Math.max(0, images.indexOf(hero)) + 1} / {images.length}</span>}
            </span>
          )}
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

        {/* Design 37a: last, after every photo. Absent entirely — no card,
            no border, no "no video available" line — when the listing has
            none, which is most of them. Also gated on marketplace_video_enabled
            (§91): guarded on the setting rather than the data, so this stays
            hidden even for a listing that somehow still has a video_url
            while the feature is paused. */}
        {videoEnabled && listing.video_url && (
          <ListingVideoCard
            videoUrl={listing.video_url}
            posterUrl={listing.video_poster_url || listing.video_url}
            durationSeconds={listing.video_duration_seconds || 0}
          />
        )}
      </div>

      {/* Fullscreen only, zoom never touches the inline gallery above — the
          state badge and back button on the hero are deliberately NOT
          passed in here, the viewer is just the photos and its own
          controls. */}
      {viewerIndex !== null && (
        <PhotoViewer
          images={images}
          initialIndex={viewerIndex}
          title={listing.title}
          onClose={() => setViewerIndex(null)}
        />
      )}

      <div className="mkt-detail-panel">
      <div className="mkt-detail-body">
        <div className="mkt-detail-priceblock">
          {showAcceptedPrice ? (
            <div className="mkt-offer-accepted" style={{ marginBottom: 8 }}>
              <span className="tick">✓</span>
              <span>The seller said yes to a lower price</span>
            </div>
          ) : priceExpired ? (
            <div className="mkt-errbox" style={{ marginBottom: 8 }}>
              <span className="m">!</span>
              <span>Your agreed price has run out, so this is back to the normal price now.</span>
            </div>
          ) : null}
          <div className="mkt-detail-price" style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
            <span>{formatNaira(showAcceptedPrice ? myPrice! : listing.final_price_naira)}{multi ? " each" : ""}</span>
            {showAcceptedPrice && (
              <>
                <span style={{ font: "400 15px/1 'Lato', sans-serif", color: "var(--mkt-muted-2)", textDecoration: "line-through" }}>{formatNaira(listing.final_price_naira)}</span>
                <span className="mkt-offer-discount-tag">{formatNaira(myDiscount)} off, just for you</span>
              </>
            )}
            {/* Public price cut — never says where it came from, to a buyer
                it's simply a reduced price. */}
            {hasAdminDiscount && (
              <>
                <span className="mkt-discount-strike">{formatNaira(listing.price_before_discount_naira!)}</span>
                <span className="mkt-discount-tag">{formatNaira(listing.admin_discount_naira)} off</span>
              </>
            )}
          </div>
          <h1 className="mkt-detail-title">{listing.title}</h1>
          {/* What it cost new, seller-optional. Understated on purpose, small
              text below the title, never competing in size against the
              actual price above it. Nothing renders when absent. */}
          {listing.original_price_naira != null && listing.original_price_naira > listing.final_price_naira && (
            <div className="mkt-help" style={{ color: "var(--mkt-green)" }}>Bought brand new at <b>{formatNaira(listing.original_price_naira)}</b></div>
          )}
          {showAcceptedPrice && (
            <>
              <div className="mkt-help">This price is yours alone, everyone else still sees {formatNaira(listing.final_price_naira)}.</div>
              {secondsLeft != null && secondsLeft > 0 && (
                <div className="mkt-help" style={{ color: "var(--mkt-coral-dark)", fontWeight: 700 }}>
                  This price holds for {formatCountdown(secondsLeft)} more. The item is not reserved though, someone else can still buy it at the normal price while you decide.
                </div>
              )}
            </>
          )}
          {multi && (
            <span className={available === 1 ? "mkt-avail low" : "mkt-avail"}>{available === 1 ? "Last one" : `${available} available`}</span>
          )}
        </div>

        {/* Same protection promise as the payment confirmation page, word
            for word — here is where hesitation actually happens, before
            the decision, not after paying. See ProtectionBadge.tsx. */}
        <ProtectionBadge />

        {/* Message BundledMum (design 35a). Sits directly under the
            protection card exactly as the mockup arranges it, at the point
            of hesitation right below the price and in the same glance as
            the Buy now bar. Deliberately far from "Ask a question" further
            down — that one goes to the SELLER and is answered publicly on
            the listing, this one goes to us. A quiet underlined text link,
            never a second button competing with Buy now. */}
        <WhatsAppHelpLink
          context="listing"
          listingId={listing.id}
          itemName={listing.title}
          price={formatNaira(showAcceptedPrice ? myPrice! : listing.final_price_naira)}
        />
        {/* §36a: the same link above, surfaced proactively on inactivity or
            (mobile) a sharp scroll up — never in place of the quiet link,
            always alongside it. */}
        <WhatsAppInactivityPrompt
          context="listing"
          listingId={listing.id}
          itemName={listing.title}
          price={formatNaira(showAcceptedPrice ? myPrice! : listing.final_price_naira)}
        />

        {multi && (
          <div className="mkt-reassure">
            <div className="mkt-reassure-tick">✓</div>
            <div className="mkt-reassure-text">
              {sellerDisplayName(listing)} has confirmed all {qty} are identical. You are buying one, at {formatNaira(listing.final_price_naira)}.
            </div>
          </div>
        )}

        {/* Each chip is genuine secondary navigation into browse, filtered by
            that one value — someone looking at a stroller in Ogudu is a
            real candidate for seeing everything else nearby. Kept as plain
            buttons styled exactly like the old inert spans (no new visual
            weight next to Buy now / Ask for a lower price below), just
            with a real tap target and destination now. Location links by
            STATE, not city: about half of this marketplace's cities carry
            exactly one live listing today, so a city-precise link would
            routinely land someone back on the very listing they just left;
            state is both meaningfully populated and still genuinely what
            the chip is about. Condition and category both use ?condition=
            and ?category=<slug> exactly as browse already reads them. */}
        <div className="mkt-tags">
          {listing.condition ? (
            <button type="button" className="mkt-tag cond" onClick={() => navigate(`/?condition=${listing.condition}`)}>
              {conditionLabel(listing.condition)}
            </button>
          ) : (
            <span className="mkt-tag cond">{conditionLabel(listing.condition)}</span>
          )}
          {listing.location_state ? (
            <button type="button" className="mkt-tag loc" onClick={() => navigate(`/?state=${encodeURIComponent(listing.location_state as string)}`)}>
              {locationLabel(listing)}
            </button>
          ) : (
            <span className="mkt-tag loc">{locationLabel(listing)}</span>
          )}
          {listing.category?.name ? (
            listing.category.slug ? (
              <button type="button" className="mkt-tag cat" onClick={() => navigate(`/?category=${listing.category!.slug}`)}>
                {listing.category.name}
              </button>
            ) : (
              <span className="mkt-tag cat">{listing.category.name}</span>
            )
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

        {/* Answered questions (Q&A), public to anyone viewing the listing,
            not just the buyer who asked. Zero matches simply doesn't render,
            same as the spec block above it. */}
        {answeredQuestions.length > 0 && (
          <div className="mkt-spec">
            <div className="mkt-spec-h">Questions and answers</div>
            {answeredQuestions.map((q) => (
              <div className="mkt-qa-row" key={q.id}>
                <div className="mkt-qa-q">Q: {q.question}</div>
                <div className="mkt-qa-a">A: {q.answer}</div>
              </div>
            ))}
          </div>
        )}

        <HowThisWorksExplainer sellerName={sellerDisplayName(listing)} />

        {/* Ask for a lower price (design 23a, buyer-facing copy per the
            "Ask for a lower price" pass). Hidden entirely when the feature is
            off, when this specific listing isn't negotiable (most listings —
            132 of 178 live ones are fixed price; the database itself refuses
            an offer here regardless, but a buyer should never be invited to
            tap through to a request that's already guaranteed to fail), or
            once this buyer has spent their one ask here in any direction —
            all cases simply look like a listing that never had one, per
            design O10, never a broken or greyed-out control. */}
        {offersEnabled && listing.is_negotiable && !offerAccepted && maxDiscountNaira != null && (
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

        {/* Ask a question. Hidden (replaced by a status line) once this buyer
            has already asked one on this listing, the same one-ask pattern
            as the offer entry above. */}
        {!myQuestion ? (
          <button type="button" className="mkt-offer-entry" onClick={openAskSheet}>Ask a question</button>
        ) : myQuestion.answer ? (
          <div className="mkt-offer-used">You asked a question, see the seller's answer above</div>
        ) : (
          <div className="mkt-offer-used">You asked a question, waiting for the seller to answer</div>
        )}
      </div>

      <div className="mkt-buybar">
        <div className="mkt-buybar-price">
          <small>{multi ? "Price each" : "Price"}</small>
          <b>{formatNaira(showAcceptedPrice ? myPrice! : listing.final_price_naira)}</b>
        </div>
        <button className="mkt-buy" onClick={handleBuyNow}>
          {showAcceptedPrice ? `Buy now at ${formatNaira(myPrice!)}` : multi ? "Buy one now" : "Buy now"}
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

      {askSheetOpen && (
        <AskQuestionSheet
          listingId={listing.id}
          listingTitle={listing.title}
          onClose={() => setAskSheetOpen(false)}
          onSent={() => { setAskSheetOpen(false); refetchMyQuestion(); }}
        />
      )}
    </div>
  );
}
