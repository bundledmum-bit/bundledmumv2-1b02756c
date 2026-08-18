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
 * PROCESS QUEUED PRODUCT-IMAGE IMPROVEMENTS VIA GEMINI.
 *
 * Takes queued jobs, sends each product photo to Gemini asking for a clean white-background studio
 * version, stores the result in the `product-images` bucket under improved/, and marks the job
 * 'ready'. It NEVER touches the live catalogue: an admin applies the result separately, after
 * comparing it with the original.
 *
 * WHY REVIEW IS NOT OPTIONAL
 * Gemini regenerates the image rather than masking it, so packaging text can come back altered.
 * A real example from testing: a Momeasy box returned with its top heading printed upside down.
 * The prompt below pushes hard on preserving the product exactly, but it cannot guarantee it, so
 * every result lands in a review queue and branded items are flagged for closer checking.
 *
 * Call with { limit: n } to process a batch. Designed to be run repeatedly (manually or by cron)
 * rather than trying to do the whole catalogue in one request.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ success: false, error: "GEMINI_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(20, Math.max(1, Number(body?.limit ?? 5)));

    // Model choice: Nano Banana 2 via the standard endpoint. Batch pricing halves this cost but
    // needs the Batch API; for interactive admin use, standard is the right trade.
    const model = (body?.model as string) || "gemini-3.1-flash-image";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: jobs, error: claimErr } = await supabase.rpc("claim_image_jobs", {
      p_limit: limit,
    });
    if (claimErr) {
      console.error("claim failed:", claimErr.message);
      return json({ success: false, error: claimErr.message }, 500);
    }
    if (!jobs || jobs.length === 0) {
      return json({ success: true, processed: 0, message: "No queued jobs." });
    }

    // The prompt differs by risk class. Soft goods can lose overlays/watermarks safely because their
    // appearance is fabric, shape and colour. Packaged goods carry label text a customer may rely on,
    // so nothing on the label may be altered or removed.
    const studio = [
      "Re-photograph this exact product as a professional e-commerce studio image.",
      "",
      "BACKGROUND - use these EXACT settings on every image so the whole catalogue matches:",
      "- A seamless white studio sweep (cyclorama): the backdrop curves smoothly from the vertical",
      "  wall into the horizontal surface with no visible corner, edge, horizon line or seam.",
      "- Backdrop colour: clean neutral white, subtly brighter directly behind the product and falling",
      "  off very gently towards the corners. No colour cast, no texture, no pattern, no fabric folds,",
      "  no visible curtain pleats, no vignette.",
      "- The product sits ON the surface with a soft, diffuse contact shadow directly beneath it,",
      "  falling slightly forward and to the right, with soft edges. No hard or double shadows.",
      "",
      "LIGHTING - identical on every image:",
      "- Large soft key light from the upper left, gentle fill from the right, so the product is evenly",
      "  lit with soft graduated highlights and no blown-out areas or harsh speculars.",
      "- Neutral white balance. Do not tint the image warm or cool.",
      "",
      "FRAMING - identical on every image:",
      "- Square 1:1 composition, product centred both horizontally and vertically.",
      "- The product occupies about 80 percent of the frame height, leaving even margins on all sides.",
      "- Straight-on eye-level camera angle, product upright, sharp focus throughout.",
      "",
      "THE PRODUCT ITSELF MUST NOT CHANGE:",
      "- Same shape, colour, materials, proportions and construction, from the same angle.",
      "- Do not add, remove or rearrange any item. If two garments are shown, show two garments.",
      "- Do not add props, decoration, or any text of your own.",
    ];

    const softRules = [
      "",
      "REMOVE ONLY OVERLAYS:",
      "- Remove marketing text, price badges, seller watermarks and logos that have been overlaid ON TOP",
      "  of the photograph (for example a watermark across the image, or a promotional banner).",
      "- Do NOT remove or alter anything printed on the product itself, such as a brand tag or a logo",
      "  woven into the garment.",
    ];

    const packagedRules = [
      "",
      "CRITICAL - THIS IS PACKAGED PRODUCT WITH PRINTED LABELS:",
      "- Reproduce EVERY piece of text exactly as it appears: brand name, product name, ingredients,",
      "  directions, warnings, volume, barcode. Same wording, same spelling, same orientation, same",
      "  position, same size relationship.",
      "- Do NOT remove, translate, restyle, re-letter, rotate or invent any text. Never replace text",
      "  with text-like shapes.",
      "- If you cannot reproduce the label with complete accuracy, return the product exactly as it is",
      "  rather than approximating it. A customer relies on this label for ingredients and safety.",
      "- Only a seller watermark overlaid across the photograph may be removed, and only if the",
      "  packaging beneath it is fully visible and can be reproduced faithfully.",
    ];

    // Prompt is built PER JOB, since it branches on that job's risk class.
    const buildPrompt = (riskClass: string) =>
      [...studio, ...(riskClass === "packaged" ? packagedRules : softRules)].join("\n");

    const results: any[] = [];

    for (const job of jobs as any[]) {
      try {
        const prompt = buildPrompt(job.risk_class);
        // Fetch the original image and inline it for the model.
        const imgResp = await fetch(job.original_url);
        if (!imgResp.ok) throw new Error(`Could not fetch original (${imgResp.status})`);
        const bytes = new Uint8Array(await imgResp.arrayBuffer());
        const mime = imgResp.headers.get("content-type") || "image/jpeg";

        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);

        const gemResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inline_data: { mime_type: mime, data: b64 } },
                  { text: prompt },
                ],
              }],
              // Low temperature: we want the SAME studio interpretation every time, not creative
              // variety. Consistency across the catalogue matters more than novelty per image.
              generationConfig: { temperature: 0.15 },
            }),
          },
        );

        if (!gemResp.ok) {
          throw new Error(`Gemini ${gemResp.status}: ${(await gemResp.text()).slice(0, 200)}`);
        }

        const gem = await gemResp.json();
        const parts = gem?.candidates?.[0]?.content?.parts ?? [];
        const imagePart = parts.find((p: any) => p?.inline_data?.data || p?.inlineData?.data);
        const outB64 = imagePart?.inline_data?.data ?? imagePart?.inlineData?.data;

        if (!outB64) throw new Error("Gemini returned no image");

        // Store under improved/ so originals are never overwritten.
        const raw = Uint8Array.from(atob(outB64), (c) => c.charCodeAt(0));
        const path = `improved/${job.job_id}.png`;
        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(path, raw, { contentType: "image/png", upsert: true });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

        const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);

        await supabase.rpc("complete_image_job", {
          p_job_id: job.job_id,
          p_improved_url: pub.publicUrl,
        });

        results.push({ job_id: job.job_id, brand: job.brand_name, risk: job.risk_class, status: "ready" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error(`job ${job.job_id} failed:`, msg);
        await supabase.rpc("complete_image_job", { p_job_id: job.job_id, p_error: msg });
        results.push({ job_id: job.job_id, brand: job.brand_name, status: "failed", error: msg });
      }
    }

    const ready = results.filter((r) => r.status === "ready").length;
    return json({
      success: true,
      processed: results.length,
      ready,
      failed: results.length - ready,
      results,
      note: "Results are awaiting review. Nothing has been applied to the live catalogue.",
    });
  } catch (err) {
    console.error("process-image-improvements error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});
