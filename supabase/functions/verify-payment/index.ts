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
    const { reference } = await req.json();

    if (!reference || typeof reference !== "string") {
      return new Response(
        JSON.stringify({ error: "Reference is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "Paystack secret key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Verify the transaction with Paystack (server-to-server; the browser is never trusted).
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.status) {
      return new Response(
        JSON.stringify({ verified: false, message: data.message || "Verification failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const txn = data.data;
    const paystackSucceeded = txn.status === "success";
    const paystackAmountKobo = Number(txn.amount) || 0; // Paystack amounts are in KOBO

    // Base verification payload returned to the caller regardless.
    const result: Record<string, unknown> = {
      verified: paystackSucceeded,
      reference: txn.reference,
      amount: paystackAmountKobo,
      currency: txn.currency,
      status: txn.status,
      channel: txn.channel,
      paidAt: txn.paid_at,
      customerEmail: txn.customer?.email,
    };

    // 2. If Paystack confirms success, mark the matching order paid SERVER-SIDE.
    //    This is the ONLY path by which a card order becomes 'paid'. The browser
    //    saying 'paid' means nothing (place-order forces every new order to
    //    'pending'); Paystack's own confirmation here is the source of truth.
    if (paystackSucceeded) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      // Find the order this reference belongs to (checked against multiple ref columns).
      const { data: order, error: findErr } = await supabase
        .from("orders")
        .select("id, order_number, total, payment_status")
        .or(
          `payment_reference.eq.${reference},paystack_reference.eq.${reference},express_payment_reference.eq.${reference}`
        )
        .maybeSingle();

      if (findErr) {
        console.error("[verify-payment] order lookup failed:", findErr.message);
        result.order_updated = false;
        result.order_update_error = "lookup_failed";
      } else if (!order) {
        // No matching order. Do NOT fabricate one. Report and stop.
        console.error(`[verify-payment] no order found for reference ${reference}`);
        result.order_updated = false;
        result.order_update_error = "order_not_found";
      } else if (order.payment_status === "paid") {
        // Idempotent: already paid, nothing to do.
        result.order_updated = false;
        result.order_already_paid = true;
        result.order_number = order.order_number;
      } else {
        // CRITICAL: verify the amount paid matches the order total.
        // orders.total is INTEGER NAIRA; Paystack amount is KOBO. So the paid
        // kobo must equal total * 100. This blocks underpayment (e.g. paying
        // ₦100 for a ₦300,000 order and claiming it as paid).
        const expectedKobo = (Number(order.total) || 0) * 100;
        if (paystackAmountKobo < expectedKobo) {
          console.error(
            `[verify-payment] AMOUNT MISMATCH for order ${order.order_number}: paid ${paystackAmountKobo} kobo, expected ${expectedKobo} kobo. NOT marking paid.`
          );
          result.order_updated = false;
          result.order_update_error = "amount_mismatch";
          result.expected_amount_kobo = expectedKobo;
          result.paid_amount_kobo = paystackAmountKobo;
          // Return 200 with verified:true (Paystack did succeed) but clearly not applied.
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Amount matches (or exceeds): mark the order paid.
        const { error: updErr } = await supabase
          .from("orders")
          .update({
            payment_status: "paid",
            paystack_reference: txn.reference,
            paystack_transaction_id: txn.id ? String(txn.id) : null,
            paystack_amount: paystackAmountKobo,
          })
          .eq("id", order.id)
          .neq("payment_status", "paid"); // guard against double-apply race

        if (updErr) {
          console.error(`[verify-payment] failed to mark order ${order.order_number} paid:`, updErr.message);
          result.order_updated = false;
          result.order_update_error = updErr.message;
        } else {
          console.log(`[verify-payment] order ${order.order_number} marked PAID via Paystack ${txn.reference}`);
          result.order_updated = true;
          result.order_number = order.order_number;
        }
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[verify-payment] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});