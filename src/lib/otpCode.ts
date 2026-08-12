/**
 * Pure parsing/validation helpers for 6-digit sign-in codes, shared by the
 * storefront (AccountLoginPage.tsx) and marketplace (MarketplaceLoginPage.tsx)
 * login pages. Deliberately just logic, no UI or styling — the two apps keep
 * their own separate, differently-styled code-entry markup (matching how
 * every other part of their login flow is intentionally parallel-but-not-shared),
 * this only removes the risk of the two apps disagreeing on what counts as a
 * valid code.
 */

export const OTP_LENGTH = 6;

/** Strip everything but digits and cap at OTP_LENGTH. Handles a paste from
 * Mail (which may carry surrounding whitespace, "Your code is: 123456", or a
 * stray character) exactly the same as normal typing — there is no separate
 * "trim" step needed since a non-digit is simply never kept. */
export function sanitizeOtpInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function isCompleteOtp(value: string): boolean {
  return value.length === OTP_LENGTH;
}
