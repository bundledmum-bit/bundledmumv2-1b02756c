// Build refresh - 2026-06-16 (force fresh Lovable deploy; billing-interrupted deploy left the live bundle blank)
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { initPwa } from "@/lib/pwa";

// Take control of scroll restoration. With the default ('auto'), the browser
// restores the previous scroll position on back/forward — the customer sees
// a flash of mid-page content before our ScrollToTop component snaps them
// back to the top. Setting 'manual' keeps that responsibility entirely in
// the app so every navigation lands cleanly at the top.
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

// Register the service worker, count standalone PWA sessions, and watch for
// install — all fire-and-forget so nothing blocks first render.
initPwa();
