import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Dedicated Quote Pipeline page (route: /admin/quotes/pipeline).
// Range-scoped KPIs + detail table from two RPCs. All values are NAIRA
// (no /100). null -> "n/a" (money/pct) or "—" (customer name).

const pn = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : "₦" + Number(n).toLocaleString("en-NG"));
const pp = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `${Number(n).toFixed(1)}%`);
const pcount = (n: number | null | undefined) => (n === null || n === undefined ? "0" : String(n));
const pDateShort = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
// Date + time, e.g. "2 Jul 2026, 3:42 pm". Used for Last Viewed.
const pDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : null;

type SortType = "string" | "number" | "date" | "bool";
interface QpColumn { key: string; label: string; type: SortType; align?: "right" }
const QP_COLUMNS: QpColumn[] = [
  { key: "quote_number", label: "Quote #", type: "string" },
  { key: "customer_name", label: "Customer", type: "string" },
  { key: "total", label: "Value", type: "number", align: "right" },
  { key: "status", label: "Status", type: "string" },
  { key: "view_count", label: "Views", type: "number", align: "right" },
  { key: "last_viewed_at", label: "Last Viewed", type: "date" },
  { key: "created_at", label: "Created", type: "date" },
  { key: "is_paid", label: "Paid", type: "bool" },
];
// Comparator. Nulls ALWAYS sink to the bottom regardless of direction. Dates
// compare on the raw timestamp (never the formatted string).
const qpCompare = (a: any, b: any, key: string, type: SortType, dir: "asc" | "desc"): number => {
  const av = a?.[key]; const bv = b?.[key];
  const an = av === null || av === undefined || av === "";
  const bn = bv === null || bv === undefined || bv === "";
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  let r: number;
  if (type === "date") r = new Date(av).getTime() - new Date(bv).getTime();
  else if (type === "number" || type === "bool") r = Number(av) - Number(bv);
  else r = String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
  return dir === "asc" ? r : -r;
};

type QpKey = "today" | "yesterday" | "last7" | "last14" | "last30" | "this_month" | "last_month" | "ytd" | "custom";
const QP_RANGES: [QpKey, string][] = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7 Days"], ["last14", "Last 14 Days"],
  ["last30", "Last 30 Days"], ["this_month", "This Month"], ["last_month", "Last Month"], ["ytd", "YTD"], ["custom", "Custom"],
];
const qpIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function qpRangeFor(key: QpKey, now: Date): { start: string; end: string } | null {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const today = new Date(y, m, d);
  const addDays = (base: Date, n: number) => { const x = new Date(base); x.setDate(x.getDate() + n); return x; };
  switch (key) {
    case "today":      return { start: qpIso(today), end: qpIso(today) };
    case "yesterday":  { const yd = addDays(today, -1); return { start: qpIso(yd), end: qpIso(yd) }; }
    case "last7":      return { start: qpIso(addDays(today, -6)),  end: qpIso(today) };
    case "last14":     return { start: qpIso(addDays(today, -13)), end: qpIso(today) };
    case "last30":     return { start: qpIso(addDays(today, -29)), end: qpIso(today) };
    case "this_month": return { start: qpIso(new Date(y, m, 1)),   end: qpIso(new Date(y, m + 1, 0)) };
    case "last_month": return { start: qpIso(new Date(y, m - 1, 1)), end: qpIso(new Date(y, m, 0)) };
    case "ytd":        return { start: qpIso(new Date(y, 0, 1)),   end: qpIso(today) };
    case "custom":     return null; // resolved from applied custom dates
  }
}
const qpStatusBadge = (s: string | null | undefined) => {
  const v = (s || "").toLowerCase();
  if (v === "paid" || v === "converted") return "bg-green-100 text-green-700";
  if (v === "viewed") return "bg-blue-100 text-blue-700";
  if (v === "declined" || v === "expired") return "bg-red-100 text-red-700";
  return "bg-muted text-text-light";
};

function QpCard({ title, value, subtitle, muted, negative }: { title: string; value: string; subtitle?: string; muted?: boolean; negative?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-widest font-semibold text-text-light">{title}</div>
      <div className={`text-xl font-bold mt-1 ${muted ? "text-text-light" : negative ? "text-red-600" : "text-forest"}`}>{value}</div>
      {subtitle && <div className="text-[11px] text-text-light mt-1">{subtitle}</div>}
    </div>
  );
}

export default function QuotePipeline() {
  const [rangeKey, setRangeKey] = useState<QpKey>("last30");
  const [cStart, setCStart] = useState("");
  const [cEnd, setCEnd] = useState("");
  const [cApplied, setCApplied] = useState<{ start: string; end: string } | null>(null);
  const [cErr, setCErr] = useState("");

  const range = useMemo(() => {
    if (rangeKey === "custom") return cApplied;
    return qpRangeFor(rangeKey, new Date());
  }, [rangeKey, cApplied]);

  const { data: kpi } = useQuery({
    queryKey: ["qp-kpi", range?.start, range?.end],
    enabled: !!range,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("finance_quote_pipeline_period", { p_start: range!.start, p_end: range!.end });
      if (error) throw error;
      return (Array.isArray(data) ? data[0] : data) ?? null;
    },
    staleTime: 60_000,
  });
  const { data: rows } = useQuery({
    queryKey: ["qp-detail", range?.start, range?.end],
    enabled: !!range,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("finance_quote_pipeline_detail", { p_start: range!.start, p_end: range!.end });
      if (error) throw error;
      const list = (data || []) as any[];
      // The RPC does not return last_viewed_at; enrich each row from
      // admin_quotes_summary (joined by quote_number) so we add only that field.
      const qnums = list.map((r) => r.quote_number).filter(Boolean);
      if (qnums.length) {
        const { data: lv } = await (supabase as any)
          .from("admin_quotes_summary").select("quote_number, last_viewed_at").in("quote_number", qnums);
        const map = new Map((lv || []).map((x: any) => [x.quote_number, x.last_viewed_at]));
        for (const r of list) r.last_viewed_at = map.get(r.quote_number) ?? null;
      }
      return list;
    },
    staleTime: 60_000,
  });

  const selectRange = (k: QpKey) => {
    setCErr("");
    if (k === "custom") {
      const seed = range ?? qpRangeFor("last30", new Date())!;
      setCStart(seed.start); setCEnd(seed.end); setCApplied({ start: seed.start, end: seed.end });
    }
    setRangeKey(k);
  };
  const applyCustom = () => {
    if (!cStart || !cEnd) { setCErr("Pick both a start and end date."); return; }
    if (cStart > cEnd) { setCErr("Start date must be on or before end date."); return; }
    setCErr("");
    setCApplied({ start: cStart, end: cEnd });
  };

  // Client-side sorting (all rows are fetched at once). Default: created_at desc.
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const handleSort = (c: QpColumn) => {
    if (sortKey === c.key) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(c.key);
    setSortDir(c.type === "string" ? "asc" : "desc"); // dates/numbers/bools default desc, text asc
  };
  const detail = useMemo(() => {
    const type = (QP_COLUMNS.find((c) => c.key === sortKey)?.type) ?? "string";
    return [...(rows || [])].sort((a, b) => qpCompare(a, b, sortKey, type, sortDir));
  }, [rows, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-2">
        <Link to="/admin/quotes" className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="pf text-2xl font-bold">Quote Pipeline</h1>
      </div>

      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-1.5">
        {QP_RANGES.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => selectRange(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${rangeKey === k ? "bg-forest text-primary-foreground border-forest" : "border-border text-text-med hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {rangeKey === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-text-light">Start</span>
            <input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} className="border border-border rounded-lg px-2 py-1 text-xs bg-card focus:outline-none focus:ring-2 focus:ring-forest/30" />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-text-light">End</span>
            <input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} className="border border-border rounded-lg px-2 py-1 text-xs bg-card focus:outline-none focus:ring-2 focus:ring-forest/30" />
          </label>
          <button type="button" onClick={applyCustom} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-forest text-primary-foreground hover:bg-forest-deep">Apply</button>
          {cErr && <span className="text-[11px] text-red-600 self-center">{cErr}</span>}
        </div>
      )}

      {/* Main KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <QpCard title="Open Pipeline (Live)" value={pn(kpi?.open_pipeline_value)} subtitle={`${pcount(kpi?.open_pipeline_count)} live quotes`} />
        <QpCard title="Viewed (Live)" value={pn(kpi?.viewed_live_value)} subtitle={`${pcount(kpi?.viewed_live_count)} quotes`} />
        <QpCard title="Weighted Pipeline" value={pn(kpi?.weighted_pipeline_value)} subtitle="Stage-weighted expected value" />
        <QpCard title="At Historical Rate" value={pn(kpi?.weighted_at_historical_rate)} subtitle={`At ${pp(kpi?.conversion_rate_pct)}`} />
        <QpCard title="Converted" value={pn(kpi?.converted_value)} subtitle={`${pcount(kpi?.converted_count)} orders created`} />
        <QpCard title="Paid" value={pn(kpi?.paid_value)} subtitle={`${pcount(kpi?.paid_count)} paid`} />
        <QpCard title="Conversion Rate" value={pp(kpi?.conversion_rate_pct)} negative={Number(kpi?.conversion_rate_pct) < 10} subtitle={`${pcount(kpi?.paid_count)} of ${pcount(kpi?.total_quotes)} paid`} />
      </div>

      {/* Muted row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <QpCard title="Draft (Live)" value={pn(kpi?.draft_live_value)} subtitle={`${pcount(kpi?.draft_live_count)} quotes`} muted />
        <QpCard title="Dead (expired + declined)" value={pn(kpi?.dead_value)} subtitle={`${pcount(kpi?.dead_count)} quotes`} muted />
      </div>

      {/* Detail table */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b border-border text-left text-text-light text-xs uppercase tracking-wide">
              {QP_COLUMNS.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th key={c.key} onClick={() => handleSort(c)}
                    className={`px-4 py-3 font-semibold cursor-pointer select-none hover:text-text-med ${c.align === "right" ? "text-right" : ""}`}>
                    <span className={`inline-flex items-center gap-1 ${c.align === "right" ? "justify-end" : ""} ${active ? "text-forest" : ""}`}>
                      {c.label}<span className="text-[9px]">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {detail.length === 0 ? (
              <tr><td colSpan={QP_COLUMNS.length} className="px-4 py-8 text-center text-text-light">No quotes created in this period.</td></tr>
            ) : detail.map((r: any, i: number) => (
              <tr key={r.quote_number || i} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-4 py-3 font-semibold whitespace-nowrap">{r.quote_number}</td>
                <td className="px-4 py-3 break-words">{r.customer_name || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{pn(r.total)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${qpStatusBadge(r.status)}`}>{r.status || "—"}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{pcount(r.view_count)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-text-med">
                  {pDateTime(r.last_viewed_at) ?? <span className="text-text-light">Not viewed yet</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-text-med">{pDateShort(r.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_paid ? "bg-green-100 text-green-700" : "bg-muted text-text-light"}`}>{r.is_paid ? "Yes" : "No"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
