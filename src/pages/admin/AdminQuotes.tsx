import { useMemo, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatQuoteDeliveryFee, QUOTE_DELIVERY_TBD } from "@/lib/quotes";
import { recordQuoteDownload } from "@/hooks/useQuoteShare";
import { useSiteSettings } from "@/hooks/useSupabaseData";
import {
  FileText, Plus, Search, Download, Edit2, Trash2, X, ArrowLeft, Send, Archive,
  Copy as CopyIcon, ExternalLink, ShoppingCart, XCircle, Loader2,
  Files, Workflow, Link2, AlertTriangle, Mail, RefreshCw,
} from "lucide-react";
import AdminQuoteCard from "@/components/admin/AdminQuoteCard";
import PackageItemsBuilder, { fmtN } from "@/components/admin/PackageItemsBuilder";
import { Skeleton } from "@/components/ui/skeleton";
import StateZoneLgaCityCascade from "@/components/address/StateZoneLgaCityCascade";
import SkipGiftWrapConfirmModal from "@/components/checkout/SkipGiftWrapConfirmModal";
import { computeAutoFees, AUTO_FEES_FALLBACK, type AutoFeesResult } from "@/lib/computeAutoFees";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { downloadQuotePdf, type QuoteForPdf, type ContactBlock } from "@/lib/quotePdf";
import { isValidPhone, normalizePhoneE164 } from "@/lib/phone";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

const NG_STATES = [
  "Lagos", "Abuja (FCT)", "Ogun", "Oyo", "Rivers", "Kano", "Kaduna", "Anambra",
  "Enugu", "Edo", "Delta", "Cross River", "Akwa Ibom", "Imo", "Abia", "Plateau",
  "Bayelsa", "Sokoto", "Kebbi", "Niger", "Kwara", "Osun", "Ondo", "Ekiti",
  "Borno", "Gombe", "Adamawa", "Yobe", "Bauchi", "Taraba", "Benue", "Nasarawa",
  "Jigawa", "Katsina", "Zamfara", "Kogi", "Ebonyi",
];

// Exported so the mobile AdminQuoteCard renders status badges with the
// IDENTICAL colour map as the desktop table rows.
export const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-700 border-gray-200",
  sent:      "bg-blue-100 text-blue-700 border-blue-200",
  viewed:    "bg-indigo-100 text-indigo-700 border-indigo-200",
  accepted:  "bg-amber-100 text-amber-800 border-amber-200",
  converted: "bg-green-100 text-green-700 border-green-200",
  // Paid = the order for this quote is actually paid (set by a DB trigger).
  // Solid emerald so it's unmistakably distinct from 'converted' (light green,
  // order exists but NOT yet paid).
  paid:      "bg-emerald-600 text-white border-emerald-700",
  declined:  "bg-red-100 text-red-700 border-red-200",
  expired:   "bg-orange-100 text-orange-700 border-orange-200",
  archived:  "bg-muted text-muted-foreground border-border",
};

type QuoteStatus = "all" | "draft" | "sent" | "viewed" | "accepted" | "converted" | "paid" | "declined" | "expired" | "archived";
const STATUS_TABS: QuoteStatus[] = ["all", "draft", "sent", "viewed", "accepted", "converted", "paid", "declined", "expired", "archived"];

// supabase-js wraps non-2xx edge-function responses as FunctionsHttpError
// with a generic "Edge Function returned a non-2xx status code" message.
// The actual server error body is on error.context. Extract it so users
// see a meaningful message in toasts.
async function describeFunctionError(err: any): Promise<string> {
  try {
    const ctx = err?.context;
    if (ctx && typeof ctx.clone === "function") {
      const body = await ctx.clone().json().catch(() => null);
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    }
  } catch {
    /* fall through */
  }
  return err?.message || "Unknown error";
}

const shareUrlFor = (token: string | null | undefined): string => {
  if (!token) return "";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://bundledmum.com";
  return `${origin}/quote/${token}`;
};

// Money formatting + the shared items builder now live in PackageItemsBuilder so
// the quote and landing admins stay identical. fmtN is re-exported here so
// existing importers (e.g. the mobile AdminQuoteCard) keep working unchanged.
export { fmtN };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short",
  });

const PAGE_SIZE = 20;

// site_settings.value is jsonb — strip surrounding quotes if the row stores
// the value as a JSON-encoded string.
function unwrap(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.replace(/^"|"$/g, "");
  return String(v);
}

// ───────────────────────────────────────────────────────────────────
// List view
// ───────────────────────────────────────────────────────────────────
export default function AdminQuotes() {
  const { can } = usePermissions();
  const canEdit = can("quotes", "edit");
  const canDelete = can("quotes", "delete");
  // duplicate_quote RPC enforces this server-side as well; the gate
  // here just hides the button from users who would always 403.
  const canCreate = can("quotes", "create");

  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "editor">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus>("all");
  // Modal toggles for the per-row workflow actions.
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const [convertingFor, setConvertingFor] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  // Which row's PDF is currently being generated — the image pre-load
  // can take a few seconds on large quotes, so the row's Download button
  // shows a spinner meanwhile.
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Pulls from the admin_quotes_summary view so the table cells get
  // item_count, is_expired_pending and converted_order_number without
  // a per-row roundtrip. View also re-exposes the underlying columns
  // we need for the action menu (share_token, status, etc.).
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["admin-quotes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_quotes_summary")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Bank + WhatsApp details for the PDF footer.
  const { data: contactSettings } = useQuery({
    queryKey: ["admin-quotes-contact-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["whatsapp_number", "bank_name", "bank_account_name", "bank_account_number"]);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.key] = unwrap(r.value); });
      return map;
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (quotes as any[]).filter((row: any) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return [row.quote_number, row.customer_name, row.customer_email]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q));
    });
  }, [quotes, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);
  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const deleteQuote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
      toast.success("Quote deleted");
    },
    onError: (e: any) => toast.error(e?.message || "Could not delete quote"),
  });

  // Duplicate: calls the DB-side RPC (atomic, checks permissions,
  // generates new quote_number/share_token, copies line items only,
  // resets customer/fee fields). The RPC returns a 1-row table —
  // PostgREST surfaces that as an array on `data`.
  const duplicateQuote = useMutation({
    mutationFn: async (sourceId: string) => {
      const { data, error } = await (supabase as any).rpc("duplicate_quote", {
        p_source_quote_id: sourceId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.new_quote_id) throw new Error("Duplicate succeeded but returned no id");
      return row as { new_quote_id: string; new_quote_number: string };
    },
    onSuccess: (res, sourceId) => {
      queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
      const source = (quotes as any[]).find((q: any) => q.id === sourceId);
      toast.success(
        source?.quote_number
          ? `Quote ${source.quote_number} duplicated as ${res.new_quote_number}`
          : `Quote duplicated as ${res.new_quote_number}`,
      );
      // Open the newly-created draft in the editor — same in-tree
      // navigation pattern the Edit button uses.
      setEditingId(res.new_quote_id);
      setView("editor");
    },
    onError: (e: any) => toast.error(e?.message || "Could not duplicate quote"),
  });

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      const { data, error } = await (supabase as any)
        .from("quotes")
        .select("*, quote_items(*, brands(stored_image_url, image_url))")
        .eq("id", id)
        .single();
      if (error) throw error;
      const items = (data.quote_items || [])
        .slice()
        .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));
      const pdfQuote: QuoteForPdf = {
        quote_number: data.quote_number,
        created_at: data.created_at,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        delivery_address: data.delivery_address,
        delivery_city: data.delivery_city,
        delivery_state: data.delivery_state,
        subtotal: data.subtotal || 0,
        service_fee: data.service_fee || 0,
        estimated_delivery_fee: data.estimated_delivery_fee || 0,
        total: data.total || 0,
        customer_notes: data.customer_notes,
        items: items.map((it: any) => ({
          product_name: it.product_name,
          brand_name: it.brand_name,
          size: it.size,
          color: it.color,
          quantity: it.quantity,
          unit_price: it.unit_price,
          line_total: it.line_total,
          section: it.section ?? null,
          // Only the CORS-safe Supabase Storage URL is embeddable; the
          // external image_url is CORS-blocked. Empty string = re-host
          // failed → treat as null (no thumbnail).
          image_url: (it.brands?.stored_image_url && it.brands.stored_image_url.trim() !== "")
            ? it.brands.stored_image_url
            : null,
        })),
      };
      const contact: ContactBlock = {
        whatsapp_number: contactSettings?.whatsapp_number,
        bank_name: contactSettings?.bank_name,
        bank_account_name: contactSettings?.bank_account_name,
        bank_account_number: contactSettings?.bank_account_number,
      };
      await downloadQuotePdf(pdfQuote, contact);
      // Record the admin-side download so the DB trigger advances the quote
      // (draft -> viewed) and stamps last_downloaded_at. Awaited + logged
      // (TEMP diagnostic) so the RPC result/error is visible — the prior
      // fire-and-forget swallowed any error, hiding why download_count stayed 0.
      if (data.share_token) {
        const dl = await recordQuoteDownload(data.share_token);
        console.log("[admin pdf] record_quote_download", { share_token: data.share_token, data: dl.data, error: dl.error });
      } else {
        console.warn("[admin pdf] quote has no share_token; download not recorded", { id });
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not generate PDF");
    } finally {
      setDownloadingId(null);
    }
  };

  // Page-level glue handlers passed to the mobile AdminQuoteCard. These
  // mirror the desktop row's inline copy-share / decline behaviour
  // exactly (no useMutation involved); the desktop table keeps its own
  // inline copies unchanged.
  const copyShare = async (q: any) => {
    const url = shareUrlFor(q.share_token);
    if (!url) { toast.error("No share URL yet — save the quote first."); return; }
    const ok = await copyToClipboard(url);
    toast[ok ? "success" : "error"](ok ? "Share URL copied" : "Couldn't copy — open the quote to copy manually");
  };
  const declineQuote = (q: any) => {
    if (!confirm(`Mark quote ${q.quote_number} as declined?`)) return;
    (supabase as any).from("quotes").update({ status: "declined" }).eq("id", q.id)
      .then(({ error }: { error: any }) => {
        if (error) { toast.error(error.message); return; }
        queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
        toast.success("Quote declined");
      });
  };

  if (view === "editor") {
    return (
      <QuoteEditor
        // Keying by editingId forces a clean remount when the editor
        // switches to a different quote (e.g., after Duplicate), so
        // internal useState seeds re-initialise from the new id.
        key={editingId || "new"}
        quoteId={editingId}
        onClose={() => { setView("list"); setEditingId(null); }}
        onOpenQuote={(id: string) => { setEditingId(id); /* view stays "editor" */ }}
        canEdit={canEdit}
        canCreate={canCreate}
        canDelete={canDelete}
        contactSettings={contactSettings || {}}
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="pf text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" /> Quotes
          </h1>
          <p className="text-text-med text-sm mt-1 max-w-[720px]">
            Generate branded PDF quotes for customer hospital bag lists and bulk orders.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/admin/quotes/pipeline"
            className="inline-flex items-center gap-1.5 border border-border text-text-med px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted"
          >
            <Workflow className="w-4 h-4" /> Quote Pipeline
          </Link>
          {canEdit && (
            <button
              onClick={() => { setEditingId(null); setView("editor"); }}
              className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep"
            >
              <Plus className="w-4 h-4" /> New Quote
            </button>
          )}
        </div>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quote #, name, email…"
            className="w-full border border-input rounded-lg pl-9 pr-3 py-2 text-sm bg-background"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-pill text-[11px] font-semibold border capitalize ${
                statusFilter === s
                  ? "border-forest bg-forest/10 text-forest"
                  : "border-border text-muted-foreground hover:border-forest/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground ml-auto">{filtered.length} quote{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {isLoading ? (
        <>
          <div className="hidden md:block text-center py-12 text-text-med text-sm">Loading quotes…</div>
          <div className="md:hidden flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[132px] w-full rounded-lg" />)}
          </div>
        </>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl text-text-med text-sm">
          {(quotes as any[]).length === 0
            ? `No quotes yet. ${canEdit ? "Click + New Quote to draft your first one." : ""}`
            : "No quotes match your filters."}
        </div>
      ) : (
        <>
        {/* Desktop (md+) — table + pager, unchanged. */}
        <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-text-med">Quote #</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-med">Customer</th>
                  <th className="text-center px-4 py-3 font-semibold text-text-med w-16">Items</th>
                  <th className="text-right px-4 py-3 font-semibold text-text-med">Total</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-med">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-med whitespace-nowrap">Created</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-med whitespace-nowrap">Expires</th>
                  <th className="text-right px-4 py-3 font-semibold text-text-med">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((q: any) => {
                  const expired = q.is_expired_pending === true;
                  const isFinal = q.status === "converted" || q.status === "declined";
                  const canDecline = canEdit && !isFinal;
                  const onCopyShare = async () => {
                    const url = shareUrlFor(q.share_token);
                    if (!url) { toast.error("No share URL yet — save the quote first."); return; }
                    const ok = await copyToClipboard(url);
                    toast[ok ? "success" : "error"](ok ? "Share URL copied" : "Couldn't copy — open the quote to copy manually");
                  };
                  return (
                    <tr key={q.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">
                        <button
                          onClick={() => { setEditingId(q.id); setView("editor"); }}
                          className="hover:underline text-left"
                        >
                          {q.quote_number}
                        </button>
                        {q.converted_order_number && (
                          <div className="text-[10px] text-green-700 font-semibold mt-0.5">→ {q.converted_order_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-sm">{q.customer_name || "—"}</div>
                        {q.customer_email && <div className="text-[11px] text-text-med">{q.customer_email}</div>}
                      </td>
                      <td className="px-4 py-3 text-center text-text-med text-xs">{q.item_count ?? 0}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtN(q.total)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_COLORS[q.status] || STATUS_COLORS.draft}`}>
                          {q.status || "draft"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-med whitespace-nowrap">{fmtDate(q.created_at)}</td>
                      <td className={`px-4 py-3 text-xs whitespace-nowrap ${expired ? "text-destructive font-semibold" : "text-text-med"}`}>
                        {q.expires_at ? fmtDate(q.expires_at) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-0.5 flex-wrap">
                          <button onClick={onCopyShare} className="p-1.5 rounded hover:bg-muted" title="Copy share URL">
                            <CopyIcon className="w-3.5 h-3.5" />
                          </button>
                          {q.share_token && (
                            <a
                              href={shareUrlFor(q.share_token)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded hover:bg-muted inline-flex"
                              title="Open customer view (Cmd/Ctrl+P to save PDF)"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleDownload(q.id)}
                            disabled={downloadingId === q.id}
                            className="p-1.5 rounded hover:bg-muted disabled:opacity-40"
                            title="Download PDF (admin template)"
                          >
                            {downloadingId === q.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {canEdit && q.customer_email && !isFinal && (
                            <button
                              onClick={() => setSendingFor(q.id)}
                              className="p-1.5 rounded hover:bg-muted text-blue-600"
                              title="Send to customer"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEdit && !isFinal && (
                            <button
                              onClick={() => setConvertingFor(q.id)}
                              className="p-1.5 rounded hover:bg-muted text-green-700"
                              title="Place order for customer"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDecline && (
                            <button
                              onClick={() => {
                                if (!confirm(`Mark quote ${q.quote_number} as declined?`)) return;
                                (supabase as any).from("quotes").update({ status: "declined" }).eq("id", q.id)
                                  .then(({ error }: { error: any }) => {
                                    if (error) { toast.error(error.message); return; }
                                    queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
                                    toast.success("Quote declined");
                                  });
                              }}
                              className="p-1.5 rounded hover:bg-muted text-orange-700"
                              title="Mark as declined"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => { setEditingId(q.id); setView("editor"); }}
                            className="p-1.5 rounded hover:bg-muted"
                            title={canEdit ? "Edit" : "View"}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {canCreate && (
                            <button
                              onClick={() => duplicateQuote.mutate(q.id)}
                              disabled={duplicateQuote.isPending}
                              className="p-1.5 rounded hover:bg-muted disabled:opacity-40"
                              title="Duplicate (creates a fresh draft with the same line items)"
                            >
                              {duplicateQuote.isPending && duplicateQuote.variables === q.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Files className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                          {canDelete && q.status === "draft" && (
                            <button
                              onClick={() => {
                                if (confirm(`Delete quote ${q.quote_number}? This cannot be undone.`)) {
                                  deleteQuote.mutate(q.id);
                                }
                              }}
                              className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                              title="Delete (drafts only)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20 text-xs">
              <span className="text-text-med">Page {pageSafe + 1} of {pageCount}</span>
              <div className="flex gap-1">
                <button
                  disabled={pageSafe === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted"
                >
                  Prev
                </button>
                <button
                  disabled={pageSafe >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="px-3 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile (<md) — card list. Consumes the SAME `filtered` array
            as the table (full filtered set; the desktop pager stays
            desktop-only). No separate fetch / filter. */}
        <div className="md:hidden flex flex-col gap-3">
          {filtered.map((q: any) => (
            <AdminQuoteCard
              key={q.id}
              quote={q}
              shareUrl={shareUrlFor(q.share_token)}
              canEdit={canEdit}
              canCreate={canCreate}
              canDelete={canDelete}
              isDownloading={downloadingId === q.id}
              isDuplicating={duplicateQuote.isPending && duplicateQuote.variables === q.id}
              onOpen={(qq) => { setEditingId(qq.id); setView("editor"); }}
              onCopyShare={copyShare}
              onDownload={(qq) => handleDownload(qq.id)}
              onSend={(qq) => setSendingFor(qq.id)}
              onConvert={(qq) => setConvertingFor(qq.id)}
              onDecline={declineQuote}
              onDuplicate={(qq) => duplicateQuote.mutate(qq.id)}
              onDelete={(qq) => { if (confirm(`Delete quote ${qq.quote_number}? This cannot be undone.`)) deleteQuote.mutate(qq.id); }}
            />
          ))}
        </div>
        </>
      )}

      {/* Workflow modals — Send to Customer + Place Order for Customer.
          Both call edge functions; success invalidates the list query
          so the row's new status (sent / converted) appears immediately. */}
      {sendingFor && (
        <SendQuoteDialog
          quoteId={sendingFor}
          defaultEmail={(quotes as any[]).find((q) => q.id === sendingFor)?.customer_email || ""}
          onClose={() => setSendingFor(null)}
          onSent={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
          }}
        />
      )}
      {convertingFor && (
        <ConvertQuoteDialog
          quote={(quotes as any[]).find((q) => q.id === convertingFor)}
          onClose={() => setConvertingFor(null)}
          onConverted={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Editor (full-page; mounts in place of the list)
// ───────────────────────────────────────────────────────────────────
interface QuoteForm {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  service_fee: string;
  estimated_delivery_fee: string;
  delivery_fee_override: string;
  discount_amount: string;
  discount_reason: string;
  bypass_spend_threshold: boolean;
  bypass_delivery_threshold: boolean;
  expires_at: string;
  internal_notes: string;
  customer_notes: string;
  status: "draft" | "sent" | "viewed" | "accepted" | "converted" | "declined" | "expired" | "archived";
}

const BLANK_FORM: QuoteForm = {
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  delivery_address: "",
  delivery_city: "",
  delivery_state: "",
  service_fee: "500",
  estimated_delivery_fee: "0",
  delivery_fee_override: "",
  discount_amount: "0",
  discount_reason: "",
  bypass_spend_threshold: false,
  bypass_delivery_threshold: false,
  expires_at: "",
  internal_notes: "",
  customer_notes: "",
  status: "draft",
};

// Profit & Discount Room — internal cost/margin panel for the quote detail.
// Cost data NEVER reaches the wire for unauthorized roles: the only source is
// the SECURITY DEFINER get_quote_profit RPC, which returns { authorized: false }
// for anyone other than super_admin / admin. The frontend role check below just
// skips the call + hides the panel for those roles.
function QuoteProfitPanel({ quoteId, role, liveTotal }: { quoteId: string | null; role?: string | null; liveTotal: number }) {
  const r = String(role || "").trim().toLowerCase();
  const isAdminRole = r === "super_admin" || r === "admin";

  const queryClient = useQueryClient();
  // Klump BNPL commission (rate + on/off) from site_settings, never hardcoded.
  const { data: settings } = useSiteSettings();
  const { data } = useQuery({
    queryKey: ["quote-profit", quoteId],
    enabled: !!quoteId && isAdminRole,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_quote_profit", { p_quote_id: quoteId });
      if (error) { console.warn("get_quote_profit error:", error.message); return null; }
      return data as any;
    },
    staleTime: 30_000,
  });

  // Editable "Other Cost" — seeded from the server payload (initial load and
  // after each save). Profit numbers themselves are never computed here; the
  // set_quote_other_cost RPC returns the recalculated payload, which we push
  // into the query cache so net profit / margin / discount room update live.
  const [otherCostInput, setOtherCostInput] = useState("");
  const [otherNoteInput, setOtherNoteInput] = useState("");
  const [savingOther, setSavingOther] = useState(false);
  const [savedOther, setSavedOther] = useState(false);
  const [otherErr, setOtherErr] = useState<string | null>(null);
  useEffect(() => {
    if (data?.found) {
      setOtherCostInput(data.other_cost != null ? String(data.other_cost) : "0");
      setOtherNoteInput(data.other_cost_note || "");
    }
  }, [data?.found, data?.other_cost, data?.other_cost_note]);

  const saveOtherCost = async () => {
    setOtherErr(null);
    const raw = otherCostInput.trim();
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      setOtherErr("Enter a whole, non-negative amount.");
      return;
    }
    setSavingOther(true);
    try {
      const { data: payload, error } = await (supabase as any).rpc("set_quote_other_cost", {
        p_quote_id: quoteId,
        p_other_cost: n,
        p_other_cost_note: otherNoteInput.trim() || null,
      });
      if (error || !payload || payload.authorized !== true) {
        setOtherErr(error?.message || "Couldn't save — not authorized.");
        return;
      }
      // One round trip: feed the recalculated payload back into the cache.
      queryClient.setQueryData(["quote-profit", quoteId], payload);
      setSavedOther(true);
    } catch (e: any) {
      setOtherErr(e?.message || "Save failed.");
    } finally {
      setSavingOther(false);
    }
  };

  // Null / unauthorized / not-found → render nothing (covers custom & fulfilment).
  if (!data || data.authorized !== true || data.found !== true) return null;

  const netPositive = Number(data.net_profit) > 0;
  const missingCost = (Number(data.total_items) || 0) - (Number(data.items_costed) || 0);

  // Klump BNPL commission preview. Rate + on/off from site_settings (default 3%
  // if missing/invalid). Computed off the LIVE (possibly discounted) quote total
  // so it tracks the discount input as the admin edits it. Informational only —
  // changes nothing stored and does not touch the quote total.
  const klumpCommissionEnabled =
    settings?.klump_commission_enabled === true ||
    settings?.klump_commission_enabled === "true" ||
    settings?.klump_commission_enabled === "1";
  const klumpPctRaw = Number(settings?.klump_commission_percent);
  const klumpPercent = Number.isFinite(klumpPctRaw) && klumpPctRaw > 0 ? klumpPctRaw : 3;
  const klumpCommission = Math.round((Number(liveTotal) || 0) * klumpPercent / 100);
  const klumpNetProfit = Number(data.net_profit) - klumpCommission;
  const klumpNetPositive = klumpNetProfit > 0;

  // Klump-adjusted discount ceiling. netProfit0 / total0 are the ZERO-discount
  // figures, both from the RPC (same basis as the existing ceiling): the RPC's
  // net reduces one-to-one with discount, so netProfit0 = net_profit +
  // discount_amount, and total0 is the customer total before any discount
  // (subtotal + service + delivery + gift wrap). Solving for D in
  //   (netProfit0 - D) - p*(total0 - D) = 0
  // gives D_klump = (netProfit0 - p*total0) / (1 - p); the (1 - p) denominator
  // accounts for the commission shrinking as the discount grows. Recomputes
  // whenever the RPC figures do, exactly like the existing ceiling.
  const klumpP = klumpPercent / 100;
  const netProfit0 = Number(data.net_profit) + Number(data.discount_amount);
  const total0 =
    Number(data.product_revenue) + Number(data.service_fee) +
    Number(data.delivery_fee) + Number(data.gift_wrap_fee);
  const klumpDiscountCeiling = klumpP < 1
    ? Math.round((netProfit0 - klumpP * total0) / (1 - klumpP))
    : 0;
  const klumpNoDiscountRoom = klumpDiscountCeiling < 0;

  return (
    <section className="bg-muted/20 border-2 border-dashed border-text-light/40 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h2 className="text-sm font-bold">Profit &amp; Discount Room</h2>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-light bg-card border border-border rounded-pill px-2 py-0.5">🔒 Internal — admin only</span>
      </div>
      <dl className="grid grid-cols-1 gap-1.5 text-sm">
        <ProfitRow k="Product Revenue" v={fmtN(data.product_revenue)} />
        <ProfitRow k="Cost (COGS)" v={fmtN(data.cogs)} />
        <ProfitRow k="Service Fee" v={fmtN(data.service_fee)} />
        <ProfitRow k="Discount Applied" v={fmtN(data.discount_amount)} />
        {Number(data.other_cost) > 0 && (
          <div>
            <ProfitRow k="Other Cost" v={`−${fmtN(data.other_cost)}`} />
            {data.other_cost_note && <p className="text-[11px] text-text-light">{data.other_cost_note}</p>}
          </div>
        )}
        <ProfitRow k="Gross Profit" v={fmtN(data.gross_profit)} />
        <div className="flex items-center justify-between pt-1.5 border-t border-border">
          <dt className="font-bold">Net Profit</dt>
          <dd className={`font-bold tabular-nums ${netPositive ? "text-emerald-700" : "text-red-600"}`}>{fmtN(data.net_profit)}</dd>
        </div>
        <ProfitRow k="Margin" v={`${Number(data.margin_pct).toFixed(1)}%`} />
      </dl>

      {/* Klump BNPL commission preview — informational only, shown when the
          Klump commission is enabled. Recomputes with the live discounted
          total so the admin can weigh it before setting a discount. */}
      {klumpCommissionEnabled && (Number(liveTotal) || 0) > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-amber-300 bg-amber-50/50 -mx-4 px-4 py-2">
          <div className="flex items-center justify-between text-sm gap-2">
            <span className="text-amber-800">If paid with Klump</span>
            <span className="tabular-nums text-amber-800 font-semibold text-right">
              minus {klumpPercent}% commission = minus {fmtN(klumpCommission)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm gap-2 mt-1.5 pt-1.5 border-t border-amber-200">
            <span className="font-bold">Projected net profit if paid via Klump</span>
            <span className={`font-bold tabular-nums ${klumpNetPositive ? "text-emerald-700" : "text-red-600"}`}>{fmtN(klumpNetProfit)}</span>
          </div>
          <p className="text-[10px] text-amber-700/80 mt-1">Applies only if the customer pays with Klump. Does not change the quote total.</p>
        </div>
      )}

      {/* Editable Other Cost — saved via the role-gated set_quote_other_cost
          RPC, which returns the recalculated payload (no direct table write). */}
      <div className="mt-3 pt-3 border-t border-border">
        <label className="text-[11px] uppercase tracking-wide font-semibold text-text-med block mb-1.5">Other cost (internal)</label>
        <div className="grid grid-cols-1 gap-2">
          <input
            type="number" min={0} step={1} inputMode="numeric" value={otherCostInput}
            onChange={(e) => { setOtherCostInput(e.target.value); setSavedOther(false); setOtherErr(null); }}
            placeholder="0"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
          <input
            type="text" maxLength={200} value={otherNoteInput}
            onChange={(e) => { setOtherNoteInput(e.target.value); setSavedOther(false); setOtherErr(null); }}
            placeholder="what is this cost for? e.g. special packaging"
            className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button" onClick={saveOtherCost} disabled={savingOther}
              className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-50"
            >
              {savingOther ? "Saving…" : "Save"}
            </button>
            {savedOther && <span className="text-[11px] text-emerald-700 font-semibold">Saved ✓</span>}
            {otherErr && <span className="text-[11px] text-red-600">{otherErr}</span>}
          </div>
        </div>
        <p className="text-[10px] text-text-light mt-1">Subtracted from net profit and the discount room.</p>
      </div>

      {Number(data.delivery_fee) > 0 && (
        <div className="mt-3 pt-2 border-t border-dashed border-border text-text-light">
          <div className="flex items-center justify-between text-sm">
            <span>Delivery (pass-through)</span>
            <span className="tabular-nums">{fmtN(data.delivery_fee)}</span>
          </div>
          <p className="text-[11px] mt-0.5">Paid to courier — not counted in profit.</p>
        </div>
      )}
      <div className="mt-3 rounded-lg bg-forest/10 border border-forest/20 px-3 py-2 text-[12px] text-forest font-semibold">
        You can discount up to {fmtN(data.max_discount_breakeven)} before this quote loses money.
      </div>
      {klumpCommissionEnabled && (
        <div className="mt-1.5 rounded-lg bg-amber-100/60 border border-amber-300 px-3 py-2 text-[12px] text-amber-800 font-semibold">
          If paid with Klump: discount up to {fmtN(Math.max(0, klumpDiscountCeiling))} before this quote loses money.
          {klumpNoDiscountRoom && (
            <span className="block font-normal text-[11px] mt-0.5">A Klump-paid customer leaves no discount room on this quote.</span>
          )}
        </div>
      )}
      {data.all_items_have_cost === false && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
          {missingCost} item{missingCost === 1 ? "" : "s"} missing cost — profit may be understated.
        </div>
      )}
    </section>
  );
}

function ProfitRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-med">{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}

// Normalise a Nigerian phone to the international digits wa.me needs
// (234XXXXXXXXXX). Handles 0803…, +234803…, 234803…, and bare 803….
function normalizeNgPhoneForWa(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits;
}

// Convert-and-pay: turns an accepted quote into a PENDING order and creates a
// Klump payment page against it, so the admin can WhatsApp the customer a link.
// The hourly reconciler marks the order paid once Klump confirms (matched by
// order_number = Klump merchant_reference). Nothing here marks the order paid.
// customerSig is a debounced signature of the quote's customer fields — when it
// changes (after autosave persists an edit) the eligibility check re-runs.
function QuotePaymentLinkCard({
  quoteId, customerName, customerPhone, customerEmail, customerSig, canConvert,
}: {
  quoteId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerSig: string;
  canConvert: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // order_id retained so the "Email payment link" button targets the NEW order,
  // not the quote id.
  const [result, setResult] = useState<{ order_id: string; order_number: string; amount: number; page_url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [emailing, setEmailing] = useState(false);
  // Retry: Klump burns a link after its first transaction attempt. When the
  // customer's attempt failed, mint a FRESH link (fresh reference) against the
  // order we already created. `attempt` marks which link supersedes the old one.
  const [regenerating, setRegenerating] = useState(false);
  const [attempt, setAttempt] = useState<number | null>(null);

  const { data: ready, isLoading, error: readyErr, refetch } = useQuery({
    queryKey: ["quote-ready-for-payment", quoteId, customerSig],
    enabled: !!quoteId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("quote_ready_for_payment", { p_quote_id: quoteId });
      if (error) throw error;
      return (data && data[0]) || null;
    },
  });

  const pageUrl = result?.page_url || null;
  const orderNumber = result?.order_number || "";
  // quote_ready_for_payment OUT params carry an out_ prefix; `ready`/`reason`
  // are unprefixed. `result` is our own state (from the edge-fn response).
  const amount = Number(result?.amount ?? ready?.out_total ?? 0) || 0;

  const waHref = (() => {
    if (!pageUrl) return null;
    const phone = normalizeNgPhoneForWa(customerPhone);
    if (!phone) return null;
    const firstName = String(customerName || "").split(" ")[0] || "there";
    const msg = `Hi ${firstName}, here is your payment link for order ${orderNumber} (${fmtN(amount)}): ${pageUrl}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  })();

  const run = async () => {
    if (!ready?.ready || busy) return;
    if (!window.confirm("This will create an order from this quote and send the customer a payment link. Continue?")) return;
    setBusy(true);
    setErr(null);
    try {
      // 1. Convert the quote → pending order. The RPC RAISES if not ready, so
      // any message here is authoritative — surface it loudly.
      const { data: conv, error: convErr } = await (supabase as any).rpc("convert_quote_to_pending_order", { p_quote_id: quoteId });
      if (convErr) {
        const m = convErr.message || "Conversion failed.";
        setErr(m);
        toast.error(`Could not convert quote: ${m}`);
        return;
      }
      // convert_quote_to_pending_order OUT params carry an out_ prefix.
      const row = (Array.isArray(conv) ? conv[0] : conv) || null;
      if (!row?.out_order_id) {
        setErr("Conversion returned no order id.");
        toast.error("Conversion returned no order id.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
      // 2. Create the Klump page against the new order.
      const { data: page, error: pageErr } = await (supabase as any).functions.invoke("klump-create-payment-page", { body: { order_id: row.out_order_id } });
      let bodyErr: string | null = null;
      const ctx = (pageErr as any)?.context;
      if (ctx && typeof ctx.clone === "function") {
        try { const b = await ctx.clone().json(); bodyErr = b?.error || null; } catch { /* ignore */ }
      }
      if (pageErr || !page?.page_url) {
        const m = bodyErr || page?.error || (pageErr as any)?.message || "Payment page creation failed.";
        // The order WAS created (irreversible). Say so clearly — the admin can
        // finish from the order detail page's Klump link card.
        setErr(`Order ${row.out_order_number} was created, but the Klump link could not be generated: ${m}. Open the order to retry.`);
        toast.error(`Klump link failed: ${m}`);
        refetch();
        return;
      }
      // page.* is the edge-function response (unchanged); row.* is the RPC OUT.
      setResult({ order_id: row.out_order_id, order_number: page.order_number || row.out_order_number, amount: Number(page.amount ?? row.out_total) || 0, page_url: page.page_url });
      toast.success(page.reused ? "Order ready — existing Klump link loaded." : "Order created and Klump payment link ready.");
    } catch (e: any) {
      const m = e?.message || "Something went wrong.";
      setErr(m);
      toast.error(`Send Klump link failed: ${m}`);
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!pageUrl) return;
    const ok = await copyToClipboard(pageUrl);
    if (ok) toast.success("Link copied");
    else toast.error("Couldn't copy — select the link and copy manually");
  };

  // Mint a fresh Klump link because the current one is burnt (customer already
  // attempted and failed). Confirms first — the old link stops working. Targets
  // the ORDER we already created (result.order_id), never the quote id.
  const regenerate = async () => {
    if (regenerating || !result?.order_id) return;
    const ok = window.confirm(
      "Klump only allows one payment attempt per link. If the customer already tried and failed, their link is now dead and they will see \"Merchant reference must be unique\". This creates a fresh link for them. The old link will stop working. Continue?",
    );
    if (!ok) return;
    setRegenerating(true);
    setErr(null);
    try {
      const { data, error } = await (supabase as any).functions.invoke("klump-create-payment-page", {
        body: { order_id: result.order_id, retry: true },
      });
      let bodyErr: string | null = null;
      const ctx = (error as any)?.context;
      if (ctx && typeof ctx.clone === "function") {
        try { const b = await ctx.clone().json(); bodyErr = b?.error || null; } catch { /* ignore */ }
      }
      if (error || !data?.page_url) {
        const m = bodyErr || data?.error || (error as any)?.message || "Could not generate a new Klump link.";
        setErr(m);
        toast.error(`New Klump link failed: ${m}`);
        return;
      }
      setResult((prev) => (prev ? { ...prev, page_url: data.page_url, amount: Number(data.amount ?? prev.amount) || prev.amount } : prev));
      setAttempt(Number(data.attempt_number) || null);
      toast.success(
        `New Klump link ready${data.attempt_number ? ` (Attempt ${data.attempt_number})` : ""}. Send this new link — the old one no longer works.`,
      );
    } catch (e: any) {
      const m = e?.message || "Could not generate a new Klump link.";
      setErr(m);
      toast.error(`New Klump link failed: ${m}`);
    } finally {
      setRegenerating(false);
    }
  };

  // Email the "Pay with Klump" template to the customer. Targets the ORDER id
  // from the conversion (result.order_id), never the quote id. The edge function
  // resolves the link and 400s if none exists. Loud on failure.
  const emailLink = async () => {
    if (emailing || !result?.order_id || !customerEmail) return;
    setEmailing(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("send-transactional-email", {
        body: { order_id: result.order_id, email_type: "payment_link_klump" },
      });
      let bodyErr: string | null = null;
      const ctx = (error as any)?.context;
      if (ctx && typeof ctx.clone === "function") {
        try { const b = await ctx.clone().json(); bodyErr = b?.error || null; } catch { /* ignore */ }
      }
      if (error || data?.success === false) {
        const msg = bodyErr || data?.error || (error as any)?.message || "The email could not be sent.";
        toast.error(`Couldn't email the payment link: ${msg}`);
        return;
      }
      toast.success(`Payment link emailed to ${data?.sent_to || customerEmail}`);
    } catch (e: any) {
      toast.error(`Couldn't email the payment link: ${e?.message || "unexpected error"}`);
    } finally {
      setEmailing(false);
    }
  };

  const missing: string[] = Array.isArray(ready?.out_missing_fields) ? ready!.out_missing_fields : [];
  // Guard against a silent empty state: if the RPC returned a row but `ready` is
  // not a boolean (e.g. a future field-name drift), treat it as an error rather
  // than rendering a misleading "not ready".
  const readyShapeBad = !!ready && typeof ready.ready !== "boolean";

  return (
    <section className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-sm font-bold mb-1 flex items-center gap-2"><Link2 className="w-4 h-4 text-forest" /> Klump payment link</h2>
      <p className="text-[11px] text-text-med mb-3">
        Convert this quote to a pending order and send the customer a Buy-Now-Pay-Later link.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-text-med"><Loader2 className="w-4 h-4 animate-spin" /> Checking…</div>
      ) : readyErr ? (
        <div className="text-xs text-destructive flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> Couldn't check readiness: {(readyErr as any)?.message || "unknown error"}</div>
      ) : readyShapeBad ? (
        <div className="text-xs text-destructive flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> Unexpected response from the readiness check. Refresh and try again.</div>
      ) : pageUrl ? (
        <>
          <p className="text-[11px] text-green-700 font-semibold mb-1.5">Order {orderNumber} created — payment link ready.</p>
          {attempt && attempt > 1 && (
            <div className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 mb-2 text-[11px] text-amber-800">
              <RefreshCw className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
              <span><span className="font-bold">Attempt {attempt}</span> — this is the new link. The previous link is now dead. Send this one to the customer.</span>
            </div>
          )}
          <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2 mb-2">
            <span className="text-[11px] font-mono break-all">{pageUrl}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <CopyIcon className="w-3.5 h-3.5" /> Copy link
            </button>
            {waHref ? (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] text-white px-3 py-1.5 text-xs font-semibold hover:brightness-95">
                <Send className="w-3.5 h-3.5" /> Send on WhatsApp
              </a>
            ) : (
              <span className="text-[11px] text-text-med self-center">No valid phone number for WhatsApp.</span>
            )}
            <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </a>
            {customerEmail ? (
              <button onClick={emailLink} disabled={emailing} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                {emailing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} {emailing ? "Emailing…" : "Email payment link"}
              </button>
            ) : (
              <span className="text-[11px] text-text-med self-center" title="This quote has no customer email on file">No email on file — can't email the link.</span>
            )}
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-border">
            <button
              onClick={regenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 text-amber-800 px-3 py-1.5 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50"
            >
              {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {regenerating ? "Generating…" : "Generate new link (customer needs to retry)"}
            </button>
            <p className="text-[11px] text-text-med mt-1.5">Use this only if the customer tried the link and it failed — Klump kills a link after one attempt.</p>
            {err && <p className="text-xs text-destructive mt-1.5 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" /> {err}</p>}
          </div>
        </>
      ) : ready?.out_existing_order_number ? (
        <div className="text-xs">
          <p className="text-green-700 font-semibold mb-1">This quote is already converted.</p>
          <p className="text-text-med">Order <span className="font-mono font-semibold text-foreground">{ready.out_existing_order_number}</span> — open it on the <Link to="/admin/orders" className="text-forest font-semibold hover:underline">Orders page</Link> to send its Klump link.</p>
        </div>
      ) : ready?.ready ? (
        <>
          <button onClick={run} disabled={busy || !canConvert} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating order & link…</> : <><Link2 className="w-4 h-4" /> Send Klump payment link ({fmtN(amount)})</>}
          </button>
          {!canConvert && <p className="text-[11px] text-amber-700 mt-2">You don't have permission to convert quotes.</p>}
          {err && <p className="text-xs text-destructive mt-2 flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" /> {err}</p>}
        </>
      ) : (
        <>
          <button disabled title={ready?.reason || "Not ready"} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-muted text-muted-foreground px-4 py-2 text-sm font-semibold cursor-not-allowed">
            <Link2 className="w-4 h-4" /> Send Klump payment link
          </button>
          {missing.length > 0 ? (
            <p className="text-xs text-amber-700 mt-2">Fill in the customer details before sending a payment link. Missing: <span className="font-semibold">{missing.join(", ")}</span></p>
          ) : (
            <p className="text-xs text-amber-700 mt-2">{ready?.reason || "This quote isn't ready for a payment link."}</p>
          )}
        </>
      )}

      <p className="text-[11px] text-text-med mt-3">The order will be marked paid automatically once Klump confirms payment.</p>
    </section>
  );
}

function QuoteEditor({
  quoteId,
  onClose,
  onOpenQuote,
  canEdit,
  canCreate,
  canDelete,
  contactSettings,
}: {
  quoteId: string | null;
  onClose: () => void;
  onOpenQuote: (id: string) => void;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  contactSettings: Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const { adminUser } = usePermissions();
  const [form, setForm] = useState<QuoteForm>(BLANK_FORM);
  const [currentId, setCurrentId] = useState<string | null>(quoteId);
  // The product search, item search, add dialog, section picker and zoom all
  // live inside the shared <PackageItemsBuilder>; the editor only supplies items
  // and add/update/remove handlers.
  // Covers the full save + image-preload + PDF render window so the
  // button stays disabled while thumbnails are being fetched.
  const [pdfBusy, setPdfBusy] = useState(false);

  // Load the quote (and items) when editing.
  const { data: quoteData, refetch: refetchQuote } = useQuery({
    queryKey: ["admin-quote", currentId],
    enabled: !!currentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quotes")
        .select("*, quote_items(*)")
        .eq("id", currentId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Creator is fetched as a separate query rather than via a PostgREST
  // embed (`creator:admin_users!created_by(...)`) because the FK doesn't
  // surface in PostgREST's relationship cache for this project — the
  // embed errors with a schema-cache miss and tanks the whole quote
  // query, blanking out items + the share-link button along with it.
  // Two queries is cheap; one broken page is not.
  const { data: creator } = useQuery({
    queryKey: ["admin-quote-creator", quoteData?.created_by],
    enabled: !!quoteData?.created_by,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_users")
        .select("display_name, email")
        .eq("id", quoteData.created_by)
        .maybeSingle();
      // RLS denying the read returns data=null with no error; the UI
      // falls through to "—" which is the right behaviour either way.
      if (error) {
        console.warn("[admin-quote] could not load creator", error);
        return null;
      }
      return data;
    },
  });

  // Ref holds the signature of the last-persisted form payload so the
  // autosave effect can skip no-op writes immediately after loading.
  const lastSavedSigRef = useRef<string>("");

  // Build the DB-shaped payload from the in-memory form. Centralised so
  // the autosave effect, the initial sync, and the explicit save buttons
  // all produce the same shape.
  const buildAutosavePayload = (f: QuoteForm) => ({
    customer_name: f.customer_name.trim() || null,
    // Store the phone in E.164 (+234…, +44…) when it is valid; otherwise keep
    // the raw trimmed value (autosave is gated on validity, so this only stores
    // normalised numbers in practice).
    customer_phone: normalizePhoneE164(f.customer_phone) || (f.customer_phone.trim() || null),
    customer_email: f.customer_email.trim() || null,
    delivery_address: f.delivery_address.trim() || null,
    delivery_city: f.delivery_city || null,
    delivery_state: f.delivery_state || null,
    service_fee: parseInt(f.service_fee, 10) || 0,
    estimated_delivery_fee: parseInt(f.estimated_delivery_fee, 10) || 0,
    delivery_fee_override: f.delivery_fee_override.trim() === "" ? null : (parseInt(f.delivery_fee_override, 10) || null),
    discount_amount: parseInt(f.discount_amount, 10) || 0,
    discount_reason: f.discount_reason.trim() || null,
    bypass_spend_threshold: !!f.bypass_spend_threshold,
    bypass_delivery_threshold: !!f.bypass_delivery_threshold,
    expires_at: f.expires_at ? new Date(f.expires_at + "T23:59:59").toISOString() : null,
    internal_notes: f.internal_notes.trim() || null,
    customer_notes: f.customer_notes.trim() || null,
  });

  useEffect(() => {
    if (!quoteData) return;
    const nextForm: QuoteForm = {
      customer_name: quoteData.customer_name || "",
      customer_phone: quoteData.customer_phone || "",
      customer_email: quoteData.customer_email || "",
      delivery_address: quoteData.delivery_address || "",
      delivery_city: quoteData.delivery_city || "",
      delivery_state: quoteData.delivery_state || "",
      service_fee: String(quoteData.service_fee ?? 500),
      estimated_delivery_fee: String(quoteData.estimated_delivery_fee ?? 0),
      delivery_fee_override: quoteData.delivery_fee_override != null ? String(quoteData.delivery_fee_override) : "",
      discount_amount: String(quoteData.discount_amount ?? 0),
      discount_reason: quoteData.discount_reason || "",
      bypass_spend_threshold: !!quoteData.bypass_spend_threshold,
      bypass_delivery_threshold: !!quoteData.bypass_delivery_threshold,
      expires_at: quoteData.expires_at ? new Date(quoteData.expires_at).toISOString().slice(0, 10) : "",
      internal_notes: quoteData.internal_notes || "",
      customer_notes: quoteData.customer_notes || "",
      status: (quoteData.status as any) || "draft",
    };
    setForm(nextForm);
    // Seed the autosave signature with the just-loaded values so the
    // debounced effect doesn't immediately write the same data back.
    lastSavedSigRef.current = JSON.stringify(buildAutosavePayload(nextForm));
  }, [quoteData]);

  // ── Autosave ────────────────────────────────────────────────────
  // Before this existed, customer_name/email/phone (and all other
  // top-level quote fields) only persisted when the admin explicitly
  // clicked Save Draft or Save & Download. Items always saved because
  // each item mutation hits the DB directly. The mismatch let admins
  // type a customer email, see it on screen, then hit Send to Customer
  // — but the edge function reads from the DB where the column was
  // still NULL and 400'd. Debouncing 500 ms keeps the keystroke storm
  // off the network without surprising the admin.
  useEffect(() => {
    if (!currentId || !canEdit) return;
    // Gate: never autosave until the quote has actually loaded into the
    // form. Before load, `form` is the empty default (customer_name: ""),
    // and buildAutosavePayload would send customer_name/email/phone as
    // null — wiping the saved values. The load-sync effect seeds
    // lastSavedSigRef once data arrives, so the first post-load run is a
    // no-op and only genuine edits (including intentional clears) write.
    if (!quoteData) return;
    // Never autosave a quote without a valid follow-up phone. Editing other
    // fields on a phone-less quote will not persist until a phone is entered
    // (viewing is unaffected — this only blocks writes).
    if (!isValidPhone(form.customer_phone)) return;
    const payload = buildAutosavePayload(form);
    const sig = JSON.stringify(payload);
    if (sig === lastSavedSigRef.current) return;
    const t = setTimeout(async () => {
      const { error } = await (supabase as any)
        .from("quotes")
        .update(payload)
        .eq("id", currentId);
      if (error) {
        console.error("[quotes] autosave failed", error);
        return;
      }
      lastSavedSigRef.current = sig;
      // Keep the list-view cache in step so totals/customer_name reflect.
      queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, currentId, canEdit, quoteData]);

  const items: any[] = useMemo(
    () => (quoteData?.quote_items || []).slice().sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0)),
    [quoteData],
  );

  const liveSubtotal = items.reduce((s, it) => s + (it.line_total || 0), 0);
  const serviceFeeNum = parseInt(form.service_fee, 10) || 0;
  const overrideFee = form.delivery_fee_override.trim() === "" ? null : parseInt(form.delivery_fee_override, 10);
  const deliveryFeeNum = overrideFee != null && Number.isFinite(overrideFee)
    ? overrideFee
    : (parseInt(form.estimated_delivery_fee, 10) || 0);
  const discountNum = parseInt(form.discount_amount, 10) || 0;
  // Gift wrap fee is DB-derived (trigger from settings.gift_wrap_price);
  // include it in the live total so the editor reflects the persisted DB
  // total without a refetch round-trip after toggling.
  const giftWrapFeeNum = Number(((quoteData as any)?.gift_wrap_fee) || 0);
  const liveTotal = Math.max(0, liveSubtotal + serviceFeeNum + deliveryFeeNum + giftWrapFeeNum - discountNum);

  // Debounced signature of the customer fields — feeds the Klump payment-link
  // eligibility check. Debounced 900ms (> the 500ms autosave) so the RPC reads
  // the freshly-persisted quote, not stale DB values.
  const custSig = `${form.customer_name}|${form.customer_phone}|${form.customer_email}|${form.delivery_address}|${form.delivery_city}|${form.delivery_state}`;
  const [debouncedCustSig, setDebouncedCustSig] = useState(custSig);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCustSig(custSig), 900);
    return () => clearTimeout(t);
  }, [custSig]);

  // ── Batch variant data for all items currently in the quote ─────
  const productIds = useMemo(
    () => [...new Set((items as any[]).map((it: any) => it.product_id).filter(Boolean))] as string[],
    [items],
  );

  const variantQueryKey = productIds.slice().sort().join(",");

  const { data: variantBrands = [] } = useQuery({
    queryKey: ["quote-variant-brands", variantQueryKey],
    enabled: productIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("brands")
        .select("id, brand_name, product_id, image_url, stored_image_url, images, price, sku, in_stock, weight_kg")
        .in("product_id", productIds)
        .order("brand_name");
      if (error) throw error;
      return data || [];
    },
  });

  // brandsByProduct is still needed here for the quote-only delivery weight
  // calc below. The item cards' brand/size/color variant data is fetched
  // independently inside <PackageItemsBuilder> (same query keys, so react-query
  // dedupes the network requests).
  const brandsByProduct = useMemo(() => {
    const map = new Map<string, any[]>();
    (variantBrands as any[]).forEach((b: any) => {
      if (!map.has(b.product_id)) map.set(b.product_id, []);
      map.get(b.product_id)!.push(b);
    });
    return map;
  }, [variantBrands]);

  // ── Delivery: auto-calculated fee ──────────────────────────────────
  // State options now live inside the StateZoneLgaCityCascade component.

  // Estimated order weight (kg), mirroring CheckoutPage: per-line
  // brand.weight_kg × qty, with a conservative 0.5kg/unit fallback so a
  // missing weight never yields a zero fee.
  const cartWeightKg = useMemo(() => {
    return (items as any[]).reduce((sum: number, it: any) => {
      const brand = (brandsByProduct.get(it.product_id) || []).find((b: any) => b.id === it.brand_id);
      const w = Number(brand?.weight_kg);
      const per = Number.isFinite(w) && w > 0 ? w : 0.5;
      return sum + per * (it.quantity || 0);
    }, 0);
  }, [items, brandsByProduct]);

  // Auto-calc result surfaced to the delivery UI.
  const [deliveryPartner, setDeliveryPartner] = useState<string | null>(null);
  const [deliveryNotDeliverable, setDeliveryNotDeliverable] = useState(false);
  const [deliveryCalcLoading, setDeliveryCalcLoading] = useState(false);

  // Recompute estimated_delivery_fee via get_courier_assignment whenever
  // the address or items change. Mirrors CheckoutPage's parsing EXACTLY:
  // the RPC returns customer_rate in KOBO, so we ÷100 → naira for the
  // quotes.estimated_delivery_fee column. Writes through the form so the
  // existing debounced autosave persists it; never touches the override.
  const stateForCalc = form.delivery_state;
  const cityForCalc = form.delivery_city;
  useEffect(() => {
    if (!currentId || !canEdit) return;
    if (!stateForCalc.trim() || !cityForCalc.trim()) {
      setDeliveryNotDeliverable(false);
      setDeliveryPartner(null);
      return;
    }
    if (cartWeightKg <= 0) return;
    let cancelled = false;
    setDeliveryCalcLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await (supabase.rpc as any)("get_courier_assignment", {
          p_delivery_city: cityForCalc,
          p_delivery_state: stateForCalc,
          p_bundle_tier: "standard",
          p_order_day: new Date().toLocaleDateString("en-US", { weekday: "long" }),
          p_daily_order_count: 1,
          p_order_weight_kg: cartWeightKg,
          p_order_subtotal: liveSubtotal,
        });
        if (cancelled) return;
        const r = data || {};
        const deliverable = !error && r.deliverable !== false;
        if (deliverable) {
          // customer_rate is KOBO (see CheckoutPage line ~492) → naira.
          const feeNaira = Math.round((Number(r.customer_rate) || 0) / 100);
          setDeliveryNotDeliverable(false);
          setDeliveryPartner(r.partner || null);
          update({ estimated_delivery_fee: String(feeNaira) });
        } else {
          // Don't overwrite the estimate; surface a warning instead.
          setDeliveryNotDeliverable(true);
          setDeliveryPartner(null);
        }
      } catch {
        if (!cancelled) { setDeliveryNotDeliverable(false); }
      } finally {
        if (!cancelled) setDeliveryCalcLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateForCalc, cityForCalc, cartWeightKg, currentId, canEdit]);

  // Inline override editing UI state.
  const [overrideEditing, setOverrideEditing] = useState(false);
  const [overrideDraft, setOverrideDraft] = useState("");

  // ── Gift wrap auto-rule (mirrors customer checkout) ────────────────
  // Calls compute_auto_fees with the quote's items; the result tells us
  // whether the rule fires (gift_wrap_should_apply) and the configured
  // gift_wrap_price for display. Debounced 300ms. The DB trigger does
  // the actual fee derivation on save — we never compute it here.
  const [autoFees, setAutoFees] = useState<AutoFeesResult | null>(null);
  const itemsSigForFees = useMemo(
    () => JSON.stringify((items as any[]).map((it: any) => [String(it.product_id || ""), it.quantity, it.unit_price])),
    [items],
  );
  useEffect(() => {
    if ((items as any[]).length === 0) { setAutoFees(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const payload = (items as any[])
        .filter((it: any) => it.product_id)
        .map((it: any) => ({
          product_id: String(it.product_id),
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
        }));
      const res = await computeAutoFees(payload);
      if (!cancelled) setAutoFees(res);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSigForFees]);

  // Gift-wrap mutation — sends gift_wrapping AND gift_wrap_admin_override
  // in the SAME payload. Sending them in separate writes would let the
  // trigger see admin_override=false on the first save and overwrite
  // gift_wrapping back to the rule result.
  const setGiftWrap = useMutation({
    mutationFn: async (next: boolean) => {
      if (!currentId) throw new Error("Save the quote first");
      const { error } = await (supabase as any)
        .from("quotes")
        .update({ gift_wrapping: next, gift_wrap_admin_override: true })
        .eq("id", currentId);
      if (error) throw error;
    },
    onSuccess: () => { refetchQuote(); queryClient.invalidateQueries({ queryKey: ["admin-quotes"] }); },
    onError: (e: any) => toast.error(e?.message || "Could not update gift wrap"),
  });

  const resetGiftWrapAuto = useMutation({
    mutationFn: async () => {
      if (!currentId) throw new Error("Save the quote first");
      const { error } = await (supabase as any)
        .from("quotes")
        .update({ gift_wrap_admin_override: false })
        .eq("id", currentId);
      if (error) throw error;
    },
    onSuccess: () => { refetchQuote(); queryClient.invalidateQueries({ queryKey: ["admin-quotes"] }); },
    onError: (e: any) => toast.error(e?.message || "Could not reset gift wrap"),
  });

  const [confirmSkipGiftWrap, setConfirmSkipGiftWrap] = useState(false);

  // Product search now lives inside <PackageItemsBuilder>.

  // ── Mutations ──────────────────────────────────────────────────
  const upsertQuote = useMutation({
    mutationFn: async (next: QuoteForm) => {
      const payload: any = {
        customer_name: next.customer_name.trim() || null,
        customer_phone: normalizePhoneE164(next.customer_phone) || (next.customer_phone.trim() || null),
        customer_email: next.customer_email.trim() || null,
        delivery_address: next.delivery_address.trim() || null,
        delivery_city: next.delivery_city.trim() || null,
        delivery_state: next.delivery_state || null,
        service_fee: parseInt(next.service_fee, 10) || 0,
        estimated_delivery_fee: parseInt(next.estimated_delivery_fee, 10) || 0,
        delivery_fee_override: next.delivery_fee_override.trim() === "" ? null : (parseInt(next.delivery_fee_override, 10) || null),
        discount_amount: parseInt(next.discount_amount, 10) || 0,
        discount_reason: next.discount_reason.trim() || null,
        bypass_spend_threshold: !!next.bypass_spend_threshold,
        bypass_delivery_threshold: !!next.bypass_delivery_threshold,
        expires_at: next.expires_at ? new Date(next.expires_at + "T23:59:59").toISOString() : null,
        internal_notes: next.internal_notes.trim() || null,
        customer_notes: next.customer_notes.trim() || null,
        status: next.status,
      };
      if (currentId) {
        const { data, error } = await (supabase as any)
          .from("quotes")
          .update(payload)
          .eq("id", currentId)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await (supabase as any)
          .from("quotes")
          .insert({ ...payload, created_by: adminUser?.id || null })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (row: any) => {
      if (!currentId) setCurrentId(row.id);
      queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-quote", row.id] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not save quote"),
  });

  const addItem = useMutation({
    mutationFn: async (item: {
      productId: string; productName: string; brandId: string; brandName: string;
      price: number; size?: string | null; quantity?: number; section?: string | null;
    }) => {
      if (!currentId) throw new Error("Save the quote first");
      // line_total is recomputed by a DB trigger from quantity * unit_price, so
      // we only pass quantity (clamped to a positive integer) here.
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
      const { error } = await (supabase as any).from("quote_items").insert({
        quote_id: currentId,
        product_id: item.productId,
        brand_id: item.brandId,
        product_name: item.productName,
        brand_name: item.brandName,
        size: item.size || null,
        quantity: qty,
        unit_price: item.price,
        display_order: items.length,
        section: item.section || null, // one of QUOTE_SECTIONS keys or null — never any other value
      });
      if (error) throw error;
    },
    onSuccess: () => { refetchQuote(); queryClient.invalidateQueries({ queryKey: ["admin-quotes"] }); },
    onError: (e: any) => toast.error(e?.message || "Could not add item"),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, patch }: {
      id: string;
      patch: {
        quantity?: number;
        unit_price?: number;
        brand_id?: string | null;
        brand_name?: string | null;
        size?: string | null;
        color?: string | null;
        section?: string | null;
      };
    }) => {
      const { error } = await (supabase as any).from("quote_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refetchQuote(); queryClient.invalidateQueries({ queryKey: ["admin-quotes"] }); },
    onError: (e: any) => toast.error(e?.message || "Could not update item"),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("quote_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refetchQuote(); queryClient.invalidateQueries({ queryKey: ["admin-quotes"] }); },
    onError: (e: any) => toast.error(e?.message || "Could not remove item"),
  });

  // Duplicate from inside the editor. Same RPC as the list view —
  // returns the new quote id which we hand to the parent so it can
  // swap editingId and trigger a clean remount (via the key prop on
  // <QuoteEditor>) onto the freshly-created draft.
  const duplicateInEditor = useMutation({
    mutationFn: async () => {
      if (!currentId) throw new Error("Save the quote before duplicating");
      const { data, error } = await (supabase as any).rpc("duplicate_quote", {
        p_source_quote_id: currentId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.new_quote_id) throw new Error("Duplicate succeeded but returned no id");
      return row as { new_quote_id: string; new_quote_number: string };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
      const sourceNumber = quoteData?.quote_number;
      toast.success(
        sourceNumber
          ? `Quote ${sourceNumber} duplicated as ${res.new_quote_number}`
          : `Quote duplicated as ${res.new_quote_number}`,
      );
      onOpenQuote(res.new_quote_id);
    },
    onError: (e: any) => toast.error(e?.message || "Could not duplicate quote"),
  });

  const update = (patch: Partial<QuoteForm>) => setForm((p) => ({ ...p, ...patch }));

  // ── Required phone gate ─────────────────────────────────────────
  // A quote must carry a follow-up phone number. Blocks every save path
  // (Save Draft, Save & Download, status changes, and autosave) and the
  // field is marked required up front. International numbers are accepted;
  // see @/lib/phone.
  const PHONE_REQUIRED_MSG = "A phone number is required so we can follow up on this quote.";
  const phoneValid = isValidPhone(form.customer_phone);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const showPhoneError = !phoneValid && phoneTouched;
  // Guard a save action: surfaces the inline error + a toast and stops the
  // save when the phone is missing/invalid. Returns true when it is safe.
  const requirePhone = (): boolean => {
    if (phoneValid) return true;
    setPhoneTouched(true);
    toast.error(PHONE_REQUIRED_MSG);
    return false;
  };

  const handleSaveDraft = async () => {
    if (!requirePhone()) return;
    const row = await upsertQuote.mutateAsync(form);
    toast.success(`Quote saved · ${row.quote_number}`);
    onClose();
  };

  const handleSaveAndDownload = async () => {
    if (!requirePhone()) return;
    setPdfBusy(true);
    try {
      const row = await upsertQuote.mutateAsync(form);
      // Refetch to get the latest items + computed totals after the update trigger.
      const { data, error } = await (supabase as any)
        .from("quotes").select("*, quote_items(*, brands(stored_image_url, image_url))").eq("id", row.id).single();
      if (error) { toast.error(error.message); return; }
      const orderedItems = (data.quote_items || []).slice().sort(
        (a: any, b: any) => (a.display_order || 0) - (b.display_order || 0),
      );
      await downloadQuotePdf(
        {
          quote_number: data.quote_number,
          created_at: data.created_at,
          customer_name: data.customer_name,
          customer_phone: data.customer_phone,
          customer_email: data.customer_email,
          delivery_address: data.delivery_address,
          delivery_city: data.delivery_city,
          delivery_state: data.delivery_state,
          subtotal: data.subtotal || 0,
          service_fee: data.service_fee || 0,
          estimated_delivery_fee: data.estimated_delivery_fee || 0,
          total: data.total || 0,
          customer_notes: data.customer_notes,
          items: orderedItems.map((it: any) => ({
            product_name: it.product_name, brand_name: it.brand_name,
            size: it.size, color: it.color,
            quantity: it.quantity, unit_price: it.unit_price, line_total: it.line_total,
            section: it.section ?? null,
            // CORS-safe stored URL only; "" / null → no thumbnail.
            image_url: (it.brands?.stored_image_url && it.brands.stored_image_url.trim() !== "")
              ? it.brands.stored_image_url
              : null,
          })),
        },
        {
          whatsapp_number: contactSettings.whatsapp_number,
          bank_name: contactSettings.bank_name,
          bank_account_name: contactSettings.bank_account_name,
          bank_account_number: contactSettings.bank_account_number,
        },
      );
      toast.success(`PDF downloaded · ${data.quote_number}`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not generate PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  const handleStatus = async (next: QuoteForm["status"]) => {
    if (!requirePhone()) return;
    update({ status: next });
    const saved = await upsertQuote.mutateAsync({ ...form, status: next });
    toast.success(`Marked as ${next}`);
    void saved;
  };

  // In-editor send + convert modal toggles — let admin trigger
  // workflow without bouncing back to the list view.
  const [editorSend, setEditorSend] = useState(false);
  const [editorConvert, setEditorConvert] = useState(false);

  const handleDelete = async () => {
    if (!currentId) { onClose(); return; }
    if (!confirm(`Delete quote ${quoteData?.quote_number || ""}? This cannot be undone.`)) return;
    const { error } = await (supabase as any).from("quotes").delete().eq("id", currentId);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
    toast.success("Quote deleted");
    onClose();
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <button onClick={onClose} className="inline-flex items-center gap-1 text-xs text-text-med hover:text-foreground mb-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to quotes
          </button>
          <h1 className="pf text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" /> {currentId ? `Edit Quote${quoteData?.quote_number ? ` · ${quoteData.quote_number}` : ""}` : "New Quote"}
          </h1>
          {/* Internal audit line — only rendered inside the admin
              editor. The PDF, the customer email, and the public
              /quote/:share_token page all read from separate code
              paths, so they never see this field. Historical quotes
              created before created_by was captured (commit d922253)
              show "—" rather than guessing a creator. */}
          {currentId && (
            <p className="text-[11px] text-text-med mt-1 ml-8">
              Created by{" "}
              <span className="font-semibold text-foreground">
                {creator?.display_name || creator?.email || "—"}
              </span>
              <span className="ml-1.5 text-[9px] uppercase tracking-wider text-text-light">internal</span>
            </p>
          )}
        </div>
        {currentId && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize self-start mt-2 ${STATUS_COLORS[form.status] || STATUS_COLORS.draft}`}>
            {form.status}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column — customer + items + notes */}
        <div className="lg:col-span-2 space-y-4">
          {/* Section A — Customer Details */}
          <section className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-1">Customer Details</h2>
            <p className="text-[11px] text-text-med mb-3 italic">
              A phone number is required so we can follow up on the quote. Other
              contact details are optional here and requested again when sending
              the quote or placing the order.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Customer Name</label>
                <input value={form.customer_name} onChange={(e) => update({ customer_name: e.target.value })} className={inputCls} disabled={!canEdit} />
              </div>
              <div>
                <label className={labelCls}>Phone <span className="text-destructive">*</span></label>
                <input
                  value={form.customer_phone}
                  onChange={(e) => update({ customer_phone: e.target.value })}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="+234 8… or 080…"
                  aria-required="true"
                  aria-invalid={showPhoneError}
                  className={`${inputCls} ${showPhoneError ? "border-destructive" : ""}`}
                  disabled={!canEdit}
                />
                {showPhoneError && (
                  <p className="text-destructive text-[11px] mt-1">{PHONE_REQUIRED_MSG}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={form.customer_email} onChange={(e) => update({ customer_email: e.target.value })} className={inputCls} disabled={!canEdit} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Delivery Address</label>
                <textarea value={form.delivery_address} onChange={(e) => update({ delivery_address: e.target.value })} rows={2} className={inputCls} disabled={!canEdit} />
              </div>
              {/* State → Delivery Zone → LGA → City cascade — same
                  behaviour as checkout. Zone/LGA are UI-only; only state
                  and city are persisted via the existing autosave. */}
              <StateZoneLgaCityCascade
                value={{ state: form.delivery_state, city: form.delivery_city }}
                onChange={(patch) => update({
                  ...(patch.state !== undefined ? { delivery_state: patch.state } : {}),
                  ...(patch.city !== undefined ? { delivery_city: patch.city } : {}),
                })}
                disabled={!canEdit}
                labelClassName={labelCls}
                inputClassName={inputCls}
              />
            </div>
          </section>

          {/* Section B — Items (shared with the landing-pages admin) */}
          <PackageItemsBuilder
            items={items}
            canEdit={canEdit}
            disabled={!currentId}
            disabledHint="Save the quote first to start adding products."
            isMutating={updateItem.isPending || removeItem.isPending}
            onAddItem={(payload) => addItem.mutate(payload)}
            onUpdateItem={(id, patch) => updateItem.mutate({ id, patch })}
            onRemoveItem={(id) => removeItem.mutate(id)}
          />

          {/* Section D — Notes */}
          <section className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3">Notes</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Internal Notes (only you'll see this)</label>
                <textarea value={form.internal_notes} onChange={(e) => update({ internal_notes: e.target.value })} rows={2} className={inputCls} disabled={!canEdit} />
              </div>
              <div>
                <label className={labelCls}>Customer Notes (shown on the PDF for the customer)</label>
                <textarea value={form.customer_notes} onChange={(e) => update({ customer_notes: e.target.value })} rows={3} className={inputCls} disabled={!canEdit} />
              </div>
            </div>
          </section>
        </div>

        {/* Right column — fees & totals + actions */}
        <div className="space-y-4">
          {/* Section C — Fees + Totals */}
          <section className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3">Fees & Totals</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-med">Subtotal</span>
                <span className="font-semibold">{fmtN(liveSubtotal)}</span>
              </div>
              <div>
                <label className={`${labelCls} flex items-center gap-1.5`}>
                  Service &amp; Packaging (₦)
                  <span
                    className="px-1.5 py-0.5 rounded bg-forest-light text-forest text-[9px] font-bold normal-case tracking-normal"
                    title="Calculated from cart contents. Manage rules in admin settings."
                  >
                    Auto
                  </span>
                </label>
                {/* Read-only: the DB trigger overwrites quote.service_fee from
                    the auto-fee rules on every save, so an input here would be
                    ignored. Display the computed value only. */}
                <div
                  className={`${inputCls} bg-muted/40 text-text-med cursor-not-allowed flex items-center`}
                  title="Calculated from cart contents. Manage rules in admin settings."
                >
                  {fmtN(parseInt(form.service_fee, 10) || 0)}
                </div>
              </div>
              {/* Delivery fee — auto-calculated from address + cart via
                  get_courier_assignment, with optional manual override.
                  Auto-calc only writes estimated_delivery_fee; override is
                  a separate value the admin controls. */}
              {(() => {
                const estimated = parseInt(form.estimated_delivery_fee, 10) || 0;
                const hasOverride = form.delivery_fee_override.trim() !== "";
                const overrideVal = parseInt(form.delivery_fee_override, 10) || 0;
                const saveOverride = () => {
                  const v = Math.max(0, parseInt(overrideDraft, 10) || 0);
                  update({ delivery_fee_override: String(v) });
                  setOverrideEditing(false);
                };
                return (
                  <div>
                    <label className={labelCls}>Delivery fee</label>
                    {deliveryNotDeliverable && (
                      <div className="mb-2 text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                        ⚠️ Delivery not available to this location. Please contact the customer to arrange pickup or alternative arrangements.
                      </div>
                    )}
                    {overrideEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={0} autoFocus
                          value={overrideDraft}
                          onChange={(e) => setOverrideDraft(e.target.value)}
                          className={inputCls}
                          disabled={!canEdit}
                        />
                        <button onClick={saveOverride} disabled={!canEdit} className="px-3 py-2 rounded-lg bg-forest text-primary-foreground text-xs font-semibold hover:bg-forest-deep disabled:opacity-40">Save</button>
                        <button onClick={() => setOverrideEditing(false)} className="px-3 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-muted">Cancel</button>
                      </div>
                    ) : hasOverride ? (
                      // STATE 2 — override set
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{fmtN(overrideVal)}</span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold uppercase tracking-wide">Overridden</span>
                        </div>
                        <p className="text-[11px] text-text-light mt-0.5">
                          Calculated: {fmtN(estimated)} (auto-replaced by your override)
                        </p>
                        {canEdit && (
                          <div className="flex items-center gap-3 mt-1.5">
                            <button onClick={() => { setOverrideDraft(String(overrideVal)); setOverrideEditing(true); }} className="text-xs font-semibold text-forest hover:underline">Edit</button>
                            <button onClick={() => update({ delivery_fee_override: "" })} className="text-xs font-semibold text-text-med hover:underline">Reset to calculated</button>
                          </div>
                        )}
                      </div>
                    ) : (() => {
                      // STATE 1 — no override; show the calculated value, or
                      // a "pending" note when the fee can't be resolved yet
                      // (no address / bypass). Mirrors the customer quote page.
                      const feeStr = formatQuoteDeliveryFee(
                        {
                          delivery_address: form.delivery_address,
                          delivery_fee_override: null,
                          estimated_delivery_fee: estimated,
                          bypass_delivery_threshold: form.bypass_delivery_threshold,
                        },
                        fmtN,
                      );
                      const isTbd = feeStr === QUOTE_DELIVERY_TBD;
                      return (
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={isTbd ? "text-sm font-semibold text-text-med" : "text-lg font-bold"}>{feeStr}</span>
                            {!isTbd && (
                              <span className="px-1.5 py-0.5 rounded bg-forest-light text-forest text-[9px] font-bold uppercase tracking-wide">
                                {deliveryCalcLoading ? "Calculating…" : "Calculated"}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-text-light mt-0.5">
                            {isTbd ? "Add the customer's delivery address to calculate the fee." : `Auto-calculated from address + cart.${deliveryPartner ? ` ${deliveryPartner}` : ""}`}
                          </p>
                          {canEdit && (
                            <button onClick={() => { setOverrideDraft(String(estimated)); setOverrideEditing(true); }} className="text-xs font-semibold text-forest hover:underline mt-1.5">Override</button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* Gift wrapping — mirrors customer-checkout's soft auto-rule
                  with persistent admin override. The DB trigger derives
                  gift_wrap_fee from settings; we only display + toggle. */}
              {(() => {
                const giftWrapping = !!((quoteData as any)?.gift_wrapping);
                const adminOverride = !!((quoteData as any)?.gift_wrap_admin_override);
                const ruleFires = !!autoFees?.gift_wrap_should_apply;
                const giftPrice = Number(autoFees?.settings?.gift_wrap_price ?? 0);
                const feeShown = Number(((quoteData as any)?.gift_wrap_fee) || 0) || giftPrice;
                const pending = setGiftWrap.isPending || resetGiftWrapAuto.isPending;
                const onToggle = () => {
                  if (!canEdit || pending) return;
                  if (giftWrapping) {
                    // Unchecking — confirm only if the rule fires AND there's
                    // no manual override yet (mirrors customer checkout).
                    if (ruleFires && !adminOverride) {
                      setConfirmSkipGiftWrap(true);
                      return;
                    }
                    setGiftWrap.mutate(false);
                  } else {
                    setGiftWrap.mutate(true);
                  }
                };
                return (
                  <div>
                    <label className={labelCls}>Gift wrapping</label>
                    <div
                      onClick={onToggle}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${giftWrapping ? "border-[#FFD54F] bg-[#FFF8E1]" : "border-border bg-card"} ${canEdit && !pending ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${giftWrapping ? "border-[#F9A825] bg-[#F9A825]" : "border-border bg-card"}`}>
                        {giftWrapping && <span className="text-primary-foreground text-[10px] font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                          Add gift wrapping
                          {adminOverride ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold uppercase tracking-wide">Manually set</span>
                          ) : ruleFires ? (
                            <span className="px-1.5 py-0.5 rounded bg-forest-light text-forest text-[9px] font-bold uppercase tracking-wide">Auto</span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-text-med mt-0.5">{fmtN(feeShown)}</div>
                        <div className="text-[11px] text-text-light mt-0.5">
                          {adminOverride
                            ? "Admin override active. Click 'Reset to auto' to re-apply the rule."
                            : ruleFires
                              ? "Auto-applied — cart qualifies for gift packaging."
                              : "Not auto-applied for this cart."}
                        </div>
                        {adminOverride && canEdit && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); resetGiftWrapAuto.mutate(); }}
                            disabled={pending}
                            className="mt-1.5 text-xs font-semibold text-forest hover:underline disabled:opacity-40"
                          >
                            Reset to auto
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className={labelCls}>Discount (₦)</label>
                  <input type="number" min={0} value={form.discount_amount} onChange={(e) => update({ discount_amount: e.target.value })} className={inputCls} disabled={!canEdit} />
                </div>
                <div>
                  <label className={labelCls}>Discount Reason</label>
                  <input type="text" value={form.discount_reason} onChange={(e) => update({ discount_reason: e.target.value })} placeholder="e.g. Loyalty" className={inputCls} disabled={!canEdit} maxLength={120} />
                </div>
              </div>
              <div className="space-y-1 pt-1">
                <label className="flex items-start gap-2 text-[12px] text-text-med cursor-pointer">
                  <input type="checkbox" checked={form.bypass_spend_threshold} onChange={(e) => update({ bypass_spend_threshold: e.target.checked })} disabled={!canEdit} />
                  <span>Bypass automatic spend-threshold discount</span>
                </label>
                <label className="flex items-start gap-2 text-[12px] text-text-med cursor-pointer">
                  <input type="checkbox" checked={form.bypass_delivery_threshold} onChange={(e) => update({ bypass_delivery_threshold: e.target.checked })} disabled={!canEdit} />
                  <span>Bypass free-delivery threshold</span>
                </label>
              </div>
              <div>
                <label className={labelCls}>Expires On</label>
                <input type="date" value={form.expires_at} onChange={(e) => update({ expires_at: e.target.value })} className={inputCls} disabled={!canEdit} />
                <p className="text-[10px] text-text-light mt-1">Quote auto-expires after this date.</p>
              </div>
              <div className="border-t border-border pt-3 flex justify-between items-baseline">
                <span className="font-bold text-forest">GRAND TOTAL</span>
                <span className="text-xl font-bold text-forest">{fmtN(liveTotal)}</span>
              </div>
            </div>
          </section>

          {/* Profit & Discount Room — admin / super_admin only. Server-gated via
              get_quote_profit (the RPC returns no cost data to other roles); the
              role check here just avoids a pointless call + hides it cleanly. */}
          {currentId && <QuoteProfitPanel quoteId={currentId} role={adminUser?.role} liveTotal={liveTotal} />}

          {/* Convert-and-pay: turn the quote into a pending order + Klump link.
              Only once the quote is saved; the RPCs/edge fn are admin-gated. */}
          {currentId && canEdit && (
            <QuotePaymentLinkCard
              quoteId={currentId}
              customerName={form.customer_name}
              customerPhone={form.customer_phone}
              customerEmail={form.customer_email}
              customerSig={debouncedCustSig}
              canConvert={canCreate}
            />
          )}

          {/* Share URL + preview — only shows after the quote is saved. */}
          {currentId && quoteData?.share_token && (
            <section className="bg-card border border-border rounded-xl p-4">
              <h2 className="text-sm font-bold mb-2">Customer Share Link</h2>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrlFor(quoteData.share_token)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 border border-input rounded-lg px-3 py-2 text-[11px] bg-muted/40 font-mono"
                />
                <button
                  onClick={async () => {
                    const ok = await copyToClipboard(shareUrlFor(quoteData.share_token));
                    toast[ok ? "success" : "error"](ok ? "Share URL copied" : "Could not copy");
                  }}
                  className="inline-flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-xs font-semibold hover:bg-muted"
                  title="Copy"
                >
                  <CopyIcon className="w-3.5 h-3.5" />
                </button>
                <a
                  href={shareUrlFor(quoteData.share_token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-xs font-semibold hover:bg-muted"
                  title="Open customer preview in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-[11px] text-text-med">
                <div>Views: <span className="font-semibold text-foreground">{quoteData.view_count ?? 0}</span></div>
                {quoteData.last_viewed_at && (
                  <div>Last viewed: <span className="font-semibold text-foreground">{new Date(quoteData.last_viewed_at).toLocaleString()}</span></div>
                )}
                {quoteData.converted_order_id && (
                  <div className="col-span-2 text-green-700">Converted into order #{quoteData.converted_order_id}</div>
                )}
              </div>
            </section>
          )}

          {/* Actions */}
          <section className="bg-card border border-border rounded-xl p-4 space-y-2">
            <button
              onClick={handleSaveDraft}
              disabled={!canEdit || upsertQuote.isPending || !phoneValid}
              title={!phoneValid ? PHONE_REQUIRED_MSG : undefined}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-card border border-border px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted disabled:opacity-40"
            >
              Save Draft
            </button>
            <button
              onClick={handleSaveAndDownload}
              disabled={!canEdit || upsertQuote.isPending || pdfBusy || !phoneValid}
              title={!phoneValid ? PHONE_REQUIRED_MSG : undefined}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-40"
            >
              {pdfBusy ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF…</>
              ) : (
                <><Download className="w-4 h-4" /> Save & Download PDF</>
              )}
            </button>
            {canCreate && (
              <button
                onClick={() => duplicateInEditor.mutate()}
                disabled={!currentId || duplicateInEditor.isPending}
                title={!currentId ? "Save before duplicating" : "Create a fresh draft with the same line items"}
                className="w-full inline-flex items-center justify-center gap-1.5 bg-card border border-border px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {duplicateInEditor.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Files className="w-4 h-4" />
                )}
                Duplicate
              </button>
            )}
            <button
              onClick={onClose}
              className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground py-2"
            >
              Cancel
            </button>

            {currentId && canEdit && (
              <div className="border-t border-border pt-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med">Workflow</p>
                {quoteData?.share_token && (
                  <button
                    onClick={async () => {
                      const url = shareUrlFor(quoteData.share_token);
                      try {
                        // navigator.clipboard is the modern path; falls
                        // back to a sync copyToClipboard helper only if
                        // unavailable (older browsers, http contexts).
                        if (navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(url);
                        } else {
                          await copyToClipboard(url);
                        }
                        toast.success("Quote link copied");
                      } catch {
                        toast.error("Could not copy link");
                      }
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 bg-card border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted"
                    title="Copy the customer-facing share link to share via WhatsApp etc."
                  >
                    <CopyIcon className="w-3.5 h-3.5" /> Copy share link
                  </button>
                )}
                {form.status !== "converted" && form.status !== "declined" && form.customer_email && (
                  <button onClick={() => setEditorSend(true)} className="w-full inline-flex items-center justify-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700">
                    <Send className="w-3.5 h-3.5" /> Send to Customer
                  </button>
                )}
                {form.status !== "converted" && form.status !== "declined" && (
                  <button onClick={() => setEditorConvert(true)} className="w-full inline-flex items-center justify-center gap-1.5 bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-800">
                    <ShoppingCart className="w-3.5 h-3.5" /> Place Order for Customer
                  </button>
                )}
                {form.status !== "declined" && form.status !== "converted" && (
                  <button onClick={() => handleStatus("declined")} className="w-full inline-flex items-center justify-center gap-1.5 border border-orange-300 text-orange-800 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-orange-50">
                    <XCircle className="w-3.5 h-3.5" /> Mark as Declined
                  </button>
                )}
                <div className="border-t border-border pt-2 mt-2">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med mb-1.5">Status overrides</p>
                  {form.status !== "sent" && (
                    <button onClick={() => handleStatus("sent")} className="w-full inline-flex items-center justify-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted mb-1.5">
                      <Send className="w-3.5 h-3.5" /> Mark as Sent
                    </button>
                  )}
                  {form.status !== "archived" && (
                    <button onClick={() => handleStatus("archived")} className="w-full inline-flex items-center justify-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted mb-1.5">
                      <Archive className="w-3.5 h-3.5" /> Archive
                    </button>
                  )}
                  {form.status !== "draft" && form.status !== "converted" && (
                    <button onClick={() => handleStatus("draft")} className="w-full inline-flex items-center justify-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted">
                      Reset to Draft
                    </button>
                  )}
                </div>
                {canDelete && form.status === "draft" && (
                  <button onClick={handleDelete} className="w-full inline-flex items-center justify-center gap-1.5 border border-destructive/30 text-destructive px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-destructive/10 mt-2">
                    <Trash2 className="w-3.5 h-3.5" /> Delete Quote
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Skip-gift-wrap confirmation — same component as customer
          checkout, with identical copy. Opens only when unchecking
          would override the auto-rule. */}
      {confirmSkipGiftWrap && (
        <SkipGiftWrapConfirmModal
          onKeep={() => setConfirmSkipGiftWrap(false)}
          onSkip={() => {
            setGiftWrap.mutate(false);
            setConfirmSkipGiftWrap(false);
          }}
        />
      )}

      {editorSend && currentId && (
        <SendQuoteDialog
          quoteId={currentId}
          defaultEmail={form.customer_email || ""}
          onClose={() => setEditorSend(false)}
          onSent={() => { refetchQuote(); queryClient.invalidateQueries({ queryKey: ["admin-quotes"] }); }}
        />
      )}
      {editorConvert && currentId && (
        <ConvertQuoteDialog
          quote={{
            id: currentId,
            quote_number: quoteData?.quote_number,
            customer_name: form.customer_name,
            customer_phone: form.customer_phone,
            customer_email: form.customer_email,
            delivery_address: form.delivery_address,
            delivery_city: form.delivery_city,
            delivery_state: form.delivery_state,
          }}
          onClose={() => setEditorConvert(false)}
          onConverted={() => {
            refetchQuote();
            queryClient.invalidateQueries({ queryKey: ["admin-quotes"] });
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Workflow dialogs — Send to Customer + Place Order for Customer.
// ───────────────────────────────────────────────────────────────────
function SendQuoteDialog({
  quoteId, defaultEmail, onClose, onSent,
}: { quoteId: string; defaultEmail: string; onClose: () => void; onSent: () => void }) {
  const [email, setEmail] = useState(defaultEmail);
  const [testMode, setTestMode] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const target = email.trim();
    if (!target || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSending(true);
    try {
      const body: any = { quote_id: quoteId };
      if (testMode) body.test_email = target;
      const { data, error } = await (supabase as any).functions.invoke("send-quote-email", { body });
      if (error) {
        // Unwrap FunctionsHttpError so the admin sees the real reason
        // ("No recipient email…", "Template missing…") instead of the
        // generic "Edge Function returned a non-2xx status code".
        const detail = await describeFunctionError(error);
        throw new Error(detail);
      }
      if (data && data.success === false) {
        throw new Error(data?.error || "Failed to send");
      }
      toast.success(`Quote sent to ${target}`);
      onSent();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to send quote");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-foreground/60 z-[160] flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={() => !sending && onClose()}>
      <div className="bg-card border border-border rounded-xl w-full max-w-[440px] p-5 max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Send Quote</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Send to *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className={inputCls}
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
            <span>Test mode — send to the email above with a [TEST] prefix and don't mark the quote as sent.</span>
          </label>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} disabled={sending} className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-40">Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConvertQuoteDialog({
  quote, onClose, onConverted,
}: {
  quote: any;
  onClose: () => void;
  onConverted: () => void;
}) {
  const [form, setForm] = useState({
    name: quote?.customer_name || "",
    phone: quote?.customer_phone || "",
    email: quote?.customer_email || "",
    address: quote?.delivery_address || "",
    city: quote?.delivery_city || "",
    state: quote?.delivery_state || "",
  });
  const [placing, setPlacing] = useState(false);

  const update = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }));

  const handlePlace = async () => {
    if (!form.name.trim()) { toast.error("Customer name is required"); return; }
    if (!form.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      toast.error("Customer email is required"); return;
    }
    if (!form.address.trim()) { toast.error("Delivery address is required"); return; }
    if (!form.state.trim()) { toast.error("Delivery state is required"); return; }
    setPlacing(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("convert-quote-to-order", {
        body: {
          quote_id: quote.id,
          customer_details: {
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            email: form.email.trim(),
            address: form.address.trim(),
            city: form.city.trim() || null,
            state: form.state.trim(),
          },
          payment_method: "bank_transfer",
        },
      });
      if (error) {
        const detail = await describeFunctionError(error);
        throw new Error(detail);
      }
      if (data && data.success === false) {
        throw new Error(data?.error || "Conversion failed");
      }
      const orderNo = data?.order_number || data?.order?.order_number;
      toast.success(orderNo ? `Order ${orderNo} created` : "Order created");
      onConverted();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Could not place order");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-foreground/60 z-[160] flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={() => !placing && onClose()}>
      <div className="bg-card border border-border rounded-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto p-5 max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Place Order for {quote?.customer_name || "this quote"}</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-text-med mb-3">
          Customer will receive an order confirmation email with bank-transfer instructions. The order stays <strong>pending</strong> until you confirm payment in /admin/orders.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Name *</label>
            <input value={form.name} onChange={(e) => update({ name: e.target.value })} className={inputCls} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input value={form.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="+234 8…" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email *</label>
            <input type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Delivery Address *</label>
            <textarea value={form.address} onChange={(e) => update({ address: e.target.value })} rows={2} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input value={form.city} onChange={(e) => update({ city: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>State *</label>
            <select value={form.state} onChange={(e) => update({ state: e.target.value })} className={inputCls}>
              <option value="">—</option>
              {NG_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 border border-border rounded-lg p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med">Payment Method</p>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" checked readOnly />
            <span>
              <span className="font-semibold">Pending Bank Transfer</span>
              <span className="block text-[11px] text-text-med">Customer receives bank details by email. Confirm payment manually after receipt.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm opacity-50 cursor-not-allowed">
            <input type="radio" disabled />
            <span>Paystack Link <span className="text-[11px]">(Coming soon)</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm opacity-50 cursor-not-allowed">
            <input type="radio" disabled />
            <span>Mark as Paid <span className="text-[11px]">(Coming soon)</span></span>
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} disabled={placing} className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted disabled:opacity-40">Cancel</button>
          <button
            onClick={handlePlace}
            disabled={placing}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-green-800 disabled:opacity-40"
          >
            <ShoppingCart className="w-3.5 h-3.5" /> {placing ? "Placing…" : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
