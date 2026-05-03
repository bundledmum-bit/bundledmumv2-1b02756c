import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, History } from "lucide-react";
import { toast } from "sonner";
import { usePickingQueue, useStartPickingSession, usePickingSession } from "@/hooks/useOrderPicking";
import PickingDetail from "@/components/admin/PickingDetail";
import { getLagosDateRange } from "@/lib/lagosDateRange";

const fmt = (n: number) => `₦${(n || 0).toLocaleString("en-NG")}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });

function isPaymentGateError(e: any) {
  if (!e) return false;
  const code = e?.code || e?.cause?.code;
  const msg = (e?.message || "").toLowerCase();
  return code === "P0001" || msg.includes("payment status");
}

export default function AdminPicking() {
  const [params] = useSearchParams();
  const sessionId = params.get("session");
  const orderId = params.get("order");
  // New canonical entry — load session by id and render detail.
  if (sessionId) return <PickingDetail sessionId={sessionId} />;
  // Legacy entry from /admin/orders — auto-create or resume a session for
  // this order, then redirect to ?session=<id>.
  if (orderId) return <OrderEntryGate orderId={orderId} />;
  return <PickingQueueView />;
}

function OrderEntryGate({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const { data: existing, isLoading } = usePickingSession(orderId);
  const start = useStartPickingSession();

  useEffect(() => {
    if (isLoading) return;
    const existingId = (existing as any)?.id;
    if (existingId) {
      navigate(`/admin/picking?session=${existingId}`, { replace: true });
      return;
    }
    if (start.isPending || start.isSuccess) return;
    start.mutate(
      { orderId },
      {
        onSuccess: (s: any) => {
          navigate(`/admin/picking?session=${s.id}`, { replace: true });
        },
        onError: (e: any) => {
          if (isPaymentGateError(e)) {
            toast.error("This order cannot be picked until payment is confirmed.");
          } else {
            toast.error(e?.message || "Could not start picking session");
          }
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, existing, orderId]);

  return <div className="text-sm text-muted-foreground p-6">Loading session…</div>;
}

type RangeKey = "today" | "week" | "month" | "custom";

function PickingQueueView() {
  const navigate = useNavigate();
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [appliedCustom, setAppliedCustom] = useState<{ from: string; to: string } | null>(null);

  const customError = rangeKey === "custom" && customFrom && customTo && customFrom > customTo
    ? "From date must be before To date"
    : null;

  const range = useMemo(() => {
    if (rangeKey === "custom") {
      if (!appliedCustom) return null;
      return getLagosDateRange("custom", appliedCustom.from, appliedCustom.to);
    }
    return getLagosDateRange(rangeKey);
  }, [rangeKey, appliedCustom]);

  const { data: orders = [], isLoading } = usePickingQueue(range || undefined);
  const start = useStartPickingSession();

  const tabs: { key: RangeKey; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Order Picking</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading queue..." : `Picking Queue (${orders.length} orders)`}
          </p>
        </div>
        <Link to="/admin/picking/history">
          <Button variant="outline">
            <History className="w-4 h-4 mr-1.5" /> History
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setRangeKey(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              rangeKey === t.key
                ? "border-forest bg-forest/10 text-forest"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rangeKey === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="text-[11px] text-muted-foreground font-semibold">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="border border-input rounded-lg px-2 py-1.5 text-xs bg-background"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-muted-foreground font-semibold">To</label>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="border border-input rounded-lg px-2 py-1.5 text-xs bg-background"
            />
          </div>
          <Button
            size="sm"
            disabled={!customFrom || !customTo || !!customError}
            onClick={() => {
              if (customError) return;
              setAppliedCustom({ from: customFrom, to: customTo });
            }}
          >
            Apply
          </Button>
          {customError && (
            <span className="text-xs text-red-600 font-semibold">{customError}</span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : orders.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-14 text-center text-muted-foreground text-sm">
          No paid orders in this date range awaiting picking.
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
                    onSuccess: (s: any) => navigate(`/admin/picking?session=${s.id}`),
                    onError: (e: any) => {
                      if (isPaymentGateError(e)) {
                        toast.error("This order cannot be picked until payment is confirmed.");
                      } else {
                        toast.error(e?.message || "Could not start session");
                      }
                    },
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
