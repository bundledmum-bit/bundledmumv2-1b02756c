import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shareable quiz result.
 *
 * The SELECTION is frozen at creation; PRICES are looked up when the link is
 * opened, so list_total is always today's number rather than the number on
 * the day she saved it. That is also why the PDF has to carry a
 * "prices correct as of" date and the page does not.
 *
 * budget_amount always comes back null — her budget is deliberately hidden
 * from whoever she shares with.
 */
export interface SharedListItem {
  product_id: string;
  name: string;
  slug: string | null;
  category: string | null;
  quantity: number;
  size: string | null;
  color: string | null;
  /** false once the product can no longer be supplied. Still shown, marked. */
  available: boolean;
  brand: {
    id: string;
    brand_name: string | null;
    price: number | null;
    image_url: string | null;
    in_stock: boolean;
  } | null;
}

export interface SharedList {
  found: boolean;
  share_token: string;
  shopper_type: string | null;
  scope: string | null;
  stage: string | null;
  gender: string | null;
  gift_moment: string | null;
  owner_label: string | null;
  item_count: number;
  saved_item_count: number;
  list_total: number;
  budget_amount: null;
  created_at: string;
  view_count: number;
  priced_at: string;
  items: SharedListItem[];
}

export interface ShareItemInput {
  product_id: string;
  brand_id: string | null;
  quantity: number;
  size: string | null;
  color: string | null;
}

export interface CreateShareArgs {
  sessionId: string;
  items: ShareItemInput[];
  shopperType?: string | null;
  scope?: string | null;
  stage?: string | null;
  budgetTier?: string | null;
  budgetAmount?: number | null;
  gender?: string | null;
  multiples?: number | null;
  firstBaby?: boolean | null;
  hospitalType?: string | null;
  deliveryMethod?: string | null;
  giftMoment?: string | null;
  engineVersion?: string | null;
  ownerLabel?: string | null;
}

/**
 * Idempotent per session: calling again updates the same row, so re-rendering
 * the results never mints a second link for the same list.
 */
export async function createQuizResultShare(a: CreateShareArgs): Promise<string | null> {
  if (!a.sessionId || !a.items.length) return null;
  try {
    const { data, error } = await (supabase as any).rpc("create_quiz_result_share", {
      p_session_id: a.sessionId,
      p_items: a.items,
      p_shopper_type: a.shopperType ?? null,
      p_scope: a.scope ?? null,
      p_stage: a.stage ?? null,
      p_budget_tier: a.budgetTier ?? null,
      p_budget_amount: a.budgetAmount ?? null,
      p_gender: a.gender ?? null,
      p_multiples: a.multiples ?? null,
      p_first_baby: a.firstBaby ?? null,
      p_hospital_type: a.hospitalType ?? null,
      p_delivery_method: a.deliveryMethod ?? null,
      p_gift_moment: a.giftMoment ?? null,
      p_engine_version: a.engineVersion ?? null,
      p_owner_label: a.ownerLabel ?? null,
    });
    if (error) {
      console.warn("[QuizShare] create_quiz_result_share failed:", error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row?.share_token ?? null;
  } catch (err) {
    console.warn("[QuizShare] create_quiz_result_share threw:", err);
    return null;
  }
}

/** Read a shared list by token. found:false is a clean not-found, not an error. */
export function useQuizResultShare(token: string | undefined) {
  return useQuery({
    queryKey: ["quiz_result_share", token],
    enabled: !!token,
    // Prices are live, so don't serve a stale total from cache for long.
    staleTime: 30 * 1000,
    retry: 1,
    queryFn: async (): Promise<SharedList | null> => {
      const { data, error } = await (supabase as any).rpc("get_quiz_result_share", {
        p_share_token: token,
      });
      if (error) {
        console.warn("[QuizShare] get_quiz_result_share failed:", error.message);
        return null;
      }
      const row = (Array.isArray(data) ? data[0] : data) as SharedList | undefined;
      if (!row) return null;
      return { ...row, items: Array.isArray(row.items) ? row.items : [] };
    },
  });
}

/** Absolute share URL for a token. */
export function shareUrlFor(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://bundledmum.com";
  return `${origin}/list/${token}`;
}
