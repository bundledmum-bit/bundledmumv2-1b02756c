/**
 * Which pending-action prompts this person has dismissed, PER ITEM.
 *
 * Global dismissal would be wrong: the same person can have a video ready
 * today and an unanswered question tomorrow, and waving away the first must
 * not hide the second.
 *
 * Keyed on ref_id + kind. ref_id is the actual row id of the thing waiting
 * (the video request, the question, the offer, the order), so two video
 * requests on the SAME listing now have genuinely distinct keys — the
 * limitation of the earlier kind + link + listing_title key, which could
 * not tell them apart because nothing in that payload separated them.
 *
 * kind stays in the key alongside it. ref_id alone would be enough today,
 * but the same underlying row can legitimately produce different kinds at
 * different times (an offer is pending to a seller, then accepted for the
 * buyer), and dismissing one of those should not silence the other.
 *
 * Stored per key with a timestamp and a 14-day expiry, so a prompt someone
 * ignored months ago can resurface if it is somehow still outstanding,
 * rather than being suppressed forever by one tap.
 */

const KEY = "bm-mkt-pending-dismissed";
const EXPIRY_DAYS = 14;

export interface PendingActionLike {
  ref_id: string;
  kind: string;
}

export function dismissKeyFor(a: PendingActionLike): string {
  return `${a.ref_id}|${a.kind}`;
}

function readAll(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function isPendingActionDismissed(a: PendingActionLike): boolean {
  const at = readAll()[dismissKeyFor(a)];
  if (!at) return false;
  return Date.now() - at < EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

export function dismissPendingAction(a: PendingActionLike): void {
  try {
    const all = readAll();
    const cutoff = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    // Drop anything already expired while we are here, so this cannot grow
    // without bound on a device someone uses for a long time.
    for (const [k, v] of Object.entries(all)) if (v < cutoff) delete all[k];
    all[dismissKeyFor(a)] = Date.now();
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* best-effort */
  }
}
