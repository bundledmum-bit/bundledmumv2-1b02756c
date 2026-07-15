import { supabase } from "@/integrations/supabase/client";

// ===========================================================================
// Box-subscription data layer. One interface, two backends:
//   - GUEST (no session): everything goes through token RPCs. The guest holds an
//     unguessable guest_token; subscription_boxes / subscription_box_items are
//     NEVER read directly (RLS blocks anon). An account is created after payment.
//   - SIGNED-IN: the existing owner-scoped RPCs + direct reads (RLS allows the
//     authenticated owner).
// Totals/discounts are always READ from the backend — never computed here.
// ===========================================================================

export const MIN_BOX_VALUE = 50000;

export interface DraftItem {
  item_id: string;
  brand_id: string;
  product_name: string | null;
  brand_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}
export interface DraftBox {
  box_id: string;
  box_number: number;
  scheduled_date: string;
  subtotal: number;
  discount_amount: number;
  total: number;
  items: DraftItem[];
}
export interface Draft {
  subscription_id: string;
  months: number;
  boxes: DraftBox[];
  customer_email?: string;
}

export interface StartResult {
  subscription_id: string;
  months: number;
  guest_token: string | null;
  boxes: Array<{ box_id: string; box_number: number; scheduled_date: string }>;
}

export interface GuestCtx { guestToken: string | null }

const n = (v: any) => Number(v) || 0;
const rpc = (name: string, args: any) => (supabase as any).rpc(name, args);

// --- create ---------------------------------------------------------------
export async function startSubscription(opts: { guest: boolean; email: string; months: number }): Promise<StartResult> {
  if (opts.guest) {
    const { data, error } = await rpc("start_guest_subscription", { p_customer_email: opts.email || "", p_months: opts.months });
    if (error || !data?.success) throw new Error(error?.message || data?.error || "Could not start your subscription.");
    return { subscription_id: data.subscription_id, months: data.months ?? opts.months, guest_token: data.guest_token, boxes: data.boxes || [] };
  }
  const { data, error } = await rpc("start_subscription", { p_customer_email: opts.email, p_months: opts.months });
  if (error || !data?.success) throw new Error(error?.message || data?.error || "Could not start your subscription.");
  return { subscription_id: data.subscription_id, months: data.months ?? opts.months, guest_token: null, boxes: data.boxes || [] };
}

// --- read (source of truth for STEP 2) ------------------------------------
export async function getDraft(subscriptionId: string, guestToken: string | null): Promise<Draft> {
  if (guestToken) {
    const { data, error } = await rpc("get_guest_subscription", { p_guest_token: guestToken });
    if (error || !data?.success) throw new Error(error?.message || data?.error || "Could not load your boxes.");
    const boxes: DraftBox[] = (data.boxes || []).map((b: any) => ({
      box_id: b.box_id, box_number: b.box_number, scheduled_date: b.scheduled_date,
      subtotal: n(b.subtotal), discount_amount: n(b.discount_amount), total: n(b.total),
      items: (b.items || []).map((i: any) => ({ item_id: i.item_id, brand_id: i.brand_id, product_name: i.product_name, brand_name: i.brand_name, quantity: n(i.quantity), unit_price: n(i.unit_price), line_total: n(i.line_total) })),
    }));
    return { subscription_id: data.subscription_id ?? subscriptionId, months: data.months ?? boxes.length, boxes, customer_email: data.customer_email || "" };
  }
  const { data, error } = await (supabase as any)
    .from("subscription_boxes")
    .select("id, box_number, scheduled_date, subtotal, discount_amount, total, subscription_box_items(id, brand_id, product_name, brand_name, quantity, unit_price, line_total)")
    .eq("subscription_id", subscriptionId)
    .order("box_number", { ascending: true });
  if (error) throw error;
  const boxes: DraftBox[] = (data || []).map((b: any) => ({
    box_id: b.id, box_number: b.box_number, scheduled_date: b.scheduled_date,
    subtotal: n(b.subtotal), discount_amount: n(b.discount_amount), total: n(b.total),
    items: (b.subscription_box_items || []).map((i: any) => ({ item_id: i.id, brand_id: i.brand_id, product_name: i.product_name, brand_name: i.brand_name, quantity: n(i.quantity), unit_price: n(i.unit_price), line_total: n(i.line_total) })),
  }));
  return { subscription_id: subscriptionId, months: boxes.length, boxes };
}

// --- mutations ------------------------------------------------------------
export async function addItem(g: GuestCtx, boxId: string, brandId: string, qty = 1): Promise<void> {
  if (g.guestToken) {
    const { data, error } = await rpc("guest_add_item", { p_guest_token: g.guestToken, p_box_id: boxId, p_brand_id: brandId, p_quantity: qty });
    if (error || data?.success === false) throw new Error(error?.message || data?.error || "Couldn't add that item.");
    return;
  }
  const { error } = await rpc("add_item_to_subscription_box", { p_box_id: boxId, p_brand_id: brandId, p_quantity: qty });
  if (error) throw error;
}

// qty <= 0 removes the item.
export async function setItemQty(g: GuestCtx, itemId: string, qty: number): Promise<void> {
  if (g.guestToken) {
    const { data, error } = await rpc("guest_set_item_quantity", { p_guest_token: g.guestToken, p_item_id: itemId, p_quantity: qty });
    if (error || data?.success === false) throw new Error(error?.message || data?.error || "Couldn't update the item.");
    return;
  }
  if (qty <= 0) {
    const { error } = await (supabase as any).from("subscription_box_items").delete().eq("id", itemId);
    if (error) throw error;
    return;
  }
  const { error } = await (supabase as any).from("subscription_box_items").update({ quantity: qty }).eq("id", itemId);
  if (error) throw error;
}

// Copy the source box into EVERY other box, replacing their contents.
export async function duplicateBox(g: GuestCtx, draft: Draft, sourceBoxId: string): Promise<void> {
  if (g.guestToken) {
    const { data, error } = await rpc("guest_duplicate_box", { p_guest_token: g.guestToken, p_source_box_id: sourceBoxId });
    if (error || data?.success === false) throw new Error(error?.message || data?.error || "Couldn't copy the box.");
    return;
  }
  // Signed-in: mirror the guest RPC's replace-every-other-box semantics.
  const src = draft.boxes.find(b => b.box_id === sourceBoxId);
  if (!src) return;
  for (const b of draft.boxes) {
    if (b.box_id === sourceBoxId) continue;
    for (const it of b.items) await setItemQty(g, it.item_id, 0);
    for (const it of src.items) await addItem(g, b.box_id, it.brand_id, it.quantity);
  }
}

export interface FinalisePayload { date: string; name: string; phone: string; email: string; address: string; city: string; state: string }
export async function finalise(g: GuestCtx, subscriptionId: string, p: FinalisePayload): Promise<any> {
  if (g.guestToken) {
    const { data, error } = await rpc("guest_finalise_schedule", {
      p_guest_token: g.guestToken, p_first_delivery_date: p.date, p_customer_name: p.name, p_customer_phone: p.phone,
      p_customer_email: p.email, p_delivery_address: p.address, p_delivery_city: p.city, p_delivery_state: p.state || "Lagos",
    });
    if (error || !data?.success) throw new Error(error?.message || data?.error || "Couldn't save your delivery details.");
    return data;
  }
  const { data, error } = await rpc("finalise_subscription_schedule", {
    p_subscription_id: subscriptionId, p_first_delivery_date: p.date, p_customer_name: p.name, p_customer_phone: p.phone,
    p_delivery_address: p.address, p_delivery_city: p.city, p_delivery_state: p.state || "Lagos",
  });
  if (error || !data?.success) throw new Error(error?.message || data?.error || "Couldn't save your delivery details.");
  return data;
}

// --- tokenised box top-up (48h edit window email) -------------------------
export interface BoxEditable { editable: boolean; reason: string | null; hours_left: number }
export async function boxEditable(boxId: string): Promise<BoxEditable> {
  const { data, error } = await rpc("subscription_box_is_editable", { p_box_id: boxId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) || null;
  return { editable: !!row?.editable, reason: row?.reason ?? null, hours_left: n(row?.hours_left) };
}

// Prepare a pay-per-add top-up. Writes nothing; returns the amount to charge.
export async function prepareTopup(guestToken: string, boxId: string, brandId: string, qty = 1): Promise<{ charge_amount: number; raw: any }> {
  const { data, error } = await rpc("prepare_box_topup", { p_guest_token: guestToken, p_box_id: boxId, p_brand_id: brandId, p_quantity: qty });
  if (error || data?.success === false) throw new Error(error?.message || data?.error || "Couldn't price that top-up.");
  return { charge_amount: n(data?.charge_amount), raw: data };
}

// --- readiness (from backend-provided totals; only sums + compares) --------
export interface Readiness {
  ready: boolean;
  grand_total: number;
  min_box_value: number;
  failing: Array<{ box_number: number; subtotal: number; short_by: number }>;
}
export function readiness(boxes: DraftBox[]): Readiness {
  const failing = boxes
    .filter(b => b.subtotal < MIN_BOX_VALUE)
    .map(b => ({ box_number: b.box_number, subtotal: b.subtotal, short_by: MIN_BOX_VALUE - b.subtotal }));
  return {
    ready: boxes.length > 0 && failing.length === 0,
    grand_total: boxes.reduce((s, b) => s + b.total, 0),
    min_box_value: MIN_BOX_VALUE,
    failing,
  };
}
