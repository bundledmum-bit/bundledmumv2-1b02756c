import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Seo from "@/components/Seo";
import { useSearchParams, Link, useLocation, useNavigate } from "react-router-dom";
import CuratedSections from "@/components/CuratedSections";
import BundleSections from "@/components/BundleSections";
import ShopSectionsRenderer from "@/components/ShopSectionsRenderer";
import type { ShopVariant } from "@/hooks/useMerchandising";
import { useCart, fmt, getBrandForBudget, cartItemKey } from "@/lib/cart";
import { toast } from "sonner";
import { useAllProducts, useSiteSettings } from "@/hooks/useSupabaseData";
import { useProductCategories } from "@/hooks/useProductCategories";
import CategoryTiles from "@/components/shop/CategoryTiles";
import CategoryNav from "@/components/shop/CategoryNav";
import type { Product, Brand } from "@/lib/supabaseAdapters";
import { isProductOOS, hasInStockBrand } from "@/lib/supabaseAdapters";
import { supabase } from "@/integrations/supabase/client";
import { track as pixelTrack } from "@/lib/metaPixel";
import { analytics, trackEcommerce } from "@/lib/ga";
import { diaperBadges, packCountLabel } from "@/lib/diaperBrand";
import ProductImage from "@/components/ProductImage";
import SpendMoreBanner from "@/components/SpendMoreBanner";
import QtyControl from "@/components/QtyControl";
import ShopFilterDrawer from "@/components/ShopFilterDrawer";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Filter, ArrowUpDown, Check, Truck, ShieldCheck, RotateCcw, Search } from "lucide-react";

function ProductCard({ product, defaultBudget = "standard", forceBrand, selectedBrandId, matchBadge, deepLinkSku, onAdd, deliveryText }: { product: Product; defaultBudget?: string; forceBrand?: string; selectedBrandId?: string; matchBadge?: string; deepLinkSku?: string; onAdd: (item: any) => void; deliveryText?: string }) {
  const defaultBrand = getBrandForBudget(product, defaultBudget);
  const seedBrand = selectedBrandId
    ? (product.brands.find(b => b.id === selectedBrandId) || defaultBrand)
    : defaultBrand;
  const [selectedBrand, setSelectedBrand] = useState<Brand>(seedBrand);
  // No auto-pick: a size-required product must have the customer's explicit
  // choice (via the inline size picker below) before it can be added —
  // otherwise handleAdd routes to the detail page. Colour has no inline picker
  // on the card, so colour-required products always route to detail to choose.
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor] = useState("");
  const { cart, updateQty } = useCart();

  const cartKey = cartItemKey(product.id, selectedBrand.id, selectedSize || null, selectedColor || null, null);
  const cartItem = cart.find(c => c._key === cartKey);

  const brandOos = !selectedBrand.inStock;
  const allBrandsOos = product.brands.every(b => !b.inStock);
  const isOutOfStock = isProductOOS(product) || brandOos;
  const productLevelOos = isProductOOS(product);
  const isLowStock = selectedBrand.stockQuantity != null && selectedBrand.stockQuantity > 0 && selectedBrand.stockQuantity <= 5;

  const displayImage = selectedBrand.imageUrl || product.imageUrl;
  // When this card was surfaced by a brand-matched search, deep-link the
  // product to the matched brand via ?sku so the PDP opens on that brand.
  const productHref = deepLinkSku
    ? `/products/${product.slug}?sku=${encodeURIComponent(deepLinkSku)}`
    : `/products/${product.slug}`;
  const showSale = selectedBrand.compareAtPrice && selectedBrand.compareAtPrice > selectedBrand.price;
  const savePct = showSale ? Math.round(((selectedBrand.compareAtPrice! - selectedBrand.price) / selectedBrand.compareAtPrice!) * 100) : 0;

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

  const needsSizeChoice = !!(product.sizes && product.sizes.length > 0 && !selectedSize);

  const handleAdd = () => {
    if (isOutOfStock) return;
    // Route to the detail page to choose any required variant not yet picked
    // (size can be chosen inline; colour has no inline picker on the card).
    if ((product.sizes?.length && !selectedSize) || (product.colors?.length && !selectedColor)) { window.location.href = `/products/${product.slug}`; return; }
    onAdd({ ...product, selectedBrand, price: selectedBrand.price, name: `${product.name} (${selectedBrand.label})`, selectedSize, selectedColor });
  };

  const handleQtyChange = (newQty: number) => {
    if (cartItem) updateQty(cartItem._key, newQty);
  };

  // When a brand was matched by search (selectedBrandId), hoist it to the
  // front so its pill is always visible instead of hiding behind "+N more".
  // The remaining pills keep their existing order.
  const orderedBrands = (() => {
    const idx = selectedBrandId ? product.brands.findIndex(b => b.id === selectedBrandId) : -1;
    if (idx > 0) {
      const rest = product.brands.slice();
      const [m] = rest.splice(idx, 1);
      return [m, ...rest];
    }
    return product.brands;
  })();
  const visibleBrands = orderedBrands.slice(0, 3);
  const hiddenCount = orderedBrands.length - 3;

  return (
    <div className={`bg-card rounded-[16px] border border-border/60 overflow-hidden flex flex-col group transition-shadow hover:shadow-md ${(allBrandsOos || productLevelOos) ? "opacity-60" : ""}`}>
      {/* Image */}
      <Link to={productHref} className="block relative aspect-square overflow-hidden bg-[#f5f5f5]">
        {productLevelOos ? (
          <span className="absolute top-2 left-2 bg-[#E53935] text-white text-[9px] font-bold px-2 py-0.5 rounded-pill z-10 uppercase tracking-wide">Out of Stock</span>
        ) : product.badge ? (
          <span className="absolute top-2 left-2 bg-coral text-white text-[9px] font-bold px-2 py-0.5 rounded-pill z-10 uppercase tracking-wide">{product.badge}</span>
        ) : null}
        {matchBadge && (
          <span className="absolute bottom-2 left-2 bg-emerald-100 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-pill z-10 border border-emerald-300 uppercase tracking-wide">{matchBadge}</span>
        )}
        {showSale && !productLevelOos && (
          <span className="absolute top-2 right-2 bg-destructive text-white text-[9px] font-bold px-2 py-0.5 rounded-pill z-10">-{savePct}%</span>
        )}
        {allBrandsOos && !productLevelOos && (
          <span className="absolute top-2 right-2 bg-foreground/70 text-white text-[9px] font-bold px-2 py-0.5 rounded-pill z-10">Out of Stock</span>
        )}
        {isLowStock && !allBrandsOos && !productLevelOos && (
          <span className="absolute top-2 right-2 bg-[#E65100] text-white text-[9px] font-bold px-2 py-0.5 rounded-pill z-10">Only {selectedBrand.stockQuantity} left!</span>
        )}
        <ProductImage
          imageUrl={displayImage}
          emoji={selectedBrand.img || product.baseImg}
          alt={product.name}
          className="w-full h-full transition-transform duration-500 group-hover:scale-[1.04]"
          emojiClassName="text-6xl"
        />
      </Link>

      {/* Content */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Name links to product page */}
        <Link to={productHref} className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2 hover:text-forest transition-colors min-h-[36px]">
          {product.name}
        </Link>

        {/* Diaper attribute pills */}
        {(() => {
          const badges = diaperBadges(selectedBrand);
          return badges.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {badges.map(b => (
                <span key={b} className="text-[10px] font-medium rounded-full px-2 py-0.5 bg-muted text-muted-foreground">{b}</span>
              ))}
            </div>
          ) : null;
        })()}

        {/* Brand selector pills */}
        {product.brands.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {visibleBrands.map(b => {
              const bOos = !b.inStock;
              const pcLabel = packCountLabel(b);
              return (
                <button key={b.id} onClick={() => setSelectedBrand(b)}
                  className={`px-2 py-0.5 rounded-pill text-[10px] font-semibold border transition-all font-body inline-flex items-center gap-0.5 min-h-[28px] ${bOos ? "opacity-40" : ""} ${selectedBrand.id === b.id ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground hover:border-forest/30"}`}>
                  {b.label}{pcLabel ? ` ${pcLabel}` : ""}
                  {b.id === defaultBrand.id && !bOos && <span className="text-coral text-[9px] ml-0.5">★</span>}
                </button>
              );
            })}
            {hiddenCount > 0 && (
              <Link to={`/products/${product.slug}`}
                className="px-2 py-0.5 rounded-pill text-[10px] font-semibold border border-border text-forest hover:border-forest min-h-[28px] inline-flex items-center">
                +{hiddenCount} more
              </Link>
            )}
          </div>
        )}

        {/* Size chips */}
        {product.sizes && product.sizes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {product.sizes.map(s => (
              <button key={s} onClick={() => setSelectedSize(s)}
                className={`px-2 py-0.5 rounded-pill text-[10px] font-semibold border transition-all font-body min-h-[28px] ${selectedSize === s ? "border-forest bg-forest-light text-forest" : "border-border bg-card text-muted-foreground"}`}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Price + rating */}
        <div className="mt-auto pt-1 space-y-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono-price text-forest font-bold text-[16px]">{fmt(selectedBrand.price)}</span>
            {showSale && <span className="font-mono-price text-muted-foreground text-[11px] line-through">{fmt(selectedBrand.compareAtPrice!)}</span>}
            {!showSale && product.brands.length > 1 && (
              <span className="text-muted-foreground text-[10px]">from {fmt(Math.min(...product.brands.map(b => b.price)))}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-coral text-[11px]">★ {product.rating}</span>
            <span className="text-muted-foreground text-[10px]">({product.reviews})</span>
          </div>
        </div>

        {/* CTA */}
        {isOutOfStock ? (
          <div className="space-y-1">
            <span className="w-full rounded-pill bg-muted text-muted-foreground text-[11px] font-semibold py-2.5 min-h-[40px] flex items-center justify-center">Sold Out</span>
            <button onClick={() => toast("We'll notify you when it's back!")} className="w-full text-forest text-[10px] font-semibold hover:underline text-center block">Notify me</button>
          </div>
        ) : cartItem ? (
          <QtyControl qty={cartItem.qty} onUpdate={handleQtyChange} maxQty={selectedBrand.stockQuantity ?? undefined} />
        ) : (
          <button onClick={handleAdd} className="w-full rounded-pill bg-coral text-white text-[12px] font-semibold py-2.5 min-h-[40px] hover:bg-coral-dark transition-colors font-body">
            {needsSizeChoice ? "Choose Size →" : "Add to Cart"}
          </button>
        )}
      </div>
    </div>
  );
}

const ITEMS_PER_PAGE = 20;

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Derive the shop variant from the URL path. /shop/baby and /shop/mum
  // pin the tab; /shop falls back to the `tab` URL param. The merchandising
  // routes /shop/baby and /shop/mum are explicitly handled in App.tsx
  // before /shop/:slug, so the CategoryPage doesn't intercept them.
  const pathShop: ShopVariant | null =
    location.pathname === "/shop/baby" ? "baby"
    : location.pathname === "/shop/mum" ? "mum"
    : location.pathname === "/shop" ? "all"
    : null;
  // /shop/baby and /shop/mum pin the tab; /shop honours the ?tab param so
  // "Gifts" (push-gift) filters in place rather than loading another page.
  const tab = pathShop === "baby" ? "baby" : pathShop === "mum" ? "mum" : (searchParams.get("tab") || "all");
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
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  // Brand pre-select: when the search resolved to a brand (matched_brand), the
  // results pre-select that brand. "Show all brands" lets the shopper opt out
  // and see the default (cheapest) brand per product instead.
  const [showAllBrands, setShowAllBrands] = useState(false);
  const searchMatchedBrand: string | null = (searchData as any)?.matched_brand || null;
  useEffect(() => { setShowAllBrands(false); }, [debouncedSearch]);
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
  type Hit = { product: Product; brandId?: string; brandSku?: string; isBrandMatch: boolean };
  const filtered = useMemo<Hit[]>(() => {
    const q = search.trim();

    // Shared product-level filters (category chip / brand / stock / price) —
    // applied identically in browse and search modes so the chips behave the
    // same whether or not a query is active.
    const passesFilters = (p: Product): boolean => {
      // Hide any product with no in-stock brand at all (products with some
      // in-stock brands stay; individual OOS variants keep their badge).
      if (!hasInStockBrand(p)) return false;
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
        // Pre-select the searched brand only when the RPC signals a match
        // (per-brand matched_brand, or a top-level matched_brand for the query).
        // A generic query (matched_brand null) falls back to the default brand,
        // exactly as before. "Show all brands" opts out of the pre-select.
        const brandMatched = rp.brand?.matched_brand === true || !!(searchData as any)?.matched_brand;
        const matchedBrandId = !showAllBrands && brandMatched && rp.brand?.id && p.brands.some(b => b.id === rp.brand.id)
          ? rp.brand.id : undefined;
        hits.push({
          product: p,
          brandId: matchedBrandId,
          brandSku: matchedBrandId ? (rp.brand?.sku || undefined) : undefined,
          isBrandMatch: !!matchedBrandId,
        });
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
  }, [allProducts, tab, search, categoryF, brandF, sortBy, inStockOnlyF, priceMinF, priceMaxF, searchData, showAllBrands]);

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
  // Marketplace-dense shop: the landings now render the flat, filterable
  // product grid (maximum products visible) instead of the curated rails, so
  // sections-only mode is disabled. pathShop is still referenced here to keep
  // the section context intact. The rails branch below is kept but unreachable.
  const sectionsOnlyMode = false && !!pathShop && (tab === "all" || tab === "baby" || tab === "mum") && !search;

  const activeFilterCount = [
    categoryF ? 1 : 0,
    brandF ? 1 : 0,
    (priceMinF != null || priceMaxF != null) ? 1 : 0,
    inStockOnlyF ? 1 : 0,
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

  const shopBcLabel = isBaby ? "Baby Shop" : isMum ? "Mum Shop" : "All Shops";
  const shopBcHref = isBaby ? "/shop/baby" : isMum ? "/shop/mum" : "/shop";
  const hasShopFilter = !!categoryF || !!search;
  const activeSubcat = categoryF ? (categories || []).find(c => c.slug === categoryF) : null;
  const shopBreadcrumbs = [
    hasShopFilter ? { label: shopBcLabel, href: shopBcHref } : { label: shopBcLabel },
    ...(categoryF
      ? [search
          ? { label: activeSubcat?.name || categoryF, href: `${shopBcHref}/${categoryF}` }
          : { label: activeSubcat?.name || categoryF }]
      : []),
    ...(search ? [{ label: `Search: "${search}"` }] : []),
  ];

  // Category split for the browse tiles on the section landings.
  const babyCats = (categories || []).filter(
    (c) => c.parent_category === "baby" || c.parent_category === "both"
  );
  const mumCats = (categories || []).filter(
    (c) => c.parent_category === "mum" || c.parent_category === "both"
  );

  // Category nav data: the section's categories, each linking to its
  // subcategory page, plus a leading "All {section}" item.
  const navCats = isBaby ? babyCats : isMum ? mumCats : (categories || []);
  const navLinkFor = (c: (typeof navCats)[number]) =>
    `/shop/${c.parent_category === "mum" ? "mum" : "baby"}/${c.slug}`;
  const navAll = isBaby
    ? { label: "All Baby", href: "/shop/baby", icon: "👶" }
    : isMum
    ? { label: "All Mum", href: "/shop/mum", icon: "💛" }
    : { label: "All", href: "/shop", icon: "🛍️" };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title={seoTitle} description={seoDescription} />
      {/* Marketplace header: prominent search, tight and compact. */}
      <div className="pt-[68px] bg-card border-b border-border">
        <div className="max-w-[1200px] mx-auto px-3 md:px-6 py-2.5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setFilter("q", e.target.value); }}
              placeholder={isBaby ? "Search baby products..." : isMum ? "Search mum products..." : "Search products..."}
              className="w-full rounded-pill bg-background border border-border text-foreground text-sm pl-11 pr-4 py-2.5 outline-none placeholder:text-text-light focus:border-forest transition-colors min-h-[44px]"
            />
          </div>
          {/* Section subtitle (admin: shop_all/baby/mum_subtitle). Empty = hidden. */}
          {(() => {
            const subKey = isBaby ? "shop_baby_subtitle" : isMum ? "shop_mum_subtitle" : "shop_all_subtitle";
            const sub = (siteSettings as any)?.[subKey];
            return sub ? <p className="text-muted-foreground text-[13px] mt-2">{sub}</p> : null;
          })()}
          {/* Section tabs — wrap so every tab is visible without scrolling */}
          <div className="flex flex-wrap gap-2 mt-2.5">
            {[
              { label: "All", to: "/shop", active: tab === "all" },
              { label: "👶 Baby", to: "/shop/baby", active: tab === "baby" },
              { label: "💛 Mum", to: "/shop/mum", active: tab === "mum" },
              { label: "🎁 Gifts", to: "/shop?tab=push-gift", active: tab === "push-gift" },
            ].map(c => (
              <Link key={c.label} to={c.to}
                className={`rounded-pill px-3.5 py-1.5 text-[13px] font-semibold border transition-colors min-h-[36px] inline-flex items-center ${c.active ? "bg-forest border-forest text-primary-foreground" : "bg-card border-border text-muted-foreground"}`}>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Slim trust strip — admin: shop_trust_items (JSON). Empty = hidden. */}
      {(() => {
        const raw = (siteSettings as any)?.shop_trust_items;
        const arr = Array.isArray(raw)
          ? raw
          : (typeof raw === "string" && raw.trim() ? (() => { try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; } })() : []);
        const items = arr.map((x: any) => (typeof x === "string" ? x : x?.label || x?.text || "")).filter(Boolean);
        if (items.length === 0) return null;
        return (
          <div className="border-b border-border bg-card">
            <div className="max-w-[1200px] mx-auto px-3 md:px-6 py-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] md:text-xs text-muted-foreground">
              {items.map((label: string, i: number) => (
                <span key={i} className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-forest" /> {label}</span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Filter + Sort toolbar — same controls on mobile and desktop. Filter
          opens category / price / brand; Sort covers popularity and price. */}
      {!sectionsOnlyMode && (<>
      <div className="bg-card border-b border-border py-2.5 px-3 md:px-6 sticky top-[68px] z-50">
        <div className="max-w-[1200px] mx-auto flex gap-2 items-center">
          <button onClick={() => { setFilterDrawerInitialSection("filter"); setFilterDrawerOpen(true); }}
            className="flex-1 md:flex-none md:px-8 flex items-center justify-center gap-2 rounded-pill border-[1.5px] border-border py-2.5 text-sm font-semibold font-body min-h-[44px] relative hover:border-forest transition-colors">
            <Filter className="h-4 w-4" /> Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-coral text-primary-foreground text-[10px] font-bold">{activeFilterCount}</span>
            )}
          </button>
          <button
            onClick={() => setSortSheetOpen(true)}
            className="flex-1 md:flex-none md:px-8 flex items-center justify-center gap-2 rounded-pill border-[1.5px] border-border py-2.5 text-sm font-semibold font-body min-h-[44px] hover:border-forest transition-colors"
          >
            <ArrowUpDown className="h-4 w-4" /> {sortLabel}
          </button>
          <span className="text-muted-foreground text-xs md:text-sm whitespace-nowrap md:ml-2">{filtered.length} items</span>
        </div>
      </div>

      {/* Category quick-nav — placed right after the Sort control. Side-scroll
          circles on desktop, dropdown on mobile. Hidden while searching. */}
      {!search && navCats.length > 0 && (
        <div className="bg-card border-b border-border px-3 md:px-6 py-2.5">
          <div className="max-w-[1200px] mx-auto">
            <CategoryNav
              categories={navCats}
              linkFor={navLinkFor}
              all={navAll}
              activeSlug={categoryF || undefined}
            />
          </div>
        </div>
      )}

      {/* Active filter chips — renders when any filter is active; each chip has
          an × to remove just that one. "Clear all" surfaces when 2+ are on. */}
      {activeFilterCount > 0 && (
        <div className="max-w-[1200px] mx-auto px-4 md:px-10 pt-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-4 md:mx-0 px-4 md:px-0">
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

      <div className="max-w-[1200px] mx-auto px-3 md:px-6 py-4">
        <SpendMoreBanner variant="shop" />

        {/* Storefront sections are now fully driven by shop_sections —
            the admin Merchandising "Shop Sections" tab is the single
            source of truth for order, visibility, title, and subtitle.
            Bundle sections and category sections render through the
            same loop, in admin-configured order. Search queries and
            category-specific tabs skip the section feed entirely. */}
        {sectionsOnlyMode ? (
          <>
            {/* Browse by category tiles, then the merchandised rails. */}
            {tab === "all" ? (
              <div className="mb-10 space-y-8">
                {babyCats.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
                        <span>👶</span> Shop baby
                      </h2>
                      <Link to="/shop/baby" className="text-xs font-semibold text-forest hover:underline">
                        See all
                      </Link>
                    </div>
                    <CategoryTiles categories={babyCats} hrefBase="/shop/baby" />
                  </div>
                )}
                {mumCats.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-2">
                        <span>💛</span> Shop mum
                      </h2>
                      <Link to="/shop/mum" className="text-xs font-semibold text-forest hover:underline">
                        See all
                      </Link>
                    </div>
                    <CategoryTiles categories={mumCats} hrefBase="/shop/mum" />
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-10">
                <h2 className="text-lg md:text-xl font-bold text-foreground mb-3">Shop by category</h2>
                <CategoryTiles
                  categories={tab === "baby" ? babyCats : mumCats}
                  hrefBase={tab === "baby" ? "/shop/baby" : "/shop/mum"}
                />
              </div>
            )}
            <ShopSectionsRenderer
              shop={tab as ShopVariant}
              onOpenDetail={p => navigate(`/products/${p.slug}`)}
            />
          </>
        ) : (isLoading || searchPending) ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2.5 md:gap-3 mt-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
              <div key={i} className="bg-card rounded-card shadow-card h-[320px] animate-pulse" />
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
            {/* Brand pre-select indicator: search resolved to a brand. */}
            {!!trimmedSearch && searchMatchedBrand && !showAllBrands && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-forest-light border border-forest/20 px-3.5 py-2.5">
                <span className="text-[13px] text-forest font-semibold">
                  Showing <span className="font-bold">{searchMatchedBrand}</span> products
                </span>
                <button onClick={() => setShowAllBrands(true)} className="text-[12px] font-semibold text-forest underline underline-offset-2 hover:text-forest-deep">
                  Show all brands
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2.5 md:gap-3 mt-2">
              {visibleProducts.map((hit, idx) => (
                <ProductCard
                  key={`${hit.product.id}${hit.brandId ? `-${hit.brandId}` : ""}`}
                  product={hit.product}
                  defaultBudget={!budgetF || budgetF === "all" ? "standard" : budgetF}
                  forceBrand={brandF || undefined}
                  selectedBrandId={hit.brandId}
                  deepLinkSku={hit.brandSku}
                  matchBadge={hit.isBrandMatch ? "Brand match" : undefined}
                  deliveryText={deliveryText}
                  onAdd={item => { fireSelectItem(hit.product, idx); addToCart(item); toast.success(`✓ ${item.name} added to cart`, { action: { label: "View Cart →", onClick: () => window.location.href = "/cart" } }); }}
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

