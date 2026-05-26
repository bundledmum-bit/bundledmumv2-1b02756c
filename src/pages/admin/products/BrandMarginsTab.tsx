import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useBrandMargins, useUpdateBrandPrice, type BrandMarginRow, type BundleTier,
} from "@/hooks/useBrandMargins";
import { fmt } from "@/lib/cart";
import { BulkApplyModal, type BulkApplyScope } from "./BulkApplyModal";

const ALL = "__all__";

type SortKey = "productName" | "brandName" | "category" | "subcategory" | "costPrice" | "retailPrice" | "marginNaira" | "marginPct" | "markupNaira" | "markupPct";

function tierColor(tier: BundleTier): string {
  if (tier === "starter") return "bg-muted text-foreground border-border";
  if (tier === "standard") return "bg-blue-100 text-blue-900 border-blue-200";
  return "bg-purple-100 text-purple-900 border-purple-200";
}

// Margin in naira is just price − cost. Numerically identical to the
// markup-in-naira, but exposed under both labels so the table is
// unambiguous about what each percentage column derives from.
function computeMarginNaira(retail: number, cost: number | null): number | null {
  if (cost == null) return null;
  return retail - cost;
}

// True GROSS MARGIN as a percentage of selling price:
//   margin_pct = ((price - cost) / price) * 100
// Returns null when the price is zero or cost is missing.
function computeMarginPct(retail: number, cost: number | null): number | null {
  if (cost == null || retail <= 0) return null;
  return ((retail - cost) / retail) * 100;
}

// MARKUP as a percentage of cost:
//   markup_pct = ((price - cost) / cost) * 100
// Returns null when cost is missing or zero.
function computeMarkupPct(retail: number, cost: number | null): number | null {
  if (cost == null || cost <= 0) return null;
  return ((retail - cost) / cost) * 100;
}

export default function BrandMarginsTab() {
  // Filters
  const [category, setCategory] = useState<string>(ALL);
  const [subcategory, setSubcategory] = useState<string>(ALL);
  const [inStock, setInStock] = useState<"all" | "in" | "out">("all");
  const [bundle, setBundle] = useState<"all" | "in" | "out" | BundleTier>("all");
  const [missingCostOnly, setMissingCostOnly] = useState(false);

  // Always pull the unfiltered list to derive distinct categories/subcategories.
  const allRowsQuery = useBrandMargins();
  const allRows = allRowsQuery.data || [];

  const distinctCategories = useMemo(
    () => Array.from(new Set(allRows.map(r => r.category).filter((c): c is string => !!c))).sort(),
    [allRows],
  );
  const distinctSubcategories = useMemo(() => {
    const scoped = category === ALL ? allRows : allRows.filter(r => r.category === category);
    return Array.from(new Set(scoped.map(r => r.subcategory).filter((s): s is string => !!s))).sort();
  }, [allRows, category]);

  // Reset subcategory when category changes if it no longer matches.
  useEffect(() => {
    if (subcategory !== ALL && !distinctSubcategories.includes(subcategory)) {
      setSubcategory(ALL);
    }
  }, [distinctSubcategories, subcategory]);

  const filtered = useMemo(() => {
    let f = allRows;
    if (category !== ALL) f = f.filter(r => r.category === category);
    if (subcategory !== ALL) f = f.filter(r => r.subcategory === subcategory);
    if (inStock !== "all") f = f.filter(r => (inStock === "in" ? r.inStock : !r.inStock));
    if (bundle !== "all") {
      if (bundle === "in") f = f.filter(r => r.bundleTiers.length > 0);
      else if (bundle === "out") f = f.filter(r => r.bundleTiers.length === 0);
      else f = f.filter(r => r.bundleTiers.includes(bundle as BundleTier));
    }
    if (missingCostOnly) f = f.filter(r => r.costPrice == null);
    return f;
  }, [allRows, category, subcategory, inStock, bundle, missingCostOnly]);

  // Sorting — null cost rows always go to the bottom regardless of direction.
  const [sortKey, setSortKey] = useState<SortKey>("marginPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const sortVal = (r: BrandMarginRow): number | string => {
      const costDependent =
        sortKey === "marginPct" || sortKey === "marginNaira" ||
        sortKey === "markupPct" || sortKey === "markupNaira" ||
        sortKey === "costPrice";
      if (costDependent && r.costPrice == null) return Number.POSITIVE_INFINITY;
      switch (sortKey) {
        case "productName": return r.productName.toLowerCase();
        case "brandName": return r.brandName.toLowerCase();
        case "category": return (r.category || "").toLowerCase();
        case "subcategory": return (r.subcategory || "").toLowerCase();
        case "costPrice": return r.costPrice ?? Number.POSITIVE_INFINITY;
        case "retailPrice": return r.retailPrice;
        case "marginNaira": return computeMarginNaira(r.retailPrice, r.costPrice) ?? Number.POSITIVE_INFINITY;
        case "marginPct": return computeMarginPct(r.retailPrice, r.costPrice) ?? Number.POSITIVE_INFINITY;
        case "markupNaira": return computeMarginNaira(r.retailPrice, r.costPrice) ?? Number.POSITIVE_INFINITY;
        case "markupPct": return computeMarkupPct(r.retailPrice, r.costPrice) ?? Number.POSITIVE_INFINITY;
      }
    };
    arr.sort((a, b) => {
      // Always pin null-cost rows to bottom for cost-dependent sorts.
      const aNullCost = a.costPrice == null;
      const bNullCost = b.costPrice == null;
      const costDependent =
        sortKey === "marginPct" || sortKey === "marginNaira" ||
        sortKey === "markupPct" || sortKey === "markupNaira" ||
        sortKey === "costPrice";
      if (costDependent) {
        if (aNullCost && !bNullCost) return 1;
        if (!aNullCost && bNullCost) return -1;
      }
      const va = sortVal(a);
      const vb = sortVal(b);
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const allVisibleSelected = sorted.length > 0 && sorted.every(r => selected.has(r.id));
  const toggleAllVisible = () => {
    setSelected(prev => {
      if (allVisibleSelected) {
        const n = new Set(prev);
        sorted.forEach(r => n.delete(r.id));
        return n;
      }
      const n = new Set(prev);
      sorted.forEach(r => n.add(r.id));
      return n;
    });
  };

  // Bulk modals
  const [bulkScope, setBulkScope] = useState<BulkApplyScope | null>(null);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button
      onClick={() => onSort(k)}
      className="inline-flex items-center gap-1 text-left font-medium hover:text-foreground"
    >
      {children}
      {sortKey === k ? (
        sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Category</span>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {distinctCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Subcategory</span>
          <Select value={subcategory} onValueChange={setSubcategory}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All subcategories</SelectItem>
              {distinctSubcategories.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">In stock</span>
          <Select value={inStock} onValueChange={(v) => setInStock(v as any)}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="in">In stock</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Bundle membership</span>
          <Select value={bundle} onValueChange={(v) => setBundle(v as any)}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="in">In a bundle</SelectItem>
              <SelectItem value="out">Not in a bundle</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 h-9 self-end">
          <Switch checked={missingCostOnly} onCheckedChange={setMissingCostOnly} id="missing-cost" />
          <label htmlFor="missing-cost" className="text-xs">Missing cost only</label>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="default"
          size="sm"
          disabled={selected.size === 0}
          onClick={() => setBulkScope("selected")}
        >
          Apply to selected ({selected.size})
        </Button>
        <Button variant="outline" size="sm" onClick={() => setBulkScope("category")}>
          Apply to category
        </Button>
        <Button variant="outline" size="sm" onClick={() => setBulkScope("tier")}>
          Apply to bundle tier
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {sorted.length} of {allRows.length} brands
        </span>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleAllVisible}
                  aria-label="Select all visible"
                />
              </TableHead>
              <TableHead className="w-12"></TableHead>
              <TableHead><SortHeader k="productName">Product</SortHeader></TableHead>
              <TableHead><SortHeader k="brandName">Brand</SortHeader></TableHead>
              <TableHead><SortHeader k="category">Category</SortHeader></TableHead>
              <TableHead><SortHeader k="subcategory">Subcategory</SortHeader></TableHead>
              <TableHead>Stock</TableHead>
              <TableHead><SortHeader k="costPrice">Cost</SortHeader></TableHead>
              <TableHead><SortHeader k="retailPrice">Retail</SortHeader></TableHead>
              <TableHead><SortHeader k="marginNaira">Margin ₦</SortHeader></TableHead>
              <TableHead><SortHeader k="marginPct">Margin %</SortHeader></TableHead>
              <TableHead><SortHeader k="markupNaira">Markup ₦</SortHeader></TableHead>
              <TableHead><SortHeader k="markupPct">Markup %</SortHeader></TableHead>
              <TableHead>Bundles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allRowsQuery.isLoading ? (
              <TableRow><TableCell colSpan={14} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : sorted.length === 0 ? (
              <TableRow><TableCell colSpan={14} className="text-center text-sm text-muted-foreground py-8">No brands match these filters.</TableCell></TableRow>
            ) : (
              sorted.map(row => (
                <BrandRow
                  key={row.id}
                  row={row}
                  selected={selected.has(row.id)}
                  onToggleSelect={() => toggleOne(row.id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {bulkScope && (
        <BulkApplyModal
          open={!!bulkScope}
          onOpenChange={(v) => !v && setBulkScope(null)}
          scope={bulkScope}
          selectedBrandIds={Array.from(selected)}
          categories={distinctCategories}
        />
      )}
    </div>
  );
}

function BrandRow({
  row, selected, onToggleSelect,
}: {
  row: BrandMarginRow;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const update = useUpdateBrandPrice();
  const cost = row.costPrice;
  const noCost = cost == null;

  // Local drafts for the three editable fields. We keep them as strings to
  // allow partial typing (e.g. "1." while typing 1.5).
  const [retailDraft, setRetailDraft] = useState(String(row.retailPrice));
  const [pctDraft, setPctDraft] = useState(() => {
    const m = computeMarginPct(row.retailPrice, cost);
    return m == null ? "" : m.toFixed(1);
  });
  const [naiDraft, setNaiDraft] = useState(() => {
    const m = computeMarginNaira(row.retailPrice, cost);
    return m == null ? "" : String(m);
  });

  // Reset drafts when server retail / cost changes (e.g. bulk apply).
  useEffect(() => {
    setRetailDraft(String(row.retailPrice));
    const m = computeMarginPct(row.retailPrice, cost);
    setPctDraft(m == null ? "" : m.toFixed(1));
    const n = computeMarginNaira(row.retailPrice, cost);
    setNaiDraft(n == null ? "" : String(n));
  }, [row.retailPrice, cost]);

  const commitRetail = () => {
    const r = Number(retailDraft);
    if (!Number.isFinite(r)) {
      toast.error("Retail must be a number");
      setRetailDraft(String(row.retailPrice));
      return;
    }
    const truncated = Math.trunc(r);
    if (truncated === row.retailPrice) return;
    update.mutate(
      { brandId: row.id, newPrice: truncated },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (e: any) => toast.error(e?.message || "Save failed"),
      },
    );
  };

  // Margin % is gross margin against the SELLING price:
  //   margin_pct = (price - cost) / price * 100
  // Inverting to recompute price from a typed margin:
  //   price = cost / (1 - margin/100)
  // Guarded so margins ≥ 100 % (which would divide by zero or flip
  // sign) silently no-op rather than producing garbage prices.
  const commitPct = () => {
    if (cost == null || cost <= 0) return;
    const pct = Number(pctDraft);
    if (!Number.isFinite(pct)) return;
    if (pct >= 100) {
      toast.error("Margin must be below 100 %");
      const current = computeMarginPct(row.retailPrice, cost);
      setPctDraft(current == null ? "" : current.toFixed(1));
      return;
    }
    const newRetail = Math.trunc(cost / (1 - pct / 100));
    if (newRetail === row.retailPrice) return;
    update.mutate(
      { brandId: row.id, newPrice: newRetail },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (e: any) => toast.error(e?.message || "Save failed"),
      },
    );
  };

  const commitNaira = () => {
    if (cost == null) return;
    const n = Number(naiDraft);
    if (!Number.isFinite(n)) return;
    const newRetail = Math.trunc(cost + n);
    if (newRetail === row.retailPrice) return;
    update.mutate(
      { brandId: row.id, newPrice: newRetail },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (e: any) => toast.error(e?.message || "Save failed"),
      },
    );
  };

  const onKeyEnter = (fn: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
      fn();
    }
  };

  const marginNaira = computeMarginNaira(row.retailPrice, cost);
  const marginPct = computeMarginPct(row.retailPrice, cost);
  const markupPct = computeMarkupPct(row.retailPrice, cost);
  // Negative margin = retail is below cost, i.e. we'd ship at a loss.
  // Same naira value flagged red in both Margin and Markup columns.
  const negative = marginNaira != null && marginNaira < 0;
  const negativeCls = negative ? "text-red-600 font-semibold" : "";

  return (
    <TableRow className={noCost ? "bg-red-50/50" : undefined}>
      <TableCell>
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select brand" />
      </TableCell>
      <TableCell>
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.imageUrl} alt={row.brandName} className="w-9 h-9 rounded object-cover border border-border" />
        ) : (
          <div className="w-9 h-9 rounded bg-muted border border-border" />
        )}
      </TableCell>
      <TableCell className="font-medium text-sm">{row.productName}</TableCell>
      <TableCell className="text-sm">
        <div className="flex items-center gap-2">
          <span>{row.brandName}</span>
          {noCost && <Badge variant="destructive" className="text-[10px]">Cost missing</Badge>}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{row.category || "—"}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{row.subcategory || "—"}</TableCell>
      <TableCell className="text-xs">{row.inStock ? "In" : "Out"}</TableCell>
      <TableCell className="text-sm">{cost == null ? "—" : fmt(cost)}</TableCell>
      <TableCell>
        <Input
          type="number"
          value={retailDraft}
          onChange={(e) => setRetailDraft(e.target.value)}
          onBlur={commitRetail}
          onKeyDown={onKeyEnter(commitRetail)}
          className="h-8 w-28 text-sm"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={noCost ? "" : naiDraft}
          onChange={(e) => setNaiDraft(e.target.value)}
          onBlur={commitNaira}
          onKeyDown={onKeyEnter(commitNaira)}
          disabled={noCost}
          className="h-8 w-24 text-sm"
        />
        <div className={`text-[10px] mt-0.5 ${negative ? "text-red-600" : "text-muted-foreground"}`}>
          {marginNaira == null ? "—" : fmt(marginNaira)}
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          step="0.1"
          value={noCost ? "" : pctDraft}
          onChange={(e) => setPctDraft(e.target.value)}
          onBlur={commitPct}
          onKeyDown={onKeyEnter(commitPct)}
          disabled={noCost}
          className="h-8 w-20 text-sm"
        />
        <div className={`text-[10px] mt-0.5 ${negative ? "text-red-600" : "text-muted-foreground"}`}>
          {marginPct == null ? "—" : `${marginPct.toFixed(1)}%`}
        </div>
      </TableCell>
      {/* Markup ₦ — numerically identical to Margin ₦ (price − cost) but
          surfaced under its own label so the table is unambiguous about
          which percentage column derives from which baseline.            */}
      <TableCell className={`text-sm ${negativeCls}`}>
        {marginNaira == null ? "—" : fmt(marginNaira)}
      </TableCell>
      {/* Markup % — (price − cost) / cost × 100. Read-only mirror of the
          editable margin field, so admins can sanity-check both views.   */}
      <TableCell className={`text-sm ${negativeCls}`}>
        {markupPct == null ? "—" : `${markupPct.toFixed(1)}%`}
      </TableCell>
      <TableCell>
        {row.bundleTiers.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.bundleTiers.map(t => (
              <span
                key={t}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${tierColor(t)}`}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
