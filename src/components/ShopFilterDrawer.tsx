import { useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Filter, ChevronDown, ChevronUp } from "lucide-react";
import type { ProductCategory } from "@/hooks/useProductCategories";

interface FilterState {
  tab: string;
  budget: string;
  category: string;
  brand: string;
  sort: string;
  /** Price range in naira — both null means "no limit". */
  priceMin?: number | null;
  priceMax?: number | null;
  /** Hide brands that are out of stock. */
  inStockOnly?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onApply: (filters: FilterState) => void;
  categories: ProductCategory[];
  brandNames: string[];
  productCounts: Record<string, number>;
  /** When set to "sort", the Sort By section is pre-expanded. */
  openSection?: "filter" | "sort";
  /** Visibility toggles for the optional filter sections (site_settings). */
  showPriceFilter?: boolean;
  showInStockFilter?: boolean;
  /** Price range bounds in naira — used to seed the inputs. */
  priceBounds?: { min: number; max: number };
}

const SORT_OPTIONS = [
  { key: "popular", label: "Popular" },
  { key: "price-low", label: "Price: Low → High" },
  { key: "price-high", label: "Price: High → Low" },
  { key: "rating", label: "Top Rated" },
];

function Section({ title, open: defaultOpen = false, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-4 px-1 min-h-[48px]">
        <span className="font-semibold text-sm">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="pb-4 px-1">{children}</div>}
    </div>
  );
}

export default function ShopFilterDrawer({ open, onClose, filters, onApply, categories, brandNames, productCounts, openSection, showPriceFilter, showInStockFilter, priceBounds }: Props) {
  const [local, setLocal] = useState<FilterState>(filters);
  const sortDefaultOpen = openSection === "sort";
  const shopDefaultOpen = openSection !== "sort";

  const activeCount = [
    local.category ? 1 : 0,
    local.brand ? 1 : 0,
    (local.priceMin != null || local.priceMax != null) ? 1 : 0,
    local.inStockOnly ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const handleClear = () => {
    setLocal({ tab: "all", budget: "all", category: "", brand: "", sort: local.sort, priceMin: null, priceMax: null, inStockOnly: false });
  };

  const handleApply = () => {
    onApply(local);
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent className="max-h-[85vh] flex flex-col outline-none">
        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-border">
          <h3 className="font-bold text-base">Filters {activeCount > 0 && <span className="text-coral">({activeCount})</span>}</h3>
          <button onClick={handleClear} className="text-coral text-sm font-semibold min-h-[44px] px-2">Clear All</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5">
          {categories.length > 0 && (
            <Section title="Category" open={shopDefaultOpen}>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setLocal(p => ({ ...p, category: "" }))}
                  className={`min-h-[44px] rounded-pill px-4 py-2 text-sm font-semibold border-[1.5px] transition-all font-body ${!local.category ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                  All
                </button>
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => setLocal(p => ({ ...p, category: cat.slug }))}
                    className={`min-h-[44px] rounded-pill px-4 py-2 text-sm font-semibold border-[1.5px] transition-all font-body ${local.category === cat.slug ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                    {cat.icon} {cat.name} {productCounts[cat.slug] > 0 && <span className="text-muted-foreground">({productCounts[cat.slug]})</span>}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {brandNames.length > 0 && (
            <Section title="Brand">
              <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto">
                <button onClick={() => setLocal(p => ({ ...p, brand: "" }))}
                  className={`min-h-[44px] rounded-pill px-4 py-2 text-sm font-semibold border-[1.5px] transition-all font-body ${!local.brand ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                  All
                </button>
                {brandNames.map(name => (
                  <button key={name} onClick={() => setLocal(p => ({ ...p, brand: name.toLowerCase() }))}
                    className={`min-h-[44px] rounded-pill px-4 py-2 text-sm font-semibold border-[1.5px] transition-all font-body ${local.brand.toLowerCase() === name.toLowerCase() ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                    {name}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {showPriceFilter && (
            <Section title="Price">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-light">Min</span>
                <input
                  type="number"
                  min={0}
                  placeholder={priceBounds ? String(priceBounds.min) : "0"}
                  value={local.priceMin ?? ""}
                  onChange={e => setLocal(p => ({ ...p, priceMin: e.target.value === "" ? null : Number(e.target.value) }))}
                  className="flex-1 rounded-lg border border-input px-3 py-2 text-sm bg-background min-h-[44px]"
                />
                <span className="text-xs text-text-light">–</span>
                <input
                  type="number"
                  min={0}
                  placeholder={priceBounds ? String(priceBounds.max) : "500000"}
                  value={local.priceMax ?? ""}
                  onChange={e => setLocal(p => ({ ...p, priceMax: e.target.value === "" ? null : Number(e.target.value) }))}
                  className="flex-1 rounded-lg border border-input px-3 py-2 text-sm bg-background min-h-[44px]"
                />
              </div>
              {priceBounds && (
                <p className="text-[10px] text-text-light mt-2">Available range: ₦{priceBounds.min.toLocaleString()} – ₦{priceBounds.max.toLocaleString()}</p>
              )}
            </Section>
          )}

          {showInStockFilter && (
            <Section title="Availability">
              <label className="flex items-center justify-between min-h-[44px] px-1">
                <span className="text-sm font-semibold">In stock only</span>
                <span className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={!!local.inStockOnly}
                    onChange={e => setLocal(p => ({ ...p, inStockOnly: e.target.checked }))}
                  />
                  <span className="peer h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-forest peer-checked:after:translate-x-5" />
                </span>
              </label>
            </Section>
          )}

          <Section title="Sort By" open={sortDefaultOpen}>
            <div className="flex flex-col gap-1">
              {SORT_OPTIONS.map(s => (
                <button key={s.key} onClick={() => setLocal(p => ({ ...p, sort: s.key }))}
                  className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold text-left transition-all font-body ${local.sort === s.key ? "bg-forest-light text-forest" : "text-muted-foreground"}`}>
                  {local.sort === s.key && "✓ "}{s.label}
                </button>
              ))}
            </div>
          </Section>
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border p-4">
          <button onClick={handleApply} className="w-full rounded-pill bg-forest py-3.5 font-body font-semibold text-primary-foreground hover:bg-forest-deep interactive text-sm min-h-[48px]">
            Apply Filters
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}