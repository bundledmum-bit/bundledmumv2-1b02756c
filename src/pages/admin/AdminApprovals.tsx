import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApprovalRequests,
  useProcessApproval,
  notifyApproval,
  type ApprovalRequest,
} from "@/hooks/useApprovals";

interface CurrentAdmin {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
}

const lagosFmt = new Intl.DateTimeFormat("en-NG", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Africa/Lagos",
});

function formatLagos(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return lagosFmt.format(new Date(iso));
  } catch {
    return iso || "—";
  }
}

export default function AdminApprovals() {
  // Same self-contained super_admin guard pattern as AdminPermissions.tsx.
  const [authReady, setAuthReady] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<CurrentAdmin | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setCurrentAdmin(null);
          setAuthReady(true);
        }
        return;
      }
      const { data } = await supabase
        .from("admin_users")
        .select("id, email, display_name, role")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setCurrentAdmin((data as CurrentAdmin) || null);
      setAuthReady(true);
    };
    check();
    return () => { cancelled = true; };
  }, []);

  if (!authReady) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (!currentAdmin || currentAdmin.role !== "super_admin") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="pf text-2xl font-bold">Approvals</h1>
        <p className="text-sm text-text-med mt-1">
          Review pending requests from team members
        </p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <PendingTab currentAdmin={currentAdmin} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ActionBadge({ action }: { action: "delete" | "add" }) {
  const cls =
    action === "delete"
      ? "bg-red-100 text-red-700"
      : "bg-blue-100 text-blue-700";
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cls}`}>
      {action}
    </span>
  );
}

function RequesterLine({ req }: { req: ApprovalRequest }) {
  const name = req.requester?.display_name || req.requester?.email || "Unknown";
  return (
    <span className="text-xs text-text-med">
      Requested by <span className="font-semibold text-foreground">{name}</span>
      {" · "}
      {formatLagos(req.requested_at)}
    </span>
  );
}

function PendingTab({ currentAdmin }: { currentAdmin: CurrentAdmin }) {
  const { data, isLoading } = useApprovalRequests("pending");
  const process = useProcessApproval();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");

  const reset = () => {
    setSelectedRequestId(null);
    setDecision(null);
    setNote("");
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const items = data || [];
  if (items.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg py-10 text-center text-sm text-text-med">
        No pending requests.
      </div>
    );
  }

  async function confirmDecision(req: ApprovalRequest, approved: boolean) {
    try {
      await process.mutateAsync({
        requestId: req.id,
        approved,
        note: note.trim() || null,
      });
      // fire-and-forget notification
      notifyApproval({
        type: "outcome",
        description: req.description,
        approved,
        note: note.trim() || null,
        reviewer_name:
          currentAdmin.display_name || currentAdmin.email,
        requester_email: req.requester?.email || "",
      });
      toast.success(approved ? "Approved" : "Rejected");
      reset();
    } catch (e: any) {
      toast.error(e?.message || "Could not process request");
    }
  }

  return (
    <div className="space-y-3">
      {items.map(req => {
        const isOpen = selectedRequestId === req.id && decision !== null;
        return (
          <Card key={req.id} className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <ActionBadge action={req.action} />
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {req.target_table}
                  </Badge>
                </div>
                <div className="text-sm font-semibold">{req.description}</div>
                <RequesterLine req={req} />
              </div>
              {!isOpen && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedRequestId(req.id);
                      setDecision("reject");
                      setNote("");
                    }}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedRequestId(req.id);
                      setDecision("approve");
                      setNote("");
                    }}
                  >
                    Approve
                  </Button>
                </div>
              )}
            </div>
            {isOpen && (
              <div className="mt-4 space-y-2 border-t border-border pt-3">
                <label className="text-xs font-semibold text-text-med">
                  Note (optional)
                </label>
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Add an optional note for the requester"
                  rows={3}
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={reset}
                    className="text-xs text-text-med hover:underline"
                    type="button"
                  >
                    Cancel
                  </button>
                  <Button
                    size="sm"
                    variant={decision === "reject" ? "destructive" : "default"}
                    disabled={process.isPending}
                    onClick={() => confirmDecision(req, decision === "approve")}
                  >
                    {process.isPending
                      ? "Working..."
                      : decision === "approve"
                        ? "Confirm approval"
                        : "Confirm rejection"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function HistoryTab() {
  const { data, isLoading } = useApprovalRequests("history");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const items = data || [];
  if (items.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg py-10 text-center text-sm text-text-med">
        No reviewed requests yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map(req => {
        const reviewerName =
          req.reviewer?.display_name || req.reviewer?.email || "Unknown";
        const statusCls =
          req.status === "approved"
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-700";
        return (
          <Card key={req.id} className="p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <ActionBadge action={req.action} />
              <Badge variant="secondary" className="text-[10px] font-mono">
                {req.target_table}
              </Badge>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold capitalize ${statusCls}`}
              >
                {req.status}
              </span>
            </div>
            <div className="text-sm font-semibold">{req.description}</div>
            <div className="text-xs text-text-med">
              <RequesterLine req={req} />
            </div>
            <div className="text-xs text-text-med">
              Reviewed by{" "}
              <span className="font-semibold text-foreground">
                {reviewerName}
              </span>{" "}
              · {formatLagos(req.reviewed_at)}
            </div>
            {req.reviewer_note && (
              <div className="text-xs text-text-med italic border-l-2 border-border pl-2">
                {req.reviewer_note}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
