import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The gift "moments" the shopper picks between — where the mum is right now.
 * Read straight from gift_moments so adding a row in the database makes a new
 * moment appear on the storefront with no code change. Nothing here is
 * hardcoded, including the order.
 */
export interface GiftMoment {
  key: string;
  label: string;
  description: string | null;
  timing_hint: string | null;
  emoji: string | null;
  display_order: number | null;
}

export function useGiftMoments() {
  return useQuery({
    queryKey: ["gift_moments"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gift_moments")
        .select("key, label, description, timing_hint, emoji, display_order")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data || []) as GiftMoment[];
    },
  });
}
