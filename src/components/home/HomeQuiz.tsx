import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { Baby, ShoppingBag, Gift, Check, Share2, ClipboardCopy, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useCart, fmt } from "@/lib/cart";
import { useVariantRequirements } from "@/hooks/useVariantRequirements";
import type { Brand, Product } from "@/lib/supabaseAdapters";
import { useAllProducts, useSiteSettings } from "@/hooks/useSupabaseData";
import { useQuizQuestions, type QuizQuestion } from "@/hooks/useQuizConfig";
import { useGiftMoments } from "@/hooks/useGiftMoments";
import { useBudgetGuidance, type BudgetGuidance } from "@/hooks/useBudgetGuidance";
import { useGenderPalette } from "@/hooks/useGenderPalette";
import { supabase } from "@/integrations/supabase/client";
import { track as pixelTrack } from "@/lib/metaPixel";
import { analytics, trackEcommerce } from "@/lib/ga";
import {
  getBudgetTier,
  isBelowEssentialsFloor,
  ESSENTIALS_FLOOR,
} from "@/lib/budgetTiers";
import OptionalTextStep from "@/components/quiz/OptionalTextStep";
import ChoiceStepBody, { quizOptionCardClass } from "@/components/quiz/ChoiceStepBody";
import OwnedProductsScreen from "@/components/quiz/OwnedProductsScreen";
import ResultProductCard from "@/components/quiz/ResultProductCard";
import ProductDetailDrawer from "@/components/ProductDetailDrawer";
import ShareModal from "@/components/ShareModal";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { buildQuizStory } from "@/lib/quizStory";
import {
  completeQuizSession,
  currentQuizAttemptId,
  promoteAttemptToAttributed,
  startQuizAttempt,
  trackQuizSession,
} from "@/lib/quizSessionTracking";
import type { RecommendationResult, RecommendedProduct } from "@/components/quiz/types";

type Screen = "quiz" | "owned" | "whatsapp" | "results";
type Category = "maternity" | "baby" | "gift";
type Gender = "boy" | "girl" | "unknown";

// Extra single_choice steps that live entirely in quiz_questions. They render
// after the three built-in steps, in step_order, and ONLY when the row is
// is_active — so an inactive question simply doesn't appear (useQuizQuestions
// already filters on is_active). Answers are keyed by step_id.
const DYNAMIC_STEP_IDS = ["multiples", "firstBaby", "hospitalType", "deliveryMethod", "alreadyBought"] as const;
export type QuizExtras = Record<string, string>;

// ── Extras → engine arguments ────────────────────────────────────────────
// Each helper falls back to the value the quiz sent before these questions
// existed, so an unanswered (or skipped, or still-inactive) step behaves
// exactly like today.
export function multiplesFrom(extras: QuizExtras): number {
  const n = parseInt(extras.multiples || "", 10); // "3+" → 3
  return Number.isFinite(n) && n > 0 ? n : 1;
}
export function firstBabyFrom(extras: QuizExtras): boolean {
  return extras.firstBaby === "yes";
}
export function hospitalTypeFrom(extras: QuizExtras): string {
  return extras.hospitalType || "both";
}
export function deliveryMethodFrom(extras: QuizExtras): string {
  return extras.deliveryMethod || "both";
}
// "Yes, I have some already" routes to the owned-products picker; anything
// else (including a skipped step) goes straight on to the WhatsApp step.
// The baby-only path: "Baby Things" on its own. She is asked baby's real age
// and what she wants covered, instead of the tile deciding both for her.
// Picking maternity as well keeps the maternity path's derivation for now.
export function isBabyOnlyPath(categories: Set<Category>): boolean {
  return categories.has("baby") && !categories.has("maternity") && !categories.has("gift");
}

// Stages where a hospital bag is still ahead of her. Anyone past newborn is
// not packing one, so the hospital/home fork is never asked.
const HOSPITAL_STAGES = new Set(["expecting", "newborn"]);
export function babyScopeApplies(categories: Set<Category>, extras: QuizExtras): boolean {
  return isBabyOnlyPath(categories) && HOSPITAL_STAGES.has(extras.stage || "");
}

/** p_stage — her real answer on the baby path, derived elsewhere. */
export function stageFrom(categories: Set<Category>, extras: QuizExtras): string {
  if (isBabyOnlyPath(categories) && extras.stage) return extras.stage;
  return stageFor(categories);
}

/**
 * p_scope — her babyScope answer verbatim (the option values ARE the scope
 * values). When the fork was skipped because baby is past newborn, she is not
 * shopping a hospital bag, so it is home things only.
 */
export function scopeFrom(categories: Set<Category>, extras: QuizExtras): string {
  if (isBabyOnlyPath(categories)) {
    if (babyScopeApplies(categories, extras) && extras.babyScope) return extras.babyScope;
    return "general-baby-prep";
  }
  return scopeFor(categories);
}

/** Hospital-type and delivery-method only make sense with hospital items. */
export function scopeIncludesHospital(scope: string): boolean {
  return scope === "hospital-bag" || scope === "hospital-bag-baby" || scope === "hospital-bag+general";
}

export function screenAfterQuestions(extras: QuizExtras): Screen {
  return extras.alreadyBought === "yes" ? "owned" : "whatsapp";
}

// The minimum budget is owned by site_settings.quiz_min_budget. This constant
// is ONLY the fallback for when that setting is missing or unparseable (and
// for the first render, before settings have loaded) — it must never override
// the admin's value, which is what the old HARD_MIN_BUDGET did.
export const MIN_BUDGET_FALLBACK = 150000;
// A gift is not a hospital bag: ₦150,000 would lock out every normal gift
// budget, so the gift path reads its own setting.
export const MIN_BUDGET_GIFT_FALLBACK = 10000;
// Budget starts empty so the placeholder shows; user must enter an amount. Never
// submittable on its own, since progressing requires budget >= the hard minimum.
const DEFAULT_BUDGET = 0;

// Boolean site_settings reader. Same coercion as readExitPopupSetting in
// AdminQuizExitPopupTab (jsonb true / "true" / 1 / "1"), so a toggle behaves
// identically however the value was written.
function unwrapBool(v: any, fallback: boolean): boolean {
  if (v === undefined || v === null || v === "") return fallback;
  return v === true || v === "true" || v === 1 || v === "1";
}

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
function toOldAnswers(budget: number, categories: Set<Category>, gender: Gender, extras: QuizExtras = {}): Record<string, string> {
  const isGift = categories.has("gift");
  return {
    shopper: isGift ? "gift" : "self",
    budget: budgetTierFor(budget),
    scope: scopeFrom(categories, extras),
    stage: stageFrom(categories, extras),
    gender,
    // buildQuizStory keys off "2"/"3", so the "3+" option value is narrowed
    // to the same integer we send the engine.
    multiples: String(multiplesFrom(extras)),
    ...(extras.hospitalType ? { hospitalType: extras.hospitalType } : {}),
    ...(extras.deliveryMethod ? { deliveryMethod: extras.deliveryMethod } : {}),
  };
}

// The answers object sent to track_quiz_session / complete_quiz_session and
// stored as save_quiz_lead's p_full_answers — one shape, so a session row and
// its lead row never disagree.
export function buildAnswersSnapshot(
  budget: number,
  categories: Set<Category>,
  gender: Gender | null,
  extras: QuizExtras,
  giftSubcategory: string | null,
  excludeIds: string[],
  selectedColors: string[] = [],
): Record<string, any> {
  const isGift = categories.has("gift");
  return {
    budget,
    budget_tier: budgetTierFor(budget),
    categories: Array.from(categories),
    gender,
    scope: isGift ? "gift" : scopeFrom(categories, extras),
    stage: isGift ? "newborn" : stageFrom(categories, extras),
    gift_subcategory: giftSubcategory,
    // Which colours she kept — the interesting signal is what people untick.
    selected_colors: selectedColors,
    ...extras,
    already_owned_product_ids: excludeIds,
  };
}

export function shopperTypeFor(categories: Set<Category>): string {
  return categories.has("gift") ? "gift" : "self";
}

// Fire-and-forget quiz lead persistence. Calls the save_quiz_lead RPC,
// which upserts the quiz_customers row keyed on p_session_id and uses
// COALESCE so missing params preserve any value already on the row.
// Never throws and never awaits — the quiz UX must never block on this.
async function saveLead(payload: Record<string, any>) {
  try {
    const { error } = await (supabase as any).rpc("save_quiz_lead", payload);
    if (error) console.warn("[QuizLead] save failed:", error.message);
  } catch (err) {
    console.warn("[QuizLead] save threw:", err);
  }
}

// One id per ATTEMPT. A fresh start mints a new one so a returning visitor no
// longer overwrites her previous lead and session rows; a handoff from the
// Home widget (initialState) is the SAME attempt continuing, so it reuses the
// id already in flight. See lib/quizSessionTracking for why the checkout
// attribution key is separate.
function attemptIdFor(isContinuation: boolean): string {
  if (typeof window === "undefined") return "";
  return isContinuation ? currentQuizAttemptId() : startQuizAttempt();
}

// =============================================================================
// Screen 1 — Quiz form
// =============================================================================
// The gift path is keyed on a gift_moments.key ("where is she right now"),
// loaded from the database — never a hardcoded list, so a new moment row
// shows up on the storefront on its own.
type GiftSubcategory = string;


// =============================================================================
// Budget guidance — what the money actually covers
// =============================================================================
// Never blocks and never scolds: a smaller budget is a fact to work with, not
// a mistake. Every figure comes from quiz_budget_guidance, computed live from
// current prices, so nothing here is hardcoded.
function BudgetGuidancePanel({
  guidance, isSettling, budget, scope, onIncrease, onSwitchToBaby,
}: {
  guidance: BudgetGuidance | null;
  isSettling: boolean;
  budget: number;
  scope: string;
  onIncrease: (amount: number) => void;
  onSwitchToBaby: () => void;
}) {
  if (budget <= 0) return null;
  if (!guidance || guidance.status === "no_budget_given") {
    return isSettling
      ? <p className="mt-3 text-[12px] text-muted-foreground text-center">Checking what this covers…</p>
      : null;
  }

  // Name the list she is actually building. 'hospital-bag-baby' is a baby
  // hospital list with nothing for the mum, so calling it a maternity list
  // (as this did before that scope could reach here) reads as not listening.
  const listName =
    scope === "general-baby-prep" ? "baby list"
    : scope === "hospital-bag-baby" ? "baby hospital list"
    : scope === "hospital-bag+general" ? "maternity and baby list"
    : "maternity list";
  const money = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

  if (guidance.status === "covers_essentials") {
    return (
      <div className="mt-3 rounded-[14px] border border-forest/30 bg-forest-light/40 px-3.5 py-2.5">
        <p className="text-[12.5px] font-semibold text-forest">
          This covers all {guidance.essentials_count} essentials on your {listName}.
        </p>
      </div>
    );
  }

  if (guidance.status === "partial_good") {
    return (
      <div className="mt-3 rounded-[14px] border border-border bg-warm-cream px-3.5 py-2.5">
        <p className="text-[12.5px] text-foreground leading-relaxed">
          <b>{money(budget)}</b> covers <b>{guidance.affordable_count} of the {guidance.essentials_count}</b> essentials
          on a {listName}. A complete list comes to about <b>{money(guidance.recommended_minimum)}</b>.
        </p>
        <button
          type="button"
          onClick={() => onIncrease(guidance.recommended_minimum)}
          className="mt-2 text-[12px] font-semibold text-forest underline underline-offset-2"
        >
          Use {money(guidance.recommended_minimum)} instead
        </button>
      </div>
    );
  }

  // too_low — show the coverage plainly, then offer real choices.
  const firstFew = (guidance.would_cover || []).slice(0, 4);
  const babyFitsBetter = scope === "hospital-bag" || scope === "hospital-bag+general";
  return (
    <div className="mt-3 rounded-[14px] border border-border bg-warm-cream px-3.5 py-3">
      <p className="text-[12.5px] text-foreground leading-relaxed">
        <b>{money(budget)}</b> covers <b>{guidance.affordable_count} of {guidance.essentials_count}</b> essentials
        on a {listName}. You can carry on with this budget, and we will start with what matters most.
      </p>
      {firstFew.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
            What we would buy first
          </p>
          <ul className="space-y-0.5">
            {firstFew.map((it) => (
              <li key={it.slug || it.name} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="text-foreground min-w-0 truncate">
                  {it.quantity > 1 ? `×${it.quantity} ` : ""}{it.name}
                </span>
                <span className="font-mono-price text-muted-foreground shrink-0">{money(it.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onIncrease(guidance.recommended_minimum)}
          className="rounded-pill border-[1.5px] border-forest text-forest px-3 min-h-[36px] text-[12px] font-semibold hover:bg-forest/5"
        >
          Increase to {money(guidance.recommended_minimum)}
        </button>
        {babyFitsBetter && (
          <button
            type="button"
            onClick={onSwitchToBaby}
            className="rounded-pill border-[1.5px] border-border text-text-med px-3 min-h-[36px] text-[12px] font-semibold hover:border-forest hover:text-forest"
          >
            Switch to baby things only
          </button>
        )}
      </div>
    </div>
  );
}

function QuizScreen({
  budget, setBudget,
  categories, setCategories,
  gender, setGender,
  selectedColors, setSelectedColors,
  giftSubcategory, setGiftSubcategory,
  extras, setExtra,
  resumeAtLastStep = false,
  onNext,
  onStepAnswered,
}: {
  budget: number;
  setBudget: (n: number) => void;
  categories: Set<Category>;
  setCategories: (s: Set<Category>) => void;
  gender: Gender | null;
  setGender: (g: Gender) => void;
  selectedColors: string[];
  setSelectedColors: (names: string[]) => void;
  giftSubcategory: GiftSubcategory | null;
  setGiftSubcategory: (g: GiftSubcategory | null) => void;
  extras: QuizExtras;
  setExtra: (stepId: string, value: string) => void;
  // Coming back from the owned-products screen should land on the question
  // that sent you there, not all the way back at the budget input.
  resumeAtLastStep?: boolean;
  onNext: () => void;
  // Fired with the step id as each step is answered, so the parent can record
  // progress. Must never block the wizard.
  onStepAnswered?: (stepId: string) => void;
}) {
  const [step, setStep] = useState(0);
  const { data: settings } = useSiteSettings();
  const { data: questions } = useQuizQuestions();
  const { data: moments, isLoading: momentsLoading } = useGiftMoments();
  // Guidance for the maternity / baby paths, using the scope and stage she
  // actually chose so the minimum matches the list she will get.
  // quiz_budget_guidance now knows every scope we send, including
  // 'hospital-bag-baby'; the gift path has no essentials list to measure
  // against, so it stays disabled there.
  const resolvedScope = scopeFrom(categories, extras);
  const guidanceScope = categories.has("gift") || categories.size === 0 ? null : resolvedScope;
  // One palette fetch per gender, shared by every swatch — never per product.
  const { palette } = useGenderPalette(gender);
  // An empty stored list means "not chosen yet", which reads as all ticked.
  const tickedColors = selectedColors.length ? selectedColors : palette.map((c) => c.name);
  const toggleColor = (name: string) => {
    const next = tickedColors.includes(name)
      ? tickedColors.filter((n) => n !== name)
      : [...tickedColors, name];
    if (next.length === 0) return; // never clear the last one
    // Store in palette order, so "her first colour" is predictable downstream.
    setSelectedColors(palette.map((c) => c.name).filter((n) => next.includes(n)));
  };

  const { guidance, isSettling: guidanceSettling } = useBudgetGuidance(
    guidanceScope,
    budget,
    stageFrom(categories, extras),
  );

  // Focus the budget input whenever the budget step is shown so the caret
  // is ready. preventScroll stops the page jumping on mobile.
  const budgetRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (baseSteps[step]?.kind !== "budget") return;
    const id = window.setTimeout(() => {
      budgetRef.current?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(id);
  }, [step]);

  // All content and min-budget driven by site_settings, with hardcoded
  // fallbacks matching the seeded defaults so the UI never renders empty.
  const s = (key: string, fallback: string) => unwrapSetting(settings?.[key]) || fallback;
  // Enforced floor. Two separate settings: the maternity path keeps
  // quiz_min_budget untouched, the gift path reads quiz_min_budget_gift.
  // Each falls back independently when its setting is absent or unparseable.
  const giftFloor = unwrapInt(settings?.quiz_min_budget_gift, MIN_BUDGET_GIFT_FALLBACK);
  const maternityFloor = unwrapInt(settings?.quiz_min_budget, MIN_BUDGET_FALLBACK);
  // The path is already chosen by the time budget is asked, so there is one
  // floor and it is the right one. quiz_min_budget is now a sanity check
  // (₦20,000), not a gate — guidance does the honest work instead.
  const minBudget = categories.has("gift") ? giftFloor : maternityFloor;

  const labelBudget = s("quiz_label_budget", "WHAT IS YOUR BUDGET?");
  const labelCategories = s("quiz_label_what_you_need", "WHAT DO YOU NEED?");
  const labelCategoriesHint = s("quiz_label_what_you_need_hint", "You can pick more than one.");
  const labelGender = s("quiz_label_gender", "BABY'S GENDER");
  const ctaLabel = s("quiz_cta_label", "Build My List");
  // Optional per-step helper lines (admin: quiz_help_*). Empty = render nothing.
  const helpBudget = s("quiz_help_budget", "");
  const helpGender = s("quiz_help_gender", "");

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

  const categoryCards = [
    { id: "maternity" as const, title: s("quiz_category_maternity_title", "Bundles & Kits"), sub: s("quiz_category_maternity_sub", "Hospital bag — mum and baby"), Icon: ShoppingBag },
    { id: "baby" as const, title: s("quiz_category_baby_title", "Baby Things"), sub: s("quiz_category_baby_sub", "For when you get home"), Icon: Baby },
    { id: "gift" as const, title: s("quiz_category_gift_title", "Gifts"), sub: s("quiz_category_gift_sub", "Visiting or sending a gift"), Icon: Gift },
  ];

  const genderCards = [
    { id: "boy" as const, title: s("quiz_gender_boy_title", "Baby Boy"), sub: s("quiz_gender_boy_sub", "Blue & navy tones"), emoji: "👦" },
    { id: "girl" as const, title: s("quiz_gender_girl_title", "Baby Girl"), sub: s("quiz_gender_girl_sub", "Pink & lilac tones"), emoji: "👧" },
    { id: "unknown" as const, title: s("quiz_gender_surprise_title", "It's a Surprise!"), sub: s("quiz_gender_surprise_sub", "Neutral & unisex"), emoji: "🎁" },
  ];

  const belowMin = budget > 0 && budget < minBudget;
  const minBudgetDisplay = `Minimum ₦${minBudget.toLocaleString("en-NG")}`;

  // ── DB-driven steps ────────────────────────────────────────────────────
  // Everything after the three built-in questions comes straight out of
  // quiz_questions: the ones in DYNAMIC_STEP_IDS that are active and apply
  // to this shopper's path, in step_order. All five are currently inactive,
  // so today this list is empty and the wizard is unchanged.
  const path: "self" | "gift" = giftSelected ? "gift" : "self";
  const dynamicSteps = useMemo(
    () =>
      (questions || [])
        .filter((q) => (DYNAMIC_STEP_IDS as readonly string[]).includes(q.step_id))
        .filter((q) => !q.applies_to_path?.length || q.applies_to_path.includes(path))
        // "Which hospital?" and "What delivery method?" only make sense when
        // the list actually contains hospital items. Asking a mum with a six
        // month old where she is delivering makes the quiz look like it is
        // not listening.
        .filter((q) => {
          if (q.step_id !== "hospitalType" && q.step_id !== "deliveryMethod") return true;
          return scopeIncludesHospital(scopeFrom(categories, extras));
        })
        .sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0)),
    [questions, path, categories, extras],
  );

  // ── Wizard: one question per step ──────────────────────────────────────
  // The base steps are no longer a fixed three: the baby path inserts the age
  // question, and the hospital/home fork after it, BEFORE budget — budget
  // guidance needs the real scope and stage to quote the right minimum.
  // Both read their text and options from quiz_questions / quiz_options, so
  // admin edits land with no code change.
  const stageQuestion = (questions || []).find((q) => q.step_id === "stage");
  const babyScopeQuestion = (questions || []).find((q) => q.step_id === "babyScope");
  const babyPath = isBabyOnlyPath(categories);
  const askBabyScope = babyScopeApplies(categories, extras);

  type BaseStep = { id: string; kind: "categories" | "budget" | "gender" | "dbchoice"; question?: QuizQuestion };
  const baseSteps: BaseStep[] = useMemo(() => {
    const out: BaseStep[] = [{ id: "scope", kind: "categories" }];
    if (babyPath && stageQuestion) out.push({ id: "stage", kind: "dbchoice", question: stageQuestion });
    if (askBabyScope && babyScopeQuestion) out.push({ id: "babyScope", kind: "dbchoice", question: babyScopeQuestion });
    out.push({ id: "budget", kind: "budget" });
    out.push({ id: "gender", kind: "gender" });
    return out;
  }, [babyPath, askBabyScope, stageQuestion, babyScopeQuestion]);

  const BASE_STEP_COUNT = baseSteps.length;
  const STEP_COUNT = BASE_STEP_COUNT + dynamicSteps.length;
  // Switching to/from the gift path can shorten the list under our feet.
  useEffect(() => {
    setStep((n) => Math.min(n, STEP_COUNT - 1));
  }, [STEP_COUNT]);

  // Resume on the last question — deferred until the DB steps have loaded,
  // since STEP_COUNT is still 3 on the first render.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!resumeAtLastStep || resumedRef.current) return;
    if (dynamicSteps.length === 0) return;
    resumedRef.current = true;
    setStep(STEP_COUNT - 1);
  }, [resumeAtLastStep, dynamicSteps.length, STEP_COUNT]);

  const dynamicStep = step >= BASE_STEP_COUNT ? dynamicSteps[step - BASE_STEP_COUNT] : undefined;
  const baseStep = step < BASE_STEP_COUNT ? baseSteps[step] : undefined;
  const stepValid = dynamicStep
    ? !!extras[dynamicStep.step_id] || !!dynamicStep.is_skippable
    : baseStep?.kind === "categories" ? categories.size > 0 && (!giftSelected || !!giftSubcategory)
    : baseStep?.kind === "budget" ? budget >= minBudget
    : baseStep?.kind === "gender" ? !!gender
    : baseStep?.kind === "dbchoice" ? !!extras[baseStep.id] || !!baseStep.question?.is_skippable
    : false;
  // Step ids match the quiz_questions rows, so session rows stay comparable.
  const currentStepId = dynamicStep ? dynamicStep.step_id : baseStep?.id ?? `step_${step}`;
  const goNext = () => {
    if (!stepValid) return;
    onStepAnswered?.(currentStepId);
    if (step < STEP_COUNT - 1) setStep((n) => n + 1);
    else onNext(); // last step → parent submit (floor warning + routing)
  };
  const goBack = () => setStep((n) => Math.max(0, n - 1));
  // Skip leaves the answer unset, which is what makes the engine fall back
  // to its default for that argument. The step is still recorded as reached.
  const goSkip = () => {
    onStepAnswered?.(currentStepId);
    if (step < STEP_COUNT - 1) setStep((n) => n + 1);
    else onNext();
  };

  // Reusable option-card class (idle vs selected) on the cream wizard card.
  const optionCard = quizOptionCardClass;

  return (
    <div className="w-full max-w-[460px] mx-auto">
      <div className="bg-card rounded-[24px] shadow-[0_18px_50px_-24px_rgba(32,37,26,0.55)] p-5 md:p-7">
        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-2">
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-coral" : "bg-border"}`} />
          ))}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted-foreground mb-4">
          Step {step + 1} of {STEP_COUNT}
        </p>

        {/* STEP 1 — What do you need? This now comes first: knowing the
            path means no later step can reject a choice made here. */}
        {baseStep?.kind === "categories" && (
          <div>
            <h2 className="pf text-[20px] md:text-[24px] font-bold leading-tight mb-1">{labelCategories}</h2>
            {labelCategoriesHint && (
              <p className="text-muted-foreground text-[13px] mb-4">{labelCategoriesHint}</p>
            )}
            <div className="space-y-2">
              {categoryCards.map(c => {
                const selected = categories.has(c.id);
                return (
                  <button key={c.id} onClick={() => toggleCategory(c.id)} className={optionCard(selected)}>
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${selected ? "bg-coral/15" : "bg-warm-cream"}`}>
                      <c.Icon className="w-5 h-5 text-coral" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="pf font-bold text-[15px] text-foreground leading-tight">{c.title}</div>
                      <div className="text-text-med text-[12px] mt-0.5 leading-tight">{c.sub}</div>
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
            {giftSelected && (
              <div className="mt-4 pt-4 border-t border-border">
                <h3 className="pf text-[17px] font-bold leading-tight mb-1">Where is she right now?</h3>
                <p className="text-muted-foreground text-[13px] mb-3">
                  The right gift depends on the moment she is in.
                </p>
                {momentsLoading && !(moments || []).length ? (
                  <p className="text-muted-foreground text-[13px] py-2">Loading moments…</p>
                ) : (
                  <div className="space-y-2">
                    {(moments || []).map((m) => {
                      const selected = giftSubcategory === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setGiftSubcategory(m.key)}
                          aria-pressed={selected}
                          className={`w-full flex items-start gap-3 px-3.5 py-3 rounded-[14px] border-2 text-left transition-all ${
                            selected ? "bg-[#FFF0EB] border-coral" : "bg-card border-border hover:border-coral/40"
                          }`}
                        >
                          <span className="flex-shrink-0 w-10 h-10 rounded-full bg-warm-cream flex items-center justify-center text-xl">
                            {m.emoji || "🎁"}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block pf font-bold text-[15px] text-foreground leading-tight">{m.label}</span>
                            {m.description && (
                              <span className="block text-text-med text-[12px] mt-0.5 leading-snug">{m.description}</span>
                            )}
                            {m.timing_hint && (
                              <span className="block text-[11px] text-muted-foreground mt-1 font-medium">🕒 {m.timing_hint}</span>
                            )}
                          </span>
                          {selected && (
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-coral flex items-center justify-center mt-0.5">
                              <Check className="w-3 h-3 text-white" strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — Budget. Asked AFTER the path, so the floor and the
            guidance below always know which list she is building. */}
        {baseStep?.kind === "budget" && (
          <div>
            <h2 className="pf text-[20px] md:text-[24px] font-bold leading-tight mb-1">{labelBudget}</h2>
            {helpBudget && <p className="text-muted-foreground text-[13px] mb-4">{helpBudget}</p>}
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
                onBlur={() => { if (budget > 0 && budget < minBudget) setBudget(minBudget); }}
                onKeyDown={e => { if (e.key === "Enter") goNext(); }}
                placeholder="Type your budget"
                aria-label="Budget"
                className={`w-full ${budget > 0 ? "pl-12" : "pl-5"} pr-5 py-3.5 text-center bg-background border-2 rounded-[14px] pf text-midnight text-[26px] md:text-[30px] font-bold tracking-tight outline-none transition-colors placeholder:text-midnight/35 placeholder:text-[16px] placeholder:font-semibold ${belowMin ? "border-coral" : "border-border focus:border-forest"}`}
              />
            </div>
            <div className={`text-[12px] mt-2 font-body font-semibold text-center ${belowMin ? "text-coral" : "text-muted-foreground"}`}>
              {minBudgetDisplay}
            </div>

            {/* Honest guidance — never a gate. Maternity and baby paths only;
                the gift path has no essentials list to measure against. */}
            {!giftSelected && (
              <BudgetGuidancePanel
                guidance={guidance}
                isSettling={guidanceSettling}
                budget={budget}
                scope={resolvedScope}
                onIncrease={(amount) => setBudget(amount)}
                onSwitchToBaby={() => setCategories(new Set(["baby"] as Category[]))}
              />
            )}
          </div>
        )}

        {/* STEP 3 — Baby's gender */}
        {baseStep?.kind === "gender" && (
          <div>
            <h2 className="pf text-[20px] md:text-[24px] font-bold leading-tight mb-1">{labelGender}</h2>
            {helpGender && <p className="text-muted-foreground text-[13px] mb-4">{helpGender}</p>}
            <div className="space-y-2">
              {genderCards.map(g => {
                const selected = gender === g.id;
                return (
                  <button key={g.id} onClick={() => { if (g.id !== gender) setSelectedColors([]); setGender(g.id); }} className={optionCard(selected)}>
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-warm-cream flex items-center justify-center text-xl">{g.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="pf font-bold text-[15px] text-foreground leading-tight">{g.title}</div>
                      <div className="text-text-med text-[12px] mt-0.5 leading-tight">{g.sub}</div>
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

            {/* Progressive disclosure INSIDE this question — not a new step.
                Everything starts ticked: she is opting out, not opting in. */}
            {gender && palette.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="pf font-bold text-[14px] text-foreground leading-tight">Colours you would like</p>
                <p className="text-text-med text-[12px] mt-0.5 mb-3 leading-snug">
                  All are ticked to start. Untick anything you would rather not receive.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {palette.map((c) => {
                    const ticked = tickedColors.includes(c.name);
                    // The last remaining colour cannot be unticked — it simply
                    // stays ticked rather than raising an error at her.
                    const isLastTicked = ticked && tickedColors.length === 1;
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => toggleColor(c.name)}
                        aria-pressed={ticked}
                        title={isLastTicked ? "Keep at least one colour" : undefined}
                        className={`flex items-center gap-2 px-2.5 min-h-[44px] rounded-[12px] border-2 text-left transition-all ${
                          ticked ? "bg-[#FFF0EB] border-coral" : "bg-card border-border hover:border-coral/40"
                        }`}
                      >
                        <span
                          className="flex-shrink-0 w-6 h-6 rounded-full border border-black/10"
                          style={{ backgroundColor: c.hex }}
                          aria-hidden="true"
                        />
                        <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-foreground truncate">{c.name}</span>
                        {ticked && (
                          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-coral flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Baby-path questions (age, then the hospital/home fork). Same
            renderer and same tables as the dynamic steps — they are just
            positioned before budget, because the budget guidance needs the
            real scope and stage to quote the right minimum. */}
        {baseStep?.kind === "dbchoice" && baseStep.question && (
          <ChoiceStepBody
            question={baseStep.question}
            value={extras[baseStep.id]}
            onChange={(v) => {
              setExtra(baseStep.id, v);
              // Moving to a stage past newborn drops the fork entirely, so a
              // previously chosen babyScope must not linger in the answers.
              if (baseStep.id === "stage" && !HOSPITAL_STAGES.has(v)) setExtra("babyScope", "");
            }}
          />
        )}

        {/* DB-driven steps — question text, sub-text and options all come
            from quiz_questions / quiz_options. */}
        {dynamicStep && (
          <ChoiceStepBody
            question={dynamicStep}
            value={extras[dynamicStep.step_id]}
            onChange={(v) => setExtra(dynamicStep.step_id, v)}
          />
        )}

        {/* Navigation */}
        <div className="flex items-center gap-2.5 mt-6">
          {step > 0 && (
            <button
              onClick={goBack}
              className="inline-flex items-center gap-1 rounded-pill border-[1.5px] border-border text-foreground px-5 py-3 text-sm font-semibold hover:border-forest hover:text-forest transition-colors min-h-[48px]"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          <button
            onClick={goNext}
            disabled={!stepValid}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-pill bg-coral text-primary-foreground px-6 py-3 text-[15px] font-bold hover:bg-coral-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[48px]"
          >
            {step === STEP_COUNT - 1 ? ctaLabel : "Next"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Skip — only for questions the admin marked skippable. */}
        {dynamicStep?.is_skippable && (
          <button
            onClick={goSkip}
            className="w-full mt-3 text-muted-foreground text-xs hover:text-forest transition-colors font-body min-h-[36px]"
          >
            ⏭️ {dynamicStep.ui_config?.skip_label || "Skip this question"}
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Screen 3 — Results (mirrors the old /quiz results layout exactly)
// =============================================================================
function ResultsScreen({
  budget, categories, gender,
  extras = {},
  excludeIds = [],
  sessionId = "",
  giftSubcategory = null,
  selectedColors = [],
  onBack,
  onComplete,
}: {
  budget: number;
  categories: Set<Category>;
  gender: Gender;
  // Attempt id, so the recommendation can close out the same quiz_sessions row
  // the step tracking has been writing to.
  sessionId?: string;
  giftSubcategory?: string | null;
  // Colour names she kept on the gender step. Drives the per-product picker;
  // empty means she never reached that step (gift path), so no picker shows.
  selectedColors?: string[];
  // Answers to the DB-driven steps, keyed by step_id. Empty when those
  // questions are inactive or were skipped.
  extras?: QuizExtras;
  // Products the shopper ticked as "already have" — sent to the engine's
  // 12-argument overload as p_exclude_product_ids.
  excludeIds?: string[];
  onBack: () => void;
  onComplete?: () => void;
}) {
  const navigate = useNavigate();
  const { cart, addToCart, setCart } = useCart();
  const variantReq = useVariantRequirements();
  const { data: allProducts } = useAllProducts();

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const answers = useMemo(() => toOldAnswers(budget, categories, gender, extras), [budget, categories, gender, extras]);
  // Stable primitives for the effect below — a fresh array/object identity on
  // every render would otherwise re-run the recommendation RPC in a loop.
  const excludeKey = excludeIds.join(",");
  const extrasKey = JSON.stringify(extras);

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
          scope: isGift ? "gift" : scopeFrom(categories, extras),
          stage: isGift ? "newborn" : stageFrom(categories, extras),
          gender: gender || "unknown",
        });
      } catch { /* ignore */ }
      try {
        if (isGift) {
          // Gift path — run_gift_recommendation, keyed on the gift_moments
          // moment she picked. The old run_push_gift_recommendation could
          // only see 19 of 249 products and ignored its own timing argument,
          // so it is no longer called anywhere.
          const { data, error } = await (supabase as any).rpc("run_gift_recommendation", {
            p_moment: giftSubcategory || "",
            p_budget_amount: budget,
            p_budget_tier: budgetTierFor(budget),
            p_gender: gender ?? "neutral",
            ...(excludeIds.length > 0 ? { p_exclude_product_ids: excludeIds } : {}),
          } as any);
          if (cancelled) return;
          if (error) throw error;
          const raw = data as any;
          const normalised: RecommendationResult = {
            ...(raw || {}),
            products: Array.isArray(raw?.products) ? raw.products : [],
          } as RecommendationResult;
          setResult(normalised);
          void completeQuizSession({
            sessionId,
            resultTier: normalised.budget_tier || budgetTier,
            resultProductIds: normalised.products
              .map((prod) => prod.product_id)
              .filter((id): id is string => !!id),
            resultProductCount: normalised.products.length,
            answers: buildAnswersSnapshot(budget, categories, gender, extras, giftSubcategory, excludeIds, selectedColors),
            shopperType: shopperTypeFor(categories),
            engineVersion: normalised.engine_version || null,
          });
        } else {
          // Real answers on the baby path (stage question + hospital/home
          // fork); the maternity path still derives both from the tile.
          const scope = scopeFrom(categories, extras);
          const stage = stageFrom(categories, extras);
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
          //
          // hospital_type / delivery_method / multiples / first_baby now
          // carry the shopper's real answers when the matching DB steps are
          // active; each helper falls back to the previous default when the
          // question wasn't asked or was skipped.
          const baseParams = {
            p_budget_tier: budgetTier,
            p_scope: scope,
            p_stage: stage,
            p_hospital_type: hospitalTypeFrom(extras),
            p_delivery_method: deliveryMethodFrom(extras),
            p_multiples: multiplesFrom(extras),
            p_gender: gender === "unknown" ? "neutral" : gender,
            p_is_gift: false,
            p_first_baby: firstBabyFrom(extras),
            p_gift_relationship: null,
            p_budget_amount: budget,
          };
          // Ticked "already have" products switch us to the 12-argument
          // overload. With nothing ticked we call the 11-argument version
          // exactly as before — PostgREST resolves the overload by the
          // argument names present in the payload.
          const params = excludeIds.length
            ? { ...baseParams, p_exclude_product_ids: excludeIds }
            : baseParams;
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
          // Close out the session row. Not awaited — the results are already
          // on screen and tracking must never hold them up.
          void completeQuizSession({
            sessionId,
            resultTier: normalised.budget_tier || budgetTier,
            resultProductIds: normalised.products
              .map((prod) => prod.product_id)
              .filter((id): id is string => !!id),
            resultProductCount: normalised.products.length,
            answers: buildAnswersSnapshot(budget, categories, gender, extras, giftSubcategory, excludeIds, selectedColors),
            shopperType: shopperTypeFor(categories),
            engineVersion: normalised.engine_version || null,
          });
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Something went wrong.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [budget, categories, gender, extrasKey, excludeKey]);

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

  // Inline size selection, lifted to the results screen (like `quantities`)
  // so the bulk "Add all" action can see which items still need a size
  // chosen. Keyed by product_id; value is the chosen size_label.
  const [sizeSelections, setSizeSelections] = useState<Record<string, string>>({});
  // Per-product colour, keyed by product_id, so changing one card never
  // touches another. Unset means "her first ticked colour".
  const [colorSelections, setColorSelections] = useState<Record<string, string>>({});
  const setColorFor = (item: RecommendedProduct, color: string) =>
    setColorSelections((m) => ({ ...m, [item.product_id]: color }));
  // The palette for her gender, fetched ONCE here and shared by every card.
  const { palette } = useGenderPalette(gender);
  // Her ticked colours, in palette order, with hexes for the swatches. An
  // empty selection (she never reached the step) reads as the whole palette.
  const colorOptions = useMemo(() => {
    if (!palette.length) return [] as Array<{ name: string; hex: string }>;
    const kept = selectedColors.length ? selectedColors : palette.map((c) => c.name);
    return palette.filter((c) => kept.includes(c.name)).map((c) => ({ name: c.name, hex: c.hex }));
  }, [palette, selectedColors]);
  // Her choice for a product, defaulting to the FIRST colour she kept — never
  // the engine's selected_color, which is just the first of the full palette.
  const colorFor = (item: RecommendedProduct): string =>
    item.selected_color ? (colorSelections[item.product_id] || colorOptions[0]?.name || "") : "";
  const setSizeFor = (item: RecommendedProduct, size: string) => {
    setSizeSelections(m => ({ ...m, [item.product_id]: size }));
    // Clear this card's "needs a size" ring as soon as she picks one.
    setSizeErrorIds(prev => {
      if (!prev.has(item.product_id)) return prev;
      const next = new Set(prev); next.delete(item.product_id); return next;
    });
  };
  // product_id of the card briefly ring-highlighted when "Add all" is
  // blocked because that item still needs a size chosen.
  const [sizeErrorIds, setSizeErrorIds] = useState<Set<string>>(new Set());
  // True when this run_quiz_recommendation item has a size axis with at least
  // one in-stock option the shopper must pick before it can be added.
  const needsSizeChoice = (item: RecommendedProduct): boolean => {
    if (sizeSelections[item.product_id]) return false;         // already chosen
    if (!variantReq.requiresSize(item.product_id)) return false; // no size axis
    // A size axis with an explicitly EMPTY in-stock list can't be satisfied —
    // that item is unavailable, not "needs a choice". Note we deliberately do
    // NOT require available_sizes to be present: when the RPC omits it, the
    // product still needs a size and must not slip through unsized.
    if (Array.isArray(item.available_sizes) && item.available_sizes.length > 0
        && !item.available_sizes.some(s => s.in_stock !== false)) return false;
    return true;
  };

  // True when an item has at least one purchasable brand variant — the
  // run_quiz_recommendation RPC returns brand=null for SKUs we don't yet
  // stock, and we never want those rows to enter the cart payload sent
  // to place-order. The recommendation card UI surfaces these as
  // "Coming soon" instead of showing an Add button.
  const isPurchasable = (r: RecommendedProduct): boolean => !!r.brand && (r.brand as any).price != null;

  // Cart payload mirrors the old quiz's handleAddProduct byte-for-byte.
  // qtyOverride lets callers push N copies of the same product (Add All +
  // the pre-add qty stepper both use this).
  const handleAddProduct = (item: RecommendedProduct, overrideBrand?: Brand | null, overrideSize?: string, qtyOverride?: number, overrideColor?: string) => {
    // Guard against null-brand SKUs sneaking into the cart — without a
    // brand_id, place-order can't insert a valid order_items row.
    if (!overrideBrand && !isPurchasable(item)) {
      toast("This item is coming soon and can't be added yet.");
      return;
    }
    // Size is now chosen inline on the card (see the size picker in
    // ResultProductCard), so add-to-cart is fully self-contained here and
    // never routes to the product page. This stays as a defensive backstop:
    // if a required size/colour is somehow still missing, surface a toast
    // rather than adding a variant-less line the engine would reject.
    const chosenColor = overrideColor || colorFor(item) || item.selected_color;
    const missing = variantReq.missingAxes(item.product_id, overrideSize || undefined, chosenColor);
    if (missing.length) {
      const label = missing.length === 2 ? "a size & colour" : missing[0] === "color" ? "a colour" : "a size";
      toast.error(`Please choose ${label} for ${item.name}.`);
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
        // Colour is auto-selected from the quiz (gender-driven selected_color)
        // and passed through silently — no colour picker on the card. Null
        // selected_color is omitted so non-gendered items carry no colour.
        // HER colour for this product. Falls back to the engine's value only
        // when she has no palette (gift path), and stays undefined for unisex
        // items so they carry no colour at all.
        selectedColor: overrideColor || colorFor(item) || item.selected_color || undefined,
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
      <div className="min-h-screen bg-background pt-[var(--bm-header-h,108px)] flex items-center justify-center">
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
      <div className="min-h-screen bg-background pt-[var(--bm-header-h,108px)] px-4 flex items-center justify-center">
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
      <div className="min-h-screen bg-background pt-[var(--bm-header-h,108px)] px-4 flex items-center justify-center">
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
  // Section assignment is driven by products.quiz_section, the canonical
  // column the DB owns (values: 'mum_essentials' | 'baby_essentials' |
  // 'hospital_consumables' | NULL). The RPC doesn't carry it, but
  // useAllProducts() does SELECT * so productMap has it at runtime
  // (TS types may not be regenerated yet — hence the cast).
  //
  // For products with quiz_section IS NULL (push-gift items + any
  // un-backfilled stragglers), fall back to the previous category-based
  // routing. Push-gift never reaches this code anyway — the isGift
  // branch above handles it — so the fallback is a safety net only.
  //
  // Convenience Extras = priority='nice-to-have' AND not hospital. Hospital
  // wins over nice-to-have (matches prior semantic so clinical items
  // marked as 'nice-to-have' still land in Hospital, not Extras).
  const sectionFor = (r: RecommendedProduct): "hospital" | "mum" | "baby" | null => {
    const fp = productMap.get(r.product_id) as any;
    const qs = fp?.quiz_section as string | null | undefined;
    if (qs === "hospital_consumables") return "hospital";
    if (qs === "mum_essentials") return "mum";
    if (qs === "baby_essentials") return "baby";
    // Fallback for null quiz_section (push-gift / un-backfilled rows).
    if (r.category === "baby") return "baby";
    if (r.category === "mum") return "mum";
    return null;
  };
  const isNice = (r: RecommendedProduct) => r.priority === "nice-to-have";
  const hospitalItems = isGift ? [] : results.filter(r => sectionFor(r) === "hospital");
  const extrasItems = isGift ? [] : results.filter(r => sectionFor(r) !== "hospital" && isNice(r));
  const babyItems = isGift ? [] : results.filter(r => sectionFor(r) === "baby" && !isNice(r));
  const mumItems = isGift ? [] : results.filter(r => sectionFor(r) === "mum" && !isNice(r));

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
  // v5 12-arg overload only — absent (and irrelevant) when nothing was ticked.
  const excludedCount = Number(recommendation.excluded_count ?? 0) || 0;
  const isFallback = recommendation.engine_version?.includes("fallback");

  const recScope = recommendation.scope || answers.scope || "";
  const amount = `₦${budget.toLocaleString("en-NG")}`;
  let heading: string;
  if (isGift) heading = `A ${amount} gift bundle for the new parents`;
  else if (recScope === "hospital-bag") heading = `Your ${amount} maternity list`;
  else if (recScope === "general-baby-prep") heading = `Your ${amount} baby list`;
  else if (recScope === "hospital-bag+general") heading = `Your ${amount} maternity and baby list`;
  else heading = `Your ${amount} bundle`;

  const subHeading = buildQuizStory(answers, { productCount: results.length });

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

    // Items whose size axis has zero in-stock options can't be added at all
    // (the card shows them as "Out of stock").
    const unavailable = buyable.filter(item =>
      Array.isArray(item.available_sizes)
      && item.available_sizes.length === 0
      && variantReq.requiresSize(item.product_id));

    // Everything still waiting on a size the shopper must pick. We never
    // choose one for her — several of these products (nursing bras,
    // compression socks, hospital slippers) have no sensible default at all.
    const outstanding = buyable.filter(item => !unavailable.includes(item) && needsSizeChoice(item));
    const addable = buyable.filter(item => !unavailable.includes(item) && !outstanding.includes(item));

    // Add everything that IS ready, rather than blocking the whole batch on
    // one unsized item.
    addable.forEach(item => {
      handleAddProduct(item, undefined, sizeSelections[item.product_id] || undefined, qtyFor(item), colorFor(item) || undefined);
    });

    const skipped = results.length - addable.length - outstanding.length;

    if (outstanding.length) {
      // Ring every outstanding card, then take her to the first one so the
      // next step is obvious. No navigation to the cart — there is still
      // something to do on this page.
      setSizeErrorIds(new Set(outstanding.map(i => i.product_id)));
      const names = outstanding.slice(0, 3).map(i => i.name).join(", ");
      const more = outstanding.length > 3 ? ` and ${outstanding.length - 3} more` : "";
      document.getElementById(`quiz-item-${outstanding[0].product_id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (addable.length) {
        toast.success(`✓ Added ${addable.length} item${addable.length === 1 ? "" : "s"} to cart.`);
      }
      toast.error(
        `${outstanding.length} item${outstanding.length === 1 ? "" : "s"} still need${outstanding.length === 1 ? "s" : ""} a size: ${names}${more}. Choose a size on the highlighted card${outstanding.length === 1 ? "" : "s"}, then add again.`,
        { duration: 8000 },
      );
      return;
    }

    if (skipped > 0) {
      toast.success(`✓ Added ${addable.length} items to cart. ${skipped} unavailable item${skipped === 1 ? "" : "s"} skipped.`);
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

  // Composition chips for the summary card (only nonzero groups).
  const composition = isGift
    ? [{ n: giftItems.length, label: giftItems.length === 1 ? "gift item" : "gift items" }]
    : [
        { n: babyItems.length, label: "baby" },
        { n: mumItems.length, label: "mum" },
        { n: hospitalItems.length, label: "hospital" },
        { n: extrasItems.length, label: "extras" },
      ].filter((c) => c.n > 0);

  // Real bundle savings vs buying at each brand's compare-at price. 0 when none,
  // in which case the summary shows the free-delivery line instead.
  const bundleSavings = results.reduce((sum, item) => {
    const fp = productMap.get(item.product_id);
    const brand = fp?.brands?.find((b) => b.id === item.brand?.id) || fp?.brands?.[0] || null;
    const was = brand?.compareAtPrice ?? 0;
    const now = brand?.price ?? item.brand?.price ?? 0;
    return sum + (was > now ? (was - now) * qtyFor(item) : 0);
  }, 0);

  // Single source of truth for a result card: every group (essentials, extras,
  // also-recommended, etc.) renders through this so size-picker wiring stays
  // identical. The wrapper carries the scroll anchor id + the "Add all" ring.
  const renderCard = (item: RecommendedProduct, keyPrefix = "") => (
    <div
      key={`${keyPrefix}${item.product_id}`}
      id={`quiz-item-${item.product_id}`}
      className={`rounded-2xl transition-shadow ${sizeErrorIds.has(item.product_id) ? "ring-2 ring-coral ring-offset-2 ring-offset-background" : ""}`}
    >
      <ResultProductCard
        item={item}
        isInCart={addedIds.has(item.product_id)}
        cartItem={cart.find(c => c.id === item.product_id)}
        onQtyUpdate={(key, qty) => {
          const c = cart.find(x => x._key === key);
          if (!c) return;
          setCart(prev => prev.map(x => x._key === key ? { ...x, qty } : x));
        }}
        onAdd={(brand, size, color) => handleAddProduct(item, brand, size, qtyFor(item), color)}
        onRemove={() => handleRemoveProduct(item)}
        fullProduct={productMap.get(item.product_id)}
        onViewDetail={() => { const fp = productMap.get(item.product_id); if (fp) setDetailProduct(fp); }}
        preAddQty={qtyFor(item)}
        onPreAddQtyChange={(n) => setQty(item, n)}
        availableSizes={item.available_sizes}
        sizeRequired={variantReq.requiresSize(item.product_id)}
        selectedSize={sizeSelections[item.product_id] || ""}
        colorOptions={colorOptions}
        selectedColor={colorFor(item)}
        onColorChange={(c) => setColorFor(item, c)}
        onSizeChange={(s) => setSizeFor(item, s)}
      />
    </div>
  );

  return (
    // The sticky checkout bar grows by env(safe-area-inset-bottom) on an
    // iPhone with a home indicator (~34px), which the flat pb-28 didn't
    // allow for — the last rows ended up under the bar. The padding now
    // tracks the same inset the bar uses.
    <div className="min-h-screen bg-background pt-[var(--bm-header-h,108px)] pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-0">
      {/* Hero: intro on the warm ground, with the bundle summary card as anchor */}
      <div className="px-4 md:px-8 pt-6 md:pt-10 pb-2">
        <div className="max-w-[560px] mx-auto text-center">
          {isFallback && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4 inline-block">
              <p className="text-amber-800 text-xs">We widened your results to ensure a complete bundle. All items suit your stage.</p>
            </div>
          )}
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-coral">{isGift ? "Gift bundle ready" : "Your bundle is ready"}</div>
          <h1 className="pf text-[26px] md:text-[36px] font-bold text-foreground leading-[1.08] text-balance mt-2 mb-2.5">{heading}</h1>
          <p className="text-text-med text-[13.5px] md:text-[15px] leading-relaxed max-w-[46ch] mx-auto mb-4">{subHeading}</p>

          {/* Exclusions the engine honoured — a count only, never the list. */}
          {excludedCount > 0 && (
            <p className="inline-block bg-forest-light border border-forest/15 rounded-pill px-3 py-1 text-forest text-[12.5px] font-semibold mb-4">
              We left out {excludedCount} item{excludedCount === 1 ? "" : "s"} you already have.
            </p>
          )}

          {/* Answer pills — tap to edit. The pills stay visually compact but
              carry an invisible touch pad so each one is a 44px target; the
              row uses gap-y-3 so those pads never overlap when it wraps. */}
          <div className="flex flex-wrap gap-x-2 gap-y-4 justify-center mb-5">
            {pillData.map(p => (
              <button key={p.step} onClick={onBack} className="relative after:absolute after:content-[''] after:-inset-y-2 after:inset-x-0 bg-card border border-border rounded-pill px-3 py-1 text-foreground text-[12px] font-semibold hover:border-forest transition-colors">
                {p.emoji} {p.label}
              </button>
            ))}
            <button onClick={onBack} className="relative after:absolute after:content-[''] after:-inset-y-2 after:inset-x-0 rounded-pill border border-border px-3 py-1 text-text-med text-[12px] font-semibold hover:bg-muted/40 transition-colors">
              ↺ Edit answers
            </button>
          </div>
        </div>

        {/* Bundle summary card — the single anchor + primary CTA */}
        <div className="max-w-[560px] mx-auto rounded-3xl p-5 md:p-6 shadow-card-hover relative overflow-hidden" style={{ background: "linear-gradient(160deg, #2D6A4F, #1E5C44)" }}>
          <div className="absolute -right-10 -top-12 w-40 h-40 rounded-full bg-primary-foreground/[0.06]" />
          <div className="relative z-10 text-center">
            {composition.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center mb-3.5">
                {composition.map(c => (
                  <span key={c.label} className="bg-primary-foreground/15 border border-primary-foreground/15 rounded-pill px-2.5 py-1 text-primary-foreground text-[12px] font-semibold">{c.n} {c.label}</span>
                ))}
              </div>
            )}
            <div className="flex items-end justify-center gap-2.5 mb-1">
              <span className="text-primary-foreground/70 text-[13px] font-semibold pb-1.5">{results.length} item{results.length === 1 ? "" : "s"}</span>
              <span className="font-mono-price text-primary-foreground font-extrabold text-[34px] leading-none tracking-tight">{fmt(grandTotal)}</span>
            </div>
            <p className="text-primary-foreground/85 text-[12.5px] mb-4">
              {bundleSavings > 0
                ? <>You save <b className="text-primary-foreground">{fmt(bundleSavings)}</b> vs buying separately &middot; free delivery</>
                : <>Free delivery included on your bundle</>}
            </p>
            <button onClick={handleAddAll} className="w-full flex items-center justify-center gap-2.5 bg-coral text-primary-foreground rounded-pill py-3.5 font-body font-extrabold text-[16px] hover:bg-coral-dark transition-colors">
              <span>{isGift ? "Get gift bundle" : "Add all to cart"}</span>
              <span aria-hidden="true">&middot;</span>
              <span className="font-mono-price">{fmt(recommendationTotal)}</span>
            </button>
            {/* Text actions: 19px of type is far too small to tap, so each
                gets an invisible pad taking it to 44px tall. */}
            <div className="flex gap-5 justify-center mt-3">
              <button onClick={() => document.getElementById("quiz-results-items")?.scrollIntoView({ behavior: "smooth" })} className="relative after:absolute after:content-[''] after:-inset-y-3.5 after:-inset-x-1.5 text-primary-foreground/80 text-[12.5px] font-semibold hover:text-primary-foreground transition-colors">↓ See my items</button>
              <button onClick={handleShare} className="relative after:absolute after:content-[''] after:-inset-y-3.5 after:-inset-x-1.5 flex items-center gap-1.5 text-primary-foreground/80 text-[12.5px] font-semibold hover:text-primary-foreground transition-colors"><Share2 className="h-3.5 w-3.5" /> Share</button>
              <button onClick={handleCopyChecklist} className="relative after:absolute after:content-[''] after:-inset-y-3.5 after:-inset-x-1.5 flex items-center gap-1.5 text-primary-foreground/80 text-[12.5px] font-semibold hover:text-primary-foreground transition-colors"><ClipboardCopy className="h-3.5 w-3.5" /> Copy</button>
            </div>
          </div>
        </div>

        {/* Trust row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-4 max-w-[560px] mx-auto">
          <span className="text-text-med text-[12px] font-semibold">🚚 Free delivery</span>
          <span className="text-text-med text-[12px] font-semibold">🔒 Secure checkout</span>
          <span className="text-text-med text-[12px] font-semibold">💚 Quality assured</span>
        </div>
      </div>

      <div id="quiz-results-items" className="max-w-[1000px] mx-auto px-4 md:px-10 py-8 md:py-10">
        {giftItems.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-forest-light flex items-center justify-center text-lg flex-shrink-0">🎁</div>
              <h2 className="pf text-lg md:text-xl font-bold text-foreground flex-1">Gift bundle for the new parents</h2>
              <span className="text-xs font-bold text-muted-foreground bg-muted/60 border border-border rounded-pill px-2.5 py-0.5">{giftItems.length}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-3">
              {giftItems.map(item => renderCard(item))}
            </div>
          </div>
        )}
        {mumItems.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-coral/10 flex items-center justify-center text-lg flex-shrink-0">💛</div>
              <h2 className="pf text-lg md:text-xl font-bold text-foreground flex-1">Mum essentials</h2>
              <span className="text-xs font-bold text-muted-foreground bg-muted/60 border border-border rounded-pill px-2.5 py-0.5">{mumItems.length}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-3">
              {mumItems.map(item => renderCard(item))}
            </div>
          </div>
        )}
        {hospitalItems.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-forest-light flex items-center justify-center text-lg flex-shrink-0">🏥</div>
              <h2 className="pf text-lg md:text-xl font-bold text-foreground flex-1">Hospital consumables</h2>
              <span className="text-xs font-bold text-muted-foreground bg-muted/60 border border-border rounded-pill px-2.5 py-0.5">{hospitalItems.length}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-3">
              {hospitalItems.map(item => renderCard(item))}
            </div>
          </div>
        )}
        {babyItems.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-forest-light flex items-center justify-center text-lg flex-shrink-0">👶</div>
              <h2 className="pf text-lg md:text-xl font-bold text-foreground flex-1">Baby essentials</h2>
              <span className="text-xs font-bold text-muted-foreground bg-muted/60 border border-border rounded-pill px-2.5 py-0.5">{babyItems.length}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-3">
              {babyItems.map(item => renderCard(item))}
            </div>
          </div>
        )}
        {extrasItems.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-coral/10 flex items-center justify-center text-lg flex-shrink-0">✨</div>
              <h2 className="pf text-lg md:text-xl font-bold text-foreground flex-1">Convenience extras</h2>
              <span className="text-xs font-bold text-muted-foreground bg-muted/60 border border-border rounded-pill px-2.5 py-0.5">{extrasItems.length}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-3">
              {extrasItems.map(item => renderCard(item))}
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-3">
              {recommendation.also_recommended.map(item => renderCard(item, "alsorec-"))}
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
            }} className="rounded-pill bg-[#25D366] px-6 min-h-[44px] font-body font-semibold text-primary-foreground text-sm interactive">
              📱 Share on WhatsApp
            </button>
            <button onClick={() => {
              navigator.clipboard.writeText("https://bundledmum.com?ref=friend_share");
              toast.success("Link copied!");
            }} className="rounded-pill border-2 border-primary-foreground/30 px-6 min-h-[44px] font-body font-semibold text-primary-foreground/80 text-sm interactive">
              📋 Copy Link
            </button>
          </div>
        </div>
      </div>

      {/* Sticky mobile checkout bar — the constant purchase path */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center gap-3 px-4 py-3 border-t border-border bg-card/95 backdrop-blur-md"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex-shrink-0 leading-tight">
          <p className="text-[11px] text-muted-foreground font-medium">{results.length} item{results.length === 1 ? "" : "s"} in your bundle</p>
          <p className="font-mono-price text-forest font-extrabold text-[19px]">{fmt(recommendationTotal)}</p>
          <p className="text-[10px] font-bold text-forest">Free delivery</p>
        </div>
        <button
          onClick={handleAddAll}
          className="flex-1 flex items-center justify-center gap-2 rounded-pill bg-coral text-primary-foreground font-extrabold py-3.5 text-[15px] hover:bg-coral-dark transition-colors min-h-[52px]"
        >
          <span>{isGift ? "Get bundle" : "Add all to cart"}</span>
          <span aria-hidden="true">→</span>
        </button>
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
        <div className="min-h-screen bg-background pt-[var(--bm-header-h,108px)] px-4 flex items-center justify-center">
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
      className="fixed inset-0 z-[600] bg-black/50 flex items-center justify-center p-4 max-md:items-end max-md:p-0"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl max-w-sm w-full p-5 shadow-xl max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <span className="text-2xl">💡</span>
          <div>
            <h3 className="pf font-bold text-base text-foreground leading-tight mb-1">
              Heads up, your budget is below the typical starter floor
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
  // Answers to the DB-driven steps, plus anything ticked on the owned-products
  // screen — carried across the Home → /quiz hop so nothing is re-asked.
  extras?: QuizExtras;
  ownedProductIds?: string[];
  selectedColors?: string[];
  autoAdvance?: Screen; // "owned" | "whatsapp" | "results"
};

export type HomeQuizAnswers = {
  budget: number;
  categories: Category[];
  gender: Gender;
  extras: QuizExtras;
  ownedProductIds: string[];
};

export default function HomeQuiz({
  initialState,
  onSubmit,
}: {
  initialState?: HomeQuizInitialState;
  onSubmit?: (answers: HomeQuizAnswers) => void;
} = {}) {
  const [screen, setScreen] = useState<Screen>(initialState?.autoAdvance || "quiz");

  // Advancing to the WhatsApp-capture or Results screen is a CONDITIONAL RENDER
  // (screen state flips, not a route change), so the app-wide <ScrollToTop>
  // never fires. Without this the results can render mid-page/at the footer,
  // inheriting the previous screen's scroll. These transitions only happen on
  // the full-page /quiz flow (the homepage's inline quiz navigates to /quiz
  // before any screen change, and stays on "quiz" here), so resetting the
  // window scroll is safe. Instant (no animation) — never seen scrolling.
  useEffect(() => {
    if (screen !== "quiz") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [screen]);
  const [budget, setBudget] = useState<number>(() => {
    // Empty (0) stays empty so the input shows its placeholder; any positive
    // restored value is raised to the hard minimum so a resumed quiz can never
    // carry a below-floor budget into the recommendation RPC.
    // Settings aren't loaded on the first render, so a resumed below-floor
    // budget is raised to the fallback; QuizScreen re-validates against the
    // live quiz_min_budget before she can advance.
    const b = initialState?.budget ?? DEFAULT_BUDGET;
    // Never raise a GIFT budget to the maternity floor — ₦30,000 is a normal
    // gift, and QuizScreen validates it against quiz_min_budget_gift anyway.
    const resumingGift = (initialState?.categories || []).includes("gift");
    if (resumingGift) return b;
    return b > 0 && b < MIN_BUDGET_FALLBACK ? MIN_BUDGET_FALLBACK : b;
  });
  const [categories, setCategories] = useState<Set<Category>>(new Set(initialState?.categories || []));
  const [gender, setGender] = useState<Gender | null>(initialState?.gender || null);
  const [giftSubcategory, setGiftSubcategory] = useState<GiftSubcategory | null>(null);
  // Colour names she wants, from the palette for the chosen gender. Everything
  // starts ticked (she opts OUT, not in) and at least one always stays ticked.
  // Lives here, not in QuizScreen, so it survives stepping back and forward
  // and can be read by the results screen.
  const [selectedColors, setSelectedColors] = useState<string[]>(initialState?.selectedColors || []);
  // Answers to the DB-driven steps, keyed by step_id, and the products the
  // shopper ticked as "already have". Both live here (not in QuizScreen) so
  // they survive stepping back and forward through the flow.
  const [extras, setExtras] = useState<QuizExtras>(initialState?.extras || {});
  const setExtra = (stepId: string, value: string) => setExtras((prev) => ({ ...prev, [stepId]: value }));
  const [ownedIds, setOwnedIds] = useState<Set<string>>(() => new Set(initialState?.ownedProductIds || []));
  const toggleOwned = (productId: string) =>
    setOwnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  const excludeIds = useMemo(() => Array.from(ownedIds), [ownedIds]);
  // Set when the owned-products screen hands control back to the questions.
  const [resumeAtLastStep, setResumeAtLastStep] = useState(false);
  const navigateRoot = useNavigate();
  // One id for THIS attempt. A handoff from the Home widget carries
  // initialState, which means the same attempt is continuing on /quiz, so we
  // keep its id; anything else is a fresh start and mints a new one.
  const [sessionId] = useState<string>(() => attemptIdFor(!!initialState));

  // Ordered list of step ids answered so far. track_quiz_session takes the
  // FULL array each call (it never regresses server-side), so this is the
  // single source of truth for progress within the attempt.
  const stepsCompletedRef = useRef<string[]>([]);
  const snapshot = () =>
    buildAnswersSnapshot(budget, categories, gender, extras, giftSubcategory, excludeIds, selectedColors);

  // Called by QuizScreen as each step is answered. Deliberately NOT awaited:
  // tracking must never delay the next question. The RPC wrapper owns the
  // error path and logs failures.
  const trackStep = (stepId: string) => {
    if (!stepsCompletedRef.current.includes(stepId)) {
      stepsCompletedRef.current = [...stepsCompletedRef.current, stepId];
    }
    void trackQuizSession({
      sessionId,
      currentStep: stepId,
      answers: snapshot(),
      shopperType: shopperTypeFor(categories),
      stepsCompleted: stepsCompletedRef.current,
    });
  };
  // Soft below-floor warning state. When the user submits with a budget
  // below ₦178,000, we hold the submit, surface the warning, and let them
  // choose: bump up to the floor, or continue at their entered amount.
  const [floorWarning, setFloorWarning] = useState(false);
  // The below-floor nudge is OFF unless site_settings turns it on. It
  // interrupted her at the moment she was about to see her list and asked her
  // to spend more before she had seen anything, so it stays in the codebase
  // but behind quiz_budget_floor_popup_enabled. Absent setting = off.
  const { data: quizSettings } = useSiteSettings();
  const floorPopupEnabled = unwrapBool(quizSettings?.quiz_budget_floor_popup_enabled, false);

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
          owned: { n: 2, name: "already_owned" },
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
    if (val) {
      pixelTrack("Lead", { lead_source: "quiz_whatsapp", content_name: "Quiz WhatsApp capture" });
      // Enrich the existing lead row with the WhatsApp number — RPC
      // upserts by session_id and COALESCE preserves all other fields.
      saveLead({
        p_session_id: sessionId,
        p_whatsapp_number: val,
      });
      // Fire admin notification email — fire-and-forget, fail-soft.
      // Runs after saveLead so the row is guaranteed written by the
      // time the edge function reads it. Returns { sent, reason } but
      // we don't inspect — admin opt-in lives server-side.
      (supabase as any).functions
        .invoke("notify-quiz-lead", { body: { session_id: sessionId } })
        .catch((err: unknown) => {
          console.warn("[QuizLeadNotify] failed:", err);
        });
    }
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
    // Persist the quiz lead. Fire-and-forget so the UX never blocks; the
    // RPC upserts by session_id and is later enriched by finishWhatsapp.
    const isGift = categories.has("gift");
    const scope = isGift ? "gift" : scopeFrom(categories, extras);
    const stage = isGift ? "newborn" : stageFrom(categories, extras);
    const budgetTier = budgetTierFor(budget);
    const fullAnswers = buildAnswersSnapshot(budget, categories, gender, extras, giftSubcategory, excludeIds, selectedColors);
    // The attempt now has a lead row, so this is the id CheckoutPage should
    // attribute an order to. Promoting only here (never on a fresh start) is
    // what keeps attribution intact when she restarts the quiz and abandons it.
    promoteAttemptToAttributed(sessionId);
    saveLead({
      p_session_id: sessionId,
      p_shopper_type: isGift ? "gift" : "self",
      p_budget_tier: budgetTier,
      p_scope: scope,
      p_stage: stage,
      p_baby_gender: gender ?? null,
      p_hospital_type: extras.hospitalType ?? null,
      p_delivery_method: extras.deliveryMethod ?? null,
      p_multiples: String(multiplesFrom(extras)),
      p_first_baby: firstBabyFrom(extras),
      p_gift_wrap: false,
      p_push_gift_category: isGift ? (giftSubcategory ?? null) : null,
      p_push_gift_budget: isGift ? budgetTier : null,
      p_full_answers: fullAnswers,
      p_referral_source: typeof document !== "undefined" ? (document.referrer || null) : null,
      p_page_url: typeof window !== "undefined" ? window.location.href : null,
    });
    // Gift flow short-circuit — when the customer picked Gift + a
    // subcategory, skip the WhatsApp / regular ResultsScreen path
    // entirely and route to the dedicated gift results page.
    if (categories.has("gift") && giftSubcategory) {
      const sp = new URLSearchParams({
        moment: giftSubcategory,
        budget: String(budget),
        gender: gender ?? "neutral",
        ...(excludeIds.length ? { exclude: excludeIds.join(",") } : {}),
      });
      navigateRoot(`/quiz/gift-results?${sp.toString()}`);
      return;
    }
    if (onSubmit && gender) {
      // Host-controlled: let the host page handle transition (e.g. Home
      // routing to /quiz before showing WhatsApp).
      onSubmit({ budget, categories: Array.from(categories), gender, extras, ownedProductIds: excludeIds });
      return;
    }
    // "Yes, I have some already" → owned-products picker, then WhatsApp.
    setScreen(screenAfterQuestions(extras));
  };

  // Public submit handler — wraps continueSubmit with the below-floor
  // warning. If the user is under ₦178,000, we intercept and ask first.
  const handleSubmitFromQuiz = () => {
    if (floorPopupEnabled && isBelowEssentialsFloor(budget)) {
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
          selectedColors={selectedColors} setSelectedColors={setSelectedColors}
          giftSubcategory={giftSubcategory} setGiftSubcategory={setGiftSubcategory}
          extras={extras} setExtra={setExtra}
          resumeAtLastStep={resumeAtLastStep}
          onNext={handleSubmitFromQuiz}
          onStepAnswered={trackStep}
        />
        {floorPopupEnabled && floorWarning && (
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

  // Owned-products picker — sits between the last question and WhatsApp.
  if (screen === "owned") {
    return createPortal(
      <div className="fixed inset-0 z-[500] bg-background overflow-y-auto">
        <OwnedProductsScreen
          selectedIds={ownedIds}
          onToggle={toggleOwned}
          onDone={() => setScreen("whatsapp")}
          onBack={() => { setResumeAtLastStep(true); setScreen("quiz"); }}
        />
      </div>,
      document.body
    );
  }

  if (screen === "whatsapp") {
    const content = !whatsappQuestion ? (
      <QuizResultsErrorBoundary onBack={() => setScreen("quiz")}>
        <ResultsScreen
          budget={budget} categories={categories} gender={gender as Gender}
          extras={extras} excludeIds={excludeIds} sessionId={sessionId} giftSubcategory={giftSubcategory} selectedColors={selectedColors}
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
        onBack={() => { setResumeAtLastStep(false); setScreen("quiz"); }}
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
          extras={extras} excludeIds={excludeIds} sessionId={sessionId} giftSubcategory={giftSubcategory} selectedColors={selectedColors}
          onBack={() => setScreen("quiz")}
          onComplete={() => { quizCompletedRef.current = true; }}
        />
      </QuizResultsErrorBoundary>
    </div>,
    document.body
  );
}
