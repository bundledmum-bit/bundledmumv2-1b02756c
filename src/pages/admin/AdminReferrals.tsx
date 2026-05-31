import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmt } from "@/lib/cart";
import { Save } from "lucide-react";
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

export default function AdminReferrals() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("codes");

  const { data: codes, isLoading: codesLoading } = useQuery({
    queryKey: ["admin-referrals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("referral_codes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: credits, isLoading: creditsLoading } = useQuery({
    queryKey: ["admin-referral-credits"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("referral_credits").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("referral_codes").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-referrals"] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

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

      {tab === "codes" && (
        codesLoading ? <div className="text-center py-10 text-text-med">Loading...</div> : (codes || []).length === 0 ? (
          <div className="text-center py-10 text-text-med">No referral codes yet. They are generated automatically after each order.</div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-text-med">Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-text-med">Referrer</th>
                  <th className="px-4 py-3 text-center font-semibold text-text-med">Used</th>
                  <th className="px-4 py-3 text-center font-semibold text-text-med">Max</th>
                  <th className="px-4 py-3 text-right font-semibold text-text-med">Earned</th>
                  <th className="px-4 py-3 text-center font-semibold text-text-med">Active</th>
                  <th className="px-4 py-3 text-left font-semibold text-text-med">Expires</th>
                </tr>
              </thead>
              <tbody>
                {(codes || []).map((c: any) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-sm">{c.referrer_name}</div>
                      <div className="text-text-light text-xs">{c.referrer_email}</div>
                    </td>
                    <td className="px-4 py-3 text-center">{c.times_used || 0}</td>
                    <td className="px-4 py-3 text-center">{c.max_uses || "∞"}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(c.total_earned || 0)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive.mutate({ id: c.id, is_active: !c.is_active })}
                        className={`px-2.5 py-1 rounded text-[10px] font-semibold cursor-pointer transition-colors ${c.is_active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-700 hover:bg-red-200"}`}>
                        {c.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-light">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "credits" && (
        creditsLoading ? <div className="text-center py-10 text-text-med">Loading...</div> : (credits || []).length === 0 ? (
          <div className="text-center py-10 text-text-med">No referral credits yet. Credits are generated when someone uses a referral code.</div>
        ) : (
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
        )
      )}

      {tab === "settings" && <ReferralSettings />}
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
