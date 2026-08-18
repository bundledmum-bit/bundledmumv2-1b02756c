import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-klump-signature, x-klump-webhook-id, x-klump-webhook-attempt",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KLUMP_VERIFY_URL = "https://api.useklump.com/v1/transactions";

// LIVE MODE. Accept only real (is_live=true) transactions; reject test ones so a test
// payment can never mark a real order paid. Set to false only when returning to sandbox.
const EXPECT_LIVE = true;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET" || req.method === "HEAD") return json({ ok: true, service: "klump-webhook" });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const secret = Deno.env.get("KLUMP_SECRET_KEY");
    if (!secret) return json({ error: "KLUMP_SECRET_KEY not configured" }, 500);

    const rawText = await req.text();
    if (!rawText || rawText.trim() === "" || rawText.trim() === "{}") return json({ ok: true, validated: true });

    let body: any;
    try { body = JSON.parse(rawText); }
    catch { return json({ error: "Invalid JSON" }, 400); }

    const eventType: string = body?.event || body?.event_type || "";
    if (!eventType) return json({ ok: true, validated: true });

    const signature = req.headers.get("x-klump-signature") || "";
    const computed = createHmac("sha512", secret).update(JSON.stringify(body)).digest("hex");
    if (computed !== signature) return json({ error: "Invalid signature" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const webhookId = req.headers.get("x-klump-webhook-id") || null;
    const data = body?.data || {};
    const reference: string | null = data?.reference || null;
    const metaOrderId: string | null =
      data?.meta_data?.order_id || data?.meta_data?.orderId || body?.meta_data?.order_id || null;

    if (webhookId) {
      const { data: existing } = await supabase
        .from("klump_webhook_events").select("id").eq("webhook_id", webhookId).maybeSingle();
      if (existing) return json({ received: true, duplicate: true });
    }
    const dedupKey = webhookId || `noid:${eventType}:${reference || metaOrderId || crypto.randomUUID()}`;
    const { error: insErr } = await supabase.from("klump_webhook_events").insert({
      webhook_id: dedupKey, event_type: eventType, payload: body,
    });
    if (insErr && !String(insErr.message || "").includes("duplicate")) {
      return json({ error: "Could not record event", detail: insErr.message }, 500);
    }
    if (insErr) return json({ received: true, duplicate: true });

    if (eventType === "klump.payment.transaction.successful") {
      if (!reference) return json({ received: true, note: "no reference on successful event" });

      const verifyResp = await fetch(`${KLUMP_VERIFY_URL}/${encodeURIComponent(reference)}/verify`, {
        method: "GET",
        headers: { "klump-secret-key": secret, "Content-Type": "application/json" },
      });
      if (!verifyResp.ok) return json({ error: "Klump verify call failed", status: verifyResp.status }, 502);
      const verified = await verifyResp.json();
      const v = verified?.data || verified || {};

      const vStatus = String(v?.status || data?.status || "").toLowerCase();
      const vCurrency = String(v?.currency || data?.currency || "").toUpperCase();
      const vIsLive = (v?.is_live ?? data?.is_live);
      const orderId: string | null =
        v?.meta_data?.order_id || v?.meta_data?.orderId || metaOrderId || null;

      if (vCurrency && vCurrency !== "NGN") return json({ error: "Unexpected currency", currency: vCurrency }, 400);
      if (!["success", "successful", "paid", "completed"].includes(vStatus)) {
        return json({ received: true, note: `verify status not success: ${vStatus}` });
      }
      if (typeof vIsLive === "boolean" && vIsLive !== EXPECT_LIVE) {
        return json({ received: true, note: `is_live ${vIsLive} does not match expected ${EXPECT_LIVE}, ignoring` });
      }
      if (!orderId) {
        return json({ received: true, note: "no meta_data.order_id to match an order" });
      }

      const { data: order } = await supabase
        .from("orders").select("id, order_number, total, payment_status")
        .eq("id", orderId).maybeSingle();
      if (!order) return json({ received: true, note: `no order for id ${orderId}` });

      if (order.payment_status !== "paid") {
        await supabase.from("orders")
          .update({ payment_status: "paid", payment_method: "klump", payment_reference: reference })
          .eq("id", order.id);

        // Record the Klump BNPL commission as a per-order extra cost so it reduces
        // this order's gross profit (Klump pays us the order total minus their %).
        // Configurable and switch-off-able via site_settings. Amounts are naira integers.
        try {
          const { data: cfgRows } = await supabase.from("site_settings")
            .select("key, value")
            .in("key", ["klump_commission_enabled", "klump_commission_percent"]);
          const cfg: Record<string, any> = {};
          for (const r of cfgRows || []) cfg[r.key] = r.value;

          const enabledRaw = cfg["klump_commission_enabled"];
          const commissionEnabled = enabledRaw === true || enabledRaw === "true";
          const pctRaw = String(cfg["klump_commission_percent"] ?? "3").replace(/"/g, "").trim();
          const pct = parseFloat(pctRaw);

          if (commissionEnabled && !isNaN(pct) && pct > 0 && order.total > 0) {
            const feeNaira = Math.round((order.total * pct) / 100);
            if (feeNaira > 0) {
              // Guard against duplicate insertion if the webhook is retried
              const { data: existingFee } = await supabase.from("order_extra_costs")
                .select("id").eq("order_id", order.id).eq("category", "klump_commission")
                .is("deleted_at", null).maybeSingle();
              if (!existingFee) {
                await supabase.from("order_extra_costs").insert({
                  order_id: order.id,
                  amount: feeNaira,
                  description: `Klump BNPL commission (${pct}%)`,
                  category: "klump_commission",
                });
                await supabase.rpc("recompute_order_gross_profit", { p_order_id: order.id });
              }
            }
          }
        } catch (feeErr) { console.error("klump commission record failed (non-fatal):", feeErr); }

        // Emails. Use send-transactional-email, NOT the old send-order-confirmation: that one builds
        // its from-address from site_settings.contact_email (hello@bundledmum.ng), which is NOT a
        // verified Resend sending domain, so Resend rejects it and it 500s every time. A customer who
        // genuinely paid via Klump would have received NOTHING.
        //   order_confirmation      -> the customer
        //   internal_new_paid_order -> the admin
        try {
          const emailUrl = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/send-transactional-email`;
          const emailHeaders = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
          };
          for (const emailType of ["order_confirmation", "internal_new_paid_order"]) {
            fetch(emailUrl, {
              method: "POST",
              headers: emailHeaders,
              body: JSON.stringify({ order_id: order.id, email_type: emailType }),
            }).catch((e) => console.error(`${emailType} email failed:`, e));
          }
        } catch (e) { console.error("confirmation email setup failed:", e); }
      }

      await supabase.from("klump_webhook_events")
        .update({ order_id: order.id, processed_at: new Date().toISOString() }).eq("webhook_id", dedupKey);
      return json({ received: true, order_number: order.order_number, marked_paid: true });
    }

    // NON-SUCCESSFUL events (abandoned, failed, etc).
    // An ABANDONED transaction means the customer reached Klump, picked a lender, and dropped out.
    // That is a warm lead worth a call, so alert the admin. We link the order too, so the event is
    // traceable (previously order_id was left null on these and they were invisible).
    // ADMIN ONLY. The customer receives nothing.
    let abandonedOrderId: string | null = null;
    if (eventType === "klump.payment.transaction.abandoned") {
      // Find the order. meta_data.order_id is the reliable key; merchant_reference (our order number)
      // is the fallback.
      const merchantRef: string | null = data?.merchant_reference || null;
      if (metaOrderId) {
        const { data: o } = await supabase.from("orders")
          .select("id, payment_status").eq("id", metaOrderId).maybeSingle();
        if (o) abandonedOrderId = o.id;
      }
      if (!abandonedOrderId && merchantRef) {
        const { data: o } = await supabase.from("orders")
          .select("id, payment_status").eq("order_number", merchantRef).maybeSingle();
        if (o) abandonedOrderId = o.id;
      }

      if (abandonedOrderId) {
        // Never alert on an order that is already paid (a late/duplicate abandoned event).
        const { data: ord } = await supabase.from("orders")
          .select("payment_status").eq("id", abandonedOrderId).maybeSingle();
        if (ord && ord.payment_status !== "paid") {
          try {
            fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/send-transactional-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
              },
              body: JSON.stringify({
                order_id: abandonedOrderId,
                email_type: "internal_klump_abandoned",
              }),
            }).catch((e) => console.error("klump abandoned alert failed:", e));
          } catch (e) { console.error("klump abandoned alert setup failed:", e); }
        }
      }

      // Store Klump's reference on the order so it can be verified or resent later.
      if (abandonedOrderId && reference) {
        await supabase.from("orders")
          .update({ payment_reference: reference })
          .eq("id", abandonedOrderId)
          .neq("payment_status", "paid")
          .is("payment_reference", null);
      }
    }

    await supabase.from("klump_webhook_events")
      .update({
        order_id: abandonedOrderId,          // link it, instead of leaving null
        processed_at: new Date().toISOString(),
      })
      .eq("webhook_id", dedupKey);
    return json({ received: true, event: eventType, order_linked: !!abandonedOrderId });

  } catch (err) {
    console.error("klump-webhook error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});