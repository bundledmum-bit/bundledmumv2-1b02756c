import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Seo from "@/components/Seo";
import { useSearchParams, Link, useLocation } from "react-router-dom";
import CuratedSections from "@/components/CuratedSections";
import BundleSections from "@/components/BundleSections";
import ShopSectionsRenderer from "@/components/ShopSectionsRenderer";
import type { ShopVariant } from "@/hooks/useMerchandising";
import { useCart, fmt, getBrandForBudget, cartItemKey } from "@/lib/cart";
import { toast } from "sonner";
import ProductDetailDrawer from "@/components/ProductDetailDrawer";
import { useAllProducts, useSiteSettings } from "@/hooks/useSupabaseData";
import { useProductCategories } from "@/hooks/useProductCategories";
import type { Product, Brand } from "@/lib/supabaseAdapters";
import { isProductOOS } from "@/lib/supabaseAdapters";
import { supabase } from "@/integrations/supabase/client";
import { track as pixelTrack } from "@/lib/metaPixel";
import { analytics, trackEcommerce } from "@/lib/ga";
import { diaperBadges, packCountLabel } from "@/lib/diaperBrand";
import ProductImage from "@/components/ProductImage";
import SpendMoreBanner from "@/components/SpendMoreBanner";
import QtyControl from "@/components/QtyControl";
import ShopFilterDrawer from "@/components/ShopFilterDrawer";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Filter, ArrowUpDown, Check, Search } from "lucide-react";

function ProductCard({ product, defaultBudget = "standard", forceBrand, selectedBrandId, matchBadge, onAdd, onViewDetail, deliveryText }: { product: Product; defaultBudget?: string; forceBrand?: string; selectedBrandId?: string; matchBadge?: string; onAdd: (item: any) => void; onViewDetail: () => void; deliveryText?: string }) {
  const defaultBrand = getBrandForBudget(product, defaultBudget);
  const seedBrand = selectedBrandId
    ? (product.brands.find(b => b.id === selectedBrandId) || defaultBrand)
    : defaultBrand;
  const [selectedBrand, setSelectedBrand] = useState<Brand>(seedBrand);
  const [selectedSize, setSelectedSize] = useState(product.sizes?.[Math.floor((product.sizes?.length || 0) / 2)] || "");
  const [selectedColor, setSelectedColor] = useState("");
  const { cart, setCart, updateQty } = useCart();

  // Variant-aware: the cart line must reflect the CURRENTLY selected brand
  // (+ size/color), not "any line of this product" — mirrors ProductPage so
  // switching brand surfaces a fresh Add and each brand is its own line. The
  // key formula matches what addToCart() writes (see lib/cart.tsx).
  const cartKey = cartItemKey(product.id, selectedBrand.id, selectedSize || null, selectedColor || null, null);
  const cartItem = cart.find(c => c._key === cartKey);
  const isInCart = !!cartItem;

  const brandOos = !selectedBrand.inStock;
  const allBrandsOos = product.brands.every(b => !b.inStock);
  const isOutOfStock = isProductOOS(product) || brandOos;
  const productLevelOos = isProductOOS(product);
  const isLowStock = selectedBrand.stockQuantity != null && selectedBrand.stockQuantity > 0 && selectedBrand.stockQuantity <= 5;

  const displayImage = selectedBrand.imageUrl || product.imageUrl;
  const showSale = selectedBrand.compareAtPrice && selectedBrand.compareAtPrice > selectedBrand.price;

  useEffect(() => {
    if (selectedBrandId) {
      const match = product.brands.find(b => b.id === selectedBrandId);
      if (match) { setSelectedBrand(match); return; }
    }
    if (forceBrand) {
      const match = product.brands.find(b => b.label.toLowerCase() === forceBrand.toLowerCase());
      if (match) { setSelectedBrand(match); return; }
    }
    setSelectedBrand(defaultBrand);
  }, [defaultBudget, forceBrand, selectedBrandId]);

  const handleAdd = () => {
    if (isOutOfStock) return;
    if (product.sizes && product.sizes.length > 0 && !selectedSize) { onViewDetail(); return; }
    onAdd({ ...product, selectedBrand, price: selectedBrand.price, name: `${product.name} (${selectedBrand.label})`, selectedSize, selectedColor });
  };

  const handleQtyChange = (newQty: number) => {
    if (cartItem) updateQty(cartItem._key, newQty);
  };

  const showAllBrands = product.brands.length <= 3;
  const visibleBrands = showAllBrands ? product.brands : product.brands.slice(0, 2);
  const hiddenCount = product.brands.length - visibleBrands.length;

  return (
    <div className={`bg-card rounded-card shadow-card card-hover overflow-hidden ${(allBrandsOos || productLevelOos) ? "opacity-60" : ""}`}>
      <div className="h-[170px] flex items-center justify-center relative transition-all cursor-pointer overflow-hidden"
        style={{ background: displayImage ? '#f5f5f5' : `linear-gradient(135deg, ${selectedBrand.color}, #fff)` }}
        onClick={() => { onViewDetail(); }}>
        {/* Badge priority: OOS > badge > sale / low-stock */}
        {productLevelOos ? (
          <div className="absolute top-2.5 left-2.5 bg-[#E53935] text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-pill uppercase tracking-wide z-10">Out of Stock</div>
        ) : product.badge ? (
          <div className="absolute top-2.5 left-2.5 bg-coral text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-pill uppercase tracking-wide z-10">{product.badge}</div>
        ) : null}
        {matchBadge && (
          <div className="absolute bottom-2.5 left-2.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-pill uppercase tracking-wide z-10 border border-emerald-300">{matchBadge}</div>
        )}
        {showSale && !productLevelOos && (
          <div className="absolute top-2.5 right-2.5 bg-destructive text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-pill z-10">
            Save {Math.round(((selectedBrand.compareAtPrice! - selectedBrand.price) / selectedBrand.compareAtPrice!) * 100)}%
          </div>
        )}
        {allBrandsOos && !productLevelOos && <div className="absolute top-2.5 right-2.5 bg-foreground/70 text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-pill z-10">Out of Stock</div>}
        {isLowStock && !allBrandsOos && !productLevelOos && <div className="absolute top-2.5 right-2.5 bg-[#E65100] text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-pill z-10">Only {selectedBrand.stockQuantity} left!</div>}
        <ProductImage imageUrl={displayImage} emoji={selectedBrand.img || product.baseImg} alt={product.name} className="w-full h-full" emojiClassName="text-6xl" />
      </div>
      <div className="p-4">
        <h3 className="text-[13px] font-semibold mb-1 leading-tight min-h-[36px] cursor-pointer hover:text-forest transition-colors" onClick={() => { onViewDetail(); }}>{product.name}</h3>
        {/* Diaper-category attribute pills (Type / pack count / weight). */}
        {(() => {
          const badges = diaperBadges(selectedBrand);
          return badges.length > 0 ? (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {badges.map(b => (
                <span key={b} className="text-[11px] font-medium rounded-full px-2 py-0.5" style={{ backgroundColor: "#F0F0F0", color: "#555" }}>
                  {b}
                </span>
              ))}
            </div>
          ) : null;
        })()}
        <p className="text-muted-foreground text-[10px] leading-relaxed mb-2 line-clamp-2">{product.description}</p>
        {product.packInfo && <p className="text-muted-foreground text-[10px] mb-1">📦 {product.packInfo}</p>}

        <div className="mb-2">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Brand</div>
          <div className="flex flex-wrap gap-1">
            {visibleBrands.map(b => {
              const bOos = !b.inStock;
              const pcLabel = packCountLabel(b);
              return (
                <button key={b.id} onClick={() => setSelectedBrand(b)}
                  className={`px-2 py-1 rounded-pill text-[10px] font-semibold border-[1.5px] transition-all font-body min-h-[40px] inline-flex items-center gap-1 ${bOos ? "opacity-50" : ""} ${selectedBrand.id === b.id ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                  <span>{b.label}{pcLabel ? ` ${pcLabel}` : ""} {fmt(b.price)}</span>
                  {b.id === defaultBrand.id && !bOos && <span className="text-coral ml-0.5">★</span>}
                </button>
              );
            })}
            {hiddenCount > 0 && (
              <button onClick={() => { onViewDetail(); }}
                className="px-2 py-1 rounded-pill text-[10px] font-semibold border-[1.5px] border-border bg-card text-forest font-body hover:border-forest min-h-[40px]">
                +{hiddenCount} more
              </button>
            )}
          </div>
        </div>

        {product.sizes && product.sizes.length > 0 && (
          <div className="mb-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Size</div>
            <div className="flex flex-wrap gap-1">
              {product.sizes.map(s => (
                <button key={s} onClick={() => setSelectedSize(s)}
                  className={`px-2 py-1 rounded-pill text-[10px] font-semibold border-[1.5px] transition-all font-body min-h-[40px] ${selectedSize === s ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-coral text-xs">⭐ {product.rating}</span>
          <span className="text-muted-foreground text-[11px]">({product.reviews})</span>
        </div>
        {deliveryText && <p className="text-muted-foreground text-[9px] mb-2">{deliveryText}</p>}

        <div className="flex justify-between items-center">
          <div>
            <div className="font-mono-price text-forest font-bold text-[17px] transition-all">{fmt(selectedBrand.price)}</div>
            {showSale && <div className="font-mono-price text-muted-foreground text-[10px] line-through">{fmt(selectedBrand.compareAtPrice!)}</div>}
            {!showSale && product.brands.length > 1 && <div className="text-muted-foreground text-[10px] mt-0.5">from <span className="font-mono-price">{fmt(Math.min(...product.brands.map(b => b.price)))}</span></div>}
          </div>
          {isOutOfStock ? (
            <div>
              <span className="rounded-pill bg-border px-3 py-2 text-[10px] font-semibold text-muted-foreground font-body block mb-1 min-h-[44px] flex items-center">Sold Out</span>
              <button onClick={() => toast("We'll notify you when it's back!")} className="text-forest text-[9px] font-semibold hover:underline">Notify me</button>
            </div>
          ) : isInCart && cartItem ? (
            <QtyControl qty={cartItem.qty} onUpdate={handleQtyChange} maxQty={selectedBrand.stockQuantity ?? undefined} />
          ) : (
            <button onClick={handleAdd} className="rounded-pill px-4 py-2.5 text-xs font-semibold text-primary-foreground font-body interactive min-h-[44px]" style={{ backgroundColor: "#F4845F" }}>Add to Cart</button>
          )}
        </div>
      </div>
    </div>
  );
}

const ITEMS_PER_PAGE = 20;

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  // Derive the shop variant from the URL path. /shop/baby and /shop/mum
  // pin the tab; /shop falls back to the `tab` URL param. The merchandising
  // routes /shop/baby and /shop/mum are explicitly handled in App.tsx
  // before /shop/:slug, so the CategoryPage doesn't intercept them.
  const pathShop: ShopVariant | null =
    location.pathname === "/shop/baby" ? "baby"
    : location.pathname === "/shop/mum" ? "mum"
    : location.pathname === "/shop" ? "all"
    : null;
  const tab = pathShop || searchParams.get("tab") || "all";
  const budgetF = searchParams.get("budget") || "all";
  const categoryF = searchParams.get("category") || "";
  const brandF = searchParams.get("brand") || "";
  const sortBy = searchParams.get("sort") || "popular";
  const priceMinF = searchParams.get("priceMin") ? Number(searchParams.get("priceMin")) : null;
  const priceMaxF = searchParams.get("priceMax") ? Number(searchParams.get("priceMax")) : null;
  const inStockOnlyF = searchParams.get("inStock") === "1";
  const [search, setSearch] = useState(searchParams.get("q") || "");

  // Meta Pixel Search — debounced so each keystroke doesn't spam fbq.
  useEffect(() => {
    const q = search.trim();
    if (!q) return;
    const t = setTimeout(() => { pixelTrack("Search", { search_string: q }); }, 800);
    return () => clearTimeout(t);
  }, [search]);

  // Active-search now goes through the alias-aware server RPC instead of a
  // client-side substring filter. Debounce the query so each keystroke
  // doesn't hit the RPC; the browse view (empty search) is untouched.
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => clearTimeout(t);
  }, [search]);
  // p_category scopes the RPC: 'baby' on /shop/baby, 'mum' on /shop/mum,
  // null on /shop (all). Other categories ('both'/'push-gift') aren't a
  // storefront tab, so they pass through the all-products search.
  const rpcCategory = pathShop === "baby" ? "baby" : pathShop === "mum" ? "mum" : null;
  const { data: searchData, isFetching: searchFetching } = useQuery({
    queryKey: ["product-search", debouncedSearch, rpcCategory],
    enabled: debouncedSearch.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("search_products", {
        p_query: debouncedSearch,
        p_limit: 50,
        p_category: rpcCategory,
      });
      if (error) throw error;
      return (data || { result_count: 0, products: [] }) as { result_count: number; products: any[] };
    },
  });
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [filterDrawerInitialSection, setFilterDrawerInitialSection] = useState<"filter" | "sort" | undefined>(undefined);
  const { addToCart } = useCart();

  const { data: allProducts, isLoading } = useAllProducts();
  const { data: siteSettings } = useSiteSettings();
  const { data: categories } = useProductCategories();
  const deliveryText = siteSettings?.delivery_text || "";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (!value || value === "all") params.delete(key);
    else params.set(key, value);
    if (key === "category") params.delete("brand");
    if (key === "tab") { params.delete("category"); params.delete("brand"); }
    setSearchParams(params, { replace: true });
    setVisibleCount(ITEMS_PER_PAGE);
  };

  useEffect(() => {
    const titles: Record<string, string> = { all: "All Products", baby: "Baby Shop", mum: "Mum Shop", "push-gift": "Push Gifts" };
    document.title = `${titles[tab] || "All Products"} | BundledMum`;
  }, [tab]);

  const allBrandNames = useMemo(() => {
    const names = new Set<string>();
    let pool = allProducts || [];
    if (tab === "baby") pool = pool.filter(p => p.category === "baby");
    else if (tab === "mum") pool = pool.filter(p => p.category === "mum");
    if (categoryF) pool = pool.filter(p => p.subcategory === categoryF);
    pool.forEach(p => p.brands.forEach(b => names.add(b.label)));
    return Array.from(names).sort();
  }, [allProducts, tab, categoryF]);

  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    if (tab === "baby") return categories.filter(c => c.parent_category === "baby" || c.parent_category === "both");
    if (tab === "mum") return categories.filter(c => c.parent_category === "mum" || c.parent_category === "both");
    return categories;
  }, [categories, tab]);

  // Category product counts for filter drawer
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (filteredCategories || []).forEach(cat => {
      counts[cat.slug] = (allProducts || []).filter(p => p.subcategory === cat.slug && (tab === "all" || p.category === tab)).length;
    });
    return counts;
  }, [allProducts, filteredCategories, tab]);

  // Apply all filters + dedup by name. Search hits are emitted as
  // { product, brandId?, isBrandMatch }: a name match emits one hit
  // with no brandId; a brand-name match emits one hit per matching
  // brand with that brand pre-selected. When the same product surfaces
  // both ways, the brand-match version wins.
  type Hit = { product: Product; brandId?: string; isBrandMatch: boolean };
  const filtered = useMemo<Hit[]>(() => {
    const q = search.trim();

    // Shared product-level filters (category chip / brand / stock / price) —
    // applied identically in browse and search modes so the chips behave the
    // same whether or not a query is active.
    const passesFilters = (p: Product): boolean => {
      if (categoryF && p.subcategory !== categoryF) return false;
      if (brandF && !p.brands.some(b => b.label.toLowerCase() === brandF.toLowerCase())) return false;
      if (inStockOnlyF && !p.brands.some(b => b.inStock)) return false;
      if (priceMinF != null || priceMaxF != null) {
        const ok = p.brands.some(b => {
          const pr = Number(b.price) || 0;
          if (priceMinF != null && pr < priceMinF) return false;
          if (priceMaxF != null && pr > priceMaxF) return false;
          return true;
        });
        if (!ok) return false;
      }
      return true;
    };
    const passesTab = (p: Product): boolean => {
      if (tab === "baby") return p.category === "baby";
      if (tab === "mum") return p.category === "mum";
      if (tab === "push-gift") return p.category === "push-gift";
      return true;
    };

    let hits: Hit[];
    if (q) {
      // SEARCH MODE — the alias-aware server RPC supplies the matched set and
      // relevance order. Reconcile each product_id back to the in-memory
      // Product so the card, brand list, CORS-safe images and NAIRA price all
      // reuse existing data unchanged. Returns [] until the RPC settles (the
      // loading state is handled separately so we don't flash "no results").
      if (!searchData) return [];
      const byId = new Map((allProducts || []).map(p => [p.id, p] as const));
      hits = [];
      for (const rp of searchData.products || []) {
        const p = byId.get(rp.product_id);
        if (!p) continue;                 // not in the active catalogue
        if (!passesTab(p)) continue;      // mirror tab scoping client-side
        if (!passesFilters(p)) continue;  // mirror chip/price/stock filters
        const matchedBrandId = rp.brand?.id && p.brands.some(b => b.id === rp.brand.id)
          ? rp.brand.id : undefined;
        hits.push({ product: p, brandId: matchedBrandId, isBrandMatch: !!matchedBrandId });
      }
    } else {
      // BROWSE MODE — unchanged: one hit per product, dedup by name.
      let raw = (allProducts || []).filter(passesTab).filter(passesFilters);
      const seen = new Set<string>();
      hits = [];
      for (const p of raw) {
        const key = p.name.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ product: p, isBrandMatch: false });
      }
    }

    // Sort — explicit sorts apply in both modes; the default 'popular' keeps
    // the RPC relevance order in search mode (display_order while browsing).
    const priceOf = (h: Hit) => {
      if (h.brandId) {
        const b = h.product.brands.find(x => x.id === h.brandId);
        if (b) return Number(b.price) || 0;
      }
      return Math.min(...h.product.brands.map(br => Number(br.price) || 0));
    };
    if (sortBy === "price-low"  || sortBy === "price_asc")  hits.sort((a, b) => priceOf(a) - priceOf(b));
    if (sortBy === "price-high" || sortBy === "price_desc") hits.sort((a, b) => priceOf(b) - priceOf(a));
    if (sortBy === "rating")    hits.sort((a, b) => b.product.rating - a.product.rating);
    if (sortBy === "name_asc")  hits.sort((a, b) => a.product.name.localeCompare(b.product.name));
    if (sortBy === "newest")    hits.sort((a: any, b: any) => ((b.product as any).created_at || "").localeCompare((a.product as any).created_at || ""));
    return hits;
  }, [allProducts, tab, search, categoryF, brandF, sortBy, inStockOnlyF, priceMinF, priceMaxF, searchData]);

  const visibleProducts = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // True while a search query is active but the RPC for that exact term
  // hasn't settled yet (mid-debounce or in flight) — drives the loading UI
  // and gates the zero-result capture so it never fires prematurely.
  const trimmedSearch = search.trim();
  const searchPending = !!trimmedSearch && (searchFetching || debouncedSearch !== trimmedSearch || !searchData);

  // GA4 search + zero-result capture — fires once the RPC for the settled
  // query has resolved.
  useEffect(() => {
    if (!trimmedSearch || searchPending) return;
    const t = setTimeout(() => {
      analytics.push({
        event: "search",
        search_term: trimmedSearch,
        search_results_count: filtered.length,
      });
      // Capture genuine zero-result searches so the catalogue learns the
      // real terms customers type (feeds alias learning). Based on the RPC's
      // own result_count (a true no-match across the full catalogue), not the
      // post-filter count. Fire-and-forget; the RPC re-checks and no-ops on
      // blank/short/actually-matching terms.
      if ((searchData?.result_count ?? 0) === 0) {
        try {
          void (supabase as any).rpc("record_search_miss", { p_query: trimmedSearch });
        } catch {
          /* ignore — invisible capture must never affect the UI */
        }
      }
    }, 800);
    return () => clearTimeout(t);
  }, [trimmedSearch, searchPending, searchData, filtered.length]);

  // GA4 view_item_list — name varies with the active tab/category/search.
  const listId = trimmedSearch
    ? `search_${trimmedSearch}`
    : `shop_${tab}${categoryF ? `_${categoryF}` : ""}`;
  const listName = trimmedSearch
    ? `Search: ${trimmedSearch}`
    : (categoryF || tab === "all" ? `Shop — ${categoryF || "All"}` : `Shop — ${tab}`);
  useEffect(() => {
    if (!filtered.length) return;
    trackEcommerce("view_item_list", {
      item_list_id: listId,
      item_list_name: listName,
      items: filtered.slice(0, 30).map((hit, index) => ({
        item_id: hit.product.id,
        item_name: hit.product.name,
        item_brand: hit.product.brands?.[0]?.label ?? "",
        item_category: hit.product.category ?? "",
        item_category2: hit.product.subcategory ?? "",
        price: hit.product.brands?.[0]?.price ?? 0,
        index,
        item_list_id: listId,
        item_list_name: listName,
      })),
    });
  }, [listId, listName, filtered]);

  // GA4 select_item helper — called from product card open handlers.
  const fireSelectItem = (product: Product, index: number) => {
    const brand = product.brands?.[0];
    trackEcommerce("select_item", {
      item_list_id: listId,
      item_list_name: listName,
      items: [{
        item_id: product.id,
        item_name: product.name,
        item_brand: brand?.label ?? "",
        item_variant: brand?.sku ?? "",
        item_category: product.category ?? "",
        item_category2: product.subcategory ?? "",
        price: brand?.price ?? 0,
        index,
      }],
    });
  };

  const isBaby = tab === "baby";
  const isMum = tab === "mum";

  // Sections-only mode: storefront variants (/shop, /shop/baby, /shop/mum)
  // with no search query. The page becomes a vertical list of category
  // sections ordered by purchase popularity (see usePopularCategories).
  // Search queries fall through to the legacy flat grid below so the user
  // can still hunt across the full catalogue.
  const sectionsOnlyMode = !!pathShop && (tab === "all" || tab === "baby" || tab === "mum") && !search;

  const activeFilterCount = [
    tab !== "all" ? 1 : 0,
    budgetF !== "all" ? 1 : 0,
    categoryF ? 1 : 0,
    brandF ? 1 : 0,
    (priceMinF != null || priceMaxF != null) ? 1 : 0,
    inStockOnlyF ? 1 : 0,
    search ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Available price range for the seed inputs — min / max price of
  // the currently-filtered-by-tab products. Falls back to 0 / 500000.
  const priceBounds = useMemo(() => {
    let min = Infinity, max = 0;
    const pool = (allProducts || []).filter(p =>
      tab === "all" || p.category === tab || (tab === "push-gift" && p.category === "push-gift")
    );
    pool.forEach(p => p.brands.forEach(b => {
      const pr = Number(b.price) || 0;
      if (pr > 0) { if (pr < min) min = pr; if (pr > max) max = pr; }
    }));
    if (!isFinite(min) || max === 0) return { min: 0, max: 500000 };
    return { min: Math.floor(min), max: Math.ceil(max) };
  }, [allProducts, tab]);

  // Canonical sort-option metadata. Supports both DB keys and legacy
  // URL keys so existing links still work.
  const ALL_SORT_OPTIONS: Array<{ key: string; label: string; aliases?: string[] }> = [
    { key: "rating",     label: "Top Rated" },
    { key: "price_asc",  label: "Price: Low to High", aliases: ["price-low"] },
    { key: "price_desc", label: "Price: High to Low", aliases: ["price-high"] },
    { key: "name_asc",   label: "Name: A – Z" },
    { key: "newest",     label: "Newest First" },
  ];
  const FALLBACK_ENABLED_SORTS = ["rating", "price_asc", "price_desc", "name_asc", "newest"];
  const enabledSortsRaw = (siteSettings as any)?.shop_enabled_sorts;
  const enabledSortKeys: string[] = Array.isArray(enabledSortsRaw)
    ? enabledSortsRaw
    : FALLBACK_ENABLED_SORTS;
  const enabledSortOptions = ALL_SORT_OPTIONS.filter(o => enabledSortKeys.includes(o.key));
  // Resolve the current sort (URL) back to a canonical key so the sheet
  // can highlight the correct row even when the URL uses a legacy alias.
  const canonicalSort = ALL_SORT_OPTIONS.find(o => o.key === sortBy || o.aliases?.includes(sortBy))?.key || sortBy;
  const sortLabel = ALL_SORT_OPTIONS.find(o => o.key === canonicalSort)?.label || "Sort";

  const handleFilterApply = (f: { tab: string; budget: string; category: string; brand: string; sort: string; priceMin?: number | null; priceMax?: number | null; inStockOnly?: boolean }) => {
    const params = new URLSearchParams();
    if (f.tab !== "all") params.set("tab", f.tab);
    if (f.budget !== "all") params.set("budget", f.budget);
    if (f.category) params.set("category", f.category);
    if (f.brand) params.set("brand", f.brand);
    if (f.sort !== "popular") params.set("sort", f.sort);
    if (search) params.set("q", search);
    if (f.priceMin != null) params.set("priceMin", String(f.priceMin));
    if (f.priceMax != null) params.set("priceMax", String(f.priceMax));
    if (f.inStockOnly) params.set("inStock", "1");
    setSearchParams(params, { replace: true });
    setVisibleCount(ITEMS_PER_PAGE);
  };

  const seoTitle = isBaby
    ? "Baby Shop — Products for Your Newborn | BundledMum"
    : isMum
    ? "Mum Shop — Postpartum & Maternity Essentials | BundledMum"
    : "Shop All Products | BundledMum";
  const seoDescription = isBaby
    ? "Shop newborn and baby essentials curated for Nigerian families — diapers, clothing, feeding, and more."
    : isMum
    ? "Shop postpartum recovery, maternity wear, and self-care essentials for Nigerian mums."
    : "Browse every product in the BundledMum store — curated maternity and baby essentials for Nigerian mums.";
  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title={seoTitle} description={seoDescription} />
      {/* Prototype-style header: cream background, clean search, and a
          mobile category chip row (the prototype's signature). Desktop keeps
          the full filter bar below, so the chips stay mobile-only to avoid
          duplicating the tab controls. Copy strings are unchanged from the
          previous hero (still hardcoded pending a backend shop-hero field —
          see the backend audit). */}
      <div className="pt-[68px] bg-background border-b border-border">
        <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-5 md:py-10">
          <h1 className="pf text-2xl md:text-[40px] text-forest mb-1.5">
            {isBaby ? "Baby Shop" : isMum ? "Mum Shop" : "All Shops"}
          </h1>
          <p className="text-muted-foreground text-[13px] md:text-[15px] max-w-[480px]">
            Shop baby essentials, mum items, and baby gifts without stepping foot in any market.
          </p>
          <div className="mt-4 relative max-w-[520px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
            <input placeholder="Search products..." value={search} onChange={e => { setSearch(e.target.value); setFilter("q", e.target.value); }}
              className="w-full rounded-pill bg-card border border-border text-foreground text-sm font-body pl-11 pr-4 py-3 outline-none placeholder:text-text-light focus:border-forest transition-colors min-h-[48px]" />
          </div>
          {/* Category chips — mobile only. All/Baby/Mum switch the shop variant;
              Bundles/Gifts link out, mirroring the homepage category tiles. */}
          <div className="md:hidden flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 mt-4 pb-0.5">
            {[
              { label: "All", to: "/shop", active: tab === "all" && !categoryF && !search },
              { label: "Baby", to: "/shop/baby", active: tab === "baby" },
              { label: "Mum", to: "/shop/mum", active: tab === "mum" },
              { label: "Bundles", to: "/bundles", active: false },
              { label: "Gifts", to: "/bundles/baby-shower-gift-boxes", active: false },
            ].map(c => (
              <Link key={c.label} to={c.to}
                className={`flex-shrink-0 rounded-pill px-4 py-2 text-[13px] font-semibold border transition-colors min-h-[40px] inline-flex items-center ${c.active ? "bg-forest border-forest text-primary-foreground" : "bg-card border-border text-muted-foreground"}`}>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Filter / sort bars hide entirely in sections-only mode. The new
          shop layout has no flat grid to filter against. */}
      {!sectionsOnlyMode && (<>
      {/* MOBILE: Filter + Sort buttons */}
      <div className="md:hidden bg-card border-b border-border py-2.5 px-4 sticky top-[68px] z-50">
        <div className="flex gap-2 items-center">
          <button onClick={() => { setFilterDrawerInitialSection("filter"); setFilterDrawerOpen(true); }}
            className="flex-1 flex items-center justify-center gap-2 rounded-pill border-[1.5px] border-border py-2.5 text-sm font-semibold font-body min-h-[44px] relative">
            <Filter className="h-4 w-4" /> Filter
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-coral text-primary-foreground text-[10px] font-bold flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
          <button
            onClick={() => setSortSheetOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 rounded-pill border-[1.5px] border-border py-2.5 text-sm font-semibold font-body min-h-[44px]"
          >
            <ArrowUpDown className="h-4 w-4" /> {sortLabel}
          </button>
          <span className="text-muted-foreground text-xs whitespace-nowrap">{filtered.length}</span>
        </div>
      </div>

      {/* DESKTOP: Full filter bar */}
      <div className="hidden md:block bg-card border-b border-border py-3 px-4 md:px-10 sticky top-[68px] z-50">
        <div className="max-w-[1200px] mx-auto space-y-2">
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 items-center min-w-max">
              <span className="text-muted-foreground text-[13px] font-semibold mr-1">Shop:</span>
              {[{ key: "all", label: "All" }, { key: "baby", label: "👶 Baby" }, { key: "mum", label: "💛 Mum" }, { key: "push-gift", label: "💝 Push Gifts" }].map(t => (
                <button key={t.key} onClick={() => setFilter("tab", t.key)}
                  className={`rounded-pill px-3 py-2 text-xs font-semibold border-[1.5px] transition-all font-body whitespace-nowrap min-h-[44px] ${tab === t.key ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                  {t.label}
                </button>
              ))}
              <div className="w-px h-5 bg-border mx-1 flex-shrink-0" />
              <span className="text-muted-foreground text-[13px] font-semibold mr-1 whitespace-nowrap">Budget:</span>
              {[["all", "All"], ["starter", "🌱 Starter"], ["standard", "🌿 Standard"], ["premium", "✨ Premium"]].map(([v, l]) => (
                <button key={v} onClick={() => setFilter("budget", v)}
                  className={`rounded-pill px-3 py-2 text-xs font-semibold border-[1.5px] transition-all font-body whitespace-nowrap min-h-[44px] ${budgetF === v ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                  {l}
                </button>
              ))}
              <div className="w-px h-5 bg-border mx-1 flex-shrink-0" />
              <select value={sortBy} onChange={e => setFilter("sort", e.target.value)} className="rounded-pill border-[1.5px] border-border px-3 py-2 text-xs font-semibold font-body bg-card text-muted-foreground outline-none whitespace-nowrap flex-shrink-0 min-h-[44px]">
                <option value="popular">Sort: Popular</option>
                <option value="price-low">Price: Low → High</option>
                <option value="price-high">Price: High → Low</option>
                <option value="rating">Top Rated</option>
              </select>
              <span className="text-muted-foreground text-xs whitespace-nowrap flex-shrink-0">{filtered.length} items</span>
            </div>
          </div>

          {filteredCategories.length > 0 && (
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-1.5 items-center min-w-max">
                <span className="text-muted-foreground text-[11px] font-semibold mr-1">Category:</span>
                <button onClick={() => setFilter("category", "")}
                  className={`rounded-pill px-2.5 py-1.5 text-[11px] font-semibold border-[1.5px] transition-all font-body whitespace-nowrap min-h-[36px] ${!categoryF ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                  All
                </button>
                {filteredCategories.map(cat => {
                  const count = categoryCounts[cat.slug] || 0;
                  return (
                    <button key={cat.id} onClick={() => setFilter("category", cat.slug)}
                      className={`rounded-pill px-2.5 py-1.5 text-[11px] font-semibold border-[1.5px] transition-all font-body whitespace-nowrap min-h-[36px] ${categoryF === cat.slug ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                      {cat.icon} {cat.name} {count > 0 && <span className="text-muted-foreground">({count})</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {allBrandNames.length > 0 && (
            <div className="overflow-x-auto scrollbar-hide relative">
              <div className="flex gap-1.5 items-center">
                <span className="text-muted-foreground text-[11px] font-semibold mr-1 flex-shrink-0">Brand:</span>
                <button onClick={() => setFilter("brand", "")}
                  className={`rounded-pill px-2.5 py-1.5 text-[11px] font-semibold border-[1.5px] transition-all font-body whitespace-nowrap flex-shrink-0 min-h-[36px] ${!brandF ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                  All
                </button>
                {allBrandNames.map(name => (
                  <button key={name} onClick={() => setFilter("brand", name.toLowerCase())}
                    className={`rounded-pill px-2.5 py-1.5 text-[11px] font-semibold border-[1.5px] transition-all font-body whitespace-nowrap flex-shrink-0 min-h-[36px] ${brandF.toLowerCase() === name.toLowerCase() ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {budgetF && budgetF !== "all" && budgetF !== "standard" && (
            <div>
              <span className="bg-forest-light text-forest rounded-pill px-3 py-0.5 text-[11px] font-semibold">
                ✓ Brands pre-selected for {budgetF} — all {filtered.length} products visible
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Active filter chips — renders when any filter is active; each chip has
          an × to remove just that one. "Clear all" surfaces when 2+ are on. */}
      {activeFilterCount > 0 && (
        <div className="max-w-[1200px] mx-auto px-4 md:px-10 pt-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-4 md:mx-0 px-4 md:px-0">
            {tab !== "all" && (
              <FilterChip label={`Shop: ${tab === "baby" ? "Baby" : tab === "mum" ? "Mum" : "Push Gifts"}`} onRemove={() => setFilter("tab", "all")} />
            )}
            {budgetF !== "all" && (
              <FilterChip label={`Budget: ${budgetF[0].toUpperCase() + budgetF.slice(1)}`} onRemove={() => setFilter("budget", "all")} />
            )}
            {categoryF && (
              <FilterChip label={`Category: ${filteredCategories.find(c => c.slug === categoryF)?.name || categoryF}`} onRemove={() => setFilter("category", "")} />
            )}
            {brandF && <FilterChip label={`Brand: ${brandF}`} onRemove={() => setFilter("brand", "")} />}
            {(priceMinF != null || priceMaxF != null) && (
              <FilterChip
                label={`₦${(priceMinF ?? 0).toLocaleString()} – ${priceMaxF != null ? `₦${priceMaxF.toLocaleString()}` : "∞"}`}
                onRemove={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete("priceMin"); params.delete("priceMax");
                  setSearchParams(params, { replace: true });
                }}
              />
            )}
            {inStockOnlyF && (
              <FilterChip label="In stock only" onRemove={() => {
                const params = new URLSearchParams(searchParams);
                params.delete("inStock");
                setSearchParams(params, { replace: true });
              }} />
            )}
            {search && (
              <FilterChip label={`Search: ${search}`} onRemove={() => { setSearch(""); setFilter("q", ""); }} />
            )}
            {activeFilterCount >= 2 && (
              <button
                onClick={() => {
                  setSearch("");
                  setSearchParams(new URLSearchParams(), { replace: true });
                  setVisibleCount(ITEMS_PER_PAGE);
                }}
                className="ml-auto flex-shrink-0 text-xs font-semibold text-destructive hover:underline whitespace-nowrap"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
      </>)}

      <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-6 md:py-10">
        <SpendMoreBanner variant="shop" />

        {/* Storefront sections are now fully driven by shop_sections —
            the admin Merchandising "Shop Sections" tab is the single
            source of truth for order, visibility, title, and subtitle.
            Bundle sections and category sections render through the
            same loop, in admin-configured order. Search queries and
            category-specific tabs skip the section feed entirely. */}
        {sectionsOnlyMode ? (
          <ShopSectionsRenderer
            shop={tab as ShopVariant}
            onOpenDetail={p => setDetailProduct(p)}
          />
        ) : (isLoading || searchPending) ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5 mt-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="bg-card rounded-card shadow-card h-[380px] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">🔍</div>
            {/* Category-only empty state vs general 'no match' */}
            {categoryF && !search && !brandF && priceMinF == null && priceMaxF == null ? (
              <>
                <h2 className="pf text-xl mb-2">No products in this category yet</h2>
                <p className="text-muted-foreground text-sm mb-4">Check back soon — we're constantly adding new items.</p>
              </>
            ) : (
              <>
                <h2 className="pf text-xl mb-2">No products found</h2>
                <p className="text-muted-foreground text-sm mb-4">Try adjusting your filters or search term.</p>
              </>
            )}
            <button
              onClick={() => {
                // One-tap recovery — clear all URL params AND the local search box.
                setSearch("");
                setSearchParams(new URLSearchParams(), { replace: true });
                setVisibleCount(ITEMS_PER_PAGE);
              }}
              className="inline-flex items-center gap-1.5 border-[1.5px] border-forest text-forest rounded-pill px-5 py-2.5 text-sm font-semibold hover:bg-forest/5 min-h-[44px]"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5 mt-4">
              {visibleProducts.map((hit, idx) => (
                <ProductCard
                  key={`${hit.product.id}${hit.brandId ? `-${hit.brandId}` : ""}`}
                  product={hit.product}
                  defaultBudget={!budgetF || budgetF === "all" ? "standard" : budgetF}
                  forceBrand={brandF || undefined}
                  selectedBrandId={hit.brandId}
                  matchBadge={hit.isBrandMatch ? "Brand match" : undefined}
                  deliveryText={deliveryText}
                  onAdd={item => { addToCart(item); toast.success(`✓ ${item.name} added to cart`, { action: { label: "View Cart →", onClick: () => window.location.href = "/cart" } }); }}
                  onViewDetail={() => { fireSelectItem(hit.product, idx); setDetailProduct(hit.product); }}
                />
              ))}
            </div>

            {/* Pagination */}
            <div className="text-center mt-8 space-y-3">
              <p className="text-muted-foreground text-sm font-body">
                Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} products
              </p>
              {hasMore && (
                <button onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
                  className="rounded-pill bg-forest px-8 py-3 font-body font-semibold text-primary-foreground hover:bg-forest-deep interactive text-sm min-h-[48px]">
                  Load More Products
                </button>
              )}
            </div>
          </>
        )}

      </div>

      <ProductDetailDrawer product={detailProduct} defaultBudget={!budgetF || budgetF === "all" ? "standard" : budgetF} onClose={() => setDetailProduct(null)} />

      <ShopFilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={{ tab, budget: budgetF, category: categoryF, brand: brandF, sort: sortBy, priceMin: priceMinF, priceMax: priceMaxF, inStockOnly: inStockOnlyF }}
        onApply={handleFilterApply}
        categories={filteredCategories}
        brandNames={allBrandNames}
        productCounts={categoryCounts}
        openSection={filterDrawerInitialSection}
        showPriceFilter={(siteSettings as any)?.shop_show_price_filter !== false}
        showInStockFilter={(siteSettings as any)?.shop_show_instock_filter !== false}
        priceBounds={priceBounds}
      />

      {/* Mobile sort bottom sheet — single-select, closes on pick */}
      <Drawer open={sortSheetOpen} onOpenChange={o => { if (!o) setSortSheetOpen(false); }}>
        <DrawerContent className="max-h-[70svh] flex flex-col outline-none">
          <div className="px-5 pt-2 pb-3 border-b border-border">
            <h3 className="font-bold text-base">Sort by</h3>
          </div>
          <div className="py-2">
            {enabledSortOptions.map(opt => {
              const selected = canonicalSort === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setFilter("sort", opt.key); setSortSheetOpen(false); }}
                  className={`w-full flex items-center justify-between px-5 py-4 text-left min-h-[52px] ${selected ? "bg-forest-light text-forest font-semibold" : "text-foreground hover:bg-muted/50"}`}
                >
                  <span className="text-sm">{opt.label}</span>
                  {selected && <Check className="w-4 h-4 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0 bg-forest/10 text-forest border border-forest/30 rounded-full px-3 py-1 text-xs">
      <span className="truncate max-w-[160px]">{label}</span>
      <button onClick={onRemove} aria-label={`Remove ${label}`} className="hover:text-destructive">×</button>
    </span>
  );
}

