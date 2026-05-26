import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermission } from "@/hooks/usePagePermission";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, History } from "lucide-react";

const fmt = (n: number) => "₦" + Math.round(n || 0).toLocaleString("en-NG");

const titleCase = (s: string) =>
  (s || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

function relTime(iso?: string | null) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export default function AdminPickingQueue() {
  const { loading: permLoading, allowed } = usePagePermission("picking", "view");
  const { adminUser } = usePermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const readyQuery = useQuery({
    queryKey: ["picking", "queue", "ready"],
    enabled: !!allowed,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from("orders") as any)
        .select("id, order_number, total, created_at, order_items(id)")
        .is("assigned_picker_id", null)
        .eq("payment_status", "paid")
        .in("order_status", ["pending", "confirmed", "processing"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const mineQuery = useQuery({
    queryKey: ["picking", "queue", "mine", adminUser?.id],
    enabled: !!allowed && !!adminUser?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from("orders") as any)
        .select("id, order_number, order_status, assigned_at")
        .eq("assigned_picker_id", adminUser.id)
        .not("order_status", "in", "(delivered,cancelled,returned,refunded)")
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const onAccept = async (orderId: string) => {
    try {
      const { data, error } = await (supabase.rpc as any)("accept_order_for_picking", {
        p_order_id: orderId,
      });
      if (error) {
        toast.error(error.message || "Could not accept order");
        return;
      }
      const res = data as { success: boolean; error?: string; order_id?: string };
      if (res?.success && res.order_id) {
        qc.invalidateQueries({ queryKey: ["picking", "queue", "ready"] });
        qc.invalidateQueries({ queryKey: ["picking", "queue", "mine"] });
        navigate(`/admin/picking/${res.order_id}`);
      } else {
        toast.error(res?.error || "Could not accept order");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not accept order");
    }
  };

  if (permLoading) {
    return (
      <div className="p-4 md:p-6 max-w-[720px] mx-auto space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-4 md:p-6 max-w-[720px] mx-auto">
        <p className="text-sm text-text-med">Not authorized.</p>
        <Link to="/admin" className="text-forest text-sm underline">
          Back to admin
        </Link>
      </div>
    );
  }

  const ready = readyQuery.data || [];
  const mine = mineQuery.data || [];

  return (
    <div className="p-4 md:p-6 max-w-[720px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-forest">Order Picking</h1>
          <p className="text-sm text-text-med">Claim and pick paid orders.</p>
        </div>
        <Link to="/admin/picking/history">
          <Button variant="outline" size="sm">
            <History className="w-4 h-4 mr-1.5" /> History
          </Button>
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-text-med uppercase tracking-wide">
          Ready to claim ({ready.length})
        </h2>
        {readyQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : ready.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-10 text-center text-sm text-text-med">
            No orders awaiting pickup.
          </div>
        ) : (
          <div className="space-y-2">
            {ready.map((o: any) => {
              const itemCount = Array.isArray(o.order_items) ? o.order_items.length : 0;
              return (
                <div
                  key={o.id}
                  className="border border-border rounded-lg p-3 bg-card flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-forest shrink-0" />
                    <span className="font-bold">{o.order_number}</span>
                    <span className="ml-auto text-sm font-semibold">{fmt(o.total)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-text-med">
                      {itemCount} item{itemCount === 1 ? "" : "s"} · {relTime(o.created_at)}
                    </div>
                    <Button size="sm" onClick={() => onAccept(o.id)}>
                      Accept
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-text-med uppercase tracking-wide">
          My orders in progress ({mine.length})
        </h2>
        {mineQuery.isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : mine.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-10 text-center text-sm text-text-med">
            You have no in-progress orders.
          </div>
        ) : (
          <div className="space-y-2">
            {mine.map((o: any) => (
              <button
                key={o.id}
                onClick={() => navigate(`/admin/picking/${o.id}`)}
                className="w-full text-left border border-border rounded-lg p-3 bg-card hover:bg-muted/20 transition-colors flex items-center gap-2"
              >
                <Package className="w-4 h-4 text-forest shrink-0" />
                <span className="font-bold">{o.order_number}</span>
                <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-forest/10 text-forest">
                  {titleCase(o.order_status || "")}
                </span>
                <span className="ml-auto text-xs text-text-med">
                  {o.assigned_at ? `Claimed ${relTime(o.assigned_at)}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
