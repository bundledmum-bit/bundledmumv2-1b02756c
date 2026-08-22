import { useQuery } from "@tanstack/react-query";
import { sdb } from "./sellData";

/**
 * How many listings this seller has, at all — any status, not just live.
 * This is the switch between the two entry points for the delivery
 * question: a seller with at least one listing gets the blocking modal, a
 * seller with none gets it as the first step of the listing form instead.
 *
 * head+count so no rows are transferred, only the number.
 */
export function useSellerListingCount(sellerId: string | undefined) {
  return useQuery({
    queryKey: ["mkt-seller-listing-count", sellerId],
    enabled: !!sellerId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count } = await sdb
        .from("marketplace_listings")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", sellerId as string);
      return count ?? 0;
    },
  });
}
