import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import StarRatingInput from "../components/StarRatingInput";
import { fetchBuyerReview, getBuyerReviewQuestion, submitBuyerReview } from "./buyerOrders";

const FALLBACK_QUESTION = "What nearly stopped you buying, or what would make this easier next time?";

/**
 * Shown on the buyer's order page once it is completed — the same page the
 * review-request email links to (see send-marketplace-email's buyerLink),
 * so there is no separate review route to build or keep in sync.
 *
 * The rating alone is enough to submit, the written answer is always
 * optional, and this says plainly it goes to BundledMum only — a buyer who
 * thought the seller read it would soften what actually went wrong.
 * Already-reviewed shows the stars back rather than asking again, with a
 * small "change it" affordance so re-submitting (which UPDATES rather than
 * erroring) stays reachable without the prompt reappearing on its own.
 */
export default function BuyerReviewBlock({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const reviewKey = ["mkt-buyer-review", orderId];

  const { data: question } = useQuery({ queryKey: ["mkt-review-question", "buyer"], queryFn: getBuyerReviewQuestion, staleTime: 5 * 60 * 1000 });
  const { data: existing, isLoading } = useQuery({ queryKey: reviewKey, queryFn: () => fetchBuyerReview(orderId) });

  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openForm() {
    setRating(existing?.rating || 0);
    setAnswer(existing?.answer || "");
    setError(null);
    setFormOpen(true);
  }

  async function submit() {
    if (rating < 1 || rating > 5) { setError("Please choose a rating between 1 and 5 stars."); return; }
    setBusy(true); setError(null);
    const ok = await submitBuyerReview(orderId, rating, answer);
    setBusy(false);
    if (!ok) { setError("We could not save this, please try again."); return; }
    setFormOpen(false);
    qc.invalidateQueries({ queryKey: reviewKey });
  }

  if (isLoading) return null;
  const showForm = !existing || formOpen;

  return (
    <div className="mkt-card2">
      <div className="mkt-card2-label">Tell us how it went</div>
      <p className="mkt-help">This is private feedback for BundledMum, we never show it to the seller.</p>

      {showForm ? (
        <>
          <StarRatingInput value={rating} onChange={(n) => { setRating(n); if (error) setError(null); }} />
          <div>
            <label style={{ display: "block", font: "400 12.5px/1.4 'Lato', sans-serif", color: "var(--mkt-muted)", marginBottom: 6 }}>
              {question || FALLBACK_QUESTION} <span style={{ color: "var(--mkt-muted-2)" }}>(optional)</span>
            </label>
            <textarea
              className="mkt-textarea"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              placeholder="Totally optional, the stars alone already help"
            />
          </div>
          {error && <div className="mkt-errbox"><span className="m">!</span><span>{error}</span></div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="mkt-primary" style={{ flex: 1 }} onClick={submit} disabled={busy || rating < 1}>{busy ? "Saving..." : "Submit"}</button>
            {existing && <button className="mkt-secondary" style={{ flex: 1 }} onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button>}
          </div>
        </>
      ) : (
        <>
          <StarRatingInput value={existing!.rating} onChange={() => {}} disabled />
          {existing!.answer && <p style={{ font: "400 13px/1.5 'Lato', sans-serif", color: "var(--mkt-black)", margin: 0 }}>&ldquo;{existing!.answer}&rdquo;</p>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ font: "700 12px/1.4 'Lato', sans-serif", color: "var(--mkt-green)" }}>Saved, thank you.</span>
            <button type="button" onClick={openForm} style={{ background: "none", border: "none", padding: 0, font: "700 12px/1.5 'Lato', sans-serif", color: "var(--mkt-coral-dark)", cursor: "pointer" }}>
              Change your rating
            </button>
          </div>
        </>
      )}
    </div>
  );
}
