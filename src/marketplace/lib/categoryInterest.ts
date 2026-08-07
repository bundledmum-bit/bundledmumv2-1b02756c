import { mdb } from "../data/mdb";

/**
 * The register_category_interest RPC is silently idempotent, it always
 * succeeds for a repeat (email, category) pair rather than erroring, so
 * this file can't tell first-time from repeat by the response alone. That
 * distinction — used to show the "already watching" state on a later visit
 * without a form — is tracked client side instead, one localStorage entry
 * per category, holding the email last submitted for it.
 */
const STORAGE_PREFIX = "bm_mkt_category_interest_";

export function getWatchedCategoryEmail(categoryId: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + categoryId);
  } catch {
    return null;
  }
}

function setWatchedCategoryEmail(categoryId: string, email: string): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + categoryId, email);
  } catch {
    /* private browsing or quota — the confirmation still shows this visit, it just won't be remembered next time */
  }
}

/**
 * Registers interest in a category. On success (including a repeat signup,
 * which the database itself treats as fine) records the watch locally and
 * returns ok. The only error this ever surfaces is the database's own
 * 'Please enter a valid email address' message, shown verbatim; anything
 * else is logged and shown as a generic retry prompt, never a raw error.
 */
export async function registerCategoryInterest(categoryId: string, email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await mdb.rpc("register_category_interest", { p_category_id: categoryId, p_email: email });
  if (error) {
    const raw = String((error as { message?: string }).message || "");
    if (/valid email/i.test(raw)) return { ok: false, message: "Please enter a valid email address" };
    console.error("[marketplace] register_category_interest:", error);
    return { ok: false, message: "We could not save that just now. Please try again." };
  }
  setWatchedCategoryEmail(categoryId, email);
  return { ok: true };
}
