import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const validCategories = ["baby", "both", "mum", "push-gift"];
const validPriorities = ["essential", "recommended", "nice-to-have"];
const validTiers = ["starter", "standard", "premium"];
const validReorderDays = [21, 30, 45];

const APPAREL_SUBCATS = ["baby-clothing", "maternity-clothing"];
const MAYBE_APPAREL_SUBCATS = ["maternity-postpartum"];

// Standing markup: 39% on cost, ROUNDED UP to the next 25 naira.
//
// BUG THIS FIXES: this used to round to the NEAREST 25, which can round DOWN and land BELOW the
// 39% floor. The DB trigger trg_enforce_min_markup_floor then rejects the whole insert.
//   cost 12,000 -> 39% = 16,680 -> round-to-nearest gives 16,675 -> REJECTED (5 naira short)
//   cost  8,000 -> 39% = 11,120 -> round-to-nearest gives 11,125 -> fine
// Rounding UP always clears the floor, so use floorPrice() everywhere a price is derived from cost.
const MARKUP = 1.39;

// The lowest price for this cost that the DB will accept. Always a multiple of 25, always >= 39%.
function floorPrice(cost: number): number {
  const c = Math.max(0, Math.round(Number(cost) || 0));
  if (c <= 0) return 0;
  return Math.ceil((c * MARKUP) / 25) * 25;
}

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stripEmDashes(s: string): string {
  return (s || "").replace(/—/g, ", ").replace(/\s*,\s*,/g, ",");
}

function stripBrandFromProductDesc(desc: string, brand: string): string {
  let out = desc || "";
  const b = (brand || "").trim();
  if (b && b.length > 1 && !/generic|tbd|unbranded|assorted|n\/?a/i.test(b)) {
    const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${esc}('?s)?\\s*`, "gi"), "");
    out = out.replace(/^The\s+/i, "").replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").trim();
  }
  return out;
}

function extractJson(text: string): any {
  const raw = (text || "").trim();
  try { return JSON.parse(raw); } catch (_) { /* fall through */ }
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch (_) { /* fall through */ }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return JSON.parse(cleaned.slice(first, last + 1));
  }
  throw new Error("no json object found");
}

function normSize(x: any): { size_code: string; size_label: string } | null {
  if (x == null) return null;
  if (typeof x === "string") {
    const v = x.trim(); if (!v) return null;
    return { size_code: v.toUpperCase().slice(0, 40), size_label: v.slice(0, 80) };
  }
  const code = String(x.size_code || x.code || x.label || x.size_label || "").trim();
  const label = String(x.size_label || x.label || x.size_code || x.code || "").trim();
  if (!code && !label) return null;
  return { size_code: (code || label).toUpperCase().slice(0, 40), size_label: (label || code).slice(0, 80) };
}
function normColor(x: any): { color_name: string; color_hex: string | null } | null {
  if (x == null) return null;
  if (typeof x === "string") {
    const v = x.trim(); if (!v) return null;
    return { color_name: v.slice(0, 60), color_hex: null };
  }
  const name = String(x.color_name || x.name || "").trim();
  if (!name) return null;
  const hex = String(x.color_hex || x.hex || "").trim();
  return { color_name: name.slice(0, 60), color_hex: /^#?[0-9a-fA-F]{3,8}$/.test(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : null };
}

function skuPrefix(subcategory: string): string {
  const map: Record<string, string> = {
    "diapers-nappies": "DIA", "wipes-diaper-care": "WIP", "bedding-blankets": "BED",
    "baby-clothing": "CLO", "feeding-bottles": "FED", "breastfeeding": "BRF",
    "bath-skincare": "BAT", "toys-development": "TOY", "health-safety": "HEA",
    "maternity-clothing": "MAT", "nursery-furniture": "NUR", "strollers-carriers": "STR",
    "beverages": "BEV", "laundry": "LAU", "grooming": "GRO", "feeding-accessories": "FAC",
  };
  if (map[subcategory]) return map[subcategory];
  return (subcategory || "GEN").replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase().padEnd(3, "X");
}

async function nextSku(admin: any, subcategory: string): Promise<string> {
  const prefix = skuPrefix(subcategory);
  const { data: skuRows } = await admin.from("brands").select("sku").like("sku", `${prefix}-%`);
  let maxNum = 0;
  for (const r of skuRows || []) {
    const m = /^[A-Z]{3}-(\d+)$/.exec(r.sku || "");
    if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
  }
  return `${prefix}-${String(maxNum + 1).padStart(3, "0")}`;
}

async function uniqueSlug(admin: any, base: string): Promise<string> {
  let slug = base || "product";
  for (let i = 2; i < 60; i++) {
    const { data: clash } = await admin.from("products").select("id").eq("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${base}-${i}`;
  }
  return slug;
}

async function writeVariants(admin: any, productId: string, sizes: any[], colors: any[]) {
  const cleanSizes = (sizes || []).map(normSize).filter(Boolean) as { size_code: string; size_label: string }[];
  const cleanColors = (colors || []).map(normColor).filter(Boolean) as { color_name: string; color_hex: string | null }[];

  if (cleanSizes.length) {
    const { data: existing } = await admin.from("product_sizes").select("size_code").eq("product_id", productId);
    const have = new Set((existing || []).map((r: any) => (r.size_code || "").toUpperCase()));
    const rows = cleanSizes
      .filter(s => !have.has(s.size_code.toUpperCase()))
      .map((s, i) => ({ product_id: productId, size_code: s.size_code, size_label: s.size_label, display_order: i, in_stock: true, is_default: i === 0 && have.size === 0 }));
    if (rows.length) await admin.from("product_sizes").insert(rows);
  }
  if (cleanColors.length) {
    const { data: existing } = await admin.from("product_colors").select("color_name").eq("product_id", productId);
    const have = new Set((existing || []).map((r: any) => (r.color_name || "").toLowerCase()));
    const rows = cleanColors
      .filter(c => !have.has(c.color_name.toLowerCase()))
      .map((c, i) => ({ product_id: productId, color_name: c.color_name, color_hex: c.color_hex, display_order: i, in_stock: true }));
    if (rows.length) await admin.from("product_colors").insert(rows);
  }
  return { sizes_written: cleanSizes.length, colors_written: cleanColors.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured. Add it in Supabase Edge Function secrets." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: adminRow } = await admin.from("admin_users")
      .select("id, role, is_active, display_name")
      .eq("auth_user_id", userData.user.id).maybeSingle();
    if (!adminRow || adminRow.role !== "super_admin" || !adminRow.is_active) {
      return new Response(JSON.stringify({ error: "Super admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const mode = (body.mode as string) || "propose";
    const request_id = body.request_id as string | undefined;
    if (!request_id) {
      return new Response(JSON.stringify({ error: "request_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: reqRow } = await admin.from("admin_approval_requests")
      .select("*").eq("id", request_id).eq("status", "pending").maybeSingle();
    if (!reqRow) {
      return new Response(JSON.stringify({ error: "Request not found or already processed" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (reqRow.action !== "create_product") {
      return new Response(JSON.stringify({ error: "This endpoint only handles create_product requests" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: pp } = await admin.from("pending_products")
      .select("*").eq("id", reqRow.target_record_id).eq("status", "pending").maybeSingle();
    if (!pp) {
      return new Response(JSON.stringify({ error: "Pending product not found or already processed" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawName: string = pp.new_product_name || pp.brand_name || "New Product";
    const subcategory: string = pp.subcategory || "";
    const rawCost: number = Number(pp.cost_price) || 0;

    const vendorSizes: any[] = Array.isArray(pp.pending_sizes) ? pp.pending_sizes : [];
    const vendorColors: any[] = Array.isArray(pp.pending_colors) ? pp.pending_colors : [];

    // ================= APPLY MODE =================
    if (mode === "apply") {
      const p = body.payload || {};
      const finalName = String(p.product_name || rawName).trim().slice(0, 200);
      const costPrice = Math.max(0, Math.round(Number(p.cost_price) || rawCost));
      let retail = Math.round(Number(p.price) || floorPrice(costPrice));

      // CLAMP TO THE FLOOR. Two things reach this line and BOTH have shipped below-floor prices:
      //   (a) the AI, which ignores its own 39% instruction (it returned 10,800 on a 8,000 cost,
      //       a 35% markup), and
      //   (b) the admin's edited payload, which was previously written to the DB unchecked.
      // Without this clamp the insert hits trg_enforce_min_markup_floor and dies with a raw
      // wall-of-text error that gives the admin no way forward.
      const minAllowed = floorPrice(costPrice);
      if (costPrice > 0 && retail < minAllowed) {
        console.warn(
          `[approve-pending-product] price ${retail} is below the 39% floor of ${minAllowed} ` +
          `for cost ${costPrice}. Clamping up to ${minAllowed}.`
        );
        retail = minAllowed;
      }

      const category = validCategories.includes(p.category) ? p.category : "baby";
      const priority = validPriorities.includes(p.priority) ? p.priority : "recommended";
      const tier = validTiers.includes(p.tier) ? p.tier : "standard";
      const description = stripEmDashes(String(p.description || finalName)).slice(0, 1000);
      const whyIncluded = stripEmDashes(String(p.why_included || "")).slice(0, 500) || null;
      const brandDescription = stripEmDashes(String(p.brand_description || "")).slice(0, 600) || null;

      const finalImageUrl: string | null =
        (typeof p.image_url === "string" && p.image_url.trim()) ? p.image_url.trim() : (pp.image_url || null);

      const s = (v: any, fb: any) => (typeof v === "string" && v.trim() !== "") ? v.trim() : fb;
      const brandName = s(p.brand_name, pp.brand_name);
      const sizeVariant = s(p.size_variant, pp.size_variant) || null;
      const diaperType = s(p.diaper_type, pp.diaper_type) || null;
      const itemType = s(p.item_type, pp.item_type) || null;
      const weightRangeKg = s(p.weight_range_kg, pp.weight_range_kg) || null;
      const weightKg = (p.weight_kg !== undefined && p.weight_kg !== null && `${p.weight_kg}`.trim() !== "")
        ? Number(p.weight_kg) : (pp.weight_kg ?? null);
      const packCount = (p.pack_count !== undefined && p.pack_count !== null && `${p.pack_count}`.trim() !== "")
        ? Math.round(Number(p.pack_count)) : (pp.pack_count ?? null);

      const isConsumable: boolean = p.is_consumable === true;
      let reorderDays: number | null = isConsumable ? Number(p.reorder_days) : null;
      if (isConsumable && !validReorderDays.includes(reorderDays as number)) {
        reorderDays = validReorderDays.reduce((c, d) => Math.abs(d - (Number(p.reorder_days) || 30)) < Math.abs(c - (Number(p.reorder_days) || 30)) ? d : c, 30);
      }
      const reorderLabel: string | null = isConsumable
        ? (stripEmDashes(String(p.reorder_label || `Reorder every ${reorderDays} days`)).slice(0, 100) || `Reorder every ${reorderDays} days`)
        : null;
      const isSubscribable = isConsumable;

      const finalSizes: any[] = Array.isArray(p.sizes) ? p.sizes : vendorSizes;
      const finalColors: any[] = Array.isArray(p.colors) ? p.colors : vendorColors;

      let productId: string | null = p.attach_to_product_id || null;
      if (productId) {
        await admin.from("products").update({
          is_consumable: isConsumable, is_subscribable: isSubscribable,
          reorder_days: reorderDays, reorder_label: reorderLabel,
        }).eq("id", productId);
      } else {
        const slug = await uniqueSlug(admin, slugify(finalName));
        const { data: newProduct, error: pErr } = await admin.from("products").insert({
          name: finalName, slug, description, category, subcategory, priority,
          why_included: whyIncluded, is_active: true,
          is_consumable: isConsumable, is_subscribable: isSubscribable,
          reorder_days: reorderDays, reorder_label: reorderLabel,
        }).select("id").single();
        if (pErr) return new Response(JSON.stringify({ error: "Product creation failed", detail: pErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        productId = newProduct.id;
      }

      let variantResult = { sizes_written: 0, colors_written: 0 };
      try {
        if (productId && ((finalSizes && finalSizes.length) || (finalColors && finalColors.length))) {
          variantResult = await writeVariants(admin, productId, finalSizes, finalColors);
        }
      } catch (ve) { console.error("variant write failed (non-fatal):", ve); }

      let vendorId: string | null = pp.vendor_id || null;
      if (!vendorId && pp.vendor_name) {
        const { data: newVendor, error: vErr } = await admin.from("vendors")
          .insert({ name: pp.vendor_name, phone: pp.vendor_phone || null, whatsapp: pp.vendor_whatsapp || null, is_active: true })
          .select("id").single();
        if (vErr) return new Response(JSON.stringify({ error: "Vendor creation failed", detail: vErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        vendorId = newVendor.id;
      }

      const sku = await nextSku(admin, subcategory);
      const { data: newBrand, error: bErr } = await admin.from("brands").insert({
        product_id: productId, brand_name: brandName, sku, tier,
        description: brandDescription,
        cost_price: costPrice, price: retail,
        image_url: finalImageUrl, stored_image_url: finalImageUrl,
        weight_kg: weightKg, size_variant: sizeVariant,
        pack_count: packCount, diaper_type: diaperType,
        item_type: itemType, weight_range_kg: weightRangeKg,
        in_stock: true, is_active: true, vendor_id: vendorId,
      }).select("id").single();
      if (bErr) return new Response(JSON.stringify({ error: "Brand creation failed", detail: bErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const decision = String(p.decision || "confirm");
      await admin.from("pending_products").update({
        status: "approved", reviewed_by: adminRow.id, reviewed_at: new Date().toISOString(),
        promoted_brand_id: newBrand.id,
        is_consumable: isConsumable, reorder_days: reorderDays, reorder_label: reorderLabel,
        reviewer_note: `Approved via review (${decision}). SKU ${sku}, retail ${retail}. Consumable: ${isConsumable}. Sizes:${variantResult.sizes_written} Colors:${variantResult.colors_written}.`,
      }).eq("id", pp.id);

      await admin.from("admin_approval_requests").update({
        status: "approved", reviewed_by: adminRow.id, reviewed_at: new Date().toISOString(),
        reviewer_note: `Promoted via review (${decision}): brand ${sku}, retail ${retail}.`,
      }).eq("id", request_id);

      return new Response(JSON.stringify({
        success: true, product_id: productId, brand_id: newBrand.id, vendor_id: vendorId,
        sku, cost_price: costPrice, retail, category, priority, tier,
        attached_to_existing: !!p.attach_to_product_id,
        sizes_written: variantResult.sizes_written, colors_written: variantResult.colors_written,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ================= PROPOSE MODE =================
    const retail: number = floorPrice(rawCost);

    const { data: peers } = await admin.from("products")
      .select("id, name, description").eq("subcategory", subcategory).eq("is_active", true).limit(60);
    const peerNames = (peers || []).map((r: any) => r.name).filter(Boolean);

    let preAttach: { id: string; name: string; description: string | null } | null = null;
    if (pp.existing_product_id) {
      const { data: ep } = await admin.from("products")
        .select("id, name, description").eq("id", pp.existing_product_id).maybeSingle();
      if (ep) preAttach = { id: ep.id, name: ep.name, description: ep.description };
    }

    const brandLabel = (pp.brand_name || "").trim();
    const isGenericish = /generic|brand tbd|tbd|unbranded|assorted|n\/?a/i.test(brandLabel) || brandLabel === "";
    const brandRule = isGenericish
      ? "This is a GENERIC or unbranded item. Do NOT invent any brand reputation. Describe the specific variant and pack of THIS item well."
      : `BRAND KNOWLEDGE, STRICT TEST. You may add at most ONE well known characteristic of '${brandLabel}', and ONLY if it passes all of these: (a) you are genuinely certain it is true, (b) it is true of THIS specific item and not merely of the brand's wider range, and (c) it is a general characteristic, never a specific ingredient, formulation, certification or health claim. A brand often sells many different formulations and you were given only a name, a pack and a price, so a fact that is true of the brand can easily be FALSE for this particular item. If you cannot pass all three tests, write nothing about the brand and describe the item itself instead. A vague but true description is always better than a confident wrong one.`;

    const nameDirective = preAttach
      ? `NAME IS ALREADY DECIDED: this item attaches to the existing product \"${preAttach.name}\". Set normalized_name to exactly \"${preAttach.name}\" and matches_existing_peer to exactly \"${preAttach.name}\". Do NOT invent a new name.`
      : `HOUSE NAMING PATTERN: match how existing products in the same subcategory are named. Existing product names in subcategory '${subcategory}': ${peerNames.length ? peerNames.map((n: string) => `\"${n}\"`).join(", ") : "(none yet)"}.\nNormalize the vendor's raw name to this pattern. Example: raw \"Baby Diapers size 5\" should become \"Baby Diapers (Size 5)\" if peers use parenthesised title-cased sizes. Keep the same style (parentheses, capitalisation, spacing) as the peers.\n\nATTACH DECISION: if the normalized name EXACTLY matches one of the existing peer names above, this new item is another BRAND under that existing product (attach). Otherwise it is a new product.`;

    const vendorSubmittedSizes = vendorSizes.length > 0;
    const vendorSubmittedColors = vendorColors.length > 0;
    const sizeContext = APPAREL_SUBCATS.includes(subcategory)
      ? `This subcategory ('${subcategory}') is APPAREL and normally needs a size range. ${vendorSubmittedSizes ? "The vendor already submitted sizes; expand/normalize them and only fill gaps, do not duplicate." : "The vendor did NOT submit structured sizes; derive the range from the name / size_variant text and expand it."}`
      : MAYBE_APPAREL_SUBCATS.includes(subcategory)
        ? `This subcategory ('${subcategory}') is MIXED: it contains both wearable garments (belly bands, postpartum underwear, leggings, robes, which DO need sizes) and non-wearable recovery items (pads, creams, peri bottles, sitz bath, which do NOT need sizes). Decide from THIS product's name whether it is a garment. Only suggest sizes if it is genuinely a wearable garment.`
        : `This subcategory ('${subcategory}') does NOT normally need fashion sizes. Only suggest sizes if the product name clearly indicates a wearable clothing/footwear item; otherwise return empty arrays.`;

    const sizeStandards = `CANONICAL SIZE BANDS (snap every suggested size to one of these exact codes):\n- Baby / toddler clothing (age-based): ["NB","0-3M","3-6M","6-9M","9-12M","12-18M","18-24M","2T","3T"]. Labels: \"Newborn\",\"0-3 Months\",\"3-6 Months\",\"6-9 Months\",\"9-12 Months\",\"12-18 Months\",\"18-24 Months\",\"2T\",\"3T\".\n- Baby shoes: EU ["16","17","18","19","20","21","22"]; label with the EU number.\n- Women's / maternity clothing: ["XS","S","M","L","XL","XXL"] (or Nigerian numeric 8-20 if the product is clearly numeric-sized).\n- Women's shoes: EU ["36","37","38","39","40","41","42"].\n\nRANGE EXPANSION (critical): the vendor frequently gives a RANGE, not discrete sizes. Expand any range into EVERY canonical band that falls within it, inclusive.\n- Baby example: vendor says \"6 months to 2 years\" (2 years = 24 months) -> expand to ["6-9M","9-12M","12-18M","18-24M"]. Vendor says \"0-3 months\" -> just ["0-3M"]. Vendor says \"newborn to 1 year\" -> ["NB","0-3M","3-6M","6-9M","9-12M"].\n- Women's example: vendor says \"M to XL\" -> ["M","L","XL"]. \"S-XXL\" -> ["S","M","L","XL","XXL"].\n- Map \"2 years\"->18-24M/2T boundary sensibly (24 months is the 18-24M band; if they clearly mean the toddler cut use 2T). Map \"1 year\"->9-12M. Reason about months vs years from context.\n- The vendor's wording can be ambiguous or contain typos (e.g. \"6 to 90 month\" almost certainly means \"6 to 9 month\"; \"6-2\" likely 6 months to 2 years). Choose the most sensible interpretation, expand it, and STATE that interpretation in size_reasoning so the human reviewer can correct it.\n\nOnly suggest a range you are confident about. If you truly cannot tell whether the item even has sizes, return an empty sizes array.`;

    const colorRule = vendorSubmittedColors
      ? `The vendor explicitly listed colors: ${JSON.stringify(vendorColors)}. Use exactly those; do not add extras.`
      : `The vendor did NOT list colors. Determine the SINGLE actual color of THIS specific product ONLY from explicit color words in the product name / item type / vendor notes (e.g. name \"Pink Baby Jeans\" -> [{\"color_name\":\"Pink\"}]). Suggest ONLY that one real color. Do NOT invent or list a palette of common colors. If there is NO color word anywhere in the text, return an EMPTY colors array (the human reviewer will add the real color from the product image). You cannot see the image, so never guess a color from the product type alone.`;

    const aiPrompt = `You are preparing catalogue fields for a Nigerian maternity and baby e-commerce store called BundledMum. A vendor submitted a new product. Normalize its name to our house pattern, decide if it belongs under an existing product, write the content, and (only where appropriate) suggest a size range and the product's actual color.

${nameDirective}

TWO DESCRIPTIONS (critical). BOTH ARE SELLING COPY READ BY A CUSTOMER DECIDING WHETHER TO BUY.
1. PRODUCT description: GENERIC to the product category, brand-neutral, NEVER names the brand '${pp.brand_name || ""}'. Many brands share it.
2. BRAND description: SPECIFIC to this brand and pack, Nigerian-mum voice. ${brandRule}

HOW BOTH DESCRIPTIONS MUST BE WRITTEN:
- Write TO the customer, not about the record. Use "you" and "your baby". Lead with what it does for
  her. Never open with "This is a...".
- Be persuasive through CONCRETE BENEFIT, not adjectives. Say what it saves her, spares her or makes
  easier in a real Nigerian home or ward.
- NEVER INVENT PRODUCT SPECIFICS. Work from what you were actually given: name, pack count, stated
  material, brand. Do not invent certifications, origins, safety approvals, medical or health
  benefits, awards, ingredient lists, or "clinically proven" anything. Inventing a claim about a
  product a mum will put on her newborn is the worst thing you can do here.
- The ONE exception is the single brand characteristic permitted in the BRAND description rule above,
  and only under the strict test described there.
- If the submission is thin, WRITE SHORTER. Two honest sentences beat four padded ones. NEVER write
  about the lack of information itself.
- NEVER LEAK INTERNAL DETAIL. The customer must never see the words vendor, supplier, catalogue,
  stock level, sourcing, markup, cost price, tier, priority, hospital list, admin, submission, or any
  reference to our internal systems or how we buy. Bad, real examples to never repeat:
  "As the product details provided by the vendor are limited...", "The vendor notes the item type as
  cotton", "The brand is stocked on the vendor catalogue", "without worrying about brand markups".
- No unbackable superlatives: no "the best", "number one", "world class", "premium quality".
- NEVER STATE THE PRICE. Not in naira, not as a number, not as "affordable", "budget friendly",
  "accessible price point" or "without a premium price tag". The price is shown next to the copy and
  it changes. A price written into the description goes stale and misleads the customer.
- NEVER STATE SIZES OR SIZE RANGES. No "0 to 3 months", no "6 months to age 2", no "XL, XXL, XXXL",
  no "small/medium/large". Sizes live in the size selector and in the product name, and repeating
  them means they contradict each other the moment a size is added or removed.
- Because price and sizes are off limits, sell on what the item actually DOES for her: what it saves
  her, what it spares her, when she will reach for it. That is what makes copy convincing anyway.
- Warm, plain, practical Nigerian mum voice. No em dashes.

WHY WE INCLUDED THIS (why_included, shown to the customer on her quiz results):
This answers "why is this on my list?" in the voice of an experienced Nigerian mum, not a catalogue.
- ONE OR TWO SHORT SENTENCES, UNDER 130 CHARACTERS TOTAL. Aim for about 90. It is displayed in full
  on a card with no truncation, so anything longer breaks the layout.
- Give a REAL, SPECIFIC reason grounded in Nigerian hospital and home reality: what the ward expects
  you to bring, how fast the item gets used up, or what actually goes wrong without it.
- Brand-neutral. Never name the brand, because many brands share this product.
- Explain, do not sell. No "premium quality", no "every mum needs", no marketing language.
- NEVER give unsafe advice. Do not suggest pillows, loose bedding or positioners for a SLEEPING baby,
  and never suggest putting anything inside a baby's ears or nose.
Good examples from our catalogue:
- Mackintosh: "A waterproof sheet for the delivery bed. Nearly every Nigerian hospital list asks for one."
- Surgical Gloves: "Most hospitals ask you to bring your own for the delivery itself. They will not start without them."
- Baby Vests: "Worn under everything, so they get soiled fastest. Most mums go through several in a single day."
- Harpic: "Public hospitals expect you to clean the toilet you use, so bring your own rather than sharing."
Bad example, too long and too vague: "Every Nigerian mum needs at least one ready outfit for her newborn
the moment baby arrives, whether at the hospital or coming home for the first time."

CONSUMABLE AND REORDER ESTIMATE (reason per product):
- is_consumable is TRUE only if a family USES THIS ITEM UP and rebuys it (nappies, wipes, formula, maternity pads, breast pads, creams, cotton wool, antiseptic, baby toiletries). FALSE for durable/one-off items (bags, mats, furniture, clothing, shoes, toys, bottles, pumps, monitors, gift sets, teethers).
- If consumable, estimate how long ONE unit lasts for a Nigerian family and snap to the closest of 21, 30, 45 days.

SIZES:
${sizeContext}
${sizeStandards}

COLOR:
${colorRule}

Raw submission:
- Raw product name: ${rawName}
- Brand: ${pp.brand_name || "Generic"}
- Subcategory: ${subcategory}
- Cost: ${rawCost} naira
- REQUIRED SELLING PRICE: ${retail} naira. This is the 39% markup floor, ROUNDED UP to the next 25.
  Use EXACTLY this price. A database trigger REJECTS anything below it, so do NOT lower it, do NOT
  round it down, and do NOT invent a "better" price. If you think it should be cheaper, still return
  ${retail}. The admin can lower it deliberately in the review screen afterwards.
- Size/variant (single legacy text field, often where the vendor states a RANGE): ${pp.size_variant || "n/a"}
- Color (single legacy text field, may name the actual color): ${pp.color || "n/a"}
- Vendor-submitted structured sizes: ${vendorSubmittedSizes ? JSON.stringify(vendorSizes) : "none"}
- Vendor-submitted structured colors: ${vendorSubmittedColors ? JSON.stringify(vendorColors) : "none"}
- Weight: ${pp.weight_kg || "n/a"} kg
- Pack count: ${pp.pack_count || "n/a"}
- Item type: ${pp.item_type || "n/a"}
- Vendor notes: ${pp.notes || "none"}

Return ONLY a JSON object (no markdown, no backticks) with these exact keys:
{
  "normalized_name": "...",
  "matches_existing_peer": "exact peer name or null",
  "description": "brand-neutral product description, no em dashes",
  "why_included": "UNDER 130 chars, 1-2 short sentences, specific Nigerian reason, brand-neutral, no em dashes",
  "brand_description": "2 short sentences, brand-specific, no em dashes",
  "category": "one of: ${validCategories.join(", ")}",
  "priority": "one of: ${validPriorities.join(", ")}",
  "tier": "one of: ${validTiers.join(", ")}",
  "is_consumable": true/false,
  "reorder_days": 21|30|45|null,
  "reorder_label": "string or null",
  "reorder_reasoning": "one sentence or empty",
  "needs_sizes": true/false (does THIS product require a customer to pick a size),
  "suggested_sizes": [{"size_code":"6-9M","size_label":"6-9 Months"}, ...] (expanded from the vendor's range; empty array if not applicable),
  "suggested_colors": [{"color_name":"Pink"}] (ONLY the product's one actual color from the text, or the vendor's listed colors; EMPTY array if no color word is present),
  "size_reasoning": "REQUIRED when suggesting sizes: state how you interpreted the vendor's range. Empty string only if no sizes."
}`;

    const aiResp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1800,
        system: "You output only a single raw JSON object. No prose, no explanation, no markdown, no code fences. Your entire response must start with { and end with }.",
        messages: [{ role: "user", content: aiPrompt }],
      }),
    });
    if (!aiResp.ok) {
      const errTxt = await aiResp.text();
      return new Response(JSON.stringify({ error: "Claude API call failed", detail: errTxt.slice(0, 500) }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const aiData = await aiResp.json();
    const aiText = (aiData.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
    let ai: any;
    try { ai = extractJson(aiText); }
    catch { return new Response(JSON.stringify({ error: "Could not parse Claude response", raw: aiText.slice(0, 800) }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    const normalizedName = String(ai.normalized_name || preAttach?.name || rawName).trim().slice(0, 200);

    let attachProductId: string | null = null;
    let attachProductName: string | null = null;
    let sharedProductDesc: string | null = null;
    if (preAttach) {
      attachProductId = preAttach.id; attachProductName = preAttach.name; sharedProductDesc = preAttach.description;
    } else {
      const matchName = (ai.matches_existing_peer || "").toString().trim().toLowerCase();
      for (const pr of peers || []) {
        if ((pr.name || "").toLowerCase() === (normalizedName || "").toLowerCase() ||
            (matchName && (pr.name || "").toLowerCase() === matchName)) {
          attachProductId = pr.id; attachProductName = pr.name; sharedProductDesc = pr.description; break;
        }
      }
    }

    let existingSizes: any[] = [];
    let existingColors: any[] = [];
    if (attachProductId) {
      const [{ data: es }, { data: ec }] = await Promise.all([
        admin.from("product_sizes").select("size_code, size_label").eq("product_id", attachProductId).order("display_order"),
        admin.from("product_colors").select("color_name, color_hex").eq("product_id", attachProductId).order("display_order"),
      ]);
      existingSizes = es || [];
      existingColors = ec || [];
    }

    const productDescription = attachProductId && sharedProductDesc
      ? sharedProductDesc
      : stripBrandFromProductDesc(stripEmDashes(String(ai.description || normalizedName)), pp.brand_name || "").slice(0, 1000);

    const isConsumable: boolean = ai.is_consumable === true;
    let reorderDays: number | null = isConsumable ? Number(ai.reorder_days) : null;
    if (isConsumable && !validReorderDays.includes(reorderDays as number)) {
      reorderDays = validReorderDays.reduce((c, d) => Math.abs(d - (Number(ai.reorder_days) || 30)) < Math.abs(c - (Number(ai.reorder_days) || 30)) ? d : c, 30);
    }

    const mergedSizes = (Array.isArray(ai.suggested_sizes) && ai.suggested_sizes.length
      ? ai.suggested_sizes
      : vendorSizes).map(normSize).filter(Boolean);
    const mergedColors = (vendorColors.length
      ? vendorColors
      : (Array.isArray(ai.suggested_colors) ? ai.suggested_colors : [])).map(normColor).filter(Boolean);

    const skuPreview = await nextSku(admin, subcategory);

    const draft = {
      request_id,
      product_name: normalizedName,
      attach_to_product_id: attachProductId,
      attach_to_product_name: attachProductName,
      description: productDescription,
      why_included: stripEmDashes(String(ai.why_included || "")).slice(0, 500),
      brand_description: stripEmDashes(String(ai.brand_description || "")).slice(0, 600),
      category: validCategories.includes(ai.category) ? ai.category : "baby",
      priority: validPriorities.includes(ai.priority) ? ai.priority : "recommended",
      tier: validTiers.includes(ai.tier) ? ai.tier : "standard",
      cost_price: rawCost,
      price: retail,
      is_consumable: isConsumable,
      reorder_days: reorderDays,
      reorder_label: isConsumable ? (stripEmDashes(String(ai.reorder_label || `Reorder every ${reorderDays} days`)).slice(0,100)) : null,
      reorder_reasoning: isConsumable ? stripEmDashes(String(ai.reorder_reasoning || "")).slice(0, 200) : "",
      brand_name: pp.brand_name,
      weight_kg: pp.weight_kg ?? null,
      weight_range_kg: pp.weight_range_kg || null,
      pack_count: pp.pack_count ?? null,
      size_variant: pp.size_variant || null,
      diaper_type: pp.diaper_type || null,
      item_type: pp.item_type || null,
      needs_sizes: ai.needs_sizes === true || mergedSizes.length > 0,
      sizes: mergedSizes,
      colors: mergedColors,
      sizes_source: (Array.isArray(ai.suggested_sizes) && ai.suggested_sizes.length) ? "ai_suggested" : (vendorSizes.length ? "vendor" : "none"),
      colors_source: vendorColors.length ? "vendor" : (mergedColors.length ? "ai_suggested" : "none"),
      size_reasoning: stripEmDashes(String(ai.size_reasoning || "")).slice(0, 300),
      existing_product_sizes: existingSizes,
      existing_product_colors: existingColors,
      sku_preview: skuPreview,
      subcategory,
      image_url: pp.image_url,
      vendor_name: pp.vendor_name,
      vendor_raw_name: rawName,
      vendor_raw_cost: rawCost,
      vendor_raw_price: floorPrice(rawCost),
      peer_product_names: peerNames,
    };

    return new Response(JSON.stringify({ success: true, mode: "propose", draft }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});