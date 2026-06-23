// Shared positioning for the floating storefront prompts (push opt-in card +
// PWA install banner). The position is admin-editable via site_settings
// (push_optin_position / pwa_install_position).

export const PROMPT_POSITIONS = [
  "bottom-right",
  "bottom-left",
  "bottom-center",
  "top-right",
  "top-left",
  "top-center",
  "center",
] as const;

export type PromptPosition = (typeof PROMPT_POSITIONS)[number];

export const DEFAULT_PROMPT_POSITION: PromptPosition = "bottom-center";

/** Coerce any stored value to a valid position, defaulting to bottom-center. */
export function normalizePosition(v: unknown): PromptPosition {
  const s = String(v || "").trim();
  return (PROMPT_POSITIONS as readonly string[]).includes(s) ? (s as PromptPosition) : DEFAULT_PROMPT_POSITION;
}

/**
 * Full-viewport, click-through wrapper that anchors its (pointer-events-auto)
 * child to the requested corner/edge/centre. Extra bottom padding clears the
 * mobile bottom nav for bottom positions. All class strings are written as
 * literals so Tailwind's scanner keeps them.
 */
export function promptWrapperClasses(pos: PromptPosition): string {
  const vertical = pos.startsWith("top") ? "items-start" : pos === "center" ? "items-center" : "items-end";
  const horizontal = pos.endsWith("left")
    ? "justify-start"
    : pos.endsWith("right")
      ? "justify-end"
      : "justify-center";
  // Larger bottom inset on mobile so bottom-anchored prompts clear the bottom nav.
  return `fixed inset-0 z-[60] pointer-events-none flex ${vertical} ${horizontal} px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:pb-4`;
}
