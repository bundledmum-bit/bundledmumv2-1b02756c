// DEPRECATED 2026-07-28: old recurring-card auto-charge subscription model,
// superseded by the box subscription model (activate-subscription edge function).
// Neutered in place rather than deleted so deploy history and logs are
// preserved; safe to delete for real in the Supabase dashboard whenever convenient.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: "This endpoint is deprecated. The recurring-card subscription model is no longer in use." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
