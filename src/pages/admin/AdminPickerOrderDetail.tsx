import { useEffect, useRef, useState } from "react";
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
  const { adminUser } = usePermissions();
  const qc = useQueryClient();

  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [pickedMap, setPickedMap] = useState<Record<string, boolean>>({});
  const acceptBtnRef = useRef<HTMLButtonElement | null>(null);
  const [pulseAccept, setPulseAccept] = useState(false);

  const queryKey = ["picker", "order", orderId];

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
        <Button size="sm" variant="outline" onClick={() => navigate("/admin/picking")}>
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
        <Button size="sm" variant="outline" onClick={() => navigate("/admin/picking")}>
          Back to queue
        </Button>
      </div>
    );
  }

  const showAcceptCta = eligibleUnassigned;
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
      </div>

      <div className="space-y-3">
        {order.order_items.map((it) => (
          <ItemCard
            key={it.id}
            item={it}
            picked={!!pickedMap[it.id]}
            onTogglePicked={() =>
              setPickedMap((m) => ({ ...m, [it.id]: !m[it.id] }))
            }
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
  picked,
  onTogglePicked,
  onZoom,
}: {
  item: OrderItem;
  picked: boolean;
  onTogglePicked: () => void;
  onZoom: (src: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const img = item.brand_image_url || "/no-image.png";

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

      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold">Qty: {item.quantity}</div>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
          <input
            type="checkbox"
            checked={picked}
            onChange={onTogglePicked}
            className="w-5 h-5 accent-forest"
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
