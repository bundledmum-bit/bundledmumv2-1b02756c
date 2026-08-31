import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// Robust JSON extraction: tolerate leading prose, code fences, or trailing
// commentary by slicing from the first '{' to the last '}' and parsing that.
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

const SYSTEM_PROMPT = `You are writing the narrative sections of an investor financial report for BundledMum, a Nigerian maternity business (launched 18 May 2026, founder-funded with NGN 10,000,000 committed capital, Lagos-based). BundledMum is now ONE COMPANY WITH TWO ARMS plus shared overhead: a STOREFRONT (source-on-demand retail) and a MARKETPLACE (used baby items). You will be given VERIFIED FINANCIAL FIGURES as JSON. Rules, absolute:
1. Use ONLY numbers present in the provided figures. NEVER compute, estimate, extrapolate, or invent any number. Every figure you cite must appear verbatim in the data.
2. There are only a few months of trading data (from May 2026). You MUST state explicitly that this is too short to establish a trend and that any forward figures are labeled scenarios, not predictions.
3. Do NOT spin negative figures positively. If a contribution or the company net profit is negative, or marketing ROI is negative, state it plainly.
4. For projections, only restate the provided scenario figures and always name their assumption (e.g. 'at a 20% month-on-month growth assumption').
5. No em dashes anywhere. Use commas or full stops.

BUSINESS MODEL, absolute, never violate:
- The STOREFRONT and the MARKETPLACE are DIFFERENT businesses under one company. The storefront buys inventory and marks it up (COGS-based retail). The marketplace never owns inventory; it matches buyer and seller and takes a commission. NEVER blend their unit economics and NEVER quote a single blended margin across the two.
- Marketplace GMV is NOT revenue. Most of it is buyers' money passing through escrow to sellers. Marketplace revenue is the TAKE only: markup plus service fee. NEVER add GMV to revenue.
- There is NO COGS on the marketplace side. Seller share is a pass-through liability, not a cost of goods.
- Marketplace revenue has TWO sources that behave differently and MUST be reported separately: markup (scales with item price) and service fee (8% of item price, floored at NGN 200, capped at NGN 1,500, so it is near-flat above about NGN 19,000).
- Escrow held and pending seller payouts are LIABILITIES held on behalf of sellers. Never revenue, never available cash.
- Storefront quotes are storefront-only and must never be mixed with marketplace activity.
- Unpaid orders and open quotes are PIPELINE, not earned revenue.

COST MODEL, one company with shared staff and tools, THREE layers, never violate:
- STOREFRONT DIRECT: marketing/customer acquisition tagged to the storefront, plus costs tied to storefront orders and vendors (procurement, inbound shipping, delivery, packaging, refunds).
- MARKETPLACE DIRECT: marketing tagged to the marketplace, plus costs tied to marketplace orders and sellers.
- SHARED OVERHEAD: everything else, software subscriptions, payroll, professional services, travel, office. These belong to NEITHER arm and must NEVER be charged to one.
- Therefore per-arm figures are CONTRIBUTION (revenue less that arm's own direct costs), NOT profit. NET PROFIT exists ONLY at company level, after shared overhead and payroll. Use the word "contribution" for every arm-level figure and reserve the word "profit" for the company figure. State plainly that an arm's true cost to the business is worse than its contribution, because it also consumes shared staff and tools.

BENCHMARKS for context: a marketplace take rate is normally 10 to 30 percent; contribution margin per order is the metric that shows whether a transaction actually pays; GMV alone is a vanity metric; liquidity (fill rate / sell-through) is the metric most predictive of marketplace survival.

REPORT SECTIONS you must produce (in addition to the existing keys below):
- storefront_section: STOREFRONT only. Revenue, gross profit, direct costs, and CONTRIBUTION (not profit). Use company_finance_monthly store_* fields. Keep it strictly storefront; never mention marketplace here.
- marketplace_section: MARKETPLACE only. Make the GMV vs revenue-kept distinction explicit (GMV is pass-through, revenue is the take only). Split markup vs service fee (marketplace_revenue_split). State the take rate and contribution PER ORDER (marketplace_unit_economics). Walk the funnel from marketplace_funnel: seller activation (registered -> listed -> sold), buyer conversion (checkouts started -> paid -> paid out), sell-through, and the reliability signals avg_attempts_per_paid_order and pct_checkout_to_paid. EXPLICITLY compare marketplace direct spend against marketplace revenue kept (marketplace_direct_costs vs marketplace_net_revenue in company_finance_monthly), and say whether the take covers the arm's own direct costs. Call every figure here contribution, never profit.
- company_combined_section: COMPANY level. Total company revenue must be shown as a clearly-labelled SUM of TWO DIFFERENT revenue types (storefront retail revenue plus marketplace take), never GMV. Then shared overhead and payroll, then company NET PROFIT (this is the only place "profit" is allowed). State ONE shared runway using company_runway_months_structural from company_runway (never a per-arm runway). Then present the pipeline from company_pipeline split by kind into incoming, supply, and liability, noting liabilities (escrow, pending payouts) are owed to sellers, not company money.

Also keep producing the existing narrative for the storefront-era detail the report already carries:
6. Explain the storefront margin story honestly if the data supports it: low early markup and high unpredicted extra costs compress gross margin; as markup rises and extra costs fall, margin recovers. If net loss still widens because operating and marketing spend grew faster than gross profit, present that honestly.
7. MARKETING CHANNELS: using marketing_by_channel (each row has an is_measurable flag) and the acquisition figures, state plainly what share of acquisition spend goes to UNMEASURABLE channels (hub partnerships, influencer, giveaway) versus MEASURABLE channels (Meta, Google ads). State clearly as a key weakness that most of the spend is not attributable, so a true ROAS and CAC cannot be measured for the majority of spend.
8. UNIT ECONOMICS (storefront): comment ONLY on per-order economics, the average gross profit per order, the average order value, and the revenue concentration risk (the largest order as a percentage of revenue). Flag the concentration honestly as a risk. Do NOT discuss the quote pipeline in this section.
9. QUOTE PIPELINE: these quotes are individual RETAIL customer enquiries generated largely by Meta Ads flowing into WhatsApp, where a customer requests a quote for their own order, views it, and often does not complete. They are NOT a B2B pipeline. Comment on the open pipeline value, the paid conversion rate, and that the pipeline represents customer demand not yet converted. The dead or expired pipeline is large, and consists of real, often repeatedly viewed, high value customer quotes that expired without converting. Make this honest connection: the volume of high value, repeatedly viewed, then expired quotes indicates the primary constraint is quote to order CONVERSION and FOLLOW UP, not demand generation, suggesting paid acquisition may be generating genuine high intent demand lost at the manual WhatsApp quote and follow up stage. Frame this as a concrete, fixable execution gap sitting on top of proven interest, an opportunity. Keep it honest: viewed interest is NOT committed revenue; do not imply the dead pipeline is recoverable revenue; only a structured follow up process could test how much is convertible.

Return a JSON object with these keys: executive_summary, storefront_section, marketplace_section, company_combined_section, margin_and_cost_analysis, marketing_channel_analysis, unit_economics_analysis, quote_pipeline_analysis, burn_and_runway, outlook_and_scenarios. Each value is 1 to 3 short paragraphs of plain prose. Return ONLY the JSON, no preamble, no markdown.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    // Auth: must be an active super admin (mirrors approve-pending-product).
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: adminRow } = await admin.from("admin_users")
      .select("id, role, is_active").eq("auth_user_id", userData.user.id).maybeSingle();
    if (!adminRow || adminRow.role !== "super_admin" || !adminRow.is_active) {
      return new Response(JSON.stringify({ error: "Super admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Input range. Default: launch month to today.
    let body: any = {};
    try { body = await req.json(); } catch (_) { body = {}; }
    const today = new Date().toISOString().slice(0, 10);
    const p_start = (typeof body.p_start === "string" && body.p_start.trim()) ? body.p_start.trim() : "2026-05-01";
    const p_end = (typeof body.p_end === "string" && body.p_end.trim()) ? body.p_end.trim() : today;

    // ── Step A: pull LOCKED numbers server-side. All figures come from the DB.
    // No figure is computed here or by Claude.
    //
    // Two groups:
    //  (1) the storefront-era figures the existing report has always rendered, and
    //  (2) the six company-wide live views that model BundledMum as one company
    //      with two arms (storefront + marketplace) plus shared overhead. These
    //      are additive: the existing report keeps everything it had.
    const [
      trendRes, metricsRes, scenariosRes, runwayRes, mktRes, ueRes, pipeRes,
      companyMonthlyRes, companyRunwayRes, companyPipelineRes,
      mFunnelRes, mRevSplitRes, mUnitEconRes,
    ] = await Promise.all([
      admin.rpc("finance_monthly_trend", { p_start, p_end }),
      admin.rpc("finance_period_metrics", { p_start, p_end }),
      admin.rpc("finance_projection_scenarios"),
      admin.from("finance_runway").select("*").single(),
      admin.rpc("finance_marketing_by_channel", { p_start, p_end }),
      admin.rpc("finance_unit_economics", { p_start, p_end }),
      admin.from("finance_quote_pipeline").select("*").single(),
      // Company-wide views (live queries over source tables; not snapshots).
      admin.from("company_finance_monthly").select("*").order("month", { ascending: true }),
      admin.from("company_runway").select("*").maybeSingle(),
      admin.from("company_pipeline").select("*"),
      admin.from("marketplace_funnel").select("*").maybeSingle(),
      admin.from("marketplace_revenue_split").select("*"),
      admin.from("marketplace_unit_economics").select("*"),
    ]);
    const firstErr = trendRes.error || metricsRes.error || scenariosRes.error || runwayRes.error || mktRes.error || ueRes.error || pipeRes.error
      || companyMonthlyRes.error || companyRunwayRes.error || companyPipelineRes.error
      || mFunnelRes.error || mRevSplitRes.error || mUnitEconRes.error;
    if (firstErr) {
      return new Response(JSON.stringify({ error: "Could not load financial figures", detail: firstErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const arr = (v: any) => (Array.isArray(v) ? v : (v ? [v] : []));
    const figures = {
      period: { p_start, p_end },
      business: { name: "BundledMum", launched: "2026-05-18", committed_capital_ngn: 10000000, currency: "NGN" },
      monthly_trend: arr(trendRes.data),
      period_metrics: arr(metricsRes.data)[0] || null,
      projection_scenarios: arr(scenariosRes.data)[0] || null,
      runway: runwayRes.data || null,
      marketing_by_channel: arr(mktRes.data),
      unit_economics: arr(ueRes.data)[0] || null,
      quote_pipeline: pipeRes.data || null,
      // ── Company-wide (two arms + shared overhead + combined). ──
      company_finance_monthly: arr(companyMonthlyRes.data),
      company_runway: companyRunwayRes.data || null,
      company_pipeline: arr(companyPipelineRes.data),
      marketplace_funnel: mFunnelRes.data || null,
      marketplace_revenue_split: arr(mRevSplitRes.data),
      marketplace_unit_economics: arr(mUnitEconRes.data),
    };

    // ── Step B: Claude writes ONLY the prose. If it fails, we still return the
    // figures so the client renders a figures-only document (never blank).
    let narrative: any = null;
    let narrative_error: string | null = null;
    if (!ANTHROPIC_API_KEY) {
      narrative_error = "ANTHROPIC_API_KEY not configured";
    } else {
      try {
        const aiResp = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: "VERIFIED FINANCIAL FIGURES:\n" + JSON.stringify(figures) }],
          }),
        });
        if (!aiResp.ok) {
          narrative_error = "Claude API call failed: " + (await aiResp.text()).slice(0, 300);
        } else {
          const aiData = await aiResp.json();
          const aiText = (aiData.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
          try { narrative = extractJson(aiText); }
          catch { narrative_error = "Could not parse Claude response"; }
        }
      } catch (e) {
        narrative_error = e instanceof Error ? e.message : "Claude request error";
      }
    }

    // ── Step C: return figures + narrative (narrative may be null on AI failure).
    return new Response(JSON.stringify({ figures, narrative, narrative_error }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
