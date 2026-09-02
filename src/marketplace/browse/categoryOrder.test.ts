import { describe, it, expect } from "vitest";
import { groupsByStock, categoriesByStock, matchesCategorySearch } from "./categoryOrder";
import type { CategoryOption, CategoryGroup } from "../data/useListings";

const cat = (id: string, name: string, group_id: string | null): CategoryOption =>
  ({ id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), icon: null, group_id, sort_order: 0 });
const grp = (id: string, name: string): CategoryGroup => ({ id, name, slug: name.toLowerCase(), sort_order: 0 });

describe("ordering by stock", () => {
  it("puts the most stocked category first", () => {
    const cats = [cat("a", "Ada", "g"), cat("b", "Bola", "g")];
    const out = categoriesByStock(cats, new Map([["a", 2], ["b", 9]]));
    expect(out.map((c) => c.name)).toEqual(["Bola", "Ada"]);
  });

  it("breaks a tie by NAME, so the order is stable across reloads", () => {
    // Travel and carriers vs Nursery, both on 29 today. Without the tiebreak
    // these swap between loads and the menu reads as broken.
    const counts = new Map([["t", 29], ["n", 29]]);
    const forward = categoriesByStock([cat("t", "Travel and carriers", "g"), cat("n", "Nursery", "g")], counts);
    const reversed = categoriesByStock([cat("n", "Nursery", "g"), cat("t", "Travel and carriers", "g")], counts);
    expect(forward.map((c) => c.name)).toEqual(["Nursery", "Travel and carriers"]);
    // Same output from the opposite input order: that IS the stability claim.
    expect(reversed.map((c) => c.name)).toEqual(forward.map((c) => c.name));
  });

  it("sinks empty categories to the bottom without removing them", () => {
    const cats = [cat("a", "Ada", "g"), cat("z", "Zoe", "g")];
    const out = categoriesByStock(cats, new Map([["a", 0], ["z", 3]]));
    expect(out.map((c) => c.name)).toEqual(["Zoe", "Ada"]);
    expect(out).toHaveLength(2);
    expect(out[1].count).toBe(0);
  });

  it("gives every category a count, zero when it has none", () => {
    const out = categoriesByStock([cat("a", "Ada", "g")], new Map());
    expect(out[0].count).toBe(0);
  });
});

describe("groups", () => {
  const cats = [
    cat("c1", "Dresses", "clothes"), cat("c2", "Shoes", "clothes"),
    cat("n1", "Cots", "nursery"), cat("t1", "Prams", "travel"),
  ];
  const groups = [grp("clothes", "Clothing and shoes"), grp("nursery", "Nursery"), grp("travel", "Travel and carriers")];

  it("sums its categories and orders groups the same way", () => {
    const out = groupsByStock(cats, groups, new Map([["c1", 100], ["c2", 31], ["n1", 29], ["t1", 29]]));
    expect(out.map((g) => g.group.name)).toEqual(["Clothing and shoes", "Nursery", "Travel and carriers"]);
    expect(out[0].count).toBe(131);
  });

  it("breaks a group tie by name too", () => {
    const counts = new Map([["c1", 0], ["c2", 0], ["n1", 29], ["t1", 29]]);
    const a = groupsByStock(cats, groups, counts).map((g) => g.group.name);
    const b = groupsByStock([...cats].reverse(), [...groups].reverse(), counts).map((g) => g.group.name);
    expect(a).toEqual(b);
    expect(a.slice(0, 2)).toEqual(["Nursery", "Travel and carriers"]);
  });

  it("sorts categories inside a group by stock as well", () => {
    const out = groupsByStock(cats, groups, new Map([["c1", 5], ["c2", 90]]));
    expect(out[0].categories.map((c) => c.name)).toEqual(["Shoes", "Dresses"]);
  });

  it("keeps a group whose categories are all empty rather than dropping it", () => {
    const out = groupsByStock(cats, groups, new Map());
    expect(out).toHaveLength(3);
    expect(out.every((g) => g.count === 0)).toBe(true);
  });

  it("never loses a category whose group is missing", () => {
    const out = groupsByStock([...cats, cat("x", "Orphan", "gone")], groups, new Map([["x", 4]]));
    expect(out.flatMap((g) => g.categories).some((c) => c.name === "Orphan")).toBe(true);
  });
});

describe("the dropdown's search", () => {
  it("matches anywhere in the name, ignoring case", () => {
    expect(matchesCategorySearch("Breast pump motors", "pump")).toBe(true);
    expect(matchesCategorySearch("Breast pump motors", "BREAST")).toBe(true);
  });
  it("shows everything when nothing is typed", () => {
    expect(matchesCategorySearch("Anything", "   ")).toBe(true);
  });
  it("excludes a name that does not contain it", () => {
    expect(matchesCategorySearch("Cots and cribs", "pram")).toBe(false);
  });
});
