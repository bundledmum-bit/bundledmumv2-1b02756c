import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import {
  useUnreadAdminNotifications,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useAdminNotifications";

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: notifs = [] } = useUnreadAdminNotifications();
  const { data: count = 0 } = useUnreadCount();
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 hover:bg-muted rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 text-white text-[9px] rounded-full flex items-center justify-center font-bold"
            style={{ background: "#F4845F" }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-card border border-border rounded-xl shadow-lg max-h-[28rem] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-card">
            <span className="text-sm font-semibold">Notifications</span>
            {count > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-xs text-forest font-semibold hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifs.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No unread notifications.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifs.map(n => {
                const orderHref = n.order_id
                  ? `/admin/orders/${n.order_id}`
                  : "/admin/orders";
                return (
                  <li key={n.id} className="p-3 hover:bg-muted/40 transition-colors">
                    <div className="text-xs font-semibold">{n.title || "Notification"}</div>
                    {n.message && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">{n.message}</div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground">
                        {relativeTime(n.created_at)}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => markOne.mutate(n.id)}
                          className="text-[10px] text-forest font-semibold hover:underline"
                        >
                          Mark as read
                        </button>
                        <Link
                          to={orderHref}
                          onClick={() => { markOne.mutate(n.id); setOpen(false); }}
                          className="text-[10px] text-coral font-semibold hover:underline"
                        >
                          Go to order →
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
