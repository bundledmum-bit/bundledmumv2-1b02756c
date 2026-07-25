import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ProductImage from "@/components/ProductImage";
import { fmt } from "@/lib/cart";

// One row of quiz_owned_products_catalogue(p_search). out_group_label is the
// ready-made heading the RPC emits — we never derive our own grouping.
export interface OwnedCatalogueRow {
  out_product_id: string;
  out_name: string;
  out_category: string | null;
  out_subcategory: string | null;
  out_group_label: string | null;
  out_from_price: number | null;
  out_image_url: string | null;
}

/**
 * "Products I already have" — shown between the last quiz question and the
 * WhatsApp step when the shopper answers "yes" to alreadyBought.
 *
 * The catalogue is ~240 items, which is unusable as a flat list on a phone,
 * so the screen leans on two things: the RPC's own group headings (sticky
 * while you scroll through a group) and a search box whose term is pushed
 * down into the RPC as p_search rather than filtered client-side.
 *
 * Selection state is owned by the quiz container, so ticks survive going
 * back into the questions and returning here.
 */
export default function OwnedProductsScreen({
  selectedIds,
  onToggle,
  onDone,
  onBack,
}: {
  selectedIds: Set<string>;
  onToggle: (productId: string) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // Debounce so typing doesn't fire an RPC per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["quiz_owned_products_catalogue", debounced],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("quiz_owned_products_catalogue", {
        p_search: debounced || null,
      });
      if (error) throw error;
      return (data || []) as OwnedCatalogueRow[];
    },
    staleTime: 5 * 60 * 1000,
    // Keep the previous list on screen while a new search resolves, so the
    // page doesn't flash empty on every keystroke.
    placeholderData: keepPreviousData,
  });

  // Group in RPC order — the RPC already returns items grouped and sorted.
  const groups = useMemo(() => {
    const m = new Map<string, OwnedCatalogueRow[]>();
    (rows || []).forEach((r) => {
      const key = r.out_group_label || "Other";
      const bucket = m.get(key);
      if (bucket) bucket.push(r);
      else m.set(key, [r]);
    });
    return Array.from(m.entries());
  }, [rows]);

  // Group headings stick directly beneath the search bar, whose height
  // changes between mobile and desktop — measure it instead of guessing.
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState(0);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = selectedIds.size;
  const total = rows?.length ?? 0;

  return (
    // The site header sits above this overlay (same as every other quiz
    // screen), so everything is offset by --bm-header-h.
    <div className="min-h-screen bg-background pt-[var(--bm-header-h,108px)] pb-28">
      {/* Title scrolls away; only the search bar stays pinned, so a phone
          keeps as much of the list on screen as possible. */}
      <div className="max-w-[720px] mx-auto px-4 pt-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <button
            onClick={onBack}
            className="text-foreground/50 text-sm flex items-center gap-1 font-body hover:text-foreground min-h-[44px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-[12px] font-bold text-forest bg-forest-light rounded-pill px-2.5 py-1">
            {count} selected
          </span>
        </div>
        <h2 className="pf text-[20px] md:text-[24px] font-bold leading-tight">What do you already have?</h2>
        <p className="text-muted-foreground text-[13px] mt-0.5 mb-1">
          Tick anything you have already bought and we will leave it out of your list.
        </p>
      </div>

      <div
        ref={headerRef}
        className="sticky z-30 bg-background/95 backdrop-blur-md"
        style={{ top: "var(--bm-header-h, 108px)" }}
      >
        <div className="max-w-[720px] mx-auto px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              aria-label="Search products you already have"
              className="w-full rounded-[14px] border-2 border-border bg-card pl-10 pr-10 py-3 text-sm font-body outline-none transition-colors focus:border-forest"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-4">
        {isLoading && !rows ? (
          <p className="text-muted-foreground text-sm py-10 text-center">Loading products…</p>
        ) : total === 0 ? (
          <p className="text-muted-foreground text-sm py-10 text-center">
            No products match "{debounced}". Try a different word.
          </p>
        ) : (
          groups.map(([label, items]) => (
            <section key={label}>
              <h3
                className="sticky z-20 bg-background/95 backdrop-blur-md py-2 text-[11px] font-bold uppercase tracking-[1.5px] text-muted-foreground"
                style={{ top: `calc(var(--bm-header-h, 108px) + ${headerH}px)` }}
              >
                {label} <span className="text-foreground/30">({items.length})</span>
              </h3>
              <div className="space-y-2 pb-4">
                {items.map((r) => {
                  const selected = selectedIds.has(r.out_product_id);
                  return (
                    <button
                      key={r.out_product_id}
                      type="button"
                      onClick={() => onToggle(r.out_product_id)}
                      aria-pressed={selected}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] border-2 text-left transition-all ${
                        selected ? "bg-[#FFF0EB] border-coral" : "bg-card border-border hover:border-coral/40"
                      }`}
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded-[10px] overflow-hidden bg-warm-cream">
                        <ProductImage
                          imageUrl={r.out_image_url}
                          alt={r.out_name}
                          className="w-full h-full"
                          emojiClassName="text-xl"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-body font-semibold text-[13.5px] text-foreground leading-snug line-clamp-2">
                          {r.out_name}
                        </div>
                        {r.out_from_price != null && r.out_from_price > 0 && (
                          <div className="text-[12px] text-muted-foreground mt-0.5">
                            from <span className="font-mono-price text-forest font-bold">{fmt(r.out_from_price)}</span>
                          </div>
                        )}
                      </div>
                      <div
                        className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          selected ? "bg-coral border-coral" : "bg-card border-border"
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {/* Persistent count + Done */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-[720px] mx-auto px-4 pt-3 flex items-center gap-3">
          <div className="flex-shrink-0 leading-tight">
            <p className="font-mono-price text-forest font-extrabold text-[19px]">{count}</p>
            <p className="text-[11px] text-muted-foreground font-medium">selected</p>
          </div>
          <button
            onClick={onDone}
            className="flex-1 inline-flex items-center justify-center rounded-pill bg-coral text-primary-foreground font-extrabold py-3.5 text-[15px] hover:bg-coral-dark transition-colors min-h-[52px]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
