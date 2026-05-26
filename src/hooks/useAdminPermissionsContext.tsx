import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "./useAdmin";

export type PermissionsMap = Record<string, Record<string, boolean>>;

interface AdminPermissionsContextType {
  permissions: PermissionsMap;
  loading: boolean;
  adminUser: any | null;
  can: (module: string, action: string) => boolean;
  isSuperAdmin: boolean;
  refresh: () => void;
}

const AdminPermissionsContext = createContext<AdminPermissionsContextType>({
  permissions: {},
  loading: true,
  adminUser: null,
  can: () => false,
  isSuperAdmin: false,
  refresh: () => {},
});

export function AdminPermissionsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAdmin();
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [adminUser, setAdminUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    // While the Supabase auth session is still being restored from
    // localStorage, useAdmin() reports user=null with loading=true.
    // Returning here without flipping the context loading flag keeps
    // PermissionGate in its placeholder state instead of triggering an
    // immediate Navigate-to-/admin redirect during hard refreshes.
    if (authLoading) return;
    if (!user) { setLoading(false); return; }

    try {
      // 1. Get admin user profile
      const { data: au } = await supabase
        .from("admin_users")
        .select("*")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      setAdminUser(au);
      if (!au || !au.is_active) { setPermissions({}); setLoading(false); return; }

      // Super admin gets everything
      if (au.role === "super_admin") {
        // Build a full permissions map with everything true
        const { data: defs } = await supabase
          .from("admin_permission_definitions")
          .select("module, action")
          .eq("is_active", true);

        const map: PermissionsMap = {};
        (defs || []).forEach((d: any) => {
          if (!map[d.module]) map[d.module] = {};
          map[d.module][d.action] = true;
        });
        setPermissions(map);
        setLoading(false);
        return;
      }

      // 2. Get all permission definitions
      const { data: defs } = await supabase
        .from("admin_permission_definitions")
        .select("module, action")
        .eq("is_active", true);

      // 3. Get role defaults
      const { data: roleDefaults } = await supabase
        .from("admin_role_defaults")
        .select("module, action, granted")
        .eq("role", au.role);

      // 4. Get per-user overrides
      const { data: userPerms } = await supabase
        .from("admin_user_permissions")
        .select("module, action, granted")
        .eq("admin_user_id", au.id);

      // Build map: start with all false, apply role defaults, then user overrides
      const map: PermissionsMap = {};
      (defs || []).forEach((d: any) => {
        if (!map[d.module]) map[d.module] = {};
        map[d.module][d.action] = false;
      });

      (roleDefaults || []).forEach((rd: any) => {
        if (!map[rd.module]) map[rd.module] = {};
        map[rd.module][rd.action] = rd.granted;
      });

      (userPerms || []).forEach((up: any) => {
        if (!map[up.module]) map[up.module] = {};
        map[up.module][up.action] = up.granted;
      });

      setPermissions(map);
    } catch (e) {
      console.error("Failed to load permissions", e);
    } finally {
      setLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => { fetchPermissions(); }, [fetchPermissions]);

  const can = useCallback((module: string, action: string): boolean => {
    // While the admin_users row is still being fetched, optimistically
    // allow actions. The DB enforces RLS independently, so a click made
    // during this brief window by a non-privileged user will be
    // rejected server-side; the alternative (disabling every action
    // for ~300 ms after every page mount) made super_admins think the
    // page was broken.
    if (loading && !adminUser) return true;
    if (!adminUser) return false;
    if (adminUser.is_active === false) {
      // Surface a self-diagnosis hint — a deactivated admin will
      // otherwise just see every button greyed out with no clue why.
      if (typeof console !== "undefined") {
        console.warn("[permissions] adminUser.is_active is false — all actions denied.");
      }
      return false;
    }
    // Normalise stored role values so a stray space or unexpected case
    // ("Super_Admin", " super_admin ") still grants the bypass.
    const role = String(adminUser.role || "").trim().toLowerCase();
    if (role === "super_admin" || role === "admin") return true;
    return permissions[module]?.[action] === true;
  }, [permissions, adminUser, loading]);

  const isSuperAdmin = adminUser?.role === "super_admin";

  return (
    <AdminPermissionsContext.Provider value={{ permissions, loading, adminUser, can, isSuperAdmin, refresh: fetchPermissions }}>
      {children}
    </AdminPermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(AdminPermissionsContext);
}
