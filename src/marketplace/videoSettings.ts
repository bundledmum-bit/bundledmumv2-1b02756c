import { useQuery } from "@tanstack/react-query";
import { mdb } from "./data/mdb";

/**
 * Master switch for the optional listing video feature (handoff §87-91).
 * Paused as of 2026-08-18: video could not be made reliable on iPhone —
 * metadata reads failed even after every documented iOS fix, and
 * client-side compression cannot run on iOS at all, since WebKit has never
 * implemented captureStream(). Nothing was deleted; every part of the
 * feature (processing pipeline, iOS fixes, timeouts, the listing card)
 * stays in place, gated behind this one site_settings value, so turning it
 * back on needs no rebuild, just flipping the setting.
 *
 * Read live rather than hardcoded, same reasoning as every other
 * marketplace_* setting in this codebase (see policySettings.ts). Defaults
 * to false — not true — whenever the value hasn't resolved yet or fails to
 * read at all: while this query is loading, `data` is undefined and the
 * `?? false` below applies, so callers see "off" from the very first
 * render through to whatever the real value turns out to be. That means a
 * seller or buyer never sees the video control flash into view and then
 * disappear once the real value arrives — it simply never appears unless
 * the setting has already resolved to true. A broken flash is worse than a
 * feature that's briefly (or permanently) hidden.
 */
export function useMarketplaceVideoEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ["mkt-video-enabled"],
    queryFn: async (): Promise<boolean> => {
      const { data } = await mdb.from("site_settings").select("value").eq("key", "marketplace_video_enabled").maybeSingle();
      return (data as { value: unknown } | null)?.value === true;
    },
    staleTime: 60000,
  });
  return data ?? false;
}
