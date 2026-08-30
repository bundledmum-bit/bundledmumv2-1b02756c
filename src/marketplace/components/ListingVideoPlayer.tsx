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
 * NOTHING pre-judges whether the browser can play the file any more.
 *
 * This used to ask canPlayType("video/quicktime") first and render nothing
 * when the answer was empty. Both beliefs behind that were measured false
 * against the live steriliser listing, whose staged file is a .mov, as all
 * three queued files are, because our sellers film on iPhones:
 *
 *   Chromium answers "" for video/quicktime and then PLAYS the file
 *   perfectly: loadeddata, readyState 4, 960x1280, 20.9s, no error. So the
 *   check hid a working video from Chrome and Android, which is most
 *   buyers, on every listing the feature was built for.
 *
 *   Chromium does NOT sit silently at readyState 0 on a file it genuinely
 *   cannot decode. It fires `error` in about 6ms, MEDIA_ERR_SRC_NOT_SUPPORTED,
 *   "DEMUXER_ERROR_COULD_NOT_OPEN". So onError is a real fallback and was
 *   always the honest instrument.
 *
 * canPlayType is also useless as a veto in the other direction: WebKit
 * answers "maybe" to every bare mime type it is given, webm included.
 *
 * So we attempt it, and on the error we hide the card outright rather than
 * returning to a Tap to play button that would never work and would spend a
 * little more of the buyer's data on each attempt.
 */

export default function ListingVideoPlayer({ video, posterUrl }: {
  video: ListingVideo;
  /** The listing's own photo. A staged file has no YouTube thumbnail, and
   * extracting a frame would mean READING the video, which is what broke
   * this feature twice on iPhone. */
  posterUrl?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  /** Set only once the browser has actually refused the file. */
  const [cannotPlay, setCannotPlay] = useState(false);
  const [stopgapUrl, setStopgapUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isReady = video.status === "ready" && !!video.youtube_video_id;
  if (!isReady && !video.stopgap_path) return null;
  // Only after this browser has actually tried and failed. A dead card is
  // worse than no card, but so is hiding one that would have played.
  if (cannotPlay) return null;
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
              /* Covers both refusals: a container this browser cannot
                 decode, and the staged file being deleted the instant
                 YouTube succeeds. Either way the card goes, and a reload
                 picks up the YouTube copy. A buyer should never read an
                 error about our upload queue. */
              onError={() => { setPlaying(false); setStopgapUrl(null); setCannotPlay(true); }}
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
