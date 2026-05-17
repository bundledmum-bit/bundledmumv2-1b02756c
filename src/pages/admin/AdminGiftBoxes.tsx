import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, X, Loader2 } from "lucide-react";

const fmt = (n: number) => `₦${Math.round(Number(n) || 0).toLocaleString()}`;

interface GiftBoxRow {
  id: string;
  name: string;
  slug: string;
  gift_box_markup_pct: number;
}

interface GiftBoxItem {
  gift_box_item_id: string;
  product_id: string;
  product_name: string;
  brand_id: string | null;
  brand_name: string | null;
  unit_price: number;
  quantity: number;
  line_cost: number;
  is_optional: boolean;
}

interface GiftBoxPrice {
  gift_box_id: string;
  item_count: number;
  cost_total: number;
  markup_pct: number;
  sell_price: number;
  items: GiftBoxItem[];
}

export default function AdminGiftBoxes() {
  const { data: boxes, isLoading } = useQuery({
    queryKey: ["admin-gift-boxes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, slug, gift_box_markup_pct")
        .eq("is_gift_box", true)
        .order("slug");
      if (error) throw error;
      return (data || []) as GiftBoxRow[];
    },
  });

  if (isLoading) {
    return <div className="text-center py-10 text-text-med">Loading gift boxes...</div>;
  }
  if (!boxes || boxes.length === 0) {
    return <div className="text-center py-10 text-text-med">No gift boxes configured.</div>;
  }

  return (
    <div className="space-y-5">
      {boxes.map(box => (
        <GiftBoxPanel key={box.id} box={box} />
      ))}
    </div>
  );
}

function GiftBoxPanel({ box }: { box: GiftBoxRow }) {
  const qc = useQueryClient();
  const [markupDraft, setMarkupDraft] = useState<string>(String(box.gift_box_markup_pct ?? 25));
  const [savingMarkup, setSavingMarkup] = useState(false);

  const priceQuery = useQuery({
    queryKey: ["gift-box-price", box.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc("get_gift_box_price", { p_gift_box_id: box.id });
      if (error) throw error;
      return data as GiftBoxPrice;
    },
  });

  const price = priceQuery.data;

  useEffect(() => {
    // Keep the markup draft in sync if the RPC returns a different value
    // than the one cached on the products row (e.g. another admin edited).
    if (price && Number(price.markup_pct) !== Number(markupDraft)) {
      setMarkupDraft(String(price.markup_pct));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price?.markup_pct]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["gift-box-price", box.id] });
    qc.invalidateQueries({ queryKey: ["admin-gift-boxes"] });
  };

  const saveMarkup = async () => {
    const n = Number(markupDraft);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Markup must be between 0 and 100.");
      return;
    }
    setSavingMarkup(true);
    try {
      // 1) write new markup on the gift-box product row
      const { error: e1 } = await (supabase as any)
        .from("products")
        .update({ gift_box_markup_pct: n })
        .eq("id", box.id);
      if (e1) throw e1;
      // 2) recompute price via RPC (trigger already keeps the cost in sync,
      //    but the brand row's price field needs a refresh based on the new
      //    markup)
      const { data: fresh, error: e2 } = await (supabase as any)
        .rpc("get_gift_box_price", { p_gift_box_id: box.id });
      if (e2) throw e2;
      // 3) push the new sell_price down to brands.price for this gift box
      const sell = Number((fresh as any)?.sell_price ?? 0);
      const { error: e3 } = await (supabase as any)
        .from("brands")
        .update({ price: sell })
        .eq("product_id", box.id);
      if (e3) throw e3;
      toast.success("Markup updated");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save markup");
    } finally {
      setSavingMarkup(false);
    }
  };

  const removeItem = async (giftBoxItemId: string) => {
    if (!confirm("Remove this item from the gift box?")) return;
    const { error } = await (supabase as any)
      .from("gift_box_items")
      .delete()
      .eq("id", giftBoxItemId);
    if (error) { toast.error(error.message); return; }
    toast.success("Item removed");
    refresh();
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="pf text-lg font-bold">{box.name}</h2>
          <p className="text-[11px] text-text-light">/{box.slug}</p>
        </div>
        {priceQuery.isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-text-light" />
        ) : price ? (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light">Sell Price</div>
            <div className="pf text-2xl font-bold text-forest">{fmt(price.sell_price)}</div>
            <div className="text-[11px] text-text-med">
              Cost: {fmt(price.cost_total)} · {price.item_count} item{price.item_count === 1 ? "" : "s"}
            </div>
          </div>
        ) : null}
      </div>

      {/* Markup editor */}
      <div className="flex items-end gap-2 mb-5">
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-light block mb-1">Markup</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={markupDraft}
              onChange={e => setMarkupDraft(e.target.value)}
              className="w-24 border border-input rounded-lg px-2 py-1.5 text-sm bg-background"
            />
            <span className="text-sm text-text-med">%</span>
          </div>
        </div>
        <button
          onClick={saveMarkup}
          disabled={savingMarkup}
          className="bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savingMarkup ? "Saving…" : "Save Markup"}
        </button>
      </div>

      {/* Items list */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light mb-2">Items in box</div>
        {priceQuery.isLoading ? (
          <div className="text-center py-4 text-text-med text-sm">Loading…</div>
        ) : price && price.items.length > 0 ? (
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {price.items.map(it => (
              <li key={it.gift_box_item_id} className="flex items-center justify-between gap-3 px-3 py-2 bg-background">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{it.product_name}</div>
                  <div className="text-[11px] text-text-med">
                    {it.brand_id
                      ? <>Brand: {it.brand_name}</>
                      : <span className="italic">Auto — cheapest in stock</span>}
                    {" · "}Qty {it.quantity} × {fmt(it.unit_price)} = <span className="font-semibold">{fmt(it.line_cost)}</span>
                    {it.is_optional && <span className="ml-2 text-[10px] uppercase tracking-wider text-text-light">(optional)</span>}
                  </div>
                </div>
                <button
                  title="Remove"
                  onClick={() => removeItem(it.gift_box_item_id)}
                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-text-light text-sm italic">No items yet — add your first product below.</div>
        )}
      </div>

      <AddItemForm
        giftBoxId={box.id}
        currentItemCount={price?.items.length || 0}
        onAdded={refresh}
      />
    </div>
  );
}

function AddItemForm({ giftBoxId, currentItemCount, onAdded }: {
  giftBoxId: string;
  currentItemCount: number;
  onAdded: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | "auto">("auto");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const searchEnabled = !selectedProduct && searchTerm.trim().length >= 2;
  const searchQuery = useQuery({
    queryKey: ["gift-box-product-search", searchTerm],
    enabled: searchEnabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name")
        .ilike("name", `%${searchTerm.trim()}%`)
        .eq("is_active", true)
        .eq("is_gift_box", false)
        .order("name")
        .limit(20);
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    staleTime: 30_000,
  });

  const brandsQuery = useQuery({
    queryKey: ["gift-box-brands", selectedProduct?.id],
    enabled: !!selectedProduct,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brands")
        .select("id, brand_name, price")
        .eq("product_id", selectedProduct!.id)
        .eq("in_stock", true)
        .order("price");
      if (error) throw error;
      return (data || []) as { id: string; brand_name: string; price: number }[];
    },
  });

  const reset = () => {
    setSelectedProduct(null);
    setSelectedBrandId("auto");
    setQuantity(1);
    setSearchTerm("");
  };

  const submit = async () => {
    if (!selectedProduct) { toast.error("Pick a product first"); return; }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) { toast.error("Quantity must be at least 1"); return; }
    setSubmitting(true);
    try {
      const { error } = await (supabase as any)
        .from("gift_box_items")
        .insert({
          gift_box_id: giftBoxId,
          product_id: selectedProduct.id,
          brand_id: selectedBrandId === "auto" ? null : selectedBrandId,
          quantity: qty,
          display_order: currentItemCount,
        });
      if (error) throw error;
      toast.success("Added to gift box");
      reset();
      onAdded();
    } catch (e: any) {
      toast.error(e?.message || "Failed to add item");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-dashed border-border pt-4">
      <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light mb-2">Add product</div>
      {!selectedProduct ? (
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search products by name…"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
          {searchEnabled && (
            <div className="mt-1 border border-border rounded-lg max-h-56 overflow-y-auto bg-background shadow-sm">
              {searchQuery.isLoading ? (
                <div className="px-3 py-2 text-xs text-text-light">Searching…</div>
              ) : (searchQuery.data || []).length === 0 ? (
                <div className="px-3 py-2 text-xs text-text-light">No products match.</div>
              ) : (
                (searchQuery.data || []).map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProduct(p); setSearchTerm(""); }}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-muted"
                  >
                    {p.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 bg-muted/30 rounded-lg px-3 py-2">
            <span className="text-sm font-semibold truncate">{selectedProduct.name}</span>
            <button onClick={reset} className="text-[11px] text-destructive hover:underline">Change</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <label className="text-[10px] uppercase tracking-widest font-semibold text-text-light block mb-1">Brand</label>
              <select
                value={selectedBrandId}
                onChange={e => setSelectedBrandId(e.target.value as any)}
                className="w-full border border-input rounded-lg px-2 py-1.5 text-sm bg-background"
              >
                <option value="auto">Auto — cheapest in stock</option>
                {(brandsQuery.data || []).map(b => (
                  <option key={b.id} value={b.id}>
                    {b.brand_name} — {fmt(b.price)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest font-semibold text-text-light block mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={e => setQuantity(parseInt(e.target.value || "1", 10))}
                className="w-full border border-input rounded-lg px-2 py-1.5 text-sm bg-background"
              />
            </div>
          </div>
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" /> {submitting ? "Adding…" : "Add to Box"}
          </button>
        </div>
      )}
    </div>
  );
}

export function useCanManageGiftBoxes(adminRole: string | null | undefined): boolean {
  return adminRole === "super_admin" || adminRole === "admin";
}
