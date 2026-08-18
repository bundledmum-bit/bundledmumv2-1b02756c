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
 * SEND THE 48h "ADD TO YOUR BOX" REMINDERS.
 *
 * Called by cron (hourly is fine; boxes_due_for_topup_email only returns boxes whose delivery is
 * exactly 2 days out AND not yet emailed, and each send is marked, so no box is emailed twice).
 *
 * For each due box it sends box_topup_reminder via send-transactional-email, with a tokenised link
 * the customer can open without logging in, then marks the box emailed.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Which boxes need the 48h email?
    const { data: boxes, error } = await supabase.rpc("boxes_due_for_topup_email");
    if (error) {
      console.error("boxes_due_for_topup_email failed:", error.message);
      return json({ success: false, error: error.message }, 500);
    }
    if (!boxes || boxes.length === 0) {
      return json({ success: true, sent: 0, message: "No boxes due for a top-up email." });
    }

    // Box image (from site_settings, same source the website and confirmation email use).
    const { data: setting } = await supabase
      .from("site_settings").select("value").eq("key", "subscription_box_image_url").maybeSingle();
    const boxImageUrl = setting?.value
      ? String(setting.value).replace(/^"|"$/g, "")
      : "https://bundledmum.com/images/BM-LOGO-CORAL.png";

    let sent = 0;
    const failures: string[] = [];

    for (const b of boxes as any[]) {
      try {
        const deliveryDate = new Date(b.scheduled_date).toLocaleDateString("en-NG", {
          weekday: "long", day: "numeric", month: "long",
        });
        // Tokenised link, openable without login. The frontend resolves this route to the box editor.
        const boxLink =
          `https://bundledmum.com/subscription/box/${b.box_id}?token=${b.guest_token}`;

        const { error: sendErr } = await supabase.functions.invoke("send-transactional-email", {
          body: {
            email_type: "box_topup_reminder",
            to: b.customer_email,
            variables: {
              first_name: (b.customer_name || "there").split(" ")[0],
              box_number: b.box_number,
              delivery_date: deliveryDate,
              box_link: boxLink,
              box_image_url: boxImageUrl,
            },
          },
        });

        if (sendErr) {
          failures.push(`${b.box_id}: ${sendErr.message}`);
          continue;
        }

        // Mark emailed so this box is never sent twice.
        await supabase.rpc("mark_box_topup_emailed", { p_box_id: b.box_id });
        sent++;
      } catch (e) {
        failures.push(`${b.box_id}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    return json({ success: true, sent, failed: failures.length, failures });
  } catch (err) {
    console.error("send-box-topup-reminders error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
