// admin-upload-article-image — RETIRED 2026-07-27
//
// This was a one-shot helper for uploading article images. Its own header
// said it was safe to delete once those uploads were done. They are: the
// article-images bucket holds 18 objects and is public, so nothing here is
// needed to serve them.
//
// It carried a secret hardcoded in the source rather than an environment
// variable, which is why it has been neutered rather than left running.
// That secret is now removed and is no longer valid for anything.
//
// If article uploads are needed again, use admin-storage-upload, which does
// the same job gated on PUSH_INTERNAL_SECRET.
//
// This stub can be deleted outright from the Supabase dashboard.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-upload-secret",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      error: "This function has been retired. Use admin-storage-upload instead.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
