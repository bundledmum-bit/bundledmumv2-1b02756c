import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Customer-facing fields ONLY. Internal financial/cost columns (partner_cost,
// gross_profit, actual_delivery_cost, paystack_fee, packaging_cost, courier costs,
// etc.) are NEVER returned by this public endpoint.
const ORDER_FIELDS = [
  "order_number",
  "order_status",
  "payment_status",
  "payment_method",
  "customer_name",
  "customer_email",
  "customer_phone",
  "delivery_address",
  "delivery_city",
  "delivery_state",
  "subtotal",
  "delivery_fee",
  "service_fee",
  "gift_wrap_fee",
  "discount_amount",
  "total",
  "created_at",
  "estimated_weight_kg",
].join(", ");

const ITEM_FIELDS = "product_name, brand_name, quantity, unit_price, line_total, size, color, bundle_name";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // =====================================================================
    // SECURITY NOTE: the customer-phone lookup that used to live here has been
    // REMOVED. It returned any customer's full name and home address for a
    // supplied phone number, with no authentication, allowing bulk harvesting
    // of personal addresses by enumerating guessable phone numbers. There is no
    // safe public version of "give me a phone number, get an address", so it is
    // gone. Any legitimate address autofill must be done for an AUTHENTICATED
    // customer against their own record, not through this public endpoint.
    // =====================================================================
    if (body.lookup_customer_phone) {
      return new Response(
        JSON.stringify({ error: "This lookup is no longer supported." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Order-confirmation lookup.
    const { order_number, share_token } = body;

    if (!order_number || typeof order_number !== "string") {
      return new Response(
        JSON.stringify({ error: "order_number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: require the unguessable share_token to match the order.
    // order_number is sequential and enumerable (BM-YYYYMMDD-001, -002, ...), so
    // order_number ALONE must not be enough to fetch an order, otherwise anyone
    // can walk the sequence and harvest every customer's PII. The share_token is
    // a random value handed to the customer when the order is placed; requiring
    // it means only the person who placed the order (holding the token) can read
    // it. If no token is supplied, we refuse.
    if (!share_token || typeof share_token !== "string") {
      return new Response(
        JSON.stringify({ error: "share_token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .select(`${ORDER_FIELDS}, order_items(${ITEM_FIELDS})`)
      .eq("order_number", order_number)
      .eq("share_token", share_token)
      .maybeSingle();

    if (error || !data) {
      // Do not distinguish "wrong token" from "no such order" (avoids confirming
      // which order numbers exist).
      return new Response(
        JSON.stringify({ order: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ order: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-order-confirmation error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});