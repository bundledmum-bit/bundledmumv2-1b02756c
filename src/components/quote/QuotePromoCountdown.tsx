import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * Free-items promo countdown for the public quote page.
 *
 * Counts down to `expiresAt` (already fetched with the quote — this component
 * never re-fetches). A single setInterval ticks local state once a second, so
 * only this small component re-renders, not the whole page. At zero it stops
 * and shows an ended state rather than a negative timer; the server re-validates
 * the price at payment time, so nothing here keeps "charging" past expiry.
 */
function remainingSeconds(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 ? Math.floor(ms / 1000) : 0;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export default function QuotePromoCountdown({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() => remainingSeconds(expiresAt));

  useEffect(() => {
    // Re-seed if the expiry changes, then tick every second and stop at zero.
    setSecs(remainingSeconds(expiresAt));
    const id = window.setInterval(() => {
      const next = remainingSeconds(expiresAt);
      setSecs(next);
      if (next <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const ended = secs <= 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  if (ended) {
    return (
      <div className="bg-muted border border-border rounded-xl px-4 py-3 mb-4 text-center">
        <p className="text-sm font-semibold text-text-med">This offer has ended</p>
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 mb-4 flex items-center justify-center gap-2.5 text-center">
      <Clock className="w-4 h-4 text-red-700 flex-shrink-0" />
      <p className="text-sm text-red-900">
        <span className="font-semibold">Free items offer ends in</span>{" "}
        <span className="font-mono font-bold tabular-nums text-red-700">
          {pad(h)}:{pad(m)}:{pad(s)}
        </span>
      </p>
    </div>
  );
}
