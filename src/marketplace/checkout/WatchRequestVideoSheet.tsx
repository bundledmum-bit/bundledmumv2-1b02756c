import { useRef, useState } from "react";
import { buyerClaimVideoRequest, getRequestVideoSignedUrl, buyerMarkVideoWatched } from "../videoRequests";

/**
 * Watch a requested video (buyer side). Opens on a plain warning, never the
 * video itself — buyer_claim_request_video is only ever called from the
 * "Play video" button below, a deliberate tap, never on this sheet's own
 * mount.
 *
 * THE DELETION CLOCK STARTS ON PLAYBACK, NOT ON THE CLAIM. Claiming only
 * hands over the path; buyer_mark_video_watched is what stamps watched_at,
 * and it is called from the video element's own loadeddata/playing events,
 * so a failed playback cannot burn a video nobody saw. Nothing here reads
 * duration or probes the file in any way; once a signed URL comes back,
 * playback is a completely ordinary, visible <video controls> element —
 * ordinary HTML5 playback is unrelated to the hidden-metadata-probe pattern
 * that broke on iOS before (handoff §87-92), and is required for the
 * feature to work at all.
 */
export default function WatchRequestVideoSheet({
  requestId, onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  // Several events can fire for one playback, and the sheet can re-render,
  // so the call is made once per mount. The RPC is idempotent as well.
  const markedRef = useRef(false);

  /**
   * Real playback has begun. `loadeddata` means frame data actually
   * arrived, and `playing` means playback is genuinely running after any
   * buffering — deliberately NOT `play`, which fires on the intent to play
   * and can be followed immediately by an error, which is the same mistake
   * as stamping on the claim.
   */
  function markWatched() {
    if (markedRef.current) return;
    markedRef.current = true;
    void buyerMarkVideoWatched(requestId);
  }

  async function play() {
    setBusy(true); setError(null);
    const claim = await buyerClaimVideoRequest(requestId);
    if (!claim.ok) { setBusy(false); setError(claim.message); return; }
    const url = await getRequestVideoSignedUrl(claim.videoPath);
    setBusy(false);
    if (!url) { setError("Could not open this video. Please try again."); return; }
    setVideoUrl(url);
  }

  return (
    <div className="mkt-sheet-overlay" onClick={() => !busy && onClose()}>
      <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {videoUrl ? (
          <>
            <h3>Their video</h3>
            <video
              controls
              playsInline
              src={videoUrl}
              onLoadedData={markWatched}
              onPlaying={markWatched}
              style={{ width: "100%", borderRadius: 12, background: "#000", maxHeight: "60vh" }}
            />
            <button className="back" onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            <h3>Before you play this</h3>
            <div className="mkt-infobox">
              <span className="m">ℹ</span>
              <span>This is a full-size video, not compressed, it could be 40MB or more. Make sure you're happy to use that much data before you play it.</span>
            </div>
            <p>It'll stay available for about 4 hours after you watch it.</p>
            {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
            <button className="mkt-primary" onClick={play} disabled={busy}>{busy ? "Opening..." : "Play video"}</button>
            <button className="back" onClick={onClose} disabled={busy}>Not now</button>
          </>
        )}
      </div>
    </div>
  );
}
