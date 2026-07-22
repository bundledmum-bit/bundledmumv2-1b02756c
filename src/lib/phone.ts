// International phone helpers. Deliberately NOT Nigeria-only: we accept any
// valid international number with a country code, and default a bare local
// Nigerian number (leading 0) to +234. Formatting (spaces, dashes, brackets)
// is ignored; only clearly-not-a-phone input is rejected.

// E.164 allows up to 15 digits after the country code prefix. We use a
// permissive lower bound so short-but-real international numbers pass while
// obvious junk (a handful of digits, letters) is rejected.
const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

/**
 * Normalise a raw phone string to E.164 (+<countrycode><number>) where
 * possible. Rules:
 *  - Explicit "+" prefix is respected as-is (any country code).
 *  - A bare local Nigerian number (leading 0) defaults to +234.
 *  - A number already starting with the 234 country code gets a "+".
 *  - Anything else with no "+" is assumed to carry its country code and is
 *    prefixed with "+".
 * Returns null when there are no digits at all.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  const hadPlus = str.startsWith("+");
  const digits = str.replace(/\D/g, "");
  if (!digits) return null;

  if (hadPlus) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.replace(/^0+/, "")}`;
  if (digits.startsWith("234")) return `+${digits}`;
  // A bare 10-digit national number with no "+" and no leading 0 is treated as
  // Nigerian (+234), matching the wa.me heuristic. Longer bare numbers are
  // assumed to already carry their country code.
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}

/**
 * True when `raw` is a plausible international phone number. Permissive on
 * formatting; rejects letters and numbers that are too short / too long to be
 * a real E.164 number.
 */
export function isValidPhone(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  // Any alphabetic character means it is not a phone number.
  if (/[A-Za-z]/.test(String(raw))) return false;
  const e164 = normalizePhoneE164(raw);
  if (!e164) return false;
  const digits = e164.slice(1); // drop the leading "+"
  if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) return false;
  return /^\+\d+$/.test(e164);
}
