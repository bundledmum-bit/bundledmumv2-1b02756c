import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
// merch_* tables aren't in the generated supabase types yet; cast to any.
const supabase = supabaseTyped as any;
import { toast } from "sonner";
import { getBrandImage } from "@/lib/brandImage";
import {
  ChevronDown, ChevronRight, ArrowUp, ArrowDown, Trash2, Plus, X, Search, GripVertical,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useShopSections,
  useAdminSectionProducts,
  useCategoryPagePinsAdmin,
  useAddCategoryPagePin,
  useRemoveCategoryPagePin,
  useToggleCategoryPagePin,
  useReorderCategoryPagePins,
  useUpdateSectionPinLabel,
  useUpdateSectionPinBrand,
  useUpdateCategoryPinLabel,
  useUpdateCategoryPinBrand,
  useUpdateCategoryPageLabel,
  type ShopVariant,
  type MerchSection,
} from "@/hooks/useMerchandising";
import { useProductCategories, type ProductCategory } from "@/hooks/useProductCategories";
import { packCountLabel } from "@/lib/diaperBrand";
import SectionBrandsTab from "@/components/admin/merchandising/SectionBrandsTab";

const BRAND_NONE = "__none__";

/** Resolve a brand row's display image. Prefers the self-hosted stored
 *  copy (via getBrandImage), then the legacy thumbnail. */
function brandImage(brand: any): string | null {
  return getBrandImage(brand) || brand?.thumbnail_url || null;
}

/** Pick the row's thumbnail: brand override → product image → null. */
function pinRowThumbnail(row: any): string | null {
  const brands: any[] = row?.products?.brands || [];
  if (row?.default_brand_id) {
    const b = brands.find(b => b.id === row.default_brand_id);
    const img = brandImage(b);
    if (img) return img;
  }
  return row?.products?.image_url || null;
}

/** Reusable thumbnail box with onError → grey placeholder fallback. */
function PinThumbnail({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return <div className="w-10 h-10 rounded-md bg-muted border border-border shrink-0" aria-label={alt} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className="w-10 h-10 rounded-md object-cover border border-border bg-muted shrink-0"
    />
  );
}

/** Inline editor block: 40×40 thumb, label-override input, brand picker.
 *  Shared by both the shop tab pin rows and the category-page pin rows. */
function PinOverridesFields({
  row,
  onSaveLabel,
  onSaveBrand,
}: {
  row: any;
  onSaveLabel: (label: string | null) => void;
  onSaveBrand: (brandId: string | null) => void;
}) {
  const product = row?.products;
  const productName: string = product?.name || "Unknown product";
  const brands: any[] = (product?.brands || []).filter((b: any) => b?.in_stock !== false);
  const showBrandPicker = brands.length > 1;

  // Local mirror for the label input — reset when the server value changes.
  const serverLabel: string = row?.display_label ?? "";
  const [labelDraft, setLabelDraft] = useState(serverLabel);
  useEffect(() => { setLabelDraft(serverLabel); }, [serverLabel]);

  const serverBrandId: string = row?.default_brand_id ?? "";

  return (
    <>
      <PinThumbnail src={pinRowThumbnail(row)} alt={productName} />
      <div className="flex flex-col gap-0.5 min-w-[160px]">
        <span className="text-[11px] text-muted-foreground">Label override</span>
        <Input
          value={labelDraft}
          onChange={e => setLabelDraft(e.target.value)}
          onBlur={() => {
            const trimmed = labelDraft.trim();
            const next = trimmed === "" ? null : trimmed;
            const cur = serverLabel.trim() === "" ? null : serverLabel;
            if (next !== cur) onSaveLabel(next);
          }}
          placeholder={productName}
          className="h-8 text-sm"
        />
      </div>
      {showBrandPicker && (
        <div className="flex flex-col gap-0.5 min-w-[180px]">
          <span className="text-[11px] text-muted-foreground">Default brand</span>
          <Select
            value={serverBrandId || BRAND_NONE}
            onValueChange={(v) => onSaveBrand(v === BRAND_NONE ? null : v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="No override" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BRAND_NONE}>No override</SelectItem>
              {brands.map((b: any) => {
                const pack = packCountLabel({ packCount: b.pack_count != null ? Number(b.pack_count) : null });
                return (
                  <SelectItem key={b.id} value={b.id}>
                    {b.brand_name}{pack ? ` ${pack}` : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}

type TopTab = ShopVariant | "categories" | "section-brands" | "gift-boxes" | "recovery-kits" | "maternity-lists" | "shop-sections" | "bundles-page-sections";

type BundleFamily = "gift-boxes" | "recovery-kits" | "maternity-lists";

const BUNDLE_FAMILIES: { key: BundleFamily; label: string; nameRegex: RegExp }[] = [
  { key: "gift-boxes",      label: "Baby Shower Gift Boxes",  nameRegex: /^Baby Shower Gift Box/i },
  { key: "recovery-kits",   label: "Postpartum Recovery Kits", nameRegex: /^Postpartum Recovery Kit/i },
  { key: "maternity-lists", label: "Maternity + Baby Essentials", nameRegex: /^Maternity( \+ Baby Items)? Bundle/i },
];

const SHOPS: { key: ShopVariant; label: string }[] = [
  { key: "all", label: "All Shop" },
  { key: "baby", label: "Baby Shop" },
  { key: "mum", label: "Mum Shop" },
];

export default function AdminMerchandising() {
  const [tab, setTab] = useState<TopTab>("all");

  return (
    <div>
      <div className="mb-6">
        <h1 className="pf text-2xl font-bold">Merchandising</h1>
        <p className="text-text-med text-sm mt-1">
          Curate what shows on the Shop pages — choose categories, reorder them, and pick the products to feature.
        </p>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as TopTab)}>
        <TabsList>
          {SHOPS.map(s => (
            <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>
          ))}
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="section-brands">Section Brands</TabsTrigger>
          <TabsTrigger value="shop-sections">Shop Sections</TabsTrigger>
          <TabsTrigger value="bundles-page-sections">Bundles Page Sections</TabsTrigger>
          {BUNDLE_FAMILIES.map(f => (
            <TabsTrigger key={f.key} value={f.key}>{f.label}</TabsTrigger>
          ))}
        </TabsList>
        {SHOPS.map(s => (
          <TabsContent key={s.key} value={s.key} className="mt-4">
            <ShopMerchPanel shop={s.key} />
          </TabsContent>
        ))}
        <TabsContent value="categories" className="mt-4">
          <CategoriesPanel />
        </TabsContent>
        <TabsContent value="section-brands" className="mt-4">
          <SectionBrandsTab />
        </TabsContent>
        <TabsContent value="shop-sections" className="mt-4">
          <ShopSectionsPanel />
        </TabsContent>
        <TabsContent value="bundles-page-sections" className="mt-4">
          <BundlesPageSectionsPanel />
        </TabsContent>
        {BUNDLE_FAMILIES.map(f => (
          <TabsContent key={f.key} value={f.key} className="mt-4">
            <BundleOrderPanel family={f} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ShopMerchPanel({ shop }: { shop: ShopVariant }) {
  const qc = useQueryClient();
  const { data: sections = [], isLoading } = useShopSections(shop, true);
  const { data: categories = [] } = useProductCategories();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => (a.section_order || 0) - (b.section_order || 0)),
    [sections],
  );
  const usedSlugs = new Set(sortedSections.map(s => s.category_slug));
  const availableCategories = categories.filter(c => !usedSlugs.has(c.slug));

  const updateSection = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<MerchSection> }) => {
      const { error } = await supabase.from("merch_shop_sections").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["merch_shop_sections", shop] }),
  });

  const removeSection = useMutation({
    mutationFn: async (id: string) => {
      // Remove section_products children first, then the section row.
      const section = sections.find(s => s.id === id);
      if (section) {
        await supabase
          .from("merch_section_products")
          .delete()
          .eq("shop", shop)
          .eq("category_slug", section.category_slug);
      }
      const { error } = await supabase.from("merch_shop_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["merch_shop_sections", shop] });
      toast.success("Section removed");
    },
  });

  const addSection = useMutation({
    mutationFn: async (slug: string) => {
      const nextOrder = (sortedSections[sortedSections.length - 1]?.section_order || 0) + 1;
      const { error } = await supabase.from("merch_shop_sections").insert({
        shop,
        category_slug: slug,
        section_order: nextOrder,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["merch_shop_sections", shop] });
      toast.success("Section added");
      setAddCategoryOpen(false);
    },
  });

  const swapOrder = useMutation({
    mutationFn: async ({ a, b }: { a: MerchSection; b: MerchSection }) => {
      // Two-step swap to satisfy the unique constraint.
      const { error: e1 } = await supabase.from("merch_shop_sections").update({ section_order: -1 }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("merch_shop_sections").update({ section_order: a.section_order }).eq("id", b.id);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from("merch_shop_sections").update({ section_order: b.section_order }).eq("id", a.id);
      if (e3) throw e3;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["merch_shop_sections", shop] }),
  });

  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = sortedSections[idx + dir];
    const me = sortedSections[idx];
    if (!me || !target) return;
    swapOrder.mutate({ a: me, b: target });
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="text-sm text-text-med">Loading…</div>
      ) : sortedSections.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-sm text-text-med mb-4">No sections yet. Add a category to get started.</p>
        </div>
      ) : (
        sortedSections.map((section, i) => (
          <SectionRow
            key={section.id}
            shop={shop}
            section={section}
            isFirst={i === 0}
            isLast={i === sortedSections.length - 1}
            expanded={expandedId === section.id}
            onToggle={() => setExpandedId(expandedId === section.id ? null : section.id)}
            onMoveUp={() => moveSection(i, -1)}
            onMoveDown={() => moveSection(i, 1)}
            onToggleActive={(v) => updateSection.mutate({ id: section.id, patch: { is_active: v } })}
            onLabelChange={(label) => updateSection.mutate({ id: section.id, patch: { section_label: label || null } })}
            onRemove={() => {
              if (confirm("Remove this section and all of its product picks?")) removeSection.mutate(section.id);
            }}
          />
        ))
      )}

      <div>
        <Button
          variant="outline"
          onClick={() => setAddCategoryOpen(true)}
          disabled={availableCategories.length === 0}
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add category
        </Button>
        {availableCategories.length === 0 && (
          <span className="ml-3 text-xs text-text-light">All categories already added.</span>
        )}
      </div>

      <AddCategoryDialog
        open={addCategoryOpen}
        onClose={() => setAddCategoryOpen(false)}
        categories={availableCategories}
        onPick={(slug) => addSection.mutate(slug)}
      />
    </div>
  );
}

function SectionRow({
  shop, section, isFirst, isLast, expanded,
  onToggle, onMoveUp, onMoveDown, onToggleActive, onLabelChange, onRemove,
}: {
  shop: ShopVariant;
  section: MerchSection;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleActive: (v: boolean) => void;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
}) {
  const [labelDraft, setLabelDraft] = useState(section.section_label || "");
  const { data: products = [] } = useAdminSectionProducts(shop, section.category_slug, expanded);
  const productCount = products.length;

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="flex items-center gap-2 p-3">
        <button onClick={onToggle} className="p-1 text-text-med hover:text-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <GripVertical className="w-4 h-4 text-text-light" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {section.category?.icon && <span className="text-lg">{section.category.icon}</span>}
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{section.category?.name || section.category_slug}</div>
            <div className="text-[11px] text-text-light">order #{section.section_order}</div>
          </div>
        </div>

        <Input
          value={labelDraft}
          onChange={e => setLabelDraft(e.target.value)}
          onBlur={() => {
            if ((section.section_label || "") !== labelDraft) onLabelChange(labelDraft);
          }}
          placeholder="Custom label (optional)"
          className="h-8 text-xs w-40"
        />

        <span className="text-[11px] bg-muted px-2 py-0.5 rounded font-semibold text-text-med">
          {expanded ? `${productCount} pinned` : "—"}
        </span>

        <div className="flex items-center gap-1">
          <Switch checked={section.is_active} onCheckedChange={onToggleActive} />
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1.5 rounded hover:bg-muted disabled:opacity-30"
            title="Move up"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1.5 rounded hover:bg-muted disabled:opacity-30"
            title="Move down"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Remove">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 bg-muted/20">
          <SectionProductsEditor shop={shop} section={section} />
        </div>
      )}
    </div>
  );
}

function SectionProductsEditor({ shop, section }: { shop: ShopVariant; section: MerchSection }) {
  const qc = useQueryClient();
  const slug = section.category_slug;
  const { data: rows = [], isLoading } = useAdminSectionProducts(shop, slug);
  const sorted = useMemo(
    () => [...rows].sort((a: any, b: any) => (a.product_order || 0) - (b.product_order || 0)),
    [rows],
  );
  const [addOpen, setAddOpen] = useState(false);
  const updatePinLabel = useUpdateSectionPinLabel();
  const updatePinBrand = useUpdateSectionPinBrand();

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("merch_section_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_merch_section_products", shop, slug] }),
  });

  const swap = useMutation({
    mutationFn: async ({ a, b }: { a: any; b: any }) => {
      // Two-step swap to avoid the unique constraint conflict.
      const { error: e1 } = await supabase.from("merch_section_products").update({ product_order: -1 }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("merch_section_products").update({ product_order: a.product_order }).eq("id", b.id);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from("merch_section_products").update({ product_order: b.product_order }).eq("id", a.id);
      if (e3) throw e3;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_merch_section_products", shop, slug] }),
  });

  const addProduct = useMutation({
    mutationFn: async (productId: string) => {
      const next = (sorted[sorted.length - 1]?.product_order || 0) + 1;
      const { error } = await supabase.from("merch_section_products").insert({
        shop,
        category_slug: slug,
        product_id: productId,
        product_order: next,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_merch_section_products", shop, slug] });
      toast.success("Product added");
    },
  });

  const move = (idx: number, dir: -1 | 1) => {
    const target = sorted[idx + dir];
    const me = sorted[idx];
    if (!me || !target) return;
    swap.mutate({ a: me, b: target });
  };

  const pinnedIds = new Set(sorted.map((r: any) => r.product_id));

  return (
    <div className="space-y-2">
      {isLoading ? (
        <div className="text-xs text-text-med">Loading products…</div>
      ) : sorted.length === 0 ? (
        <div className="text-xs text-text-med">
          No products pinned yet — the storefront will fall back to recent products in this category.
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map((row: any, i: number) => (
            <div key={row.id} className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-card border border-border rounded-lg p-2">
              <PinOverridesFields
                row={row}
                onSaveLabel={(label) => updatePinLabel.mutate({ pinId: row.id, label, shop, categorySlug: slug })}
                onSaveBrand={(brandId) => updatePinBrand.mutate({ pinId: row.id, brandId, shop, categorySlug: slug })}
              />
              <GripVertical className="w-4 h-4 text-text-light" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{row.products?.name || "Unknown product"}</div>
                <div className="text-[10px] text-text-light">order #{row.product_order}</div>
              </div>
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="p-1 rounded hover:bg-muted disabled:opacity-30"
                title="Move up"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === sorted.length - 1}
                className="p-1 rounded hover:bg-muted disabled:opacity-30"
                title="Move down"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
              <button
                onClick={() => removeRow.mutate(row.id)}
                className="p-1 rounded hover:bg-destructive/10 text-destructive"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pt-1">
        <Button className="h-10" size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add product
        </Button>
      </div>

      <AddProductDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        slug={slug}
        excludeIds={pinnedIds}
        onPick={(productId) => {
          addProduct.mutate(productId);
          setAddOpen(false);
        }}
      />
    </div>
  );
}

function AddCategoryDialog({
  open, onClose, categories, onPick,
}: {
  open: boolean;
  onClose: () => void;
  categories: Array<{ slug: string; name: string; icon: string | null }>;
  onPick: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = categories.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a category</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search categories…" className="pl-9" />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <div className="text-xs text-text-med text-center py-6">No matches.</div>
          ) : (
            filtered.map(c => (
              <button
                key={c.slug}
                onClick={() => onPick(c.slug)}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted text-left"
              >
                {c.icon && <span className="text-lg">{c.icon}</span>}
                <span className="text-sm font-semibold">{c.name}</span>
                <span className="text-[10px] text-text-light ml-auto">{c.slug}</span>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Categories tab — pins per category page (drives /shop/[slug])
// ----------------------------------------------------------------------------

function CategoriesPanel() {
  const { data: categories = [], isLoading } = useProductCategories();
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const parentRank = (p: string | null) => {
      if (p === "baby") return 0;
      if (p === "mum") return 1;
      return 2;
    };
    return [...categories].sort((a, b) => {
      const pa = parentRank(a.parent_category);
      const pb = parentRank(b.parent_category);
      if (pa !== pb) return pa - pb;
      const sa = a.stage_order ?? Number.POSITIVE_INFINITY;
      const sb = b.stage_order ?? Number.POSITIVE_INFINITY;
      if (sa !== sb) return sa - sb;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [categories]);

  if (isLoading) {
    return <div className="text-sm text-text-med">Loading…</div>;
  }
  if (sorted.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-sm text-text-med">No categories.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-med">
        Pin products to surface at the top of each <code>/shop/[category]</code> page. Pinned products appear first in the order set here; other products in the category appear below them, in their normal order.
      </p>
      {sorted.map(cat => (
        <CategoryRow
          key={cat.slug}
          category={cat}
          expanded={expandedSlug === cat.slug}
          onToggle={() => setExpandedSlug(expandedSlug === cat.slug ? null : cat.slug)}
        />
      ))}
    </div>
  );
}

function CategoryRow({
  category, expanded, onToggle,
}: {
  category: ProductCategory;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: pins = [] } = useCategoryPagePinsAdmin(category.slug, expanded);
  const pinnedCount = pins.length;
  const updatePageLabel = useUpdateCategoryPageLabel();

  // Local mirror for the page-heading override input. Reset when the
  // server-side merch_page_label changes (re-fetch).
  const serverLabel = category.merch_page_label ?? "";
  const [headingDraft, setHeadingDraft] = useState(serverLabel);
  useEffect(() => { setHeadingDraft(serverLabel); }, [serverLabel]);

  return (
    <div className="bg-card border border-border rounded-xl">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button onClick={onToggle} className="p-1 text-text-med hover:text-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {category.icon && <span className="text-lg">{category.icon}</span>}
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{category.name}</div>
            <div className="text-[11px] text-text-light">{category.slug}</div>
          </div>
        </div>
        {expanded && (
          <div className="flex flex-col gap-0.5 min-w-[16rem]">
            <span className="text-[11px] text-muted-foreground">Page heading override</span>
            <Input
              value={headingDraft}
              onChange={e => setHeadingDraft(e.target.value)}
              onBlur={() => {
                const trimmed = headingDraft.trim();
                const next = trimmed === "" ? null : trimmed;
                const cur = serverLabel.trim() === "" ? null : serverLabel;
                if (next !== cur) updatePageLabel.mutate({ categorySlug: category.slug, label: next });
              }}
              placeholder={category.name}
              className="h-8 text-sm w-64"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Overrides the heading on the category browse page</p>
          </div>
        )}
        <span className="text-[11px] bg-muted px-2 py-0.5 rounded font-semibold text-text-med">
          {expanded ? `${pinnedCount} pinned` : "—"}
        </span>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 bg-muted/20">
          <CategoryPinsEditor categorySlug={category.slug} />
        </div>
      )}
    </div>
  );
}

function CategoryPinsEditor({ categorySlug }: { categorySlug: string }) {
  const { data: rows = [], isLoading } = useCategoryPagePinsAdmin(categorySlug);
  const sorted = useMemo(
    () => [...rows].sort((a: any, b: any) => (a.product_order || 0) - (b.product_order || 0)),
    [rows],
  );
  const [addOpen, setAddOpen] = useState(false);

  const addPin = useAddCategoryPagePin();
  const removePin = useRemoveCategoryPagePin();
  const togglePin = useToggleCategoryPagePin();
  const reorderPins = useReorderCategoryPagePins();
  const updatePinLabel = useUpdateCategoryPinLabel();
  const updatePinBrand = useUpdateCategoryPinBrand();

  const move = (idx: number, dir: -1 | 1) => {
    const me = sorted[idx] as any;
    const target = sorted[idx + dir] as any;
    if (!me || !target) return;
    reorderPins.mutate({
      a: { id: me.id, product_order: me.product_order },
      b: { id: target.id, product_order: target.product_order },
      categorySlug,
    });
  };

  const pinnedIds = new Set(sorted.map((r: any) => r.product_id));

  return (
    <div className="space-y-2">
      {isLoading ? (
        <div className="text-xs text-text-med">Loading products…</div>
      ) : sorted.length === 0 ? (
        <div className="text-xs text-text-med">
          No products pinned. The category page will show all products in normal order.
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map((row: any, i: number) => (
            <div key={row.id} className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-card border border-border rounded-lg p-2">
              <PinOverridesFields
                row={row}
                onSaveLabel={(label) => updatePinLabel.mutate({ pinId: row.id, label, categorySlug })}
                onSaveBrand={(brandId) => updatePinBrand.mutate({ pinId: row.id, brandId, categorySlug })}
              />
              <GripVertical className="w-4 h-4 text-text-light" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{row.products?.name || "Unknown product"}</div>
                <div className="text-[10px] text-text-light">order #{row.product_order}</div>
              </div>
              <Switch
                checked={!!row.is_active}
                onCheckedChange={(v) => togglePin.mutate({ id: row.id, isActive: v, categorySlug })}
              />
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="p-1 rounded hover:bg-muted disabled:opacity-30"
                title="Move up"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === sorted.length - 1}
                className="p-1 rounded hover:bg-muted disabled:opacity-30"
                title="Move down"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
              <button
                onClick={() => removePin.mutate({ id: row.id, categorySlug })}
                className="p-1 rounded hover:bg-destructive/10 text-destructive"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pt-1">
        <Button className="h-10" size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add product
        </Button>
      </div>

      <AddProductDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        slug={categorySlug}
        excludeIds={pinnedIds}
        onPick={(productId) => {
          const next = ((sorted[sorted.length - 1] as any)?.product_order || 0) + 1;
          addPin.mutate({ categorySlug, productId, productOrder: next });
          setAddOpen(false);
        }}
      />
    </div>
  );
}

function AddProductDialog({
  open, onClose, slug, excludeIds, onPick,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  excludeIds: Set<string>;
  onPick: (productId: string) => void;
}) {
  const [q, setQ] = useState("");
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin_merch_pickable", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, emoji")
        .eq("subcategory", slug)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!slug,
    staleTime: 30 * 1000,
  });

  const filtered = (products || []).filter((p: any) =>
    !excludeIds.has(p.id) && (q.trim() === "" || p.name.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a product to this section</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-text-med">
          Showing products in <b>{slug}</b>. Already-pinned products are hidden.
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search products…" className="pl-9" />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {isLoading ? (
            <div className="text-xs text-text-med text-center py-6">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-xs text-text-med text-center py-6">No products to add.</div>
          ) : (
            filtered.map((p: any) => (
              <button
                key={p.id}
                onClick={() => onPick(p.id)}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted text-left"
              >
                <span className="text-lg">{p.emoji || "📦"}</span>
                <span className="text-sm font-semibold">{p.name}</span>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Bundle ordering panel — controls shop_section_order within each
// bundle family on the storefront /shop and /bundles pages. The shop
// page reads from the same column, so saves reflect immediately.
// ─────────────────────────────────────────────────────────────────────
function BundleOrderPanel({ family }: { family: { key: BundleFamily; label: string; nameRegex: RegExp } }) {
  const qc = useQueryClient();
  const queryKey = ["admin-merch-bundles", family.key];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, bundle_label, shop_section_order, is_active")
        .eq("is_gift_box", true)
        .eq("is_active", true)
        .order("shop_section_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return ((data || []) as any[]).filter((p: any) => family.nameRegex.test(p.name));
    },
  });

  // Local draft so the admin can shuffle without committing per click.
  const [draft, setDraft] = useState<any[] | null>(null);
  useEffect(() => {
    setDraft(items.length > 0 ? [...items] : null);
  }, [items]);

  const list: any[] = draft ?? [];
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...list];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft(next);
  };

  const dirty = useMemo(() => {
    if (!draft) return false;
    return draft.some((p, i) => p.id !== items[i]?.id);
  }, [draft, items]);

  const saving = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      // Assign 1-based shop_section_order in the new order.
      await Promise.all(draft.map((p, idx) =>
        supabase.from("products").update({ shop_section_order: idx + 1 }).eq("id", p.id),
      ));
    },
    onSuccess: () => {
      toast.success("Bundle order saved");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["bundle-products"] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to save"),
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <p className="text-text-med text-sm max-w-2xl">
          Drag the order using the up/down arrows. Position 1 appears first in this section on the storefront.
        </p>
        <Button className="h-10"
          size="sm"
          disabled={!dirty || saving.isPending}
          onClick={() => saving.mutate()}
        >
          {saving.isPending ? "Saving…" : "Save Order"}
        </Button>
      </div>
      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading…</div>
      ) : list.length === 0 ? (
        <div className="text-center py-10 text-text-med">No products in this section.</div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-card">
          {list.map((p, idx) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-xs font-bold w-6 text-text-light tabular-nums">#{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{p.name}</div>
                {p.bundle_label && (
                  <div className="text-[11px] text-text-med">{p.bundle_label}</div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === list.length - 1}
                  className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shop Sections — unified ordering / visibility for both bundle and
// category sections on the storefront /shop page. Backed by the
// shop_sections table; storefront renderers read display_order +
// is_visible from here as the canonical source.
// ─────────────────────────────────────────────────────────────────────
interface ShopSection {
  id: string;
  section_key: string;
  label: string;
  title: string;
  subtitle: string | null;
  section_type: "bundle_group" | "category";
  filter_value: string;
  display_order: number;
  is_visible: boolean;
  is_visible_on_all: boolean;
  is_visible_on_mum: boolean;
  is_visible_on_baby: boolean;
}

function ShopSectionsPanel() {
  const qc = useQueryClient();
  const queryKey = ["admin-shop-sections"];
  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_sections")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return (data || []) as ShopSection[];
    },
  });

  // Local draft for drag-style reordering via up/down arrows.
  const [draft, setDraft] = useState<ShopSection[] | null>(null);
  useEffect(() => { setDraft(rows.length > 0 ? [...rows] : null); }, [rows]);
  const list: ShopSection[] = draft ?? [];

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...list];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft(next);
  };

  const dirty = useMemo(() => {
    if (!draft) return false;
    return draft.some((s, i) => s.id !== rows[i]?.id);
  }, [draft, rows]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey });
    // Storefront also reads shop_sections; nudge the BundleSections
    // query so the public site picks up the change on next render.
    qc.invalidateQueries({ queryKey: ["bundle-products"] });
    qc.invalidateQueries({ queryKey: ["shop-sections"] });
  };

  const saveOrder = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const now = new Date().toISOString();
      await Promise.all(draft.map((s, idx) =>
        supabase
          .from("shop_sections")
          .update({ display_order: (idx + 1) * 10, updated_at: now })
          .eq("id", s.id),
      ));
    },
    onSuccess: () => { toast.success("Section order updated"); invalidateAll(); },
    onError: (e: any) => toast.error(e?.message || "Failed to save order"),
  });

  const toggleVisibility = async (s: ShopSection) => {
    const next = !s.is_visible;
    const { error } = await supabase
      .from("shop_sections")
      .update({ is_visible: next, updated_at: new Date().toISOString() })
      .eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Section visible" : "Section hidden");
    invalidateAll();
  };

  // Per-shop visibility flag toggles. Each checkbox flips a single
  // is_visible_on_{all,mum,baby} boolean on the shop_sections row;
  // the storefront ShopSectionsRenderer reads these flags to decide
  // whether to render the section on /shop, /shop/mum or /shop/baby.
  const toggleShopFlag = async (
    s: ShopSection,
    field: "is_visible_on_all" | "is_visible_on_mum" | "is_visible_on_baby",
    value: boolean,
  ) => {
    const { error } = await supabase
      .from("shop_sections")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", s.id);
    if (error) { toast.error("Could not update visibility"); return; }
    invalidateAll();
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [subtitleDraft, setSubtitleDraft] = useState("");

  const beginEdit = (s: ShopSection) => {
    setEditingId(s.id);
    setTitleDraft(s.title || "");
    setSubtitleDraft(s.subtitle || "");
  };
  const saveEdit = async (s: ShopSection) => {
    const t = titleDraft.trim();
    const sub = subtitleDraft.trim();
    const { error } = await supabase
      .from("shop_sections")
      .update({
        title: t || s.label,
        subtitle: sub || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Section text updated");
    setEditingId(null);
    invalidateAll();
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <p className="text-text-med text-sm max-w-2xl">
          Drag the order of every section on the shop page — bundles and product categories live in the same list.
          Use the per-shop checkboxes to control which shop pages each section appears on. The eye toggle is the master
          switch — when off, the section is invisible everywhere regardless of per-shop flags.
        </p>
        <Button className="h-10"
          size="sm"
          disabled={!dirty || saveOrder.isPending}
          onClick={() => saveOrder.mutate()}
        >
          {saveOrder.isPending ? "Saving…" : "Save Order"}
        </Button>
      </div>
      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading sections…</div>
      ) : list.length === 0 ? (
        <div className="text-center py-10 text-text-med">No sections configured.</div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-card">
          {list.map((s, idx) => {
            const isBundle = s.section_type === "bundle_group";
            const isEditing = editingId === s.id;
            return (
              <li key={s.id} className={`flex items-start gap-3 px-3 py-2.5 ${s.is_visible ? "" : "bg-muted/30"}`}>
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-0.5">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === list.length - 1}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
                <button
                  onClick={() => toggleVisibility(s)}
                  className={`p-1.5 rounded hover:bg-muted flex-shrink-0 mt-0.5 ${s.is_visible ? "" : "opacity-40"}`}
                  title={s.is_visible ? "Master visibility: ON (hide everywhere)" : "Master visibility: OFF (show)"}
                >
                  {s.is_visible
                    ? <span aria-hidden>👁</span>
                    : <span aria-hidden>🚫</span>}
                </button>
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <Input
                        value={titleDraft}
                        onChange={e => setTitleDraft(e.target.value)}
                        placeholder="Section title"
                        className="h-8 text-sm"
                      />
                      <Input
                        value={subtitleDraft}
                        onChange={e => setSubtitleDraft(e.target.value)}
                        placeholder="Section subtitle (optional)"
                        className="h-8 text-sm"
                      />
                      <div className="flex gap-1.5">
                        <Button className="h-10" size="sm" onClick={() => saveEdit(s)}>Save</Button>
                        <Button className="h-10" size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => beginEdit(s)}
                      className="text-left w-full"
                      title="Edit title / subtitle"
                    >
                      <div className={`text-sm font-semibold ${s.is_visible ? "" : "text-muted-foreground"}`}>
                        {s.title || s.label}
                      </div>
                      {s.subtitle && (
                        <div className="text-[11px] text-text-med truncate">{s.subtitle}</div>
                      )}
                    </button>
                  )}
                </div>
                <div
                  className="flex flex-col gap-0.5 flex-shrink-0 text-[11px] leading-tight"
                  title={`Showing on: ${[
                    s.is_visible_on_all  && "/shop",
                    s.is_visible_on_mum  && "/shop/mum",
                    s.is_visible_on_baby && "/shop/baby",
                  ].filter(Boolean).join(", ") || "nowhere"}`}
                >
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!s.is_visible_on_all}
                      onChange={e => toggleShopFlag(s, "is_visible_on_all", e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-text-med">/shop</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!s.is_visible_on_mum}
                      onChange={e => toggleShopFlag(s, "is_visible_on_mum", e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-text-med">/shop/mum</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!s.is_visible_on_baby}
                      onChange={e => toggleShopFlag(s, "is_visible_on_baby", e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-text-med">/shop/baby</span>
                  </label>
                </div>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-pill flex-shrink-0 ${
                    isBundle ? "bg-coral/15 text-coral" : "bg-emerald-100 text-emerald-700"
                  }`}
                  title={s.filter_value}
                >
                  {isBundle ? "Bundle" : "Category"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-text-light mt-3">
        Tip: bundle sections pull products from is_gift_box=true filtered by name prefix.
        Category sections pull from active products filtered by subcategory.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Bundles Page Sections — parallel ordering for /bundles only.
// Lives on the same shop_sections row but uses the bundles_*-prefixed
// columns so the /bundles page can be reordered independently of /shop.
// Only renders the three bundle_group rows; categories never appear on
// /bundles so they're filtered out.
// ─────────────────────────────────────────────────────────────────────
interface BundlesPageSection {
  id: string;
  section_key: string;
  label: string;
  title: string;
  subtitle: string | null;
  filter_value: string;
  bundles_display_order: number | null;
  bundles_is_visible: boolean | null;
  standalone_page_slug: string | null;
  see_all_label: string | null;
}

function BundlesPageSectionsPanel() {
  const qc = useQueryClient();
  const queryKey = ["admin-bundles-page-sections"];
  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_sections")
        .select("id, section_key, label, title, subtitle, filter_value, bundles_display_order, bundles_is_visible, standalone_page_slug, see_all_label")
        .eq("section_type", "bundle_group")
        .order("bundles_display_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as BundlesPageSection[];
    },
  });

  const [draft, setDraft] = useState<BundlesPageSection[] | null>(null);
  useEffect(() => { setDraft(rows.length > 0 ? [...rows] : null); }, [rows]);
  const list: BundlesPageSection[] = draft ?? [];

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...list];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft(next);
  };

  const dirty = useMemo(() => {
    if (!draft) return false;
    return draft.some((s, i) => s.id !== rows[i]?.id);
  }, [draft, rows]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey });
    // Storefront BundleSections + BundleCategoryPage both read these rows.
    qc.invalidateQueries({ queryKey: ["shop-sections", "bundles", "bundles"] });
    qc.invalidateQueries({ queryKey: ["bundle-category-section"] });
  };

  const saveOrder = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const now = new Date().toISOString();
      await Promise.all(draft.map((s, idx) =>
        supabase
          .from("shop_sections")
          .update({ bundles_display_order: (idx + 1) * 10, updated_at: now })
          .eq("id", s.id),
      ));
    },
    onSuccess: () => { toast.success("Bundles page order updated"); invalidateAll(); },
    onError: (e: any) => toast.error(e?.message || "Failed to save order"),
  });

  const toggleVisibility = async (s: BundlesPageSection) => {
    const next = !(s.bundles_is_visible !== false);
    const { error } = await supabase
      .from("shop_sections")
      .update({ bundles_is_visible: next, updated_at: new Date().toISOString() })
      .eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Section visible on /bundles" : "Section hidden from /bundles");
    invalidateAll();
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <p className="text-text-med text-sm max-w-2xl">
          Control how bundle sections appear on the <strong>/bundles</strong> page only. This
          ordering is independent of the Shop Sections tab (which controls /shop).
        </p>
        <Button className="h-10"
          size="sm"
          disabled={!dirty || saveOrder.isPending}
          onClick={() => saveOrder.mutate()}
        >
          {saveOrder.isPending ? "Saving…" : "Save Order"}
        </Button>
      </div>
      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading bundle sections…</div>
      ) : list.length === 0 ? (
        <div className="text-center py-10 text-text-med">No bundle sections configured.</div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-card">
          {list.map((s, idx) => {
            const visible = s.bundles_is_visible !== false;
            return (
              <li key={s.id} className={`flex items-start gap-3 px-3 py-2.5 ${visible ? "" : "bg-muted/30"}`}>
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-0.5">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === list.length - 1}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
                <button
                  onClick={() => toggleVisibility(s)}
                  className={`p-1.5 rounded hover:bg-muted flex-shrink-0 mt-0.5 ${visible ? "" : "opacity-40"}`}
                  title={visible ? "Hide on /bundles" : "Show on /bundles"}
                >
                  {visible ? <span aria-hidden>👁</span> : <span aria-hidden>🚫</span>}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold ${visible ? "" : "text-muted-foreground"}`}>
                    {s.title || s.label}
                  </div>
                  <div className="text-[11px] text-text-med flex flex-wrap gap-x-2 mt-0.5">
                    {s.subtitle && <span className="truncate max-w-[420px]">{s.subtitle}</span>}
                    {s.standalone_page_slug && (
                      <span className="text-text-light">/bundles/{s.standalone_page_slug}</span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-pill flex-shrink-0 bg-coral/15 text-coral">
                  Bundle
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-text-light mt-3">
        Tip: each section's "See all" link on /bundles points at /bundles/{`{standalone_page_slug}`}.
        Hidden sections drop off /bundles entirely but stay visible on /shop unless also hidden there.
      </p>
    </div>
  );
}
