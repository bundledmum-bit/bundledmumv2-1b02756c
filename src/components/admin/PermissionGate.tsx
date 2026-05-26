import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePagePermission } from "@/hooks/usePagePermission";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";

interface Props {
  module: string;
  action: string;
  children: ReactNode;
}

export default function PermissionGate({ module, action, children }: Props) {
  const { loading, allowed } = usePagePermission(module, action);
  const { adminUser } = usePermissions();

  if (loading) return null;
  // Silent redirect instead of an Access Denied screen — covers stale nav,
  // direct URL hits, and bookmarked links to pages the user can no longer
  // access. Pickers go to their queue rather than the main admin home,
  // which they can't access anyway.
  if (!allowed) {
    const role = String(adminUser?.role || "").trim().toLowerCase();
    const fallback = role === "picker" ? "/admin/picking" : "/admin";
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
