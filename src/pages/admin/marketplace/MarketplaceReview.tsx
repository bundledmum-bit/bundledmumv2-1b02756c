import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, REVIEW_SELECT, formatNaira, hasContactLeak, type ReviewListing } from "./data";

/**
 * Listing review queue. Lists status='pending_review' listings and lets an
 * operator approve and publish, or reject with a written reason. Both actions
 * record reviewed_by (the admin_users id) and reviewed_at. A contact leak
 * warning fires when the description or condition notes look like they carry a
 * phone number or off platform routing. Works one listing at a time so a queue
 * clears fast on desktop or phone.
 */
export default function MarketplaceReview() {
  const { adminUser } = usePermissions();
  // No fallback: a guessed markup would mislabel the price comparison this
  // screen exists to show, so the label reads "..." until the real value
  // loads rather than a possibly-stale number (same pattern as §8).
  const [markupPct, setMarkupPct] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Markup percent for the "buyer sees" label, from site_settings.
  useQuery({
    queryKey: ["mkt-markup-label"],
    queryFn: async () => {
      const { data } = await adb.from("site_settings").select("value").eq("key", "marketplace_markup_percent").maybeSingle();
      const v = Number((data as { value: unknown } | null)?.value);
      if (isFinite(v)) setMarkupPct(v);
      return v;
    },
    staleTime: 60000,
  });

  const { data: listings, isLoading, refetch } = useQuery({
    queryKey: ["mkt-review-queue"],
    queryFn: async (): Promise<ReviewListing[]> => {
      const { data, error } = await adb
        .from("marketplace_listings")
        .select(REVIEW_SELECT)
        .eq("status", "pending_review")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as ReviewListing[];

      const ids = Array.from(new Set(rows.map((r) => r.seller_id).filter(Boolean)));
      if (ids.length) {
        const { data: sellers } = await adb
          .from("marketplace_sellers_public")
          .select("id, display_name")
          .in("id", ids);
        const map = new Map((sellers ?? []).map((s: { id: string; display_name: string | null }) => [s.id, s.display_name]));
        for (const r of rows) r.seller_display_name = map.get(r.seller_id) ?? null;
      }
      return rows;
    },
    staleTime: 15000,
  });

  const total = listings?.length ?? 0;
  const current = useMemo(() => (listings && listings[index]) || null, [listings, index]);

  async function afterAction() {
    setRejecting(false);
    setRejectReason("");
    await refetch();
    setIndex(0);
  }

  async function approve() {
    if (!current) return;
    setBusy(true); setError(null);
    const { error } = await adb.from("marketplace_listings").update({
      status: "live",
      reviewed_by: adminUser?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", current.id);
    setBusy(false);
    if (error) { setError(error.message); return; }
    await afterAction();
  }

  async function reject() {
    if (!current) return;
    if (!rejectReason.trim()) { setError("A rejection reason is required."); return; }
    setBusy(true); setError(null);
    const { error } = await adb.from("marketplace_listings").update({
      status: "rejected",
      rejection_reason: rejectReason.trim(),
      reviewed_by: adminUser?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", current.id);
    setBusy(false);
    if (error) { setError(error.message); return; }
    await afterAction();
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading font-black text-2xl tracking-tight text-foreground">Review queue</h1>
          <p className="text-sm text-text-med mt-1">Approve before it goes public, or reject with a reason.</p>
        </div>
        {total > 0 && (
          <span className="font-heading font-extrabold text-xs px-3 py-1.5 rounded-lg" style={{ background: "#FDE8DF", color: "#D4613C" }}>
            {index + 1} of {total}
          </span>
        )}
      </div>

      {!current ? (
        <div className="mt-6 rounded-2xl border p-12 text-center" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
          <div className="font-heading font-black text-lg text-foreground">The queue is clear</div>
          <p className="mt-2 text-sm text-text-med">No listings are waiting for review right now.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
          {/* photo + gallery */}
          <div>
            <div className="rounded-2xl overflow-hidden border aspect-square bg-white flex items-center justify-center" style={{ borderColor: "#F0DDD2" }}>
              {current.image_url
                ? <img src={current.image_url} alt={current.title} className="w-full h-full object-cover" />
                : <span className="text-xs text-text-light">No photo</span>}
            </div>
            {(current.gallery_urls ?? []).length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {(current.gallery_urls ?? []).slice(0, 8).map((u) => (
                  <div key={u} className="rounded-lg overflow-hidden border aspect-square" style={{ borderColor: "#F0DDD2" }}>
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* details + actions */}
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
              <h2 className="font-heading font-extrabold text-lg tracking-tight text-foreground">{current.title}</h2>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {current.category?.name && <span className="text-[11px] font-heading font-bold px-2 py-1 rounded-md" style={{ background: "#EDE6E1", color: "#6B5B54" }}>{current.category.name}</span>}
                <span className="text-[11px] font-heading font-bold px-2 py-1 rounded-md" style={{ background: "#EDE6E1", color: "#6B5B54" }}>
                  {current.location_city || current.location_state || "Location not set"}
                </span>
                <span className="text-[11px] font-heading font-bold px-2 py-1 rounded-md" style={{ background: "#D8EFE5", color: "#1A4A33" }}>
                  {current.seller_display_name || "BundledMum seller"}
                </span>
              </div>
              <div className="flex gap-7 mt-4">
                <div>
                  <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Seller asking</div>
                  <div className="font-heading font-black text-xl tabular-nums">{formatNaira(current.price_naira)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Buyer sees, with {markupPct != null ? `${markupPct}%` : "..."} markup</div>
                  <div className="font-heading font-black text-xl tabular-nums" style={{ color: "#1A4A33" }}>{formatNaira(current.final_price_naira)}</div>
                </div>
              </div>
            </div>

            {hasContactLeak(current.description, current.condition_notes) && (
              <div className="rounded-xl p-3 flex gap-2.5 items-start" style={{ background: "#FDE8DF", color: "#D4613C" }}>
                <span className="flex-none w-4 h-4 rounded-full flex items-center justify-center font-heading font-black text-[11px]" style={{ background: "#D4613C", color: "#FFF8F4" }}>!</span>
                <span className="text-[12.5px] leading-snug">Possible contact detail in the description, a phone number pattern was found. Check before approving, sellers may not route buyers off platform.</span>
              </div>
            )}

            {current.condition_notes && (
              <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
                <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Condition notes</div>
                <p className="text-sm mt-1.5 whitespace-pre-line text-foreground">{current.condition_notes}</p>
              </div>
            )}

            <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: "#F0DDD2" }}>
              <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Description</div>
              <p className="text-sm mt-1.5 whitespace-pre-line text-foreground">{current.description}</p>
            </div>

            {error && <div className="text-xs" style={{ color: "#D4613C" }}>{error}</div>}

            {rejecting ? (
              <div className="rounded-2xl border p-4 bg-white flex flex-col gap-3" style={{ borderColor: "#D4613C" }}>
                <div className="font-heading font-extrabold text-sm">Reject this listing</div>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection, shared with the seller. Required."
                  className="w-full rounded-xl border p-3 text-sm min-h-[80px] resize-y"
                  style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}
                />
                <div className="flex gap-2">
                  <button onClick={() => { setRejecting(false); setRejectReason(""); setError(null); }} disabled={busy}
                    className="flex-1 font-heading font-extrabold text-sm rounded-xl py-3 border" style={{ borderColor: "#F0DDD2", background: "#fff" }}>
                    Cancel
                  </button>
                  <button onClick={reject} disabled={busy}
                    className="flex-1 font-heading font-extrabold text-sm rounded-xl py-3 text-white" style={{ background: "#D4613C" }}>
                    {busy ? "Rejecting..." : "Confirm rejection"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button onClick={() => { setRejecting(true); setError(null); }} disabled={busy}
                  className="order-2 sm:order-1 sm:flex-1 font-heading font-extrabold text-sm rounded-xl py-3.5 border" style={{ borderColor: "#2D6A4F", color: "#2D6A4F", background: "transparent" }}>
                  Reject with reason
                </button>
                <button onClick={approve} disabled={busy}
                  className="order-1 sm:order-2 sm:flex-[1.4] font-heading font-extrabold text-sm rounded-xl py-3.5" style={{ background: "#F4845F", color: "#1A1A1A" }}>
                  {busy ? "Working..." : "Approve and publish"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
