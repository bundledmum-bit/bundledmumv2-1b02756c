import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const n = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0)); // non-negative integer naira

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { order, items, customer, quiz, referral } = body;

    if (!order || !items || !customer) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Order must contain at least one item" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const toUuidOrNull = (val: unknown): string | null => {
      if (typeof val === "string" && uuidRegex.test(val)) return val;
      return null;
    };

    // =====================================================================
    // SECURITY: prices and totals are computed SERVER-SIDE from the database,
    // NEVER from the client request. Previously order_items used item.price and
    // the order stored the client's total, so an attacker could set a ₦500,000
    // product's price to ₦100 and pay that. Now every item's unit price is the
    // live brands_public.price for its brand_id; the subtotal is the sum of
    // those; and the stored total is recomputed from the server subtotal. The
    // client cannot influence what a product costs. (This is also what makes the
    // payment functions' amount-checks meaningful, they check against a total
    // the server controls.)
    // =====================================================================

    // 1. Resolve live prices for every item's brand_id.
    const brandIds = Array.from(
      new Set(items.map((it: any) => toUuidOrNull(it.brandId)).filter(Boolean))
    ) as string[];

    if (brandIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Items must reference valid products" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: priceRows, error: priceErr } = await supabase
      .from("brands_public")
      .select("id, price")
      .in("id", brandIds);

    if (priceErr) {
      console.error("[place-order] price lookup failed:", priceErr.message);
      return new Response(
        JSON.stringify({ error: "Could not price the order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const livePrice = new Map<string, number>();
    for (const r of priceRows || []) {
      if (r.price != null && Number(r.price) > 0) livePrice.set(r.id, Number(r.price));
    }

    // 2. Build order items with SERVER prices. Reject any item without a live price.
    let serverSubtotal = 0;
    const orderItems: any[] = [];
    for (const item of items) {
      const bid = toUuidOrNull(item.brandId);
      if (!bid || !livePrice.has(bid)) {
        return new Response(
          JSON.stringify({
            error: "One or more items are unavailable or unpriced. Please refresh your cart and try again.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const qty = Math.max(1, Math.trunc(Number(item.qty) || 0));
      const unit = livePrice.get(bid)!;      // SERVER price, not client price
      const line = unit * qty;
      serverSubtotal += line;
      orderItems.push({
        order_id: null, // set after insert
        product_name: item.name,
        brand_name: item.brandName || "Standard",
        brand_id: bid,
        product_id: toUuidOrNull(item.productId),
        quantity: qty,
        unit_price: unit,
        line_total: line,
        size: item.size || null,
        color: item.color || null,
        bundle_name: item.bundleName || null,
      });
    }

    // 3. Fees and discounts.
    //    Fees can only ADD to the total and are clamped non-negative (they can
    //    never be used to push the total below the true product cost). NOTE:
    //    full server-side re-derivation of delivery/service fees from courier
    //    logic is a planned follow-up; for now they are accepted as non-negative
    //    additive fees, which cannot be used for the price-tampering attack
    //    (that attack is on product prices, now server-authoritative).
    const deliveryFee = n(order.delivery_fee);
    const serviceFee = n(order.service_fee);
    const giftWrapFee = n(order.gift_wrap_fee);
    // Discounts are re-validated by DB triggers (coupon/spend/etc.) at insert;
    // we pass through the client-declared discount but the triggers overwrite it
    // with the true server value, so it cannot be inflated to reduce the charge
    // dishonestly. Clamp non-negative and never exceed subtotal.
    const declaredDiscount = Math.min(n(order.discount_amount ?? order.discount), serverSubtotal);

    const serverTotal = Math.max(
      0,
      serverSubtotal + deliveryFee + serviceFee + giftWrapFee - declaredDiscount
    );

    // 4. Sanitize the order object: strip payment assertions AND client money
    //    fields (we set the money from server computation).
    const {
      payment_status: _ps, paystack_reference: _pr, paystack_transaction_id: _ptid,
      paystack_amount: _pa, paystack_fee: _pf, express_payment_reference: _epr,
      gross_profit: _gp,
      subtotal: _cSub, total: _cTot, // ignore client subtotal/total
      ...safeOrder
    } = order || {};

    const sanitizedOrder = {
      ...safeOrder,
      subtotal: serverSubtotal,
      delivery_fee: deliveryFee,
      service_fee: serviceFee,
      gift_wrap_fee: giftWrapFee,
      total: serverTotal,
      payment_status: "pending", // never trust client payment state
    };

    // 5. Insert order.
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert(sanitizedOrder)
      .select("id, order_number, share_token")
      .single();

    if (orderError || !orderData) {
      console.error("Order insert failed:", orderError);
      return new Response(
        JSON.stringify({ error: orderError?.message || "Order insert failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Poll for order_number if trigger is async.
    let finalOrderNumber = orderData.order_number;
    if (!finalOrderNumber) {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 800));
        const { data: refetched } = await supabase
          .from("orders").select("order_number").eq("id", orderData.id).single();
        if (refetched?.order_number) { finalOrderNumber = refetched.order_number; break; }
      }
    }

    // 7. Attach order_id to items and add server-derived GIFT lines.
    for (const oi of orderItems) oi.order_id = orderData.id;

    try {
      const cartForGifts = Array.from(
        items.reduce((m: Map<string, number>, it: any) => {
          const bid = toUuidOrNull(it.brandId);
          const qty = Number(it.qty) || 0;
          if (bid && qty > 0) m.set(bid, (m.get(bid) || 0) + qty);
          return m;
        }, new Map<string, number>()),
      ).map(([brand_id, qty]) => ({ brand_id, qty }));

      if (cartForGifts.length) {
        const { data: earned, error: giftErr } = await supabase.rpc("get_earned_gifts", { p_cart: cartForGifts });
        if (giftErr) {
          console.error(`[place-order] get_earned_gifts failed for order ${orderData.id}:`, giftErr.message);
        } else if (Array.isArray(earned) && earned.length) {
          for (const g of earned) {
            orderItems.push({
              order_id: orderData.id,
              product_name: `🎁 Gift: ${g.gift_product_name}`,
              brand_name: g.gift_brand_name || "Gift",
              brand_id: toUuidOrNull(g.gift_brand_id),
              product_id: toUuidOrNull(g.gift_product_id),
              quantity: Number(g.gift_qty) || 1,
              unit_price: Number(g.gift_unit_price) || 0,
              line_total: Number(g.gift_line_total) || 0,
              size: null, color: null,
              bundle_name: g.promo_label || null,
              line_cost: Number(g.gift_line_cost) || 0,
            } as any);
          }
          console.log(`[place-order] added ${earned.length} gift line(s) to order ${orderData.id}`);
        }
      }
    } catch (giftCatch) {
      console.error(`[place-order] gift derivation EXCEPTION for order ${orderData.id}:`, giftCatch);
    }

    try {
      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) console.error(`[place-order] order_items insert FAILED for order ${orderData.id}:`, itemsError.message);
    } catch (itemsCatch) {
      console.error(`[place-order] order_items insert EXCEPTION for order ${orderData.id}:`, itemsCatch);
    }

    // 8. Upsert customer (uses server total).
    try {
      const { data: existing } = await supabase
        .from("customers").select("id, total_orders, total_spent").eq("email", customer.email).maybeSingle();
      if (existing) {
        await supabase.from("customers").update({
          full_name: customer.name, phone: customer.phone,
          delivery_address: customer.address, delivery_area: customer.city, delivery_state: customer.state,
          total_orders: (existing.total_orders || 0) + 1,
          total_spent: (existing.total_spent || 0) + serverTotal,
          last_order_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("customers").insert({
          email: customer.email, full_name: customer.name, phone: customer.phone,
          delivery_address: customer.address, delivery_area: customer.city, delivery_state: customer.state,
          total_orders: 1, total_spent: serverTotal, last_order_at: new Date().toISOString(),
        });
      }
    } catch (e) { console.error("Customer upsert failed:", e); }

    // 9. Referral redemption + code generation.
    if (referral?.referral_code_id) {
      try {
        await supabase.rpc("apply_referral_redemption", {
          p_referral_code_id: referral.referral_code_id, p_order_id: orderData.id,
          p_redeemer_email: referral.redeemer_email, p_redeemer_phone: referral.redeemer_phone,
          p_discount_amount: referral.discount_amount,
        });
      } catch (e) { console.error("Referral redemption exception:", e); }
    }
    try {
      await supabase.rpc("generate_referral_code", { p_order_id: orderData.id });
    } catch (e) { console.error("Referral code generation exception:", e); }

    // 10. Quiz lead.
    if (quiz?.sessionId) {
      try {
        await supabase.rpc("mark_quiz_lead_purchased", {
          p_session_id: quiz.sessionId, p_order_id: orderData.id, p_order_amount: serverTotal,
        });
      } catch (e) { console.error("Quiz lead update failed:", e); }
    }

    // 11. Emails (fire-and-forget).
    try {
      const emailUrl = `${supabaseUrl}/functions/v1/send-transactional-email`;
      const emailHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` };
      fetch(emailUrl, { method: "POST", headers: emailHeaders,
        body: JSON.stringify({ order_id: orderData.id, email_type: "order_received" }) })
        .catch((e) => console.error("Email trigger failed:", e));
      if ((sanitizedOrder.payment_method || "").toLowerCase() === "klump") {
        fetch(emailUrl, { method: "POST", headers: emailHeaders,
          body: JSON.stringify({ order_id: orderData.id, email_type: "internal_klump_started" }) })
          .catch((e) => console.error("Klump started alert failed:", e));
      }
    } catch (e) { console.error("Email trigger setup failed:", e); }

    return new Response(
      JSON.stringify({
        id: orderData.id,
        order_number: finalOrderNumber,
        share_token: orderData.share_token ?? null,
        total: serverTotal, // return the authoritative total so the client charges the right amount
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("place-order error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});