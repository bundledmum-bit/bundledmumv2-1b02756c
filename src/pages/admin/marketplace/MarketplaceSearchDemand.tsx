import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { relativeTimeAgo, fetchSearchDemand } from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill } from "./opsUi";

/**
 * What buyers typed into the search box, and how often we had nothing.
 *
 * Deliberately plain. The whole value is reading "seven people searched for
 * cots and found nothing" at a glance, so there is no chart, no filter and
 * no sort control: the view already orders empty searches first, because
 * those are demand we could serve and do not.
 */
export default function MarketplaceSearchDemand() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["mkt-search-demand"], staleTime: 30000, queryFn: fetchSearchDemand,
  });

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  if (!rows || rows.length === 0) {
    return (
      <div>
        <OpsHeader title="What buyers searched for" subtitle="Every search, with how often it found nothing." />
        <OpsEmpty title="No searches recorded yet" body="A term appears here once someone searches for it on the marketplace." />
      </div>
    );
  }

  const emptyTerms = rows.filter((r) => r.times_found_nothing > 0);
  const totalEmpty = emptyTerms.reduce((n, r) => n + r.times_found_nothing, 0);

  return (
    <div>
      <OpsHeader
        title="What buyers searched for"
        subtitle="Searches that found nothing come first. Those are people who wanted something we did not have."
      />

      <div className="rounded-2xl border p-3.5 mb-4 flex flex-wrap gap-x-6 gap-y-2"
        style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
        <Stat label="Different things searched for" value={String(rows.length)} />
        <Stat label="Terms that found nothing" value={String(emptyTerms.length)} tone="warn" />
        <Stat label="Times someone left empty handed" value={String(totalEmpty)} tone="warn" />
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const pct = r.pct_empty ?? 0;
          const neverFound = r.times_found_nothing === r.times_searched;
          return (
            <div key={r.term} className="rounded-2xl border p-3 flex gap-3 items-center flex-wrap"
              style={{ borderColor: neverFound ? "#D4613C" : "#F0DDD2", background: "#fff" }}>
              <div className="flex-1 min-w-[140px]">
                <div className="font-heading font-black text-sm text-foreground">{r.term}</div>
                <div className="text-[11.5px] text-text-med">
                  {r.times_searched} {r.times_searched === 1 ? "search" : "searches"}
                  {r.distinct_people ? ` by ${r.distinct_people} ${r.distinct_people === 1 ? "person" : "people"}` : ""}
                  {r.last_searched ? `, last ${relativeTimeAgo(r.last_searched)}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {r.times_found_nothing > 0 ? (
                  <StatusPill
                    tone={neverFound ? "negative" : "work"}
                    label={neverFound
                      ? `Found nothing, every time`
                      : `Found nothing ${r.times_found_nothing} of ${r.times_searched}`}
                  />
                ) : (
                  <StatusPill tone="good" label="Always found something" />
                )}
                <span className="font-heading font-black text-sm tabular-nums"
                  style={{ color: pct >= 50 ? "#C0392B" : "#6B5B54" }}>
                  {Math.round(pct)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <div className="font-heading font-black text-lg tabular-nums" style={{ color: tone === "warn" ? "#C0392B" : "#1A1A1A" }}>{value}</div>
      <div className="text-[11px] text-text-med">{label}</div>
    </div>
  );
}
