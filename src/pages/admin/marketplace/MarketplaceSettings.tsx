import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira } from "./data";
import MarketplaceLocations from "./MarketplaceLocations";

/**
 * Marketplace settings. Reads and writes the marketplace_* keys in
 * site_settings, and manages marketplace_categories. Every save passes through
 * a confirm step, because these levers affect live buyers and sellers.
 */

type SettingKey =
  | "marketplace_markup_percent"
  | "marketplace_service_fee_naira"
  | "marketplace_dispute_window_days"
  | "marketplace_payout_digest_email"
  | "marketplace_bank_name"
  | "marketplace_bank_account_name"
  | "marketplace_bank_account_number";

interface Category { id: string; name: string; is_allowed: boolean }
interface PendingSave { key: SettingKey; label: string; value: string | number; display: string }
interface PendingToggle { cat: Category }

const FIELD = {
  markup: { key: "marketplace_markup_percent", label: "Markup percentage", help: "Added to the seller price to make the buyer price.", numeric: true, suffix: "%" },
  fee: { key: "marketplace_service_fee_naira", label: "Service fee", help: "Non refundable, charged once per order.", numeric: true, money: true },
  window: { key: "marketplace_dispute_window_days", label: "Dispute window", help: "After this, payout sweeps to the seller.", numeric: true, suffix: " days" },
  email: { key: "marketplace_payout_digest_email", label: "Internal alert recipients", help: "Every internal alert goes to all of these: the daily payout digest, a new sale, a new dispute, a new seller registering, a seller auto suspended, a payment amount anomaly, and the review backlog nudge. Enter one or more addresses, comma separated.", numeric: false },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split a comma separated recipients string into trimmed, non-empty addresses. */
function parseEmails(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function MarketplaceSettings() {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [newCat, setNewCat] = useState("");
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function requestSave(f: { key: string; label: string; numeric?: boolean; money?: boolean; suffix?: string }) {
    const raw = edits[f.key] ?? "";
    let value: string | number = raw.trim();
    if (f.numeric) {
      const n = Number(raw);
      if (!isFinite(n) || n < 0) { setError(`${f.label} must be a number.`); return; }
      value = n;
    }
    const display = f.money ? formatNaira(Number(value)) : `${value}${f.suffix ?? ""}`;
    setPendingSave({ key: f.key as SettingKey, label: f.label, value, display });
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

  if (settingsQ.isLoading || catsQ.isLoading) {
    return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;
  }

  const numericFields = [FIELD.markup, FIELD.fee, FIELD.window];

  return (
    <div>
      <h1 className="font-heading font-black text-2xl tracking-tight text-foreground">Settings</h1>
      <p className="text-sm text-text-med mt-1">Changes here affect live buyers and sellers, so each saves behind a confirm step.</p>

      {error && <div className="mt-3 text-xs" style={{ color: "#D4613C" }}>{error}</div>}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {numericFields.map((f) => (
          <div key={f.key} className="rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
            <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">{f.label}</div>
            {editing[f.key] ? (
              <div className="flex gap-2 mt-2">
                <input type="number" value={edits[f.key] ?? ""} onChange={(e) => setEdits((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="flex-1 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }} />
                <button onClick={() => cancelEdit(f.key)} className="text-xs font-heading font-bold px-3 rounded-xl border" style={{ borderColor: "#F0DDD2" }}>Cancel</button>
                <button onClick={() => requestSave(f)} className="text-xs font-heading font-extrabold px-3 rounded-xl text-white" style={{ background: "#F4845F" }}>Save</button>
              </div>
            ) : (
              <div className="flex items-center justify-between mt-2">
                <div className="font-heading font-black text-xl tabular-nums">
                  {"money" in f && f.money ? formatNaira(Number(val(f.key))) : `${strVal(f.key)}${"suffix" in f ? (f.suffix ?? "") : ""}`}
                </div>
                <button onClick={() => startEdit(f.key, strVal(f.key))} className="text-xs font-heading font-bold px-3 py-1.5 rounded-lg border" style={{ borderColor: "#F0DDD2" }}>Edit</button>
              </div>
            )}
            <p className="text-[12px] text-text-med mt-2">{f.help}</p>
          </div>
        ))}

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

      {/* bank group */}
      <div className="mt-4 rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
        <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Bank account shown to buyers at checkout</div>
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
