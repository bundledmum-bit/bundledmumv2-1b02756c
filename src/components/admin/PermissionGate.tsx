import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePagePermission } from "@/hooks/usePagePermission";

interface Props {
  module: string;
  action: string;
  children: ReactNode;
}

export default function PermissionGate({ module, action, children }: Props) {
  const { loading, allowed } = usePagePermission(module, action);

  if (loading) return null;
  // Silent redirect to /admin instead of an Access Denied screen — covers
  // stale nav, direct URL hits, and bookmarked links to pages the user
  // can no longer access.
  if (!allowed) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
