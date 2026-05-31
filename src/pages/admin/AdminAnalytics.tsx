import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import OrdersReportTab from "@/components/admin/OrdersReportTab";
import OrderLinesReportTab from "@/components/admin/OrderLinesReportTab";
import CustomerReportTab from "@/components/admin/CustomerReportTab";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Download, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid, Legend,
} from "recharts";

const COLORS = ["#2D6A4F", "#F4845F", "#6366f1", "#f59e0b", "#ec4899", "#14b8a6", "#8b5cf6", "#f97316", "#10b981", "#ef4444"];

const DATE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "Yesterday", days: 1 },
  { label: "Last 7 Days", days: 7 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
  { label: "This Month", days: -1 },
  { label: "Last Month", days: -2 },
  { label: "This Year", days: -3 },
];

function getDateRange(preset: string): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now); to.setDate(to.getDate() + 1); to.setHours(0,0,0,0);
  const p = DATE_PRESETS.find(d => d.label === preset) || DATE_PRESETS[3];

  if (p.label === "Today") { const f = new Date(now); f.setHours(0,0,0,0); return { from: f, to }; }
  if (p.label === "Yesterday") { const f = new Date(now); f.setDate(f.getDate()-1); f.setHours(0,0,0,0); const t = new Date(f); t.setDate(t.getDate()+1); return { from: f, to: t }; }
  if (p.label === "This Month") { const f = new Date(now.getFullYear(), now.getMonth(), 1); return { from: f, to }; }
  if (p.label === "Last Month") { const f = new Date(now.getFullYear(), now.getMonth()-1, 1); const t = new Date(now.getFullYear(), now.getMonth(), 1); return { from: f, to: t }; }
  if (p.label === "This Year") { const f = new Date(now.getFullYear(), 0, 1); return { from: f, to }; }

  const f = new Date(now); f.setDate(f.getDate() - p.days); f.setHours(0,0,0,0);
  return { from: f, to };
}

function getPrevPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const diff = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - diff), to: new Date(from.getTime()) };
}

const fmt = (n: number) => `₦${n.toLocaleString()}`;
const pct = (n: number, d: number) => d === 0 ? "0.0" : ((n / d) * 100).toFixed(1);
const pctChange = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 1000) / 10;

const ChartCard = ({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) => (
  <div className="bg-card border border-border rounded-xl p-5">
    <h3 className="font-bold text-sm mb-4">{title}</h3>
    {empty ? <p className="text-muted-foreground text-sm py-8 text-center">No data yet</p> : children}
  </div>
);

const StatCard = ({ label, value, change, showChange }: { label: string; value: string | number; change?: number; showChange?: boolean }) => (
  <div className="bg-card border border-border rounded-xl p-4 text-center">
    <div className="text-xl font-bold">{value}</div>
    <div className="text-muted-foreground text-[10px]">{label}</div>
    {showChange && change !== undefined && (
      <div className={`text-[10px] mt-0.5 font-semibold flex items-center justify-center gap-0.5 ${change >= 0 ? "text-green-600" : "text-destructive"}`}>
        {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
        {Math.abs(change).toFixed(1)}%
      </div>
    )}
  </div>
);

// Paginated & sortable table
function DataTable({ columns, data, pageSize = 25, preserveOrder = false }: { columns: { key: string; label: string; format?: (v: any) => string }[]; data: any[]; pageSize?: number; preserveOrder?: boolean }) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState(preserveOrder ? "" : (columns[0]?.key || ""));
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter(r => columns.some(c => String(r[c.key] || "").toLowerCase().includes(s)));
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""));
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortAsc]);

  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sorted.length / pageSize);

  return (
    <div>
      <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search..."
        className="mb-3 border border-input rounded-lg px-3 py-1.5 text-xs bg-background w-full max-w-xs" />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="text-muted-foreground border-b border-border">
              {columns.map(c => (
                <th key={c.key} className="p-2 text-left cursor-pointer hover:text-foreground" onClick={() => { setSortKey(c.key); setSortAsc(sortKey === c.key ? !sortAsc : false); }}>
                  {c.label} {sortKey === c.key && (sortAsc ? "↑" : "↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={columns.length} className="p-4 text-center text-muted-foreground">No data yet</td></tr>
            ) : paged.map((row, i) => (
              <tr key={i} className="border-b border-border hover:bg-muted/30">
                {columns.map(c => <td key={c.key} className="p-2">{c.format ? c.format(row[c.key]) : row[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>Page {page + 1} of {totalPages} ({sorted.length} rows)</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 border border-border rounded disabled:opacity-30"><ChevronLeft className="w-3 h-3" /></button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-2 py-1 border border-border rounded disabled:opacity-30"><ChevronRight className="w-3 h-3" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminAnalytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preset = searchParams.get("period") || "Last 30 Days";
  const compareEnabled = searchParams.get("compare") === "1";
  const quizFilter = searchParams.get("quiz") || "all";

  const setPreset = (p: string) => { const sp = new URLSearchParams(searchParams); sp.set("period", p); setSearchParams(sp); };
  const toggleCompare = () => { const sp = new URLSearchParams(searchParams); sp.set("compare", compareEnabled ? "0" : "1"); setSearchParams(sp); };
  const setQuizFilter = (v: string) => { const sp = new URLSearchParams(searchParams); sp.set("quiz", v); setSearchParams(sp); };

  const { from, to } = useMemo(() => getDateRange(preset), [preset]);
  const prev = useMemo(() => getPrevPeriod(from, to), [from, to]);
  const fromISO = from.toISOString();
  const toISO = to.toISOString();
  const prevFromISO = prev.from.toISOString();
  const prevToISO = prev.to.toISOString();

  // ── Data Queries ────────────────────────────
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["analytics-orders-full", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, total, subtotal, order_status, payment_status, payment_method, delivery_state, gift_wrapping, quiz_answers, customer_email, customer_name, customer_phone, refund_amount, is_quiz_order, utm_source, traffic_source, created_at")
        .gte("created_at", fromISO).lt("created_at", toISO).order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: prevOrders } = useQuery({
    queryKey: ["analytics-prev-orders", prevFromISO, prevToISO],
    enabled: compareEnabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, total, payment_status, order_status, is_quiz_order, created_at")
        .gte("created_at", prevFromISO).lt("created_at", prevToISO);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allOrders } = useQuery({
    queryKey: ["analytics-all-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id, total, payment_status, customer_email, created_at").order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: orderItems } = useQuery({
    queryKey: ["analytics-items", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_items")
        .select("product_name, brand_name, quantity, line_total, unit_price, order_id, orders!inner(created_at, payment_status)")
        .gte("orders.created_at", fromISO).lt("orders.created_at", toISO);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: events } = useQuery({
    queryKey: ["analytics-events", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase.from("analytics_events")
        .select("event_type, event_data, session_id, page_url, referral_source, traffic_source, traffic_medium, device_type, browser, created_at")
        .gte("created_at", fromISO).lt("created_at", toISO).order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: quizLeads } = useQuery({
    queryKey: ["analytics-quiz-leads", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_customers")
        .select("*").gte("created_at", fromISO).lt("created_at", toISO).order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["analytics-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, email, total_spent, total_orders, delivery_state, created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: pageViews } = useQuery({
    queryKey: ["analytics-pageviews", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase.from("page_views")
        .select("page_url, page_title, session_id, created_at")
        .gte("created_at", fromISO).lt("created_at", toISO);
      if (error) throw error;
      return data || [];
    },
  });

  // ── Derived data ────────────────────────────
  const rawO = orders || [];
  const o = quizFilter === "all" ? rawO : rawO.filter((x: any) => quizFilter === "quiz" ? x.is_quiz_order : !x.is_quiz_order);
  const po = prevOrders || [];
  const paid = o.filter((x: any) => x.payment_status === "paid");
  const prevPaid = po.filter((x: any) => x.payment_status === "paid");
  const revenue = paid.reduce((s: number, x: any) => s + (x.total || 0), 0);
  const prevRevenue = prevPaid.reduce((s: number, x: any) => s + (x.total || 0), 0);
  const gmv = o.reduce((s: number, x: any) => s + (x.total || 0), 0);
  const prevGmv = po.reduce((s: number, x: any) => s + (x.total || 0), 0);
  const refunds = o.reduce((s: number, x: any) => s + (x.refund_amount || 0), 0);
  const aov = paid.length > 0 ? Math.round(revenue / paid.length) : 0;
  const prevAov = prevPaid.length > 0 ? Math.round(prevRevenue / prevPaid.length) : 0;
  const evts = events || [];
  const leads = quizLeads || [];
  const items = orderItems || [];
  const pvs = pageViews || [];

  const groupByDay = (arr: any[], valueFn: (items: any[]) => number) => {
    const map: Record<string, any[]> = {};
    arr.forEach(x => { const d = (x.created_at || "").slice(0, 10); if (d) { if (!map[d]) map[d] = []; map[d].push(x); } });
    return Object.entries(map).sort().map(([date, items]) => ({ date: date.slice(5), value: valueFn(items) }));
  };

  // ── Downloads ───────────────────────────────
  const downloadExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Business
    const bizData = [{ "Revenue": fmt(revenue), "GMV": fmt(gmv), "Orders": o.length, "AOV": fmt(aov), "Gift Wrap %": `${pct(o.filter((x:any)=>x.gift_wrapping).length, o.length)}%` }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bizData), "Business Overview");

    // Customers
    const c = customers || [];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(c.map((x:any) => ({ Email: x.email, "Total Spent": x.total_spent, "Total Orders": x.total_orders, State: x.delivery_state }))), "Customers");

    // Quiz
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leads.map((l:any) => ({ WhatsApp: l.whatsapp_number, Hospital: l.hospital_type, Delivery: l.delivery_method, Gender: l.baby_gender, Budget: l.budget_tier, Purchased: l.has_purchased ? "Yes" : "No" }))), "Quiz & Leads");

    // Products
    const paidItems = items.filter((i: any) => (i.orders as any)?.payment_status === "paid");
    const productRevenue: Record<string, { name: string; revenue: number; units: number }> = {};
    paidItems.forEach((i: any) => {
      if (!productRevenue[i.product_name]) productRevenue[i.product_name] = { name: i.product_name, revenue: 0, units: 0 };
      productRevenue[i.product_name].revenue += i.line_total || 0;
      productRevenue[i.product_name].units += i.quantity || 0;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(productRevenue).map(p => ({ Product: p.name, Revenue: p.revenue, Units: p.units }))), "Products");

    // Marketing
    const refSources: Record<string, number> = {};
    evts.forEach((e: any) => { const r = e.traffic_source || e.referral_source || "direct"; refSources[r] = (refSources[r] || 0) + 1; });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.entries(refSources).map(([source, count]) => ({ Source: source, Events: count }))), "Marketing");

    XLSX.writeFile(wb, `BundledMum-Analytics-${preset.replace(/\s/g, "_")}.xlsx`);
  };

  const downloadPDF = () => {
    window.print();
  };

  if (ordersLoading) return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 mb-6">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-20 rounded-xl" />)}</div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadPDF} className="text-xs h-10"><Download className="w-3 h-3 mr-1" />PDF</Button>
          <Button variant="outline" size="sm" onClick={downloadExcel} className="text-xs h-10"><Download className="w-3 h-3 mr-1" />Excel</Button>
        </div>
      </div>

      {/* Date presets */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {DATE_PRESETS.map(p => (
          <button key={p.label} onClick={() => setPreset(p.label)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${preset === p.label ? "border-forest bg-forest/10 text-forest" : "border-border text-muted-foreground"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Comparison toggle + quiz filter */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={compareEnabled} onCheckedChange={toggleCompare} />
          Compare to previous period
        </label>
        <select value={quizFilter} onChange={e => setQuizFilter(e.target.value)} className="border border-input rounded-lg px-3 py-1 text-xs bg-background">
          <option value="all">All Orders</option>
          <option value="quiz">Quiz Orders Only</option>
          <option value="direct">Direct Orders Only</option>
        </select>
      </div>

      <Tabs defaultValue="business" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="orders-report">Orders Report</TabsTrigger>
          <TabsTrigger value="order-lines">Order Lines</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="quiz">Quiz & Leads</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="cohort">Cohorts</TabsTrigger>
          <TabsTrigger value="acquisition">Acquisition</TabsTrigger>
          <TabsTrigger value="behaviour">Behaviour</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
        </TabsList>

        {/* ═══ ORDERS REPORT ═══ */}
        <TabsContent value="orders-report"><OrdersReportTab /></TabsContent>

        {/* ═══ ORDER LINES ═══ */}
        <TabsContent value="order-lines"><OrderLinesReportTab /></TabsContent>

        {/* ═══ TAB 1: BUSINESS ═══ */}
        <TabsContent value="business">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <StatCard label="Revenue" value={fmt(revenue)} change={pctChange(revenue, prevRevenue)} showChange={compareEnabled} />
            <StatCard label="GMV" value={fmt(gmv)} change={pctChange(gmv, prevGmv)} showChange={compareEnabled} />
            <StatCard label="Orders" value={o.length} change={pctChange(o.length, po.length)} showChange={compareEnabled} />
            <StatCard label="AOV" value={fmt(aov)} change={pctChange(aov, prevAov)} showChange={compareEnabled} />
            <StatCard label="Gift Wrap %" value={`${pct(o.filter((x:any)=>x.gift_wrapping).length, o.length)}%`} />
          </div>
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Revenue Over Time" empty={paid.length === 0}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={groupByDay(paid, items => items.reduce((s,x) => s + (x.total||0), 0))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="value" stroke="#2D6A4F" strokeWidth={2} name="Revenue" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Orders Over Time" empty={o.length === 0}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={groupByDay(o, items => items.length)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#F4845F" radius={[4,4,0,0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Orders by Status" empty={o.length === 0}>
              {(() => {
                const sc: Record<string, number> = {};
                o.forEach((x: any) => { sc[x.order_status || "unknown"] = (sc[x.order_status || "unknown"] || 0) + 1; });
                const data = Object.entries(sc).map(([name, value]) => ({ name, value }));
                return (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({name,value})=>`${name}: ${value}`}>
                      {data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                    </Pie><Tooltip /></PieChart>
                  </ResponsiveContainer>
                );
              })()}
            </ChartCard>
            <ChartCard title="Orders by Payment Method" empty={o.length === 0}>
              {(() => {
                const mc: Record<string, number> = {};
                o.forEach((x: any) => { mc[x.payment_method || "unknown"] = (mc[x.payment_method || "unknown"] || 0) + 1; });
                const data = Object.entries(mc).map(([name, value]) => ({ name, value }));
                return (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({name,value})=>`${name}: ${value}`}>
                      {data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                    </Pie><Tooltip /></PieChart>
                  </ResponsiveContainer>
                );
              })()}
            </ChartCard>
            <ChartCard title="Orders by Delivery State (Top 10)" empty={o.length === 0}>
              {(() => {
                const sc: Record<string, number> = {};
                o.forEach((x: any) => { if (x.delivery_state) sc[x.delivery_state] = (sc[x.delivery_state] || 0) + 1; });
                const data = Object.entries(sc).sort((a,b) => b[1]-a[1]).slice(0,10).map(([name,value]) => ({ name, value }));
                return (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip /><Bar dataKey="value" fill="#2D6A4F" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </ChartCard>
            <ChartCard title="Top 10 Products" empty={items.length === 0}>
              {(() => {
                const pc: Record<string, number> = {};
                items.filter((i:any)=>(i.orders as any)?.payment_status==="paid").forEach((i:any) => { pc[i.product_name] = (pc[i.product_name] || 0) + (i.quantity || 0); });
                const data = Object.entries(pc).sort((a,b) => b[1]-a[1]).slice(0,10).map(([name,value]) => ({ name, value }));
                return (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                      <Tooltip /><Bar dataKey="value" fill="#F4845F" radius={[0,4,4,0]} name="Units" />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </ChartCard>
          </div>
        </TabsContent>

        {/* ═══ TAB 2: CUSTOMERS ═══ */}
        <TabsContent value="customers">
          <CustomerReportTab />
        </TabsContent>

        {/* ═══ TAB 3: QUIZ & LEADS ═══ */}
        <TabsContent value="quiz">
          {(() => {
            const quizStarts = evts.filter((e: any) => e.event_type === "quiz_started").length;
            const quizCompletes = evts.filter((e: any) => e.event_type === "quiz_completed").length;
            const completionRate = quizStarts > 0 ? ((quizCompletes / quizStarts) * 100).toFixed(1) : "0.0";
            const purchased = leads.filter((l: any) => l.has_purchased).length;
            const conversionRate = leads.length > 0 ? ((purchased / leads.length) * 100).toFixed(1) : "0.0";
            const whatsappCapture = leads.filter((l: any) => l.whatsapp_number).length;
            const whatsappRate = leads.length > 0 ? ((whatsappCapture / leads.length) * 100).toFixed(1) : "0.0";
            const makeDonut = (field: string) => {
              const counts: Record<string, number> = {};
              leads.forEach((l: any) => { const v = l[field] || "unknown"; counts[v] = (counts[v] || 0) + 1; });
              return Object.entries(counts).map(([name, value]) => ({ name, value }));
            };
            const leadsOverTime = groupByDay(leads, items => items.length);
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <StatCard label="Quiz Starts" value={quizStarts} />
                  <StatCard label="Quiz Completions" value={quizCompletes} />
                  <StatCard label="Completion Rate" value={`${completionRate}%`} />
                  <StatCard label="Conversion Rate" value={`${conversionRate}%`} />
                  <StatCard label="WhatsApp Capture" value={`${whatsappRate}%`} />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  {[
                    { title: "By Hospital Type", data: makeDonut("hospital_type") },
                    { title: "By Delivery Method", data: makeDonut("delivery_method") },
                    { title: "By Baby Gender", data: makeDonut("baby_gender") },
                    { title: "By Budget Tier", data: makeDonut("budget_tier") },
                    { title: "Purchased vs Not", data: [{ name: "Purchased", value: purchased }, { name: "Not Purchased", value: leads.length - purchased }] },
                  ].map(chart => (
                    <ChartCard key={chart.title} title={chart.title} empty={chart.data.length === 0}>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart><Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,value})=>`${name}: ${value}`}>
                          {chart.data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                        </Pie><Tooltip /></PieChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  ))}
                  <ChartCard title="Quiz Leads Over Time" empty={leadsOverTime.length === 0}>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={leadsOverTime}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip /><Bar dataKey="value" fill="#2D6A4F" radius={[4,4,0,0]} name="Leads" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              </>
            );
          })()}
        </TabsContent>

        {/* ═══ TAB 4: PRODUCTS ═══ */}
        <TabsContent value="products">
          {(() => {
            const paidItems = items.filter((i: any) => (i.orders as any)?.payment_status === "paid");
            const productRevenue: Record<string, { name: string; revenue: number; units: number }> = {};
            paidItems.forEach((i: any) => {
              if (!productRevenue[i.product_name]) productRevenue[i.product_name] = { name: i.product_name, revenue: 0, units: 0 };
              productRevenue[i.product_name].revenue += i.line_total || 0;
              productRevenue[i.product_name].units += i.quantity || 0;
            });
            const topByRevenue = Object.values(productRevenue).sort((a,b) => b.revenue - a.revenue).slice(0, 10);
            const topByFreq = Object.values(productRevenue).sort((a,b) => b.units - a.units).slice(0, 10);
            const tierCounts: Record<string, number> = {};
            const hospitalCounts: Record<string, number> = {};
            o.forEach((x: any) => {
              const qa = x.quiz_answers as any;
              if (qa?.budget_tier) tierCounts[qa.budget_tier] = (tierCounts[qa.budget_tier] || 0) + 1;
              if (qa?.hospital_type) hospitalCounts[qa.hospital_type] = (hospitalCounts[qa.hospital_type] || 0) + 1;
            });
            return (
              <div className="grid md:grid-cols-2 gap-6">
                <ChartCard title="Top 10 Products by Revenue" empty={topByRevenue.length === 0}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topByRevenue} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₦${(v/1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                      <Tooltip formatter={(v: number) => fmt(v)} /><Bar dataKey="revenue" fill="#2D6A4F" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Top 10 Products by Frequency" empty={topByFreq.length === 0}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topByFreq} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                      <Tooltip /><Bar dataKey="units" fill="#F4845F" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Tier Breakdown" empty={Object.keys(tierCounts).length === 0}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart><Pie data={Object.entries(tierCounts).map(([name,value])=>({name,value}))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {Object.keys(tierCounts).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                    </Pie><Tooltip /></PieChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Hospital Type" empty={Object.keys(hospitalCounts).length === 0}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart><Pie data={Object.entries(hospitalCounts).map(([name,value])=>({name,value}))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {Object.keys(hospitalCounts).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                    </Pie><Tooltip /></PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            );
          })()}
        </TabsContent>

        {/* ═══ TAB 5: MARKETING ═══ */}
        <TabsContent value="marketing">
          {(() => {
            const sessionsByDay: Record<string, Set<string>> = {};
            evts.forEach((e: any) => { const d = (e.created_at || "").slice(0, 10); if (d && e.session_id) { if (!sessionsByDay[d]) sessionsByDay[d] = new Set(); sessionsByDay[d].add(e.session_id); } });
            const sessionsChart = Object.entries(sessionsByDay).sort().map(([date, set]) => ({ date: date.slice(5), value: set.size }));
            const refSources: Record<string, number> = {};
            evts.forEach((e: any) => { const r = e.traffic_source || e.referral_source || "direct"; refSources[r] = (refSources[r] || 0) + 1; });
            const refChart = Object.entries(refSources).sort((a,b) => b[1]-a[1]).slice(0,10).map(([name,value]) => ({ name, value }));
            const topPages: Record<string, number> = {};
            evts.forEach((e: any) => { if (e.page_url) topPages[e.page_url] = (topPages[e.page_url] || 0) + 1; });
            const pagesChart = Object.entries(topPages).sort((a,b) => b[1]-a[1]).slice(0,10).map(([name,value]) => ({ name, value }));
            const quizStarted = evts.filter((e:any) => e.event_type === "quiz_started").length;
            const quizCompleted = evts.filter((e:any) => e.event_type === "quiz_completed").length;
            const checkoutStarted = evts.filter((e:any) => e.event_type === "checkout_started").length;
            const orderPlaced = evts.filter((e:any) => e.event_type === "order_placed").length;
            const checkoutSessions = new Set(evts.filter((e:any) => e.event_type === "checkout_started").map((e:any) => e.session_id));
            const orderSessions = new Set(evts.filter((e:any) => e.event_type === "order_placed").map((e:any) => e.session_id));
            const abandoned = [...checkoutSessions].filter(s => !orderSessions.has(s)).length;
            const abandonRate = checkoutSessions.size > 0 ? ((abandoned / checkoutSessions.size) * 100).toFixed(1) : "0.0";
            const convRate = quizStarted > 0 ? ((orderPlaced / quizStarted) * 100).toFixed(1) : "0.0";
            const funnel = [
              { step: "Quiz Started", count: quizStarted },
              { step: "Quiz Completed", count: quizCompleted },
              { step: "Checkout Started", count: checkoutStarted },
              { step: "Order Placed", count: orderPlaced },
            ];
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                  <StatCard label="Cart Abandonment" value={`${abandonRate}%`} />
                  <StatCard label="Conversion Rate" value={`${convRate}%`} />
                  <StatCard label="Sessions" value={Object.values(sessionsByDay).reduce((s, set) => s + set.size, 0)} />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <ChartCard title="Sessions Over Time" empty={sessionsChart.length === 0}>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={sessionsChart}>
                        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                        <Tooltip /><Line type="monotone" dataKey="value" stroke="#2D6A4F" strokeWidth={2} name="Sessions" />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Conversion Funnel" empty={quizStarted === 0}>
                    <div className="space-y-3">
                      {funnel.map((step, i) => (
                        <div key={step.step}>
                          <div className="flex justify-between text-xs mb-1">
                            <span>{step.step}</span>
                            <span className="font-semibold">{step.count} {i > 0 && funnel[i-1].count > 0 && <span className="text-muted-foreground">({pct(step.count, funnel[i-1].count)}% from prev)</span>}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${quizStarted > 0 ? Math.max((step.count/quizStarted)*100, 2) : 0}%`, backgroundColor: COLORS[i%COLORS.length] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </ChartCard>
                  <ChartCard title="Traffic by Source" empty={refChart.length === 0}>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={refChart} layout="vertical">
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip /><Bar dataKey="value" fill="#F4845F" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Top Pages Visited" empty={pagesChart.length === 0}>
                    <div className="space-y-2">
                      {pagesChart.map((p, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="truncate max-w-[200px]">{p.name}</span>
                          <span className="font-semibold">{p.value}</span>
                        </div>
                      ))}
                    </div>
                  </ChartCard>
                </div>
              </>
            );
          })()}
        </TabsContent>

        {/* ═══ TAB 6: COHORTS ═══ */}
        <TabsContent value="cohort">
          {(() => {
            const allO = allOrders || [];
            const customerFirstOrder: Record<string, string> = {};
            allO.forEach((o: any) => {
              const month = (o.created_at || "").slice(0, 7);
              if (!customerFirstOrder[o.customer_email] || month < customerFirstOrder[o.customer_email]) {
                customerFirstOrder[o.customer_email] = month;
              }
            });
            const cohortMonths = [...new Set(Object.values(customerFirstOrder))].sort().slice(-12);
            const cohortData = cohortMonths.map(cohortMonth => {
              const cohortCustomers = Object.entries(customerFirstOrder).filter(([_, m]) => m === cohortMonth).map(([email]) => email);
              const cohortSize = cohortCustomers.length;
              const retention: Record<number, number> = {};
              for (let offset = 0; offset <= 6; offset++) {
                const targetDate = new Date(cohortMonth + "-01");
                targetDate.setMonth(targetDate.getMonth() + offset);
                const targetMonth = targetDate.toISOString().slice(0, 7);
                const activeInMonth = new Set(allO.filter((o: any) => (o.created_at || "").startsWith(targetMonth) && cohortCustomers.includes(o.customer_email)).map((o: any) => o.customer_email));
                retention[offset] = activeInMonth.size;
              }
              return { month: cohortMonth, size: cohortSize, retention };
            });
            return (
              <ChartCard title="Monthly Cohort Retention" empty={cohortData.length === 0}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-background">
                      <tr className="text-muted-foreground">
                        <th className="p-2 text-left">Cohort</th>
                        <th className="p-2 text-center">Size</th>
                        {[0,1,2,3,4,5,6].map(m => <th key={m} className="p-2 text-center">M{m}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {cohortData.map(row => (
                        <tr key={row.month} className="border-t border-border">
                          <td className="p-2 font-semibold">{row.month}</td>
                          <td className="p-2 text-center">{row.size}</td>
                          {[0,1,2,3,4,5,6].map(m => {
                            const val = row.retention[m] || 0;
                            const pctVal = row.size > 0 ? Math.round((val / row.size) * 100) : 0;
                            const opacity = Math.min(pctVal / 100, 1);
                            return (
                              <td key={m} className="p-2 text-center" style={{ backgroundColor: `rgba(45, 106, 79, ${opacity * 0.6})`, color: opacity > 0.3 ? "white" : undefined }}>
                                {pctVal}%
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            );
          })()}
        </TabsContent>

        {/* ═══ TAB 7: ACQUISITION ═══ */}
        <TabsContent value="acquisition">
          {(() => {
            // Build session-level data from events
            const sessionData: Record<string, { traffic_source: string; traffic_medium: string; device_type: string; browser: string; events: string[]; hasOrder: boolean }> = {};
            evts.forEach((e: any) => {
              const sid = e.session_id;
              if (!sid) return;
              if (!sessionData[sid]) sessionData[sid] = { traffic_source: e.traffic_source || "direct", traffic_medium: e.traffic_medium || "(none)", device_type: e.device_type || "unknown", browser: e.browser || "unknown", events: [], hasOrder: false };
              sessionData[sid].events.push(e.event_type);
              if (e.event_type === "order_placed") sessionData[sid].hasOrder = true;
            });
            const sessions = Object.values(sessionData);

            // Traffic Acquisition by source
            const bySource: Record<string, { sessions: number; orders: number; revenue: number }> = {};
            sessions.forEach(s => {
              const key = s.traffic_source;
              if (!bySource[key]) bySource[key] = { sessions: 0, orders: 0, revenue: 0 };
              bySource[key].sessions++;
              if (s.hasOrder) bySource[key].orders++;
            });
            const sourceTable = Object.entries(bySource).map(([source, d]) => ({
              Source: source, Sessions: d.sessions, Orders: d.orders, "Conv. Rate": `${d.sessions > 0 ? ((d.orders/d.sessions)*100).toFixed(1) : "0.0"}%`,
            }));

            // Source / Medium
            const bySourceMedium: Record<string, { sessions: number; orders: number }> = {};
            sessions.forEach(s => {
              const key = `${s.traffic_source}|${s.traffic_medium}`;
              if (!bySourceMedium[key]) bySourceMedium[key] = { sessions: 0, orders: 0 };
              bySourceMedium[key].sessions++;
              if (s.hasOrder) bySourceMedium[key].orders++;
            });
            const smTable = Object.entries(bySourceMedium).map(([key, d]) => {
              const [source, medium] = key.split("|");
              return { Source: source, Medium: medium, Sessions: d.sessions, Orders: d.orders, "Conv. Rate": `${d.sessions > 0 ? ((d.orders/d.sessions)*100).toFixed(1) : "0.0"}%` };
            });

            // Landing pages from page_views
            const lpData: Record<string, { sessions: Set<string>; views: number }> = {};
            pvs.forEach((pv: any) => {
              if (!lpData[pv.page_url]) lpData[pv.page_url] = { sessions: new Set(), views: 0 };
              lpData[pv.page_url].sessions.add(pv.session_id);
              lpData[pv.page_url].views++;
            });
            const lpTable = Object.entries(lpData).map(([page, d]) => ({
              "Landing Page": page, Sessions: d.sessions.size, Views: d.views,
            }));

            return (
              <div className="space-y-8">
                <ChartCard title="Traffic Acquisition" empty={sourceTable.length === 0}>
                  <DataTable columns={[
                    { key: "Source", label: "Source" },
                    { key: "Sessions", label: "Sessions" },
                    { key: "Orders", label: "Orders" },
                    { key: "Conv. Rate", label: "Conv. Rate" },
                  ]} data={sourceTable} />
                </ChartCard>
                <ChartCard title="Source / Medium" empty={smTable.length === 0}>
                  <DataTable columns={[
                    { key: "Source", label: "Source" },
                    { key: "Medium", label: "Medium" },
                    { key: "Sessions", label: "Sessions" },
                    { key: "Orders", label: "Orders" },
                    { key: "Conv. Rate", label: "Conv. Rate" },
                  ]} data={smTable} />
                </ChartCard>
                <ChartCard title="Landing Pages" empty={lpTable.length === 0}>
                  <DataTable columns={[
                    { key: "Landing Page", label: "Landing Page" },
                    { key: "Sessions", label: "Sessions" },
                    { key: "Views", label: "Views" },
                  ]} data={lpTable} />
                </ChartCard>
              </div>
            );
          })()}
        </TabsContent>

        {/* ═══ TAB 8: BEHAVIOUR ═══ */}
        <TabsContent value="behaviour">
          {(() => {
            // Pages & Screens
            const pageData: Record<string, { views: number; sessions: Set<string> }> = {};
            pvs.forEach((pv: any) => {
              if (!pageData[pv.page_url]) pageData[pv.page_url] = { views: 0, sessions: new Set() };
              pageData[pv.page_url].views++;
              pageData[pv.page_url].sessions.add(pv.session_id);
            });
            const pageTable = Object.entries(pageData).map(([url, d]) => ({
              "Page URL": url, Views: d.views, "Unique Views": d.sessions.size,
            }));

            // Events
            const eventCounts: Record<string, { count: number; sessions: Set<string> }> = {};
            evts.forEach((e: any) => {
              if (!eventCounts[e.event_type]) eventCounts[e.event_type] = { count: 0, sessions: new Set() };
              eventCounts[e.event_type].count++;
              if (e.session_id) eventCounts[e.event_type].sessions.add(e.session_id);
            });
            const eventTable = Object.entries(eventCounts).map(([name, d]) => ({
              "Event Name": name, "Event Count": d.count, Users: d.sessions.size,
              "Events/Session": d.sessions.size > 0 ? (d.count / d.sessions.size).toFixed(1) : "0",
            }));

            // Conversion funnel
            const funnelSteps = ["quiz_started", "quiz_completed", "checkout_started", "order_placed"];
            const funnelSessions: Record<string, Set<string>> = {};
            funnelSteps.forEach(step => { funnelSessions[step] = new Set(); });
            evts.forEach((e: any) => {
              if (funnelSteps.includes(e.event_type) && e.session_id) {
                funnelSessions[e.event_type].add(e.session_id);
              }
            });
            const funnelTable = funnelSteps.map((step, i) => {
              const users = funnelSessions[step].size;
              const prevUsers = i > 0 ? funnelSessions[funnelSteps[i-1]].size : users;
              const dropoff = i > 0 ? prevUsers - users : 0;
              return {
                Step: step.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
                Users: users,
                "Drop-off": i > 0 ? dropoff : "—",
                "Drop-off %": i > 0 && prevUsers > 0 ? `${((dropoff/prevUsers)*100).toFixed(1)}%` : "—",
                "Conv. Rate": funnelSessions[funnelSteps[0]].size > 0 ? `${((users/funnelSessions[funnelSteps[0]].size)*100).toFixed(1)}%` : "—",
              };
            });

            return (
              <div className="space-y-8">
                <ChartCard title="Pages and Screens" empty={pageTable.length === 0}>
                  <DataTable columns={[
                    { key: "Page URL", label: "Page URL" },
                    { key: "Views", label: "Views" },
                    { key: "Unique Views", label: "Unique Views" },
                  ]} data={pageTable} />
                </ChartCard>
                <ChartCard title="Events" empty={eventTable.length === 0}>
                  <DataTable columns={[
                    { key: "Event Name", label: "Event Name" },
                    { key: "Event Count", label: "Count" },
                    { key: "Users", label: "Users" },
                    { key: "Events/Session", label: "Events/Session" },
                  ]} data={eventTable} />
                </ChartCard>
                <ChartCard title="Conversion Funnel" empty={funnelTable.length === 0}>
                  <DataTable columns={[
                    { key: "Step", label: "Step" },
                    { key: "Users", label: "Users" },
                    { key: "Drop-off", label: "Drop-off" },
                    { key: "Drop-off %", label: "Drop-off %" },
                    { key: "Conv. Rate", label: "Conv. Rate" },
                  ]} data={funnelTable} pageSize={10} preserveOrder />
                </ChartCard>
              </div>
            );
          })()}
        </TabsContent>

        {/* ═══ TAB 9: AUDIENCE ═══ */}
        <TabsContent value="audience">
          {(() => {
            // Build session-level data
            const sessionData: Record<string, { device_type: string; browser: string; hasOrder: boolean }> = {};
            evts.forEach((e: any) => {
              const sid = e.session_id;
              if (!sid) return;
              if (!sessionData[sid]) sessionData[sid] = { device_type: e.device_type || "unknown", browser: e.browser || "unknown", hasOrder: false };
              if (e.event_type === "order_placed") sessionData[sid].hasOrder = true;
            });
            const sessions = Object.values(sessionData);

            // Device
            const deviceAgg: Record<string, { sessions: number; orders: number }> = {};
            sessions.forEach(s => {
              if (!deviceAgg[s.device_type]) deviceAgg[s.device_type] = { sessions: 0, orders: 0 };
              deviceAgg[s.device_type].sessions++;
              if (s.hasOrder) deviceAgg[s.device_type].orders++;
            });
            const deviceTable = Object.entries(deviceAgg).map(([device, d]) => ({
              "Device Type": device, Sessions: d.sessions, Orders: d.orders,
              "Conv. Rate": `${d.sessions > 0 ? ((d.orders/d.sessions)*100).toFixed(1) : "0.0"}%`,
            }));

            // Browser
            const browserAgg: Record<string, { sessions: number; orders: number }> = {};
            sessions.forEach(s => {
              if (!browserAgg[s.browser]) browserAgg[s.browser] = { sessions: 0, orders: 0 };
              browserAgg[s.browser].sessions++;
              if (s.hasOrder) browserAgg[s.browser].orders++;
            });
            const browserTable = Object.entries(browserAgg).map(([browser, d]) => ({
              Browser: browser, Sessions: d.sessions, Orders: d.orders,
              "Conv. Rate": `${d.sessions > 0 ? ((d.orders/d.sessions)*100).toFixed(1) : "0.0"}%`,
            }));

            // Geography from orders
            const geoAgg: Record<string, { orders: number; revenue: number }> = {};
            o.forEach((x: any) => {
              const state = x.delivery_state || "unknown";
              if (!geoAgg[state]) geoAgg[state] = { orders: 0, revenue: 0 };
              geoAgg[state].orders++;
              if (x.payment_status === "paid") geoAgg[state].revenue += x.total || 0;
            });
            const geoTable = Object.entries(geoAgg).map(([state, d]) => ({
              State: state, Orders: d.orders, Revenue: fmt(d.revenue),
            }));

            // New vs Returning
            const allO = allOrders || [];
            const emailOrders: Record<string, number> = {};
            allO.forEach((x: any) => { emailOrders[x.customer_email] = (emailOrders[x.customer_email] || 0) + 1; });
            const newOrders = o.filter((x: any) => (emailOrders[x.customer_email] || 0) <= 1);
            const returningOrders = o.filter((x: any) => (emailOrders[x.customer_email] || 0) > 1);
            const nrTable = [
              { "User Type": "New", Orders: newOrders.length, Revenue: fmt(newOrders.filter((x:any)=>x.payment_status==="paid").reduce((s:number,x:any)=>s+(x.total||0),0)) },
              { "User Type": "Returning", Orders: returningOrders.length, Revenue: fmt(returningOrders.filter((x:any)=>x.payment_status==="paid").reduce((s:number,x:any)=>s+(x.total||0),0)) },
            ];

            return (
              <div className="space-y-8">
                <ChartCard title="Device Category" empty={deviceTable.length === 0}>
                  <DataTable columns={[
                    { key: "Device Type", label: "Device" },
                    { key: "Sessions", label: "Sessions" },
                    { key: "Orders", label: "Orders" },
                    { key: "Conv. Rate", label: "Conv. Rate" },
                  ]} data={deviceTable} />
                </ChartCard>
                <ChartCard title="Browser" empty={browserTable.length === 0}>
                  <DataTable columns={[
                    { key: "Browser", label: "Browser" },
                    { key: "Sessions", label: "Sessions" },
                    { key: "Orders", label: "Orders" },
                    { key: "Conv. Rate", label: "Conv. Rate" },
                  ]} data={browserTable} />
                </ChartCard>
                <ChartCard title="Geography" empty={geoTable.length === 0}>
                  <DataTable columns={[
                    { key: "State", label: "State" },
                    { key: "Orders", label: "Orders" },
                    { key: "Revenue", label: "Revenue" },
                  ]} data={geoTable} />
                </ChartCard>
                <ChartCard title="New vs Returning Users" empty={nrTable.length === 0}>
                  <DataTable columns={[
                    { key: "User Type", label: "User Type" },
                    { key: "Orders", label: "Orders" },
                    { key: "Revenue", label: "Revenue" },
                  ]} data={nrTable} pageSize={10} />
                </ChartCard>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
