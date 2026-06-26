import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/analytics";

// Measures time-on-page + max scroll depth and writes them to page_views on
// exit (visibilitychange→hidden / pagehide / unmount). page_views has no UPDATE
// policy for anon (insert-only), so we INSERT a row carrying the metrics — the
// funnel report averages time/scroll over non-null rows and keys rates on
// DISTINCT session_id, so this populates engagement without distorting rates.
// Fully fire-and-forget; never blocks or throws into the UI.
const MAX_SECONDS = 3600; // cap absurd values (backgrounded tabs, etc.)

export function usePageEngagement(pageUrl: string) {
  const startRef = useRef<number>(Date.now());
  const maxScrollRef = useRef<number>(0);
  const wroteRef = useRef<boolean>(false);

  useEffect(() => {
    startRef.current = Date.now();
    wroteRef.current = false;
    maxScrollRef.current = 0;

    const measureScroll = () => {
      try {
        const doc = document.documentElement;
        const viewport = window.innerHeight || doc.clientHeight || 0;
        const full = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
        const scrollTop = window.scrollY || doc.scrollTop || 0;
        const pct = full <= viewport ? 100 : Math.round(((scrollTop + viewport) / full) * 100);
        const clamped = Math.min(100, Math.max(0, pct));
        if (clamped > maxScrollRef.current) maxScrollRef.current = clamped;
      } catch { /* ignore */ }
    };

    // Throttle scroll work to one measurement per animation frame.
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; measureScroll(); });
    };
    measureScroll(); // initial (covers short pages = 100%)
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    const writeExit = () => {
      if (wroteRef.current) return;
      wroteRef.current = true;
      try {
        const seconds = Math.min(MAX_SECONDS, Math.max(0, Math.round((Date.now() - startRef.current) / 1000)));
        const scroll = Math.min(100, Math.max(0, maxScrollRef.current));
        void (supabase as any).from("page_views").insert({
          session_id: getSessionId(),
          page_url: pageUrl,
          page_title: typeof document !== "undefined" ? document.title : null,
          referrer: typeof document !== "undefined" ? (document.referrer || null) : null,
          time_on_page_seconds: seconds,
          scroll_depth_percent: scroll,
        });
      } catch { /* fire-and-forget; never block the UI */ }
    };

    const onVisibility = () => { if (document.visibilityState === "hidden") writeExit(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", writeExit);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", writeExit);
      if (raf) cancelAnimationFrame(raf);
      writeExit(); // SPA navigation away (component unmounts, no pagehide)
    };
  }, [pageUrl]);
}
