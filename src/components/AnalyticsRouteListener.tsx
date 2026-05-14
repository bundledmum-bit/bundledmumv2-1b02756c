import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { analytics } from "@/lib/ga";

export function AnalyticsRouteListener() {
  const location = useLocation();
  useEffect(() => {
    analytics.pageView(location.pathname + location.search, document.title);
  }, [location]);
  return null;
}

export default AnalyticsRouteListener;
