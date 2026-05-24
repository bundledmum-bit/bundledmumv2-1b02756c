import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Plus, Trash2 } from "lucide-react";
import ProductImageManager from "@/components/admin/ProductImageManager";
import SEOEditor from "@/components/admin/SEOEditor";
import BrandImageUpload from "@/components/admin/BrandImageUpload";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useProductCategories } from "@/hooks/useProductCategories";
import { useAdminUser } from "@/hooks/useAdminPermissions";
import { useRequestAdminAction, notifyApproval } from "@/hooks/useApprovals";

interface Props {
  product: any | null;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORIES = ["baby", "mum", "both", "push-gift"];
const PRIORITIES = ["essential", "recommended", "nice-to-have"];
const BADGES = ["bestseller", "essential", "new", "popular", "mum-pick"];
const TIERS = ["starter", "standard", "premium"];
const TAG_TYPES = [
  { type: "tier", values: ["starter", "standard", "premium"] },
  { type: "hospital_type", values: ["public", "private"] },
  { type: "delivery_method", values: ["vaginal", "csection"] },
  { type: "scope", values: ["hospital-bag", "general-baby-prep"] },
  { type: "stage", values: ["expecting", "newborn", "0-3m", "3-6m", "6-12m"] },
];

export default function AdminProductForm({ product, onClose, onSaved }: Props) {
  const isEdit = !!product;
  const { data: allCategories = [] } = useProductCategories();
  const { data: adminUser } = useAdminUser();
  const isSuperAdmin = adminUser?.role === "super_admin";
  const requestAction = useRequestAdminAction();
  const [form, setForm] = useState({
    name: product?.name || "", slug: product?.slug || "", emoji: product?.emoji || "",
    description: product?.description || "", category: product?.category || "baby",
    subcategory: product?.subcategory || "",
    priority: product?.priority || "essential", badge: product?.badge || "",
    display_order: product?.display_order || 0, is_active: product?.is_active ?? true,
    pack_count: product?.pack_count || "", material: product?.material || "",
    contents: product?.contents || "", allergen_info: product?.allergen_info || "",
    safety_info: product?.safety_info || "", rating: product?.rating || 4.5,
    review_count: product?.review_count || 0, gender_relevant: product?.gender_relevant || false,
    multiples_bump: product?.multiples_bump || 1.0, first_baby: product?.first_baby,
    why_included: product?.why_included || "", why_included_variants: product?.why_included_variants ? JSON.stringify(product.why_included_variants) : "",
    meta_title: product?.meta_title || "", meta_description: product?.meta_description || "", og_image_url: product?.og_image_url || "",
    scheduled_for: product?.scheduled_for || "",
    long_description: product?.long_description || "",
    how_to_use: product?.how_to_use || "",
    video_url: product?.video_url || "",
    is_out_of_stock: product?.is_out_of_stock ?? false,
  });

  const [brands, setBrands] = useState<any[]>(product?.brands?.map((b: any) => ({ ...b })) || []);
  const [sizes, setSizes] = useState<any[]>(product?.product_sizes?.map((s: any) => ({ ...s })) || []);
  const [colors, setColors] = useState<any[]>(product?.product_colors?.map((c: any) => ({ ...c })) || []);
  const [selectedTags, setSelectedTags] = useState<Record<string, string[]>>(() => {
    const tags = (product?.product_tags || []) as any[];
    const map: Record<string, string[]> = {};
    tags.forEach((t: any) => {
      if (!map[t.tag_type]) map[t.tag_type] = [];
      map[t.tag_type].push(t.tag_value);
    });
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [publishMode, setPublishMode] = useState<"active" | "inactive" | "schedule">(
    product?.scheduled_for ? "schedule" : product?.is_active ? "active" : "inactive"
  );

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleSave = async () => {
    if (!form.name || !form.description) { toast.error("Name and description are required"); return; }
    // weight_kg is required on every brand variant — courier rates are
    // computed per shipped weight, so a missing or zero weight produces
    // wrong delivery quotes.
    const badWeightIdx = brands.findIndex((b: any) => {
      const n = Number(b.weight_kg);
      return !Number.isFinite(n) || n <= 0;
    });
    if (badWeightIdx >= 0) {
      const label = brands[badWeightIdx]?.brand_name?.trim() || `Brand #${badWeightIdx + 1}`;
      toast.error(`Weight is required so courier costs can be calculated correctly. Fix "${label}".`);
      return;
    }
    setSaving(true);
    try {
      const slug = form.slug || autoSlug(form.name);
      let parsedVariants = null;
      if (form.why_included_variants) {
        try { parsedVariants = JSON.parse(form.why_included_variants); } catch { /* ignore */ }
      }
      const productData: Record<string, any> = {
        name: form.name, slug, emoji: form.emoji || null, description: form.description,
        category: form.category, subcategory: form.subcategory || null,
        priority: form.priority, badge: form.badge || null,
        display_order: form.display_order, pack_count: form.pack_count || null,
        material: form.material || null, contents: form.contents || null,
        allergen_info: form.allergen_info || null, safety_info: form.safety_info || null,
        rating: form.rating, review_count: form.review_count, gender_relevant: form.gender_relevant,
        multiples_bump: form.multiples_bump, first_baby: form.first_baby,
        why_included: form.why_included || null, why_included_variants: parsedVariants,
        meta_title: form.meta_title || null, meta_description: form.meta_description || null, og_image_url: form.og_image_url || null,
        long_description: form.long_description || null,
        how_to_use: form.how_to_use || null,
        video_url: form.video_url || null,
        is_active: publishMode === "active",
        scheduled_for: publishMode === "schedule" ? form.scheduled_for : null,
        is_out_of_stock: form.is_out_of_stock,
      };

      let productId: string;
      if (isEdit) {
        const { error } = await supabase.from("products").update(productData as any).eq("id", product.id);
        if (error) throw error;
        productId = product.id;
      } else {
        // INSERT path: super_admins write directly. For everyone else,
        // submit a single approval request capturing the full proposed
        // product (including brands/sizes/colors/tags) and bail out — the
        // super_admin will recreate the product manually after approving.
        if (!isSuperAdmin) {
          const description = `Add product: ${form.name}`;
          const proposedData = {
            product: productData,
            brands,
            sizes,
            colors,
            tags: selectedTags,
          };
          await requestAction.mutateAsync({
            action: "add",
            table: "products",
            proposedData,
            description,
          });
          notifyApproval({
            type: "new_request",
            description,
            action: "add",
            table_name: "products",
            requester_name:
              adminUser?.display_name || adminUser?.email || "Unknown",
            super_admin_email: "iceboxx766@gmail.com",
          });
          toast.success("Add request submitted. Super admin will review shortly.");
          setSaving(false);
          onSaved();
          onClose();
          return;
        }
        const { data, error } = await supabase.from("products").insert(productData as any).select("id").single();
        if (error) throw error;
        productId = data.id;
      }

      // Reconcile brands by id instead of the old delete-then-insert
      // pattern. The destructive pattern would silently duplicate rows
      // whenever the DELETE failed (RLS denial, FK touch from
      // dependent tables, etc.) — that's how a single product
      // accumulated 27 phantom brand rows after repeated in_stock
      // toggles. Existing rows are now UPDATEd in place by id, new
      // rows (no id) are INSERTed, removed rows are DELETEd by id.
      const buildBrandPayload = (b: any, i: number) => {
        const existing: string[] = Array.isArray(b.images) ? b.images.filter(Boolean) : [];
        const images = existing.length > 0 ? existing : (b.image_url ? [b.image_url] : []);
        return {
          product_id: productId,
          brand_name: b.brand_name,
          price: b.price,
          tier: b.tier,
          is_default_for_tier: b.is_default_for_tier || false,
          size_variant: b.size_variant || null,
          display_order: i,
          image_url: b.image_url || images[0] || null,
          logo_url: b.logo_url || null,
          thumbnail_url: b.thumbnail_url || null,
          compare_at_price: b.compare_at_price || null,
          stock_quantity: b.stock_quantity,
          in_stock: b.in_stock ?? true,
          cost_price: b.cost_price || 0,
          weight_range_kg: b.weight_range_kg?.trim?.() || b.weight_range_kg || null,
          pack_count: b.pack_count != null && b.pack_count !== "" ? Number(b.pack_count) : null,
          diaper_type: b.diaper_type || null,
          sku: b.sku?.trim?.() || b.sku || null,
          weight_kg: Number(b.weight_kg),
        };
      };
      const incomingIds = brands.map((b: any) => b.id).filter(Boolean);
      // Delete brands the admin removed from the form (only when
      // editing — fresh inserts have nothing on disk yet).
      if (isEdit) {
        const originalIds: string[] = ((product?.brands as any[]) || []).map((b: any) => b.id).filter(Boolean);
        const removed = originalIds.filter((id) => !incomingIds.includes(id));
        if (removed.length > 0) {
          const { error: delErr } = await supabase.from("brands").delete().in("id", removed);
          if (delErr) throw delErr;
        }
      }
      // Per-row UPDATE for kept rows, INSERT for newly-added rows.
      for (let i = 0; i < brands.length; i++) {
        const b = brands[i];
        const payload = buildBrandPayload(b, i);
        if (b.id) {
          const { error: upErr } = await (supabase.from("brands") as any).update(payload).eq("id", b.id);
          if (upErr) throw upErr;
        } else {
          const { error: insErr } = await (supabase.from("brands") as any).insert(payload);
          if (insErr) throw insErr;
        }
      }

      // Upsert sizes
      if (isEdit) await supabase.from("product_sizes").delete().eq("product_id", productId);
      if (sizes.length > 0) {
        const sizeRows = sizes.map((s, i) => ({
          product_id: productId, size_label: s.size_label, size_code: s.size_code || s.size_label,
          in_stock: s.in_stock ?? true, is_default: s.is_default || false, display_order: i,
        }));
        await supabase.from("product_sizes").insert(sizeRows);
      }

      // Upsert colors
      if (isEdit) await supabase.from("product_colors").delete().eq("product_id", productId);
      if (colors.length > 0) {
        const colorRows = colors.map((c, i) => ({
          product_id: productId, color_name: c.color_name, color_hex: c.color_hex || null,
          in_stock: c.in_stock ?? true, display_order: i,
        }));
        await supabase.from("product_colors").insert(colorRows);
      }

      // Upsert tags
      if (isEdit) await supabase.from("product_tags").delete().eq("product_id", productId);
      const tagRows: any[] = [];
      Object.entries(selectedTags).forEach(([type, values]) => {
        values.forEach(v => tagRows.push({ product_id: productId, tag_type: type, tag_value: v }));
      });
      if (tagRows.length > 0) await supabase.from("product_tags").insert(tagRows);

      toast.success(isEdit ? "Product updated!" : "Product created!");
      onSaved();
    } catch (e: any) { toast.error(e.message || "Failed to save"); } finally { setSaving(false); }
  };

  const toggleTag = (type: string, value: string) => {
    setSelectedTags(prev => {
      const vals = prev[type] || [];
      return { ...prev, [type]: vals.includes(value) ? vals.filter(v => v !== value) : [...vals, value] };
    });
  };

  const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
  const labelCls = "text-xs font-semibold text-text-med block mb-1";

  return (
    <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-start justify-center pt-6 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl w-full max-w-3xl mx-4 mb-10">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="pf text-lg font-bold">{isEdit ? "Edit Product" : "New Product"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-5 h-5" /></button>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full justify-start px-4 pt-2 bg-transparent gap-1 flex-wrap h-auto">
            {["general", "details", "rich-content", "brands", "sizes", "tags", "ratings", "images", "seo"].map(t => (
              <TabsTrigger key={t} value={t} className="text-xs capitalize">{t === "sizes" ? "Sizes & Colours" : t === "rich-content" ? "Rich Content" : t}</TabsTrigger>
            ))}
          </TabsList>

          <div className="p-4 max-h-[65vh] overflow-y-auto">
            <TabsContent value="general" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: f.slug || autoSlug(e.target.value) }))} className={inputCls} /></div>
                <div><label className={labelCls}>Slug</label>
                  <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Description *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inputCls} /></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><label className={labelCls}>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, subcategory: "" }))} className={inputCls}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
                <div><label className={labelCls}>Subcategory</label>
                  <select value={form.subcategory} onChange={e => setForm(f => ({ ...f, subcategory: e.target.value }))} className={inputCls}>
                    <option value="">— Select —</option>
                    {allCategories
                      .filter(c => {
                        if (form.category === "baby") return c.parent_category === "baby" || c.parent_category === "both";
                        if (form.category === "mum")  return c.parent_category === "mum"  || c.parent_category === "both";
                        return true; // 'both' / 'push-gift' / unknown — show all
                      })
                      .map(c => (
                        <option key={c.slug} value={c.slug}>{c.icon ? `${c.icon} ` : ""}{c.name}</option>
                      ))}
                  </select></div>
                <div><label className={labelCls}>Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={inputCls}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select></div>
                <div><label className={labelCls}>Badge</label>
                  <select value={form.badge} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))} className={inputCls}>
                    <option value="">None</option>
                    {BADGES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Display Order</label>
                  <input type="number" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Publishing</label>
                  <div className="flex gap-2">
                    {(["active", "inactive", "schedule"] as const).map(m => (
                      <button key={m} type="button" onClick={() => setPublishMode(m)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize ${publishMode === m ? "border-forest bg-forest-light text-forest" : "border-border text-text-med"}`}>
                        {m === "active" ? "Active" : m === "schedule" ? "📅 Schedule" : "Inactive"}
                      </button>
                    ))}
                  </div>
                  {publishMode === "schedule" && (
                    <input type="datetime-local" value={form.scheduled_for ? form.scheduled_for.slice(0, 16) : ""}
                      onChange={e => setForm(f => ({ ...f, scheduled_for: e.target.value }))} className={`${inputCls} mt-2`} />
                  )}
                </div>
              </div>
              {/* Out of Stock toggle — sits below Publishing */}
              <div className="flex items-start gap-3 py-2 border border-border rounded-lg px-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-foreground block">Out of Stock</label>
                  <p className="text-[11px] text-text-med mt-0.5">Hides add-to-cart for all brands. Product remains visible.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer mt-1 flex-shrink-0">
                  <input type="checkbox" checked={form.is_out_of_stock} onChange={e => setForm(f => ({ ...f, is_out_of_stock: e.target.checked }))} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-3 mt-0">
              <div><label className={labelCls}>Pack Info (e.g. "50 nappies · Size 1")</label>
                <input value={form.pack_count} onChange={e => setForm(f => ({ ...f, pack_count: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Material</label>
                <input value={form.material} onChange={e => setForm(f => ({ ...f, material: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Contents (comma-separated)</label>
                <textarea value={form.contents} onChange={e => setForm(f => ({ ...f, contents: e.target.value }))} rows={2} className={inputCls} /></div>
              <div><label className={labelCls}>Allergen Info</label>
                <input value={form.allergen_info} onChange={e => setForm(f => ({ ...f, allergen_info: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Safety Info</label>
                <input value={form.safety_info} onChange={e => setForm(f => ({ ...f, safety_info: e.target.value }))} className={inputCls} /></div>
              <div><label className={labelCls}>Why Mums Love This</label>
                <textarea value={form.why_included} onChange={e => setForm(f => ({ ...f, why_included: e.target.value }))} rows={2} className={inputCls} /></div>
              <div><label className={labelCls}>Why Included Variants (JSON)</label>
                <textarea value={form.why_included_variants} onChange={e => setForm(f => ({ ...f, why_included_variants: e.target.value }))} rows={2} className={inputCls}
                  placeholder='{"csection": "...", "vaginal": "..."}' /></div>
            </TabsContent>

            <TabsContent value="rich-content" className="space-y-3 mt-0">
              <div><label className={labelCls}>Long Description (shown on full product page)</label>
                <textarea value={form.long_description} onChange={e => setForm(f => ({ ...f, long_description: e.target.value }))} rows={5} className={inputCls}
                  placeholder="Detailed product description for the full product page..." /></div>
              <div><label className={labelCls}>How to Use</label>
                <textarea value={form.how_to_use} onChange={e => setForm(f => ({ ...f, how_to_use: e.target.value }))} rows={4} className={inputCls}
                  placeholder="Step-by-step instructions on how to use this product..." /></div>
              <div><label className={labelCls}>Video URL (YouTube or direct link)</label>
                <input value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} className={inputCls}
                  placeholder="https://youtube.com/watch?v=..." /></div>
            </TabsContent>

            <TabsContent value="brands" className="space-y-3 mt-0">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold">Brand Variants</label>
                <button type="button" onClick={() => setBrands(b => [...b, { brand_name: "", price: 0, tier: "standard", is_default_for_tier: false, compare_at_price: null, stock_quantity: null, in_stock: true, image_url: null, logo_url: null, weight_kg: "" }])}
                  className="flex items-center gap-1 text-xs text-forest font-semibold"><Plus className="w-3 h-3" /> Add Brand</button>
              </div>
              {brands.map((b, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-med">Brand {i + 1}</span>
                    <button type="button" onClick={() => setBrands(bs => bs.filter((_, idx) => idx !== i))}
                      className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] font-semibold text-text-med block mb-0.5">Brand Name</label>
                      <input placeholder="e.g. Molfix" value={b.brand_name}
                        onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, brand_name: e.target.value } : br))}
                        className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background" /></div>
                    <div><label className="text-[10px] font-semibold text-text-med block mb-0.5">Tier</label>
                      <select value={b.tier} onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, tier: e.target.value } : br))}
                        className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background">
                        {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div><label className="text-[10px] font-semibold text-text-med block mb-0.5">Selling Price (₦)</label>
                      <input type="number" value={b.price} onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, price: parseInt(e.target.value) || 0 } : br))}
                        className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background" /></div>
                    <div>
                      <label className="text-[10px] font-semibold text-text-med block mb-0.5 flex items-center gap-1">
                        Cost Price (₦)
                        {(b.cost_price || 0) > 0 ? (
                          <span className="inline-flex items-center text-[9px] font-semibold text-emerald-700 bg-emerald-100 px-1 rounded">COGS tracked</span>
                        ) : (
                          <span className="inline-flex items-center text-[9px] font-semibold text-text-light bg-muted px-1 rounded">No cost set</span>
                        )}
                      </label>
                      <input type="number" value={b.cost_price || ""} placeholder="What we pay supplier"
                        onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, cost_price: parseInt(e.target.value) || 0 } : br))}
                        className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background" />
                    </div>
                    <div><label className="text-[10px] font-semibold text-text-med block mb-0.5">Compare-at (₦)</label>
                      <input type="number" value={b.compare_at_price || ""} placeholder="Optional"
                        onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, compare_at_price: parseInt(e.target.value) || null } : br))}
                        className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background" /></div>
                    <div><label className="text-[10px] font-semibold text-text-med block mb-0.5">Stock Qty</label>
                      <input type="number" value={b.stock_quantity ?? ""} placeholder="∞"
                        onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, stock_quantity: e.target.value === "" ? null : parseInt(e.target.value) } : br))}
                        className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background" /></div>
                  </div>
                  {/* Diaper / pack-based attributes — only meaningful in
                      diapers-nappies but always allowed (admins may want
                      to surface pack count for any product). */}
                  {form.subcategory === "diapers-nappies" && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div><label className="text-[10px] font-semibold text-text-med block mb-0.5">Diaper Type</label>
                        <select value={b.diaper_type || ""}
                          onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, diaper_type: e.target.value || null } : br))}
                          className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background">
                          <option value="">— Select —</option>
                          <option value="Tape">Tape</option>
                          <option value="Pant">Pant</option>
                          <option value="Underlay">Underlay</option>
                        </select></div>
                      <div><label className="text-[10px] font-semibold text-text-med block mb-0.5">Pack Count</label>
                        <input type="number" min={1} value={b.pack_count ?? ""} placeholder="e.g. 106"
                          onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, pack_count: e.target.value === "" ? null : parseInt(e.target.value) || null } : br))}
                          className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background" /></div>
                      <div><label className="text-[10px] font-semibold text-text-med block mb-0.5">Weight Range (kg)</label>
                        <input value={b.weight_range_kg || ""} placeholder="e.g. 2-5kg"
                          onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, weight_range_kg: e.target.value || null } : br))}
                          className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background" /></div>
                      <div><label className="text-[10px] font-semibold text-text-med block mb-0.5">SKU</label>
                        <input value={b.sku || ""} placeholder="e.g. DIA-001"
                          onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, sku: e.target.value || null } : br))}
                          className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background" /></div>
                    </div>
                  )}
                  {/* Shipping weight — required on every brand variant
                      regardless of subcategory; courier rates depend on it. */}
                  <div>
                    <label className="text-[10px] font-semibold text-text-med block mb-0.5">
                      Weight (kg) <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="number"
                      step={0.01}
                      min={0.01}
                      max={50}
                      required
                      value={b.weight_kg ?? ""}
                      placeholder="e.g. 0.50"
                      onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? {
                        ...br,
                        weight_kg: e.target.value === "" ? "" : parseFloat(e.target.value),
                      } : br))}
                      className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background"
                    />
                    <p className="text-[10px] text-text-light mt-0.5">Shipping weight per single unit/pack as sold</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] font-semibold text-text-med block mb-0.5">Size Variant</label>
                      <input value={b.size_variant || ""} placeholder="e.g. ×10, 40ml"
                        onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, size_variant: e.target.value } : br))}
                        className="w-full border border-input rounded-lg px-2 py-1.5 text-xs bg-background" /></div>
                    <div className="flex items-center gap-3 pt-4">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={b.in_stock !== false} onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, in_stock: e.target.checked } : br))} className="rounded" />
                        In Stock
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={b.is_default_for_tier || false} onChange={e => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, is_default_for_tier: e.target.checked } : br))} className="rounded" />
                        Default for Tier
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <BrandImageUpload label="Product Photo" currentUrl={b.image_url} folder={`brands/${b.brand_name || 'brand'}`}
                      onUploaded={url => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, image_url: url } : br))}
                      onRemove={() => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, image_url: null } : br))} />
                    <BrandImageUpload label="Brand Logo" currentUrl={b.logo_url} folder={`logos/${b.brand_name || 'brand'}`} bucket="brand-logos"
                      onUploaded={url => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, logo_url: url } : br))}
                      onRemove={() => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, logo_url: null } : br))} />
                  </div>

                  <BrandGalleryEditor
                    images={Array.isArray(b.images) ? b.images : []}
                    fallback={b.image_url}
                    onChange={next => setBrands(bs => bs.map((br, idx) => idx === i ? { ...br, images: next } : br))}
                  />
                </div>
              ))}
              {brands.length === 0 && <p className="text-xs text-text-light text-center py-4">No brands added yet. Click "Add Brand" above.</p>}
            </TabsContent>

            <TabsContent value="sizes" className="space-y-4 mt-0">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">Sizes</label>
                  <button type="button" onClick={() => setSizes(s => [...s, { size_label: "", size_code: "", in_stock: true, is_default: false }])}
                    className="flex items-center gap-1 text-xs text-forest font-semibold"><Plus className="w-3 h-3" /> Add Size</button>
                </div>
                {sizes.map((s, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-end">
                    <input placeholder="Size Label (e.g. M)" value={s.size_label}
                      onChange={e => setSizes(ss => ss.map((sz, idx) => idx === i ? { ...sz, size_label: e.target.value } : sz))}
                      className="flex-1 border border-input rounded-lg px-2 py-1.5 text-xs bg-background" />
                    <input placeholder="Code (e.g. M)" value={s.size_code}
                      onChange={e => setSizes(ss => ss.map((sz, idx) => idx === i ? { ...sz, size_code: e.target.value } : sz))}
                      className="w-20 border border-input rounded-lg px-2 py-1.5 text-xs bg-background" />
                    <label className="flex items-center gap-1 text-[10px]">
                      <input type="checkbox" checked={s.is_default || false} onChange={e => setSizes(ss => ss.map((sz, idx) => idx === i ? { ...sz, is_default: e.target.checked } : sz))} className="rounded" /> Default
                    </label>
                    <button type="button" onClick={() => setSizes(ss => ss.filter((_, idx) => idx !== i))}
                      className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold">Colours</label>
                  <button type="button" onClick={() => setColors(c => [...c, { color_name: "", color_hex: "#000000", in_stock: true }])}
                    className="flex items-center gap-1 text-xs text-forest font-semibold"><Plus className="w-3 h-3" /> Add Colour</button>
                </div>
                {colors.map((c, i) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input placeholder="Colour Name" value={c.color_name}
                      onChange={e => setColors(cs => cs.map((cl, idx) => idx === i ? { ...cl, color_name: e.target.value } : cl))}
                      className="flex-1 border border-input rounded-lg px-2 py-1.5 text-xs bg-background" />
                    <input type="color" value={c.color_hex || "#000000"}
                      onChange={e => setColors(cs => cs.map((cl, idx) => idx === i ? { ...cl, color_hex: e.target.value } : cl))}
                      className="w-8 h-8 rounded border border-input cursor-pointer" />
                    <button type="button" onClick={() => setColors(cs => cs.filter((_, idx) => idx !== i))}
                      className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="tags" className="space-y-4 mt-0">
              {TAG_TYPES.map(({ type, values }) => (
                <div key={type}>
                  <label className="text-xs font-semibold text-text-med capitalize block mb-2">{type.replace("_", " ")}</label>
                  <div className="flex flex-wrap gap-2">
                    {values.map(v => {
                      const active = (selectedTags[type] || []).includes(v);
                      return (
                        <button key={v} type="button" onClick={() => toggleTag(type, v)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold border capitalize ${active ? "border-forest bg-forest-light text-forest" : "border-border text-text-med"}`}>
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="ratings" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Rating (0–5)</label>
                  <input type="number" step="0.1" min="0" max="5" value={form.rating}
                    onChange={e => setForm(f => ({ ...f, rating: parseFloat(e.target.value) || 0 }))} className={inputCls} /></div>
                <div><label className={labelCls}>Review Count</label>
                  <input type="number" value={form.review_count}
                    onChange={e => setForm(f => ({ ...f, review_count: parseInt(e.target.value) || 0 }))} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Multiples Bump</label>
                  <input type="number" step="0.1" value={form.multiples_bump}
                    onChange={e => setForm(f => ({ ...f, multiples_bump: parseFloat(e.target.value) || 1 }))} className={inputCls} /></div>
                <div className="flex items-center gap-4 pt-5">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={form.gender_relevant} onChange={e => setForm(f => ({ ...f, gender_relevant: e.target.checked }))} className="rounded" />
                    Gender Relevant
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={form.first_baby === true}
                      onChange={e => setForm(f => ({ ...f, first_baby: e.target.checked ? true : null }))} className="rounded" />
                    First Baby Only
                  </label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="images" className="space-y-3 mt-0">
              {isEdit ? (
                <ProductImageManager productId={product.id} />
              ) : (
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <p className="text-xs text-muted-foreground">💡 Save the product first, then you can upload gallery images when editing it.</p>
                </div>
              )}
              <div className="pt-3 border-t border-border">
                <label className={labelCls}>Fallback Emoji (shown when no image uploaded)</label>
                <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} className={`${inputCls} w-20`} placeholder="📦" />
              </div>
            </TabsContent>

            <TabsContent value="seo" className="mt-0">
              <SEOEditor metaTitle={form.meta_title} metaDescription={form.meta_description} ogImageUrl={form.og_image_url}
                onChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
                contentTitle={form.name} contentDescription={form.description} />
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-forest text-primary-foreground rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
            {saving ? "Saving..." : isEdit ? "Update Product" : "Create Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline editor for a brand's images[] gallery. Primary (index 0) is
 * flagged with a coral badge. Thumbnails can be removed individually;
 * new images are added via URL input + "Add Image" button.
 */
function BrandGalleryEditor({ images, fallback, onChange }: {
  images: string[];
  fallback?: string | null;
  onChange: (next: string[]) => void;
}) {
  const [url, setUrl] = useState("");
  // Surface the fallback image as a read-only preview if the array is
  // empty, so the admin isn't staring at a blank section.
  const display = images.length > 0 ? images : (fallback ? [fallback] : []);
  const add = () => {
    const v = url.trim();
    if (!v) return;
    onChange([...images, v]);
    setUrl("");
  };
  const remove = (idx: number) => onChange(images.filter((_, i) => i !== idx));
  const makePrimary = (idx: number) => {
    if (idx === 0) return;
    const next = [...images];
    const [m] = next.splice(idx, 1);
    next.unshift(m);
    onChange(next);
  };
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold">Product Images (gallery)</label>
        <span className="text-[10px] text-text-light">First image is the primary. Shown in the swipeable drawer gallery.</span>
      </div>
      {display.length === 0 ? (
        <p className="text-[11px] text-text-light">No gallery images yet. Add a URL below.</p>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {display.map((src, i) => (
            <div key={`${src}-${i}`} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted/40">
              <img src={src} alt="" className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 text-[9px] font-bold text-white bg-coral text-center py-0.5">Primary</span>
              )}
              {images.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label="Remove image"
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-foreground/70 text-white text-[11px] flex items-center justify-center hover:bg-destructive"
                  >×</button>
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => makePrimary(i)}
                      className="absolute top-1 left-1 text-[9px] font-semibold bg-card/90 px-1 rounded hover:bg-card"
                    >Set 1st</button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://… image URL"
          className="flex-1 border border-input rounded-lg px-2 py-1.5 text-xs bg-background"
        />
        <button
          type="button"
          onClick={add}
          disabled={!url.trim()}
          className="px-3 py-1.5 text-xs font-semibold bg-forest text-primary-foreground rounded-lg hover:bg-forest-deep disabled:opacity-40"
        >
          Add Image
        </button>
      </div>
    </div>
  );
}
