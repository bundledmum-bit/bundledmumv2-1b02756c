import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  type BrowseFilters,
  type BrowseSort,
  type CategoryOption,
  type CategoryGroup,
} from "../data/useListings";
import ListingCard from "../components/ListingCard";
import AreaCombobox from "../sell/AreaCombobox";

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

const EMPTY: BrowseFilters = { search: "", categoryId: "", state: "", city: "", minPrice: null, maxPrice: null, conditions: [], sort: "newest" };

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

export default function BrowsePage() {
  // Optional deep link, e.g. from a gone listing's "Browse {category}" CTA:
  // ?category=<id> preselects that category filter. Additive only — a plain
  // /marketplace visit is unaffected, EMPTY still governs the default.
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<BrowseFilters>({ ...EMPTY, categoryId: searchParams.get("category") || "" });
  const [searchInput, setSearchInput] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const { isLoggedIn } = useCustomerAuth();

  // Debounce the search box into the server-side filters.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, refetch } = useBrowseListings(filters);
  const { data: categories = [] } = useAllowedCategories();
  const { data: groups = [] } = useCategoryGroups();
  const { data: states = [] } = useAllowedStates();

  const listings = data?.listings ?? [];
  const count = data?.count ?? 0;

  const anyFilter = !!(filters.categoryId || filters.state || filters.city || filters.minPrice != null || filters.maxPrice != null || filters.conditions.length || filters.search);

  const catName = useMemo(() => categories.find((c) => c.id === filters.categoryId)?.name ?? "", [categories, filters.categoryId]);

  // Flat list in group display order, for the six home tiles (their design is
  // unchanged; only the source order now follows the groups).
  const tileCats = useMemo(() => groupCategories(categories, groups).grouped.flatMap((x) => x.items), [categories, groups]);

  function clearAll() { setFilters(EMPTY); setSearchInput(""); }

  return (
    <>
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
              <span className="mkt-hl-long">Buy or sell used baby and toddler items</span>
              <span className="mkt-hl-short">Buy or sell used baby items</span>
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
            {isLoggedIn
              ? <Link to="/orders" className="mkt-topbar-link">My orders</Link>
              : <Link to="/login" className="mkt-topbar-link">Log in</Link>}
          </nav>
        </div>
      </div>

      {/* Category tiles, home only (they scroll away once a filter is on). The
          emoji is read live from marketplace_categories.icon; the chip colour is a
          fixed brand-palette rotation by index, not a per-category value. */}
      {!anyFilter && categories.length > 0 && (
        <div className="mkt-cats">
          {tileCats.slice(0, 6).map((c, i) => (
            <button key={c.id} className="mkt-cat" onClick={() => setFilters((f) => ({ ...f, categoryId: c.id }))}>
              <span className="ic" aria-hidden style={{ background: i % 2 === 0 ? "var(--mkt-coral-light)" : "var(--mkt-green-light)" }}>{c.icon || CATEGORY_FALLBACK_ICON}</span>
              <span className="nm">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Count + sort + filters (mobile) */}
      <div className="mkt-fbar">
        <span className="mkt-count" style={{ padding: 0 }}>{count} {count === 1 ? "item" : "items"}, checked by our team</span>
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
          {isLoading ? (
            <div className="mkt-center"><BMLoadingAnimation size={160} /></div>
          ) : isError ? (
            <div className="mkt-center">
              <div className="mkt-empty-title">We could not load the marketplace</div>
              <div className="mkt-empty-sub">Please check your connection and try again in a moment.</div>
              <button className="mkt-secondary" style={{ maxWidth: 220, marginTop: 6 }} onClick={() => refetch()}>Try again</button>
            </div>
          ) : listings.length === 0 ? (
            <div className="mkt-center">
              <div className="mkt-empty-title">Nothing matches just yet</div>
              <div className="mkt-empty-sub">Try loosening a filter, there is plenty more across the marketplace. New listings are added often.</div>
              {anyFilter && <button className="mkt-secondary" style={{ maxWidth: 220, marginTop: 6 }} onClick={clearAll}>Clear all filters</button>}
            </div>
          ) : (
            <div className="mkt-grid" style={{ padding: "0 0 32px" }}>
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
    <button key={c.id} className={value.categoryId === c.id ? "mkt-fopt on" : "mkt-fopt"} onClick={() => set({ categoryId: c.id })}>
      <span className="fopt-ic" aria-hidden>{c.icon || CATEGORY_FALLBACK_ICON}</span>{c.name}
    </button>
  );

  return (
    <div className="mkt-fgroup">
      <div className="mkt-fgroup-h">Category</div>
      <button className={value.categoryId === "" ? "mkt-fopt on" : "mkt-fopt"} onClick={() => set({ categoryId: "" })}>
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
