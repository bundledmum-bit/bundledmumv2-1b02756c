import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira, STRIKE_THRESHOLD } from "./opsData";
import { OpsHeader, OpsEmpty, OpsCard, StatusPill, CopyField, ConfirmDialog } from "./opsUi";

interface SellerRow {
  id: string;
  display_name: string | null;
  verification_tier: string | null;
  strike_count: number;
  outstanding_debit_naira: number;
  status: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  liveListings: number;
}

/**
 * Sellers management, the risk list. Verification, live listings, strikes, any
 * debit owed to the platform, and account status. Sellers at or approaching the
 * strike threshold carry a red left stripe and a negative pill so the risk reads
 * at a glance. The detail shows bank details on file and the suspend, reinstate
 * and mark-verified actions, each behind a confirm step.
 */
export default function MarketplaceSellers() {
  const { data: sellers, isLoading, refetch } = useQuery({
    queryKey: ["mkt-sellers"],
    staleTime: 10000,
    queryFn: async (): Promise<SellerRow[]> => {
      const { data } = await adb.from("marketplace_sellers")
        .select("id, display_name, verification_tier, strike_count, outstanding_debit_naira, status, bank_name, bank_account_name, bank_account_number")
        .order("strike_count", { ascending: false });
      const rows = (data ?? []) as Array<Omit<SellerRow, "liveListings">>;
      // Live listing counts, tallied client-side from a light select.
      const { data: live } = await adb.from("marketplace_listings").select("seller_id").eq("status", "live");
      const counts = new Map<string, number>();
      for (const l of (live ?? []) as Array<{ seller_id: string }>) counts.set(l.seller_id, (counts.get(l.seller_id) || 0) + 1);
      return rows.map((r) => ({ ...r, liveListings: counts.get(r.id) || 0 }));
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => (sellers ?? []).find((s) => s.id === selectedId) || null, [sellers, selectedId]);
  const atThreshold = (sellers ?? []).filter((s) => s.strike_count >= STRIKE_THRESHOLD).length;
  const pending = (sellers ?? []).filter((s) => (s.verification_tier || "") !== "verified").length;

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  if (!sellers || sellers.length === 0) {
    return (
      <div>
        <OpsHeader title="Sellers" subtitle="Verification, strikes, debt and account status." />
        <OpsEmpty title="No sellers yet" body="Sellers appear here once people start listing on the marketplace." />
      </div>
    );
  }

  return (
    <div>
      <OpsHeader title="Sellers" subtitle={`${sellers.length} ${sellers.length === 1 ? "seller" : "sellers"}${atThreshold ? `, ${atThreshold} at strike threshold` : ""}${pending ? `, ${pending} pending verification` : ""}.`} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* list */}
        <div className={`flex flex-col gap-2 ${selected ? "hidden lg:flex" : ""}`}>
          {sellers.map((s) => {
            const risk = s.strike_count >= STRIKE_THRESHOLD - 1;
            const suspended = (s.status || "") === "suspended";
            return (
              <button key={s.id} onClick={() => setSelectedId(s.id)}
                className="text-left rounded-2xl border bg-white p-3.5 flex items-center gap-3"
                style={{ borderColor: selectedId === s.id ? "#2D6A4F" : "#F0DDD2", borderLeftWidth: risk ? 4 : 1, borderLeftColor: risk ? "#C0392B" : "#F0DDD2" }}>
                <div className="flex-1 min-w-0">
                  <div className="font-heading font-black text-sm text-foreground truncate">{s.display_name || "Seller"}</div>
                  <div className="text-[11px] text-text-med">{s.liveListings} live · {s.verification_tier === "verified" ? "Verified" : "Pending"}{s.outstanding_debit_naira > 0 ? ` · owes ${formatNaira(s.outstanding_debit_naira)}` : ""}</div>
                </div>
                {s.strike_count > 0 && <StatusPill tone={risk ? "negative" : "neutral"} label={`${s.strike_count} of ${STRIKE_THRESHOLD}`} />}
                {suspended ? <StatusPill tone="negative" label="Suspended" /> : <StatusPill tone={s.verification_tier === "verified" ? "good" : "work"} label={s.verification_tier === "verified" ? "Active" : "Pending"} />}
              </button>
            );
          })}
        </div>

        {/* detail */}
        <div className={selected ? "" : "hidden lg:block"}>
          {selected ? <SellerDetail s={selected} onBack={() => setSelectedId(null)} onChanged={refetch} />
            : <OpsEmpty title="Pick a seller" body="Select a seller to see bank details and act on the account." />}
        </div>
      </div>
    </div>
  );
}

type Action = "suspend" | "reinstate" | "verify";

interface NudgeSuggestion { stage_key: string; label: string; urgency: number; whatsapp_link: string; }

function SellerDetail({ s, onBack, onChanged }: { s: SellerRow; onBack: () => void; onChanged: () => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspended = (s.status || "") === "suspended";
  const verified = (s.verification_tier || "") === "verified";
  const risk = s.strike_count >= STRIKE_THRESHOLD - 1;

  // Suggested outreach: every lifecycle stage this seller currently matches
  // (zero, one, or several at once), most time-sensitive first. The function
  // returns stages in a fixed check order, not sorted by urgency, so that
  // sort has to happen here.
  const { data: nudges = [] } = useQuery({
    queryKey: ["mkt-seller-nudges", s.id],
    staleTime: 15000,
    queryFn: async (): Promise<NudgeSuggestion[]> => {
      const { data, error: err } = await adb.rpc("get_seller_nudge_suggestions", { p_seller_id: s.id });
      if (err) throw err;
      return ((data ?? []) as NudgeSuggestion[]).slice().sort((a, b) => a.urgency - b.urgency);
    },
  });

  async function commit() {
    if (!action) return;
    setBusy(true); setError(null);
    let patch: Record<string, unknown> = {};
    if (action === "suspend") patch = { status: "suspended", suspended_at: new Date().toISOString() };
    if (action === "reinstate") patch = { status: "active", suspended_at: null };
    if (action === "verify") patch = { verification_tier: "verified" };
    const { error: err } = await adb.from("marketplace_sellers").update(patch).eq("id", s.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setAction(null); onChanged();
  }

  const dialog: Record<Action, { title: string; body: string; confirm: string; danger: boolean }> = {
    suspend: {
      title: `Suspend ${s.display_name || "this seller"}?`,
      body: `This sets the account to suspended. They have ${s.liveListings} live ${s.liveListings === 1 ? "listing" : "listings"}, review and delist any that should come down. Any order already paid for still has to be fulfilled or refunded.`,
      confirm: "Suspend this account", danger: true,
    },
    reinstate: {
      title: `Reinstate ${s.display_name || "this seller"}?`,
      body: "This sets the account back to active. They can list and sell again.",
      confirm: "Reinstate this account", danger: false,
    },
    verify: {
      title: `Mark ${s.display_name || "this seller"} verified?`,
      body: "This gives the account the verified badge across the marketplace.",
      confirm: "Mark verified", danger: false,
    },
  };

  return (
    <div className="flex flex-col gap-3">
      <button onClick={onBack} className="lg:hidden text-sm font-heading font-bold self-start" style={{ color: "#2D6A4F" }}>‹ All sellers</button>

      <OpsCard danger={risk}>
        <div className="flex items-center justify-between gap-2">
          <div className="font-heading font-black text-lg text-foreground">{s.display_name || "Seller"}</div>
          {suspended ? <StatusPill tone="negative" label="Suspended" /> : <StatusPill tone={verified ? "good" : "work"} label={verified ? "Active" : "Pending verification"} />}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Stat label="Verification" value={verified ? "Verified" : "Pending"} />
          <Stat label="Live listings" value={String(s.liveListings)} />
          <Stat label="Strikes" value={`${s.strike_count} of ${STRIKE_THRESHOLD}`} danger={risk} />
          <Stat label="Owed to platform" value={formatNaira(s.outstanding_debit_naira)} danger={s.outstanding_debit_naira > 0} />
        </div>
        {risk && !suspended && <div className="text-xs mt-3" style={{ color: "#C0392B" }}>One more strike suspends this account. Review recent disputes before acting.</div>}
      </OpsCard>

      {/* Zero matches is this seller's actual situation, not a broken query —
          no placeholder, the section simply doesn't render. */}
      {nudges.length > 0 && (
        <OpsCard label="Suggested outreach">
          <div className="flex flex-col gap-2.5">
            {nudges.map((n) => (
              <div key={n.stage_key} className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-bold text-foreground">{n.label}</span>
                <a
                  href={n.whatsapp_link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-none flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 font-heading font-extrabold text-[12.5px]"
                  style={{ background: "#25D366", color: "#FFFFFF" }}
                >
                  WhatsApp
                </a>
              </div>
            ))}
          </div>
        </OpsCard>
      )}

      <OpsCard label="Bank details on file, for payouts">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-foreground">{s.bank_name || "Bank not set"} · {s.bank_account_name || ""}</span>
          <CopyField value={s.bank_account_number || ""} />
        </div>
      </OpsCard>

      <div className="flex flex-col sm:flex-row gap-2.5">
        {!verified && <button onClick={() => { setError(null); setAction("verify"); }} className="sm:flex-1 font-heading font-extrabold text-sm rounded-xl py-3 text-white" style={{ background: "#2D6A4F" }}>Mark verified</button>}
        {suspended
          ? <button onClick={() => { setError(null); setAction("reinstate"); }} className="sm:flex-1 font-heading font-extrabold text-sm rounded-xl py-3 border" style={{ borderColor: "#2D6A4F", color: "#2D6A4F" }}>Reinstate</button>
          : <button onClick={() => { setError(null); setAction("suspend"); }} className="sm:flex-1 font-heading font-extrabold text-sm rounded-xl py-3 border" style={{ borderColor: "#C0392B", color: "#C0392B" }}>Suspend</button>}
      </div>

      <ConfirmDialog
        open={action !== null}
        title={action ? dialog[action].title : ""}
        body={action ? dialog[action].body : ""}
        confirmLabel={action ? dialog[action].confirm : "Confirm"}
        danger={action ? dialog[action].danger : false}
        busy={busy} error={error}
        onConfirm={commit} onCancel={() => !busy && setAction(null)}
      />
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">{label}</div>
      <div className="font-heading font-black text-base tabular-nums" style={{ color: danger ? "#C0392B" : "#1A1A1A" }}>{value}</div>
    </div>
  );
}
