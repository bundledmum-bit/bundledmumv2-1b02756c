import { useQuery } from "@tanstack/react-query";
import { mdb, LISTING_SELECT } from "./mdb";
import type { MarketplaceListing } from "../types";

/**
 * All live listings, newest first. status='live' is enforced here AND by the
 * "Public read live listings" RLS policy, so nothing else can surface.
 */
export function useLiveListings() {
  return useQuery({
    queryKey: ["marketplace", "listings", "live"],
    queryFn: async (): Promise<MarketplaceListing[]> => {
      const { data, error } = await mdb
        .from("marketplace_listings")
        .select(LISTING_SELECT)
        .eq("status", "live")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MarketplaceListing[];
    },
    staleTime: 60 * 1000,
  });
}

/** A single listing by id. Still scoped to status='live' so a non-live id 404s. */
export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: ["marketplace", "listing", id],
    enabled: !!id,
    queryFn: async (): Promise<MarketplaceListing | null> => {
      const { data, error } = await mdb
        .from("marketplace_listings")
        .select(LISTING_SELECT)
        .eq("id", id as string)
        .eq("status", "live")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as MarketplaceListing | null;
    },
  });
}
