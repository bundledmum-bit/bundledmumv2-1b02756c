import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { usePickingHistory } from "@/hooks/useOrderPicking";

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function durationStr(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s}s`;
}

export default function AdminPickingHistory() {
  const { data: rows = [], isLoading } = usePickingHistory();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/admin/picking">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Picking History</h1>
          <p className="text-sm text-muted-foreground">Completed picking sessions.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-10 text-center text-muted-foreground text-sm">
          No completed picking sessions yet.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="p-2 w-6"></th>
                <th className="p-2">Order #</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Picked By</th>
                <th className="p-2">Started</th>
                <th className="p-2">Completed</th>
                <th className="p-2">Duration</th>
                <th className="p-2 text-center">Items</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => {
                const isOpen = expanded === r.id;
                const items: any[] = r.order_picking_items || [];
                return (
                  <>
                    <tr
                      key={r.id}
                      className="border-t border-border hover:bg-muted/30 cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                    >
                      <td className="p-2">{isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                      <td className="p-2 font-semibold">{r.orders?.order_number || "—"}</td>
                      <td className="p-2">{r.orders?.customer_name || "—"}</td>
                      <td className="p-2 text-xs text-muted-foreground font-mono">
                        {r.started_by ? r.started_by.slice(0, 8) : "—"}
                      </td>
                      <td className="p-2">{fmtDate(r.started_at)}</td>
                      <td className="p-2">{fmtDate(r.completed_at)}</td>
                      <td className="p-2">{durationStr(r.started_at, r.completed_at)}</td>
                      <td className="p-2 text-center">{items.length}</td>
                    </tr>
                    {isOpen && (
                      <tr key={r.id + "-d"} className="bg-muted/20">
                        <td colSpan={8} className="p-3">
                          <div className="space-y-1">
                            {items.length === 0 ? (
                              <div className="text-xs text-muted-foreground">No items recorded.</div>
                            ) : (
                              items.map((it: any) => (
                                <div key={it.id} className="text-xs flex items-center gap-3">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${it.is_picked ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"}`}>
                                    {it.is_picked ? "picked" : "missed"}
                                  </span>
                                  <span className="font-semibold">{it.order_items?.product_name || "—"}</span>
                                  <span className="text-muted-foreground">{it.order_items?.brand_name || ""}</span>
                                  <span className="text-muted-foreground">× {it.order_items?.quantity || 1}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
