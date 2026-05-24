/**
 * Backend-backed Share Cart tokens.
 *
 * The legacy ?items=<base64> flow (see `cartShareUrl.ts`) is still supported
 * on the consume side for URLs already in the wild, but new shares go through
 * the `create_shared_cart` / `get_shared_cart` RPCs, which persist the cart
 * payload server-side and hand back a short ~12-char token.
 *
 * Resulting URL: https://bundledmum.com/cart?share=a8f3-9c2e-7b1d  (~55 chars)
 *
 * Payload keys (p/b/s/c/q) are deliberately the same as the legacy base64
 * shape so the consume path can reuse the same downstream hydration logic.
 */

import { supabase } from "@/integrations/supabase/client";

export type SharedCartItem = {
  p: string;          // product_id (UUID)
  b: string | null;   // brand_id (UUID) or null
  s: string | null;   // size
  c: string | null;   // color
  q: number;          // quantity
};

/**
 * Persist the cart on the backend and return a full shareable URL.
 * Throws on RPC failure so callers can toast.
 */
export async function generateSharedCartUrl(items: SharedCartItem[]): Promise<string> {
  if (!items || items.length === 0) {
    throw new Error("Cart is empty");
  }

  const { data: token, error } = await (supabase as any).rpc("create_shared_cart", {
    p_items: items as any,
  });

  if (error || !token) {
    console.error("[sharedCart] create_shared_cart failed:", error);
    throw new Error(error?.message || "Failed to create shared cart");
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://bundledmum.com";
  return `${origin}/cart?share=${token}`;
}

/**
 * Resolve a share token into its stored items. Returns null when the token
 * is expired, unknown, or the RPC fails — callers should surface a friendly
 * "this link has expired" toast in that case.
 */
export async function fetchSharedCart(shareToken: string): Promise<SharedCartItem[] | null> {
  const { data, error } = await (supabase as any).rpc("get_shared_cart", {
    p_share_token: shareToken,
  });

  if (error) {
    console.error("[sharedCart] get_shared_cart failed:", error);
    return null;
  }

  if (!data || !Array.isArray(data)) {
    return null;
  }

  return data as SharedCartItem[];
}
