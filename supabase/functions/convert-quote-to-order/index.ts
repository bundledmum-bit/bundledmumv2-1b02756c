import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { quote_id, customer_details, payment_method } = body;

    if (!quote_id) {
      return new Response(JSON.stringify({ error: "quote_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Quote conversions are bank-transfer only for now. Accept either the
    // canonical 'transfer' or the legacy alias 'bank_transfer' from the
    // client, but ALWAYS store the canonical 'transfer' value—that's what the
    // frontend checkout writes, what the admin confirm-payment button gates
    // on, and what handle_bank_transfer_pending_notification checks.
    const requested = (payment_method || "transfer").toString().toLowerCase();
    if (requested !== "transfer" && requested !== "bank_transfer") {
      return new Response(JSON.stringify({
        error: "Only bank transfer is supported for quote conversion at this time"
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const finalPaymentMethod = "transfer";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Load quote
    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quote_id)
      .maybeSingle();

    if (quoteErr || !quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (quote.status === "converted") {
      return new Response(JSON.stringify({
        error: "Quote already converted",
        converted_order_id: quote.converted_order_id
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (quote.status === "declined" || quote.status === "expired") {
      return new Response(JSON.stringify({
        error: `Cannot convert ${quote.status} quote—re-issue or duplicate it first`
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Load quote items
    const { data: items, error: itemsErr } = await supabase
      .from("quote_items")
      .select("*")
      .eq("quote_id", quote_id)
      .order("display_order", { ascending: true });

    if (itemsErr || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: "Quote has no items" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. Resolve final customer details (request payload > quote)
    const c = customer_details || {};
    const finalCustomerName = (c.name || quote.customer_name || "").trim();
    const finalCustomerPhone = (c.phone || quote.customer_phone || "").trim();
    const finalCustomerEmail = (c.email || quote.customer_email || "").trim().toLowerCase();
    const finalDeliveryAddress = c.address || quote.delivery_address || null;
    const finalDeliveryCity = c.city || quote.delivery_city || null;
    const finalDeliveryState = c.state || quote.delivery_state || null;

    if (!finalCustomerName || !finalCustomerEmail || !finalDeliveryState || !finalDeliveryAddress) {
      return new Response(JSON.stringify({
        error: "Missing required customer fields: name, email, delivery_address, delivery_state must be on the quote or in customer_details"
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 4. Compute delivery fee (override > estimated > 0)
    const deliveryFee = quote.delivery_fee_override ?? quote.estimated_delivery_fee ?? 0;

    // 5. Build order payload
    // payment_method 'transfer' + order_status 'confirmed' to exactly match a
    // frontend bank-transfer order (awaiting payment confirmation by admin).
    // Gift wrap fields copied verbatim from the quote so the order reflects
    // the admin's quote-time choice (or the auto-rule result if no override).
    const orderPayload = {
      customer_name: finalCustomerName,
      customer_phone: finalCustomerPhone || null,
      customer_email: finalCustomerEmail,
      delivery_address: finalDeliveryAddress,
      delivery_city: finalDeliveryCity,
      delivery_state: finalDeliveryState,
      subtotal: quote.subtotal,
      service_fee: quote.service_fee || 0,
      delivery_fee: deliveryFee,
      gift_wrapping: quote.gift_wrapping || false,
      gift_wrap_fee: quote.gift_wrap_fee || 0,
      discount: quote.discount_amount || 0,
      total: quote.total,
      payment_method: finalPaymentMethod,
      payment_status: "pending",
      order_status: "confirmed",
      from_quote_id: quote_id,
      delivery_partner: null,
      partner_cost: null,
      actual_delivery_cost: null,
      courier_note: quote.internal_notes || null,
    };

    // 6. Insert order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select("id, order_number")
      .single();

    if (orderErr || !order) {
      console.error("[convert-quote-to-order] Order insert failed:", orderErr);
      return new Response(JSON.stringify({ error: orderErr?.message || "Order insert failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 6a. Wait for order_number to populate if not immediate
    let finalOrderNumber = order.order_number;
    if (!finalOrderNumber) {
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 600));
        const { data: refetched } = await supabase
          .from("orders")
          .select("order_number")
          .eq("id", order.id)
          .single();
        if (refetched?.order_number) { finalOrderNumber = refetched.order_number; break; }
      }
    }

    // 7. Insert order_items
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const toUuidOrNull = (v: unknown): string | null => (typeof v === "string" && uuidRegex.test(v)) ? v : null;

    const orderItems = items.map((item: any) => ({
      order_id: order.id,
      product_name: item.product_name,
      brand_name: item.brand_name || "Standard",
      brand_id: toUuidOrNull(item.brand_id),
      product_id: toUuidOrNull(item.product_id),
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      size: item.size || null,
      color: item.color || null,
    }));

    const { error: itemsInsertErr } = await supabase.from("order_items").insert(orderItems);
    if (itemsInsertErr) {
      console.error("[convert-quote-to-order] order_items insert failed (non-fatal):", itemsInsertErr.message);
    }

    // 8. Upsert customer
    try {
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id, total_orders, total_spent")
        .eq("email", finalCustomerEmail)
        .maybeSingle();

      if (existingCustomer) {
        await supabase.from("customers").update({
          full_name: finalCustomerName,
          phone: finalCustomerPhone || null,
          delivery_address: finalDeliveryAddress,
          delivery_area: finalDeliveryCity,
          delivery_state: finalDeliveryState,
          total_orders: (existingCustomer.total_orders || 0) + 1,
          total_spent: (existingCustomer.total_spent || 0) + (quote.total || 0),
          last_order_at: new Date().toISOString(),
        }).eq("id", existingCustomer.id);
      } else {
        await supabase.from("customers").insert({
          email: finalCustomerEmail,
          full_name: finalCustomerName,
          phone: finalCustomerPhone || null,
          delivery_address: finalDeliveryAddress,
          delivery_area: finalDeliveryCity,
          delivery_state: finalDeliveryState,
          total_orders: 1,
          total_spent: quote.total || 0,
          last_order_at: new Date().toISOString(),
          acquisition_channel: "admin_quote",
        });
      }
    } catch (e) {
      console.error("[convert-quote-to-order] Customer upsert failed (non-fatal):", e);
    }

    // 9. Mark quote as converted
    const { error: quoteUpdateErr } = await supabase
      .from("quotes")
      .update({
        status: "converted",
        converted_order_id: order.id,
        accepted_at: new Date().toISOString(),
        customer_name: quote.customer_name || finalCustomerName,
        customer_phone: quote.customer_phone || finalCustomerPhone,
        customer_email: quote.customer_email || finalCustomerEmail,
        delivery_address: quote.delivery_address || finalDeliveryAddress,
        delivery_city: quote.delivery_city || finalDeliveryCity,
        delivery_state: quote.delivery_state || finalDeliveryState,
      })
      .eq("id", quote_id);

    if (quoteUpdateErr) {
      console.error("[convert-quote-to-order] Quote status update failed:", quoteUpdateErr);
    }

    // 10. Fire order confirmation email (bank transfer instructions included)
    try {
      const emailUrl = `${supabaseUrl}/functions/v1/send-order-confirmation`;
      fetch(emailUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ order_id: order.id })
      }).catch(e => console.error("[convert-quote-to-order] Email trigger failed:", e));
    } catch (e) {
      console.error("[convert-quote-to-order] Email trigger setup failed:", e);
    }

    // 10a. Fire admin "new order" notification (non-blocking). Recipients +
    // on/off are read from site_settings inside the function; it no-ops if
    // disabled or unconfigured. Same pattern as place-order so quote-converted
    // orders also notify the admin.
    try {
      const notifyUrl = `${supabaseUrl}/functions/v1/send-new-order-notification`;
      fetch(notifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ order_id: order.id })
      }).catch(e => console.error("[convert-quote-to-order] Admin notification trigger failed:", e));
    } catch (e) {
      console.error("[convert-quote-to-order] Admin notification trigger setup failed:", e);
    }

    console.log(`[convert-quote-to-order] Quote ${quote.quote_number} → Order ${finalOrderNumber} (${order.id})`);

    return new Response(JSON.stringify({
      success: true,
      order_id: order.id,
      order_number: finalOrderNumber,
      from_quote_id: quote_id,
      payment_method: finalPaymentMethod,
      payment_status: "pending",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[convert-quote-to-order] Exception:", err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
