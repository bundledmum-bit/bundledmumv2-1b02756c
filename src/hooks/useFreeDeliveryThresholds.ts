import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FreeDeliveryThreshold = {
  id: string;
  name: string;
  threshold_amount: number;
  scope: "lagos" | "nationwide" | "specific_states";
  applicable_states: string[] | null;
  customer_pays_fee: number;
  delivery_label: string;
  helper_text: string | null;
  marketing_copy: string | null;
  progress_template: string;
  banner_display_threshold_pct: number;
  is_active: boolean;
  display_order: number;
};

/**
 * Pulls the live, active free-delivery rules. Shared by the storefront
 * checkout + cart pages. Admin CRUD lives at /admin/promotions; this
 * hook ignores inactive rows so toggling one off in admin removes it
 * from customer flows on next refetch.
 */
export function useFreeDeliveryThresholds() {
  return useQuery({
    queryKey: ["free_delivery_thresholds"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("free_delivery_thresholds")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as FreeDeliveryThreshold[];
    },
    staleTime: 60_000,
  });
}

/**
 * Pick the nearest threshold the customer can still earn by spending
 * more. Filters by scope first (Lagos rules only apply when the
 * delivery state is Lagos; specific_states rules only when the state
 * is in their allowlist; nationwide always applies), then returns the
 * smallest unmet threshold so the nudge always shows the closest goal.
 */
export function findNextThreshold(
  thresholds: FreeDeliveryThreshold[] | undefined,
  cartSubtotal: number,
  deliveryState: string | null,
): FreeDeliveryThreshold | null {
  if (!thresholds || cartSubtotal <= 0) return null;

  const eligibleByState = thresholds.filter((t) => {
    if (t.scope === "lagos") return deliveryState === "Lagos";
    if (t.scope === "nationwide") return true;
    if (t.scope === "specific_states") {
      return !!deliveryState && (t.applicable_states || []).includes(deliveryState);
    }
    return false;
  });

  const notYetCrossed = eligibleByState
    .filter((t) => cartSubtotal < t.threshold_amount)
    .sort((a, b) => a.threshold_amount - b.threshold_amount);

  return notYetCrossed[0] || null;
}
