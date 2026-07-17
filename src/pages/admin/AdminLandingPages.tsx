import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, X, Copy, CopyPlus, ExternalLink, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { fmt } from "@/lib/cart";
import PackageItemsBuilder, { type AddItemPayload } from "@/components/admin/PackageItemsBuilder";

// Public origin for the copyable /package/<slug> link. Matches the canonical
// storefront domain used elsewhere in admin share links.
const PUBLIC_ORIGIN = "https://bundledmum.com";

interface LandingItem {
  // Local row id (uuid) for React keys + shared-builder update/remove; not
  // persisted (the DB assigns its own on save).
  id: string;
  product_id: string;
  brand_id: string | null;
  product_name: string;
  brand_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
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
  // Per-page timed promotion (server-enforced via landing_promo_discount).
  promo_enabled?: boolean | null;
  promo_label?: string | null;
  promo_discount_type?: "percentage" | "fixed" | null;
  promo_discount_value?: number | null;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
  landing_page_items?: Array<{ count: number }>;
}

function localKey(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `k_${Math.random().toString(36).slice(2)}`;
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
  // Promotion state. datetime-local strings for the pickers (sliced from ISO).
  const [promoEnabled, setPromoEnabled] = useState(initial?.promo_enabled ?? false);
  const [promoLabel, setPromoLabel] = useState(initial?.promo_label || "");
  const [promoType, setPromoType] = useState<"percentage" | "fixed">(initial?.promo_discount_type || "percentage");
  const [promoValue, setPromoValue] = useState(initial?.promo_discount_value != null ? String(initial.promo_discount_value) : "");
  const [promoStartsAt, setPromoStartsAt] = useState(initial?.promo_starts_at ? initial.promo_starts_at.slice(0, 16) : "");
  const [promoEndsAt, setPromoEndsAt] = useState(initial?.promo_ends_at ? initial.promo_ends_at.slice(0, 16) : "");
  // Tracks whether the admin has edited the URL text away from what produced the
  // current slug, so an edit only regenerates the slug when intended.
  const slugSourceRef = useRef<string>(initial?.title || "");

  // Load existing items when editing.
  const { data: existingItems } = useQuery({
    queryKey: ["landing-page-items-admin", initial?.id],
    enabled: !!initial?.id,
    // The global default staleTime is 5 min; without these, reopening the editor
    // after a save serves the cached (pre-edit) items. Always fetch fresh on open.
    staleTime: 0,
    refetchOnMount: "always",
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
        id: localKey(),
        product_id: it.product_id,
        brand_id: it.brand_id,
        product_name: it.product_name,
        brand_name: it.brand_name,
        size: it.size,
        color: it.color,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: (it.unit_price || 0) * (it.quantity || 0),
        section: it.section,
      })),
    );
  }, [existingItems]);

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

  // Handlers wired to the shared <PackageItemsBuilder> (same signatures the quote
  // editor uses; here they mutate local state instead of DB rows).
  const handleAddItem = (payload: AddItemPayload) => {
    const qty = Math.max(1, Math.floor(payload.quantity) || 1);
    setItems((prev) => [
      ...prev,
      {
        id: localKey(),
        product_id: payload.productId,
        brand_id: payload.brandId,
        product_name: payload.productName,
        brand_name: payload.brandName,
        size: payload.size || null,
        color: null,
        quantity: qty,
        unit_price: payload.price,
        line_total: payload.price * qty,
        section: payload.section,
      },
    ]);
  };

  const handleUpdateItem = (id: string, patch: Record<string, any>) =>
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const next = { ...it, ...patch };
      // Keep line_total consistent whenever qty or unit price changes.
      next.line_total = (next.unit_price || 0) * (next.quantity || 0);
      return next;
    }));

  const handleRemoveItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");

      // Promotion validation: when enabled, type + value + end date are required.
      const promoValueNum = parseInt(promoValue, 10);
      if (promoEnabled) {
        if (!(promoValueNum > 0)) throw new Error("Enter a promo discount value");
        if (promoType === "percentage" && (promoValueNum < 1 || promoValueNum > 100)) {
          throw new Error("Promo percentage must be between 1 and 100");
        }
        if (!promoEndsAt) throw new Error("A promo needs an end date (for the countdown)");
      }

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
        // Promotion (integer naira for fixed; percent for percentage).
        promo_enabled: promoEnabled,
        promo_label: promoLabel.trim() || null,
        promo_discount_type: promoEnabled ? promoType : (promoType || null),
        promo_discount_value: promoEnabled ? promoValueNum : (Number.isFinite(promoValueNum) ? promoValueNum : null),
        promo_starts_at: promoStartsAt ? new Date(promoStartsAt).toISOString() : null,
        promo_ends_at: promoEndsAt ? new Date(promoEndsAt).toISOString() : null,
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
    onSuccess: (pageId: string) => {
      queryClient.invalidateQueries({ queryKey: ["admin-landing-pages"] });
      // Invalidate this page's items cache so a reopen shows the saved products,
      // not the stale pre-edit list.
      queryClient.invalidateQueries({ queryKey: ["landing-page-items-admin", pageId] });
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

          {/* Items builder — the SAME shared component the quote admin uses, so
              the two stay identical when it is edited. */}
          <PackageItemsBuilder
            items={items}
            onAddItem={handleAddItem}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
          />

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

          {/* Promotion */}
          <div className="border border-border rounded-xl p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={promoEnabled} onChange={(e) => setPromoEnabled(e.target.checked)} className="w-4 h-4 accent-forest" />
              <span className="font-semibold text-text-med">Enable timed promotion</span>
            </label>
            {promoEnabled && (
              <>
                <div>
                  <label className="text-xs font-semibold text-text-med block mb-1">Promo label</label>
                  <input value={promoLabel} onChange={(e) => setPromoLabel(e.target.value)} placeholder="Launch Week Deal" className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-text-med block mb-1">Discount type</label>
                    <select value={promoType} onChange={(e) => setPromoType(e.target.value as "percentage" | "fixed")} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-text-med block mb-1">Value {promoType === "percentage" ? "(%)" : "(₦)"}</label>
                    <input type="number" value={promoValue} onChange={(e) => setPromoValue(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-text-med block mb-1">Starts at <span className="font-normal text-text-light">(optional)</span></label>
                    <input type="datetime-local" value={promoStartsAt} onChange={(e) => setPromoStartsAt(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                    <p className="text-[10px] text-text-light mt-1">Empty = active immediately.</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-text-med block mb-1">Ends at *</label>
                    <input type="datetime-local" value={promoEndsAt} onChange={(e) => setPromoEndsAt(e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                    <p className="text-[10px] text-text-light mt-1">Required. The countdown ends here.</p>
                  </div>
                </div>
                {(() => {
                  const v = parseInt(promoValue, 10) || 0;
                  const disc = promoType === "percentage" ? Math.floor(subtotal * v / 100) : Math.min(v, subtotal);
                  return (
                    <div className="bg-forest/5 border border-forest/20 rounded-lg p-2.5 text-sm">
                      <div className="flex justify-between"><span className="text-text-med">Promo discount</span><span className="text-forest font-semibold">- {fmt(disc)}</span></div>
                      <div className="flex justify-between font-bold"><span>Discounted total</span><span className="text-forest">{fmt(Math.max(0, total - disc))}</span></div>
                      <p className="text-[10px] text-text-light mt-1">Preview only. The server enforces the time window and the exact discount.</p>
                    </div>
                  );
                })()}
              </>
            )}
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

  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc("duplicate_landing_page", { p_source_id: id });
      if (error) throw error;
      return data as string; // new landing page id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-landing-pages"] });
      // Clear any cached items so the new copy opens fresh.
      queryClient.invalidateQueries({ queryKey: ["landing-page-items-admin"] });
      toast.success("Landing page duplicated");
    },
    onError: (e: any) => toast.error(e?.message || "Could not duplicate"),
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
                <button
                  onClick={() => duplicate.mutate(p.id)}
                  disabled={duplicate.isPending}
                  aria-label="Duplicate"
                  title="Duplicate"
                  className="w-8 h-8 grid place-items-center rounded-lg border border-border text-text-light hover:text-forest hover:border-forest/40 disabled:opacity-50"
                >
                  <CopyPlus size={15} />
                </button>
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
