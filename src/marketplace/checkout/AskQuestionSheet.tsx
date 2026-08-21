import { useState } from "react";
import { buyerAskQuestion, detectBypassAttempt } from "../questions";

/**
 * Ask a question (buyer side). Reuses the app's generic .mkt-sheet, the same
 * one SellerOfferPage's counter sheet uses, not MakeOfferSheet's own
 * .mkt-offer-sheet classes, since those were deliberately special-cased for a
 * desktop-centering reason specific to that flow, not a general pattern.
 *
 * Bypass attempts (a phone number, WhatsApp, social handles, an off-site
 * link) are checked client side first with the exact same categories the
 * server enforces, so a person sees the problem before hitting submit. The
 * server (buyer_ask_listing_question) still runs the real check regardless.
 */
export default function AskQuestionSheet({
  listingId, listingTitle, sellerName, onClose, onSent,
}: {
  listingId: string;
  listingTitle: string;
  /** First name, or "the seller" when there's no public display name —
   * resolved by the caller (ListingDetailPage's own askName), never
   * re-derived here. */
  sellerName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  async function send() {
    const trimmed = question.trim();
    if (!trimmed) { setError("Write your question first."); setBlocked(false); return; }
    const bypassReason = detectBypassAttempt(trimmed);
    if (bypassReason) { setError(bypassReason); setBlocked(true); return; }
    setBusy(true); setError(null); setBlocked(false);
    const res = await buyerAskQuestion(listingId, trimmed);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      setBlocked(!!detectBypassAttempt(trimmed));
      return;
    }
    onSent();
  }

  return (
    <div className="mkt-sheet-overlay" onClick={() => !busy && onClose()}>
      <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>Ask {sellerName} a question</h3>
        <p>You get one question on this listing, so ask what actually matters to you. The seller will answer, and it helps other buyers too.</p>

        <div className="mkt-field">
          <span className="mkt-uplabel">Your question about {listingTitle}</span>
          <textarea
            className={blocked ? "mkt-textarea error" : "mkt-textarea"}
            value={question}
            onChange={(e) => { setQuestion(e.target.value); if (error) { setError(null); setBlocked(false); } }}
            placeholder="e.g. Does it come with the original box?"
            rows={4}
          />
        </div>

        {error && (
          <div className="mkt-errbox">
            <span className="m">{blocked ? "🚫" : "!"}</span>
            <span>{blocked ? <><b>Blocked: </b>{error}</> : error}</span>
          </div>
        )}

        <button className="mkt-primary" onClick={send} disabled={busy}>{busy ? "Sending..." : "Send question"}</button>
        <button className="back" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
