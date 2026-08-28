import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import {
  formatNaira, relativeTimeAgo, fetchListingsNeedingVideo, adminUploadListingVideo,
  type ListingNeedingVideoRow,
} from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill } from "./opsUi";

/**
 * The whole no-video backlog, and a way to add one for a seller who sent it
 * on WhatsApp.
 *
 * Sorted required first then most viewed, because a listing people look at
 * and do not buy is exactly where doubt lives. The category's own guidance
 * sits on every row, so whoever is about to ask knows what to ask FOR
 * before they message.
 */

const QUERY_KEY = ["mkt-listings-needing-video"];

export default function MarketplaceListingsNeedingVideo() {
  const { data: rows, isLoading } = useQuery({
    queryKey: QUERY_KEY, staleTime: 15000, queryFn: fetchListingsNeedingVideo,
  });
  const [showContacted, setShowContacted] = useState(false);

  const { working, contacted, requiredCount } = useMemo(() => {
    const all = rows ?? [];
    const sort = (a: ListingNeedingVideoRow, b: ListingNeedingVideoRow) => {
      if (a.video_required !== b.video_required) return a.video_required ? -1 : 1;
      return (b.view_count || 0) - (a.view_count || 0);
    };
    return {
      working: all.filter((r) => !r.contacted_at).sort(sort),
      contacted: all.filter((r) => !!r.contacted_at).sort(sort),
      requiredCount: all.filter((r) => r.video_required).length,
    };
  }, [rows]);

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  if (!rows || rows.length === 0) {
    return (
      <div>
        <OpsHeader title="Listings with no video" subtitle="Where a video would answer what the photos cannot." />
        <OpsEmpty title="Every live listing has a video" body="A listing appears here while it is live with no video on it." />
      </div>
    );
  }

  return (
    <div>
      <OpsHeader
        title="Listings with no video"
        subtitle="Sorted by the ones that need it most, then by how many people are looking."
      />

      <div className="rounded-2xl border p-3.5 mb-4 flex flex-wrap gap-x-6 gap-y-2"
        style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
        <Stat label="With no video" value={String(rows.length)} />
        <Stat label="Buyers cannot tell it works" value={String(requiredCount)} tone="warn" />
        <Stat label="Not yet asked" value={String(working.length)} />
      </div>

      <div className="flex flex-col gap-2.5">
        {working.map((r) => <Row key={r.listing_id} r={r} />)}
      </div>

      {working.length === 0 && (
        <div className="text-[12px] text-text-med">Every one of these has been asked.</div>
      )}

      {contacted.length > 0 && (
        <div className="mt-5">
          <button onClick={() => setShowContacted((v) => !v)}
            className="font-heading font-extrabold text-[12px] underline" style={{ color: "#6B5B54" }}>
            {showContacted ? "Hide" : "Show"} {contacted.length} already asked
          </button>
          {showContacted && (
            <div className="flex flex-col gap-2.5 mt-2.5">
              {contacted.map((r) => <Row key={r.listing_id} r={r} />)}
            </div>
          )}
        </div>
      )}
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

function Row({ r }: { r: ListingNeedingVideoRow }) {
  return (
    <div className="rounded-2xl border p-3.5 flex gap-3 items-start"
      style={{ borderColor: r.video_required ? "#D4613C" : "#F0DDD2", background: "#fff" }}>
      <div className="w-14 h-14 rounded-lg flex-none overflow-hidden"
        style={{ background: "repeating-linear-gradient(135deg,#FDE8DF 0 6px,#FFF8F4 6px 12px)" }}>
        {r.image_url && <img src={r.image_url} alt="" className="w-full h-full object-cover" />}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="font-heading font-black text-sm text-foreground truncate">{r.title || "An item"}</div>
            <div className="text-[11.5px] text-text-med truncate">
              {r.seller_name || "A seller"}{r.category_name ? ` · ${r.category_name}` : ""}
            </div>
          </div>
          <div className="text-right flex-none">
            <div className="font-heading font-black text-sm text-foreground tabular-nums">{formatNaira(r.final_price_naira)}</div>
            <div className="text-[10.5px] text-text-med tabular-nums">{r.view_count ?? 0} views</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {r.video_required
            ? <StatusPill tone="negative" label="Buyers cannot tell it works" />
            : <StatusPill tone="neutral" label="Would help" />}
          {r.days_listed != null && <StatusPill tone="neutral" label={`Listed ${r.days_listed} days`} />}
          {r.youtube_status && <StatusPill tone="work" label={`Video ${r.youtube_status}`} />}
        </div>

        {/* What to ask FOR, before asking. */}
        {r.video_guidance && (
          <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#D8EFE5", color: "#1A4A33" }}>
            <b className="font-heading font-extrabold">Ask them to film:</b> {r.video_guidance}
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-[11.5px] text-text-med">
          {r.seller_phone && <span>{r.seller_phone}</span>}
          {r.contacted_at && <span>Asked {relativeTimeAgo(r.contacted_at)}</span>}
        </div>

        <AddVideoForSeller r={r} />
      </div>
    </div>
  );
}

/**
 * Adding a video the seller sent on WhatsApp. A note saying where they sent
 * it is required, because this puts a video on someone else's listing in
 * their name.
 */
function AddVideoForSeller({ r }: { r: ListingNeedingVideoRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const noteOk = note.trim().length >= 5;
  const ready = !!file && noteOk;

  async function send() {
    if (!file) return;
    setBusy(true); setError(null); setProgress(0);
    const res = await adminUploadListingVideo({
      listingId: r.listing_id, file, note: note.trim(), onProgress: setProgress,
    });
    setBusy(false);
    if (!res.ok) { setError(res.message ?? "Could not send that."); return; }
    setDone(true);
    await qc.invalidateQueries({ queryKey: QUERY_KEY });
  }

  if (done) {
    return (
      <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#D8EFE5", color: "#1A4A33" }}>
        Sent. It goes to YouTube and appears on the listing shortly.
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="self-start text-[11px] underline" style={{ color: "#2D6A4F" }}>
        They sent me a video
      </button>
    );
  }

  return (
    <div className="rounded-xl border p-3 mt-1 flex flex-col gap-2.5" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
      <div className="font-heading font-black text-[12.5px]">Add the video {r.seller_name || "they"} sent you</div>

      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>Their video</span>
        {/* Nothing is read from the file beyond what the browser gives for
            free. No size gate, no duration, no decoding of any kind. */}
        <input type="file" accept="video/*" className="text-[12px]"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        {file && <span className="text-[10.5px]" style={{ color: "#8A7A72" }}>{file.name}</span>}
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>Where did the seller send you this?</span>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="For example: she sent it on WhatsApp this morning"
          className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
        <span className="text-[10.5px]" style={{ color: noteOk ? "#8A7A72" : "#C0392B" }}>
          {noteOk ? "Kept forever, with your name against it." : "Needed. This goes on their listing in their name."}
        </span>
      </label>

      {error && <div className="rounded-lg px-2.5 py-2 text-[11.5px]" style={{ background: "#FCEBE9", color: "#8C2A1F" }}>{error}</div>}

      <div className="flex gap-2">
        <button onClick={send} disabled={!ready || busy}
          className="flex-1 rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]"
          style={ready && !busy ? { background: "#2D6A4F", color: "#fff" } : { background: "#E0DAD5", color: "#8A7A72" }}>
          {busy ? `Uploading... ${progress}%` : "Add this video"}
        </button>
        <button onClick={() => { setOpen(false); setError(null); }} disabled={busy}
          className="flex-none rounded-lg py-2.5 px-3 font-heading font-extrabold text-[12.5px] border"
          style={{ borderColor: "#E3D4CB", color: "#6B5B54", background: "#fff" }}>Cancel</button>
      </div>
    </div>
  );
}
