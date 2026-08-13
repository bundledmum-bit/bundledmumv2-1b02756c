import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Save, Mail, Eye, EyeOff, Send, X, Clock, Zap, Power, AlertTriangle, Filter } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

// ---------------------------------------------------------------------------
// Placeholder + preview data — kept verbatim from the previous version so the
// existing edit / preview experience is unchanged.
// ---------------------------------------------------------------------------

const TEMPLATE_PLACEHOLDERS: Record<string, string[]> = {
  order_confirmation: [
    "{{customer_name}}", "{{first_name}}", "{{customer_phone}}", "{{order_number}}", "{{order_date}}",
    "{{items_html}}", "{{items_table}}", "{{subtotal}}", "{{delivery_fee}}", "{{service_fee}}",
    "{{discount_amount}}", "{{total}}", "{{delivery_address}}", "{{delivery_city}}",
    "{{delivery_state}}", "{{payment_method}}", "{{order_status}}", "{{estimated_delivery}}",
    "{{bank_name}}", "{{bank_account_name}}", "{{bank_account_number}}",
    "{{whatsapp_url}}", "{{referral_code}}", "{{referral_amount}}",
  ],
  payment_received: [
    "{{customer_name}}", "{{first_name}}", "{{customer_phone}}", "{{order_number}}", "{{total}}",
    "{{payment_method}}", "{{payment_reference}}", "{{payment_date}}",
    "{{estimated_delivery}}", "{{whatsapp_url}}",
  ],
  order_shipped: [
    "{{customer_name}}", "{{first_name}}", "{{customer_phone}}", "{{order_number}}",
    "{{delivery_address}}", "{{delivery_city}}", "{{delivery_state}}",
    "{{estimated_delivery}}", "{{tracking_number}}", "{{order_status}}", "{{whatsapp_url}}",
  ],
  order_delivered: [
    "{{customer_name}}", "{{first_name}}", "{{customer_phone}}", "{{order_number}}",
    "{{delivery_date}}", "{{delivery_city}}", "{{delivery_state}}",
    "{{referral_code}}", "{{referral_amount}}",
    "{{review_url}}", "{{whatsapp_url}}",
  ],
  account_welcome: [
    "{{customer_name}}", "{{first_name}}", "{{referral_code}}", "{{referral_amount}}", "{{whatsapp_url}}",
  ],
  referral_code_activated: [
    "{{customer_name}}", "{{first_name}}", "{{referral_code}}",
    "{{referral_amount}}", "{{referral_link}}", "{{whatsapp_share_url}}",
  ],
  abandoned_cart: [
    "{{customer_name}}", "{{first_name}}", "{{cart_items_html}}",
    "{{cart_total}}", "{{cart_url}}", "{{coupon_code}}", "{{coupon_discount}}",
  ],
  reorder_reminder: [
    "{{customer_name}}", "{{first_name}}", "{{reorder_items_html}}", "{{recommendations_html}}",
    "{{last_order_number}}", "{{last_order_date}}", "{{shop_url}}", "{{whatsapp_url}}",
  ],
};

// The marketplace_* templates store BODY FRAGMENTS in a shorthand; their shared
// header, logo, footer and styling are applied by the sender at send time. These
// are the placeholders those fragments support (rendered by the sender), so the
// sidebar lists them instead of "No placeholders defined". Preview for these
// templates goes through the preview-marketplace-email edge function, not the
// client-side applyPreviewData used for storefront templates.
const MARKETPLACE_PLACEHOLDERS: string[] = [
  "{{buyer_name}}", "{{seller_name}}", "{{listing_title}}", "{{order_reference}}",
  "{{order_date}}", "{{amount_paid}}", "{{seller_amount}}", "{{platform_margin}}",
  "{{strike_count}}", "{{seller_phone}}", "{{payout_bank}}", "{{window_days}}",
  "{{deadline_date}}", "{{dispute_reason}}", "{{outcome_note}}", "{{rejection_reason}}",
  "{{item_card}}", "{{contact_block}}", "{{dispatch_photo_block}}", "{{outcome_block}}",
  "{{refund_timing_block}}", "{{payout_table}}", "{{payout_count}}", "{{payout_total}}",
  "{{open_disputes}}", "{{pending_reviews}}", "{{refunds_pending}}", "{{held_funds}}",
  "{{primary_button:Your label here}}",
];

const SAMPLE_DATA: Record<string, string> = {
  "{{customer_name}}": "Amara Okafor",
  "{{first_name}}": "Amara",
  "{{customer_phone}}": "08012345678",
  "{{order_number}}": "BM-20260416-0042",
  "{{order_date}}": "Wednesday, 16 April 2026",
  "{{items_html}}": `<table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;border-bottom:1px solid #eee">Hospital Bag Essentials Bundle × 1</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₦45,000</td></tr><tr><td style="padding:8px;border-bottom:1px solid #eee">Newborn Care Kit × 1</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₦28,000</td></tr></table>`,
  "{{items_table}}": `<table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;border-bottom:1px solid #eee">Hospital Bag Essentials Bundle × 1</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₦45,000</td></tr></table>`,
  "{{subtotal}}": "₦73,000",
  "{{delivery_fee}}": "₦3,500",
  "{{service_fee}}": "₦500",
  "{{discount_amount}}": "₦2,000",
  "{{total}}": "₦75,000",
  "{{delivery_address}}": "12 Admiralty Way, Lekki Phase 1",
  "{{delivery_city}}": "Lagos",
  "{{delivery_state}}": "Lagos",
  "{{payment_method}}": "transfer",
  "{{payment_reference}}": "PAY-REF-20260416-001",
  "{{payment_date}}": "Wednesday, 16 April 2026",
  "{{estimated_delivery}}": "Friday, 18 April 2026",
  "{{tracking_number}}": "TRK-2026-BM-001",
  "{{order_status}}": "shipped",
  "{{delivery_date}}": "Friday, 18 April 2026",
  "{{bank_name}}": "GTBank",
  "{{bank_account_name}}": "BundledMum Ltd",
  "{{bank_account_number}}": "0123456789",
  "{{whatsapp_url}}": "https://wa.me/2347040667424",
  "{{referral_code}}": "AMARA-BM42",
  "{{referral_amount}}": "₦2,000",
  "{{referral_link}}": "https://bundledmum.com/?ref=AMARA-BM42",
  "{{whatsapp_share_url}}": "https://wa.me/?text=Use%20my%20code%20AMARA-BM42",
  "{{review_url}}": "https://bundledmum.com/review/BM-20260416-0042",
  "{{cart_items_html}}": `<table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;border-bottom:1px solid #eee">Hospital Bag Essentials Bundle × 1</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₦45,000</td></tr></table>`,
  "{{cart_total}}": "₦45,000",
  "{{cart_url}}": "https://bundledmum.com/cart",
  "{{coupon_code}}": "WELCOME10",
  "{{coupon_discount}}": "10%",
  "{{reorder_items_html}}": `<table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px">Nappy Pack × 2</td><td style="padding:8px;text-align:right">₦18,000</td></tr></table>`,
  "{{recommendations_html}}": `<ul><li>Newborn Nappy Refill</li><li>Baby Wipes 3-Pack</li></ul>`,
  "{{last_order_number}}": "BM-20260316-0031",
  "{{last_order_date}}": "Monday, 16 March 2026",
  "{{shop_url}}": "https://bundledmum.com/shop",
};

function applyPreviewData(html: string): string {
  let result = html;
  for (const [placeholder, value] of Object.entries(SAMPLE_DATA)) {
    result = result.split(placeholder).join(value);
  }
  return result;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never sent";
  const d = new Date(iso).getTime();
  if (!d) return "Never sent";
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Template {
  id: string;
  slug: string;
  name: string;
  subject: string | null;
  html_body: string | null;
  description: string | null;
  is_active: boolean | null;
  trigger_type: "transactional" | "scheduled" | "manual" | string | null;
  trigger_event: string | null;
  trigger_description: string | null;
  delay_hours: number | null;
  schedule_description: string | null;
  send_count: number | null;
  last_sent_at: string | null;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Critical vs ordinary — turning an email OFF is invisible (nothing errors,
// nobody complains, it just silently stops), so the confirmation has to warn
// harder for the emails where that silence actually hurts someone.
//
// THE RULE: an email is CRITICAL when it is buyer/seller facing (not an
// internal_ or _admin_ notice — those land in BundledMum's own inbox, not a
// customer's, a different kind of miss) AND its slug names a concrete change
// to an order's status or a payment/payout/refund event, rather than a
// reminder, marketing nudge or onboarding tip. Nudges and digests (abandoned
// cart, reorder reminders, "your listing hasn't sold yet", review requests,
// welcome emails, stock alerts) tell someone about something optional or
// upcoming — missing one is a missed opportunity, not money looking like it
// vanished.
//
// This is a rule, not a maintained list: any future template whose slug
// carries one of these words is automatically critical without anyone
// having to remember to add it here.
// Lookbehind for a letter (not just \b) so "order" doesn't false-match
// inside "reorder_reminder" — that's a promotional nudge, not an order-state
// change, and a plain \b would still match "order" there.
const CRITICAL_KEYWORDS = /(?<![a-z])(order|payment|paid|confirm|dispatch|shipped|deliver|cancel|refund|payout|dispute|return|sale|offer|renew)/;

function isCriticalTemplate(t: Pick<Template, "slug">): boolean {
  if (t.slug.startsWith("internal_") || t.slug.includes("_admin_")) return false;
  return CRITICAL_KEYWORDS.test(t.slug);
}

// Specific, honest consequences for the emails this was explicitly built
// around — used verbatim where we have them. Everything else critical still
// gets a real warning (see criticalConsequence below), just grounded in the
// template's own trigger_description rather than a bespoke sentence per slug,
// since hand-writing one for all ~30 critical templates would be exactly the
// kind of list this rule is meant to avoid needing.
const CRITICAL_CONSEQUENCES: Record<string, string> = {
  marketplace_order_confirmation: "A buyer just paid and will hear nothing back, which looks exactly like their money has vanished.",
  marketplace_seller_sale: "A seller will never learn they sold something, and their item just sits there unsent.",
  marketplace_buyer_dispatched: "A buyer will never learn their item is on the way.",
  marketplace_buyer_confirm_prompt: "Nobody is ever asked to confirm the item arrived, so the seller's payout stalls indefinitely.",
  marketplace_seller_payout_sent: "A seller gets paid with no notification telling them so.",
};

function criticalConsequence(t: Template): string {
  if (CRITICAL_CONSEQUENCES[t.slug]) return CRITICAL_CONSEQUENCES[t.slug];
  if (/dispute|return|refund/.test(t.slug)) return "Someone is mid-problem, waiting on a dispute, return or refund, and will hear nothing.";
  if (t.trigger_description) {
    const lower = t.trigger_description.charAt(0).toLowerCase() + t.trigger_description.slice(1);
    return `Normally this fires when ${lower} — that message will simply stop going out.`;
  }
  return "This tells a buyer or seller something about their money or their order — that message will simply stop going out.";
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminEmailTemplates() {
  const queryClient = useQueryClient();
  const { adminUser } = usePermissions();
  const [editing, setEditing] = useState<Template | null>(null);
  const [pendingToggle, setPendingToggle] = useState<Template | null>(null);
  const [testOpen, setTestOpen] = useState<Template | null>(null);
  const [showOnlyPaused, setShowOnlyPaused] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("email_templates")
        .select("*")
        .order("trigger_type")
        .order("created_at");
      if (error) throw error;
      return (data || []) as Template[];
    },
  });

  const allTemplates = templates || [];
  const pausedCount = allTemplates.filter(t => t.is_active === false).length;
  const visible = showOnlyPaused ? allTemplates.filter(t => t.is_active === false) : allTemplates;
  const transactional = visible.filter(t => t.trigger_type !== "scheduled");
  const scheduled = visible.filter(t => t.trigger_type === "scheduled");

  const toggleActive = useMutation({
    mutationFn: async (payload: { id: string; next: boolean }) => {
      const { error } = await (supabase as any)
        .from("email_templates")
        .update({ is_active: payload.next, updated_at: new Date().toISOString() })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-email-templates"] });
      setPendingToggle(null);
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't update status"),
  });

  // Turning an email back ON just resumes normal behaviour, no confirmation
  // needed. Turning one OFF is the one that needs a moment of friction,
  // since the consequence is invisible — see ConfirmPauseModal.
  function requestToggle(t: Template) {
    const turningOn = t.is_active === false;
    if (turningOn) { toggleActive.mutate({ id: t.id, next: true }); return; }
    setPendingToggle(t);
  }

  if (editing) {
    return (
      <EditTemplateView
        template={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-email-templates"] });
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div>
      <header className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h1 className="pf text-2xl font-bold flex items-center gap-2">
          <Mail className="w-6 h-6" /> Email Templates
        </h1>
      </header>

      {/* A switched-off email is otherwise invisible in a list this long
          (88 templates today) — this line and filter make it impossible to
          miss how many are currently not sending. */}
      {!isLoading && allTemplates.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mb-6">
          <span className={`text-xs font-semibold ${pausedCount > 0 ? "text-amber-700" : "text-text-med"}`}>
            {pausedCount === 0
              ? `All ${allTemplates.length} templates are active`
              : `${pausedCount} of ${allTemplates.length} templates ${pausedCount === 1 ? "is" : "are"} switched off`}
          </span>
          {pausedCount > 0 && (
            <button
              onClick={() => setShowOnlyPaused(v => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-semibold border transition-colors ${
                showOnlyPaused ? "bg-amber-500 border-amber-500 text-white" : "border-border text-text-med hover:bg-muted"
              }`}
            >
              <Filter className="w-3 h-3" /> {showOnlyPaused ? "Showing paused only" : "Show only paused"}
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading…</div>
      ) : (templates || []).length === 0 ? (
        <div className="text-center py-10 text-text-med">
          No email templates found. Insert rows into the <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">email_templates</code> table to get started.
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-text-med mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Transactional emails
              <span className="text-[10px] font-normal text-text-light normal-case tracking-normal">
                Sent automatically in response to customer actions
              </span>
            </h2>
            <div className="space-y-3">
              {transactional.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onEdit={() => setEditing(t)}
                  onTest={() => setTestOpen(t)}
                  onToggleRequest={() => requestToggle(t)}
                />
              ))}
              {transactional.length === 0 && (
                <p className="text-xs text-text-light">No transactional templates.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-widest text-text-med mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Automated campaigns
              <span className="text-[10px] font-normal text-text-light normal-case tracking-normal">
                Cron-driven, target customers based on activity
              </span>
            </h2>

            {/* Health panel */}
            <div className="bg-muted/40 border border-border rounded-xl p-4 mb-3 space-y-1 text-xs">
              {scheduled.map(t => (
                <div key={`health-${t.id}`} className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${t.is_active ? "bg-emerald-500" : "bg-gray-400"}`} />
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-text-light">—</span>
                  <span className={t.is_active ? "text-emerald-700" : "text-text-light"}>
                    {t.is_active ? "Active" : "Paused"}
                  </span>
                  {t.schedule_description && (
                    <span className="text-text-light">· {t.schedule_description.split(".")[0]}</span>
                  )}
                </div>
              ))}
              <p className="text-[11px] text-text-light pt-1">
                To pause any automation, use the toggle on the card below.
              </p>
            </div>

            <div className="space-y-3">
              {scheduled.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onEdit={() => setEditing(t)}
                  onTest={() => setTestOpen(t)}
                  onToggleRequest={() => requestToggle(t)}
                />
              ))}
              {scheduled.length === 0 && (
                <p className="text-xs text-text-light">No scheduled templates.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Pause confirmation — this is the only direction that ever opens a
          modal, turning an email back on needs none (see requestToggle). */}
      {pendingToggle && (
        <ConfirmPauseModal
          template={pendingToggle}
          onCancel={() => setPendingToggle(null)}
          onConfirm={() => toggleActive.mutate({ id: pendingToggle.id, next: false })}
          busy={toggleActive.isPending}
        />
      )}

      {/* Send test email */}
      {testOpen && (
        <SendTestModal
          template={testOpen}
          defaultEmail={(adminUser as any)?.email || ""}
          onClose={() => setTestOpen(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

function TemplateCard({
  template: t, onEdit, onTest, onToggleRequest,
}: {
  template: Template;
  onEdit: () => void;
  onTest: () => void;
  onToggleRequest: () => void;
}) {
  const active = t.is_active !== false;
  const isScheduled = t.trigger_type === "scheduled";
  const critical = isCriticalTemplate(t);

  return (
    <article
      className={active ? "bg-card border border-border rounded-xl p-4" : "bg-card border rounded-xl p-4"}
      style={active ? undefined : { borderColor: "#D4613C", borderLeftWidth: 4, background: "#FDF4F1" }}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onToggleRequest}
          aria-label={active ? "Pause" : "Activate"}
          className={`mt-0.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-semibold transition-colors flex-shrink-0 ${
            active
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "hover:opacity-80"
          }`}
          style={active ? undefined : { background: "#D4613C", color: "#fff" }}
          title={active ? "Active — click to pause" : "Switched off — click to turn back on"}
        >
          <span className={`inline-block w-2 h-2 rounded-full ${active ? "bg-emerald-500" : "bg-white"}`} />
          {active ? "Active" : "Switched off"}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-bold text-sm">{t.name}</h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              {critical && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#FCE4E1", color: "#C0392B" }}>
                  <AlertTriangle className="w-2.5 h-2.5" /> Critical
                </span>
              )}
              <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                isScheduled ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
              }`}>
                {isScheduled ? "Scheduled" : "Transactional"}
              </span>
            </div>
          </div>

          {t.trigger_description && (
            <p className="text-text-med text-xs mt-1 leading-relaxed">{t.trigger_description}</p>
          )}

          {t.subject && (
            <p className="text-[11px] text-text-light mt-2">
              <span className="font-semibold text-text-med">Subject:</span>{" "}
              <span className="font-mono">{t.subject}</span>
            </p>
          )}

          {isScheduled && (
            <div className="mt-2 text-[11px] text-text-med space-y-0.5">
              {t.schedule_description && <div>🕐 Schedule: {t.schedule_description}</div>}
              {(t.delay_hours ?? 0) > 0 && <div>⏱ Delay: {t.delay_hours} hour{t.delay_hours === 1 ? "" : "s"} after trigger</div>}
            </div>
          )}

          <div className="text-[11px] text-text-light mt-2">
            {(t.send_count ?? 0) === 0
              ? "Never sent"
              : <>Sent <b className="text-text-med">{t.send_count}</b> time{t.send_count === 1 ? "" : "s"} · Last sent {timeAgo(t.last_sent_at)}</>}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest-deep"
            >
              <Save className="w-3.5 h-3.5" /> Edit Template
            </button>
            <button
              onClick={onTest}
              className="inline-flex items-center gap-1.5 border border-forest/30 text-forest px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-forest/5"
            >
              <Send className="w-3.5 h-3.5" /> Send Test Email
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Edit template view (kept close to prior layout — just reuses helpers)
// ---------------------------------------------------------------------------

function EditTemplateView({ template: t, onClose, onSaved }: { template: Template; onClose: () => void; onSaved: () => void }) {
  const [editSubject, setEditSubject] = useState(t.subject || "");
  const [editBody, setEditBody] = useState(t.html_body || "");
  const [showPreview, setShowPreview] = useState(false);

  // marketplace_* templates store body fragments; the sender wraps them in the
  // shared layout at send time, so we preview them through the edge function that
  // renders exactly as it sends. Storefront templates store complete HTML and keep
  // the existing client-side preview.
  const isMarketplace = t.slug.startsWith("marketplace_");

  // Debounce the editor content so previewing unsaved edits does not call the
  // function on every keystroke.
  const [debouncedBody, setDebouncedBody] = useState(editBody);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedBody(editBody), 500);
    return () => clearTimeout(id);
  }, [editBody]);

  const mktPreview = useQuery({
    queryKey: ["mkt-email-preview", t.slug, debouncedBody],
    enabled: showPreview && isMarketplace,
    staleTime: 0,
    queryFn: async (): Promise<{ html: string; subject: string; sample: boolean }> => {
      const res = await (supabase.functions as any).invoke("preview-marketplace-email", {
        body: { slug: t.slug, html_body: debouncedBody },
      });
      if (res?.error) throw new Error(res.error?.message || "Preview failed");
      if (res?.data?.error) throw new Error(res.data.error);
      return res.data as { html: string; subject: string; sample: boolean };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("email_templates")
        .update({ subject: editSubject, html_body: editBody, updated_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Template saved"); onSaved(); },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const placeholders = isMarketplace ? MARKETPLACE_PLACEHOLDERS : (TEMPLATE_PLACEHOLDERS[t.slug] || []);

  return (
    <div>
      <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-text-med hover:text-forest mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to templates
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="pf text-2xl font-bold flex items-center gap-2">
            <Mail className="w-6 h-6" /> {t.name}
          </h1>
          <p className="text-text-light text-xs mt-0.5 font-mono">{t.slug}</p>
          {t.trigger_description && <p className="text-text-med text-sm mt-1">{t.trigger_description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
              showPreview ? "bg-forest/10 border-forest text-forest" : "border-border text-text-med hover:bg-muted"
            }`}
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPreview ? "Hide Preview" : "Preview"}
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="flex items-center gap-1.5 bg-forest text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {save.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {/* Slug (read-only) */}
          <div className="bg-card border border-border rounded-xl p-5">
            <label className="text-xs font-semibold text-text-med block mb-1.5">Slug (read-only)</label>
            <input value={t.slug} readOnly className="w-full border border-input bg-muted/60 text-text-light rounded-lg px-3 py-2.5 text-sm font-mono cursor-not-allowed" />
          </div>

          {/* Subject */}
          <div className="bg-card border border-border rounded-xl p-5">
            <label className="text-xs font-semibold text-text-med block mb-1.5">Subject line</label>
            <input
              value={editSubject}
              onChange={e => setEditSubject(e.target.value)}
              placeholder="e.g. Order Confirmed — {{order_number}}"
              className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background"
            />
          </div>

          {/* Preview */}
          {showPreview && (
            <div className="bg-card border-2 border-forest/30 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-forest" />
                <label className="text-xs font-semibold text-forest">Live preview</label>
                <span className="text-[10px] text-text-light ml-auto">
                  {isMarketplace ? "Sample data, rendered with the shared layout" : "Sample data used for placeholders"}
                </span>
              </div>

              {isMarketplace ? (
                // Marketplace: render exactly as it sends, via the edge function,
                // so the shared header, logo, footer and styling all show.
                mktPreview.isLoading ? (
                  <div className="bg-muted/30 border border-border rounded-lg px-4 py-10 text-center text-sm text-text-light">Building the preview…</div>
                ) : mktPreview.error ? (
                  <div className="bg-destructive/5 border border-destructive/30 rounded-lg px-4 py-4 text-sm text-destructive">
                    Could not build the preview. {(mktPreview.error as Error)?.message || "Please try again."}
                  </div>
                ) : mktPreview.data ? (
                  <>
                    <div className="bg-muted/30 border border-border rounded-lg px-4 py-2.5 mb-3">
                      <span className="text-[10px] text-text-light block mb-0.5">Subject:</span>
                      <span className="text-sm font-semibold">{mktPreview.data.subject}</span>
                    </div>
                    <div className="bg-white border border-border rounded-lg overflow-hidden">
                      <iframe
                        title="Email preview"
                        srcDoc={mktPreview.data.html}
                        className="w-full border-0"
                        style={{ minHeight: 500 }}
                        sandbox=""
                      />
                    </div>
                    <p className="text-[10px] text-text-light mt-2 leading-relaxed">
                      This preview uses sample data, not a real order. The shared header, logo and footer are added when the email is sent, so this is how it will actually look.
                    </p>
                  </>
                ) : null
              ) : (
                // Storefront: complete HTML, previewed client-side as before.
                <>
                  <div className="bg-muted/30 border border-border rounded-lg px-4 py-2.5 mb-3">
                    <span className="text-[10px] text-text-light block mb-0.5">Subject:</span>
                    <span className="text-sm font-semibold">{applyPreviewData(editSubject)}</span>
                  </div>
                  <div className="bg-white border border-border rounded-lg overflow-hidden">
                    <iframe
                      title="Email preview"
                      srcDoc={applyPreviewData(editBody)}
                      className="w-full border-0"
                      style={{ minHeight: 500 }}
                      sandbox=""
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* HTML Body */}
          <div className="bg-card border border-border rounded-xl p-5">
            <label className="text-xs font-semibold text-text-med block mb-1.5">HTML body</label>
            <textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              rows={28}
              spellCheck={false}
              className="w-full border border-input rounded-lg px-3 py-2.5 text-xs font-mono bg-background leading-relaxed"
            />
            <p className="text-[10px] text-text-light mt-1.5">
              {isMarketplace
                ? <>Body content only. The shared header, logo, footer and styling are added when the email sends. Use {"{{placeholder}}"} syntax, and {"{{primary_button:Label}}"} for a button. Preview to see the full styled email.</>
                : <>Full HTML email template. Use {"{{placeholder}}"} syntax for dynamic values. Inline CSS recommended for email clients.</>}
            </p>
          </div>
        </div>

        {/* Sidebar: placeholders + metadata */}
        <div className="lg:sticky lg:top-24 lg:self-start space-y-3">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-bold text-text-med mb-2">Metadata (system fields)</h3>
            <dl className="text-[11px] space-y-1 text-text-med">
              <div><dt className="text-text-light inline">Trigger type:</dt> <dd className="inline font-semibold uppercase">{t.trigger_type || "—"}</dd></div>
              <div><dt className="text-text-light inline">Trigger event:</dt> <dd className="inline font-mono">{t.trigger_event || "—"}</dd></div>
              {t.schedule_description && <div><dt className="text-text-light">Schedule:</dt> <dd className="text-text-med">{t.schedule_description}</dd></div>}
              {(t.delay_hours ?? 0) > 0 && <div><dt className="text-text-light inline">Delay:</dt> <dd className="inline">{t.delay_hours}h</dd></div>}
              <div><dt className="text-text-light inline">Sent:</dt> <dd className="inline">{t.send_count ?? 0}×</dd></div>
              <div><dt className="text-text-light inline">Last sent:</dt> <dd className="inline">{timeAgo(t.last_sent_at)}</dd></div>
            </dl>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-xs font-bold text-text-med mb-3">Available placeholders</h3>
            {placeholders.length > 0 ? (
              <div className="space-y-1.5">
                {placeholders.map(p => (
                  <button
                    key={p}
                    onClick={() => { navigator.clipboard.writeText(p); toast.success(`Copied ${p}`); }}
                    className="block w-full text-left font-mono text-[11px] bg-muted/50 hover:bg-muted px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-text-light text-xs">No placeholders defined for this template.</p>
            )}
            <p className="text-[10px] text-text-light mt-3">Click a placeholder to copy it.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pause confirmation modal — two tiers. Turning an email back on never opens
// this at all (see requestToggle), it just resumes.
// ---------------------------------------------------------------------------

function ConfirmPauseModal({ template, onCancel, onConfirm, busy }: {
  template: Template;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const critical = isCriticalTemplate(template);
  return (
    <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={onCancel}>
      <div className="bg-card border border-border rounded-xl p-5 w-full max-w-sm max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={critical ? { background: "#FCE4E1", color: "#C0392B" } : { background: "#FDE8DF", color: "#D4613C" }}
          >
            {critical ? <AlertTriangle className="w-4 h-4" /> : <Power className="w-4 h-4" />}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-sm" style={critical ? { color: "#C0392B" } : undefined}>
              {critical ? `This is a critical email. Pause ${template.name}?` : `Pause ${template.name}?`}
            </h3>
            <p className="text-xs text-text-med mt-1.5 leading-relaxed">
              {critical ? criticalConsequence(template) : <>No new <b>{template.trigger_event}</b> emails will be sent until you turn this back on.</>}
            </p>
            <p className="text-[11px] text-text-light mt-2 leading-relaxed">
              Nothing breaks and no error appears anywhere, it will just quietly stop sending, so this is easy to forget about.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} disabled={busy} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 text-white"
            style={{ background: critical ? "#C0392B" : "#D4613C" }}
          >
            {busy ? "Saving…" : critical ? "Yes, pause this critical email" : "Pause email"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Send test email modal
// ---------------------------------------------------------------------------

function SendTestModal({ template, defaultEmail, onClose }: {
  template: Template;
  defaultEmail: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail || "");
  const [sending, setSending] = useState(false);

  useEffect(() => { setEmail(defaultEmail || ""); }, [defaultEmail]);

  const send = async () => {
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      // Both edge functions accept { test_email } and auto-find the
      // most recent paid order for placeholder data. We never pass
      // order_id from here — the function picks it.
      const isReorder = template.slug === "reorder_reminder";
      const fnName = isReorder ? "send-reorder-reminders" : "send-transactional-email";
      const body: Record<string, any> = { test_email: addr };
      if (!isReorder) body.email_type = template.slug;

      const response = await (supabase.functions as any).invoke(fnName, { body });
      // Always log the raw response — it's invaluable when debugging
      // edge-function failures in production (RLS errors, missing
      // Resend keys, unexpected payload shapes, etc.).
      console.log(`[email test] ${fnName} response`, response);

      // supabase-js returns { data, error } where `error` is a
      // FunctionsHttpError / FunctionsFetchError on any non-2xx — we
      // check that rather than relying on an HTTP status directly.
      if (response?.error) {
        const msg = response.error?.message
          || (response.data && (response.data.error || response.data.message))
          || "Unknown error";
        toast.error(`Failed: ${msg}`);
        return;
      }
      // Some functions still return success with an error field in
      // the data payload — surface that too.
      if (response?.data?.error) {
        toast.error(`Failed: ${response.data.error}`);
        return;
      }

      toast.success(`Test email sent to ${addr}`);
      onClose();
    } catch (e: any) {
      console.error("[email test] exception", e);
      toast.error(`Failed: ${e?.message || "Could not send test email"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4 max-md:items-end max-md:p-0" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 w-full max-w-sm max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">Send test — {template.name}</h3>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
        </div>
        <label className="text-[10px] uppercase tracking-widest font-semibold text-text-med block mb-1">Send to</label>
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-input px-3 py-2.5 text-sm bg-background min-h-[44px]"
        />
        <p className="text-[11px] text-text-light mt-2 leading-relaxed">
          The edge function seeds placeholders from the most recent paid order and sends a
          [TEST]-prefixed copy to this address. {template.slug === "reorder_reminder"
            ? "Runs via send-reorder-reminders."
            : "Runs via send-transactional-email."}
        </p>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={sending} className="text-xs text-text-med hover:text-foreground px-3 py-2">Cancel</button>
          <button
            onClick={send}
            disabled={sending || !email.trim()}
            className="inline-flex items-center gap-1.5 bg-forest text-primary-foreground px-3 py-2 rounded-lg text-xs font-semibold hover:bg-forest-deep disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" /> {sending ? "Sending…" : "Send test"}
          </button>
        </div>
      </div>
    </div>
  );
}
