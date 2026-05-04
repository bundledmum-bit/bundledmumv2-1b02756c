import { useQuery } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { RefreshCw, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// The `get_dashboard_metrics` RPC isn't in the generated supabase types yet;
// cast through `any` so TS doesn't reject the call.
const supabase = supabaseTyped as any;

// ----------------------------------------------------------------------------
// Response shape
// ----------------------------------------------------------------------------

interface Block1 {
  gmv_today: number | null;
  gmv_yesterday: number | null;
  gmv_mtd: number | null;
  monthly_target: number | null;
  target_by_today: number | null;
  revenue_pacing_pct: number | null;
  daily_run_rate: number | null;
  orders_today: number | null;
  orders_yesterday: number | null;
  aov_today: number | null;
  aov_mtd: number | null;
}

interface Block2 {
  new_customers_today: number | null;
  new_customers_yesterday: number | null;
  new_customers_7d: number | null;
  new_customers_30d: number | null;
}

interface Block3 {
  repeat_rate_30d: number | null;
  repeat_customers_30d: number | null;
  total_customers_30d: number | null;
  repeat_buyers_this_month: number | null;
}

interface Block4 {
  fulfillment_rate: number | null;
  total_orders_today: number | null;
  pending_orders: number | null;
  delayed_orders: number | null;
  returns_today: number | null;
  oos_skus: number | null;
}

interface TopSku {
  rank: number;
  product: string;
  brand: string;
  revenue: number;
  units: number;
}

interface Block5 {
  top_skus_7d: TopSku[] | null;
  new_revenue_mtd: number | null;
  new_customers_mtd_count: number | null;
  returning_revenue_mtd: number | null;
  returning_customers_mtd_count: number | null;
  abandoned_carts_7d: number | null;
}

interface DashboardMetrics {
  block1: Block1;
  block2: Block2;
  block3: Block3;
  block4: Block4;
  block5: Block5;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const fmt = (n?: number | null) => "₦" + (n || 0).toLocaleString("en-NG");
const fmtK = (n?: number | null) => {
  const v = n || 0;
  if (v >= 1_000_000) return "₦" + (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1000) return "₦" + (v / 1000).toFixed(0) + "k";
  return fmt(v);
};
// Money formatters that render an em-dash when the value is null/undefined
// (i.e. data hasn't arrived). A real numeric zero must still render as ₦0
// so empty-but-loaded states like "no orders today" don't look like errors.
const fmtOr = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmt(n));
const fmtKOr = (n: number | null | undefined) => (n === null || n === undefined ? "—" : fmtK(n));
function delta(today?: number | null, yesterday?: number | null) {
  if (!yesterday) return null;
  const t = today || 0;
  const pct = ((t - yesterday) / yesterday) * 100;
  return { pct: pct.toFixed(1), up: t >= yesterday };
}

function DeltaPill({ d }: { d: { pct: string; up: boolean } | null }) {
  if (!d) return null;
  const cls = d.up
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cls}`}>
      {d.up ? "↑" : "↓"} {d.pct}% vs yesterday
    </span>
  );
}

function Flag({
  tone,
  children,
}: {
  tone: "red" | "amber" | "green";
  children: React.ReactNode;
}) {
  const cls =
    tone === "red"
      ? "bg-red-100 text-red-700 border-red-200"
      : tone === "amber"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-emerald-100 text-emerald-700 border-emerald-200";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function pacingTone(pct: number | null | undefined): "green" | "amber" | "red" {
  const v = pct ?? 0;
  if (v >= 100) return "green";
  if (v >= 85) return "amber";
  return "red";
}
function pacingBg(pct: number | null | undefined) {
  const t = pacingTone(pct);
  return t === "green" ? "bg-emerald-600" : t === "amber" ? "bg-amber-500" : "bg-red-600";
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

export default function AdminDashboard() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<DashboardMetrics>({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_metrics");
      if (error) throw error;
      return data as DashboardMetrics;
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });

  const todayLabel = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Show full skeleton on first fetch only.
  if (isLoading) {
    return <DashboardSkeleton todayLabel={todayLabel} />;
  }

  // On error: render a sticky banner with everything as "—". Only shows
  // AFTER a fetch has actually completed with an error — never during the
  // first in-flight fetch (the isLoading early-return above guards that).
  const showErrorBanner = !isLoading && isError;
  const b1 = data?.block1;
  const b2 = data?.block2;
  const b3 = data?.block3;
  const b4 = data?.block4;
  const b5 = data?.block5;

  const dash = (v: any) => (v === undefined || v === null ? "—" : v);

  // Block 1 derived values
  const pacingPct = b1?.revenue_pacing_pct ?? null;
  const gmvTodayDelta = delta(b1?.gmv_today, b1?.gmv_yesterday);
  const ordersTodayDelta = delta(b1?.orders_today, b1?.orders_yesterday);
  const monthlyTarget = b1?.monthly_target ?? 116_666_666;
  const mtdProgressPct = Math.max(0, Math.min(100, ((b1?.gmv_mtd || 0) / (monthlyTarget || 1)) * 100));

  // Block 2
  const newCustTodayDelta = delta(b2?.new_customers_today, b2?.new_customers_yesterday);

  // Block 5 — new vs returning
  const newRev = b5?.new_revenue_mtd || 0;
  const retRev = b5?.returning_revenue_mtd || 0;
  const totalRev = newRev + retRev;
  const newPct = totalRev > 0 ? (newRev / totalRev) * 100 : 0;
  const retPct = totalRev > 0 ? (retRev / totalRev) * 100 : 0;
  const noSplit = totalRev === 0;

  return (
    <div>
      {showErrorBanner && (
        <div className="sticky top-0 z-20 mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-800 px-4 py-2.5 rounded-lg text-sm font-semibold">
          <Loader2 className="w-4 h-4 animate-spin" />
          Dashboard data unavailable. Retrying…
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="pf text-2xl font-bold text-foreground">Your Daily Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Refreshes every 5 min</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh now
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        {/* ============================================================ */}
        {/* Block 1 — Revenue Pulse                                       */}
        {/* ============================================================ */}
        <section className="space-y-4">
          <h2 className="pf text-lg font-bold">Revenue Pulse</h2>

          {/* Hero card */}
          <div className={`${pacingBg(pacingPct)} text-white rounded-xl p-6 shadow-sm`}>
            <div className="text-5xl font-bold pf">
              {pacingPct === null || pacingPct === undefined ? "—" : `${pacingPct}%`}
            </div>
            <div className="text-sm mt-1 text-white/90">MTD GMV vs target-to-date</div>
            <div className="text-base mt-3 font-semibold">
              {fmtKOr(b1?.gmv_mtd)} of {fmtKOr(b1?.target_by_today)} needed by today
            </div>
            <div className="text-xs mt-1 text-white/80">
              Monthly target: ₦116,666,666 | Daily run rate: {fmtKOr(b1?.daily_run_rate)}
            </div>
          </div>

          {/* 4 metric cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">GMV Today</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">{fmtKOr(b1?.gmv_today)}</div>
                <DeltaPill d={gmvTodayDelta} />
                <div className="text-[11px] text-muted-foreground">
                  Daily run rate needed: {fmtKOr(b1?.daily_run_rate)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">GMV Month-to-Date</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">{fmtKOr(b1?.gmv_mtd)}</div>
                <div className="text-[11px] text-muted-foreground">of ₦116.7M target</div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-forest"
                    style={{ width: `${mtdProgressPct}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Orders Today</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">{dash(b1?.orders_today)}</div>
                <DeltaPill d={ordersTodayDelta} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Average Order Value</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">{fmtOr(b1?.aov_today)}</div>
                {b1?.aov_today != null && b1.aov_today > 0 && b1.aov_today < 35000 && (
                  <Flag tone="amber">Below ₦35k threshold</Flag>
                )}
                <div className="text-[11px] text-muted-foreground">MTD avg: {fmtOr(b1?.aov_mtd)}</div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ============================================================ */}
        {/* Block 2 — Acquisition Health                                  */}
        {/* ============================================================ */}
        <section className="space-y-3">
          <div>
            <h2 className="pf text-lg font-bold">Acquisition Health</h2>
            <p className="text-xs italic text-muted-foreground mt-0.5">Meta Ads data requires integration</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">New Customers Today</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">{dash(b2?.new_customers_today)}</div>
                <DeltaPill d={newCustTodayDelta} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">New Customers (7-day)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold pf">{dash(b2?.new_customers_7d)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">New Customers (30-day)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold pf">{dash(b2?.new_customers_30d)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
            {["Meta Ads Spend", "Cost Per Purchase", "ROAS"].map((label) => (
              <Card key={label} className="border-dashed opacity-60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground">{label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-2xl font-bold pf text-muted-foreground">—</div>
                  <span className="text-xs text-forest font-semibold cursor-pointer hover:underline">
                    Connect Meta Ads →
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/* Block 3 — Retention Engine                                    */}
        {/* ============================================================ */}
        <section className="space-y-3">
          <div>
            <h2 className="pf text-lg font-bold">Retention Engine</h2>
            <p className="text-xs italic text-muted-foreground mt-0.5">WhatsApp data requires integration</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Repeat Purchase Rate (30-day)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">
                  {b3?.repeat_rate_30d != null ? `${b3.repeat_rate_30d}%` : "—"}
                </div>
                {b3?.repeat_rate_30d != null && (
                  b3.repeat_rate_30d < 35
                    ? <Flag tone="red">Below 35% target</Flag>
                    : <Flag tone="green">On target</Flag>
                )}
                <div className="text-[11px] text-muted-foreground">
                  {dash(b3?.repeat_customers_30d)} of {dash(b3?.total_customers_30d)} customers bought again
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Repeat Buyers This Month
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">{dash(b3?.repeat_buyers_this_month)}</div>
                <div className="text-[11px] text-muted-foreground">Customers with 2+ orders this month</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            {["Broadcast Open Rate", "Click-to-Order Rate"].map((label) => (
              <Card key={label} className="border-dashed opacity-60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground">{label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-2xl font-bold pf text-muted-foreground">—</div>
                  <span className="text-xs text-forest font-semibold cursor-pointer hover:underline">
                    Connect WhatsApp Business →
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ============================================================ */}
        {/* Block 4 — Operational Health                                  */}
        {/* ============================================================ */}
        <section className="space-y-3">
          <div>
            <h2 className="pf text-lg font-bold">Operational Health</h2>
            <p className="text-xs italic text-muted-foreground mt-0.5">
              Logistics is your brand. Watch this block daily.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Fulfillment */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Same Day / Next Day Fulfillment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {b4?.fulfillment_rate == null || (b4?.total_orders_today ?? 0) === 0 ? (
                  <div className="text-sm text-muted-foreground">No orders today</div>
                ) : (
                  <>
                    <div className="text-2xl font-bold pf">{b4.fulfillment_rate}%</div>
                    {b4.fulfillment_rate < 85
                      ? <Flag tone="red">Below 85%</Flag>
                      : <Flag tone="green">On target</Flag>}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Pending / Delayed */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Pending / Delayed Orders
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">{dash(b4?.pending_orders)} pending</div>
                <div className="text-[11px] text-muted-foreground">
                  {dash(b4?.delayed_orders)} delayed &gt;24h
                </div>
                {b4?.pending_orders != null && (
                  b4.pending_orders > 5
                    ? <Flag tone="red">Action needed</Flag>
                    : b4.pending_orders > 0
                      ? <Flag tone="amber">Monitor</Flag>
                      : <Flag tone="green">Clear</Flag>
                )}
              </CardContent>
            </Card>

            {/* Returns */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Returns / Complaints Today
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">{dash(b4?.returns_today)}</div>
                {b4?.returns_today != null && (
                  b4.returns_today > 0
                    ? <Flag tone="amber">Review immediately</Flag>
                    : <Flag tone="green">Clear</Flag>
                )}
              </CardContent>
            </Card>

            {/* OOS SKUs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Out of Stock SKUs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">{dash(b4?.oos_skus)}</div>
                {b4?.oos_skus != null && (
                  b4.oos_skus > 0
                    ? <Flag tone="amber">Check if top SKU affected</Flag>
                    : <Flag tone="green">All in stock</Flag>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ============================================================ */}
        {/* Block 5 — Weekly Glance                                       */}
        {/* ============================================================ */}
        <section className="space-y-3">
          <div>
            <h2 className="pf text-lg font-bold">Weekly Glance</h2>
            <p className="text-xs italic text-muted-foreground mt-0.5">
              Trend indicators — not for daily action.
            </p>
          </div>

          {/* Top SKUs table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Top 5 SKUs by Revenue (7-day)</CardTitle>
            </CardHeader>
            <CardContent>
              {!b5?.top_skus_7d || b5.top_skus_7d.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-6">No sales data yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-2 font-semibold">Rank</th>
                        <th className="py-2 pr-2 font-semibold">Product</th>
                        <th className="py-2 pr-2 font-semibold">Brand</th>
                        <th className="py-2 pr-2 font-semibold">Revenue (7d)</th>
                        <th className="py-2 pr-2 font-semibold">Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b5.top_skus_7d.map((s, i) => (
                        <tr key={`${s.rank}-${i}`} className="border-b border-border/60 last:border-b-0">
                          <td className="py-2 pr-2 font-semibold">{s.rank}</td>
                          <td className="py-2 pr-2">{s.product}</td>
                          <td className="py-2 pr-2 text-muted-foreground">{s.brand}</td>
                          <td className="py-2 pr-2 font-semibold">{fmtK(s.revenue)}</td>
                          <td className="py-2 pr-2">{s.units}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3-card row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  New vs Returning Revenue Split (MTD)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold">
                      New: {fmtK(newRev)} — {b5?.new_customers_mtd_count ?? 0} customers
                    </span>
                  </div>
                  <div className="h-[3px] bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-forest"
                      style={{ width: noSplit ? "0%" : `${newPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold">
                      Returning: {fmtK(retRev)} — {b5?.returning_customers_mtd_count ?? 0} customers
                    </span>
                  </div>
                  <div className="h-[3px] bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-coral"
                      style={{ width: noSplit ? "0%" : `${retPct}%` }}
                    />
                  </div>
                </div>
                {noSplit && <div className="text-[11px] text-muted-foreground">No data yet</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Abandoned Carts (7-day)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf">{dash(b5?.abandoned_carts_7d)}</div>
                <div className="text-[11px] text-muted-foreground">
                  Potential orders lost this week
                </div>
              </CardContent>
            </Card>

            <Card className="border-dashed opacity-60">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Email / WhatsApp List Growth
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold pf text-muted-foreground">—</div>
                <div className="text-[11px] text-muted-foreground">Requires integration</div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Skeleton (first-fetch only)
// ----------------------------------------------------------------------------

function DashboardSkeleton({ todayLabel }: { todayLabel: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="pf text-2xl font-bold text-foreground">Your Daily Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Refreshes every 5 min</span>
          <Button variant="outline" size="sm" disabled>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh now
          </Button>
        </div>
      </div>
      <div className="space-y-8">
        {/* Block 1 */}
        <section className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32 w-full bg-muted-foreground/30 rounded-xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </section>
        {/* Block 2 */}
        <section className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </section>
        {/* Block 3 */}
        <section className="space-y-3">
          <Skeleton className="h-6 w-44" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </section>
        {/* Block 4 */}
        <section className="space-y-3">
          <Skeleton className="h-6 w-44" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </section>
        {/* Block 5 */}
        <section className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
