/**
 * Nigerian phone number validation, shared by every place a phone or
 * WhatsApp number is collected from a buyer or a seller. Accepts the three
 * common formats a person might type: 08012345678, 2348012345678, or
 * +2348012345678 (non-digits stripped before checking). Mirrors
 * create-marketplace-order's own normalisePhone exactly, so a number
 * accepted here is never rejected server side.
 */
export function isValidNigerianPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return /^(0\d{10}|234\d{10}|\d{10})$/.test(digits);
}
