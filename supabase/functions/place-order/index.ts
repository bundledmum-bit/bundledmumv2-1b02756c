import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Reject empty items arrays before touching the orders table —
    // `!items` above is false for `[]` (empty arrays are truthy), so an
    // empty array would otherwise pass validation and produce a paid
    // order row with zero order_items. This is the last line of defence
    // behind the frontend guards.
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Order must contain at least one item" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Insert order
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert(order)
      .select("id, order_number")
      .single();

    if (orderError || !orderData) {
      console.error("Order insert failed:", orderError);
      return new Response(
        JSON.stringify({ error: orderError?.message || "Order insert failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. If trigger hasn't populated order_number yet, poll for it
    let finalOrderNumber = orderData.order_number;
    if (!finalOrderNumber) {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 800));
        const { data: refetched } = await supabase
          .from("orders")
          .select("order_number")
          .eq("id", orderData.id)
          .single();
        if (refetched?.order_number) {
          finalOrderNumber = refetched.order_number;
          break;
        }
      }
    }

    // 3. Insert order items
    console.log(`[place-order] items received: ${items?.length}`, JSON.stringify(items?.slice(0, 2)));
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const toUuidOrNull = (val: unknown): string | null => {
      if (typeof val === "string" && uuidRegex.test(val)) return val;
      return null;
    };

    const orderItems = items.map((item: any) => ({
      order_id: orderData.id,
      product_name: item.name,
      brand_name: item.brandName || "Standard",
      brand_id: toUuidOrNull(item.brandId),
      product_id: toUuidOrNull(item.productId),
      quantity: item.qty,
      unit_price: item.price,
      line_total: item.price * item.qty,
      size: item.size || null,
      color: item.color || null,
      bundle_name: item.bundleName || null,
    }));

    try {
      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
      if (itemsError) {
        console.error(`[place-order] order_items insert FAILED for order ${orderData.id}:`, itemsError.message, itemsError);
      }
    } catch (itemsCatch) {
      console.error(`[place-order] order_items insert EXCEPTION for order ${orderData.id}:`, itemsCatch);
    }

    // 4. Upsert customer
    try {
      const { data: existing } = await supabase
        .from("customers")
        .select("id, total_orders, total_spent")
        .eq("email", customer.email)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("customers")
          .update({
            full_name: customer.name,
            phone: customer.phone,
            delivery_address: customer.address,
            delivery_area: customer.city,
            delivery_state: customer.state,
            total_orders: (existing.total_orders || 0) + 1,
            total_spent: (existing.total_spent || 0) + order.total,
            last_order_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("customers").insert({
          email: customer.email,
          full_name: customer.name,
          phone: customer.phone,
          delivery_address: customer.address,
          delivery_area: customer.city,
          delivery_state: customer.state,
          total_orders: 1,
          total_spent: order.total,
          last_order_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("Customer upsert failed:", e);
    }

    // 5. Process referral: apply redemption + generate code for new customer
    if (referral?.referral_code_id) {
      try {
        // Record referral redemption (redeemer used someone's code)
        const { data: redemptionResult, error: redemptionError } = await supabase.rpc("apply_referral_redemption", {
          p_referral_code_id: referral.referral_code_id,
          p_order_id: orderData.id,
          p_redeemer_email: referral.redeemer_email,
          p_redeemer_phone: referral.redeemer_phone,
          p_discount_amount: referral.discount_amount,
        });
        if (redemptionError) {
          console.error("Referral redemption failed:", redemptionError);
        } else {
          console.log("[place-order] referral redemption applied:", redemptionResult);
        }
      } catch (e) {
        console.error("Referral redemption exception:", e);
      }
    }

    // 5b. Generate a referral code for the new customer (always, even if they didn't use one)
    try {
      const { data: genResult, error: genError } = await supabase.rpc("generate_referral_code", {
        p_order_id: orderData.id,
      });
      if (genError) {
        console.error("Referral code generation failed:", genError);
      } else {
        console.log("[place-order] referral code generated:", genResult);
      }
    } catch (e) {
      console.error("Referral code generation exception:", e);
    }

    // 6. Mark quiz lead as purchased if applicable
    if (quiz?.sessionId) {
      try {
        await supabase.rpc("mark_quiz_lead_purchased", {
          p_session_id: quiz.sessionId,
          p_order_id: orderData.id,
          p_order_amount: order.total,
        });
      } catch (e) {
        console.error("Quiz lead update failed:", e);
      }
    }

    // 7. Send order confirmation email (fire-and-forget)
    try {
      const emailUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/send-order-confirmation`;
      fetch(emailUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ order_id: orderData.id }),
      }).catch((e) => console.error("Email trigger failed:", e));
    } catch (e) {
      console.error("Email trigger setup failed:", e);
    }

    return new Response(
      JSON.stringify({
        id: orderData.id,
        order_number: finalOrderNumber,
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
