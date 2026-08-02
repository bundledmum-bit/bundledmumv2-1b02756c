import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useLiveListings } from "../data/useListings";
import ListingCard from "../components/ListingCard";

/**
 * BROWSE, the marketplace front door, reskinned to the design: a green header
 * carrying the brand, search, and the two filter pills, then the 2-up card grid.
 * Search and both filters run client-side over the fetched live listings, so
 * typing and filtering stay instant. All data plumbing is unchanged.
 */
export default function BrowsePage() {
  const { data, isLoading, isError } = useLiveListings();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [state, setState] = useState("");

  const listings = data ?? [];

  // Filter options come from the live listings themselves, so we never offer a
  // category or location that has nothing to show.
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const l of listings) {
      const name = l.category?.name;
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [listings]);

  const states = useMemo(() => {
    const set = new Set<string>();
    for (const l of listings) {
      if (l.location_state) set.add(l.location_state);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [listings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      if (q && !l.title.toLowerCase().includes(q)) return false;
      if (category && l.category?.name !== category) return false;
      if (state && l.location_state !== state) return false;
      return true;
    });
  }, [listings, search, category, state]);

  // Home header line, browse only, sitting where the old greeting was so nothing
  // below it moves. Shares its row with the Sell link (design R3).
  const homeLine = (
    <div className="mkt-home-line">
      <h1>Buy or sell used baby and toddler items</h1>
      <Link to="/sell" className="mkt-home-sell">Sell</Link>
    </div>
  );

  const header = (
    <div className="mkt-topbar">
      <input
        className="mkt-search"
        type="search"
        placeholder="Search prams, cots, maternity wear"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search items by title"
      />
      <div className="mkt-filters">
        <select
          className="mkt-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="mkt-select"
          value={state}
          onChange={(e) => setState(e.target.value)}
          aria-label="Filter by location"
        >
          <option value="">All locations</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <>
        {homeLine}
        {header}
        <div className="mkt-center">
          <BMLoadingAnimation size={160} />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        {homeLine}
        {header}
        <div className="mkt-center">
          <div className="mkt-empty-title">We could not load the marketplace</div>
          <div className="mkt-empty-sub">
            Please check your connection and try again in a moment.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {homeLine}
      {header}
      <div className="mkt-count">
        {filtered.length} {filtered.length === 1 ? "item" : "items"}, trusted
        quality, checked by our team
      </div>
      {filtered.length === 0 ? (
        <div className="mkt-center">
          <div className="mkt-empty-title">Nothing here just yet</div>
          <div className="mkt-empty-sub">
            We could not find any items to match. Try a different search or clear
            your filters, new listings are added often.
          </div>
        </div>
      ) : (
        <div className="mkt-grid">
          {filtered.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </>
  );
}
