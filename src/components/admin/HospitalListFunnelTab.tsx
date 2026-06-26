import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const intf = (n: unknown) => (Number(n) || 0).toLocaleString("en-NG");
const pct = (n: unknown) => (n == null ? "—" : `${(Number(n) || 0).toFixed(1)}%`);

// ── Africa/Lagos (UTC+1, no DST) date-range math (same as the Products tab) ──
const LAGOS_OFFSET = "+01:00";
const pad = (n: number) => String(n).padStart(2, "0");
function lagosYmd(d = new Date()): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { y: get("year"), m: get("month"), day: get("day") };
}
function lagosMidnight(offsetDays = 0): Date {
  const { y, m, day } = lagosYmd();
  const base = new Date(`${y}-${pad(m)}-${pad(day)}T00:00:00${LAGOS_OFFSET}`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base;
}
function lagosMonthStart(monthsBack = 0): Date {
  const { y, m } = lagosYmd();
  let yy = y, mm = m - monthsBack;
  while (mm <= 0) { mm += 12; yy -= 1; }
  return new Date(`${yy}-${pad(mm)}-01T00:00:00${LAGOS_OFFSET}`);
}
function lagosYearStart(): Date {
  const { y } = lagosYmd();
  return new Date(`${y}-01-01T00:00:00${LAGOS_OFFSET}`);
}
function lagosDateInput(value: string, addDays = 0): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00${LAGOS_OFFSET}`);
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + addDays);
  return d;
}

type RangeKey = "lifetime" | "today" | "yesterday" | "last7" | "mtd" | "lastmonth" | "ytd" | "custom";
const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "lifetime", label: "Lifetime" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "mtd", label: "Month to Date" },
  { key: "lastmonth", label: "Last Month" },
  { key: "ytd", label: "Year to Date" },
  { key: "custom", label: "Custom" },
];
function resolveRange(key: RangeKey, customStart: string, customEnd: string): { start: string | null; end: string | null } {
  const now = new Date();
  switch (key) {
    case "lifetime": return { start: null, end: null };
    case "today": return { start: lagosMidnight(0).toISOString(), end: now.toISOString() };
    case "yesterday": return { start: lagosMidnight(-1).toISOString(), end: lagosMidnight(0).toISOString() };
    case "last7": return { start: lagosMidnight(-6).toISOString(), end: now.toISOString() };
    case "mtd": return { start: lagosMonthStart(0).toISOString(), end: now.toISOString() };
    case "lastmonth": return { start: lagosMonthStart(1).toISOString(), end: lagosMonthStart(0).toISOString() };
    case "ytd": return { start: lagosYearStart().toISOString(), end: now.toISOString() };
    case "custom": {
      const s = lagosDateInput(customStart, 0);
      const e = lagosDateInput(customEnd, 1);
      return { start: s ? s.toISOString() : null, end: e ? e.toISOString() : null };
    }
  }
}
const fmtCaption = (iso: string | null, fallback: string) => {
  if (!iso) return fallback;
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch { return fallback; }
};

// ── UI atoms ────────────────────────────────────────────────────────────────
const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="bg-card border border-border rounded-xl p-4 text-center">
    <div className="text-lg md:text-xl font-bold text-forest">{value}</div>
    <div className="text-muted-foreground text-[10px] uppercase tracking-wide mt-0.5">{label}</div>
    {sub && <div className="text-[11px] font-semibold text-coral mt-0.5">{sub}</div>}
  </div>
);
const Card = ({ title, children, caption }: { title: string; children: React.ReactNode; caption?: string }) => (
  <div className="bg-card border border-border rounded-xl p-5">
    <h3 className="font-bold text-sm mb-1">{title}</h3>
    {caption && <p className="text-[11px] text-muted-foreground mb-3">{caption}</p>}
    {children}
  </div>
);

const fmtDuration = (secs: unknown): string => {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
};

// Readable labels for known traffic sources; unknown values fall back to raw.
const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  meta: "Meta (social)",
  meta_ads: "Meta Ads (paid)",
  referral: "Referral",
};
const sourceLabel = (s: string) => SOURCE_LABELS[s] || s;
const ALL_SOURCES = "__all__";

export default function HospitalListFunnelTab() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("lifetime");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const { start, end } = useMemo(() => resolveRange(rangeKey, customStart, customEnd), [rangeKey, customStart, customEnd]);
  // null = all sources. Source filter is part of the query key so it refetches.
  const [source, setSource] = useState<string | null>(null);
  // available_sources is always the FULL list in every response; persist it so
  // the dropdown keeps all options while a filtered fetch is loading.
  const [knownSources, setKnownSources] = useState<string[]>([]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["hospital-list-funnel", start, end, source],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_hospital_list_funnel", { p_start: start, p_end: end, p_source: source });
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    const list = data?.available_sources;
    if (Array.isArray(list) && list.length) setKnownSources(list);
  }, [data]);

  const funnel = data?.funnel || {};
  const engagement = data?.engagement || {};
  const daily: any[] = data?.daily_landings || [];
  const traffic: any[] = data?.traffic_sources || [];
  const devices: any[] = data?.device_split || [];
  const products: any[] = data?.top_added_products || [];

  const visitors = Number(funnel.unique_visitors) || 0;
  const addedToCart = Number(funnel.added_to_cart_sessions) || 0;
  const converted = Number(funnel.converted_sessions) || 0;
  const funnelMax = Math.max(1, visitors, addedToCart, converted);
  const stages = [
    { label: "Visitors", value: visitors, color: "#2D6A4F" },
    { label: "Added to Cart", value: addedToCart, color: "#F4845F", rate: funnel.visitor_to_cart_rate },
    { label: "Converted", value: converted, color: "#1E5C44", rate: funnel.visitor_to_purchase_rate },
  ];

  const rangeCaption = start
    ? `${fmtCaption(start, "")} → ${end ? fmtCaption(end, "now") : "now"} · Africa/Lagos`
    : "All time (lifetime)";

  // A selected source with no visitors in the range → clean empty state.
  const noVisitorsForSource = !!source && visitors === 0;

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-forest">Hospital List Funnel</h2>
          <p className="text-[11px] text-muted-foreground">{rangeCaption}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={source ?? ALL_SOURCES}
            onChange={(e) => setSource(e.target.value === ALL_SOURCES ? null : e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            aria-label="Traffic source"
          >
            <option value={ALL_SOURCES}>All sources</option>
            {knownSources.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
          </select>
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as RangeKey)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {RANGE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {rangeKey === "custom" && (
            <>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 w-auto text-sm" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 w-auto text-sm" />
            </>
          )}
        </div>
      </div>

      {isError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          Couldn’t load the hospital-list funnel. Try a different range or reload.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Active-source caption + clear */}
          {source && (
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-coral/10 text-coral font-semibold px-3 py-1">
                Showing: {sourceLabel(source)}
              </span>
              <button type="button" onClick={() => setSource(null)} className="text-forest font-semibold underline underline-offset-2">
                Clear (All sources)
              </button>
            </div>
          )}

          {noVisitorsForSource ? (
            <Card title="No visitors">
              <p className="text-sm text-muted-foreground py-8 text-center">
                No visitors from {sourceLabel(source as string)} in this period.
              </p>
            </Card>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Visitors" value={intf(visitors)} sub={`${intf(funnel.landings)} landings`} />
                <Kpi label="Added to Cart" value={intf(addedToCart)} sub={`${pct(funnel.visitor_to_cart_rate)} of visitors`} />
                <Kpi label="Converted" value={intf(converted)} sub={`${pct(funnel.visitor_to_purchase_rate)} of visitors`} />
                <Kpi label="Cart → Purchase" value={pct(funnel.cart_to_purchase_rate)} sub={`${intf(funnel.add_to_cart_events)} add events`} />
              </div>

              {/* Stepped funnel bar */}
              <Card title="Conversion funnel" caption="Visitors → Added to Cart → Converted (unique sessions).">
                <div className="space-y-3">
                  {stages.map((s, i) => (
                    <div key={s.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-text-med">{s.label}</span>
                        <span className="font-bold">{intf(s.value)}</span>
                      </div>
                      <div className="h-6 rounded-md bg-muted/40 overflow-hidden">
                        <div className="h-full rounded-md" style={{ width: `${Math.max(2, (s.value / funnelMax) * 100)}%`, background: s.color }} />
                      </div>
                      {i > 0 && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {pct(s.rate)} of visitors reached this step
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {/* Daily landings */}
              <Card title="Daily visitors" caption="Unique visitors landing on the hospital list per day.">
                {daily.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No landings in this range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={daily} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="visitors" fill="#2D6A4F" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              {/* Device split */}
              <Card title="Device split">
                {devices.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No data yet</p>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const total = devices.reduce((s, d) => s + (Number(d.visitors) || 0), 0) || 1;
                      return devices.map((d, i) => {
                        const v = Number(d.visitors) || 0;
                        return (
                          <div key={i}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="font-semibold capitalize">{d.device || "unknown"}</span>
                              <span className="text-text-med">{intf(v)} ({Math.round((v / total) * 100)}%)</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden">
                              <div className="h-full rounded-full bg-forest" style={{ width: `${Math.max(2, (v / total) * 100)}%` }} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </Card>

              {/* Top added products */}
              <Card title="Top added products" caption="Most-added items from the hospital list.">
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No add-to-cart events yet</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-text-med border-b border-border">
                        <th className="py-2 pr-3 font-semibold w-8">#</th>
                        <th className="py-2 pr-3 font-semibold">Product</th>
                        <th className="py-2 font-semibold text-right">Adds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-2 pr-3 text-text-light">{i + 1}</td>
                          <td className="py-2 pr-3 font-medium">{p.product_name || "(unknown)"}</td>
                          <td className="py-2 text-right font-semibold text-forest">{intf(p.adds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              {/* Engagement — honest about not-yet-tracked */}
              <Card title="Engagement" caption="Time-on-page and scroll are captured going forward; older sessions weren't tracked.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg time on page</div>
                    {engagement.time_tracking_available ? (
                      <div className="text-xl font-bold text-forest mt-1">{fmtDuration(engagement.avg_time_on_page_seconds)}</div>
                    ) : (
                      <div className="text-sm font-semibold text-text-med mt-1">Not yet tracked <span className="font-normal text-muted-foreground">(collecting from now on)</span></div>
                    )}
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Scroll depth</div>
                    {engagement.scroll_tracking_available ? (
                      <div className="text-xl font-bold text-forest mt-1">{intf(engagement.sessions_with_scroll_tracked)} <span className="text-xs font-normal text-muted-foreground">sessions tracked</span></div>
                    ) : (
                      <div className="text-sm font-semibold text-text-med mt-1">Not yet tracked <span className="font-normal text-muted-foreground">(collecting from now on)</span></div>
                    )}
                  </div>
                </div>
              </Card>
            </>
          )}

          {/* Traffic sources — ALWAYS the all-sources overview; click a row to filter. */}
          <Card title="Traffic sources" caption="All sources for this period (overview — not affected by the filter above). Click a row to filter.">
            {traffic.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No data yet</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-text-med border-b border-border">
                    <th className="py-2 pr-3 font-semibold">Source</th>
                    <th className="py-2 font-semibold text-right">Visitors</th>
                  </tr>
                </thead>
                <tbody>
                  {traffic.map((t, i) => {
                    const isSelected = source === t.source;
                    return (
                      <tr
                        key={i}
                        onClick={() => setSource(t.source || null)}
                        className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 ${isSelected ? "bg-coral/10" : ""}`}
                      >
                        <td className="py-2 pr-3 font-medium">{t.source ? sourceLabel(t.source) : "—"}</td>
                        <td className="py-2 text-right font-semibold">{intf(t.visitors)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
