import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FROM_EMAIL  = 'BundledMum Admin <hello@bundledmum.com>';
const REPLY_TO    = 'hello@bundledmum.ng';

function parseRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const cleaned = String(raw).replace(/^\"|\"$/g, '');
  const tokens = cleaned
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const valid: string[] = [];
  const seen = new Set<string>();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const t of tokens) {
    if (!emailRegex.test(t)) continue;
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    valid.push(t);
  }
  return valid;
}

// Sends via Resend directly (api.resend.com), matching the marketplace email
// functions. Previously this routed through the Lovable connector gateway with
// LOVABLE_API_KEY, which returned 401 "Credential not found"; the marketplace
// path never used the gateway, so we align to it. The `resendKey` (RESEND_API_KEY)
// is the bearer; the request body is unchanged.
async function sendViaGateway(
  recipients: string[],
  subject: string,
  html: string,
  resendKey: string
): Promise<{ ok: boolean; status: number; body: string }> {
  if (recipients.length === 0) return { ok: false, status: 0, body: 'no recipients' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipients,
        reply_to: [REPLY_TO],
        subject,
        html,
      }),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

function renderTemplate(
  html: string,
  subject: string,
  vars: Record<string, string>
): { html: string; subject: string } {
  let h = html;
  let s = subject;
  for (const [k, v] of Object.entries(vars)) {
    h = h.replaceAll(`{{${k}}}`, v ?? '');
    s = s.replaceAll(`{{${k}}}`, v ?? '');
  }
  return { html: h, subject: s };
}

function nairaFormat(amount: number): string {
  return '₦' + amount.toLocaleString('en-NG');
}

function capitalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lagosTime(isoString: string | null): string {
  if (!isoString) return 'N/A';
  return new Date(isoString).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { notification_type, order_id, return_id } = body;

    if (!notification_type) {
      return new Response(
        JSON.stringify({ error: 'notification_type is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey      = Deno.env.get('RESEND_API_KEY');
    const supabase       = createClient(supabaseUrl, serviceRoleKey);

    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY required' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: settings } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', [
        'fulfilment_manager_email',
        'order_manager_email',
        'customer_experience_email',
        'bank_name',
        'bank_account_number',
        'bank_account_name',
      ]);

    const settingsMap: Record<string, string> = {};
    for (const s of settings ?? []) {
      const raw = s.value;
      settingsMap[s.key] = typeof raw === 'string' ? raw : String(raw).replace(/^\"|\"$/g, '');
    }

    const superAdminFallback = async (): Promise<string[]> => {
      const { data } = await supabase
        .from('admin_users')
        .select('email')
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      return [data?.email ?? 'iceboxx766@gmail.com'];
    };

    const fulfilmentRecipients = parseRecipients(settingsMap['fulfilment_manager_email']);
    const orderManagerRecipients = parseRecipients(settingsMap['order_manager_email']);
    const cxRecipients = parseRecipients(settingsMap['customer_experience_email']);

    const finalFulfilment =
      fulfilmentRecipients.length > 0 ? fulfilmentRecipients : await superAdminFallback();
    const finalOrderManager =
      orderManagerRecipients.length > 0 ? orderManagerRecipients : await superAdminFallback();
    const finalCx =
      cxRecipients.length > 0 ? cxRecipients : await superAdminFallback();

    const respond = (recipients: string[], result: { ok: boolean; status: number; body: string }) => {
      return new Response(
        JSON.stringify({
          success: result.ok,
          gateway_status: result.status,
          gateway_response: result.body,
          sent_to: recipients,
          notification_type,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    };

    // ============================================================
    // NEW PAID ORDER
    // ============================================================
    if (notification_type === 'internal_new_paid_order') {
      if (!order_id) {
        return new Response(JSON.stringify({ error: 'order_id required' }), { status: 400, headers: corsHeaders });
      }
      const { data: order, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_phone, total, delivery_state, delivery_city, payment_method, updated_at')
        .eq('id', order_id).single();
      if (error || !order) {
        return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: corsHeaders });
      }
      const { count: itemCount } = await supabase
        .from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', order_id);
      const { data: tmpl } = await supabase
        .from('email_templates').select('html_body, subject, is_active').eq('slug', 'internal_new_paid_order').single();
      if (!tmpl?.is_active) {
        return new Response(JSON.stringify({ skipped: 'template inactive' }), { status: 200, headers: corsHeaders });
      }
      const primaryRecipient = finalFulfilment[0];
      const vars: Record<string, string> = {
        recipient_name: primaryRecipient.split('@')[0],
        order_number:   order.order_number,
        order_id:       order.id,
        customer_name:  order.customer_name ?? 'N/A',
        customer_phone: order.customer_phone ?? 'N/A',
        item_count:     String(itemCount ?? 0),
        total_naira:    nairaFormat(order.total),
        delivery_state: order.delivery_state ?? 'N/A',
        delivery_city:  order.delivery_city ?? 'N/A',
        paid_at:        lagosTime(order.updated_at),
      };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const result = await sendViaGateway(finalFulfilment, subject, html, resendKey);
      return respond(finalFulfilment, result);
    }

    // ============================================================
    // NEW SUBSCRIPTION DELIVERY ORDER
    // Fired by process-subscriptions when a subscription auto-renews
    // and creates a delivery order. Subscription context throughout.
    // Uses the fulfilment manager recipient (same as new paid order).
    // ============================================================
    if (notification_type === 'internal_subscription_order') {
      if (!order_id) {
        return new Response(JSON.stringify({ error: 'order_id required' }), { status: 400, headers: corsHeaders });
      }
      const { data: order, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_phone, total, delivery_state, delivery_city, created_at, subscription_order_id')
        .eq('id', order_id).single();
      if (error || !order) {
        return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: corsHeaders });
      }

      // Resolve subscription context: order -> subscription_orders -> subscriptions
      let cycleNumber = '1';
      let frequency = '';
      let deliveryDay = '';
      if (order.subscription_order_id) {
        const { data: so } = await supabase
          .from('subscription_orders')
          .select('cycle_number, subscription_id')
          .eq('id', order.subscription_order_id).single();
        if (so) {
          cycleNumber = String(so.cycle_number ?? 1);
          if (so.subscription_id) {
            const { data: sub } = await supabase
              .from('subscriptions')
              .select('frequency, delivery_day')
              .eq('id', so.subscription_id).single();
            if (sub) {
              frequency = capitalize(sub.frequency);
              deliveryDay = capitalize(sub.delivery_day);
            }
          }
        }
      }

      // Build an item list from the order's line items.
      const { data: items } = await supabase
        .from('order_items')
        .select('product_name, brand_name, quantity')
        .eq('order_id', order_id);
      const itemCount = items?.length ?? 0;
      const itemList = (items ?? [])
        .map((i) => `${i.brand_name ? i.brand_name + ' ' : ''}${i.product_name ?? 'Item'} ×${i.quantity}`)
        .join('<br/>');

      const { data: tmpl } = await supabase
        .from('email_templates').select('html_body, subject, is_active').eq('slug', 'internal_subscription_order').single();
      if (!tmpl?.is_active) {
        return new Response(JSON.stringify({ skipped: 'template inactive' }), { status: 200, headers: corsHeaders });
      }
      const primaryRecipient = finalFulfilment[0];
      const vars: Record<string, string> = {
        recipient_name: primaryRecipient.split('@')[0],
        order_number:   order.order_number,
        order_id:       order.id,
        cycle_number:   cycleNumber,
        frequency:      frequency || 'N/A',
        delivery_day:   deliveryDay || 'N/A',
        customer_name:  order.customer_name ?? 'N/A',
        customer_phone: order.customer_phone ?? 'N/A',
        item_count:     String(itemCount),
        item_list:      itemList || 'See order detail',
        total_naira:    nairaFormat(order.total),
        delivery_state: order.delivery_state ?? 'N/A',
        delivery_city:  order.delivery_city ?? 'N/A',
        paid_at:        lagosTime(order.created_at),
      };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const result = await sendViaGateway(finalFulfilment, subject, html, resendKey);
      return respond(finalFulfilment, result);
    }

    // ============================================================
    // ORDER PICKED
    // ============================================================
    if (notification_type === 'internal_order_picked') {
      if (!order_id) {
        return new Response(JSON.stringify({ error: 'order_id required' }), { status: 400, headers: corsHeaders });
      }
      const { data: order, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, delivery_state, delivery_partner, updated_at')
        .eq('id', order_id).single();
      if (error || !order) {
        return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: corsHeaders });
      }
      const { data: session } = await supabase
        .from('order_picking_sessions')
        .select('id, started_by, started_at, completed_at')
        .eq('order_id', order_id).order('started_at', { ascending: false }).limit(1).single();
      let pickerName = 'Unknown';
      if (session?.started_by) {
        const { data: pickerUser } = await supabase
          .from('admin_users').select('display_name, email').eq('id', session.started_by).single();
        pickerName = pickerUser?.display_name ?? pickerUser?.email ?? 'Unknown';
      }
      const { count: pickedCount } = await supabase
        .from('order_picking_items').select('id', { count: 'exact', head: true })
        .eq('session_id', session?.id ?? '').eq('is_picked', true);
      const { count: totalCount } = await supabase
        .from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', order_id);
      const { data: tmpl } = await supabase
        .from('email_templates').select('html_body, subject, is_active').eq('slug', 'internal_order_picked').single();
      if (!tmpl?.is_active) {
        return new Response(JSON.stringify({ skipped: 'template inactive' }), { status: 200, headers: corsHeaders });
      }
      const primaryRecipient = finalOrderManager[0];
      const vars: Record<string, string> = {
        recipient_name: primaryRecipient.split('@')[0],
        order_number:   order.order_number,
        order_id:       order.id,
        customer_name:  order.customer_name ?? 'N/A',
        items_picked:   String(pickedCount ?? 0),
        total_items:    String(totalCount ?? 0),
        picker_name:    pickerName,
        picked_at:      lagosTime(session?.completed_at ?? session?.started_at ?? null),
        delivery_state: order.delivery_state ?? 'N/A',
        courier:        order.delivery_partner ?? 'TBD',
      };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const result = await sendViaGateway(finalOrderManager, subject, html, resendKey);
      return respond(finalOrderManager, result);
    }

    // ============================================================
    // BANK TRANSFER PENDING
    // ============================================================
    if (notification_type === 'internal_bank_transfer_pending') {
      if (!order_id) {
        return new Response(JSON.stringify({ error: 'order_id required' }), { status: 400, headers: corsHeaders });
      }
      const { data: order, error } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_phone, total, delivery_state, delivery_city, created_at')
        .eq('id', order_id).single();
      if (error || !order) {
        return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: corsHeaders });
      }
      const { count: itemCount } = await supabase
        .from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', order_id);
      const { data: tmpl } = await supabase
        .from('email_templates').select('html_body, subject, is_active').eq('slug', 'internal_bank_transfer_pending').single();
      if (!tmpl?.is_active) {
        return new Response(JSON.stringify({ skipped: 'template inactive' }), { status: 200, headers: corsHeaders });
      }
      const primaryRecipient = finalFulfilment[0];
      const vars: Record<string, string> = {
        recipient_name:      primaryRecipient.split('@')[0],
        order_number:        order.order_number,
        order_id:            order.id,
        customer_name:       order.customer_name ?? 'N/A',
        customer_phone:      order.customer_phone ?? 'N/A',
        item_count:          String(itemCount ?? 0),
        total_naira:         nairaFormat(order.total),
        delivery_state:      order.delivery_state ?? 'N/A',
        delivery_city:       order.delivery_city ?? 'N/A',
        placed_at:           lagosTime(order.created_at),
        bank_name:           settingsMap['bank_name'] ?? 'Kuda',
        bank_account_number: settingsMap['bank_account_number'] ?? '3003758996',
        bank_account_name:   settingsMap['bank_account_name'] ?? 'BundledMum',
      };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const result = await sendViaGateway(finalFulfilment, subject, html, resendKey);
      return respond(finalFulfilment, result);
    }

    // ============================================================
    // RETURN REQUESTED
    // ============================================================
    if (notification_type === 'internal_return_requested') {
      if (!return_id) {
        return new Response(JSON.stringify({ error: 'return_id required' }), { status: 400, headers: corsHeaders });
      }
      const { data: ret, error: retError } = await supabase
        .from('order_returns')
        .select('id, order_id, return_reason, return_reason_notes, return_type, created_at')
        .eq('id', return_id).single();
      if (retError || !ret) {
        return new Response(JSON.stringify({ error: 'Return not found' }), { status: 404, headers: corsHeaders });
      }
      const { data: order } = await supabase
        .from('orders').select('order_number, customer_name, customer_phone, total').eq('id', ret.order_id).single();
      const { data: tmpl } = await supabase
        .from('email_templates').select('html_body, subject, is_active').eq('slug', 'internal_return_requested').single();
      if (!tmpl?.is_active) {
        return new Response(JSON.stringify({ skipped: 'template inactive' }), { status: 200, headers: corsHeaders });
      }
      const primaryRecipient = finalCx[0];
      const vars: Record<string, string> = {
        recipient_name: primaryRecipient.split('@')[0],
        order_number:   order?.order_number ?? 'N/A',
        customer_name:  order?.customer_name ?? 'N/A',
        customer_phone: order?.customer_phone ?? 'N/A',
        total_naira:    order ? nairaFormat(order.total) : 'N/A',
        return_type:    ret.return_type ?? 'N/A',
        return_reason:  ret.return_reason ?? 'N/A',
        return_notes:   ret.return_reason_notes ?? '(none provided)',
        submitted_at:   lagosTime(ret.created_at),
      };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const result = await sendViaGateway(finalCx, subject, html, resendKey);
      return respond(finalCx, result);
    }

    return new Response(
      JSON.stringify({ error: `Unknown notification_type: ${notification_type}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
