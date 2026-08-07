import { useEffect, useState } from "react";
import { registerCategoryInterest, getWatchedCategoryEmail } from "../lib/categoryInterest";

/**
 * Shown on browse when a buyer is filtered to exactly one category (no
 * other filter active, either from a home tile tap or browse's own
 * category filter) and it has zero live listings. Distinct from browse's
 * generic zero-results state (a combined-filter dead end) — this is one
 * specific category having nothing yet, so the copy, the icon and the
 * notify action are all scoped to that category by name, never the
 * marketplace at large.
 *
 * register_category_interest is silently idempotent server side, so a
 * repeat submission for the same (email, category) is not distinguishable
 * from the first by its response — the "already watching" state on a
 * later visit comes from a localStorage flag set at the moment of a
 * successful submit, not from the RPC result (design 31a, V6).
 */
export default function CategoryNoStockYet({ categoryId, categoryName, categoryIcon, onClearCategory }: {
  categoryId: string;
  categoryName: string;
  categoryIcon: string | null;
  onClearCategory: () => void;
}) {
  const [alreadyWatching, setAlreadyWatching] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState<{ email: string } | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAlreadyWatching(getWatchedCategoryEmail(categoryId));
    setJustSubmitted(null);
    setEmail("");
    setError(null);
  }, [categoryId]);

  async function submit() {
    setError(null);
    setBusy(true);
    const result = await registerCategoryInterest(categoryId, email.trim());
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    setJustSubmitted({ email: email.trim() });
  }

  const confirmed = justSubmitted ?? (alreadyWatching ? { email: alreadyWatching } : null);

  return (
    <div className="mkt-nostock">
      <span className="ic" aria-hidden>{categoryIcon || "🏷️"}</span>

      {confirmed ? (
        <>
          {justSubmitted ? (
            <span className="tick" aria-hidden>✓</span>
          ) : null}
          <div className="mkt-empty-title">{justSubmitted ? "You're on the list" : "Still nothing here, but you'll know first"}</div>
          <div className="mkt-empty-sub">
            {justSubmitted
              ? `We'll email ${confirmed.email} the moment something lands in ${categoryName}. Nowhere else, just this one.`
              : `You're already on the list for this category, we'll email you the moment something lands, no need to sign up again.`}
          </div>
          {!justSubmitted && (
            <div className="mkt-nostock-watching">
              <span className="dot" aria-hidden>✓</span>
              <span>{confirmed.email} is watching this category</span>
            </div>
          )}
          <button className="mkt-notfound-cta mkt-notfound-cta--primary" style={{ marginTop: 4 }} onClick={onClearCategory}>Browse everything else</button>
        </>
      ) : (
        <>
          <div className="mkt-empty-title">Nothing here just yet</div>
          <div className="mkt-empty-sub">New items get added daily, this category just hasn't had one land yet. Tell us your email and we'll let you know the moment it does.</div>
          <div className="mkt-nostock-form">
            <input
              type="email"
              className="mkt-nostock-input"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
            />
            {error && <div className="mkt-nostock-error">{error}</div>}
            <button className="mkt-notfound-cta mkt-notfound-cta--primary" onClick={submit} disabled={busy || !email.trim()}>
              {busy ? "Saving..." : `Notify me about ${categoryName.toLowerCase()}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
