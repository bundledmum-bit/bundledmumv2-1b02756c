import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const trackHL = (action: string, extra?: Record<string, unknown>) => {
  try { trackEvent("hospital_list_interaction", { action, page_url: "/hospital-list", ...extra }); } catch { /* ignore */ }
};

// Session flags shared with the page: only ever show once, and never after the
// customer has actually used the WhatsApp action (the page sets WA_USED on its
// existing WhatsApp link too).
export const HL_EXIT_SHOWN_KEY = "bm-hl-exit-shown";
export const HL_WA_USED_KEY = "bm-hl-wa-used";

function alreadyDone(): boolean {
  try {
    return sessionStorage.getItem(HL_EXIT_SHOWN_KEY) === "1" || sessionStorage.getItem(HL_WA_USED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Exit-intent popup for /hospital-list. Detects "about to leave without
 * converting" (desktop: cursor exits the top edge; mobile: fast upward scroll
 * near the top, or an inactivity fallback) and invites the customer to finish
 * on WhatsApp. getWhatsAppHref is read at click time so it captures the latest
 * cart selection. Shows at most once per session.
 */
export default function HospitalListExitPopup({
  enabled,
  getWhatsAppHref,
}: {
  enabled: boolean;
  getWhatsAppHref: () => string;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggeredRef = useRef(false);

  // ── Exit-intent listeners ───────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || alreadyDone()) return;

    const trigger = () => {
      if (triggeredRef.current || alreadyDone()) return;
      triggeredRef.current = true;
      try { sessionStorage.setItem(HL_EXIT_SHOWN_KEY, "1"); } catch { /* ignore */ }
      trackHL("exit_popup_shown");
      setOpen(true);
    };

    // Desktop: cursor leaves the document via the top edge.
    const onMouseOut = (e: MouseEvent) => {
      if (e.relatedTarget == null && e.clientY <= 0) trigger();
    };

    // Mobile: a fast upward flick near the top of the page (heading back up to
    // the address bar / back gesture).
    let lastY = window.scrollY;
    let lastT = Date.now();
    const onScroll = () => {
      const y = window.scrollY;
      const t = Date.now();
      const dy = lastY - y;          // > 0 ⇒ scrolling up
      const dt = (t - lastT) || 1;
      if (y < 240 && dy > 60 && dy / dt > 0.5) trigger();
      lastY = y;
      lastT = t;
    };

    // Mobile fallback: prolonged inactivity.
    let idle: ReturnType<typeof setTimeout>;
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(trigger, 25_000);
    };
    const activity: Array<keyof WindowEventMap> = ["touchstart", "keydown", "click", "scroll"];

    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    activity.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
    resetIdle();

    return () => {
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
      activity.forEach((ev) => window.removeEventListener(ev, resetIdle));
      clearTimeout(idle);
    };
  }, [enabled]);

  // ── ESC + focus trap while open ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const focusables = () =>
      Array.from(root?.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])') || []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key === "Tab") {
        const els = focusables();
        if (els.length === 0) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!enabled || !open) return null;

  const chat = () => {
    try { sessionStorage.setItem(HL_WA_USED_KEY, "1"); } catch { /* ignore */ }
    trackHL("whatsapp_click", { source: "exit_popup" });
    window.open(getWhatsAppHref(), "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hl-exit-title"
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-sm rounded-2xl border border-border shadow-2xl p-5 pt-6"
        style={{ backgroundColor: "#FFF8F4" }}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute top-3 right-3 p-1.5 rounded-full text-text-med hover:bg-black/5"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: "#2D6A4F" }}>
          <MessageCircle className="w-6 h-6 text-white" />
        </div>
        <h2 id="hl-exit-title" className="text-lg font-bold text-center text-forest leading-snug">
          Leaving so soon?
        </h2>
        <p className="text-sm text-center text-text-med mt-1.5 leading-relaxed">
          Chat with us on WhatsApp and we'll help you complete your order in minutes — we'll bring your selected items along.
        </p>

        <button
          onClick={chat}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-pill text-white font-semibold text-sm h-12"
          style={{ backgroundColor: "#25D366" }}
        >
          <MessageCircle className="w-5 h-5" /> Chat on WhatsApp
        </button>
        <button
          onClick={() => setOpen(false)}
          className="mt-2 w-full text-center text-sm font-semibold text-text-med py-2 hover:text-foreground"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
