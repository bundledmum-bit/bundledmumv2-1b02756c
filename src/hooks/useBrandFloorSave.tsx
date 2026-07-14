import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, ArrowUp, Loader2 } from "lucide-react";

// Single source of truth for saving a brand's price under the 39% markup floor.
// NEVER write brands.price / brands.cost_price directly from the admin — a
// below-floor write throws a raw DB trigger error and dead-ends the admin. Route
// every interactive price save through here:
//   1. check_markup_floor(cost, price) — decides if a dialog is needed
//   2. at/above floor  -> admin_save_brand_price_v2(confirm=false) saves quietly
//   3. below floor      -> a dialog offering "Raise the price" (live markup) or
//      "Proceed anyway" (requires a reason). The RPC toggles the override on/off
//      safely inside the DB, so the floor is never left disabled.

export interface FloorCheck {
  below_floor: boolean;
  floor_percent: number;
  min_price: number;
  current_markup_percent: number;
  shortfall: number;
  suggested_price: number;
  message: string;
}

const fmt = (n: number) => `₦${Number(n || 0).toLocaleString("en-NG")}`;

export async function checkMarkupFloor(cost: number, price: number): Promise<FloorCheck | null> {
  const { data, error } = await (supabase as any).rpc("check_markup_floor", {
    p_cost_price: Math.round(cost) || 0,
    p_price: Math.round(price) || 0,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

async function saveBrandPriceV2(
  brandId: string, cost: number, price: number, confirm: boolean, reason: string | null,
): Promise<{ saved: boolean; below_floor: boolean; message: string } | null> {
  const { data, error } = await (supabase as any).rpc("admin_save_brand_price_v2", {
    p_brand_id: brandId,
    p_cost_price: Math.round(cost) || 0,
    p_price: Math.round(price) || 0,
    p_confirm_below_floor: confirm,
    p_below_floor_reason: reason,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

type PendingSave = {
  brandId: string;
  cost: number;
  price: number;
  label: string;
  floor: FloorCheck;
  onSaved?: () => void;
  resolve: (saved: boolean) => void;
};

// Hook: returns `save(...)` and a `dialogNode` to render. `save` performs the
// floor check and either saves quietly (at/above floor) or opens the dialog.
// It resolves to `true` once the price is saved (above floor, or below floor via
// the dialog), `false` if cancelled — so callers can `await` it in a batch loop.
export function useBrandFloorSave() {
  const [pending, setPending] = useState<PendingSave | null>(null);

  const save = (
    brandId: string,
    cost: number,
    price: number,
    opts?: { label?: string; onSaved?: () => void; quiet?: boolean },
  ): Promise<boolean> => new Promise<boolean>((resolve) => {
    const label = opts?.label || "this price";
    (async () => {
      const floor = await checkMarkupFloor(cost, price);
      if (!floor) {
        toast.error("Couldn't check the price floor. Please try again.");
        resolve(false);
        return;
      }
      if (!floor.below_floor) {
        // At/above floor: a normal save (no dialog). `quiet` suppresses the
        // per-item success toast for batch callers (e.g. the product form,
        // which shows its own "saved" toast at the end).
        try {
          const r = await saveBrandPriceV2(brandId, cost, price, false, null);
          if (r?.saved) { if (!opts?.quiet) toast.success(r.message || "Price saved."); opts?.onSaved?.(); resolve(true); }
          else { toast.error(r?.message || "The price could not be saved."); resolve(false); }
        } catch (e: any) {
          toast.error(e?.message || "The price could not be saved.");
          resolve(false);
        }
        return;
      }
      // Below floor: let the admin choose. Resolves when the dialog closes.
      setPending({ brandId, cost, price, label, floor, onSaved: opts?.onSaved, resolve });
    })();
  });

  const dialogNode = pending ? (
    <BelowFloorPriceDialog
      pending={pending}
      onClose={(saved) => { if (saved) pending.onSaved?.(); pending.resolve(saved); setPending(null); }}
    />
  ) : null;

  return { save, dialogNode };
}

function BelowFloorPriceDialog({
  pending, onClose,
}: {
  pending: PendingSave;
  onClose: (saved: boolean) => void;
}) {
  const { brandId, cost, price, floor } = pending;
  const [raiseInput, setRaiseInput] = useState<string>(String(floor.suggested_price ?? floor.min_price ?? price));
  const [liveFloor, setLiveFloor] = useState<FloorCheck | null>(floor);
  const [reason, setReason] = useState("");
  const [savingRaise, setSavingRaise] = useState(false);
  const [savingProceed, setSavingProceed] = useState(false);

  const raiseNum = parseInt(raiseInput, 10);
  const raiseValid = Number.isFinite(raiseNum) && raiseNum > 0;

  // Re-run the floor check as the admin edits the raised price, so the live
  // markup % (and whether it clears the floor) updates while they type.
  const onRaiseChange = (v: string) => {
    setRaiseInput(v);
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n <= 0) { setLiveFloor(null); return; }
    // Debounce via a microtask timer keyed on the latest value.
    const value = n;
    window.clearTimeout((onRaiseChange as any)._t);
    (onRaiseChange as any)._t = window.setTimeout(async () => {
      const fc = await checkMarkupFloor(cost, value);
      setLiveFloor(fc);
    }, 200);
  };

  const doRaise = async () => {
    if (!raiseValid || savingRaise) return;
    setSavingRaise(true);
    try {
      const r = await saveBrandPriceV2(brandId, cost, raiseNum, false, null);
      if (r?.saved) { toast.success(r.message || `Price raised to ${fmt(raiseNum)}.`); onClose(true); }
      else { toast.error(r?.message || "Still below the floor — raise the price further."); }
    } catch (e: any) {
      toast.error(e?.message || "Could not save the price.");
    } finally {
      setSavingRaise(false);
    }
  };

  const doProceed = async () => {
    if (!reason.trim() || savingProceed) return;
    setSavingProceed(true);
    try {
      const r = await saveBrandPriceV2(brandId, cost, price, true, reason.trim());
      if (r?.saved) { toast.success(r.message || `Saved at ${fmt(price)} (below floor).`); onClose(true); }
      else { toast.error(r?.message || "The price could not be saved."); }
    } catch (e: any) {
      toast.error(e?.message || "Could not save the price.");
    } finally {
      setSavingProceed(false);
    }
  };

  const liveMarkup = liveFloor?.current_markup_percent;
  const liveClears = liveFloor ? !liveFloor.below_floor : false;

  return (
    <div
      className="fixed inset-0 z-[200] bg-foreground/50 flex items-center justify-center p-4 max-md:items-end max-md:p-0"
      onClick={() => onClose(false)}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-[440px] p-5 max-md:rounded-b-none max-md:rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="font-bold text-base">Price is below the {floor.floor_percent}% floor</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{floor.message}</p>
          </div>
        </div>

        {/* The numbers, plainly. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] rounded-lg bg-muted/40 border border-border px-3 py-2.5 mb-4">
          <span className="text-muted-foreground">Cost</span><span className="text-right font-semibold">{fmt(cost)}</span>
          <span className="text-muted-foreground">Entered price</span><span className="text-right font-semibold">{fmt(price)}</span>
          <span className="text-muted-foreground">Current markup</span><span className="text-right font-semibold">{Number(floor.current_markup_percent).toFixed(1)}%</span>
          <span className="text-muted-foreground">Floor</span><span className="text-right font-semibold">{floor.floor_percent}% ({fmt(floor.min_price)})</span>
          <span className="text-muted-foreground">Shortfall</span><span className="text-right font-semibold text-amber-700">{fmt(floor.shortfall)}</span>
        </div>

        {/* A) Raise the price — PRIMARY. */}
        <div className="rounded-lg border-2 border-forest/60 p-3 mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowUp className="w-4 h-4 text-forest" />
            <span className="text-sm font-bold text-forest">Raise the price</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">₦</span>
            <input
              type="number"
              min={1}
              value={raiseInput}
              onChange={(e) => onRaiseChange(e.target.value)}
              className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-background"
              aria-label="New price"
            />
          </div>
          <p className="text-[11px] mt-1.5">
            {liveFloor ? (
              <span className={liveClears ? "text-forest font-semibold" : "text-amber-700 font-semibold"}>
                {Number(liveMarkup).toFixed(1)}% markup — {liveClears ? "clears the floor ✓" : `still below ${floor.floor_percent}%`}
              </span>
            ) : (
              <span className="text-muted-foreground">Enter a valid price to see the markup.</span>
            )}
          </p>
          <button
            onClick={doRaise}
            disabled={!raiseValid || savingRaise}
            className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
          >
            {savingRaise ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <>Save at {raiseValid ? fmt(raiseNum) : "…"}</>}
          </button>
        </div>

        {/* B) Proceed anyway — the deliberate exception. */}
        <details className="rounded-lg border border-border p-3">
          <summary className="text-sm font-semibold text-muted-foreground cursor-pointer">Proceed anyway at {fmt(price)}</summary>
          <p className="text-[11px] text-muted-foreground mt-2">Saving below the floor needs a reason (for the record). The floor stays on for every other product.</p>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. competitor sells at 11,000"
            className="mt-2 w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            aria-label="Reason for pricing below the floor"
          />
          <button
            onClick={doProceed}
            disabled={!reason.trim() || savingProceed}
            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 text-amber-800 px-4 py-2 text-sm font-semibold hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingProceed ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : `Proceed anyway at ${fmt(price)}`}
          </button>
        </details>

        <button onClick={() => onClose(false)} className="mt-3 w-full text-sm text-muted-foreground hover:text-foreground py-1.5">Cancel</button>
      </div>
    </div>
  );
}

export default BelowFloorPriceDialog;
