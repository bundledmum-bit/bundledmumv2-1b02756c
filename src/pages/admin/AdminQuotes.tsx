import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Download, Edit2, Trash2, X, ArrowLeft, Send, Archive,
  Copy as CopyIcon, ExternalLink, ShoppingCart, XCircle, Lock, Package, Loader2,
  Files,
} from "lucide-react";
import ImageZoomModal from "@/components/admin/ImageZoomModal";
import { getBrandImage } from "@/lib/brandImage";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { downloadQuotePdf, type QuoteForPdf, type ContactBlock } from "@/lib/quotePdf";

const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
const labelCls = "text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1";

const NG_STATES = [
  "Lagos", "Abuja (FCT)", "Ogun", "Oyo", "Rivers", "Kano", "Kaduna", "Anambra",
  "Enugu", "Edo", "Delta", "Cross River", "Akwa Ibom", "Imo", "Abia", "Plateau",
  "Bayelsa", "Sokoto", "Kebbi", "Niger", "Kwara", "Osun", "Ondo", "Ekiti",
  "Borno", "Gombe", "Adamawa", "Yobe", "Bauchi", "Taraba", "Benue", "Nasarawa",
  "Jigawa", "Katsina", "Zamfara", "Kogi", "Ebonyi",
];

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-700 border-gray-200",
  sent:      "bg-blue-100 text-blue-700 border-blue-200",
  viewed:    "bg-indigo-100 text-indigo-700 border-indigo-200",
  accepted:  "bg-amber-100 text-amber-800 border-amber-200",
  converted: "bg-green-100 text-green-700 border-green-200",
  declined:  "bg-red-100 text-red-700 border-red-200",
  expired:   "bg-orange-100 text-orange-700 border-orange-200",
  archived:  "bg-muted text-muted-foreground border-border",
};

type QuoteStatus = "all" | "draft" | "sent" | "viewed" | "accepted" | "converted" | "declined" | "expired" | "archived";
const STATUS_TABS: QuoteStatus[] = ["all", "draft", "sent", "viewed", "accepted", "converted", "declined", "expired", "archived"];

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

const fmtN = (n: number | null | undefined) =>
  typeof n === "number" && isFinite(n) ? `₦${Math.round(n).toLocaleString()}` : "₦0";

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
    } catch (e: any) {
      toast.error(e?.message || "Could not generate PDF");
    } finally {
      setDownloadingId(null);
    }
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
        {canEdit && (
          <button
            onClick={() => { setEditingId(null); setView("editor"); }}
            className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep"
          >
            <Plus className="w-4 h-4" /> New Quote
          </button>
        )}
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
        <div className="text-center py-12 text-text-med text-sm">Loading quotes…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl text-text-med text-sm">
          {(quotes as any[]).length === 0
            ? `No quotes yet. ${canEdit ? "Click + New Quote to draft your first one." : ""}`
            : "No quotes match your filters."}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
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
  const [productSearch, setProductSearch] = useState("");
  const [pendingSizeProduct, setPendingSizeProduct] = useState<any | null>(null);
  const [itemSearchRaw, setItemSearchRaw] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
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
    customer_phone: f.customer_phone.trim() || null,
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
  }, [form, currentId, canEdit]);

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
  const liveTotal = Math.max(0, liveSubtotal + serviceFeeNum + deliveryFeeNum - discountNum);

  // Debounce the item-search input (~150 ms) — purely client-side filter.
  useEffect(() => {
    const t = setTimeout(() => setItemSearch(itemSearchRaw), 150);
    return () => clearTimeout(t);
  }, [itemSearchRaw]);

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
        .select("id, brand_name, product_id, image_url, stored_image_url, images, price, sku, in_stock")
        .in("product_id", productIds)
        .order("brand_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: variantSizes = [] } = useQuery({
    queryKey: ["quote-variant-sizes", variantQueryKey],
    enabled: productIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_sizes")
        .select("id, product_id, size_label, in_stock")
        .in("product_id", productIds)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: variantColors = [] } = useQuery({
    queryKey: ["quote-variant-colors", variantQueryKey],
    enabled: productIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_colors")
        .select("id, product_id, color_name, color_hex, in_stock")
        .in("product_id", productIds)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const brandsByProduct = useMemo(() => {
    const map = new Map<string, any[]>();
    (variantBrands as any[]).forEach((b: any) => {
      if (!map.has(b.product_id)) map.set(b.product_id, []);
      map.get(b.product_id)!.push(b);
    });
    return map;
  }, [variantBrands]);

  const sizesByProduct = useMemo(() => {
    const map = new Map<string, any[]>();
    (variantSizes as any[]).forEach((s: any) => {
      if (!map.has(s.product_id)) map.set(s.product_id, []);
      map.get(s.product_id)!.push(s);
    });
    return map;
  }, [variantSizes]);

  const colorsByProduct = useMemo(() => {
    const map = new Map<string, any[]>();
    (variantColors as any[]).forEach((c: any) => {
      if (!map.has(c.product_id)) map.set(c.product_id, []);
      map.get(c.product_id)!.push(c);
    });
    return map;
  }, [variantColors]);

  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return items;
    const q = itemSearch.trim().toLowerCase();
    return (items as any[]).filter((it: any) => {
      if (it.product_name?.toLowerCase().includes(q)) return true;
      if (it.brand_name?.toLowerCase().includes(q)) return true;
      if (it.size?.toLowerCase().includes(q)) return true;
      if (it.color?.toLowerCase().includes(q)) return true;
      const currentBrand = (brandsByProduct.get(it.product_id) || []).find((b: any) => b.id === it.brand_id);
      if (currentBrand?.sku?.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [items, itemSearch, brandsByProduct]);

  // ── Product search ─────────────────────────────────────────────
  const trimmedSearch = productSearch.trim();
  const { data: searchResults = [] } = useQuery({
    queryKey: ["admin-quotes-product-search", trimmedSearch],
    enabled: trimmedSearch.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, subcategory, brands!inner(id, brand_name, price, in_stock)")
        .eq("is_active", true)
        .eq("brands.in_stock", true)
        .gt("brands.price", 0)
        .ilike("name", `%${trimmedSearch}%`)
        .limit(15);
      if (error) throw error;
      // Flatten product × brand → one row per brand variant.
      const rows: Array<{ productId: string; productName: string; subcategory: string | null; brandId: string; brandName: string; price: number }> = [];
      (data || []).forEach((p: any) => {
        (p.brands || []).forEach((b: any) => {
          rows.push({
            productId: p.id, productName: p.name, subcategory: p.subcategory,
            brandId: b.id, brandName: b.brand_name, price: b.price,
          });
        });
      });
      return rows;
    },
  });

  // ── Mutations ──────────────────────────────────────────────────
  const upsertQuote = useMutation({
    mutationFn: async (next: QuoteForm) => {
      const payload: any = {
        customer_name: next.customer_name.trim() || null,
        customer_phone: next.customer_phone.trim() || null,
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
      price: number; size?: string | null;
    }) => {
      if (!currentId) throw new Error("Save the quote first");
      const { error } = await (supabase as any).from("quote_items").insert({
        quote_id: currentId,
        product_id: item.productId,
        brand_id: item.brandId,
        product_name: item.productName,
        brand_name: item.brandName,
        size: item.size || null,
        quantity: 1,
        unit_price: item.price,
        display_order: items.length,
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

  const handleSelectProduct = async (row: any) => {
    if (!currentId) {
      toast.error("Save the quote first, then add items.");
      return;
    }
    // Check if the product has sizes — if so, open the size picker before adding.
    const { data, error } = await (supabase as any)
      .from("product_sizes")
      .select("size_label, size_code, in_stock")
      .eq("product_id", row.productId)
      .order("display_order");
    if (error) {
      toast.error(error.message);
      return;
    }
    const sizes = (data || []) as Array<{ size_label: string; in_stock: boolean }>;
    if (sizes.length > 0) {
      setPendingSizeProduct({ ...row, sizes });
    } else {
      addItem.mutate({
        productId: row.productId, productName: row.productName,
        brandId: row.brandId, brandName: row.brandName, price: row.price,
      });
      setProductSearch("");
    }
  };

  const handleConfirmSize = (size: string) => {
    if (!pendingSizeProduct) return;
    addItem.mutate({
      productId: pendingSizeProduct.productId,
      productName: pendingSizeProduct.productName,
      brandId: pendingSizeProduct.brandId,
      brandName: pendingSizeProduct.brandName,
      price: pendingSizeProduct.price,
      size,
    });
    setPendingSizeProduct(null);
    setProductSearch("");
  };

  const update = (patch: Partial<QuoteForm>) => setForm((p) => ({ ...p, ...patch }));

  // Customer fields are intentionally optional at the draft/save stage.
  // The Send and Convert modals enforce their own field requirements at
  // the point where the data is actually used (email send / order place).
  const handleSaveDraft = async () => {
    const row = await upsertQuote.mutateAsync(form);
    toast.success(`Quote saved · ${row.quote_number}`);
    onClose();
  };

  const handleSaveAndDownload = async () => {
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

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left column — customer + items + notes */}
        <div className="lg:col-span-2 space-y-4">
          {/* Section A — Customer Details */}
          <section className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-1">Customer Details</h2>
            <p className="text-[11px] text-text-med mb-3 italic">
              Optional at this stage. Required when sending the quote email
              or placing the order on the customer's behalf.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Customer Name</label>
                <input value={form.customer_name} onChange={(e) => update({ customer_name: e.target.value })} className={inputCls} disabled={!canEdit} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input value={form.customer_phone} onChange={(e) => update({ customer_phone: e.target.value })} placeholder="+234 8…" className={inputCls} disabled={!canEdit} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={form.customer_email} onChange={(e) => update({ customer_email: e.target.value })} className={inputCls} disabled={!canEdit} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Delivery Address</label>
                <textarea value={form.delivery_address} onChange={(e) => update({ delivery_address: e.target.value })} rows={2} className={inputCls} disabled={!canEdit} />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input value={form.delivery_city} onChange={(e) => update({ delivery_city: e.target.value })} className={inputCls} disabled={!canEdit} />
              </div>
              <div>
                <label className={labelCls}>State</label>
                <select value={form.delivery_state} onChange={(e) => update({ delivery_state: e.target.value })} className={inputCls} disabled={!canEdit}>
                  <option value="">—</option>
                  {NG_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Section B — Items */}
          <section className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-bold mb-3">Line Items</h2>
            {!currentId && (
              <p className="text-xs text-muted-foreground mb-2 italic">
                Save the quote first to start adding products.
              </p>
            )}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products by name…"
                className="w-full border border-input rounded-lg pl-9 pr-3 py-2 text-sm bg-background"
                disabled={!canEdit || !currentId}
              />
              {trimmedSearch.length >= 2 && searchResults.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-72 overflow-y-auto">
                  {searchResults.map((r: any) => (
                    <button
                      key={`${r.productId}-${r.brandId}`}
                      onClick={() => handleSelectProduct(r)}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm border-b border-border last:border-0"
                    >
                      <span className="font-semibold">{r.productName}</span>
                      <span className="text-muted-foreground"> — {r.brandName}</span>
                      <span className="float-right font-semibold text-forest">{fmtN(r.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search/filter within existing items */}
            {items.length > 0 && (
              <div className="mt-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    value={itemSearchRaw}
                    onChange={(e) => setItemSearchRaw(e.target.value)}
                    placeholder="Search items in this quote…"
                    className="w-full border border-input rounded-lg pl-9 pr-8 py-2 text-sm bg-background"
                  />
                  {itemSearchRaw && (
                    <button
                      type="button"
                      onClick={() => { setItemSearchRaw(""); setItemSearch(""); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {itemSearchRaw && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Showing {filteredItems.length} of {items.length} items
                  </p>
                )}
              </div>
            )}

            {items.length === 0 ? (
              <p className="text-center py-6 text-xs text-muted-foreground">No items yet.</p>
            ) : filteredItems.length === 0 ? (
              <div className="mt-4 py-6 text-center text-xs text-muted-foreground">
                No items match &ldquo;{itemSearchRaw}&rdquo;.{" "}
                <button
                  type="button"
                  onClick={() => { setItemSearchRaw(""); setItemSearch(""); }}
                  className="text-forest underline hover:no-underline"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {filteredItems.map((it: any) => (
                  <QuoteLineItemCard
                    key={it.id}
                    it={it}
                    canEdit={canEdit}
                    brands={brandsByProduct.get(it.product_id) || []}
                    sizes={sizesByProduct.get(it.product_id) || []}
                    colors={colorsByProduct.get(it.product_id) || []}
                    isPending={updateItem.isPending || removeItem.isPending}
                    onUpdate={(patch) => updateItem.mutate({ id: it.id, patch })}
                    onRemove={() => removeItem.mutate(it.id)}
                    onZoom={setZoomSrc}
                  />
                ))}
              </div>
            )}

            {/* Subtotal always reflects ALL items, not the filtered set */}
            {items.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border flex justify-end gap-4 text-sm">
                <span className="text-text-med font-semibold">Subtotal</span>
                <span className="font-bold">{fmtN(liveSubtotal)}</span>
              </div>
            )}
          </section>

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
                <label className={labelCls}>Service & Packaging (₦)</label>
                <input type="number" min={0} value={form.service_fee} onChange={(e) => update({ service_fee: e.target.value })} className={inputCls} disabled={!canEdit} />
              </div>
              <div>
                <label className={labelCls}>Estimated Delivery (₦)</label>
                <input type="number" min={0} value={form.estimated_delivery_fee} onChange={(e) => update({ estimated_delivery_fee: e.target.value })} className={inputCls} disabled={!canEdit} />
              </div>
              <div>
                <label className={labelCls}>Delivery Fee Override (₦) <span className="text-text-light font-normal">optional</span></label>
                <input
                  type="number"
                  min={0}
                  value={form.delivery_fee_override}
                  onChange={(e) => update({ delivery_fee_override: e.target.value })}
                  placeholder="Leave empty to use estimated"
                  className={inputCls}
                  disabled={!canEdit}
                />
                <p className="text-[10px] text-text-light mt-1">Wins over the estimate when set. Leave empty for auto.</p>
              </div>
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
              <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-text-med">
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
              disabled={!canEdit || upsertQuote.isPending}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-card border border-border px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted disabled:opacity-40"
            >
              Save Draft
            </button>
            <button
              onClick={handleSaveAndDownload}
              disabled={!canEdit || upsertQuote.isPending || pdfBusy}
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

      {/* Image zoom modal */}
      <ImageZoomModal src={zoomSrc} onClose={() => setZoomSrc(null)} />

      {/* Size picker modal */}
      {pendingSizeProduct && (
        <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center p-4" onClick={() => setPendingSizeProduct(null)}>
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">Select a size</h3>
              <button onClick={() => setPendingSizeProduct(null)}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-text-med mb-3">{pendingSizeProduct.productName} · {pendingSizeProduct.brandName}</p>
            <div className="flex flex-wrap gap-2">
              {pendingSizeProduct.sizes.map((s: any) => (
                <button
                  key={s.size_label}
                  onClick={() => handleConfirmSize(s.size_label)}
                  disabled={s.in_stock === false}
                  className={`min-h-[40px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] ${s.in_stock === false ? "opacity-40 cursor-not-allowed line-through" : "border-border bg-card hover:border-forest"}`}
                  title={s.in_stock === false ? "Out of stock" : ""}
                >
                  {s.size_label}
                </button>
              ))}
            </div>
          </div>
        </div>
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
// Per-item card with inline brand/size/color editing
// ───────────────────────────────────────────────────────────────────
interface LineItemCardProps {
  it: any;
  canEdit: boolean;
  brands: any[];
  sizes: any[];
  colors: any[];
  isPending: boolean;
  onUpdate: (patch: Record<string, any>) => void;
  onRemove: () => void;
  onZoom: (src: string) => void;
}

function QuoteLineItemCard({ it, canEdit, brands, sizes, colors, isPending, onUpdate, onRemove, onZoom }: LineItemCardProps) {
  const currentBrand = brands.find((b: any) => b.id === it.brand_id) ?? null;
  const imgSrc: string | null =
    getBrandImage(currentBrand) ||
    (Array.isArray(currentBrand?.images) && currentBrand.images.length > 0 ? currentBrand.images[0] : null) ||
    null;
  const isOos = currentBrand != null && currentBrand.in_stock === false;

  return (
    <div className={`border border-border rounded-lg p-3 relative transition-opacity ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex gap-3">
        {/* Thumbnail — click to zoom */}
        <div className="shrink-0">
          {imgSrc ? (
            <button
              type="button"
              onClick={() => onZoom(imgSrc)}
              className="w-24 h-24 rounded-lg overflow-hidden border border-border block hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-forest"
              title="Click to zoom"
            >
              <img src={imgSrc} alt={it.product_name} className="w-full h-full object-cover" />
            </button>
          ) : (
            <div className="w-24 h-24 rounded-lg bg-muted/40 border border-border flex items-center justify-center text-muted-foreground">
              <Package className="w-8 h-8 opacity-30" />
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Product name + SKU */}
          <div>
            <div className="font-semibold text-sm leading-tight">{it.product_name}</div>
            {currentBrand?.sku && (
              <div className="text-[11px] text-muted-foreground mt-0.5">SKU: {currentBrand.sku}</div>
            )}
          </div>

          {/* Brand selector */}
          {it.product_id && brands.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-text-med font-semibold w-10 shrink-0">Brand</span>
              {brands.length === 1 ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted border border-border">
                  {it.brand_name || brands[0]?.brand_name}
                  <span className="text-muted-foreground ml-1">(only option)</span>
                </span>
              ) : (
                <select
                  disabled={!canEdit}
                  value={it.brand_id || ""}
                  onChange={(e) => {
                    const nb = brands.find((b: any) => b.id === e.target.value);
                    if (!nb) return;
                    onUpdate({ brand_id: nb.id, brand_name: nb.brand_name, unit_price: nb.price });
                  }}
                  className="flex-1 text-xs border border-input rounded px-2 py-1 bg-background min-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {brands.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.brand_name} · {fmtN(b.price)}{b.in_stock === false ? " (Out of stock)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Size selector */}
          {sizes.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-text-med font-semibold w-10 shrink-0">Size</span>
              <select
                disabled={!canEdit}
                value={it.size || ""}
                onChange={(e) => onUpdate({ size: e.target.value || null })}
                className="flex-1 text-xs border border-input rounded px-2 py-1 bg-background min-w-[120px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">— No size —</option>
                {sizes.map((s: any) => (
                  <option key={s.id} value={s.size_label}>
                    {s.size_label}{s.in_stock === false ? " (OOS)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Color selector */}
          {colors.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-text-med font-semibold w-10 shrink-0">Color</span>
              <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                {it.color && colors.find((c: any) => c.color_name === it.color)?.color_hex && (
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-border shrink-0"
                    style={{ backgroundColor: colors.find((c: any) => c.color_name === it.color)?.color_hex }}
                  />
                )}
                <select
                  disabled={!canEdit}
                  value={it.color || ""}
                  onChange={(e) => onUpdate({ color: e.target.value || null })}
                  className="flex-1 text-xs border border-input rounded px-2 py-1 bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">— No color —</option>
                  {colors.map((c: any) => (
                    <option key={c.id} value={c.color_name}>
                      {c.color_name}{c.in_stock === false ? " (OOS)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Qty +/- · unit price · line total */}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!canEdit || it.quantity <= 1}
                onClick={() => onUpdate({ quantity: Math.max(1, it.quantity - 1) })}
                className="w-7 h-7 rounded border border-border flex items-center justify-center text-base font-bold hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >−</button>
              <span className="w-8 text-center text-sm font-semibold">{it.quantity}</span>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onUpdate({ quantity: it.quantity + 1 })}
                className="w-7 h-7 rounded border border-border flex items-center justify-center text-base font-bold hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >+</button>
            </div>
            <div className="text-xs text-text-med">
              Unit:{" "}
              {it.product_id ? (
                <span className="font-semibold text-foreground inline-flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 opacity-50" />
                  {fmtN(it.unit_price)}
                </span>
              ) : (
                <span className="font-semibold text-foreground">{fmtN(it.unit_price)}</span>
              )}
            </div>
            <div className="ml-auto text-sm font-bold text-forest">{fmtN(it.line_total)}</div>
          </div>
        </div>
      </div>

      {/* Out-of-stock warning */}
      {isOos && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          <span aria-hidden="true">⚠️</span>
          <span>This brand is currently out of stock. Confirm availability before sending the quote.</span>
        </div>
      )}

      {/* Remove */}
      {canEdit && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-destructive hover:underline"
          >
            Remove
          </button>
        </div>
      )}

      {/* Pending spinner */}
      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/30">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
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
    <div className="fixed inset-0 bg-foreground/60 z-[160] flex items-center justify-center p-4" onClick={() => !sending && onClose()}>
      <div className="bg-card border border-border rounded-xl w-full max-w-[440px] p-5" onClick={(e) => e.stopPropagation()}>
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
    <div className="fixed inset-0 bg-foreground/60 z-[160] flex items-center justify-center p-4" onClick={() => !placing && onClose()}>
      <div className="bg-card border border-border rounded-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Place Order for {quote?.customer_name || "this quote"}</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-text-med mb-3">
          Customer will receive an order confirmation email with bank-transfer instructions. The order stays <strong>pending</strong> until you confirm payment in /admin/orders.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
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
