/**
 * "Was the delivery-questions prompt dismissed on this device" — kept in the
 * same `bm-mkt-` localStorage convention as installState.ts, and for the
 * same reason: a prompt that returns on every single visit is worse than no
 * prompt at all.
 *
 * Deliberately LONGER than the install banner's 14 days. Installing an app
 * is a standing offer worth re-making; this is a single question a seller
 * has actively chosen not to answer right now, and the honest reading of
 * "do not ask an existing seller more than once" is that dismissing it
 * should hold. 90 days is effectively "leave me alone" while still not
 * being permanent on a shared or wiped device — and it stops mattering the
 * moment they answer, since the prompt is then gated off by their own saved
 * prefs, not by this flag.
 */

const DISMISSED_KEY = "bm-mkt-delivery-prompt-dismissed";
const DISMISS_DAYS = 90;

export function isDeliveryPromptDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY) || "0");
    if (!at) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function dismissDeliveryPrompt(): void {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* best-effort */ }
}
