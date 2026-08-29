import { mdb } from "./data/mdb";
import { getSessionId } from "@/lib/analytics";

/**
 * What buyers look for, and how often we have nothing for them.
 *
 * 214 listings exist and nothing records whether they are what anyone wants.
 * A buyer who searches for a pram, finds nothing and leaves is invisible
 * today: we never learn they came, what they wanted, or that we could have
 * found one. The ZERO-result searches are the valuable ones.
 *
 * Silent by design. Nothing about this is shown to the buyer, and nothing
 * about it can affect the search: the RPC swallows its own errors, this
 * never awaits or rejects, and the whole call sits behind a try/catch. A
 * search must never be slower or less reliable because we are listening.
 *
 * The term is normalised server side (lowercased, punctuation stripped, so
 * "Baby Pram" and "baby pram!" are one term) and anything under two
 * characters is ignored there, so no client-side cleaning is duplicated
 * here.
 */
export function recordMarketplaceSearch(input: {
  term: string;
  /** The REAL server-side match count for this exact filter set. The whole
   * point of the record: a zero here is the signal, so passing a stale or
   * placeholder number would poison the data. */
  resultsCount: number;
  categoryId: string | null;
  state: string | null;
}): void {
  try {
    const term = input.term.trim();
    if (term.length < 2) return;
    // .then() is REQUIRED, not decoration. supabase-js's rpc() returns a
    // lazy thenable that only issues the request when it is awaited or
    // then'd, so `void builder` builds a request and never sends it. This
    // silently recorded nothing until a live search proved it.
    const builder = (mdb as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<unknown> })
      .rpc("record_marketplace_search", {
        p_term: term,
        p_results_count: input.resultsCount,
        p_category_id: input.categoryId || null,
        p_state: input.state || null,
        // The same id analytics already uses. The RPC resolves the customer
        // itself from the session, so nothing identifying is sent.
        p_session_id: getSessionId(),
      });
    // Both handlers no-op: a failure here must never surface or reject.
    builder.then(() => {}, () => {});
  } catch {
    /* never let listening break searching */
  }
}
