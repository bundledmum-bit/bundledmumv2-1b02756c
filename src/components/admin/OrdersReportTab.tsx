import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Download, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend } from "recharts";

const fmt = (n: number) => `₦${(n || 0).toLocaleString()}`;
const CHANNEL_COLORS: Record<string, string> = {
  "Paid Social": "bg-blue-100 text-blue-700", "Paid Search": "bg-green-100 text-green-700",
  "Direct": "bg-gray-100 text-gray-700", "Organic Search": "bg-teal-100 text-teal-700",
  "Email/SMS": "bg-purple-100 text-purple-700", "Affiliate": "bg-orange-100 text-orange-700",
  "Influencer": "bg-pink-100 text-pink-700", "Social": "bg-indigo-100 text-indigo-700",
  "Referral": "bg-amber-100 text-amber-700",
};
const NR_COLORS: Record<string, string> = { "New": "bg-green-100 text-green-700", "Returning": "bg-blue-100 text-blue-700" };

const PAGE_SIZE = 50;

const DATE_PRESETS = [
  { label: "Today", fn: () => { const d = new Date(); d.setHours(0,0,0,0); return { from: d, to: new Date() }; } },
  { label: "This Week", fn: () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return { from: d, to: new Date() }; } },
  { label: "This Month", fn: () => { const d = new Date(); return { from: new Date(d.getFullYear(), d.getMonth(), 1), to: new Date() }; } },
  { label: "Last 30 Days", fn: () => { const d = new Date(); d.setDate(d.getDate()-30); d.setHours(0,0,0,0); return { from: d, to: new Date() }; } },
  { label: "Last 90 Days", fn: () => { const d = new Date(); d.setDate(d.getDate()-90); d.setHours(0,0,0,0); return { from: d, to: new Date() }; } },
];

export default function OrdersReportTab() {
  const [datePreset, setDatePreset] = useState("Last 30 Days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [channelFilter, setChannelFilter] = useState("All");
  const [nrFilter, setNrFilter] = useState("All");
  const [payStatusFilter, setPayStatusFilter] = useState("All");
  const [orderStatusFilter, setOrderStatusFilter] = useState("All");
  const [payMethodFilter, setPayMethodFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState("Order_Date");
  const [sortAsc, setSortAsc] = useState(false);

  const dateRange = useMemo(() => {
    if (datePreset === "Custom" && customFrom && customTo) return { from: new Date(customFrom), to: new Date(customTo + "T23:59:59") };
    return (DATE_PRESETS.find(p => p.label === datePreset) || DATE_PRESETS[3]).fn();
  }, [datePreset, customFrom, customTo]);

  const prevRange = useMemo(() => {
    const diff = dateRange.to.getTime() - dateRange.from.getTime();
    return { from: new Date(dateRange.from.getTime() - diff), to: new Date(dateRange.from.getTime()) };
  }, [dateRange]);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["orders-report"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders_report").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: summaryData } = useQuery({
    queryKey: ["orders-report-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders_report_summary").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  // Date-filtered data
  const dateFiltered = useMemo(() => {
    if (!rawData) return [];
    return rawData.filter((r: any) => {
      const d = new Date(r.Order_Date);
      return d >= dateRange.from && d <= dateRange.to;
    });
  }, [rawData, dateRange]);

  const prevData = useMemo(() => {
    if (!rawData) return [];
    return rawData.filter((r: any) => {
      const d = new Date(r.Order_Date);
      return d >= prevRange.from && d <= prevRange.to;
    });
  }, [rawData, prevRange]);

  // Apply filters
  const filtered = useMemo(() => {
    let d = dateFiltered;
    if (channelFilter !== "All") d = d.filter((r: any) => r.Attributed_Channel === channelFilter);
    if (nrFilter !== "All") d = d.filter((r: any) => r.New_vs_Returning === nrFilter);
    if (payStatusFilter !== "All") d = d.filter((r: any) => (r.Payment_Status || "").toLowerCase() === payStatusFilter.toLowerCase());
    if (orderStatusFilter !== "All") d = d.filter((r: any) => (r.Order_Status || "").toLowerCase() === orderStatusFilter.toLowerCase());
    if (payMethodFilter !== "All") d = d.filter((r: any) => (r.Payment_Method || "").toLowerCase() === payMethodFilter.toLowerCase());
    if (stateFilter !== "All") d = d.filter((r: any) => r.State === stateFilter);
    if (search) {
      const s = search.toLowerCase();
      d = d.filter((r: any) => (r.Order_ID || "").toLowerCase().includes(s) || (r.Customer_ID || "").toLowerCase().includes(s));
    }
    return d;
  }, [dateFiltered, channelFilter, nrFilter, payStatusFilter, orderStatusFilter, payMethodFilter, stateFilter, search]);

  // Sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "number" ? (av || 0) - (bv || 0) : String(av || "").localeCompare(String(bv || ""));
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortAsc]);

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  // Stats
  const stats = useMemo(() => {
    const d = filtered;
    const totalOrders = d.length;
    const totalGross = d.reduce((s: number, r: any) => s + (r.Gross_Sales_NGN || 0), 0);
    const totalNet = d.reduce((s: number, r: any) => s + (r.Net_Sales_NGN || 0), 0);
    const totalDisc = d.reduce((s: number, r: any) => s + (r.Discount_NGN || 0), 0);
    const totalReturns = d.reduce((s: number, r: any) => s + (r.Returns_NGN || 0), 0);
    const totalCogs = d.reduce((s: number, r: any) => s + (r.COGS_Net_NGN || 0), 0);
    const totalGP = d.reduce((s: number, r: any) => s + (r.Gross_Profit_NGN || 0), 0);
    const aov = totalOrders > 0 ? Math.round(totalNet / totalOrders) : 0;
    const totalUnits = d.reduce((s: number, r: any) => s + (r.Total_Units || r.Items || 0), 0);
    const gm = totalNet > 0 ? ((totalGP / totalNet) * 100).toFixed(1) : "0.0";
    return { totalOrders, totalGross, totalNet, totalDisc, totalReturns, totalCogs, totalGP, aov, totalUnits, gm };
  }, [filtered]);

  const prevStats = useMemo(() => {
    const d = prevData;
    return {
      totalOrders: d.length,
      totalGross: d.reduce((s: number, r: any) => s + (r.Gross_Sales_NGN || 0), 0),
      totalNet: d.reduce((s: number, r: any) => s + (r.Net_Sales_NGN || 0), 0),
      totalDisc: d.reduce((s: number, r: any) => s + (r.Discount_NGN || 0), 0),
      totalReturns: d.reduce((s: number, r: any) => s + (r.Returns_NGN || 0), 0),
      totalCogs: d.reduce((s: number, r: any) => s + (r.COGS_Net_NGN || 0), 0),
      totalGP: d.reduce((s: number, r: any) => s + (r.Gross_Profit_NGN || 0), 0),
      aov: d.length > 0 ? Math.round(d.reduce((s: number, r: any) => s + (r.Net_Sales_NGN || 0), 0) / d.length) : 0,
      totalUnits: d.reduce((s: number, r: any) => s + (r.Total_Units || r.Items || 0), 0),
    };
  }, [prevData]);

  const pctChg = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 1000) / 10;

  // Summary totals row
  const summaryRow = useMemo(() => ({
    items: filtered.reduce((s: number, r: any) => s + (r.Items || 0), 0),
    net: filtered.reduce((s: number, r: any) => s + (r.Net_Sales_NGN || 0), 0),
    gross: filtered.reduce((s: number, r: any) => s + (r.Gross_Sales_NGN || 0), 0),
    disc: filtered.reduce((s: number, r: any) => s + (r.Discount_NGN || 0), 0),
    cogs: filtered.reduce((s: number, r: any) => s + (r.COGS_Net_NGN || 0), 0),
    gp: filtered.reduce((s: number, r: any) => s + (r.Gross_Profit_NGN || 0), 0),
    aov: filtered.length > 0 ? Math.round(filtered.reduce((s: number, r: any) => s + (r.Net_Sales_NGN || 0), 0) / filtered.length) : 0,
  }), [filtered]);

  // Charts
  const chartData = useMemo(() => {
    const sd = summaryData || [];
    const inRange = sd.filter((r: any) => {
      const d = new Date(r.report_date);
      return d >= dateRange.from && d <= dateRange.to;
    });
    const byDate: Record<string, { date: string; net: number; gp: number }> = {};
    inRange.forEach((r: any) => {
      const d = r.report_date;
      if (!byDate[d]) byDate[d] = { date: d, net: 0, gp: 0 };
      byDate[d].net += r.total_net_sales || 0;
      byDate[d].gp += r.total_gross_profit || 0;
    });
    const byChannel: Record<string, number> = {};
    inRange.forEach((r: any) => {
      const ch = r.attributed_channel || "Direct";
      byChannel[ch] = (byChannel[ch] || 0) + (r.total_net_sales || 0);
    });
    return {
      timeSeries: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
      channelBars: Object.entries(byChannel).map(([channel, revenue]) => ({ channel, revenue })).sort((a, b) => b.revenue - a.revenue),
    };
  }, [summaryData, dateRange]);

  // Unique values for filters
  const channels = useMemo(() => [...new Set((rawData || []).map((r: any) => r.Attributed_Channel).filter(Boolean))].sort(), [rawData]);
  const states = useMemo(() => [...new Set((rawData || []).map((r: any) => r.State).filter(Boolean))].sort(), [rawData]);

  // Exports
  const exportCSV = () => {
    const headers = ["Order ID","Order Date","Customer ID","Attributed Channel","New vs Returning","Items","Net Sales","Gross Sales","Discount","COGS Net","Shipping","Tax","Returns","Gross Profit","AOV"];
    const rows = filtered.map((r: any) => [r.Order_ID, r.Order_Date, r.Customer_ID, r.Attributed_Channel, r.New_vs_Returning, r.Items, r.Net_Sales_NGN, r.Gross_Sales_NGN, r.Discount_NGN, r.COGS_Net_NGN, r.Shipping_NGN, r.Tax_NGN, r.Returns_NGN, r.Gross_Profit_NGN, r.AOV_NGN].join(","));
    const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "orders-report.csv"; a.click();
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const headers = ["Order ID","Order Date","Customer ID","Attributed Channel","New vs Returning","Items","Net Sales (₦)","Gross Sales (₦)","Discount (₦)","COGS Net (₦)","Shipping (₦)","Tax (₦)","Returns (₦)","Gross Profit (₦)","AOV (₦)"];
    const rows = filtered.map((r: any) => [r.Order_ID, r.Order_Date, r.Customer_ID, r.Attributed_Channel, r.New_vs_Returning, r.Items, r.Net_Sales_NGN, r.Gross_Sales_NGN, r.Discount_NGN, r.COGS_Net_NGN, r.Shipping_NGN, r.Tax_NGN, r.Returns_NGN, r.Gross_Profit_NGN, r.AOV_NGN]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Style header
    if (!ws["!cols"]) ws["!cols"] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, "Orders Report");
    XLSX.writeFile(wb, "BundledMum-Orders-Report.xlsx");
  };

  const handleSort = (key: string) => { setSortKey(key); setSortAsc(sortKey === key ? !sortAsc : false); };

  const StatCard = ({ label, value, sub, change }: { label: string; value: string; sub?: string; change?: number }) => (
    <div className="bg-card border border-border rounded-xl p-3 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-muted-foreground text-[10px]">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      {change !== undefined && (
        <div className={`text-[10px] mt-0.5 font-semibold flex items-center justify-center gap-0.5 ${change >= 0 ? "text-green-600" : "text-destructive"}`}>
          {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}{Math.abs(change).toFixed(1)}%
        </div>
      )}
    </div>
  );

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading orders report...</div>;

  const selCls = "border border-input rounded-lg px-2 py-1 text-xs bg-background";

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 lg:grid-cols-9 gap-2">
        <StatCard label="Total Orders" value={stats.totalOrders.toLocaleString()} change={pctChg(stats.totalOrders, prevStats.totalOrders)} />
        <StatCard label="Gross Sales" value={fmt(stats.totalGross)} change={pctChg(stats.totalGross, prevStats.totalGross)} />
        <StatCard label="Net Sales" value={fmt(stats.totalNet)} change={pctChg(stats.totalNet, prevStats.totalNet)} />
        <StatCard label="Discounts" value={fmt(stats.totalDisc)} sub={`${stats.totalGross ? ((stats.totalDisc/stats.totalGross)*100).toFixed(1) : 0}% of Gross`} change={pctChg(stats.totalDisc, prevStats.totalDisc)} />
        <StatCard label="Returns" value={fmt(stats.totalReturns)} sub={`${stats.totalGross ? ((stats.totalReturns/stats.totalGross)*100).toFixed(1) : 0}% of Gross`} change={pctChg(stats.totalReturns, prevStats.totalReturns)} />
        <StatCard label="COGS" value={fmt(stats.totalCogs)} change={pctChg(stats.totalCogs, prevStats.totalCogs)} />
        <StatCard label="Gross Profit" value={fmt(stats.totalGP)} sub={`GM: ${stats.gm}%`} change={pctChg(stats.totalGP, prevStats.totalGP)} />
        <StatCard label="AOV" value={fmt(stats.aov)} change={pctChg(stats.aov, prevStats.aov)} />
        <StatCard label="Units Sold" value={stats.totalUnits.toLocaleString()} change={pctChg(stats.totalUnits, prevStats.totalUnits)} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-bold text-sm mb-3">Net Sales vs Gross Profit</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData.timeSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
              <RTooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="net" name="Net Sales" stroke="#2D6A4F" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="gp" name="Gross Profit" stroke="#F4845F" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-bold text-sm mb-3">Revenue by Channel</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData.channelBars}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="channel" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="revenue" fill="#2D6A4F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Date Range</label>
          <select value={datePreset} onChange={e => setDatePreset(e.target.value)} className={selCls}>
            {DATE_PRESETS.map(p => <option key={p.label}>{p.label}</option>)}
            <option>Custom</option>
          </select>
        </div>
        {datePreset === "Custom" && <>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={selCls} />
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={selCls} />
        </>}
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Channel</label>
          <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} className={selCls}>
            <option>All</option>{channels.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">New/Returning</label>
          <select value={nrFilter} onChange={e => setNrFilter(e.target.value)} className={selCls}><option>All</option><option>New</option><option>Returning</option></select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Pay Status</label>
          <select value={payStatusFilter} onChange={e => setPayStatusFilter(e.target.value)} className={selCls}><option>All</option><option>Paid</option><option>Pending</option><option>Refunded</option></select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Order Status</label>
          <select value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)} className={selCls}><option>All</option><option>confirmed</option><option>delivered</option><option>cancelled</option><option>returned</option></select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Pay Method</label>
          <select value={payMethodFilter} onChange={e => setPayMethodFilter(e.target.value)} className={selCls}><option>All</option><option>card</option><option>transfer</option><option>ussd</option></select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">State</label>
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className={selCls}>
            <option>All</option>{states.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search Order/Customer ID..." className={`${selCls} w-48`} />
        <div className="ml-auto flex gap-1">
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs h-10"><Download className="w-3 h-3 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="text-xs h-10"><Download className="w-3 h-3 mr-1" />Excel</Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-card border border-border rounded-xl">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="text-muted-foreground border-b border-border bg-muted/30">
              {[
                { key: "Order_ID", label: "Order ID" }, { key: "Order_Date", label: "Order Date" },
                { key: "Customer_ID", label: "Customer ID" }, { key: "Attributed_Channel", label: "Attributed Channel" },
                { key: "New_vs_Returning", label: "New vs Returning" }, { key: "Items", label: "Items" },
                { key: "Net_Sales_NGN", label: "Net Sales (₦)" }, { key: "Gross_Sales_NGN", label: "Gross Sales (₦)" },
                { key: "Discount_NGN", label: "Discount (₦)" }, { key: "COGS_Net_NGN", label: "COGS Net (₦)" },
                { key: "Shipping_NGN", label: "Shipping (₦)" }, { key: "Tax_NGN", label: "Tax (₦)" },
                { key: "Returns_NGN", label: "Returns (₦)" }, { key: "Gross_Profit_NGN", label: "Gross Profit (₦)" },
                { key: "AOV_NGN", label: "AOV (₦)" },
              ].map(col => (
                <th key={col.key} className="p-2 text-left cursor-pointer hover:text-foreground whitespace-nowrap" onClick={() => handleSort(col.key)}>
                  {col.label} {sortKey === col.key && (sortAsc ? "↑" : "↓")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((r: any, i: number) => (
              <tr key={i} className="border-b border-border hover:bg-muted/30">
                <td className="p-2"><a href={`/admin/orders?id=${r.order_uuid}`} className="text-forest font-semibold hover:underline">{r.Order_ID}</a></td>
                <td className="p-2 whitespace-nowrap">{r.Order_Date ? new Date(r.Order_Date).toLocaleDateString("en-NG") : ""}</td>
                <td className="p-2">{r.Customer_ID}</td>
                <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${CHANNEL_COLORS[r.Attributed_Channel] || "bg-gray-100 text-gray-700"}`}>{r.Attributed_Channel}</span></td>
                <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${NR_COLORS[r.New_vs_Returning] || ""}`}>{r.New_vs_Returning}</span></td>
                <td className="p-2 text-right">{r.Items}</td>
                <td className="p-2 text-right">{fmt(r.Net_Sales_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Gross_Sales_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Discount_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.COGS_Net_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Shipping_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Tax_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Returns_NGN)}</td>
                <td className="p-2 text-right">
                  <Tooltip>
                    <TooltipTrigger>
                      <span className={`font-semibold ${(r.Gross_Profit_NGN || 0) >= 0 ? "text-green-600" : "text-destructive"}`}>{fmt(r.Gross_Profit_NGN)}</span>
                    </TooltipTrigger>
                    <TooltipContent>GM: {r.Gross_Margin_Pct != null ? `${Number(r.Gross_Margin_Pct).toFixed(1)}%` : "N/A"}</TooltipContent>
                  </Tooltip>
                </td>
                <td className="p-2 text-right">{fmt(r.AOV_NGN)}</td>
              </tr>
            ))}
            {paged.length === 0 && <tr><td colSpan={15} className="p-8 text-center text-muted-foreground">No data</td></tr>}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-muted/50 font-semibold border-t-2 border-border">
              <tr>
                <td colSpan={5} className="p-2">Totals</td>
                <td className="p-2 text-right">{summaryRow.items.toLocaleString()}</td>
                <td className="p-2 text-right">{fmt(summaryRow.net)}</td>
                <td className="p-2 text-right">{fmt(summaryRow.gross)}</td>
                <td className="p-2 text-right">{fmt(summaryRow.disc)}</td>
                <td className="p-2 text-right">{fmt(summaryRow.cogs)}</td>
                <td colSpan={2} />
                <td />
                <td className="p-2 text-right">{fmt(summaryRow.gp)}</td>
                <td className="p-2 text-right">{fmt(summaryRow.aov)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
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
