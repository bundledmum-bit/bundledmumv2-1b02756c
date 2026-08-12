import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sends DIRECTLY to Resend (api.resend.com). Previously routed through the dead
// Lovable connector gateway with LOVABLE_API_KEY (401 "Credential not found").
// Only the outbound URL + credential changed.
const RESEND_URL  = 'https://api.resend.com/emails';
const FROM_EMAIL  = 'BundledMum Health <hello@bundledmum.com>';
const REPLY_TO    = 'hello@bundledmum.ng';
const OWNER_EMAIL = 'iceboxx766@gmail.com';
const SITE_URL    = 'https://bundledmum.com';

interface CheckResult {
  check:       string;
  status:      'ok' | 'warning' | 'critical';
  message:     string;
  detail?:     string;
  fix_prompt?: string;
  source?:     'backend' | 'frontend';
}

const STATUS_COLOR: Record<string, string> = {
  ok:       '#2D6A4F',
  warning:  '#F59E0B',
  critical: '#DC2626',
};
const STATUS_ICON: Record<string, string> = {
  ok:       '✅',
  warning:  '⚠️',
  critical: '🚨',
};
const SOURCE_BADGE: Record<string, string> = {
  frontend: 'bg:#E0F2FE;color:#0369A1',
  backend:  'bg:#F0FDF4;color:#166534',
};

async function runBackendChecks(supabase: any): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // CHECK 1: Bundle prices zero
  try {
    const { data, error } = await supabase
      .from('brands')
      .select('sku, price, product_id, products(name)')
      .eq('in_stock', true)
      .eq('products.is_gift_box', true)
      .eq('price', 0);
    if (error) throw error;
    const zero = (data || []).filter((b: any) => b.products);
    if (zero.length > 0) {
      results.push({
        check: 'Bundle Prices', status: 'critical', source: 'backend',
        message: `${zero.length} bundle(s) have ₦0 price — customers cannot check out`,
        detail: zero.map((b: any) => `${b.products?.name} (${b.sku})`).join(', '),
        fix_prompt: `Run in Supabase SQL editor:\nSELECT refresh_maternity_bundle_prices();\n-- For gift boxes:\nUPDATE gift_box_items SET updated_at = now() WHERE gift_box_id IN (SELECT id FROM products WHERE is_gift_box = true AND name NOT LIKE 'Maternity%');`,
      });
    } else {
      results.push({ check: 'Bundle Prices', status: 'ok', source: 'backend', message: 'All bundle prices set correctly' });
    }
  } catch (e) { results.push({ check: 'Bundle Prices', status: 'warning', source: 'backend', message: `Check failed: ${e}` }); }

  // CHECK 2: Maternity snapshots stale
  try {
    const { data } = await supabase.from('products').select('id, name').ilike('name', 'Maternity Bundle%').eq('is_active', true);
    const stale: string[] = [];
    for (const bundle of (data || [])) {
      const { data: snap } = await supabase.from('maternity_bundle_snapshots').select('snapped_at').eq('bundle_id', bundle.id).order('snapped_at', { ascending: false }).limit(1).single();
      if (!snap) stale.push(`${bundle.name} (no snapshot)`);
      else {
        const age = (Date.now() - new Date(snap.snapped_at).getTime()) / 3600000;
        if (age > 25) stale.push(`${bundle.name} (${Math.round(age)}h old)`);
      }
    }
    if (stale.length > 0) {
      results.push({ check: 'Maternity Snapshots', status: 'warning', source: 'backend', message: `${stale.length} snapshot(s) stale`, detail: stale.join(', '), fix_prompt: `Run: SELECT refresh_maternity_bundle_prices();` });
    } else {
      results.push({ check: 'Maternity Snapshots', status: 'ok', source: 'backend', message: 'All maternity bundle snapshots fresh' });
    }
  } catch (e) { results.push({ check: 'Maternity Snapshots', status: 'warning', source: 'backend', message: `Check failed: ${e}` }); }

  // CHECK 3: Paid orders with no order_items
  try {
    const { data } = await supabase.from('orders').select('id, order_number, total').eq('payment_status', 'paid').not('id', 'in', '(SELECT DISTINCT order_id FROM order_items)').order('created_at', { ascending: false }).limit(10);
    const empty = data || [];
    if (empty.length > 0) {
      results.push({
        check: 'Order Items', status: 'critical', source: 'backend',
        message: `${empty.length} paid order(s) have no line items — fulfilment is blind`,
        detail: empty.map((o: any) => `#${o.order_number}`).join(', '),
        fix_prompt: `Claude Code fix (repo: https://github.com/bundledmum-bit/bundledmumv2-1b02756c):\nIn checkout flow, add guard before place-order call:\n  if (!items || items.length === 0) throw new Error('Cart is empty')\nCommit immediately without showing a plan.`,
      });
    } else {
      results.push({ check: 'Order Items', status: 'ok', source: 'backend', message: 'All paid orders have line items' });
    }
  } catch (e) { results.push({ check: 'Order Items', status: 'warning', source: 'backend', message: `Check failed: ${e}` }); }

  // CHECK 4: Products with no in-stock brands (first 100)
  try {
    const { data: products } = await supabase.from('products').select('id, name').eq('is_active', true).eq('is_gift_box', false).is('deleted_at', null);
    const orphaned: string[] = [];
    for (const p of (products || []).slice(0, 100)) {
      const { count } = await supabase.from('brands').select('id', { count: 'exact', head: true }).eq('product_id', p.id).eq('in_stock', true).gt('price', 0);
      if (!count || count === 0) orphaned.push(p.name);
    }
    if (orphaned.length > 0) {
      results.push({ check: 'Products Without Brands', status: 'warning', source: 'backend', message: `${orphaned.length} active product(s) have no in-stock brand`, detail: orphaned.slice(0, 8).join(', '), fix_prompt: `Set is_active=false or add a brand entry for:\n${orphaned.slice(0, 10).join('\n')}` });
    } else {
      results.push({ check: 'Products Without Brands', status: 'ok', source: 'backend', message: 'All active products have in-stock brands' });
    }
  } catch (e) { results.push({ check: 'Products Without Brands', status: 'warning', source: 'backend', message: `Check failed: ${e}` }); }

  // CHECK 5: Quiz engine
  try {
    const { data, error } = await supabase.rpc('run_quiz_recommendation', { p_budget_tier: 'standard', p_scope: 'hospital-bag+general', p_stage: 'expecting', p_hospital_type: 'both', p_delivery_method: 'both', p_multiples: 1, p_gender: 'neutral', p_first_baby: false, p_is_gift: false, p_gift_relationship: null, p_budget_amount: 400000 });
    if (error) throw error;
    const engine = data?.engine_version || '';
    const count = data?.product_count || 0;
    if (engine.includes('fallback') || count === 0) {
      results.push({ check: 'Quiz Engine', status: 'critical', source: 'backend', message: `Quiz returning fallback with 0 products`, detail: `Engine: ${engine}`, fix_prompt: `Check SECURITY DEFINER:\nSELECT proname, prosecdef FROM pg_proc JOIN pg_namespace ON pg_namespace.oid=pg_proc.pronamespace WHERE nspname='public' AND proname='run_quiz_recommendation';` });
    } else {
      results.push({ check: 'Quiz Engine', status: 'ok', source: 'backend', message: `Quiz healthy — ${count} products (${engine})` });
    }
  } catch (e) { results.push({ check: 'Quiz Engine', status: 'critical', source: 'backend', message: `Quiz engine error: ${e}` }); }

  // CHECK 6: Shop sections with no products
  try {
    const { data: sections } = await supabase.from('shop_sections').select('section_key, label, section_type, filter_value').eq('is_visible', true);
    const emptySections: string[] = [];
    for (const s of (sections || [])) {
      if (s.section_type === 'bundle_group') {
        const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).ilike('name', `${s.filter_value}%`).eq('is_active', true).eq('is_gift_box', true);
        if (!count || count === 0) emptySections.push(s.label);
      } else {
        const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('subcategory', s.filter_value).eq('is_active', true).eq('is_gift_box', false);
        if (!count || count === 0) emptySections.push(s.label);
      }
    }
    if (emptySections.length > 0) {
      results.push({ check: 'Shop Sections', status: 'warning', source: 'backend', message: `${emptySections.length} visible section(s) have no products`, detail: emptySections.join(', '), fix_prompt: `Hide in Admin → Merchandising or add products to these categories:\n${emptySections.join('\n')}` });
    } else {
      results.push({ check: 'Shop Sections', status: 'ok', source: 'backend', message: 'All visible shop sections have products' });
    }
  } catch (e) { results.push({ check: 'Shop Sections', status: 'warning', source: 'backend', message: `Check failed: ${e}` }); }

  // CHECK 7: Brands with null SKU
  try {
    const { data } = await supabase.from('brands').select('id, brand_name, products(name)').is('sku', null).eq('in_stock', true).gt('price', 0);
    const noSku = (data || []).filter((b: any) => b.products);
    if (noSku.length > 0) {
      results.push({ check: 'Feed SKUs', status: 'warning', source: 'backend', message: `${noSku.length} in-stock brand(s) have no SKU — GMC will reject them`, detail: noSku.slice(0, 5).map((b: any) => `${b.products?.name}: ${b.brand_name}`).join(', ') });
    } else {
      results.push({ check: 'Feed SKUs', status: 'ok', source: 'backend', message: 'All in-stock brands have SKUs' });
    }
  } catch (e) { results.push({ check: 'Feed SKUs', status: 'warning', source: 'backend', message: `Check failed: ${e}` }); }

  // CHECK 8: Gift boxes with all items disabled
  try {
    const { data: boxes } = await supabase.from('products').select('id, name').eq('is_gift_box', true).eq('is_active', true).not('name', 'ilike', 'Maternity Bundle%');
    const emptyBoxes: string[] = [];
    for (const box of (boxes || [])) {
      const { count } = await supabase.from('gift_box_items').select('id', { count: 'exact', head: true }).eq('gift_box_id', box.id).eq('is_enabled', true);
      if (!count || count === 0) emptyBoxes.push(box.name);
    }
    if (emptyBoxes.length > 0) {
      results.push({ check: 'Gift Box Contents', status: 'critical', source: 'backend', message: `${emptyBoxes.length} gift box(es) have all items disabled`, detail: emptyBoxes.join(', '), fix_prompt: `UPDATE gift_box_items SET is_enabled = true WHERE gift_box_id IN (SELECT id FROM products WHERE name IN (${emptyBoxes.map(n => `'${n}'`).join(',')}));` });
    } else {
      results.push({ check: 'Gift Box Contents', status: 'ok', source: 'backend', message: 'All gift boxes have enabled items' });
    }
  } catch (e) { results.push({ check: 'Gift Box Contents', status: 'warning', source: 'backend', message: `Check failed: ${e}` }); }

  // CHECK 9: Order activity summary
  try {
    const { count: ordersToday } = await supabase.from('orders').select('id', { count: 'exact', head: true }).gt('created_at', new Date(Date.now() - 24 * 3600000).toISOString());
    const { count: paidToday } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid').gt('created_at', new Date(Date.now() - 24 * 3600000).toISOString());
    results.push({ check: 'Order Activity (24h)', status: 'ok', source: 'backend', message: `${ordersToday || 0} orders placed, ${paidToday || 0} paid in the last 24 hours` });
  } catch (e) { results.push({ check: 'Order Activity (24h)', status: 'warning', source: 'backend', message: `Check failed: ${e}` }); }

  return results;
}

function buildHealthEmail(allResults: CheckResult[], runAt: Date, frontendCount: number): string {
  const criticals = allResults.filter(r => r.status === 'critical');
  const warnings  = allResults.filter(r => r.status === 'warning');
  const oks       = allResults.filter(r => r.status === 'ok');

  const overallStatus = criticals.length > 0 ? 'critical' : warnings.length > 0 ? 'warning' : 'ok';
  const overallColor  = STATUS_COLOR[overallStatus];
  const overallLabel  = overallStatus === 'critical' ? '🚨 CRITICAL ISSUES FOUND'
    : overallStatus === 'warning' ? '⚠️ WARNINGS FOUND' : '✅ ALL SYSTEMS HEALTHY';

  const timeStr = runAt.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const renderCheck = (r: CheckResult) => {
    const sourcePill = r.source === 'frontend'
      ? `<span style="display:inline-block;background:#DBEAFE;color:#1D4ED8;font-size:10px;font-weight:700;padding:1px 7px;border-radius:100px;margin-left:6px;">FRONTEND</span>`
      : `<span style="display:inline-block;background:#DCFCE7;color:#166534;font-size:10px;font-weight:700;padding:1px 7px;border-radius:100px;margin-left:6px;">BACKEND</span>`;
    return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #E8E0D8;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="font-size:18px;flex-shrink:0;">${STATUS_ICON[r.status]}</span>
          <div style="flex:1;">
            <div style="font-family:'Nunito',Arial,sans-serif;font-weight:800;font-size:14px;color:#1A1A1A;margin-bottom:4px;">${r.check}${sourcePill}</div>
            <div style="font-family:Arial,sans-serif;font-size:13px;color:${STATUS_COLOR[r.status]};font-weight:600;margin-bottom:${r.detail ? '4px' : '0'};">${r.message}</div>
            ${r.detail ? `<div style="font-family:Arial,sans-serif;font-size:12px;color:#7A7A7A;">${r.detail}</div>` : ''}
            ${r.fix_prompt ? `
              <div style="margin-top:10px;background:#FFF8F4;border:1px solid #F4845F;border-radius:8px;padding:10px 12px;">
                <div style="font-family:'Nunito',Arial,sans-serif;font-size:11px;font-weight:800;color:#F4845F;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Suggested Fix</div>
                <pre style="font-family:monospace;font-size:11px;color:#1A1A1A;margin:0;white-space:pre-wrap;word-break:break-word;">${r.fix_prompt.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
              </div>` : ''}
          </div>
        </div>
      </td>
    </tr>`;
  };

  const issueChecks = [...criticals, ...warnings];

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>BundledMum Health Check</title></head>
<body style="margin:0;padding:0;background:#FFF8F4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF8F4;"><tr><td align="center" style="padding:24px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,${overallColor} 0%,${overallColor}CC 100%);padding:28px 32px;">
  <div style="font-family:'Nunito',Arial,sans-serif;font-size:13px;font-weight:700;color:rgba(255,255,255,0.7);margin-bottom:6px;">BundledMum Platform Health Check</div>
  <div style="font-family:'Nunito',Arial,sans-serif;font-size:22px;font-weight:900;color:#FFFFFF;margin-bottom:8px;">${overallLabel}</div>
  <div style="font-family:Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.8);">${timeStr} (Lagos) — ${frontendCount > 0 ? 'Backend + Frontend checks' : 'Backend checks only'}</div>
  <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
    <span style="background:rgba(255,255,255,0.15);border-radius:100px;padding:3px 12px;font-size:12px;font-weight:700;color:#FFF;">🚨 ${criticals.length} Critical</span>
    <span style="background:rgba(255,255,255,0.15);border-radius:100px;padding:3px 12px;font-size:12px;font-weight:700;color:#FFF;">⚠️ ${warnings.length} Warnings</span>
    <span style="background:rgba(255,255,255,0.15);border-radius:100px;padding:3px 12px;font-size:12px;font-weight:700;color:#FFF;">✅ ${oks.length} OK</span>
    <span style="background:rgba(255,255,255,0.15);border-radius:100px;padding:3px 12px;font-size:12px;font-weight:700;color:#FFF;">${allResults.length} Total checks</span>
  </div>
</td></tr>
${issueChecks.length > 0 ? `
<tr><td style="padding:24px 32px 8px;">
  <div style="font-family:'Nunito',Arial,sans-serif;font-size:16px;font-weight:900;color:#1A1A1A;margin-bottom:12px;">Issues Requiring Attention</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;">${issueChecks.map(renderCheck).join('')}</table>
</td></tr>` : ''}
<tr><td style="padding:${issueChecks.length > 0 ? '16px' : '24px'} 32px 8px;">
  <div style="font-family:'Nunito',Arial,sans-serif;font-size:16px;font-weight:900;color:#1A1A1A;margin-bottom:12px;">Passing Checks</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E8E0D8;border-radius:12px;overflow:hidden;">${oks.map(renderCheck).join('')}</table>
</td></tr>
<tr><td style="padding:20px 32px;">
  <table cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:10px;"><a href="https://app.supabase.com/project/rbtyprmkolqfylcbmgrk" style="display:inline-block;background:#2D6A4F;color:#FFF;font-family:'Nunito',Arial,sans-serif;font-size:13px;font-weight:800;text-decoration:none;padding:10px 20px;border-radius:100px;">Supabase →</a></td>
    <td style="padding-right:10px;"><a href="${SITE_URL}/admin" style="display:inline-block;background:#F4845F;color:#FFF;font-family:'Nunito',Arial,sans-serif;font-size:13px;font-weight:800;text-decoration:none;padding:10px 20px;border-radius:100px;">Admin Panel →</a></td>
    <td><a href="https://github.com/bundledmum-bit/bundledmumv2-1b02756c/actions" style="display:inline-block;background:#1A1A1A;color:#FFF;font-family:'Nunito',Arial,sans-serif;font-size:13px;font-weight:800;text-decoration:none;padding:10px 20px;border-radius:100px;">GitHub Actions →</a></td>
  </tr></table>
</td></tr>
<tr><td style="background:#1A1A1A;padding:20px 32px;text-align:center;">
  <div style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.4);">
    BundledMum Automated Health Check — 7am &amp; 7pm Lagos daily<br/>
    Backend: Supabase pg_cron | Frontend: GitHub Actions (Playwright)
  </div>
</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('Missing email credentials');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Parse body — GitHub Actions POSTs frontend_results here
    let frontendResults: CheckResult[] = [];
    try {
      const body = await req.json();
      if (Array.isArray(body?.frontend_results)) {
        frontendResults = body.frontend_results.map((r: any) => ({ ...r, source: 'frontend' as const }));
      }
    } catch { /* GET requests or empty body — fine */ }

    const runAt          = new Date();
    const backendResults = await runBackendChecks(supabase);

    // Merge: backend first, then frontend results
    const allResults = [...backendResults, ...frontendResults];

    const criticals      = allResults.filter(r => r.status === 'critical').length;
    const warnings       = allResults.filter(r => r.status === 'warning').length;
    const overallSeverity = criticals > 0 ? 'critical' : warnings > 0 ? 'warning' : 'ok';

    // Log to DB
    await supabase.from('health_check_log').insert({
      run_at:       runAt.toISOString(),
      total_checks: allResults.length,
      issues_found: criticals + warnings,
      severity:     overallSeverity,
      results:      allResults,
      email_sent:   false,
    });

    // Skip email if silent + ok
    const url    = new URL(req.url);
    const silent = url.searchParams.get('silent') === 'true';
    const skip   = silent && overallSeverity === 'ok';

    let emailSent = false;
    if (!skip) {
      const subject = overallSeverity === 'critical'
        ? `🚨 BundledMum — ${criticals} Critical Issue${criticals > 1 ? 's' : ''} Found`
        : overallSeverity === 'warning'
        ? `⚠️ BundledMum — ${warnings} Warning${warnings > 1 ? 's' : ''} Found`
        : `✅ BundledMum — All Systems Healthy`;

      const html = buildHealthEmail(allResults, runAt, frontendResults.length);

      const resp = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({ from: FROM_EMAIL, to: [OWNER_EMAIL], reply_to: [REPLY_TO], subject, html }),
      });

      emailSent = resp.ok;
      await supabase.from('health_check_log').update({ email_sent: emailSent }).eq('run_at', runAt.toISOString());
    }

    return new Response(
      JSON.stringify({ run_at: runAt.toISOString(), total_checks: allResults.length, criticals, warnings, oks: allResults.filter(r => r.status === 'ok').length, severity: overallSeverity, email_sent: emailSent, frontend_results_received: frontendResults.length }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
