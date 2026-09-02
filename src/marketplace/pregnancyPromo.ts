import { useQuery } from "@tanstack/react-query";
import { mdb } from "./data/mdb";

/**
 * Whether THIS listing's category is one where a pregnancy advert belongs.
 *
 * WHY THE SERVER DECIDES. The targeting lives on
 * marketplace_categories.shows_pregnancy_promo, and this hook only asks the
 * question. Nothing here knows which categories qualify, so the set can be
 * widened or narrowed by flipping a column, with no deploy. Never reintroduce
 * a slug list on this side.
 *
 * Today that flag is on 13 categories covering 68 of 281 live listings, about
 * one page in four. Clothing and shoes are deliberately out: they are 146 of
 * 281 between them, and someone buying a toddler dress is as likely to be
 * shopping for a two year old as expecting, so including them would put the
 * advert on half the catalogue and turn it into wallpaper.
 *
 * NON-LIVE LISTINGS RETURN NOTHING, not false: the function's own query is
 * filtered to status = 'live', so a sold or delisted id resolves to null and
 * this returns false. That is a second lock on top of the first — a sold
 * listing renders SoldListingPage, which never mounts the banner at all.
 *
 * Defaults to false while loading and on any error, so the advert can only
 * ever appear on a definite yes. A page that fails this call is a page with
 * no banner, never a page with a wrongly-placed one.
 */
export function useShowsPregnancyPromo(listingId: string | undefined): boolean {
  const { data } = useQuery({
    queryKey: ["mkt-pregnancy-promo", listingId],
    enabled: !!listingId,
    // The flag changes when someone edits a category, not per visit.
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await mdb.rpc("listing_shows_pregnancy_promo", { p_listing_id: listingId });
      if (error) return false;
      const v = Array.isArray(data) ? data[0] : data;
      return v === true;
    },
  });
  return data === true;
}
