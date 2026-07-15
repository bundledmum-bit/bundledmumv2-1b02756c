import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Announcements engine.
 *
 * Reads the `announcements` table and renders, for the current route + audience:
 *   - "bar"    slim dismissible fixed top strips, stacked below the legacy
 *              site-settings AnnouncementBar
 *   - "banner" larger fixed banner blocks (title + message + optional image + CTA)
 *   - "popup"  a single modal/toast honoring popup_position, delay, frequency,
 *              exit-intent, and an OPTIONAL self-hosted image
 *
 * The legacy AnnouncementBar (driven by site_settings) is a separate feature and
 * is not touched here; this engine stacks beneath it via `topOffset`.
 */

export const BAR_HEIGHT = 40;
export const BANNER_HEIGHT = 76;

type PopupPosition =
  | "center" | "top" | "bottom"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface AnnouncementRow {
  id: string;
  title: string | null;
  message: string | null;
  display_type: "bar" | "popup" | "banner" | string;
  image_url: string | null;
  popup_position: PopupPosition | string | null;
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
  excluded_pages: string[] | null;
  target_audience: "all" | "new_visitor" | "returning_visitor" | "returning" | "cart_not_empty" | string | null;
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
  if (aud === "new_visitor" || aud === "new") {
    return !localStorage.getItem("bm-has-ordered") && !localStorage.getItem("bm-returning-visitor");
  }
  if (aud === "returning_visitor" || aud === "returning") {
    return !!localStorage.getItem("bm-has-ordered") || !!localStorage.getItem("bm-returning-visitor");
  }
  // Unknown audience → treat as "all"
  return true;
}

// Shared path matcher: true if `pathname` matches any entry in `pages`
// (exact match, or trailing-slash prefix like "/products/" matching
// "/products/foo"). Empty list matches nothing.
function pathInList(pages: string[] | null | undefined, pathname: string): boolean {
  if (!pages || pages.length === 0) return false;
  return pages.some(p => {
    if (!p) return false;
    if (p === pathname) return true;
    if (p.endsWith("/") && pathname.startsWith(p)) return true;
    return false;
  });
}

function matchesPage(a: AnnouncementRow, pathname: string): boolean {
  const target = a.target_pages || [];
  // INCLUDE: empty target = all pages, otherwise the path must be listed.
  const included = target.length === 0 || pathInList(target, pathname);
  // EXCLUDE always wins: if the path is excluded, never show, even when included.
  const excluded = pathInList(a.excluded_pages, pathname);
  return included && !excluded;
}

function heightFor(a: AnnouncementRow): number {
  return a.display_type === "banner" ? BANNER_HEIGHT : BAR_HEIGHT;
}

// ─── Visitor flag (new vs returning) ─────────────────────────────────────────

function ensureVisitorFlag() {
  try {
    if (!localStorage.getItem("bm-returning-visitor")) {
      // First ever visit: mark so subsequent visits count as returning.
      localStorage.setItem("bm-first-seen", new Date().toISOString());
      localStorage.setItem("bm-returning-visitor", "pending");
    } else if (localStorage.getItem("bm-returning-visitor") === "pending") {
      localStorage.setItem("bm-returning-visitor", "1");
    }
  } catch { /* ignore */ }
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
  if (freq === "once_ever") return localStorage.getItem(key) === "permanent";
  if (freq === "once_per_session") return sessionStorage.getItem(key) === "session";
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
 * Total height of all currently-visible engine bars + banners for the current
 * route, so App.tsx can sum it with the legacy AnnouncementBar height to set
 * Navbar's topOffset correctly.
 */
export function useAnnouncementEngineBarHeight(): number {
  const { data } = useActiveAnnouncementsRaw();
  const location = useLocation();
  const [dismissedTick, setDismissedTick] = useState(0);

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
    const strips = data.filter(a =>
      (a.display_type === "bar" || a.display_type === "banner") &&
      matchesAudience(a) &&
      matchesPage(a, location.pathname) &&
      sessionStorage.getItem(barDismissKey(a.id)) !== "1"
    );
    return strips.reduce((sum, a) => sum + heightFor(a), 0);
    // include dismissedTick so recomputes after dismiss
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, location.pathname, dismissedTick]);
}

// ─── CTA link (internal route vs external URL) ───────────────────────────────

function isInternal(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

function CtaButton({
  href,
  label,
  bg,
  fg,
  onNavigate,
}: {
  href: string;
  label: string;
  bg: string;
  fg: string;
  onNavigate?: () => void;
}) {
  const cls =
    "block w-full text-center px-4 py-2.5 rounded-lg font-semibold text-sm min-h-11 transition-opacity hover:opacity-90";
  const style = { backgroundColor: fg, color: bg };
  if (isInternal(href)) {
    return (
      <Link to={href} onClick={onNavigate} className={cls} style={style}>
        {label}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={cls} style={style}>
      {label}
    </a>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  /** px from the top where the first engine strip should stack (legacy bar height) */
  topOffset?: number;
}

const POS_WRAP: Record<string, string> = {
  center: "items-center justify-center",
  top: "items-start justify-center pt-4",
  bottom: "items-end justify-center pb-4",
  "top-left": "items-start justify-start p-3 sm:p-4",
  "top-right": "items-start justify-end p-3 sm:p-4",
  "bottom-left": "items-end justify-start p-3 sm:p-4",
  "bottom-right": "items-end justify-end p-3 sm:p-4",
};

export default function AnnouncementEngine({ topOffset = 0 }: Props) {
  const { data } = useActiveAnnouncementsRaw();
  const location = useLocation();

  useEffect(() => { ensureVisitorFlag(); }, []);

  // Re-render trigger for dismissals (sessionStorage changes don't auto-notify)
  const [, forceRerender] = useState(0);

  const dismissStrip = (id: string) => {
    sessionStorage.setItem(barDismissKey(id), "1");
    window.dispatchEvent(new Event("bm-announcement-dismissed"));
    forceRerender(t => t + 1);
  };

  // Split matches by type, preserving priority/display_order from the query.
  const { strips, popups } = useMemo(() => {
    const strips: AnnouncementRow[] = [];
    const popups: AnnouncementRow[] = [];
    if (!data) return { strips, popups };
    for (const a of data) {
      if (!matchesAudience(a)) continue;
      if (!matchesPage(a, location.pathname)) continue;
      if (a.display_type === "bar" || a.display_type === "banner") {
        if (sessionStorage.getItem(barDismissKey(a.id)) === "1") continue;
        strips.push(a);
      } else if (a.display_type === "popup") {
        popups.push(a);
      }
    }
    return { strips, popups };
  }, [data, location.pathname]);

  // Popup state: the single highest-priority popup currently shown (never stack).
  const [visiblePopupId, setVisiblePopupId] = useState<string | null>(null);

  useEffect(() => {
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
      exitHandler = (e: MouseEvent) => { if (e.clientY <= 0) show(); };
      document.addEventListener("mouseleave", exitHandler);
      if (delayMs > 0) timeoutId = window.setTimeout(show, delayMs);
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

  // Cumulative top position for stacked strips.
  let stackTop = topOffset;

  return (
    <>
      {/* Stacked bars + banners, fixed-top, beneath the legacy AnnouncementBar */}
      {strips.map((a) => {
        const bg = a.bg_color || "#2D6A4F";
        const fg = a.text_color || "#FFFFFF";
        const h = heightFor(a);
        const top = stackTop;
        stackTop += h;
        const isBanner = a.display_type === "banner";

        return (
          <div
            key={a.id}
            className="fixed left-0 right-0 z-[1000] transition-all duration-300"
            style={{ top, backgroundColor: bg, color: fg, height: h }}
            role="region"
            aria-label={a.title || "Announcement"}
          >
            {isBanner ? (
              <div className="h-full max-w-[1280px] mx-auto px-4 md:px-8 flex items-center gap-3">
                {a.image_url && (
                  <img src={a.image_url} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0 hidden sm:block" />
                )}
                <div className="min-w-0 flex-1">
                  {a.title && <div className="text-sm font-bold leading-tight truncate">{a.emoji ? `${a.emoji} ` : ""}{a.title}</div>}
                  {a.message && <div className="text-[13px] leading-tight opacity-90 truncate">{a.message}</div>}
                </div>
                {(a.link_url || a.link_text) && a.link_url && (
                  <div className="shrink-0 hidden sm:block max-w-[180px]">
                    <CtaButton href={a.link_url} label={a.link_text || "Learn more"} bg={bg} fg={fg} />
                  </div>
                )}
                <button
                  onClick={() => dismissStrip(a.id)}
                  className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full hover:opacity-70 transition-opacity"
                  aria-label="Dismiss announcement"
                >
                  <X size={16} style={{ color: fg }} />
                </button>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center px-10 md:px-12">
                {a.link_url ? (
                  isInternal(a.link_url) ? (
                    <Link to={a.link_url} className="text-[13px] font-medium font-body hover:underline truncate" style={{ color: fg }}>
                      {a.emoji ? `${a.emoji} ` : ""}{a.message || a.title}
                      {a.link_text ? <span className="ml-2 underline font-semibold">{a.link_text}</span> : null}
                    </Link>
                  ) : (
                    <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium font-body hover:underline truncate" style={{ color: fg }}>
                      {a.emoji ? `${a.emoji} ` : ""}{a.message || a.title}
                      {a.link_text ? <span className="ml-2 underline font-semibold">{a.link_text}</span> : null}
                    </a>
                  )
                ) : (
                  <span className="text-[13px] font-medium font-body truncate">
                    {a.emoji ? `${a.emoji} ` : ""}{a.message || a.title}
                  </span>
                )}
                <button
                  onClick={() => dismissStrip(a.id)}
                  className="absolute right-2 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full hover:opacity-70 transition-opacity"
                  aria-label="Dismiss announcement"
                >
                  <X size={14} style={{ color: fg }} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Popup */}
      {activePopup && (() => {
        const pos = (activePopup.popup_position as PopupPosition) || "center";
        const isCenter = pos === "center";
        const bg = activePopup.bg_color || "#FFFFFF";
        const fg = activePopup.text_color || "#111827";
        const hasImage = !!activePopup.image_url;

        return (
          <div
            className={`fixed inset-0 z-[1100] flex ${POS_WRAP[pos] || POS_WRAP.center} ${
              isCenter ? "bg-black/50 p-4 max-md:items-end max-md:p-0" : "pointer-events-none"
            }`}
            onClick={isCenter ? closePopup : undefined}
            role="dialog"
            aria-modal={isCenter ? "true" : undefined}
            aria-label={activePopup.title || "Announcement"}
          >
            <div
              className={`relative overflow-hidden shadow-2xl w-full max-w-sm ${
                isCenter
                  ? "rounded-2xl max-md:max-w-full max-md:rounded-b-none max-md:rounded-t-2xl"
                  : "rounded-2xl max-w-[340px] w-[calc(100vw-1.5rem)] pointer-events-auto"
              }`}
              style={{ backgroundColor: bg, color: fg }}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={closePopup}
                className="absolute top-2.5 right-2.5 z-10 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full bg-black/15 hover:bg-black/25 transition-colors"
                aria-label="Close"
                style={{ color: fg }}
              >
                <X size={18} />
              </button>

              {/* Optional image (only when present) */}
              {hasImage && (
                <img
                  src={activePopup.image_url as string}
                  alt=""
                  className="w-full h-40 sm:h-44 object-cover"
                />
              )}

              {/* Text-first content: complete and premium with or without an image */}
              <div className={`text-center ${hasImage ? "p-6" : "p-7 pt-9"}`}>
                {activePopup.emoji && <div className="text-4xl mb-3">{activePopup.emoji}</div>}
                {activePopup.title && <h2 className="pf text-xl font-bold mb-2 leading-tight">{activePopup.title}</h2>}
                {activePopup.message && (
                  <p className="text-sm leading-relaxed mb-4 opacity-90">{activePopup.message}</p>
                )}
                {activePopup.linked_coupon_code && (
                  <div className="mb-4">
                    <span
                      className="inline-block px-4 py-2 rounded-lg border-2 border-dashed font-mono font-bold text-sm tracking-wider"
                      style={{ borderColor: fg }}
                    >
                      {activePopup.linked_coupon_code}
                    </span>
                  </div>
                )}
                {activePopup.link_url && (
                  <CtaButton
                    href={activePopup.link_url}
                    label={activePopup.link_text || "Learn more"}
                    bg={bg}
                    fg={fg}
                    onNavigate={closePopup}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
