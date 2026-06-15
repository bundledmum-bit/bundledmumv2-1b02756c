import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type QuoteFromShare = {
  id: string;
  quote_number: string;
  customer_name: string | null;
  customer_notes: string | null;
  delivery_state: string | null;
  delivery_city: string | null;
  subtotal: number;
  service_fee: number;
  estimated_delivery_fee: number;
  delivery_fee_override: number | null;
  gift_wrapping: boolean;
  gift_wrap_fee: number;
  discount_amount: number;
  discount_reason: string | null;
  total: number;
  status: "draft" | "sent" | "viewed" | "accepted" | "converted" | "declined" | "expired" | "archived";
  expires_at: string | null;
  is_expired: boolean;
  created_at: string;
};

export type QuoteShareItem = {
  id: string;
  product_id: string | null;
  brand_id: string | null;
  product_name: string;
  brand_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  display_order: number;
  current_image_url: string | null;
  current_in_stock: boolean;
};

export function useQuoteByShareToken(shareToken: string | undefined) {
  return useQuery({
    queryKey: ["quote_share", "header", shareToken],
    queryFn: async () => {
      if (!shareToken) throw new Error("No share token");
      const { data, error } = await (supabase as any).rpc("get_quote_by_share_token", {
        p_share_token: shareToken,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row || undefined) as QuoteFromShare | undefined;
    },
    enabled: !!shareToken,
    staleTime: 30_000,
  });
}

export function useQuoteItemsByShareToken(shareToken: string | undefined) {
  return useQuery({
    queryKey: ["quote_share", "items", shareToken],
    queryFn: async () => {
      if (!shareToken) throw new Error("No share token");
      const { data, error } = await (supabase as any).rpc("get_quote_items_by_share_token", {
        p_share_token: shareToken,
      });
      if (error) throw error;
      return (data || []) as QuoteShareItem[];
    },
    enabled: !!shareToken,
    staleTime: 30_000,
  });
}

/** Fire-and-forget view tracker; never throws. */
export async function recordQuoteView(shareToken: string) {
  try {
    await (supabase as any).rpc("record_quote_view", { p_share_token: shareToken });
  } catch (e) {
    console.warn("record_quote_view failed (non-fatal):", e);
  }
}

/** Fire-and-forget download tracker; never throws. Increments download_count
 * via a SECURITY-DEFINER RPC (mirrors record_quote_view — anon can't update
 * quotes directly). The DB trigger sets last_downloaded_at and flips
 * draft -> viewed. */
export async function recordQuoteDownload(shareToken: string) {
  try {
    const { data, error } = await (supabase as any).rpc("record_quote_download", { p_share_token: shareToken });
    if (error) console.warn("record_quote_download RPC error (non-fatal):", error);
    return { data, error };
  } catch (e) {
    console.warn("record_quote_download threw (non-fatal):", e);
    return { data: null, error: e };
  }
}

/** Called after place-order succeeds when CheckoutPage was opened from a quote. */
export async function linkOrderToQuote(shareToken: string, orderId: string) {
  const { data, error } = await (supabase as any).rpc("link_order_to_quote", {
    p_share_token: shareToken,
    p_order_id: orderId,
  });
  if (error) throw error;
  return data as { success: boolean; quote_id?: string; order_id?: string; error?: string };
}

/** sessionStorage key the QuotePage writes and CheckoutPage reads. */
export const PENDING_QUOTE_TOKEN_KEY = "pending_quote_share_token";
