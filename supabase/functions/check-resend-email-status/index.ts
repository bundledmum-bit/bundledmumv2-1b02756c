// One-off diagnostic: looks up a specific email's delivery status directly
// from Resend, to distinguish "never delivered" from "delivered and clicked but
// session still failed", which point at completely different root causes.
Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    const { email_id } = await req.json().catch(() => ({}));
    if (!email_id) return json({ error: 'email_id is required' }, 400);

    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) return json({ error: 'RESEND_API_KEY not set' }, 500);

    const res = await fetch(`https://api.resend.com/emails/${email_id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await res.json();
    if (!res.ok) return json({ error: body?.message ?? 'Resend lookup failed', detail: body }, res.status);

    return json(body);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
