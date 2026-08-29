import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useMyListingsWithoutVideo, uploadVideoForLiveListing,
  useListingVideoGuidance, mbTotal, VIDEO_QUEUED_LINE, type ListingWithoutVideo,
} from "../listingVideo";

/**
 * Adding a video to a listing WITHOUT taking it down.
 *
 * The whole reason 212 listings have none: the only route was the edit
 * screen, which for a live listing is a wall offering "Make changes", which
 * delists. We were asking sellers for a video and the only way to comply
 * was to stop selling. Nobody sensible does that.
 *
 * This picks the listing in place, so nobody leaves for an edit screen.
 * seller_add_video_to_live_listing does not touch `status`, so the listing
 * keeps selling the whole time, and the copy says so plainly because a
 * seller who has been asked to delist before will assume the worst.
 *
 * `file.size` is read only to say roughly how long it will take, and
 * nothing else about the file is touched: no duration, no canvas, no video
 * element. That is what hung on iPhone and killed this feature twice.
 */

function sendingEstimate(bytes: number): string | null {
  const mb = bytes / (1024 * 1024);
  if (mb < 12) return null;
  const mins = Math.max(1, Math.round(mb / 8));
  return `That is ${mb.toFixed(0)}MB, so it may take around ${mins} ${mins === 1 ? "minute" : "minutes"}.`;
}

export default function AddVideoSheet({ sellerAuthUid, initialListingId, onClose }: {
  sellerAuthUid: string;
  /** Preselects the one the prompt led with. */
  initialListingId?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const guidance = useListingVideoGuidance();
  const { data: listings, isLoading } = useMyListingsWithoutVideo(true);
  const [chosenId, setChosenId] = useState<string | null>(initialListingId ?? null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const rows = listings ?? [];
  const chosen: ListingWithoutVideo | null =
    rows.find((r) => r.listing_id === chosenId) ?? (rows.length === 1 ? rows[0] : null);

  async function send(f: File) {
    if (!chosen) return;
    setBusy(true); setError(null); setProgress(0);
    const res = await uploadVideoForLiveListing({
      listingId: chosen.listing_id, sellerAuthUid, file: f, onProgress: setProgress,
    });
    setBusy(false);
    if (!res.ok) { setError(res.message ?? "That could not be saved."); return; }
    setDone(true);
    void qc.invalidateQueries({ queryKey: ["mkt-my-listings-without-video"] });
  }

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    void send(f);
  }

  return (
    <div className="mkt-sheet-overlay" onClick={() => !busy && onClose()}>
      <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />

        {done ? (
          <>
            <h3>{VIDEO_QUEUED_LINE}</h3>
            <div className="mkt-hb">
              <div className="hb-line"><span className="hb-tick">✓</span>Your listing stayed live the whole time and is still selling.</div>
              <div className="hb-line"><span className="hb-tick">✓</span>Nothing more for you to do. It appears on your listing as soon as it is through.</div>
            </div>
            <button className="mkt-primary" onClick={onClose}>Done</button>
          </>
        ) : busy ? (
          <>
            <h3>Sending your video</h3>
            <div className="mkt-video-processing">
              <div className="bar-row">
                <div className="bar"><i style={{ width: `${progress}%` }} /></div>
                <span>{progress}%</span>
              </div>
            </div>
            <p>
              {file ? `${mbTotal(file)}, ` : ""}going up exactly as you filmed it.
              {file ? ` ${sendingEstimate(file.size) ?? ""}` : ""}
            </p>
            <p><b>Your listing stays live while we prepare your video.</b> Nothing comes down, and it keeps selling.</p>
          </>
        ) : (
          <>
            <h3>Add a video</h3>
            <p><b>Your listing stays live while we prepare your video.</b> Nothing comes down, you do not need to take anything off the marketplace.</p>

            {isLoading ? (
              <p>Finding your listings...</p>
            ) : rows.length === 0 ? (
              <p>Every one of your listings already has a video. Nothing to do here.</p>
            ) : (
              <>
                {/* Pick which one, in place. Required first, then most
                    viewed, straight from the RPC's own order. */}
                {rows.length > 1 && (
                  <div className="mkt-videopick">
                    {rows.map((r) => (
                      <button
                        key={r.listing_id}
                        type="button"
                        className={`row${chosen?.listing_id === r.listing_id ? " on" : ""}`}
                        onClick={() => { setChosenId(r.listing_id); setError(null); }}
                      >
                        <span className="th">{r.image_url && <img src={r.image_url} alt="" />}</span>
                        <span className="tx">
                          <span className="t">{r.title || "Your listing"}</span>
                          <span className="s">
                            {r.video_required ? "Buyers cannot tell it works" : "Would help it sell"}
                            {r.view_count ? ` · ${r.view_count} views` : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Each listing's OWN guidance, per category. */}
                {chosen?.video_guidance && (
                  <div className="mkt-video-guidance">
                    <span className="ic" aria-hidden>🎬</span>
                    <span>{chosen.video_guidance}</span>
                  </div>
                )}
                {guidance && <p>{guidance}</p>}

                {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}

                <button
                  className="mkt-primary"
                  disabled={!chosen}
                  onClick={() => fileRef.current?.click()}
                >
                  {chosen ? "Choose a video" : "Pick a listing first"}
                </button>
              </>
            )}

            <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" hidden
              onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
            <button className="back" onClick={onClose}>Not now</button>
          </>
        )}
      </div>
    </div>
  );
}
