import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Baby, ShoppingBag, Gift, Check, Share2, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { useCart, fmt } from "@/lib/cart";
import type { Brand, Product } from "@/lib/supabaseAdapters";
import { useAllProducts, useSiteSettings } from "@/hooks/useSupabaseData";
import { useQuizQuestions } from "@/hooks/useQuizConfig";
import { supabase } from "@/integrations/supabase/client";
import { track as pixelTrack } from "@/lib/metaPixel";
import { analytics, trackEcommerce } from "@/lib/ga";
import {
  getBudgetTier,
  isBelowEssentialsFloor,
  ESSENTIALS_FLOOR,
  BUDGET_MAX,
} from "@/lib/budgetTiers";
import OptionalTextStep from "@/components/quiz/OptionalTextStep";
import ResultProductCard from "@/components/quiz/ResultProductCard";
import ProductDetailDrawer from "@/components/ProductDetailDrawer";
import ShareModal from "@/components/ShareModal";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { buildQuizStory } from "@/lib/quizStory";
import type { RecommendationResult, RecommendedProduct } from "@/components/quiz/types";

type Screen = "quiz" | "whatsapp" | "results";
type Category = "maternity" | "baby" | "gift";
type Gender = "boy" | "girl" | "unknown";

// Fallback defaults — overridden by site_settings (see QuizScreen).
// Keeping the constants here so tests / SSR / first render before settings
// load still behaves sensibly.
// Budget engine v4.8 expects ≥ ₦178,000 to deliver a complete starter
// bundle. The hard fallback floor is the engine's starter minimum.
const MIN_BUDGET_FALLBACK = ESSENTIALS_FLOOR;
// Budget starts empty so the placeholder shows; user must enter an amount.
const DEFAULT_BUDGET = 0;

// Safe parser for admin-edited site_settings string values.
function unwrapSetting(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return String(v);
}
function unwrapInt(v: any, fallback: number): number {
  const s = unwrapSetting(v);
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Quiz tier classifier — single source of truth lives in @/lib/budgetTiers.
const budgetTierFor = getBudgetTier;

// Scope vocabulary the engine recognises — these match the values in the
// products.scopes column ('hospital-bag', 'general-baby-prep'), plus a
// combined marker the engine treats as "both".
function scopeFor(categories: Set<Category>): "hospital-bag" | "general-baby-prep" | "hospital-bag+general" {
  if (categories.has("gift")) return "hospital-bag+general";
  if (categories.has("maternity") && categories.has("baby")) return "hospital-bag+general";
  if (categories.has("maternity")) return "hospital-bag";
  return "general-baby-prep";
}

function stageFor(categories: Set<Category>): "expecting" | "newborn" {
  if (categories.has("gift")) return "newborn";
  if (categories.has("maternity")) return "expecting";
  return "newborn";
}

// Build the `answers` object the old quiz uses, from home-quiz state,
// so buildQuizStory and all the heading/pill logic stays identical.
function toOldAnswers(budget: number, categories: Set<Category>, gender: Gender): Record<string, string> {
  const isGift = categories.has("gift");
  return {
    shopper: isGift ? "gift" : "self",
    budget: budgetTierFor(budget),
    scope: scopeFor(categories),
    stage: stageFor(categories),
    gender,
    multiples: "1",
  };
}

// =============================================================================
// Screen 1 — Quiz form
// =============================================================================
// Internal slug values must match the get_gift_category_products RPC.
type GiftSubcategory = "postpartum_kits" | "baby_shower_boxes" | "push_gifts";
const GIFT_OPTIONS: { value: GiftSubcategory; label: string }[] = [
  { value: "postpartum_kits", label: "Postpartum Kits" },
  { value: "baby_shower_boxes", label: "Baby Shower Gift Boxes" },
  { value: "push_gifts", label: "Push Gifts" },
];

function QuizScreen({
  budget, setBudget,
  categories, setCategories,
  gender, setGender,
  giftSubcategory, setGiftSubcategory,
  onNext,
}: {
  budget: number;
  setBudget: (n: number) => void;
  categories: Set<Category>;
  setCategories: (s: Set<Category>) => void;
  gender: Gender | null;
  setGender: (g: Gender) => void;
  giftSubcategory: GiftSubcategory | null;
  setGiftSubcategory: (g: GiftSubcategory | null) => void;
  onNext: () => void;
}) {
  const [snapFlash, setSnapFlash] = useState(0);
  const { data: settings } = useSiteSettings();

  // Keep a focus-on-mount ref on the budget input so the blinking caret
  // is always visible on first render. `preventScroll: true` stops the
  // page from jumping to the input on mobile. A short timeout lets React
  // Strict Mode's double-mount settle and defends against ScrollToTop +
  // animation transitions stealing focus on the way in.
  const budgetRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      budgetRef.current?.focus({ preventScroll: true });
    }, 100);
    return () => window.clearTimeout(id);
  }, []);

  // All content and min-budget driven by site_settings, with hardcoded
  // fallbacks matching the seeded defaults so the UI never renders empty.
  const s = (key: string, fallback: string) => unwrapSetting(settings?.[key]) || fallback;
  const minBudget = unwrapInt(settings?.quiz_min_budget, MIN_BUDGET_FALLBACK);

  const labelBudget = s("quiz_label_budget", "WHAT IS YOUR BUDGET?");
  const labelCategories = s("quiz_label_what_you_need", "WHAT DO YOU NEED?");
  const labelCategoriesHint = s("quiz_label_what_you_need_hint", "(you can select both Maternity List + Baby Things)");
  const labelGender = s("quiz_label_gender", "BABY'S GENDER");
  const ctaLabel = s("quiz_cta_label", "Build My List");

  const toggleCategory = (c: Category) => {
    const next = new Set(categories);
    if (c === "gift") {
      // Gift is exclusive — if tapping gift, clear others and set gift.
      // If gift is already on and we tap it again, no-op (at-least-one rule).
      if (next.has("gift")) return;
      next.clear();
      next.add("gift");
    } else {
      // Tapping maternity or baby while gift is on → deselect gift first
      // and clear the gift subcategory so the dropdown selection doesn't
      // linger if the customer comes back to gift later.
      if (next.has("gift")) {
        next.delete("gift");
        setGiftSubcategory(null);
      }
      if (next.has(c)) {
        // Don't let both be deselected — at-least-one rule
        if (next.size === 1) return;
        next.delete(c);
      } else {
        next.add(c);
      }
    }
    setCategories(next);
  };

  const giftSelected = categories.has("gift");
  // Don't gate the CTA on the essentials floor — the parent shows a soft
  // warning modal on submit if the user is below it, and lets them either
  // bump up to the floor or continue at their entered amount. Gift flow
  // additionally requires a gift subcategory pick before submit.
  const canSubmit = categories.size > 0
    && !!gender
    && budget > 0
    && (!giftSelected || !!giftSubcategory);

  const categoryCards = [
    { id: "maternity" as const, title: s("quiz_category_maternity_title", "Maternity List"), sub: s("quiz_category_maternity_sub", "Hospital bag — mum and baby"), Icon: ShoppingBag },
    { id: "baby" as const, title: s("quiz_category_baby_title", "Baby Things"), sub: s("quiz_category_baby_sub", "For when you get home"), Icon: Baby },
    { id: "gift" as const, title: s("quiz_category_gift_title", "Gifts for New Parents"), sub: s("quiz_category_gift_sub", "Visiting or sending a gift"), Icon: Gift },
  ];

  const genderCards = [
    { id: "boy" as const, title: s("quiz_gender_boy_title", "Baby Boy"), sub: s("quiz_gender_boy_sub", "Blue & navy tones"), emoji: "👦" },
    { id: "girl" as const, title: s("quiz_gender_girl_title", "Baby Girl"), sub: s("quiz_gender_girl_sub", "Pink & lilac tones"), emoji: "👧" },
    { id: "unknown" as const, title: s("quiz_gender_surprise_title", "It's a Surprise!"), sub: s("quiz_gender_surprise_sub", "Neutral & unisex"), emoji: "🎁" },
  ];

  // Only treat "below minimum" as an error state once the user has typed
  // something — empty field should not look like an error.
  const belowMin = budget > 0 && budget < minBudget;
  const minBudgetDisplay = `Minimum ₦${minBudget.toLocaleString("en-NG")}`;

  return (
    <div className="w-full max-w-[480px] mx-auto">
      {/* Scoped flash keyframe for the min-budget helper */}
      <style>{`
        @keyframes bm-min-flash {
          0%, 100% { opacity: 1; transform: scale(1); }
          20%, 60% { opacity: 0.25; transform: scale(0.98); }
          40%, 80% { opacity: 1; transform: scale(1.04); }
        }
        .bm-min-flash { animation: bm-min-flash 0.55s ease-in-out 3; }
      `}</style>

      {/* QUESTION 1 — Budget */}
      <div className="bg-coral rounded-[18px] p-4 md:p-5 mb-3">
        <label className="text-white text-[12px] md:text-[13px] font-bold uppercase tracking-[2.5px] mb-2 block text-center">{labelBudget}</label>
        <div className="relative">
          {budget > 0 && (
            <span className="absolute left-5 top-1/2 -translate-y-1/2 pf text-midnight text-[26px] md:text-[30px] font-bold pointer-events-none leading-none">₦</span>
          )}
          <input
            ref={budgetRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={budget ? budget.toLocaleString("en-NG") : ""}
            onChange={e => {
              const digits = e.target.value.replace(/\D/g, "");
              const n = digits ? parseInt(digits, 10) : 0;
              setBudget(n);
            }}
            // No auto-snap on blur — the parent's submit handler shows a
            // soft warning if the entered amount is below the floor, so we
            // never overwrite what the customer actually typed.
            placeholder="Type Your Budget Here"
            aria-label="Budget"
            className={`w-full ${budget > 0 ? "pl-12" : "pl-5"} pr-5 py-3 text-center bg-white border-2 rounded-[14px] pf text-midnight text-[26px] md:text-[30px] font-bold tracking-tight outline-none transition-colors placeholder:text-midnight/40 placeholder:text-[16px] placeholder:font-semibold ${belowMin && budget > 0 ? "border-white" : "border-white/30 focus:border-white"}`}
          />
        </div>
        <div
          key={snapFlash}
          className={`text-[12px] mt-1.5 font-body font-bold text-center text-white ${snapFlash > 0 ? "bm-min-flash" : ""}`}
        >
          {minBudgetDisplay}
        </div>
      </div>

      {/* QUESTION 2 — What do you need? */}
      <div className="mb-3">
        <div className="mb-1.5 px-1">
          <span className="text-primary-foreground/80 text-[12px] md:text-[13px] font-bold uppercase tracking-[2.5px]">{labelCategories}</span>
          {labelCategoriesHint && (
            <span className="text-primary-foreground/55 text-[11px] md:text-[12px] font-normal normal-case tracking-normal ml-1.5 italic">{labelCategoriesHint}</span>
          )}
        </div>
        <div className="space-y-1.5">
          {categoryCards.map(c => {
            const selected = categories.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCategory(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] border-2 text-left transition-all ${
                  selected
                    ? "bg-[#FFF0EB] border-coral"
                    : "bg-primary-foreground border-primary-foreground/20"
                }`}
              >
                <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${selected ? "bg-coral/15" : "bg-[#FFF0EB]"}`}>
                  <c.Icon className="w-4 h-4 text-coral" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="pf font-bold text-[14px] text-foreground leading-tight">{c.title}</div>
                  <div className="text-text-med text-[11px] mt-0.5 leading-tight">{c.sub}</div>
                </div>
                {selected && (
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-coral flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {/* Gift subcategory dropdown — only renders when Gift is the
            active category. Required before the Build CTA enables. */}
        {giftSelected && (
          <div className="mt-2 px-1">
            <label className="text-primary-foreground/80 text-[11px] font-bold uppercase tracking-[2.5px] mb-1.5 block">
              Gift Category
            </label>
            <select
              value={giftSubcategory || ""}
              onChange={e => setGiftSubcategory((e.target.value || null) as GiftSubcategory | null)}
              className="w-full bg-primary-foreground border-2 border-primary-foreground/20 rounded-[14px] px-3 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-coral"
            >
              <option value="" disabled>Choose a gift category…</option>
              {GIFT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* QUESTION 3 — Baby's Gender */}
      <div className="mb-4">
        <div className="text-primary-foreground/80 text-[12px] md:text-[13px] font-bold uppercase tracking-[2.5px] mb-1.5 px-1">{labelGender}</div>
        <div className="space-y-1.5">
          {genderCards.map(g => {
            const selected = gender === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setGender(g.id)}
                className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] border-2 text-left transition-all ${
                  selected
                    ? "bg-[#FFF0EB] border-coral"
                    : "bg-primary-foreground border-primary-foreground/20"
                }`}
              >
                <div className="flex-shrink-0 text-xl">{g.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="pf font-bold text-[14px] text-foreground leading-tight">{g.title}</div>
                  <div className="text-text-med text-[11px] mt-0.5 leading-tight">{g.sub}</div>
                </div>
                {selected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-coral flex items-center justify-center shadow-md">
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onNext}
        disabled={!canSubmit}
        className="w-full rounded-pill py-3.5 text-[16px] font-body font-bold text-primary-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: "#F4845F" }}
      >
        {ctaLabel} →
      </button>
    </div>
  );
}

// =============================================================================
// Screen 3 — Results (mirrors the old /quiz results layout exactly)
// =============================================================================
function ResultsScreen({
  budget, categories, gender,
  onBack,
  onComplete,
}: {
  budget: number;
  categories: Set<Category>;
  gender: Gender;
  onBack: () => void;
  onComplete?: () => void;
}) {
  const navigate = useNavigate();
  const { cart, addToCart, setCart } = useCart();
  const { data: allProducts } = useAllProducts();

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const answers = useMemo(() => toOldAnswers(budget, categories, gender), [budget, categories, gender]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      const budgetTier = budgetTierFor(budget);
      const isGift = categories.has("gift");
      // GA4 quiz_complete — fire once before kicking off the RPC. Mark the
      // quiz as completed so the abandon-on-unmount cleanup no-ops.
      try {
        onComplete?.();
        analytics.push({
          event: "quiz_complete",
          quiz_name: "bundle_recommendation",
          budget_tier: budgetTier,
          budget_amount: budget,
          scope: isGift ? "gift" : scopeFor(categories),
          stage: isGift ? "newborn" : stageFor(categories),
          gender: gender || "unknown",
        });
      } catch { /* ignore */ }
      try {
        if (isGift) {
          // Gift path uses the push-gift recommendation engine — it queries
          // is_push_gift_eligible products (silk robes, jewellery, chocolate
          // hampers, etc.) instead of the family-bundle RPC which returns
          // maternity/baby essentials.
          const pushTier = budgetTier === "starter" ? "push-starter"
            : budgetTier === "premium" ? "push-premium"
            : "push-standard";
          const { data, error } = await supabase.rpc("run_push_gift_recommendation", {
            p_budget_tier: pushTier,
            p_category: "mum-gifts-keepsakes",
            p_timing: "no-specific-time",
          });
          if (cancelled) return;
          if (error) throw error;
          // Push-gift returns a subset of RecommendationResult's shape —
          // normalise so ResultProductCard can render each item unchanged.
          const raw = data as any;
          const normalised: RecommendationResult = {
            budget_tier: raw?.budget_tier || pushTier,
            scope: "hospital-bag+general",
            stage: "newborn",
            hospital_type: "public",
            delivery_method: "vaginal",
            multiples: 1,
            gender,
            first_baby: false,
            product_count: raw?.product_count || 0,
            target_count: raw?.product_count || 0,
            engine_version: raw?.engine_version || "push-gift",
            products: (raw?.products || []).map((p: any) => ({
              product_id: p.product_id,
              name: p.name,
              slug: p.slug,
              priority: p.priority,
              category: p.category,
              subcategory: p.subcategory ?? null,
              quantity: p.quantity ?? 1,
              selected_color: null,
              why_included: p.why_included || "",
              emoji: null,
              image_url: null,
              brand: p.brand ? {
                id: p.brand.id,
                brand_name: p.brand.brand_name,
                price: p.brand.price,
                tier: p.brand.tier,
                image_url: p.brand.image_url ?? null,
                in_stock: p.brand.in_stock ?? true,
                logo_url: p.brand.logo_url ?? null,
              } : null as any,
            })),
          };
          setResult(normalised);
        } else {
          const scope = scopeFor(categories);
          const stage = stageFor(categories);
          // RPC v4.8 contract (verified against pg_proc):
          //   p_budget_tier        — 'starter' | 'standard' | 'premium'
          //   p_hospital_type      — 'both'    (storefront quiz doesn't ask)
          //   p_delivery_method    — 'both'    (storefront quiz doesn't ask)
          //   p_gender             — 'boy' | 'girl' | 'neutral'
          //                          ('unknown' from the UI maps to 'neutral')
          //   p_gift_relationship  — string or null
          //
          // Previously we were sending p_hospital_type='public' and
          // p_delivery_method='vaginal', plus p_gender='unknown' for the
          // "It's a Surprise!" answer — none of which the engine recognised,
          // so it fell through to its empty fallback bracket.
          const params = {
            p_budget_tier: budgetTier,
            p_scope: scope,
            p_stage: stage,
            p_hospital_type: "both",
            p_delivery_method: "both",
            p_multiples: 1,
            p_gender: gender === "unknown" ? "neutral" : gender,
            p_is_gift: false,
            p_first_baby: false,
            p_gift_relationship: null,
            p_budget_amount: budget,
          };
          // eslint-disable-next-line no-console
          console.log("[quiz] calling RPC with params:", JSON.stringify(params, null, 2));
          const { data, error } = await supabase.rpc("run_quiz_recommendation", params as any);
          // eslint-disable-next-line no-console
          console.log("[quiz] RPC response:", JSON.stringify(data, null, 2));
          // eslint-disable-next-line no-console
          console.log("[quiz] RPC error:", error);
          if (cancelled) return;
          if (error) throw error;
          // Engine v4.8 returns { engine_version, product_count, products, ... }.
          // Some Supabase JSONB shapes wrap this further, so unwrap defensively.
          const raw: any = data;
          const unwrapped = raw && typeof raw === "object" && Array.isArray(raw.products)
            ? raw
            : (raw && typeof raw === "object" && raw.data && Array.isArray(raw.data.products) ? raw.data : raw);
          // eslint-disable-next-line no-console
          console.log("[quiz results] data:", unwrapped, "products:", unwrapped?.products?.length);
          const normalised: RecommendationResult = {
            ...(unwrapped || {}),
            products: Array.isArray(unwrapped?.products) ? unwrapped.products : [],
          } as RecommendationResult;
          setResult(normalised);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Something went wrong.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [budget, categories, gender]);

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    (allProducts || []).forEach(p => m.set(p.id, p));
    return m;
  }, [allProducts]);

  // Per-product pre-add qty. Keyed by product_id so qty survives brand
  // changes — picking a different brand doesn't reset the "I want 3 of
  // these" intent. Default is item.quantity from the engine (or 1 if the
  // engine didn't set one).
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const qtyFor = (item: RecommendedProduct) =>
    quantities[item.product_id] ?? (item.quantity > 0 ? item.quantity : 1);
  const setQty = (item: RecommendedProduct, next: number) =>
    setQuantities(q => ({ ...q, [item.product_id]: Math.max(1, next) }));

  // True when an item has at least one purchasable brand variant — the
  // run_quiz_recommendation RPC returns brand=null for SKUs we don't yet
  // stock, and we never want those rows to enter the cart payload sent
  // to place-order. The recommendation card UI surfaces these as
  // "Coming soon" instead of showing an Add button.
  const isPurchasable = (r: RecommendedProduct): boolean => !!r.brand && (r.brand as any).price != null;

  // Cart payload mirrors the old quiz's handleAddProduct byte-for-byte.
  // qtyOverride lets callers push N copies of the same product (Add All +
  // the pre-add qty stepper both use this).
  const handleAddProduct = (item: RecommendedProduct, overrideBrand?: Brand | null, overrideSize?: string, qtyOverride?: number) => {
    // Guard against null-brand SKUs sneaking into the cart — without a
    // brand_id, place-order can't insert a valid order_items row.
    if (!overrideBrand && !isPurchasable(item)) {
      toast("This item is coming soon and can't be added yet.");
      return;
    }
    const brandName = overrideBrand?.label || item.brand?.brand_name || "Standard";
    const brandPrice = overrideBrand?.price ?? item.brand?.price ?? 0;
    const brandId = overrideBrand?.id || item.brand?.id || item.product_id;
    const brandImage = overrideBrand?.imageUrl || item.brand?.image_url || item.image_url || undefined;
    const qty = Math.max(1, qtyOverride ?? qtyFor(item));
    for (let i = 0; i < qty; i++) {
      addToCart({
        id: item.product_id,
        name: `${item.name} (${brandName})`,
        baseImg: item.emoji || "📦",
        imageUrl: brandImage,
        price: brandPrice,
        selectedBrand: { id: brandId, label: brandName, price: brandPrice, img: item.emoji || "📦", imageUrl: brandImage || null, tier: overrideBrand?.tier || 1, color: overrideBrand?.color || "#E8F5E9" },
        selectedSize: overrideSize || "",
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
    }
    toast.success(`✓ ${item.name} added to cart${qty > 1 ? ` (×${qty})` : ""}`);

    // GA4 quiz_add_to_cart — carries quiz context alongside the standard
    // add_to_cart already fired by cart.tsx. Both fire so the regular GA4
    // funnel still tracks the add, while quiz_add_to_cart enables quiz-
    // specific dashboards.
    try {
      trackEcommerce("add_to_cart", {
        currency: "NGN",
        value: brandPrice,
        items: [{
          item_id: String(item.product_id),
          item_name: item.name,
          item_brand: brandName,
          item_variant: (overrideBrand as any)?.sku ?? (item.brand as any)?.sku ?? "",
          item_category: item.category ?? "",
          item_category2: item.subcategory ?? "",
          price: brandPrice,
          quantity: 1,
          item_list_id: "quiz_results",
          item_list_name: "Quiz Recommendations",
        }],
      });
      analytics.push({
        event: "quiz_add_to_cart",
        budget_tier: budgetTierFor(budget),
        product_priority: item.priority,
      });
    } catch { /* ignore */ }
  };

  const handleRemoveProduct = (item: RecommendedProduct) => {
    setCart(prev => prev.filter(c => c.id !== item.product_id));
    toast("Removed from cart");
  };

  const addedIds = new Set(cart.map(c => c.id));

  // ── GA4 quiz_results_view — fire once per recommendation when results
  // are populated. MUST sit above the loading/error/empty early-returns
  // below: React's rules of hooks require every hook to run the same
  // order on every render, so a conditional return that skips this useRef
  // / useEffect would crash the next render with "Rendered more hooks
  // than during the previous render". (That crash is exactly what blanked
  // the results page in production.)
  const resultsViewFiredRef = useRef<RecommendationResult | null>(null);
  useEffect(() => {
    if (!result) return;
    const products = Array.isArray(result.products) ? result.products : [];
    if (!products.length) return;
    if (resultsViewFiredRef.current === result) return;
    resultsViewFiredRef.current = result;
    try {
      trackEcommerce("view_item_list", {
        item_list_id: "quiz_results",
        item_list_name: "Quiz Recommendations",
        items: products.map((p, index) => ({
          item_id: String(p.product_id),
          item_name: p.name,
          item_brand: p.brand?.brand_name ?? "",
          item_variant: (p.brand as any)?.sku ?? "",
          item_category: p.category ?? "",
          item_category2: p.subcategory ?? "",
          price: p.brand?.price ?? 0,
          index,
          item_list_id: "quiz_results",
          item_list_name: "Quiz Recommendations",
        })),
      });
      analytics.push({
        event: "quiz_results_view",
        quiz_name: "bundle_recommendation",
        result_count: products.length,
        total_value: products.reduce((sum, p) => sum + (p.brand?.price ?? 0), 0),
        budget_tier: budgetTierFor(budget),
        budget_amount: budget,
      });
    } catch { /* ignore */ }
  }, [result, budget]);

  // ---- Loading / error states ---------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-background pt-[68px] flex items-center justify-center">
        <div className="text-center">
          <BMLoadingAnimation size={200} />
          <h2 className="pf text-xl text-foreground mb-2 mt-4">Building your perfect bundle...</h2>
          <p className="text-muted-foreground text-sm">Our engine is picking the best items for you ✨</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-background pt-[68px] px-4 flex items-center justify-center">
        <div className="bg-[#FFE5DC] border border-coral text-[#92400E] rounded-xl p-6 text-center max-w-md">
          <p className="font-semibold mb-1">We hit a snag building your list.</p>
          <p className="text-sm mb-3">{error}</p>
          <button onClick={onBack} className="rounded-pill border border-coral px-4 py-2 text-xs font-semibold">Go back</button>
        </div>
      </div>
    );
  }
  // Empty state — guards both "no result" and "products array missing/empty".
  // Without optional chaining here a malformed RPC response would crash
  // the screen instead of surfacing this panel, which is what blanks the page.
  if (!result || !Array.isArray(result.products) || result.products.length === 0) {
    return (
      <div className="min-h-screen bg-background pt-[68px] px-4 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="pf text-lg font-semibold mb-1">No matching items found</p>
          <p className="text-text-med text-sm mb-3">Try a different budget or category.</p>
          <button onClick={onBack} className="rounded-pill border border-forest text-forest px-4 py-2 text-xs font-semibold">Edit answers</button>
        </div>
      </div>
    );
  }

  // ---- Results rendering (mirrors the old quiz layout) --------------------
  const recommendation = result;
  // Defensive: even though the guard above ensures result.products is a
  // non-empty array, downstream code does .reduce / .filter / .map on it,
  // so coerce one more time. A malformed entry shouldn't blank the page.
  const results = Array.isArray(recommendation?.products) ? recommendation.products : [];
  const isGift = answers.shopper === "gift";

  // On the gift path, push-gift RPC returns category = "push-gift" (and a
  // handful of "mum"). Render them all in a single "Gift Bundle" section
  // so nothing is dropped by the essentials filters below.
  const giftItems = isGift ? results : [];

  // Non-gift path: 4 buckets.
  // Hospital Consumables = mum.hospital-essentials + baby.nappies-wipes
  //   (pads, slippers, disposable underwear, toiletries, antiseptics, nappies, wipes).
  // Convenience Extras = priority='nice-to-have' (not in hospital) — the
  //   ranked "extras" the RPC pulls in at higher budgets.
  // Baby/Mum Essentials = category buckets filtered to essential/recommended.
  const HOSPITAL_SUBCATEGORIES = new Set(["maternity-postpartum"]);
  const isHospital = (r: RecommendedProduct) => HOSPITAL_SUBCATEGORIES.has(r.subcategory || "");
  const isNice = (r: RecommendedProduct) => r.priority === "nice-to-have";
  const hospitalItems = isGift ? [] : results.filter(r => isHospital(r));
  const extrasItems = isGift ? [] : results.filter(r => !isHospital(r) && isNice(r));
  const babyItems = isGift ? [] : results.filter(r => r.category === "baby" && !isHospital(r) && !isNice(r));
  const mumItems = isGift ? [] : results.filter(r => r.category === "mum" && !isHospital(r) && !isNice(r));

  // Recommendation total — reactive to the user's pre-add qty steppers.
  // Uses each item's recommended brand price; null-brand "coming soon"
  // SKUs contribute zero (and are excluded entirely from cart / share /
  // copy below).
  const recommendationTotal = results.reduce((sum, item) => {
    const price = item.brand?.price ?? 0;
    const qty = qtyFor(item) ?? 1;
    return sum + price * qty;
  }, 0);
  const grandTotal = recommendationTotal;
  const budgetLabel = answers.budget === "starter" ? "Starter" : answers.budget === "premium" ? "Premium" : "Standard";
  const multiples = 1;
  const isFallback = recommendation.engine_version?.includes("fallback");

  const recScope = recommendation.scope || answers.scope || "";
  const amount = `₦${budget.toLocaleString("en-NG")}`;
  let heading: string;
  if (isGift) heading = `A ${amount} gift bundle for the new parents`;
  else if (recScope === "hospital-bag") heading = `Your ${amount} maternity list`;
  else if (recScope === "general-baby-prep") heading = `Your ${amount} baby list`;
  else if (recScope === "hospital-bag+general") heading = `Your ${amount} maternity and baby list`;
  else heading = `Your ${amount} bundle`;

  const subHeading = buildQuizStory(answers, { isDadPath: false, dadPurpose: "", productCount: results.length });

  const pillData = [
    answers.gender && answers.gender !== "neutral" && answers.gender !== "unknown"
      ? { emoji: answers.gender === "boy" ? "👦" : "👧", label: answers.gender === "boy" ? "Boy" : "Girl", step: "gender" }
      : { emoji: "🌈", label: "Neutral", step: "gender" },
    { emoji: answers.budget === "starter" ? "🌱" : answers.budget === "premium" ? "✨" : "🌿", label: budgetLabel, step: "budget" },
  ];

  const handleAddAll = () => {
    // Skip null-brand "Coming soon" items — they have no purchasable
    // variant and would be rejected by the place-order edge function.
    const buyable = results.filter(isPurchasable);
    const skipped = results.length - buyable.length;
    buyable.forEach(item => {
      handleAddProduct(item, undefined, undefined, qtyFor(item));
    });
    if (skipped > 0) {
      toast.success(`✓ Added ${buyable.length} items to cart. ${skipped} coming-soon item${skipped === 1 ? "" : "s"} skipped.`);
    } else {
      toast.success("✓ Your full bundle has been added to cart!");
    }
    navigate("/cart");
  };

  const handleShare = () => setShowShareModal(true);
  const handleCopyChecklist = () => {
    const list = results.map(r => {
      if (!isPurchasable(r)) {
        return `${r.quantity > 1 ? `×${r.quantity} ` : ""}${r.name} — Coming soon`;
      }
      const price = r.brand?.price ?? 0;
      const qty = r.quantity ?? 1;
      return `${qty > 1 ? `×${qty} ` : ""}${r.name} (${r.brand?.brand_name || "Standard"}) — ${fmt(price * qty)}`;
    }).join("\n");
    const text = `My BundledMum ${budgetLabel} Bundle\n${"=".repeat(30)}\n\n${list}\n\nTotal: ${fmt(grandTotal)}\n\nBuild yours: https://bundledmum.com`;
    navigator.clipboard.writeText(text).then(() => toast.success("Checklist copied to clipboard!"));
  };

  // Share modal only includes priced items — no point showing "₦0" rows.
  const shareItems = results
    .filter(isPurchasable)
    .map(r => ({ name: r.name, price: ((r.brand?.price ?? 0)) * (r.quantity ?? 1) }));

  return (
    <div className="min-h-screen bg-background pt-[68px] pb-16 md:pb-0">
      <div style={{ background: "linear-gradient(135deg, #2D6A4F, #1E5C44)" }} className="px-4 md:px-10 py-8 md:py-14">
        <div className="max-w-[880px] mx-auto text-center">
          {isFallback && (
            <div className="bg-amber-500/20 border border-amber-500/40 rounded-lg px-4 py-2 mb-4 inline-block">
              <p className="text-amber-200 text-xs">We widened your results to ensure a complete bundle — all items are relevant to your stage.</p>
            </div>
          )}
          <div className="animate-fade-in inline-flex items-center gap-2 bg-coral/20 border border-coral/40 rounded-pill px-4 py-1.5 mb-3.5">
            <span className="text-coral text-[13px] font-semibold">{isGift ? "🎁 Perfect Gift Bundle Ready!" : "✨ Your Personalised Bundle is Ready!"}</span>
          </div>
          <h1 className="pf text-2xl md:text-[40px] text-primary-foreground mb-3">{heading}</h1>
          <p className="text-primary-foreground/80 text-sm md:text-[15px] leading-[1.8] mb-4 max-w-[660px] mx-auto">{subHeading}</p>

          <div className="flex flex-wrap gap-2 justify-center mb-5">
            {pillData.map(p => (
              <button key={p.step} onClick={onBack} className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-pill px-3 py-1 text-primary-foreground/80 text-[11px] font-semibold hover:bg-primary-foreground/20 transition-colors">
                {p.emoji} {p.label}
              </button>
            ))}
          </div>

          {/* Item-count strip — hidden on mobile to reduce clutter */}
          <div className="hidden md:flex flex-wrap gap-3 justify-center text-primary-foreground/60 text-xs mb-5">
            {isGift ? (
              <>
                <span>🎁 {giftItems.length} gift items</span><span>·</span>
              </>
            ) : (
              <>
                {mumItems.length > 0 && <><span>💛 {mumItems.length} mum essentials</span><span>·</span></>}
                {hospitalItems.length > 0 && <><span>🏥 {hospitalItems.length} hospital consumables</span><span>·</span></>}
                {babyItems.length > 0 && <><span>👶 {babyItems.length} baby essentials</span><span>·</span></>}
                {extrasItems.length > 0 && <><span>✨ {extrasItems.length} convenience extras</span><span>·</span></>}
              </>
            )}
            <span>Total: {results.length} items</span><span>·</span>
            <span className="text-coral font-bold">{fmt(grandTotal)}</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center px-4 sm:px-0">
            <button onClick={() => document.getElementById("quiz-results-items")?.scrollIntoView({ behavior: "smooth" })} className="rounded-pill bg-coral px-6 py-3 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive text-sm w-full sm:hidden">
              👇 See Your Items Below
            </button>
            <button onClick={handleAddAll} className="hidden sm:inline-flex rounded-pill bg-coral px-8 py-3 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive text-[15px]">
              {isGift ? "🎁 Get Gift Bundle" : "Proceed to Checkout"} — {fmt(recommendationTotal)} →
            </button>
            {/* Mobile: second Proceed to Checkout (replaces Retake Quiz) */}
            <button onClick={handleAddAll} className="sm:hidden rounded-pill border-2 border-primary-foreground/30 px-6 py-3 font-body font-semibold text-primary-foreground/80 hover:bg-primary-foreground/10 interactive text-sm w-full">
              Proceed to Checkout — {fmt(recommendationTotal)} →
            </button>
            {/* Desktop: Retake Quiz — unchanged */}
            <button onClick={onBack} className="hidden sm:inline-flex rounded-pill border-2 border-primary-foreground/30 px-6 py-3 font-body font-semibold text-primary-foreground/80 hover:bg-primary-foreground/10 interactive text-[15px]">
              ← Retake Quiz
            </button>
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
        {giftItems.length > 0 && (
          <div className="mb-10">
            <h2 className="pf inline-block bg-coral text-white text-base md:text-lg font-bold px-4 py-2 rounded-pill mb-4">🎁 Gift Bundle for the New Parents</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
              {giftItems.map(item => (
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
                  onAdd={(brand, size) => handleAddProduct(item, brand, size, qtyFor(item))}
                  onRemove={() => handleRemoveProduct(item)}
                  fullProduct={productMap.get(item.product_id)}
                  onViewDetail={() => { const fp = productMap.get(item.product_id); if (fp) setDetailProduct(fp); }}
                  preAddQty={qtyFor(item)}
                  onPreAddQtyChange={(n) => setQty(item, n)}
                />
              ))}
            </div>
          </div>
        )}
        {mumItems.length > 0 && (
          <div className="mb-10">
            <h2 className="pf inline-block bg-coral text-white text-base md:text-lg font-bold px-4 py-2 rounded-pill mb-4">💛 Mum Essentials</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
              {mumItems.map(item => (
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
                  onAdd={(brand, size) => handleAddProduct(item, brand, size, qtyFor(item))}
                  onRemove={() => handleRemoveProduct(item)}
                  fullProduct={productMap.get(item.product_id)}
                  onViewDetail={() => { const fp = productMap.get(item.product_id); if (fp) setDetailProduct(fp); }}
                  preAddQty={qtyFor(item)}
                  onPreAddQtyChange={(n) => setQty(item, n)}
                />
              ))}
            </div>
          </div>
        )}
        {hospitalItems.length > 0 && (
          <div className="mb-10">
            <h2 className="pf inline-block bg-coral text-white text-base md:text-lg font-bold px-4 py-2 rounded-pill mb-4">🏥 Hospital Consumables</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
              {hospitalItems.map(item => (
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
                  onAdd={(brand, size) => handleAddProduct(item, brand, size, qtyFor(item))}
                  onRemove={() => handleRemoveProduct(item)}
                  fullProduct={productMap.get(item.product_id)}
                  onViewDetail={() => { const fp = productMap.get(item.product_id); if (fp) setDetailProduct(fp); }}
                  preAddQty={qtyFor(item)}
                  onPreAddQtyChange={(n) => setQty(item, n)}
                />
              ))}
            </div>
          </div>
        )}
        {babyItems.length > 0 && (
          <div className="mb-10">
            <h2 className="pf inline-block bg-coral text-white text-base md:text-lg font-bold px-4 py-2 rounded-pill mb-4">👶 Baby Essentials</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
              {babyItems.map(item => (
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
                  onAdd={(brand, size) => handleAddProduct(item, brand, size, qtyFor(item))}
                  onRemove={() => handleRemoveProduct(item)}
                  fullProduct={productMap.get(item.product_id)}
                  onViewDetail={() => { const fp = productMap.get(item.product_id); if (fp) setDetailProduct(fp); }}
                  preAddQty={qtyFor(item)}
                  onPreAddQtyChange={(n) => setQty(item, n)}
                />
              ))}
            </div>
          </div>
        )}
        {extrasItems.length > 0 && (
          <div className="mb-10">
            <h2 className="pf inline-block bg-coral text-white text-base md:text-lg font-bold px-4 py-2 rounded-pill mb-4">✨ Convenience Extras</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
              {extrasItems.map(item => (
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
                  onAdd={(brand, size) => handleAddProduct(item, brand, size, qtyFor(item))}
                  onRemove={() => handleRemoveProduct(item)}
                  fullProduct={productMap.get(item.product_id)}
                  onViewDetail={() => { const fp = productMap.get(item.product_id); if (fp) setDetailProduct(fp); }}
                  preAddQty={qtyFor(item)}
                  onPreAddQtyChange={(n) => setQty(item, n)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <button onClick={handleAddAll} className="rounded-pill bg-coral px-8 py-3 font-body font-semibold text-primary-foreground hover:bg-coral-dark interactive text-sm sm:text-[15px]">
            Proceed to Checkout — {fmt(recommendationTotal)}
          </button>
          <Link to="/shop" className="rounded-pill border-2 border-forest px-8 py-3 font-body font-semibold text-forest hover:bg-forest hover:text-primary-foreground interactive text-sm sm:text-[15px] text-center">
            Browse for More Products
          </Link>
        </div>

        {/* v4.9 also_recommended — items that fit the customer's tier/scope
            but were trimmed from the main bundle for budget or subcategory
            reasons. Empty / missing → render nothing (engine v4.8 fallback
            doesn't ship this field). Reuses ResultProductCard for parity. */}
        {Array.isArray(recommendation.also_recommended) && recommendation.also_recommended.length > 0 && (
          <section className="mt-10 pt-8 border-t border-border mb-10">
            <h2 className="pf text-xl md:text-2xl font-bold text-foreground mb-2">
              Other products you can add if you have more budget
            </h2>
            <p className="text-text-med text-sm md:text-base mb-5">
              These items fit your selection but didn't make it into your bundle. Add them individually if you'd like.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
              {recommendation.also_recommended.map(item => (
                <ResultProductCard
                  key={`alsorec-${item.product_id}`}
                  item={item}
                  isInCart={addedIds.has(item.product_id)}
                  cartItem={cart.find(c => c.id === item.product_id)}
                  onQtyUpdate={(key, qty) => {
                    const c = cart.find(x => x._key === key);
                    if (!c) return;
                    setCart(prev => prev.map(x => x._key === key ? { ...x, qty } : x));
                  }}
                  onAdd={(brand, size) => handleAddProduct(item, brand, size, qtyFor(item))}
                  onRemove={() => handleRemoveProduct(item)}
                  fullProduct={productMap.get(item.product_id)}
                  onViewDetail={() => { const fp = productMap.get(item.product_id); if (fp) setDetailProduct(fp); }}
                  preAddQty={qtyFor(item)}
                  onPreAddQtyChange={(n) => setQty(item, n)}
                />
              ))}
            </div>
          </section>
        )}

        <div className="bg-forest rounded-card p-6 md:p-8 text-center mb-8">
          <h3 className="pf text-xl text-primary-foreground mb-2">💬 Know Another Expecting Mum?</h3>
          <p className="text-primary-foreground/70 text-sm mb-4 max-w-[400px] mx-auto">Help her shop baby essentials, mum items, and baby gifts without stepping foot in any market.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => {
              const text = "Hey mama! 🤰 I just used BundledMum to get all my baby things in one place — no market runs! Build your own personalised list FREE: https://bundledmum.com?ref=friend_share";
              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
            }} className="rounded-pill bg-[#25D366] px-6 py-2.5 font-body font-semibold text-primary-foreground text-sm interactive">
              📱 Share on WhatsApp
            </button>
            <button onClick={() => {
              navigator.clipboard.writeText("https://bundledmum.com?ref=friend_share");
              toast.success("Link copied!");
            }} className="rounded-pill border-2 border-primary-foreground/30 px-6 py-2.5 font-body font-semibold text-primary-foreground/80 text-sm interactive">
              📋 Copy Link
            </button>
          </div>
        </div>
      </div>

      {showShareModal && (
        <ShareModal
          onClose={() => setShowShareModal(false)}
          title="My Perfect Hospital Bag"
          subtitle={`${budgetLabel} Bundle · ${results.length} items`}
          items={shareItems}
          totalPrice={grandTotal}
          badge={isGift ? "GIFT BUNDLE" : undefined}
          shareUrl="https://bundledmum.com?ref=share"
          shareText={`Check out my BundledMum ${budgetLabel} bundle! ${results.length} items for ${fmt(grandTotal)}. Build yours FREE!`}
          gender={answers.gender}
          budgetLabel={budgetLabel}
          itemCount={results.length}
        />
      )}

      <ProductDetailDrawer product={detailProduct} defaultBudget={answers.budget || "standard"} onClose={() => setDetailProduct(null)} />
    </div>
  );
}

/**
 * Catches any render-time crash in the quiz results subtree and surfaces
 * the actual error message + stack instead of letting React unmount the
 * tree silently (which is what shows up as the dreaded white blank page).
 */
class QuizResultsErrorBoundary extends React.Component<
  { children: React.ReactNode; onBack?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onBack?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[QuizResults] render crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background pt-[68px] px-4 flex items-center justify-center">
          <div className="max-w-md w-full bg-card border border-destructive/40 rounded-card p-5 text-left">
            <p className="pf text-lg font-bold text-destructive mb-1">Quiz results couldn't load</p>
            <p className="text-sm text-text-med mb-3">
              We hit a snag rendering your recommendation. Please try again — if it keeps happening, share the message below with support.
            </p>
            <pre className="text-[11px] text-text-med whitespace-pre-wrap break-words bg-warm-cream rounded-lg p-2 max-h-48 overflow-auto">
              {this.state.error?.message}
              {this.state.error?.stack ? `\n\n${this.state.error.stack}` : ""}
            </pre>
            {this.props.onBack && (
              <button
                onClick={this.props.onBack}
                className="mt-3 rounded-pill border border-forest text-forest px-4 py-2 text-xs font-semibold"
              >
                Edit answers
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Soft warning shown when the user submits the quiz with a budget below
 * the engine's starter floor. Doesn't block — the user can bump up or
 * proceed at the entered amount.
 */
function FloorWarningModal({
  amount,
  onIncrease,
  onContinue,
  onClose,
}: {
  amount: number;
  onIncrease: () => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[600] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl max-w-sm w-full p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <span className="text-2xl">💡</span>
          <div>
            <h3 className="pf font-bold text-base text-foreground leading-tight mb-1">
              Heads up — your budget is below the typical starter floor
            </h3>
            <p className="text-sm text-text-med leading-relaxed">
              At {fmt(amount)}, your bundle may not include every hospital essential.
              The recommended minimum for a complete maternity list is{" "}
              <span className="font-semibold text-foreground">{fmt(ESSENTIALS_FLOOR)}</span>.
              Continue anyway?
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 mt-4">
          <button
            onClick={onIncrease}
            className="w-full rounded-pill bg-forest py-2.5 text-sm font-semibold text-primary-foreground hover:bg-forest-deep interactive"
          >
            Increase to {fmt(ESSENTIALS_FLOOR)}
          </button>
          <button
            onClick={onContinue}
            className="w-full rounded-pill border-2 border-border bg-card py-2.5 text-sm font-semibold text-text-med hover:bg-warm-cream interactive"
          >
            Continue at {fmt(amount)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// =============================================================================
// Container — 3-screen state machine
// =============================================================================
// Payload passed to onSubmit — lets the host page decide what to do when
// the user finishes screen 1. /quiz embeds HomeQuiz and handles screens
// 2 + 3 in-place; Home navigates to /quiz with these answers in location
// state so the overlay mounts on the /quiz route instead.
export type HomeQuizInitialState = {
  budget: number;
  categories: Category[];
  gender: Gender;
  autoAdvance?: Screen; // "whatsapp" | "results"
};

export default function HomeQuiz({
  initialState,
  onSubmit,
}: {
  initialState?: HomeQuizInitialState;
  onSubmit?: (answers: { budget: number; categories: Category[]; gender: Gender }) => void;
} = {}) {
  const [screen, setScreen] = useState<Screen>(initialState?.autoAdvance || "quiz");
  const [budget, setBudget] = useState<number>(initialState?.budget ?? DEFAULT_BUDGET);
  const [categories, setCategories] = useState<Set<Category>>(new Set(initialState?.categories || []));
  const [gender, setGender] = useState<Gender | null>(initialState?.gender || null);
  const [giftSubcategory, setGiftSubcategory] = useState<GiftSubcategory | null>(null);
  const navigateRoot = useNavigate();
  const [, setWhatsapp] = useState<string | null>(null);
  // Soft below-floor warning state. When the user submits with a budget
  // below ₦178,000, we hold the submit, surface the warning, and let them
  // choose: bump up to the floor, or continue at their entered amount.
  const [floorWarning, setFloorWarning] = useState(false);

  // ── GA4 quiz funnel ────────────────────────────────────────────────
  // quiz_start once per mount, regardless of how many re-renders happen.
  const quizStartFiredRef = useRef(false);
  useEffect(() => {
    if (quizStartFiredRef.current) return;
    quizStartFiredRef.current = true;
    try {
      analytics.push({ event: "quiz_start", quiz_name: "bundle_recommendation" });
    } catch { /* ignore */ }
  }, []);

  // quiz_abandon — fire on unmount if results haven't loaded. Ref so the
  // cleanup reads the latest "completed" value, not a stale closure.
  const quizCompletedRef = useRef(false);
  const lastScreenRef = useRef<Screen>("quiz");
  useEffect(() => {
    lastScreenRef.current = screen;
  }, [screen]);
  useEffect(() => {
    return () => {
      if (quizCompletedRef.current) return;
      try {
        // Step index/name based on the screen at unmount time.
        const stepMap: Record<Screen, { n: number; name: string }> = {
          quiz: { n: 1, name: "answers" },
          whatsapp: { n: 2, name: "whatsapp" },
          results: { n: 3, name: "results" },
        };
        const cur = stepMap[lastScreenRef.current] || stepMap.quiz;
        analytics.push({
          event: "quiz_abandon",
          quiz_name: "bundle_recommendation",
          last_step: cur.n,
          last_step_name: cur.name,
        });
      } catch { /* ignore */ }
    };
  }, []);

  const { data: questions } = useQuizQuestions();
  const whatsappQuestion = (questions || []).find(q => q.step_id === "whatsapp");

  const finishWhatsapp = (val?: string) => {
    // Captured into local state only. No DB write — the spec just forwards
    // the value alongside the other answers into the results screen.
    setWhatsapp(val || null);
    if (val) pixelTrack("Lead", { lead_source: "quiz_whatsapp", content_name: "Quiz WhatsApp capture" });
    setScreen("results");
  };

  // Internal continuation — called either directly when the budget is at
  // or above the essentials floor, or via the warning modal "Continue
  // anyway" path.
  const continueSubmit = () => {
    setFloorWarning(false);
    pixelTrack("CustomizeProduct", {
      budget,
      categories: Array.from(categories),
      gender: gender || "unknown",
    });
    // GA4 quiz_step — emit one event per answer captured. Single-screen
    // quiz collects all three on the same view, so the "transition" to the
    // next screen is the moment to record each step's answer.
    try {
      analytics.push({
        event: "quiz_step",
        quiz_name: "bundle_recommendation",
        step_number: 1,
        step_name: "budget",
        step_value: budgetTierFor(budget),
      });
      analytics.push({
        event: "quiz_step",
        quiz_name: "bundle_recommendation",
        step_number: 2,
        step_name: "scope",
        step_value: scopeFor(categories),
      });
      analytics.push({
        event: "quiz_step",
        quiz_name: "bundle_recommendation",
        step_number: 3,
        step_name: "gender",
        step_value: gender || "unknown",
      });
    } catch { /* ignore */ }
    // Gift flow short-circuit — when the customer picked Gift + a
    // subcategory, skip the WhatsApp / regular ResultsScreen path
    // entirely and route to the dedicated gift results page.
    if (categories.has("gift") && giftSubcategory) {
      const sp = new URLSearchParams({
        category: giftSubcategory,
        budget: String(budget),
      });
      navigateRoot(`/quiz/gift-results?${sp.toString()}`);
      return;
    }
    if (onSubmit && gender) {
      // Host-controlled: let the host page handle transition (e.g. Home
      // routing to /quiz before showing WhatsApp).
      onSubmit({ budget, categories: Array.from(categories), gender });
      return;
    }
    setScreen("whatsapp");
  };

  // Public submit handler — wraps continueSubmit with the below-floor
  // warning. If the user is under ₦178,000, we intercept and ask first.
  const handleSubmitFromQuiz = () => {
    if (isBelowEssentialsFloor(budget)) {
      setFloorWarning(true);
      return;
    }
    continueSubmit();
  };

  if (screen === "quiz") {
    return (
      <>
        <QuizScreen
          budget={budget} setBudget={setBudget}
          categories={categories} setCategories={setCategories}
          gender={gender} setGender={setGender}
          giftSubcategory={giftSubcategory} setGiftSubcategory={setGiftSubcategory}
          onNext={handleSubmitFromQuiz}
        />
        {floorWarning && (
          <FloorWarningModal
            amount={budget}
            onIncrease={() => { setBudget(ESSENTIALS_FLOOR); continueSubmit(); }}
            onContinue={continueSubmit}
            onClose={() => setFloorWarning(false)}
          />
        )}
      </>
    );
  }

  // Screens 2 and 3 render as full-screen overlays portalled to
  // document.body so they escape the hero section entirely (mirrors the
  // old /quiz route UX — Build My List takes over the viewport).
  // The hero stays mounted underneath so quiz state is preserved on back.

  if (screen === "whatsapp") {
    const content = !whatsappQuestion ? (
      <QuizResultsErrorBoundary onBack={() => setScreen("quiz")}>
        <ResultsScreen
          budget={budget} categories={categories} gender={gender as Gender}
          onBack={() => setScreen("quiz")}
          onComplete={() => { quizCompletedRef.current = true; }}
        />
      </QuizResultsErrorBoundary>
    ) : (
      <OptionalTextStep
        question={whatsappQuestion}
        progress={100}
        onSubmit={finishWhatsapp}
        onSkip={() => finishWhatsapp(undefined)}
        onBack={() => setScreen("quiz")}
      />
    );
    return createPortal(
      <div className="fixed inset-0 z-[500] bg-background overflow-y-auto">
        {content}
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[500] bg-background overflow-y-auto">
      <QuizResultsErrorBoundary onBack={() => setScreen("quiz")}>
        <ResultsScreen
          budget={budget} categories={categories} gender={gender as Gender}
          onBack={() => setScreen("quiz")}
          onComplete={() => { quizCompletedRef.current = true; }}
        />
      </QuizResultsErrorBoundary>
    </div>,
    document.body
  );
}
