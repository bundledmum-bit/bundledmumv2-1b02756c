import type { CategoryVideoRule } from "../listingVideo";

/**
 * Whether a listing may be submitted without a video.
 *
 * Pulled out as a pure function ON PURPOSE. The requirement shipped twice
 * looking correct and not working, because the decision was spread across
 * three expressions in a 1500 line component where the only way to check it
 * was to read it. Here it can be run.
 *
 * THE BUG THIS EXISTS TO PREVENT: the old code computed
 * `!!videoRule?.video_required`, which is false while the rule is still
 * loading AND false if the lookup failed. "We do not know yet" and "not
 * required" were the same value, so a seller who submitted before the rule
 * arrived, or whose lookup failed, sailed through with no block, no
 * message, no escape link and no guidance. All four vanish together because
 * all four hang off that one flag.
 *
 * So "unknown" is now its own answer, and it does NOT mean allow.
 */
export type VideoGate =
  /** Submit is fine: not a required category, already has one, or skipped. */
  | { decision: "allow" }
  /** Required, none attached, not skipped. Show the popup. */
  | { decision: "block"; reason: string; guidance: string | null; categoryName: string | null }
  /** The rule has not arrived. Never silently allow; wait, then re-ask. */
  | { decision: "unknown" };

export function videoGate(input: {
  isEditMode: boolean;
  /** undefined while loading, null if the lookup failed. */
  rule: CategoryVideoRule | null | undefined;
  categoryId: string;
  hasVideo: boolean;
  skipped: boolean;
}): VideoGate {
  // Editing NEVER demands a video. 56 live listings sit in required
  // categories with none, and a seller fixing a typo must not be blocked.
  if (input.isEditMode) return { decision: "allow" };
  // No category chosen yet: an earlier check in submit() catches that and
  // says so, which is a better message than this one would be.
  if (!input.categoryId) return { decision: "allow" };
  if (input.hasVideo || input.skipped) return { decision: "allow" };
  if (input.rule === undefined || input.rule === null) return { decision: "unknown" };
  if (!input.rule.video_required) return { decision: "allow" };
  return {
    decision: "block",
    reason: input.rule.video_block_reason
      || "Buyers cannot tell from a photo whether this still works. A few seconds of video is what sells it.",
    guidance: input.rule.video_guidance,
    categoryName: input.rule.category_name,
  };
}
