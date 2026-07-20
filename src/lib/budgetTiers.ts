/**
 * Budget tier classifier for the quiz recommendation engine (v4.8).
 *
 * Source of truth for tier boundaries on the frontend. Mirrors the
 * `run_quiz_recommendation` RPC's `p_budget_tier` contract.
 *
 * Boundaries match each tier's REAL capacity against the live catalogue,
 * and are kept in exact lockstep with the run_quiz_recommendation engine
 * brackets so the frontend and backend agree on which tier a budget gets:
 *
 *   starter  up to ₦265,000        (core essentials floor ~₦178,000)
 *   standard ₦265,001 – ₦655,000
 *   premium  ₦655,001 and above
 *
 * A starter bundle physically maxes out around ₦265,000, so a 400k budget
 * must classify as 'standard' (not 'starter') to spend the full amount.
 * Only the .max values (265000 / 655000) are the classification cut points;
 * starter.min stays the essentials floor and premium.max is the input cap.
 */

export const TIER_RANGES = {
  starter:  { min: 178000,  max: 265000,   minItems: 28, maxItems: 45 },
  standard: { min: 265001,  max: 655000,   minItems: 45, maxItems: 75 },
  premium:  { min: 655001,  max: 2500000,  minItems: 75, maxItems: 130 },
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
