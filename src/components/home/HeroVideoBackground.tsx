import { useEffect, useRef } from "react";

/**
 * Seamless YouTube ambient background.
 *
 * Why not just use ?loop=1&playlist=ID ?
 *   YouTube's native loop reloads the player at the end of every cycle,
 *   which briefly shows the loading spinner / related-videos UI. To avoid
 *   that flash we drive the player with the IFrame API and manually seek
 *   back to the start ~0.4s before the end — the viewer never sees the
 *   end-of-video chrome.
 */
export default function HeroVideoBackground({ videoId }: { videoId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    let pollId: number | undefined;

    const ensureApi = () =>
      new Promise<void>((resolve) => {
        const w = window as any;
        if (w.YT && w.YT.Player) return resolve();
        const existing = document.querySelector<HTMLScriptElement>(
          'script[src="https://www.youtube.com/iframe_api"]',
        );
        const prev = w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady = () => {
          if (typeof prev === "function") {
            try { prev(); } catch { /* ignore */ }
          }
          resolve();
        };
        if (!existing) {
          const tag = document.createElement("script");
          tag.src = "https://www.youtube.com/iframe_api";
          document.head.appendChild(tag);
        }
      });

    ensureApi().then(() => {
      if (cancelled || !containerRef.current) return;
      const w = window as any;
      playerRef.current = new w.YT.Player(containerRef.current, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          showinfo: 0,
          modestbranding: 1,
          rel: 0,
          disablekb: 1,
          playsinline: 1,
          iv_load_policy: 3,
          fs: 0,
          cc_load_policy: 0,
        },
        events: {
          onReady: (e: any) => {
            try {
              e.target.mute();
              e.target.playVideo();
            } catch { /* ignore */ }
            // Poll the current time and seek back before the end so the
            // end-screen / spinner never has a chance to render.
            pollId = window.setInterval(() => {
              const p = playerRef.current;
              if (!p || typeof p.getDuration !== "function") return;
              const dur = p.getDuration();
              const cur = p.getCurrentTime();
              if (dur > 0 && cur >= dur - 0.4) {
                p.seekTo(0, true);
                p.playVideo();
              }
            }, 250);
          },
          onStateChange: (e: any) => {
            // Defensive: if the player ever ends, immediately restart.
            if (e.data === 0) {
              try {
                e.target.seekTo(0, true);
                e.target.playVideo();
              } catch { /* ignore */ }
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
      try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
    };
  }, [videoId]);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      // @ts-expect-error inert is a valid HTML attribute
      inert=""
      aria-hidden="true"
besides
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.77vh] h-[56.25vw] min-w-full min-h-full pointer-events-none [&_iframe]:pointer-events-none [&_iframe]:select-none"
        style={{ pointerEvents: "none" }}
      />
      {/* Shield blocks all hover/click/focus interactions with the YouTube iframe,
          which is what triggers the title bar, pause button, and channel name. */}
      <div
        className="absolute inset-0 z-10 pointer-events-auto cursor-default"
        aria-hidden="true"
        onClick={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      />
    </div>
  );
}
