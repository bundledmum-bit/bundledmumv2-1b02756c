import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, X, Package, Lock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getBrandImage } from "@/lib/brandImage";
import ImageZoomModal from "@/components/admin/ImageZoomModal";

// ─── Shared money formatting (integer naira, never /100) ───────────────────────
// Kept here as the single source of truth for the builder; AdminQuotes re-exports
// it so existing importers (e.g. AdminQuoteCard) keep working.
export const fmtN = (n: number | null | undefined) =>
  typeof n === "number" && isFinite(n) ? `₦${Math.round(n).toLocaleString()}` : "₦0";

// Optional sectioning. DB CHECK allows only these keys (or NULL). Fixed order;
// NULL ("Other Items") always rendered last.
export const QUOTE_SECTIONS = [
  { key: "baby", label: "Baby Items" },
  { key: "mother", label: "Mother Items" },
  { key: "hospital", label: "Hospital Items" },
  { key: "postpartum", label: "Postpartum Items" },
  { key: "gift", label: "Gift Items" },
] as const;
export const SECTION_OTHER_LABEL = "Other Items";

// Payload emitted when a product is added through the picker. The parent decides
// how to persist it (DB insert for quotes, local state for landing pages).
export interface AddItemPayload {
  productId: string;
  productName: string;
  brandId: string;
  brandName: string;
  price: number;
  size: string | null;
  quantity: number;
  section: string | null;
}

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

// Per-item add dialog: prompts size (when the product has sizes) + quantity in
// one step. Quantity is focused and defaults to 1, so Enter adds qty 1 in one
// action; the size (if required) must be chosen before Add enables.
export function AddItemDialog({ product, onCancel, onConfirm }: {
  product: { productName: string; brandName: string; sizes: Array<{ size_label: string; in_stock: boolean }> };
  onCancel: () => void;
  onConfirm: (size: string | null, quantity: number) => void;
}) {
  const sizes = product.sizes || [];
  const hasSizes = sizes.length > 0;
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const qtyRef = useRef<HTMLInputElement>(null);
  useEffect(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, []);

  const canAdd = !hasSizes || !!size;
  const submit = () => {
    if (!canAdd) return;
    onConfirm(size, Math.max(1, Math.floor(qty || 1)));
  };

  return (
    <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={onCancel}>
      <div className="bg-card border border-border rounded-xl max-w-md w-full p-4 max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-sm">Add item</h3>
          <button onClick={onCancel} aria-label="Cancel"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-text-med mb-3">{product.productName} · {product.brandName}</p>

        {hasSizes && (
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med mb-1.5">Size</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <button
                  key={s.size_label}
                  type="button"
                  onClick={() => setSize(s.size_label)}
                  disabled={s.in_stock === false}
                  className={`min-h-[40px] px-3 py-2 rounded-pill text-xs font-semibold border-[1.5px] ${
                    s.in_stock === false ? "opacity-40 cursor-not-allowed line-through" :
                    size === s.size_label ? "border-forest bg-forest text-primary-foreground" :
                    "border-border bg-card hover:border-forest"
                  }`}
                  title={s.in_stock === false ? "Out of stock" : ""}
                >
                  {s.size_label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med mb-1.5">Quantity</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setQty((q) => Math.max(1, (q || 1) - 1))} disabled={qty <= 1}
              aria-label="Decrease quantity"
              className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-lg font-bold disabled:opacity-40 hover:bg-muted">−</button>
            <input
              ref={qtyRef}
              type="number"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                setQty(e.target.value === "" || !Number.isFinite(n) || n < 1 ? 1 : n);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              aria-label="Quantity"
              className="w-16 border border-input rounded-lg px-2 py-2 text-sm bg-background text-center"
            />
            <button type="button" onClick={() => setQty((q) => (q || 1) + 1)}
              aria-label="Increase quantity"
              className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-lg font-bold hover:bg-muted">+</button>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="px-3 py-2 text-xs font-semibold rounded-lg border border-border hover:bg-muted">Cancel</button>
          <button type="button" onClick={submit} disabled={!canAdd}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-forest text-primary-foreground hover:bg-forest-deep disabled:opacity-40">
            {hasSizes && !size ? "Select a size" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuoteLineItemCard({ it, canEdit, brands, sizes, colors, isPending, onUpdate, onRemove, onZoom }: LineItemCardProps) {
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

          {/* Section — re-file a mis-grouped item (None/Baby/Mother/Hospital) */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-text-med font-semibold w-10 shrink-0">Section</span>
            <select
              disabled={!canEdit}
              value={it.section || ""}
              onChange={(e) => onUpdate({ section: e.target.value || null })}
              className="flex-1 text-xs border border-input rounded px-2 py-1 bg-background min-w-[120px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">— None (Other Items) —</option>
              {QUOTE_SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>

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
          <span>This brand is currently out of stock. Confirm availability before sending.</span>
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

// ─── Shared, controlled items builder ──────────────────────────────────────────
// Presentational: it renders the product search/picker, the item rows (via
// QuoteLineItemCard) grouped by section, the add dialog, and the subtotal. It
// holds NO persistence logic; the parent supplies `items` and add/update/remove
// handlers and decides how to persist (quotes DB rows vs landing local state).
export interface PackageItemsBuilderProps {
  items: any[];
  canEdit?: boolean;
  // When true, the product search is disabled and `disabledHint` is shown (used
  // by the quote editor before the quote row exists).
  disabled?: boolean;
  disabledHint?: string;
  // Shows the per-card pending overlay while a mutation is in flight.
  isMutating?: boolean;
  onAddItem: (payload: AddItemPayload) => void;
  onUpdateItem: (id: string, patch: Record<string, any>) => void;
  onRemoveItem: (id: string) => void;
}

export default function PackageItemsBuilder({
  items,
  canEdit = true,
  disabled = false,
  disabledHint,
  isMutating = false,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
}: PackageItemsBuilderProps) {
  const [productSearch, setProductSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [pendingProduct, setPendingProduct] = useState<any | null>(null);
  const [itemSearchRaw, setItemSearchRaw] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);

  const searchEnabled = canEdit && !disabled;

  // ── Batch variant data for the items currently in the list ──
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

  // ── Product search ──
  const trimmedSearch = productSearch.trim();
  const { data: searchResults = [] } = useQuery({
    queryKey: ["admin-quotes-product-search", trimmedSearch],
    enabled: trimmedSearch.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, subcategory, brands!brands_product_id_fkey!inner(id, brand_name, price, in_stock)")
        .eq("is_active", true)
        .eq("brands.in_stock", true)
        .gt("brands.price", 0)
        .ilike("name", `%${trimmedSearch}%`)
        .limit(15);
      if (error) throw error;
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

  // ── Item-search (filter within the list) ──
  useEffect(() => {
    const t = setTimeout(() => setItemSearch(itemSearchRaw), 150);
    return () => clearTimeout(t);
  }, [itemSearchRaw]);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);
  const closeItemSearch = () => { setSearchOpen(false); setItemSearchRaw(""); setItemSearch(""); };
  const itemSearchExpanded = searchOpen || itemSearchRaw.trim().length > 0;

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

  const liveSubtotal = (items as any[]).reduce((s, it) => s + (it.line_total || 0), 0);

  const handleSelectProduct = async (row: any) => {
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
    setPendingProduct({ ...row, sizes });
    setProductSearch("");
  };

  const handleConfirmAdd = (size: string | null, quantity: number) => {
    if (!pendingProduct) return;
    onAddItem({
      productId: pendingProduct.productId,
      productName: pendingProduct.productName,
      brandId: pendingProduct.brandId,
      brandName: pendingProduct.brandName,
      price: pendingProduct.price,
      size: size || null,
      quantity,
      section: activeSection || null,
    });
    setPendingProduct(null);
  };

  return (
    <section className="bg-card border border-border rounded-xl p-4">
      <h2 className="text-sm font-bold mb-3">Line Items</h2>
      {disabled && disabledHint && (
        <p className="text-xs text-muted-foreground mb-2 italic">{disabledHint}</p>
      )}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          placeholder="Search products by name…"
          className="w-full border border-input rounded-lg pl-9 pr-3 py-2 text-sm bg-background"
          disabled={!searchEnabled}
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

      {/* Active section — newly-added items are filed under this. */}
      {searchEnabled && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-text-med mb-1.5">Add to section</p>
          <div className="flex flex-wrap gap-1.5">
            {([{ key: null, label: "None" }, ...QUOTE_SECTIONS] as Array<{ key: string | null; label: string }>).map((opt) => {
              const active = (activeSection || null) === opt.key;
              return (
                <button
                  key={opt.key ?? "none"}
                  type="button"
                  onClick={() => setActiveSection(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${active ? "bg-forest text-primary-foreground border-forest" : "bg-card text-text-med border-border hover:bg-muted"}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-text-light mt-1">New items are filed here until you change it. Optional.</p>
        </div>
      )}

      {/* Search/filter within existing items — collapsed by default. */}
      {items.length > 0 && (
        <div className="mt-3">
          {!itemSearchExpanded ? (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5"
              aria-label="Search items in this list"
            >
              <Search className="w-3.5 h-3.5" /> Search items
            </button>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchInputRef}
                  value={itemSearchRaw}
                  onChange={(e) => setItemSearchRaw(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); closeItemSearch(); } }}
                  placeholder="Search items in this list…"
                  className="w-full border border-input rounded-lg pl-9 pr-8 py-2 text-sm bg-background"
                />
                <button
                  type="button"
                  onClick={closeItemSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Close search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {itemSearchRaw && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Showing {filteredItems.length} of {items.length} items
                </p>
              )}
            </>
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
            onClick={closeItemSearch}
            className="text-forest underline hover:no-underline"
          >
            Clear search
          </button>
        </div>
      ) : (() => {
        const card = (it: any) => (
          <QuoteLineItemCard
            key={it.id}
            it={it}
            canEdit={canEdit}
            brands={brandsByProduct.get(it.product_id) || []}
            sizes={sizesByProduct.get(it.product_id) || []}
            colors={colorsByProduct.get(it.product_id) || []}
            isPending={isMutating}
            onUpdate={(patch) => onUpdateItem(it.id, patch)}
            onRemove={() => onRemoveItem(it.id)}
            onZoom={setZoomSrc}
          />
        );
        if (!filteredItems.some((it: any) => !!it.section)) {
          return <div className="mt-4 space-y-3">{filteredItems.map(card)}</div>;
        }
        const groups = [
          ...QUOTE_SECTIONS.map((s) => ({ label: s.label, rows: filteredItems.filter((it: any) => it.section === s.key) })),
          { label: SECTION_OTHER_LABEL, rows: filteredItems.filter((it: any) => !it.section) },
        ].filter((g) => g.rows.length > 0);
        return (
          <div className="mt-4 space-y-4">
            {groups.map((g) => (
              <div key={g.label} className="space-y-2">
                <h3 className="text-[11px] uppercase tracking-widest font-bold text-text-med">{g.label}</h3>
                <div className="space-y-3">{g.rows.map(card)}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Subtotal always reflects ALL items, not the filtered set */}
      {items.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border flex justify-end gap-4 text-sm">
          <span className="text-text-med font-semibold">Subtotal</span>
          <span className="font-bold">{fmtN(liveSubtotal)}</span>
        </div>
      )}

      {pendingProduct && (
        <AddItemDialog
          product={pendingProduct}
          onCancel={() => setPendingProduct(null)}
          onConfirm={handleConfirmAdd}
        />
      )}
      <ImageZoomModal src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </section>
  );
}
