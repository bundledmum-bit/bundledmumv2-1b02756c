import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira, type PillTone } from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill } from "./opsUi";

/** marketplace_admin_orders (admin readable) already embeds listing_title,
 * buyer_name and seller_name directly, and only ever contains a genuine
 * order: money actually received, or a bank transfer claimed but not yet
 * confirmed. A checkout that was never paid for cannot appear here at
 * all, at the view's own WHERE clause, not by a filter in this screen. */
interface Row {
  id: string;
  paystack_transaction_reference: string | null;
  amount_naira: number;
  settlement_status: string;
  order_status: string;
  created_at: string;
  listing_title: string | null;
  buyer_name: string | null;
  seller_name: string | null;
  money_state: "paid" | "awaiting_transfer_confirmation";
}

const FILTERS = ["Awaiting transfer confirmation", "Funds held", "Payout released", "Refunded", "Disputed"];

/** One clear money-state pill per order, same priority as the old shared
 * orderMoneyState (dispute and refund win over settlement) but the
 * bottom branch reads money_state rather than payment_status directly,
 * and is honestly labelled for what it now actually means here: every row
 * in this view already has real money behind it, so the only thing left
 * unresolved at that point is a claimed bank transfer awaiting
 * confirmation, never "might not have paid at all". Deliberately not the
 * shared opsData.orderMoneyState — that one is also used by Buyers' full
 * purchase history, which legitimately includes abandoned attempts, so
 * its "Awaiting payment" wording is still correct there and must stay
 * untouched. */
function orderRowState(r: Row): { label: string; tone: PillTone } {
  if (r.order_status === "disputed") return { label: "Disputed", tone: "work" };
  if (r.order_status === "refunded") return { label: "Refunded", tone: "negative" };
  if (r.settlement_status === "settled") return { label: "Payout released", tone: "good" };
  if (r.settlement_status === "payout_failed") return { label: "Payout failed", tone: "negative" };
  if (r.money_state === "paid") return { label: "Funds held", tone: "work" };
  return { label: "Awaiting transfer confirmation", tone: "neutral" };
}

/**
 * Orders, the money ledger. Every genuine marketplace order newest first
 * with one clear money-state pill. Genuine means money actually moved:
 * marketplace_admin_orders already excludes checkout attempts that were
 * never paid for, those live in Abandoned checkouts instead. Read only,
 * this is where the operator answers "what happened with this order".
 * Actions live in the payout queue and disputes.
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
      const { data } = await adb.from("marketplace_admin_orders")
        .select("id, paystack_transaction_reference, amount_naira, settlement_status, order_status, created_at, listing_title, buyer_name, seller_name, money_state")
        .order("created_at", { ascending: false });
      return (data ?? []) as Row[];
    },
  });

  const withState = useMemo(() => (rows ?? []).map((r) => ({ ...r, state: orderRowState(r) })), [rows]);
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
        <OpsEmpty
          title={withState.length === 0 ? "No orders yet" : "Nothing here right now"}
          body={
            withState.length === 0
              ? "This is the real ledger, only orders where money has actually moved. Checkout attempts that never turned into a sale live in Abandoned checkouts instead."
              : "No orders currently in this state."
          }
        />
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
