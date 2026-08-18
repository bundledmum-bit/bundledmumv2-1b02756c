import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

// Channel-agnostic notification dispatcher. Callers name an EVENT, not a channel.
// Which channels fire is configuration, so SMS and WhatsApp can be switched on
// later from admin without touching any calling code.

function toIntlPhone(raw: unknown): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.startsWith('234') && d.length === 13) return d;
  if (d.startsWith('0') && d.length === 11) return '234' + d.slice(1);
  if (d.length === 10) return '234' + d;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const { event_key, order_id, dispute_id, offer_id, email, phone } = await req.json().catch(() => ({}));
    if (!event_key) return json({ error: 'event_key is required' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: ev } = await db
      .from('marketplace_notification_events')
      .select('*')
      .eq('event_key', event_key)
      .maybeSingle();
    if (!ev) return json({ error: 'Unknown event: ' + event_key }, 404);

    const results: Record<string, string> = {};
    const logRow = async (channel: string, recipient: string, status: string, detail?: string) => {
      await db.from('marketplace_notification_log').insert({
        event_key, channel, recipient, status,
        detail: detail ?? null,
        reference_id: order_id ?? dispute_id ?? offer_id ?? null,
      });
    };

    // EMAIL, the only channel implemented today. Delegates to the existing
    // template senders rather than duplicating rendering.
    if (ev.email_enabled && ev.email_template_slug) {
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-marketplace-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: ev.email_template_slug, order_id, dispute_id }),
        });
        results.email = res.ok ? 'sent' : 'failed';
        await logRow('email', email ?? 'template resolved', res.ok ? 'sent' : 'failed');
      } catch (e) {
        results.email = 'failed';
        await logRow('email', email ?? 'unknown', 'failed', String(e));
      }
    } else {
      results.email = 'skipped';
    }

    // SMS, wired but intentionally inert until a provider key and an approved
    // sender ID exist. Termii transactional route only, the promotional route
    // silently fails to DND numbers and is blocked on MTN between 8pm and 8am.
    if (ev.sms_enabled) {
      const { data: masterSetting } = await db.from('site_settings').select('value').eq('key', 'marketplace_sms_enabled').maybeSingle();
      const smsOn = masterSetting?.value === true;
      const apiKey = Deno.env.get('TERMII_API_KEY');
      const to = toIntlPhone(phone);

      if (!smsOn) {
        results.sms = 'skipped, master switch off';
        await logRow('sms', to ?? 'unknown', 'skipped', 'marketplace_sms_enabled is false');
      } else if (!apiKey) {
        results.sms = 'skipped, no provider key';
        await logRow('sms', to ?? 'unknown', 'skipped', 'TERMII_API_KEY not set');
      } else if (!to) {
        results.sms = 'skipped, no valid phone';
        await logRow('sms', String(phone ?? ''), 'skipped', 'no valid Nigerian phone number');
      } else if (!ev.sms_body) {
        results.sms = 'skipped, no sms body';
        await logRow('sms', to, 'skipped', 'event has no sms_body configured');
      } else {
        try {
          const { data: senderSetting } = await db.from('site_settings').select('value').eq('key', 'marketplace_sms_sender_id').maybeSingle();
          const sender = String(senderSetting?.value ?? 'BundledMum');

          const res = await fetch('https://api.ng.termii.com/api/sms/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to,
              from: sender,
              sms: ev.sms_body,
              type: 'plain',
              channel: 'dnd', // transactional route, reaches DND numbers and is not time restricted
              api_key: apiKey,
            }),
          });
          const body = await res.json().catch(() => ({}));
          results.sms = res.ok ? 'sent' : 'failed';
          await logRow('sms', to, res.ok ? 'sent' : 'failed', res.ok ? null : JSON.stringify(body).slice(0, 300));
        } catch (e) {
          results.sms = 'failed';
          await logRow('sms', to, 'failed', String(e));
        }
      }
    } else {
      results.sms = 'not enabled for this event';
    }

    // WHATSAPP, not implemented. Needs Meta business verification, a dedicated
    // number, and per template approval before anything can send.
    results.whatsapp = ev.whatsapp_enabled ? 'not implemented yet' : 'not enabled for this event';

    return json({ event_key, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
