// Shared types for the quiz surfaces (QuizPage and HomeQuiz).

export interface RecommendedProduct {
  product_id: string;
  name: string;
  slug: string;
  priority: string;
  category: string;
  subcategory: string | null;
  quantity: number;
  selected_color: string | null;
  why_included: string;
  emoji: string | null;
  image_url: string | null;
  // Per-product size options from run_quiz_recommendation. The RPC only
  // emits IN-STOCK sizes (it filters ps.in_stock = TRUE), so an empty array
  // means either "no size axis" or "every size is out of stock" — callers
  // disambiguate with useVariantRequirements().requiresSize(). Absent on
  // responses from other engines (push-gift, older fallbacks).
  available_sizes?: Array<{
    label: string;
    code: string | null;
    in_stock: boolean;
    is_default: boolean;
  }>;
  brand: {
    id: string;
    brand_name: string;
    price: number;
    tier: string;
    image_url: string | null;
    in_stock: boolean;
    logo_url?: string | null;
  };
}

export interface RecommendationResult {
  budget_tier: string;
  scope: string;
  stage: string;
  hospital_type: string;
  delivery_method: string;
  multiples: number;
  gender: string;
  first_baby: boolean;
  product_count: number;
  target_count: number;
  engine_version: string;
  products: RecommendedProduct[];
  // v4.9 — products that fit the customer's tier/scope but were excluded
  // from the main bundle due to budget or subcategory caps. Up to 5 items.
  // May be missing on older engine responses; treat as optional.
  also_recommended?: RecommendedProduct[];
}
