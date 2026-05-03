import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;

const TARGET_ROLES = ["admin", "super_admin"];
const STALE_30 = 30 * 1000;

export interface AdminNotification {
  id: string;
  title: string | null;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  order_id: string | null;
  target_module: string | null;
  target_role: string | null;
}

function useAdminNotificationsRealtime(queryKeys: string[][]) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel(`admin-notifications-feed-${Math.random().toString(36).slice(2)}`);
    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_notifications" },
        () => {
          queryKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);
}

export function useUnreadAdminNotifications() {
  useAdminNotificationsRealtime([["admin-notifs-unread"], ["admin-notifs-count"]]);
  return useQuery({
    queryKey: ["admin-notifs-unread"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .eq("is_read", false)
        .in("target_role", TARGET_ROLES)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as AdminNotification[];
    },
    staleTime: STALE_30,
  });
}

export function useUnreadCount() {
  useAdminNotificationsRealtime([["admin-notifs-unread"], ["admin-notifs-count"]]);
  return useQuery({
    queryKey: ["admin-notifs-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("admin_notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false)
        .in("target_role", TARGET_ROLES);
      if (error) throw error;
      return count || 0;
    },
    staleTime: STALE_30,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notifs-unread"] });
      qc.invalidateQueries({ queryKey: ["admin-notifs-count"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("is_read", false)
        .in("target_role", TARGET_ROLES);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notifs-unread"] });
      qc.invalidateQueries({ queryKey: ["admin-notifs-count"] });
    },
  });
}
