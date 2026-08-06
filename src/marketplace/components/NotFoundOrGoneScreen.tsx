import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import waLogo from "@/assets/whatsapp-logo.svg";
import { formatNaira } from "../lib/format";
import {
  fetchSimilarLiveListings,
  fetchCategoryLiveCount,
  browseCategoryLabel,
  type SimilarListing,
} from "../lib/goneListing";
import { waHref } from "../lib/whatsapp";
import MarketplaceTitle from "./MarketplaceTitle";

/**
 * The four "not live" situations, one shared shell. Case-specific copy,
 * icon, CTAs and (for sold/removed only) similar items live here; the data
 * fetching that decides WHICH case applies lives in the callers
 * (ListingDetailPage, MarketplaceNotFoundPage), this component only ever
 * renders what it's told.
 *
 * Buttons are explicitly sized (see .mkt-notfound-cta in marketplace.css) —
 * this is the fix for the button that used to inflate to ~800px tall by
 * reusing .mkt-buy's flex:1 (meant for the horizontal .mkt-buybar) inside a
 * vertical centered column. Never give these classes flex-grow again.
 */

export type NotFoundCase =
  | { kind: "sold"; listingId: string; title: string; price: number; categoryId: string | null; categoryName: string | null; imageUrl: string | null }
  | { kind: "removed"; listingId: string; title: string; categoryId: string | null; categoryName: string | null; imageUrl: string | null }
  | { kind: "wrongUrl" }
  | { kind: "ownSold"; title: string; price: number; imageUrl: string | null }
  | { kind: "ownRemoved"; title: string; imageUrl: string | null; rejectionReason: string | null };

const ICONS: Record<NotFoundCase["kind"], { glyph: string; bg: string; fg: string }> = {
  sold: { glyph: "✓", bg: "var(--mkt-green-light)", fg: "var(--mkt-green-dark)" },
  removed: { glyph: "···", bg: "var(--mkt-coral-light)", fg: "var(--mkt-coral-dark)" },
  wrongUrl: { glyph: "?", bg: "var(--mkt-grey-chip)", fg: "var(--mkt-muted)" },
  ownSold: { glyph: "✓", bg: "var(--mkt-green-light)", fg: "var(--mkt-green-dark)" },
  ownRemoved: { glyph: "···", bg: "var(--mkt-coral-light)", fg: "var(--mkt-coral-dark)" },
};

export default function NotFoundOrGoneScreen({ c, waNumber }: { c: NotFoundCase; waNumber: string }) {
  const navigate = useNavigate();
  const icon = ICONS[c.kind];
  const showsSimilar = c.kind === "sold" || c.kind === "removed";

  const { data: similar } = useQuery({
    queryKey: ["mkt-similar", showsSimilar ? c.kind === "sold" || c.kind === "removed" ? c.listingId : null : null],
    enabled: showsSimilar,
    queryFn: () => fetchSimilarLiveListings((c as { listingId: string }).listingId, 4),
  });
  const { data: categoryCount } = useQuery({
    queryKey: ["mkt-category-count", showsSimilar ? (c as { categoryId: string | null }).categoryId : null],
    enabled: showsSimilar && !!(c as { categoryId: string | null }).categoryId,
    queryFn: () => fetchCategoryLiveCount((c as { categoryId: string }).categoryId),
  });

  const hasSimilar = showsSimilar && (similar?.length ?? 0) > 0;
  const anySameCategory = showsSimilar && (similar ?? []).some((s) => s.from_same_category);
  const categoryName = showsSimilar ? (c as { categoryName: string | null }).categoryName : null;
  const categoryId = showsSimilar ? (c as { categoryId: string | null }).categoryId : null;
  const categoryLabel = browseCategoryLabel(categoryName);

  // The "message column alone, centred" desktop treatment the design
  // specifies for every case with no similar-items grid to sit beside.
  const single = !showsSimilar || !hasSimilar;

  let headline = "";
  let sub = "";
  let primaryLabel = "";
  let primaryTo = "/";
  let waLabel: string | null = null;
  let waMessage = "";
  // Never claims the item is still available, per case, matching what's on
  // screen — no generic "gone" title standing in for all four situations.
  let pageTitle = "";

  if (c.kind === "sold") {
    pageTitle = `${c.title} has sold`;
    headline = "This one's found a home";
    sub = hasSimilar
      ? `The ${c.title} you were looking at sold for ${formatNaira(c.price)}.${anySameCategory ? ` Good news for the marketplace, bad timing for you, here's what else is around.` : " Nothing else left in that exact category, but here's what's close."}`
      : `The ${c.title} you were looking at sold for ${formatNaira(c.price)}.${categoryName ? ` Nothing else in ${categoryLabel} just at the moment, but new things get listed daily.` : ""}`;
    primaryLabel = anySameCategory && categoryName ? `Browse ${categoryLabel}` : "Browse everything";
    primaryTo = anySameCategory && categoryId ? `/?category=${categoryId}` : "/";
    waLabel = "Ask if more are coming";
    waMessage = `Hi, I was looking at the ${c.title} and it's sold. Do you know if similar ones come up often?`;
  } else if (c.kind === "removed") {
    pageTitle = `${c.title} isn't available`;
    headline = "This listing isn't available right now";
    sub = hasSimilar
      ? `The ${c.title} you were looking at has been taken down. It may come back later${anySameCategory ? `, in the meantime here's more in ${categoryLabel}.` : ", in the meantime here's what's close."}`
      : `The ${c.title} you were looking at has been taken down. It may come back later.${categoryName ? ` Nothing else in ${categoryLabel} just at the moment, but new things get listed daily.` : ""}`;
    primaryLabel = anySameCategory && categoryName ? `Browse ${categoryLabel}` : "Browse everything";
    primaryTo = anySameCategory && categoryId ? `/?category=${categoryId}` : "/";
    waLabel = "Ask about this item";
    waMessage = `Hi, I was looking at ${c.title} and it's no longer available. Is it likely to come back, or is there something similar you'd recommend?`;
  } else if (c.kind === "wrongUrl") {
    pageTitle = "Page not found";
    headline = "We can't find that page";
    sub = "The link might be old or mistyped. Let's get you back to browsing instead.";
    primaryLabel = "Go to browse";
    primaryTo = "/";
    waLabel = "Ask us to help find it";
    waMessage = "Hi, I followed a link on BundledMum Marketplace and it didn't work, can you help me find what I was after?";
  } else if (c.kind === "ownSold") {
    pageTitle = `${c.title} has sold`;
    headline = "This one's yours, and it's sold";
    sub = `Your ${c.title} sold for ${formatNaira(c.price)}. It's no longer public since there's nothing left to buy, but you can find it in your dashboard any time.`;
    primaryLabel = "Go to my dashboard";
    primaryTo = "/sell/dashboard";
  } else {
    pageTitle = `${c.title} is off the marketplace`;
    headline = "This one's yours, and it's off the marketplace";
    sub = `Your ${c.title} is off the marketplace right now, you can edit and resend it for review from your dashboard.${c.rejectionReason ? ` Reason given: ${c.rejectionReason}` : ""}`;
    primaryLabel = "Go to my dashboard";
    primaryTo = "/sell/dashboard";
  }

  const isOwn = c.kind === "ownSold" || c.kind === "ownRemoved";
  const wa = waLabel ? waHref(waNumber, waMessage) : null;

  return (
    <div className={single ? "mkt-notfound-wrap single" : "mkt-notfound-wrap"}>
      <MarketplaceTitle title={pageTitle} />
      <div className="mkt-notfound-message">
        <div className="mkt-notfound-icon" style={{ background: icon.bg, color: icon.fg }}>{icon.glyph}</div>
        <div className="mkt-notfound-headtext">
          <h1 className="mkt-notfound-headline">{headline}</h1>
          <p className="mkt-notfound-sub">{sub}</p>
        </div>

        {(c.kind === "ownSold" || c.kind === "ownRemoved") && (
          <div className="mkt-notfound-own-card">
            <div className="th">{c.imageUrl && <img src={c.imageUrl} alt="" />}</div>
            <div>
              <div className="t">{c.title}</div>
              {c.kind === "ownSold" && <div className="p">{formatNaira(c.price)} received</div>}
            </div>
          </div>
        )}

        <div className="mkt-notfound-cta-row">
          <button className="mkt-notfound-cta mkt-notfound-cta--primary" onClick={() => navigate(primaryTo)}>{primaryLabel}</button>
          {wa && (
            <a className="mkt-notfound-cta" href={wa} target="_blank" rel="noreferrer">
              <span className="mkt-notfound-wa-ic" style={{ backgroundImage: `url(${waLogo})` }} />
              {waLabel}
            </a>
          )}
          {isOwn && (
            <button className="mkt-notfound-cta" onClick={() => navigate("/sell/new")}>List something new</button>
          )}
        </div>
      </div>

      {showsSimilar && hasSimilar && (
        <div className="mkt-notfound-similar">
          <div className="mkt-notfound-rule" />
          <div className="mkt-notfound-similar-h">{anySameCategory && categoryName ? `More ${categoryLabel}` : "More like this"}</div>
          <div className="mkt-notfound-grid">
            {(similar ?? []).map((s) => <SimilarCard key={s.id} item={s} />)}
          </div>
          {categoryId && (categoryCount ?? 0) > 0 && (
            <button className="mkt-notfound-seeall" onClick={() => navigate(`/?category=${categoryId}`)}>
              See all {categoryCount} in {categoryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SimilarCard({ item }: { item: SimilarListing }) {
  return (
    <Link className="mkt-notfound-card" to={`/listing/${item.id}`}>
      <div className="th">{item.image_url && <img src={item.image_url} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}</div>
      <div className="body">
        <div className="price">{formatNaira(item.final_price_naira)}</div>
        <div className="title">{item.title}</div>
      </div>
    </Link>
  );
}
