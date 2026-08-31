import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import {
  fetchNeverListedSellers, canAdminListFor, adminRecordAssistedConsent, adminCreateManagedSeller,
  ASSISTED_CONSENT_NOTE_MIN, MANAGED_CONSENT_NOTE_MIN,
  type NeverListedSeller,
} from "./opsData";
import { OpsHeader, OpsEmpty, OpsCard, StatusPill } from "./opsUi";
import { NoteField, noteReady, OnBehalfErr, OnBehalfDone, onBehalfBtn, ReadOnlyNotice, useOnBehalfSubmit } from "./onBehalf";

/**
 * The 133 who set up their bank details and never listed.
 *
 * Nobody enters bank details casually. Every one of these people reached the
 * step that says "this is where your money goes" and then stopped at listing,
 * which makes this friction rather than disinterest, and the largest single
 * opportunity on the platform. The offer emailed to them is that they send us
 * their items and we list them.
 *
 * This is the screen you open when one of them replies.
 *
 * TWO RELATIONSHIPS, never conflated. Everyone in this list signed up
 * THEMSELVES and owns their account: they delegate one job, they are not
 * "admin managed", and marking them so would misrepresent both the
 * relationship and the consent behind it. Creating a managed seller is a
 * separate action for someone who was never on the platform at all.
 */
export default function MarketplaceNeverListed() {
  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["mkt-never-listed"], queryFn: fetchNeverListedSellers, staleTime: 30_000,
  });
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) =>
      (r.display_name || "").toLowerCase().includes(q) ||
      (r.full_name || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.phone || "").includes(q));
  }, [rows, search]);

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  const all = rows ?? [];
  const consented = all.filter((r) => r.assisted_listing_ok).length;
  const noDelivery = all.filter((r) => !r.answered_delivery).length;

  return (
    <div>
      <OpsHeader
        title="Never listed"
        subtitle="Everyone who set up their bank details and then stopped. They meant to sell, so this is friction, not disinterest."
      />

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label="Never listed" value={String(all.length)} />
        <Tile label="Asked us to list" value={String(consented)} />
        <Tile label="No delivery answer" value={String(noDelivery)} tone={noDelivery > 0 ? "warn" : undefined} />
        <button onClick={() => setCreating(true)}
          className="rounded-xl border p-3 text-left" style={{ borderColor: "#2D6A4F", background: "#D8EFE5" }}>
          <div className="font-heading font-black text-[12.5px]">Add someone new</div>
          <div className="text-[10.5px]" style={{ color: "#1A4A33" }}>For a seller who was never on BundledMum at all</div>
        </button>
      </div>

      {creating && <CreateManagedSeller onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void refetch(); }} />}

      <div className="mt-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a name, an email or a phone number"
          className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#E3D4CB" }} />
      </div>

      {filtered.length === 0 ? (
        <OpsEmpty title="Nobody here" body={all.length === 0 ? "Every registered seller has listed something." : "Nothing matches that."} />
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {filtered.map((r) => <SellerRow key={r.seller_id} r={r} onChanged={() => void refetch()} />)}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: tone === "warn" ? "#F4845F" : "#F0DDD2", background: tone === "warn" ? "#FFF3E8" : "#FFF8F4" }}>
      <div className="text-[10px] uppercase tracking-widest font-heading font-extrabold" style={{ color: "#6B5B54" }}>{label}</div>
      <div className="text-lg font-heading font-black tabular-nums" style={{ color: tone === "warn" ? "#D4613C" : "#1A1A1A" }}>{value}</div>
    </div>
  );
}

function SellerRow({ r, onChanged }: { r: NeverListedSeller; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const wa = (r.phone || "").replace(/[^0-9]/g, "").replace(/^0/, "234");

  return (
    <div className="rounded-2xl border p-3.5 bg-white flex flex-col gap-2" style={{ borderColor: "#F0DDD2" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-heading font-black text-[14px] text-foreground">{r.display_name || r.full_name || "Seller"}</div>
          <div className="text-[11px] text-text-med">
            {r.email || "No email"} · registered {r.days_since_registering} day{r.days_since_registering === 1 ? "" : "s"} ago
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "#8A7A72" }}>{r.how_far_they_got}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {r.assisted_listing_ok
            ? <StatusPill tone="good" label="Asked us to list" />
            : <StatusPill tone="neutral" label="Not asked yet" />}
          {!r.answered_delivery && <StatusPill tone="work" label="No delivery answer" />}
        </div>
      </div>

      {r.assisted_consent_note && (
        <div className="rounded-lg px-2.5 py-2 text-[12px]" style={{ background: "#FFF8F4", color: "#4A3F3A" }}>
          {r.assisted_consent_note}
        </div>
      )}

      <div className="flex items-center gap-2.5 flex-wrap">
        {wa && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"
            className="font-heading font-extrabold text-[11.5px] rounded-lg px-2.5 py-1.5 border" style={{ borderColor: "#E3D4CB" }}>
            Message on WhatsApp
          </a>
        )}
        {r.assisted_listing_ok ? (
          <a href={`/marketplace/sell/new?for=${r.seller_id}`} target="_blank" rel="noreferrer"
            className="font-heading font-extrabold text-[11.5px] rounded-lg px-2.5 py-1.5 text-white" style={{ background: "#2D6A4F" }}>
            List an item for them
          </a>
        ) : (
          <button onClick={() => setOpen(!open)} className="text-[11.5px] underline" style={{ color: "#2D6A4F" }}>
            {open ? "Close" : "They asked me to list for them"}
          </button>
        )}
      </div>

      {open && !r.assisted_listing_ok && (
        <RecordConsent sellerId={r.seller_id} name={r.display_name || r.full_name} onDone={onChanged} />
      )}
    </div>
  );
}

/**
 * Consent, recorded as a fact about what happened.
 *
 * The prompt asks HOW they asked, not for a justification, because there is
 * one correct answer and an operator either has it or does not. Stored
 * permanently against the seller.
 *
 * This does NOT mark them admin managed. They run their own account and
 * delegated one job.
 */
function RecordConsent({ sellerId, name, onDone }: { sellerId: string; name: string | null; onDone: () => void }) {
  const [note, setNote] = useState("");
  const { busy, error, done, submit } = useOnBehalfSubmit();

  if (done) return <OnBehalfDone msg={done} />;
  const ready = noteReady(note, ASSISTED_CONSENT_NOTE_MIN);

  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2.5" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
      <ReadOnlyNotice />
      <div className="text-[11.5px]" style={{ color: "#6B5B54" }}>
        {name || "This seller"} keeps their own account and their own login. This only records that they asked us to do the listing.
      </div>
      <NoteField
        value={note} onChange={setNote} min={ASSISTED_CONSENT_NOTE_MIN}
        prompt="How did they ask?"
        placeholder="For example: she sent me photos of her pram on WhatsApp this morning and asked me to put them up"
      />
      <OnBehalfErr msg={error} />
      <button type="button" disabled={!ready || busy}
        onClick={async () => {
          const ok = await submit(() => adminRecordAssistedConsent({ sellerId, note }), "Recorded.");
          if (ok) onDone();
        }}
        className="self-start font-heading font-extrabold text-[12px] rounded-lg px-3 py-2" style={onBehalfBtn(ready && !busy)}>
        {busy ? "Saving..." : "Record it"}
      </button>
    </div>
  );
}

/**
 * Someone who was never on BundledMum at all.
 *
 * NO auth user is created. They claim the account simply by signing in with
 * this email, which link_auth_user_to_customer connects on first sign in, so
 * nothing has to migrate and there is no password to hand over.
 */
function CreateManagedSeller({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({ email: "", fullName: "", phone: "", displayName: "", whatsapp: "", consentNote: "" });
  const { busy, error, done, submit } = useOnBehalfSubmit();

  const ready = f.email.includes("@") && f.fullName.trim().length > 1 && f.phone.trim().length > 5
    && f.displayName.trim().length > 0 && noteReady(f.consentNote, MANAGED_CONSENT_NOTE_MIN);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <div className="mt-3">
      <OpsCard label="Add someone who was never on BundledMum">
        <ReadOnlyNotice />
        {done ? <OnBehalfDone msg={done} /> : (
          <>
            <div className="text-[11.5px] mb-2" style={{ color: "#6B5B54" }}>
              This creates their account and their seller profile. No password is set and nothing is sent to them here.
              They become the owner the first time they sign in with this email, and everything about their items reaches
              this address from then on.
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label="Their email" value={f.email} onChange={set("email")} placeholder="the address they will sign in with" />
              <Field label="Their full name" value={f.fullName} onChange={set("fullName")} placeholder="as it appears on their bank account" />
              <Field label="Phone" value={f.phone} onChange={set("phone")} />
              <Field label="WhatsApp (optional)" value={f.whatsapp} onChange={set("whatsapp")} placeholder="if different from the phone" />
              <Field label="Shown to buyers" value={f.displayName} onChange={set("displayName")} placeholder="for example Amaka O." />
            </div>
            <div className="mt-2.5">
              <NoteField
                value={f.consentNote} onChange={(v) => setF({ ...f, consentNote: v })} min={MANAGED_CONSENT_NOTE_MIN}
                prompt="How did they ask, and what did they agree to?"
                placeholder="For example: met her at the Lekki popup, she asked us to sell her twins' outgrown clothes and gave us her details there"
              />
            </div>
            <OnBehalfErr msg={error} />
            <div className="flex gap-2 mt-2.5">
              <button type="button" disabled={!ready || busy}
                onClick={async () => {
                  const ok = await submit(() => adminCreateManagedSeller({
                    email: f.email, fullName: f.fullName, phone: f.phone,
                    displayName: f.displayName, consentNote: f.consentNote, whatsapp: f.whatsapp,
                  }), "Account created.");
                  if (ok) onCreated();
                }}
                className="font-heading font-extrabold text-[12px] rounded-lg px-3 py-2" style={onBehalfBtn(ready && !busy)}>
                {busy ? "Creating..." : "Create their account"}
              </button>
              <button type="button" onClick={onClose} className="text-[11.5px] underline" style={{ color: "#8A7A72" }}>Cancel</button>
            </div>
          </>
        )}
      </OpsCard>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; placeholder?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-heading font-extrabold text-[11px]" style={{ color: "#6B5B54" }}>{label}</span>
      <input value={value} onChange={onChange} placeholder={placeholder}
        className="rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: "#E3D4CB" }} />
    </label>
  );
}
