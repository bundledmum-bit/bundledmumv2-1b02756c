/**
 * The one way to call a Postgres function that performs an action.
 *
 * WHY THIS EXISTS. Three times now a screen has reported "that could not be
 * saved" on a save that went through, because the client decided success
 * meant `data.ok === true` while the function never returned an `ok` field.
 * The functions are not wrong: they RAISE on failure, so the absence of an
 * error IS the success signal. Diffed across the whole schema, 2 of 551
 * functions emit an `ok` key and neither is one any screen checks.
 *
 * The last cost was real: six duplicate uploads, three on one listing,
 * because the natural answer to a false failure is to press again.
 *
 * HOW THIS PREVENTS A FOURTH. These helpers never hand the caller the
 * decision. `ok` is computed here, from the error alone, and `rpcAction`
 * does not return the payload at all, so there is nothing to invent a
 * contract from. `rpcActionWithData` exists for the rare caller that needs
 * the returned note, and its `ok` is still the error check, never the body.
 * A companion test (rpcResult.test.ts) fails the build if any call site
 * goes back to reading `ok` off an RPC result.
 */

export interface RpcResult {
  ok: boolean;
  message?: string;
}

/** Minimal shape of the supabase client, so this file pulls in no types. */
type RpcCapable = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null; data?: unknown }>;
};

const GENERIC = "That could not be saved. Please try again.";

/**
 * Runs an action RPC. Success is the absence of an error and nothing else.
 * The payload is deliberately NOT returned: a caller that cannot see the
 * body cannot decide success from it.
 */
export async function rpcAction(
  client: RpcCapable,
  fn: string,
  args?: Record<string, unknown>,
  fallbackMessage = GENERIC,
): Promise<RpcResult> {
  const { error, data } = await client.rpc(fn, args);
  if (error) return { ok: false, message: error.message || fallbackMessage };
  // On success `message` carries the function's OWN human note when it has
  // one ("Recorded. The payout now follows the normal path..."), which is
  // the only part of the payload worth surfacing. It is never consulted to
  // decide ok.
  const note = (data as { note?: unknown } | null)?.note;
  return { ok: true, message: typeof note === "string" ? note : undefined };
}

/**
 * The same, for the few callers that need what the function returned (a
 * note to show, an id to follow). `ok` is STILL the error check: the body
 * is data to display, never the verdict.
 */
export async function rpcActionWithData<T>(
  client: RpcCapable,
  fn: string,
  args?: Record<string, unknown>,
  fallbackMessage = GENERIC,
): Promise<RpcResult & { data?: T }> {
  const { error, data } = await client.rpc(fn, args);
  if (error) return { ok: false, message: error.message || fallbackMessage };
  return { ok: true, data: data as T };
}
