import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * ACTIVATE A BOX SUBSCRIPTION AFTER ONE UP-FRONT PAYMENT.
 *
 * WHY THIS EXISTS AS AN EDGE FUNCTION AND NOT A BARE RPC:
 * The DB cannot call Paystack. If the frontend called an "activate" RPC directly and simply told it
 * "I paid 150,000", a hacked client could claim any amount and get a free subscription. So the
 * amount MUST be established by asking Paystack, server side, with the secret key. That is what this
 * does:
 *
 *   1. Take ONLY the subscription_id and the Paystack reference from the client. Never an amount.
 *   2. Ask Paystack what that reference ACTUALLY paid.
 *   3. Pass the verified amount to activate_subscription_after_payment, which re-checks every box
 *      rule server side and refuses if anything is wrong.
 *
 * The client is never trusted for money. The only thing it can influence is WHICH reference we check,
 * and a reference it did not pay for will come back as unpaid or for the wrong amount.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const subscriptionId = body?.subscription_id as string | undefined;
    const reference = body?.reference as string | undefined;

    if (!subscriptionId || !reference) {
      return json({ success: false, error: "subscription_id and reference are required" }, 400);
    }

    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secretKey) {
      return json({ success: false, error: "Paystack secret key not configured" }, 500);
    }

    // STEP 1: ask Paystack what was really paid. This is the only source of truth for the amount.
    const psResp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" } },
    );
    const psData = await psResp.json();

    if (!psResp.ok || !psData?.status) {
      return json({
        success: false,
        error: "Could not verify the payment with Paystack.",
        detail: psData?.message ?? "unknown",
      }, 502);
    }

    const txn = psData.data;
    if (txn?.status !== "success") {
      return json({
        success: false,
        error: `Payment has not succeeded. Paystack reports status: ${txn?.status ?? "unknown"}.`,
      }, 400);
    }

    // Paystack returns KOBO. Our money is NAIRA. Convert once, here.
    const amountPaidNaira = Math.floor(Number(txn.amount || 0) / 100);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // STEP 2: activate. The RPC re-checks every box rule (2+ boxes, each >= the minimum) and refuses
    // if the verified amount is short. It is idempotent, so a retry or a double webhook is safe.
    const { data, error } = await supabase.rpc("activate_subscription_after_payment", {
      p_subscription_id: subscriptionId,
      p_paystack_reference: reference,
      p_amount_paid: amountPaidNaira,
    });

    if (error) {
      console.error("activate_subscription_after_payment failed:", error.message);
      return json({ success: false, error: error.message }, 500);
    }
    if (!data?.success) {
      // The subscription is invalid (a box under the minimum, too few boxes, or underpaid). The money
      // HAS been taken, so this must be loud: it needs a human to refund or to fix the boxes.
      console.error("SUBSCRIPTION PAID BUT NOT ACTIVATED", {
        subscriptionId, reference, amountPaidNaira, reason: data?.error,
      });
      return json({ ...data, paid_but_not_activated: true, amount_paid: amountPaidNaira }, 409);
    }

    // STEP 3: confirmation email. Non-fatal: the subscription is already active and paid, so a failed
    // email must never make this look like a failure to the customer.
    try {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("customer_email, customer_name")
        .eq("id", subscriptionId)
        .maybeSingle();

      if (sub?.customer_email) {
        // Build the per-box rows the subscription_confirmed template expects. Keep it server-side so
        // the email is correct regardless of what the client sent.
        const { data: boxes } = await supabase
          .from("subscription_boxes")
          .select("box_number, scheduled_date, total")
          .eq("subscription_id", subscriptionId)
          .order("box_number");

        const naira = (n: number) => Number(n || 0).toLocaleString("en-NG");
        const boxesHtml = (boxes || []).map((b: any) => {
          const d = new Date(b.scheduled_date).toLocaleDateString("en-NG",
            { weekday: "short", day: "numeric", month: "short" });
          return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;background:#FFF8F4;border-radius:10px;"><tr><td style="padding:12px 16px;"><table width="100%"><tr><td style="font-size:14px;font-weight:700;color:#2D6A4F;">Box ${b.box_number} &middot; ${d}</td><td style="font-size:14px;color:#444;text-align:right;">&#8358;${naira(b.total)}</td></tr></table></td></tr></table>`;
        }).join("");

        const { data: settings } = await supabase
          .from("site_settings").select("value").eq("key", "subscription_box_image_url").maybeSingle();
        const boxImageUrl = settings?.value
          ? String(settings.value).replace(/^"|"$/g, "")
          : "https://bundledmum.com/images/BM-LOGO-CORAL.png";

        await supabase.functions.invoke("send-transactional-email", {
          body: {
            email_type: "subscription_confirmed",
            to: sub.customer_email,
            subscription_id: subscriptionId,
            variables: {
              first_name: (sub.customer_name || "there").split(" ")[0],
              box_count: (boxes || []).length,
              grand_total: naira(data?.total ?? 0),
              boxes_html: boxesHtml,
              box_image_url: boxImageUrl,
            },
          },
        });
      }
    } catch (e) {
      console.error("subscription confirmation email failed (non-fatal):", e);
    }

    return json({ ...data, amount_paid: amountPaidNaira, reference });
  } catch (err) {
    console.error("activate-subscription error:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});
