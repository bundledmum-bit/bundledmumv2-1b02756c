import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { Button } from "@/components/ui/button";
import ImageZoomModal from "@/components/admin/ImageZoomModal";
import { getBrandImage } from "@/lib/brandImage";

const fmt = (n: number) => "₦" + Math.round(n || 0).toLocaleString("en-NG");

const titleCase = (s: string) =>
  (s || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

type OrderItem = {
  id: string;
  product_id: string | null;
  brand_id: string | null;
  product_name: string | null;
  brand_name: string | null;
  quantity: number;
  size: string | null;
  color: string | null;
  bundle_name: string | null;
  brand_image_url?: string | null;
  brand_sku?: string | null;
  brand_size_variant?: string | null;
  brand_tier?: string | null;
};

// Rows from get_order_picking_items — cost + persisted picked state.
type OrderPickingItem = {
  item_id: string;
  product_name: string | null;
  brand_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;   // NAIRA
  line_total: number;   // NAIRA
  cost_price: number;   // NAIRA — unit cost
  line_cost: number;    // NAIRA — cost x qty
  picker_cost_price: number | null; // NAIRA — unit cost the picker entered (null = none)
  picked: boolean;
  picked_at: string | null;
};

// Response from toggle_order_item_picked — the server owns the transition.
type ToggleResult = {
  order_id: string;
  item_id: string;
  item_picked: boolean;
  total_items: number;
  picked_items: number;
  all_picked: boolean;
  order_status: string;
};

type OrderDetail = {
  id: string;
  order_number: string;
  total: number;
  order_status: string;
  payment_status: string;
  assigned_picker_id: string | null;
  picking_started_at: string | null;
  packed_at: string | null;
  order_items: OrderItem[];
};

export default function AdminPickerOrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const fromEmail = search.get("from") === "email";
  const { adminUser, can } = usePermissions();
  // Accepting an order is the picking module's `accept` action; view-only
  // picking grants must not see the Accept CTA.
  const canAccept = can("picking", "accept");
  const qc = useQueryClient();

  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const acceptBtnRef = useRef<HTMLButtonElement | null>(null);
  const [pulseAccept, setPulseAccept] = useState(false);

  const queryKey = ["picker", "order", orderId];
  const pickingKey = ["picker", "picking", orderId];

  // Persisted picking data (cost + picked state) from get_order_picking_items.
  const pickingQuery = useQuery<OrderPickingItem[]>({
    queryKey: pickingKey,
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_order_picking_items", {
        p_order_id: orderId,
      });
      if (error) throw error;
      return (data || []) as OrderPickingItem[];
    },
  });
  const pickingByItem = useMemo(() => {
    const m: Record<string, OrderPickingItem> = {};
    (pickingQuery.data || []).forEach((r) => { m[r.item_id] = r; });
    return m;
  }, [pickingQuery.data]);
  const pickedCount = (pickingQuery.data || []).filter((r) => r.picked).length;
  const totalCount = (pickingQuery.data || []).length;

  // Toggle an item's picked state. The RPC persists it AND owns the
  // order auto-advance (all picked → packed; untick → processing). We trust
  // the returned order_status for the badge.
  const togglePicked = useMutation({
    mutationFn: async ({ itemId, picked }: { itemId: string; picked: boolean }) => {
      const { data, error } = await (supabase.rpc as any)("toggle_order_item_picked", {
        p_item_id: itemId,
        p_picked: picked,
      });
      if (error) throw error;
      return data as ToggleResult;
    },
    onMutate: async ({ itemId, picked }) => {
      await qc.cancelQueries({ queryKey: pickingKey });
      const prevItems = qc.getQueryData<OrderPickingItem[]>(pickingKey);
      const prevStatus = qc.getQueryData<OrderDetail | null>(queryKey)?.order_status;
      qc.setQueryData<OrderPickingItem[]>(pickingKey, (old) =>
        (old || []).map((r) =>
          r.item_id === itemId
            ? { ...r, picked, picked_at: picked ? new Date().toISOString() : null }
            : r,
        ),
      );
      return { prevItems, prevStatus };
    },
    onError: (e: any, _vars, ctx) => {
      if (ctx?.prevItems) qc.setQueryData(pickingKey, ctx.prevItems);
      toast.error(e?.message || "Could not update item");
    },
    onSuccess: (res, _vars, ctx) => {
      // Auto-advance: reflect the server's new order status in the badge.
      qc.setQueryData<OrderDetail | null>(queryKey, (old) =>
        old ? { ...old, order_status: res.order_status } : old,
      );
      if (res.order_status !== ctx?.prevStatus) {
        if (res.all_picked) toast.success("All items picked — order marked as packed");
        else toast.message(`Order moved to ${titleCase(res.order_status)}`);
      }
    },
  });

  // Picker records a changed (per-unit) cost. The RPC persists the picker
  // field AND pushes it into the order item's cost so Profit per Order
  // reflects it. We only ever surface picker_cost_price back to the picker.
  const saveCost = useMutation({
    mutationFn: async ({ itemId, unitCost }: { itemId: string; unitCost: number }) => {
      const { data, error } = await (supabase.rpc as any)("set_picker_item_cost", {
        p_item_id: itemId,
        p_new_unit_cost: unitCost,
      });
      if (error) throw error;
      return data as { item_id: string; order_id: string; new_unit_cost: number; new_line_cost: number };
    },
    onSuccess: (res) => {
      qc.setQueryData<OrderPickingItem[]>(pickingKey, (old) =>
        (old || []).map((r) =>
          r.item_id === res.item_id
            ? { ...r, picker_cost_price: res.new_unit_cost, cost_price: res.new_unit_cost, line_cost: res.new_line_cost }
            : r,
        ),
      );
      toast.success("Cost updated");
    },
    onError: (e: any) => toast.error(e?.message || "Could not update cost"),
  });

  const { data: order, isLoading, error } = useQuery<OrderDetail | null>({
    queryKey,
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("orders") as any)
        .select(
          "id, order_number, total, order_status, payment_status, assigned_picker_id, picking_started_at, packed_at, order_items(id, product_id, brand_id, product_name, brand_name, quantity, size, color, bundle_name)",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const items = (data.order_items || []) as OrderItem[];
      const brandIds = Array.from(
        new Set(items.map((i) => i.brand_id).filter((x): x is string => !!x)),
      );
      if (brandIds.length > 0) {
        const { data: brands } = await (supabase.from("brands_public") as any)
          .select("id, image_url, stored_image_url, sku, size_variant, tier")
          .in("id", brandIds);
        const byId: Record<string, any> = {};
        (brands || []).forEach((b: any) => {
          byId[b.id] = b;
        });
        for (const it of items) {
          const b = it.brand_id ? byId[it.brand_id] : null;
          it.brand_image_url = getBrandImage(b);
          it.brand_sku = b?.sku || null;
          it.brand_size_variant = b?.size_variant || null;
          it.brand_tier = b?.tier || null;
        }
      }
      return { ...(data as any), order_items: items } as OrderDetail;
    },
  });

  const eligibleUnassigned =
    !!order &&
    order.assigned_picker_id == null &&
    order.payment_status === "paid" &&
    ["pending", "confirmed", "processing"].includes(order.order_status);

  // Email arrival: pulse the Accept CTA briefly.
  useEffect(() => {
    if (!fromEmail || !eligibleUnassigned) return;
    setPulseAccept(true);
    acceptBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setPulseAccept(false), 3000);
    return () => clearTimeout(t);
  }, [fromEmail, eligibleUnassigned]);

  const accept = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("accept_order_for_picking", {
        p_order_id: orderId,
      });
      if (error) throw error;
      const res = data as { success: boolean; error?: string };
      if (!res?.success) throw new Error(res?.error || "Could not accept");
      return res;
    },
    onSuccess: () => {
      toast.success("Order accepted");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(e?.message || "Could not accept order"),
  });

  const updateStatus = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await (supabase.from("orders") as any)
        .update(patch)
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(e?.message || "Update failed"),
  });

  const markPicked = () => {
    if (!order) return;
    updateStatus.mutate(
      {
        order_status: "picked",
        picking_started_at: order.picking_started_at ?? new Date().toISOString(),
      },
      { onSuccess: () => toast.success("Marked as Picked") },
    );
  };

  const markPacked = () => {
    if (!order) return;
    updateStatus.mutate(
      {
        order_status: "packed",
        packed_at: new Date().toISOString(),
      },
      { onSuccess: () => toast.success("Marked as Packed") },
    );
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-[720px] mx-auto text-sm text-text-med">
        Loading order…
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-4 md:p-6 max-w-[720px] mx-auto space-y-3">
        <p className="text-sm text-text-med">Order unavailable.</p>
        <Button className="h-10" size="sm" variant="outline" onClick={() => navigate("/admin/picking")}>
          Back to queue
        </Button>
      </div>
    );
  }

  const isMine = order.assigned_picker_id && order.assigned_picker_id === adminUser?.id;
  const isOtherPickerAssigned =
    order.assigned_picker_id && order.assigned_picker_id !== adminUser?.id;

  if (isOtherPickerAssigned) {
    return (
      <div className="p-4 md:p-6 max-w-[720px] mx-auto space-y-3">
        <p className="text-sm text-text-med">Already assigned to another picker.</p>
        <Button className="h-10" size="sm" variant="outline" onClick={() => navigate("/admin/picking")}>
          Back to queue
        </Button>
      </div>
    );
  }

  const showAcceptCta = eligibleUnassigned && canAccept;
  const canPick =
    isMine && ["pending", "confirmed", "processing"].includes(order.order_status);
  const canPack = isMine && order.order_status === "picked";

  return (
    <div className="p-4 md:p-6 max-w-[720px] mx-auto space-y-4 pb-24 md:pb-6">
      <div className="flex items-center gap-2">
        <Link to="/admin/picking" className="text-sm text-forest underline">
          ← Queue
        </Link>
      </div>

      {showAcceptCta && (
        <button
          ref={acceptBtnRef}
          onClick={() => accept.mutate()}
          disabled={accept.isPending}
          className={`w-full rounded-lg bg-forest text-white py-4 text-base font-bold shadow disabled:opacity-50 ${
            pulseAccept ? "animate-pulse" : ""
          }`}
        >
          {accept.isPending ? "Accepting…" : "Accept this order"}
        </button>
      )}

      <div className="border border-border rounded-lg p-4 bg-card space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-forest">Order #{order.order_number}</div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-forest/10 text-forest">
            {titleCase(order.order_status)}
          </span>
        </div>
        <div className="text-sm text-text-med">
          Total {fmt(order.total)} · {order.order_items.length} item
          {order.order_items.length === 1 ? "" : "s"}
        </div>
        {totalCount > 0 && (
          <div className="text-sm font-semibold text-forest mt-0.5">
            {pickedCount} / {totalCount} picked
          </div>
        )}
      </div>

      <div className="space-y-3">
        {order.order_items.map((it) => (
          <ItemCard
            key={it.id}
            item={it}
            picking={pickingByItem[it.id] || null}
            picked={!!pickingByItem[it.id]?.picked}
            editable={!!isMine}
            busy={togglePicked.isPending}
            onTogglePicked={() =>
              togglePicked.mutate({ itemId: it.id, picked: !pickingByItem[it.id]?.picked })
            }
            onSaveCost={(unitCost) => saveCost.mutateAsync({ itemId: it.id, unitCost })}
            onZoom={(src) => setZoomSrc(src)}
          />
        ))}
      </div>

      {isMine && (
        <div className="fixed bottom-0 left-0 right-0 md:static border-t md:border-0 border-border bg-card md:bg-transparent p-3 md:p-0 flex gap-2 z-40">
          <Button
            className="flex-1"
            disabled={!canPick || updateStatus.isPending}
            onClick={markPicked}
          >
            Mark as Picked
          </Button>
          <Button
            className="flex-1"
            variant="outline"
            disabled={!canPack || updateStatus.isPending}
            onClick={markPacked}
          >
            Mark as Packed
          </Button>
        </div>
      )}

      <ImageZoomModal src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  );
}

function ItemCard({
  item,
  picking,
  picked,
  editable,
  busy,
  onTogglePicked,
  onSaveCost,
  onZoom,
}: {
  item: OrderItem;
  picking: OrderPickingItem | null;
  picked: boolean;
  editable: boolean;
  busy: boolean;
  onTogglePicked: () => void;
  onSaveCost: (unitCost: number) => Promise<unknown>;
  onZoom: (src: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Inline "price changed" editor state.
  const [editingCost, setEditingCost] = useState(false);
  const [costInput, setCostInput] = useState("");
  const [costErr, setCostErr] = useState<string | null>(null);
  const [savingCost, setSavingCost] = useState(false);
  const img = item.brand_image_url || "/no-image.png";

  // The picker always sees their own entered value when present, never
  // finance's later edits. Effective unit cost drives the displayed line cost.
  const qty = picking?.quantity ?? item.quantity ?? 1;
  const changed = picking?.picker_cost_price != null;
  const unitCost = picking ? (picking.picker_cost_price ?? picking.cost_price) : 0;
  const lineCost = unitCost * qty;

  const openCostEditor = () => {
    setCostInput(String(Math.round(unitCost || 0)));
    setCostErr(null);
    setEditingCost(true);
  };
  const parsedCost = Number(costInput);
  const previewLine = Number.isFinite(parsedCost) ? Math.round(parsedCost) * qty : 0;
  const saveCost = async () => {
    const v = Number(costInput);
    if (costInput.trim() === "" || !Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
      setCostErr("Enter a whole number, ₦0 or more.");
      return;
    }
    setSavingCost(true);
    try {
      await onSaveCost(v);
      setEditingCost(false);
    } catch {
      /* parent toasts; keep the field open so the picker can retry */
    } finally {
      setSavingCost(false);
    }
  };

  const variantsQuery = useQuery({
    queryKey: ["picker", "other-variants", item.product_id, item.brand_id],
    enabled: expanded && !!item.product_id,
    queryFn: async () => {
      const q = (supabase.from("brands_public") as any)
        .select("id, brand_name, size_variant, image_url, stored_image_url")
        .eq("product_id", item.product_id)
        .eq("in_stock", true)
        .limit(6);
      const final = item.brand_id ? q.neq("id", item.brand_id) : q;
      const { data, error } = await final;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  return (
    <div className="border border-border rounded-lg p-3 bg-card space-y-3">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onZoom(item.brand_image_url || null)}
          className="shrink-0"
        >
          <img
            src={img}
            alt={item.product_name || ""}
            className="w-24 h-24 object-cover rounded-md border border-border"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/no-image.png";
            }}
          />
        </button>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-lg font-semibold leading-tight">
            {item.product_name || "—"}
          </div>
          <div className="text-sm text-text-med">{item.brand_name || "—"}</div>
          {item.bundle_name && (
            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-coral/10 text-coral">
              {item.bundle_name}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-text-med">Size:</span>{" "}
          <span className="font-semibold">
            {item.size || item.brand_size_variant || "—"}
          </span>
        </div>
        <div>
          <span className="text-text-med">Colour:</span>{" "}
          <span className="font-semibold">{item.color || "—"}</span>
        </div>
        <div>
          <span className="text-text-med">SKU:</span>{" "}
          <span className="font-semibold">{item.brand_sku || "—"}</span>
        </div>
        <div>
          <span className="text-text-med">Tier:</span>{" "}
          <span className="font-semibold">{item.brand_tier || "—"}</span>
        </div>
      </div>

      {/* Cost — amber, clearly labelled and distinct from the selling price
          so a picker never confuses cost with what the customer paid. */}
      {picking && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Cost
              {changed && (
                <span className="ml-1.5 normal-case font-semibold text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">changed</span>
              )}
            </span>
            <span className="text-sm font-bold text-amber-800">
              {fmt(lineCost)}
              {qty > 1 && <span className="font-normal text-amber-700"> ({fmt(unitCost)} each)</span>}
            </span>
          </div>

          {!editable ? null : !editingCost ? (
            <button
              type="button"
              onClick={openCostEditor}
              className="mt-1 text-xs font-semibold text-amber-700 underline underline-offset-2"
            >
              The price changed
            </button>
          ) : (
            <div className="mt-2 space-y-2">
              <label className="block text-xs font-semibold text-amber-800">New cost per unit (₦)</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={costInput}
                onChange={(e) => { setCostInput(e.target.value); setCostErr(null); }}
                autoFocus
                disabled={savingCost}
                className="w-full min-h-[44px] border border-input rounded-lg px-3 py-2 text-sm bg-background"
                aria-label="New cost per unit in naira"
              />
              <div className="text-[11px] text-amber-700">
                Line cost: <span className="font-semibold">{fmt(previewLine)}</span> ({qty} × per unit)
              </div>
              {costErr && <div className="text-[11px] text-destructive">{costErr}</div>}
              <div className="flex gap-2">
                <Button size="sm" className="h-9" disabled={savingCost} onClick={saveCost}>
                  {savingCost ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="outline" className="h-9" disabled={savingCost} onClick={() => setEditingCost(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold">Qty: {item.quantity}</div>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
          <input
            type="checkbox"
            checked={picked}
            disabled={busy || !editable}
            onChange={onTogglePicked}
            className="w-5 h-5 accent-forest disabled:opacity-50"
          />
          Picked ✓
        </label>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-forest font-semibold underline"
        >
          {expanded ? "Hide other variants" : "Other variants in stock"}
        </button>
        {expanded && (
          <div className="mt-2 space-y-1.5">
            {variantsQuery.isLoading ? (
              <div className="text-xs text-text-med">Loading…</div>
            ) : (variantsQuery.data || []).length === 0 ? (
              <div className="text-xs text-text-med">No other variants in stock.</div>
            ) : (
              variantsQuery.data!.map((v: any) => (
                <div
                  key={v.id}
                  className="flex items-center gap-2 text-xs border border-border rounded-md p-1.5"
                >
                  <img
                    src={getBrandImage(v) || "/no-image.png"}
                    alt=""
                    className="w-8 h-8 object-cover rounded"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/no-image.png";
                    }}
                  />
                  <span className="font-semibold">{v.brand_name}</span>
                  <span className="text-text-med ml-auto">{v.size_variant || "—"}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
