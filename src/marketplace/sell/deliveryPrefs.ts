import { sdb } from "./sellData";
import { writeRows } from "@/lib/tableWrite";

/**
 * Where a seller is willing to sell, and how a nearby buyer gets the item.
 *
 * Two levels, and the difference matters:
 *  - the SELLER DEFAULT (seller_set_delivery_prefs) applies to everything
 *    they list, asked once and never again;
 *  - a PER LISTING OVERRIDE may exist on the listing row, and wins for that
 *    one item. It is READ here but never written: a database trigger owns
 *    marketplace_listings.local_handover.
 *
 * A buyer never reads either column directly: marketplace_listings carries
 * the override columns, so a null there means "use the seller default", NOT
 * "unset". Only listing_delivery_terms() resolves the two properly, which is
 * why the buyer-facing read below always goes through the RPC.
 *
 * SAFETY: nothing here ever exposes a seller's address. The furthest any of
 * this goes is their state, which is already public on every listing. A home
 * address is shared only after payment, with that one buyer, exactly as the
 * seller's phone number already is.
 */

/** How a buyer in the seller's own state receives the item. */
export type LocalHandover = "ships" | "collection" | "both";

export interface DeliveryTerms {
  /** null when the seller has never answered — never treat as false. */
  sells_nationwide: boolean | null;
  local_handover: LocalHandover | null;
  seller_state: string | null;
  /** False for a listing whose seller has not answered the two questions.
   * There is deliberately no default: we must not imply someone ships. */
  is_set: boolean;
}

/** What a buyer should be told about getting this item. Anon callable, so it
 * works for a signed-out browser. */
export async function fetchListingDeliveryTerms(listingId: string): Promise<DeliveryTerms | null> {
  const { data, error } = await sdb.rpc("listing_delivery_terms", { p_listing_id: listingId });
  if (error) return null;
  const rows = (data ?? []) as DeliveryTerms[];
  return rows[0] ?? null;
}



/** One flat shape rather than a discriminated union: this project's
 * TypeScript config does not narrow `{ok:true}|{ok:false;message}` after an
 * `if (!res.ok)` guard (several existing call sites carry that same error),
 * so an optional message avoids reproducing a known papercut. */
export interface SaveResult { ok: boolean; message?: string }

/** Sets the seller's default for everything they list. The server raises
 * 'Please choose where you are willing to sell' / 'Please choose how buyers
 * near you receive the item' — already human-readable, so they surface
 * verbatim, the same convention as the rest of the sell flow. */
export async function saveSellerDeliveryPrefs(input: { sellsNationwide: boolean; localHandover: LocalHandover }): Promise<SaveResult> {
  const { error } = await sdb.rpc("seller_set_delivery_prefs", {
    p_sells_nationwide: input.sellsNationwide,
    p_local_handover: input.localHandover,
  });
  if (error) return { ok: false, message: error.message || "We could not save that just now. Please try again." };
  return { ok: true };
}

/* seller_set_listing_delivery() is deliberately NOT wrapped here. A
 * database trigger owns marketplace_listings.local_handover, so the
 * frontend must not write that column at all — the per-listing override
 * control that used to call it was removed for the same reason. */

/**
 * The one line a buyer is shown about how a seller hands an item over.
 *
 * THE CONSTRAINT THAT SHAPES ALL OF THIS: we do not know where the buyer
 * is. Checkout collects name, email and phone only — no address, because
 * delivery is arranged directly between the two of them. So every line
 * below states ONLY what the seller does. Nothing here may ever say "this
 * can reach you" or "this seller does not deliver to you", because we
 * genuinely cannot know either way.
 *
 * Returns null when the seller has not answered, and null means render
 * NOTHING — no default, no caveat, no placeholder. That is 178 of 181
 * listings today, so blank is the common case and has to look deliberate
 * rather than broken (see SellerDeliveryLine.tsx for how).
 *
 * Never an address. Area and state only, both already public on the
 * listing itself.
 */
export function deliveryLine(
  terms: DeliveryTerms,
  opts: { sellerName?: string | null; area?: string | null } = {},
): string | null {
  if (!terms.is_set) return null;

  // First name only, matching how sellers are named everywhere else.
  const name = (opts.sellerName || "").trim().split(/\s+/)[0] || null;
  const who = name || "This seller";
  // "she" throughout: sellers here are overwhelmingly mothers, and
  // repeating the name in every clause reads badly. With NO name on file
  // there is nothing to base that on, so an unnamed seller stays neutral.
  const she = name ? "she" : "they";
  const She = name ? "She" : "They";
  const her = name ? "her" : "them";

  const state = terms.seller_state?.trim() || null;
  const area = opts.area?.trim() || null;
  // Area and state only. Never a street, never an address.
  const inArea = area ? ` in ${area}` : "";
  const fromArea = area ? ` from ${area}` : "";
  // The condition is always named ("if you are in Lagos"), because we do
  // not know where the buyer is and must never assume.
  const ifInState = state ? `If you are in ${state}, ` : "If you are in the same state, ";

  if (terms.sells_nationwide) {
    switch (terms.local_handover) {
      case "ships":
        return `${who} will send this to you anywhere in Nigeria.`;
      case "collection":
        return `${who} will send this anywhere in Nigeria. ${ifInState}you collect it from ${her}${inArea} instead.`;
      default:
        return `${who} will send this to you anywhere in Nigeria. ${ifInState}you can collect it${fromArea} instead.`;
    }
  }

  // State-only cases LEAD with the restriction: a buyer in Kano has to see
  // that before anything about how the item travels.
  const onlySells = state
    ? `${who} only sells to buyers in ${state}`
    : `${who} only sells to buyers in ${name ? "her" : "their"} own state`;
  switch (terms.local_handover) {
    case "ships":
      return `${onlySells}. ${ifInState}${she} will send it to you.`;
    case "collection":
      return `${onlySells}, and you collect it yourself${fromArea}.`;
    default:
      return `${onlySells}. ${She} can send it to you, or you can collect it${fromArea}.`;
  }
}

/** True for the three state-only cases. A buyer outside that state is one
 * tap from paying for something that cannot reach them, and since checkout
 * never collects an address we cannot catch it or warn them by name — so
 * these carry real payment-moment risk and earn visible weight, never a
 * blocker (most buyers genuinely are in-state) and never alarmed red. */
export function isStateOnly(terms: DeliveryTerms | null | undefined): boolean {
  return !!terms && terms.is_set && terms.sells_nationwide === false;
}

/**
 * Saves ONLY the same-state handover answer, writing both columns in a
 * single update exactly as the trigger contract requires:
 *   local_handover = <chosen>, delivery_prefs_set_at = now()
 *
 * Deliberately a direct table update rather than seller_set_delivery_prefs():
 * that RPC raises 'Please choose where you are willing to sell' when
 * p_sells_nationwide is null, so it cannot serve a single-question flow.
 * RLS ("Seller updates own row", customer_id -> customers.auth_user_id =
 * auth.uid()) already permits a seller to write both of these columns on
 * their own row, so nothing is bypassed by doing it directly.
 *
 * marketplace_listings.local_handover is NEVER written from here. A database
 * trigger owns that column.
 */
export async function saveLocalHandover(sellerId: string, value: LocalHandover): Promise<SaveResult> {
  // .select() and a row count, not just the error: an UPDATE refused by RLS
  // returns neither, so checking `error` alone reported a saved preference
  // that was never written. See lib/tableWrite.
  const res = await writeRows(
    sdb.from("marketplace_sellers")
      .update({ local_handover: value, delivery_prefs_set_at: new Date().toISOString() })
      .eq("id", sellerId)
      .select("id"),
    "We could not save that just now. Please try again.",
  );
  return res.ok ? { ok: true } : { ok: false, message: res.message };
}
