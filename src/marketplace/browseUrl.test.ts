import { describe, it, expect } from "vitest";
import { readBrowseUrl, writeBrowseUrl, browseUrlKey } from "./browseUrl";
import type { BrowseFilters } from "./data/useListings";

const EMPTY: BrowseFilters = {
  search: "", categoryId: "", groupId: "", categoryIds: null, state: "", city: "",
  minPrice: null, maxPrice: null, conditions: [], sort: "newest",
};

const write = (f: Partial<BrowseFilters>, slugs = {}) =>
  browseUrlKey(writeBrowseUrl({ ...EMPTY, ...f }, slugs));

describe("writeBrowseUrl", () => {
  it("writes nothing at all for a plain browse", () => {
    expect(write({})).toBe("");
  });

  it("is readable for the case that gets pasted into WhatsApp", () => {
    expect(decodeURIComponent(write({ search: "cot", state: "Lagos" }))).toBe("q=cot&state=Lagos");
  });

  it("omits every default rather than writing empty params", () => {
    // sort=newest and an empty condition list are defaults and must not appear
    expect(write({ search: "cot", sort: "newest", conditions: [] })).toBe("q=cot");
    expect(write({ search: "cot", sort: "price_asc" })).toBe("q=cot&sort=price_asc");
  });

  it("lets a single category win over a group, matching the query's own precedence", () => {
    const s = write({ categoryId: "c1", groupId: "g1" }, { categorySlug: "cots-and-cribs", groupSlug: "sleeping" });
    expect(s).toBe("category=cots-and-cribs");
  });

  it("falls back to the group when no category is set", () => {
    expect(write({ groupId: "g1" }, { groupSlug: "sleeping" })).toBe("group=sleeping");
  });

  it("writes several conditions as one comma separated param", () => {
    expect(decodeURIComponent(write({ conditions: ["almost_new", "good"] }))).toBe("condition=almost_new,good");
  });
});

describe("readBrowseUrl", () => {
  const read = (s: string) => readBrowseUrl(new URLSearchParams(s));

  it("restores a shared search exactly", () => {
    const r = read("q=cot&state=Lagos");
    expect(r.filters.search).toBe("cot");
    expect(r.filters.state).toBe("Lagos");
  });

  it("reads several conditions back out", () => {
    expect(read("condition=almost_new,good").filters.conditions).toEqual(["almost_new", "good"]);
  });

  it("drops a condition that is not one of ours rather than trusting the URL", () => {
    expect(read("condition=good,pristine").filters.conditions).toEqual(["good"]);
  });

  it("dedupes a hand edited duplicate, so the link matches the same view reached by clicking", () => {
    expect(read("condition=good,good").filters.conditions).toEqual(["good"]);
  });

  it("falls back to newest for a sort it does not recognise", () => {
    expect(read("sort=cheapest").filters.sort).toBe("newest");
    expect(read("sort=price_desc").filters.sort).toBe("price_desc");
  });

  it("ignores a price that is not a positive number", () => {
    expect(read("min=abc").filters.minPrice).toBeNull();
    expect(read("min=0").filters.minPrice).toBeNull();
    expect(read("min=-5").filters.minPrice).toBeNull();
    expect(read("min=5abc").filters.minPrice).toBeNull();
    expect(read("min=5000").filters.minPrice).toBe(5000);
  });

  it("trims a search so a stray space is not a different page", () => {
    expect(read("q=%20cot%20").filters.search).toBe("cot");
  });
});

describe("the round trip", () => {
  it("survives every filter at once", () => {
    const f: BrowseFilters = {
      ...EMPTY, search: "cot", categoryId: "c1", state: "Lagos", city: "Ikeja",
      minPrice: 5000, maxPrice: 50000, conditions: ["almost_new", "good"], sort: "price_asc",
    };
    const params = writeBrowseUrl(f, { categorySlug: "cots-and-cribs" });
    const back = readBrowseUrl(params);
    expect(back.filters.search).toBe("cot");
    expect(back.category).toBe("cots-and-cribs");
    expect(back.filters.state).toBe("Lagos");
    expect(back.filters.city).toBe("Ikeja");
    expect(back.filters.minPrice).toBe(5000);
    expect(back.filters.maxPrice).toBe(50000);
    expect(back.filters.conditions).toEqual(["almost_new", "good"]);
    expect(back.filters.sort).toBe("price_asc");
  });

  it("is stable, so the same view never rewrites history with a reordered URL", () => {
    const f: BrowseFilters = { ...EMPTY, search: "cot", state: "Lagos", sort: "price_asc" };
    expect(browseUrlKey(writeBrowseUrl(f, {}))).toBe(browseUrlKey(writeBrowseUrl({ ...f }, {})));
  });
});

describe("carrying utm through the rewrite", () => {
  const carry = (qs: string, f: Partial<BrowseFilters> = {}, slugs = {}) =>
    browseUrlKey(writeBrowseUrl({ ...EMPTY, ...f }, slugs, new URLSearchParams(qs)));

  it("keeps a campaign tag that arrived on the link", () => {
    // The storefront cross-sell banner's crossing: without this the tag was
    // gone on first render, before anything could record it.
    expect(carry("category=cots-and-cribs&utm_source=storefront&utm_medium=banner&utm_campaign=shop_crosssell",
      { categoryId: "c1" }, { categorySlug: "cots-and-cribs" }))
      .toBe("category=cots-and-cribs&utm_campaign=shop_crosssell&utm_medium=banner&utm_source=storefront");
  });

  it("carries NOTHING but utm_, so a pasted link cannot smuggle params in", () => {
    expect(carry("q=cot&ref=spam&admin=1&utm_source=x", { search: "cot" })).toBe("q=cot&utm_source=x");
  });

  it("behaves exactly as before when there is nothing to carry", () => {
    expect(carry("", { search: "cot" })).toBe(write({ search: "cot" }));
    expect(carry("ref=spam", { search: "cot" })).toBe(write({ search: "cot" }));
  });

  it("is stable, so carrying a tag never rewrites history on every render", () => {
    // Feeding the output back in as the incoming URL must be a fixed point,
    // otherwise the browse effect would rewrite for ever.
    const once = writeBrowseUrl({ ...EMPTY, search: "cot" }, {}, new URLSearchParams("utm_medium=banner&utm_source=storefront"));
    const twice = writeBrowseUrl({ ...EMPTY, search: "cot" }, {}, once);
    expect(browseUrlKey(twice)).toBe(browseUrlKey(once));
  });

  it("takes the first value when a key is repeated by hand", () => {
    expect(carry("utm_source=a&utm_source=b")).toBe("utm_source=a");
  });

  it("does not let a utm param resurrect a filter it does not own", () => {
    // readBrowseUrl still ignores them entirely: they travel, they never filter.
    const st = readBrowseUrl(new URLSearchParams("utm_source=storefront&utm_campaign=shop_crosssell"));
    expect(st.filters.search).toBe("");
    expect(st.category).toBe("");
  });
});
