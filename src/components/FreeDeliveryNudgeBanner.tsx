import { useFreeDeliveryThresholds, findNextThreshold } from "@/hooks/useFreeDeliveryThresholds";

type Props = {
  cartSubtotal: number;
  /** Pass null on pages where the customer hasn't picked a state yet
   *  (e.g. the cart page) — only nationwide rules will then apply. */
  deliveryState?: string | null;
  /** Extra wrapper classes, e.g. mb-3 inside the cart sidebar. */
  className?: string;
};

/**
 * Customer-facing "spend ₦X more for free delivery" nudge. Reads from
 * the admin-managed free_delivery_thresholds table via the shared
 * hook; renders nothing when the customer already qualifies for the
 * next tier, or when their cart is below the
 * banner_display_threshold_pct% trigger point.
 */
export function FreeDeliveryNudgeBanner({
  cartSubtotal,
  deliveryState = null,
  className = "",
}: Props) {
  const { data: thresholds } = useFreeDeliveryThresholds();
  const next = findNextThreshold(thresholds, cartSubtotal, deliveryState);
  if (!next) return null;

  const minVisibleAt = next.threshold_amount * (next.banner_display_threshold_pct / 100);
  if (cartSubtotal < minVisibleAt) return null;

  const remaining = Math.max(0, next.threshold_amount - cartSubtotal);
  const message = (next.progress_template || "Add ₦{remaining} more to qualify!")
    .replace("{remaining}", remaining.toLocaleString("en-NG"));

  return (
    <div className={`rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 ${className}`}>
      <p className="text-emerald-900 text-sm font-medium">{message}</p>
      {next.marketing_copy && (
        <p className="text-emerald-700 text-xs mt-1">{next.marketing_copy}</p>
      )}
    </div>
  );
}

export default FreeDeliveryNudgeBanner;
