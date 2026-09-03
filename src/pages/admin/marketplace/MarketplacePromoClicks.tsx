import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { relativeTimeAgo, fetchPromoClicks } from "./opsData";
import { OpsHeader, OpsEmpty } from "./opsUi";

/** The three banners, named as a person would say them rather than as the
 * database stores them. An unknown value falls back to itself, so a banner
 * added later shows its raw key instead of vanishing. */
const BANNER_LABEL: Record<string, string> = {
  quiz: "Quiz advert, on a listing page",
  storefront_crosssell: "Buy it new, on marketplace browse",
  marketplace_crosssell: "Buy it used, on the shop",
};

/**
 * Which pages send people across, and which do not.
 *
 * Deliberately plain, the same as the search demand view: no chart, no filter,
 * no sort control. The view already aggregates and orders, and the whole value
 * is reading "the quiz advert gets clicked on cots and never on school shoes"
 * at a glance.
 *
 * This answers a question the utm tags cannot. A tag attributes a visit that
 * ARRIVED; this counts the click that was made. Both are needed, and the gap
 * between them is the one worth watching — clicks with no matching arrivals
 * means people are dropping on the way.
 */
export default function MarketplacePromoClicks() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["mkt-promo-clicks"], staleTime: 30000, queryFn: fetchPromoClicks,
  });

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  if (!rows || rows.length === 0) {
    return (
      <div>
        <OpsHeader title="Banner clicks" subtitle="Which pages send people between the shop and the marketplace." />
        <OpsEmpty
          title="No banner clicks recorded yet"
          body="A row appears here the first time someone clicks one of the three cross-app banners."
        />
      </div>
    );
  }

  const totalClicks = rows.reduce((n, r) => n + (r.clicks || 0), 0);
  const totalPeople = rows.reduce((n, r) => n + (r.people || 0), 0);

  return (
    <div>
      <OpsHeader
        title="Banner clicks"
        subtitle="Where someone clicked FROM is the useful column: it says which pages send people across and which do not."
      />

      <div className="rounded-2xl border p-3.5 mb-4 flex flex-wrap gap-x-6 gap-y-2">
        <div><span className="font-semibold">{totalClicks}</span> clicks</div>
        <div><span className="font-semibold">{totalPeople}</span> people</div>
        <div><span className="font-semibold">{rows.length}</span> page and banner combinations</div>
      </div>

      <div className="rounded-2xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Banner</th>
              <th className="text-left px-3 py-2 font-semibold">Clicked from</th>
              <th className="text-left px-3 py-2 font-semibold">Went to</th>
              <th className="text-right px-3 py-2 font-semibold">Clicks</th>
              <th className="text-right px-3 py-2 font-semibold">People</th>
              <th className="text-left px-3 py-2 font-semibold">Last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.banner}|${r.from_context}|${r.destination}|${i}`} className="border-t">
                <td className="px-3 py-2">{BANNER_LABEL[r.banner] || r.banner}</td>
                {/* An empty context is a real state, not missing data: a listing
                    with no category still shows the advert. Say so rather than
                    printing a dash that reads as a bug. */}
                <td className="px-3 py-2">{r.from_context || <span className="text-muted-foreground">no category</span>}</td>
                <td className="px-3 py-2 break-all text-muted-foreground">{r.destination || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.clicks}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.people}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.last_click ? relativeTimeAgo(r.last_click) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
