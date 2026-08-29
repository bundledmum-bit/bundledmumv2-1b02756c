import { useRef, useState } from "react";
import { getStopgapVideoSignedUrl, type ListingVideo } from "../listingVideo";

/**
 * The listing video, design 37a, from whichever source has it.
 *
 * Two sources, and the difference matters enormously to a buyer on Nigerian
 * mobile data:
 *
 *   ready   -> the YouTube embed, autoplaying muted. Safe because YouTube is
 *              adaptive and serves a fraction of the file.
 *   stopgap -> the RAW staged file, while YouTube's daily channel cap means
 *              the video is still queued. A 40MB autoplay would spend
 *              roughly 10 to 20 naira of someone's bundle without them
 *              choosing to, and buffer badly on a slow line.
 *
 * SO NOT ONE BYTE OF A STOPGAP IS FETCHED BEFORE THE TAP. The <video>
 * element does not exist until then: there is no src, no preload, no poster
 * attribute pointing at it, and the signed URL is not even requested until
 * the tap. A poster that quietly preloaded the file would look identical
 * and cost the buyer exactly the same.
 *
 * The buyer is told nothing about any of this. No badge, no "temporary",
 * no "processing". Which source it came from is our problem.
 */
/**
 * Can this browser play the container the staged file is in?
 *
 * Three of the four queued files are mp4 and one is a .mov, which Chrome
 * will not decode: it sits at readyState 0 forever WITHOUT firing an error,
 * so onError cannot rescue it and the buyer gets a dead player. Asking
 * first means we simply show nothing, exactly as before this feature
 * existed, rather than something broken.
 *
 * This creates a <video> element but NEVER gives it a src and never loads
 * anything: canPlayType is a synchronous capability lookup, not a read of
 * the file. It is not the metadata-probe pattern that hung iOS twice.
 */
function browserCanPlay(path: string): boolean {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const mime = ({
    mp4: "video/mp4", m4v: "video/x-m4v", webm: "video/webm",
    mov: "video/quicktime", "3gp": "video/3gpp",
  } as Record<string, string>)[ext];
  if (!mime) return false;
  try {
    return document.createElement("video").canPlayType(mime) !== "";
  } catch {
    return false;
  }
}

export default function ListingVideoPlayer({ video, posterUrl }: {
  video: ListingVideo;
  /** The listing's own photo. A staged file has no YouTube thumbnail, and
   * extracting a frame would mean READING the video, which is what broke
   * this feature twice on iPhone. */
  posterUrl?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [stopgapUrl, setStopgapUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isReady = video.status === "ready" && !!video.youtube_video_id;
  // A stopgap this browser cannot decode is worse than no video: render
  // nothing, which is exactly what a buyer saw before stopgaps existed.
  if (!isReady && !(video.stopgap_path && browserCanPlay(video.stopgap_path))) return null;
  const id = isReady ? encodeURIComponent(video.youtube_video_id as string) : "";
  const poster = isReady ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : (posterUrl || undefined);

  async function play() {
    if (isReady) { setPlaying(true); return; }
    // The first moment any of the file is touched, and only because the
    // buyer asked for it.
    setBusy(true);
    const url = await getStopgapVideoSignedUrl(video.stopgap_path as string);
    setBusy(false);
    if (!url) return; // quietly stays on the poster, see onError below
    setStopgapUrl(url);
    setPlaying(true);
  }

  const showingPlayer = playing && (isReady || !!stopgapUrl);

  return (
    <div className="mkt-video-card">
      <div className="mkt-video-h">🎥 Watch a video of this item</div>

      {showingPlayer ? (
        <div className="mkt-video-frame mkt-video-frame-embed">
          {isReady ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`}
              title="A video of this item"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <video
              ref={(el) => {
                videoRef.current = el;
                // preload="none" is what guarantees nothing is fetched
                // before the tap, and it also suppresses autoplay, so the
                // tap has to start it explicitly. Muted, because an unmuted
                // programmatic play is refused on mobile; the controls are
                // right there to turn sound on.
                if (el && el.paused && el.readyState === 0) {
                  el.muted = true;
                  void el.play().catch(() => { /* the poster stays, no error shown */ });
                }
              }}
              src={stopgapUrl as string}
              poster={posterUrl || undefined}
              controls
              autoPlay
              playsInline
              preload="none"
              /* The staged file is deleted the instant YouTube succeeds. If
                 that lands mid playback the video simply stops; a reload
                 picks up the YouTube copy. Rare, and a buyer should never
                 see an error about our upload queue. */
              onError={() => { setPlaying(false); setStopgapUrl(null); }}
            />
          )}
        </div>
      ) : (
        <button type="button" className="mkt-video-frame" onClick={play} disabled={busy} aria-label="Play video">
          {poster && <img src={poster} alt="" className="mkt-video-poster" loading="lazy" />}
          <div className="scrim" />
          <div className="play"><span /></div>
          <span className="tap">{busy ? "Starting..." : "Tap to play"}</span>
        </button>
      )}

      <p className="mkt-video-caption">
        {showingPlayer && isReady
          ? "Tap the speaker on the video for sound."
          : "Plays only when you tap, uses your data."}
      </p>
    </div>
  );
}
