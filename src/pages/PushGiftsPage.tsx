import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import Seo from "@/components/Seo";
import Breadcrumb from "@/components/Breadcrumb";
import { useCart, fmt, getBrandForBudget, getMissingVariantAxes } from "@/lib/cart";
import { toast } from "sonner";
import ProductImage from "@/components/ProductImage";
import SpendMoreBanner from "@/components/SpendMoreBanner";
import QtyControl from "@/components/QtyControl";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { adaptProducts } from "@/lib/supabaseAdapters";
import type { Product, Brand } from "@/lib/supabaseAdapters";
import { Gift, Sparkles, Truck, RotateCcw, ArrowDown } from "lucide-react";

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
      const adapted = adaptProducts(data);
      return adapted.map((p, i) => ({ ...p, _raw: data?.[i] }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// The legacy push-gift sub-categories collapsed into a single new slug
// 'mum-gifts-keepsakes'; 'bundles' drives a different filter path.
const FILTER_TABS = [
  { key: "all", label: "All gifts" },
  { key: "mum-gifts-keepsakes", label: "Gifts & Keepsakes" },
  { key: "bundles", label: "Bundles" },
];

function PushGiftCard({ product, onAdd }: { product: Product; onAdd: (item: any) => void }) {
  const navigate = useNavigate();
  const defaultBrand = getBrandForBudget(product, "standard");
  const [selectedBrand, setSelectedBrand] = useState<Brand>(defaultBrand);
  const { cart, updateQty } = useCart();

  const cartKey = `${product.id}-${selectedBrand.id}`;
  const cartItem = cart.find(c => c._key === cartKey || c.id === product.id);
  const isInCart = !!cartItem;
  const allBrandsOos = product.brands.every(b => !b.inStock);
  const isOutOfStock = allBrandsOos || !selectedBrand.inStock;
  const displayImage = selectedBrand.imageUrl || product.imageUrl;
  const onSale = !!(selectedBrand.compareAtPrice && selectedBrand.compareAtPrice > selectedBrand.price);
  const savePct = onSale ? Math.round(((selectedBrand.compareAtPrice! - selectedBrand.price) / selectedBrand.compareAtPrice!) * 100) : 0;
  const minPrice = Math.min(...product.brands.map(b => b.price));

  const handleAdd = () => {
    if (isOutOfStock) return;
    // Variant-requiring product: route to its detail page to choose size/colour
    // instead of adding blind (the cart guard also blocks variant-less adds).
    if (getMissingVariantAxes(product).length) { navigate(`/products/${product.slug}`); return; }
    onAdd({ ...product, selectedBrand, price: selectedBrand.price, name: `${product.name} (${selectedBrand.label})` });
  };

  return (
    <div className={`group flex flex-col rounded-2xl border border-border bg-card overflow-hidden card-hover ${allBrandsOos ? "opacity-60" : ""}`}>
      <Link to={`/products/${product.slug}`} className="relative block aspect-square bg-warm-cream overflow-hidden">
        {onSale && !allBrandsOos ? (
          <span className="absolute top-2.5 left-2.5 rounded-pill bg-coral text-primary-foreground text-[10px] font-bold px-2 py-0.5 z-10">Save {savePct}%</span>
        ) : product.badge ? (
          <span className="absolute top-2.5 left-2.5 rounded-pill bg-forest text-primary-foreground text-[10px] font-bold px-2 py-0.5 z-10 uppercase tracking-wide">{product.badge}</span>
        ) : null}
        {allBrandsOos && (
          <span className="absolute top-2.5 right-2.5 rounded-pill bg-midnight/75 text-primary-foreground text-[10px] font-bold px-2 py-0.5 z-10">Sold out</span>
        )}
        <ProductImage imageUrl={displayImage} emoji={product.baseImg} alt={product.name} className="w-full h-full" emojiClassName="text-6xl" />
      </Link>

      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <Link to={`/products/${product.slug}`} className="pf font-bold text-[15px] text-foreground leading-snug line-clamp-2 hover:text-coral transition-colors">
          {product.name}
        </Link>
        {product.description && (
          <p className="text-muted-foreground text-[12px] leading-relaxed line-clamp-2">{product.description}</p>
        )}

        {/* Choose your budget: brand price options */}
        {product.brands.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {product.brands.map(b => {
              const bOos = !b.inStock;
              return (
                <button key={b.id} onClick={() => setSelectedBrand(b)}
                  className={`inline-flex items-center rounded-pill px-2.5 py-1 text-[11px] font-semibold border transition-colors ${bOos ? "opacity-40" : ""} ${selectedBrand.id === b.id ? "border-coral bg-coral-blush text-coral" : "border-border bg-card text-muted-foreground hover:border-coral/40"}`}>
                  {b.label} · <span className="font-mono-price ml-0.5">{fmt(b.price)}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-auto pt-1.5 space-y-2">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono-price text-forest font-bold text-[17px]">{fmt(selectedBrand.price)}</span>
            {onSale ? (
              <span className="font-mono-price text-muted-foreground text-[10px] line-through">{fmt(selectedBrand.compareAtPrice!)}</span>
            ) : product.brands.length > 1 ? (
              <span className="text-text-light text-[10px]">from {fmt(minPrice)}</span>
            ) : null}
          </div>
          {isOutOfStock ? (
            <span className="block w-full text-center rounded-pill bg-border px-3 py-2 text-[11px] font-semibold text-text-light">Sold Out</span>
          ) : isInCart && cartItem ? (
            <div className="flex justify-center">
              <QtyControl qty={cartItem.qty} onUpdate={(newQty) => updateQty(cartItem._key, newQty)} accentColor="coral" maxQty={selectedBrand.stockQuantity ?? undefined} />
            </div>
          ) : (
            <button onClick={handleAdd} className="w-full rounded-pill bg-coral py-2.5 text-xs font-bold text-primary-foreground hover:bg-coral-dark transition-colors min-h-[38px]">Add to cart</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PushGiftsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const { addToCart } = useCart();
  const { data: products, isLoading } = usePushGiftProducts();

  const filtered = useMemo(() => {
    if (!products) return [];
    if (activeTab === "all") return products;
    return products.filter(p => {
      if (p.subcategory === activeTab) return true;
      const raw = (p as any)._raw;
      const pgCats: string[] | null = raw?.push_gift_categories || null;
      if (pgCats && pgCats.includes(activeTab)) return true;
      return false;
    });
  }, [products, activeTab]);

  const handleAdd = (item: any) => {
    addToCart(item);
    toast.success(`${item.name} added to cart`);
  };

  const scrollToGifts = () => document.getElementById("gift-grid")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo
        title="Push Gifts — Thoughtful Gifts for New Mums | BundledMum"
        description="Hand-picked push gifts to celebrate a new mum. Curated by BundledMum and delivered across Nigeria."
      />

      {/* Premium hero */}
      <div className="pt-[68px] bg-gradient-to-b from-coral-blush via-coral-blush/40 to-background relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-[380px] h-[380px] rounded-full bg-coral/[0.06] pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 w-[320px] h-[320px] rounded-full bg-forest/[0.05] pointer-events-none" />
        <div className="max-w-[860px] mx-auto px-4 md:px-10 py-12 md:py-20 text-center relative">
          <Breadcrumb items={[{ label: "Push Gifts" }]} className="justify-center mb-6" />
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-card border border-border px-4 py-1.5 text-[12px] font-semibold text-coral mb-6 shadow-sm">
            <Gift className="w-3.5 h-3.5" /> For the new mum
          </span>
          <h1 className="pf text-[32px] md:text-[52px] font-bold text-forest leading-[1.08] mb-4">
            Celebrate her. <span className="text-coral italic">She earned it.</span>
          </h1>
          <p className="text-muted-foreground text-[15px] md:text-[18px] max-w-[540px] mx-auto leading-relaxed mb-8">
            A hand-picked collection of push gifts to mark the most important moment of her life. Thoughtfully chosen, beautifully delivered.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button onClick={scrollToGifts} className="inline-flex items-center gap-1.5 rounded-pill bg-coral text-primary-foreground px-6 py-3 text-sm font-semibold hover:bg-coral-dark transition-colors">
              Shop the collection <ArrowDown className="w-4 h-4" />
            </button>
            <Link to="/quiz" className="inline-flex items-center rounded-pill border border-forest text-forest px-6 py-3 text-sm font-semibold hover:bg-forest/5 transition-colors">
              Not sure? Take the quiz
            </Link>
          </div>
        </div>
      </div>

      {/* Gift benefits strip */}
      <div className="border-y border-border bg-card">
        <div className="max-w-[1180px] mx-auto px-4 md:px-10 py-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[12px] md:text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-coral" /> Hand-picked for new mums</span>
          <span className="inline-flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-forest" /> Fast Lagos delivery</span>
          <span className="inline-flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5 text-forest" /> Easy returns</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="bg-background border-b border-border sticky top-[68px] z-40">
        <div className="max-w-[1180px] mx-auto px-4 md:px-10 py-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
            {FILTER_TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex-shrink-0 rounded-pill px-4 py-2 text-[13px] font-semibold border transition-colors min-h-[40px] ${activeTab === t.key ? "border-coral bg-coral text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-coral/40"}`}>
                {t.label}
              </button>
            ))}
            <span className="text-text-light text-xs ml-1 whitespace-nowrap flex-shrink-0">{filtered.length} gifts</span>
          </div>
        </div>
      </div>

      {/* Gift grid */}
      <div id="gift-grid" className="max-w-[1180px] mx-auto px-4 md:px-10 py-8">
        <SpendMoreBanner />

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="aspect-square bg-muted animate-pulse" />
                <div className="p-3.5 space-y-2"><div className="h-3 bg-muted rounded animate-pulse w-3/4" /><div className="h-3 bg-muted rounded animate-pulse w-1/2" /></div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🎁</div>
            <h2 className="pf text-xl font-bold mb-2">No gifts in this category yet</h2>
            <p className="text-muted-foreground text-sm">Check back soon, we are adding new gifts regularly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {filtered.map(p => (
              <PushGiftCard key={p.id} product={p} onAdd={handleAdd} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
