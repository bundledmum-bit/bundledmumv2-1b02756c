import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

function ActionBadge({ action }: { action: ApprovalRequest["action"] }) {
  const cls: Record<string, string> = {
    delete: "bg-red-100 text-red-700",
    add: "bg-blue-100 text-blue-700",
    update: "bg-amber-100 text-amber-800",
    create_product: "bg-emerald-100 text-emerald-700",
  };
  const label = action === "create_product" ? "new product" : action;
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cls[action] || "bg-muted text-foreground"}`}>
      {label}
    </span>
  );
}

/* ----------------------- Visual old → new review block -------------------- */
const reviewNaira = (n: any) => (n == null || n === "" ? "—" : `₦${Math.round(Number(n)).toLocaleString("en-NG")}`);
const FIELD_LABELS: Record<string, string> = {
  cost_price: "Cost price", price: "Price", compare_at_price: "Compare-at price",
  weight_kg: "Weight (kg)", weight_range_kg: "Weight range", pack_count: "Pack count",
  diaper_type: "Diaper type", item_type: "Item type", size_variant: "Size / variant",
  variant_type: "Variant type", tier: "Tier", in_stock: "In stock",
  low_stock_threshold: "Low-stock threshold", vendor_id: "Vendor", brand_name: "Brand name",
  new_vendor_name: "New vendor name", new_vendor_phone: "New vendor phone", new_vendor_whatsapp: "New vendor WhatsApp",
};
const MONEY_KEYS = new Set(["cost_price", "price", "compare_at_price"]);
const IMAGE_KEYS = new Set(["stored_image_url", "image_url", "thumbnail_url"]);
const isImageUrl = (v: any) => typeof v === "string" && /^https?:\/\//.test(v);

function fmtReviewVal(key: string, v: any, vendorNames: Record<string, string>): string {
  if (v == null || v === "") return "—";
  if (MONEY_KEYS.has(key)) return reviewNaira(v);
  if (key === "in_stock") return v === true || v === "true" ? "Yes" : "No";
  if (key === "vendor_id") return vendorNames[String(v)] || String(v);
  return String(v);
}

function BrandUpdateReview({ req, vendorNames }: { req: ApprovalRequest; vendorNames: Record<string, string> }) {
  const proposed = (req.proposed_data || {}) as Record<string, any>;
  const previous = (req.previous_data || {}) as Record<string, any>;
  const keys = Object.keys(proposed);
  const imageKeys = keys.filter(k => IMAGE_KEYS.has(k));
  const fieldKeys = keys.filter(k => !IMAGE_KEYS.has(k));
  const oldImg = previous.stored_image_url || previous.image_url || previous.thumbnail_url;
  const newImg = proposed.stored_image_url || proposed.image_url || proposed.thumbnail_url;
  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 divide-y divide-amber-100">
      {fieldKeys.map(k => (
        <div key={k} className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-3 py-2 text-xs">
          <span className="sm:w-44 shrink-0 font-semibold text-muted-foreground">{FIELD_LABELS[k] || k}</span>
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground line-through">{fmtReviewVal(k, previous[k], vendorNames)}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold text-foreground">{fmtReviewVal(k, proposed[k], vendorNames)}</span>
          </span>
        </div>
      ))}
      {imageKeys.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 text-xs">
          <span className="sm:w-44 shrink-0 font-semibold text-muted-foreground">Image</span>
          <div className="flex items-center gap-2">
            {isImageUrl(oldImg)
              ? <img src={oldImg} alt="old" className="w-12 h-12 rounded object-cover border opacity-60" />
              : <span className="text-muted-foreground">—</span>}
            <span className="text-muted-foreground">→</span>
            {isImageUrl(newImg)
              ? <img src={newImg} alt="new" className="w-12 h-12 rounded object-cover border" />
              : <span className="text-muted-foreground">image change</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateProductReview({ recordId }: { recordId: string | null }) {
  const { data } = useQuery({
    queryKey: ["approval-pending-product", recordId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pending_products" as any).select("*").eq("id", recordId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!recordId,
  });
  if (!data) return null;
  const img = data.image_url || data.stored_image_url;
  const rows: [string, string][] = [
    ["Product", data.new_product_name || (data.existing_product_id ? "(existing product)" : "—")],
    ["Subcategory", data.subcategory || "—"],
    ["Brand", data.brand_name || "—"],
    ["Cost price", reviewNaira(data.cost_price)],
    ["Weight (kg)", data.weight_kg != null ? String(data.weight_kg) : "—"],
    ["Pack count", data.pack_count != null ? String(data.pack_count) : "—"],
    [data.diaper_type ? "Diaper type" : "Item type", data.diaper_type || data.item_type || "—"],
    ["Size / variant", data.size_variant || "—"],
    ["Color", data.color || "—"],
    ["Vendor", data.vendor_name || data.vendor_id || "—"],
  ];
  return (
    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 flex gap-3">
      {isImageUrl(img) && <img src={img} alt="" className="w-16 h-16 rounded object-cover border shrink-0" />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs min-w-0">
        {rows.map(([label, val]) => (
          <div key={label} className="flex gap-2 min-w-0">
            <span className="font-semibold text-muted-foreground shrink-0">{label}:</span>
            <span className="truncate">{val}</span>
          </div>
        ))}
      </div>
    </div>
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

  // Vendor id → name, to render vendor_id changes readably in the review.
  const { data: vendorRows = [] } = useQuery({
    queryKey: ["approval-vendor-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    staleTime: 60_000,
  });
  const vendorNames: Record<string, string> = Object.fromEntries(vendorRows.map(v => [v.id, v.name]));

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
                {req.target_table === "brands" && req.action === "update" && (
                  <BrandUpdateReview req={req} vendorNames={vendorNames} />
                )}
                {req.action === "create_product" && (
                  <CreateProductReview recordId={req.target_record_id} />
                )}
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
