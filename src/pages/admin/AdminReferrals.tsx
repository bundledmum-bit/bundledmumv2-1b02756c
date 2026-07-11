import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmt } from "@/lib/cart";
import { Save, Search, X } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSupabaseData";

type Tab = "codes" | "credits" | "settings";

const REFERRAL_SETTINGS_KEYS = [
  { key: "referral_enabled", label: "Referrals Enabled", type: "toggle" as const },
  { key: "referral_discount_amount", label: "Discount for Redeemer (₦)", type: "number" as const },
  { key: "referral_credit_amount", label: "Credit for Referrer (₦)", type: "number" as const },
  { key: "referral_max_uses", label: "Max Uses per Code", type: "number" as const },
  { key: "referral_min_order", label: "Min Order Amount (₦)", type: "number" as const },
  { key: "referral_code_expiry_days", label: "Code Expiry (Days)", type: "number" as const },
];

// bigint columns (redemption_count, total_*_given/earned) can arrive from
// PostgREST as strings — coerce everywhere we do maths or format money.
const num = (v: any) => Number(v) || 0;

export default function AdminReferrals() {
  const [tab, setTab] = useState<Tab>("codes");

  return (
    <div>
      <h1 className="pf text-2xl font-bold mb-6">Referrals</h1>

      <div className="flex gap-2 mb-4">
        {([["codes", "Referral Codes"], ["credits", "Credits"], ["settings", "Settings"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === t ? "bg-forest text-primary-foreground" : "border border-border text-text-med"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "codes" && <ReferralCodesTab />}
      {tab === "credits" && <ReferralCreditsTab />}
      {tab === "settings" && <ReferralSettings />}
    </div>
  );
}

// ---- Status badge: Expired > Active > Inactive -----------------------------
function StatusBadge({ isExpired, isActive }: { isExpired: boolean; isActive: boolean }) {
  const { label, cls } = isExpired
    ? { label: "Expired", cls: "bg-red-100 text-red-700" }
    : isActive
      ? { label: "Active", cls: "bg-green-100 text-green-700" }
      : { label: "Inactive", cls: "bg-muted text-text-light" };
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{label}</span>;
}

// ---- Codes tab: tracking table + summary + search + detail drawer ----------
function ReferralCodesTab() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-referral-tracking"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_referral_tracking")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const list = rows || [];

  const summary = useMemo(() => {
    return {
      totalCodes: list.length,
      activeCodes: list.filter((r: any) => r.is_active && !r.is_expired).length,
      totalRedemptions: list.reduce((s: number, r: any) => s + num(r.redemption_count), 0),
      totalCredit: list.reduce((s: number, r: any) => s + num(r.total_credit_earned), 0),
    };
  }, [list]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r: any) =>
      (r.code || "").toLowerCase().includes(q) ||
      (r.referrer_email || "").toLowerCase().includes(q) ||
      (r.referrer_name || "").toLowerCase().includes(q));
  }, [list, search]);

  if (isLoading) return <div className="text-center py-10 text-text-med">Loading...</div>;

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="Total Codes" value={summary.totalCodes.toLocaleString()} />
        <SummaryCard label="Active Codes" value={summary.activeCodes.toLocaleString()} />
        <SummaryCard label="Total Redemptions" value={summary.totalRedemptions.toLocaleString()} />
        <SummaryCard label="Total Credit Earned" value={fmt(summary.totalCredit)} />
      </div>

      {/* Search */}
      <div className="relative mb-3 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search code, name or email"
          className="w-full border border-input rounded-lg pl-9 pr-3 py-2 text-sm bg-background"
        />
      </div>

      {list.length === 0 ? (
        <div className="text-center py-10 text-text-med">No referral codes yet. They are generated automatically after each order.</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-text-med">No codes match “{search}”.</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Code</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Referrer</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Generated From</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Created</th>
                <th className="px-4 py-3 text-center font-semibold text-text-med">Status</th>
                <th className="px-4 py-3 text-center font-semibold text-text-med">Uses</th>
                <th className="px-4 py-3 text-center font-semibold text-text-med">Redemptions</th>
                <th className="px-4 py-3 text-right font-semibold text-text-med">Credit Earned</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.referral_code_id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="px-4 py-3 font-mono font-semibold">{r.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-sm">{r.referrer_name || "—"}</div>
                    <div className="text-text-light text-xs">{r.referrer_email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-light">{r.referrer_order_number || "-"}</td>
                  <td className="px-4 py-3 text-xs text-text-light">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge isExpired={!!r.is_expired} isActive={!!r.is_active} /></td>
                  <td className="px-4 py-3 text-center">{num(r.times_used)}/{r.max_uses ?? "∞"}</td>
                  <td className="px-4 py-3 text-center">{num(r.redemption_count)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(num(r.total_credit_earned))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <ReferralDetailDrawer code={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-xs text-text-med">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

// ---- Detail drawer ---------------------------------------------------------
function ReferralDetailDrawer({ code, onClose }: { code: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-referral-redemptions", code.referral_code_id],
    queryFn: async () => {
      const { data: reds, error } = await supabase
        .from("referral_redemptions")
        .select("referred_order_id, redeemer_email, redeemer_phone, discount_amount, referrer_credit, order_status, created_at")
        .eq("referral_code_id", code.referral_code_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const redemptions = reds || [];

      // Map referred_order_id -> order_number via a second fetch.
      const ids = [...new Set(redemptions.map((r: any) => r.referred_order_id).filter(Boolean))];
      const orderMap: Record<string, string> = {};
      if (ids.length) {
        const { data: orders } = await supabase.from("orders").select("id, order_number").in("id", ids as string[]);
        (orders || []).forEach((o: any) => { orderMap[o.id] = o.order_number; });
      }
      return { redemptions, orderMap };
    },
  });

  const redemptions = data?.redemptions || [];
  const orderMap = data?.orderMap || {};

  return (
    <div className="fixed inset-0 bg-foreground/50 z-[100] flex justify-end" onClick={onClose}>
      <div className="bg-card border-l border-border h-full w-full max-w-md overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="min-w-0">
            <div className="font-mono font-bold text-lg">{code.code}</div>
            <div className="text-sm text-text-med truncate">{code.referrer_name || "—"}</div>
            <div className="text-xs text-text-light truncate">{code.referrer_email}</div>
            {code.referrer_phone && <div className="text-xs text-text-light">{code.referrer_phone}</div>}
            <div className="mt-1.5"><StatusBadge isExpired={!!code.is_expired} isActive={!!code.is_active} /></div>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-5">
          {/* Code details */}
          <section>
            <h4 className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2">Code Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Created" value={code.created_at ? new Date(code.created_at).toLocaleDateString() : "—"} />
              <Field label="Expires" value={code.expires_at ? new Date(code.expires_at).toLocaleDateString() : "Never"} />
              <Field label="Uses" value={`${num(code.times_used)} / ${code.max_uses ?? "∞"}`} />
              <Field label="Active" value={code.is_active ? "Yes" : "No"} />
              <Field label="Redeemer Discount" value={fmt(num(code.discount_amount))} />
              <Field label="Referrer Credit / Use" value={fmt(num(code.referrer_credit))} />
              <Field label="Min Order" value={fmt(num(code.min_order_amount))} />
            </div>
          </section>

          {/* Generated from */}
          <section>
            <h4 className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2">Generated From</h4>
            {code.referrer_order_number ? (
              <Link to={`/admin/orders?q=${code.referrer_order_number}`} className="text-forest font-semibold hover:underline text-sm">
                {code.referrer_order_number} →
              </Link>
            ) : (
              <div className="text-sm text-text-light">—</div>
            )}
          </section>

          {/* Redemptions */}
          <section>
            <h4 className="text-xs font-semibold text-text-med uppercase tracking-wide mb-2">
              Redemptions {redemptions.length > 0 && `(${redemptions.length})`}
            </h4>
            {isLoading ? (
              <div className="text-sm text-text-light">Loading…</div>
            ) : redemptions.length === 0 ? (
              <div className="text-sm text-text-light">This code has never been used yet.</div>
            ) : (
              <div className="space-y-2">
                {redemptions.map((r: any, i: number) => (
                  <div key={i} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate">{r.redeemer_email || r.redeemer_phone || "Customer"}</span>
                      <span className="text-xs text-text-light flex-shrink-0">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5 text-xs">
                      <span className="text-text-med">
                        Order:{" "}
                        {r.referred_order_id && orderMap[r.referred_order_id] ? (
                          <Link to={`/admin/orders?q=${orderMap[r.referred_order_id]}`} className="text-forest font-semibold hover:underline">
                            {orderMap[r.referred_order_id]}
                          </Link>
                        ) : "—"}
                      </span>
                      {r.order_status && <span className="px-2 py-0.5 rounded bg-muted text-text-light capitalize">{r.order_status}</span>}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs">
                      <span className="text-text-med">Discount: <span className="font-semibold text-foreground">{fmt(num(r.discount_amount))}</span></span>
                      <span className="text-text-med">Credit: <span className="font-semibold text-foreground">{fmt(num(r.referrer_credit))}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-light">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

// ---- Credits tab (unchanged behaviour) -------------------------------------
function ReferralCreditsTab() {
  const { data: credits, isLoading } = useQuery({
    queryKey: ["admin-referral-credits"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("referral_credits").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="text-center py-10 text-text-med">Loading...</div>;
  if ((credits || []).length === 0) return <div className="text-center py-10 text-text-med">No referral credits yet. Credits are generated when someone uses a referral code.</div>;

  return (
    <div className="bg-card border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0 z-10">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-text-med">Referrer Email</th>
            <th className="px-4 py-3 text-right font-semibold text-text-med">Credit</th>
            <th className="px-4 py-3 text-center font-semibold text-text-med">Status</th>
            <th className="px-4 py-3 text-left font-semibold text-text-med">Created</th>
            <th className="px-4 py-3 text-left font-semibold text-text-med">Expires</th>
          </tr>
        </thead>
        <tbody>
          {(credits || []).map((cr: any) => (
            <tr key={cr.id} className="border-t border-border hover:bg-muted/30">
              <td className="px-4 py-3 text-sm">{cr.referrer_email}</td>
              <td className="px-4 py-3 text-right font-semibold">{fmt(cr.credit_amount || 0)}</td>
              <td className="px-4 py-3 text-center">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  cr.status === "available" ? "bg-green-100 text-green-700" :
                  cr.status === "used" ? "bg-muted text-text-light" :
                  cr.status === "expired" ? "bg-red-100 text-red-700" :
                  "bg-muted text-text-light"
                }`}>{cr.status}</span>
              </td>
              <td className="px-4 py-3 text-xs text-text-light">{new Date(cr.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-xs text-text-light">{cr.expires_at ? new Date(cr.expires_at).toLocaleDateString() : "Never"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferralSettings() {
  const queryClient = useQueryClient();
  const { data: settings } = useSiteSettings();
  const [edits, setEdits] = useState<Record<string, string>>({});

  const getValue = (key: string): string => {
    if (edits[key] !== undefined) return edits[key];
    const val = settings?.[key];
    if (val === undefined || val === null) return "";
    return String(val);
  };

  const saveSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      let parsed: any;
      if (value === "true" || value === "false") parsed = value === "true";
      else if (/^\d+$/.test(value)) parsed = Number(value);
      else parsed = value;
      const { error } = await supabase.from("site_settings").upsert({ key, value: parsed }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      queryClient.invalidateQueries({ queryKey: ["site_settings"] });
      setEdits(prev => { const n = { ...prev }; delete n[vars.key]; return n; });
      toast.success("Setting saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <p className="text-text-light text-xs mb-2">Global referral program settings. These values are read by the <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">validate_referral_code</code> and <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">generate_referral_code</code> RPCs.</p>
      {REFERRAL_SETTINGS_KEYS.map(field => {
        const current = getValue(field.key);
        const hasEdit = edits[field.key] !== undefined;

        return (
          <div key={field.key}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-text-med">{field.label}</label>
              {hasEdit && (
                <button onClick={() => saveSetting.mutate({ key: field.key, value: edits[field.key] })}
                  className="flex items-center gap-1 text-xs text-forest font-semibold">
                  <Save className="w-3 h-3" /> Save
                </button>
              )}
            </div>
            {field.type === "toggle" ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={current === "true" || current === "1"}
                  onChange={e => setEdits(prev => ({ ...prev, [field.key]: e.target.checked ? "true" : "false" }))}
                  className="rounded" />
                <span className="text-sm">{current === "true" || current === "1" ? "Enabled" : "Disabled"}</span>
              </label>
            ) : (
              <input type="number" value={current}
                onChange={e => setEdits(prev => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            )}
          </div>
        );
      })}
    </div>
  );
}
