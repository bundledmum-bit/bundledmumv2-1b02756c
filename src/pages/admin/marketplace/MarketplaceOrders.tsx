import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira, orderMoneyState } from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill } from "./opsUi";

interface Row {
  id: string;
  paystack_transaction_reference: string | null;
  amount_naira: number;
  payment_status: string;
  settlement_status: string;
  order_status: string;
  created_at: string;
  listing_id: string;
  buyer_id: string | null;
  seller_id: string | null;
  listing_title?: string | null;
  buyer_name?: string | null;
  seller_name?: string | null;
}

const FILTERS = ["Awaiting payment", "Funds held", "Payout released", "Refunded", "Disputed"];

/**
 * Orders, the money ledger. Every marketplace order newest first with one clear
 * money-state pill derived from payment, settlement and order status. Read only,
 * this is where the operator answers "what happened with this order". Actions live
 * in the payout queue and disputes.
 */
export default function MarketplaceOrders() {
  const [filter, setFilter] = useState<string>("all");
  // Optional deep link from Buyers (or anywhere else): ?order=<id> highlights
  // and scrolls to that one row. Additive only — nothing changes when absent.
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("order");
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["mkt-orders-ledger"],
    staleTime: 10000,
    queryFn: async (): Promise<Row[]> => {
      const { data } = await adb.from("marketplace_orders")
        .select("id, paystack_transaction_reference, amount_naira, payment_status, settlement_status, order_status, created_at, listing_id, buyer_id, seller_id")
        .order("created_at", { ascending: false });
      const list = (data ?? []) as Row[];
      if (!list.length) return [];
      const listingIds = Array.from(new Set(list.map((r) => r.listing_id).filter(Boolean)));
      const sellerIds = Array.from(new Set(list.map((r) => r.seller_id).filter(Boolean))) as string[];
      const buyerIds = Array.from(new Set(list.map((r) => r.buyer_id).filter(Boolean))) as string[];
      const [{ data: listings }, { data: sellers }, buyers] = await Promise.all([
        listingIds.length ? adb.from("marketplace_listings").select("id, title").in("id", listingIds) : Promise.resolve({ data: [] }),
        sellerIds.length ? adb.from("marketplace_sellers_public").select("id, display_name").in("id", sellerIds) : Promise.resolve({ data: [] }),
        buyerIds.length ? adb.from("customers").select("id, full_name").in("id", buyerIds).then((r) => r.data ?? []) : Promise.resolve([]),
      ]);
      const lMap = new Map((listings ?? []).map((l: { id: string; title: string | null }) => [l.id, l.title]));
      const sMap = new Map((sellers ?? []).map((s: { id: string; display_name: string | null }) => [s.id, s.display_name]));
      const bMap = new Map((buyers as Array<{ id: string; full_name: string | null }>).map((b) => [b.id, b.full_name]));
      for (const r of list) {
        r.listing_title = (lMap.get(r.listing_id) as string) ?? null;
        r.seller_name = r.seller_id ? (sMap.get(r.seller_id) as string) ?? null : null;
        r.buyer_name = r.buyer_id ? (bMap.get(r.buyer_id) as string) ?? null : null;
      }
      return list;
    },
  });

  const withState = useMemo(() => (rows ?? []).map((r) => ({ ...r, state: orderMoneyState(r) })), [rows]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of withState) c[r.state.label] = (c[r.state.label] || 0) + 1;
    return c;
  }, [withState]);
  const filtered = filter === "all" ? withState : withState.filter((r) => r.state.label === filter);

  useEffect(() => {
    if (highlightId && highlightRef.current) highlightRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, filtered.length]);

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  return (
    <div>
      <OpsHeader title="Orders" subtitle="The money ledger. Read only, actions live in the payout queue and disputes." />

      <div className="mt-4 flex gap-1.5 flex-wrap">
        <Tab label="All" count={withState.length} on={filter === "all"} onClick={() => setFilter("all")} />
        {FILTERS.map((f) => <Tab key={f} label={f} count={counts[f] || 0} on={filter === f} onClick={() => setFilter(f)} />)}
      </div>

      {filtered.length === 0 ? (
        <OpsEmpty title="No orders here" body={withState.length === 0 ? "No marketplace orders yet. Paid orders and their money states appear here." : "Nothing matches this filter."} />
      ) : (
        <div className="mt-4 rounded-2xl border overflow-hidden" style={{ borderColor: "#F0DDD2" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ background: "#FFF8F4" }}>
                  <Th>Order</Th><Th>Item</Th><Th>Parties</Th><Th>Amount</Th><Th>Money state</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} ref={r.id === highlightId ? highlightRef : undefined} className="border-t" style={{ borderColor: "#F0DDD2", background: r.id === highlightId ? "#FDE8DF" : undefined }}>
                    <Td>
                      <div className="font-heading font-bold text-foreground">{r.paystack_transaction_reference || "-"}</div>
                      <div className="text-[11px] text-text-med">{new Date(r.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</div>
                    </Td>
                    <Td>{r.listing_title || "Item"}</Td>
                    <Td><span className="text-text-med">{r.buyer_name || "Buyer"} · {r.seller_name || "Seller"}</span></Td>
                    <Td><span className="tabular-nums font-heading font-bold">{formatNaira(r.amount_naira)}</span></Td>
                    <Td><StatusPill tone={r.state.tone} label={r.state.label} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Tab({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="font-heading font-extrabold text-xs px-3 py-1.5 rounded-lg" style={on ? { background: "#2D6A4F", color: "#FFF8F4" } : { background: "#EDE6E1", color: "#6B5B54" }}>
      {label} {count > 0 && <span style={{ opacity: 0.8 }}>{count}</span>}
    </button>
  );
}
const Th = ({ children }: { children: React.ReactNode }) => <th className="px-3 py-2.5 text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med whitespace-nowrap">{children}</th>;
const Td = ({ children }: { children: React.ReactNode }) => <td className="px-3 py-2.5 align-top whitespace-nowrap text-foreground">{children}</td>;
