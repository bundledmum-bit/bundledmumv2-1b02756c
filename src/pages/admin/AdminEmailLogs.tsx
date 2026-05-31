import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Search, X, ExternalLink } from "lucide-react";

// ---------------------------------------------------------------------------
// Email Logs — read-only listing of every row inserted into email_send_log.
// Joins to orders.order_number and email_templates.name so the table reads
// the friendly labels instead of opaque slugs / UUIDs.
// ---------------------------------------------------------------------------

interface EmailLogRow {
  id: string;
  template_slug: string | null;
  recipient_email: string | null;
  subject: string | null;
  status: string | null;
  send_to_type: string | null;
  resend_email_id: string | null;
  order_id: string | null;
  return_id: string | null;
  error_message: string | null;
  created_at: string;
  // Joined columns — Supabase nests these as objects when the FK is set.
  order: { order_number: string | null } | null;
  template: { name: string | null } | null;
}

const PAGE_SIZE = 25;

type TypeFilter = "all" | "customer" | "admin" | "test";
type StatusFilter = "all" | "sent" | "failed";
type DateFilter = "24h" | "7d" | "30d" | "all";

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  customer: { label: "Customer", cls: "bg-emerald-100 text-emerald-800" },
  admin:    { label: "Internal/Admin", cls: "bg-blue-100 text-blue-800" },
  test:     { label: "Test", cls: "bg-muted text-text-med" },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  sent:   { label: "Sent",   cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-800" },
};

function dateFloor(filter: DateFilter): string | null {
  if (filter === "all") return null;
  const now = Date.now();
  const ms =
    filter === "24h" ? 24 * 60 * 60 * 1000 :
    filter === "7d"  ? 7 * 24 * 60 * 60 * 1000 :
                       30 * 24 * 60 * 60 * 1000;
  return new Date(now - ms).toISOString();
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-NG", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export default function AdminEmailLogs() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("customer");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("7d");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Distinct template slugs for the dropdown — pulled from email_templates
  // directly so the filter still shows every template option even if no
  // row in the current filtered window uses it.
  const templatesQuery = useQuery({
    queryKey: ["admin-email-logs-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("email_templates")
        .select("slug, name")
        .order("name");
      if (error) throw error;
      return (data || []) as Array<{ slug: string; name: string | null }>;
    },
    staleTime: 5 * 60_000,
  });

  const logsQuery = useQuery({
    queryKey: ["admin-email-logs", { typeFilter, statusFilter, templateFilter, dateFilter, search, page }],
    queryFn: async () => {
      let q = (supabase as any)
        .from("email_send_log")
        .select(
          "id, template_slug, recipient_email, subject, status, send_to_type, " +
          "resend_email_id, order_id, return_id, error_message, created_at, " +
          "order:orders(order_number), template:email_templates(name)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false });

      if (typeFilter !== "all")   q = q.eq("send_to_type", typeFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (templateFilter !== "all") q = q.eq("template_slug", templateFilter);

      const floor = dateFloor(dateFilter);
      if (floor) q = q.gte("created_at", floor);

      const term = search.trim();
      if (term) q = q.ilike("recipient_email", `%${term}%`);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return {
        rows: (data || []) as EmailLogRow[],
        total: count || 0,
      };
    },
    staleTime: 30_000,
  });

  const rows = logsQuery.data?.rows || [];
  const total = logsQuery.data?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);

  const selected = useMemo(
    () => rows.find(r => r.id === selectedId) || null,
    [rows, selectedId],
  );

  const resetFilters = () => {
    setTypeFilter("customer");
    setStatusFilter("all");
    setTemplateFilter("all");
    setDateFilter("7d");
    setSearch("");
    setPage(0);
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Mail className="w-5 h-5" /> Email Logs
          </h1>
          <p className="text-xs text-text-med mt-0.5">
            Every email Resend has sent on our behalf — customer notifications, admin
            internal alerts, and test sends.
          </p>
        </div>
        <button
          onClick={resetFilters}
          className="text-xs text-text-med hover:text-foreground border border-border rounded-md px-2 py-1"
        >
          Reset filters
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-3 grid md:grid-cols-5 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Type</label>
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value as TypeFilter); setPage(0); }}
            className="w-full border border-input rounded-lg px-2 py-1.5 text-sm bg-background">
            <option value="all">All</option>
            <option value="customer">Customer</option>
            <option value="admin">Internal/Admin</option>
            <option value="test">Test</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Status</label>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as StatusFilter); setPage(0); }}
            className="w-full border border-input rounded-lg px-2 py-1.5 text-sm bg-background">
            <option value="all">All</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Template</label>
          <select value={templateFilter} onChange={e => { setTemplateFilter(e.target.value); setPage(0); }}
            className="w-full border border-input rounded-lg px-2 py-1.5 text-sm bg-background">
            <option value="all">All templates</option>
            {(templatesQuery.data || []).map(t => (
              <option key={t.slug} value={t.slug}>{t.name || t.slug}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Date range</label>
          <select value={dateFilter} onChange={e => { setDateFilter(e.target.value as DateFilter); setPage(0); }}
            className="w-full border border-input rounded-lg px-2 py-1.5 text-sm bg-background">
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Recipient search</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="email contains…"
              className="w-full border border-input rounded-lg pl-7 pr-2 py-1.5 text-sm bg-background"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-widest font-semibold text-text-med sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2">Sent at</th>
                <th className="text-left px-3 py-2">Recipient</th>
                <th className="text-left px-3 py-2">Template</th>
                <th className="text-left px-3 py-2">Subject</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Order</th>
              </tr>
            </thead>
            <tbody>
              {logsQuery.isLoading ? (
                <tr><td colSpan={7} className="text-center text-xs text-text-med py-8">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-xs text-text-med py-8">No email logs match the current filters.</td></tr>
              ) : (
                rows.map(r => {
                  const typeMeta = TYPE_BADGE[r.send_to_type || ""] || { label: r.send_to_type || "—", cls: "bg-muted text-text-med" };
                  const statusMeta = STATUS_BADGE[r.status || ""] || { label: r.status || "—", cls: "bg-muted text-text-med" };
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-border hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fmtDate(r.created_at)}</td>
                      <td className="px-3 py-2 truncate max-w-[180px]" title={r.recipient_email || ""}>
                        {r.recipient_email || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-text-med">
                        {r.template?.name || r.template_slug || "—"}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[260px]" title={r.subject || ""}>
                        {truncate(r.subject, 50)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${typeMeta.cls}`}>{typeMeta.label}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${statusMeta.cls}`}>{statusMeta.label}</span>
                      </td>
                      <td className="px-3 py-2">
                        {r.order?.order_number ? (
                          <Link
                            to={`/admin/orders?q=${r.order.order_number}`}
                            onClick={e => e.stopPropagation()}
                            className="text-forest text-xs font-semibold hover:underline inline-flex items-center gap-1"
                          >
                            {r.order.order_number} <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="border-t border-border px-3 py-2 flex items-center justify-between text-xs text-text-med">
          <span>{total.toLocaleString()} total · page {pageSafe + 1} of {pageCount}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={pageSafe === 0}
              className="border border-border rounded-md px-2 py-1 disabled:opacity-40"
            >Prev</button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={pageSafe >= pageCount - 1}
              className="border border-border rounded-md px-2 py-1 disabled:opacity-40"
            >Next</button>
          </div>
        </div>
      </div>

      {selected && (
        <EmailLogDetail row={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function EmailLogDetail({ row, onClose }: { row: EmailLogRow; onClose: () => void }) {
  const typeMeta = TYPE_BADGE[row.send_to_type || ""] || { label: row.send_to_type || "—", cls: "bg-muted text-text-med" };
  const statusMeta = STATUS_BADGE[row.status || ""] || { label: row.status || "—", cls: "bg-muted text-text-med" };
  return (
    <div className="fixed inset-0 z-50 bg-foreground/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <header className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-sm">Email log</h2>
            <p className="text-[10px] text-text-light">{fmtDate(row.created_at)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-5 space-y-3 text-xs">
          <Row k="Status" v={<span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${statusMeta.cls}`}>{statusMeta.label}</span>} />
          <Row k="Type"   v={<span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${typeMeta.cls}`}>{typeMeta.label}</span>} />
          <Row k="Recipient" v={row.recipient_email || "—"} />
          <Row k="Template" v={row.template?.name ? `${row.template.name} (${row.template_slug})` : row.template_slug || "—"} />
          <Row k="Subject" v={row.subject || "—"} />
          <Row k="Resend ID" v={row.resend_email_id ? <code className="font-mono">{row.resend_email_id}</code> : "—"} />
          <Row k="Order" v={
            row.order?.order_number ? (
              <Link to={`/admin/orders?q=${row.order.order_number}`} className="text-forest font-semibold hover:underline inline-flex items-center gap-1">
                {row.order.order_number} <ExternalLink className="w-3 h-3" />
              </Link>
            ) : "—"
          } />
          <Row k="Return" v={
            row.return_id ? (
              <Link to={`/admin/returns?id=${row.return_id}`} className="text-forest font-semibold hover:underline inline-flex items-center gap-1">
                Open return <ExternalLink className="w-3 h-3" />
              </Link>
            ) : "—"
          } />
          {row.status === "failed" && row.error_message && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest font-semibold text-red-700 mb-1">Error</div>
              <pre className="whitespace-pre-wrap text-red-900 text-[11px] font-mono">{row.error_message}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="text-text-light w-24 shrink-0">{k}</dt>
      <dd className="flex-1 min-w-0 break-words">{v}</dd>
    </div>
  );
}
