import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira, resolveDispute, DISPUTE_OUTCOMES, type DisputeOutcome } from "./opsData";
import { OpsHeader, OpsEmpty, OpsCard, StatusPill, ConfirmDialog } from "./opsUi";

interface DisputeDetail {
  id: string;
  order_id: string;
  reason: string | null;
  evidence: unknown;
  created_at: string | null;
  raised_by: string | null;
  order_reference: string;
  amount_naira: number;
  dispatch_photo_url: string | null;
  dispatch_confirmed_at: string | null;
  buyer_confirmed_at: string | null;
  order_created_at: string | null;
  listing_title: string | null;
  seller_name: string | null;
  seller_tier: string | null;
  seller_strikes: number;
  buyer_name: string | null;
}

function evidenceUrls(ev: unknown): string[] {
  if (Array.isArray(ev)) return ev.filter((x) => typeof x === "string") as string[];
  if (ev && typeof ev === "object" && Array.isArray((ev as { photos?: unknown }).photos)) {
    return ((ev as { photos: unknown[] }).photos).filter((x) => typeof x === "string") as string[];
  }
  return [];
}

/**
 * Dispute arbitration. Open disputes (outcome is null) on the left, the ruling on
 * the right. The operator reviews the listing, the buyer's reason and evidence,
 * the seller's dispatch photo, the timeline and the amount at stake, then picks
 * EXACTLY ONE of three outcomes, each spelling out its consequence before the
 * click. A written reason is required and a confirm step guards the commit.
 */
export default function MarketplaceDisputes() {
  const { data: disputes, isLoading, refetch } = useQuery({
    queryKey: ["mkt-open-disputes"],
    staleTime: 10000,
    queryFn: async (): Promise<DisputeDetail[]> => {
      const { data: rows } = await adb.from("marketplace_disputes")
        .select("id, order_id, reason, evidence, created_at, raised_by")
        .is("outcome", null).order("created_at", { ascending: true });
      const dRows = (rows ?? []) as Array<{ id: string; order_id: string; reason: string | null; evidence: unknown; created_at: string | null; raised_by: string | null }>;
      if (!dRows.length) return [];

      const { data: orders } = await adb.from("marketplace_orders")
        .select("id, paystack_transaction_reference, amount_naira, dispatch_photo_url, dispatch_confirmed_at, buyer_confirmed_at, created_at, listing_id, seller_id")
        .in("id", dRows.map((d) => d.order_id));
      const oMap = new Map((orders ?? []).map((o: Record<string, unknown>) => [o.id as string, o]));

      const listingIds = Array.from(new Set((orders ?? []).map((o: Record<string, unknown>) => o.listing_id as string).filter(Boolean)));
      const sellerIds = Array.from(new Set((orders ?? []).map((o: Record<string, unknown>) => o.seller_id as string).filter(Boolean)));
      const buyerIds = Array.from(new Set(dRows.map((d) => d.raised_by).filter(Boolean))) as string[];

      const [{ data: listings }, { data: sellers }, buyers] = await Promise.all([
        listingIds.length ? adb.from("marketplace_listings").select("id, title").in("id", listingIds) : Promise.resolve({ data: [] }),
        sellerIds.length ? adb.from("marketplace_sellers").select("id, display_name, verification_tier, strike_count").in("id", sellerIds) : Promise.resolve({ data: [] }),
        buyerIds.length ? adb.from("customers").select("id, full_name").in("id", buyerIds).then((r) => r.data ?? []) : Promise.resolve([]),
      ]);
      const lMap = new Map((listings ?? []).map((l: { id: string; title: string | null }) => [l.id, l.title]));
      const sMap = new Map((sellers ?? []).map((s: Record<string, unknown>) => [s.id as string, s]));
      const bMap = new Map((buyers as Array<{ id: string; full_name: string | null }>).map((b) => [b.id, b.full_name]));

      return dRows.map((d) => {
        const o = (oMap.get(d.order_id) ?? {}) as Record<string, unknown>;
        const s = (sMap.get(o.seller_id as string) ?? {}) as Record<string, unknown>;
        return {
          id: d.id, order_id: d.order_id, reason: d.reason, evidence: d.evidence, created_at: d.created_at, raised_by: d.raised_by,
          order_reference: (o.paystack_transaction_reference as string) || "",
          amount_naira: Number(o.amount_naira || 0),
          dispatch_photo_url: (o.dispatch_photo_url as string) || null,
          dispatch_confirmed_at: (o.dispatch_confirmed_at as string) || null,
          buyer_confirmed_at: (o.buyer_confirmed_at as string) || null,
          order_created_at: (o.created_at as string) || null,
          listing_title: (lMap.get(o.listing_id as string) as string) || null,
          seller_name: (s.display_name as string) || null,
          seller_tier: (s.verification_tier as string) || null,
          seller_strikes: Number(s.strike_count || 0),
          buyer_name: (bMap.get(d.raised_by as string) as string) || null,
        };
      });
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => (disputes ?? []).find((d) => d.id === selectedId) || null, [disputes, selectedId]);

  // Optional deep link from Buyers (or anywhere else): ?disputeId=<id>
  // pre-selects it, same as clicking the row. Only works for an OPEN
  // dispute, since this screen never fetches resolved ones. Additive only.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const wanted = searchParams.get("disputeId");
    if (wanted && !selectedId && (disputes ?? []).some((d) => d.id === wanted)) setSelectedId(wanted);
  }, [searchParams, disputes, selectedId]);

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  if (!disputes || disputes.length === 0) {
    return (
      <div>
        <OpsHeader title="Disputes" subtitle="Rule on open disputes. Each outcome triggers exactly what it says." />
        <OpsEmpty title="No open disputes" body="Nothing to rule on right now. Disputes a buyer raises appear here until you resolve them." />
      </div>
    );
  }

  return (
    <div>
      <OpsHeader title="Disputes" subtitle="Rule on open disputes. Each outcome triggers exactly what it says." />
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]">
        {/* list */}
        <div className={`flex flex-col gap-2 ${selected ? "hidden lg:flex" : ""}`}>
          {disputes.map((d) => (
            <button key={d.id} onClick={() => setSelectedId(d.id)}
              className="text-left rounded-2xl border bg-white p-3.5 flex flex-col gap-1"
              style={{ borderColor: selectedId === d.id ? "#2D6A4F" : "#F0DDD2", borderLeftWidth: 4, borderLeftColor: "#C0392B" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-heading font-black text-sm text-foreground">{d.order_reference || "Order"}</span>
                <span className="font-heading font-black text-sm tabular-nums" style={{ color: "#C0392B" }}>{formatNaira(d.amount_naira)}</span>
              </div>
              <div className="text-xs text-text-med truncate">{d.listing_title || "Item"}</div>
              <div className="text-[11px] text-text-med truncate">{d.buyer_name || "Buyer"} vs {d.seller_name || "seller"}</div>
            </button>
          ))}
        </div>

        {/* detail */}
        <div className={selected ? "lg:sticky lg:top-6 lg:self-start" : "hidden lg:block lg:sticky lg:top-6 lg:self-start"}>
          {selected ? <DisputeDetailView d={selected} onBack={() => setSelectedId(null)} onResolved={async () => { setSelectedId(null); await refetch(); }} />
            : <OpsEmpty title="Pick a dispute" body="Select a dispute on the left to review the evidence and rule on it." />}
        </div>
      </div>
    </div>
  );
}

const SHIPPING_PAYERS = [
  { key: "buyer", label: "Buyer pays" },
  { key: "seller", label: "Seller reimburses" },
  { key: "bundledmum", label: "BundledMum covers it" },
];

function DisputeDetailView({ d, onBack, onResolved }: { d: DisputeDetail; onBack: () => void; onResolved: () => void }) {
  const [outcome, setOutcome] = useState<DisputeOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [returnRequired, setReturnRequired] = useState(false);
  const [shippingPayer, setShippingPayer] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photos = evidenceUrls(d.evidence);
  const chosen = DISPUTE_OUTCOMES.find((o) => o.key === outcome) || null;
  // A return only makes sense when the ruling actually refunds the buyer.
  const refundsBuyer = outcome === "full_refund" || outcome === "courier_fault";

  const timeline: Array<{ label: string; at: string | null }> = [
    { label: "Payment held", at: d.order_created_at },
    { label: "Seller dispatched", at: d.dispatch_confirmed_at },
    { label: "Buyer confirmed", at: d.buyer_confirmed_at },
    { label: "Dispute raised", at: d.created_at },
  ];

  function tryCommit() {
    setError(null);
    if (!outcome) { setError("Pick one outcome."); return; }
    if (notes.trim().length < 5) { setError("A written reason of at least 5 characters is required."); return; }
    setConfirming(true);
  }

  async function commit() {
    if (!outcome) return;
    setBusy(true); setError(null);
    try {
      const ok = await resolveDispute({
        disputeId: d.id, outcome, notes: notes.trim(),
        returnRequired: refundsBuyer && returnRequired,
        returnShippingPayer: refundsBuyer && returnRequired ? shippingPayer : null,
      });
      if (!ok) { setError("This ruling could not be recorded. Refresh and check the dispute state."); setBusy(false); return; }
      setBusy(false); setConfirming(false); onResolved();
    } catch (e) { setBusy(false); setError((e as { message?: string })?.message || "Something went wrong."); }
  }

  return (
    <div className="flex flex-col gap-3">
      <button onClick={onBack} className="lg:hidden text-sm font-heading font-bold self-start" style={{ color: "#2D6A4F" }}>‹ All disputes</button>

      <OpsCard>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-heading font-black text-lg text-foreground">Dispute {d.order_reference}</div>
            <div className="text-xs text-text-med">{d.listing_title || "Item"}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Held, at stake</div>
            <div className="font-heading font-black text-xl tabular-nums" style={{ color: "#C0392B" }}>{formatNaira(d.amount_naira)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="text-[11px] text-text-med">Buyer: {d.buyer_name || "unknown"}</span>
          <span className="text-[11px] text-text-med">· Seller: {d.seller_name || "unknown"}{d.seller_tier === "verified" ? ", verified" : ""}</span>
          {d.seller_strikes > 0 && <StatusPill tone="negative" label={`${d.seller_strikes} prior ${d.seller_strikes === 1 ? "strike" : "strikes"}`} />}
        </div>
      </OpsCard>

      <OpsCard label="Buyer's reason">
        <p className="text-sm whitespace-pre-line text-foreground">{d.reason || "No reason given."}</p>
      </OpsCard>

      {photos.length > 0 && (
        <OpsCard label={`Buyer evidence, ${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="rounded-lg overflow-hidden border aspect-square block" style={{ borderColor: "#F0DDD2" }}>
                <img src={u} alt="Evidence" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </OpsCard>
      )}

      <OpsCard label="Seller dispatch photo">
        {d.dispatch_photo_url
          ? <a href={d.dispatch_photo_url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border" style={{ borderColor: "#F0DDD2" }}><img src={d.dispatch_photo_url} alt="Dispatch" className="w-full max-h-64 object-cover" /></a>
          : <span className="text-xs text-text-light">No dispatch photo on this order.</span>}
      </OpsCard>

      <OpsCard label="Order timeline">
        <div className="flex flex-col gap-2">
          {timeline.map((t) => (
            <div key={t.label} className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">{t.label}</span>
              <span className="text-xs text-text-med tabular-nums">{t.at ? new Date(t.at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "not yet"}</span>
            </div>
          ))}
        </div>
      </OpsCard>

      {/* Rule on it */}
      <OpsCard label="Rule on this dispute, pick one outcome">
        <div className="flex flex-col gap-2 mt-1">
          {DISPUTE_OUTCOMES.map((o) => {
            const on = outcome === o.key;
            return (
              <button key={o.key} onClick={() => setOutcome(o.key)} className="text-left rounded-xl border p-3"
                style={on ? { borderColor: o.danger ? "#C0392B" : "#2D6A4F", background: o.danger ? "#F9E3E0" : "#D8EFE5", borderWidth: 1.5 } : { borderColor: "#F0DDD2", background: "#fff" }}>
                <div className="flex items-center gap-2">
                  <span className="font-heading font-black text-sm" style={{ color: o.danger ? "#C0392B" : "#1A4A33" }}>{o.title}</span>
                  <span className="text-[11px] font-heading font-bold text-text-med">{o.tagline}</span>
                </div>
                <div className="text-xs text-text-med mt-1 leading-snug">{o.consequence}</div>
              </button>
            );
          })}
        </div>
        {/* Only a refunding outcome can require a return; the seller was not
            at fault otherwise, or the money never left the buyer at all. */}
        {refundsBuyer && (
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={returnRequired} onChange={(e) => { setReturnRequired(e.target.checked); if (!e.target.checked) setShippingPayer(null); }} className="w-4 h-4" />
              <span className="font-heading font-bold text-sm text-foreground">Does the buyer need to send the item back?</span>
            </label>
            <p className="text-xs text-text-med mt-1">If not (lost in transit, never arrived), leave this unchecked, the refund is recorded outright.</p>
            {returnRequired && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {SHIPPING_PAYERS.map((p) => (
                  <button key={p.key} onClick={() => setShippingPayer(p.key)} type="button" className="text-xs font-heading font-bold rounded-lg px-2.5 py-1.5 border"
                    style={shippingPayer === p.key ? { borderColor: "#2D6A4F", background: "#D8EFE5", color: "#1A4A33" } : { borderColor: "#F0DDD2", background: "#fff", color: "#6B5B54" }}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for this ruling, required, at least 5 characters."
          className="w-full mt-3 rounded-xl border p-3 text-sm min-h-[70px] resize-y" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }} />
        {error && !confirming && <div className="text-xs mt-2" style={{ color: "#C0392B" }}>{error}</div>}
        <button onClick={tryCommit} className="mt-3 w-full font-heading font-extrabold text-sm rounded-xl py-3.5 text-white" style={{ background: chosen?.danger ? "#C0392B" : "#2D6A4F" }}>
          Confirm ruling
        </button>
      </OpsCard>

      <ConfirmDialog
        open={confirming}
        title={chosen ? `${chosen.title}: are you sure?` : "Confirm"}
        body={chosen ? chosen.consequence : ""}
        kv={[
          { label: "Dispute", value: d.order_reference },
          { label: "Amount", value: formatNaira(d.amount_naira) },
          ...(refundsBuyer ? [{ label: "Return required", value: returnRequired ? (shippingPayer ? SHIPPING_PAYERS.find((p) => p.key === shippingPayer)?.label || "Yes" : "Yes") : "No" }] : []),
        ]}
        confirmLabel="Commit this ruling"
        danger={chosen?.danger} busy={busy} error={error}
        onConfirm={commit} onCancel={() => !busy && setConfirming(false)}
      />
    </div>
  );
}
