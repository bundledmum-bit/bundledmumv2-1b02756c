import { cdb } from "./checkout/orders";
import { sdb } from "./sell/sellData";
import { mdb } from "./data/mdb";

/**
 * Listing Q&A data layer. One question per buyer per listing, enforced server
 * side (buyer_ask_listing_question). Answered questions are publicly readable
 * (RLS: answer IS NOT NULL), read here through mdb since no auth is needed for
 * that list, matching how ListingDetailPage already reads category fields.
 * All writes go through the two RPCs, there is no direct insert/update policy
 * for a buyer or seller on marketplace_listing_questions.
 */

const NUM_WORD = "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)";

/**
 * Client-side mirror of marketplace_detect_bypass_attempt: same categories,
 * same order, same reason text, built directly from the deployed function's
 * source so a person sees the problem before hitting submit rather than only
 * after. This never replaces or weakens the real check, that RPC still runs
 * server side inside both buyer_ask_listing_question and
 * seller_answer_listing_question regardless of what this returns.
 */
export function detectBypassAttempt(text: string): string | null {
  if (!text || !text.trim()) return null;
  const lower = text.toLowerCase();

  if (/(\d[\s\-.]?){7,}/.test(text)) {
    return "Please do not include a phone number, everything happens through BundledMum.";
  }
  if (new RegExp(`\\b${NUM_WORD}\\b(\\s+${NUM_WORD}\\b){4,}`).test(lower)) {
    return "Please do not spell out a phone number, everything happens through BundledMum.";
  }
  if (/(whats\s*app|wh[a4]ts[a4]pp|wa\.me|w[.\s]?a[.\s]?number|call\s*me|callme|\bfone\b|\bphon[e3]\b|telephone|contact\s*number)/.test(lower)) {
    return "Please do not mention WhatsApp, calling, or a phone number here.";
  }
  if (/(instagram|\binsta\b|\big\b|facebook|\bfb\b|tiktok|snapchat|twitter|threads\.net|telegram|\bsignal\b|dm\s*me|direct\s*message|follow\s*me|add\s*me\s*on|email\s*me|mail\s*me\s*at|reach\s*me\s*(on|at))/.test(lower)) {
    return "Please do not mention other apps or social media here, everything happens through BundledMum.";
  }
  if (/(https?:\/\/|www\.|\S+\.(com|ng|co|net|org|io|me)\b)/.test(lower) && !/(bundledmum\.com|bundledmum\.ng)/.test(lower)) {
    return "Please do not include a link, everything happens through BundledMum.";
  }
  return null;
}

// ─── Buyer side ─────────────────────────────────────────────────────────────

export interface BuyerQuestion {
  id: string;
  listing_id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
}

const BUYER_QUESTION_SELECT = "id, listing_id, question, answer, answered_at, created_at";

/** The buyer's own question on this listing, if they have asked one. At
 * most one ever exists per (listing_id, buyer_id), enforced server side. */
export async function fetchBuyerQuestionForListing(listingId: string): Promise<BuyerQuestion | null> {
  const { data, error } = await cdb.from("marketplace_listing_questions")
    .select(BUYER_QUESTION_SELECT)
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as BuyerQuestion) ?? null;
}

export interface AnsweredQuestion {
  id: string;
  question: string;
  answer: string;
  answered_at: string;
}

/** Every answered question on this listing, oldest first, public and
 * read-only here — anyone browsing the listing benefits, not just the
 * buyer who asked. */
export async function fetchAnsweredQuestionsForListing(listingId: string): Promise<AnsweredQuestion[]> {
  const { data, error } = await mdb.from("marketplace_listing_questions")
    .select("id, question, answer, answered_at")
    .eq("listing_id", listingId)
    .not("answer", "is", null)
    .order("answered_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as AnsweredQuestion[];
}

/**
 * Asks a question. Returns the new question id on success. Every rejection
 * the database can raise, including each bypass-filter reason, is already
 * written for a person to read, so this surfaces error.message directly
 * rather than remapping it to different copy.
 */
export async function buyerAskQuestion(listingId: string, question: string): Promise<{ ok: true; questionId: string } | { ok: false; message: string }> {
  const { data, error } = await cdb.rpc("buyer_ask_listing_question", { p_listing_id: listingId, p_question: question });
  if (error) {
    const message = String((error as { message?: string }).message || "") || "We could not send your question. Please refresh and try again.";
    return { ok: false, message };
  }
  return { ok: true, questionId: data as string };
}

// ─── Seller side ────────────────────────────────────────────────────────────

export interface SellerQuestion {
  id: string;
  listing_id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  listing?: { title: string | null; image_url: string | null } | null;
}

const SELLER_QUESTION_SELECT = "id, listing_id, question, answer, answered_at, created_at, listing:marketplace_listings(title, image_url)";

/** A question on one of this seller's listings, the exact deep-link
 * destination for the email button and the WhatsApp nudge link — RLS
 * (seller reads questions on own listings) is what actually enforces this
 * belongs to them, not this query. */
export async function fetchSellerQuestion(questionId: string): Promise<SellerQuestion | null> {
  const { data, error } = await sdb.from("marketplace_listing_questions")
    .select(SELLER_QUESTION_SELECT)
    .eq("id", questionId)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as SellerQuestion) ?? null;
}

/** Answers a question. Same bypass filtering as asking, surfaced the same
 * way, directly. */
export async function sellerAnswerQuestion(questionId: string, answer: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await sdb.rpc("seller_answer_listing_question", { p_question_id: questionId, p_answer: answer });
  if (error) {
    const message = String((error as { message?: string }).message || "") || "We could not save this. Please refresh and try again.";
    return { ok: false, message };
  }
  if (data !== true) return { ok: false, message: "This could not be saved. Refresh and check the question is still there." };
  return { ok: true };
}
