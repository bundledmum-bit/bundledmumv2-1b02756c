import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Download, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmt = (n: number) => `₦${(n || 0).toLocaleString()}`;
const CHANNEL_COLORS: Record<string, string> = {
  "Paid Social": "bg-blue-100 text-blue-700", "Paid Search": "bg-green-100 text-green-700",
  "Direct": "bg-gray-100 text-gray-700", "Organic Search": "bg-teal-100 text-teal-700",
  "Email/SMS": "bg-purple-100 text-purple-700", "Affiliate": "bg-orange-100 text-orange-700",
  "Influencer": "bg-pink-100 text-pink-700", "Social": "bg-indigo-100 text-indigo-700",
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

export default function OrderLinesReportTab() {
  const [datePreset, setDatePreset] = useState("Last 30 Days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [channelFilter, setChannelFilter] = useState("All");
  const [nrFilter, setNrFilter] = useState("All");
  const [payStatusFilter, setPayStatusFilter] = useState("All");
  const [orderStatusFilter, setOrderStatusFilter] = useState("All");
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
    queryKey: ["order-lines-report"],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_lines_report").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const dateFiltered = useMemo(() => {
    if (!rawData) return [];
    return rawData.filter((r: any) => { const d = new Date(r.Order_Date); return d >= dateRange.from && d <= dateRange.to; });
  }, [rawData, dateRange]);

  const prevData = useMemo(() => {
    if (!rawData) return [];
    return rawData.filter((r: any) => { const d = new Date(r.Order_Date); return d >= prevRange.from && d <= prevRange.to; });
  }, [rawData, prevRange]);

  const filtered = useMemo(() => {
    let d = dateFiltered;
    if (categoryFilter !== "All") d = d.filter((r: any) => r.Category === categoryFilter);
    if (channelFilter !== "All") d = d.filter((r: any) => r.Attributed_Channel === channelFilter);
    if (nrFilter !== "All") d = d.filter((r: any) => r.New_vs_Returning === nrFilter);
    if (payStatusFilter !== "All") d = d.filter((r: any) => (r.Payment_Status || "").toLowerCase() === payStatusFilter.toLowerCase());
    if (orderStatusFilter !== "All") d = d.filter((r: any) => (r.Order_Status || "").toLowerCase() === orderStatusFilter.toLowerCase());
    if (search) {
      const s = search.toLowerCase();
      d = d.filter((r: any) => (r.Order_ID || "").toLowerCase().includes(s) || (r.Customer_ID || "").toLowerCase().includes(s) || (r.SKU || "").toLowerCase().includes(s));
    }
    return d;
  }, [dateFiltered, categoryFilter, channelFilter, nrFilter, payStatusFilter, orderStatusFilter, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "number" ? (av||0) - (bv||0) : String(av||"").localeCompare(String(bv||""));
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortAsc]);

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const stats = useMemo(() => {
    const d = filtered;
    const totalGross = d.reduce((s: number, r: any) => s + (r.Gross_Sales_NGN || 0), 0);
    const totalNet = d.reduce((s: number, r: any) => s + (r.Net_Sales_NGN || 0), 0);
    const totalDisc = d.reduce((s: number, r: any) => s + (r.Discount_NGN || 0), 0);
    const totalReturns = d.reduce((s: number, r: any) => s + (r.Returns_NGN || 0), 0);
    const totalCogs = d.reduce((s: number, r: any) => s + (r.COGS_Net_NGN || 0), 0);
    const gp = totalNet - totalCogs;
    const totalUnits = d.reduce((s: number, r: any) => s + (r.Qty || 0), 0);
    const avgUnit = totalUnits > 0 ? Math.round(totalGross / totalUnits) : 0;
    const gm = totalNet > 0 ? ((gp / totalNet) * 100).toFixed(1) : "0.0";
    return { totalGross, totalNet, totalDisc, totalReturns, totalCogs, gp, totalUnits, avgUnit, gm };
  }, [filtered]);

  const prevStats = useMemo(() => {
    const d = prevData;
    const totalNet = d.reduce((s: number, r: any) => s + (r.Net_Sales_NGN || 0), 0);
    const totalCogs = d.reduce((s: number, r: any) => s + (r.COGS_Net_NGN || 0), 0);
    return {
      totalGross: d.reduce((s: number, r: any) => s + (r.Gross_Sales_NGN || 0), 0), totalNet,
      totalDisc: d.reduce((s: number, r: any) => s + (r.Discount_NGN || 0), 0),
      totalReturns: d.reduce((s: number, r: any) => s + (r.Returns_NGN || 0), 0), totalCogs,
      gp: totalNet - totalCogs, totalUnits: d.reduce((s: number, r: any) => s + (r.Qty || 0), 0),
      avgUnit: d.length > 0 ? Math.round(d.reduce((s: number, r: any) => s + (r.Gross_Sales_NGN || 0), 0) / Math.max(1, d.reduce((s: number, r: any) => s + (r.Qty || 0), 0))) : 0,
    };
  }, [prevData]);

  const pctChg = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 1000) / 10;

  const summaryRow = useMemo(() => ({
    qty: filtered.reduce((s: number, r: any) => s + (r.Qty || 0), 0),
    gross: filtered.reduce((s: number, r: any) => s + (r.Gross_Sales_NGN || 0), 0),
    disc: filtered.reduce((s: number, r: any) => s + (r.Discount_NGN || 0), 0),
    returns: filtered.reduce((s: number, r: any) => s + (r.Returns_NGN || 0), 0),
    net: filtered.reduce((s: number, r: any) => s + (r.Net_Sales_NGN || 0), 0),
    cogs: filtered.reduce((s: number, r: any) => s + (r.COGS_Net_NGN || 0), 0),
  }), [filtered]);

  const categories = useMemo(() => [...new Set((rawData || []).map((r: any) => r.Category).filter(Boolean))].sort(), [rawData]);
  const channels = useMemo(() => [...new Set((rawData || []).map((r: any) => r.Attributed_Channel).filter(Boolean))].sort(), [rawData]);

  const exportCSV = () => {
    const headers = ["Order ID","Order Date","Customer ID","SKU","Category","Qty","Unit Price","Gross Sales","Discount","Returns","Net Sales","Shipping Alloc","Tax","COGS Net","Attributed Channel","New vs Returning"];
    const rows = filtered.map((r: any) => [r.Order_ID,r.Order_Date,r.Customer_ID,r.SKU,r.Category,r.Qty,r.Unit_Price_NGN,r.Gross_Sales_NGN,r.Discount_NGN,r.Returns_NGN,r.Net_Sales_NGN,r.Shipping_Alloc_NGN,r.Tax_NGN,r.COGS_Net_NGN,r.Attributed_Channel,r.New_vs_Returning].join(","));
    const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "order-lines-report.csv"; a.click();
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const headers = ["Order ID","Order Date","Customer ID","SKU","Category","Qty","Unit Price (₦)","Gross Sales (₦)","Discount (₦)","Returns (₦)","Net Sales (₦)","Shipping Alloc (₦)","Tax (₦)","COGS Net (₦)","Attributed Channel","New vs Returning"];
    const rows = filtered.map((r: any) => [r.Order_ID,r.Order_Date,r.Customer_ID,r.SKU,r.Category,r.Qty,r.Unit_Price_NGN,r.Gross_Sales_NGN,r.Discount_NGN,r.Returns_NGN,r.Net_Sales_NGN,r.Shipping_Alloc_NGN,r.Tax_NGN,r.COGS_Net_NGN,r.Attributed_Channel,r.New_vs_Returning]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "Order Lines");
    XLSX.writeFile(wb, "BundledMum-Order-Lines.xlsx");
  };

  const handleSort = (key: string) => { setSortKey(key); setSortAsc(sortKey === key ? !sortAsc : false); };
  const selCls = "border border-input rounded-lg px-2 py-1 text-xs bg-background";

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

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading order lines...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        <StatCard label="Gross Sales" value={fmt(stats.totalGross)} change={pctChg(stats.totalGross, prevStats.totalGross)} />
        <StatCard label="Net Sales" value={fmt(stats.totalNet)} change={pctChg(stats.totalNet, prevStats.totalNet)} />
        <StatCard label="Discounts" value={fmt(stats.totalDisc)} sub={`${stats.totalGross ? ((stats.totalDisc/stats.totalGross)*100).toFixed(1) : 0}% of Gross`} change={pctChg(stats.totalDisc, prevStats.totalDisc)} />
        <StatCard label="Returns" value={fmt(stats.totalReturns)} sub={`${stats.totalGross ? ((stats.totalReturns/stats.totalGross)*100).toFixed(1) : 0}% of Gross`} change={pctChg(stats.totalReturns, prevStats.totalReturns)} />
        <StatCard label="COGS" value={fmt(stats.totalCogs)} change={pctChg(stats.totalCogs, prevStats.totalCogs)} />
        <StatCard label="Gross Profit" value={fmt(stats.gp)} sub={`GM: ${stats.gm}%`} change={pctChg(stats.gp, prevStats.gp)} />
        <StatCard label="Avg Unit Price" value={fmt(stats.avgUnit)} change={pctChg(stats.avgUnit, prevStats.avgUnit)} />
        <StatCard label="Units Sold" value={stats.totalUnits.toLocaleString()} change={pctChg(stats.totalUnits, prevStats.totalUnits)} />
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">Date Range</label>
          <select value={datePreset} onChange={e => setDatePreset(e.target.value)} className={selCls}>
            {DATE_PRESETS.map(p => <option key={p.label}>{p.label}</option>)}<option>Custom</option>
          </select></div>
        {datePreset === "Custom" && <>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={selCls} />
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={selCls} />
        </>}
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">Category</label>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={selCls}><option>All</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div>
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">Channel</label>
          <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} className={selCls}><option>All</option>{channels.map(c => <option key={c}>{c}</option>)}</select></div>
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">New/Returning</label>
          <select value={nrFilter} onChange={e => setNrFilter(e.target.value)} className={selCls}><option>All</option><option>New</option><option>Returning</option></select></div>
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">Pay Status</label>
          <select value={payStatusFilter} onChange={e => setPayStatusFilter(e.target.value)} className={selCls}><option>All</option><option>Paid</option><option>Pending</option><option>Refunded</option></select></div>
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">Order Status</label>
          <select value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)} className={selCls}><option>All</option><option>delivered</option><option>cancelled</option><option>returned</option></select></div>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search Order/Customer/SKU..." className={`${selCls} w-48`} />
        <div className="ml-auto flex gap-1">
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs"><Download className="w-3 h-3 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="text-xs"><Download className="w-3 h-3 mr-1" />Excel</Button>
        </div>
      </div>

      <div className="overflow-x-auto bg-card border border-border rounded-xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border bg-muted/30">
              {[
                { key: "Order_ID", label: "Order ID" }, { key: "Order_Date", label: "Order Date" },
                { key: "Customer_ID", label: "Customer ID" }, { key: "SKU", label: "SKU" },
                { key: "Category", label: "Category" }, { key: "Qty", label: "Qty" },
                { key: "Unit_Price_NGN", label: "Unit Price (₦)" }, { key: "Gross_Sales_NGN", label: "Gross Sales (₦)" },
                { key: "Discount_NGN", label: "Discount (₦)" }, { key: "Returns_NGN", label: "Returns (₦)" },
                { key: "Net_Sales_NGN", label: "Net Sales (₦)" }, { key: "Shipping_Alloc_NGN", label: "Shipping Alloc (₦)" },
                { key: "Tax_NGN", label: "Tax (₦)" }, { key: "COGS_Net_NGN", label: "COGS Net (₦)" },
                { key: "Attributed_Channel", label: "Channel" }, { key: "New_vs_Returning", label: "New/Ret" },
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
                <td className="p-2">{r.SKU}</td>
                <td className="p-2">{r.Category}</td>
                <td className="p-2 text-right">{r.Qty}</td>
                <td className="p-2 text-right">{fmt(r.Unit_Price_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Gross_Sales_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Discount_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Returns_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Net_Sales_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Shipping_Alloc_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.Tax_NGN)}</td>
                <td className="p-2 text-right">{fmt(r.COGS_Net_NGN)}</td>
                <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${CHANNEL_COLORS[r.Attributed_Channel] || "bg-gray-100 text-gray-700"}`}>{r.Attributed_Channel}</span></td>
                <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${NR_COLORS[r.New_vs_Returning] || ""}`}>{r.New_vs_Returning}</span></td>
              </tr>
            ))}
            {paged.length === 0 && <tr><td colSpan={16} className="p-8 text-center text-muted-foreground">No data</td></tr>}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-muted/50 font-semibold border-t-2 border-border">
              <tr>
                <td colSpan={5} className="p-2">Totals</td>
                <td className="p-2 text-right">{summaryRow.qty.toLocaleString()}</td>
                <td />
                <td className="p-2 text-right">{fmt(summaryRow.gross)}</td>
                <td className="p-2 text-right">{fmt(summaryRow.disc)}</td>
                <td className="p-2 text-right">{fmt(summaryRow.returns)}</td>
                <td className="p-2 text-right">{fmt(summaryRow.net)}</td>
                <td colSpan={2} />
                <td className="p-2 text-right">{fmt(summaryRow.cogs)}</td>
                <td colSpan={2} className="p-2 text-right">{fmt(summaryRow.net - summaryRow.cogs)}</td>
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
