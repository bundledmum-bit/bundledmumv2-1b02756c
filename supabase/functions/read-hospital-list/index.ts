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
 * READ A HOSPITAL LIST PHOTO **AND** MATCH IT TO OUR CATALOGUE, IN ONE API CALL.
 *
 * Why one call: we already pay to read the image, and the image is the expensive part. Adding the
 * 121-product catalogue to that same prompt costs almost nothing extra, so the model can both
 * transcribe AND understand meaning: "salt bath for stitches" -> Sitz Bath, "underarm thermometer"
 * -> Digital Thermometer. Pure-text pastes stay on the free SQL alias matcher and make NO API call.
 *
 * SAFETY RAILS:
 *  - The model may ONLY choose product IDs we send it, and we re-check every id against the catalogue
 *    before using it. It cannot invent a product.
 *  - It must return null for anything it cannot confidently place. A clean miss beats a wrong guess.
 *  - It never sets prices. We price server-side from our own brands table after it picks a product.
 *  - Every line carries a confidence so the UI can flag it. Nothing is auto-added to a quote.
 *
 * PRIVACY: the image is never stored. It is passed through and discarded.
 * ADMIN ONLY: verified against the DB, never trusted from the client.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ success: false, error: "Not authorised" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin");
    if (adminErr || !isAdmin) return json({ success: false, error: "Not authorised" }, 403);

    const body = await req.json();
    const imageBase64 = body?.image_base64 as string | undefined;
    const mediaType = (body?.media_type as string | undefined) || "image/jpeg";
    const rawText = body?.raw_text as string | undefined;

    if (!imageBase64 && !rawText) {
      return json({ success: false, error: "image_base64 or raw_text is required" }, 400);
    }

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (imageBase64 && !allowed.includes(mediaType)) {
      return json({ success: false, error: `Unsupported image type: ${mediaType}` }, 400);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 500);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: catalogue, error: catErr } = await admin.rpc("hospital_list_catalogue");
    if (catErr || !catalogue?.length) {
      console.error("catalogue load failed:", catErr?.message);
      return json({ success: false, error: "Could not load the product catalogue." }, 500);
    }

    const catalogueText = (catalogue as any[])
      .map((c) => `${c.product_id} | ${c.product_name}`)
      .join("\n");

    const instructions = [
      "You are helping a Nigerian maternity retailer turn a customer's hospital shopping list into a quote.",
      "",
      imageBase64
        ? "STEP 1: Transcribe the attached photo of the customer's handwritten list, one item per line."
        : "STEP 1: Use the list text provided below, one item per line.",
      "STEP 2: For EACH line, choose the single best matching product from the CATALOGUE below.",
      "",
      "CATALOGUE (product_id | product_name). You may ONLY choose a product_id from this list:",
      catalogueText,
      "",
      "MATCHING RULES:",
      "- Understand meaning, not just words. Examples: 'salt bath for stitches' and '2 packets of table",
      "  salt with a bowl' both mean a Sitz Bath. 'Underarm thermometer' and 'rectal thermometer' both",
      "  mean the thermometer we stock. 'Treated mosquito bed net' means the mosquito net. 'Buba and",
      "  wrapper' means the labour wrappers. 'Pampers' is how Nigerians commonly say nappies/diapers.",
      "- Respect size and stage words: 'newborn', 'size 2', '0-6 months' should steer which product you pick.",
      "- If the customer names a brand (Pampers, Dettol, Huggies, Molfix), put it in brand_hint so we can",
      "  honour it. Do NOT switch to a different product just to suit a brand.",
      "- Capture any quantity she wrote into 'quantity' as a whole number. Default to 1 if none is given.",
      "- If you cannot confidently place a line, set product_id to null. NEVER guess. A missed line is",
      "  fine; a wrong product on a customer's quote is not.",
      "- Ignore section headings, page numbers, and anything that is not a purchasable item.",
      "- Never invent items that are not on the customer's list.",
      "",
      "CONFIDENCE: 'high' when the meaning is unambiguous; 'medium' when you inferred intent (a",
      "description rather than a product name); 'low' when unsure but making a reasonable guess.",
      "",
      "Return ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:",
      '{"items":[{"raw_line":"...","quantity":1,"product_id":"uuid-or-null","brand_hint":"or null","confidence":"high|medium|low"}]}',
    ].join("\n");

    const content: any[] = [];
    if (imageBase64) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: imageBase64 },
      });
    }
    content.push({
      type: "text",
      text: rawText ? `${instructions}\n\nLIST TEXT:\n${rawText}` : instructions,
    });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        messages: [{ role: "user", content }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic API error:", resp.status, errText);
      return json({ success: false, error: "Could not read the list." }, 502);
    }

    const data = await resp.json();
    const modelText = (data?.content || [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(modelText.replace(/^```json\s*|\s*```$/g, "").trim());
    } catch {
      console.error("Could not parse model output:", modelText.slice(0, 500));
      return json({ success: false, error: "Could not understand the list. Please try again." }, 422);
    }

    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    if (!items.length) {
      return json({ success: false, error: "No items could be read from that list." }, 422);
    }

    // Hard guard against a hallucinated id: only ids genuinely in our catalogue are accepted.
    const validIds = new Set((catalogue as any[]).map((c) => c.product_id));

    const results: any[] = [];
    for (const it of items) {
      const rawLine = String(it?.raw_line ?? "").trim();
      if (!rawLine) continue;
      const qty = Math.max(1, parseInt(String(it?.quantity ?? 1), 10) || 1);
      const pid = it?.product_id && validIds.has(it.product_id) ? it.product_id : null;

      let resolved: any = null;
      if (pid) {
        const { data: r } = await admin.rpc("resolve_product_for_list", {
          p_product_id: pid,
          p_raw_term: [rawLine, it?.brand_hint].filter(Boolean).join(" "),
        });
        resolved = Array.isArray(r) ? r[0] : r;
      }

      results.push({
        raw_line: rawLine,
        quantity: qty,
        matched: !!resolved,
        product_id: resolved?.product_id ?? null,
        product_name: resolved?.product_name ?? null,
        brand_id: resolved?.brand_id ?? null,
        brand_name: resolved?.brand_name ?? null,
        price: resolved?.price ?? null,
        section: resolved?.section ?? null,
        image_url: resolved?.image_url ?? null,
        confidence: resolved ? (it?.confidence ?? "medium") : "none",
      });
    }

    const matchedCount = results.filter((r) => r.matched).length;

    return json({
      success: true,
      items: results,
      line_count: results.length,
      matched_count: matchedCount,
      unmatched_count: results.length - matchedCount,
      text: results.map((r) => r.raw_line).join("\n"),
    });
  } catch (err) {
    console.error("read-hospital-list error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
