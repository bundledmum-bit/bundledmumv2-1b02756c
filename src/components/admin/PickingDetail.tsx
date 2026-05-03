import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowLeft, Package } from "lucide-react";
import { toast } from "sonner";
import {
  usePickingSession,
  usePickingSessionById,
  useStartPickingSession,
  useMarkPickingItemPicked,
  useCompletePickingSession,
} from "@/hooks/useOrderPicking";

interface Props {
  // New canonical entry: load directly by session id.
  sessionId?: string;
  // Legacy entry: load by order id (used when navigating from /admin/orders).
  orderId?: string;
  fresh?: boolean;
}

export default function PickingDetail({ sessionId, orderId, fresh }: Props) {
  const navigate = useNavigate();
  const byId = usePickingSessionById(sessionId);
  const byOrder = usePickingSession(sessionId ? null : orderId);
  const session = sessionId ? byId.data : byOrder.data;
  const isLoading = sessionId ? byId.isLoading : byOrder.isLoading;
  const refetch = sessionId ? byId.refetch : byOrder.refetch;
  const start = useStartPickingSession();
  const mark = useMarkPickingItemPicked();
  const complete = useCompletePickingSession();

  // If `fresh` mode and there's no session yet (legacy orderId entry only),
  // kick one off.
  useEffect(() => {
    if (!fresh || !orderId) return;
    if (isLoading) return;
    if (session) return;
    start.mutate(
      { orderId },
      {
        onSuccess: () => { refetch(); },
        onError: (e: any) => toast.error(e?.message || "Could not start picking session"),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, isLoading, session, orderId]);

  const items: any[] = (session as any)?.order_picking_items || [];

  const grouped = useMemo(() => {
    const map = new Map<string, { vendorName: string; items: any[] }>();
    for (const it of items) {
      const vendorName = it.order_items?.brands?.vendors?.name || "No Vendor Assigned";
      const key = it.vendor_id || "_none_";
      if (!map.has(key)) map.set(key, { vendorName, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.values());
  }, [items]);

  const allPicked = items.length > 0 && items.every(i => i.is_picked);
  const uniqueVendors = new Set(items.map(i => i.vendor_id || "_none_")).size;

  if (isLoading || (fresh && !session)) {
    return <div className="text-sm text-muted-foreground p-6">Loading session...</div>;
  }
  if (!session) {
    return (
      <div className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/picking")}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to queue
        </Button>
        <div className="border border-dashed border-border rounded-lg py-10 text-center text-muted-foreground text-sm">
          No picking session exists for this order.
        </div>
      </div>
    );
  }

  // Empty-session guard — render a clear message instead of a blank page
  // when a session somehow exists with zero picking items.
  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/admin/picking")}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to queue
        </Button>
        <div className="border border-dashed border-border rounded-lg py-10 text-center text-muted-foreground text-sm">
          This order has no items to pick. Return to the queue.
        </div>
      </div>
    );
  }

  const orderNumber = (session as any).orders?.order_number || "—";
  const customerName = (session as any).orders?.customer_name || "—";

  const finishPicking = () => {
    complete.mutate(
      { sessionId: (session as any).id, orderId: (session as any).order_id },
      {
        onSuccess: (res) => {
          const num = res?.orderNumber || orderNumber;
          toast.success(`Order #${num} marked as picked.`, {
            description: "Order manager has been notified.",
          });
          navigate("/admin/picking");
        },
        onError: (e: any) => toast.error(e?.message || "Could not complete picking session"),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/picking")}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to queue
          </Button>
          <h1 className="text-xl font-bold mt-1">Picking Order #{orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {customerName} · {items.length} items · {uniqueVendors} {uniqueVendors === 1 ? "vendor" : "vendors"}
          </p>
        </div>
        {!allPicked && (
          <Button onClick={finishPicking} disabled={complete.isPending}>
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Mark as Complete
          </Button>
        )}
      </div>

      {allPicked && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-semibold">Order Fully Picked</span>
          </div>
          {(session as any).status === "completed" ? (
            <Button onClick={() => navigate("/admin/picking")} variant="outline">Done</Button>
          ) : (
            <Button onClick={finishPicking} disabled={complete.isPending}>
              Finish & Notify
            </Button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {grouped.map(group => (
          <div key={group.vendorName} className="border border-border rounded-lg overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 flex items-center gap-2 border-b border-border">
              <Package className="w-4 h-4 text-forest" />
              <span className="font-semibold text-sm">{group.vendorName}</span>
              <span className="text-[11px] text-muted-foreground">
                ({group.items.filter(i => i.is_picked).length}/{group.items.length} picked)
              </span>
            </div>
            <div className="divide-y divide-border">
              {group.items.map(it => {
                const oi = it.order_items || {};
                const brand = oi.brands || {};
                return (
                  <div key={it.id} className={`flex items-center gap-3 p-3 ${it.is_picked ? "bg-green-50/50" : ""}`}>
                    <input
                      type="checkbox"
                      checked={!!it.is_picked}
                      onChange={() => {
                        if (it.is_picked) return;
                        mark.mutate({ itemId: it.id, sessionId: (session as any).id });
                      }}
                      className="w-5 h-5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {oi.product_name || "—"}
                        {oi.brand_name ? <span className="text-muted-foreground font-normal"> · {oi.brand_name}</span> : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {brand.sku ? `SKU ${brand.sku}` : "No SKU"}
                      </div>
                    </div>
                    <div className="text-sm font-semibold whitespace-nowrap">× {oi.quantity || 1}</div>
                    {!it.is_picked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => mark.mutate({ itemId: it.id, sessionId: (session as any).id })}
                        disabled={mark.isPending}
                      >
                        Pick
                      </Button>
                    ) : (
                      <span className="text-xs text-green-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Picked
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
