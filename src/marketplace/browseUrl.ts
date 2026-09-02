import type { BrowseFilters, BrowseSort } from "./data/useListings";

/**
 * Every search and filter combination as a shareable URL.
 *
 * Three reasons, in the order they matter here. A buyer who searches "cot",
 * opens a listing and presses back should still be looking at cots: measured
 * before this existed, they landed on the full 224-item catalogue with an
 * empty search box, and most people do not search a second time. A mum should
 * be able to send "cots in Lagos" to a friend on WhatsApp, which is how things
 * actually spread here and is distribution we could not receive. And a page
 * for "used baby cot Lagos" can be indexed, where one browse page cannot.
 *
 * READABLE, because it gets pasted into WhatsApp and looked at:
 *   /marketplace/?q=cot&state=Lagos
 *
 * Anything at its default is omitted, so a plain browse stays /marketplace/
 * rather than a line of empty params.
 *
 * Kept pure and separate from the page so both directions can be tested
 * without a browser: the round trip either holds for every filter or it does
 * not, and that is a property, not something to click through.
 *
 * The param names are the contract the prerender edge function reads to build
 * a title and a preview for a shared link, so renaming one silently breaks
 * that. Change them together.
 */

export const CONDITION_VALUES = ["almost_new", "good", "fair"] as const;
const SORT_VALUES: BrowseSort[] = ["newest", "price_asc", "price_desc"];

/** Category and group travel as slugs, which cannot be resolved to ids until
 * the category list has loaded, so they come back out separately rather than
 * pretending to be part of the filters. A UUID is still accepted: it is the
 * original link format and still works. */
export interface BrowseUrlState {
  filters: Pick<BrowseFilters, "search" | "state" | "city" | "minPrice" | "maxPrice" | "conditions" | "sort">;
  /** Either a slug or a UUID, told apart by shape at the call site. */
  category: string;
  group: string;
}

/** Strict on purpose. Stripping non-digits would turn "-5" into 5 and
 * "5abc" into 5, applying a price filter the buyer never asked for from a
 * URL that was mistyped or mangled in a paste. A price is either a plain
 * positive whole number or it is not a price. */
function positiveInt(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n > 0 ? n : null;
}

/** What the URL says, with anything unrecognised dropped rather than trusted. */
export function readBrowseUrl(params: URLSearchParams): BrowseUrlState {
  const conditions = (params.get("condition") || "")
    .split(",")
    .map((c) => c.trim())
    .filter((c): c is (typeof CONDITION_VALUES)[number] => (CONDITION_VALUES as readonly string[]).includes(c));

  const sortRaw = (params.get("sort") || "") as BrowseSort;
  return {
    filters: {
      search: (params.get("q") || "").trim(),
      state: params.get("state") || "",
      city: params.get("city") || "",
      minPrice: positiveInt(params.get("min")),
      maxPrice: positiveInt(params.get("max")),
      // Deduped, because ?condition=good,good is a link someone edited by hand
      // and it must not produce a filter that differs from the same page
      // reached by clicking.
      conditions: Array.from(new Set(conditions)),
      sort: SORT_VALUES.includes(sortRaw) ? sortRaw : "newest",
    },
    category: params.get("category") || "",
    group: params.get("group") || "",
  };
}

/**
 * The URL for a filter set. Only what is actually set, in a fixed order so
 * the same view always produces the same string, which matters for a
 * canonical URL and for not writing history entries that differ only in
 * param order.
 *
 * categorySlug and groupSlug are passed in rather than looked up, because
 * this file has no access to the category list and should not fetch.
 *
 * `carry` is the URL as it currently stands, and the ONLY thing taken from it
 * is `utm_*`. Everything here is otherwise built from the filters, which is
 * why a campaign tag on an inbound link used to vanish: the storefront's
 * cross-sell banner sends someone to /marketplace/?category=x&utm_campaign=y,
 * this rebuilt the query from scratch on first render, and the tag was gone
 * before anything could record it (§193a).
 *
 * DELIBERATELY NOT "preserve anything unknown". A browse URL that carries
 * whatever anyone appends to it is a different and worse problem: it would
 * make two links to the same view compare unequal, and it would let a pasted
 * link smuggle arbitrary params into a page that is also a canonical URL.
 * Only the utm_ prefix, nothing else.
 *
 * Optional, so every existing caller and every existing test is unaffected:
 * with no `carry` this behaves exactly as it did.
 */
export function writeBrowseUrl(
  filters: BrowseFilters,
  slugs: { categorySlug?: string | null; groupSlug?: string | null },
  carry?: URLSearchParams | null,
): URLSearchParams {
  const p = new URLSearchParams();
  const q = filters.search.trim();
  if (q) p.set("q", q);
  // A single category always wins over a group, the same precedence the query
  // itself applies, so the URL can never say one thing and the results another.
  if (filters.categoryId && slugs.categorySlug) p.set("category", slugs.categorySlug);
  else if (filters.groupId && slugs.groupSlug) p.set("group", slugs.groupSlug);
  if (filters.state) p.set("state", filters.state);
  if (filters.city) p.set("city", filters.city);
  if (filters.minPrice != null) p.set("min", String(filters.minPrice));
  if (filters.maxPrice != null) p.set("max", String(filters.maxPrice));
  if (filters.conditions.length) p.set("condition", filters.conditions.join(","));
  if (filters.sort !== "newest") p.set("sort", filters.sort);
  // Appended last and in sorted order, so the output stays byte-stable for a
  // given view — browseUrlKey compares these strings to decide whether to
  // rewrite history, and an unstable order would rewrite on every render.
  // First value wins for a repeated key, for the same reason.
  if (carry) {
    const utm = new Map<string, string>();
    for (const [k, v] of carry.entries()) {
      if (k.startsWith("utm_") && !utm.has(k)) utm.set(k, v);
    }
    for (const k of [...utm.keys()].sort()) p.set(k, utm.get(k) as string);
  }
  return p;
}

/** Stable string form, for comparing "what the URL says" with "what it should
 * say" without rewriting history on every render. */
export function browseUrlKey(params: URLSearchParams): string {
  return params.toString();
}
