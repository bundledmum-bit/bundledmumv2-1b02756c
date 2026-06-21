import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
// admin_approval_requests is not yet in the generated types; cast to any to
// avoid TS friction. Same pattern as src/hooks/useMerchandising.ts.
const supabase = supabaseTyped as any;

const APPROVAL_NOTIFY_URL =
  "https://rbtyprmkolqfylcbmgrk.supabase.co/functions/v1/send-approval-notification";

export interface ApprovalAdmin {
  id: string;
  email: string;
  display_name: string | null;
}

export interface ApprovalRequest {
  id: string;
  action: "delete" | "add";
  target_table: string;
  target_record_id: string | null;
  proposed_data: any | null;
  description: string;
  requested_by: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
  requester: ApprovalAdmin | null;
  reviewer: ApprovalAdmin | null;
}

const APPROVAL_FK_SELECT =
  "*, requester:admin_users!admin_approval_requests_requested_by_fkey(id, email, display_name), reviewer:admin_users!admin_approval_requests_reviewed_by_fkey(id, email, display_name)";

async function fetchWithFallback(filter: "pending" | "history"): Promise<ApprovalRequest[]> {
  // First attempt: PostgREST FK alias join. If FK aliases differ (or aren't
  // exposed yet via generated types), fall back to two queries.
  const baseQuery = (sel: string) => {
    let q = supabase.from("admin_approval_requests").select(sel);
    if (filter === "pending") {
      q = q.eq("status", "pending").order("requested_at", { ascending: false });
    } else {
      q = q.in("status", ["approved", "rejected"]).order("reviewed_at", { ascending: false });
    }
    return q;
  };

  const { data, error } = await baseQuery(APPROVAL_FK_SELECT);
  if (!error && Array.isArray(data)) {
    return (data || []).map((r: any) => ({
      ...r,
      requester: r.requester || null,
      reviewer: r.reviewer || null,
    })) as ApprovalRequest[];
  }

  // Fallback path — fetch rows then admin_users separately.
  const { data: rows, error: rowsErr } = await baseQuery("*");
  if (rowsErr) throw rowsErr;
  const ids = new Set<string>();
  for (const r of (rows || []) as any[]) {
    if (r.requested_by) ids.add(r.requested_by);
    if (r.reviewed_by) ids.add(r.reviewed_by);
  }
  let adminMap = new Map<string, ApprovalAdmin>();
  if (ids.size > 0) {
    const { data: admins, error: aErr } = await supabase
      .from("admin_users")
      .select("id, email, display_name")
      .in("id", Array.from(ids));
    if (aErr) throw aErr;
    adminMap = new Map((admins || []).map((a: any) => [a.id, a]));
  }
  return (rows || []).map((r: any) => ({
    ...r,
    requester: r.requested_by ? adminMap.get(r.requested_by) || null : null,
    reviewer: r.reviewed_by ? adminMap.get(r.reviewed_by) || null : null,
  })) as ApprovalRequest[];
}

export function useApprovalRequests(filter: "pending" | "history") {
  return useQuery({
    queryKey: ["approval-requests", filter],
    queryFn: () => fetchWithFallback(filter),
    staleTime: 30_000,
  });
}

export function usePendingApprovalsCount(enabled = true) {
  return useQuery({
    queryKey: ["pending-approvals-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("admin_approval_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return (count ?? 0) as number;
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export interface ProcessApprovalVars {
  requestId: string;
  approved: boolean;
  note?: string | null;
}

export function useProcessApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, approved, note }: ProcessApprovalVars) => {
      const { data, error } = await supabase.rpc("process_admin_approval", {
        p_request_id: requestId,
        p_approved: approved,
        p_note: note || null,
      });
      if (error) throw new Error(error.message || "Failed to process approval");
      if (data && typeof data === "object" && (data as any).error) {
        throw new Error((data as any).error);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-requests"] });
      qc.invalidateQueries({ queryKey: ["pending-approvals-count"] });
    },
  });
}

// Super-admin direct permanent delete. The RPC hard-deletes when safe, or
// refuses with a human-readable reason when the record is referenced by
// orders/subscriptions/finance (success:false, blocked:true). Separate from
// the soft-delete approval workflow used by non-super-admins.
export interface PermanentDeleteResult {
  success: boolean;
  deleted?: boolean;
  blocked?: boolean;
  error?: string;
}

export async function superAdminPermanentDelete(
  table: string,
  recordId: string,
): Promise<PermanentDeleteResult> {
  const { data, error } = await supabase.rpc("super_admin_permanent_delete", {
    p_target_table: table,
    p_record_id: recordId,
  });
  if (error) return { success: false, error: error.message };
  return (data ?? { success: false, error: "No response from server" }) as PermanentDeleteResult;
}

export interface RequestAdminActionVars {
  action: "delete" | "add";
  table: string;
  recordId?: string | null;
  proposedData?: any | null;
  description: string;
}

export function useRequestAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      action,
      table,
      recordId,
      proposedData,
      description,
    }: RequestAdminActionVars) => {
      const { data, error } = await supabase.rpc("request_admin_action", {
        p_action: action,
        p_target_table: table,
        p_record_id: recordId || null,
        p_proposed_data: proposedData ?? null,
        p_description: description,
      });
      if (error) throw new Error(error.message || "Failed to submit request");
      if (data && typeof data === "object" && (data as any).error) {
        throw new Error((data as any).error);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-requests", "pending"] });
      qc.invalidateQueries({ queryKey: ["pending-approvals-count"] });
    },
  });
}

// Edge-function notifier. Fire-and-forget — we never want a notification
// failure to block the user's primary action.
export type NotifyApprovalPayload =
  | {
      type: "new_request";
      description: string;
      action: "delete" | "add";
      table_name: string;
      requester_name: string;
      super_admin_email: string;
    }
  | {
      type: "outcome";
      description: string;
      approved: boolean;
      note?: string | null;
      reviewer_name: string;
      requester_email: string;
    };

export function notifyApproval(payload: NotifyApprovalPayload) {
  try {
    void fetch(APPROVAL_NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(err => {
      console.warn("[notifyApproval] request failed", err);
    });
  } catch (err) {
    console.warn("[notifyApproval] threw before dispatch", err);
  }
}
