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
    const { reference, order_id } = await req.json();

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

    // 1. Verify the transaction with Paystack (server-to-server).
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
    const verified = txn.status === "success";
    const paystackAmountKobo = Number(txn.amount) || 0; // Paystack amounts are KOBO

    const result: Record<string, unknown> = {
      verified,
      reference: txn.reference,
      amount: paystackAmountKobo,
      currency: txn.currency,
      status: txn.status,
      channel: txn.channel,
      paidAt: txn.paid_at,
      customerEmail: txn.customer?.email,
      transactionId: txn.id?.toString(),
    };

    // 2. Mark the order paid ONLY under strict server-side checks.
    //
    // SECURITY: the previous version marked ANY client-supplied order_id as paid
    // whenever ANY Paystack reference verified, with no amount check and no check
    // that the reference belonged to that order. That let someone pay a tiny
    // amount (or reuse any successful reference) and mark a large order paid.
    //
    // Now, to mark an order paid we require ALL of:
    //   (a) Paystack says the transaction succeeded,
    //   (b) an order_id is supplied and the order exists,
    //   (c) the order is not already paid (idempotent),
    //   (d) the reference is not already attached to a DIFFERENT order
    //       (a reference can pay exactly one order — no reuse across orders),
    //   (e) the amount paid (kobo) is at least the order total * 100
    //       (orders.total is INTEGER NAIRA), blocking underpayment.
    if (verified && order_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const { data: order, error: findErr } = await supabase
        .from("orders")
        .select("id, order_number, total, payment_status")
        .eq("id", order_id)
        .maybeSingle();

      if (findErr) {
        result.order_updated = false;
        result.order_update_error = "lookup_failed";
      } else if (!order) {
        result.order_updated = false;
        result.order_update_error = "order_not_found";
      } else if (order.payment_status === "paid") {
        result.order_updated = false;
        result.order_already_paid = true;
        result.order_number = order.order_number;
      } else {
        // (d) Ensure this reference is not already used to pay a DIFFERENT order.
        const { data: refUsed } = await supabase
          .from("orders")
          .select("id")
          .or(`payment_reference.eq.${reference},paystack_reference.eq.${reference}`)
          .neq("id", order_id)
          .maybeSingle();

        if (refUsed) {
          console.error(`[process-payment] reference ${reference} already used by another order; refusing.`);
          result.order_updated = false;
          result.order_update_error = "reference_already_used";
          return new Response(JSON.stringify(result), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // (e) Amount must cover the order total.
        const expectedKobo = (Number(order.total) || 0) * 100;
        if (paystackAmountKobo < expectedKobo) {
          console.error(
            `[process-payment] AMOUNT MISMATCH for order ${order.order_number}: paid ${paystackAmountKobo} kobo, expected ${expectedKobo} kobo. NOT marking paid.`
          );
          result.order_updated = false;
          result.order_update_error = "amount_mismatch";
          result.expected_amount_kobo = expectedKobo;
          result.paid_amount_kobo = paystackAmountKobo;
          return new Response(JSON.stringify(result), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // All checks pass: mark paid.
        const { error: updErr } = await supabase
          .from("orders")
          .update({
            payment_status: "paid",
            paystack_reference: txn.reference,
            paystack_transaction_id: txn.id ? String(txn.id) : reference,
            payment_reference: reference,
            paystack_amount: paystackAmountKobo,
          })
          .eq("id", order.id)
          .neq("payment_status", "paid");

        if (updErr) {
          result.order_updated = false;
          result.order_update_error = updErr.message;
        } else {
          console.log(`[process-payment] order ${order.order_number} marked PAID via Paystack ${txn.reference}`);
          result.order_updated = true;
          result.order_number = order.order_number;
        }
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[process-payment] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});