import { Link } from "react-router-dom";
import { toast } from "sonner";
import { usePush } from "@/hooks/usePush";

/**
 * Status-aware notifications toggle for the footer / account area. Reuses
 * getPushStatus so the label reflects reality, and never shows a dead control
 * on iOS Safari (links to /install instead).
 */
export default function PushSubscribeToggle({ className }: { className?: string }) {
  const { status, busy, subscribe, unsubscribe, iosNeedsInstall, supported } = usePush();
  const base = className ?? "inline-flex items-center gap-1.5 text-primary-foreground/70 text-xs font-semibold hover:text-primary-foreground transition-colors";

  if (status === "loading") return null;
  if (!supported && !iosNeedsInstall) return null; // truly unsupported browser — hide

  if (iosNeedsInstall) {
    return (
      <Link to="/install" className={base}>
        🔔 Install app for alerts
      </Link>
    );
  }

  if (status === "denied") {
    return <span className={base + " opacity-60 cursor-default"}>🔕 Notifications blocked</span>;
  }

  if (status === "granted-subscribed") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => { await unsubscribe(); toast.success("Notifications turned off."); }}
        className={base}
      >
        🔔 Notifications on · turn off
      </button>
    );
  }

  // default — supported, not yet subscribed
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        const r = await subscribe();
        if (r === "granted-subscribed") toast.success("Notifications enabled.");
        else if (r === "denied") toast.error("Notifications are blocked in your browser settings.");
      }}
      className={base}
    >
      🔔 Enable notifications
    </button>
  );
}
