import { useState } from "react";

/**
 * "Watch a video of this item", which PLAYS it rather than opening
 * something the buyer then has to start.
 *
 * AUTOPLAY. The tap is a real user gesture, so playback is permitted, but
 * an UNMUTED autoplay inside a cross-origin iframe is still refused by
 * Safari and by Chrome on Android in enough cases to matter, and a refusal
 * shows a dead player rather than a video. So it starts muted, which every
 * browser allows, and YouTube's own control unmutes it in one tap. A video
 * that always plays silently beats one that sometimes does not play at all,
 * and these clips are about whether the thing works rather than sound.
 *
 * The iframe is only created once the buyer taps, so nothing is fetched
 * from YouTube for the many visitors who never watch.
 */
export default function ListingVideoPlayer({ youtubeVideoId }: { youtubeVideoId: string }) {
  const [playing, setPlaying] = useState(false);

  if (!playing) {
    return (
      <button type="button" className="mkt-offer-entry" onClick={() => setPlaying(true)}>
        Watch a video of this item
      </button>
    );
  }

  const src =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeVideoId)}` +
    `?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`;

  return (
    <div className="mkt-listing-video">
      <iframe
        src={src}
        title="A video of this item"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <p className="mkt-listing-video-hint">Tap the speaker on the video for sound.</p>
    </div>
  );
}
