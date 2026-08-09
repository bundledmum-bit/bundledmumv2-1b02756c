import { COUNTRIES } from "../lib/countries";

/**
 * Compact country dial code picker, a native <select> deliberately: the
 * browser handles the option list natively (a full-screen wheel on mobile),
 * so this never has to build or scroll its own dropdown, and the closed
 * control stays a fixed, narrow width next to the number input beside it.
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
        <option key={c.iso2} value={c.dialCode}>+{c.dialCode} {c.name}</option>
      ))}
    </select>
  );
}
