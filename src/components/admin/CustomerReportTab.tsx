import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmt = (n: number) => `₦${(n || 0).toLocaleString()}`;
const CHANNEL_COLORS: Record<string, string> = {
  "Paid Social": "bg-blue-100 text-blue-700", "Paid Search": "bg-green-100 text-green-700",
  "Direct": "bg-gray-100 text-gray-700", "Organic Search": "bg-teal-100 text-teal-700",
  "Email/SMS": "bg-purple-100 text-purple-700", "Affiliate": "bg-orange-100 text-orange-700",
  "Influencer": "bg-pink-100 text-pink-700", "Social": "bg-indigo-100 text-indigo-700",
  "Referral": "bg-amber-100 text-amber-700",
};
const PAGE_SIZE = 25;

export default function CustomerReportTab() {
  const [channelFilter, setChannelFilter] = useState("All");
  const [deviceFilter, setDeviceFilter] = useState("All");
  const [countryFilter, setCountryFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState("Total_Spent");
  const [sortAsc, setSortAsc] = useState(false);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["customer-report"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_report").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    let d = rawData || [];
    if (channelFilter !== "All") d = d.filter((r: any) => r.Acquisition_Channel === channelFilter);
    if (deviceFilter !== "All") d = d.filter((r: any) => r.Primary_Device === deviceFilter);
    if (countryFilter !== "All") d = d.filter((r: any) => r.Primary_Country === countryFilter);
    if (dateFrom) d = d.filter((r: any) => r.First_Purchase_Date && r.First_Purchase_Date >= dateFrom);
    if (dateTo) d = d.filter((r: any) => r.First_Purchase_Date && r.First_Purchase_Date <= dateTo);
    if (search) {
      const s = search.toLowerCase();
      d = d.filter((r: any) => (r.Customer_ID || "").toLowerCase().includes(s) || (r.Email || "").toLowerCase().includes(s));
    }
    return d;
  }, [rawData, channelFilter, deviceFilter, countryFilter, dateFrom, dateTo, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "number" ? (av||0) - (bv||0) : String(av||"").localeCompare(String(bv||""));
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortAsc]);

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const channels = useMemo(() => [...new Set((rawData || []).map((r: any) => r.Acquisition_Channel).filter(Boolean))].sort(), [rawData]);
  const devices = useMemo(() => [...new Set((rawData || []).map((r: any) => r.Primary_Device).filter(Boolean))].sort(), [rawData]);
  const countries = useMemo(() => [...new Set((rawData || []).map((r: any) => r.Primary_Country).filter(Boolean))].sort(), [rawData]);

  const exportCSV = () => {
    const headers = ["Customer ID","First Purchase Date","Acquisition Channel","Primary Country","Primary Device","Total Orders","Total Spent","Last Order Date","State"];
    const rows = filtered.map((r: any) => [r.Customer_ID,r.First_Purchase_Date,r.Acquisition_Channel,r.Primary_Country,r.Primary_Device,r.Total_Orders,r.Total_Spent,r.Last_Order_Date,r.State].join(","));
    const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "customer-report.csv"; a.click();
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const headers = ["Customer ID","First Purchase Date","Acquisition Channel","Primary Country","Primary Device","Total Orders","Total Spent (₦)","Last Order Date","State"];
    const rows = filtered.map((r: any) => [r.Customer_ID,r.First_Purchase_Date,r.Acquisition_Channel,r.Primary_Country,r.Primary_Device,r.Total_Orders,r.Total_Spent,r.Last_Order_Date,r.State]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "Customer Report");
    XLSX.writeFile(wb, "BundledMum-Customer-Report.xlsx");
  };

  const handleSort = (key: string) => { setSortKey(key); setSortAsc(sortKey === key ? !sortAsc : false); };
  const selCls = "border border-input rounded-lg px-2 py-1 text-xs bg-background";

  if (isLoading) return <div className="text-center py-10 text-muted-foreground">Loading customer report...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">Channel</label>
          <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} className={selCls}><option>All</option>{channels.map(c => <option key={c}>{c}</option>)}</select></div>
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">Device</label>
          <select value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)} className={selCls}><option>All</option>{devices.map(d => <option key={d}>{d}</option>)}</select></div>
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">Country</label>
          <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} className={selCls}><option>All</option>{countries.map(c => <option key={c}>{c}</option>)}</select></div>
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">First Purchase From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={selCls} /></div>
        <div><label className="text-[10px] text-muted-foreground block mb-0.5">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={selCls} /></div>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search Customer/Email..." className={`${selCls} w-48`} />
        <div className="ml-auto flex gap-1">
          <Button variant="outline" size="sm" onClick={exportCSV} className="text-xs h-10"><Download className="w-3 h-3 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="text-xs h-10"><Download className="w-3 h-3 mr-1" />Excel</Button>
        </div>
      </div>

      <div className="overflow-x-auto bg-card border border-border rounded-xl">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="text-muted-foreground border-b border-border bg-muted/30">
              {[
                { key: "Customer_ID", label: "Customer ID" }, { key: "First_Purchase_Date", label: "First Purchase" },
                { key: "Acquisition_Channel", label: "Acquisition Channel" }, { key: "Primary_Country", label: "Country" },
                { key: "Primary_Device", label: "Device" }, { key: "Total_Orders", label: "Total Orders" },
                { key: "Total_Spent", label: "Total Spent (₦)" }, { key: "Last_Order_Date", label: "Last Order" },
                { key: "State", label: "State" },
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
                <td className="p-2 font-semibold">{r.Customer_ID}</td>
                <td className="p-2">{r.First_Purchase_Date ? new Date(r.First_Purchase_Date).toLocaleDateString("en-NG") : "—"}</td>
                <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${CHANNEL_COLORS[r.Acquisition_Channel] || "bg-gray-100 text-gray-700"}`}>{r.Acquisition_Channel || "—"}</span></td>
                <td className="p-2">{r.Primary_Country || "—"}</td>
                <td className="p-2">{r.Primary_Device || "—"}</td>
                <td className="p-2 text-right font-semibold">{r.Total_Orders}</td>
                <td className="p-2 text-right font-semibold">{fmt(r.Total_Spent)}</td>
                <td className="p-2">{r.Last_Order_Date ? new Date(r.Last_Order_Date).toLocaleDateString("en-NG") : "—"}</td>
                <td className="p-2">{r.State || "—"}</td>
              </tr>
            ))}
            {paged.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No customers found</td></tr>}
          </tbody>
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
