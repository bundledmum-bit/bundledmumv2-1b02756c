import { supabase } from "@/integrations/supabase/client";

/**
 * Quiz session tracking.
 *
 * The old implementation wrote to quiz_sessions directly and silently did
 * nothing: the table has an INSERT policy and an admin SELECT policy but NO
 * update policy, so every update matched zero rows, and the insert's
 * `.select("id")` was blocked too, so the row id was never captured. Commit
 * 2aef147 (18 Apr) then deleted the code entirely. Everything here goes
 * through the SECURITY DEFINER RPCs instead, which need no table grants.
 *
 * Two ids, deliberately:
 *   bm_quiz_attempt_id  — the CURRENT attempt. Rotated every time she starts
 *                         the quiz from the beginning, so each attempt gets
 *                         its own quiz_sessions / quiz_customers row.
 *   bm_quiz_session_id  — the attempt that last produced a lead. CheckoutPage
 *                         reads this key to attribute an order, so it is only
 *                         promoted at submit time (see promoteAttempt), never
 *                         on a fresh start. Without that split, starting a
 *                         second quiz and abandoning it would point checkout
 *                         at an empty row and lose the attribution.
 */

const ATTEMPT_KEY = "bm_quiz_attempt_id";
const ATTRIBUTION_KEY = "bm_quiz_session_id";

function newId(): string {
  if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID();
  }
  return `quiz_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Mint a fresh attempt id. Call when the customer starts the quiz over. */
export function startQuizAttempt(): string {
  const id = newId();
  try { localStorage.setItem(ATTEMPT_KEY, id); } catch { /* private mode */ }
  return id;
}

/** The in-flight attempt id, minting one if this is a cold start. */
export function currentQuizAttemptId(): string {
  try {
    const existing = localStorage.getItem(ATTEMPT_KEY);
    if (existing) return existing;
  } catch { /* ignore */ }
  return startQuizAttempt();
}

/**
 * Point the checkout attribution key at this attempt. Called once the attempt
 * has actually produced a lead row, so CheckoutPage never attributes an order
 * to an abandoned attempt.
 */
export function promoteAttemptToAttributed(sessionId: string): void {
  if (!sessionId) return;
  try { localStorage.setItem(ATTRIBUTION_KEY, sessionId); } catch { /* ignore */ }
}

export interface QuizTrackPayload {
  sessionId: string;
  currentStep?: string | null;
  answers?: Record<string, any> | null;
  shopperType?: string | null;
  stepsCompleted?: string[] | null;
  engineVersion?: string | null;
}

/**
 * Record progress through the quiz. Never throws and never blocks the UI:
 * callers invoke it without awaiting, and every failure path is logged here
 * rather than swallowed. The RPC returns false (not an error) on invalid
 * input, so that case is logged too.
 */
export async function trackQuizSession(p: QuizTrackPayload): Promise<boolean> {
  if (!p.sessionId || p.sessionId.length < 8) {
    console.warn("[QuizSession] track skipped: session id too short", p.sessionId);
    return false;
  }
  try {
    const { data, error } = await (supabase as any).rpc("track_quiz_session", {
      p_session_id: p.sessionId,
      p_current_step: p.currentStep ?? null,
      p_answers: p.answers ?? null,
      p_shopper_type: p.shopperType ?? null,
      p_steps_completed: p.stepsCompleted ?? null,
      p_engine_version: p.engineVersion ?? null,
    });
    if (error) {
      console.warn("[QuizSession] track_quiz_session failed:", error.message);
      return false;
    }
    if (data === false) {
      console.warn("[QuizSession] track_quiz_session rejected the payload", {
        step: p.currentStep,
      });
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[QuizSession] track_quiz_session threw:", err);
    return false;
  }
}

export interface QuizCompletePayload {
  sessionId: string;
  resultTier?: string | null;
  resultProductIds?: string[] | null;
  resultProductCount?: number | null;
  resultBundleSlug?: string | null;
  answers?: Record<string, any> | null;
  shopperType?: string | null;
  engineVersion?: string | null;
}

/** Mark the attempt complete once the engine has returned a recommendation. */
export async function completeQuizSession(p: QuizCompletePayload): Promise<boolean> {
  if (!p.sessionId || p.sessionId.length < 8) {
    console.warn("[QuizSession] complete skipped: session id too short", p.sessionId);
    return false;
  }
  try {
    const { data, error } = await (supabase as any).rpc("complete_quiz_session", {
      p_session_id: p.sessionId,
      p_result_tier: p.resultTier ?? null,
      // The RPC caps this at 400 ids; trim here so a huge bundle can't get the
      // whole call rejected.
      p_result_product_ids: p.resultProductIds ? p.resultProductIds.slice(0, 400) : null,
      p_result_product_count: p.resultProductCount ?? null,
      p_result_bundle_slug: p.resultBundleSlug ?? null,
      p_answers: p.answers ?? null,
      p_shopper_type: p.shopperType ?? null,
      p_engine_version: p.engineVersion ?? null,
    });
    if (error) {
      console.warn("[QuizSession] complete_quiz_session failed:", error.message);
      return false;
    }
    if (data === false) {
      console.warn("[QuizSession] complete_quiz_session rejected the payload");
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[QuizSession] complete_quiz_session threw:", err);
    return false;
  }
}
