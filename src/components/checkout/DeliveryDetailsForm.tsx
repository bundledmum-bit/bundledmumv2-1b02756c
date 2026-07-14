import { useState } from "react";
import StateZoneLgaCityCascade from "@/components/address/StateZoneLgaCityCascade";

// Shared delivery-details form. Mirrors the CheckoutPage "Delivery Details"
// fields, validation and address cascade (State → Zone → LGA → City via the
// same StateZoneLgaCityCascade component checkout's inline cascade is modelled
// on). Self-contained: it owns its field + error state and reports the collected
// values on submit. Used by the subscription builder's STEP 4 — where delivery
// is FREE, so there is deliberately no courier/weight/fee logic here.

export interface DeliveryDetails {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  city: string;
  notes: string;
}

type FieldKey = keyof DeliveryDetails;

const BLANK: DeliveryDetails = {
  firstName: "", lastName: "", phone: "", email: "",
  address: "", state: "Lagos", city: "", notes: "",
};

// Validation copied from CheckoutPage.validateField (same rules, same messages).
function validate(form: DeliveryDetails, key: FieldKey): string | undefined {
  const val = (form[key] || "").trim();
  if (key === "firstName" && !val) return "First name is required";
  if (key === "lastName" && !val) return "Last name is required";
  if (key === "phone") {
    const digits = val.replace(/\D/g, "");
    if (!digits || digits.length < 10) return "Valid phone required";
    if (!/^0[789][01]\d{8}$/.test(digits) && digits.length < 10) return "Enter a valid Nigerian phone (e.g. 08012345678)";
  }
  if (key === "email") {
    if (!val) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return "Enter a valid email address";
  }
  if (key === "address" && !val) return "Street address is required";
  if (key === "city" && !val) return "City is required";
  return undefined;
}

const REQUIRED: FieldKey[] = ["firstName", "lastName", "phone", "email", "address", "city"];

const inputCls = "w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body focus:border-forest outline-none transition-colors";
const labelCls = "text-xs font-semibold text-text-med uppercase tracking-wide";

export default function DeliveryDetailsForm({
  defaultEmail = "", submitting = false, submitLabel = "Continue", onSubmit,
}: {
  defaultEmail?: string;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (details: DeliveryDetails) => void;
}) {
  const [form, setForm] = useState<DeliveryDetails>({ ...BLANK, email: defaultEmail });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});

  const update = (key: FieldKey, val: string) => {
    setForm(p => ({ ...p, [key]: val }));
    if (errors[key]) setErrors(p => ({ ...p, [key]: undefined }));
  };
  const blur = (key: FieldKey) => setErrors(p => ({ ...p, [key]: validate(form, key) }));

  const submit = () => {
    const e: Partial<Record<FieldKey, string>> = {};
    REQUIRED.forEach(k => { const err = validate(form, k); if (err) e[k] = err; });
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    onSubmit({ ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(), city: form.city.trim(), state: form.state.trim() || "Lagos" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col md:flex-row gap-3">
        <Field label="First Name" value={form.firstName} onChange={v => update("firstName", v)} onBlur={() => blur("firstName")} error={errors.firstName} />
        <Field label="Last Name" value={form.lastName} onChange={v => update("lastName", v)} onBlur={() => blur("lastName")} error={errors.lastName} />
      </div>
      <div className="flex flex-col md:flex-row gap-3">
        <Field label="Phone Number" type="tel" placeholder="08012345678" value={form.phone} onChange={v => update("phone", v)} onBlur={() => blur("phone")} error={errors.phone} />
        <Field label="Email Address" type="email" placeholder="you@example.com" value={form.email} onChange={v => update("email", v)} onBlur={() => blur("email")} error={errors.email} />
      </div>
      <Field label="Street Address" value={form.address} onChange={v => update("address", v)} onBlur={() => blur("address")} error={errors.address} />

      {/* Same State → Zone → LGA → City cascade as checkout. */}
      <StateZoneLgaCityCascade
        value={{ state: form.state, city: form.city }}
        onChange={(next) => setForm(p => ({ ...p, ...next }))}
        labelClassName={labelCls}
        inputClassName={inputCls}
      />
      {errors.city && <p className="text-destructive text-[11px] -mt-1">{errors.city}</p>}

      <div className="flex flex-col gap-1">
        <label className={labelCls}>Delivery Notes (Optional)</label>
        <textarea value={form.notes} onChange={e => update("notes", e.target.value)} className="w-full rounded-[10px] border-[1.5px] border-border px-3 py-2.5 text-sm bg-card font-body resize-y h-20 focus:border-forest outline-none" placeholder="E.g. Landmark, gate colour..." />
      </div>

      <p className="text-[12px] text-forest font-semibold">Delivery is free on every subscription box.</p>

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground px-6 min-h-[52px] text-sm font-bold hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, onBlur, error, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; error?: string; type?: string; placeholder?: string;
}) {
  return (
    <div className="flex-1 flex flex-col gap-1">
      <label className={labelCls}>{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        className={`${inputCls} ${error ? "border-destructive" : ""}`}
      />
      {error && <p className="text-destructive text-[11px]">{error}</p>}
    </div>
  );
}
