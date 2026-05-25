import { useFreeDeliveryThreshold } from "@/hooks/useFreeDeliveryThresholds";

type Props = {
  cartSubtotal: number;
  /** 'Lagos' | 'Abuja (FCT)' | … — null/empty on pages where the
   *  customer hasn't picked a state yet (e.g. /cart). */
  deliveryState?: string | null;
  /** The city/area string the customer picked — used to disambiguate
   *  which Lagos zone applies (Island vs Mainland vs Ikorodu). */
  deliveryCity?: string | null;
  /** Optional explicit zone label, when the address form lets the user
   *  pick a zone directly. */
  deliveryZoneName?: string | null;
  /** Extra wrapper classes, e.g. mb-3 inside the cart sidebar. */
  className?: string;
};

/**
 * Customer-facing "spend ₦X more for free delivery" nudge.
 *
 * Source of truth:
 *   - Lagos customers → shipping_zones.free_delivery_threshold for the
 *     matched zone (Island, Mainland, Ikorodu, …).
 *   - Non-Lagos customers → free_delivery_thresholds row with
 *     scope='nationwide'.
 *   - Before the customer picks a state, the resolver returns
 *     source='unknown' and we render nothing — the cart page would
 *     otherwise have to guess which threshold to promise.
 *
 * The banner hides when there is no actionable nudge (already qualified
 * or no threshold configured).
 */
export function FreeDeliveryNudgeBanner({
  cartSubtotal,
  deliveryState = null,
  deliveryCity = null,
  deliveryZoneName = null,
  className = "",
}: Props) {
  const result = useFreeDeliveryThreshold({
    cartSubtotal,
    deliveryState,
    deliveryCity,
    deliveryZoneName,
  });

  // Nothing useful to say yet (state unknown or no configured threshold).
  if (result.source === "unknown") return null;
  // No nudge when the cart is empty.
  if (cartSubtotal <= 0) return null;
  // Already qualified — don't keep nagging.
  if (result.qualifies) return null;

  return (
    <div
      className={`rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 ${className}`}
      role="status"
      aria-live="polite"
    >
      <p className="text-emerald-900 text-sm font-medium">{result.progressText}</p>
      {result.label && (
        <p className="text-emerald-700 text-xs mt-1">{result.label}</p>
      )}
      <div
        className="mt-2 h-1.5 rounded-full bg-emerald-100 overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="h-full bg-emerald-500 transition-[width] duration-300"
          style={{ width: `${result.progressPct}%` }}
        />
      </div>
    </div>
  );
}

export default FreeDeliveryNudgeBanner;
