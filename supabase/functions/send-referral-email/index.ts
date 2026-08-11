import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Partner-facing emails come from the customer address; internal admin emails
// from the admin address. Both send DIRECTLY to Resend (the Lovable connector
// gateway is dead). Matches send-internal-order-notification / send-transactional-email.
const PARTNER_FROM = 'BundledMum <hello@bundledmum.com>';
const ADMIN_FROM   = 'BundledMum Admin <hello@bundledmum.com>';
const REPLY_TO     = 'hello@bundledmum.ng';

const SLUGS = [
  'referral_partner_intro',
  'referral_commission_earned',
  'internal_referral_costs_needed',
  'internal_referral_payday',
] as const;
type Slug = typeof SLUGS[number];

// --- helpers ---------------------------------------------------------------

function parseRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const cleaned = String(raw).replace(/^\"|\"$/g, '');
  const tokens = cleaned.split(/[\n,;]+/).map((t) => t.trim()).filter((t) => t.length > 0);
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

// Substitute {{key}} in both subject and html.
function renderTemplate(html: string, subject: string, vars: Record<string, string>): { html: string; subject: string } {
  let h = html;
  let s = subject;
  for (const [k, v] of Object.entries(vars)) {
    h = h.replaceAll(`{{${k}}}`, v ?? '');
    s = s.replaceAll(`{{${k}}}`, v ?? '');
  }
  return { html: h, subject: s };
}

// Thousand separators, NO currency symbol — the templates already print ₦.
function plainNaira(amount: number | null | undefined): string {
  return Number(amount ?? 0).toLocaleString('en-NG');
}

// payable_on (a DATE) -> "Monday 25 August 2026" (en-GB avoids the comma en-NG adds).
function friendlyDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos',
  });
}

function firstNameOf(partner: { first_name?: string | null; email?: string | null }): string {
  const fn = (partner.first_name ?? '').trim();
  if (fn) return fn;
  const email = partner.email ?? '';
  return email.includes('@') ? email.split('@')[0] : (email || 'there');
}

// payout_line DIFFERS by partner type. A buyer (or any partner with no bank
// details on file) is NEVER asked for bank details and never shown a partial
// account. Only a seller WITH a bank account gets the "ending 1234" line.
function buildPayoutLine(
  partner: { partner_type?: string | null },
  seller: { bank_account_number?: string | null } | null,
): string {
  const acct = (seller?.bank_account_number ?? '').replace(/\D/g, '');
  if (partner.partner_type === 'seller' && acct.length >= 4) {
    return `Paid into the account you registered with, ending ${acct.slice(-4)}.`;
  }
  return 'We will ask for your account details the first time you earn, so there is nothing to do now.';
}

// wa.me share link. The message is fixed copy with {first_name}/{code} filled in
// and REAL line breaks between paragraphs, then URL-encoded. Contains ?ref={code}.
function buildWhatsappShareUrl(firstName: string, code: string): string {
  const message = [
    `${firstName} is introducing you to bundledmum.com 💚`,
    'They deliver the complete items on your hospital list before your due date, built around your budget, anywhere in Nigeria.',
    'You can send your hospital list to them on WhatsApp: https://wa.me/2347040667424',
    `Or build your own list from your budget here: https://bundledmum.com/quiz?ref=${code}`,
    `Tell them you are from me, my code is ${code} 🎁 You will get a free gift when you order.`,
  ].join('\n\n');
  return 'https://wa.me/?text=' + encodeURIComponent(message);
}

async function sendViaResend(
  to: string[], from: string, subject: string, html: string, resendKey: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  if (to.length === 0) return { ok: false, status: 0, body: 'no recipients' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({ from, to, reply_to: [REPLY_TO], subject, html }),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// --- handler ---------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendKey      = Deno.env.get('RESEND_API_KEY');

    // AUTH: service-role only. Triggers/cron call with the service-role key in the
    // Authorization header. Anonymous callers (anon key) are rejected. verify_jwt
    // is false so the function runs and enforces this itself.
    const authHeader = req.headers.get('Authorization') || '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!serviceRoleKey || bearer !== serviceRoleKey) {
      return json({ error: 'Unauthorized: service role required' }, 401);
    }
    if (!resendKey) return json({ error: 'RESEND_API_KEY required' }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const email_type = body?.email_type as Slug | undefined;
    const partner_id = body?.partner_id as string | undefined;
    const commission_id = body?.commission_id as string | undefined;

    if (!email_type || !SLUGS.includes(email_type)) {
      return json({ error: `Unknown or missing email_type` }, 400);
    }

    // Template fetch + is_active guard (shared by every branch).
    const loadTemplate = async (slug: Slug) => {
      const { data } = await supabase
        .from('email_templates').select('subject, html_body, is_active').eq('slug', slug).single();
      return data;
    };

    // Internal admin recipients — reuse the same resolution the internal order
    // notifier uses (site_settings + super-admin fallback), no hardcoded address.
    const internalRecipients = async (): Promise<string[]> => {
      const { data: settings } = await supabase
        .from('site_settings').select('key, value').in('key', ['order_manager_email', 'fulfilment_manager_email']);
      const map: Record<string, string> = {};
      for (const s of settings ?? []) {
        const raw = s.value;
        map[s.key] = typeof raw === 'string' ? raw : String(raw).replace(/^\"|\"$/g, '');
      }
      const primary = parseRecipients(map['order_manager_email']);
      if (primary.length) return primary;
      const secondary = parseRecipients(map['fulfilment_manager_email']);
      if (secondary.length) return secondary;
      const { data } = await supabase
        .from('admin_users').select('email').eq('role', 'super_admin').eq('is_active', true)
        .order('created_at', { ascending: true }).limit(1).single();
      return [data?.email ?? 'iceboxx766@gmail.com'];
    };

    // Duplicate guard: a send has already happened if EITHER the relevant stamp
    // column is set OR a marketing_email_log row exists for this id + email_type.
    const alreadyLogged = async (keyField: 'partner_id' | 'commission_id', id: string): Promise<boolean> => {
      const { data } = await supabase
        .from('marketing_email_log').select('id').eq('email_type', email_type)
        .contains('metadata', { [keyField]: id }).limit(1);
      return !!(data && data.length);
    };

    const logSend = async (customerEmail: string, orderId: string | null, metadata: Record<string, unknown>) => {
      try {
        await supabase.from('marketing_email_log').insert({
          customer_email: customerEmail,
          email_type,
          order_id: orderId,
          sent_at: new Date().toISOString(),
          metadata,
        });
      } catch (e) { console.error('marketing_email_log insert failed', String(e)); }
    };

    // ========================================================================
    // 1) PARTNER INTRO
    // ========================================================================
    if (email_type === 'referral_partner_intro') {
      if (!partner_id) return json({ error: 'partner_id required' }, 400);
      const { data: partner } = await supabase
        .from('referral_partners')
        .select('id, first_name, email, code, partner_type, seller_id, intro_email_sent_at')
        .eq('id', partner_id).single();
      if (!partner) return json({ error: 'Partner not found' }, 404);
      if (!partner.email) return json({ error: 'Partner has no email' }, 400);
      if (partner.intro_email_sent_at || await alreadyLogged('partner_id', partner_id)) {
        return json({ skipped: 'already sent', email_type });
      }
      const tmpl = await loadTemplate(email_type);
      if (!tmpl?.is_active) return json({ skipped: 'template inactive', email_type });

      let seller: { bank_account_number?: string | null } | null = null;
      if (partner.partner_type === 'seller' && partner.seller_id) {
        const { data } = await supabase.from('marketplace_sellers')
          .select('bank_account_number').eq('id', partner.seller_id).single();
        seller = data ?? null;
      }
      const firstName = firstNameOf(partner);
      const vars: Record<string, string> = {
        first_name:        firstName,
        referral_code:     partner.code,
        payout_line:       buildPayoutLine(partner, seller),
        whatsapp_share_url: buildWhatsappShareUrl(firstName, partner.code),
      };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const result = await sendViaResend([partner.email], PARTNER_FROM, subject, html, resendKey);
      if (!result.ok) return json({ error: 'Resend failed', detail: result.body, status: result.status }, 502);

      await supabase.from('referral_partners').update({ intro_email_sent_at: new Date().toISOString() }).eq('id', partner_id);
      await logSend(partner.email, null, { partner_id, referral_code: partner.code });
      return json({ success: true, email_type, sent_to: partner.email });
    }

    // ========================================================================
    // 2) COMMISSION EARNED (to partner)
    // ========================================================================
    if (email_type === 'referral_commission_earned') {
      if (!commission_id) return json({ error: 'commission_id required' }, 400);
      const { data: commission } = await supabase
        .from('referral_commissions')
        .select('id, partner_id, order_id, commission_naira, payable_on, partner_email_sent_at')
        .eq('id', commission_id).single();
      if (!commission) return json({ error: 'Commission not found' }, 404);
      if (commission.partner_email_sent_at || await alreadyLogged('commission_id', commission_id)) {
        return json({ skipped: 'already sent', email_type });
      }
      const tmpl = await loadTemplate(email_type);
      if (!tmpl?.is_active) return json({ skipped: 'template inactive', email_type });

      const { data: partner } = await supabase
        .from('referral_partners').select('id, first_name, email, code, partner_type, seller_id').eq('id', commission.partner_id).single();
      if (!partner?.email) return json({ error: 'Partner not found or has no email' }, 404);
      const { data: order } = await supabase.from('orders').select('order_number').eq('id', commission.order_id).single();
      let seller: { bank_account_number?: string | null } | null = null;
      if (partner.partner_type === 'seller' && partner.seller_id) {
        const { data } = await supabase.from('marketplace_sellers').select('bank_account_number').eq('id', partner.seller_id).single();
        seller = data ?? null;
      }
      const firstName = firstNameOf(partner);
      const vars: Record<string, string> = {
        first_name:         firstName,
        referral_code:      partner.code,
        payout_line:        buildPayoutLine(partner, seller),
        whatsapp_share_url: buildWhatsappShareUrl(firstName, partner.code),
        commission_amount:  plainNaira(commission.commission_naira),
        order_number:       order?.order_number ?? '',
        payment_date:       friendlyDate(commission.payable_on),
      };
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const result = await sendViaResend([partner.email], PARTNER_FROM, subject, html, resendKey);
      if (!result.ok) return json({ error: 'Resend failed', detail: result.body, status: result.status }, 502);

      await supabase.from('referral_commissions').update({ partner_email_sent_at: new Date().toISOString() }).eq('id', commission_id);
      await logSend(partner.email, commission.order_id, { commission_id, partner_id: partner.id, referral_code: partner.code });
      return json({ success: true, email_type, sent_to: partner.email });
    }

    // ========================================================================
    // 3) INTERNAL — REFERRAL COSTS NEEDED (to admin)
    // ========================================================================
    if (email_type === 'internal_referral_costs_needed') {
      if (!commission_id) return json({ error: 'commission_id required' }, 400);
      const { data: commission } = await supabase
        .from('referral_commissions')
        .select('id, partner_id, order_id, payable_on, admin_notified_at')
        .eq('id', commission_id).single();
      if (!commission) return json({ error: 'Commission not found' }, 404);
      if (commission.admin_notified_at || await alreadyLogged('commission_id', commission_id)) {
        return json({ skipped: 'already sent', email_type });
      }
      const tmpl = await loadTemplate(email_type);
      if (!tmpl?.is_active) return json({ skipped: 'template inactive', email_type });

      const { data: partner } = await supabase.from('referral_partners').select('first_name, email, code').eq('id', commission.partner_id).single();
      const { data: order } = await supabase.from('orders').select('order_number, total').eq('id', commission.order_id).single();
      const partnerName = partner ? firstNameOf(partner) : 'N/A';
      const vars: Record<string, string> = {
        order_number:  order?.order_number ?? 'N/A',
        order_total:   plainNaira(order?.total),
        partner_name:  partnerName,
        referral_code: partner?.code ?? 'N/A',
        payment_date:  friendlyDate(commission.payable_on),
      };
      const recipients = await internalRecipients();
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const result = await sendViaResend(recipients, ADMIN_FROM, subject, html, resendKey);
      if (!result.ok) return json({ error: 'Resend failed', detail: result.body, status: result.status }, 502);

      await supabase.from('referral_commissions').update({ admin_notified_at: new Date().toISOString() }).eq('id', commission_id);
      await logSend(recipients[0], commission.order_id, { commission_id, partner_id: commission.partner_id, referral_code: partner?.code ?? null });
      return json({ success: true, email_type, sent_to: recipients });
    }

    // ========================================================================
    // 4) INTERNAL — REFERRAL PAYDAY (to admin)
    // ========================================================================
    if (email_type === 'internal_referral_payday') {
      if (!commission_id) return json({ error: 'commission_id required' }, 400);
      const { data: commission } = await supabase
        .from('referral_commissions')
        .select('id, partner_id, order_id, commission_naira, payday_reminder_sent_at')
        .eq('id', commission_id).single();
      if (!commission) return json({ error: 'Commission not found' }, 404);
      if (commission.payday_reminder_sent_at || await alreadyLogged('commission_id', commission_id)) {
        return json({ skipped: 'already sent', email_type });
      }
      const tmpl = await loadTemplate(email_type);
      if (!tmpl?.is_active) return json({ skipped: 'template inactive', email_type });

      const { data: partner } = await supabase.from('referral_partners').select('first_name, email, code, seller_id').eq('id', commission.partner_id).single();
      const { data: order } = await supabase.from('orders').select('order_number').eq('id', commission.order_id).single();
      let seller: { bank_name?: string | null; bank_account_name?: string | null; bank_account_number?: string | null } | null = null;
      if (partner?.seller_id) {
        const { data } = await supabase.from('marketplace_sellers')
          .select('bank_name, bank_account_name, bank_account_number').eq('id', partner.seller_id).single();
        seller = data ?? null;
      }
      const vars: Record<string, string> = {
        partner_name:        partner ? firstNameOf(partner) : 'N/A',
        referral_code:       partner?.code ?? 'N/A',
        commission_amount:   plainNaira(commission.commission_naira),
        order_number:        order?.order_number ?? 'N/A',
        bank_name:           seller?.bank_name ?? 'Not on file',
        bank_account_name:   seller?.bank_account_name ?? 'Not on file',
        bank_account_number: seller?.bank_account_number ?? 'Not on file',
      };
      const recipients = await internalRecipients();
      const { html, subject } = renderTemplate(tmpl.html_body, tmpl.subject, vars);
      const result = await sendViaResend(recipients, ADMIN_FROM, subject, html, resendKey);
      if (!result.ok) return json({ error: 'Resend failed', detail: result.body, status: result.status }, 502);

      await supabase.from('referral_commissions').update({ payday_reminder_sent_at: new Date().toISOString() }).eq('id', commission_id);
      await logSend(recipients[0], commission.order_id, { commission_id, partner_id: commission.partner_id, referral_code: partner?.code ?? null });
      return json({ success: true, email_type, sent_to: recipients });
    }

    return json({ error: `Unhandled email_type: ${email_type}` }, 400);

  } catch (err) {
    return json({ error: 'Internal server error', detail: String(err) }, 500);
  }
});
