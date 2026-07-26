import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Honest budget guidance for the maternity / baby paths.
 *
 * Everything here is computed live by quiz_budget_guidance from current
 * prices — the recommended minimum is NEVER hardcoded, so it moves when the
 * catalogue moves. Deliberately not called on the gift path, which has its
 * own floor and no notion of an essentials list.
 */

export interface GuidanceItem {
  name: string;
  slug: string | null;
  quantity: number;
  price: number;
}

export type GuidanceStatus =
  | "no_budget_given"
  | "too_low"
  | "partial_good"
  | "covers_essentials";

export interface BudgetGuidance {
  scope: string;
  stage: string;
  budget_amount: number;
  essentials_count: number;
  essentials_cost: number;
  recommended_minimum: number;
  affordable_count: number;
  affordable_cost: number;
  coverage_pct: number;
  shortfall: number;
  covers_essentials: boolean;
  status: GuidanceStatus;
  would_cover: GuidanceItem[];
  would_miss: GuidanceItem[];
}

/**
 * @param scope   the scope she has already chosen — null disables the query
 * @param budget  the naira amount typed so far
 * @param stage   'expecting' | 'newborn'
 *
 * The amount is debounced (500ms) so typing "150000" is one call, not six.
 * The query itself is keyed on the debounced value, so React Query dedupes
 * and caches repeats (going back and forth between steps costs nothing).
 */
export function useBudgetGuidance(
  scope: string | null,
  budget: number,
  stage: string = "expecting",
) {
  const [debouncedBudget, setDebouncedBudget] = useState(budget);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedBudget(budget), 500);
    return () => window.clearTimeout(id);
  }, [budget]);

  const query = useQuery({
    queryKey: ["quiz_budget_guidance", scope, debouncedBudget, stage],
    enabled: !!scope && debouncedBudget > 0,
    staleTime: 5 * 60 * 1000,
    // An unknown scope now RAISES in the function rather than returning
    // figures for the wrong list. That is a bug on our side, not something to
    // put in front of a customer, so a failure resolves to null and the panel
    // simply does not render. One retry only, since a bad scope will never
    // succeed on a repeat.
    retry: 1,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("quiz_budget_guidance", {
        p_scope: scope,
        p_stage: stage,
        p_budget_amount: debouncedBudget,
        // The hospital / delivery / multiples questions come AFTER the budget
        // step, so their engine defaults are the honest values to send here.
        p_hospital_type: "both",
        p_delivery_method: "both",
        p_multiples: 1,
      });
      if (error) {
        console.warn("[BudgetGuidance] quiz_budget_guidance failed:", error.message);
        return null;
      }
      return (data as unknown as BudgetGuidance) ?? null;
    },
  });

  return {
    guidance: query.data ?? null,
    // True while the typed amount has not yet reached the server, so the UI
    // can hold the previous answer instead of flashing. Never true once the
    // query has settled — including when it failed — so a failure hides the
    // panel outright instead of leaving a "checking…" line on screen.
    isSettling: !query.isError && (debouncedBudget !== budget || query.isFetching),
  };
}
