import { getSessionId } from "@/lib/analytics";

/**
 * Records a click on one of the three cross-app banners.
 *
 * WHY THIS EXISTS ALONGSIDE THE UTM TAGS. They answer different questions and
 * both are needed. A utm tag can only attribute a visit that ARRIVED; it says
 * nothing about a click that was made. Without this there is no click-through
 * rate, no comparison between the three banners, and no way to tell whether the
 * quiz advert works better on a cot listing than on school shoes.
 *
 * KEEPALIVE IS THE WHOLE TRICK, and it is why this does not go through
 * supabase-js. Every one of these clicks is immediately followed by a full-page
 * navigation, and a normal fetch is cancelled when the page it belongs to goes
 * away — so the obvious "fire and forget, then navigate" loses the very events
 * it exists to count, silently and unevenly (fast connections would record,
 * slow ones would not, which is worse than recording nothing because it looks
 * like data). `keepalive: true` tells the browser to finish the request even
 * after the document is torn down. It is the same guarantee sendBeacon gives,
 * without giving up the ability to send the apikey header.
 *
 * NOTHING IS AWAITED AND NOTHING CAN THROW OUT OF HERE. The promise is caught
 * and dropped, so a tracking failure cannot delay or prevent a navigation the
 * buyer asked for. The server function swallows its own errors too, so a bad
 * insert can never surface as a failed request either.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://rbtyprmkolqfylcbmgrk.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export type PromoBanner = "quiz" | "storefront_crosssell" | "marketplace_crosssell";

export function recordPromoClick(
  banner: PromoBanner,
  /** Where they clicked FROM: the marketplace category slug, or the storefront
   * subcategory. This is the point of the whole thing — it is what says which
   * pages send people across and which do not. */
  fromContext: string,
  /** The resolved destination, exactly as navigated to, tags and all, so the
   * log matches where the buyer actually went. */
  destination: string,
): void {
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/record_promo_click`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        p_banner: banner,
        p_from_context: fromContext || "",
        p_destination: destination || "",
        p_session_id: getSessionId(),
      }),
    }).catch(() => { /* tracking must never break a navigation */ });
  } catch {
    /* sessionStorage unavailable, or fetch missing — never worth a broken click */
  }
}
