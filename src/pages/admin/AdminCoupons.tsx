import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Search, Trash2, Edit2, X } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { useAdminUser } from "@/hooks/useAdminPermissions";
import { useRequestAdminAction, notifyApproval } from "@/hooks/useApprovals";
import RequestDeleteButton from "@/components/admin/RequestDeleteButton";

const TYPES = ["percentage", "fixed_amount", "free_delivery"] as const;

export default function AdminCoupons() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const { data: adminUser } = useAdminUser();
  const isSuperAdmin = adminUser?.role === "super_admin";
  const requestAction = useRequestAdminAction();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: coupons, isLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveCoupon = useMutation({
    mutationFn: async (coupon: any) => {
      const payload = {
        code: coupon.code.toUpperCase().trim(), description: coupon.description || null,
        discount_type: coupon.discount_type, discount_value: parseFloat(coupon.discount_value) || 0,
        minimum_order_amount: parseInt(coupon.minimum_order_amount) || null,
        maximum_discount_amount: parseInt(coupon.maximum_discount_amount) || null,
        usage_limit: parseInt(coupon.usage_limit) || null, usage_limit_per_customer: parseInt(coupon.usage_limit_per_customer) || 1,
        start_date: coupon.start_date || null, end_date: coupon.end_date || null, is_active: coupon.is_active ?? true,
      };
      if (coupon.id) {
        const { error } = await supabase.from("coupons").update(payload).eq("id", coupon.id);
        if (error) throw error;
        return { mode: "update" as const };
      }
      // INSERT path: super_admins write directly; everyone else routes
      // through the admin_approval_requests queue.
      if (!isSuperAdmin) {
        const description = `Add coupon: ${payload.code}`;
        await requestAction.mutateAsync({
          action: "add",
          table: "coupons",
          proposedData: payload,
          description,
        });
        notifyApproval({
          type: "new_request",
          description,
          action: "add",
          table_name: "coupons",
          requester_name:
            adminUser?.display_name || adminUser?.email || "Unknown",
          super_admin_email: "iceboxx766@gmail.com",
        });
        return { mode: "request" as const };
      }
      const { error } = await supabase.from("coupons").insert(payload);
      if (error) throw error;
      return { mode: "insert" as const };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      setEditing(null); setShowForm(false);
      if (res?.mode === "request") {
        toast.success("Add request submitted. Super admin will review shortly.");
      } else {
        toast.success("Coupon saved");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteCoupon = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("coupons").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-coupons"] }); toast.success("Coupon deleted"); },
  });

  const filtered = (coupons || []).filter((c: any) =>
    !search || c.code.toLowerCase().includes(search.toLowerCase()) || (c.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const blankCoupon = { code: "", description: "", discount_type: "percentage", discount_value: "", minimum_order_amount: "", maximum_discount_amount: "", usage_limit: "", usage_limit_per_customer: "1", start_date: "", end_date: "", is_active: true };
  const isExpired = (c: any) => c.end_date && new Date(c.end_date) < new Date();
  const isExhausted = (c: any) => c.usage_limit && c.usage_count >= c.usage_limit;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="pf text-2xl font-bold">Coupons</h1>
        {can("coupons", "create") && (
          <button onClick={() => { setEditing(blankCoupon); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
            <Plus className="w-4 h-4" /> {isSuperAdmin ? "Create Coupon" : "Request to add Coupon"}
          </button>
        )}
      </div>

      <div className="relative max-w-xs mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search coupons..."
          className="w-full pl-9 pr-3 py-2 border border-input rounded-lg text-sm bg-background" />
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-text-med">Loading...</div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Code</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Value</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Usage</th>
                <th className="px-4 py-3 text-left font-semibold text-text-med">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-text-med">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-bold font-mono">{c.code}</div>
                    {c.description && <div className="text-xs text-text-light">{c.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize">{c.discount_type.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-xs font-semibold">
                    {c.discount_type === "percentage" ? `${c.discount_value}%` : c.discount_type === "fixed_amount" ? `₦${Number(c.discount_value).toLocaleString()}` : "Free"}
                  </td>
                  <td className="px-4 py-3 text-xs">{c.usage_count}{c.usage_limit ? ` / ${c.usage_limit}` : " / ∞"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      !c.is_active ? "bg-gray-100 text-gray-600" : isExpired(c) ? "bg-red-100 text-red-600" : isExhausted(c) ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                    }`}>
                      {!c.is_active ? "Inactive" : isExpired(c) ? "Expired" : isExhausted(c) ? "Exhausted" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      {can("coupons", "edit") && <button onClick={() => { setEditing(c); setShowForm(true); }} className="p-1.5 hover:bg-muted rounded"><Edit2 className="w-3.5 h-3.5" /></button>}
                      {can("coupons", "delete") && (
                        <RequestDeleteButton
                          table="coupons"
                          recordId={c.id}
                          recordLabel={c.code}
                          onDeleted={() => { if (confirm("Delete this coupon?")) deleteCoupon.mutate(c.id); }}
                          className="p-1.5 hover:bg-destructive/10 text-destructive rounded inline-flex items-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </RequestDeleteButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-text-med">No coupons found</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showForm && editing && (
        <CouponForm coupon={editing} onSave={(c: any) => saveCoupon.mutate(c)} onClose={() => { setShowForm(false); setEditing(null); }} saving={saveCoupon.isPending} />
      )}
    </div>
  );
}

function CouponForm({ coupon, onSave, onClose, saving }: { coupon: any; onSave: (c: any) => void; onClose: () => void; saving: boolean }) {
  const [form, setForm] = useState(coupon);
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-center justify-center max-md:items-end max-md:p-0" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto max-md:max-w-full max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-bold">{coupon.id ? "Edit Coupon" : "Create Coupon"}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Code *</label>
            <input value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background font-mono" placeholder="WELCOME10" />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Description</label>
            <input value={form.description || ""} onChange={e => set("description", e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" placeholder="10% off for new customers" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Type *</label>
              <select value={form.discount_type} onChange={e => set("discount_type", e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
                {TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Value</label>
              <input type="number" value={form.discount_value} onChange={e => set("discount_value", e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Min Order (₦)</label>
              <input type="number" value={form.minimum_order_amount || ""} onChange={e => set("minimum_order_amount", e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Max Discount (₦)</label>
              <input type="number" value={form.maximum_discount_amount || ""} onChange={e => set("maximum_discount_amount", e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Usage Limit</label>
              <input type="number" value={form.usage_limit || ""} onChange={e => set("usage_limit", e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Per Customer</label>
              <input type="number" value={form.usage_limit_per_customer} onChange={e => set("usage_limit_per_customer", e.target.value)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">Start Date</label>
              <input type="datetime-local" value={form.start_date ? form.start_date.slice(0, 16) : ""} onChange={e => set("start_date", e.target.value || null)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">End Date</label>
              <input type="datetime-local" value={form.end_date ? form.end_date.slice(0, 16) : ""} onChange={e => set("end_date", e.target.value || null)} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={e => set("is_active", e.target.checked)} className="rounded" /> Active
          </label>
        </div>
        <div className="flex gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted">Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.code}
            className="flex-1 px-4 py-2 bg-forest text-primary-foreground rounded-lg text-sm font-semibold hover:bg-forest-deep disabled:opacity-50">
            {saving ? "Saving..." : "Save Coupon"}
          </button>
        </div>
      </div>
    </div>
  );
}
