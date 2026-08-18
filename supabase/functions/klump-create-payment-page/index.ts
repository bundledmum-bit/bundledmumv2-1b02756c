import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KLUMP_PAGES_URL = "https://api.useklump.com/v1/payment-pages";
const KLUMP_MIN_FIXED_AMOUNT = 25000; // Klump's documented minimum for a fixed-amount page

// Creates a Klump Access payment page for an existing order, so an admin can send the customer a
// BNPL link over WhatsApp when the on-site widget fails (lender decline, ad-blocker, network,
// Klump outage).
//
// THE WHOLE POINT: we send `reference` = OUR ORDER NUMBER. Klump stores that as merchant_reference
// and returns it on transactions, webhooks and /verify. Our existing hourly reconciler already looks
// orders up by merchant_reference, so a payment made through this page will be picked up and the
// order marked paid AUTOMATICALLY. No manual dashboard-watching.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = Deno.env.get("KLUMP_SECRET_KEY");
    if (!secret) return json({ error: "KLUMP_SECRET_KEY not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Admin auth: this must never be callable by a customer, or anyone could mint payment pages.
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "Not authorised" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: perm, error: permErr } = await userClient
      .rpc("has_admin_permission", { p_section: "orders", p_action: "edit" });
    if (permErr || perm !== true) return json({ error: "Not authorised" }, 403);

    const body = await req.json();
    const orderId: string | undefined = body?.order_id;
    if (!orderId) return json({ error: "order_id is required" }, 400);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, total, payment_status, customer_name")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr || !order) return json({ error: "Order not found" }, 404);
    if (order.payment_status === "paid") {
      return json({ error: "This order is already paid" }, 400);
    }
    if (order.total < KLUMP_MIN_FIXED_AMOUNT) {
      return json({
        error: `Klump requires at least ${KLUMP_MIN_FIXED_AMOUNT} naira for a fixed-amount page. This order is ${order.total}.`,
      }, 400);
    }

    // RETRY IS THE WHOLE POINT OF THIS BLOCK.
    //
    // A Klump payment page carries ONE fixed merchant_reference, and Klump only ever allows ONE
    // transaction per reference. So once a customer's first attempt creates a transaction, that
    // reference is BURNT. If they made a mistake, got declined by a lender, or lost connection, their
    // retry on the SAME link dies with:
    //     "Merchant reference must be unique for transaction."
    // and they can never pay us. BNPL applications fail first time constantly, so without a retry
    // path we lose the sale outright.
    //
    // So: retry=true supersedes the current page and mints a FRESH one with a FRESH reference.
    // Every reference we ever issued is stored, and klump_order_references() returns all of them, so
    // the reconciler still finds whichever attempt the customer eventually completes.
    const isRetry = body?.retry === true;

    const { data: existingPages } = await supabase
      .from("klump_payment_pages")
      .select("id, page_url, klump_page_id, amount, klump_reference, attempt_number, is_current")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    const currentPage = (existingPages || []).find((p: any) => p.is_current);

    // Not a retry, and a current page already exists for this exact amount? Reuse it.
    if (!isRetry && currentPage?.page_url && currentPage.amount === order.total) {
      return json({
        page_url: currentPage.page_url,
        klump_page_id: currentPage.klump_page_id,
        order_number: order.order_number,
        amount: currentPage.amount,
        attempt_number: currentPage.attempt_number,
        reused: true,
      });
    }

    // Minting a new page: first attempt, a retry, or the order total changed.
    // Klump requires a globally unique reference, so a retry can never reuse the bare order_number.
    const usedRefs = new Set((existingPages || []).map((p: any) => p.klump_reference).filter(Boolean));
    const attemptNumber = ((existingPages || []).reduce(
      (max: number, p: any) => Math.max(max, Number(p.attempt_number) || 1), 0) || 0) + 1;

    let reference = attemptNumber === 1
      ? order.order_number
      : `${order.order_number}-R${attemptNumber}`;
    let salt = 1;
    while (usedRefs.has(reference)) {
      salt++;
      reference = `${order.order_number}-R${attemptNumber}-${salt}`;
    }

    // reference = OUR order number. This is what makes the reconciler work on these payments.
    const resp = await fetch(KLUMP_PAGES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "klump-secret-key": secret },
      body: JSON.stringify({
        name: `BundledMum order ${order.order_number}`,
        description: `Payment for BundledMum order ${order.order_number}`,
        currency: "NGN",
        is_fixed_amount: true,
        fixed_amount: order.total,
        reference: reference,   // <- merchant_reference. Unique per page (Klump 409s on reuse).
        is_published: true,
      }),
    });

    let payload = await resp.json().catch(() => ({}));
    let finalResp = resp;

    // 409 = the reference already exists at Klump (e.g. an earlier attempt succeeded on their side
    // even though it failed on ours). Retry ONCE with a timestamped reference so the admin is not
    // stuck. We still store what we sent, so the reconciler can find it.
    if (resp.status === 409) {
      console.warn(`Klump 409 on reference ${reference}, retrying with a unique suffix`);
      reference = `${order.order_number}-R${attemptNumber}-${Date.now().toString().slice(-6)}`;
      finalResp = await fetch(KLUMP_PAGES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "klump-secret-key": secret },
        body: JSON.stringify({
          name: `BundledMum order ${order.order_number}`,
          description: `Payment for BundledMum order ${order.order_number}`,
          currency: "NGN",
          is_fixed_amount: true,
          fixed_amount: order.total,
          reference: reference,
          is_published: true,
        }),
      });
      payload = await finalResp.json().catch(() => ({}));
    }

    if (!finalResp.ok) {
      console.error("Klump page creation failed:", finalResp.status, JSON.stringify(payload));
      return json({
        error: "Klump rejected the payment page request",
        status: finalResp.status,
        detail: payload?.message || payload?.error || null,
      }, 502);
    }

    // The payment-pages endpoint returns the URL as `link` at the TOP LEVEL, with NO `data`
    // wrapper (unlike /transactions/verify, which does nest under `data`). Verified from a real
    // response: {"link":"https://pay.useklump.com/pay/4a62cb13-..."}
    // We check the top level first, then fall back to a nested `data` object in case Klump changes it.
    const d = payload?.data || {};
    const pageUrl: string | null =
      payload?.link || payload?.url || payload?.page_url ||
      d.link || d.url || d.page_url || d.payment_page_url || d.checkout_url || null;
    const pageId: string | null = payload?.id || d.id || d.page_id || null;

    if (!pageUrl) {
      console.error("Klump returned no page URL:", JSON.stringify(payload));
      return json({ error: "Klump did not return a page URL", raw: payload }, 502);
    }

    let adminId: string | null = null;
    try {
      const { data: userRes } = await userClient.auth.getUser();
      if (userRes?.user?.id) {
        const { data: adminRow } = await supabase
          .from("admin_users").select("id").eq("auth_user_id", userRes.user.id).maybeSingle();
        adminId = adminRow?.id ?? null;
      }
    } catch { /* non-fatal */ }

    // Retire the old page BEFORE inserting the new one: a unique index enforces one current page per
    // order, so the admin can never accidentally send two live links.
    if (currentPage?.id) {
      await supabase.from("klump_payment_pages")
        .update({ is_current: false, superseded_at: new Date().toISOString() })
        .eq("id", currentPage.id);
    }

    const { error: insErr } = await supabase.from("klump_payment_pages").insert({
      order_id: order.id,
      order_number: order.order_number,
      klump_reference: reference,   // EXACTLY what we sent Klump. The reconciler needs this.
      klump_page_id: pageId,
      page_url: pageUrl,
      amount: order.total,
      is_published: true,
      is_current: true,
      attempt_number: attemptNumber,
      created_by: adminId,
    });
    if (insErr) console.error("Could not store klump payment page (non-fatal):", insErr.message);

    // Mark the order as Klump so the hourly reconciler picks it up and verifies it against Klump
    // using order_number as the merchant_reference. This is what closes the loop automatically.
    await supabase.from("orders")
      .update({ payment_method: "klump" })
      .eq("id", order.id)
      .neq("payment_status", "paid");

    return json({
      page_url: pageUrl,
      klump_page_id: pageId,
      order_number: order.order_number,
      amount: order.total,
      attempt_number: attemptNumber,
      klump_reference: reference,
      reused: false,
    });
  } catch (err) {
    console.error("klump-create-payment-page error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});