// src/lib/ga.ts
// GA4 analytics helper. All events go through dataLayer; GTM reads them.
//
// NOTE: Named `ga.ts` (not `analytics.ts`) because `src/lib/analytics.ts`
// is already used by an internal Supabase-backed session/page-view tracker.
// All GA4/GTM event firing in the codebase should go through this file.
// Never call window.dataLayer.push directly outside this module.

declare global {
  interface Window {
    dataLayer: any[];
  }
}

export interface GAItem {
  item_id: string;          // brand.id (SKU level)
  item_name: string;
  item_brand?: string;
  item_category?: string;   // products.category: 'mum' | 'baby'
  item_category2?: string;  // products.subcategory
  item_variant?: string;    // bundle tier or size
  price?: number;           // naira
  quantity?: number;
}

function push(payload: Record<string, any>) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

function pushEcommerce(event: string, items: GAItem[], extra: Record<string, any> = {}) {
  // GA4 requires clearing the ecommerce object between events to prevent merging
  push({ ecommerce: null });
  const value = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0);
  push({
    event,
    ecommerce: {
      currency: "NGN",
      value,
      items,
      ...extra,
    },
  });
}

export const analytics = {
  // Generic
  event(name: string, params: Record<string, any> = {}) {
    push({ event: name, ...params });
  },

  // Page tracking (called from route listener)
  pageView(path: string, title: string) {
    push({
      event: "page_view",
      page_path: path,
      page_title: title,
      page_location: typeof window !== "undefined" ? window.location.href : "",
    });
  },

  // User identity
  setUser(userId: string | null, properties: Record<string, any> = {}) {
    push({
      event: "user_set",
      user_id: userId,
      user_properties: properties,
    });
  },

  // E-commerce standard events
  viewItemList(listName: string, listId: string, items: GAItem[]) {
    pushEcommerce("view_item_list", items, {
      item_list_name: listName,
      item_list_id: listId,
    });
  },
  selectItem(listName: string, listId: string, item: GAItem) {
    pushEcommerce("select_item", [item], {
      item_list_name: listName,
      item_list_id: listId,
    });
  },
  viewItem(item: GAItem) {
    pushEcommerce("view_item", [item]);
  },
  addToCart(items: GAItem[]) {
    pushEcommerce("add_to_cart", items);
  },
  removeFromCart(items: GAItem[]) {
    pushEcommerce("remove_from_cart", items);
  },
  viewCart(items: GAItem[]) {
    pushEcommerce("view_cart", items);
  },
  beginCheckout(items: GAItem[], coupon?: string) {
    pushEcommerce("begin_checkout", items, coupon ? { coupon } : {});
  },
  addShippingInfo(items: GAItem[], shippingTier?: string) {
    pushEcommerce("add_shipping_info", items, shippingTier ? { shipping_tier: shippingTier } : {});
  },
  addPaymentInfo(items: GAItem[], paymentType?: string) {
    pushEcommerce("add_payment_info", items, paymentType ? { payment_type: paymentType } : {});
  },
  purchase(orderId: string, items: GAItem[], opts: {
    affiliation?: string;
    coupon?: string;
    shipping?: number;
    tax?: number;
    value: number;
  }) {
    pushEcommerce("purchase", items, {
      transaction_id: orderId,
      affiliation: opts.affiliation || "BundledMum",
      coupon: opts.coupon,
      shipping: opts.shipping,
      tax: opts.tax,
      value: opts.value,
    });
  },

  // Promotion events (homepage banners, announcements)
  viewPromotion(promoId: string, promoName: string, creativeSlot?: string) {
    push({
      event: "view_promotion",
      ecommerce: {
        promotion_id: promoId,
        promotion_name: promoName,
        creative_slot: creativeSlot,
      },
    });
  },
  selectPromotion(promoId: string, promoName: string, creativeSlot?: string) {
    push({
      event: "select_promotion",
      ecommerce: {
        promotion_id: promoId,
        promotion_name: promoName,
        creative_slot: creativeSlot,
      },
    });
  },

  // Search
  search(searchTerm: string) {
    push({ event: "search", search_term: searchTerm });
  },
  viewSearchResults(searchTerm: string, resultCount: number) {
    push({ event: "view_search_results", search_term: searchTerm, result_count: resultCount });
  },

  // Lead/auth events
  signUp(method: string) {
    push({ event: "sign_up", method });
  },
  login(method: string) {
    push({ event: "login", method });
  },
  generateLead(source: string, extra: Record<string, any> = {}) {
    push({ event: "generate_lead", source, ...extra });
  },

  // BundledMum-specific custom events
  quizStart() {
    push({ event: "quiz_start" });
  },
  quizStepComplete(stepName: string, answer: any) {
    push({ event: "quiz_step_complete", step_name: stepName, answer });
  },
  quizComplete(params: { tier: string; budget: number; items_count: number; total_value: number }) {
    push({ event: "quiz_complete", ...params });
  },
  quizAbandon(lastStep: string) {
    push({ event: "quiz_abandon", last_step: lastStep });
  },
  quizModifyBundle(action: "remove" | "swap" | "add", productId: string) {
    push({ event: "quiz_modify_bundle", action, product_id: productId });
  },
  viewBundle(tier: string, items: GAItem[]) {
    pushEcommerce("view_bundle", items, { bundle_tier: tier });
  },
  addBundleToCart(tier: string, items: GAItem[]) {
    pushEcommerce("add_bundle_to_cart", items, { bundle_tier: tier });
  },
  whatsappClick(location: string, context?: string) {
    push({ event: "whatsapp_click", click_location: location, context });
  },
  referralCodeApplied(code: string, discount: number) {
    push({ event: "referral_code_applied", code, discount });
  },
  referralCodeShared(method: string) {
    push({ event: "referral_code_shared", method });
  },
  subscribeProduct(productId: string, intervalDays: number) {
    push({ event: "subscribe_product", product_id: productId, interval_days: intervalDays });
  },
};
