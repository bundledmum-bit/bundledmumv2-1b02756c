import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import { useAllowedCategories, useCategoryGroups, useFeaturedCategories } from "../data/useListings";
import MarketplaceTitle from "../components/MarketplaceTitle";

const CATEGORY_FALLBACK_ICON = "🏷️";

const CORE_MESSAGE = [
  { title: "Nothing comes out of your price", body: "Ask ₦20,000, receive ₦20,000. We add our own fee on the buyer's side, never yours." },
  { title: "Your money is safe either way", body: "The buyer pays us first. We hold it and only release it to you once they confirm the item arrived. No one vanishes with your stroller." },
  { title: "Free, and quick to start", body: "No fee to list anything. A first listing takes minutes, phone, bank details, a few photos." },
  { title: "Every listing gets checked", body: "That review is what keeps buyers coming back, and coming back to yours." },
];

/**
 * Become a seller, /marketplace/sell (design 29a). A conversion landing page
 * for a parent deciding whether to sell what their child has outgrown, not a
 * form. One primary action repeated at the hero, after the category showcase,
 * and (mobile) a sticky footer, all funnelling into the same login/setup or
 * create-listing destination — never a second competing action. Carries NO
 * buyer-side cost, no price breakdown, no calculator or invented stats: the
 * ₦750 fee is the buyer's, and BundledMum's markup belongs on create-listing
 * only.
 *
 * An existing seller gets a distinct, smaller hero (S2) right on this page —
 * "got something else to sell" plus a dashboard link — rather than being
 * redirected away before they see anything, so the CTA choice (list again vs.
 * go to the dashboard) is the seller's, not silently made for them.
 */
export default function BecomeSellerPage() {
  const { isLoggedIn, loading, seller } = useSeller();
  const navigate = useNavigate();

  const { data: categories = [] } = useAllowedCategories();
  const { data: groups = [] } = useCategoryGroups();
  const { data: featured = [] } = useFeaturedCategories("sell_page");

  // Default (fallback) tiles: one per group, in the group's own sort_order.
  // Groups themselves carry no icon column, so each tile's icon is its
  // group's first allowed category (by the category's own sort_order, then
  // name) — the only live, non-hardcoded source there is. Used only when
  // nothing has been curated for sell_page yet.
  const defaultGroupTiles = useMemo(() => {
    return groups
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => {
        const inGroup = categories
          .filter((c) => c.group_id === g.id)
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
        return { id: g.id, name: g.name, icon: inGroup[0]?.icon || CATEGORY_FALLBACK_ICON };
      });
  }, [groups, categories]);

  // Admin's curated pick for sell_page (marketplace_featured_categories), in
  // sort_order, shown as its own real category name and icon (not a synthetic
  // group label). Falls back to defaultGroupTiles whenever nothing is curated
  // yet, or every curated id no longer resolves to a currently-allowed
  // category, so this section never renders empty just because admin hasn't
  // configured it.
  const groupTiles = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const curated = featured
      .map((f) => byId.get(f.category_id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon || CATEGORY_FALLBACK_ICON }));
    return curated.length > 0 ? curated : defaultGroupTiles;
  }, [featured, categories, defaultGroupTiles]);

  const startCta = () => {
    if (loading) return;
    if (!isLoggedIn) { sendToMarketplaceLogin("/sell", "sell"); return; }
    navigate("/sell/setup");
  };

  if (loading) {
    return (
      <div className="mkt-center">
        <BMLoadingAnimation size={160} />
      </div>
    );
  }

  // An existing seller: their own small hero, on this same page, never the
  // pitch a new visitor sees, and never a silent redirect away before they
  // get to choose.
  if (seller) {
    return (
      <>
        <MarketplaceTitle title="Sell on BundledMum Marketplace" />
        <div className="mkt-sell-landing mkt-sell-landing--seller">
          <div className="mkt-sl-hero mkt-sl-hero--seller">
            <div className="mkt-sl-headline">Got something else to sell?</div>
            <p className="mkt-sl-sub">You know the drill already, straight to your dashboard, or list something new right away.</p>
            <div className="mkt-sl-cta-row">
              <button className="mkt-sl-cta mkt-sl-cta--primary" onClick={() => navigate("/sell/new")}>List a new item</button>
              <button className="mkt-sl-cta mkt-sl-cta--ghost-on-green" onClick={() => navigate("/sell/dashboard")}>My dashboard</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <MarketplaceTitle title="Sell your baby and children's items" />
      <div className="mkt-sell-landing">
        <div className="mkt-sl-hero">
          <div className="mkt-sl-hero-copy">
            <div className="mkt-sl-headline">Sell the baby &amp; children's items you don't need anymore</div>
            <p className="mkt-sl-sub">That stroller in the store room? Other parents are looking for exactly that, right now. You get exactly the price you ask for.</p>
            <button className="mkt-sl-cta mkt-sl-cta--primary" onClick={startCta}>List your first item</button>
          </div>

          {groupTiles.length > 0 && (
            <div className="mkt-sl-hero-tiles" aria-hidden>
              {groupTiles.slice(0, 4).map((t) => (
                <div className="mkt-sl-hero-tile" key={t.id}>
                  <span className="ic">{t.icon}</span>
                  <span className="lbl">{t.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {groupTiles.length > 0 && (
          <div className="mkt-sl-section">
            <div className="mkt-sl-section-head">
              <div className="mkt-sl-section-title">What's sitting in your house right now?</div>
              <p className="mkt-sl-section-sub">Tap a category, you'll know in two seconds if you've got something.</p>
            </div>
            <div className="mkt-sl-categories">
              {groupTiles.map((t) => (
                <button className="mkt-sl-category" key={t.id} onClick={startCta}>
                  <span className="ic">{t.icon}</span>
                  <span className="lbl">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mkt-sl-message">
          {CORE_MESSAGE.map((m, i) => (
            <div className="mkt-sl-message-card" key={i}>
              <div className="mkt-sl-message-num">{i + 1}</div>
              <div>
                <div className="mkt-sl-message-title">{m.title}</div>
                <div className="mkt-sl-message-body">{m.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mkt-sl-reseller">
          <div className="mkt-sl-reseller-copy">
            <span className="mkt-sl-reseller-tag">Already reselling?</span>
            <div className="mkt-sl-reseller-title">Get your stock in front of more parents</div>
            <p className="mkt-sl-reseller-body">If you resell baby and children's things as more than a one-off, this is reach, not just a sale. Buyers here are actively searching this category, not scrolling past a WhatsApp status.</p>
          </div>
          <button className="mkt-sl-cta mkt-sl-cta--outline" onClick={startCta}>List your stock</button>
        </div>

        <div className="mkt-sl-closing">
          <div className="mkt-sl-closing-title">Go on, that thing isn't getting any newer</div>
          <button className="mkt-sl-cta mkt-sl-cta--primary" onClick={startCta}>List your first item</button>
        </div>
      </div>

      <div className="mkt-sl-sticky-cta">
        <button className="mkt-sl-cta mkt-sl-cta--primary mkt-sl-cta--full" onClick={startCta}>Start selling</button>
      </div>
    </>
  );
}
