import { useState } from "react";
import { sdb } from "./sellData";
import type { ListForVerdict } from "./adminListingFor";

/**
 * Whose account this listing is about to land in, said plainly and kept on
 * screen the whole way down the form.
 *
 * Posting an item into the wrong person's account is the single worst thing
 * this feature could do, so it is never inferred from a quiet URL param alone.
 *
 * The delivery warning is shown here rather than blocking, deliberately. We
 * are already on WhatsApp with these sellers getting their items, so "do you
 * post nationwide or Lagos only" is one more question in the same
 * conversation, not a separate errand to finish first. A live listing with an
 * incomplete delivery answer is worth more than an item that never gets
 * listed, and it can be completed the moment they reply. So the friction
 * points at us, not at the seller.
 */
export default function ListingAsBanner({
  displayName, verdict, sellerId, onDeliveryRecorded,
}: {
  displayName: string | null;
  verdict: ListForVerdict;
  sellerId: string;
  onDeliveryRecorded: () => void;
}) {
  if (!verdict.allowed) {
    return (
      <div className="mkt-listing-as mkt-listing-as-blocked">
        <div className="mkt-listing-as-title">We cannot list for this seller</div>
        <p>{verdict.reason}</p>
        <p className="mkt-listing-as-sub">
          Nothing has been saved. Record how they asked on the never listed screen, then come back.
        </p>
      </div>
    );
  }

  return (
    <div className="mkt-listing-as">
      <div className="mkt-listing-as-title">
        Listing for {displayName || "this seller"}
      </div>
      <p>
        {verdict.route === "managed"
          ? "We opened this account for them. This item goes on their account and everything reaches their own email."
          : "They asked us to list for them. This item goes on their own account, and every email about it reaches them, not us."}
      </p>
      {verdict.needs_delivery_prefs && verdict.delivery_warning && (
        <DeliveryWarning
          warning={verdict.delivery_warning}
          sellerId={sellerId}
          displayName={displayName}
          onRecorded={onDeliveryRecorded}
        />
      )}
    </div>
  );
}

const HANDOVER = [
  { key: "ships", title: "She posts it", detail: "Even to someone in the same city, it goes by courier." },
  { key: "collection", title: "They collect it", detail: "Someone nearby comes and picks it up in person." },
  { key: "both", title: "Either one", detail: "She is happy to post it or hand it over, whichever suits." },
] as const;

/**
 * Ask it here, answer it here.
 *
 * 104 of the 133 have never said where they will send to. Sending an admin to
 * another screen to fix that is how it does not get done, so the same RPC the
 * outreach queue uses is offered inline, with the same note requirement.
 */
function DeliveryWarning({
  warning, sellerId, displayName, onRecorded,
}: {
  warning: string; sellerId: string; displayName: string | null; onRecorded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [nationwide, setNationwide] = useState<boolean | null>(null);
  const [handover, setHandover] = useState<"ships" | "collection" | "both" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <div className="mkt-listing-as-ok">Recorded. Buyers will now be told where {displayName || "she"} sends to.</div>;
  }

  const ready = nationwide !== null && handover !== null && note.trim().length >= 5;

  async function save() {
    if (nationwide === null || handover === null) return;
    setBusy(true); setError(null);
    const { error: e } = await sdb.rpc("admin_set_delivery_prefs_for_seller", {
      p_seller_id: sellerId, p_sells_nationwide: nationwide, p_local_handover: handover, p_note: note,
    });
    setBusy(false);
    if (e) { setError(e.message || "That could not be saved."); return; }
    setDone(true);
    onRecorded();
  }

  return (
    <div className="mkt-listing-as-warn">
      <div className="mkt-listing-as-warn-title">{warning}</div>
      {!open ? (
        <button type="button" className="mkt-listing-as-link" onClick={() => setOpen(true)}>
          Record what they said
        </button>
      ) : (
        <div className="mkt-listing-as-form">
          <div className="mkt-listing-as-q">Would she send to a buyer anywhere in Nigeria?</div>
          <div className="mkt-listing-as-row">
            <button type="button" className={`mkt-listing-as-choice${nationwide === true ? " on" : ""}`} onClick={() => setNationwide(true)}>Yes, anywhere</button>
            <button type="button" className={`mkt-listing-as-choice${nationwide === false ? " on" : ""}`} onClick={() => setNationwide(false)}>Only near her</button>
          </div>

          <div className="mkt-listing-as-q">And for a buyer near her?</div>
          {HANDOVER.map((h) => (
            <button key={h.key} type="button"
              className={`mkt-listing-as-choice wide${handover === h.key ? " on" : ""}`}
              onClick={() => setHandover(h.key)}>
              <b>{h.title}</b><span>{h.detail}</span>
            </button>
          ))}

          <div className="mkt-listing-as-q">Where did she tell you this?</div>
          <textarea
            className="mkt-listing-as-note" rows={2} value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: she said on WhatsApp she posts nationwide by GIG"
          />
          {error && <div className="mkt-listing-as-err">{error}</div>}
          <button type="button" disabled={!ready || busy} className="mkt-listing-as-save" onClick={save}>
            {busy ? "Saving..." : "Record this"}
          </button>
        </div>
      )}
    </div>
  );
}
