import { useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, History } from "lucide-react";
import { toast } from "sonner";
import { usePickingQueue, useStartPickingSession, usePickingSession } from "@/hooks/useOrderPicking";
import PickingDetail from "@/components/admin/PickingDetail";

const fmt = (n: number) => `₦${(n || 0).toLocaleString("en-NG")}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });

export default function AdminPicking() {
  const [params] = useSearchParams();
  const orderId = params.get("order");
  if (orderId) return <PickingDetailGate orderId={orderId} />;
  return <PickingQueueView />;
}

function PickingDetailGate({ orderId }: { orderId: string }) {
  // If a session already exists for this order, render normal detail.
  // If not, render with `fresh` to auto-start.
  const { data: session, isLoading } = usePickingSession(orderId);
  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-6">Loading...</div>;
  }
  return <PickingDetail orderId={orderId} fresh={!session} />;
}

function PickingQueueView() {
  const navigate = useNavigate();
  const { data: orders = [], isLoading } = usePickingQueue();
  const start = useStartPickingSession();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Order Picking</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading queue..." : `${orders.length} paid orders waiting to be picked.`}
          </p>
        </div>
        <Link to="/admin/picking/history">
          <Button variant="outline">
            <History className="w-4 h-4 mr-1.5" /> History
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : orders.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-14 text-center text-muted-foreground text-sm">
          The picking queue is empty.
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((o: any) => (
            <OrderQueueCard
              key={o.id}
              order={o}
              onStart={() => {
                start.mutate(
                  { orderId: o.id },
                  {
                    onSuccess: () => navigate(`/admin/picking?order=${o.id}`),
                    onError: (e: any) => toast.error(e?.message || "Could not start session"),
                  },
                );
              }}
              isPending={start.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderQueueCard({ order, onStart, isPending }: { order: any; onStart: () => void; isPending: boolean }) {
  const items = order.order_items || [];
  const vendorBadges = useMemo(() => {
    const set = new Map<string, string>();
    for (const it of items) {
      const vid = it.brands?.vendor_id || "_none_";
      const name = it.brands?.vendors?.name || "No vendor";
      if (!set.has(vid)) set.set(vid, name);
    }
    return Array.from(set.values());
  }, [items]);

  return (
    <div className="border border-border rounded-lg p-3 flex flex-wrap items-center gap-3 bg-card hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-2 min-w-[120px]">
        <Package className="w-4 h-4 text-forest" />
        <span className="font-bold">{order.order_number}</span>
      </div>
      <div className="text-sm min-w-[120px]">
        <div className="font-semibold">{order.customer_name}</div>
        <div className="text-[11px] text-muted-foreground">{fmtDate(order.created_at)}</div>
      </div>
      <div className="text-sm font-semibold">{fmt(order.total)}</div>
      <div className="text-xs text-muted-foreground">{items.length} items</div>
      <div className="flex flex-wrap gap-1">
        {vendorBadges.map(v => (
          <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-forest/10 text-forest font-semibold">
            {v}
          </span>
        ))}
      </div>
      <div className="ml-auto">
        <Button onClick={onStart} disabled={isPending}>
          Start Picking
        </Button>
      </div>
    </div>
  );
}
