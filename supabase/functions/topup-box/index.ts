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
 * TOP-UP A SUBSCRIPTION BOX (pay-per-add, in the 48h->24h window before it ships).
 *
 * Same trust model as activate-subscription: the client NEVER states an amount. It sends the box, the
 * item, the quantity, and the Paystack reference. This function asks Paystack what was ACTUALLY paid,
 * then commits the item via commit_box_topup (service-role only), which re-checks the box is still in
 * its editable window before adding anything.
 *
 * If the box locked between the customer paying and this running, the money was taken but the item
 * cannot be added: we return paid_but_not_added so the UI can tell her to contact us for a refund.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const boxId = body?.box_id as string | undefined;
    const brandId = body?.brand_id as string | undefined;
    const quantity = Math.max(1, Number(body?.quantity ?? 1));
    const reference = body?.reference as string | undefined;

    if (!boxId || !brandId || !reference) {
      return json({ success: false, error: "box_id, brand_id and reference are required" }, 400);
    }

    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secretKey) return json({ success: false, error: "Paystack secret key not configured" }, 500);

    // Verify the payment with Paystack. This is the only source of truth for the amount.
    const psResp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" } },
    );
    const psData = await psResp.json();

    if (!psResp.ok || !psData?.status) {
      return json({ success: false, error: "Could not verify the payment with Paystack." }, 502);
    }
    if (psData.data?.status !== "success") {
      return json({
        success: false,
        error: `Payment has not succeeded (status: ${psData.data?.status ?? "unknown"}).`,
      }, 400);
    }

    // Paystack is in kobo; our money is naira.
    const amountPaidNaira = Math.floor(Number(psData.data.amount || 0) / 100);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("commit_box_topup", {
      p_box_id: boxId,
      p_brand_id: brandId,
      p_quantity: quantity,
      p_amount_paid: amountPaidNaira,
    });

    if (error) {
      console.error("commit_box_topup failed:", error.message);
      return json({ success: false, error: error.message }, 500);
    }
    if (!data?.success) {
      // Box locked between pay and commit. Money taken, item not added. Needs a human.
      console.error("TOPUP PAID BUT NOT ADDED", { boxId, brandId, amountPaidNaira, reason: data?.error });
      return json({ ...data, amount_paid: amountPaidNaira }, 409);
    }

    return json({ ...data, amount_paid: amountPaidNaira });
  } catch (err) {
    console.error("topup-box error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
