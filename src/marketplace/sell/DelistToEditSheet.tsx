import { useState } from "react";
import { sellerDelistForEdit } from "./sellData";

/**
 * The one confirmation for taking a LIVE listing offline so its content can
 * be edited — shared by every screen that offers this action (dashboard,
 * price edit, the full edit form's live-listing block) so the wording can
 * never drift between them. Reuses the seller side's existing sheet
 * pattern (.mkt-sheet-overlay / .mkt-sheet, see the relist confirm on
 * SellerDashboardPage.tsx and the original delist confirm on
 * SellerPriceEditPage.tsx) rather than inventing a new one.
 *
 * Deliberately honest about the cost: confirming takes the listing offline
 * immediately, and it stays offline and still needs resubmitting even if
 * the seller changes nothing after — said plainly here rather than left for
 * them to discover after the fact.
 */
export default function DelistToEditSheet({
  listing,
  onCancel,
  onDelisted,
}: {
  listing: { id: string; title: string };
  onCancel: () => void;
  onDelisted: () => void; // caller decides what happens next: navigate to edit, or refetch in place
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await sellerDelistForEdit(listing.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Could not take this down, please try again.");
      return;
    }
    onDelisted();
  }

  return (
    <div className="mkt-sheet-overlay" onClick={() => !busy && onCancel()}>
      <div className="mkt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>Take {listing.title} down to make changes?</h3>
        <p>
          It comes off browse right away. You can then change photos, category, title, description, anything about it.
          Before it can go back up, it needs a quick review again, same as a new listing, even if you end up changing nothing.
        </p>
        {error && (
          <div className="mkt-errbox">
            <span className="m">!</span>
            <span>{error}</span>
          </div>
        )}
        <button
          className="mkt-primary"
          style={{ background: "var(--mkt-error)", color: "var(--mkt-cream)" }}
          onClick={confirm}
          disabled={busy}
        >
          {busy ? "Taking it down..." : "Take it down and edit"}
        </button>
        <button className="back" onClick={onCancel} disabled={busy}>
          Cancel, keep it live for now
        </button>
      </div>
    </div>
  );
}
