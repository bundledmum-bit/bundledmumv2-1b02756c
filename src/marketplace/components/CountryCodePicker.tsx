import { COUNTRIES, flagEmoji } from "../lib/countries";

/**
 * Compact country dial code picker, a native <select> deliberately: the
 * browser handles the option list natively (a full-screen wheel on mobile),
 * so this never has to build or scroll its own dropdown, and the closed
 * control stays a fixed, narrow width next to the number input beside it.
 * Shows a flag and the dial code only, not the full country name, so it
 * stays compact even on a narrow screen.
 */
export default function CountryCodePicker({
  dialCode, onChange, disabled,
}: {
  dialCode: string;
  onChange: (dialCode: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="mkt-cc-picker"
      value={dialCode}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Country code"
    >
      {COUNTRIES.map((c) => (
        <option key={c.iso2} value={c.dialCode} title={c.name}>
          {flagEmoji(c.iso2)} +{c.dialCode}
        </option>
      ))}
    </select>
  );
}
