import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import {
  useBrowseListings,
  useBrowseCount,
  useAllowedCategories,
  useAllowedStates,
  useAreasForState,
  type BrowseFilters,
  type BrowseSort,
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

function naira(n: number) { return `₦${Math.round(n).toLocaleString("en-NG")}`; }

export default function BrowsePage() {
  const [filters, setFilters] = useState<BrowseFilters>(EMPTY);
  const [searchInput, setSearchInput] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  // Debounce the search box into the server-side filters.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError } = useBrowseListings(filters);
  const { data: categories = [] } = useAllowedCategories();
  const { data: states = [] } = useAllowedStates();

  const listings = data?.listings ?? [];
  const count = data?.count ?? 0;

  const anyFilter = !!(filters.categoryId || filters.state || filters.city || filters.minPrice != null || filters.maxPrice != null || filters.conditions.length || filters.search);

  const catName = useMemo(() => categories.find((c) => c.id === filters.categoryId)?.name ?? "", [categories, filters.categoryId]);

  function clearAll() { setFilters(EMPTY); setSearchInput(""); }

  return (
    <>
      <div className="mkt-topbar">
        <div className="mkt-home-line" style={{ padding: 0, maxWidth: "none" }}>
          <h1 style={{ color: "var(--mkt-cream)" }}>Buy or sell used baby and toddler items</h1>
          <Link to="/sell" className="mkt-home-sell">Sell</Link>
        </div>
        <input
          className="mkt-search"
          type="search"
          placeholder="Search prams, cots, bibs"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search items by title"
        />
        <LocationControl filters={filters} onChange={setFilters} states={states} />
      </div>

      {/* Category tiles, home only (they scroll away once a filter is on). */}
      {!anyFilter && categories.length > 0 && (
        <div className="mkt-cats">
          {categories.slice(0, 6).map((c) => (
            <button key={c.id} className="mkt-cat" onClick={() => setFilters((f) => ({ ...f, categoryId: c.id }))}>
              <span className="ic" aria-hidden>◦</span>
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
          <FilterControls value={filters} onChange={setFilters} categories={categories} showCategory />
        </aside>

        <div className="mkt-browse-main">
          {isLoading ? (
            <div className="mkt-center"><BMLoadingAnimation size={160} /></div>
          ) : isError ? (
            <div className="mkt-center">
              <div className="mkt-empty-title">We could not load the marketplace</div>
              <div className="mkt-empty-sub">Please check your connection and try again in a moment.</div>
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
function FilterControls({ value, onChange, categories, showCategory }: {
  value: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
  categories: Array<{ id: string; name: string }>;
  showCategory?: boolean;
}) {
  const set = (patch: Partial<BrowseFilters>) => onChange({ ...value, ...patch });
  const toggleCond = (c: string) => set({ conditions: value.conditions.includes(c) ? value.conditions.filter((x) => x !== c) : [...value.conditions, c] });
  return (
    <div className="mkt-fgroups">
      {showCategory && (
        <div className="mkt-fgroup">
          <div className="mkt-fgroup-h">Category</div>
          <button className={value.categoryId === "" ? "mkt-fopt on" : "mkt-fopt"} onClick={() => set({ categoryId: "" })}>All categories</button>
          {categories.map((c) => (
            <button key={c.id} className={value.categoryId === c.id ? "mkt-fopt on" : "mkt-fopt"} onClick={() => set({ categoryId: c.id })}>{c.name}</button>
          ))}
        </div>
      )}

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
function FilterSheet({ filters, categories, onApply, onClose, onClearAll }: {
  filters: BrowseFilters;
  categories: Array<{ id: string; name: string }>;
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
          <FilterControls value={draft} onChange={setDraft} categories={categories} showCategory />
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
