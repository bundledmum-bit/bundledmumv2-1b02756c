/**
 * The one way to run an UPDATE or a DELETE and know it actually happened.
 *
 * WHY THIS EXISTS. Three times in three days a write did not happen and the
 * interface said it did, and the three look nothing alike:
 *
 *   §167  an `ok` field invented by the client that no function ever returned
 *   §180  is_marketplace sent as undefined, so a tag could not be turned off
 *   §182  an UPDATE refused by RLS returning no error at all
 *
 * FOR A WRITE, ONLY A CONFIRMED CHANGE IS SUCCESS. Not the absence of an
 * error. That is the single rule the three share, and this is it enforced for
 * table writes.
 *
 * THE SPECIFIC TRAP HERE, measured rather than assumed. Against a table
 * guarded by `and not is_design_viewer()`:
 *
 *   UPDATE  ->  error null, 0 rows      silently "succeeds"
 *   DELETE  ->  error null, 0 rows      silently "succeeds"
 *   INSERT  ->  error 42501             correctly raises
 *
 * PostgREST has nothing to complain about on an update or a delete: the row
 * simply did not match the policy, which is not an error, it is an empty
 * result. So `if (error)` passes, the screen reports success, and the refetch
 * quietly restores the old value. Inserts are already safe and are
 * deliberately NOT routed through here.
 *
 * Zero rows is also the honest answer when the id no longer exists or a
 * trigger moved the row out from under the filter, so the message is written
 * for "it did not happen", not specifically for "you lack permission".
 */

export interface WriteResult {
  ok: boolean;
  rows: number;
  message?: string;
}

const REFUSED =
  "That did not save. You may not have permission to change it, or it may have changed while you were working.";

/**
 * Pass the builder WITH a `.select()` on it, so PostgREST returns the rows it
 * actually touched. Without the select there is nothing to count and this
 * cannot tell a refusal from a success, which is the whole bug.
 */
export async function writeRows<T>(
  q: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  refusedMessage: string = REFUSED,
): Promise<WriteResult> {
  const { data, error } = await q;
  if (error) return { ok: false, rows: 0, message: error.message || refusedMessage };
  const rows = data?.length ?? 0;
  if (rows === 0) return { ok: false, rows: 0, message: refusedMessage };
  return { ok: true, rows };
}
