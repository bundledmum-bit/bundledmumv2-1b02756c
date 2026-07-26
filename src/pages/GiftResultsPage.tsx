import { useEffect, useMemo, useRef } from "react";
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
import type { RecommendedProduct } from "@/components/quiz/types";
import { getBudgetTier } from "@/lib/budgetTiers";
import { completeQuizSession, currentQuizAttemptId } from "@/lib/quizSessionTracking";

/**
 * Dedicated gift quiz results page. Visually identical to the general
 * quiz results screen (`ResultsScreen` inside HomeQuiz.tsx) — same
 * forest-green gradient hero, same coral CTA strip, same product grid and
 * the same ResultProductCard. Only the heading copy and the data source
 * differ. RPC: run_gift_recommendation, keyed on a gift_moments moment.
 */

// run_gift_recommendation's response. Same product shape as
// run_quiz_recommendation, plus the moment metadata used in the hero.
interface GiftResponse {
  moment: string;
  moment_label: string;
  moment_emoji: string | null;
  timing_hint: string | null;
  gift_focus: string | null;
  allow_bulk: boolean;
  budget_tier: string;
  budget_amount: number;
  gender: string;
  engine_version: string;
  product_count: number;
  list_total: number;
  over_budget: boolean;
  excluded_count: number;
  products: RecommendedProduct[];
  also_recommended?: RecommendedProduct[];
}

// Priority sections, in the order the shopper should read them. Labels match
// the maternity results screen's treatment (emoji chip + heading + count).
const PRIORITY_SECTIONS: Array<{ key: string; label: string; emoji: string }> = [
  { key: "essential", label: "Gift essentials", emoji: "🎁" },
  { key: "recommended", label: "Recommended additions", emoji: "💛" },
  { key: "nice-to-have", label: "Convenience extras", emoji: "✨" },
];

export default function GiftResultsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // `moment` is a gift_moments.key. `category` is read only so an old link
  // from before the moment picker still lands somewhere sensible.
  const moment = searchParams.get("moment") || searchParams.get("category") || "";
  const budget = Number(searchParams.get("budget") || 0) || 0;
  const gender = searchParams.get("gender") || "neutral";
  const excludeIds = (searchParams.get("exclude") || "").split(",").filter(Boolean);
  const excludeKey = excludeIds.join(",");

  const { cart, addToCart, setCart } = useCart();
  const variantReq = useVariantRequirements();
  const { data: allProducts } = useAllProducts();
  const productMap = useMemo(() => {
    const m = new Map<string, any>();
    (allProducts || []).forEach(p => m.set(p.id, p));
    return m;
  }, [allProducts]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gift-results", moment, budget, gender, excludeKey],
    enabled: !!moment,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc("run_gift_recommendation", {
          p_moment: moment,
          p_budget_amount: budget,
          p_budget_tier: getBudgetTier(budget),
          p_gender: gender || "neutral",
          ...(excludeIds.length > 0 ? { p_exclude_product_ids: excludeIds } : {}),
        });
      if (error) throw error;
      return data as unknown as GiftResponse;
    },
  });

  const momentLabel = data?.moment_label || "Gift Suggestions";
  useEffect(() => { document.title = `${momentLabel} | BundledMum`; }, [momentLabel]);

  // Close out the quiz session the moment the gift recommendation lands, the
  // same way the maternity results screen does — gift sessions used to sit as
  // abandoned forever. Not awaited: tracking never holds up the results.
  const completedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data || !data.product_count) return;
    const key = `${moment}|${budget}`;
    if (completedRef.current === key) return;
    completedRef.current = key;
    void completeQuizSession({
      sessionId: currentQuizAttemptId(),
      resultTier: data.budget_tier || null,
      resultProductIds: (data.products || []).map((p) => p.product_id).filter(Boolean),
      resultProductCount: data.product_count,
      answers: {
        budget,
        budget_tier: data.budget_tier,
        categories: ["gift"],
        gender,
        moment,
        moment_label: data.moment_label,
        already_owned_product_ids: excludeIds,
      },
      shopperType: "gift",
      engineVersion: data.engine_version || null,
    });
  }, [data, moment, budget, gender, excludeKey]);

  // Same cart-add path the general ResultsScreen uses for each item.
  const handleAddProduct = (item: RecommendedProduct) => {
    if (!item.brand || item.brand.price == null) {
      toast("This item is coming soon and can't be added yet.");
      return;
    }
    // Recommendation cards can't collect a size/colour — if this product needs
    // one, send the shopper to its page to choose rather than adding blind.
    const missing = variantReq.missingAxes(item.product_id, null, item.selected_color);
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
  // Grouped by the engine's own priority, in reading order. Anything with an
  // unrecognised priority falls into the last group rather than vanishing.
  const knownPriorities = new Set(PRIORITY_SECTIONS.map((sec) => sec.key));
  const groupedByPriority = PRIORITY_SECTIONS.map((sec, i) => ({
    ...sec,
    rows: products.filter((p) =>
      p.priority === sec.key ||
      (i === PRIORITY_SECTIONS.length - 1 && !knownPriorities.has(String(p.priority)))),
  })).filter((g) => g.rows.length > 0);

  const grandTotal = data.list_total ?? products.reduce(
    (sum, p) => sum + (p.brand?.price ?? 0) * (p.quantity ?? 1), 0);
  const amount = `₦${budget.toLocaleString("en-NG")}`;
  const heading = `A ${amount} gift for ${data.moment_label?.toLowerCase() || "her"}`;
  const subHeading = `Chosen for this exact moment. Swap or remove anything that doesn't fit before checkout.`;

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
    const text = `My BundledMum gift list — ${data.moment_label}\n${"=".repeat(30)}\n\n${list}\n\nTotal: ${fmt(grandTotal)}\n\nBuild yours: https://bundledmum.com`;
    navigator.clipboard.writeText(text).then(() => toast.success("Checklist copied to clipboard!"));
  };

  const handleShare = () => {
    const url = window.location.href;
    const shareText = `Check out my gift list on BundledMum: ${url}`;
    if (navigator.share) {
      navigator.share({ title: "BundledMum Gift Bundle", text: shareText, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => toast.success("Link copied!"));
    }
  };

  const renderCard = (item: RecommendedProduct) => {
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
    return <div key={item.product_id}>{card}</div>;
  };

  // ── Page shell — mirrors ResultsScreen markup top-to-bottom. ──────
  return (
    <div className="min-h-screen bg-background pt-[68px] pb-16 md:pb-0">
      <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }} className="px-4 md:px-10 py-8 md:py-14">
        <div className="max-w-[880px] mx-auto text-center">
          {/* The moment this list was built for — the whole point of the
              gift engine, so it leads. */}
          <div className="animate-fade-in inline-flex items-center gap-2.5 bg-primary-foreground/10 border border-primary-foreground/20 rounded-pill px-4 py-2 mb-3.5">
            <span className="text-lg leading-none">{data.moment_emoji || "🎁"}</span>
            <span className="text-primary-foreground text-[13px] font-semibold">{data.moment_label}</span>
            {data.timing_hint && (
              <span className="text-primary-foreground/60 text-[12px] border-l border-primary-foreground/20 pl-2.5">
                {data.timing_hint}
              </span>
            )}
          </div>
          <h1 className="pf text-2xl md:text-[40px] text-primary-foreground mb-3">{heading}</h1>
          <p className="text-primary-foreground/80 text-sm md:text-[15px] leading-[1.8] mb-4 max-w-[660px] mx-auto">{subHeading}</p>

          {/* Quiet, honest note — never hidden, never a blocker. */}
          {data.over_budget && (
            <p className="text-primary-foreground/70 text-[12.5px] mb-4 max-w-[560px] mx-auto">
              This list comes to a little over the {amount} you entered. Remove anything you don't need before checkout.
            </p>
          )}

          <div className="flex flex-wrap gap-2 justify-center mb-5">
            <Link to="/quiz" className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-pill px-3 py-1 text-primary-foreground/80 text-[11px] font-semibold hover:bg-primary-foreground/20 transition-colors">
              {data.moment_emoji || "🎁"} Change moment
            </Link>
            <Link to="/quiz" className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-pill px-3 py-1 text-primary-foreground/80 text-[11px] font-semibold hover:bg-primary-foreground/20 transition-colors">
              💰 {amount}
            </Link>
          </div>

          {/* Item-count strip — hidden on mobile to reduce clutter */}
          <div className="hidden md:flex flex-wrap gap-3 justify-center text-primary-foreground/60 text-xs mb-5">
            {data.excluded_count > 0 && <><span>We left out {data.excluded_count} item{data.excluded_count === 1 ? "" : "s"} she already has</span><span>·</span></>}
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
        {/* Priority sections — same treatment as the maternity results
            screen: emoji chip, heading, count pill, two-column grid. */}
        {groupedByPriority.map((g) => (
          <div key={g.key} className="mb-10">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-coral/10 flex items-center justify-center text-lg flex-shrink-0">{g.emoji}</div>
              <h2 className="pf text-lg md:text-xl font-bold text-foreground flex-1">{g.label}</h2>
              <span className="text-xs font-bold text-muted-foreground bg-muted/60 border border-border rounded-pill px-2.5 py-0.5">{g.rows.length}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-3">
              {g.rows.map(renderCard)}
            </div>
          </div>
        ))}

        {/* Engine's own "if you have more budget" list. */}
        {Array.isArray(data.also_recommended) && data.also_recommended.length > 0 && (
          <section className="mt-12 mb-10 border-t border-border pt-10">
            <h2 className="pf text-xl md:text-2xl font-bold text-foreground mb-1">
              Other gifts you could add
            </h2>
            <p className="text-text-med text-sm mb-6">
              These suit the same moment but didn't make the main list.
            </p>
            <div className="bg-muted/40 rounded-2xl p-4 md:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-3">
                {data.also_recommended.map(renderCard)}
              </div>
            </div>
          </section>
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
              href={`https://wa.me/+2347040667424?text=${encodeURIComponent(`Hi BundledMum! I'm looking for a gift for ${data.moment_label} at ${amount}.`)}`}
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

    </div>
  );
}
