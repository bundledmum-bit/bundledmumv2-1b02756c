import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search, AlertTriangle, RotateCcw, Check, X, Sparkles, Maximize2 } from "lucide-react";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Temporary admin tool for improving product photography (route:
// /admin/image-improvement). Reads image_improvement_catalogue(), queues jobs
// via queue_image_improvements() and kicks the process-image-improvements edge
// function. NOTHING reaches the live catalogue until an admin compares the
// before/after and presses Apply — apply_image_improvement() is the only path
// that publishes, and revert_image_improvement() puts the original back.
//
// The images are deliberately LARGE: this screen exists so a human can judge
// whether the AI altered the product (packaging text especially), so thumbnails
// would defeat the point.

interface CatalogueRow {
  out_brand_id: string;
  out_brand_name: string | null;
  out_product_name: string | null;
  out_category: string | null;
  out_image_url: string | null;       // what is live today (the "before")
  out_original_url: string | null;    // pre-improvement original, when one exists
  out_improved_at: string | null;
  out_is_branded: boolean | null;     // packaging text at risk -> warn loudly
  out_risk_class: string | null;      // e.g. 'packaged' | 'soft' (drives the AI prompt)
  out_recommended: string | null;
  out_job_status: string | null;      // null|queued|processing|ready|approved|rejected|failed
  out_job_id: string | null;
  out_job_improved_url: string | null; // the "after"
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-muted text-text-med border-border" },
  processing: { label: "Processing", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  ready: { label: "Ready for review", cls: "bg-forest-light text-forest border-forest/30" },
  approved: { label: "Applied", cls: "bg-forest text-primary-foreground border-forest" },
  rejected: { label: "Rejected", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

const ACTIVE_STATUSES = new Set(["queued", "processing"]);

// Chip -> p_filter value + the key to read its count from
// image_improvement_counts(). "Needs review" leads: those are waiting on a
// human to accept or reject.
const STATUS_FILTERS: Array<{ label: string; key: string | null; countKey: string }> = [
  { label: "Needs review", key: "needs_review", countKey: "needs_review" },
  { label: "Not improved", key: "not_improved", countKey: "not_improved" },
  { label: "In progress", key: "in_progress", countKey: "in_progress" },
  { label: "Improved", key: "improved", countKey: "improved" },
  { label: "Failed", key: "failed", countKey: "failed" },
  { label: "All", key: null, countKey: "all" },
];

// Chip -> p_risk value.
const RISK_FILTERS: Array<{ label: string; key: string | null; countKey: string | null }> = [
  { label: "All types", key: null, countKey: null },
  { label: "Soft goods", key: "soft", countKey: "soft" },
  { label: "Packaged", key: "packaged", countKey: "packaged" },
];

export default function AdminImageImprovement() {
  const { adminUser } = usePermissions();
  const qc = useQueryClient();
  const by = adminUser?.email ?? adminUser?.id ?? null;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  // p_filter drives the list now (p_only_unimproved is always false, since the
  // filter takes precedence server-side). null = All.
  const [filter, setFilter] = useState<string | null>(null);
  const [risk, setRisk] = useState<string | null>(null);
  const [filterReady, setFilterReady] = useState(false);
  // Brand ids currently being improved from their own card. A Set (not the
  // mutation's variables) so several cards can run independently.
  const [improvingIds, setImprovingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewId, setReviewId] = useState<string | null>(null);   // brand id under review
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Live counts for the filter chips.
  const countsQ = useQuery({
    queryKey: ["image-improvement-counts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("image_improvement_counts");
      if (error) throw error;
      return (data || {}) as Record<string, number>;
    },
    staleTime: 15_000,
  });
  const counts = countsQ.data;

  // Land on whatever needs the admin's attention: "Needs review" when anything
  // is waiting to be accepted or rejected, otherwise "Not improved". Runs once,
  // so it never overrides a chip the admin picked afterwards.
  useEffect(() => {
    if (filterReady) return;
    if (countsQ.isSuccess) {
      setFilter(Number(countsQ.data?.needs_review) > 0 ? "needs_review" : "not_improved");
      setFilterReady(true);
    } else if (countsQ.isError) {
      setFilter("not_improved");
      setFilterReady(true);
    }
  }, [countsQ.isSuccess, countsQ.isError, countsQ.data, filterReady]);

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ["image-improvement-catalogue", filter, risk, search],
    // Wait for the default filter so we don't fetch the whole catalogue first.
    enabled: filterReady,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("image_improvement_catalogue", {
        p_only_unimproved: false, // p_filter takes precedence server-side
        p_search: search.trim() || null,
        p_risk: risk,
        p_filter: filter,
      });
      if (error) throw error;
      return (data || []) as CatalogueRow[];
    },
    // While anything is queued/processing, poll so statuses move on their own.
    refetchInterval: (q: any) => {
      const d = q?.state?.data as CatalogueRow[] | undefined;
      return d?.some((r) => ACTIVE_STATUSES.has(String(r.out_job_status))) ? 4000 : false;
    },
    staleTime: 10_000,
  });

  const selectableIds = useMemo(() => rows.map((r) => r.out_brand_id), [rows]);
  const selectedCount = selected.size;
  const activeCount = rows.filter((r) => ACTIVE_STATUSES.has(String(r.out_job_status))).length;
  const readyCount = rows.filter((r) => r.out_job_status === "ready").length;
  const reviewRow = reviewId ? rows.find((r) => r.out_brand_id === reviewId) || null : null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Queue every selected brand in ONE call, then start processing.
  const queueMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await (supabase as any).rpc("queue_image_improvements", {
        p_brand_ids: ids,
        p_method: "generate",
        p_by: by,
      });
      if (error) throw error;
      const queued = Number((data as any)?.queued ?? 0);
      const skipped = Number((data as any)?.skipped ?? 0);

      // Kick the worker for the batch we just queued. A failure here does NOT
      // lose the jobs — they stay queued and can be processed again.
      let processError: string | null = null;
      try {
        const { data: proc, error: fnErr } = await supabase.functions.invoke("process-image-improvements", {
          body: { limit: Math.min(20, Math.max(1, queued || ids.length)) },
        });
        if (fnErr) {
          processError = fnErr.message || "processing failed";
          try {
            const b = await (fnErr as any)?.context?.json?.();
            if (b?.error) processError = b.error;
          } catch { /* keep */ }
        } else if (proc && (proc as any).success === false) {
          processError = (proc as any).error || "processing failed";
        }
      } catch (e: any) {
        processError = e?.message || "processing failed";
      }
      return { queued, skipped, processError };
    },
    onSuccess: (res) => {
      setSelected(new Set());
      const base = `Queued ${res.queued} image${res.queued === 1 ? "" : "s"}${res.skipped ? `, ${res.skipped} skipped` : ""}.`;
      if (res.processError) {
        toast.error(`${base} Processing could not start: ${res.processError}`);
      } else {
        toast.success(`${base} Processing started — statuses update automatically.`);
      }
      qc.invalidateQueries({ queryKey: ["image-improvement-catalogue"] });
      qc.invalidateQueries({ queryKey: ["image-improvement-counts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not queue these images."),
  });

  // Improve ONE card, without touching the multi-select. Tracked per brand id
  // so each card shows its own spinner and the rest stay usable.
  async function improveOne(brandId: string) {
    setImprovingIds((prev) => new Set(prev).add(brandId));
    try {
      const { data, error } = await (supabase as any).rpc("queue_image_improvements", {
        p_brand_ids: [brandId],
        p_method: "generate",
        p_by: by,
      });
      if (error) throw new Error(error.message);
      const queued = Number((data as any)?.queued ?? 0);
      if (queued === 0) {
        toast(`Nothing queued for this image${(data as any)?.skipped ? " (already queued or improved)" : ""}.`);
      }

      let processError: string | null = null;
      try {
        const { data: proc, error: fnErr } = await supabase.functions.invoke("process-image-improvements", {
          body: { limit: 1 },
        });
        if (fnErr) {
          processError = fnErr.message || "processing failed";
          try {
            const b = await (fnErr as any)?.context?.json?.();
            if (b?.error) processError = b.error;
          } catch { /* keep */ }
        } else if (proc && (proc as any).success === false) {
          processError = (proc as any).error || "processing failed";
        }
      } catch (e: any) {
        processError = e?.message || "processing failed";
      }

      if (processError) toast.error(`Queued, but processing could not start: ${processError}`);
      else if (queued > 0) toast.success("Improving this image — the card updates automatically.");
    } catch (e: any) {
      toast.error(e?.message || "Could not improve this image.");
    } finally {
      setImprovingIds((prev) => { const n = new Set(prev); n.delete(brandId); return n; });
      qc.invalidateQueries({ queryKey: ["image-improvement-catalogue"] });
      qc.invalidateQueries({ queryKey: ["image-improvement-counts"] });
    }
  }

  const applyMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await (supabase as any).rpc("apply_image_improvement", { p_job_id: jobId, p_by: by });
      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error || "Could not apply the image.");
      return data;
    },
    onSuccess: () => {
      toast.success("Applied to the website.");
      setReviewId(null);
      qc.invalidateQueries({ queryKey: ["image-improvement-catalogue"] });
      qc.invalidateQueries({ queryKey: ["image-improvement-counts"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not apply the image."),
  });

  const rejectMutation = useMutation({
    mutationFn: async (v: { jobId: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc("reject_image_improvement", {
        p_job_id: v.jobId,
        p_reason: v.reason.trim() || null,
        p_by: by,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Rejected. The live image is unchanged.");
      setReviewId(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["image-improvement-catalogue"] });
      qc.invalidateQueries({ queryKey: ["image-improvement-counts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not reject the image."),
  });

  const revertMutation = useMutation({
    mutationFn: async (brandId: string) => {
      const { data, error } = await (supabase as any).rpc("revert_image_improvement", { p_brand_id: brandId, p_by: by });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Reverted to the original image.");
      setReviewId(null);
      qc.invalidateQueries({ queryKey: ["image-improvement-catalogue"] });
      qc.invalidateQueries({ queryKey: ["image-improvement-counts"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not revert."),
  });

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-foreground">Image Improvement</h1>
        <p className="text-sm text-text-med mt-0.5">
          Queue product photos for an AI studio re-shoot, then compare before and after. Nothing goes
          live until you apply it.
        </p>
      </div>

      {/* Controls */}
      <div className="space-y-2 mb-4">
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}
          className="flex gap-2"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-med" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search product or brand…"
              className="w-full border border-input rounded-lg pl-9 pr-3 py-2 text-sm bg-background"
            />
          </div>
          <button type="submit" className="rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep flex-shrink-0">
            Search
          </button>
        </form>

        {/* Status filters. "Needs review" is the one that blocks the admin, so
            it leads and is styled loudest. Counts come from the RPC. */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.key;
            const n = Number(counts?.[f.countKey] ?? 0);
            const base = "rounded-pill px-3 py-1.5 text-xs font-semibold border whitespace-nowrap flex-shrink-0 transition-colors";
            const cls = f.key === "needs_review"
              ? active
                ? "bg-forest text-primary-foreground border-forest ring-2 ring-forest/30"
                : "bg-forest-light text-forest border-forest/40 hover:bg-forest-light/70"
              : active
                ? "bg-forest text-primary-foreground border-forest"
                : "bg-card text-foreground border-border hover:bg-muted";
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => { setFilter(f.key); setSelected(new Set()); }}
                className={`${base} ${cls}`}
              >
                {f.label} ({n})
              </button>
            );
          })}
        </div>

        {/* Risk filters — cut the list to soft goods or packaged goods. */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          {RISK_FILTERS.map((f) => {
            const active = risk === f.key;
            const n = f.countKey ? Number(counts?.[f.countKey] ?? 0) : Number(counts?.all ?? 0);
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => { setRisk(f.key); setSelected(new Set()); }}
                className={`rounded-pill px-3 py-1.5 text-xs font-semibold border whitespace-nowrap flex-shrink-0 ${active ? "bg-foreground text-background border-foreground" : "bg-card text-text-med border-border hover:bg-muted"}`}
              >
                {f.label} ({n})
              </button>
            );
          })}
        </div>

        {/* Selection bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <button
            type="button"
            onClick={() => setSelected(new Set(selectableIds))}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            Select all ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            Select none
          </button>
          <span className="text-sm text-text-med">
            <span className="font-semibold text-foreground">{selectedCount}</span> selected
          </span>
          <button
            type="button"
            onClick={() => queueMutation.mutate([...selected])}
            disabled={selectedCount === 0 || queueMutation.isPending}
            className="ml-auto w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
          >
            {queueMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Queueing…</>
              : <><Sparkles className="w-4 h-4" /> Improve selected images</>}
          </button>
        </div>

        {(activeCount > 0 || readyCount > 0) && (
          <p className="text-[12px] text-text-med">
            {activeCount > 0 && <>{activeCount} in progress (updating automatically). </>}
            {readyCount > 0 && <><span className="font-semibold text-forest">{readyCount} ready for review.</span></>}
          </p>
        )}
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex items-center gap-2 text-text-med text-sm py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading products…
        </div>
      )}
      {isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 text-destructive text-sm p-4">
          Could not load the catalogue. {(error as any)?.message || ""}
        </div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-med">No products match this filter.</p>
        </div>
      )}

      {/* Grid — large images so the admin can actually judge them. */}
      {!isLoading && !isError && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((r) => {
            const status = r.out_job_status ? STATUS_META[r.out_job_status] : null;
            const isSel = selected.has(r.out_brand_id);
            const live = r.out_image_url || "";
            // A job already queued/processing server-side, or this card's own
            // improve request still running locally.
            const inFlight = ACTIVE_STATUSES.has(String(r.out_job_status));
            const cardBusy = inFlight || improvingIds.has(r.out_brand_id);
            return (
              <div
                key={r.out_brand_id}
                className={`rounded-xl border bg-card overflow-hidden ${isSel ? "border-forest ring-2 ring-forest/30" : "border-border"}`}
              >
                {/* Big image (min ~240px tall), click to view full size */}
                <button
                  type="button"
                  onClick={() => live && setZoomUrl(live)}
                  className="block w-full bg-muted/40 relative"
                  title="Click to view full size"
                >
                  {live ? (
                    <img
                      src={live}
                      alt={r.out_product_name || "product"}
                      loading="lazy"
                      className="w-full h-[280px] object-contain"
                    />
                  ) : (
                    <div className="w-full h-[280px] flex items-center justify-center text-sm text-text-med">No image</div>
                  )}
                  {live && (
                    <span className="absolute bottom-2 right-2 rounded-md bg-black/55 text-white p-1.5">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>

                <div className="p-3">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(r.out_brand_id)}
                      className="w-5 h-5 accent-forest mt-0.5 flex-shrink-0 cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-foreground break-words">
                        {r.out_product_name || "—"}
                      </div>
                      <div className="text-[12px] text-text-med break-words">{r.out_brand_name || "—"}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {status && (
                          <span className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${status.cls}`}>
                            {status.label}
                          </span>
                        )}
                        {r.out_is_branded && (
                          <span className="rounded-pill bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                            Branded
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Row actions. A ready job is the admin's job to review, so
                      that becomes the primary button instead of Improve. */}
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {r.out_job_status === "ready" ? (
                      <button
                        type="button"
                        onClick={() => { setReviewId(r.out_brand_id); setRejectReason(""); }}
                        className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-3 py-2.5 text-xs font-semibold hover:bg-forest-deep"
                      >
                        Review
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => improveOne(r.out_brand_id)}
                        disabled={cardBusy}
                        title={inFlight ? "This image is already being improved" : "Improve just this image"}
                        className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                      >
                        {cardBusy
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Improving…</>
                          : <><Sparkles className="w-3.5 h-3.5" /> Improve this image</>}
                      </button>
                    )}
                    {r.out_job_status === "approved" && (
                      <button
                        type="button"
                        onClick={() => revertMutation.mutate(r.out_brand_id)}
                        disabled={revertMutation.isPending}
                        className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Revert to original
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-size viewer */}
      <Dialog open={!!zoomUrl} onOpenChange={(o) => !o && setZoomUrl(null)}>
        <DialogContent className="max-w-[92vw] sm:max-w-[900px]">
          <DialogHeader><DialogTitle>Full size</DialogTitle></DialogHeader>
          {zoomUrl && <img src={zoomUrl} alt="full size" className="w-full max-h-[80vh] object-contain rounded" />}
        </DialogContent>
      </Dialog>

      {/* BEFORE / AFTER review — the only route to publishing an improved image. */}
      <Dialog open={!!reviewRow} onOpenChange={(o) => { if (!o) { setReviewId(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-[1000px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {reviewRow?.out_product_name || "Review image"}
              <span className="block text-[12px] font-normal text-text-med">{reviewRow?.out_brand_name}</span>
            </DialogTitle>
          </DialogHeader>

          {reviewRow && (
            <div className="space-y-3">
              {/* Branded packaging warning — AI can rewrite label text. */}
              {reviewRow.out_is_branded && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-[13px] font-medium">
                    This is a branded product. Check that all packaging text, logos and pack counts match
                    the original exactly before applying.
                  </p>
                </div>
              )}

              {/* Side by side on desktop, stacked on mobile. Both large. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-text-med mb-1">Before (live)</div>
                  <button
                    type="button"
                    onClick={() => reviewRow.out_image_url && setZoomUrl(reviewRow.out_image_url)}
                    className="block w-full rounded-lg border border-border bg-muted/40 overflow-hidden"
                  >
                    {reviewRow.out_image_url ? (
                      <img src={reviewRow.out_image_url} alt="before" className="w-full h-[240px] sm:h-[340px] object-contain" />
                    ) : (
                      <div className="h-[240px] sm:h-[340px] flex items-center justify-center text-sm text-text-med">No image</div>
                    )}
                  </button>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-forest mb-1">After (proposed)</div>
                  <button
                    type="button"
                    onClick={() => reviewRow.out_job_improved_url && setZoomUrl(reviewRow.out_job_improved_url)}
                    className="block w-full rounded-lg border border-forest/40 bg-muted/40 overflow-hidden"
                  >
                    {reviewRow.out_job_improved_url ? (
                      <img src={reviewRow.out_job_improved_url} alt="after" className="w-full h-[240px] sm:h-[340px] object-contain" />
                    ) : (
                      <div className="h-[240px] sm:h-[340px] flex items-center justify-center text-sm text-text-med">No improved image</div>
                    )}
                  </button>
                </div>
              </div>

              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason (optional, saved when you reject)"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
              />

              <div className="flex flex-col sm:flex-row gap-2 sticky bottom-0 bg-background pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => reviewRow.out_job_id && applyMutation.mutate(reviewRow.out_job_id)}
                  disabled={!reviewRow.out_job_id || !reviewRow.out_job_improved_url || applyMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-forest-deep disabled:opacity-50"
                >
                  {applyMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Applying…</> : <><Check className="w-4 h-4" /> Apply to website</>}
                </button>
                <button
                  type="button"
                  onClick={() => reviewRow.out_job_id && rejectMutation.mutate({ jobId: reviewRow.out_job_id, reason: rejectReason })}
                  disabled={!reviewRow.out_job_id || rejectMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/40 text-destructive bg-card px-4 py-2.5 text-sm font-semibold hover:bg-destructive/5 disabled:opacity-50"
                >
                  {rejectMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Rejecting…</> : <><X className="w-4 h-4" /> Reject</>}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
