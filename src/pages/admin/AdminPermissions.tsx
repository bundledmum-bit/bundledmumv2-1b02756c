import { useEffect, useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useGrantAdminPermission } from "@/hooks/useAdminPermissions";

const MODULES: Array<{ key: string; label: string }> = [
  { key: "dashboard",  label: "Dashboard" },
  { key: "orders",     label: "Orders" },
  { key: "products",   label: "Products" },
  { key: "inventory",  label: "Inventory" },
  { key: "customers",  label: "Customers" },
  { key: "vendors",    label: "Vendors" },
  { key: "picking",    label: "Order Picking" },
  { key: "finance",    label: "Finance" },
  { key: "analytics",  label: "Analytics" },
  { key: "settings",   label: "Settings" },
  { key: "content",    label: "Content / Storefront" },
  { key: "coupons",    label: "Coupons & Promotions" },
  { key: "delivery",   label: "Delivery / Couriers" },
];

interface PickerUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
}

type PermAction = "view" | "manage";

/**
 * The RPC return shape isn't pinned in the spec, so handle both:
 *  1. Array of rows: [{ module, action, granted }, ...]
 *  2. Object map: { [module]: { view, manage } }
 */
function permsLookup(perms: any, module: string, action: PermAction): boolean {
  if (!perms) return false;
  if (Array.isArray(perms)) {
    return perms.some(
      (row: any) =>
        row?.module === module && row?.action === action && row?.granted === true,
    );
  }
  if (typeof perms === "object") {
    const entry = perms[module];
    if (!entry) return false;
    return entry[action] === true;
  }
  return false;
}

function permsLatestTimestamp(perms: any): string | null {
  if (!Array.isArray(perms)) return null;
  let latest: number | null = null;
  for (const row of perms) {
    const ts = row?.granted_at || row?.updated_at;
    if (!ts) continue;
    const t = new Date(ts).getTime();
    if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
  }
  return latest === null ? null : new Date(latest).toISOString();
}

export default function AdminPermissions() {
  // Self-contained super-admin guard. We do auth.getUser() and the role
  // lookup in one effect rather than relying on shared hooks, to avoid
  // any "looks ready but data still arriving" race that bounced real
  // super_admins out of this page on first nav.
  const [authReady, setAuthReady] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setIsSuperAdmin(false);
          setAuthReady(true);
        }
        return;
      }
      const { data } = await supabase
        .from("admin_users")
        .select("role")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setIsSuperAdmin(data?.role === "super_admin");
      setAuthReady(true);
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pendingCell, setPendingCell] = useState<string | null>(null);
  const [recentlyOk, setRecentlyOk] = useState<string | null>(null);
  const [localUpdatedAt, setLocalUpdatedAt] = useState<string | null>(null);
  const grant = useGrantAdminPermission();

  const usersQuery = useQuery({
    queryKey: ["admin-permissions-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_users")
        .select("id, email, display_name, role, is_active")
        .neq("role", "super_admin")
        .order("email");
      if (error) throw error;
      return (data || []) as PickerUser[];
    },
    staleTime: 60_000,
  });

  const permsQuery = useQuery({
    queryKey: ["admin-permissions-perms", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return null;
      const { data, error } = await (supabase as any).rpc("get_user_permissions", {
        p_target_user_id: selectedUserId,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUserId,
    staleTime: 30_000,
  });

  const selectedUser = useMemo(
    () => usersQuery.data?.find(u => u.id === selectedUserId) || null,
    [usersQuery.data, selectedUserId],
  );

  const lastUpdatedDisplay = useMemo(() => {
    if (localUpdatedAt) return new Date(localUpdatedAt).toLocaleString();
    const ts = permsLatestTimestamp(permsQuery.data);
    if (ts) return new Date(ts).toLocaleString();
    return null;
  }, [permsQuery.data, localUpdatedAt]);

  // Render nothing until BOTH auth + role lookups have resolved. Only
  // then decide between rendering the page or redirecting.
  if (!authReady) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }
  if (!isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  async function runRpc(
    targetUserId: string,
    module: string,
    action: PermAction,
    granted: boolean,
    cellKey: string,
  ) {
    setPendingCell(cellKey);
    try {
      await grant.mutateAsync({ targetUserId, module, action, granted });
      setLocalUpdatedAt(new Date().toISOString());
      setRecentlyOk(cellKey);
      setTimeout(() => {
        setRecentlyOk(prev => (prev === cellKey ? null : prev));
      }, 1500);
    } catch (e: any) {
      toast.error(e?.message || "Could not update permission");
      throw e;
    } finally {
      setPendingCell(prev => (prev === cellKey ? null : prev));
    }
  }

  async function handleToggle(module: string, action: PermAction, nextValue: boolean) {
    if (!selectedUserId) return;
    const currentView = permsLookup(permsQuery.data, module, "view");
    const currentManage = permsLookup(permsQuery.data, module, "manage");
    const cellKey = `${module}:${action}`;

    try {
      if (action === "manage" && nextValue && !currentView) {
        // Manage ON forces View ON: grant view first, then manage.
        await runRpc(selectedUserId, module, "view", true, `${module}:view`);
        await runRpc(selectedUserId, module, "manage", true, cellKey);
      } else if (action === "view" && !nextValue && currentManage) {
        // View OFF forces Manage OFF: revoke manage first, then view.
        await runRpc(selectedUserId, module, "manage", false, `${module}:manage`);
        await runRpc(selectedUserId, module, "view", false, cellKey);
      } else {
        await runRpc(selectedUserId, module, action, nextValue, cellKey);
      }
    } catch {
      // toast already fired; nothing else to do
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="pf text-2xl font-bold">User Permissions</h1>
        <p className="text-sm text-text-med mt-1">
          Control exactly what each team member can see and do in the admin.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left panel: user list */}
        <div className="md:w-72 flex-shrink-0">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/40">
              <span className="text-xs font-semibold text-text-med uppercase tracking-wide">
                Team Members
              </span>
            </div>
            {usersQuery.isLoading ? (
              <div className="p-6 text-center text-sm text-text-med">
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              </div>
            ) : (usersQuery.data || []).length === 0 ? (
              <div className="p-6 text-center text-sm text-text-med">No users.</div>
            ) : (
              <ul className="max-h-[70vh] overflow-y-auto">
                {(usersQuery.data || []).map(u => {
                  const isSelected = u.id === selectedUserId;
                  const name = u.display_name || u.email;
                  return (
                    <li key={u.id}>
                      <button
                        onClick={() => setSelectedUserId(u.id)}
                        className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 transition-colors ${
                          isSelected
                            ? "bg-muted ring-1 ring-inset ring-forest/30"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              u.is_active ? "bg-green-500" : "bg-gray-400"
                            }`}
                            aria-label={u.is_active ? "Active" : "Inactive"}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">{name}</div>
                            {u.display_name && (
                              <div className="text-[11px] text-text-light truncate">
                                {u.email}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-1.5">
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {u.role.replace("_", " ")}
                          </Badge>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right panel: permission matrix */}
        <div className="flex-1 min-w-0">
          {!selectedUser ? (
            <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-text-med">
              Select a user from the left to view and edit permissions.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="pf text-lg font-bold">
                  {(selectedUser.display_name || selectedUser.email)}'s Permissions
                </h2>
                <p className="text-xs text-text-med mt-0.5">
                  Toggle access for each section below.
                </p>
              </div>

              {permsQuery.isLoading ? (
                <div className="p-10 text-center text-sm text-text-med">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-text-med">
                        Section
                      </th>
                      <th className="px-4 py-2.5 text-center font-semibold text-text-med w-32">
                        View
                      </th>
                      <th className="px-4 py-2.5 text-center font-semibold text-text-med w-32">
                        Manage
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map(m => {
                      const viewOn = permsLookup(permsQuery.data, m.key, "view");
                      const manageOn = permsLookup(permsQuery.data, m.key, "manage");
                      const viewKey = `${m.key}:view`;
                      const manageKey = `${m.key}:manage`;
                      return (
                        <tr key={m.key} className="border-t border-border">
                          <td className="px-4 py-3 font-medium">{m.label}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Switch
                                checked={viewOn}
                                disabled={pendingCell === viewKey}
                                onCheckedChange={v => handleToggle(m.key, "view", v)}
                                aria-label={`${m.label} view`}
                              />
                              {pendingCell === viewKey && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-text-light" />
                              )}
                              {recentlyOk === viewKey && pendingCell !== viewKey && (
                                <Check className="w-3.5 h-3.5 text-green-600" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <Switch
                                checked={manageOn}
                                disabled={pendingCell === manageKey}
                                onCheckedChange={v => handleToggle(m.key, "manage", v)}
                                aria-label={`${m.label} manage`}
                              />
                              {pendingCell === manageKey && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-text-light" />
                              )}
                              {recentlyOk === manageKey && pendingCell !== manageKey && (
                                <Check className="w-3.5 h-3.5 text-green-600" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}

              <div className="px-5 py-3 border-t border-border bg-muted/30">
                <span className="text-[11px] text-text-light">
                  Last updated: {lastUpdatedDisplay || "—"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
