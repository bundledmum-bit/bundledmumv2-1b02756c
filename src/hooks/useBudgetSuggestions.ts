import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Two starting points for the budget field, derived from what she has already
 * told us: enough for the most important items, and enough for the complete
 * essentials list.
 *
 * Deliberately NOT a function of the amount she types — the query key is only
 * scope + stage, so typing never refetches this. It answers "where could I
 * start?", which does not change as she types.
 */
export interface BudgetSuggestion {
  key: string;
  amount: number;
  label: string;
  item_count: number;
  reason: string;
}

export interface BudgetSuggestions {
  scope: string;
  stage: string;
  status: "ok" | "unknown_scope" | "no_essentials";
  list_name: string | null;
  essentials_count: number;
  /** Editable in the database so the wording can change without a deploy. */
  note: string | null;
  suggestions: BudgetSuggestion[];
}

export function useBudgetSuggestions(scope: string | null, stage: string = "expecting") {
  const query = useQuery({
    // No budget in the key: this must not refetch as she types.
    queryKey: ["quiz_budget_suggestions", scope, stage],
    enabled: !!scope,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("quiz_budget_suggestions", {
        p_scope: scope,
        p_stage: stage,
        // The hospital / delivery / multiples questions come after the budget
        // step, so their engine defaults are the honest values to send.
        p_hospital_type: "both",
        p_delivery_method: "both",
        p_multiples: 1,
      });
      if (error) {
        console.warn("[BudgetSuggestions] quiz_budget_suggestions failed:", error.message);
        return null;
      }
      return (data as unknown as BudgetSuggestions) ?? null;
    },
  });

  const data = query.data;
  return {
    // An unknown scope or a scope with no essentials comes back with an empty
    // array and no error — there is simply nothing to suggest.
    suggestions: data?.status === "ok" ? data.suggestions ?? [] : [],
    note: data?.status === "ok" ? data.note : null,
  };
}
