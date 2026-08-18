import { useRef, useState } from "react";

/**
 * The one optional listing video, design 37a. Resting state is a still
 * poster with an unmissable play control — the <video> itself carries
 * `preload="none"`, so the browser fetches only the small poster JPEG on
 * page load, never a single byte of the video, until she actually taps.
 * Never autoplay, ever. Custom controls (progress bar, time, pause), not
 * the browser's native ones, to match the design exactly.
 *
 * Rendered only when the listing genuinely has a video — ListingDetailPage
 * simply doesn't mount this at all otherwise, no empty state, no
 * placeholder, most listings have none and that's the point.
 */
export default function ListingVideoCard({ videoUrl, posterUrl, durationSeconds }: {
  videoUrl: string;
  posterUrl: string;
  durationSeconds: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // The real, playing video's own duration once it actually loads is more
  // accurate than the stored value (which can be off by the same ~1s
  // grace the trigger allows) — falls back to the stored one until then.
  const [liveDuration, setLiveDuration] = useState<number | null>(null);
  const duration = liveDuration ?? durationSeconds;

  function fmt(t: number): string {
    const s = Math.max(0, Math.round(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function toggle() {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      v.play();
      setPlaying(true);
    }
  }

  return (
    <div className="mkt-video-card">
      <div className="mkt-video-h">🎥 Watch a video of this item</div>
      <button type="button" className="mkt-video-frame" onClick={toggle} aria-label={playing ? "Pause video" : "Play video"}>
        <video
          ref={videoRef}
          src={videoUrl}
          poster={posterUrl}
          preload="none"
          playsInline
          onLoadedMetadata={(e) => setLiveDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => { setPlaying(false); setCurrentTime(0); if (videoRef.current) videoRef.current.currentTime = 0; }}
        />
        {!playing && (
          <>
            <div className="scrim" />
            <div className="play"><span /></div>
            <span className="dur">{fmt(durationSeconds)}</span>
            <span className="tap">Tap to play</span>
          </>
        )}
        {playing && (
          <div className="controls">
            <div className="track"><i style={{ width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%` }} /></div>
            <div className="row">
              <span className="t">{fmt(currentTime)} / {fmt(duration)}</span>
              <span className="pause" aria-hidden="true"><i /><i /></span>
            </div>
          </div>
        )}
      </button>
      <p className="mkt-video-caption">
        {playing ? "Playing with sound, tap the frame to pause." : `${Math.round(durationSeconds)} seconds, plays only when you tap, uses your data.`}
      </p>
    </div>
  );
}
