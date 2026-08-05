import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira, orderMoneyState, DISPUTE_OUTCOMES } from "./opsData";
import { OpsHeader, OpsEmpty, OpsCard, StatusPill } from "./opsUi";

/**
 * Buyers, the counterpart to Sellers, read only (an admin cannot edit a
 * buyer's own details here). Backed by public.marketplace_buyers (one row
 * per customer with at least one marketplace order, so storefront-only
 * customers never appear here) and admin_buyer_purchases for the detail
 * view's purchase history. Same two-pane list/detail shape as Sellers, same
 * shared OpsHeader/OpsEmpty/OpsCard/StatusPill building blocks.
 *
 * THE DISTINCTION THAT MATTERS: disputes_open reads as needing attention
 * (error red, a pill). disputes_raised does not — raising a dispute is a
 * legitimate thing a buyer does when something goes wrong, so a past
 * (resolved) dispute is plain grey text right next to the other facts,
 * never a coloured chip. No scores, ratings, or "risk" labels anywhere;
 * the plain numbers are what an operator needs.
 *
 * full_name is checkout's one field and is the only name shown anywhere
 * here. first_name (kept on the row type, unused in this file) and
 * last_name are a best-effort split of that single field, unreliable for
 * anything beyond a convenience sort, so nothing here lays a buyer's name
 * out as though two fields were filled in.
 */

interface BuyerRow {
  customer_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  joined_at: string;
  orders_paid: number;
  orders_unpaid: number;
  orders_total: number;
  total_spent_naira: number;
  last_order_at: string | null;
  disputes_raised: number;
  disputes_open: number;
  disputes_upheld: number;
  price_requests_made: number;
}

interface PurchaseRow {
  order_id: string;
  order_reference: string;
  listing_title: string | null;
  image_url: string | null;
  amount_naira: number;
  order_status: string;
  payment_status: string;
  seller_name: string | null;
  had_dispute: boolean;
  ordered_at: string;
  settlement_status?: string;
}

interface DisputeRow {
  id: string;
  order_id: string;
  reason: string | null;
  outcome: string | null;
  created_at: string | null;
  order_reference: string;
}

type SortKey = "newest" | "spent" | "orders" | "disputes";
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "spent", label: "Most spent" },
  { key: "orders", label: "Most orders" },
  { key: "disputes", label: "Open disputes" },
];

/** digits-only, Nigerian-number-aware, matching the normaliser already used
 * for buyer/seller contact elsewhere in the marketplace (checkout/orders.ts,
 * marketplace/lib/whatsapp.ts) — duplicated here rather than imported since
 * those live in the customer-facing marketplace tree, not admin. */
function toIntlPhone(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return "234" + digits.slice(1);
  return "234" + digits;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Not yet";
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function MarketplaceBuyers() {
  const { data: buyers, isLoading } = useQuery({
    queryKey: ["mkt-buyers"],
    staleTime: 10000,
    queryFn: async (): Promise<BuyerRow[]> => {
      const { data } = await adb.from("marketplace_buyers").select("*").order("joined_at", { ascending: false });
      return (data ?? []) as BuyerRow[];
    },
  });

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (buyers ?? []).filter((b) => !q || (b.full_name || "").toLowerCase().includes(q) || b.email.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      if (sort === "spent") return b.total_spent_naira - a.total_spent_naira;
      if (sort === "orders") return b.orders_total - a.orders_total;
      if (sort === "disputes") return b.disputes_open - a.disputes_open || b.disputes_raised - a.disputes_raised;
      return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
    });
  }, [buyers, search, sort]);

  const selected = useMemo(() => (buyers ?? []).find((b) => b.customer_id === selectedId) || null, [buyers, selectedId]);
  // Nothing but test rows so far, all zero real (paid) orders — the honest
  // near-empty note, not a hardcoded "there are 3" check that would look odd
  // the moment a fourth test account is added.
  const allTestData = (buyers ?? []).length > 0 && (buyers ?? []).every((b) => b.orders_paid === 0);

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  if (!buyers || buyers.length === 0) {
    return (
      <div>
        <OpsHeader title="Buyers" subtitle="Name, orders, spend and disputes for everyone who has bought on the marketplace." />
        <OpsEmpty title="No buyers yet" body="Buyers appear here once someone completes a marketplace order. Storefront-only customers never show up here." />
      </div>
    );
  }

  return (
    <div>
      <OpsHeader title="Buyers" subtitle={`${buyers.length} ${buyers.length === 1 ? "buyer" : "buyers"}.`} />

      <div className="mt-5 grid gap-5 min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        {/* list */}
        <div className={selected ? "hidden lg:flex lg:flex-col lg:gap-3" : "flex flex-col gap-3"}>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email"
              className="flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "#F0DDD2" }}
            />
            <div className="flex gap-1.5 flex-wrap">
              {SORTS.map((s) => (
                <button key={s.key} onClick={() => setSort(s.key)} className="font-heading font-extrabold text-[10.5px] px-2.5 py-1.5 rounded-lg whitespace-nowrap"
                  style={sort === s.key ? { background: "#1A1A1A", color: "#FFF8F4" } : { background: "#fff", border: "1px solid #F0DDD2", color: "#3D3936" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <OpsEmpty title="No match" body="Nothing matches that search." />
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((b) => {
                const open = b.disputes_open > 0;
                const past = b.disputes_raised - b.disputes_open;
                return (
                  <button key={b.customer_id} onClick={() => setSelectedId(b.customer_id)}
                    className="text-left rounded-2xl border p-3.5 flex flex-col gap-1"
                    style={{ borderColor: selectedId === b.customer_id ? "#2D6A4F" : open ? "#C0392B" : "#F0DDD2", borderWidth: open ? 1.5 : 1, background: open ? "#FEF7F6" : "#fff" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-heading font-black text-sm text-foreground truncate">{b.full_name || "Buyer"}</span>
                      {open && <StatusPill tone="negative" label={b.disputes_open === 1 ? "Open dispute" : `${b.disputes_open} open disputes`} />}
                    </div>
                    <div className="text-[11.5px] text-text-med truncate">{b.email}</div>
                    <div className="flex gap-3 text-[11px] text-text-med mt-0.5 flex-wrap">
                      <span>{b.orders_total} {b.orders_total === 1 ? "order" : "orders"}</span>
                      <span>{formatNaira(b.total_spent_naira)} spent</span>
                      {past > 0 && <span>{past} past {past === 1 ? "dispute" : "disputes"}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {allTestData && (
            <div className="rounded-xl p-3 text-sm" style={{ background: "#D8EFE5", color: "#1A4A33" }}>
              Only {buyers.length} {buyers.length === 1 ? "account" : "accounts"} so far, all test data. Real buyers will list here once orders start coming through, sorted and searchable the same way.
            </div>
          )}
        </div>

        {/* detail */}
        <div className={selected ? "min-w-0" : "hidden lg:block min-w-0"}>
          {selected ? <BuyerDetail b={selected} onBack={() => setSelectedId(null)} />
            : <OpsEmpty title="Pick a buyer" body="Select a buyer to see contact details, totals and purchase history." />}
        </div>
      </div>
    </div>
  );
}

function BuyerDetail({ b, onBack }: { b: BuyerRow; onBack: () => void }) {
  const navigate = useNavigate();
  const open = b.disputes_open > 0;
  const contactNumber = b.whatsapp_number || b.phone;
  const intlPhone = toIntlPhone(contactNumber);

  const { data: purchases, isLoading: purchasesLoading } = useQuery({
    queryKey: ["mkt-buyer-purchases", b.customer_id],
    queryFn: async (): Promise<PurchaseRow[]> => {
      const { data, error } = await adb.rpc("admin_buyer_purchases", { p_customer_id: b.customer_id });
      if (error) throw error;
      const rows = (data ?? []) as PurchaseRow[];
      if (!rows.length) return rows;
      // Settlement status isn't on the RPC (it's about the buyer's purchase,
      // not payout state), fetched separately so the pill here matches the
      // Orders screen exactly rather than inventing a second vocabulary.
      const { data: settle } = await adb.from("marketplace_orders").select("id, settlement_status").in("id", rows.map((r) => r.order_id));
      const sMap = new Map(((settle ?? []) as Array<{ id: string; settlement_status: string }>).map((s) => [s.id, s.settlement_status]));
      return rows.map((r) => ({ ...r, settlement_status: sMap.get(r.order_id) }));
    },
  });

  const { data: disputes, isLoading: disputesLoading } = useQuery({
    queryKey: ["mkt-buyer-disputes", b.customer_id],
    enabled: b.disputes_raised > 0,
    queryFn: async (): Promise<DisputeRow[]> => {
      const { data: rows } = await adb.from("marketplace_disputes")
        .select("id, order_id, reason, outcome, created_at")
        .eq("raised_by", b.customer_id)
        .order("created_at", { ascending: false });
      const dRows = (rows ?? []) as Array<{ id: string; order_id: string; reason: string | null; outcome: string | null; created_at: string | null }>;
      if (!dRows.length) return [];
      const { data: orders } = await adb.from("marketplace_orders").select("id, paystack_transaction_reference").in("id", dRows.map((d) => d.order_id));
      const oMap = new Map(((orders ?? []) as Array<{ id: string; paystack_transaction_reference: string | null }>).map((o) => [o.id, o.paystack_transaction_reference || ""]));
      return dRows.map((d) => ({ ...d, order_reference: oMap.get(d.order_id) || "" }));
    },
  });

  const mostRecentRef = purchases?.[0]?.order_reference;
  const waMessage = `Hello ${b.full_name || "there"}, this is BundledMum${mostRecentRef ? ` regarding your order ${mostRecentRef}` : ""}.`;
  const waHref = intlPhone ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(waMessage)}` : null;
  const telHref = intlPhone ? `tel:+${intlPhone}` : null;

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="lg:hidden font-bold text-lg leading-none pt-0.5" style={{ color: "#6B5B54" }}>‹</button>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-black text-xl text-foreground truncate">{b.full_name || "Buyer"}</div>
          <div className="text-xs text-text-med">Joined {fmtDate(b.joined_at)}</div>
        </div>
        {open && <StatusPill tone="negative" label={b.disputes_open === 1 ? "Open dispute" : `${b.disputes_open} open disputes`} />}
      </div>

      <OpsCard>
        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          <span className="text-text-med">Email</span>
          <span className="font-bold text-foreground text-right break-all">{b.email}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[12.5px] mt-2">
          <span className="text-text-med">WhatsApp</span>
          <span className="font-bold text-foreground">{contactNumber || "Not on file"}</span>
        </div>
        <div className="flex gap-2 mt-3">
          {waHref ? (
            <a href={waHref} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]" style={{ background: "#25D366", color: "#FFFFFF" }}>
              WhatsApp
            </a>
          ) : (
            <span className="flex-1 flex items-center justify-center rounded-lg py-2.5 font-heading font-extrabold text-[12.5px]" style={{ background: "#EDE6E1", color: "#8A7A72" }}>WhatsApp</span>
          )}
          {telHref ? (
            <a href={telHref} className="flex-1 flex items-center justify-center rounded-lg py-2.5 font-heading font-extrabold text-[12.5px] border" style={{ borderColor: "#6B5B54", color: "#3D3936" }}>Call</a>
          ) : (
            <span className="flex-1 flex items-center justify-center rounded-lg py-2.5 font-heading font-extrabold text-[12.5px] border" style={{ borderColor: "#F0DDD2", color: "#8A7A72" }}>Call</span>
          )}
        </div>
        {!contactNumber && <div className="text-[11px] mt-2" style={{ color: "#8A7A72" }}>No phone or WhatsApp number on file for this buyer.</div>}
      </OpsCard>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Orders" value={String(b.orders_total)} />
        <Stat label="Total spent" value={formatNaira(b.total_spent_naira)} />
        <Stat label="Last order" value={fmtDate(b.last_order_at)} small />
        <Stat label="Offers asked" value={String(b.price_requests_made)} />
      </div>

      {b.disputes_raised > 0 && (
        <div className="flex flex-col gap-2">
          <div className="font-heading font-extrabold text-xs uppercase tracking-wider" style={{ color: "#6B5B54" }}>
            Disputes, {b.disputes_raised} raised{b.disputes_open > 0 ? `, ${b.disputes_open} open` : ""}
          </div>
          {disputesLoading ? (
            <div className="text-xs text-text-med">Loading…</div>
          ) : (disputes ?? []).map((d) => {
            const isOpen = d.outcome === null;
            const outcomeLabel = DISPUTE_OUTCOMES.find((o) => o.key === d.outcome)?.title || "Resolved";
            const reasonSnippet = (d.reason || "No reason given").slice(0, 60);
            if (isOpen) {
              return (
                <button key={d.id} onClick={() => navigate(`/admin/marketplace/disputes?disputeId=${d.id}`)}
                  className="text-left rounded-xl border p-2.5 flex items-center justify-between gap-2 min-w-0 w-full" style={{ borderColor: "#C0392B", background: "#FCEBE9" }}>
                  <span className="text-[12.5px] font-bold text-foreground truncate min-w-0 flex-1">{d.order_reference}, {reasonSnippet}</span>
                  <span className="font-heading font-extrabold text-[10px] px-1.5 py-1 rounded-md whitespace-nowrap" style={{ background: "#C0392B", color: "#FFF8F4" }}>Open ›</span>
                </button>
              );
            }
            // Resolved: no historical-dispute view exists anywhere in admin
            // today (Disputes only ever queries outcome IS NULL), so this is
            // plain read-only information, not a link to nowhere.
            return (
              <div key={d.id} className="rounded-xl border p-2.5 flex items-center justify-between gap-2 min-w-0" style={{ borderColor: "#F0DDD2" }}>
                <span className="text-[12.5px] text-foreground truncate min-w-0 flex-1">{d.order_reference}, {reasonSnippet}</span>
                <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: "#6B5B54" }}>{outcomeLabel}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="font-heading font-extrabold text-xs uppercase tracking-wider" style={{ color: "#6B5B54" }}>Purchase history</div>
        {purchasesLoading ? (
          <div className="text-xs text-text-med">Loading…</div>
        ) : !purchases || purchases.length === 0 ? (
          <div className="text-xs text-text-med">No purchases recorded yet.</div>
        ) : purchases.map((p) => {
          const state = orderMoneyState({ payment_status: p.payment_status, settlement_status: p.settlement_status || "", order_status: p.order_status });
          const previouslyDisputed = p.had_dispute && p.order_status !== "disputed";
          return (
            <button key={p.order_id} onClick={() => navigate(`/admin/marketplace/orders?order=${p.order_id}`)}
              className="text-left rounded-xl border p-2.5 flex gap-2.5 items-center min-w-0 w-full" style={{ borderColor: "#F0DDD2", background: "#fff" }}>
              <div className="w-11 h-11 rounded-lg flex-none overflow-hidden" style={{ background: "repeating-linear-gradient(135deg,#FDE8DF 0 6px,#FFF8F4 6px 12px)" }}>
                {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-foreground truncate">{p.listing_title || "Item"}</div>
                <div className="text-[10.5px] text-text-med truncate">{formatNaira(p.amount_naira)} · from {p.seller_name || "seller"} · {fmtDate(p.ordered_at)}{previouslyDisputed ? " · previously disputed" : ""}</div>
              </div>
              <StatusPill tone={state.tone} label={state.label} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: "#F0DDD2", background: "#fff" }}>
      <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">{label}</div>
      <div className={small ? "font-heading font-extrabold text-sm text-foreground" : "font-heading font-black text-xl text-foreground tabular-nums"}>{value}</div>
    </div>
  );
}
