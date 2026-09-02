import { useMemo, useRef, useState } from "react";
import { groupsByStock, type CountedCategory } from "./categoryOrder";
import type { CategoryOption, CategoryGroup } from "../data/useListings";

/**
 * The desktop category bar. Hover a group to reveal it, click a category to
 * filter.
 *
 * IT NEVER CHANGES HEIGHT, including during load, and that is a constraint
 * rather than a bug fix: there was no desktop category navigation at all
 * before this (the emoji tiles are display:none above the mobile breakpoint),
 * so nothing was shifting. The risk is one this feature INTRODUCES, from two
 * directions at once:
 *
 *   the bar is empty until categories load, then fills
 *   the ORDER depends on live counts, so rendering before they arrive would
 *   reshuffle the groups in front of the buyer
 *
 * Both are solved the same way. The bar's height is fixed in CSS from first
 * paint, and its contents render only once BOTH categories and counts are in.
 * It fills in once, in its final order, and never moves.
 *
 * HOVERING CHANGES NOTHING. It reveals the panel and nothing else: no filter,
 * no URL change, no fetch. Only a click filters.
 */
export default function CategoryMenu({
  categories, groups, counts, ready, activeCategoryId, onPick,
}: {
  categories: CategoryOption[];
  groups: CategoryGroup[];
  counts: Map<string, number> | undefined;
  /** Everything needed to render the FINAL order is present. */
  ready: boolean;
  activeCategoryId: string;
  onPick: (categoryId: string) => void;
}) {
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  // A small delay on leaving, so crossing the gap between the group and its
  // panel does not snap it shut mid-reach.
  const closeTimer = useRef<number | null>(null);

  const ordered = useMemo(
    () => (ready && counts ? groupsByStock(categories, groups, counts) : []),
    [categories, groups, counts, ready],
  );

  function openNow(id: string) {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpenGroupId(id);
  }
  function closeSoon() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenGroupId(null), 120);
  }

  return (
    <nav className="mkt-catbar" aria-label="Categories" onMouseLeave={closeSoon}>
      <div className="mkt-catbar-inner">
        {/* Rendered only when the final order is known. The bar keeps its
            height either way, so this fills in rather than pushing anything. */}
        {ordered.map((g) => {
          const open = openGroupId === g.group.id;
          return (
            <div
              key={g.group.id}
              className={`mkt-catbar-grp${open ? " open" : ""}`}
              onMouseEnter={() => openNow(g.group.id)}
              onFocus={() => openNow(g.group.id)}
            >
              <button type="button" className="mkt-catbar-grpbtn" aria-expanded={open}>
                <span className="nm">{g.group.name}</span>
                <span className="ct">{g.count}</span>
              </button>

              {open && (
                <div className="mkt-catbar-panel" onMouseEnter={() => openNow(g.group.id)}>
                  <div className="mkt-catbar-panel-h">{g.group.name}</div>
                  <div className="mkt-catbar-list">
                    {g.categories.map((c) => (
                      <CategoryLink
                        key={c.id}
                        c={c}
                        active={c.id === activeCategoryId}
                        onPick={() => { onPick(c.id); setOpenGroupId(null); }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * One category. The count is always shown; an empty one is DIMMED, not hidden.
 *
 * 21 of the 49 allowed categories have nothing in them. Hiding them would make
 * the catalogue look thinner than it is and make the menu change shape as
 * stock moves. Dimming tells the truth: we have this category, nobody is
 * selling one right now. It stays clickable, and the empty result names it.
 */
function CategoryLink({ c, active, onPick }: { c: CountedCategory; active: boolean; onPick: () => void }) {
  const empty = c.count === 0;
  return (
    <button
      type="button"
      className={`mkt-catbar-cat${active ? " on" : ""}${empty ? " empty" : ""}`}
      onClick={onPick}
      title={empty ? `${c.name}, nothing listed right now` : `${c.name}, ${c.count} listed`}
    >
      <span className="nm">{c.name}</span>
      <span className="ct">{c.count}</span>
    </button>
  );
}
