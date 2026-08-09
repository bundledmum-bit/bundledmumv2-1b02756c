/**
 * Phone number validation, shared by every place a phone or WhatsApp number
 * is collected from a buyer or a seller. Two distinct rule sets:
 *  - The PHONE number (used to arrange delivery within Nigeria) must always
 *    be a Nigerian mobile number, isValidNigerianPhone.
 *  - The WHATSAPP number does not, since plenty of genuine sellers and
 *    buyers run WhatsApp on a non-Nigerian line (living abroad, a UK/US
 *    SIM). isValidInternationalPhone + a country code picker cover that.
 */

/** Accepts 08012345678, 2348012345678, or +2348012345678 (non-digits
 * stripped before checking). Mirrors create-marketplace-order's own
 * normalisePhone exactly, so a number accepted here is never rejected
 * server side. */
export function isValidNigerianPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return /^(0\d{10}|234\d{10}|\d{10})$/.test(digits);
}

/** Drops a single leading national trunk "0" before a country code gets
 * prefixed, e.g. a Nigerian typing their own number the natural way,
 * 0803 123 4567, must not become 234 0803 123 4567 once +234 is selected.
 * This is the standard local-to-international conversion almost every
 * country using a trunk prefix follows, not a Nigeria-only rule, so it is
 * applied the same way regardless of which country is selected. */
function stripLeadingTrunkZero(digitsOnly: string): string {
  return digitsOnly.replace(/^0/, "");
}

/**
 * Digits only, no plus sign: dial code + national number with the trunk
 * zero stripped, e.g. ("234", "0803 123 4567") -> "2348031234567". Exactly
 * the 2348012345678-style shape already used for Nigerian numbers, so the
 * same format works for any country and a wa.me link built from it is
 * always correct.
 */
export function toInternationalDigits(dialCode: string, raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return dialCode + stripLeadingTrunkZero(digits);
}

/** Non-Nigerian numbers: a plausible mobile number, roughly 7 to 15 digits
 * once the trunk zero is stripped (spaces, dashes and brackets ignored),
 * matching E.164's own real-world length range. */
export function isValidInternationalPhone(raw: string): boolean {
  const digits = stripLeadingTrunkZero(raw.replace(/\D/g, ""));
  return digits.length >= 7 && digits.length <= 15;
}

/** Routes to the right rule for whichever country is selected on the
 * WhatsApp field: Nigeria stays exactly as strict as the phone field
 * (isValidNigerianPhone, raw input, trunk zero handled internally by that
 * function's own regex), anything else uses the permissive international
 * check. */
export function isValidWhatsappNumber(dialCode: string, raw: string): boolean {
  return dialCode === "234" ? isValidNigerianPhone(raw) : isValidInternationalPhone(raw);
}
