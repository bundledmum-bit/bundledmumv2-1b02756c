import { useEffect, useRef, useState } from "react";

/**
 * Seamless YouTube ambient background.
 *
 * Strategy to hide ALL YouTube chrome (title, play button, channel name,
 * "Watch on YouTube"):
 *  1. Scale the iframe ~135% and let the parent's overflow-hidden crop
 *     the title bar (top) and watermark/channel (bottom) outside view.
 *  2. Keep the iframe at opacity-0 until the player reports PLAYING,
 *     so the initial play-button / poster flash never renders.
 *  3. Loop ~1s before the end so the end-screen never appears.
 *  4. A pointer-events shield blocks hover/tap that would summon chrome.
 */
export default function HeroVideoBackground({ videoId }: { videoId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [visible, setVisible] = useState(false);

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
            pollId = window.setInterval(() => {
              const p = playerRef.current;
              if (!p || typeof p.getDuration !== "function") return;
              const dur = p.getDuration();
              const cur = p.getCurrentTime();
              if (dur > 0 && cur >= dur - 1.0) {
                p.seekTo(0, true);
                p.playVideo();
              }
            }, 250);
          },
          onStateChange: (e: any) => {
            if (e.data === 1) {
              // PLAYING — safe to reveal
              setVisible(true);
            }
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
      className="absolute inset-0 overflow-hidden pointer-events-none select-none bg-black"
      // @ts-expect-error inert is a valid HTML attribute
      inert=""
      aria-hidden="true"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.77vh] h-[56.25vw] min-w-full min-h-full pointer-events-none transition-opacity duration-700 [&_iframe]:pointer-events-none [&_iframe]:select-none ${visible ? "opacity-100" : "opacity-0"}`}
        style={{ pointerEvents: "none", transform: "translate(-50%, -50%) scale(1.35)" }}
      />
      {/* Shield blocks all hover/click/focus interactions with the YouTube iframe. */}
      <div
        className="absolute inset-0 z-10 pointer-events-auto cursor-default"
        aria-hidden="true"
        onClick={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      />
    </div>
  );
}
