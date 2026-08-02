import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Central scroll behaviour for the whole marketplace tree, rendered once inside
 * the router so no screen needs its own scroll code.
 *
 * Forward navigation (PUSH / REPLACE) opens the new route at the top, which fixes
 * pages inheriting the previous page's scroll (open an item from mid-grid and you
 * would otherwise land mid-detail). Browser BACK / FORWARD (POP) instead RESTORES
 * the scroll position the buyer had on that entry, so returning from an item to
 * the browse grid keeps their place, the thing that matters most on mobile.
 *
 * How back/forward is detected: react-router v6 useNavigationType() returns "POP"
 * for history pops (back/forward) and "PUSH"/"REPLACE" for new navigations. This
 * repo uses a non-data <BrowserRouter>, so the data-router <ScrollRestoration> is
 * not available and this custom manager is used instead.
 *
 * Restoration is manual because main.tsx sets history.scrollRestoration="manual"
 * globally (so the browser never auto-restores): we record window.scrollY per
 * history entry (location.key) and put it back on POP. The window is the scroller
 * (the .mkt wrapper is a normal min-height:100vh block), so window.scrollTo is the
 * right target and sticky bars are unaffected.
 */
export default function MarketplaceScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  const positions = useRef<Map<string, number>>(new Map());
  const prevPathKey = useRef<string>(location.pathname + location.search);

  // Continuously record the scroll position for the CURRENT history entry, so a
  // later POP back to it can be restored. Keyed by location.key (unique per entry).
  useEffect(() => {
    const key = location.key;
    const onScroll = () => { positions.current.set(key, window.scrollY); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.key]);

  useLayoutEffect(() => {
    const pathKey = location.pathname + location.search;
    const hashOnly = pathKey === prevPathKey.current && !!location.hash;
    prevPathKey.current = pathKey;

    if (navType === "POP") {
      // Back / forward: restore the saved position for this entry (top if none).
      const y = positions.current.get(location.key) ?? 0;
      window.scrollTo(0, y);
      // Re-apply after paint, in case cached content lays out just after commit
      // and the first scroll clamped to a shorter height.
      const raf = requestAnimationFrame(() => {
        window.scrollTo(0, positions.current.get(location.key) ?? y);
      });
      return () => cancelAnimationFrame(raf);
    }

    // New forward navigation: open at the top, unless it is only a hash change
    // (leave in-page anchor jumps alone).
    if (!hashOnly) window.scrollTo(0, 0);
  }, [location.key, navType, location.pathname, location.search, location.hash]);

  return null;
}
