import { mdb } from "../data/mdb";

/**
 * The buyer's state — the one thing that lets delivery messaging say
 * whether an item actually reaches them, rather than only stating the
 * seller's terms.
 *
 * Kept in localStorage so a GUEST gets the same personalisation as a signed
 * in buyer (most buyers here are guests, and checkout deliberately collects
 * no address). For a signed in buyer it is also written to
 * customers.delivery_state via set_my_delivery_state(), so it follows them
 * to another device.
 *
 * An unknown state is a perfectly normal state of the world, never an
 * error: every deliverability check treats null as "cannot say", and
 * nothing is ever blocked on it.
 */

const KEY = "bm-mkt-buyer-state";

export function getBuyerState(): string | null {
  try { return localStorage.getItem(KEY)?.trim() || null; } catch { return null; }
}

export function setBuyerStateLocal(state: string | null): void {
  try {
    if (state) localStorage.setItem(KEY, state);
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("bm-mkt-buyer-state-change"));
  } catch { /* best-effort */ }
}

export function onBuyerStateChange(handler: () => void): () => void {
  window.addEventListener("bm-mkt-buyer-state-change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("bm-mkt-buyer-state-change", handler);
    window.removeEventListener("storage", handler);
  };
}

/** Remembers a SIGNED IN buyer's state on their account. Fire and forget:
 * a failure here must never block checkout, the local copy still works. */
export async function saveBuyerStateToAccount(state: string): Promise<void> {
  try { await mdb.rpc("set_my_delivery_state", { p_state: state }); } catch { /* best-effort */ }
}

/** The 37 states we actually operate in. */
export async function fetchAllowedStates(): Promise<string[]> {
  const { data } = await mdb.from("marketplace_states").select("name").eq("is_allowed", true).order("name");
  return ((data ?? []) as Array<{ name: string }>).map((r) => r.name);
}
