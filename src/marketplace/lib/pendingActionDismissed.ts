/**
 * Which pending-action prompts this person has dismissed, PER ITEM.
 *
 * Global dismissal would be wrong: the same person can have a video ready
 * today and an unanswered question tomorrow, and waving away the first must
 * not hide the second.
 *
 * my_pending_action() returns no stable row id, so the key is derived from
 * what it does return: kind + link + listing_title. That keeps every
 * different KIND distinct (the requirement), and keeps different ITEMS
 * distinct too, since the title differs. Known limitation, stated rather
 * than hidden: two video requests on the SAME listing produce the same key,
 * because nothing in the payload separates them.
 *
 * Stored per key with a timestamp and a 14-day expiry, so a prompt someone
 * ignored months ago can resurface if it is somehow still outstanding,
 * rather than being suppressed forever by one tap.
 */

const KEY = "bm-mkt-pending-dismissed";
const EXPIRY_DAYS = 14;

export interface PendingActionLike {
  kind: string;
  link: string;
  listing_title: string | null;
}

export function dismissKeyFor(a: PendingActionLike): string {
  return [a.kind, a.link, a.listing_title ?? ""].join("|");
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
