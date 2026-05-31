import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, X, Shield } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import AdminPermissionsManager from "@/components/admin/AdminPermissionsManager";

const ROLES = ["super_admin", "admin", "fulfilment", "customer_service", "analyst", "content_manager", "custom"];
const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", admin: "Admin", fulfilment: "Fulfilment",
  customer_service: "Customer Service", analyst: "Analyst", content_manager: "Content Manager", custom: "Custom",
};
const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700", admin: "bg-blue-100 text-blue-700",
  fulfilment: "bg-green-100 text-green-700", customer_service: "bg-yellow-100 text-yellow-700",
  analyst: "bg-cyan-100 text-cyan-700", content_manager: "bg-orange-100 text-orange-700", custom: "bg-gray-100 text-gray-700",
};

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { can, isSuperAdmin, adminUser: currentAdmin } = usePermissions();
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"users" | "permissions">("users");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_users").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
    // Refresh every minute so the "Active now" indicator stays current
    // without a page reload.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("admin_users").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Updated"); },
  });

  if (!can("admin", "view_users")) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="pf text-2xl font-bold">Admin Users</h1>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <div className="flex gap-1 mr-4">
              <button onClick={() => setActiveTab("users")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === "users" ? "bg-forest text-primary-foreground" : "border border-border"}`}>
                Users
              </button>
              <button onClick={() => setActiveTab("permissions")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === "permissions" ? "bg-forest text-primary-foreground" : "border border-border"}`}>
                Permissions
              </button>
            </div>
          )}
          {can("admin", "create_users") && activeTab === "users" && (
            <button onClick={() => { setEditUser(null); setShowForm(true); }}
              className="flex items-center gap-1.5 bg-forest text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-forest-deep">
              <Plus className="w-4 h-4" /> Invite Admin
            </button>
          )}
        </div>
      </div>

      {activeTab === "permissions" && isSuperAdmin ? (
        <AdminPermissionsManager users={users || []} />
      ) : (
        <>
          {isLoading ? (
            <div className="text-center py-10 text-text-med">Loading...</div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-text-med">User</th>
                    <th className="px-4 py-3 text-left font-semibold text-text-med">Role</th>
                    <th className="px-4 py-3 text-center font-semibold text-text-med">Active</th>
                    <th className="px-4 py-3 text-left font-semibold text-text-med">Last Login</th>
                    <th className="px-4 py-3 text-right font-semibold text-text-med">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(users || []).map((u: any) => (
                    <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-forest/10 flex items-center justify-center text-sm font-bold text-forest">
                            {u.display_name?.charAt(0) || "?"}
                          </div>
                          <div>
                            <div className="font-semibold">{u.display_name}</div>
                            <div className="text-text-light text-xs">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${ROLE_COLORS[u.role] || "bg-gray-100 text-gray-700"}`}>
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {can("admin", "deactivate_users") ? (
                          <button onClick={() => {
                            if (u.auth_user_id === currentAdmin?.auth_user_id) return;
                            toggleActive.mutate({ id: u.id, is_active: !u.is_active });
                          }}
                            className={`w-10 h-5 rounded-full relative transition-colors ${u.is_active ? "bg-forest" : "bg-border"} ${u.auth_user_id === currentAdmin?.auth_user_id ? "opacity-50 cursor-not-allowed" : ""}`}>
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-primary-foreground shadow transition-transform ${u.is_active ? "left-5" : "left-0.5"}`} />
                          </button>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <LastLoginCell value={u.last_login_at} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {can("admin", "edit_users") && u.auth_user_id !== currentAdmin?.auth_user_id && (
                          <button onClick={() => { setEditUser(u); setShowForm(true); }}
                            className="px-3 py-1 rounded text-xs font-semibold border border-border hover:bg-muted">Edit</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      {showForm && (
        <UserForm user={editUser} onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); queryClient.invalidateQueries({ queryKey: ["admin-users"] }); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Last login renderer — four tiers driven by the recency of last_login_at:
//   < 30 min  → pulsing green dot + "Active now"
//   < 24 h    → "N hours ago"
//   < 7 days  → "N days ago"
//   else      → "D MMM, HH:mm" in Africa/Lagos
//   null      → muted "Never"
// ---------------------------------------------------------------------------

function LastLoginCell({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <span className="text-text-light">Never</span>;
  }

  const ts = new Date(value).getTime();
  if (isNaN(ts)) {
    return <span className="text-text-light">—</span>;
  }
  const ageMs = Date.now() - ts;
  const ageMin = ageMs / 60_000;
  const ageHr = ageMs / 3_600_000;
  const ageDay = ageMs / 86_400_000;

  if (ageMin < 30) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-green-600 text-sm font-medium">Active now</span>
      </span>
    );
  }

  if (ageHr < 24) {
    const hrs = Math.max(1, Math.floor(ageHr));
    return <span className="text-text-light">{hrs} hour{hrs === 1 ? "" : "s"} ago</span>;
  }

  if (ageDay < 7) {
    const days = Math.max(1, Math.floor(ageDay));
    return <span className="text-text-light">{days} day{days === 1 ? "" : "s"} ago</span>;
  }

  // Older than a week — render the absolute date in Lagos time as
  // "D MMM, HH:mm" (e.g. "4 May, 14:27").
  const lagos = new Date(value).toLocaleString("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // en-GB outputs "4 May, 14:27" already — just normalise any stray comma
  // placement across browsers.
  return <span className="text-text-light">{lagos.replace(/,\s*/, ", ")}</span>;
}

function UserForm({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    email: user?.email || "", display_name: user?.display_name || "",
    role: user?.role || "customer_service", custom_permissions: user?.custom_permissions || {},
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.email || !form.display_name) { toast.error("Email and name required"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("admin_users").update({
          display_name: form.display_name, role: form.role,
          custom_permissions: form.role === "custom" ? form.custom_permissions : {},
        }).eq("id", user.id);
        if (error) throw error;
        toast.success("User updated");
      } else {
        const { data, error } = await supabase.functions.invoke("invite-admin-user", {
          body: {
            email: form.email,
            display_name: form.display_name,
            role: form.role,
          },
        });
        if (error || (data as any)?.error) {
          toast.error((data as any)?.error || error?.message || "Could not send invite");
          setSaving(false);
          return;
        }
        toast.success(`Invite sent to ${form.email}. They will receive an email to set their password.`);
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-foreground/50 z-[100] flex items-start justify-center pt-10 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg mx-4 mb-10">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="pf text-lg font-bold flex items-center gap-2"><Shield className="w-5 h-5" />{isEdit ? "Edit Admin" : "Invite Admin"}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Email</label>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              disabled={isEdit} className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background disabled:opacity-50" />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Display Name</label>
            <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background" />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-med block mb-1">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background">
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-sm font-semibold">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-forest text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50">
            {saving ? "Saving..." : isEdit ? "Update" : "Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
