import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Plus, Trash2, Search, GripVertical } from "lucide-react";
import SEOEditor from "@/components/admin/SEOEditor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type SectionKey = "mum" | "hospital" | "baby" | "convenience";

const SECTIONS: Array<{ key: SectionKey; label: string; emoji: string }> = [
  { key: "mum", label: "For Mum", emoji: "💛" },
  { key: "hospital", label: "Hospital Consumables", emoji: "🏥" },
  { key: "baby", label: "For Baby", emoji: "👶" },
  { key: "convenience", label: "Convenience Extras", emoji: "✨" },
];

// Mirror of BundleItemSwapPopup's convenience detection.
const isConvenience = (p: { subcategory?: string | null; product_slot?: string | null }): boolean =>
  (p.subcategory === "maternity-postpartum" &&
    ["vacuum_flask", "power_bank", "portable_fan", "straw_bottle"].includes(p.product_slot || "")) ||
  (p.subcategory === "feeding-equipment" && (p.product_slot?.includes("warmer") ?? false)) ||
  (p.subcategory === "breastfeeding-equipment" && p.product_slot === "breast_pump") ||
  p.subcategory === "travel-gear" ||
  (p.subcategory === "health-safety-baby" && p.product_slot === "diaper_bag_mummy_bag") ||
  (p.subcategory === "health-safety-baby" && p.product_slot === "portable_changing_pad");

interface Props {
  bundle: any | null;
  onClose: () => void;
  onSaved: () => void;
}

const TIERS = ["starter", "standard", "premium"];

export default function AdminBundleForm({ bundle, onClose, onSaved }: Props) {
  const isEdit = !!bundle;

  const [form, setForm] = useState({
    name: bundle?.name || "",
    slug: bundle?.slug || "",
    description: bundle?.description || "",
    tier: bundle?.tier || "starter",
    price: bundle?.price || 0,
    price_mode: bundle?.price_mode || "fixed",
    discount_percent: bundle?.discount_percent || 0,
    item_count: bundle?.item_count || 0,
    display_order: bundle?.display_order || 0,
    is_active: bundle?.is_active ?? true,
    emoji: bundle?.emoji || "📦",
    image_url: bundle?.image_url || "",
    upsell_bundle_id: bundle?.upsell_bundle_id || "",
    upsell_text: bundle?.upsell_text || "",
    meta_title: bundle?.meta_title || "",
    meta_description: bundle?.meta_description || "",
    og_image_url: bundle?.og_image_url || "",
  });

  const [itemsBySection, setItemsBySection] = useState<Record<SectionKey, any[]>>({
    mum: [], hospital: [], baby: [], convenience: [],
  });
  const [saving, setSaving] = useState(false);
  const [addingSection, setAddingSection] = useState<SectionKey | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [drag, setDrag] = useState<{ section: SectionKey; index: number } | null>(null);

  // Auto-detect the default section for a product row, matching the logic
  // used by the DB migration and the frontend adapter:
  //   delivery-consumables subcategory → hospital
  //   convenience-matching product_slot/subcategory → convenience
  //   mum category                     → mum
  //   everything else                  → baby
  const detectSection = (prod: { category?: string | null; subcategory?: string | null; product_slot?: string | null }): SectionKey => {
    if (prod.subcategory === "maternity-postpartum") return "hospital";
    if (isConvenience(prod)) return "convenience";
    if (prod.category === "mum") return "mum";
    return "baby";
  };

  // Load existing bundle items
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const { data } = await supabase
        .from("bundle_items")
        .select("*, products(id, name, emoji, category, subcategory, product_slot), brands(id, brand_name, price)")
        .eq("bundle_id", bundle.id)
        .order("display_order");
      const next: Record<SectionKey, any[]> = { mum: [], hospital: [], baby: [], convenience: [] };
      (data || []).forEach((bi: any) => {
        const prod = bi.products;
        const section: SectionKey = (bi.section as SectionKey) || detectSection({
          category: prod?.category,
          subcategory: prod?.subcategory,
          product_slot: prod?.product_slot,
        });
        next[section].push({
          id: bi.id,
          product_id: bi.product_id,
          brand_id: bi.brand_id,
          quantity: bi.quantity || 1,
          section,
          product_name: prod?.name || "Unknown",
          product_emoji: prod?.emoji || "📦",
          product_category: prod?.category || "baby",
          product_subcategory: prod?.subcategory || null,
          product_slot: prod?.product_slot || null,
          brand_name: bi.brands?.brand_name || "",
          brand_price: bi.brands?.price || 0,
        });
      });
      setItemsBySection(next);
    })();
  }, [isEdit, bundle?.id]);

  // Flattened view — used for totals and the Items tab badge
  const items = useMemo(() => [
    ...itemsBySection.mum,
    ...itemsBySection.hospital,
    ...itemsBySection.baby,
    ...itemsBySection.convenience,
  ], [itemsBySection]);

  // Load all products for the product picker
  const { data: allProducts } = useQuery({
    queryKey: ["admin-products-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, emoji, category, subcategory, product_slot, brands!brands_product_id_fkey(id, brand_name, price, tier)").eq("is_active", true).is("deleted_at", null).order("display_order");
      if (error) throw error;
      return data;
    },
  });

  // Load all bundles for upsell picker
  const { data: allBundles } = useQuery({
    queryKey: ["admin-bundles-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bundles").select("id, name, tier").is("deleted_at", null).order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const autoSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const separateTotal = items.reduce((s, i) => s + (i.brand_price || 0) * (i.quantity || 1), 0);
  const isPercentMode = form.price_mode === "percentage";
  const computedPrice = isPercentMode && separateTotal > 0
    ? Math.round(separateTotal * (1 - (form.discount_percent || 0) / 100))
    : form.price;
  const effectiveSavings = separateTotal - computedPrice;
  const effectivePercent = separateTotal > 0 ? Math.round((effectiveSavings / separateTotal) * 100) : 0;

  const addProductTo = (section: SectionKey, prod: any) => {
    const defaultBrand = prod.brands?.[0];
    const newItem = {
      product_id: prod.id,
      brand_id: defaultBrand?.id || null,
      quantity: 1,
      section,
      product_name: prod.name,
      product_emoji: prod.emoji || "📦",
      product_category: prod.category,
      product_subcategory: prod.subcategory || null,
      product_slot: prod.product_slot || null,
      brand_name: defaultBrand?.brand_name || "",
      brand_price: defaultBrand?.price || 0,
    };
    setItemsBySection(prev => ({ ...prev, [section]: [...prev[section], newItem] }));
    setProductSearch("");
    setAddingSection(null);
  };

  const updateItem = (section: SectionKey, idx: number, updates: any) => {
    setItemsBySection(prev => ({
      ...prev,
      [section]: prev[section].map((item, i) => i === idx ? { ...item, ...updates } : item),
    }));
  };

  const removeItem = (section: SectionKey, idx: number) => {
    setItemsBySection(prev => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== idx),
    }));
  };

  const handleDrop = (section: SectionKey, dropIdx: number) => {
    if (!drag || drag.section !== section || drag.index === dropIdx) {
      setDrag(null);
      return;
    }
    setItemsBySection(prev => {
      const list = [...prev[section]];
      const [moved] = list.splice(drag.index, 1);
      list.splice(dropIdx, 0, moved);
      return { ...prev, [section]: list };
    });
    setDrag(null);
  };

  // Set of product_ids already in the bundle across all sections — used
  // to hide already-added products from the per-section search dropdowns.
  const usedProductIds = useMemo(() => {
    const s = new Set<string>();
    SECTIONS.forEach(sec => itemsBySection[sec.key].forEach(it => {
      if (it.product_id) s.add(it.product_id);
    }));
    return s;
  }, [itemsBySection]);

  // Product search filter per section, mirroring BundleItemSwapPopup's
  // category/subcategory logic so admins only see relevant products.
  // Already-added products are excluded so admins can't double-add.
  const productsForSection = (section: SectionKey): any[] => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return (allProducts || []).filter((p: any) => {
      if (usedProductIds.has(p.id)) return false;
      if (!p.name.toLowerCase().includes(q)) return false;
      switch (section) {
        case "mum":
          return p.category === "mum" && p.subcategory !== "maternity-postpartum";
        case "hospital":
          return p.subcategory === "maternity-postpartum";
        case "baby":
          return p.category === "baby" && !isConvenience(p);
        case "convenience":
          return isConvenience(p);
      }
    });
  };

  const handleSave = async () => {
    if (!form.name) { toast.error("Bundle name is required"); return; }
    setSaving(true);
    try {
      const slug = form.slug || autoSlug(form.name);
      const bundleData = {
        name: form.name, slug, description: form.description || null,
        tier: form.tier, price: isPercentMode ? computedPrice : form.price,
        price_mode: form.price_mode, discount_percent: form.discount_percent || 0,
        item_count: items.length,
        display_order: form.display_order, is_active: form.is_active,
        emoji: form.emoji || null, image_url: form.image_url || null,
        upsell_bundle_id: form.upsell_bundle_id || null,
        upsell_text: form.upsell_text || null,
        meta_title: form.meta_title || null, meta_description: form.meta_description || null,
        og_image_url: form.og_image_url || null,
      };

      let bundleId: string;
      if (isEdit) {
        const { error } = await supabase.from("bundles").update(bundleData).eq("id", bundle.id);
        if (error) throw error;
        bundleId = bundle.id;
      } else {
        const { data, error } = await (supabase.from("bundles") as any).insert(bundleData).select("id").single();
        if (error) throw error;
        bundleId = data.id;
      }

      // Replace bundle items — flatten in section order so display_order
      // reflects mum → hospital → baby → convenience, each preserving
      // its intra-section drag-reorder.
      if (isEdit) await supabase.from("bundle_items").delete().eq("bundle_id", bundleId);
      const orderedItems: Array<any> = [];
      SECTIONS.forEach(sec => itemsBySection[sec.key].forEach(it => orderedItems.push({ ...it, section: sec.key })));
      if (orderedItems.length > 0) {
        const itemRows = orderedItems.map((item, i) => ({
          bundle_id: bundleId,
          product_id: item.product_id,
          brand_id: item.brand_id || null,
          quantity: item.quantity || 1,
          display_order: i,
          section: item.section,
        }));
        const { error } = await (supabase.from("bundle_items") as any).insert(itemRows);
        if (error) throw error;
      }

      toast.success(isEdit ? "Bundle updated!" : "Bundle created!");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full border border-input rounded-lg px-3 py-2 text-sm bg-background";
  const labelCls = "text-xs font-semibold text-text-med block mb-1";

  return (
    <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-start justify-center pt-6 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl w-full max-w-3xl mx-4 mb-10">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="pf text-lg font-bold">{isEdit ? "Edit Bundle" : "New Bundle"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-5 h-5" /></button>
        </div>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="w-full justify-start px-4 pt-2 bg-transparent gap-1 h-auto">
            {["general", "items", "upsell", "seo"].map(t => (
              <TabsTrigger key={t} value={t} className="text-xs capitalize">
                {t === "items" ? `Items (${items.length})` : t}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="p-4 max-h-[65vh] overflow-y-auto">
            {/* General Tab */}
            <TabsContent value="general" className="space-y-3 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={labelCls}>Bundle Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: f.slug || autoSlug(e.target.value) }))} className={inputCls} /></div>
                <div><label className={labelCls}>Slug</label>
                  <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inputCls} /></div>
              <div><label className={labelCls}>Tier</label>
                <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} className={inputCls}>
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-3 border border-border">
                <label className={labelCls}>Pricing Mode</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="price_mode" checked={form.price_mode === "fixed"} onChange={() => setForm(f => ({ ...f, price_mode: "fixed" }))} />
                    Fixed Price
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="price_mode" checked={form.price_mode === "percentage"} onChange={() => setForm(f => ({ ...f, price_mode: "percentage" }))} />
                    % Discount
                  </label>
                </div>
                {form.price_mode === "fixed" ? (
                  <div><label className={labelCls}>Bundle Price (₦)</label>
                    <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))} className={inputCls} /></div>
                ) : (
                  <div><label className={labelCls}>Discount (%)</label>
                    <input type="number" min={0} max={100} value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: parseFloat(e.target.value) || 0 }))} className={inputCls} /></div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div><label className={labelCls}>Display Order</label>
                  <input type="number" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} className={inputCls} /></div>
                <div><label className={labelCls}>Emoji</label>
                  <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} className={inputCls} /></div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                  Active
                </label>
              </div>
              {separateTotal > 0 && (
                <div className="bg-forest-light rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-text-med">Items total (separately):</span><span className="font-semibold">₦{separateTotal.toLocaleString()}</span></div>
                  {isPercentMode && <div className="flex justify-between"><span className="text-text-med">Discount ({form.discount_percent}%):</span><span className="text-destructive font-semibold">-₦{effectiveSavings.toLocaleString()}</span></div>}
                  <div className="flex justify-between"><span className="text-forest font-bold">Bundle price:</span><span className="text-forest font-bold">₦{computedPrice.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-text-med">Customer saves:</span><span className="text-forest font-semibold">₦{effectiveSavings.toLocaleString()} ({effectivePercent}%)</span></div>
                </div>
              )}
            </TabsContent>

            {/* Items Tab — grouped into 4 sections */}
            <TabsContent value="items" className="space-y-4 mt-0">
              {SECTIONS.map(sec => {
                const list = itemsBySection[sec.key];
                const isAdding = addingSection === sec.key;
                const picks = isAdding ? productsForSection(sec.key) : [];
                return (
                  <div key={sec.key} className="border border-border rounded-xl bg-muted/20 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold">{sec.emoji} {sec.label} <span className="text-text-light font-normal">({list.length})</span></h3>
                    </div>

                    {list.length === 0 ? (
                      <p className="text-center py-3 text-text-light text-xs">No items in this section yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {list.map((item, idx) => {
                          const prod = (allProducts || []).find((p: any) => p.id === item.product_id);
                          const brandsForProduct = (prod as any)?.brands || [];
                          const isDragging = drag?.section === sec.key && drag?.index === idx;
                          return (
                            <div
                              key={idx}
                              draggable
                              onDragStart={() => setDrag({ section: sec.key, index: idx })}
                              onDragOver={(e) => { e.preventDefault(); }}
                              onDrop={() => handleDrop(sec.key, idx)}
                              onDragEnd={() => setDrag(null)}
                              className={`border border-border rounded-lg p-3 flex items-center gap-3 bg-card transition-opacity ${isDragging ? "opacity-50" : ""}`}
                            >
                              <GripVertical className="w-4 h-4 text-text-light flex-shrink-0 cursor-grab" />
                              <span className="text-lg flex-shrink-0">{item.product_emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{item.product_name}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <select value={item.brand_id || ""} onChange={e => {
                                    const brand = brandsForProduct.find((b: any) => b.id === e.target.value);
                                    updateItem(sec.key, idx, { brand_id: e.target.value || null, brand_name: brand?.brand_name || "", brand_price: brand?.price || 0 });
                                  }} className="border border-input rounded px-2 py-1 text-xs bg-background">
                                    <option value="">Default brand</option>
                                    {brandsForProduct.map((b: any) => (
                                      <option key={b.id} value={b.id}>{b.brand_name} — ₦{b.price?.toLocaleString()}</option>
                                    ))}
                                  </select>
                                  <input type="number" min={1} value={item.quantity} onChange={e => updateItem(sec.key, idx, { quantity: parseInt(e.target.value) || 1 })}
                                    className="w-14 border border-input rounded px-2 py-1 text-xs bg-background text-center" />
                                </div>
                              </div>
                              <span className="text-sm font-bold text-forest flex-shrink-0">₦{((item.brand_price || 0) * (item.quantity || 1)).toLocaleString()}</span>
                              <button onClick={() => removeItem(sec.key, idx)} className="p-1 text-destructive hover:bg-destructive/10 rounded flex-shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {isAdding ? (
                      <div className="mt-2 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
                        <input
                          autoFocus
                          value={productSearch}
                          onChange={e => setProductSearch(e.target.value)}
                          placeholder={`Search ${sec.label.toLowerCase()} products…`}
                          className="w-full pl-9 pr-16 py-2 border border-input rounded-lg text-sm bg-background"
                        />
                        <button
                          onClick={() => { setAddingSection(null); setProductSearch(""); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-text-med hover:text-destructive px-2 py-1"
                        >
                          Cancel
                        </button>
                        {picks.length > 0 && (
                          <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-lg mt-1 max-h-48 overflow-y-auto z-10 shadow-lg">
                            {picks.map((p: any) => (
                              <button
                                key={p.id}
                                onClick={() => addProductTo(sec.key, p)}
                                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2 text-sm"
                              >
                                <span>{p.emoji || "📦"}</span>
                                <span className="truncate">{p.name}</span>
                                <span className="text-text-light text-xs ml-auto">{p.category}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {productSearch.trim().length > 0 && picks.length === 0 && (
                          <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-lg mt-1 p-3 text-xs text-text-light z-10 shadow-lg">
                            No products matched for this section.
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingSection(sec.key); setProductSearch(""); }}
                        className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-forest bg-forest-light hover:bg-forest/20 rounded-pill px-3 py-1.5 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add to {sec.label}
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="bg-muted/50 rounded-lg p-3 text-sm flex justify-between font-semibold flex-wrap gap-2">
                <span>{items.length} items · Separate total: ₦{separateTotal.toLocaleString()}</span>
                {form.price > 0 && <span className="text-forest">Bundle: ₦{form.price.toLocaleString()} (save {Math.round(((separateTotal - form.price) / Math.max(separateTotal, 1)) * 100)}%)</span>}
              </div>
            </TabsContent>

            {/* Upsell Tab */}
            <TabsContent value="upsell" className="space-y-3 mt-0">
              <div><label className={labelCls}>Upsell Bundle (e.g. "Upgrade to Premium")</label>
                <select value={form.upsell_bundle_id} onChange={e => setForm(f => ({ ...f, upsell_bundle_id: e.target.value }))} className={inputCls}>
                  <option value="">None</option>
                  {(allBundles || []).filter((b: any) => b.id !== bundle?.id).map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.tier})</option>
                  ))}
                </select>
              </div>
              <div><label className={labelCls}>Upsell Text</label>
                <textarea value={form.upsell_text} onChange={e => setForm(f => ({ ...f, upsell_text: e.target.value }))}
                  rows={3} className={inputCls} placeholder="For ₦25,500 more, get the Premium version with 13 items and top-tier brands." />
              </div>
            </TabsContent>

            {/* SEO Tab */}
            <TabsContent value="seo" className="mt-0">
              <SEOEditor
                metaTitle={form.meta_title} metaDescription={form.meta_description} ogImageUrl={form.og_image_url}
                onChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
              />
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-border rounded-lg text-sm font-semibold hover:bg-muted">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-forest text-primary-foreground rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
            {saving ? "Saving..." : isEdit ? "Update Bundle" : "Create Bundle"}
          </button>
        </div>
      </div>
    </div>
  );
}
