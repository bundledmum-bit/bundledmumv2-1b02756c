import { useQuery } from "@tanstack/react-query";
import { sdb } from "./sellData";

/**
 * How many listings this seller has, and which state they are in.
 *
 * The count is the switch between the two entry points for the delivery
 * questions: a seller with at least one listing gets the blocking modal, a
 * seller with none answers inside the listing form instead.
 *
 * The state is what lets the modal name the seller's ACTUAL state ("only in
 * Lagos") rather than the vague "your state". It comes from their listings,
 * the same source outreach_context() uses server side, since a seller row
 * carries no state of its own. Most recent listing wins, and null is a
 * genuine possibility (a listing can exist before location is filled in),
 * so every caller has to handle it.
 */
export interface SellerListingInfo {
  count: number;
  state: string | null;
}

export function useSellerListingInfo(sellerId: string | undefined) {
  return useQuery({
    queryKey: ["mkt-seller-listing-info", sellerId],
    enabled: !!sellerId,
    staleTime: 60_000,
    queryFn: async (): Promise<SellerListingInfo> => {
      const { data, count } = await sdb
        .from("marketplace_listings")
        .select("location_state", { count: "exact" })
        .eq("seller_id", sellerId as string)
        .order("created_at", { ascending: false })
        .limit(20);
      const rows = (data ?? []) as Array<{ location_state: string | null }>;
      const state = rows.map((r) => r.location_state?.trim()).find((s) => !!s) ?? null;
      return { count: count ?? 0, state };
    },
  });
}
