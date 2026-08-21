import { useState } from "react";
import { buyerRequestVideo } from "../videoRequests";
import { detectBypassAttempt } from "../questions";

/**
 * Ask for a video (buyer side). Deliberately built to match
 * AskQuestionSheet.tsx's exact shape and classes, since the two entry
 * points sit right next to each other on listing detail and should read as
 * a pair, not two different patterns. The note is optional here (unlike a
 * question) — a buyer can simply ask for a video with nothing more to say,
 * the seller will film what's normal to show.
 */
export default function RequestVideoSheet({
  listingId, listingTitle, onClose, onSent,
}: {
  listingId: string;
  listingTitle: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  async function send() {
    const trimmed = note.trim();
    if (trimmed) {
      const bypassReason = detectBypassAttempt(trimmed);
      if (bypassReason) { setError(bypassReason); setBlocked(true); return; }
    }
    setBusy(true); setError(null); setBlocked(false);
    const res = await buyerRequestVideo(listingId, trimmed);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      setBlocked(!!trimmed && !!detectBypassAttempt(trimmed));
      return;
    }
    onSent();
  }

  return (
    <div className="mkt-sheet-overlay" onClick={() => !busy && onClose()}>
      <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>Ask for a video</h3>
        <p>A quick video of {listingTitle}, filmed by the seller just for you. Say what you'd like to see, or leave it blank and they'll show what's normal.</p>

        <div className="mkt-field">
          <span className="mkt-uplabel">What would you like to see? (optional)</span>
          <textarea
            className={blocked ? "mkt-textarea error" : "mkt-textarea"}
            value={note}
            onChange={(e) => { setNote(e.target.value); if (error) { setError(null); setBlocked(false); } }}
            placeholder="e.g. Does the zip open smoothly? Can you show it folding?"
            rows={4}
          />
        </div>

        {error && (
          <div className="mkt-errbox">
            <span className="m">{blocked ? "🚫" : "!"}</span>
            <span>{blocked ? <><b>Blocked: </b>{error}</> : error}</span>
          </div>
        )}

        <button className="mkt-primary" onClick={send} disabled={busy}>{busy ? "Sending..." : "Send request"}</button>
        <button className="back" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
