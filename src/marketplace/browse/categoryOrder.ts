import type { CategoryOption, CategoryGroup } from "../data/useListings";

/**
 * The category menu's order: most stock first.
 *
 * WHY COUNT AND NOT A FIXED ORDER. 21 of the 49 allowed categories are empty.
 * A fixed order buries the 131 clothing listings below categories nobody is
 * selling in. Sorting by stock surfaces what a buyer can actually buy.
 *
 * THE TIEBREAK IS NOT OPTIONAL. Travel and carriers and Nursery are both on 29
 * today. Sorting by count alone leaves their relative order to whatever the
 * array happened to hold, so they would swap between page loads and read as a
 * broken menu. Count descending, THEN name ascending, makes the order a pure
 * function of the data: identical input gives identical output, every reload.
 *
 * The known cost, accepted rather than mitigated: the menu reorders as stock
 * moves, so a buyer who learns Nursery is third finds it elsewhere next week.
 * At 21 of 49 empty, surfacing real stock is worth more than positional memory.
 */

export interface CountedCategory extends CategoryOption {
  count: number;
}

export interface CountedGroup {
  group: CategoryGroup;
  count: number;
  categories: CountedCategory[];
}

/** Count desc, then name asc. Never count alone. */
function byCountThenName<T extends { count: number; name: string }>(a: T, b: T): number {
  return b.count - a.count || a.name.localeCompare(b.name);
}

/**
 * Groups with their categories, both sorted the same way.
 *
 * A group's count is the sum of its categories', so a group with nothing in it
 * sinks to the bottom exactly as an empty category does, and neither is hidden.
 */
export function groupsByStock(
  categories: CategoryOption[],
  groups: CategoryGroup[],
  counts: Map<string, number>,
): CountedGroup[] {
  const counted: CountedCategory[] = categories.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));
  const out: CountedGroup[] = groups.map((g) => {
    const inGroup = counted.filter((c) => c.group_id === g.id).sort(byCountThenName);
    return { group: g, count: inGroup.reduce((s, c) => s + c.count, 0), categories: inGroup };
  });
  // A category with no group would otherwise vanish from the menu entirely.
  // None today, defended against because losing one silently is worse than an
  // extra group nobody sees.
  const orphans = counted.filter((c) => !c.group_id || !groups.some((g) => g.id === c.group_id));
  if (orphans.length) {
    out.push({
      group: { id: "__other", name: "Everything else", slug: "", sort_order: 999 },
      count: orphans.reduce((s, c) => s + c.count, 0),
      categories: orphans.sort(byCountThenName),
    });
  }
  return out
    .filter((g) => g.categories.length > 0)
    .sort((a, b) => b.count - a.count || a.group.name.localeCompare(b.group.name));
}

/** Every category in one flat list, same ordering, for the mobile dropdown. */
export function categoriesByStock(
  categories: CategoryOption[],
  counts: Map<string, number>,
): CountedCategory[] {
  return categories
    .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
    .sort(byCountThenName);
}

/** Case and space insensitive name match, for the dropdown's search box. */
export function matchesCategorySearch(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return name.toLowerCase().includes(q);
}
