/**
 * Verified-seller badge. Green because it means "checked by us". Only rendered
 * by callers when the seller's verification_tier is 'verified'.
 */
export default function VerifiedBadge() {
  return (
    <span className="mkt-verified">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 12.5l2 2 4-4.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      </svg>
      Verified
    </span>
  );
}
