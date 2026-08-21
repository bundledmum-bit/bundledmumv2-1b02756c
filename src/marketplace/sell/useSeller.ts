import { useCallback, useEffect, useState } from "react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { sdb } from "./sellData";

export interface SellerRow {
  id: string;
  customer_id: string;
  display_name: string | null;
  /** Private, never public. Distinct from display_name (which the DB truncates
   * the surname of, e.g. "Amaka O."). Must genuinely match bank_account_name,
   * enforced by a database trigger, so the seller's payouts can be trusted to
   * be genuinely theirs. */
  legal_first_name: string | null;
  legal_last_name: string | null;
  phone: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_account_verified: boolean | null;
  verification_tier: string | null;
  status: string | null;
  strike_count: number | null;
  outstanding_debit_naira: number | null;
  /** Where this seller is willing to sell, and how a buyer in their own
   * state receives the item. Both null until they answer the two delivery
   * questions — null is genuinely "not answered", never a default, and
   * nothing may imply they ship on the strength of it. */
  sells_nationwide: boolean | null;
  local_handover: "ships" | "collection" | "both" | null;
}

/** True once the seller has answered both delivery questions. The single
 * check both the first-listing form and the one-time prompt gate on, so
 * "ask once, never again" is one rule in one place. */
export function hasDeliveryPrefs(seller: Pick<SellerRow, "sells_nationwide" | "local_handover"> | null): boolean {
  return !!seller && seller.sells_nationwide !== null && seller.local_handover !== null;
}

/**
 * Resolves the current customer and their seller row from the shared customer
 * session. The customer row is matched by auth_user_id (the same key the seller
 * RLS uses), and the seller row by customer_id. Everything the sell flow needs
 * hangs off this one hook.
 */
export function useSeller() {
  const { user, isLoggedIn, loading: authLoading } = useCustomerAuth();
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [seller, setSeller] = useState<SellerRow | null>(null);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!user) { setCustomerId(null); setSeller(null); setLoading(false); return; }
    setLoading(true);
    const { data: customer } = await sdb
      .from("customers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const cid = (customer as { id: string } | null)?.id ?? null;
    setCustomerId(cid);
    if (!cid) { setSeller(null); setLoading(false); return; }
    const { data: s } = await sdb
      .from("marketplace_sellers")
      .select("id, customer_id, display_name, legal_first_name, legal_last_name, phone, bank_name, bank_account_name, bank_account_number, bank_account_verified, verification_tier, status, strike_count, outstanding_debit_naira, sells_nationwide, local_handover")
      .eq("customer_id", cid)
      .maybeSingle();
    setSeller((s as unknown as SellerRow) ?? null);
    setLoading(false);
  }, [user, authLoading]);

  useEffect(() => { load(); }, [load]);

  return {
    user,
    isLoggedIn,
    loading: authLoading || loading,
    customerId,
    seller,
    refresh: load,
  };
}
