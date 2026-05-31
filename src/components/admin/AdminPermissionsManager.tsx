import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", admin: "Admin", fulfilment: "Fulfilment",
  customer_service: "Customer Service", analyst: "Analyst", content_manager: "Content Manager", custom: "Custom",
};

const ROLES = ["super_admin", "admin", "fulfilment", "customer_service", "analyst", "content_manager", "custom"];

interface Props {
  users: any[];
}

export default function AdminPermissionsManager({ users }: Props) {
  const queryClient = useQueryClient();
  const { adminUser: currentAdmin } = usePermissions();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = users.find(u => u.id === selectedUserId);

  // Fetch all permission definitions
  const { data: permDefs } = useQuery({
    queryKey: ["perm-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_permission_definitions")
        .select("*").eq("is_active", true).order("module").order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch role defaults for selected user's role
  const { data: roleDefaults } = useQuery({
    queryKey: ["role-defaults", selectedUser?.role],
    queryFn: async () => {
      if (!selectedUser) return [];
      const { data, error } = await supabase.from("admin_role_defaults")
        .select("*").eq("role", selectedUser.role);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedUser,
  });

  // Fetch per-user overrides
  const { data: userPerms } = useQuery({
    queryKey: ["user-perms", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const { data, error } = await supabase.from("admin_user_permissions")
        .select("*").eq("admin_user_id", selectedUserId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedUserId,
  });

  // Sync nav visibility for custom role users
  const syncNavVisibility = async (module: string, action: string, granted: boolean) => {
    if (!selectedUser || selectedUser.role !== "custom" || !selectedUserId) return;
    const { data: navItems } = await supabase
      .from("admin_nav_items")
      .select("nav_key")
      .eq("requires_permission_module", module)
      .eq("requires_permission_action", action);
    if (!navItems || navItems.length === 0) return;
    for (const item of navItems) {
      await supabase
        .from("admin_user_nav_visibility")
        .upsert({
          admin_user_id: selectedUserId,
          nav_key: item.nav_key,
          visible: granted,
          set_by: currentAdmin?.id || null,
          set_at: new Date().toISOString(),
        }, { onConflict: "admin_user_id,nav_key" });
    }
  };

  // Toggle permission
  const togglePerm = useMutation({
    mutationFn: async ({ module, action, granted }: { module: string; action: string; granted: boolean }) => {
      if (!selectedUserId) return;
      // Check if override exists
      const existing = (userPerms || []).find((p: any) => p.module === module && p.action === action);
      if (existing) {
        const { error } = await supabase.from("admin_user_permissions")
          .update({ granted }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("admin_user_permissions").insert({
          admin_user_id: selectedUserId, module, action, granted,
          granted_by: currentAdmin?.id || null,
        });
        if (error) throw error;
      }
      // Sync nav visibility for custom role
      await syncNavVisibility(module, action, granted);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-perms", selectedUserId] });
      toast.success("Permission updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Update user role
  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.from("admin_users").update({ role }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["role-defaults", selectedUser?.role] });
      toast.success("Role updated");
    },
  });

  // Remove user override (reset to role default)
  const removeOverride = useMutation({
    mutationFn: async ({ module, action }: { module: string; action: string }) => {
      const existing = (userPerms || []).find((p: any) => p.module === module && p.action === action);
      if (existing) {
        const { error } = await supabase.from("admin_user_permissions").delete().eq("id", existing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-perms", selectedUserId] });
      toast.success("Override removed");
    },
  });

  // Build modules from definitions
  const modules = [...new Set((permDefs || []).map((d: any) => d.module))];
  const getActions = (mod: string) => (permDefs || []).filter((d: any) => d.module === mod);

  const getRoleDefault = (mod: string, act: string): boolean => {
    return (roleDefaults || []).some((rd: any) => rd.module === mod && rd.action === act && rd.granted);
  };

  const getUserOverride = (mod: string, act: string): { exists: boolean; granted: boolean } => {
    const override = (userPerms || []).find((p: any) => p.module === mod && p.action === act);
    if (!override) return { exists: false, granted: false };
    return { exists: true, granted: override.granted };
  };

  const getEffective = (mod: string, act: string): boolean => {
    if (selectedUser?.role === "super_admin") return true;
    const override = getUserOverride(mod, act);
    if (override.exists) return override.granted;
    return getRoleDefault(mod, act);
  };

  return (
    <div>
      {/* User selector */}
      <div className="mb-6">
        <label className="text-xs font-semibold text-text-med block mb-2">Select Admin User</label>
        <div className="flex gap-2 flex-wrap">
          {users.filter(u => u.auth_user_id !== currentAdmin?.auth_user_id).map((u: any) => (
            <button key={u.id} onClick={() => setSelectedUserId(u.id)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border ${selectedUserId === u.id ? "border-forest bg-forest/10 text-forest" : "border-border"}`}>
              {u.display_name} <span className="text-text-light">({ROLE_LABELS[u.role] || u.role})</span>
            </button>
          ))}
        </div>
      </div>

      {!selectedUser ? (
        <div className="text-center py-10 text-text-med">Select an admin user to manage their permissions</div>
      ) : (
        <div>
          {/* Role selector */}
          <div className="flex items-center gap-3 mb-6 bg-card border border-border rounded-xl p-4">
            <label className="text-xs font-semibold text-text-med">Role:</label>
            <select value={selectedUser.role}
              onChange={e => updateRole.mutate({ userId: selectedUser.id, role: e.target.value })}
              className="border border-input rounded-lg px-3 py-1.5 text-sm bg-background">
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <span className="text-[10px] text-text-light ml-2">Role defaults shown as base. Per-user overrides shown with blue border.</span>
          </div>

          {/* Legend */}
          <div className="flex gap-4 mb-4 text-[10px]">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /> Granted</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400" /> Denied</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-200" /> N/A</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded border-2 border-blue-500 bg-green-500" /> User override</div>
          </div>

          {/* Permissions grid */}
          <div className="space-y-4">
            {modules.map(mod => {
              const actions = getActions(mod);
              return (
                <div key={mod} className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-bold capitalize mb-3">{mod.replace(/_/g, " ")}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {actions.map((a: any) => {
                      const override = getUserOverride(a.module, a.action);
                      const effective = getEffective(a.module, a.action);
                      const isSuperAdminUser = selectedUser.role === "super_admin";

                      return (
                        <div key={`${a.module}-${a.action}`}
                          className={`relative rounded-lg p-2 text-center cursor-pointer transition-colors ${
                            isSuperAdminUser ? "bg-green-100" :
                            effective ? "bg-green-100" : "bg-red-50"
                          } ${override.exists ? "ring-2 ring-blue-500" : ""}`}
                          onClick={() => {
                            if (isSuperAdminUser) return;
                            if (override.exists) {
                              // Toggle or remove override
                              if (override.granted === getRoleDefault(a.module, a.action)) {
                                removeOverride.mutate({ module: a.module, action: a.action });
                              } else {
                                togglePerm.mutate({ module: a.module, action: a.action, granted: !override.granted });
                              }
                            } else {
                              // Create override (opposite of role default)
                              togglePerm.mutate({ module: a.module, action: a.action, granted: !getRoleDefault(a.module, a.action) });
                            }
                          }}
                          title={`${a.label}\n${a.description || ""}\nRole default: ${getRoleDefault(a.module, a.action) ? "Yes" : "No"}${override.exists ? `\nOverride: ${override.granted ? "Granted" : "Denied"}` : ""}`}
                        >
                          <div className="text-[10px] font-semibold truncate">{a.label || a.action.replace(/_/g, " ")}</div>
                          <div className={`text-[9px] mt-0.5 ${effective ? "text-green-700" : "text-red-600"}`}>
                            {isSuperAdminUser ? "✓ all" : effective ? "✓" : "✕"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
