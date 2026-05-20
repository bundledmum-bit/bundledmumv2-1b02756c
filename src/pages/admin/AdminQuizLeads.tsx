import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Calendar, Users, Phone, ShoppingCart, TrendingUp, DollarSign, ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePermissionCheck } from "@/hooks/usePermissionCheck";
import { fmt } from "@/lib/cart";

const DATE_PRESETS = [
  { label: "Today", getValue: () => { const d = new Date(); d.setHours(0,0,0,0); return { from: d, to: new Date() }; }},
  { label: "Yesterday", getValue: () => { const d = new Date(); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); const e = new Date(d); e.setDate(e.getDate()+1); return { from: d, to: e }; }},
  { label: "This Week", getValue: () => { const d = new Date(); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); return { from: d, to: new Date() }; }},
  { label: "This Month", getValue: () => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return { from: d, to: new Date() }; }},
  { label: "All Time", getValue: () => ({ from: new Date(2024, 0, 1), to: new Date() }) },
];

// Extract a friendly hostname for the Referral cell — strips protocol and
// "www." and falls back to a 30-char truncation for URLs we can't parse.
function getHostname(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.length > 30 ? url.slice(0, 30) + "…" : url;
  }
}

// Render an ISO timestamp in Africa/Lagos local time, e.g. "20 May 2026, 14:16".
function formatLagosTimestamp(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const SHOPPER_COLORS: Record<string, string> = {
  self: "bg-blue-100 text-blue-700 border-blue-200",
  dad: "bg-orange-100 text-orange-700 border-orange-200",
  gift: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function AdminQuizLeads() {
  const { canExport } = usePermissionCheck("orders");
  const [filterPurchased, setFilterPurchased] = useState<"all" | "yes" | "no">("all");
  const [filterShopper, setFilterShopper] = useState<"all" | "self" | "dad" | "gift">("all");
  const [filterWhatsapp, setFilterWhatsapp] = useState<"all" | "yes" | "no">("all");
  const [filterBudget, setFilterBudget] = useState<"all" | string>("all");
  const [datePreset, setDatePreset] = useState("This Month");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const dateRange = useMemo(() => {
    if (datePreset === "Custom" && customFrom) {
      return { from: customFrom.toISOString(), to: (customTo || new Date()).toISOString() };
    }
    const preset = DATE_PRESETS.find(p => p.label === datePreset);
    if (!preset) return { from: new Date(0).toISOString(), to: new Date().toISOString() };
    const { from, to } = preset.getValue();
    return { from: from.toISOString(), to: to.toISOString() };
  }, [datePreset, customFrom, customTo]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["quiz-leads", dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_customers")
        .select("*")
        .gte("created_at", dateRange.from)
        .lte("created_at", dateRange.to)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Apply client-side filters
  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (filterPurchased === "yes" && !l.has_purchased) return false;
      if (filterPurchased === "no" && l.has_purchased) return false;
      if (filterShopper !== "all" && l.shopper_type !== filterShopper) return false;
      if (filterWhatsapp === "yes" && !l.whatsapp_number) return false;
      if (filterWhatsapp === "no" && l.whatsapp_number) return false;
      if (filterBudget !== "all" && l.budget_tier !== filterBudget) return false;
      return true;
    });
  }, [leads, filterPurchased, filterShopper, filterWhatsapp, filterBudget]);

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length;
    const withWhatsapp = filtered.filter(l => l.whatsapp_number).length;
    const purchased = filtered.filter(l => l.has_purchased).length;
    const conversionRate = total > 0 ? ((purchased / total) * 100).toFixed(1) : "0";
    const totalRevenue = filtered.reduce((sum, l) => sum + ((l as any).purchase_amount || 0), 0);
    return { total, withWhatsapp, purchased, conversionRate, totalRevenue };
  }, [filtered]);

  const downloadCSV = () => {
    if (!filtered.length) return;
    const headers = ["Date", "Shopper Type", "Budget", "Stage", "Hospital", "Delivery", "Gender", "WhatsApp", "Purchased", "Amount", "Order ID", "Referral Source"];
    const rows = filtered.map(l => [
      l.created_at ? new Date(l.created_at).toLocaleDateString("en-NG") : "",
      l.shopper_type || "", l.budget_tier || "", (l as any).stage || "",
      l.hospital_type || "", l.delivery_method || "", l.baby_gender || "",
      l.whatsapp_number || "", l.has_purchased ? "Yes" : "No",
      (l as any).purchase_amount || "", l.order_id || "",
      (l as any).referral_source || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "quiz-leads.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = async () => {
    if (!filtered.length) return;
    const XLSX = await import("xlsx");
    const data = filtered.map(l => ({
      "Date": l.created_at ? new Date(l.created_at).toLocaleDateString("en-NG") : "",
      "Shopper Type": l.shopper_type || "",
      "Budget": l.budget_tier || "",
      "Stage": (l as any).stage || "",
      "Hospital": l.hospital_type || "",
      "Delivery": l.delivery_method || "",
      "Gender": l.baby_gender || "",
      "WhatsApp": l.whatsapp_number || "Not provided",
      "Purchased": l.has_purchased ? "Yes" : "No",
      "Amount": (l as any).purchase_amount || "",
      "Order ID": l.order_id || "",
      "Referral Source": (l as any).referral_source || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quiz Leads");
    XLSX.writeFile(wb, "quiz-leads.xlsx");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quiz Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            People who completed the quiz — follow up with those who haven't purchased yet.
          </p>
        </div>
        {canExport && (
          <div className="flex items-center gap-2">
            <button onClick={downloadCSV} className="flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted">
              <Download className="w-3 h-3" /> CSV
            </button>
            <button onClick={downloadExcel} className="flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted">
              <Download className="w-3 h-3" /> Excel
            </button>
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Total Leads</span>
            </div>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">With WhatsApp</span>
            </div>
            <p className="text-2xl font-bold">{stats.withWhatsapp}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Purchased</span>
            </div>
            <p className="text-2xl font-bold">{stats.purchased}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Conversion</span>
            </div>
            <p className="text-2xl font-bold">{stats.conversionRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Quiz Revenue</span>
            </div>
            <p className="text-2xl font-bold">{fmt(stats.totalRevenue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Date & filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {DATE_PRESETS.map(p => (
          <button key={p.label} onClick={() => setDatePreset(p.label)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${datePreset === p.label ? "border-forest bg-forest/10 text-forest" : "border-border text-muted-foreground"}`}>
            {p.label}
          </button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("text-[11px]", datePreset === "Custom" && "border-forest bg-forest/10 text-forest")}>
              <Calendar className="w-3 h-3 mr-1" /> Custom
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent mode="range" selected={customFrom && customTo ? { from: customFrom, to: customTo } : undefined}
              onSelect={(range: any) => { setCustomFrom(range?.from); setCustomTo(range?.to); setDatePreset("Custom"); }}
              className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <select value={filterShopper} onChange={e => setFilterShopper(e.target.value as any)}
          className="border border-input rounded-lg px-3 py-1.5 text-sm bg-background">
          <option value="all">All Types</option>
          <option value="self">Self</option>
          <option value="dad">Dad</option>
          <option value="gift">Gift</option>
        </select>
        <select value={filterWhatsapp} onChange={e => setFilterWhatsapp(e.target.value as any)}
          className="border border-input rounded-lg px-3 py-1.5 text-sm bg-background">
          <option value="all">WhatsApp: All</option>
          <option value="yes">Has WhatsApp</option>
          <option value="no">No WhatsApp</option>
        </select>
        <select value={filterPurchased} onChange={e => setFilterPurchased(e.target.value as any)}
          className="border border-input rounded-lg px-3 py-1.5 text-sm bg-background">
          <option value="all">Purchase: All</option>
          <option value="yes">Purchased</option>
          <option value="no">Not Purchased</option>
        </select>
        <select value={filterBudget} onChange={e => setFilterBudget(e.target.value)}
          className="border border-input rounded-lg px-3 py-1.5 text-sm bg-background">
          <option value="all">Budget: All</option>
          <option value="starter">Starter</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="push-starter">Push Starter</option>
          <option value="push-standard">Push Standard</option>
          <option value="push-premium">Push Premium</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} leads</span>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading leads...</div>
      ) : !filtered.length ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No quiz leads found.</div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Hospital</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead style={{ width: "140px" }}>Referral</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(lead => (
                  <TableRow key={lead.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell>
                      {lead.shopper_type ? (
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize", SHOPPER_COLORS[lead.shopper_type] || "bg-muted text-muted-foreground")}>
                          {lead.shopper_type}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {lead.budget_tier ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border bg-muted capitalize">
                          {lead.budget_tier}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="capitalize text-sm">{(lead as any).stage || "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{lead.hospital_type || "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{lead.delivery_method || "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{lead.baby_gender || "—"}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {lead.whatsapp_number ? lead.whatsapp_number : <span className="text-muted-foreground italic text-xs">Not provided</span>}
                    </TableCell>
                    <TableCell>
                      {lead.has_purchased ? (
                        <Badge className="bg-green-600 text-xs">✓ Purchased</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Browsed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(lead as any).purchase_amount ? fmt((lead as any).purchase_amount) : "—"}
                    </TableCell>
                    <TableCell className="text-xs align-top" style={{ width: "140px" }}>
                      {(lead as any).referral_source ? (
                        <a
                          href={(lead as any).referral_source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-sm whitespace-nowrap"
                          title={(lead as any).referral_source}
                        >
                          {getHostname((lead as any).referral_source)}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm italic whitespace-nowrap">Direct</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap align-top">
                      {formatLagosTimestamp(lead.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
