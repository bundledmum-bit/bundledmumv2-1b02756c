import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { useSeller } from "./useSeller";
import { fetchSellerQuestion, sellerAnswerQuestion, detectBypassAttempt } from "../questions";
import { sendToMarketplaceLogin } from "../auth/marketplaceLogin";
import MarketplaceTitle from "../components/MarketplaceTitle";

/**
 * Answer a listing question (seller side), at /sell/questions/:id. This is
 * the exact destination the email button and the WhatsApp nudge link both
 * point to, so it must work as a cold direct link for a seller arriving
 * from outside the app, not logged in yet — same redirect-then-load pattern
 * as SellerOrderDetailPage and SellerOfferPage: wait for useSeller's own
 * loading flag, then redirect via an effect (never a render-time bail) once
 * we know they're logged out, passing this exact path back as returnTo.
 */
export default function SellerQuestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { seller, loading: sellerLoading, isLoggedIn } = useSeller();

  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (sellerLoading) return;
    if (!isLoggedIn) sendToMarketplaceLogin(`/sell/questions/${id}`, "seller");
  }, [sellerLoading, isLoggedIn, id]);

  const { data: question, isLoading } = useQuery({
    queryKey: ["seller-question", id],
    enabled: !!id && isLoggedIn,
    queryFn: () => fetchSellerQuestion(id as string),
  });

  async function submit() {
    if (!question) return;
    const trimmed = answer.trim();
    if (!trimmed) { setError("Write your answer first."); setBlocked(false); return; }
    const bypassReason = detectBypassAttempt(trimmed);
    if (bypassReason) { setError(bypassReason); setBlocked(true); return; }
    setBusy(true); setError(null); setBlocked(false);
    const res = await sellerAnswerQuestion(question.id, trimmed);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      setBlocked(!!detectBypassAttempt(trimmed));
      return;
    }
    qc.invalidateQueries({ queryKey: ["seller-question", id] });
    qc.invalidateQueries({ queryKey: ["mkt-seller-nudges", seller?.id] });
  }

  if (sellerLoading || isLoading) return <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}><BMLoadingAnimation size={140} /></div>;

  if (!question) {
    return (
      <div className="mkt-center">
        <MarketplaceTitle title="Question not found" />
        <div className="mkt-empty-title">Question not found</div>
        <button className="mkt-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/sell/dashboard")}>Back to dashboard</button>
      </div>
    );
  }

  return (
    <div className="mkt-seller-order-page">
      <MarketplaceTitle title={question.answer ? "Your answer" : "A question about your listing"} />
      <div className="mkt-sell-head">
        <div className="inner"><div className="row"><button className="mkt-sell-back" onClick={() => navigate("/sell/dashboard")} aria-label="Back">‹</button><h1 style={{ flex: 1 }}>{question.answer ? "Your answer" : "Someone asked a question"}</h1></div></div>
      </div>

      <div className="mkt-sell-body">
        <div className="mkt-offer-counter">
          <span style={{ font: "400 13.5px/1.4 'Lato', sans-serif", color: "var(--mkt-green-dark)" }}>
            {question.listing?.title ? `About ${question.listing.title}` : "Their question"}
          </span>
          <span className="amt" style={{ font: "700 17px/1.35 'Nunito', sans-serif" }}>{question.question}</span>
        </div>

        {question.answer ? (
          <div className="mkt-heldbox">
            <div className="hb-title">You already answered this</div>
            <div className="hb-line"><span className="hb-tick">✓</span>{question.answer}</div>
          </div>
        ) : (
          <>
            <p style={{ textAlign: "center", font: "400 12px/1.4 'Lato', sans-serif", color: "var(--mkt-muted)" }}>Your answer shows publicly on the listing, so other buyers with the same question can see it too.</p>
            <div className="mkt-field">
              <span className="mkt-uplabel">Your answer</span>
              <textarea
                className={blocked ? "mkt-textarea error" : "mkt-textarea"}
                value={answer}
                onChange={(e) => { setAnswer(e.target.value); if (error) { setError(null); setBlocked(false); } }}
                placeholder="Answer honestly, this is what they'll decide on."
                rows={4}
              />
            </div>
            {error && (
              <div className="mkt-errbox">
                <span className="m">{blocked ? "🚫" : "!"}</span>
                <span>{blocked ? <><b>Blocked: </b>{error}</> : error}</span>
              </div>
            )}
            <button className="mkt-primary" style={{ background: "var(--mkt-green)", color: "var(--mkt-cream)" }} onClick={submit} disabled={busy}>{busy ? "Sending..." : "Send my answer"}</button>
          </>
        )}
      </div>
    </div>
  );
}
