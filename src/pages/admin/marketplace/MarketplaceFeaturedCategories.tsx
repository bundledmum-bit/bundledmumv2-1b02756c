import { useMemo, useState } from "react";
import { writeRows } from "@/lib/tableWrite";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb } from "./data";
import { OpsHeader } from "./opsUi";

/**
 * Admin featured categories manager (design 30a). Curates which categories
 * show on two public surfaces — browse home's tile strip and the sell page's
 * category showcase — via marketplace_featured_categories. Each surface is a
 * SEPARATE list (own order, own empty state) so nobody edits the wrong one by
 * mistake. Live counts (a single query over marketplace_listings, aggregated
 * client side, not one query per category) sit on every row so an operator
 * never features a category that turns out to be empty.
 *
 * Reordering is plain up/down buttons swapping sort_order, the same pattern
 * MarketplaceCategoryFields.tsx already uses — no drag library exists in this
 * codebase, and the task this shipped from explicitly allowed either.
 *
 * A database trigger already removes a category from every featured list the
 * moment it's disabled elsewhere in admin — nothing here needs to react to
 * that, it just won't be in the data on next load.
 */

type Surface = "browse_home" | "sell_page";
const SURFACES: Array<{ key: Surface; label: string; blurb: string }> = [
  { key: "browse_home", label: "Browse home", blurb: "What buyers see on the marketplace home strip. Reflect real stock." },
  { key: "sell_page", label: "Sell page", blurb: "Sells breadth to a prospective seller. Stock counts matter less here." },
];

interface Category { id: string; name: string; icon: string | null; is_allowed: boolean }
interface FeaturedRow { id: string; surface: Surface; category_id: string; sort_order: number }

const CATEGORY_FALLBACK_ICON = "🏷️";

export default function MarketplaceFeaturedCategories() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Surface>("browse_home");
  const [addingFor, setAddingFor] = useState<Surface | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catsQ = useQuery({
    queryKey: ["mkt-fc-categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await adb.from("marketplace_categories")
        .select("id, name, icon, is_allowed").eq("is_allowed", true).order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Category[];
    },
    staleTime: 15000,
  });

  const featuredQ = useQuery({
    queryKey: ["mkt-fc-featured"],
    queryFn: async (): Promise<FeaturedRow[]> => {
      const { data, error } = await adb.from("marketplace_featured_categories")
        .select("id, surface, category_id, sort_order").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as FeaturedRow[];
    },
    staleTime: 5000,
  });

  // One query, not one per category: every live listing's category_id, counted
  // client side. This is the number an operator relies on to avoid featuring
  // an empty category, so it has to be accurate, not a per-surface estimate.
  const countsQ = useQuery({
    queryKey: ["mkt-fc-live-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await adb.from("marketplace_listings").select("category_id").eq("status", "live");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ category_id: string }>) counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
      return counts;
    },
    staleTime: 15000,
  });

  function refetchAll() {
    qc.invalidateQueries({ queryKey: ["mkt-fc-featured"] });
    qc.invalidateQueries({ queryKey: ["mkt-fc-live-counts"] });
  }

  const catsById = useMemo(() => new Map((catsQ.data ?? []).map((c) => [c.id, c])), [catsQ.data]);
  const counts = countsQ.data ?? {};

  const bySurface = useMemo(() => {
    const map: Record<Surface, FeaturedRow[]> = { browse_home: [], sell_page: [] };
    for (const row of featuredQ.data ?? []) map[row.surface].push(row);
    for (const key of Object.keys(map) as Surface[]) map[key].sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [featuredQ.data]);

  async function moveRow(surface: Surface, index: number, dir: -1 | 1) {
    const rows = bySurface[surface];
    const cur = rows[index];
    const other = rows[index + dir];
    if (!cur || !other) return;
    setError(null);
    const swaps = await Promise.all([
      writeRows(adb.from("marketplace_featured_categories").update({ sort_order: other.sort_order }).eq("id", cur.id).select("id")),
      writeRows(adb.from("marketplace_featured_categories").update({ sort_order: cur.sort_order }).eq("id", other.id).select("id")),
    ]);
    if (swaps.some((r) => !r.ok)) { setError(swaps.find((r) => !r.ok)?.message ?? ""); return; }
    refetchAll();
  }

  async function removeRow(id: string) {
    setError(null);
    const res = await writeRows(adb.from("marketplace_featured_categories").delete().eq("id", id).select("id"),
      "Could not remove that category. Please try again.");
    if (!res.ok) { setError(res.message ?? ""); return; }
    refetchAll();
  }

  async function addCategory(surface: Surface, categoryId: string) {
    setError(null);
    const rows = bySurface[surface];
    const maxSort = Math.max(-1, ...rows.map((r) => r.sort_order));
    const { error } = await adb.from("marketplace_featured_categories").insert({ surface, category_id: categoryId, sort_order: maxSort + 1 });
    if (error) {
      // 23505: unique (surface, category_id) violation — the picker already excludes
      // featured categories, so this is only reachable via a race with another admin.
      setError(error.code === "23505" ? "That category is already featured on this surface." : "Could not add that category. Please try again.");
      return;
    }
    setAddingFor(null);
    refetchAll();
  }

  if (catsQ.isLoading || featuredQ.isLoading || countsQ.isLoading) {
    return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;
  }

  return (
    <div>
      <OpsHeader
        title="Featured categories"
        subtitle="Tabs split Browse home from the Sell page, each its own list, order and empty state, so nobody edits the wrong one by mistake."
      />

      {error && (
        <div className="mt-3 rounded-lg p-3 text-[12.5px]" style={{ background: "#FCEBE9", color: "#C0392B" }}>{error}</div>
      )}

      {/* Mobile: tabs, one surface visible at a time. */}
      <div className="lg:hidden mt-4">
        <div className="flex rounded-xl p-1 gap-1" style={{ background: "rgba(26,26,26,.06)" }}>
          {SURFACES.map((s) => (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              className="flex-1 text-center text-xs font-heading font-extrabold py-2.5 rounded-lg"
              style={tab === s.key ? { background: "#1A4A33", color: "#FFF8F4" } : { color: "#6B5B54" }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <SurfaceColumn
          surface={tab}
          blurb={SURFACES.find((s) => s.key === tab)!.blurb}
          rows={bySurface[tab]}
          catsById={catsById}
          counts={counts}
          onMove={(i, dir) => moveRow(tab, i, dir)}
          onRemove={removeRow}
          onAdd={() => setAddingFor(tab)}
        />
      </div>

      {/* Desktop: both surfaces side by side, no tab switching needed. */}
      <div className="hidden lg:grid grid-cols-2 gap-6 mt-5">
        {SURFACES.map((s) => (
          <SurfaceColumn
            key={s.key}
            surface={s.key}
            blurb={s.blurb}
            rows={bySurface[s.key]}
            catsById={catsById}
            counts={counts}
            onMove={(i, dir) => moveRow(s.key, i, dir)}
            onRemove={removeRow}
            onAdd={() => setAddingFor(s.key)}
          />
        ))}
      </div>

      <p className="text-[11.5px] mt-5" style={{ color: "#8A7A72" }}>
        If a category gets disabled elsewhere, it drops out of any featured list here automatically, no action needed.
      </p>

      {addingFor && (
        <AddCategoryDialog
          surface={addingFor}
          label={SURFACES.find((s) => s.key === addingFor)!.label}
          categories={catsQ.data ?? []}
          featuredIds={new Set(bySurface[addingFor].map((r) => r.category_id))}
          counts={counts}
          onClose={() => setAddingFor(null)}
          onPick={(categoryId) => addCategory(addingFor, categoryId)}
        />
      )}
    </div>
  );
}

function SurfaceColumn({ surface, blurb, rows, catsById, counts, onMove, onRemove, onAdd }: {
  surface: Surface;
  blurb: string;
  rows: FeaturedRow[];
  catsById: Map<string, Category>;
  counts: Record<string, number>;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const isBrowseHome = surface === "browse_home";
  const headerBg = isBrowseHome ? "#1A4A33" : "#F4845F";
  const headerFg = isBrowseHome ? "#FFF8F4" : "#1A1A1A";
  const headerSub = isBrowseHome ? "#8FB6A2" : "#5C3A22";

  return (
    <div className="flex flex-col gap-2.5 mt-4 lg:mt-0">
      <div className="hidden lg:flex flex-col gap-1 rounded-xl px-3.5 py-3" style={{ background: headerBg }}>
        <div className="font-heading font-extrabold text-sm" style={{ color: headerFg }}>{surface === "browse_home" ? "Browse home" : "Sell page"}</div>
        <div className="text-[11.5px] leading-snug" style={{ color: headerSub }}>{blurb}</div>
      </div>
      <p className="lg:hidden text-[11.5px] leading-snug" style={{ color: "#6B5B54" }}>{blurb}</p>

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-heading font-extrabold uppercase tracking-wider" style={{ color: "#6B5B54" }}>
          {rows.length} featured{surface === "sell_page" && rows.length > 0 ? `, ${rows.length === 1 ? "1 category" : `${rows.length} categories`}` : ""}
        </span>
        <button onClick={onAdd} className="text-[11.5px] font-bold" style={{ color: "#2D6A4F" }}>+ Add</button>
      </div>

      {rows.length === 0 ? (
        <EmptySurface label={surface === "browse_home" ? "Browse home" : "Sell page"} onAdd={onAdd} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const cat = catsById.get(row.category_id);
            const count = counts[row.category_id] ?? 0;
            const zero = count === 0;
            // Zero-stock is a quiet nudge (red) on browse home, where the whole
            // point is showing what's actually available — but a perfectly valid
            // pick on the sell page, which is selling breadth, not current stock.
            const flagZero = isBrowseHome && zero;
            return (
              <div
                key={row.id}
                className="rounded-xl border bg-white p-2.5 flex items-center gap-2.5"
                style={{ borderColor: flagZero ? "#C0392B" : "#F0DDD2", borderWidth: flagZero ? 1.5 : 1 }}
              >
                <div className="flex flex-col gap-1 flex-none" style={{ color: "#C9B7AD" }}>
                  <button onClick={() => onMove(i, -1)} disabled={i === 0} className="disabled:opacity-30" aria-label="Move up">▲</button>
                  <button onClick={() => onMove(i, 1)} disabled={i === rows.length - 1} className="disabled:opacity-30" aria-label="Move down">▼</button>
                </div>
                <span className="text-xl flex-none">{cat?.icon || CATEGORY_FALLBACK_ICON}</span>
                <span className="flex-1 min-w-0 font-heading font-extrabold text-[13px] truncate">{cat?.name ?? "Unknown category"}</span>
                <span
                  className="text-[10.5px] font-heading font-extrabold px-2 py-1 rounded-md flex-none whitespace-nowrap"
                  style={
                    flagZero
                      ? { background: "#FCEBE9", color: "#C0392B" }
                      : isBrowseHome
                        ? { background: "#D8EFE5", color: "#1A4A33" }
                        : { background: "#EDE6E1", color: "#6B5B54" }
                  }
                >
                  {count} live
                </span>
                <button onClick={() => onRemove(row.id)} className="flex-none font-heading font-extrabold" style={{ color: "#C0392B" }} aria-label="Remove">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptySurface({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className="rounded-2xl border p-7 text-center flex flex-col items-center gap-2.5" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg" style={{ background: "#D8EFE5", color: "#1A4A33" }}>···</div>
      <div className="font-heading font-black text-[15px] text-foreground">Nothing hand-picked yet</div>
      <p className="text-[12px] leading-relaxed max-w-xs" style={{ color: "#6B5B54" }}>
        That's fine, this is a real state, not an error. With nothing chosen, {label.toLowerCase()} falls back to its own default ordering automatically. Pick some below whenever you're ready to take over.
      </p>
      <button onClick={onAdd} className="text-[12.5px] font-heading font-extrabold px-4 py-2.5 rounded-xl mt-1" style={{ background: "#F4845F", color: "#1A1A1A" }}>
        Add a category
      </button>
    </div>
  );
}

function AddCategoryDialog({ surface, label, categories, featuredIds, counts, onClose, onPick }: {
  surface: Surface;
  label: string;
  categories: Category[];
  featuredIds: Set<string>;
  counts: Record<string, number>;
  onClose: () => void;
  onPick: (categoryId: string) => void;
}) {
  const [search, setSearch] = useState("");

  // Excludes anything already featured on this surface — the primary defence
  // against a duplicate; the unique (surface, category_id) constraint and the
  // friendly error above it are the backstop for a race, not the main path.
  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .filter((c) => !featuredIds.has(c.id))
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || a.name.localeCompare(b.name));
  }, [categories, featuredIds, counts, search]);

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(26,26,26,0.45)" }} onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3 max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="font-heading font-extrabold text-[15px]">Add to {label}</div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${categories.length} categories`}
          className="w-full rounded-lg border px-3 h-10 text-sm"
          style={{ borderColor: "#E3D4CB", background: "#FFF8F4" }}
        />
        <div className="text-[11px] font-bold" style={{ color: "#6B5B54" }}>Sorted by stock, highest first</div>
        <div className="flex flex-col gap-1.5 overflow-y-auto">
          {options.length === 0 ? (
            <div className="text-[12.5px] py-6 text-center" style={{ color: "#6B5B54" }}>
              {categories.length === featuredIds.size ? "Every category is already featured here." : "No categories match that search."}
            </div>
          ) : (
            options.map((c) => {
              const count = counts[c.id] ?? 0;
              const zero = count === 0;
              return (
                <button
                  key={c.id}
                  onClick={() => onPick(c.id)}
                  className="flex items-center gap-2.5 rounded-lg border px-2.5 py-2.5 text-left"
                  style={{ borderColor: "#F0DDD2", background: "#FFFFFF", opacity: zero ? 0.55 : 1 }}
                >
                  <span className="text-lg flex-none">{c.icon || CATEGORY_FALLBACK_ICON}</span>
                  <span className="flex-1 min-w-0 font-bold text-[13px] truncate">{c.name}</span>
                  <span
                    className="text-[10.5px] font-heading font-extrabold px-2 py-1 rounded-md flex-none"
                    style={zero ? { background: "#FCEBE9", color: "#C0392B" } : { background: "#D8EFE5", color: "#1A4A33" }}
                  >
                    {count} live
                  </span>
                </button>
              );
            })
          )}
        </div>
        <button onClick={onClose} className="text-xs font-heading font-extrabold px-4 py-2.5 rounded-xl border self-end" style={{ borderColor: "#F0DDD2" }}>Close</button>
      </div>
    </div>
  );
}
