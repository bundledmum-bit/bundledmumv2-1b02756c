import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "./useAdmin";

export interface AdminUser {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  custom_permissions: Record<string, any>;
  is_active: boolean;
  last_login_at: string | null;
}

const ROLE_PERMISSIONS: Record<string, Record<string, string[]>> = {
  super_admin: { "*": ["view", "create", "edit", "delete", "export", "publish"] },
  admin: {
    dashboard: ["view"], products: ["view", "create", "edit", "delete"],
    bundles: ["view", "create", "edit", "delete"], orders: ["view", "edit", "delete", "export"],
    delivery: ["view", "edit"], content: ["view", "create", "edit", "delete"],
    blog: ["view", "create", "edit", "delete", "publish"], referrals: ["view", "edit"],
    analytics: ["view"], settings: ["view", "edit"], media: ["view", "upload", "delete"],
    activity_log: ["view"],
  },
  editor: {
    dashboard: ["view"], products: ["view", "create", "edit"],
    bundles: ["view", "create", "edit"], content: ["view", "create", "edit"],
    blog: ["view", "create", "edit", "publish"], media: ["view", "upload"],
  },
  order_manager: {
    dashboard: ["view"], orders: ["view", "edit", "export"],
    delivery: ["view"], products: ["view"],
  },
  viewer: {
    dashboard: ["view"], products: ["view"], bundles: ["view"],
    orders: ["view"], delivery: ["view"], content: ["view"],
    blog: ["view"], referrals: ["view"], analytics: ["view"],
    settings: ["view"], media: ["view"], activity_log: ["view"],
  },
};

export function useAdminUser() {
  const { user } = useAdmin();
  return useQuery({
    queryKey: ["admin-user-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as AdminUser | null;
    },
    enabled: !!user,
    staleTime: 60000,
  });
}

export function hasPermission(adminUser: AdminUser | null | undefined, section: string, action: string): boolean {
  if (!adminUser || !adminUser.is_active) return false;
  const role = adminUser.role;

  if (role === "super_admin") return true;

  if (role === "custom" && adminUser.custom_permissions) {
    const perms = adminUser.custom_permissions;
    return !!(perms[section] && perms[section][action]);
  }

  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  if (rolePerms["*"]) return true;
  return rolePerms[section]?.includes(action) || false;
}

export function canViewSection(adminUser: AdminUser | null | undefined, section: string): boolean {
  return hasPermission(adminUser, section, "view");
}

export interface GrantAdminPermissionVars {
  targetUserId: string;
  module: string;
  action: "view" | "manage";
  granted: boolean;
}

export function useGrantAdminPermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetUserId, module, action, granted }: GrantAdminPermissionVars) => {
      // Use admin_users.id as p_target_user_id (NOT auth_user_id).
      console.log("[permissions] granting:", { targetUserId, module, action, granted });
      const { data, error } = await (supabase as any).rpc("grant_admin_permission", {
        p_target_user_id: targetUserId,
        p_module: module,
        p_action: action,
        p_granted: granted,
      });
      console.log("[permissions] result:", { data, error });
      if (error) {
        console.error("[permissions] RPC error:", error);
        throw new Error(error.message || "Failed to update permission");
      }
      // Some functions return { error: '...' } on the data payload itself.
      if (data && typeof data === "object" && (data as any).error) {
        const msg = (data as any).error;
        console.error("[permissions] Function error:", msg);
        throw new Error(msg);
      }
      return { targetUserId, module, action, granted };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-permissions-perms", data.targetUserId] });
      // Invalidate the affected user's sidebar nav so it refetches via
      // get_admin_nav() and reflects the new permissions immediately on
      // their next render. (No-op for the granting super_admin since
      // their nav doesn't change.)
      queryClient.invalidateQueries({ queryKey: ["admin-nav-items"] });
    },
  });
}
