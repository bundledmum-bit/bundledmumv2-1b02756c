import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAdminUser } from "@/hooks/useAdminPermissions";
import { useRequestAdminAction, notifyApproval } from "@/hooks/useApprovals";

interface Props {
  /** Target table name (e.g. 'products', 'coupons', 'pages'). */
  table: string;
  /** PK of the row being targeted. */
  recordId: string;
  /** Human-readable identifier for the row — shown in the dialog. */
  recordLabel: string;
  /** Existing direct-delete handler. Called only for super_admins. */
  onDeleted?: () => void;
  /** Optional custom trigger element. Defaults to children. */
  children?: ReactNode;
  className?: string;
}

/**
 * Wraps an existing admin delete trigger. For super_admins it just calls
 * `onDeleted` (so the host page's existing direct-delete logic still runs).
 * For everyone else it opens a "Request deletion" dialog that submits an
 * admin_approval_requests row via the request_admin_action RPC.
 */
export default function RequestDeleteButton({
  table,
  recordId,
  recordLabel,
  onDeleted,
  children,
  className,
}: Props) {
  const { data: adminUser } = useAdminUser();
  const requestAction = useRequestAdminAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const isSuperAdmin = adminUser?.role === "super_admin";

  if (isSuperAdmin) {
    // Super admins keep the existing delete UX. We render the trigger and
    // forward its click directly to the host's handler.
    return (
      <span
        className={className}
        role="button"
        onClick={onDeleted}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onDeleted?.();
          }
        }}
        tabIndex={-1}
      >
        {children}
      </span>
    );
  }

  async function submitRequest() {
    try {
      const description = `Delete ${table}: ${recordLabel}`;
      await requestAction.mutateAsync({
        action: "delete",
        table,
        recordId,
        description,
      });
      toast.success("Deletion request submitted. Super admin will review shortly.");
      notifyApproval({
        type: "new_request",
        description,
        action: "delete",
        table_name: table,
        requester_name:
          adminUser?.display_name || adminUser?.email || "Unknown",
        super_admin_email: "iceboxx766@gmail.com",
      });
      setOpen(false);
      setReason("");
    } catch (e: any) {
      toast.error(e?.message || "Could not submit request");
    }
  }

  return (
    <>
      <span
        className={className}
        role="button"
        onClick={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        tabIndex={-1}
      >
        {children}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-text-med">
              You're requesting deletion of:
            </p>
            <div className="text-sm font-semibold border border-border rounded-md p-2 bg-muted/40">
              {recordLabel}
            </div>
            <div>
              <label className="text-xs font-semibold text-text-med block mb-1">
                Reason for deletion (optional)
              </label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Why should this be deleted?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitRequest} disabled={requestAction.isPending}>
              {requestAction.isPending ? "Submitting..." : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
