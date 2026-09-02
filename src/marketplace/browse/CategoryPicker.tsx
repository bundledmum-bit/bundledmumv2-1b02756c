import { useEffect, useMemo, useRef, useState } from "react";
import { categoriesByStock, matchesCategorySearch, type CountedCategory } from "./categoryOrder";
import type { CategoryOption } from "../data/useListings";

/**
 * The mobile category dropdown, on the LEFT of the existing filter row.
 *
 * It goes on that row rather than a new one because the row was already there
 * with its whole left half empty: sort and Filters sit in .mkt-fbar-right,
 * pinned right. A second row would cost vertical space on the screen where
 * listings matter most.
 *
 * IT HAS A SEARCH BOX because 49 categories is too many to scroll past on a
 * phone. Typing narrows the list as they type; it never searches listings,
 * only category names, so it cannot be confused with the main search bar.
 *
 * Selecting FILTERS THE PAGE and closes. It is a filter, not navigation: the
 * URL updates through the same effect every other filter uses.
 */
export default function CategoryPicker({
  categories, counts, value, onChange, loading,
}: {
  categories: CategoryOption[];
  counts: Map<string, number> | undefined;
  value: string;
  onChange: (categoryId: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const ordered = useMemo(
    () => (counts ? categoriesByStock(categories, counts) : []),
    [categories, counts],
  );
  const shown = useMemo(
    () => ordered.filter((c) => matchesCategorySearch(c.name, q)),
    [ordered, q],
  );
  const selected = ordered.find((c) => c.id === value) ?? null;

  // Focus the search the moment it opens: on a phone the keyboard appearing
  // is the affordance that says "you can type here".
  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQ("");
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="mkt-catpick">
      <button
        type="button"
        className={`mkt-catpick-btn${selected ? " on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={loading}
      >
        <span className="nm">{selected ? selected.name : "All categories"}</span>
        <span className="car" aria-hidden>▾</span>
      </button>

      {open && (
        <>
          <div className="mkt-catpick-scrim" onClick={() => setOpen(false)} />
          <div className="mkt-catpick-panel" role="listbox">
            <input
              ref={searchRef}
              className="mkt-catpick-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search categories"
              aria-label="Search categories"
            />

            <button
              type="button"
              className={`mkt-catpick-opt${!value ? " sel" : ""}`}
              onClick={() => pick("")}
            >
              <span className="nm">All categories</span>
            </button>

            {shown.length === 0 ? (
              <div className="mkt-catpick-none">No category matches "{q.trim()}".</div>
            ) : (
              shown.map((c) => <Option key={c.id} c={c} selected={c.id === value} onPick={pick} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One row. The count is shown for EVERY category including the empty ones.
 *
 * A buyer choosing between "Prams (11)" and "Car seats (2)" is deciding better
 * than one choosing blind, and an empty category that says so is honest rather
 * than a dead end they discover after tapping. Dimmed, not hidden, and still
 * selectable: hiding would make the catalogue look thinner than it is and make
 * the menu change shape as stock moves.
 */
function Option({ c, selected, onPick }: { c: CountedCategory; selected: boolean; onPick: (id: string) => void }) {
  const empty = c.count === 0;
  return (
    <button
      type="button"
      className={`mkt-catpick-opt${selected ? " sel" : ""}${empty ? " empty" : ""}`}
      onClick={() => onPick(c.id)}
      role="option"
      aria-selected={selected}
    >
      <span className="nm">{c.name}</span>
      <span className="ct">{c.count}</span>
    </button>
  );
}
