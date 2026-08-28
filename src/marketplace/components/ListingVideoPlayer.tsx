import { useState } from "react";

/**
 * The listing video, design 37a, reusing ListingVideoCard's approved
 * treatment exactly: the same .mkt-video-card block, the same
 * "🎥 Watch a video of this item" header, the same .mkt-video-frame resting
 * state with its scrim, play control and "Tap to play", and the same
 * caption line.
 *
 * THE ONLY CHANGE IS WHAT HAPPENS WHEN IT PLAYS: a YouTube embed instead of
 * a local file. Nothing is fetched from YouTube until the tap, so the
 * resting state costs a thumbnail and nothing else.
 *
 * Two things from the old card could not come back, both because they
 * required READING the video file, which is what killed this feature twice:
 * the duration badge and the custom progress/pause controls. The duration
 * came from the stored video_duration_seconds, which only existed because
 * the old pipeline read it; the controls belong to YouTube's own player
 * now. The poster survives because YouTube supplies a thumbnail.
 *
 * AUTOPLAY: the tap is a real user gesture so playback is permitted, but an
 * unmuted autoplay in a cross-origin iframe is still refused often enough
 * by Safari and Android Chrome to show a dead player, so it starts muted
 * and says so. A video that always plays beats one that sometimes does not.
 */
export default function ListingVideoPlayer({ youtubeVideoId }: { youtubeVideoId: string }) {
  const [playing, setPlaying] = useState(false);
  const id = encodeURIComponent(youtubeVideoId);
  const poster = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  return (
    <div className="mkt-video-card">
      <div className="mkt-video-h">🎥 Watch a video of this item</div>

      {playing ? (
        <div className="mkt-video-frame mkt-video-frame-embed">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`}
            title="A video of this item"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <button type="button" className="mkt-video-frame" onClick={() => setPlaying(true)} aria-label="Play video">
          <img src={poster} alt="" className="mkt-video-poster" loading="lazy" />
          <div className="scrim" />
          <div className="play"><span /></div>
          <span className="tap">Tap to play</span>
        </button>
      )}

      <p className="mkt-video-caption">
        {playing
          ? "Tap the speaker on the video for sound."
          : "Plays only when you tap, uses your data."}
      </p>
    </div>
  );
}
