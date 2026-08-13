import { Star } from "lucide-react";

/**
 * Clickable 1-5 star rating input, shared by the buyer and seller review
 * blocks (this codebase had no reusable star INPUT anywhere before this —
 * every existing star was read-only, storefront ratings display). Filled
 * stars use brand coral, matching that same existing read-only convention
 * (fill-coral/text-coral) rather than inventing a new colour language for
 * ratings. Each star is a real 44px button (mobile-first, sellers manage
 * listings from their phones), with proper radio-group semantics for
 * screen readers and keyboard users.
 */
export default function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Rating, 1 to 5 stars" style={{ display: "flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={filled}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            style={{
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              padding: 0,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            <Star
              size={28}
              strokeWidth={1.5}
              style={{
                fill: filled ? "var(--mkt-coral)" : "transparent",
                color: filled ? "var(--mkt-coral)" : "var(--mkt-border)",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
