import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KLUMP_VERIFY_URL = "https://api.useklump.com/v1/transactions";

// Must match klump-webhook. Only real (is_live=true) transactions may mark a real order paid.
const EXPECT_LIVE = true;

// SAFETY NET for Klump BNPL orders.
//
// Klump's widget only exposes their transaction reference in onSuccess, AFTER payment completes.
// If a customer pays but their browser dies before onSuccess fires, we never capture that reference.
// Klump have confirmed that OUR merchant_reference (the order_number we generate, e.g. BM-20260713-005)
// works on both /verify and /resend-webhook. So we look transactions up by OUR OWN identifier, which we
// always hold. The customer's browser is now irrelevant to reconciliation.
//
// This job NEVER marks an order paid on its own authority. Klump's verify endpoint is the only
// source of truth.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = Deno.env.get("KLUMP_SECRET_KEY");
    if (!secret) return json({ error: "KLUMP_SECRET_KEY not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let olderThanMinutes = 30;
    let onlyOrderId: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.older_than_minutes === "number") olderThanMinutes = body.older_than_minutes;
      if (typeof body?.order_id === "string") onlyOrderId = body.order_id;
    } catch { /* no body: use defaults */ }

    const { data: candidates, error: candErr } = await supabase
      .rpc("klump_orders_to_reconcile", { p_older_than_minutes: onlyOrderId ? 0 : olderThanMinutes });
    if (candErr) return json({ error: "Could not load candidates", detail: candErr.message }, 500);

    const orders = (candidates || []).filter((o: any) => !onlyOrderId || o.order_id === onlyOrderId);

    const results: any[] = [];
    let markedPaid = 0;

    for (const o of orders) {
      // An order may be known to Klump by SEVERAL references:
      //   - the reference captured from an on-site widget payment (orders.payment_reference)
      //   - any payment-page reference we minted (Klump 409s on a duplicate, so a retry gets a
      //     suffixed reference like BM-20260713-006-2, which we store)
      //   - the plain order_number, sent as merchant_reference by the widget
      // klump_order_references() returns all of them. We try each until Klump recognises one.
      const refs: string[] = Array.isArray(o.all_references) && o.all_references.length
        ? o.all_references
        : [o.payment_reference || o.order_number];

      try {
        let resp: Response | null = null;
        let lookupRef = "";
        for (const candidate of refs) {
          const r = await fetch(`${KLUMP_VERIFY_URL}/${encodeURIComponent(candidate)}/verify`, {
            method: "GET",
            headers: { "klump-secret-key": secret, "Content-Type": "application/json" },
          });
          if (r.ok) { resp = r; lookupRef = candidate; break; }
          // remember the last response so we can report a non-404 failure
          if (!resp || r.status !== 404) { resp = r; lookupRef = candidate; }
        }

        if (!resp || !resp.ok) {
          // 404 on every reference simply means Klump has no transaction for this order: the
          // customer never opened or completed it. Normal, not an error.
          results.push({
            order_number: o.order_number,
            tried: refs,
            outcome: resp?.status === 404 ? "no_transaction_at_klump" : "verify_failed",
            status: resp?.status ?? 0,
          });
          continue;
        }

        const verified = await resp.json();
        const v = verified?.data || {};
        const vStatus = String(v?.status || "").toLowerCase();
        const vCurrency = String(v?.currency || "").toUpperCase();
        const vIsLive = v?.is_live;
        const klumpRef = v?.reference || null;

        // Same guards as the webhook. A test transaction must never mark a real order paid.
        if (vCurrency && vCurrency !== "NGN") {
          results.push({ order_number: o.order_number, outcome: "wrong_currency", currency: vCurrency });
          continue;
        }
        if (typeof vIsLive === "boolean" && vIsLive !== EXPECT_LIVE) {
          results.push({ order_number: o.order_number, outcome: "not_live", is_live: vIsLive });
          continue;
        }

        // Whatever Klump says, store their reference if we now have it. It makes future
        // lookups and any manual /resend-webhook easier.
        if (klumpRef && !o.payment_reference) {
          await supabase.from("orders")
            .update({ payment_reference: klumpRef })
            .eq("id", o.order_id);
        }

        if (!["success", "successful", "paid", "completed"].includes(vStatus)) {
          // abandoned / pending / failed. Leave the order alone. This is the normal case.
          results.push({
            order_number: o.order_number,
            outcome: "not_paid",
            klump_status: vStatus,
            klump_reference: klumpRef,
          });
          continue;
        }

        // Klump says this one IS paid, but our webhook never told us. Fix it.
        const { data: order } = await supabase
          .from("orders").select("id, order_number, total, payment_status")
          .eq("id", o.order_id).maybeSingle();
        if (!order || order.payment_status === "paid") {
          results.push({ order_number: o.order_number, outcome: "already_paid" });
          continue;
        }

        await supabase.from("orders")
          .update({
            payment_status: "paid",
            payment_method: "klump",
            payment_reference: klumpRef || lookupRef,
          })
          .eq("id", order.id);

        // Klump BNPL commission, identical to the webhook path so a reconciled order's gross
        // profit matches a webhook-confirmed one exactly.
        try {
          const { data: cfgRows } = await supabase.from("site_settings")
            .select("key, value").in("key", ["klump_commission_enabled", "klump_commission_percent"]);
          const cfg: Record<string, any> = {};
          for (const r of cfgRows || []) cfg[r.key] = r.value;

          const enabledRaw = cfg["klump_commission_enabled"];
          const commissionEnabled = enabledRaw === true || enabledRaw === "true";
          const pct = parseFloat(String(cfg["klump_commission_percent"] ?? "3").replace(/"/g, "").trim());

          if (commissionEnabled && !isNaN(pct) && pct > 0 && order.total > 0) {
            const feeNaira = Math.round((order.total * pct) / 100);
            if (feeNaira > 0) {
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
        } catch (feeErr) {
          console.error("klump commission record failed (non-fatal):", feeErr);
        }

        // Confirmation email, same as the webhook path.
        try {
          fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/send-order-confirmation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
            },
            body: JSON.stringify({ order_id: order.id }),
          }).catch((e) => console.error("confirmation email trigger failed:", e));
        } catch (e) {
          console.error("confirmation email setup failed:", e);
        }

        markedPaid++;
        results.push({
          order_number: order.order_number,
          outcome: "MARKED_PAID_BY_RECONCILER",
          klump_reference: klumpRef,
          amount: order.total,
        });
      } catch (e) {
        results.push({
          order_number: o.order_number,
          outcome: "error",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return json({ checked: orders.length, marked_paid: markedPaid, results });
  } catch (err) {
    console.error("klump-reconcile error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});