import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCart, fmt } from "@/lib/cart";
import { useAllProducts } from "@/hooks/useSupabaseData";
import ResultProductCard from "@/components/quiz/ResultProductCard";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import type { RecommendedProduct } from "@/components/quiz/types";

const CATEGORY_TITLE: Record<string, string> = {
  postpartum_kits: "Postpartum Kits",
  baby_shower_boxes: "Baby Shower Gift Boxes",
  push_gifts: "Push Gifts",
};

interface GiftResponse {
  category: string;
  budget_amount: number;
  product_count: number;
  bundles_count: number;
  singles_count: number;
  total_spend: number;
  over_budget: boolean;
  engine_version: string;
  products: (RecommendedProduct & { section?: "bundle" | "single" })[];
}

export default function GiftResultsPage() {
  const [searchParams] = useSearchParams();
  const category = searchParams.get("category") || "";
  const budget = Number(searchParams.get("budget") || 0) || 0;
  const pageTitle = CATEGORY_TITLE[category] || "Gift Suggestions";

  useEffect(() => { document.title = `${pageTitle} | BundledMum`; }, [pageTitle]);

  const { cart, addToCart, setCart } = useCart();
  const { data: allProducts } = useAllProducts();
  const productMap = useMemo(() => {
    const m = new Map<string, any>();
    (allProducts || []).forEach(p => m.set(p.id, p));
    return m;
  }, [allProducts]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gift-results", category, budget],
    enabled: !!category,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_gift_category_products" as any, {
          p_category: category,
          p_budget_amount: budget,
        });
      if (error) throw error;
      return data as unknown as GiftResponse;
    },
  });

  // Mirrors handleAddProduct from HomeQuiz.ResultsScreen — adds a single
  // item to the cart with the recommended brand snapshot. No bundle
  // wrapper; each tap adds exactly one cart row.
  const handleAddProduct = (item: RecommendedProduct) => {
    if (!item.brand || item.brand.price == null) {
      toast("This item is coming soon and can't be added yet.");
      return;
    }
    addToCart({
      id: item.product_id,
      name: `${item.name} (${item.brand.brand_name})`,
      baseImg: item.emoji || "🎁",
      imageUrl: item.brand.image_url || item.image_url || undefined,
      price: item.brand.price,
      selectedBrand: {
        id: item.brand.id,
        label: item.brand.brand_name,
        price: item.brand.price,
        img: item.emoji || "🎁",
        imageUrl: item.brand.image_url || null,
        tier: 1,
        color: "#E8F5E9",
      },
      selectedSize: "",
      brands: [],
      category: item.category as any,
      rating: 4.5,
      reviews: 0,
      tags: [],
      badge: null,
      stage: [],
      priority: item.priority as any,
      tier: [],
      hospitalType: [],
      deliveryMethod: [],
      genderRelevant: false,
      multiplesBump: 1,
      scope: [],
      firstBaby: null,
      description: "",
      whyIncluded: item.why_included,
    } as any);
    toast.success(`✓ ${item.name} added to cart`);
  };

  const handleRemoveProduct = (item: RecommendedProduct) => {
    setCart(prev => prev.filter(c => c.id !== item.product_id));
    toast("Removed from cart");
  };

  const addedIds = new Set(cart.map(c => c.id));

  const bundles = (data?.products || []).filter(p => p.section === "bundle");
  const singles = (data?.products || []).filter(p => p.section === "single");
  const isPostpartum = category === "postpartum_kits";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pt-[68px] flex items-center justify-center">
        <div className="text-center">
          <BMLoadingAnimation size={200} />
          <h2 className="pf text-xl text-foreground mb-2 mt-4">Finding the perfect gift...</h2>
        </div>
      </div>
    );
  }

  if (error || !data || data.product_count === 0) {
    return (
      <div className="min-h-screen bg-background pt-[68px] px-4 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="pf text-lg font-semibold mb-1">No gifts in this category right now</p>
          <p className="text-text-med text-sm mb-4">Try another category or chat with us on WhatsApp.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/quiz" className="rounded-pill bg-forest text-primary-foreground px-4 py-2 text-xs font-semibold">Retake quiz</Link>
            <a
              href="https://wa.me/+2347040667424?text=Hi%20BundledMum%21%20I%27m%20looking%20for%20a%20gift."
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-pill bg-[#25D366] text-white px-4 py-2 text-xs font-semibold"
            >
              📱 WhatsApp us
            </a>
          </div>
        </div>
      </div>
    );
  }

  const renderCard = (item: RecommendedProduct) => (
    <ResultProductCard
      key={item.product_id}
      item={item}
      isInCart={addedIds.has(item.product_id)}
      cartItem={cart.find(c => c.id === item.product_id)}
      onQtyUpdate={(key, qty) => {
        const c = cart.find(x => x._key === key);
        if (!c) return;
        setCart(prev => prev.map(x => x._key === key ? { ...x, qty } : x));
      }}
      onAdd={() => handleAddProduct(item)}
      onRemove={() => handleRemoveProduct(item)}
      fullProduct={productMap.get(item.product_id)}
    />
  );

  return (
    <div className="min-h-screen bg-background pt-[68px] pb-16">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8">
        <header className="text-center py-8 md:py-12">
          <h1 className="pf text-3xl md:text-[44px] font-bold mb-2">{pageTitle}</h1>
          <p className="text-text-med text-sm md:text-base">
            Hand-picked for your budget — add what you love to cart.
          </p>
        </header>

        {/* Postpartum view splits into two sections; the other two
            categories render as a single ordered grid (bundles first). */}
        {isPostpartum ? (
          <>
            {bundles.length > 0 && (
              <section className="mb-10">
                <h2 className="pf text-xl md:text-2xl font-bold mb-3">Postpartum Recovery Kits</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
                  {bundles.map(renderCard)}
                </div>
              </section>
            )}
            {singles.length > 0 && (
              <section className="mb-10">
                <h2 className="pf text-xl md:text-2xl font-bold mb-3">Individual Postpartum Products</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
                  {singles.map(renderCard)}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="mb-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5">
              {data.products.map(renderCard)}
            </div>
          </section>
        )}

        {/* Budget summary */}
        <div className="my-8 p-5 md:p-6 bg-muted/30 border border-border rounded-card">
          <div className="flex justify-between text-base md:text-lg">
            <span className="text-text-med">Your budget:</span>
            <span className="font-semibold tabular-nums">{fmt(budget)}</span>
          </div>
          <div className="flex justify-between text-base md:text-lg font-semibold mt-1">
            <span>Total:</span>
            <span className="text-forest tabular-nums">{fmt(data.total_spend)}</span>
          </div>
          {data.over_budget && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-sm">
              The cheapest bundle in this category costs more than your budget. We've included it anyway because every gift bundle should have at least one curated package. Add or remove items to fit your budget.
            </div>
          )}
        </div>

        {/* WhatsApp CTA — mirrors the regular results page */}
        <div className="bg-forest rounded-card p-6 md:p-8 text-center">
          <h3 className="pf text-xl text-primary-foreground mb-2">💬 Need a hand picking the right gift?</h3>
          <p className="text-primary-foreground/70 text-sm mb-4 max-w-[400px] mx-auto">
            Chat with us on WhatsApp — we'll help tailor the perfect gift bundle to your budget.
          </p>
          <a
            href={`https://wa.me/+2347040667424?text=${encodeURIComponent(`Hi BundledMum! I'm looking for a gift in the ${pageTitle} category at ₦${budget.toLocaleString("en-NG")}.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-pill bg-[#25D366] text-white px-6 py-2.5 text-sm font-semibold"
          >
            📱 Chat on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
