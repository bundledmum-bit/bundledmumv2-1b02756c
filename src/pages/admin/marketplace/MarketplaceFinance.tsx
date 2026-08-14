import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira } from "./opsData";
import { OpsHeader, OpsEmpty } from "./opsUi";

/**
 * Finance, the marketplace money story: what buyers paid, where it went, and
 * what's actually the business's. Both source views (marketplace_finance_monthly,
 * marketplace_marketing_monthly) are already in naira — nothing here divides by
 * 100, that convention belongs only to the storefront's kobo-denominated tables.
 * held_in_escrow_naira and pending_payout_naira are money owed OUT, kept in a
 * visually distinct block so they never read as income; gross_revenue_naira is
 * markup + service fees BEFORE cost, labelled as such, never called profit.
 */

interface FinanceMonthRow {
  month: string;
  orders: number;
  buyers: number;
  sellers_who_sold: number;
  gmv_naira: number;
  total_collected_naira: number;
  avg_order_naira: number | string;
  owed_to_sellers_naira: number;
  markup_naira: number;
  service_fees_naira: number;
  paystack_fees_naira: number;
  gross_revenue_naira: number;
  take_rate_percent: number | string;
  negotiated_away_naira: number;
  paid_out_naira: number;
  pending_payout_naira: number | null;
  held_in_escrow_naira: number | null;
  refunded_orders: number;
  refunded_naira: number;
}

interface MarketingMonthRow {
  month: string;
  spend_naira: number;
  entries: number;
}

/** Postgres numeric columns arrive as strings over the wire; null/undefined
 * arrives when a view genuinely has nothing rather than zero. Both collapse
 * to a real, displayable 0 here — never NaN, never blank. */
function n(v: number | string | null | undefined): number {
  const x = Number(v);
  return isFinite(x) ? x : 0;
}

function monthLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "Africa/Lagos" });
}

export default function MarketplaceFinance() {
  const { data, isLoading } = useQuery({
    queryKey: ["mkt-finance"],
    staleTime: 30000,
    queryFn: async () => {
      const [finRes, mktRes] = await Promise.all([
        adb.from("marketplace_finance_monthly").select("*").order("month", { ascending: false }),
        adb.from("marketplace_marketing_monthly").select("*").order("month", { ascending: false }),
      ]);
      if (finRes.error) throw finRes.error;
      if (mktRes.error) throw mktRes.error;
      return {
        finance: (finRes.data ?? []) as FinanceMonthRow[],
        marketing: (mktRes.data ?? []) as MarketingMonthRow[],
      };
    },
  });

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  const finance = data?.finance ?? [];
  const marketing = data?.marketing ?? [];
  const latest = finance[0];

  if (!latest) {
    return (
      <div>
        <OpsHeader title="Finance" subtitle="What buyers paid, where it went, and what's actually yours." />
        <OpsEmpty title="No finance data yet" body="Once a marketplace order is paid, this month's figures appear here." />
      </div>
    );
  }

  const latestMarketing = marketing.find((m) => m.month === latest.month);
  const marketingSpend = n(latestMarketing?.spend_naira);
  const marketingEntries = n(latestMarketing?.entries);
  const orders = n(latest.orders);
  const buyers = n(latest.buyers);
  const sellersWhoSold = n(latest.sellers_who_sold);
  const refundedOrders = n(latest.refunded_orders);

  return (
    <div>
      <OpsHeader title="Finance" subtitle={`The money story for ${monthLabel(latest.month)}. Every figure below is already in naira.`} />

      <SectionLabel>What buyers paid</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
        <Stat label="Orders" value={String(orders)} />
        <Stat label="Buyers" value={String(buyers)} />
        <Stat label="Total collected" value={formatNaira(latest.total_collected_naira)} />
        <Stat label="Average order" value={formatNaira(n(latest.avg_order_naira))} />
      </div>

      <SectionLabel>Where it went</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
        <Stat label="Owed or paid to sellers" value={formatNaira(latest.owed_to_sellers_naira)} sub={`${sellersWhoSold} seller${sellersWhoSold === 1 ? "" : "s"} sold`} />
        <Stat label="Paystack fees" value={formatNaira(latest.paystack_fees_naira)} />
        <Stat label="Negotiated away" value={formatNaira(latest.negotiated_away_naira)} sub="Discount from accepted offers" />
        <Stat label="Refunded" value={formatNaira(latest.refunded_naira)} sub={`${refundedOrders} order${refundedOrders === 1 ? "" : "s"}`} tone={n(latest.refunded_naira) > 0 ? "negative" : undefined} />
      </div>

      <SectionLabel>What's actually the business's — before costs, not profit</SectionLabel>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
        <Stat label="Markup" value={formatNaira(latest.markup_naira)} />
        <Stat label="Service fees" value={formatNaira(latest.service_fees_naira)} />
        <Stat label="Gross revenue" value={formatNaira(latest.gross_revenue_naira)} sub="Markup + service fees, before any cost" emphasize />
        <Stat label="Take rate" value={`${n(latest.take_rate_percent).toFixed(1)}%`} sub="Of GMV" />
      </div>
      <p className="text-[11px] text-text-med mt-2 max-w-2xl">
        Gross revenue is markup plus service fees only, before Paystack fees, payroll or any other cost. It is not profit.
      </p>

      <SectionLabel>Money held or owed out — a liability, not revenue</SectionLabel>
      <div className="rounded-2xl border p-4 mt-2" style={{ borderColor: "#D4613C", background: "#FDE8DF" }}>
        <p className="text-xs mb-3" style={{ color: "#8A4425" }}>
          This is money the marketplace is holding on behalf of sellers, or still owes out. It will leave the business — it is not income.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Held in escrow" value={formatNaira(latest.held_in_escrow_naira)} sub="Paid by buyer, not yet released to seller" />
          <Stat label="Pending payout" value={formatNaira(latest.pending_payout_naira)} sub="Eligible, awaiting release" />
          <Stat label="Paid out" value={formatNaira(latest.paid_out_naira)} sub="Already released to sellers this month" />
        </div>
      </div>

      <SectionLabel>Marketing</SectionLabel>
      <div className="rounded-2xl border p-4 mt-2" style={{ borderColor: "#F0DDD2" }}>
        {marketingSpend === 0 ? (
          <p className="text-xs text-text-med">
            No marketplace marketing spend has been recorded for {monthLabel(latest.month)}. Expenses can't be tagged as marketplace spend from the storefront finance screen yet — see known gaps below.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Spend" value={formatNaira(marketingSpend)} sub={`${marketingEntries} expense${marketingEntries === 1 ? "" : "s"}`} />
            <Stat label="Cost per order" value={orders > 0 ? formatNaira(marketingSpend / orders) : "—"} />
            <Stat label="Cost per buyer" value={buyers > 0 ? formatNaira(marketingSpend / buyers) : "—"} />
          </div>
        )}
      </div>

      <SectionLabel>Known gaps</SectionLabel>
      <div className="rounded-2xl border p-4 mt-2 text-xs text-text-med space-y-2" style={{ borderColor: "#F0DDD2" }}>
        <p><b className="text-foreground">Payment method breakdown</b> — not available. Marketplace orders don't record a payment method column, and every payment currently goes through Paystack card, so there's nothing to break down by method today.</p>
        <p><b className="text-foreground">Marketplace-tagged marketing spend</b> — <code className="text-[11px]">finance_expenses</code> gained an <code className="text-[11px]">is_marketplace</code> flag, but the storefront finance screen has no field to set it, so it's false on every expense today. The Marketing section above will start showing real numbers once tagging is possible.</p>
      </div>

      <SectionLabel>Monthly history</SectionLabel>
      <div className="mt-2 rounded-2xl border overflow-hidden" style={{ borderColor: "#F0DDD2" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ background: "#FFF8F4" }}>
                <Th>Month</Th><Th>Orders</Th><Th>Collected</Th><Th>Owed to sellers</Th><Th>Gross revenue</Th><Th>Take rate</Th><Th>Held in escrow</Th><Th>Pending payout</Th><Th>Refunded</Th>
              </tr>
            </thead>
            <tbody>
              {finance.map((r) => {
                const escrow = n(r.held_in_escrow_naira);
                const pending = n(r.pending_payout_naira);
                const refunded = n(r.refunded_naira);
                return (
                  <tr key={r.month} className="border-t" style={{ borderColor: "#F0DDD2" }}>
                    <Td>{monthLabel(r.month)}</Td>
                    <Td>{n(r.orders)}</Td>
                    <Td><span className="tabular-nums font-heading font-bold">{formatNaira(r.total_collected_naira)}</span></Td>
                    <Td><span className="tabular-nums">{formatNaira(r.owed_to_sellers_naira)}</span></Td>
                    <Td><span className="tabular-nums">{formatNaira(r.gross_revenue_naira)}</span></Td>
                    <Td>{n(r.take_rate_percent).toFixed(1)}%</Td>
                    <Td><span className="tabular-nums" style={escrow > 0 ? { color: "#D4613C" } : undefined}>{formatNaira(escrow)}</span></Td>
                    <Td><span className="tabular-nums" style={pending > 0 ? { color: "#D4613C" } : undefined}>{formatNaira(pending)}</span></Td>
                    <Td><span className="tabular-nums" style={refunded > 0 ? { color: "#C0392B" } : undefined}>{formatNaira(refunded)}</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-heading font-extrabold uppercase tracking-wider text-text-med mt-6">{children}</div>;
}

function Stat({ label, value, sub, tone, emphasize }: {
  label: string; value: string; sub?: string; tone?: "negative"; emphasize?: boolean;
}) {
  return (
    <div className="rounded-2xl border p-3" style={{ borderColor: emphasize ? "#2D6A4F" : "#F0DDD2", background: emphasize ? "#D8EFE5" : "#fff" }}>
      <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">{label}</div>
      <div className="text-lg font-heading font-black mt-0.5" style={{ color: tone === "negative" ? "#C0392B" : emphasize ? "#1A4A33" : "#1A1A1A" }}>{value}</div>
      {sub && <div className="text-[10px] text-text-light mt-0.5">{sub}</div>}
    </div>
  );
}

const Th = ({ children }: { children: ReactNode }) => <th className="px-3 py-2.5 text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med whitespace-nowrap">{children}</th>;
const Td = ({ children }: { children: ReactNode }) => <td className="px-3 py-2.5 align-top whitespace-nowrap text-foreground">{children}</td>;
