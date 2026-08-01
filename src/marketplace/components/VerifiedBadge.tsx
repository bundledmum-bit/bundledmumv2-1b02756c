/**
 * Verified-seller badge. Green means "checked by us". Only rendered by callers
 * when the seller's verification_tier is 'verified'. Pass size="lg" for the
 * larger variant used on the listing-detail seller row.
 */
export default function VerifiedBadge({ size }: { size?: "lg" }) {
  return (
    <span className={size === "lg" ? "mkt-verified lg" : "mkt-verified"}>
      <span className="mkt-verified-tick">✓</span>
      <span>Verified</span>
    </span>
  );
}
