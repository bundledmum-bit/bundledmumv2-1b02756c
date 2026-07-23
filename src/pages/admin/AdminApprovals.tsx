import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, AlertTriangle } from "lucide-react";
import BrandImageUpload from "@/components/admin/BrandImageUpload";
import { SizesEditor, ColorsEditor, normalizeSizes, normalizeColors, type SizeRow, type ColorRow } from "@/components/admin/VariantEditors";
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

// approval_price_impact result for a pending request.
interface PriceImpact {
  has_cost_change: boolean;
  brand_id: string | null;
  brand_name: string | null;
  product_name: string | null;
  old_cost: number;
  new_cost: number;
  cost_direction: "up" | "down" | "same";
  current_price: number;
  markup_before: number;
  markup_after: number; // markup if the price is left unchanged
  floor_percent: number;
  breaches_floor: boolean;
  min_new_price: number; // lowest price that clears the floor
  price_to_hold_margin: number; // price that keeps the old markup
  keep_current_price: number; // the current price, unchanged
  severity: "blocked" | "warning" | "info";
  message: string;
}

// Shows the margin impact of a pending cost change: cost + price + markup
// before/after, styled by severity. 'blocked' = red (approving as-is fails),
// 'warning' = amber (legal, but the margin moved a lot — look), 'info' =
// neutral (small change). Shown for EVERY cost change, incl. cost decreases
// where the markup balloons and we quietly lose competitiveness.
function MarginImpactPanel({ impact }: { impact: PriceImpact }) {
  const sev = impact.severity;
  const s = sev === "blocked"
    ? { box: "border-red-300 bg-red-50", accent: "text-red-600", msg: "text-red-700", icon: true }
    : sev === "warning"
    ? { box: "border-amber-300 bg-amber-50", accent: "text-amber-700", msg: "text-amber-800", icon: true }
    : { box: "border-border bg-muted/40", accent: "text-forest", msg: "text-text-med", icon: false };
  const costArrow = impact.cost_direction === "down" ? "↓" : impact.cost_direction === "up" ? "↑" : "";
  return (
    <div className={`mt-2 rounded-lg border px-3 py-2.5 text-[13px] ${s.box}`}>
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <span className="text-text-med">Cost</span>
        <span className="text-right font-semibold">
          {reviewNaira(impact.old_cost)} → {reviewNaira(impact.new_cost)}
          {costArrow && <span className={`ml-1 ${s.accent}`}>{costArrow}</span>}
        </span>
        <span className="text-text-med">Price</span>
        <span className="text-right font-semibold">{reviewNaira(impact.current_price)} <span className="text-text-light font-normal">(unchanged)</span></span>
        <span className="text-text-med">Markup</span>
        <span className="text-right font-semibold">
          {Number(impact.markup_before).toFixed(1)}% → <span className={s.accent}>{Number(impact.markup_after).toFixed(1)}%</span>
        </span>
      </div>
      {s.icon ? (
        <div className={`mt-2 flex items-start gap-1.5 text-[12px] font-medium ${s.msg}`}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" /> <span>{impact.message}</span>
        </div>
      ) : (
        <p className={`mt-1.5 text-[11px] ${s.msg}`}>{impact.message}</p>
      )}
    </div>
  );
}

// Cost-change approval with an explicit price choice — shown for EVERY cost
// change, not only breaching ones. The admin sets the new selling price via
// three pre-fills (Keep current price / Hold my margin / Minimum allowed) or a
// custom value, and can think in markup % instead of naira (the two inputs are
// linked). approve_cost_change_with_price sets the price AND applies the cost
// atomically — even when the admin keeps the current price. The RPC rejects a
// below-floor price, so the button stays disabled until the price clears it
// (for a 'blocked' change that means they MUST raise it before approving).
function CostChangeApproveBlock({
  req, impact, reviewerName, onDone,
}: {
  req: ApprovalRequest;
  impact: PriceImpact;
  reviewerName: string;
  onDone: () => void;
}) {
  const cost = Number(impact.new_cost) || 0;
  const markupOf = (p: number) => (cost > 0 ? ((p - cost) / cost) * 100 : null);
  const priceForMarkup = (pct: number) => Math.ceil((cost * (1 + pct / 100)) / 25) * 25;

  // Default to the current price ("leave it as is") — a deliberate baseline the
  // admin then confirms or overrides. For a blocked change this starts below the
  // floor, so the readout flags it and Approve stays disabled until they raise.
  const initPrice = Number(impact.keep_current_price ?? impact.current_price ?? impact.min_new_price ?? 0) || 0;
  const [price, setPrice] = useState<string>(String(initPrice));
  const [markupStr, setMarkupStr] = useState<string>(() => {
    const m = markupOf(initPrice);
    return m == null ? "" : m.toFixed(1);
  });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Two linked inputs: editing the price recomputes the markup %, editing the
  // markup % recomputes the price. Preset buttons feed through setPriceLinked.
  const setPriceLinked = (v: string) => {
    setPrice(v);
    const n = parseInt(v, 10);
    const m = Number.isFinite(n) && n > 0 ? markupOf(n) : null;
    setMarkupStr(m == null ? "" : m.toFixed(1));
  };
  const setMarkupLinked = (v: string) => {
    setMarkupStr(v);
    const pct = parseFloat(v);
    if (Number.isFinite(pct) && cost > 0) setPrice(String(priceForMarkup(pct)));
  };

  const priceN = parseInt(price, 10);
  const priceValid = Number.isFinite(priceN) && priceN > 0;
  const liveMarkup = priceValid ? markupOf(priceN) : null;
  const clears = liveMarkup != null && liveMarkup >= Number(impact.floor_percent);
  const keepsCurrent = priceValid && priceN === Number(impact.keep_current_price);

  const approve = async () => {
    if (!priceValid || !clears || saving) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("approve_cost_change_with_price", {
        p_request_id: req.id,
        p_new_price: priceN,
        p_note: note.trim() || null,
      });
      if (error) { toast.error(`Approval failed: ${error.message || "unknown error"}`); return; }
      if (data && typeof data === "object" && (data as any).success === false) {
        toast.error(`Approval failed: ${(data as any).error || (data as any).message || "the price was rejected"}`);
        return;
      }
      const setTo = (data as any)?.price_after ?? (data as any)?.price_updated_to ?? priceN;
      const changed = (data as any)?.price_changed;
      toast.success(changed === false ? `Approved — cost updated, price kept at ${reviewNaira(setTo)}.` : `Approved — selling price set to ${reviewNaira(setTo)}.`);
      notifyApproval({
        type: "outcome", description: req.description, approved: true,
        note: note.trim() || null, reviewer_name: reviewerName, requester_email: req.requester?.email || "",
      });
      onDone();
    } catch (e: any) {
      toast.error(`Approval failed: ${e?.message || "unexpected error"}`);
    } finally {
      setSaving(false);
    }
  };

  const presetBtn = "rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted";
  return (
    <div className="mt-3 border-t border-border pt-3 space-y-2.5">
      <p className="text-xs font-semibold text-text-med">Set the selling price to approve this cost change</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setPriceLinked(String(impact.keep_current_price))} className={presetBtn}>
          Keep current price · {reviewNaira(impact.keep_current_price)}
        </button>
        <button type="button" onClick={() => setPriceLinked(String(impact.price_to_hold_margin))} className={presetBtn}>
          Hold my margin · {reviewNaira(impact.price_to_hold_margin)}
        </button>
        <button type="button" onClick={() => setPriceLinked(String(impact.min_new_price))} className={presetBtn}>
          Minimum allowed · {reviewNaira(impact.min_new_price)}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">
          <span className="text-sm text-text-med">₦</span>
          <div className="w-[130px]"><Input type="number" min={1} value={price} onChange={(e) => setPriceLinked(e.target.value)} aria-label="New selling price" /></div>
        </label>
        <label className="flex items-center gap-2">
          <div className="w-[90px]"><Input type="number" value={markupStr} onChange={(e) => setMarkupLinked(e.target.value)} aria-label="Markup percent" /></div>
          <span className="text-sm text-text-med">% markup</span>
        </label>
      </div>
      <p className="text-[11px]">
        {liveMarkup != null ? (
          <span className={clears ? "text-forest font-semibold" : "text-red-600 font-semibold"}>
            {liveMarkup.toFixed(1)}% markup — {clears ? "clears the floor ✓" : `below the ${impact.floor_percent}% floor`}
            {keepsCurrent && clears && <span className="text-text-med font-normal"> · price left unchanged</span>}
          </span>
        ) : (
          <span className="text-text-med">Enter a valid price.</span>
        )}
      </p>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the requester" rows={2} />
      <div className="flex justify-end">
        <Button size="sm" disabled={!priceValid || !clears || saving} onClick={approve}>
          {saving ? "Working…" : keepsCurrent ? `Approve, keep ${reviewNaira(priceN)}` : `Approve at ${priceValid ? reviewNaira(priceN) : "…"}`}
        </Button>
      </div>
    </div>
  );
}

// One pending request card. Fetches the margin impact so a below-floor cost
// change is approved via the price-choice flow (approve_cost_change_with_price),
// while everything else keeps the normal approve/reject path.
function PendingRequestCard({
  req, currentAdmin, vendorNames, proposingId, onStartPropose,
}: {
  req: ApprovalRequest;
  currentAdmin: CurrentAdmin;
  vendorNames: Record<string, string>;
  proposingId: string | null;
  onStartPropose: (req: ApprovalRequest) => void;
}) {
  const qc = useQueryClient();
  const process = useProcessApproval();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");

  const isBrandUpdate = req.target_table === "brands" && req.action === "update";
  const { data: impactRows } = useQuery({
    queryKey: ["approval-price-impact", req.id],
    enabled: isBrandUpdate,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("approval_price_impact", { p_request_id: req.id });
      if (error) throw error;
      return (data || []) as PriceImpact[];
    },
  });
  const impact: PriceImpact | null = impactRows?.[0] || null;
  const hasCostChange = !!impact?.has_cost_change;

  const reset = () => { setDecision(null); setNote(""); };
  const reviewerName = currentAdmin.display_name || currentAdmin.email;

  async function confirmDecision(approved: boolean) {
    try {
      await process.mutateAsync({ requestId: req.id, approved, note: note.trim() || null });
      notifyApproval({
        type: "outcome", description: req.description, approved,
        note: note.trim() || null, reviewer_name: reviewerName, requester_email: req.requester?.email || "",
      });
      toast.success(approved ? "Approved" : "Rejected");
      reset();
    } catch (e: any) {
      toast.error(e?.message || "Could not process request");
    }
  }

  const isOpen = decision !== null;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <ActionBadge action={req.action} />
            <Badge variant="secondary" className="text-[10px] font-mono">{req.target_table}</Badge>
          </div>
          <div className="text-sm font-semibold">{req.description}</div>
          <RequesterLine req={req} />
          {isBrandUpdate && <BrandUpdateReview req={req} vendorNames={vendorNames} />}
          {req.action === "create_product" && <CreateProductReview recordId={req.target_record_id} />}
          {hasCostChange && impact && <MarginImpactPanel impact={impact} />}
        </div>
        {!isOpen && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setDecision("reject"); setNote(""); }}>Reject</Button>
            {/* Any cost change is approved via the price-choice block below (so the
                admin always makes an explicit price decision), so the generic
                Approve button is suppressed for it. */}
            {!hasCostChange && (
              <Button
                size="sm"
                disabled={proposingId === req.id}
                onClick={() => {
                  if (req.action === "create_product") onStartPropose(req);
                  else { setDecision("approve"); setNote(""); }
                }}
              >
                {proposingId === req.id && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                {req.action === "create_product"
                  ? (proposingId === req.id ? "Preparing..." : "Review & approve")
                  : "Approve"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Cost change: set the selling price + approve atomically. Shown for every
          cost change so the admin always makes an explicit price decision. */}
      {hasCostChange && impact && decision !== "reject" && (
        <CostChangeApproveBlock
          req={req}
          impact={impact}
          reviewerName={reviewerName}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["approval-requests"] });
            qc.invalidateQueries({ queryKey: ["pending-approvals-count"] });
            reset();
          }}
        />
      )}

      {isOpen && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <label className="text-xs font-semibold text-text-med">Note (optional)</label>
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add an optional note for the requester" rows={3} />
          <div className="flex items-center gap-2 justify-end">
            <button onClick={reset} className="text-xs text-text-med hover:underline" type="button">Cancel</button>
            <Button
              size="sm"
              variant={decision === "reject" ? "destructive" : "default"}
              disabled={process.isPending}
              onClick={() => confirmDecision(decision === "approve")}
            >
              {process.isPending ? "Working..." : decision === "approve" ? "Confirm approval" : "Confirm rejection"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function PendingTab({ currentAdmin }: { currentAdmin: CurrentAdmin }) {
  const qc = useQueryClient();
  const { data, isLoading } = useApprovalRequests("pending");
  // Review-and-edit modal for new-product approvals (propose -> edit -> apply).
  const [proposingId, setProposingId] = useState<string | null>(null);
  const [reviewReq, setReviewReq] = useState<ApprovalRequest | null>(null);
  const [reviewDraft, setReviewDraft] = useState<any | null>(null);

  // Approve on a create_product request: compute the AI draft, then open the
  // editable review modal. Nothing is written until the admin acts in the modal.
  async function startPropose(req: ApprovalRequest) {
    setProposingId(req.id);
    try {
      const { data, error } = await supabase.functions.invoke("approve-pending-product", {
        body: { mode: "propose", request_id: req.id },
      });
      const d = (data || {}) as any;
      if (error || d.error || d.success !== true || !d.draft) {
        let msg = d.error || error?.message || "request failed";
        const status = (error as any)?.context?.status;
        if (status === 401 || status === 403) msg = "You must be signed in as a super admin.";
        else if (error) {
          try { const body = await (error as any).context?.json?.(); if (body?.error) msg = body.error; } catch { /* keep */ }
        }
        toast.error(`Could not prepare the product: ${msg}`);
        return;
      }
      setReviewReq(req);
      setReviewDraft(d.draft);
    } catch (e: any) {
      toast.error(`Could not prepare the product: ${e?.message || "unknown error"}`);
    } finally {
      setProposingId(null);
    }
  }

  function onReviewApplied() {
    qc.invalidateQueries({ queryKey: ["approval-requests"] });
    qc.invalidateQueries({ queryKey: ["pending-approvals-count"] });
    qc.invalidateQueries({ queryKey: ["approval-pending-product"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["vendor-manager-view"] });
    qc.invalidateQueries({ queryKey: ["vendors-picker"] });
    setReviewReq(null);
    setReviewDraft(null);
  }

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

  return (
    <div className="space-y-3">
      {items.map(req => (
        <PendingRequestCard
          key={req.id}
          req={req}
          currentAdmin={currentAdmin}
          vendorNames={vendorNames}
          proposingId={proposingId}
          onStartPropose={startPropose}
        />
      ))}

      {reviewReq && reviewDraft && (
        <ReviewEditModal
          req={reviewReq}
          draft={reviewDraft}
          onClose={() => { setReviewReq(null); setReviewDraft(null); }}
          onApplied={onReviewApplied}
        />
      )}
    </div>
  );
}

/* --------------- Review-and-edit modal for new-product approval ------------ */
const CATEGORIES = ["baby", "both", "mum", "push-gift"] as const;
const PRIORITIES = ["essential", "recommended", "nice-to-have"] as const;
const TIERS = ["starter", "standard", "premium"] as const;
const REORDER_DAYS = ["21", "30", "45"] as const;

// Small label showing where the proposed variants came from.
function SourceBadge({ source }: { source: string }) {
  if (source === "none") return null;
  const label = source === "vendor" ? "From vendor" : source === "ai_suggested" ? "AI suggested" : source;
  const cls = source === "vendor" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700";
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{label}</span>;
}

// Read-only chips of variants already on the product being attached to, so the
// admin doesn't duplicate them.
function ExistingVariants({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-2 text-xs text-muted-foreground">
      <span className="font-semibold">{label}:</span>{" "}
      <span className="inline-flex flex-wrap gap-1 align-middle">
        {items.map((it, i) => (
          <span key={i} className="px-1.5 py-0.5 rounded bg-muted text-foreground/70">{it}</span>
        ))}
      </span>
    </div>
  );
}

// Packaged goods carry printed label text (ingredients, directions, warnings)
// that AI regeneration can silently rewrite, so those get a louder warning.
// Mirrors the backend's 'packaged' risk class, which isn't exposed on the
// pending-product path, so we infer it from the product/brand wording.
const PACKAGED_HINTS = [
  "bottle", "tube", "carton", "tin", "sachet", "wipes", "formula", "cream", "lotion", "soap",
];
function looksPackaged(...parts: Array<string | null | undefined>): boolean {
  const hay = parts.filter(Boolean).join(" ").toLowerCase();
  return PACKAGED_HINTS.some((w) => hay.includes(w));
}

function ReviewEditModal({
  req, draft, onClose, onApplied,
}: {
  req: ApprovalRequest;
  draft: any;
  onClose: () => void;
  onApplied: () => void;
}) {
  const intOrEmpty = (v: any) => (v == null ? "" : String(v));
  const [productName, setProductName] = useState<string>(draft.product_name ?? "");
  const [attachMode, setAttachMode] = useState<"new" | "existing">(draft.attach_to_product_id ? "existing" : "new");
  const [attachId, setAttachId] = useState<string>(draft.attach_to_product_id ?? "");
  const [description, setDescription] = useState<string>(draft.description ?? "");
  const [whyIncluded, setWhyIncluded] = useState<string>(draft.why_included ?? "");
  const [brandDescription, setBrandDescription] = useState<string>(draft.brand_description ?? "");
  const [category, setCategory] = useState<string>(draft.category ?? "baby");
  const [priority, setPriority] = useState<string>(draft.priority ?? "recommended");
  const [tier, setTier] = useState<string>(draft.tier ?? "standard");
  const [costPrice, setCostPrice] = useState<string>(intOrEmpty(draft.cost_price));
  const [price, setPrice] = useState<string>(intOrEmpty(draft.price));
  const [isConsumable, setIsConsumable] = useState<boolean>(!!draft.is_consumable);
  const [reorderDays, setReorderDays] = useState<string>(draft.reorder_days ? String(draft.reorder_days) : "30");
  const [reorderLabel, setReorderLabel] = useState<string>(draft.reorder_label ?? "");
  // Brand-level attributes, seeded from the draft. Editable before publish;
  // blank values fall back to the vendor's on the apply side.
  const [brandName, setBrandName] = useState<string>(draft.brand_name ?? "");
  const [weightKg, setWeightKg] = useState<string>(intOrEmpty(draft.weight_kg));
  const [weightRangeKg, setWeightRangeKg] = useState<string>(draft.weight_range_kg ?? "");
  const [packCount, setPackCount] = useState<string>(intOrEmpty(draft.pack_count));
  const [sizeVariant, setSizeVariant] = useState<string>(draft.size_variant ?? "");
  const [diaperType, setDiaperType] = useState<string>(draft.diaper_type ?? "");
  const [itemType, setItemType] = useState<string>(draft.item_type ?? "");
  // Product image: initialized to the vendor's submitted image; a replacement
  // upload (product-images bucket) overrides it and flows into the apply payload.
  const [imageUrl, setImageUrl] = useState<string>(draft.image_url ?? "");
  const [zoomOpen, setZoomOpen] = useState(false);
  const [busy, setBusy] = useState<null | "confirm" | "reject">(null);

  // ── Optional AI image improvement (explicit, per product) ─────────────
  // Queues THIS pending product's CURRENT image (including a replacement the
  // admin just uploaded), processes it, polls for the result, then shows
  // before/after. Nothing changes unless the admin picks "Use improved image",
  // which only swaps `imageUrl` so the existing apply() payload saves it on
  // approval. Skipping this leaves the approval flow exactly as it was.
  const [improving, setImproving] = useState(false);
  const [improvedUrl, setImprovedUrl] = useState<string | null>(null);
  const [improveError, setImproveError] = useState<string | null>(null);

  async function runImprove() {
    const pendingId = req.target_record_id;
    if (!pendingId) { toast.error("This request has no pending product to improve."); return; }
    const current = imageUrl.trim();
    if (!current) { toast.error("There is no image to improve yet."); return; }
    setImproving(true);
    setImproveError(null);
    setImprovedUrl(null);
    try {
      const { data: q, error: qErr } = await (supabase as any).rpc("queue_pending_image_improvement", {
        p_pending_product_id: pendingId,
        p_image_url: current,
        p_by: null,
      });
      if (qErr) throw new Error(qErr.message);
      if (!q?.success) throw new Error(q?.error || "Could not queue this image.");
      const jobId = q.job_id as string;

      // Kick the worker for this single job. If it fails the job stays queued,
      // so we still poll rather than giving up here.
      try {
        await supabase.functions.invoke("process-image-improvements", { body: { limit: 1 } });
      } catch { /* polling below still picks up the result */ }

      const startedAt = Date.now();
      let lastStatus = "queued";
      while (Date.now() - startedAt < 120_000) {
        await new Promise((r) => setTimeout(r, 3000));
        const { data: job, error: jErr } = await (supabase as any).rpc("get_image_job", { p_job_id: jobId });
        if (jErr) throw new Error(jErr.message);
        lastStatus = String(job?.status || "");
        if (lastStatus === "ready") {
          if (!job?.improved_url) throw new Error("The job finished without an improved image.");
          setImprovedUrl(job.improved_url as string);
          return;
        }
        if (lastStatus === "failed") throw new Error(job?.error || "The image could not be improved.");
      }
      throw new Error(`Timed out waiting for the improved image (last status: ${lastStatus || "unknown"}).`);
    } catch (e: any) {
      // Leave the original image in place; just tell the admin what happened.
      setImproveError(e?.message || "Could not improve this image.");
    } finally {
      setImproving(false);
    }
  }

  const packagedRisk = looksPackaged(productName, brandName, draft.subcategory, draft.vendor_raw_name);

  // Editable size/colour lists from the propose draft (vendor-supplied or
  // AI-suggested). Sent (possibly edited) in the apply payload on confirm.
  const [sizes, setSizes] = useState<SizeRow[]>(
    Array.isArray(draft.sizes)
      ? draft.sizes.map((s: any) => ({ size_code: s?.size_code ?? "", size_label: s?.size_label ?? "" }))
      : [],
  );
  const [colors, setColors] = useState<ColorRow[]>(
    Array.isArray(draft.colors)
      ? draft.colors.map((c: any) => ({ color_name: c?.color_name ?? "", color_hex: c?.color_hex ?? null }))
      : [],
  );
  const sizesSource: string = draft.sizes_source ?? "none";
  const colorsSource: string = draft.colors_source ?? "none";
  const sizeReasoning: string = draft.size_reasoning ?? "";
  const existingSizes: any[] = Array.isArray(draft.existing_product_sizes) ? draft.existing_product_sizes : [];
  const existingColors: any[] = Array.isArray(draft.existing_product_colors) ? draft.existing_product_colors : [];

  // Products in this subcategory, for the "attach to existing" picker.
  const { data: peerProducts = [] } = useQuery({
    queryKey: ["approval-attach-products", draft.subcategory],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("subcategory", draft.subcategory)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!draft.subcategory,
    staleTime: 60_000,
  });

  const costN = Math.round(Number(costPrice) || 0);
  const priceN = Math.round(Number(price) || 0);
  const marginPct = priceN > 0 ? Math.round(((priceN - costN) / priceN) * 100) : null;

  async function apply(decision: "confirm" | "reject") {
    if (attachMode === "existing" && !attachId) { toast.error("Pick a product to attach to."); return; }
    if (attachMode === "new" && !productName.trim()) { toast.error("Enter a product name."); return; }
    setBusy(decision);
    try {
      // Reject publishes the AI proposal but with the vendor's original name + price.
      const payload = {
        decision,
        product_name: decision === "reject" ? (draft.vendor_raw_name ?? productName) : productName.trim(),
        attach_to_product_id: attachMode === "existing" ? attachId : null,
        description: description,
        why_included: whyIncluded,
        brand_description: brandDescription,
        category, priority, tier,
        cost_price: costN,
        price: decision === "reject" ? Math.round(Number(draft.vendor_raw_price) || priceN) : priceN,
        is_consumable: isConsumable,
        reorder_days: isConsumable ? Number(reorderDays) : null,
        reorder_label: isConsumable ? reorderLabel : null,
        // Brand-level attributes (edited values). Sent on BOTH confirm and reject
        // (only name + price swap to vendor raw on reject). Numbers omitted when
        // blank so apply falls back to the vendor's value.
        brand_name: brandName.trim(),
        weight_range_kg: weightRangeKg.trim(),
        size_variant: sizeVariant.trim(),
        diaper_type: diaperType.trim(),
        item_type: itemType.trim(),
        ...(weightKg.trim() ? { weight_kg: Number(weightKg) } : {}),
        ...(packCount.trim() ? { pack_count: Math.round(Number(packCount)) } : {}),
        // Replacement image (or the vendor's, since imageUrl starts from it).
        // Omitted when empty so the backend falls back to the vendor's image.
        ...(imageUrl.trim() ? { image_url: imageUrl.trim() } : {}),
        // Confirmed variant lists → product_sizes / product_colors. Only sent
        // on confirm; a reject publishes without touching variants.
        ...(decision === "confirm" ? { sizes: normalizeSizes(sizes), colors: normalizeColors(colors) } : {}),
      };
      const { data, error } = await supabase.functions.invoke("approve-pending-product", {
        body: { mode: "apply", request_id: req.id, payload },
      });
      const d = (data || {}) as any;
      if (error || d.error || d.success !== true) {
        let msg = d.error || error?.message || "request failed";
        const status = (error as any)?.context?.status;
        if (status === 401 || status === 403) msg = "You must be signed in as a super admin.";
        else if (error) { try { const body = await (error as any).context?.json?.(); if (body?.error) msg = body.error; } catch { /* keep */ } }
        toast.error(`Could not publish: ${msg}`);
        return; // keep modal open
      }
      toast.success(`Product published, SKU ${d.sku}, retail ₦${Number(d.retail || 0).toLocaleString("en-NG")}`);
      onApplied();
    } catch (e: any) {
      toast.error(`Could not publish: ${e?.message || "unknown error"}`);
    } finally {
      setBusy(null);
    }
  }

  const ctx = (label: string, value: any) => (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value == null || value === "" ? "—" : String(value)}</span>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto max-md:[&_input]:min-h-[44px]">
        <DialogHeader>
          <DialogTitle>Review new product</DialogTitle>
          <DialogDescription>Edit anything, then publish. Nothing goes live until you confirm.</DialogDescription>
        </DialogHeader>

        {/* Read-only context */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 flex gap-3">
          <div className="shrink-0 flex flex-col items-center gap-1">
            {isImageUrl(imageUrl) ? (
              <button type="button" onClick={() => setZoomOpen(true)} title="Click to zoom"
                className="block rounded border overflow-hidden hover:ring-2 hover:ring-[#2D6A4F]">
                <img src={imageUrl} alt="product" className="w-16 h-16 object-cover" />
              </button>
            ) : (
              <div className="w-16 h-16 rounded border bg-muted flex items-center justify-center text-[9px] text-muted-foreground text-center px-1">No image</div>
            )}
            <BrandImageUpload label="Replace image" currentUrl={null}
              onUploaded={(url) => setImageUrl(url)} onRemove={() => {}} />
            {imageUrl && imageUrl !== (draft.image_url ?? "") && (
              <button type="button" onClick={() => setImageUrl(draft.image_url ?? "")}
                className="text-[10px] text-muted-foreground underline">Reset to vendor's</button>
            )}
            {/* Optional AI re-shoot of whatever image is currently selected. */}
            <Button type="button" size="sm" variant="outline" onClick={runImprove}
              disabled={improving || !imageUrl.trim()}
              className="h-7 px-2 text-[10px] whitespace-nowrap">
              {improving
                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Improving…</>
                : "Improve this image"}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">
            {ctx("Vendor", draft.vendor_name)}
            {ctx("SKU preview", draft.sku_preview)}
            {ctx("Subcategory", draft.subcategory)}
          </div>
        </div>

        {/* Image improvement: progress, errors, and the before/after choice.
            Only rendered once the admin has explicitly asked for it. */}
        {(improving || improvedUrl || improveError) && (
          <div className="rounded-lg border border-border p-3 space-y-2.5">
            {improving && (
              <p className="text-xs flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Improving image… this can take up to a minute.
              </p>
            )}

            {improveError && !improving && (
              <p className="text-xs text-destructive">
                {improveError} The original image has been kept.
              </p>
            )}

            {improvedUrl && !improving && (
              <>
                {packagedRisk && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2.5 flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-[13px] font-medium">
                      This product has printed packaging text. Check that ingredients, directions and all
                      label text match the original exactly before using the improved image.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">Before (current)</div>
                    <div className="rounded-lg border border-border bg-muted/40 overflow-hidden">
                      <img src={imageUrl} alt="current" className="w-full h-[300px] object-contain" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide font-semibold text-[#2D6A4F] mb-1">After (improved)</div>
                    <div className="rounded-lg border border-[#2D6A4F]/40 bg-muted/40 overflow-hidden">
                      <img src={improvedUrl} alt="improved" className="w-full h-[300px] object-contain" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => {
                      setImageUrl(improvedUrl);
                      setImprovedUrl(null);
                      toast.success("Using the improved image. It will be saved when you publish.");
                    }}
                  >
                    Use improved image
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setImprovedUrl(null)}
                  >
                    Keep original
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="space-y-3 mt-1">
          {/* Brand & attributes (editable, seeded from the draft) */}
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold mb-2">Brand & attributes</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Brand name</Label>
                <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Brand name" />
              </div>
              <div>
                <Label>Weight (kg)</Label>
                <Input type="number" step="any" inputMode="decimal" value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)} placeholder="e.g. 0.5" />
              </div>
              <div>
                <Label>Weight range (kg)</Label>
                <Input value={weightRangeKg} onChange={(e) => setWeightRangeKg(e.target.value)} placeholder="e.g. 11-25kg" />
              </div>
              <div>
                <Label>Pack count</Label>
                <Input type="number" step="1" inputMode="numeric" value={packCount}
                  onChange={(e) => setPackCount(e.target.value)} placeholder="e.g. 40" />
              </div>
              <div>
                <Label>Size variant</Label>
                <Input value={sizeVariant} onChange={(e) => setSizeVariant(e.target.value)} placeholder="e.g. Size 3" />
              </div>
              <div>
                <Label>Diaper type</Label>
                <Input value={diaperType} onChange={(e) => setDiaperType(e.target.value)} placeholder="e.g. Tape, Pant" />
              </div>
              <div>
                <Label>Item type</Label>
                <Input value={itemType} onChange={(e) => setItemType(e.target.value)} placeholder="e.g. Formula, Onesie" />
              </div>
            </div>
          </div>

          {/* Sizes & Colours — editable variant lists written to
              product_sizes / product_colors on confirm. */}
          <div className="border-t pt-3 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label>Sizes</Label>
                <SourceBadge source={sizesSource} />
              </div>
              {sizeReasoning && <p className="text-xs text-muted-foreground mb-2">{sizeReasoning}</p>}
              <ExistingVariants
                label="Already on this product"
                items={existingSizes.map((s: any) => s?.size_label || s?.size_code).filter(Boolean)}
              />
              <SizesEditor value={sizes} onChange={setSizes} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label>Colours</Label>
                <SourceBadge source={colorsSource} />
              </div>
              <ExistingVariants
                label="Already on this product"
                items={existingColors.map((c: any) => c?.color_name).filter(Boolean)}
              />
              <ColorsEditor value={colors} onChange={setColors} />
            </div>
          </div>

          {/* Attach target */}
          <div>
            <Label>Product</Label>
            <div className="flex gap-2 mt-1 mb-2">
              <Button type="button" size="sm" variant={attachMode === "new" ? "default" : "outline"}
                onClick={() => setAttachMode("new")}>Create new product</Button>
              <Button type="button" size="sm" variant={attachMode === "existing" ? "default" : "outline"}
                onClick={() => setAttachMode("existing")}>Attach to existing</Button>
            </div>
            {attachMode === "new" ? (
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Product name" />
            ) : (
              <Select value={attachId} onValueChange={setAttachId}>
                <SelectTrigger><SelectValue placeholder="Select a product to attach to" /></SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {peerProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Product description — only when creating a new product */}
          {attachMode === "new" ? (
            <div>
              <Label>Product description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Uses the existing product's description.</p>
          )}

          <div>
            <Label>Why included</Label>
            <Textarea value={whyIncluded} onChange={(e) => setWhyIncluded(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Brand description</Label>
            <Textarea value={brandDescription} onChange={(e) => setBrandDescription(e.target.value)} rows={3} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Cost price (₦)</Label>
              <Input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
            </div>
            <div>
              <Label>Selling price (₦) {marginPct != null && <span className="text-[10px] font-normal text-muted-foreground">margin {marginPct}%</span>}</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>

          {/* Consumable + reorder */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={isConsumable} onChange={(e) => setIsConsumable(e.target.checked)} />
              Consumable (reorderable)
            </label>
            {isConsumable && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Reorder days</Label>
                  <Select value={reorderDays} onValueChange={setReorderDays}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{REORDER_DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reorder label</Label>
                  <Input value={reorderLabel} onChange={(e) => setReorderLabel(e.target.value)} placeholder="e.g. Reorder nappies" />
                </div>
              </div>
            )}
            {/* AI reasoning for the reorder window (propose-mode only, consumable
                items only). Display-only: not editable, not sent in the payload. */}
            {isConsumable && draft.reorder_reasoning && (
              <p className="text-[11px] text-muted-foreground">AI estimate: {draft.reorder_reasoning}</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={onClose} disabled={!!busy} className="sm:mr-auto">Cancel</Button>
          <Button variant="outline" onClick={() => apply("reject")} disabled={!!busy}
            title="Publishes with the vendor's original name and price, keeping the AI-written descriptions.">
            {busy === "reject" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Reject (use vendor's original)
          </Button>
          <Button onClick={() => apply("confirm")} disabled={!!busy}
            className="bg-[#2D6A4F] hover:bg-[#245840]">
            {busy === "confirm" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Confirm & publish
          </Button>
        </DialogFooter>

        {/* Zoom lightbox — Dialog gives Esc + backdrop-click + close button for free. */}
        {isImageUrl(imageUrl) && (
          <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
            <DialogContent className="max-w-[95vw] sm:max-w-3xl p-2">
              <img src={imageUrl} alt="product enlarged" className="w-full max-h-[85vh] object-contain rounded" />
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
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
