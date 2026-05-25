import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useShippingZones, type ShippingZone } from "./useShippingZones";

export type FreeDeliveryThreshold = {
  id: string;
  name: string;
  threshold_amount: number;
  scope: "lagos" | "nationwide" | "specific_states";
  applicable_states: string[] | null;
  customer_pays_fee: number;
  delivery_label: string;
  helper_text: string | null;
  marketing_copy: string | null;
  progress_template: string;
  banner_display_threshold_pct: number;
  is_active: boolean;
  display_order: number;
};

/**
 * Pulls the live, active free-delivery rules. Shared by the storefront
 * checkout + cart pages. Admin CRUD lives at /admin/promotions; this
 * hook ignores inactive rows so toggling one off in admin removes it
 * from customer flows on next refetch.
 */
export function useFreeDeliveryThresholds() {
  return useQuery({
    queryKey: ["free_delivery_thresholds"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("free_delivery_thresholds")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as FreeDeliveryThreshold[];
    },
    staleTime: 60_000,
  });
}

/**
 * Pick the nearest threshold the customer can still earn by spending
 * more. Filters by scope first (Lagos rules only apply when the
 * delivery state is Lagos; specific_states rules only when the state
 * is in their allowlist; nationwide always applies), then returns the
 * smallest unmet threshold so the nudge always shows the closest goal.
 */
export function findNextThreshold(
  thresholds: FreeDeliveryThreshold[] | undefined,
  cartSubtotal: number,
  deliveryState: string | null,
): FreeDeliveryThreshold | null {
  if (!thresholds || cartSubtotal <= 0) return null;

  const eligibleByState = thresholds.filter((t) => {
    if (t.scope === "lagos") return deliveryState === "Lagos";
    if (t.scope === "nationwide") return true;
    if (t.scope === "specific_states") {
      return !!deliveryState && (t.applicable_states || []).includes(deliveryState);
    }
    return false;
  });

  const notYetCrossed = eligibleByState
    .filter((t) => cartSubtotal < t.threshold_amount)
    .sort((a, b) => a.threshold_amount - b.threshold_amount);

  return notYetCrossed[0] || null;
}

// ─────────────────────────────────────────────────────────────────────
// State-aware threshold resolver.
//
// After the DB cleanup, free_delivery_thresholds holds ONLY the
// nationwide promotional row. Lagos zone thresholds live (and are
// edited) in shipping_zones — one row per Lagos zone, each with its
// own free_delivery_threshold. This hook routes the customer to the
// correct source of truth based on their delivery state:
//
//   Lagos   → match shipping_zones by explicit zone name, then by
//             city/area, then a Mainland fallback. Use that zone's
//             free_delivery_threshold.
//   Other   → use the single free_delivery_thresholds row with
//             scope='nationwide'.
//   Unknown → return source='unknown' and let the caller decide
//             whether to render anything.
// ─────────────────────────────────────────────────────────────────────

export type FreeDeliverySource = "lagos_zone" | "nationwide" | "unknown";

export interface UseFreeDeliveryThresholdArgs {
  /** 'Lagos' | 'Abuja (FCT)' | ... — null/empty until the customer picks. */
  deliveryState?: string | null;
  /** The city/area string from the address form (matches shipping_zones.areas). */
  deliveryCity?: string | null;
  /** Optional explicit zone label ('Island' | 'Mainland' | 'Ikorodu' etc). */
  deliveryZoneName?: string | null;
  /** Cart subtotal in naira, BEFORE delivery fees. */
  cartSubtotal: number;
}

export interface FreeDeliveryThresholdResult {
  /** Naira amount the customer must reach for free delivery. 0 when source='unknown'. */
  threshold: number;
  qualifies: boolean;
  amountRemaining: number;
  /** Marketing copy chosen by source. */
  label: string;
  helperText: string;
  /** Resolved "Add ₦X for free delivery" string. */
  progressText: string;
  /** 0–100; clamps to 100 when qualifies. */
  progressPct: number;
  source: FreeDeliverySource;
  /** Filled when source='lagos_zone' so the banner can render "FREE Island delivery". */
  zoneName: string | null;
}

function pickLagosZone(
  zones: ShippingZone[] | undefined,
  city: string | null | undefined,
  zoneName: string | null | undefined,
): ShippingZone | null {
  if (!zones || zones.length === 0) return null;
  const lagosZones = zones.filter(
    (z) => (z.states || []).some((s) => s.toLowerCase() === "lagos"),
  );
  if (lagosZones.length === 0) return null;

  // 1. Explicit zone name match
  if (zoneName) {
    const byName = lagosZones.find((z) => z.name.toLowerCase() === zoneName.toLowerCase());
    if (byName) return byName;
  }
  // 2. City/area match against zone.areas
  if (city) {
    const c = city.toLowerCase();
    const byArea = lagosZones.find((z) => (z.areas || []).some((a) => a.toLowerCase() === c));
    if (byArea) return byArea;
  }
  // 3. Mainland default — same fallback the get_courier_assignment RPC uses
  const mainland = lagosZones.find((z) => z.name.toLowerCase().includes("mainland"));
  if (mainland) return mainland;
  // 4. Cheapest zone as a final safety net
  return [...lagosZones].sort((a, b) => (a.flat_rate || 0) - (b.flat_rate || 0))[0] || null;
}

export function useFreeDeliveryThreshold(args: UseFreeDeliveryThresholdArgs): FreeDeliveryThresholdResult {
  const { deliveryState, deliveryCity, deliveryZoneName, cartSubtotal } = args;
  const { data: zones } = useShippingZones();
  const { data: thresholds } = useFreeDeliveryThresholds();

  return useMemo<FreeDeliveryThresholdResult>(() => {
    const subtotal = Math.max(0, Number(cartSubtotal) || 0);
    const stateLc = (deliveryState || "").trim().toLowerCase();

    // Lagos branch — read from shipping_zones.
    if (stateLc === "lagos") {
      const zone = pickLagosZone(zones, deliveryCity || null, deliveryZoneName || null);
      const threshold = Number(zone?.free_delivery_threshold ?? 0) || 0;
      if (zone && threshold > 0) {
        const remaining = Math.max(0, threshold - subtotal);
        const qualifies = subtotal >= threshold;
        const zoneLabel = zone.name;
        return {
          threshold,
          qualifies,
          amountRemaining: remaining,
          label: `FREE ${zoneLabel} delivery on orders ₦${threshold.toLocaleString("en-NG")}+`,
          helperText: `Delivery within ${zone.estimated_days_min}–${zone.estimated_days_max} days`,
          progressText: qualifies
            ? `🎉 You've unlocked FREE ${zoneLabel} delivery`
            : `Add ₦${remaining.toLocaleString("en-NG")} for FREE ${zoneLabel} delivery`,
          progressPct: qualifies ? 100 : Math.min(100, Math.round((subtotal / threshold) * 100)),
          source: "lagos_zone",
          zoneName: zoneLabel,
        };
      }
      // Lagos but the zone has no threshold configured — treat as unknown
      // so the banner falls silent rather than promising free delivery
      // we can't honour.
      return emptyResult("unknown", subtotal);
    }

    // Non-Lagos branch — nationwide promo row.
    if (stateLc) {
      const nationwide = (thresholds || []).find((t) => t.scope === "nationwide" && t.is_active);
      const threshold = Number(nationwide?.threshold_amount ?? 0) || 0;
      if (nationwide && threshold > 0) {
        const remaining = Math.max(0, threshold - subtotal);
        const qualifies = subtotal >= threshold;
        const progressTemplate = nationwide.progress_template || "Add ₦{remaining} for FREE nationwide delivery";
        return {
          threshold,
          qualifies,
          amountRemaining: remaining,
          label: nationwide.marketing_copy || `FREE nationwide delivery on orders ₦${threshold.toLocaleString("en-NG")}+`,
          helperText: nationwide.helper_text || "",
          progressText: qualifies
            ? "🎉 You've unlocked FREE nationwide delivery"
            : progressTemplate.replace("{remaining}", remaining.toLocaleString("en-NG")),
          progressPct: qualifies ? 100 : Math.min(100, Math.round((subtotal / threshold) * 100)),
          source: "nationwide",
          zoneName: null,
        };
      }
      return emptyResult("unknown", subtotal);
    }

    // No state — Cart page before address. Tell the banner to stay quiet
    // (or render a generic placeholder if the consumer prefers).
    return emptyResult("unknown", subtotal);
  }, [zones, thresholds, deliveryState, deliveryCity, deliveryZoneName, cartSubtotal]);
}

function emptyResult(source: FreeDeliverySource, _subtotal: number): FreeDeliveryThresholdResult {
  return {
    threshold: 0,
    qualifies: false,
    amountRemaining: 0,
    label: "",
    helperText: "",
    progressText: "",
    progressPct: 0,
    source,
    zoneName: null,
  };
}
