import type { CSSProperties } from "react";

/**
 * The buyer protection reassurance, word for word wherever it appears. This
 * file is the ONLY place the sentence is written — everywhere else imports
 * it. Never reworded or varied per page, only ever reused verbatim (see
 * marketplace handoff §75, §76).
 *
 * Visual design per the Claude Design mobile marketplace design system
 * project ("Protection badge, three directions", §33a), direction B, the
 * explicit recommendation: a bordered card, shield leading in a solid
 * green-dark circle so it reads as an icon rather than a loose emoji, green
 * throughout so it never competes with the coral Buy/Pay button beside it.
 * Two size variants only, per that design's own implementation note —
 * `card` (listing detail, confirmation) and `card-row` (checkout, where
 * vertical space is tightest). No hover state, no tap target, no animation:
 * it renders once and sits still, reassurance rather than a call to action.
 *
 * `style` is for placement/context only (e.g. the confirmation page's white
 * flip against its green backdrop) — it never touches the wording, the
 * class, or the icon.
 */
export default function ProtectionBadge({ variant = "card", style }: {
  variant?: "card" | "card-row";
  style?: CSSProperties;
}) {
  return (
    <div className={`mkt-protection-badge mkt-protection-badge--${variant}`} style={style}>
      <span className="ic">🛡</span>
      <span className="txt">We refund you if it's not as described</span>
    </div>
  );
}
