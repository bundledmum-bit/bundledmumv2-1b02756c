import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { relativeTimeAgo, fetchVideosToReview } from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill } from "./opsUi";

/**
 * Videos that have already gone public on our YouTube channel, listed so
 * they can be checked afterwards.
 *
 * Deliberately NOT a gate. A seller's video reaches the listing without
 * anyone approving it first, because at three sales a day a review queue
 * would cost more in delay than it saves in risk. This exists so nothing
 * goes unseen indefinitely, not to hold anything up.
 */
export default function MarketplaceVideosToReview() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["mkt-videos-to-review"], staleTime: 15000, queryFn: fetchVideosToReview,
  });

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  if (!rows || rows.length === 0) {
    return (
      <div>
        <OpsHeader title="Videos to check" subtitle="Already live on the listing and on our channel." />
        <OpsEmpty title="Nothing waiting to be checked" body="A video appears here once it reaches YouTube, so it can be watched after the fact." />
      </div>
    );
  }

  return (
    <div>
      <OpsHeader
        title="Videos to check"
        subtitle="These are already live on the listing and on our channel. Watching them is a check after the fact, not an approval."
      />

      <div className="rounded-2xl border p-3.5 mb-4" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
        <div className="font-heading font-black text-lg tabular-nums">{rows.length}</div>
        <div className="text-[11px] text-text-med">{rows.length === 1 ? "video not yet watched" : "videos not yet watched"}</div>
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.listing_id} className="rounded-2xl border p-3.5 flex gap-3 items-start"
            style={{ borderColor: "#F0DDD2", background: "#fff" }}>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="font-heading font-black text-sm text-foreground truncate">{r.title || "A listing"}</div>
              <div className="text-[11.5px] text-text-med truncate">{r.seller_name || "A seller"}</div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {r.listing_status && <StatusPill tone={r.listing_status === "live" ? "good" : "neutral"} label={`Listing ${r.listing_status}`} />}
                {r.youtube_uploaded_at && <StatusPill tone="neutral" label={`Went up ${relativeTimeAgo(r.youtube_uploaded_at)}`} />}
              </div>
              {r.watch_link && (
                <a href={r.watch_link} target="_blank" rel="noreferrer"
                  className="self-start rounded-lg px-3 py-2.5 font-heading font-extrabold text-[12.5px]"
                  style={{ background: "#2D6A4F", color: "#fff" }}>
                  Watch it
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
