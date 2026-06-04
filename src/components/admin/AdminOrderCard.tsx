import { MoreVertical, Truck } from "lucide-react";
import { Link as RouterLink } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { STATUS_COLORS, fmt } from "@/pages/admin/AdminOrders";

// Mobile (<md) order card for AdminOrders. Desktop keeps the table;
// this is the sibling card view rendered under `md:hidden`. It consumes
// the SAME order row shape the table maps over (from get_admin_orders),
// so there is no separate fetch / filter / sort.
//
// Tap anywhere on the card body → onSelect(order.id) (same target as a
// desktop row click: opens the in-page order detail). The meatball menu
// stops propagation so its taps never trigger card navigation.
//
// The meatball mirrors the desktop row's two inline actions — "View"
// and the conditional "Start Picking" — since the table has no existing
// dropdown to share. No new actions are introduced.

interface AdminOrderCardProps {
  order: any;
  onSelect: (id: string) => void;
  canViewCustomer: boolean;
  showFinance: boolean;
  pickedOrderIds: Set<string>;
}

export default function AdminOrderCard({
  order: o,
  onSelect,
  canViewCustomer,
  showFinance,
  pickedOrderIds,
}: AdminOrderCardProps) {
  // Same Start-Picking gate as the desktop row (AdminOrders L526-528).
  const canStartPicking =
    o.payment_status === "paid" &&
    ["paid", "confirmed", "processing"].includes(o.order_status) &&
    !pickedOrderIds.has(o.id);

  // Relative date — date-fns is already a dependency. Guard against a
  // null/invalid created_at so the card never throws.
  let relativeDate = "—";
  if (o.created_at) {
    const d = new Date(o.created_at);
    if (!Number.isNaN(d.getTime())) {
      relativeDate = formatDistanceToNow(d, { addSuffix: true });
    }
  }

  // Location string — only the parts the list row actually carries.
  // items_count is NOT in the list query (only the detail fetch joins
  // order_items), so Line 3's right side is omitted.
  const location = [o.delivery_city, o.delivery_state].filter(Boolean).join(", ");

  return (
    <Card
      onClick={() => onSelect(o.id)}
      className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
    >
      {/* Line 1 — customer name (left) · total (right) */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium truncate min-w-0">
          {canViewCustomer ? o.customer_name || "—" : "—"}
        </span>
        {showFinance && (
          <span className="font-medium flex-shrink-0">{fmt(o.total || 0)}</span>
        )}
      </div>

      {/* Line 2 — order number (left, mono) · relative date (right) */}
      <div className="flex items-center justify-between gap-3 mt-0.5">
        <span className="font-mono text-xs text-muted-foreground truncate min-w-0">
          {o.is_express_order && (
            <span
              title={`Express Order — ${o.express_status || "pending_quote"}`}
              className="mr-1 text-amber-600"
            >
              ⚡
            </span>
          )}
          {o.order_number || "—"}
        </span>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {relativeDate}
        </span>
      </div>

      {/* Line 3 — location (left). Item count omitted (not in list query). */}
      {location && (
        <div className="flex items-center justify-between gap-3 mt-1">
          <span className="text-sm truncate min-w-0">{location}</span>
        </div>
      )}

      {/* Bottom row — status badges (left) · meatball (right) */}
      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[o.order_status] || ""}`}
          >
            {o.order_status}
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLORS[o.payment_status] || ""}`}
          >
            {o.payment_status}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label="Order actions"
              className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted flex-shrink-0"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onSelect(o.id);
              }}
            >
              View
            </DropdownMenuItem>
            {canStartPicking && (
              <DropdownMenuItem asChild>
                <RouterLink
                  to={`/admin/picking?order=${o.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Start Picking
                </RouterLink>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
