import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { initPixel, track } from "@/lib/metaPixel";

/**
 * Initialises the given pixel once, then fires a PageView on every route
 * change. index.html no longer inits any pixel itself — the storefront and
 * marketplace are separate Meta pixels by design, and which one this app
 * targets is only known once React has resolved which tree is rendering, so
 * each tree mounts its own instance of this with its own pixel ID (see
 * StorefrontApp.tsx and MarketplaceApp.tsx). Without this listener, client
 * side SPA navigation would silently skip every PageView after the first.
 */
export default function PixelRouteListener({ pixelId }: { pixelId: string }) {
  const { pathname, search } = useLocation();
  const initedRef = useRef(false);

  useEffect(() => {
    if (!initedRef.current) {
      initedRef.current = true;
      initPixel(pixelId);
    }
    track("PageView");
  }, [pixelId, pathname, search]);

  return null;
}
