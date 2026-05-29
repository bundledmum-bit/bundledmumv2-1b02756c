import { supabase } from "@/integrations/supabase/client";

// Single source of truth for the two auto-applied fee rules lives in the
// DB function public.compute_auto_fees(p_items jsonb). The frontend only
// DISPLAYS what it returns — it never recomputes fees client-side.
//
//   RULE A: auto-check gift wrap when the cart has any gift item.
//   RULE B: auto-add a service & packaging fee on large orders
//           (distinct OR total units >= min_items AND subtotal >= min_total).
//
// All money values are naira integers — never divide by 100.

export interface AutoFeeItem {
  product_id: string;
  quantity: number;
  unit_price: number;
}

export interface AutoFeesSettings {
  auto_gift_wrap_enabled: boolean;
  auto_service_fee_enabled: boolean;
  min_items: number;
  min_total: number;
  fee_amount: number;
  gift_wrap_price: number;
}

export interface AutoFeesResult {
  gift_wrap_should_apply: boolean;
  gift_wrap_fee: number;
  service_fee: number;
  distinct_items: number;
  total_units: number;
  subtotal: number;
  has_gift_item: boolean;
  service_fee_rule_triggered: boolean;
  settings: AutoFeesSettings;
}

// Safe fallback so a failed/offline RPC never breaks checkout: no auto
// fees, gift wrap unlocked. The order can still complete — better that
// than blocking the customer entirely.
export const AUTO_FEES_FALLBACK: AutoFeesResult = {
  gift_wrap_should_apply: false,
  gift_wrap_fee: 0,
  service_fee: 0,
  distinct_items: 0,
  total_units: 0,
  subtotal: 0,
  has_gift_item: false,
  service_fee_rule_triggered: false,
  settings: {
    auto_gift_wrap_enabled: false,
    auto_service_fee_enabled: false,
    min_items: 0,
    min_total: 0,
    fee_amount: 0,
    gift_wrap_price: 0,
  },
};

export async function computeAutoFees(items: AutoFeeItem[]): Promise<AutoFeesResult> {
  try {
    const { data, error } = await (supabase as any).rpc("compute_auto_fees", { p_items: items });
    if (error) throw error;
    if (!data) return AUTO_FEES_FALLBACK;
    // Merge over the fallback so a partial payload never yields undefined.
    return { ...AUTO_FEES_FALLBACK, ...(data as AutoFeesResult), settings: { ...AUTO_FEES_FALLBACK.settings, ...((data as any).settings || {}) } };
  } catch (e) {
    console.warn("[computeAutoFees] RPC failed — falling back to no auto-fees", e);
    return AUTO_FEES_FALLBACK;
  }
}
