import { useEffect } from "react";
import { analytics } from "@/lib/ga";

/**
 * Sitewide GA4 instrumentation for WhatsApp CTA clicks.
 *
 * Uses event delegation on document so every WhatsApp link/button — no
 * matter which page or component it lives in — is tracked without
 * having to edit each call site. Tracks any anchor whose href points
 * at wa.me or api.whatsapp.com.
 *
 *   click_location is derived from window.location.pathname so we know
 *     where on the site the click happened (homepage, cart, product page,
 *     order confirmation, etc.).
 *   click_type is inferred from the WhatsApp ?text= payload — common
 *     enquiries (order status, support, general) map to canonical types.
 *
 * Wrapped in try/catch; tracking failures never block the link navigation.
 */
export default function WhatsAppClickListener() {
  useEffect(() => {
    const deriveLocation = (path: string): string => {
      if (path === "/" || path === "") return "homepage";
      if (path.startsWith("/cart")) return "cart";
      if (path.startsWith("/checkout")) return "checkout";
      if (path.startsWith("/order-confirmed") || path.startsWith("/payment-received")) return "order_confirmation";
      if (path.startsWith("/track-order")) return "track_order";
      if (path.startsWith("/products/") || path.startsWith("/p/")) return "product_page";
      if (path.startsWith("/shop")) return "shop";
      if (path.startsWith("/bundles")) return "bundles";
      if (path.startsWith("/quiz")) return "quiz";
      if (path.startsWith("/account/referral")) return "referral_page";
      if (path.startsWith("/account")) return "account";
      if (path.startsWith("/contact")) return "contact";
      if (path.startsWith("/returns")) return "returns";
      if (path.startsWith("/subscribe") || path.startsWith("/subscriptions")) return "subscriptions";
      return path.replace(/^\//, "").replace(/\//g, "_") || "other";
    };

    const deriveType = (href: string): string => {
      const lower = href.toLowerCase();
      if (/order[_\s\-+]?status|track[_\s\-+]?order|where[_\s\-+]?is/.test(lower)) return "order_status";
      if (/return|refund/.test(lower)) return "returns";
      if (/checkout|payment|delivery[_\s\-+]?fee/.test(lower)) return "checkout_help";
      if (/referral|invite/.test(lower)) return "referral_share";
      if (/support|help/.test(lower)) return "order_support";
      return "general_enquiry";
    };

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!/^https?:\/\/(wa\.me|api\.whatsapp\.com)/i.test(href)) return;
      try {
        analytics.push({
          event: "whatsapp_click",
          click_location: deriveLocation(window.location.pathname || ""),
          click_type: deriveType(href),
        });
      } catch { /* ignore */ }
    };

    document.addEventListener("click", handler, { capture: true });
    return () => document.removeEventListener("click", handler, { capture: true } as any);
  }, []);

  return null;
}
