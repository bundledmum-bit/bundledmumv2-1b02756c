import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Starting points for the budget field, derived from what she has already
 * told us. The set (currently three: low / mid / high) and all of its copy
 * come from the database, so both can change without a deploy.
 *
 * Deliberately NOT a function of the amount she types — the query key is only
 * scope + stage, so typing never refetches this. It answers "where could I
 * start?", which does not change as she types.
 */
export interface BudgetSuggestion {
  key: string;          // 'low' | 'mid' | 'high'
  amount: number;
  label: string;
  sub: string;
  item_count: number;
  brand_tier: string;
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

// The tiers the three cards map to, in card order (low / mid / high). These
// strings are exactly what both RPCs use for a tier, so they double as the
// suggestions' brand_tier and as suggest_quiz_budget's p_budget_tier.
const BUDGET_TIERS = ["starter", "standard", "premium"] as const;
type BudgetTier = (typeof BUDGET_TIERS)[number];

/**
 * The engine-accurate suggested budget for one tier, from suggest_quiz_budget.
 * Derived from the engine's own floor (verified to always build a within-budget
 * complete list), so it replaces the older card amounts that could undershoot.
 * gender / multiples / hospital are asked AFTER the budget step, so — exactly
 * like quiz_budget_suggestions already does — we send engine defaults here.
 * Returns null on any error or a non-positive value, so the caller can fall
 * back to the existing card amount per tier and never render a blank.
 */
async function fetchSuggestedBudget(
  scope: string,
  stage: string,
  tier: BudgetTier,
): Promise<number | null> {
  try {
    const { data, error } = await (supabase as any).rpc("suggest_quiz_budget", {
      p_scope: scope,
      p_stage: stage,
      p_budget_tier: tier,
      p_gender: "neutral",
      p_multiples: 1,
      p_hospital_type: "both",
    });
    if (error) {
      console.warn(`[BudgetSuggestions] suggest_quiz_budget(${tier}) failed:`, error.message);
      return null;
    }
    const n = Number(data);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (e) {
    console.warn(`[BudgetSuggestions] suggest_quiz_budget(${tier}) threw:`, e);
    return null;
  }
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

  // Engine-accurate per-tier amounts, fetched once per scope+stage (never as she
  // types — no budget in the key). One suggest_quiz_budget call per tier, run in
  // parallel. Each resolves to null on failure so a single bad tier only falls
  // back that one card.
  const amountsQuery = useQuery({
    queryKey: ["suggest_quiz_budget", scope, stage],
    enabled: !!scope,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<Record<BudgetTier, number | null>> => {
      const [starter, standard, premium] = await Promise.all(
        BUDGET_TIERS.map((t) => fetchSuggestedBudget(scope as string, stage, t)),
      );
      return { starter, standard, premium };
    },
  });

  const data = query.data;
  // An unknown scope or a scope with no essentials comes back with an empty
  // array and no error — there is simply nothing to suggest.
  const base = data?.status === "ok" ? data.suggestions ?? [] : [];
  const amounts = amountsQuery.data;

  // Replace only the numeric amount per card, keyed by the card's own tier.
  // Everything else (key, label, sub, ordering) is untouched; a null/absent
  // engine amount keeps the existing quiz_budget_suggestions amount for that card.
  const suggestions = base.map((s) => {
    const suggested = amounts?.[s.brand_tier as BudgetTier];
    return typeof suggested === "number" && suggested > 0 ? { ...s, amount: suggested } : s;
  });

  return {
    suggestions,
    note: data?.status === "ok" ? data.note : null,
  };
}
