import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const { campaign_id, endpoint, event_type } = body;

    if (!campaign_id || !event_type) return json({ error: "campaign_id and event_type required" }, 400);
    if (event_type !== "delivered" && event_type !== "clicked") return json({ error: "invalid event_type" }, 400);

    // Insert the event; ignore duplicates (unique index on campaign+endpoint+type).
    const { error: insErr } = await supabase.from("push_events")
      .insert({ campaign_id, endpoint: endpoint || null, event_type });

    // If it's a duplicate, don't double-count; only bump the campaign counter on a fresh insert.
    if (insErr) {
      // 23505 = unique violation (already recorded) -> no-op success
      if ((insErr as any).code === "23505") return json({ success: true, duplicate: true });
      return json({ error: insErr.message }, 500);
    }

    // Bump the matching counter on the campaign.
    const col = event_type === "delivered" ? "delivered_count" : "opened_count";
    // Use an atomic increment via RPC-less update: read then write is racy, so use a SQL increment.
    await supabase.rpc("increment_push_campaign_counter", { p_campaign_id: campaign_id, p_column: col }).then(
      () => {},
      async () => {
        // Fallback if RPC not present: best-effort non-atomic increment.
        const { data: c } = await supabase.from("push_campaigns").select(col).eq("id", campaign_id).maybeSingle();
        const cur = (c as any)?.[col] ?? 0;
        await supabase.from("push_campaigns").update({ [col]: cur + 1 }).eq("id", campaign_id);
      },
    );

    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
