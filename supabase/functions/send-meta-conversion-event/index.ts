import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

// Sends server-side conversion events to Meta. Customer data is always hashed
// before it leaves this function, raw email or phone never reaches Meta.
//
// IMPORTANT: Meta REJECTS an event outright if it carries no usable matching
// signal, returning a 502. Anonymous visitors have no email or phone, so those
// events must instead carry the browser identifiers Meta can match on, the fbp
// and fbc cookies, plus IP and user agent. If none of that is available either,
// the event is skipped rather than sent, since Meta would reject it anyway and
// a rejection surfacing to the visitor is far worse than a missing datapoint.

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalisePhoneForHash(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.startsWith('234')) return d;
  if (d.startsWith('0')) return '234' + d.slice(1);
  return d.length === 10 ? '234' + d : d;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const ok = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: enabledSetting } = await db.from('site_settings').select('value').eq('key', 'meta_conversions_api_enabled').maybeSingle();
    if (enabledSetting?.value !== true) return ok({ skipped: 'Conversions API not enabled' });

    const { data: pixelSetting } = await db.from('site_settings').select('value').eq('key', 'meta_pixel_id').maybeSingle();
    const pixelId = String(pixelSetting?.value ?? '').trim();
    const accessToken = Deno.env.get('META_ACCESS_TOKEN');

    if (!pixelId) return ok({ skipped: 'no Pixel ID configured' });
    if (!accessToken) return ok({ skipped: 'META_ACCESS_TOKEN not set' });

    const {
      event_name,
      event_id,
      event_source_url,
      value,
      content_id,
      content_name,
      content_type,     // 'product', needed for dynamic catalog ads to resolve
      num_items,        // context on checkout events
      email,
      phone,
      fbp,              // Meta's own browser cookie, present for most visitors
      fbc,              // Meta's click id cookie, present when they arrived from an ad
      client_ip_address,
      client_user_agent,
      test_event_code,
    } = await req.json().catch(() => ({}));

    if (!event_name) return ok({ skipped: 'event_name is required' });

    const userData: Record<string, unknown> = {};
    if (email) userData.em = [await sha256Hex(String(email))];
    if (phone) userData.ph = [await sha256Hex(normalisePhoneForHash(String(phone)))];
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;

    const ip = client_ip_address
      || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || null;
    const ua = client_user_agent || req.headers.get('user-agent') || null;
    if (ip) userData.client_ip_address = ip;
    if (ua) userData.client_user_agent = ua;

    const hasUsableSignal = Boolean(userData.em || userData.ph || userData.fbp || userData.fbc);
    if (!hasUsableSignal) {
      return ok({ skipped: 'no usable matching signal, event not sent', event_name });
    }

    const customData: Record<string, unknown> = {};
    if (value != null) { customData.value = Number(value); customData.currency = 'NGN'; }
    if (content_id) customData.content_ids = [content_id];
    if (content_name) customData.content_name = content_name;
    // content_ids alone is not enough for dynamic ads, Meta needs to know these
    // ids refer to catalog products rather than something else
    if (content_type) customData.content_type = content_type;
    if (num_items != null) customData.num_items = Number(num_items);

    const payload: Record<string, unknown> = {
      data: [{
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: event_id ?? undefined,
        event_source_url: event_source_url ?? undefined,
        action_source: 'website',
        user_data: userData,
        custom_data: Object.keys(customData).length ? customData : undefined,
      }],
    };
    if (test_event_code) payload.test_event_code = test_event_code;

    const res = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();

    if (!res.ok) {
      console.error('Meta rejected event', event_name, JSON.stringify(body));
      return ok({ skipped: 'Meta rejected the event', event_name, detail: body?.error?.message ?? null });
    }

    return ok({ sent: true, event_name, meta_response: body });
  } catch (e) {
    console.error('Conversion event error', e);
    return ok({ skipped: 'error', detail: e instanceof Error ? e.message : String(e) });
  }
});
