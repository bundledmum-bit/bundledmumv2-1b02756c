import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KLUMP_PAGES_URL = "https://api.useklump.com/v1/payment-pages";
const KLUMP_MIN_FIXED_AMOUNT = 25000;

// CUSTOMER-FACING Klump payment resume.
//
// This lets a customer sitting on their own order-confirmation page complete an unpaid Klump
// order, WITHOUT logging in. Because the confirmation page is unauthenticated, ownership is
// proven by the order's SHARE_TOKEN (a secret only the real customer has, delivered in their
// confirmation URL). This is the SAME ownership model as get-order-confirmation.
//
// SECURITY: an attacker who guesses/iterates order_ids still cannot mint a page, because they
// cannot produce the matching share_token. The function refuses on any token mismatch. It also
// refuses on already-paid orders and sub-minimum amounts, and returns ONLY a payment URL (no
// order details). It reuses an existing current page rather than minting on every tap, so it
// cannot be used to spam Klump.
//
// The reference sent to Klump is our order_number (merchant_reference), so the existing hourly
// reconciler automatically marks the order paid once the customer completes payment.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = Deno.env.get("KLUMP_SECRET_KEY");
    if (!secret) return json({ error: "Payment is temporarily unavailable" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const orderId: string | undefined = body?.order_id;
    const shareToken: string | undefined = body?.share_token;

    // BOTH are required. This is the ownership gate.
    if (!orderId || !shareToken) {
      return json({ error: "Missing order reference" }, 400);
    }

    // Load the order and validate the share_token matches THIS order.
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, total, payment_status, share_token")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) return json({ error: "Order not found" }, 404);

    // OWNERSHIP CHECK: constant-ish comparison of the token. Mismatch => refuse.
    if (!order.share_token || order.share_token !== shareToken) {
      return json({ error: "Not authorised" }, 403);
    }

    // Nothing to do if already paid.
    if (order.payment_status === "paid") {
      return json({ error: "This order is already paid", already_paid: true }, 400);
    }

    // Klump has a fixed-amount minimum.
    if (order.total < KLUMP_MIN_FIXED_AMOUNT) {
      return json({ error: "This order cannot be paid with Klump" }, 400);
    }

    // Reuse an existing CURRENT page for the same amount if we have one (do not spam-mint).
    const { data: existingPages } = await supabase
      .from("klump_payment_pages")
      .select("id, page_url, klump_page_id, amount, klump_reference, attempt_number, is_current")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    const currentPage = (existingPages || []).find((p: any) => p.is_current);
    if (currentPage?.page_url && currentPage.amount === order.total) {
      return json({
        page_url: currentPage.page_url,
        order_number: order.order_number,
        amount: currentPage.amount,
        reused: true,
      });
    }

    // Need a fresh page. Build a unique reference (Klump requires global uniqueness).
    const usedRefs = new Set((existingPages || []).map((p: any) => p.klump_reference).filter(Boolean));
    const attemptNumber = ((existingPages || []).reduce(
      (max: number, p: any) => Math.max(max, Number(p.attempt_number) || 1), 0) || 0) + 1;

    let reference = attemptNumber === 1 ? order.order_number : `${order.order_number}-R${attemptNumber}`;
    let salt = 1;
    while (usedRefs.has(reference)) {
      salt++;
      reference = `${order.order_number}-R${attemptNumber}-${salt}`;
    }

    const mint = async (ref: string) => fetch(KLUMP_PAGES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "klump-secret-key": secret },
      body: JSON.stringify({
        name: `BundledMum order ${order.order_number}`,
        description: `Payment for BundledMum order ${order.order_number}`,
        currency: "NGN",
        is_fixed_amount: true,
        fixed_amount: order.total,
        reference: ref,
        is_published: true,
      }),
    });

    let resp = await mint(reference);
    let payload = await resp.json().catch(() => ({}));

    // 409 => reference already exists at Klump; retry once with a timestamped suffix.
    if (resp.status === 409) {
      reference = `${order.order_number}-R${attemptNumber}-${Date.now().toString().slice(-6)}`;
      resp = await mint(reference);
      payload = await resp.json().catch(() => ({}));
    }

    if (!resp.ok) {
      console.error("[klump-resume-payment] Klump page creation failed:", resp.status, JSON.stringify(payload));
      return json({ error: "Could not start Klump payment. Please try again or contact us." }, 502);
    }

    const d = payload?.data || {};
    const pageUrl: string | null =
      payload?.link || payload?.url || payload?.page_url ||
      d.link || d.url || d.page_url || d.payment_page_url || d.checkout_url || null;
    const pageId: string | null = payload?.id || d.id || d.page_id || null;

    if (!pageUrl) {
      console.error("[klump-resume-payment] no page URL:", JSON.stringify(payload));
      return json({ error: "Could not start Klump payment. Please try again or contact us." }, 502);
    }

    // Retire the old current page, then store the new one (unique index enforces one current page).
    if (currentPage?.id) {
      await supabase.from("klump_payment_pages")
        .update({ is_current: false, superseded_at: new Date().toISOString() })
        .eq("id", currentPage.id);
    }

    const { error: insErr } = await supabase.from("klump_payment_pages").insert({
      order_id: order.id,
      order_number: order.order_number,
      klump_reference: reference,
      klump_page_id: pageId,
      page_url: pageUrl,
      amount: order.total,
      is_published: true,
      is_current: true,
      attempt_number: attemptNumber,
      created_by: null, // customer-initiated, no admin
    });
    if (insErr) console.error("[klump-resume-payment] store page failed (non-fatal):", insErr.message);

    // Ensure the order is tagged klump so the reconciler picks it up.
    await supabase.from("orders")
      .update({ payment_method: "klump" })
      .eq("id", order.id)
      .neq("payment_status", "paid");

    return json({
      page_url: pageUrl,
      order_number: order.order_number,
      amount: order.total,
      reused: false,
    });
  } catch (err) {
    console.error("[klump-resume-payment] error:", err);
    return json({ error: "Payment is temporarily unavailable" }, 500);
  }
});
