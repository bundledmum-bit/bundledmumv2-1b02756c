import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { Switch } from "@/components/ui/switch";
import { adb, formatNaira } from "./data";
import MarketplaceLocations from "./MarketplaceLocations";

/**
 * Marketplace settings. Reads and writes the marketplace_* keys in
 * site_settings, and manages marketplace_categories. Every save passes through
 * a confirm step, because these levers affect live buyers and sellers.
 */

type FieldType = "number" | "toggle" | "select" | "text";

interface SettingField {
  key: string;
  label: string;
  help: string;
  type: FieldType;
  money?: boolean;
  /** Renders/validates 0-100 with a % suffix. */
  percent?: boolean;
  /** Whole numbers only (day/hour counts). */
  integer?: boolean;
  suffix?: string;
  options?: Array<{ value: string; label: string }>;
  /** A standing caution shown under the field regardless of its value, not
   * a validation error, e.g. the markup-percent disconnect below. */
  warning?: string;
}

interface Category { id: string; name: string; is_allowed: boolean }
interface PendingSave { key: string; label: string; value: string | number | boolean; display: string }
interface PendingToggle { cat: Category }

const FIELD = {
  email: { key: "marketplace_payout_digest_email", label: "Internal alert recipients", help: "The fallback address for any internal alert below that has no recipients of its own: the daily payout digest, a new sale, a new dispute, a new seller registering, a seller auto suspended, a payment amount anomaly, and the review backlog nudge. Enter one or more addresses, comma separated.", numeric: false },
} as const;

/**
 * Every marketplace_* setting, grouped as specified. Help text is the real
 * site_settings.description for each (source of truth), with two additions
 * called out below where the description alone would not be enough for an
 * admin making the change.
 */
const GROUPS: Array<{ title: string; fields: SettingField[] }> = [
  {
    title: "Pricing and fees",
    fields: [
      {
        key: "marketplace_markup_percent", label: "Markup percentage", type: "number", percent: true,
        help: "Percentage added to the seller asking price to produce the buyer-facing price.",
        warning: "Does not currently reprice anything: final_price_naira is computed per listing from that listing's OWN stored markup_percent column, which defaults to a fixed 10% and is not written from this setting when a listing is created or edited. Changing this only updates the buyer-price preview a seller sees while listing, not what is actually charged, for existing OR new listings. Needs a code fix (out of scope here) before it does what it looks like it does.",
      },
      { key: "marketplace_service_fee_naira", label: "Service fee", type: "number", money: true, help: "Flat non-refundable service fee charged to the buyer per marketplace order." },
      { key: "marketplace_buyer_pays_paystack_fee", label: "Buyer pays the Paystack fee", type: "toggle", help: "Show the Paystack transaction fee as a separate line charged to the buyer at marketplace checkout." },
    ],
  },
  {
    title: "Negotiation",
    fields: [
      {
        key: "marketplace_offers_enabled", label: "Negotiation enabled", type: "toggle",
        help: "Whether buyers can ask for a lower price on a listing. Sellers also choose per listing whether theirs is negotiable, so switching this off disables negotiation everywhere, regardless of any listing's own setting.",
      },
      {
        key: "marketplace_max_discount_percent", label: "Maximum discount", type: "number", percent: true,
        help: "The most a buyer can ask off a listing, as a percentage of the buyer-facing price. Buyers only ever see this as a naira amount, never as a percentage.",
      },
      { key: "marketplace_offer_expiry_hours", label: "Offer expiry", type: "number", integer: true, suffix: " hours", help: "Hours a seller has to respond to an offer before it lapses." },
    ],
  },
  {
    title: "Orders and disputes",
    fields: [
      { key: "marketplace_confirm_prompt_day", label: "Confirm-receipt prompt", type: "number", integer: true, suffix: " day(s) after payment", help: "Days after payment confirmation when the automated buyer confirm-receipt prompt is sent." },
      { key: "marketplace_dispute_window_days", label: "Dispute window", type: "number", integer: true, suffix: " days after dispatch", help: "Days after delivery confirmation before funds become payout-eligible without buyer response." },
      { key: "marketplace_return_confirm_days", label: "Return confirm window", type: "number", integer: true, suffix: " days", help: "Days a seller has to confirm a returned item before it escalates to admin to resolve manually." },
    ],
  },
  {
    title: "Payments",
    fields: [
      { key: "marketplace_payment_paystack_enabled", label: "Paystack", type: "toggle", help: "Enable Paystack card payment on marketplace checkout." },
      { key: "marketplace_payment_transfer_enabled", label: "Bank transfer", type: "toggle", help: "Enable manual bank transfer on marketplace checkout, the fallback if Paystack is unavailable. Off by default, Paystack is the primary method." },
    ],
  },
  {
    title: "Notifications",
    fields: [
      { key: "marketplace_sms_enabled", label: "SMS notifications", type: "toggle", help: "Master switch for SMS. Does nothing until a provider API key is configured and a sender ID is approved, leave off until then." },
      { key: "marketplace_sms_provider", label: "SMS provider", type: "select", help: "SMS provider for marketplace notifications. Not yet connected.", options: [{ value: "termii", label: "Termii" }, { value: "africastalking", label: "Africa's Talking" }] },
      { key: "marketplace_sms_sender_id", label: "SMS sender ID", type: "text", help: "Registered alphanumeric sender ID shown on SMS. Must be registered with the provider before SMS delivers." },
    ],
  },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split a comma separated recipients string into trimmed, non-empty addresses. */
function parseEmails(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

interface EmailTemplateRow { id: string; slug: string; name: string; description: string | null; internal_recipients: string | null }
interface PendingTemplateSave { id: string; slug: string; name: string; value: string | null; display: string }

export default function MarketplaceSettings() {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [newCat, setNewCat] = useState("");
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-alert recipient overrides (email_templates.internal_recipients), a
  // separate edit/error state per slug so editing one alert never disturbs
  // another. Mirrors the shared-field pattern above, but empty is allowed
  // here (it means "fall back to the shared default"), never blocked.
  const [tplEdits, setTplEdits] = useState<Record<string, string>>({});
  const [tplEditing, setTplEditing] = useState<Record<string, boolean>>({});
  const [tplErrors, setTplErrors] = useState<Record<string, string>>({});
  const [pendingTemplateSave, setPendingTemplateSave] = useState<PendingTemplateSave | null>(null);

  const settingsQ = useQuery({
    queryKey: ["mkt-settings"],
    queryFn: async () => {
      const { data, error } = await adb.from("site_settings").select("key, value").like("key", "marketplace_%");
      if (error) throw error;
      const map: Record<string, unknown> = {};
      for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) map[row.key] = row.value;
      return map;
    },
    staleTime: 15000,
  });

  const catsQ = useQuery({
    queryKey: ["mkt-categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await adb.from("marketplace_categories").select("id, name, is_allowed").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Category[];
    },
    staleTime: 15000,
  });

  // The seven internal marketplace alert templates, each can now carry its
  // own recipients (email_templates.internal_recipients), separate from the
  // shared fallback above. Ordered live-events-first, digests last, a
  // deliberate reading order rather than alphabetical by slug.
  const TEMPLATE_ORDER = [
    "marketplace_admin_new_sale",
    "marketplace_admin_dispute_raised",
    "marketplace_admin_payment_anomaly",
    "marketplace_admin_new_seller",
    "marketplace_admin_seller_suspended",
    "marketplace_admin_payout_digest",
    "marketplace_admin_new_listing",
  ];
  const templatesQ = useQuery({
    queryKey: ["mkt-alert-templates"],
    queryFn: async (): Promise<EmailTemplateRow[]> => {
      const { data, error } = await adb.from("email_templates")
        .select("id, slug, name, description, internal_recipients")
        .in("slug", TEMPLATE_ORDER);
      if (error) throw error;
      const rows = (data ?? []) as unknown as EmailTemplateRow[];
      return TEMPLATE_ORDER.map((slug) => rows.find((r) => r.slug === slug)).filter((r): r is EmailTemplateRow => !!r);
    },
    staleTime: 15000,
  });

  const settings = settingsQ.data ?? {};
  const val = (k: string) => settings[k];
  const strVal = (k: string) => (val(k) === null || val(k) === undefined ? "" : String(val(k)));

  function startEdit(key: string, initial: string) {
    setEdits((e) => ({ ...e, [key]: initial }));
    setEditing((e) => ({ ...e, [key]: true }));
    setError(null);
  }
  function cancelEdit(key: string) {
    setEditing((e) => ({ ...e, [key]: false }));
  }

  /** Handles the numeric and plain-text fields (bank details, sender ID).
   * Percentages validate 0-100; day/hour counts must be a positive whole
   * number; a plain fee only needs to be non negative. */
  function requestSave(f: { key: string; label: string; type?: FieldType; percent?: boolean; integer?: boolean; money?: boolean; suffix?: string }) {
    const raw = (edits[f.key] ?? "").trim();
    let value: string | number = raw;
    const isNumeric = f.type === "number" || f.money || f.percent || f.integer;
    if (isNumeric) {
      const n = Number(raw);
      if (raw === "" || !isFinite(n)) { setError(`${f.label} must be a number.`); return; }
      if (n < 0) { setError(`${f.label} cannot be negative.`); return; }
      if (f.percent && n > 100) { setError(`${f.label} must be between 0 and 100.`); return; }
      if (f.integer && !Number.isInteger(n)) { setError(`${f.label} must be a whole number.`); return; }
      value = n;
    } else if (f.type === "text" && !raw) {
      setError(`${f.label} cannot be empty.`);
      return;
    }
    const display = f.money ? formatNaira(Number(value)) : f.percent ? `${value}%` : `${value}${f.suffix ?? ""}`;
    setPendingSave({ key: f.key, label: f.label, value, display });
  }

  /** Toggles and the SMS-provider select share the exact same save path as
   * everything else, site_settings does not care what shape the value is. */
  function requestToggle(f: SettingField, current: unknown) {
    const next = !(current === true);
    setPendingSave({ key: f.key, label: f.label, value: next, display: next ? "On" : "Off" });
  }
  function requestSaveSelect(f: SettingField, value: string) {
    const label = f.options?.find((o) => o.value === value)?.label ?? value;
    setPendingSave({ key: f.key, label: f.label, value, display: label });
  }

  /**
   * Internal alert recipients. Stored in the SAME site_settings key as a comma
   * separated string (the edge functions split it server side), so we normalise
   * the entries back into that format. Refuse an empty value, since that would
   * silently switch off every internal alert, and reject any malformed entry by
   * name rather than saving something that will fail to send.
   */
  function requestSaveEmails() {
    const list = parseEmails(edits[FIELD.email.key] ?? "");
    if (list.length === 0) {
      setError("Enter at least one email address. An empty value would switch off every internal alert.");
      return;
    }
    const bad = list.find((e) => !EMAIL_RE.test(e));
    if (bad) {
      setError(`"${bad}" is not a valid email address. Fix it before saving.`);
      return;
    }
    const normalized = list.join(", ");
    setPendingSave({
      key: FIELD.email.key,
      label: FIELD.email.label,
      value: normalized,
      display: list.length === 1 ? normalized : `${list.length} recipients: ${normalized}`,
    });
  }

  function startTplEdit(slug: string, initial: string) {
    setTplEdits((e) => ({ ...e, [slug]: initial }));
    setTplEditing((e) => ({ ...e, [slug]: true }));
    setTplErrors((e) => ({ ...e, [slug]: "" }));
  }
  function cancelTplEdit(slug: string) {
    setTplEditing((e) => ({ ...e, [slug]: false }));
  }

  /**
   * A single alert's own recipients. Unlike the shared fallback field, EMPTY
   * IS ALLOWED here on purpose, it just means this one alert has no override
   * and falls back to the shared address, never that the alert stops sending
   * (both senders already read internal_recipients first, falling back to
   * marketplace_payout_digest_email when it is blank).
   */
  function requestSaveTemplateEmails(row: EmailTemplateRow) {
    const raw = tplEdits[row.slug] ?? "";
    const list = parseEmails(raw);
    const bad = list.find((e) => !EMAIL_RE.test(e));
    if (bad) {
      setTplErrors((e) => ({ ...e, [row.slug]: `"${bad}" is not a valid email address. Fix it before saving.` }));
      return;
    }
    const value = list.length ? list.join(", ") : null;
    setPendingTemplateSave({
      id: row.id,
      slug: row.slug,
      name: row.name,
      value,
      display: list.length === 0
        ? `Falls back to ${strVal(FIELD.email.key) || "the shared address"}`
        : list.length === 1 ? list[0] : `${list.length} recipients: ${list.join(", ")}`,
    });
  }

  async function confirmTemplateSave() {
    if (!pendingTemplateSave) return;
    setBusy(true);
    const { error } = await adb.from("email_templates")
      .update({ internal_recipients: pendingTemplateSave.value })
      .eq("id", pendingTemplateSave.id);
    setBusy(false);
    if (error) {
      setTplErrors((e) => ({ ...e, [pendingTemplateSave.slug]: error.message }));
      setPendingTemplateSave(null);
      return;
    }
    setTplEditing((e) => ({ ...e, [pendingTemplateSave.slug]: false }));
    setPendingTemplateSave(null);
    templatesQ.refetch();
  }

  async function confirmSave() {
    if (!pendingSave) return;
    setBusy(true); setError(null);
    const { error } = await adb.from("site_settings")
      .update({ value: pendingSave.value, updated_at: new Date().toISOString() })
      .eq("key", pendingSave.key);
    setBusy(false);
    if (error) { setError(error.message); setPendingSave(null); return; }
    setEditing((e) => ({ ...e, [pendingSave.key]: false }));
    setPendingSave(null);
    settingsQ.refetch();
  }

  async function confirmToggle() {
    if (!pendingToggle) return;
    setBusy(true); setError(null);
    const next = !pendingToggle.cat.is_allowed;
    const { error } = await adb.from("marketplace_categories").update({ is_allowed: next }).eq("id", pendingToggle.cat.id);
    setBusy(false);
    if (error) { setError(error.message); setPendingToggle(null); return; }
    setPendingToggle(null);
    catsQ.refetch();
  }

  async function addCategory() {
    const name = newCat.trim();
    if (!name) return;
    setBusy(true); setError(null);
    const { error } = await adb.from("marketplace_categories").insert({ name, is_allowed: true });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setNewCat("");
    catsQ.refetch();
  }

  if (settingsQ.isLoading || catsQ.isLoading || templatesQ.isLoading) {
    return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;
  }

  // Two live warnings, computed from the real current values, not stale copy.
  const confirmDay = Number(val("marketplace_confirm_prompt_day"));
  const disputeDays = Number(val("marketplace_dispute_window_days"));
  const confirmVsDisputeClash = isFinite(confirmDay) && isFinite(disputeDays) && confirmDay >= disputeDays;
  const paystackOn = val("marketplace_payment_paystack_enabled") === true;
  const transferOn = val("marketplace_payment_transfer_enabled") === true;
  const noPaymentMethod = !paystackOn && !transferOn;

  /** One setting card: number/text share the edit-save-cancel pattern already
   * used for the bank fields; toggle/select act on the first interaction,
   * both still route through the same confirm modal before anything saves. */
  function renderField(f: SettingField) {
    const current = val(f.key);
    return (
      <div key={f.key} className="rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
        <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">{f.label}</div>

        {f.type === "toggle" ? (
          <div className="flex items-center gap-2 mt-2">
            <Switch checked={current === true} onCheckedChange={() => requestToggle(f, current)} />
            <span className="text-sm font-heading font-bold">{current === true ? "On" : "Off"}</span>
          </div>
        ) : f.type === "select" ? (
          <select
            value={typeof current === "string" ? current : (f.options?.[0]?.value ?? "")}
            onChange={(e) => requestSaveSelect(f, e.target.value)}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-sm bg-white"
            style={{ borderColor: "#F0DDD2" }}
          >
            {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : editing[f.key] ? (
          <div className="flex gap-2 mt-2">
            <input type={f.type === "number" ? "number" : "text"} value={edits[f.key] ?? ""} onChange={(e) => setEdits((s) => ({ ...s, [f.key]: e.target.value }))}
              className="flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }} />
            <button onClick={() => cancelEdit(f.key)} className="text-xs font-heading font-bold px-3 rounded-xl border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
            <button onClick={() => requestSave(f)} className="text-xs font-heading font-extrabold px-3 rounded-xl text-white" style={{ background: "#F4845F" }}>Save</button>
          </div>
        ) : (
          <div className="flex items-center justify-between mt-2">
            <div className="font-heading font-black text-xl tabular-nums">
              {f.money ? formatNaira(Number(current)) : f.percent ? `${strVal(f.key)}%` : `${strVal(f.key)}${f.suffix ?? ""}`}
            </div>
            <button onClick={() => startEdit(f.key, strVal(f.key))} className="text-xs font-heading font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: "#F0DDD2" }}>Edit</button>
          </div>
        )}

        <p className="text-[12px] text-text-med mt-2">{f.help}</p>
        {f.warning && (
          <p className="text-[12px] mt-2 pt-2 border-t" style={{ color: "#C0392B", borderColor: "#F0DDD2" }}>{f.warning}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading font-black text-2xl tracking-tight text-foreground">Settings</h1>
      <p className="text-sm text-text-med mt-1">Changes here affect live buyers and sellers, so each saves behind a confirm step.</p>

      {error && <div className="mt-3 text-xs" style={{ color: "#D4613C" }}>{error}</div>}

      {GROUPS.map((group) => (
        <div key={group.title} className="mt-6">
          <h2 className="text-sm font-heading font-extrabold text-foreground">{group.title}</h2>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            {group.fields.map(renderField)}
          </div>
          {group.title === "Orders and disputes" && confirmVsDisputeClash && (
            <div className="mt-3 rounded-2xl border p-3 text-sm" style={{ borderColor: "#C0392B", background: "#FDECEA", color: "#8C2A1F" }}>
              The confirm-receipt prompt fires on day {confirmDay}, at or after the {disputeDays}-day dispute window that auto releases the payout. A buyer gets prompted the same moment their money is already releasing. This has happened before, lower the prompt day or raise the dispute window so the prompt lands first.
            </div>
          )}
          {group.title === "Payments" && noPaymentMethod && (
            <div className="mt-3 rounded-2xl border p-3 text-sm" style={{ borderColor: "#C0392B", background: "#FDECEA", color: "#8C2A1F" }}>
              Both Paystack and bank transfer are off. Checkout is impossible for buyers right now, turn at least one back on.
            </div>
          )}
        </div>
      ))}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* digest email */}
        <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
          <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">{FIELD.email.label}</div>
          {editing[FIELD.email.key] ? (
            <div className="flex flex-col gap-2 mt-2">
              <input type="text" inputMode="email" value={edits[FIELD.email.key] ?? ""} onChange={(e) => setEdits((s) => ({ ...s, [FIELD.email.key]: e.target.value }))}
                placeholder="ops@bundledmum.com, alerts@bundledmum.com" className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }} />
              <div className="flex gap-2">
                <button onClick={() => cancelEdit(FIELD.email.key)} className="text-xs font-heading font-bold px-3 py-1.5 rounded-xl border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
                <button onClick={requestSaveEmails} className="text-xs font-heading font-extrabold px-3 py-1.5 rounded-xl text-white" style={{ background: "#F4845F" }}>Save</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2 mt-2">
              <div className="flex-1 min-w-0">
                {parseEmails(strVal(FIELD.email.key)).length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {parseEmails(strVal(FIELD.email.key)).map((e) => (
                      <span key={e} className="inline-flex items-center text-[12px] font-heading font-bold px-2.5 py-1 rounded-lg break-all" style={{ background: "#D8EFE5", color: "#1A4A33" }}>{e}</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-text-light text-sm">Not set</span>
                )}
              </div>
              <button onClick={() => startEdit(FIELD.email.key, strVal(FIELD.email.key))} className="text-xs font-heading font-bold px-3 py-1.5 rounded-lg border flex-none" style={{ borderColor: "#F0DDD2" }}>Edit</button>
            </div>
          )}
          <p className="text-[12px] text-text-med mt-2">{FIELD.email.help}</p>
        </div>
      </div>

      {/* per-alert recipient overrides */}
      <div className="mt-4 rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
        <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Recipients per alert</div>
        <p className="text-[12px] text-text-med mt-1.5">
          Each of the seven internal alerts below can go to its own recipients instead of the shared address above. Leave one blank to keep using the shared address for that alert, an empty field never turns an alert off.
        </p>
        <div className="mt-3 flex flex-col divide-y" style={{ borderColor: "#F0DDD2" }}>
          {(templatesQ.data ?? []).map((row) => {
            const list = parseEmails(row.internal_recipients || "");
            const tplErr = tplErrors[row.slug];
            return (
              <div key={row.id} className="py-3 first:pt-0 last:pb-0">
                <div className="font-heading font-extrabold text-sm text-foreground">{row.name}</div>
                {row.description && <p className="text-[12px] text-text-med mt-0.5">{row.description}</p>}

                {tplEditing[row.slug] ? (
                  <div className="flex flex-col gap-2 mt-2">
                    <input type="text" inputMode="email" value={tplEdits[row.slug] ?? ""}
                      onChange={(e) => setTplEdits((s) => ({ ...s, [row.slug]: e.target.value }))}
                      placeholder="Leave blank to use the shared address, or ops@bundledmum.com, alerts@bundledmum.com"
                      className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }} />
                    {tplErr && <div className="text-xs" style={{ color: "#D4613C" }}>{tplErr}</div>}
                    <div className="flex gap-2">
                      <button onClick={() => cancelTplEdit(row.slug)} className="text-xs font-heading font-bold px-3 py-1.5 rounded-xl border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
                      <button onClick={() => requestSaveTemplateEmails(row)} className="text-xs font-heading font-extrabold px-3 py-1.5 rounded-xl text-white" style={{ background: "#F4845F" }}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2 mt-2">
                    <div className="flex-1 min-w-0">
                      {list.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {list.map((e) => (
                            <span key={e} className="inline-flex items-center text-[12px] font-heading font-bold px-2.5 py-1 rounded-lg break-all" style={{ background: "#D8EFE5", color: "#1A4A33" }}>{e}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-text-light text-sm">
                          Falls back to {strVal(FIELD.email.key) || <span className="italic">the shared address, not set</span>}
                        </span>
                      )}
                    </div>
                    <button onClick={() => startTplEdit(row.slug, row.internal_recipients || "")} className="text-xs font-heading font-bold px-3 py-1.5 rounded-lg border flex-none" style={{ borderColor: "#F0DDD2" }}>Edit</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* bank group */}
      <div className="mt-4 rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
        <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Bank account shown to buyers at checkout</div>
        <p className="text-[12px] text-text-med mt-1">Only used when bank transfer is enabled above, under Payments.</p>
        <div className="grid gap-3 sm:grid-cols-3 mt-3">
          {([
            { key: "marketplace_bank_name", label: "Bank" },
            { key: "marketplace_bank_account_name", label: "Account name" },
            { key: "marketplace_bank_account_number", label: "Account number" },
          ] as const).map((b) => (
            <div key={b.key}>
              <div className="text-[10px] font-heading font-bold uppercase tracking-wider text-text-light mb-1">{b.label}</div>
              {editing[b.key] ? (
                <div className="flex flex-col gap-1.5">
                  <input value={edits[b.key] ?? ""} onChange={(e) => setEdits((s) => ({ ...s, [b.key]: e.target.value }))}
                    className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }} />
                  <div className="flex gap-1.5">
                    <button onClick={() => cancelEdit(b.key)} className="flex-1 text-xs font-heading font-bold py-1.5 rounded-lg border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
                    <button onClick={() => requestSave({ key: b.key, label: b.label })} className="flex-1 text-xs font-heading font-extrabold py-1.5 rounded-lg text-white" style={{ background: "#F4845F" }}>Save</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="font-heading font-bold text-sm truncate">{strVal(b.key) || <span className="text-text-light font-body font-normal">Not set</span>}</div>
                  <button onClick={() => startEdit(b.key, strVal(b.key))} className="text-xs font-heading font-bold px-2.5 py-1 rounded-lg border flex-none" style={{ borderColor: "#F0DDD2" }}>Edit</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* categories */}
      <div className="mt-4 rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Categories</div>
          <div className="flex gap-2">
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category name"
              className="rounded-lg border px-3 py-1.5 text-sm w-44" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }} />
            <button onClick={addCategory} disabled={busy || !newCat.trim()} className="text-xs font-heading font-extrabold px-3 rounded-lg border" style={{ borderColor: "#2D6A4F", color: "#2D6A4F" }}>Add</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {(catsQ.data ?? []).map((c) => (
            <button key={c.id} onClick={() => { setPendingToggle({ cat: c }); setError(null); }}
              className="inline-flex items-center gap-2 text-[12px] font-heading font-bold px-2.5 py-1.5 rounded-lg border transition"
              style={c.is_allowed
                ? { background: "#D8EFE5", color: "#1A4A33", borderColor: "#D8EFE5" }
                : { background: "#EDE6E1", color: "#8A7A72", borderColor: "#EDE6E1", opacity: 0.75 }}>
              {c.name}
              {!c.is_allowed && <span className="uppercase tracking-wide text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#8A7A72", color: "#FFF8F4" }}>disabled</span>}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-text-med mt-3">Disabling a category removes it from the customer marketplace. This is how banned categories are kept out. Tap a category to enable or disable it.</p>
      </div>

      {/* locations */}
      <MarketplaceLocations />

      {/* confirm: setting save */}
      {pendingSave && (
        <div className="fixed inset-0 z-[120] bg-black/45 flex items-center justify-center p-4" onClick={() => !busy && setPendingSave(null)}>
          <div className="bg-white rounded-2xl border p-5 max-w-sm w-full" style={{ borderColor: "#F0DDD2" }} onClick={(e) => e.stopPropagation()}>
            <div className="font-heading font-black text-lg">Save change?</div>
            <p className="text-sm text-text-med mt-1">This affects live buyers and sellers.</p>
            <div className="flex justify-between text-sm py-3 mt-2 border-t border-b" style={{ borderColor: "#EDE6E1" }}>
              <span>{pendingSave.label}</span><b className="font-heading">{pendingSave.display}</b>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPendingSave(null)} disabled={busy} className="flex-1 font-heading font-bold text-sm rounded-xl py-2.5 border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
              <button onClick={confirmSave} disabled={busy} className="flex-1 font-heading font-extrabold text-sm rounded-xl py-2.5 text-white" style={{ background: "#D4613C" }}>{busy ? "Saving..." : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}

      {/* confirm: per-alert recipient save */}
      {pendingTemplateSave && (
        <div className="fixed inset-0 z-[120] bg-black/45 flex items-center justify-center p-4" onClick={() => !busy && setPendingTemplateSave(null)}>
          <div className="bg-white rounded-2xl border p-5 max-w-sm w-full" style={{ borderColor: "#F0DDD2" }} onClick={(e) => e.stopPropagation()}>
            <div className="font-heading font-black text-lg">Change where this alert goes?</div>
            <p className="text-sm text-text-med mt-1">This affects live buyers and sellers.</p>
            <div className="flex justify-between text-sm py-3 mt-2 border-t border-b" style={{ borderColor: "#EDE6E1" }}>
              <span>{pendingTemplateSave.name}</span><b className="font-heading text-right">{pendingTemplateSave.display}</b>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPendingTemplateSave(null)} disabled={busy} className="flex-1 font-heading font-bold text-sm rounded-xl py-2.5 border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
              <button onClick={confirmTemplateSave} disabled={busy} className="flex-1 font-heading font-extrabold text-sm rounded-xl py-2.5 text-white" style={{ background: "#D4613C" }}>{busy ? "Saving..." : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}

      {/* confirm: category toggle */}
      {pendingToggle && (
        <div className="fixed inset-0 z-[120] bg-black/45 flex items-center justify-center p-4" onClick={() => !busy && setPendingToggle(null)}>
          <div className="bg-white rounded-2xl border p-5 max-w-sm w-full" style={{ borderColor: "#F0DDD2" }} onClick={(e) => e.stopPropagation()}>
            <div className="font-heading font-black text-lg">{pendingToggle.cat.is_allowed ? "Disable" : "Enable"} {pendingToggle.cat.name}?</div>
            <p className="text-sm text-text-med mt-1">
              {pendingToggle.cat.is_allowed
                ? "This removes the category from the customer marketplace."
                : "This makes the category available in the customer marketplace."}
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setPendingToggle(null)} disabled={busy} className="flex-1 font-heading font-bold text-sm rounded-xl py-2.5 border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
              <button onClick={confirmToggle} disabled={busy} className="flex-1 font-heading font-extrabold text-sm rounded-xl py-2.5 text-white" style={{ background: "#D4613C" }}>{busy ? "Saving..." : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
