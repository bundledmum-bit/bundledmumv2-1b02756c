import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText, Plus, Search, Download, Edit2, Trash2, X, ArrowLeft, Send, Archive,
} from "lucide-react";
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
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  archived: "bg-muted text-muted-foreground border-border",
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

  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "editor">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "sent" | "archived">("all");
  const [page, setPage] = useState(0);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["admin-quotes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quotes")
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

  const handleDownload = async (id: string) => {
    try {
      const { data, error } = await (supabase as any)
        .from("quotes")
        .select("*, quote_items(*)")
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
        })),
      };
      const contact: ContactBlock = {
        whatsapp_number: contactSettings?.whatsapp_number,
        bank_name: contactSettings?.bank_name,
        bank_account_name: contactSettings?.bank_account_name,
        bank_account_number: contactSettings?.bank_account_number,
      };
      downloadQuotePdf(pdfQuote, contact);
    } catch (e: any) {
      toast.error(e?.message || "Could not generate PDF");
    }
  };

  if (view === "editor") {
    return (
      <QuoteEditor
        quoteId={editingId}
        onClose={() => { setView("list"); setEditingId(null); }}
        canEdit={canEdit}
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
          {(["all", "draft", "sent", "archived"] as const).map((s) => (
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
                  <th className="text-left px-4 py-3 font-semibold text-text-med">Email</th>
                  <th className="text-right px-4 py-3 font-semibold text-text-med">Total</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-med">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-text-med whitespace-nowrap">Created</th>
                  <th className="text-right px-4 py-3 font-semibold text-text-med">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((q: any) => (
                  <tr key={q.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{q.quote_number}</td>
                    <td className="px-4 py-3 font-semibold">{q.customer_name}</td>
                    <td className="px-4 py-3 text-text-med text-xs">{q.customer_email || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtN(q.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_COLORS[q.status] || STATUS_COLORS.draft}`}>
                        {q.status || "draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-med whitespace-nowrap">{fmtDate(q.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleDownload(q.id)}
                          className="p-1.5 rounded hover:bg-muted"
                          title="Download PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setEditingId(q.id); setView("editor"); }}
                          className="p-1.5 rounded hover:bg-muted"
                          title={canEdit ? "Edit" : "View"}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => {
                              if (confirm(`Delete quote ${q.quote_number}? This cannot be undone.`)) {
                                deleteQuote.mutate(q.id);
                              }
                            }}
                            className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
  internal_notes: string;
  customer_notes: string;
  status: "draft" | "sent" | "archived";
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
  internal_notes: "",
  customer_notes: "",
  status: "draft",
};

function QuoteEditor({
  quoteId,
  onClose,
  canEdit,
  canDelete,
  contactSettings,
}: {
  quoteId: string | null;
  onClose: () => void;
  canEdit: boolean;
  canDelete: boolean;
  contactSettings: Record<string, string>;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<QuoteForm>(BLANK_FORM);
  const [currentId, setCurrentId] = useState<string | null>(quoteId);
  const [productSearch, setProductSearch] = useState("");
  const [pendingSizeProduct, setPendingSizeProduct] = useState<any | null>(null);

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

  useEffect(() => {
    if (!quoteData) return;
    setForm({
      customer_name: quoteData.customer_name || "",
      customer_phone: quoteData.customer_phone || "",
      customer_email: quoteData.customer_email || "",
      delivery_address: quoteData.delivery_address || "",
      delivery_city: quoteData.delivery_city || "",
      delivery_state: quoteData.delivery_state || "",
      service_fee: String(quoteData.service_fee ?? 500),
      estimated_delivery_fee: String(quoteData.estimated_delivery_fee ?? 0),
      internal_notes: quoteData.internal_notes || "",
      customer_notes: quoteData.customer_notes || "",
      status: (quoteData.status as any) || "draft",
    });
  }, [quoteData]);

  const items: any[] = useMemo(
    () => (quoteData?.quote_items || []).slice().sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0)),
    [quoteData],
  );

  const liveSubtotal = items.reduce((s, it) => s + (it.line_total || 0), 0);
  const serviceFeeNum = parseInt(form.service_fee, 10) || 0;
  const deliveryFeeNum = parseInt(form.estimated_delivery_fee, 10) || 0;
  const liveTotal = liveSubtotal + serviceFeeNum + deliveryFeeNum;

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
      const payload = {
        customer_name: next.customer_name.trim(),
        customer_phone: next.customer_phone.trim() || null,
        customer_email: next.customer_email.trim() || null,
        delivery_address: next.delivery_address.trim() || null,
        delivery_city: next.delivery_city.trim() || null,
        delivery_state: next.delivery_state || null,
        service_fee: parseInt(next.service_fee, 10) || 0,
        estimated_delivery_fee: parseInt(next.estimated_delivery_fee, 10) || 0,
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
          .insert(payload)
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
    mutationFn: async ({ id, patch }: { id: string; patch: { quantity?: number; unit_price?: number } }) => {
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

  const handleSelectProduct = async (row: any) => {
    if (!currentId) {
      toast.error("Save the quote's customer details first, then add items.");
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

  const validateForSave = (): string | null => {
    if (!form.customer_name.trim()) return "Customer name is required.";
    return null;
  };

  const handleSaveDraft = async () => {
    const err = validateForSave();
    if (err) { toast.error(err); return; }
    const row = await upsertQuote.mutateAsync(form);
    toast.success(`Quote saved · ${row.quote_number}`);
    onClose();
  };

  const handleSaveAndDownload = async () => {
    const err = validateForSave();
    if (err) { toast.error(err); return; }
    const row = await upsertQuote.mutateAsync(form);
    // Refetch to get the latest items + computed totals after the update trigger.
    const { data, error } = await (supabase as any)
      .from("quotes").select("*, quote_items(*)").eq("id", row.id).single();
    if (error) { toast.error(error.message); return; }
    const orderedItems = (data.quote_items || []).slice().sort(
      (a: any, b: any) => (a.display_order || 0) - (b.display_order || 0),
    );
    downloadQuotePdf(
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
  };

  const handleStatus = async (next: "draft" | "sent" | "archived") => {
    update({ status: next });
    const saved = await upsertQuote.mutateAsync({ ...form, status: next });
    toast.success(`Marked as ${next}`);
    void saved;
  };

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
            <h2 className="text-sm font-bold mb-3">Customer Details</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Customer Name *</label>
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
                Save the customer details first to start adding products.
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

            {items.length === 0 ? (
              <p className="text-center py-6 text-xs text-muted-foreground">No items yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-2 py-2 text-xs font-semibold text-text-med">Product</th>
                      <th className="text-left px-2 py-2 text-xs font-semibold text-text-med">Size</th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-text-med w-20">Qty</th>
                      <th className="text-right px-2 py-2 text-xs font-semibold text-text-med w-28">Unit ₦</th>
                      <th className="text-right px-2 py-2 text-xs font-semibold text-text-med w-28">Line Total</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-2 py-2">
                          <div className="font-semibold">{it.product_name}</div>
                          {it.brand_name && <div className="text-[11px] text-muted-foreground">{it.brand_name}</div>}
                        </td>
                        <td className="px-2 py-2 text-xs text-text-med">{it.size || "—"}</td>
                        <td className="px-2 py-2">
                          <input
                            type="number" min={1}
                            defaultValue={it.quantity}
                            onBlur={(e) => {
                              const v = Math.max(1, parseInt(e.target.value, 10) || 1);
                              if (v !== it.quantity) updateItem.mutate({ id: it.id, patch: { quantity: v } });
                            }}
                            className="w-full border border-input rounded px-2 py-1 text-sm bg-background text-center"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number" min={0}
                            defaultValue={it.unit_price}
                            onBlur={(e) => {
                              const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                              if (v !== it.unit_price) updateItem.mutate({ id: it.id, patch: { unit_price: v } });
                            }}
                            className="w-full border border-input rounded px-2 py-1 text-sm bg-background text-right"
                            disabled={!canEdit}
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">{fmtN(it.line_total)}</td>
                        <td className="px-2 py-2 text-right">
                          {canEdit && (
                            <button onClick={() => removeItem.mutate(it.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={4} className="px-2 py-2 text-right text-xs font-semibold text-text-med">Subtotal</td>
                      <td className="px-2 py-2 text-right font-bold">{fmtN(liveSubtotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
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
          <section className="bg-card border border-border rounded-xl p-4 lg:sticky lg:top-4">
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
              <div className="border-t border-border pt-3 flex justify-between items-baseline">
                <span className="font-bold text-forest">GRAND TOTAL</span>
                <span className="text-xl font-bold text-forest">{fmtN(liveTotal)}</span>
              </div>
            </div>
          </section>

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
              disabled={!canEdit || upsertQuote.isPending}
              className="w-full inline-flex items-center justify-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-40"
            >
              <Download className="w-4 h-4" /> Save & Download PDF
            </button>
            <button
              onClick={onClose}
              className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground py-2"
            >
              Cancel
            </button>

            {currentId && canEdit && (
              <div className="border-t border-border pt-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med">Status</p>
                {form.status !== "sent" && (
                  <button onClick={() => handleStatus("sent")} className="w-full inline-flex items-center justify-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted">
                    <Send className="w-3.5 h-3.5" /> Mark as Sent
                  </button>
                )}
                {form.status !== "archived" && (
                  <button onClick={() => handleStatus("archived")} className="w-full inline-flex items-center justify-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted">
                    <Archive className="w-3.5 h-3.5" /> Archive
                  </button>
                )}
                {form.status !== "draft" && (
                  <button onClick={() => handleStatus("draft")} className="w-full inline-flex items-center justify-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-muted">
                    Reset to Draft
                  </button>
                )}
                {canDelete && (
                  <button onClick={handleDelete} className="w-full inline-flex items-center justify-center gap-1.5 border border-destructive/30 text-destructive px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-destructive/10 mt-2">
                    <Trash2 className="w-3.5 h-3.5" /> Delete Quote
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

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
    </div>
  );
}
