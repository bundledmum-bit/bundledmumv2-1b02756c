import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Phase 2 Announcements Engine.
 *
 * Reads from the `announcements` table and renders:
 *   - "bar" announcements as fixed top bars stacked BELOW the legacy AnnouncementBar
 *   - "popup" announcements as modal dialogs (with delay, frequency, exit-intent)
 *   - "banner" announcements as inline-ish bars (rendered alongside bars)
 *
 * Does not modify or replace AnnouncementBar.
 */

export const BAR_HEIGHT = 40;

export interface AnnouncementRow {
  id: string;
  title: string | null;
  message: string | null;
  display_type: "bar" | "popup" | "banner" | string;
  bg_color: string | null;
  text_color: string | null;
  emoji: string | null;
  link_url: string | null;
  link_text: string | null;
  is_active: boolean;
  priority: number | null;
  starts_at: string | null;
  ends_at: string | null;
  target_pages: string[] | null;
  target_audience: "all" | "new_visitor" | "returning_visitor" | "cart_not_empty" | string | null;
  popup_delay_seconds: number | null;
  popup_frequency: "every_visit" | "once_per_session" | "once_ever" | string | null;
  show_on_exit_intent: boolean | null;
  linked_product_id: string | null;
  linked_coupon_code: string | null;
  display_order: number | null;
}

// ─── Data ────────────────────────────────────────────────────────────────────

function useActiveAnnouncementsRaw() {
  return useQuery<AnnouncementRow[]>({
    queryKey: ["announcements", "active"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("announcements")
        .select("*")
        .eq("is_active", true)
        .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
        .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
        .order("priority", { ascending: false })
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as AnnouncementRow[];
    },
    staleTime: 60 * 1000,
  });
}

// ─── Audience / page matching ────────────────────────────────────────────────

function matchesAudience(a: AnnouncementRow): boolean {
  const aud = a.target_audience || "all";
  if (aud === "all") return true;
  if (aud === "cart_not_empty") {
    try {
      const raw = localStorage.getItem("bm-cart");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) && arr.length > 0;
    } catch {
      return false;
    }
  }
  if (aud === "new_visitor") {
    return !localStorage.getItem("bm-has-ordered");
  }
  if (aud === "returning_visitor") {
    return !!localStorage.getItem("bm-has-ordered");
  }
  return true;
}

function matchesPage(a: AnnouncementRow, pathname: string): boolean {
  const pages = a.target_pages || [];
  if (!pages || pages.length === 0) return true;
  return pages.some(p => {
    if (!p) return false;
    if (p === pathname) return true;
    // Allow simple prefix match like "/products" matching "/products/foo"
    if (p.endsWith("/") && pathname.startsWith(p)) return true;
    if (pathname === p) return true;
    return false;
  });
}

// ─── Dismissal state ─────────────────────────────────────────────────────────

function barDismissKey(id: string) {
  return `bm-announcement-${id}-dismissed`;
}

function popupShownKey(id: string) {
  return `bm-announcement-${id}-shown`;
}

function popupAlreadyShown(a: AnnouncementRow): boolean {
  const freq = a.popup_frequency || "every_visit";
  if (freq === "every_visit") return false;
  const key = popupShownKey(a.id);
  if (freq === "once_ever") {
    return localStorage.getItem(key) === "permanent";
  }
  if (freq === "once_per_session") {
    return sessionStorage.getItem(key) === "session";
  }
  return false;
}

function markPopupShown(a: AnnouncementRow) {
  const freq = a.popup_frequency || "every_visit";
  const key = popupShownKey(a.id);
  if (freq === "once_ever") localStorage.setItem(key, "permanent");
  else if (freq === "once_per_session") sessionStorage.setItem(key, "session");
}

// ─── Public hook for App.tsx topOffset math ──────────────────────────────────

/**
 * Returns the total height of all currently-visible engine bars for the
 * current route, so App.tsx can sum it with the legacy AnnouncementBar height
 * to set Navbar's topOffset correctly.
 */
export function useAnnouncementEngineBarHeight(): number {
  const { data } = useActiveAnnouncementsRaw();
  const location = useLocation();
  const [dismissedTick, setDismissedTick] = useState(0);

  // Re-check when any dismissal key changes in storage (other tab) or locally
  useEffect(() => {
    const h = (e: StorageEvent) => {
      if (e.key && e.key.startsWith("bm-announcement-") && e.key.endsWith("-dismissed")) {
        setDismissedTick(t => t + 1);
      }
    };
    window.addEventListener("storage", h);
    const localH = () => setDismissedTick(t => t + 1);
    window.addEventListener("bm-announcement-dismissed", localH);
    return () => {
      window.removeEventListener("storage", h);
      window.removeEventListener("bm-announcement-dismissed", localH);
    };
  }, []);

  return useMemo(() => {
    if (!data) return 0;
    const bars = data.filter(a =>
      (a.display_type === "bar" || a.display_type === "banner") &&
      matchesAudience(a) &&
      matchesPage(a, location.pathname) &&
      sessionStorage.getItem(barDismissKey(a.id)) !== "1"
    );
    return bars.length * BAR_HEIGHT;
    // include dismissedTick so recomputes after dismiss
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, location.pathname, dismissedTick]);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  /** px from the top where the first engine bar should stack (legacy bar height) */
  topOffset?: number;
}

export default function AnnouncementEngine({ topOffset = 0 }: Props) {
  const { data } = useActiveAnnouncementsRaw();
  const location = useLocation();

  // Re-render trigger for dismissals (sessionStorage changes don't auto-notify)
  const [, forceRerender] = useState(0);

  const dismissBar = (id: string) => {
    sessionStorage.setItem(barDismissKey(id), "1");
    window.dispatchEvent(new Event("bm-announcement-dismissed"));
    forceRerender(t => t + 1);
  };

  // Split
  const { bars, popups } = useMemo(() => {
    const bars: AnnouncementRow[] = [];
    const popups: AnnouncementRow[] = [];
    if (!data) return { bars, popups };
    for (const a of data) {
      if (!matchesAudience(a)) continue;
      if (!matchesPage(a, location.pathname)) continue;
      if (a.display_type === "bar" || a.display_type === "banner") {
        if (sessionStorage.getItem(barDismissKey(a.id)) === "1") continue;
        bars.push(a);
      } else if (a.display_type === "popup") {
        popups.push(a);
      }
    }
    return { bars, popups };
  }, [data, location.pathname]);

  // Popup state: the single popup currently shown (one at a time, by priority order)
  const [visiblePopupId, setVisiblePopupId] = useState<string | null>(null);

  useEffect(() => {
    // Pick the first eligible popup not already shown under its frequency rule
    const candidate = popups.find(p => !popupAlreadyShown(p));
    if (!candidate) return;

    const delayMs = Math.max(0, (candidate.popup_delay_seconds ?? 0) * 1000);
    let timeoutId: number | undefined;
    let exitHandler: ((e: MouseEvent) => void) | undefined;
    let shown = false;

    const show = () => {
      if (shown) return;
      shown = true;
      setVisiblePopupId(candidate.id);
      markPopupShown(candidate);
    };

    if (candidate.show_on_exit_intent) {
      exitHandler = (e: MouseEvent) => {
        // Fires when pointer exits viewport from the top
        if (e.clientY <= 0) show();
      };
      document.addEventListener("mouseleave", exitHandler);
      // Also schedule delay as a fallback floor if delay > 0
      if (delayMs > 0) {
        timeoutId = window.setTimeout(show, delayMs);
      }
    } else {
      timeoutId = window.setTimeout(show, delayMs);
    }

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (exitHandler) document.removeEventListener("mouseleave", exitHandler);
    };
  }, [popups]);

  const closePopup = () => setVisiblePopupId(null);
  const activePopup = popups.find(p => p.id === visiblePopupId) || null;

  return (
    <>
      {/* Stacked bars, fixed-top, beneath the legacy AnnouncementBar */}
      {bars.map((a, idx) => {
        const top = topOffset + idx * BAR_HEIGHT;
        const bg = a.bg_color || "#1a2e1a";
        const fg = a.text_color || "#ffffff";
        return (
          <div
            key={a.id}
            className="fixed left-0 right-0 z-[1000] flex items-center justify-center px-10 transition-all duration-300"
            style={{ top, backgroundColor: bg, color: fg, height: BAR_HEIGHT }}
            role="region"
            aria-label={a.title || "Announcement"}
          >
            {a.link_url ? (
              <a
                href={a.link_url}
                className="text-[13px] font-medium font-body hover:underline truncate"
                style={{ color: fg }}
              >
                {a.emoji ? `${a.emoji} ` : ""}{a.message || a.title}
                {a.link_text ? <span className="ml-2 underline font-semibold">{a.link_text}</span> : null}
              </a>
            ) : (
              <span className="text-[13px] font-medium font-body truncate">
                {a.emoji ? `${a.emoji} ` : ""}{a.message || a.title}
              </span>
            )}
            <button
              onClick={() => dismissBar(a.id)}
              className="absolute right-3 p-1 rounded-full hover:opacity-70 transition-opacity"
              aria-label="Dismiss announcement"
            >
              <X size={14} style={{ color: fg }} />
            </button>
          </div>
        );
      })}

      {/* Popup modal */}
      {activePopup && (
        <div
          className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/50 max-md:items-end max-md:p-0"
          onClick={closePopup}
          role="dialog"
          aria-modal="true"
          aria-label={activePopup.title || "Announcement"}
        >
          <div
            className="relative max-w-md w-full rounded-xl shadow-2xl p-6 pt-8 max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl"
            style={{
              backgroundColor: activePopup.bg_color || "#ffffff",
              color: activePopup.text_color || "#111827",
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closePopup}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-black/10 transition-colors"
              aria-label="Close"
              style={{ color: activePopup.text_color || "#111827" }}
            >
              <X size={18} />
            </button>

            {activePopup.emoji && (
              <div className="text-4xl mb-3 text-center">{activePopup.emoji}</div>
            )}
            {activePopup.title && (
              <h2 className="pf text-xl font-bold mb-2 text-center">{activePopup.title}</h2>
            )}
            {activePopup.message && (
              <p className="text-sm leading-relaxed mb-4 text-center opacity-90">
                {activePopup.message}
              </p>
            )}
            {activePopup.linked_coupon_code && (
              <div className="mb-4 text-center">
                <div className="inline-block px-4 py-2 rounded-lg border-2 border-dashed font-mono font-bold text-sm tracking-wider"
                  style={{ borderColor: activePopup.text_color || "#111827" }}>
                  {activePopup.linked_coupon_code}
                </div>
              </div>
            )}
            {activePopup.link_url && (
              <a
                href={activePopup.link_url}
                onClick={closePopup}
                className="block w-full text-center px-4 py-2.5 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: activePopup.text_color || "#111827",
                  color: activePopup.bg_color || "#ffffff",
                }}
              >
                {activePopup.link_text || "Learn more"}
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
