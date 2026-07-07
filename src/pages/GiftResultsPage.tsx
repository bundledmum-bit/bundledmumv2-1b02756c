import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Share2, ClipboardCopy, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCart, fmt } from "@/lib/cart";
import { useAllProducts } from "@/hooks/useSupabaseData";
import { useVariantRequirements } from "@/hooks/useVariantRequirements";
import ResultProductCard from "@/components/quiz/ResultProductCard";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import BundleCustomiser from "@/components/BundleCustomiser";
import type { RecommendedProduct } from "@/components/quiz/types";

/**
 * Dedicated gift quiz results page. Visually identical to the general
 * quiz results screen (`ResultsScreen` inside HomeQuiz.tsx) — same
 * forest-green gradient hero, same coral CTA strip, same
 * "bg-coral text-white" section heading pills, same product grid, and
 * the same ResultProductCard. Only the heading copy and the data
 * source differ. RPC: get_gift_category_products.
 */

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
  const navigate = useNavigate();
  const category = searchParams.get("category") || "";
  const budget = Number(searchParams.get("budget") || 0) || 0;
  const categoryLabel = CATEGORY_TITLE[category] || "Gift Suggestions";

  useEffect(() => { document.title = `${categoryLabel} | BundledMum`; }, [categoryLabel]);

  const { cart, addToCart, setCart } = useCart();
  const variantReq = useVariantRequirements();
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

  // Same cart-add path the general ResultsScreen uses for each item.
  const handleAddProduct = (item: RecommendedProduct) => {
    if (!item.brand || item.brand.price == null) {
      toast("This item is coming soon and can't be added yet.");
      return;
    }
    // Recommendation cards can't collect a size/colour — if this product needs
    // one, send the shopper to its page to choose rather than adding blind.
    const missing = variantReq.missingAxes(item.product_id, item.selected_color);
    if (missing.length) {
      const label = missing.length === 2 ? "a size & colour" : missing[0] === "color" ? "a colour" : "a size";
      if (item.slug) { navigate(`/products/${item.slug}`); toast(`Choose ${label} for ${item.name}`); }
      else toast.error(`Please choose ${label} for ${item.name} on its product page.`);
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

  // ── "What's Inside" modal state ────────────────────────────────────
  // BundleCustomiser is the single source of truth for the interactive
  // contents UI — same component the bundle product page uses, so the
  // checkbox / brand / variant / colour / qty / add-search behaviour
  // and the "Proceed to Checkout — ₦X" CTA are inherited verbatim.
  const [modalBundle, setModalBundle] = useState<RecommendedProduct | null>(null);
  const openBundleModal = (item: RecommendedProduct) => setModalBundle(item);
  const closeBundleModal = () => setModalBundle(null);

  // Escape key closes the "What's Inside" modal — matches the
  // BundleCustomiser's own image-zoom shortcut so the keyboard
  // affordance is consistent across both layers.
  useEffect(() => {
    if (!modalBundle) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeBundleModal(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalBundle]);

  // ── Loading state — matches the general results screen. ────────────
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

  // ── Empty / error state — matches the "No matching items" panel. ───
  if (error || !data || data.product_count === 0) {
    return (
      <div className="min-h-screen bg-background pt-[68px] px-4 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="pf text-lg font-semibold mb-1">No matching items found</p>
          <p className="text-text-med text-sm mb-3">Try another category or budget.</p>
          <button onClick={() => navigate("/quiz")} className="rounded-pill border border-forest text-forest px-4 py-2 text-xs font-semibold">Retake Quiz</button>
        </div>
      </div>
    );
  }

  const products = data.products || [];
  // Section 1 = engine-flagged bundles (gift-box packages); section 2
  // = everything else. Items with no `section` value land in singles
  // so a future engine change doesn't accidentally hide them.
  const bundles = products.filter(p => p.section === "bundle");
  const singles = products.filter(p => p.section !== "bundle");

  const grandTotal = data.total_spend;
  const amount = `₦${budget.toLocaleString("en-NG")}`;
  const heading = `A ${amount} ${categoryLabel} gift bundle`;
  const subHeading = `Hand-picked from the ${categoryLabel} range to suit your budget. Swap or remove anything that doesn't fit before checkout.`;

  // "Get Gift Bundle" — adds every priced item to cart then routes to
  // the cart. Mirrors handleAddAll on the general results screen.
  const handleAddAll = () => {
    const buyable = products.filter(p => !!p.brand && p.brand.price != null);
    buyable.forEach(handleAddProduct);
    toast.success("✓ Your full gift bundle has been added to cart!");
    navigate("/cart");
  };

  const handleCopyChecklist = () => {
    const list = products.map(r => {
      const price = r.brand?.price ?? 0;
      const qty = r.quantity ?? 1;
      return `${qty > 1 ? `×${qty} ` : ""}${r.name} (${r.brand?.brand_name || "Standard"}) — ${fmt(price * qty)}`;
    }).join("\n");
    const text = `My BundledMum ${categoryLabel}\n${"=".repeat(30)}\n\n${list}\n\nTotal: ${fmt(grandTotal)}\n\nBuild yours: https://bundledmum.com`;
    navigator.clipboard.writeText(text).then(() => toast.success("Checklist copied to clipboard!"));
  };

  const handleShare = () => {
    const url = window.location.href;
    const shareText = `Check out my ${categoryLabel} gift bundle on BundledMum: ${url}`;
    if (navigator.share) {
      navigator.share({ title: "BundledMum Gift Bundle", text: shareText, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => toast.success("Link copied!"));
    }
  };

  const renderCard = (item: RecommendedProduct & { section?: "bundle" | "single" }) => {
    const card = (
      <ResultProductCard
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
    // Only bundle-section items get the secondary "What's Inside" CTA —
    // singles are individual products with no inner contents to expand.
    if (item.section !== "bundle") return <div key={item.product_id}>{card}</div>;
    return (
      <div key={item.product_id} className="flex flex-col gap-2">
        {card}
        <button
          type="button"
          onClick={() => openBundleModal(item)}
          className="w-full rounded-pill border-2 border-forest text-forest text-xs font-semibold py-2 hover:bg-forest hover:text-primary-foreground transition-colors"
        >
          Click here to see what's inside
        </button>
      </div>
    );
  };

  // ── Page shell — mirrors ResultsScreen markup top-to-bottom. ──────
  return (
    <div className="min-h-screen bg-background pt-[68px] pb-16 md:pb-0">
      <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }} className="px-4 md:px-10 py-8 md:py-14">
        <div className="max-w-[880px] mx-auto text-center">
          {data.over_budget && (
            <div className="bg-amber-500/20 border border-amber-500/40 rounded-lg px-4 py-2 mb-4 inline-block">
              <p className="text-amber-200 text-xs">
                The cheapest bundle in this category exceeds your budget — we've still included it because every gift should ship with at least one curated package.
              </p>
            </div>
          )}
          <div className="animate-fade-in inline-flex items-center gap-2 bg-coral/20 border border-coral/40 rounded-pill px-4 py-1.5 mb-3.5">
            <span className="text-coral text-[13px] font-semibold">🎁 Perfect Gift Bundle Ready!</span>
          </div>
          <h1 className="pf text-2xl md:text-[40px] text-primary-foreground mb-3">{heading}</h1>
          <p className="text-primary-foreground/80 text-sm md:text-[15px] leading-[1.8] mb-4 max-w-[660px] mx-auto">{subHeading}</p>

          <div className="flex flex-wrap gap-2 justify-center mb-5">
            <Link to="/quiz" className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-pill px-3 py-1 text-primary-foreground/80 text-[11px] font-semibold hover:bg-primary-foreground/20 transition-colors">
              🎁 {categoryLabel}
            </Link>
            <Link to="/quiz" className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-pill px-3 py-1 text-primary-foreground/80 text-[11px] font-semibold hover:bg-primary-foreground/20 transition-colors">
              💰 {amount}
            </Link>
          </div>

          {/* Item-count strip — hidden on mobile to reduce clutter */}
          <div className="hidden md:flex flex-wrap gap-3 justify-center text-primary-foreground/60 text-xs mb-5">
            {data.bundles_count > 0 && <><span>🎁 {data.bundles_count} curated bundle{data.bundles_count === 1 ? "" : "s"}</span><span>·</span></>}
            {data.singles_count > 0 && <><span>✨ {data.singles_count} individual gift{data.singles_count === 1 ? "" : "s"}</span><span>·</span></>}
            <span>Total: {data.product_count} items</span><span>·</span>
            <span className="text-coral font-bold">{fmt(grandTotal)}</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center px-4 sm:px-0">
            <button onClick={() => document.getElementById("quiz-results-items")?.scrollIntoView({ behavior: "smooth" })} className="rounded-pill bg-coral px-6 py-3 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive text-sm w-full sm:hidden">
              👇 See Your Items Below
            </button>
            <button onClick={handleAddAll} className="hidden sm:inline-flex rounded-pill bg-coral px-8 py-3 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive text-[15px]">
              🎁 Get Gift Bundle — {fmt(grandTotal)} →
            </button>
            <button onClick={handleAddAll} className="sm:hidden rounded-pill border-2 border-primary-foreground/30 px-6 py-3 font-body font-semibold text-primary-foreground/80 hover:bg-primary-foreground/10 interactive text-sm w-full">
              Get Gift Bundle — {fmt(grandTotal)} →
            </button>
            <Link to="/quiz" className="hidden sm:inline-flex rounded-pill border-2 border-primary-foreground/30 px-6 py-3 font-body font-semibold text-primary-foreground/80 hover:bg-primary-foreground/10 interactive text-[15px] items-center justify-center">
              ← Retake Quiz
            </Link>
          </div>

          <div className="flex gap-3 justify-center mt-4 flex-wrap">
            <button onClick={handleShare} className="flex items-center gap-1.5 text-primary-foreground/50 text-xs hover:text-primary-foreground/80 transition-colors">
              <Share2 className="h-3.5 w-3.5" /> Share List
            </button>
            <button onClick={handleCopyChecklist} className="flex items-center gap-1.5 text-primary-foreground/50 text-xs hover:text-primary-foreground/80 transition-colors">
              <ClipboardCopy className="h-3.5 w-3.5" /> Copy checklist
            </button>
          </div>
        </div>
      </div>

      <div id="quiz-results-items" className="max-w-[1000px] mx-auto px-4 md:px-10 py-8 md:py-10">
        {/* SECTION 1 — Recommended Gift Bundles
            Engine sets section="bundle" on every bundle product the
            customer can buy as a packaged gift. Empty for categories
            where the curator has no bundle output yet. */}
        {bundles.length > 0 && (
          <div className="mb-10">
            <h2 className="pf inline-block bg-coral text-white text-base md:text-lg font-bold px-4 py-2 rounded-pill mb-4">
              🎁 Recommended Gift Bundles
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
              {bundles.map(renderCard)}
            </div>
          </div>
        )}

        {/* SECTION 2 — Other Products You Can Add
            Visually distinct from the bundle row above: top divider,
            outer heading + subtitle, then a soft-grey rounded panel
            wrapping the grid so the eye reads it as a different layer
            even when the bundle section is short. */}
        {singles.length > 0 && (
          <div className="mt-12 mb-10">
            <div className="border-t border-border pt-10">
              <h2 className="pf text-xl md:text-2xl font-bold text-foreground mb-1">
                Other Products You Can Add
              </h2>
              <p className="text-text-med text-sm mb-6">
                Add individual items alongside your chosen bundle.
              </p>
              <div className="bg-muted/40 rounded-2xl p-4 md:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
                  {singles.map(renderCard)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <button onClick={handleAddAll} className="rounded-pill bg-coral px-8 py-3 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive text-sm sm:text-[15px]">
            🎁 Get Gift Bundle — {fmt(grandTotal)}
          </button>
          <Link to="/bundles" className="rounded-pill border-2 border-forest px-8 py-3 font-body font-semibold text-forest hover:bg-forest hover:text-primary-foreground interactive text-sm sm:text-[15px] text-center">
            Browse for More Products
          </Link>
        </div>

        <div className="bg-forest rounded-card p-6 md:p-8 text-center mb-8">
          <h3 className="pf text-xl text-primary-foreground mb-2">💬 Need a hand picking the right gift?</h3>
          <p className="text-primary-foreground/70 text-sm mb-4 max-w-[400px] mx-auto">
            Chat with us on WhatsApp — we'll tailor the perfect gift to your budget.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={`https://wa.me/+2347040667424?text=${encodeURIComponent(`Hi BundledMum! I'm looking for a gift in the ${categoryLabel} category at ${amount}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-pill bg-[#25D366] px-6 py-2.5 font-body font-semibold text-primary-foreground text-sm interactive"
            >
              📱 Chat on WhatsApp
            </a>
            <button onClick={handleShare} className="rounded-pill border-2 border-primary-foreground/30 px-6 py-2.5 font-body font-semibold text-primary-foreground/80 text-sm interactive">
              📤 Share this list
            </button>
          </div>
        </div>
      </div>

      {/* What's Inside modal — custom overlay (not shadcn Dialog) so
          the close button can sit in a sticky modal-panel header
          guaranteed to be visible above the site nav. z-9999 puts the
          overlay above every other layer including the storefront
          fixed header. BundleCustomiser inside owns the checkbox /
          brand / variant / colour / qty controls; its Proceed-to-
          Checkout CTA navigates away and dismisses the modal. */}
      {modalBundle && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 max-md:items-end max-md:p-0"
          onClick={closeBundleModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-w-2xl w-full bg-card rounded-2xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Sticky header — close button always visible regardless
                of scroll position inside the modal body. */}
            <div className="flex items-center justify-between gap-3 px-5 md:px-6 py-3 md:py-4 border-b border-border flex-shrink-0">
              <h2 className="pf text-base md:text-lg font-bold truncate">
                {modalBundle.name}
              </h2>
              <button
                onClick={closeBundleModal}
                aria-label="Close"
                className="flex items-center justify-center w-8 h-8 rounded-full bg-muted hover:bg-muted/80 text-text-med hover:text-foreground transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 md:px-6 pb-5 md:pb-6">
              <BundleCustomiser
                productId={modalBundle.product_id}
                productName={modalBundle.name}
                bundleLabel={(modalBundle as any).bundle_label || null}
                bundleSku={modalBundle.brand?.id ?? null}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
