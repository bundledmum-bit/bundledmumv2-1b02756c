import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { recordMarketplaceSearch } from "../searchDemand";
import { readBrowseUrl, writeBrowseUrl, browseUrlKey } from "../browseUrl";
import CategoryMenu from "../browse/CategoryMenu";
import CategoryPicker from "../browse/CategoryPicker";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import logoWhite from "@/assets/logos/BM-LOGO-WHITE.svg";
import {
  useBrowseListings,
  useBrowseCount,
  useAllowedCategories,
  useCategoryGroups,
  useAllowedStates,
  useAreasForState,
  useFeaturedCategories,
  useJustListed,
  useMarketplaceStats,
  type BrowseFilters,
  type BrowseSort,
  type CategoryOption,
  type CategoryGroup,
  useCategoryCounts,
} from "../data/useListings";
import ListingCard from "../components/ListingCard";
import MarketplaceHero from "../components/MarketplaceHero";
import AreaCombobox from "../sell/AreaCombobox";
import MarketplaceSeo from "../components/MarketplaceSeo";
import CategoryNoStockYet from "../components/CategoryNoStockYet";
import CartCountLink from "../cart/CartCountLink";
import { formatNaira } from "../lib/format";

/**
 * BROWSE, rebuilt to the design (13a B1-B4). Six category tiles then the grid on
 * the home, real filters on top of search: price range (on final_price_naira,
 * never price_naira), condition (the structured column), location, and sort, with
 * a live matching count. Mobile puts filters in a sheet that keeps the grid behind
 * it and updates its count as you tap; desktop shows a persistent left panel. All
 * filtering runs SERVER SIDE so it scales past the seeded set.
 */

const CONDITION_OPTS: Array<{ value: string; label: string }> = [
  { value: "almost_new", label: "Almost new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
];
const CONDITION_VALUES = CONDITION_OPTS.map((o) => o.value);

const EMPTY: BrowseFilters = { search: "", categoryId: "", groupId: "", categoryIds: null, state: "", city: "", minPrice: null, maxPrice: null, conditions: [], sort: "newest" };

// A category or group id/link value is a UUID today (the existing, still-working
// format) or, from now on, a readable slug — told apart by shape, never guessed.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean { return UUID_RE.test(v); }

// Sensible fallback when a category has no icon set (e.g. a newly added one before
// an admin sets its emoji). "All categories" uses its own fixed shopping icon.
const CATEGORY_FALLBACK_ICON = "🏷️";
const ALL_CATEGORIES_ICON = "🛒";

/** Categories ordered into their groups, for the accordion and the home tiles.
 * Groups follow group.sort_order; categories within a group follow the category's
 * own sort_order then name. Any allowed category with no group_id (none today, but
 * defended against) is collected into `ungrouped` so it is never hidden. */
function groupCategories(categories: CategoryOption[], groups: CategoryGroup[]) {
  const grouped = groups
    .map((g) => ({ group: g, items: categories.filter((c) => c.group_id === g.id) }))
    .filter((x) => x.items.length > 0);
  const ungrouped = categories.filter((c) => !c.group_id || !groups.some((g) => g.id === c.group_id));
  return { grouped, ungrouped };
}

function naira(n: number) { return `₦${Math.round(n).toLocaleString("en-NG")}`; }

/** "Just listed" freshness label (design 38a). A listing genuinely from
 * today names the person behind it, "Listed today by {seller}", since on a
 * marketplace where the doubt is about the stranger selling it, that's a
 * real change in meaning, not just copy. Anything older stays a plain
 * relative label with no name, matching the design's own example
 * ("Yesterday", not "Yesterday by X") — the seller line is specifically
 * about how fresh this is, not a general byline. Falls back to
 * "BundledMum seller" when the seller has no public display name, the
 * same fallback sellerDisplayName already uses on listing detail, never a
 * blank or a dropped clause. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function justListedLabel(createdAt: string, sellerName: string | null | undefined): string {
  const days = Math.floor((startOfDay(new Date()) - startOfDay(new Date(createdAt))) / 86400000);
  if (days <= 0) return `Listed today by ${sellerName?.trim() || "BundledMum seller"}`;
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/* Mobile Just Listed row (design 39a): the same freshness fact as
 * justListedLabel above, but without "by {seller}" — a 132px card has no
 * room for it, and the design's own mockup shows the bare relative label. */
function justListedShortLabel(createdAt: string): string {
  const days = Math.floor((startOfDay(new Date()) - startOfDay(new Date(createdAt))) / 86400000);
  if (days <= 0) return "Listed today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export default function BrowsePage() {
  // Optional deep link, e.g. from a gone listing's "Browse {category}" CTA or
  // an ad campaign: ?category=<slug-or-uuid> preselects a single category,
  // ?group=<slug> preselects a whole category group (e.g. every clothing and
  // shoes category at once). Additive only — a plain /marketplace visit is
  // unaffected, EMPTY still governs the default.
  //
  // A UUID resolves immediately (the original, still-working format, matched
  // directly against category_id — no lookup needed). A slug cannot resolve
  // until categories/groups have loaded, so it's held as "pending" and
  // consumed by the effect below the moment that data is in. An unrecognised
  // slug (a typo in an ad, or a group renamed since the link was made) falls
  // through to unfilteredNote rather than an error or a silent empty result.
  const [searchParams, setSearchParams] = useSearchParams();
  // Everything the URL carries, read once on mount. Every filter and the
  // search term now travel here, not just category, group and state: before
  // this, someone who searched "cot", opened a listing and pressed back
  // landed on the full 224-item catalogue with an empty box, measured.
  //
  // A state name, a city, a price, a condition and a sort all resolve
  // synchronously. Only a category or group SLUG cannot, since it needs the
  // category list, so those stay "pending" and are consumed below. The UUID
  // form of ?category= still resolves immediately, as it always has.
  const initial = readBrowseUrl(searchParams);
  const initialCategoryParam = initial.category;
  const initialGroupParam = initial.group;
  const [filters, setFilters] = useState<BrowseFilters>({
    ...EMPTY,
    ...initial.filters,
    categoryId: isUuid(initialCategoryParam) ? initialCategoryParam : "",
  });
  const [pendingCategorySlug, setPendingCategorySlug] = useState<string | null>(
    initialCategoryParam && !isUuid(initialCategoryParam) ? initialCategoryParam : null,
  );
  const [pendingGroupSlug, setPendingGroupSlug] = useState<string | null>(initialGroupParam || null);
  const [unrecognisedFilterNote, setUnrecognisedFilterNote] = useState<string | null>(null);
  // Seeded from the URL so a restored search shows in the box immediately,
  // rather than the box being empty while results are filtered.
  const [searchInput, setSearchInput] = useState(initial.filters.search);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { isLoggedIn } = useCustomerAuth();

  // Debounce the search box into the server-side filters.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, refetch } = useBrowseListings(filters);
  const { data: categories = [], isLoading: categoriesLoading } = useAllowedCategories();
  const { data: groups = [], isLoading: groupsLoading } = useCategoryGroups();
  const { data: states = [] } = useAllowedStates();
  // Drives the category menu's order, its counts and which entries are dimmed.
  const { data: categoryCounts } = useCategoryCounts();
  const { data: featured = [] } = useFeaturedCategories("browse_home");
  // Desktop home only (design 38a) — fetched regardless, but only rendered
  // when !anyFilter, same gate the category tiles already use below.
  const { data: justListed = [] } = useJustListed(5);
  const { data: stats } = useMarketplaceStats();
  const sellerCount = stats?.sellerCount ?? null;

  // Resolves a pending ?category=slug or ?group=slug once categories/groups
  // have actually loaded (can't resolve against data that isn't there yet).
  // A group resolves to the live list of category ids it currently holds,
  // computed here client side since categories are already loaded for the
  // tiles/accordion anyway — no new query needed. An unrecognised slug (a
  // typo, or a group renamed since a link went out) leaves browse fully
  // unfiltered with a plain, calm note, never an error or an empty result
  // that reads as "nothing for sale here."
  useEffect(() => {
    if (pendingCategorySlug == null && pendingGroupSlug == null) return;
    // Wait for BOTH queries to genuinely settle, not just whichever happens to
    // resolve first — a length-based proxy race-conditions here: if groups
    // loads before categories, "categories.length === 0" alone would wrongly
    // look like "no such category" instead of "not loaded yet", and the
    // pending slug gets discarded (never retried) before it had a real
    // chance to resolve.
    if (categoriesLoading || groupsLoading) return;
    if (pendingCategorySlug != null) {
      const match = categories.find((c) => c.slug === pendingCategorySlug);
      if (match) setFilters((f) => ({ ...f, categoryId: match.id, groupId: "", categoryIds: null }));
      else setUnrecognisedFilterNote(`We didn't recognise "${pendingCategorySlug}" as a category, so here's everything instead.`);
      setPendingCategorySlug(null);
    }
    if (pendingGroupSlug != null) {
      const match = groups.find((g) => g.slug === pendingGroupSlug);
      if (match) {
        const ids = categories.filter((c) => c.group_id === match.id).map((c) => c.id);
        setFilters((f) => ({ ...f, groupId: match.id, categoryIds: ids, categoryId: "" }));
      } else {
        setUnrecognisedFilterNote(`We didn't recognise "${pendingGroupSlug}" as a category group, so here's everything instead.`);
      }
      setPendingGroupSlug(null);
    }
  }, [categories, groups, categoriesLoading, groupsLoading, pendingCategorySlug, pendingGroupSlug]);

  /**
   * One effect, writing the WHOLE filter set to the URL.
   *
   * This replaced two effects that between them wrote only category, group,
   * state and a lone condition, which is why a search and four filters
   * evaporated on the back button. Every search and filter combination is now
   * a shareable URL, which is the point: a mum sends "cots in Lagos" to a
   * friend on WhatsApp, and that is distribution we could not previously
   * receive.
   *
   * REPLACE, never push. The search is already debounced into `filters` at
   * 350ms, so this fires on a settled term rather than per keystroke, but even
   * so a history entry per filter change would mean the back button walks
   * backwards through a filter session instead of leaving the listing. The
   * cost is that back never undoes a single filter, which is what "Clear all
   * filters" is for.
   *
   * Compared as a string first, so a render that changes nothing does not
   * rewrite history. writeBrowseUrl emits a fixed param order for exactly
   * this reason.
   *
   * A category or group SLUG can only be written once the category list has
   * loaded. Until then this holds off entirely rather than writing a URL with
   * the category missing, which would drop it from a link the moment someone
   * shared during that window.
   */
  useEffect(() => {
    if (categoriesLoading || groupsLoading) return;
    if (pendingCategorySlug != null || pendingGroupSlug != null) return;
    const next = writeBrowseUrl(filters, {
      categorySlug: categories.find((c) => c.id === filters.categoryId)?.slug ?? null,
      groupSlug: groups.find((g) => g.id === filters.groupId)?.slug ?? null,
    });
    if (browseUrlKey(next) !== browseUrlKey(searchParams)) setSearchParams(next, { replace: true });
  }, [filters, categories, groups, categoriesLoading, groupsLoading, pendingCategorySlug, pendingGroupSlug, searchParams, setSearchParams]);

  const listings = data?.listings ?? [];
  const count = data?.count ?? 0;

  /**
   * Record what was searched for, and how many results it actually got.
   *
   * DEBOUNCE: none is added here, because one already exists. `searchInput`
   * settles into `filters.search` after 350ms, so this effect keys on the
   * SETTLED term and "p", "pr", "pra", "pram" produce one record, not four.
   *
   * The count is the real server-side match count for this exact filter
   * set. useBrowseListings sets no placeholder data, so while a new filter
   * set loads `data` is undefined and `count` is 0 while `isLoading` is
   * true; skipping until it settles is what stops a zero being recorded for
   * a search that had results.
   *
   * The ref keys on term + category + state so a refetch, a remount, or a
   * tab regaining focus cannot log the same search twice, while genuinely
   * changing a filter does record again, since "pram in Lagos with nothing
   * found" is a different fact from "pram".
   */
  const lastRecordedSearch = useRef<string | null>(null);
  /**
   * True when the URL ARRIVED carrying a search, so the first settled state is
   * a restored one and must not be recorded.
   *
   * This matters now that a search lives in the URL. Pressing back from a
   * listing, or opening a link a friend sent on WhatsApp, would otherwise log
   * "cot" again every time, and the search log is how we found that the old
   * search could not read plurals at all. Phantom searches would cost us the
   * next such finding.
   *
   * A FLAG rather than a pre-computed key, deliberately. A ?category= slug
   * only resolves to an id after the category list loads, so a key seeded at
   * mount would stop matching the moment it resolved and the restored search
   * would record after all. Suppressing the first pass that would otherwise
   * record is exact regardless of when the slug lands.
   *
   * It suppresses exactly one, so a buyer who opens a shared "cots in Lagos"
   * link and then types something else is still recorded.
   */
  const restoredFromUrl = useRef<boolean>(!!initial.filters.search.trim());
  useEffect(() => {
    const term = filters.search.trim();
    if (!term || isLoading || isError || !data) return;
    const key = `${term}|${filters.categoryId}|${filters.state}`;
    if (lastRecordedSearch.current === key) return;
    lastRecordedSearch.current = key;
    // The one this page opened with. Remembered, so a later change still
    // records, but not logged as something the buyer just typed.
    if (restoredFromUrl.current) { restoredFromUrl.current = false; return; }
    recordMarketplaceSearch({
      term,
      resultsCount: count,
      categoryId: filters.categoryId || null,
      state: filters.state || null,
    });
  }, [filters.search, filters.categoryId, filters.state, count, isLoading, isError, data]);

  const anyFilter = !!(filters.categoryId || filters.groupId || filters.state || filters.city || filters.minPrice != null || filters.maxPrice != null || filters.conditions.length || filters.search);

  // Home tiles: an admin's curated pick for browse_home (marketplace_featured_categories),
  // in sort_order. Falls back to the previous default — group display order, first 6 —
  // whenever nothing has been curated yet (or every curated id no longer resolves to a
  // currently-allowed category), so this section never renders empty just because admin
  // hasn't configured it.
  const defaultTileCats = useMemo(() => groupCategories(categories, groups).grouped.flatMap((x) => x.items), [categories, groups]);
  const tileCats = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const curated = featured.map((f) => byId.get(f.category_id)).filter((c): c is CategoryOption => !!c);
    return curated.length > 0 ? curated : defaultTileCats;
  }, [featured, categories, defaultTileCats]);

  // See more (design 31a): the remaining 31-ish categories not already shown as a
  // tile, in the same group-then-category sort order the fallback tiles already
  // use, revealed 6 at a time. Everything is already in hand client side
  // (categories/groups above), so a tap never triggers a fetch.
  const [revealCount, setRevealCount] = useState(0);
  const remainderCats = useMemo(() => {
    const shown = new Set(tileCats.map((c) => c.id));
    return defaultTileCats.filter((c) => !shown.has(c.id));
  }, [defaultTileCats, tileCats]);
  const revealedCats = remainderCats.slice(0, revealCount);
  const remainingCount = remainderCats.length - revealedCats.length;

  const catName = useMemo(() => categories.find((c) => c.id === filters.categoryId)?.name ?? "", [categories, filters.categoryId]);
  const catIcon = useMemo(() => categories.find((c) => c.id === filters.categoryId)?.icon ?? null, [categories, filters.categoryId]);
  // The active group's own name, for the applied chip below — the same
  // "show what's active, let them clear it" treatment the category filter
  // already gets, just one level coarser.
  const groupName = useMemo(() => groups.find((g) => g.id === filters.groupId)?.name ?? "", [groups, filters.groupId]);
  // Genuinely one category and nothing else, e.g. a home tile tap or the browse
  // category filter alone, distinct from a combined filter that also happens to
  // return zero results (that stays the existing generic empty state).
  const categoryOnly = !!filters.categoryId && !filters.state && !filters.city && filters.minPrice == null && filters.maxPrice == null && !filters.conditions.length && !filters.search;
  // A typed word and nothing else applied, so "we have nothing like that" is
  // the whole truth rather than a filter hiding stock we do have.
  const searchOnly = !!filters.search.trim() && !filters.categoryId && !filters.groupId && !filters.state && !filters.city && filters.minPrice == null && filters.maxPrice == null && !filters.conditions.length;

  function clearAll() { setFilters(EMPTY); setSearchInput(""); }

  /**
   * The one way a category gets chosen, from the desktop menu or the mobile
   * dropdown.
   *
   * Sets filters.categoryId and nothing else. The §179 effect writes
   * ?category=<slug> from that with replace, so a filtered view stays
   * shareable and the back button still works. Writing the URL here would
   * fight that effect, which compares its own output against the current
   * params and would immediately rewrite whatever this set.
   *
   * Clears groupId, because a single category is the finer filter and the
   * query gives it precedence anyway; leaving a stale group selected would
   * make the URL and the results disagree.
   */
  function chooseCategory(categoryId: string) {
    setFilters((f) => ({ ...f, categoryId, groupId: "", categoryIds: null }));
  }

  return (
    <>
      <MarketplaceSeo
        title="Buy and sell used baby and children's items"
        description="Buy or sell used baby and children's items in Nigeria. Every seller checked, every listing reviewed, and your money held until you confirm it arrived."
      />
      {/* Desktop (>=1024px) renders this as one consolidated green bar, design B4:
          logo + tagline + search + location + nav. Mobile keeps the shared header
          above and stacks the tagline, search and location rows. */}
      <div className="mkt-topbar">
        <div className="mkt-topbar-inner">
          {/* Desktop-only brand lockup (mobile gets it from the shared header). */}
          <Link to="/" className="mkt-topbar-brand" aria-label="BundledMum Marketplace, browse">
            <span className="mkt-hdr-lockup">
              <img src={logoWhite} alt="BundledMum" className="mkt-hdr-logo" />
              <span className="mkt-hdr-market">Marketplace</span>
            </span>
          </Link>

          <div className="mkt-home-line" style={{ padding: 0, maxWidth: "none" }}>
            <h1>
              <span className="mkt-hl-long">Buy or sell used baby and children's items</span>
              <span className="mkt-hl-short">Buy or sell used baby &amp; children's items</span>
            </h1>
            <Link to="/sell" className="mkt-home-sell">Sell</Link>
          </div>

          <div className="mkt-searchwrap">
            <span className="mkt-search-ic" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.5" y2="16.5" />
              </svg>
            </span>
            <input
              className="mkt-search"
              type="search"
              placeholder="Search prams, cots, bibs"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search items by title"
            />
          </div>

          <LocationControl filters={filters} onChange={setFilters} states={states} />

          {/* Desktop-only nav (mobile gets it from the shared header hamburger). */}
          <nav className="mkt-topbar-nav">
            <Link to="/" className="mkt-topbar-link on">Browse</Link>
            <Link to="/sell" className="mkt-topbar-link">Sell</Link>
            {/* Browse hides the shared header at >=1024px and renders this
                bar instead, so the cart count has to appear here too or it
                would vanish on the busiest page on desktop. */}
            <CartCountLink className="mkt-topbar-link" />
            {isLoggedIn
              ? <Link to="/orders" className="mkt-topbar-link">My orders</Link>
              : <Link to="/login" className="mkt-topbar-link">Log in</Link>}
          </nav>
        </div>
      </div>

      {/* Sticky desktop category bar. Its height is fixed in CSS from first
          paint and its contents render only once the final order is known,
          so it fills in once and never pushes the listings. Mobile gets the
          searchable dropdown on the filter row instead. */}
      <CategoryMenu
        categories={categories}
        groups={groups}
        counts={categoryCounts}
        ready={!categoriesLoading && !groupsLoading && !!categoryCounts}
        activeCategoryId={filters.categoryId}
        onPick={chooseCategory}
      />

      {/* An unrecognised ?category= or ?group= slug (a typo in an ad, or a
          group renamed since the link went out): shown unfiltered, honestly
          told why, never an error and never a silent empty result that
          would read as "nothing for sale here." Dismissible, not sticky. */}
      {unrecognisedFilterNote && (
        <div className="mkt-unrecognised-filter">
          <span>{unrecognisedFilterNote}</span>
          <button onClick={() => setUnrecognisedFilterNote(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Desktop home only (design 38a). Hidden entirely on mobile via CSS —
          mobile's own home is unchanged apart from the trust-line above. */}
      {!anyFilter && <MarketplaceHero />}

      {!anyFilter && justListed.length > 0 && (
        <div className="mkt-justlisted">
          <div className="mkt-justlisted-h">
            <span className="t">Just listed</span>
            <button
              type="button"
              className="mkt-justlisted-seeall"
              onClick={() => document.getElementById("mkt-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              See all {count} items
            </button>
          </div>
          <div className="mkt-justlisted-row">
            {justListed.map((l) => (
              <Link key={l.id} className="mkt-card" to={`/listing/${l.id}`}>
                <div className="mkt-card-imgwrap">
                  {l.image_url ? <img className="mkt-card-img" src={l.image_url} alt={l.title} loading="lazy" /> : null}
                </div>
                <div className="mkt-card-body">
                  <span className="mkt-price">{formatNaira(l.final_price_naira)}</span>
                  <span className="mkt-card-title">{l.title}</span>
                  <span className="mkt-justlisted-when">{justListedLabel(l.created_at, l.seller?.display_name)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Category tiles, home only (they scroll away once a filter is on). The
          emoji is read live from marketplace_categories.icon; the chip colour is a
          fixed brand-palette rotation by index, not a per-category value. */}
      {!anyFilter && categories.length > 0 && (
        <div className="mkt-cats">
          {tileCats.slice(0, 6).map((c, i) => (
            <button key={c.id} className="mkt-cat" onClick={() => setFilters((f) => ({ ...f, categoryId: c.id, groupId: "", categoryIds: null }))}>
              <span className="ic" aria-hidden style={{ background: i % 2 === 0 ? "var(--mkt-coral-light)" : "var(--mkt-green-light)" }}>{c.icon || CATEGORY_FALLBACK_ICON}</span>
              <span className="nm">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* See more categories (design 31a): the remaining categories reveal in
          batches of 6, in place, grouped by the same 7 category groups used
          everywhere else. Reuses .mkt-cat unchanged, no visual split from the
          featured 6 above — a visible split would read as "second class". */}
      {!anyFilter && revealedCats.length > 0 && (
        <div className="mkt-cats-more">
          {revealedCats.map((c, i) => {
            const prev = i > 0 ? revealedCats[i - 1] : null;
            const showHeader = c.group_id !== (prev?.group_id ?? null);
            const group = groups.find((g) => g.id === c.group_id);
            return (
              <div key={c.id} style={{ display: "contents" }}>
                {showHeader && group && <div className="mkt-cat-group-h">{group.name} group</div>}
                <button className="mkt-cat" onClick={() => setFilters((f) => ({ ...f, categoryId: c.id, groupId: "", categoryIds: null }))}>
                  <span className="ic" aria-hidden style={{ background: (tileCats.length + i) % 2 === 0 ? "var(--mkt-coral-light)" : "var(--mkt-green-light)" }}>{c.icon || CATEGORY_FALLBACK_ICON}</span>
                  <span className="nm">{c.name}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
      {!anyFilter && remainingCount > 0 && (
        <button className="mkt-cat-seemore" onClick={() => setRevealCount((n) => n + 6)}>
          See more categories <span className="n">{remainingCount}</span> ▾
        </button>
      )}
      {!anyFilter && remainderCats.length > 0 && remainingCount === 0 && (
        <div className="mkt-cats-done">
          <span className="rule" aria-hidden />
          <span>That's all {defaultTileCats.length}, for now</span>
        </div>
      )}

      {/* Just Listed + stat strip, mobile only (design 39a): categories stay
          first since they're the fastest route into the grid, these two
          come right after. Same data as the desktop versions above/below,
          just a horizontal-scroll row and compressed tile labels sized for
          a phone screen — not a redesign, an addition. */}
      {!anyFilter && justListed.length > 0 && (
        <div className="mkt-jl-mobile">
          <div className="mkt-jl-mobile-h">
            <span className="t">Just listed</span>
            <button
              type="button"
              className="mkt-jl-mobile-seeall"
              onClick={() => document.getElementById("mkt-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              See all ›
            </button>
          </div>
          <div className="mkt-jl-mobile-row">
            {justListed.map((l) => (
              <Link key={l.id} className="mkt-card" to={`/listing/${l.id}`}>
                <div className="mkt-card-imgwrap">
                  {l.image_url ? <img className="mkt-card-img" src={l.image_url} alt={l.title} loading="lazy" /> : null}
                </div>
                <div className="mkt-card-body">
                  <span className="mkt-price">{formatNaira(l.final_price_naira)}</span>
                  <span className="mkt-card-title">{l.title}</span>
                  <span className="mkt-justlisted-when">{justListedShortLabel(l.created_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!anyFilter && (
        <div className="mkt-stat-strip-mobile">
          <div className="tile"><span className="n">{sellerCount != null ? sellerCount : "—"}</span><span className="l">Sellers so far</span></div>
          <div className="tile"><span className="n">{count}</span><span className="l">Items live now</span></div>
          <div className="tile"><span className="n">100%</span><span className="l">Reviewed by us</span></div>
        </div>
      )}

      {/* Stat tiles (design 38a): real operational numbers rather than
          fabricated activity or invented reviews, since there has only been
          one completed sale. Desktop only (CSS-gated). */}
      {!anyFilter && (
        <div className="mkt-stattiles">
          <div className="mkt-stattile"><span className="n">{sellerCount != null ? sellerCount : "—"}</span><span className="l">Sellers on the marketplace</span></div>
          <div className="mkt-stattile"><span className="n">{count}</span><span className="l">Items listed right now</span></div>
          <div className="mkt-stattile"><span className="n">100%</span><span className="l">Of listings reviewed by our team before they go live</span></div>
        </div>
      )}

      {/* Count + sort + filters (mobile) */}
      <div className="mkt-fbar">
        {/* On the LEFT of the row that already existed: sort and Filters sit
            in .mkt-fbar-right pinned right, so the whole left half was empty
            and no second row is needed. */}
        <CategoryPicker
          categories={categories}
          counts={categoryCounts}
          value={filters.categoryId}
          onChange={chooseCategory}
          loading={categoriesLoading || !categoryCounts}
        />
        <div className="mkt-fbar-right">
          <select className="mkt-sortsel" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as BrowseSort }))} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="price_asc">Price, low to high</option>
            <option value="price_desc">Price, high to low</option>
          </select>
          <button className="mkt-filters-btn" onClick={() => setSheetOpen(true)}>Filters</button>
        </div>
      </div>

      {/* Applied chips */}
      {anyFilter && (
        <div className="mkt-chips-applied">
          {filters.search && <button className="mkt-fchip" onClick={() => { setSearchInput(""); setFilters((f) => ({ ...f, search: "" })); }}>{filters.search} ✕</button>}
          {filters.categoryId && <button className="mkt-fchip" onClick={() => setFilters((f) => ({ ...f, categoryId: "" }))}>{catName} ✕</button>}
          {filters.groupId && <button className="mkt-fchip" onClick={() => setFilters((f) => ({ ...f, groupId: "", categoryIds: null }))}>{groupName} group ✕</button>}
          {(filters.minPrice != null || filters.maxPrice != null) && <button className="mkt-fchip" onClick={() => setFilters((f) => ({ ...f, minPrice: null, maxPrice: null }))}>{filters.minPrice != null ? naira(filters.minPrice) : "₦0"} to {filters.maxPrice != null ? naira(filters.maxPrice) : "any"} ✕</button>}
          {filters.conditions.map((c) => <button key={c} className="mkt-fchip" onClick={() => setFilters((f) => ({ ...f, conditions: f.conditions.filter((x) => x !== c) }))}>{CONDITION_OPTS.find((o) => o.value === c)?.label} ✕</button>)}
          {filters.state && <button className="mkt-fchip" onClick={() => setFilters((f) => ({ ...f, state: "", city: "" }))}>{filters.city ? `${filters.city}, ${filters.state}` : filters.state} ✕</button>}
          <button className="mkt-fchip clear" onClick={clearAll}>Clear all</button>
        </div>
      )}

      <div className="mkt-browse">
        {/* Desktop persistent panel */}
        <aside className="mkt-fpanel">
          <FilterControls value={filters} onChange={setFilters} categories={categories} groups={groups} showCategory />
        </aside>

        <div className="mkt-browse-main">
          {/* NAME WHAT WAS CHOSEN, as Jiji does. A buyer who clicks "Prams and
              strollers" should read that above the results rather than infer
              it from a changed grid. Shown for a category or a group, with
              the live count, and only when one is actually chosen. */}
          {(catName || groupName) && !isLoading && !isError && (
            <div className="mkt-cat-heading">
              <h2>{catName || `${groupName} group`}</h2>
              <span className="n">{count} {count === 1 ? "item" : "items"}</span>
            </div>
          )}
          {isLoading ? (
            <div className="mkt-center"><BMLoadingAnimation size={160} /></div>
          ) : isError ? (
            <div className="mkt-center">
              <div className="mkt-empty-title">We could not load the marketplace</div>
              <div className="mkt-empty-sub">Please check your connection and try again in a moment.</div>
              <button className="mkt-secondary" style={{ maxWidth: 220, marginTop: 6 }} onClick={() => refetch()}>Try again</button>
            </div>
          ) : listings.length === 0 && categoryOnly ? (
            <CategoryNoStockYet
              categoryId={filters.categoryId}
              categoryName={catName}
              categoryIcon={catIcon}
              onClearCategory={() => setFilters((f) => ({ ...f, categoryId: "" }))}
            />
          ) : listings.length === 0 && filters.search.trim() ? (
            /* The only case worth wording differently. The search now reads
               plurals, spacing, noise words and typos, so nothing found
               really does mean we have nothing, not that it could not read
               them. Saying "try loosening a filter" to someone who typed a
               word and applied no filter is advice they cannot act on.
               Never says HOW it matched: match_kind is for us. */
            <div className="mkt-center">
              <div className="mkt-empty-title">We have nothing like "{filters.search.trim()}" right now</div>
              <div className="mkt-empty-sub">
                {anyFilter && !searchOnly
                  ? "Try clearing your filters, or search for something else. New listings are added often."
                  : "Try another word for it, or browse the categories below. New listings are added often."}
              </div>
              {anyFilter && <button className="mkt-secondary" style={{ maxWidth: 220, marginTop: 6 }} onClick={clearAll}>Clear all filters</button>}
            </div>
          ) : listings.length === 0 ? (
            <div className="mkt-center">
              <div className="mkt-empty-title">Nothing matches just yet</div>
              <div className="mkt-empty-sub">Try loosening a filter, there is plenty more across the marketplace. New listings are added often.</div>
              {anyFilter && <button className="mkt-secondary" style={{ maxWidth: 220, marginTop: 6 }} onClick={clearAll}>Clear all filters</button>}
            </div>
          ) : (
            <div id="mkt-grid" className="mkt-grid" style={{ padding: "0 0 32px" }}>
              {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter sheet */}
      {sheetOpen && (
        <FilterSheet
          filters={filters}
          categories={categories}
          groups={groups}
          onApply={(next) => { setFilters(next); setSheetOpen(false); }}
          onClose={() => setSheetOpen(false)}
          onClearAll={() => { clearAll(); setSheetOpen(false); }}
        />
      )}
    </>
  );
}

/** The filter controls, shared by the desktop panel and the mobile sheet. Location
 * is NOT here, it lives beside the search bar in its own state-then-city control. */
function FilterControls({ value, onChange, categories, groups, showCategory }: {
  value: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
  categories: CategoryOption[];
  groups: CategoryGroup[];
  showCategory?: boolean;
}) {
  const set = (patch: Partial<BrowseFilters>) => onChange({ ...value, ...patch });
  const toggleCond = (c: string) => set({ conditions: value.conditions.includes(c) ? value.conditions.filter((x) => x !== c) : [...value.conditions, c] });
  return (
    <div className="mkt-fgroups">
      {showCategory && <CategoryFilter value={value} onChange={onChange} categories={categories} groups={groups} />}

      <div className="mkt-fgroup">
        <div className="mkt-fgroup-h">Price</div>
        <div className="mkt-price-row">
          <div className="mkt-price-box">₦&nbsp;<input inputMode="numeric" placeholder="Min" value={value.minPrice ?? ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); set({ minPrice: v ? Number(v) : null }); }} /></div>
          <span className="to">to</span>
          <div className="mkt-price-box">₦&nbsp;<input inputMode="numeric" placeholder="Max" value={value.maxPrice ?? ""} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); set({ maxPrice: v ? Number(v) : null }); }} /></div>
        </div>
        <div className="mkt-chips" style={{ flexWrap: "wrap", marginTop: 8 }}>
          <button className="mkt-chip" onClick={() => set({ minPrice: null, maxPrice: 10000 })}>Under ₦10k</button>
          <button className="mkt-chip" onClick={() => set({ minPrice: 10000, maxPrice: 50000 })}>₦10k to ₦50k</button>
          <button className="mkt-chip" onClick={() => set({ minPrice: 50000, maxPrice: null })}>Over ₦50k</button>
        </div>
      </div>

      <div className="mkt-fgroup">
        <div className="mkt-fgroup-h">Condition</div>
        <div className="mkt-chips">
          {CONDITION_OPTS.map((o) => (
            <button key={o.value} className={value.conditions.includes(o.value) ? "mkt-chip on" : "mkt-chip"} onClick={() => toggleCond(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Category filter, grouped into the 7 collapsible groups (design decision, see the
 * PR/handoff): "All categories" stays always visible on top, then each group is an
 * accordion header (name + live count + chevron) that reveals its category chips.
 *
 * Default state: every group COLLAPSED, identical on mobile and desktop, so the 7
 * headers act as a scannable index over the ~37 categories. The group that holds the
 * current selection is force-opened (a real entry in the open set, added on mount and
 * whenever the selection moves into it) so the buyer never loses their pick; that
 * group also shows a coral count as a breadcrumb even if they later collapse it.
 * Headers are 48px tall (thumb sized); the chevron rotates and the body fades in,
 * both stilled under prefers-reduced-motion (see marketplace.css).
 */
function CategoryFilter({ value, onChange, categories, groups }: {
  value: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
  categories: CategoryOption[];
  groups: CategoryGroup[];
}) {
  const set = (patch: Partial<BrowseFilters>) => onChange({ ...value, ...patch });
  const { grouped, ungrouped } = useMemo(() => groupCategories(categories, groups), [categories, groups]);
  const selectedGroupId = useMemo(
    () => categories.find((c) => c.id === value.categoryId)?.group_id ?? null,
    [categories, value.categoryId],
  );

  const [open, setOpen] = useState<Set<string>>(() => new Set(selectedGroupId ? [selectedGroupId] : []));
  // Force the group holding the active selection open (on mount via the initialiser,
  // and here whenever the selection moves into a different group). Never auto-closes
  // a group the buyer opened, so it only ever adds.
  useEffect(() => {
    if (selectedGroupId) setOpen((prev) => (prev.has(selectedGroupId) ? prev : new Set(prev).add(selectedGroupId)));
  }, [selectedGroupId]);

  const toggle = (id: string) =>
    setOpen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const catBtn = (c: CategoryOption) => (
    <button key={c.id} className={value.categoryId === c.id ? "mkt-fopt on" : "mkt-fopt"} onClick={() => set({ categoryId: c.id, groupId: "", categoryIds: null })}>
      <span className="fopt-ic" aria-hidden>{c.icon || CATEGORY_FALLBACK_ICON}</span>{c.name}
    </button>
  );

  return (
    <div className="mkt-fgroup">
      <div className="mkt-fgroup-h">Category</div>
      <button className={value.categoryId === "" ? "mkt-fopt on" : "mkt-fopt"} onClick={() => set({ categoryId: "", groupId: "", categoryIds: null })}>
        <span className="fopt-ic" aria-hidden>{ALL_CATEGORIES_ICON}</span>All categories
      </button>

      <div className="mkt-catgroups">
        {grouped.map(({ group, items }) => {
          const isOpen = open.has(group.id);
          const hasActive = group.id === selectedGroupId;
          const bodyId = `catg-${group.id}`;
          return (
            <div className="mkt-catgroup" key={group.id}>
              <button
                type="button"
                className={hasActive ? "mkt-catgroup-h has-active" : "mkt-catgroup-h"}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => toggle(group.id)}
              >
                <span className="nm">{group.name}</span>
                <span className="ct">{items.length}</span>
                <span className={isOpen ? "chev open" : "chev"} aria-hidden>▾</span>
              </button>
              {isOpen && <div className="mkt-catgroup-body" id={bodyId}>{items.map(catBtn)}</div>}
            </div>
          );
        })}
        {/* Defensive: any allowed category with no known group shows loose, never hidden. */}
        {ungrouped.map(catBtn)}
      </div>
    </div>
  );
}

/**
 * Location + city, beside the search bar. Default "All Nigeria". A state must be
 * chosen before a city, exactly the create-listing dependent pattern: a native
 * state select plus the shared AreaCombobox for the searchable area. Filtering is
 * server side on location_state and location_city (see buildBrowseQuery).
 */
function LocationControl({ filters, onChange, states }: {
  filters: BrowseFilters;
  onChange: (updater: (f: BrowseFilters) => BrowseFilters) => void;
  states: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const stateId = useMemo(() => states.find((s) => s.name === filters.state)?.id ?? "", [states, filters.state]);
  const { data: areas = [] } = useAreasForState(stateId);
  const label = filters.city ? filters.city : filters.state ? filters.state : "All Nigeria";

  return (
    <div className="mkt-loc">
      <button className="mkt-loc-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="lbl">Where</span>
        <span className="val">{label}</span>
        <span className="car">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <>
          <div className="mkt-loc-scrim" onClick={() => setOpen(false)} />
          <div className="mkt-loc-panel">
            <div className="mkt-fgroup-h">State</div>
            <select
              className="mkt-native-select"
              value={filters.state}
              onChange={(e) => onChange((f) => ({ ...f, state: e.target.value, city: "" }))}
            >
              <option key="all-ng" value="">All Nigeria</option>
              {states.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>

            <div className="mkt-fgroup-h" style={{ marginTop: 12 }}>City or area</div>
            <AreaCombobox
              key={stateId || "none"}
              areas={areas}
              value={filters.city}
              onChange={(name) => onChange((f) => ({ ...f, city: name }))}
              disabled={!filters.state}
            />
            {filters.city && <button className="mkt-loc-allareas" onClick={() => onChange((f) => ({ ...f, city: "" }))}>All areas in {filters.state}</button>}

            <button className="mkt-primary" style={{ marginTop: 12 }} onClick={() => setOpen(false)}>Done</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Mobile bottom sheet: edits a draft, previews the live count, applies on Show. */
function FilterSheet({ filters, categories, groups, onApply, onClose, onClearAll }: {
  filters: BrowseFilters;
  categories: CategoryOption[];
  groups: CategoryGroup[];
  onApply: (next: BrowseFilters) => void;
  onClose: () => void;
  onClearAll: () => void;
}) {
  const [draft, setDraft] = useState<BrowseFilters>(filters);
  const { data: liveCount, isFetching } = useBrowseCount(draft, true);

  return (
    <div className="mkt-sheet-overlay" onClick={onClose}>
      <div className="mkt-fsheet" onClick={(e) => e.stopPropagation()}>
        <div className="mkt-fsheet-top">
          <h3>Filters</h3>
          <button className="mkt-fsheet-clear" onClick={onClearAll}>Clear all</button>
        </div>

        <div className="mkt-fsheet-body">
          <div className="mkt-fgroup">
            <div className="mkt-fgroup-h">Sort by</div>
            <div className="mkt-chips" style={{ flexWrap: "wrap" }}>
              {([["newest", "Newest first"], ["price_asc", "Price, low to high"], ["price_desc", "Price, high to low"]] as Array<[BrowseSort, string]>).map(([v, l]) => (
                <button key={v} className={draft.sort === v ? "mkt-chip on" : "mkt-chip"} onClick={() => setDraft((d) => ({ ...d, sort: v }))}>{l}</button>
              ))}
            </div>
          </div>
          <FilterControls value={draft} onChange={setDraft} categories={categories} groups={groups} showCategory />
        </div>

        <div className="mkt-fsheet-foot">
          <button className="mkt-primary" onClick={() => onApply(draft)}>
            {isFetching ? "Counting…" : `Show ${liveCount ?? 0} ${(liveCount ?? 0) === 1 ? "item" : "items"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
