import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { BarChart3, ArrowRight, Megaphone, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FunnelWithQuiz {
  quiz_sessions: number;
  checkouts: number; all_orders: number; paid_orders: number;
  revenue_naira: number;
  quiz_to_checkout_pct: number; checkout_to_order_pct: number;
  order_to_paid_pct: number; overall_conversion_pct: number;
}
interface FunnelWithoutQuiz {
  sessions: number; add_to_carts: number; checkouts: number;
  all_orders: number; paid_orders: number;
  revenue_naira: number;
  sessions_to_cart_pct: number; cart_to_checkout_pct: number;
  checkout_to_order_pct: number; order_to_paid_pct: number;
  overall_conversion_pct: number;
}
interface DailyFunnelRow {
  day: string; sessions: number; quiz_starts: number;
  checkouts: number; paid_orders: number;
}
interface TrafficSource {
  source: string | null; medium: string | null;
  sessions: number; unique_sessions: number;
}
interface UtmRow {
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  sessions: number; quiz_starts: number; checkouts: number; orders: number;
}
interface DeviceRow { device: string | null; sessions: number }
interface ReferralRow {
  code: string; referrer_name: string | null;
  times_used: number; credits_issued: number;
  total_credit_earned: number; is_active: boolean;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useFunnelWithQuiz() {
  return useQuery({
    queryKey: ["mk-funnel-quiz"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("marketing_funnel_with_quiz").select("*").maybeSingle();
      if (error) throw error;
      return data as FunnelWithQuiz | null;
    },
    staleTime: 60_000,
  });
}
function useFunnelWithoutQuiz() {
  return useQuery({
    queryKey: ["mk-funnel-direct"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("marketing_funnel_without_quiz").select("*").maybeSingle();
      if (error) throw error;
      return data as FunnelWithoutQuiz | null;
    },
    staleTime: 60_000,
  });
}
function useDailyFunnel() {
  return useQuery({
    queryKey: ["mk-daily-funnel"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("marketing_daily_funnel").select("*").order("day", { ascending: true });
      if (error) throw error;
      return (data || []) as DailyFunnelRow[];
    },
    staleTime: 60_000,
  });
}
function useTrafficSources() {
  return useQuery({
    queryKey: ["mk-traffic-sources"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("marketing_traffic_sources").select("*");
      if (error) throw error;
      return (data || []) as TrafficSource[];
    },
    staleTime: 60_000,
  });
}
function useUtmPerformance() {
  return useQuery({
    queryKey: ["mk-utm"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("marketing_utm_performance").select("*");
      if (error) throw error;
      return (data || []) as UtmRow[];
    },
    staleTime: 60_000,
  });
}
function useDeviceBreakdown() {
  return useQuery({
    queryKey: ["mk-devices"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("marketing_device_breakdown").select("*");
      if (error) throw error;
      return (data || []) as DeviceRow[];
    },
    staleTime: 60_000,
  });
}
function useReferralPerformance() {
  return useQuery({
    queryKey: ["mk-referral"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("marketing_referral_performance").select("*");
      if (error) throw error;
      return (data || []) as ReferralRow[];
    },
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const n = (v: any) => Number(v) || 0;
const pctCls = (pct: number) => pct >= 50 ? "text-emerald-700" : pct >= 20 ? "text-amber-700" : "text-red-600";
const fmtDay = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" }); }
  catch { return iso; }
};
const fmtNaira = (v: number) => `₦${Math.round(n(v)).toLocaleString()}`;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminMarketingAnalytics() {
  const [funnelTab, setFunnelTab] = useState<"quiz" | "direct">("quiz");
  const [range, setRange] = useState<30 | 90 | 0>(30); // 0 = all time

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="pf text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6 text-forest" /> Marketing Analytics</h1>
          <p className="text-text-med text-sm mt-1">Funnel, traffic, UTM, devices, and referral performance.</p>
        </div>
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
          {[{ v: 30 as const, l: "30 days" }, { v: 90 as const, l: "90 days" }, { v: 0 as const, l: "All time" }].map(r => (
            <button key={r.v} onClick={() => setRange(r.v)} className={`px-3 py-1.5 rounded-md font-semibold ${range === r.v ? "bg-card" : "text-text-med"}`}>{r.l}</button>
          ))}
        </div>
      </header>

      {/* Section 1 — Comparison banner + Funnel */}
      <ComparisonBanner />
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-sm">Conversion funnel</h2>
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
            <button onClick={() => setFunnelTab("quiz")} className={`px-3 py-1.5 rounded-md font-semibold ${funnelTab === "quiz" ? "bg-card" : "text-text-med"}`}>Quiz Funnel</button>
            <button onClick={() => setFunnelTab("direct")} className={`px-3 py-1.5 rounded-md font-semibold ${funnelTab === "direct" ? "bg-card" : "text-text-med"}`}>Direct Funnel</button>
          </div>
        </div>
        {funnelTab === "quiz" ? <QuizFunnelView /> : <DirectFunnelView />}
      </section>

      {/* Section 2 — Daily trend */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="font-bold text-sm">Daily trend{range ? ` (last ${range} days)` : " (all time)"}</h2>
        <DailyTrend days={range} />
      </section>

      {/* Sections 3 + 5 — Traffic sources | Devices */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-bold text-sm">Traffic sources</h2>
          <TrafficSourcesView />
        </div>
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="font-bold text-sm">Device breakdown</h2>
          <DeviceBreakdownView />
        </div>
      </section>

      {/* Section 4 — UTM */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="font-bold text-sm flex items-center gap-1.5"><Megaphone className="w-4 h-4" /> UTM campaign performance</h2>
        <UtmView />
      </section>

      {/* Section 6 — Referral */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="font-bold text-sm flex items-center gap-1.5"><UserCheck className="w-4 h-4" /> Referral programme</h2>
        <ReferralView />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Funnels
// ---------------------------------------------------------------------------

function FunnelStage({ label, value, subtitle }: { label: string; value: number; subtitle?: string }) {
  return (
    <div className="flex-1 min-w-[120px] bg-muted/40 border border-border rounded-xl px-3 py-3 text-center">
      <div className="text-[10px] uppercase tracking-widest font-semibold text-text-med">{label}</div>
      <div className="text-2xl font-black tabular-nums mt-1">{Math.round(n(value)).toLocaleString()}</div>
      {subtitle && <div className="text-[10px] text-text-light mt-0.5 leading-tight">{subtitle}</div>}
    </div>
  );
}
function FunnelArrow({ pct }: { pct: number }) {
  const p = n(pct);
  return (
    <div className="flex flex-col items-center justify-center px-2 text-text-light">
      <ArrowRight className="w-5 h-5" />
      <div className={`text-[10px] font-bold mt-0.5 ${pctCls(p)}`}>{p.toFixed(1)}%</div>
    </div>
  );
}

function ComparisonBanner() {
  const { data: q } = useFunnelWithQuiz();
  const { data: d } = useFunnelWithoutQuiz();
  if (!q && !d) return null;

  const qPct = n(q?.overall_conversion_pct);
  const dPct = n(d?.overall_conversion_pct);
  const multiplier = dPct > 0 && qPct > dPct ? Math.round((qPct / dPct) * 10) / 10 : null;

  const Col = ({ title, pct, rev, accent }: { title: string; pct: number; rev: number; accent: string }) => (
    <div className="flex-1 min-w-[180px] px-4 py-3">
      <div className={`text-[10px] uppercase tracking-widest font-bold ${accent}`}>{title}</div>
      <div className="text-3xl font-black tabular-nums mt-1">{pct.toFixed(2)}%</div>
      <div className="text-[10px] text-text-light">conversion rate</div>
      <div className="text-sm font-semibold tabular-nums mt-1">{fmtNaira(rev)}</div>
      <div className="text-[10px] text-text-light">revenue</div>
    </div>
  );

  return (
    <section className="bg-card border border-border rounded-xl p-2 flex items-stretch gap-2 flex-wrap">
      <Col title="Quiz Path"   pct={qPct} rev={n(q?.revenue_naira)} accent="text-forest" />
      <div className="w-px bg-border self-stretch" />
      <Col title="Direct Path" pct={dPct} rev={n(d?.revenue_naira)} accent="text-text-med" />
      {multiplier !== null && multiplier > 1 && (
        <div className="self-center px-4">
          <span className="inline-flex items-center px-2.5 py-1 rounded-pill text-[11px] font-bold bg-emerald-100 text-emerald-700">
            Quiz converts {multiplier}× better than direct
          </span>
        </div>
      )}
    </section>
  );
}

function QuizFunnelView() {
  const { data: f, isLoading } = useFunnelWithQuiz();
  if (isLoading) return <p className="text-xs text-text-light">Loading funnel…</p>;
  if (!f) return <p className="text-xs text-text-light">No funnel data yet.</p>;
  return (
    <>
      <div className="flex items-stretch gap-1 overflow-x-auto">
        <FunnelStage label="Quiz Sessions" value={f.quiz_sessions} subtitle="People who took the quiz" />
        <FunnelArrow pct={f.quiz_to_checkout_pct} />
        <FunnelStage label="Reached Checkout" value={f.checkouts} />
        <FunnelArrow pct={f.checkout_to_order_pct} />
        <FunnelStage label="Orders Placed" value={f.all_orders} />
        <FunnelArrow pct={f.order_to_paid_pct} />
        <FunnelStage label="Paid Orders" value={f.paid_orders} subtitle={fmtNaira(f.revenue_naira)} />
      </div>
      <p className="text-xs text-text-med text-center mt-2">
        Overall: <b className={pctCls(n(f.overall_conversion_pct))}>{n(f.overall_conversion_pct).toFixed(2)}%</b> of quiz takers converted to a paid order
      </p>
      <p className="text-[11px] text-text-light text-center">
        Checkout events may be undercounted for quiz users who completed orders via WhatsApp rather than the web checkout.
      </p>
    </>
  );
}

function DirectFunnelView() {
  const { data: f, isLoading } = useFunnelWithoutQuiz();
  if (isLoading) return <p className="text-xs text-text-light">Loading funnel…</p>;
  if (!f) return <p className="text-xs text-text-light">No funnel data yet.</p>;
  return (
    <>
      <div className="flex items-stretch gap-1 overflow-x-auto">
        <FunnelStage label="Browsing Sessions" value={f.sessions} subtitle="Non-quiz visitors" />
        <FunnelArrow pct={f.sessions_to_cart_pct} />
        <FunnelStage label="Added to Cart" value={f.add_to_carts} />
        <FunnelArrow pct={f.cart_to_checkout_pct} />
        <FunnelStage label="Reached Checkout" value={f.checkouts} />
        <FunnelArrow pct={f.checkout_to_order_pct} />
        <FunnelStage label="Orders Placed" value={f.all_orders} />
        <FunnelArrow pct={f.order_to_paid_pct} />
        <FunnelStage label="Paid Orders" value={f.paid_orders} subtitle={fmtNaira(f.revenue_naira)} />
      </div>
      <p className="text-xs text-text-med text-center mt-2">
        Overall: <b className={pctCls(n(f.overall_conversion_pct))}>{n(f.overall_conversion_pct).toFixed(2)}%</b> of direct visitors converted to a paid order
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Daily trend
// ---------------------------------------------------------------------------

function DailyTrend({ days }: { days: 30 | 90 | 0 }) {
  const { data = [], isLoading } = useDailyFunnel();
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const trimmed = useMemo(() => {
    if (!days) return data;
    return data.slice(-days);
  }, [data, days]);

  const chartData = useMemo(() => trimmed.map(r => ({
    day: fmtDay(r.day),
    Sessions: n(r.sessions),
    "Quiz starts": n(r.quiz_starts),
    Checkouts: n(r.checkouts),
    "Paid orders": n(r.paid_orders),
  })), [trimmed]);

  if (isLoading) return <p className="text-xs text-text-light">Loading trend…</p>;
  if (chartData.length === 0) return <p className="text-xs text-text-light">No daily data yet.</p>;

  const series: Array<{ key: string; color: string; width: number }> = [
    { key: "Sessions",     color: "#2D6A4F", width: 2 },
    { key: "Quiz starts",  color: "#2563EB", width: 2 },
    { key: "Checkouts",    color: "#F4845F", width: 2 },
    { key: "Paid orders",  color: "#1E3A23", width: 3 },
  ];

  const onLegendClick = (e: any) => {
    const key = e?.dataKey as string;
    if (!key) return;
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="day" fontSize={10} />
          <YAxis fontSize={10} />
          <RTooltip />
          <Legend onClick={onLegendClick} wrapperStyle={{ fontSize: 11, cursor: "pointer" }} />
          {series.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={s.width}
              dot={false}
              hide={hidden.has(s.key)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Traffic sources
// ---------------------------------------------------------------------------

function TrafficSourcesView() {
  const { data = [], isLoading } = useTrafficSources();
  if (isLoading) return <p className="text-xs text-text-light">Loading…</p>;
  if (data.length === 0) return <p className="text-xs text-text-light">No traffic data yet.</p>;

  const chartData = [...data]
    .sort((a, b) => n(b.sessions) - n(a.sessions))
    .slice(0, 10)
    .map(r => ({ name: r.source || "(direct)", sessions: n(r.sessions) }));

  return (
    <div className="space-y-3">
      <div style={{ width: "100%", height: Math.max(160, chartData.length * 28) }}>
        <ResponsiveContainer>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" fontSize={10} />
            <YAxis type="category" dataKey="name" fontSize={10} width={110} />
            <RTooltip />
            <Bar dataKey="sessions" fill="#2D6A4F" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Medium</th>
              <th className="px-3 py-2 text-right">Sessions</th>
              <th className="px-3 py-2 text-right">Unique sessions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-2">{r.source || "(direct)"}</td>
                <td className="px-3 py-2 text-text-light">{r.medium || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(r.sessions).toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(r.unique_sessions).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 4 — UTM
// ---------------------------------------------------------------------------

function UtmView() {
  const { data = [], isLoading } = useUtmPerformance();
  if (isLoading) return <p className="text-xs text-text-light">Loading…</p>;

  const allNone = data.length > 0 && data.every(r => (r.utm_source || "(none)") === "(none)");
  if (data.length === 0 || allNone) {
    return (
      <div className="text-xs text-text-med bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
        No UTM data yet. Add <code className="bg-background px-1 py-0.5 rounded border border-border text-[10px]">?utm_source=instagram&amp;utm_medium=social&amp;utm_campaign=launch</code> to your shared links to track campaign performance.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 sticky top-0 z-10">
          <tr className="text-left">
            <th className="px-3 py-2">Campaign</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Medium</th>
            <th className="px-3 py-2 text-right">Sessions</th>
            <th className="px-3 py-2 text-right">Quiz starts</th>
            <th className="px-3 py-2 text-right">Checkouts</th>
            <th className="px-3 py-2 text-right">Orders</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-3 py-2 font-semibold">{r.utm_campaign || "—"}</td>
              <td className="px-3 py-2">{r.utm_source || "—"}</td>
              <td className="px-3 py-2 text-text-light">{r.utm_medium || "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n(r.sessions).toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n(r.quiz_starts).toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n(r.checkouts).toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{n(r.orders).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 5 — Devices
// ---------------------------------------------------------------------------

const DEVICE_COLOR: Record<string, string> = {
  mobile:  "#F4845F",
  desktop: "#2D6A4F",
  tablet:  "#F59E0B",
  unknown: "#9CA3AF",
};

function DeviceBreakdownView() {
  const { data = [], isLoading } = useDeviceBreakdown();
  if (isLoading) return <p className="text-xs text-text-light">Loading…</p>;
  if (data.length === 0) return <p className="text-xs text-text-light">No device data yet.</p>;

  const chartData = data.map(r => ({ name: (r.device || "unknown").toLowerCase(), value: n(r.sessions) }));

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            outerRadius={90}
            label={(entry: any) => {
              const total = chartData.reduce((s, x) => s + x.value, 0) || 1;
              const pct = (entry.value / total) * 100;
              return `${entry.name} · ${pct.toFixed(0)}%`;
            }}
          >
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={DEVICE_COLOR[entry.name] || DEVICE_COLOR.unknown} />
            ))}
          </Pie>
          <RTooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 6 — Referral programme
// ---------------------------------------------------------------------------

function ReferralView() {
  const { data = [], isLoading } = useReferralPerformance();
  if (isLoading) return <p className="text-xs text-text-light">Loading…</p>;
  if (data.length === 0) return <p className="text-xs text-text-light">No referral codes yet.</p>;

  const activeCount = data.filter(r => r.is_active).length;
  const totalUses = data.reduce((s, r) => s + n(r.times_used), 0);
  const totalEarned = data.reduce((s, r) => s + n(r.total_credit_earned), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap text-xs">
        <span>Active codes: <b className="tabular-nums">{activeCount}</b></span>
        <span className="text-text-light">·</span>
        <span>Total referrals used: <b className="tabular-nums">{totalUses}</b></span>
        <span className="text-text-light">·</span>
        <span>Total credit earned: <b className="tabular-nums">{fmtNaira(totalEarned)}</b></span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Referrer</th>
              <th className="px-3 py-2 text-right">Times used</th>
              <th className="px-3 py-2 text-right">Credits issued</th>
              <th className="px-3 py-2 text-right">Total earned</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.code} className="border-t border-border">
                <td className="px-3 py-2 font-mono">{r.code}</td>
                <td className="px-3 py-2">{r.referrer_name || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(r.times_used)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(r.credits_issued)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNaira(r.total_credit_earned)}</td>
                <td className="px-3 py-2">
                  {r.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold bg-emerald-100 text-emerald-700">Active</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-semibold bg-gray-100 text-gray-600">Inactive</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
