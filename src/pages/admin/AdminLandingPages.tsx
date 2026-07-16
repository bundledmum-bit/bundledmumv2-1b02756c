import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, X, Copy, ExternalLink, Search, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { fmt } from "@/lib/cart";

// Public origin for the copyable /package/<slug> link. Matches the canonical
// storefront domain used elsewhere in admin share links.
const PUBLIC_ORIGIN = "https://bundledmum.com";

// Optional sectioning, identical to the quote builder (DB CHECK allows these or
// null).
const SECTIONS: Array<{ key: string; label: string }> = [
  { key: "baby", label: "Baby" },
  { key: "mother", label: "Mother" },
  { key: "hospital", label: "Hospital" },
  { key: "postpartum", label: "Postpartum" },
  { key: "gift", label: "Gift" },
];

interface LandingItem {
  // Local row id (uuid) for React keys; not persisted.
  _key: string;
  product_id: string;
  brand_id: string | null;
  product_name: string;
  brand_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  section: string | null;
}

interface LandingPageRow {
  id: string;
  slug: string;
  title: string;
  intro_text: string | null;
  subtotal: number;
  service_fee: number;
  estimated_delivery_fee: number;
  total: number;
  is_active: boolean;
  view_count: number;
  created_at: string;
  landing_page_items?: Array<{ count: number }>;
}

function localKey(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `k_${Math.random().toString(36).slice(2)}`;
}

// ─── Product search (reuses the quote builder's pinned-FK query) ───────────────
function useProductSearch(term: string) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: ["landing-product-search", trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, subcategory, brands!brands_product_id_fkey!inner(id, brand_name, price, in_stock)")
        .eq("is_active", true)
        .eq("brands.in_stock", true)
        .gt("brands.price", 0)
        .ilike("name", `%${trimmed}%`)
        .limit(15);
      if (error) throw error;
      const rows: Array<{ productId: string; productName: string; brandId: string; brandName: string; price: number }> = [];
      (data || []).forEach((p: any) => {
        (p.brands || []).forEach((b: any) => {
          rows.push({ productId: p.id, productName: p.name, brandId: b.id, brandName: b.brand_name, price: b.price });
        });
      });
      return rows;
    },
  });
}

// ─── Form ──────────────────────────────────────────────────────────────────────
function LandingPageForm({
  initial,
  onClose,
}: {
  initial: LandingPageRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { adminUser } = usePermissions();

  const [title, setTitle] = useState(initial?.title || "");
  const [urlText, setUrlText] = useState(initial?.title || "");
  const [slug, setSlug] = useState(initial?.slug || "");
  const [slugBusy, setSlugBusy] = useState(false);
  const [introText, setIntroText] = useState(initial?.intro_text || "");
  const [serviceFee, setServiceFee] = useState(String(initial?.service_fee ?? 0));
  const [deliveryFee, setDeliveryFee] = useState(String(initial?.estimated_delivery_fee ?? 0));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [items, setItems] = useState<LandingItem[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  // Tracks whether the admin has edited the URL text away from what produced the
  // current slug, so an edit only regenerates the slug when intended.
  const slugSourceRef = useRef<string>(initial?.title || "");

  // Load existing items when editing.
  const { data: existingItems } = useQuery({
    queryKey: ["landing-page-items-admin", initial?.id],
    enabled: !!initial?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_page_items")
        .select("*")
        .eq("landing_page_id", initial!.id)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!existingItems) return;
    setItems(
      (existingItems as any[]).map((it) => ({
        _key: localKey(),
        product_id: it.product_id,
        brand_id: it.brand_id,
        product_name: it.product_name,
        brand_name: it.brand_name,
        size: it.size,
        color: it.color,
        quantity: it.quantity,
        unit_price: it.unit_price,
        section: it.section,
      })),
    );
  }, [existingItems]);

  const { data: searchRows = [], isFetching: searching } = useProductSearch(productSearch);

  // Slug generation via the DB RPC. Called on URL-text blur (preview) and before
  // save. Keeps the existing slug on edit unless the URL text changed.
  const computeSlug = async (): Promise<string> => {
    const source = (urlText.trim() || title.trim());
    if (!source) return slug;
    // On edit, if the URL text still matches what produced the slug, keep it.
    if (initial && slug && source === slugSourceRef.current) return slug;
    setSlugBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("generate_landing_page_slug", { p_text: source });
      if (error) throw error;
      const next = String(data || "");
      if (next) {
        setSlug(next);
        slugSourceRef.current = source;
      }
      return next || slug;
    } catch (e: any) {
      console.error("[landing] slug generation failed", e);
      return slug;
    } finally {
      setSlugBusy(false);
    }
  };

  const subtotal = useMemo(() => items.reduce((s, it) => s + it.unit_price * it.quantity, 0), [items]);
  const serviceFeeNum = parseInt(serviceFee, 10) || 0;
  const deliveryFeeNum = parseInt(deliveryFee, 10) || 0;
  const total = Math.max(0, subtotal + serviceFeeNum + deliveryFeeNum);

  const addProduct = (row: { productId: string; productName: string; brandId: string; brandName: string; price: number }) => {
    setItems((prev) => [
      ...prev,
      {
        _key: localKey(),
        product_id: row.productId,
        brand_id: row.brandId,
        product_name: row.productName,
        brand_name: row.brandName,
        size: null,
        color: null,
        quantity: 1,
        unit_price: row.price,
        section: activeSection,
      },
    ]);
  };

  const patchItem = (key: string, patch: Partial<LandingItem>) =>
    setItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  const removeItem = (key: string) => setItems((prev) => prev.filter((it) => it._key !== key));

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");
      const finalSlug = await computeSlug();
      if (!finalSlug) throw new Error("Could not generate a URL slug");

      const payload = {
        slug: finalSlug,
        title: title.trim(),
        intro_text: introText.trim() || null,
        subtotal,
        service_fee: serviceFeeNum,
        estimated_delivery_fee: deliveryFeeNum,
        total,
        is_active: isActive,
      };

      let pageId = initial?.id;
      if (pageId) {
        const { error } = await (supabase as any).from("landing_pages").update(payload).eq("id", pageId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("landing_pages")
          .insert({ ...payload, created_by: adminUser?.id || null })
          .select("id")
          .single();
        if (error) throw error;
        pageId = data.id;
      }

      // Items: delete-and-reinsert.
      const { error: delErr } = await (supabase as any).from("landing_page_items").delete().eq("landing_page_id", pageId);
      if (delErr) throw delErr;
      if (items.length > 0) {
        const rows = items.map((it, idx) => ({
          landing_page_id: pageId,
          product_id: it.product_id,
          brand_id: it.brand_id,
          product_name: it.product_name,
          brand_name: it.brand_name,
          size: it.size,
          color: it.color,
          quantity: Math.max(1, Math.floor(it.quantity) || 1),
          unit_price: it.unit_price,
          line_total: it.unit_price * Math.max(1, Math.floor(it.quantity) || 1),
          display_order: idx,
          section: it.section,
        }));
        const { error: insErr } = await (supabase as any).from("landing_page_items").insert(rows);
        if (insErr) throw insErr;
      }
      return pageId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-landing-pages"] });
      toast.success(initial ? "Landing page updated" : "Landing page created");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Could not save landing page"),
  });

  const packageUrl = slug ? `${PUBLIC_ORIGIN}/package/${slug}` : "";

  return (
    <div className="fixed inset-0 z-[200] bg-foreground/50 flex items-stretch md:items-center justify-center md:p-4" onClick={onClose}>
      <div
        className="bg-card w-full md:max-w-[720px] md:rounded-2xl md:max-h-[92vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-5 py-3.5 flex items-center justify-between z-10">
          <h2 className="pf text-lg font-bold">{initial ? "Edit landing page" : "New landing page"}</h2>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 grid place-items-center rounded-full hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                // Keep the URL text in step until the admin edits it directly.
                if (!initial && (urlText === "" || urlText === title)) setUrlText(e.target.value);
              }}
              placeholder="Newborn Starter Package"
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>

          {/* URL text + slug preview */}
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">
              URL text <span className="font-normal text-text-light">(used for the link)</span>
            </label>
            <input
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              onBlur={() => void computeSlug()}
              placeholder="newborn-starter-package"
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
            />
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-light">
              {slugBusy ? (
                <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Generating link…</span>
              ) : slug ? (
                <span className="font-mono break-all">{packageUrl}</span>
              ) : (
                <span>The link appears once you enter a title.</span>
              )}
            </div>
          </div>

          {/* Intro text */}
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Page text</label>
            <textarea
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              rows={3}
              placeholder="Everything a new mum needs, in one ready package."
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-y"
            />
          </div>

          {/* Items builder */}
          <div className="border border-border rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-light">Items</span>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                <span className="text-[11px] text-text-light mr-1">Add to:</span>
                <button
                  onClick={() => setActiveSection(null)}
                  className={`text-[11px] px-2 py-1 rounded-full border ${activeSection === null ? "bg-forest text-white border-forest" : "border-border text-text-med"}`}
                >
                  None
                </button>
                {SECTIONS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setActiveSection(s.key)}
                    className={`text-[11px] px-2 py-1 rounded-full border ${activeSection === s.key ? "bg-forest text-white border-forest" : "border-border text-text-med"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Product search */}
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-text-light absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products to add (min 2 characters)"
                className="w-full border border-input rounded-lg pl-9 pr-3 py-2 text-sm bg-background"
              />
              {productSearch.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto z-20">
                  {searching && <div className="px-3 py-2 text-xs text-text-light">Searching…</div>}
                  {!searching && searchRows.length === 0 && <div className="px-3 py-2 text-xs text-text-light">No products found.</div>}
                  {searchRows.map((row, i) => (
                    <button
                      key={`${row.productId}-${row.brandId}-${i}`}
                      onClick={() => { addProduct(row); setProductSearch(""); }}
                      className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0">
                        <span className="text-sm font-medium truncate block">{row.productName}</span>
                        <span className="text-[11px] text-text-light">{row.brandName}</span>
                      </span>
                      <span className="text-xs font-semibold shrink-0">{fmt(row.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Item rows */}
            {items.length === 0 ? (
              <p className="text-xs text-text-light py-3 text-center">No items yet. Search above to add products.</p>
            ) : (
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it._key} className="border border-border rounded-lg p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{it.product_name}</p>
                        <p className="text-[11px] text-text-light">{it.brand_name} · {fmt(it.unit_price)}</p>
                      </div>
                      <button onClick={() => removeItem(it._key)} aria-label="Remove item" className="text-text-light hover:text-red-600 shrink-0">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                      <div>
                        <label className="text-[10px] text-text-light block mb-0.5">Qty</label>
                        <input
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={(e) => patchItem(it._key, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          className="w-full border border-input rounded-md px-2 py-1 text-sm bg-background"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-light block mb-0.5">Size</label>
                        <input
                          value={it.size || ""}
                          onChange={(e) => patchItem(it._key, { size: e.target.value || null })}
                          placeholder="optional"
                          className="w-full border border-input rounded-md px-2 py-1 text-sm bg-background"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="text-[10px] text-text-light block mb-0.5">Section</label>
                        <select
                          value={it.section || ""}
                          onChange={(e) => patchItem(it._key, { section: e.target.value || null })}
                          className="w-full border border-input rounded-md px-2 py-1 text-sm bg-background"
                        >
                          <option value="">None</option>
                          {SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="text-right text-xs font-semibold mt-1.5">Line: {fmt(it.unit_price * it.quantity)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fees + totals */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Service fee (₦)</label>
              <input value={serviceFee} onChange={(e) => setServiceFee(e.target.value)} inputMode="numeric" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Estimated delivery (₦)</label>
              <input value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} inputMode="numeric" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-text-med">Subtotal</span><span>{fmt(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-text-med">Service fee</span><span>{serviceFeeNum === 0 ? "FREE" : fmt(serviceFeeNum)}</span></div>
            <div className="flex justify-between"><span className="text-text-med">Delivery</span><span>{deliveryFeeNum === 0 ? "FREE" : fmt(deliveryFeeNum)}</span></div>
            <div className="flex justify-between font-bold border-t border-border pt-1 mt-1"><span>Total</span><span className="text-forest">{fmt(total)}</span></div>
          </div>

          {/* Active */}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-forest" />
            <span className="font-semibold text-text-med">Active (visible at the public URL)</span>
          </label>
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border px-5 py-3 flex items-center justify-between gap-3">
          {slug && (
            <a
              href={`/package/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-forest inline-flex items-center gap-1 hover:underline"
            >
              <ExternalLink size={13} /> View page
            </a>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted">Cancel</button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="px-5 py-2 bg-coral text-white rounded-lg text-sm font-bold hover:bg-coral-dark disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function AdminLandingPages() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<LandingPageRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<LandingPageRow | null>(null);

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ["admin-landing-pages"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("landing_pages")
        .select("*, landing_page_items(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as LandingPageRow[]) || [];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: boolean }) => {
      const { error } = await (supabase as any).from("landing_pages").update({ is_active: next }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-landing-pages"] }),
    onError: (e: any) => toast.error(e?.message || "Could not update"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("landing_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-landing-pages"] }); toast.success("Deleted"); setConfirmDelete(null); },
    onError: (e: any) => toast.error(e?.message || "Could not delete"),
  });

  const copyLink = async (slug: string) => {
    const ok = await copyToClipboard(`${PUBLIC_ORIGIN}/package/${slug}`);
    if (ok) toast.success("Link copied");
  };

  const itemCount = (p: LandingPageRow) => p.landing_page_items?.[0]?.count ?? 0;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="pf text-2xl font-bold">Landing Pages</h1>
          <p className="text-sm text-text-med mt-0.5">Shareable /package pages that look like a quote and convert to funnel quotes at checkout.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 bg-coral text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-coral-dark shrink-0"
        >
          <Plus size={16} /> New
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : pages.length === 0 ? (
        <div className="text-center py-16 text-text-med">
          <p className="text-sm">No landing pages yet. Create your first one.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pages.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{p.title}</span>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${p.is_active ? "bg-forest/10 text-forest" : "bg-muted text-text-light"}`}>
                    {p.is_active ? "Live" : "Draft"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[11px] font-mono text-text-light break-all">{PUBLIC_ORIGIN}/package/{p.slug}</span>
                  <button onClick={() => copyLink(p.slug)} aria-label="Copy link" className="text-text-light hover:text-forest shrink-0"><Copy size={12} /></button>
                  <a href={`/package/${p.slug}`} target="_blank" rel="noopener noreferrer" aria-label="Open page" className="text-text-light hover:text-forest shrink-0"><ExternalLink size={12} /></a>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-text-med">
                  <span>{itemCount(p)} item{itemCount(p) === 1 ? "" : "s"}</span>
                  <span>{fmt(p.total)}</span>
                  <span>{p.view_count} view{p.view_count === 1 ? "" : "s"}</span>
                  <span>{fmtDate(p.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-text-med cursor-pointer">
                  <input
                    type="checkbox"
                    checked={p.is_active}
                    onChange={(e) => toggleActive.mutate({ id: p.id, next: e.target.checked })}
                    className="w-4 h-4 accent-forest"
                  />
                  Active
                </label>
                <button onClick={() => setEditing(p)} className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted">Edit</button>
                <button onClick={() => setConfirmDelete(p)} aria-label="Delete" className="w-8 h-8 grid place-items-center rounded-lg border border-border text-text-light hover:text-red-600 hover:border-red-300"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <LandingPageForm
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[210] bg-foreground/50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-[380px] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-1">Delete landing page?</h3>
            <p className="text-xs text-text-med leading-relaxed">This removes "{confirmDelete.title}" and its items. Quotes already created from it are not affected.</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted">Cancel</button>
              <button onClick={() => del.mutate(confirmDelete.id)} disabled={del.isPending} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50">
                {del.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
