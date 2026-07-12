import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useBulkApplyMargin,
  useBulkApplyMarginByCategory,
  useBulkApplyMarginByBundleTier,
  useForceApplyBelowFloor,
  friendlyPriceError,
  type BundleTier,
  type BulkDryRunResult,
} from "@/hooks/useBrandMargins";
import { fmt } from "@/lib/cart";

export type BulkApplyScope = "selected" | "category" | "tier";

export function BulkApplyModal({
  open, onOpenChange, scope, selectedBrandIds, categories,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: BulkApplyScope;
  selectedBrandIds?: string[];
  categories: string[];
}) {
  const [marginPct, setMarginPct] = useState<string>("30");
  const [category, setCategory] = useState<string>(categories[0] || "");
  const [tier, setTier] = useState<BundleTier>("starter");

  const bulk = useBulkApplyMargin();
  const byCat = useBulkApplyMarginByCategory();
  const byTier = useBulkApplyMarginByBundleTier();
  const force = useForceApplyBelowFloor();

  // Phase-1 result held for the single summary dialog (only shown when some
  // brands would fall below the floor). null = still on the input form.
  const [dryRun, setDryRun] = useState<BulkDryRunResult | null>(null);
  const [appliedPct, setAppliedPct] = useState(0);

  const isBusy = bulk.isPending || byCat.isPending || byTier.isPending || force.isPending;

  const closeAll = (v: boolean) => {
    if (!v) setDryRun(null);
    onOpenChange(v);
  };

  // PHASE 1 — dry run. At/above-floor rows saved; below-floor collected.
  const onApply = async () => {
    const pct = Number(marginPct);
    if (!Number.isFinite(pct)) {
      toast.error("Enter a valid margin %");
      return;
    }
    try {
      let result: BulkDryRunResult;
      if (scope === "selected") {
        result = await bulk.mutateAsync({ brandIds: selectedBrandIds || [], marginPct: pct });
      } else if (scope === "category") {
        if (!category) { toast.error("Pick a category"); return; }
        result = await byCat.mutateAsync({ category, marginPct: pct });
      } else {
        result = await byTier.mutateAsync({ tier, marginPct: pct });
      }
      setAppliedPct(pct);
      if (result.belowFloor.length === 0) {
        toast.success(
          `Applied ${pct}% margin: ${result.updated} updated${result.skippedNoCost ? `, ${result.skippedNoCost} skipped (no cost price)` : ""}.`,
        );
        closeAll(false);
      } else {
        // Show the single summary dialog for the below-floor rows.
        setDryRun(result);
      }
    } catch (e: any) {
      toast.error(friendlyPriceError(e));
    }
  };

  // PHASE 2 — force the below-floor rows with confirm=true (super admin only).
  const onForceBelowFloor = async () => {
    if (!dryRun) return;
    try {
      const forced = await force.mutateAsync(dryRun.belowFloor);
      toast.success(
        `${dryRun.updated} updated at/above floor, ${forced} forced below floor` +
        `${dryRun.skippedNoCost ? `, ${dryRun.skippedNoCost} skipped (no cost)` : ""}.`,
      );
      closeAll(false);
    } catch (e: any) {
      toast.error(friendlyPriceError(e));
    }
  };

  const onSkipBelowFloor = () => {
    if (!dryRun) return;
    toast.success(
      `${dryRun.updated} updated. ${dryRun.belowFloor.length} left unchanged (below floor)` +
      `${dryRun.skippedNoCost ? `, ${dryRun.skippedNoCost} skipped (no cost)` : ""}.`,
    );
    closeAll(false);
  };

  const title =
    scope === "selected" ? "Apply margin to selected brands"
    : scope === "category" ? "Apply margin to a category"
    : "Apply margin to a bundle tier";

  const description =
    scope === "selected"
      ? `Recompute retail prices for ${selectedBrandIds?.length || 0} selected brands using cost × (1 + margin%).`
      : scope === "category"
      ? "Recompute retail prices for every in-stock brand of active products in this category."
      : "Recompute retail prices for every in-stock brand whose product appears in any active bundle of this tier.";

  // PHASE 2 view — a SINGLE summary dialog for all below-floor rows.
  if (dryRun && dryRun.belowFloor.length > 0) {
    return (
      <Dialog open={open} onOpenChange={closeAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dryRun.updated} brands updated. {dryRun.belowFloor.length} below the 39% floor.</DialogTitle>
            <DialogDescription>
              These brands would fall below the markup floor at {appliedPct}% margin and were NOT saved.
              {dryRun.skippedNoCost > 0 ? ` (${dryRun.skippedNoCost} more skipped — no cost price.)` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {dryRun.belowFloor.map((it) => (
              <div key={it.brandId} className="px-3 py-2 text-[13px]">
                <span className="font-semibold">{it.brandName}</span>: {fmt(it.price)}
                <span className="text-muted-foreground">
                  {" "}({it.resultingMarkup != null ? `${Number(it.resultingMarkup).toFixed(1)}% markup` : "markup n/a"}
                  {it.floorPrice != null ? `, floor is ${fmt(it.floorPrice)}` : ""})
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onSkipBelowFloor} disabled={isBusy}>
              Skip these {dryRun.belowFloor.length}
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={onForceBelowFloor} disabled={isBusy}>
              {force.isPending ? "Applying…" : "Apply all below floor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={closeAll}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {scope === "category" && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-cat">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="bulk-cat"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === "tier" && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-tier">Bundle tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as BundleTier)}>
                <SelectTrigger id="bulk-tier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="bulk-pct">Target margin %</Label>
            <Input
              id="bulk-pct"
              type="number"
              step="0.1"
              value={marginPct}
              onChange={(e) => setMarginPct(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              New retail = cost × (1 + margin / 100), truncated to whole naira.
              Brands without a cost price are skipped.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>Cancel</Button>
          <Button onClick={onApply} disabled={isBusy}>
            {isBusy ? "Applying…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkApplyModal;
