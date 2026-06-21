import { useState, useMemo } from "react";
import Seo from "@/components/Seo";
import { useCart, fmt, getBrandForBudget } from "@/lib/cart";
import { toast } from "sonner";
import ProductDetailDrawer from "@/components/ProductDetailDrawer";
import ProductImage from "@/components/ProductImage";
import SpendMoreBanner from "@/components/SpendMoreBanner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { adaptProducts } from "@/lib/supabaseAdapters";
import type { Product, Brand } from "@/lib/supabaseAdapters";
import QtyControl from "@/components/QtyControl";

function usePushGiftProducts() {
  return useQuery({
    queryKey: ["products", "push-gift"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, brands:brands_public!brands_product_id_fkey(id, product_id, brand_name, price, tier, is_default_for_tier, size_variant, in_stock, stock_quantity, display_order, image_url, stored_image_url, thumbnail_url, logo_url, compare_at_price, weight_range_kg, pack_count, diaper_type), product_sizes(*), product_colors(*), product_tags(*), product_images(*)")
        .eq("category", "push-gift")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("display_order");
      if (error) throw error;
      // Attach raw row data so we can access push_gift_categories
      const adapted = adaptProducts(data);
      return adapted.map((p, i) => ({ ...p, _raw: data?.[i] }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// All four legacy push-gift sub-categories (jewellery / pampering /
// keepsakes / experience) collapsed into a single new slug
// 'mum-gifts-keepsakes', so keep one combined tab here. 'bundles' is
// a separate filter (drives a different query path).
const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "mum-gifts-keepsakes", label: "🎁 Gifts & Keepsakes" },
  { key: "bundles", label: "📦 Bundles" },
];

const TIER_LABELS: Record<string, string> = {
  starter: "💛 Thoughtful",
  standard: "💎 Generous",
  premium: "✨ Go All Out",
};

function PushGiftCard({ product, onAdd, onViewDetail }: { product: Product; onAdd: (item: any) => void; onViewDetail: () => void }) {
  const defaultBrand = getBrandForBudget(product, "standard");
  const [selectedBrand, setSelectedBrand] = useState<Brand>(defaultBrand);
  const { cart, setCart, updateQty } = useCart();

  const cartKey = `${product.id}-${selectedBrand.id}`;
  const cartItem = cart.find(c => c._key === cartKey || c.id === product.id);
  const isInCart = !!cartItem;
  const brandOos = !selectedBrand.inStock;
  const allBrandsOos = product.brands.every(b => !b.inStock);
  const isOutOfStock = allBrandsOos || brandOos;
  const displayImage = selectedBrand.imageUrl || product.imageUrl;
  const showSale = selectedBrand.compareAtPrice && selectedBrand.compareAtPrice > selectedBrand.price;

  const handleAdd = () => {
    if (isOutOfStock) return;
    onAdd({ ...product, selectedBrand, price: selectedBrand.price, name: `${product.name} (${selectedBrand.label})` });
  };
  const handleRemove = () => { setCart(prev => prev.filter(c => c.id !== product.id)); toast("Removed from cart"); };

  // Group brands by tier
  const brandsByTier = useMemo(() => {
    const map: Record<string, Brand[]> = {};
    product.brands.forEach(b => {
      const tier = b.tier || "standard";
      if (!map[tier]) map[tier] = [];
      map[tier].push(b);
    });
    return map;
  }, [product.brands]);

  return (
    <div className={`bg-card rounded-card shadow-card card-hover overflow-hidden ${allBrandsOos ? "opacity-60" : ""}`}>
      <div className="h-[160px] sm:h-[180px] md:h-[200px] flex items-center justify-center relative cursor-pointer overflow-hidden"
        style={{ background: displayImage ? '#f5f5f5' : `linear-gradient(135deg, #FFE0E6, #fff)` }}
        onClick={onViewDetail}>
        {product.badge && (
          <div className="absolute top-2.5 left-2.5 bg-coral text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-pill uppercase tracking-wide z-10">{product.badge}</div>
        )}
        {showSale && (
          <div className="absolute top-2.5 right-2.5 bg-destructive text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-pill z-10">
            Save {Math.round(((selectedBrand.compareAtPrice! - selectedBrand.price) / selectedBrand.compareAtPrice!) * 100)}%
          </div>
        )}
        {allBrandsOos && <div className="absolute top-2.5 right-2.5 bg-foreground/70 text-primary-foreground text-[9px] font-bold px-2 py-0.5 rounded-pill z-10">Out of Stock</div>}
        <ProductImage imageUrl={displayImage} emoji={product.baseImg} alt={product.name} className="w-full h-full" emojiClassName="text-6xl" />
      </div>
      <div className="p-4">
        <h3 className="text-[14px] font-semibold mb-1 leading-tight min-h-[36px] cursor-pointer hover:text-coral transition-colors" onClick={onViewDetail}>{product.name}</h3>
        <p className="text-text-med text-[11px] leading-relaxed mb-3 line-clamp-2">{product.description}</p>

        {/* Tier-based brand selection */}
        <div className="mb-3 space-y-1">
          {Object.entries(brandsByTier).map(([tier, brands]) => (
            <div key={tier} className="flex flex-wrap gap-1">
              <span className="text-[10px] font-semibold text-text-light w-full">{TIER_LABELS[tier] || tier}</span>
              {brands.map(b => {
                const bOos = !b.inStock;
                return (
                  <button key={b.id} onClick={() => setSelectedBrand(b)}
                    className={`inline-flex items-center min-h-9 px-3 rounded-pill text-[10px] font-semibold border-[1.5px] transition-all font-body ${bOos ? "opacity-50" : ""} ${selectedBrand.id === b.id ? "border-coral bg-coral/10 text-coral" : "border-border bg-card text-text-med"}`}>
                    {b.label} {fmt(b.price)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-coral text-xs">⭐ {product.rating}</span>
          <span className="text-text-light text-[11px]">({product.reviews})</span>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <div className="text-coral font-bold text-[17px]">{fmt(selectedBrand.price)}</div>
            {showSale && <div className="text-text-light text-[10px] line-through">{fmt(selectedBrand.compareAtPrice!)}</div>}
            {!showSale && product.brands.length > 1 && <div className="text-text-light text-[10px]">from {fmt(Math.min(...product.brands.map(b => b.price)))}</div>}
          </div>
          {isOutOfStock ? (
            <span className="rounded-pill bg-border px-3 py-1.5 text-[10px] font-semibold text-text-light font-body">Sold Out</span>
          ) : isInCart && cartItem ? (
            <QtyControl qty={cartItem.qty} onUpdate={(newQty) => updateQty(cartItem._key, newQty)} accentColor="coral" maxQty={selectedBrand.stockQuantity ?? undefined} />
          ) : (
            <button onClick={handleAdd} className="rounded-pill bg-coral px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-coral-dark font-body interactive">+ Add to Cart</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PushGiftsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const { addToCart } = useCart();
  const { data: products, isLoading } = usePushGiftProducts();

  const filtered = useMemo(() => {
    if (!products) return [];
    if (activeTab === "all") return products;
    return products.filter(p => {
      // Check subcategory match
      if (p.subcategory === activeTab) return true;
      // Check push_gift_categories array from raw product data
      const raw = (p as any)._raw;
      const pgCats: string[] | null = raw?.push_gift_categories || null;
      if (pgCats && pgCats.includes(activeTab)) return true;
      return false;
    });
  }, [products, activeTab]);

  const handleAdd = (item: any) => {
    addToCart(item);
    toast.success(`${item.name} added to cart! 💝`);
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo
        title="Push Gifts — Thoughtful Gifts for New Mums | BundledMum"
        description="Hand-picked push gifts to celebrate a new mum. Curated by BundledMum and delivered across Nigeria."
      />
      {/* Hero */}
      <div className="pt-20" style={{ background: "linear-gradient(135deg, #C2185B 0%, #E91E63 50%, #F06292 100%)" }}>
        <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-10 md:py-16 text-center">
          <h1 className="pf text-3xl md:text-[48px] text-primary-foreground mb-3 leading-tight">
            Celebrate Her. She Earned It. 💝
          </h1>
          <p className="text-primary-foreground/80 text-sm md:text-[17px] max-w-[560px] mx-auto leading-relaxed">
            The perfect push gift for the most important moment of her life.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-card border-b border-border py-3 px-4 md:px-10 sticky top-[68px] z-50">
        <div className="max-w-[1200px] mx-auto">
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
            <div className="flex gap-2 items-center min-w-max">
              {FILTER_TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`rounded-pill px-4 py-2 text-xs font-semibold border-[1.5px] transition-all font-body whitespace-nowrap ${activeTab === t.key ? "border-coral bg-coral/10 text-coral" : "border-border bg-card text-text-med"}`}>
                  {t.label}
                </button>
              ))}
              <span className="text-text-light text-xs ml-2">{filtered.length} gifts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="max-w-[1200px] mx-auto px-4 md:px-10 py-8">
        <SpendMoreBanner />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">💝</p>
            <p className="text-text-med text-sm">No push gifts found in this category yet.</p>
            <p className="text-text-light text-xs mt-1">Check back soon — we're adding new gifts regularly!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(p => (
              <PushGiftCard key={p.id} product={p} onAdd={handleAdd} onViewDetail={() => setDetailProduct(p)} />
            ))}
          </div>
        )}
      </div>

      <ProductDetailDrawer product={detailProduct} onClose={() => setDetailProduct(null)} />
    </div>
  );
}
