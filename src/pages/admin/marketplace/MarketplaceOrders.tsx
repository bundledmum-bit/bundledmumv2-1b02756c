import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira, formatDateTime, fetchAdminOrderDetail, type PillTone } from "./opsData";
import { OpsHeader, OpsEmpty, OpsCard, StatusPill } from "./opsUi";
import { MarkDispatched, RaiseDispute } from "./OrderOnBehalf";

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
 * never paid for, those live in Abandoned checkouts instead.
 *
 * NO LONGER READ ONLY. This was a flat table with no way into a single
 * order, which is why the two things an operator most often has to do for
 * someone on WhatsApp had nowhere to live: recording a dispatch the seller
 * never marked, and opening a dispute for a buyer whose item arrived
 * broken. Both are per-order decisions, so they need a per-order screen.
 *
 * Same list-plus-detail shape as Sellers, Buyers and Disputes: pick a row,
 * work it in the panel. Money still only moves through the payout queue and
 * disputes, exactly as before.
 */
export default function MarketplaceOrders() {
  const [filter, setFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // ?order=<id> already came from Buyers' purchase history and only
  // highlighted a row, because there was nothing to open. Now that there is
  // a panel, the link should land on the order itself. Runs once, so
  // closing the panel does not immediately reopen it.
  const appliedDeepLink = useRef(false);
  useEffect(() => {
    if (highlightId && !appliedDeepLink.current) {
      appliedDeepLink.current = true;
      setSelectedId(highlightId);
    }
  }, [highlightId]);

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  return (
    <div>
      <OpsHeader title="Orders" subtitle="The money ledger. Pick an order to record a dispatch or open a dispute for someone. Money still only moves through the payout queue and disputes." />

      <div className="mt-4 flex gap-1.5 flex-wrap">
        <Tab label="All" count={withState.length} on={filter === "all"} onClick={() => setFilter("all")} />
        {FILTERS.map((f) => <Tab key={f} label={f} count={counts[f] || 0} on={filter === f} onClick={() => setFilter(f)} />)}
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,380px)] items-start">
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
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#F0DDD2" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ background: "#FFF8F4" }}>
                    <Th>Order</Th><Th>Item</Th><Th>Parties</Th><Th>Amount</Th><Th>Money state</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const on = r.id === selectedId;
                    return (
                      <tr
                        key={r.id} ref={r.id === highlightId ? highlightRef : undefined}
                        onClick={() => setSelectedId(on ? null : r.id)}
                        className="border-t cursor-pointer"
                        style={{ borderColor: "#F0DDD2", background: on ? "#FDE8DF" : r.id === highlightId ? "#FFF3EC" : undefined }}
                      >
                        <Td>
                          <div className="font-heading font-bold text-foreground">{r.paystack_transaction_reference || "-"}</div>
                          <div className="text-[11px] text-text-med">{new Date(r.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</div>
                        </Td>
                        <Td>{r.listing_title || "Item"}</Td>
                        <Td><span className="text-text-med">{r.buyer_name || "Buyer"} · {r.seller_name || "Seller"}</span></Td>
                        <Td><span className="tabular-nums font-heading font-bold">{formatNaira(r.amount_naira)}</span></Td>
                        <Td><StatusPill tone={r.state.tone} label={r.state.label} /></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="xl:sticky xl:top-4">
          {selectedId
            ? <OrderDetail orderId={selectedId} onClose={() => setSelectedId(null)} />
            : <OpsEmpty title="Pick an order" body="Select an order to see what has happened to it, and to record a dispatch or open a dispute for someone who told you on WhatsApp." />}
        </div>
      </div>
    </div>
  );
}

/**
 * One order, and the two things that can be done for someone on it.
 *
 * Fetched on selection rather than carried over from the row, because the
 * actions need facts the ledger view does not have: whether it is already
 * marked as sent, whether a dispute is already open, and the dispatch
 * photo. Deciding either of those from a stale row is how you get a
 * confusing refusal from the database.
 */
function OrderDetail({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { data: o, isLoading, refetch } = useQuery({
    queryKey: ["mkt-order-detail", orderId],
    queryFn: () => fetchAdminOrderDetail(orderId),
    staleTime: 5000,
  });

  if (isLoading) return <OpsCard><div className="text-xs text-text-med">Loading this order...</div></OpsCard>;
  if (!o) return <OpsCard><div className="text-xs text-text-med">That order could not be loaded.</div></OpsCard>;

  return (
    <div className="flex flex-col gap-4">
      <OpsCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-heading font-black text-base text-foreground">{o.listing_title || "Item"}</div>
            <div className="text-[11px] text-text-med">{o.paystack_transaction_reference || "No reference"}</div>
          </div>
          <button onClick={onClose} className="text-[11px] underline shrink-0" style={{ color: "#6B5B54" }}>Close</button>
        </div>
        <div className="mt-3 rounded-xl border divide-y" style={{ borderColor: "#F0DDD2" }}>
          <Kv label="Amount" value={formatNaira(o.amount_naira)} />
          <Kv label="Buyer" value={o.buyer_name || "Buyer"} />
          <Kv label="Seller" value={o.seller_name || "Seller"} />
          <Kv label="Ordered" value={formatDateTime(o.created_at)} />
          <Kv label="Sent" value={o.dispatch_confirmed_at ? formatDateTime(o.dispatch_confirmed_at) : "Not yet"} />
          <Kv label="Buyer confirmed" value={o.buyer_confirmed_at ? formatDateTime(o.buyer_confirmed_at) : "Not yet"} />
        </div>
      </OpsCard>

      <MarkDispatched o={o} onDone={() => void refetch()} />
      <RaiseDispute o={o} onDone={() => void refetch()} />
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-[11px] text-text-med">{label}</span>
      <span className="font-heading font-extrabold text-[12.5px] text-foreground tabular-nums text-right">{value}</span>
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
