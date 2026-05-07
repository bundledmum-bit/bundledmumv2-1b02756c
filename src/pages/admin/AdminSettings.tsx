import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Plus, Trash2, Lock } from "lucide-react";
import AdminQuizExitPopupTab from "@/components/admin/AdminQuizExitPopupTab";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

const ALL_TABS = ["General", "Revenue Targets", "Notification Recipients", "Homepage", "Social", "Legacy Bar", "Quiz Exit Popup", "Fees", "Payment", "SEO", "Subscriptions"];
const RESTRICTED_TABS: Record<string, { module: string; action: string }> = {
  "Quiz Exit Popup": { module: "content", action: "manage_quiz_exit_popup" },
  "Notification Recipients": { module: "settings", action: "manage_notifications" },
};

const TAB_KEYS: Record<string, { key: string; label: string; type: "text" | "textarea" | "number" | "toggle" | "color" | "url" | "email" }[]> = {
  General: [
    { key: "site_name", label: "Site Name", type: "text" },
    { key: "site_tagline", label: "Tagline", type: "text" },
    { key: "contact_email", label: "Contact Email", type: "email" },
    { key: "whatsapp_number", label: "WhatsApp Number", type: "text" },
    { key: "office_address", label: "Office Address", type: "textarea" },
    { key: "currency_symbol", label: "Currency Symbol", type: "text" },
  ],
  Homepage: [
    { key: "hero_badge", label: "Hero Badge Text", type: "text" },
    { key: "hero_title", label: "Hero Headline", type: "textarea" },
    { key: "hero_subtitle", label: "Hero Sub-headline", type: "textarea" },
    { key: "trust_stats", label: "Trust Stats (JSON)", type: "textarea" },
    { key: "trust_strip", label: "Trust Strip Text (JSON)", type: "textarea" },
    { key: "most_loved_heading", label: "Most Loved Section Title", type: "text" },
    { key: "testimonials_heading", label: "Testimonials Heading", type: "text" },
  ],
  Social: [
    { key: "social_links", label: "Social Links (JSON)", type: "textarea" },
    { key: "facebook_url", label: "Facebook URL", type: "url" },
    { key: "instagram_url", label: "Instagram URL", type: "url" },
    { key: "twitter_url", label: "Twitter / X URL", type: "url" },
    { key: "tiktok_url", label: "TikTok URL", type: "url" },
  ],
  "Legacy Bar": [
    { key: "announcement_enabled", label: "Show Announcement Bar", type: "toggle" },
    { key: "announcement_text", label: "Announcement Text", type: "text" },
    { key: "announcement_link", label: "Announcement Link", type: "url" },
    { key: "announcement_bg_color", label: "Background Color", type: "color" },
    { key: "announcement_text_color", label: "Text Color", type: "color" },
  ],
  Fees: [
    { key: "service_fee", label: "Service & Packaging Fee", type: "number" },
    { key: "service_fee_enabled", label: "Service Fee Enabled", type: "toggle" },
    { key: "service_fee_label", label: "Service Fee Label", type: "text" },
    { key: "default_delivery_fee", label: "Default Delivery Fee", type: "number" },
    { key: "default_free_threshold", label: "Free Delivery Threshold", type: "number" },
    { key: "referral_amount", label: "Referral Amount", type: "number" },
    { key: "gift_wrapping_price", label: "Gift Wrapping Price", type: "number" },
    { key: "calculator_base_prices", label: "Calculator Base Prices (JSON)", type: "textarea" },
    { key: "calculator_modifiers", label: "Calculator Modifiers (JSON)", type: "textarea" },
  ],
  Payment: [
    { key: "bank_name", label: "Bank Name", type: "text" },
    { key: "bank_account_name", label: "Account Name", type: "text" },
    { key: "bank_account_number", label: "Account Number", type: "text" },
    { key: "payment_method_card_enabled", label: "Card Payment (Paystack)", type: "toggle" },
    { key: "payment_method_transfer_enabled", label: "Bank Transfer", type: "toggle" },
    { key: "payment_method_ussd_enabled", label: "USSD / Mobile Money", type: "toggle" },
  ],
  SEO: [
    { key: "meta_title", label: "Default Meta Title", type: "text" },
    { key: "meta_description", label: "Default Meta Description", type: "textarea" },
    { key: "og_image_url", label: "Default OG Image URL", type: "url" },
  ],
};

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const { can, adminUser, loading: permissionsLoading } = usePermissions();
  const [activeTab, setActiveTab] = useState("General");
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // Revenue Targets is gated to super_admin / admin only — never shown to
  // custom or fulfilment roles. Wait for permissions to finish loading so
  // we don't permanently hide the tab if adminUser is still being fetched
  // when the filter first runs.
  const canEditRevenueTargets =
    !permissionsLoading &&
    (adminUser?.role === "super_admin" || adminUser?.role === "admin");

  // Filter tabs based on permissions. Restricted tabs are auto-allowed for
  // super_admin + admin (handled inside can()), and require an explicit
  // permission grant for other roles.
  const TABS = ALL_TABS.filter(tab => {
    if (tab === "Revenue Targets") return canEditRevenueTargets;
    const req = RESTRICTED_TABS[tab];
    if (!req) return true;
    return can(req.module, req.action);
  });

  // If the current tab has been restricted away (e.g. permission revoked),
  // fall back to General.
  useEffect(() => {
    if (!TABS.includes(activeTab)) setActiveTab("General");
  }, [TABS, activeTab]);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("*").order("key");
      if (error) throw error;
      return data;
    },
  });

  const saveSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      let parsed;
      try { parsed = JSON.parse(value); } catch { parsed = value; }
      // Upsert
      const { error } = await supabase.from("site_settings").upsert({ key, value: parsed }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["site_settings"] });
      setEditValues(prev => { const n = { ...prev }; delete n[vars.key]; return n; });
      toast.success("Setting saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const settingsMap = new Map((settings || []).map((s: any) => [s.key, s]));

  const getValue = (key: string) => {
    const s = settingsMap.get(key) as any;
    if (!s) return "";
    if (typeof s.value === "object") return JSON.stringify(s.value, null, 2);
    return String(s.value);
  };

  const fields = TAB_KEYS[activeTab] || [];

  return (
    <div>
      <h1 className="pf text-2xl font-bold mb-6">Site Settings</h1>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold border ${activeTab === tab ? "border-forest bg-forest-light text-forest" : "border-border text-text-med"}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Revenue Targets" ? (
        canEditRevenueTargets ? <RevenueTargetsPanel /> : null
      ) : activeTab === "Notification Recipients" ? (
        can("settings", "manage_notifications") ? <NotificationRecipientsPanel /> : null
      ) : activeTab === "Quiz Exit Popup" ? (
        can("content", "manage_quiz_exit_popup") ? (
          <AdminQuizExitPopupTab />
        ) : (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <Lock className="w-8 h-8 mx-auto text-text-light mb-3" />
            <h3 className="text-sm font-bold mb-1">Restricted setting</h3>
            <p className="text-xs text-text-light">
              Only super admins, admins, or users with the
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px] mx-1">content.manage_quiz_exit_popup</span>
              permission can configure this.
            </p>
          </div>
        )
      ) : activeTab === "Subscriptions" ? (
        <AdminSubscriptionsTab />
      ) : isLoading ? (
        <div className="text-center py-10 text-text-med">Loading...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          {fields.map(field => {
            const currentValue = editValues[field.key] ?? getValue(field.key);
            const hasEdit = editValues[field.key] !== undefined;

            return (
              <div key={field.key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-text-med">{field.label}</label>
                  {hasEdit && (
                    <button onClick={() => saveSetting.mutate({ key: field.key, value: editValues[field.key] })}
                      className="flex items-center gap-1 text-xs text-forest font-semibold">
                      <Save className="w-3 h-3" /> Save
                    </button>
                  )}
                </div>
                {field.type === "textarea" ? (
                  <textarea value={currentValue}
                    onChange={e => setEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    rows={Math.min(currentValue.split("\n").length + 1, 8)}
                    className="w-full border border-input rounded-lg px-3 py-2 text-xs font-mono bg-background" />
                ) : field.type === "toggle" ? (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={currentValue === "true" || currentValue === "1"}
                      onChange={e => {
                        const newVal = e.target.checked ? "true" : "false";
                        setEditValues(prev => ({ ...prev, [field.key]: newVal }));
                        if (field.key.startsWith("payment_method_")) {
                          saveSetting.mutate({ key: field.key, value: newVal });
                        }
                      }}
                      className="rounded" />
                    <span className="text-sm">{currentValue === "true" || currentValue === "1" ? "Enabled" : "Disabled"}</span>
                  </label>
                ) : field.type === "color" ? (
                  <div className="flex items-center gap-2">
                    <input type="color" value={currentValue || "#000000"}
                      onChange={e => setEditValues(prev => ({ ...prev, [field.key]: JSON.stringify(e.target.value) }))}
                      className="w-10 h-8 rounded border border-input cursor-pointer" />
                    <input value={currentValue.replace(/^"|"$/g, "")}
                      onChange={e => setEditValues(prev => ({ ...prev, [field.key]: JSON.stringify(e.target.value) }))}
                      className="flex-1 border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                  </div>
                ) : (
                  <input type={field.type === "number" ? "number" : "text"}
                    value={currentValue.replace(/^"|"$/g, "")}
                    onChange={e => setEditValues(prev => ({ ...prev, [field.key]: field.type === "number" ? e.target.value : JSON.stringify(e.target.value) }))}
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Subscription settings tab — grouped layout, save-on-change, validation.
// The subscription_settings table ships with label / description / value_type
// per row. All values are strings in the DB; we cast on read and serialise
// back with String(v) on write.
// ---------------------------------------------------------------------------

interface SubscriptionSettingRow {
  id: string;
  setting_key: string;
  setting_value: string;
  value_type: "boolean" | "number" | "text" | string;
  label: string | null;
  description: string | null;
}

const FREQUENCY_KEYS = ["weekly_enabled", "biweekly_enabled", "monthly_enabled"] as const;

const GROUP_LAYOUT: Array<{
  title: string;
  description?: string;
  keys: string[];
  note?: string;
}> = [
  {
    title: "Subscription Programme",
    keys: ["subscription_enabled"],
  },
  {
    title: "Available Frequencies",
    description: "Control which delivery frequencies customers can choose",
    keys: ["weekly_enabled", "biweekly_enabled", "monthly_enabled"],
    note: "At least one frequency must be enabled.",
  },
  {
    title: "Delivery Cycle Limits",
    description: "Set minimum and maximum deliveries per cycle",
    keys: ["min_deliveries", "max_deliveries_weekly", "max_deliveries_biweekly", "max_deliveries_monthly"],
  },
  {
    title: "Pricing & Discounts",
    description: "Control subscription pricing. Changes apply to new subscriptions and cycle renewals.",
    keys: ["discount_pct", "free_delivery_enabled", "min_order_value_naira"],
  },
  {
    title: "Renewal & Retries",
    description: "Control how failed subscription renewals are retried before pausing.",
    keys: ["renewal_max_retries", "renewal_retry_days"],
  },
  {
    title: "Customer Controls",
    keys: ["max_active_subscriptions_per_email", "delivery_day_changeable", "edit_window_days"],
  },
  {
    title: "Upsell & Loyalty",
    description: "Cross-sell and loyalty touchpoints on subscription emails.",
    keys: ["upsell_recommendations_enabled", "upsell_max_recommendations", "anniversary_email_every_n_cycles"],
  },
  {
    title: "Subscription Page Content",
    description: "Control what text appears on the subscription landing page",
    keys: ["subscription_badge_label", "subscription_page_heading", "subscription_page_subtext"],
  },
];

/** Per-key overrides for labels / descriptions / number affixes that either
 *  don't exist in the DB or need more specific copy than the stored value. */
const KEY_META: Record<string, { label?: string; description?: string; prefix?: string; suffix?: string; min?: number; max?: number; maxLength?: number; rows?: number; note?: string }> = {
  subscription_enabled:       { label: "Subscriptions Enabled", description: "Master toggle — turns subscriptions on or off site-wide" },
  weekly_enabled:             { label: "Weekly (every 7 days)" },
  biweekly_enabled:           { label: "Every 2 Weeks (every 14 days)" },
  monthly_enabled:            { label: "Monthly (every 30 days)" },
  min_deliveries:             { label: "Minimum deliveries per cycle", description: "Minimum number of deliveries per paid cycle (default: 4)", suffix: "deliveries", min: 1, max: 52 },
  max_deliveries_weekly:      { label: "Max deliveries — Weekly",     description: "Max weekly deliveries per cycle (~3 months = 13)", suffix: "deliveries", min: 4, max: 52 },
  max_deliveries_biweekly:    { label: "Max deliveries — Every 2 Weeks", description: "Max biweekly deliveries per cycle (~3 months = 7)", suffix: "deliveries", min: 4, max: 26 },
  max_deliveries_monthly:     { label: "Max deliveries — Monthly",    description: "Max monthly deliveries per cycle (6 months = 6)", suffix: "deliveries", min: 4, max: 12 },
  discount_pct:               { label: "Subscription Discount",       description: "Percentage discount applied to all subscription orders", suffix: "%", min: 0, max: 50 },
  free_delivery_enabled:      { label: "Free Delivery on Subscriptions", description: "Waive all delivery fees for subscription orders" },
  min_order_value_naira:      { label: "Minimum Box Value (₦)",       description: "Minimum total value for a subscription order to be processed", prefix: "₦", min: 0 },
  delivery_day_changeable:    { label: "Allow Customers to Change Delivery Day", description: "Let subscribers change their delivery day from their account" },
  edit_window_days:           { label: "Edit Window Before Each Delivery", description: "How many days before each delivery customers can still edit their box", suffix: "days", min: 0, max: 7, note: "Set to 0 to disallow all edits" },
  subscription_badge_label:   { label: "Product Page Badge Text",     description: "Text shown on the Subscribe button on individual product pages", maxLength: 40 },
  subscription_page_heading:  { label: "Subscription Page Main Heading", description: "The large headline on the /subscriptions product selection page", maxLength: 80 },
  subscription_page_subtext:  { label: "Subscription Page Subheading", description: "The subtitle shown below the heading", maxLength: 200, rows: 3 },
  renewal_max_retries:        { label: "Max renewal retries",          description: "How many times we retry a failed renewal charge before pausing the subscription", suffix: "attempts", min: 0, max: 10 },
  renewal_retry_days:         { label: "Days between retries",         description: "Delay in days between consecutive renewal retry attempts", suffix: "days", min: 0, max: 30 },
  max_active_subscriptions_per_email: { label: "Max active subscriptions per customer", description: "How many live subscriptions a single customer email can have at once", min: 1, max: 50 },
  upsell_recommendations_enabled: { label: "Show Upsell Recommendations", description: "Include product recommendations in subscription emails" },
  upsell_max_recommendations: { label: "Max recommendations per email", description: "Cap the number of suggested products shown in upsell emails", suffix: "products", min: 0, max: 12 },
  anniversary_email_every_n_cycles: { label: "Anniversary email cadence", description: "Send an anniversary email every N completed cycles (0 turns this off)", suffix: "deliveries (0 = off)", min: 0, max: 24 },
};

// ---------------------------------------------------------------------------
// Revenue Targets — annual GMV target, start date, derived monthly target.
// Stored in three site_settings rows: annual_gmv_target,
// gmv_target_start_date, monthly_gmv_target. Monthly is computed from annual
// + remaining months until end-of-year and persisted alongside on save.
// ---------------------------------------------------------------------------

function computeMonthly(annual: number, startDateStr: string): number {
  if (!annual || !startDateStr) return 0;
  const start = new Date(startDateStr);
  if (isNaN(start.getTime())) return 0;
  const yearEnd = new Date(start.getFullYear(), 11, 31);
  const msRemaining = yearEnd.getTime() - start.getTime();
  const monthsRemaining = msRemaining / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsRemaining <= 0) return annual;
  return Math.round(annual / monthsRemaining);
}

function RevenueTargetsPanel() {
  const queryClient = useQueryClient();
  const [annualTarget, setAnnualTarget] = useState<number>(1_400_000_000);
  const [startDate, setStartDate] = useState<string>("");
  const [derivedMonthly, setDerivedMonthly] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load the three keys on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["annual_gmv_target", "gmv_target_start_date", "monthly_gmv_target"]);
      if (cancelled) return;
      if (error) {
        toast.error(error.message || "Failed to load revenue targets");
        setLoading(false);
        return;
      }
      const map: Record<string, any> = {};
      (data || []).forEach((row: any) => {
        // Stored values may be numbers or quoted strings depending on writer.
        let v = row.value;
        if (typeof v === "string") {
          // Strip surrounding quotes if any.
          v = v.replace(/^"|"$/g, "");
        }
        map[row.key] = v;
      });
      const annual = Number(map.annual_gmv_target) || 1_400_000_000;
      const start = typeof map.gmv_target_start_date === "string" ? map.gmv_target_start_date : "";
      const monthly = Number(map.monthly_gmv_target) || computeMonthly(annual, start);
      setAnnualTarget(annual);
      setStartDate(start);
      setDerivedMonthly(monthly);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live-recompute whenever annualTarget or startDate changes.
  useEffect(() => {
    setDerivedMonthly(computeMonthly(annualTarget, startDate));
  }, [annualTarget, startDate]);

  const handleSave = async () => {
    setSaving(true);
    const monthly = computeMonthly(annualTarget, startDate);
    const { error } = await supabase
      .from("site_settings")
      .upsert(
        [
          { key: "annual_gmv_target", value: annualTarget },
          { key: "gmv_target_start_date", value: startDate },
          { key: "monthly_gmv_target", value: monthly },
        ],
        { onConflict: "key" },
      );
    setSaving(false);
    if (error) {
      toast.error("Failed to save revenue targets");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    queryClient.invalidateQueries({ queryKey: ["site_settings"] });
    toast.success("Revenue targets saved");
  };

  if (loading) {
    return <div className="text-center py-10 text-text-med">Loading…</div>;
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div>
        <h2 className="text-base font-bold mb-1">Revenue Targets</h2>
        <p className="text-xs text-text-light">
          Annual GMV goal and the date tracking starts. Monthly target is
          derived automatically from the months remaining until year-end.
        </p>
      </div>

      <div>
        <label className="text-xs font-semibold text-text-med block mb-1">Annual GMV Target</label>
        <p className="text-[11px] text-text-light mb-1.5">Total revenue target for the year, in naira.</p>
        <input
          type="text"
          inputMode="numeric"
          value={annualTarget.toLocaleString("en-NG")}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            setAnnualTarget(Number(raw) || 0);
          }}
          placeholder="e.g. 1,400,000,000"
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-text-med block mb-1">Target Start Date</label>
        <p className="text-[11px] text-text-light mb-1.5">Date from which GMV tracking begins.</p>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-text-med block mb-1">Derived Monthly Target</label>
        <p className="text-[11px] text-text-light mb-1.5">
          Auto-calculated: annual target ÷ months remaining from start date.
        </p>
        <div className="w-full bg-muted/50 rounded-lg px-3 py-2 text-sm font-semibold text-foreground">
          ₦{derivedMonthly.toLocaleString("en-NG")}
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
        >
          {saving ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" /> Save Revenue Targets
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification Recipients — exposes four operational email keys from
// site_settings to admins with the `settings.manage_notifications`
// permission. Each card is a multi-recipient textarea backed by the
// parseEmailList helper. Schema-style array below makes it trivial to add
// more recipient categories later.
// The whole tab is filtered out of the tab list for users without that
// permission via RESTRICTED_TABS, but we also gate the panel render
// defensively in case the route is hit via stale state.
// ---------------------------------------------------------------------------

// Parse a free-form list of emails — accepts newline / comma / semicolon
// separators, trims whitespace, drops empties, dedupes (case-insensitive),
// and partitions into valid + invalid groups for inline error rendering.
function parseEmailList(value: string): { valid: string[]; invalid: string[] } {
  const tokens = value.split(/[\n,;]+/).map(t => t.trim()).filter(t => t.length > 0);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (!emailRegex.test(t)) {
      invalid.push(t);
    } else if (!seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      valid.push(t);
    }
  }
  return { valid, invalid };
}

const RECIPIENTS_PLACEHOLDER =
  "Enter one email per line\nexample@bundledmum.ng\nfulfilment@bundledmum.ng";

interface RecipientField {
  key: string;
  title: string;
  description: string;
}

const RECIPIENT_FIELDS: RecipientField[] = [
  {
    key: "fulfilment_manager_email",
    title: "New Paid Order Notifications",
    description: "Sent when a customer pays for an order. The recipient should be whoever picks and dispatches orders.",
  },
  {
    key: "order_manager_email",
    title: "Order Picked Notifications",
    description: "Sent when an order is marked as picked and ready for dispatch. The recipient should be whoever coordinates with couriers.",
  },
  {
    key: "customer_experience_email",
    title: "Return & Refund Requests",
    description: "Sent when a customer submits a return or refund request. The recipient should be whoever handles customer issues and decides on returns.",
  },
  {
    key: "daily_summary_email",
    title: "Daily Sales Summary",
    description: "Sent at 7am Lagos time every morning. Contains yesterday's orders, revenue, GMV vs target, and current ops state.",
  },
];

function NotificationRecipientsPanel() {
  const queryClient = useQueryClient();
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(RECIPIENT_FIELDS.map(f => [f.key, ""])),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", RECIPIENT_FIELDS.map(f => f.key));
      if (cancelled) return;
      if (error) {
        toast.error(error.message || "Could not load notification recipients");
        setLoading(false);
        return;
      }
      const map: Record<string, any> = {};
      (data || []).forEach((row: any) => {
        let v = row.value;
        if (typeof v === "string") v = v.replace(/^"|"$/g, "");
        map[row.key] = v;
      });
      // Normalise whatever's stored (single email, comma list, mixed) into
      // a one-email-per-line view for editing.
      const next: Record<string, string> = {};
      for (const f of RECIPIENT_FIELDS) {
        const raw = typeof map[f.key] === "string" ? map[f.key] : "";
        next[f.key] = parseEmailList(raw).valid.join("\n");
      }
      setInputs(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const parsedByKey = useMemo(() => {
    const out: Record<string, ReturnType<typeof parseEmailList>> = {};
    for (const f of RECIPIENT_FIELDS) {
      out[f.key] = parseEmailList(inputs[f.key] || "");
    }
    return out;
  }, [inputs]);

  // Save is allowed only when EVERY field has at least one valid email AND
  // no invalid entries are present anywhere.
  const allOk = RECIPIENT_FIELDS.every(f => {
    const p = parsedByKey[f.key];
    return p.valid.length > 0 && p.invalid.length === 0;
  });
  const canSave = allOk && !saving;

  const handleSave = async () => {
    if (!allOk) return;
    setSaving(true);
    try {
      // Sequential upserts — keeps error attribution clean if one fails
      // while still preserving the others' success state.
      for (const f of RECIPIENT_FIELDS) {
        const value = parsedByKey[f.key].valid.join(", ");
        const { error } = await supabase
          .from("site_settings")
          .upsert({ key: f.key, value }, { onConflict: "key" });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["site_settings"] });
      // Reflect normalised values back into the inputs (one per line).
      const normalised: Record<string, string> = {};
      for (const f of RECIPIENT_FIELDS) {
        normalised[f.key] = parsedByKey[f.key].valid.join("\n");
      }
      setInputs(normalised);
      toast.success("Notification recipients updated");
    } catch (e: any) {
      toast.error(e?.message || "Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-text-med">Loading…</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold mb-1">Notification Recipients</h2>
        <p className="text-xs text-text-light">
          Choose who receives operational order notifications. These are
          internal emails, not visible to customers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {RECIPIENT_FIELDS.map(f => (
          <RecipientCard
            key={f.key}
            title={f.title}
            description={f.description}
            value={inputs[f.key] || ""}
            onChange={v => setInputs(prev => ({ ...prev, [f.key]: v }))}
            parsed={parsedByKey[f.key]}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
        >
          {saving ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" /> Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function RecipientCard({
  title,
  description,
  value,
  onChange,
  parsed,
}: {
  title: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  parsed: { valid: string[]; invalid: string[] };
}) {
  const hasInvalid = parsed.invalid.length > 0;
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-bold mb-1">{title}</h3>
      <p className="text-[11px] text-text-light mb-3">{description}</p>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={4}
        placeholder={RECIPIENTS_PLACEHOLDER}
        className={`w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono ${hasInvalid ? "border-destructive" : "border-input"}`}
      />
      <p className="text-[11px] text-text-light mt-1">
        Enter one email address per line. Multiple recipients all receive the notification.
      </p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] font-semibold rounded-pill bg-forest/10 text-forest px-2 py-0.5">
          {parsed.valid.length} recipient{parsed.valid.length === 1 ? "" : "s"}
        </span>
      </div>
      {hasInvalid && (
        <p className="text-[11px] text-destructive mt-1">
          Some entries are not valid email addresses: {parsed.invalid.join(", ")}
        </p>
      )}
    </div>
  );
}

function AdminSubscriptionsTab() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading, error: loadError } = useQuery({
    queryKey: ["subscription-settings-admin"],
    queryFn: async () => {
      // NB: the table has no `display_order` column — selecting it errors the
      // whole query and causes the tab to render 'No rows found'. Select the
      // real columns only, and surface any error to the caller.
      const { data, error } = await (supabase as any)
        .from("subscription_settings")
        .select("id, setting_key, setting_value, value_type, label, description")
        .order("setting_key", { ascending: true });
      // eslint-disable-next-line no-console
      console.log("subscription_settings result:", data, error);
      if (error) throw error;
      return (data || []) as SubscriptionSettingRow[];
    },
  });

  const bySetting: Record<string, SubscriptionSettingRow> = Object.fromEntries(rows.map(r => [r.setting_key, r]));
  const masterOn = bySetting.subscription_enabled?.setting_value === "true";

  const save = useMutation({
    mutationFn: async (payload: { key: string; value: string }) => {
      const { error } = await (supabase as any)
        .from("subscription_settings")
        .update({ setting_value: payload.value, updated_at: new Date().toISOString() })
        .eq("setting_key", payload.key);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription-settings-admin"] });
      qc.invalidateQueries({ queryKey: ["subscription-settings"] });
      toast.success("Saved ✓", { duration: 2000 });
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const saveSetting = (key: string, value: string | number | boolean) =>
    save.mutate({ key, value: String(value) });

  /** Guard: refuse to turn off the last frequency. */
  const guardFrequencyToggle = (key: string, nextValue: boolean): boolean => {
    if (nextValue) return true;
    const stillOn = FREQUENCY_KEYS.filter(k => k !== key && bySetting[k]?.setting_value === "true").length;
    if (stillOn === 0) {
      toast.error("At least one frequency must remain enabled.");
      return false;
    }
    return true;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-text-med">
        <span className="w-4 h-4 rounded-full border-2 border-forest/30 border-t-forest animate-spin" />
        Loading subscription settings…
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 text-sm">
        <div className="font-semibold mb-1">Couldn't load subscription settings.</div>
        <div className="text-xs break-words">{(loadError as any)?.message || String(loadError)}</div>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm">
        No subscription settings rows found. The <code className="bg-white/60 px-1 py-0.5 rounded">subscription_settings</code> table returned zero rows for this session — check that the admin has read access and that the table has been seeded.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {GROUP_LAYOUT.map(group => {
        const isMasterGroup = group.keys.includes("subscription_enabled");
        const dimmed = !isMasterGroup && !masterOn;

        // When subscription_enabled is OFF, collapse every non-master group
        // into a single grey placeholder so the page stays scannable.
        if (dimmed) return null;

        return (
          <section key={group.title} className="bg-card border border-border rounded-xl p-5 space-y-4">
            <header>
              <h2 className="font-bold text-sm">{group.title}</h2>
              {group.description && <p className="text-xs text-text-light mt-0.5">{group.description}</p>}
            </header>

            <div className="space-y-4">
              {group.keys.map(key => {
                const row = bySetting[key];
                if (!row) return null;
                return (
                  <SettingRow
                    key={row.id}
                    row={row}
                    onSave={(v) => saveSetting(key, v)}
                    onFrequencyGuard={FREQUENCY_KEYS.includes(key as any) ? (next) => guardFrequencyToggle(key, next) : undefined}
                  />
                );
              })}
            </div>

            {group.note && <p className="text-[11px] text-text-light">{group.note}</p>}
          </section>
        );
      })}

      {!masterOn && (
        <section className="bg-muted/40 border border-border rounded-xl p-6 text-center text-sm text-text-light">
          Subscriptions are currently disabled. Turn on the <b className="text-foreground">Subscriptions Enabled</b> toggle above to configure the rest.
        </section>
      )}

      <SubscribableProductsPanel disabled={!masterOn} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual setting row — renders based on value_type
// ---------------------------------------------------------------------------

function SettingRow({
  row, onSave, onFrequencyGuard,
}: {
  row: SubscriptionSettingRow;
  onSave: (v: string | number | boolean) => void;
  onFrequencyGuard?: (next: boolean) => boolean;
}) {
  const [local, setLocal] = useState(row.setting_value);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setLocal(row.setting_value); }, [row.setting_value]);

  const meta = KEY_META[row.setting_key] || {};
  const label = meta.label || row.label || row.setting_key.replace(/_/g, " ");
  const description = meta.description ?? row.description;

  const commit = (value: string | number | boolean) => {
    try { onSave(value); setErr(null); }
    catch (e: any) { setErr(e?.message || "Save failed"); }
  };

  // --- Boolean toggle ---
  if (row.value_type === "boolean") {
    const on = local === "true";
    const toggle = (nextOn: boolean) => {
      if (onFrequencyGuard && !onFrequencyGuard(nextOn)) return;
      setLocal(nextOn ? "true" : "false");
      commit(nextOn);
    };
    return (
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{label}</div>
            {description && <p className="text-[11px] text-text-light mt-0.5">{description}</p>}
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" className="peer sr-only" checked={on}
              onChange={e => toggle(e.target.checked)} />
            <div className="peer h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-forest peer-checked:after:translate-x-5" />
          </label>
        </div>
        {row.setting_key === "free_delivery_enabled" && !on && (
          <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Turning off free delivery affects all active subscribers from their next cycle. Existing paid cycles are not affected.
          </p>
        )}
        {err && <p className="text-[11px] text-destructive mt-1">{err}</p>}
      </div>
    );
  }

  // --- Number input ---
  if (row.value_type === "number") {
    const prefix = meta.prefix ?? (/_naira$/.test(row.setting_key) ? "₦" : null);
    const suffix = meta.suffix ?? (/_pct$/.test(row.setting_key) ? "%" : /_days$/.test(row.setting_key) ? "days" : null);
    const min = meta.min;
    const max = meta.max;
    const showDiscountPreview = row.setting_key === "discount_pct";
    const pct = parseFloat(local);
    const preview = showDiscountPreview && isFinite(pct)
      ? Math.max(0, Math.round(10000 * (1 - pct / 100)))
      : null;

    const commitNumber = () => {
      const n = parseFloat(local);
      if (!isFinite(n)) { setErr("Enter a number."); return; }
      if (min != null && n < min) { setErr(`Minimum is ${min}.`); return; }
      if (max != null && n > max) { setErr(`Maximum is ${max}.`); return; }
      if (String(n) !== row.setting_value) commit(n);
      else setErr(null);
    };

    return (
      <div>
        <div className="text-sm font-semibold">{label}</div>
        {description && <p className="text-[11px] text-text-light mt-0.5 mb-1.5">{description}</p>}
        <div className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-3 py-2 max-w-xs">
          {prefix && <span className="text-text-light text-sm">{prefix}</span>}
          <input
            type="number"
            min={min} max={max}
            value={local}
            onChange={e => setLocal(e.target.value)}
            onBlur={commitNumber}
            className="w-full bg-transparent text-sm outline-none text-right tabular-nums"
          />
          {suffix && <span className="text-text-light text-sm">{suffix}</span>}
        </div>
        {meta.note && <p className="text-[10px] text-text-light mt-1">{meta.note}</p>}
        {preview != null && (
          <p className="text-[11px] text-text-med mt-1.5">A ₦10,000 order costs subscribers <b className="text-foreground">₦{preview.toLocaleString("en-NG")}</b>.</p>
        )}
        {err && <p className="text-[11px] text-destructive mt-1">{err}</p>}
      </div>
    );
  }

  // --- Text / textarea ---
  const isBadge = row.setting_key === "subscription_badge_label";
  const long = row.setting_key === "subscription_page_subtext";
  const maxLength = meta.maxLength;

  const commitText = () => {
    if (local !== row.setting_value) commit(local);
  };

  return (
    <div>
      <div className="text-sm font-semibold">{label}</div>
      {description && <p className="text-[11px] text-text-light mt-0.5 mb-1.5">{description}</p>}
      {long ? (
        <textarea
          rows={meta.rows ?? 3}
          maxLength={maxLength}
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={commitText}
          className="w-full rounded-lg border border-input px-3 py-2 text-sm bg-background"
        />
      ) : (
        <input
          type="text"
          maxLength={maxLength}
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={commitText}
          className="w-full rounded-lg border border-input px-3 py-2 text-sm bg-background"
        />
      )}
      {maxLength && <p className="text-[10px] text-text-light mt-1 text-right">{local.length} / {maxLength}</p>}
      {isBadge && (
        <div className="mt-2">
          <span className="inline-flex items-center gap-1.5 bg-forest/10 text-forest border border-forest/30 rounded-pill px-3 py-1 text-xs font-semibold">
            🔄 {local || "Subscribe & Save"}
          </span>
        </div>
      )}
      {err && <p className="text-[11px] text-destructive mt-1">{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscribable products panel — per-category toggle + select all / none
// ---------------------------------------------------------------------------

interface SubscribableProductRow {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  is_subscribable: boolean;
  is_consumable: boolean;
  is_active?: boolean;
}

function SubscribableProductsPanel({ disabled }: { disabled?: boolean }) {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-subscribable-products"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, category, subcategory, is_subscribable, is_consumable, is_active")
        .eq("is_consumable", true)
        .eq("is_active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return (data || []) as SubscribableProductRow[];
    },
  });

  const setSubscribable = async (id: string, value: boolean) => {
    const { error } = await (supabase as any).from("products").update({ is_subscribable: value }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin-subscribable-products"] });
    qc.invalidateQueries({ queryKey: ["subscribable-products"] });
    toast.success("Saved ✓", { duration: 2000 });
  };

  const bulkSet = async (ids: string[], value: boolean) => {
    if (ids.length === 0) return;
    const { error } = await (supabase as any).from("products").update({ is_subscribable: value }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["admin-subscribable-products"] });
    qc.invalidateQueries({ queryKey: ["subscribable-products"] });
    toast.success(`${ids.length} product${ids.length === 1 ? "" : "s"} updated`, { duration: 2000 });
  };

  const grouped = useMemo(() => {
    const m = new Map<string, SubscribableProductRow[]>();
    for (const p of products) {
      const c = (p.category || "other").toLowerCase();
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(p);
    }
    return m;
  }, [products]);

  if (isLoading) return null;

  return (
    <div className={`bg-card border border-border rounded-xl p-5 space-y-3 ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      <header>
        <h2 className="font-bold text-sm">Products Available for Subscription</h2>
        <p className="text-xs text-text-light mt-0.5">Only consumable products can be subscribed to. Toggle individual products on or off below.</p>
      </header>

      {products.length === 0 && <p className="text-xs text-text-light">No consumable products yet.</p>}

      {Array.from(grouped.entries()).map(([cat, items]) => {
        const enabledCount = items.filter(p => p.is_subscribable).length;
        const allOn = enabledCount === items.length;
        const allOff = enabledCount === 0;
        const title = cat === "mum" ? "For Mum" : cat === "baby" ? "For Baby" : cat.charAt(0).toUpperCase() + cat.slice(1);
        return (
          <section key={cat} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-[11px] uppercase tracking-widest font-bold text-text-med">
                {title} <span className="text-text-light ml-1">{enabledCount} of {items.length} subscribable</span>
              </h3>
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <button
                  onClick={() => bulkSet(items.filter(p => !p.is_subscribable).map(p => p.id), true)}
                  disabled={allOn}
                  className="text-forest hover:underline disabled:text-text-light disabled:no-underline"
                >
                  Select all
                </button>
                <span className="text-text-light">·</span>
                <button
                  onClick={() => bulkSet(items.filter(p => p.is_subscribable).map(p => p.id), false)}
                  disabled={allOff}
                  className="text-destructive hover:underline disabled:text-text-light disabled:no-underline"
                >
                  Deselect all
                </button>
              </div>
            </div>
            <div className="divide-y divide-border/60">
              {items.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{p.name}</div>
                    <div className="text-[10px] text-text-light">{p.subcategory || "—"}</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input type="checkbox" className="peer sr-only" checked={p.is_subscribable}
                      onChange={e => setSubscribable(p.id, e.target.checked)} />
                    <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:bg-forest peer-checked:after:translate-x-4" />
                  </label>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
