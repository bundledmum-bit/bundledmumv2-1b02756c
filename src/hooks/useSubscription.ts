import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionSettings {
  subscription_enabled: boolean;
  discount_pct: number;
  free_delivery_enabled: boolean;
  weekly_enabled: boolean;
  biweekly_enabled: boolean;
  monthly_enabled: boolean;
  subscription_page_heading: string;
  subscription_page_subtext: string;
  subscription_badge_label: string;
  min_order_value_naira: number;
  edit_window_days: number;
  min_deliveries: number;
  delivery_day_changeable: boolean;
}

export type Frequency = "weekly" | "biweekly" | "monthly";

export const FREQUENCY_DAYS: Record<Frequency, number> = {
  weekly: 7, biweekly: 14, monthly: 30,
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

export const WEEKDAYS: Array<{ v: string; short: string; long: string }> = [
  { v: "monday",    short: "Mon", long: "Monday" },
  { v: "tuesday",   short: "Tue", long: "Tuesday" },
  { v: "wednesday", short: "Wed", long: "Wednesday" },
  { v: "thursday",  short: "Thu", long: "Thursday" },
  { v: "friday",    short: "Fri", long: "Friday" },
  { v: "saturday",  short: "Sat", long: "Saturday" },
  { v: "sunday",    short: "Sun", long: "Sunday" },
];

export const WEEKDAY_LABEL: Record<string, string> = Object.fromEntries(
  WEEKDAYS.map(d => [d.v, d.long])
);

/**
 * Subscription settings come from the `subscription_settings` table as
 * string values ({setting_key, setting_value, value_type, ...}). The
 * get_subscription_settings RPC returns them as a flat JSON object. All
 * values still arrive as strings, so cast by key on the client.
 */
function parseSettings(raw: any): SubscriptionSettings {
  const s = raw || {};
  const b = (k: string, d: boolean) => {
    const v = s[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return v === "true";
    return d;
  };
  const num = (k: string, d: number) => {
    const v = s[k];
    const p = typeof v === "number" ? v : parseFloat(v);
    return isFinite(p) ? p : d;
  };
  const str = (k: string, d: string) => {
    const v = s[k];
    return typeof v === "string" ? v : (v == null ? d : String(v));
  };
  return {
    subscription_enabled: b("subscription_enabled", false),
    discount_pct:         num("discount_pct", 0),
    free_delivery_enabled: b("free_delivery_enabled", true),
    weekly_enabled:        b("weekly_enabled", true),
    biweekly_enabled:      b("biweekly_enabled", true),
    monthly_enabled:       b("monthly_enabled", true),
    subscription_page_heading: str("subscription_page_heading", "Never run out of the essentials."),
    subscription_page_subtext: str("subscription_page_subtext", "Subscribe to the products you use every week and we'll deliver them on a schedule that works for you."),
    subscription_badge_label: str("subscription_badge_label", "Subscribe & Save"),
    min_order_value_naira:  num("min_order_value_naira", 0),
    edit_window_days:       num("edit_window_days", 2),
    min_deliveries:         num("min_deliveries", 3),
    delivery_day_changeable: b("delivery_day_changeable", true),
  };
}

export function useSubscriptionSettings() {
  return useQuery({
    queryKey: ["subscription-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_subscription_settings");
      if (error) throw error;
      return parseSettings(data);
    },
    staleTime: 60_000,
  });
}

export interface SubscriptionDraftItem {
  product_id: string;
  brand_id: string;
  quantity: number;
  frequency: Frequency;
  unit_price: number;       // NAIRA
  product_name: string;
  brand_name: string;
  image_url?: string | null;
  size_variant?: string | null;
  color?: string | null;
  // Per-item delivery day (monday..saturday). Optional — falls back to the
  // top-level draft.delivery_day when unset (the first item owns the default).
  delivery_day?: string;
}

export interface SubscriptionDraft {
  items: SubscriptionDraftItem[];
  frequency: Frequency;
  delivery_day: string;
  subtotal_per_delivery: number;
  discount_pct: number;
  total_per_delivery: number;
}

export const DRAFT_KEY = "bm_subscription_draft";
export const RESULT_KEY = "bm_subscription_result";

export function readDraft(): SubscriptionDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

// Same-tab sessionStorage writes do NOT fire the native `storage` event, so
// we emit a custom event the basket indicator / product panels listen to.
export const DRAFT_EVENT = "bm-subscription-draft-changed";
function emitDraftChange() {
  try { window.dispatchEvent(new Event(DRAFT_EVENT)); } catch { /* SSR/no-window */ }
}

export function writeDraft(payload: SubscriptionDraft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  emitDraftChange();
}

export function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
  emitDraftChange();
}

// Recompute per-delivery totals from items, then persist (or clear when empty).
function recomputeAndWrite(d: SubscriptionDraft) {
  const subtotal = d.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  d.subtotal_per_delivery = subtotal;
  d.total_per_delivery = Math.round(subtotal * (1 - d.discount_pct / 100));
  if (d.items.length === 0) { clearDraft(); return; }
  writeDraft(d);
}

// Append (or merge by product_id+brand_id) into an EXISTING draft. No-op when
// no draft exists — the caller creates the first draft (it owns frequency +
// delivery_day for the session). A negative quantity decrements; reaching <= 0
// removes the line, so a +/- stepper can drive this directly.
export function addToDraft(newItem: SubscriptionDraftItem): void {
  const existing = readDraft();
  if (!existing) return;
  const idx = existing.items.findIndex(
    (i) => i.product_id === newItem.product_id && i.brand_id === newItem.brand_id,
  );
  if (idx >= 0) {
    existing.items[idx].quantity += newItem.quantity;
    existing.items[idx].unit_price = newItem.unit_price;
    if (existing.items[idx].quantity <= 0) existing.items.splice(idx, 1);
  } else if (newItem.quantity > 0) {
    existing.items.push(newItem);
  }
  recomputeAndWrite(existing);
}

export function removeFromDraft(product_id: string, brand_id: string): void {
  const existing = readDraft();
  if (!existing) return;
  existing.items = existing.items.filter(
    (i) => !(i.product_id === product_id && i.brand_id === brand_id),
  );
  recomputeAndWrite(existing);
}

// Decrement a line's quantity by 1; removes the line entirely at qty 1.
export function decrementDraftItem(product_id: string, brand_id: string): void {
  const existing = readDraft();
  if (!existing) return;
  const idx = existing.items.findIndex(
    (i) => i.product_id === product_id && i.brand_id === brand_id,
  );
  if (idx < 0) return;
  if (existing.items[idx].quantity <= 1) { removeFromDraft(product_id, brand_id); return; }
  existing.items[idx].quantity -= 1;
  recomputeAndWrite(existing);
}

// Live view of the current draft — re-renders on add/remove/write/clear (custom
// event, same tab) and on cross-tab `storage` changes.
export function useSubscriptionDraft(): SubscriptionDraft | null {
  const [draft, setDraft] = useState<SubscriptionDraft | null>(() => readDraft());
  useEffect(() => {
    const refresh = () => setDraft(readDraft());
    window.addEventListener(DRAFT_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(DRAFT_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return draft;
}

export const fmtN = (naira: number): string => `₦${Math.round(naira || 0).toLocaleString("en-NG")}`;

/** Min/max deliveries per cycle by frequency. */
export const DELIVERY_COUNT_LIMITS: Record<Frequency, { min: number; max: number }> = {
  weekly:   { min: 4, max: 13 },
  biweekly: { min: 4, max: 7 },
  monthly:  { min: 4, max: 6 },
};

/** Next occurrence of the given weekday (monday..sunday) strictly AFTER today. */
export function nextDeliveryDate(weekday: string | null | undefined, from: Date = new Date()): Date {
  const map: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };
  const target = weekday ? map[String(weekday).toLowerCase()] : undefined;
  if (target == null) {
    const d = new Date(from); d.setDate(d.getDate() + 1); return d;
  }
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const diff = (target - d.getDay() + 7) % 7 || 7; // never same-day — always next occurrence
  d.setDate(d.getDate() + diff);
  return d;
}

/** Date of the Nth delivery (1-indexed) counting from `firstDeliveryDate`. */
export function projectCycleEnd(firstDeliveryDate: Date, frequency: Frequency, count: number): Date {
  const d = new Date(firstDeliveryDate);
  d.setDate(d.getDate() + FREQUENCY_DAYS[frequency] * Math.max(0, count - 1));
  return d;
}

/** "diapers-nappies" → "Diapers & Nappies". */
export function prettySubcategory(s: string | null | undefined): string {
  if (!s) return "Other";
  return s
    .split(/[-_]/g)
    .map(p => p.length ? p[0].toUpperCase() + p.slice(1) : p)
    .join(" ")
    .replace(/\band\b/gi, "&");
}
