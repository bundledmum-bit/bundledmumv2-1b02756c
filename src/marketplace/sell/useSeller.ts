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
  /** Set the moment a seller answers the same-state handover question.
   * NOT NULL is the single definition of "has answered" — a database
   * trigger will shortly reject listing inserts from sellers where this is
   * still null, so nothing may treat a bare local_handover as sufficient. */
  delivery_prefs_set_at: string | null;
}

/**
 * The one definition of "this seller's delivery preferences are COMPLETE".
 *
 * Both columns, deliberately — NOT delivery_prefs_set_at, and NOT the
 * handover answer alone. Three sellers answered the single-question version
 * and ended up with local_handover set but sells_nationwide null; their
 * preferences are incomplete and they must be asked again. This mirrors
 * seller_needs_delivery_prefs() server side, which flags exactly that case,
 * so the prompt and the outreach queue agree on who still needs asking.
 */
export function hasCompleteDeliveryPrefs(
  seller: Pick<SellerRow, "sells_nationwide" | "local_handover"> | null,
): boolean {
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
      .select("id, customer_id, display_name, legal_first_name, legal_last_name, phone, bank_name, bank_account_name, bank_account_number, bank_account_verified, verification_tier, status, strike_count, outstanding_debit_naira, sells_nationwide, local_handover, delivery_prefs_set_at")
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
