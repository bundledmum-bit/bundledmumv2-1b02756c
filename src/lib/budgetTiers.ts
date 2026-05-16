/**
 * Budget tier classifier for the quiz recommendation engine (v4.8).
 *
 * Source of truth for tier boundaries on the frontend. Mirrors the
 * `run_quiz_recommendation` RPC's `p_budget_tier` contract.
 *
 *   starter  ₦178,000 – ₦400,000   (28-45 items)
 *   standard ₦400,001 – ₦900,000   (45-75 items)
 *   premium  ₦900,001 – ₦2,500,000 (75-130 items)
 */

export const TIER_RANGES = {
  starter:  { min: 178000,  max: 400000,   minItems: 28, maxItems: 45 },
  standard: { min: 400001,  max: 900000,   minItems: 45, maxItems: 75 },
  premium:  { min: 900001,  max: 2500000,  minItems: 75, maxItems: 130 },
} as const;

export type BudgetTier = "starter" | "standard" | "premium";

/** Classify a naira amount into a quiz tier. */
export function getBudgetTier(amount: number): BudgetTier {
  if (amount <= TIER_RANGES.starter.max) return "starter";
  if (amount <= TIER_RANGES.standard.max) return "standard";
  return "premium";
}

/**
 * True if the budget is positive but below the starter floor — the
 * engine will still return a starter bundle, but it may not include
 * every hospital essential at this price point.
 */
export function isBelowEssentialsFloor(amount: number): boolean {
  return amount > 0 && amount < TIER_RANGES.starter.min;
}

/** Convenience hard-min for budget inputs across the storefront. */
export const ESSENTIALS_FLOOR = TIER_RANGES.starter.min;
export const BUDGET_MAX = TIER_RANGES.premium.max;
export const BUDGET_DEFAULT = 300000;
