import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { usePermissions } from "@/hooks/useAdminPermissionsContext";
import { adb, formatNaira, fetchMergeTargets, mergeSplitDraft, type MergeTarget } from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill, ConfirmDialog } from "./opsUi";
import type { PillTone } from "./opsData";

interface ListingRow {
  id: string;
  title: string;
  status: string;
  description: string | null;
  price_naira: number;
  final_price_naira: number;
  admin_discount_naira: number;
  price_before_discount_naira: number | null;
  admin_discount_at: string | null;
  location_state: string | null;
  location_city: string | null;
  seller_id: string;
  quantity: number;
  quantity_sold: number;
  delisted_by: string | null;
  image_url: string | null;
  gallery_urls: string[] | null;
  category: { name: string | null } | null;
  seller_name?: string | null;
}

const STATUSES = ["pending_review", "live", "sold", "rejected", "delisted", "splitting"] as const;
const STATUS_LABEL: Record<string, string> = { pending_review: "Pending review", live: "Live", sold: "Sold", rejected: "Rejected", delisted: "Delisted", splitting: "Splitting", draft: "Split draft" };
const STATUS_TONE: Record<string, PillTone> = { pending_review: "work", live: "good", sold: "neutral", rejected: "negative", delisted: "neutral", splitting: "work", draft: "neutral" };

/**
 * Listings management, every listing across every seller and status, not only
 * pending ones. Filter by status, seller and category. Anything live can be
 * delisted from here, behind a confirm step. The status pill is the same system
 * used on the review queue and the storefront, so the state is never in question.
 */
export default function MarketplaceListings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSuperAdmin } = usePermissions();
  const [tab, setTab] = useState<string>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [delistTarget, setDelistTarget] = useState<ListingRow | null>(null);
  const [relistTarget, setRelistTarget] = useState<ListingRow | null>(null);
  const [splitTarget, setSplitTarget] = useState<ListingRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitSuccess, setSplitSuccess] = useState<string | null>(null);

  // A draft shown here is one child of a split still awaiting review — an
  // operator who cancelled the review tab or closed it should be able to
  // finish the work from wherever the draft happens to appear, not only
  // from the split-review screen itself. Title and description edit here
  // exactly the way the review screen's own draft cards do; the photo
  // stays fixed either way.
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, { title: string; description: string }>>({});
  const [draftSaving, setDraftSaving] = useState<string | null>(null);
  const [draftSaveError, setDraftSaveError] = useState<Record<string, string>>({});
  const [mergeDraftId, setMergeDraftId] = useState<string | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState<{ draftId: string; draftTitle: string; target: MergeTarget } | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Super admin's own price cut, straight out of our markup — separate from
  // every other row action above, its own inline expandable row (same
  // pattern as the draft editor below) rather than a ConfirmDialog, since
  // it needs a live input and a live preview, not a fixed confirmation.
  const [discountEditId, setDiscountEditId] = useState<string | null>(null);
  const [discountInput, setDiscountInput] = useState<string>("");
  const [discountSaving, setDiscountSaving] = useState<string | null>(null);
  const [discountError, setDiscountError] = useState<Record<string, string>>({});

  // Landed here from the split-review screen after a publish (see
  // MarketplaceSplitReview.tsx's confirmPublish, which navigates here with
  // this exact state shape). Shown once, then cleared from history so a
  // refresh or back-navigation never re-shows a stale success banner.
  useEffect(() => {
    const published = (location.state as { splitPublished?: number } | null)?.splitPublished;
    if (typeof published === "number") {
      setSplitSuccess(`${published} ${published === 1 ? "listing went" : "listings went"} live from that split.`);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);

  const { data: listings, isLoading, refetch } = useQuery({
    queryKey: ["mkt-all-listings"],
    staleTime: 10000,
    queryFn: async (): Promise<ListingRow[]> => {
      const { data } = await adb.from("marketplace_listings")
        .select("id, title, status, description, price_naira, final_price_naira, admin_discount_naira, price_before_discount_naira, admin_discount_at, location_state, location_city, seller_id, quantity, quantity_sold, delisted_by, image_url, gallery_urls, category:marketplace_categories!marketplace_listings_category_id_fkey(name)")
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as unknown as ListingRow[];
      const ids = Array.from(new Set(rows.map((r) => r.seller_id).filter(Boolean)));
      if (ids.length) {
        const { data: sellers } = await adb.from("marketplace_sellers_public").select("id, display_name").in("id", ids);
        const map = new Map((sellers ?? []).map((s: { id: string; display_name: string | null }) => [s.id, s.display_name]));
        for (const r of rows) r.seller_name = map.get(r.seller_id) ?? null;
      }
      return rows;
    },
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of listings ?? []) c[l.status] = (c[l.status] || 0) + 1;
    return c;
  }, [listings]);

  const sellerOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of listings ?? []) if (l.seller_id) m.set(l.seller_id, l.seller_name || "Seller");
    return Array.from(m.entries());
  }, [listings]);
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of listings ?? []) if (l.category?.name) set.add(l.category.name);
    return Array.from(set);
  }, [listings]);

  const filtered = (listings ?? []).filter((l) =>
    (tab === "all" || l.status === tab) &&
    (sellerFilter === "all" || l.seller_id === sellerFilter) &&
    (categoryFilter === "all" || l.category?.name === categoryFilter));

  // p_include_source TRUE here (unlike the split-review screen): a split may
  // have been abandoned or the source relisted since, and merging a
  // stranded draft back into the original listing is a legitimate outcome
  // from this general screen, not just merging between sibling drafts.
  const mergeTargetsQ = useQuery({
    queryKey: ["mkt-listings-merge-targets", mergeDraftId],
    enabled: !!mergeDraftId,
    queryFn: () => fetchMergeTargets(mergeDraftId as string, true),
  });

  function startEditDraft(l: ListingRow) {
    setDraftEdits((e) => ({ ...e, [l.id]: { title: l.title, description: l.description ?? "" } }));
    setEditingDraftId(l.id);
    setMergeDraftId(null);
  }

  function setDraftField(id: string, patch: Partial<{ title: string; description: string }>) {
    setDraftEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
    setDraftSaveError((s) => { if (!s[id]) return s; const n = { ...s }; delete n[id]; return n; });
  }

  async function saveDraftEdit(id: string) {
    const edit = draftEdits[id];
    if (!edit) return;
    setDraftSaving(id);
    setDraftSaveError((s) => { const n = { ...s }; delete n[id]; return n; });
    const { data, error: err } = await adb.rpc("admin_update_split_draft", {
      p_listing_id: id,
      p_title: edit.title.trim(),
      p_description: edit.description.trim(),
    });
    setDraftSaving(null);
    if (err) { setDraftSaveError((s) => ({ ...s, [id]: err.message })); return; }
    if (data !== true) { setDraftSaveError((s) => ({ ...s, [id]: "This could not be saved. Refresh and try again." })); return; }
    await refetch();
  }

  async function confirmMerge() {
    if (!mergeConfirm) return;
    setMergeBusy(true); setMergeError(null);
    const res = await mergeSplitDraft(mergeConfirm.draftId, mergeConfirm.target.listing_id);
    setMergeBusy(false);
    if (!res.ok) { setMergeError(res.message); return; }
    setMergeConfirm(null);
    setMergeDraftId(null);
    setEditingDraftId(null);
    await refetch();
  }

  async function confirmDelist() {
    if (!delistTarget) return;
    setBusy(true); setError(null);
    const { error: err } = await adb.from("marketplace_listings").update({ status: "delisted" }).eq("id", delistTarget.id);
    setBusy(false);
    if (err) { setError(err.message); return; }
    setDelistTarget(null); await refetch();
  }

  // Admin relist works on any delisted listing, including admin-delisted and sold
  // items that still have stock. Server-side RPC; a false result is surfaced.
  async function confirmRelist() {
    if (!relistTarget) return;
    setBusy(true); setError(null);
    const { data, error: err } = await adb.rpc("admin_relist_listing", { p_listing_id: relistTarget.id });
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (data !== true) { setError("This listing could not be relisted. Refresh and check its state."); return; }
    setRelistTarget(null); await refetch();
  }

  function photoCount(l: ListingRow) {
    return (l.image_url ? 1 : 0) + (l.gallery_urls?.length ?? 0);
  }

  function openDiscountEditor(l: ListingRow) {
    setDiscountError((e) => { if (!e[l.id]) return e; const n = { ...e }; delete n[l.id]; return n; });
    setDiscountInput(l.admin_discount_naira > 0 ? String(l.admin_discount_naira) : "");
    setDiscountEditId(discountEditId === l.id ? null : l.id);
  }

  // Absolute discount, not a delta — passing 0 clears it and restores the
  // full price, per super_admin_set_listing_discount's own contract. The
  // "too large" error comes back from the RPC already naming the maximum,
  // so it's surfaced verbatim rather than re-worded.
  async function saveDiscount(l: ListingRow, amount: number) {
    setDiscountSaving(l.id);
    setDiscountError((e) => { const n = { ...e }; delete n[l.id]; return n; });
    const { error: err } = await adb.rpc("super_admin_set_listing_discount", { p_listing_id: l.id, p_discount_naira: amount });
    setDiscountSaving(null);
    if (err) { setDiscountError((e) => ({ ...e, [l.id]: err.message })); return; }
    setDiscountEditId(null);
    await refetch();
  }

  // Splitting no longer publishes anything, it creates drafts held for
  // review (every child previously inherited the combined title/description
  // verbatim). Navigate straight into that review rather than a "done"
  // banner here, since nothing is actually done until the operator
  // publishes or cancels on that screen.
  async function confirmSplit() {
    if (!splitTarget) return;
    setBusy(true); setError(null);
    const { error: err } = await adb.rpc("admin_split_listing_by_image", { p_listing_id: splitTarget.id });
    setBusy(false);
    if (err) { setError(err.message); return; }
    const targetId = splitTarget.id;
    setSplitTarget(null);
    navigate(`/admin/marketplace/listings/${targetId}/split-review`);
  }

  if (isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  return (
    <div>
      <OpsHeader title="Listings" subtitle="All sellers, all statuses. Delist anything live, behind a confirm step." />

      {splitSuccess && (
        <div className="mt-3 rounded-xl p-3 text-[13px] flex items-start justify-between gap-3" style={{ background: "#D8EFE5", color: "#1A4A33" }}>
          <span>{splitSuccess}</span>
          <button onClick={() => setSplitSuccess(null)} className="font-heading font-extrabold text-xs flex-none">Dismiss</button>
        </div>
      )}

      {/* status tabs */}
      <div className="mt-4 flex gap-1.5 flex-wrap">
        <Tab label="All" count={listings?.length ?? 0} on={tab === "all"} onClick={() => setTab("all")} />
        {STATUSES.map((s) => <Tab key={s} label={STATUS_LABEL[s]} count={counts[s] || 0} on={tab === s} onClick={() => setTab(s)} />)}
      </div>

      {/* filters */}
      <div className="mt-3 flex gap-2 flex-wrap">
        <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} className="rounded-lg border text-sm px-2.5 py-2" style={{ borderColor: "#F0DDD2", background: "#fff" }}>
          <option value="all">All sellers</option>
          {sellerOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border text-sm px-2.5 py-2" style={{ borderColor: "#F0DDD2", background: "#fff" }}>
          <option value="all">All categories</option>
          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <OpsEmpty title="No listings here" body="Nothing matches these filters yet." />
      ) : (
        <div className="mt-4 rounded-2xl border overflow-hidden" style={{ borderColor: "#F0DDD2" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ background: "#FFF8F4" }}>
                  <Th>Item</Th><Th>Seller</Th><Th>Category</Th><Th>Stock</Th><Th>Buyer price</Th><Th>Status</Th><Th>Taken down by</Th><Th> </Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const draftEdit = draftEdits[l.id];
                  const draftDirty = !!draftEdit && (draftEdit.title !== l.title || draftEdit.description !== (l.description ?? ""));
                  return (
                    <Fragment key={l.id}>
                      <tr className="border-t" style={{ borderColor: "#F0DDD2" }}>
                        <Td><span className="font-heading font-bold text-foreground">{l.title}</span></Td>
                        <Td>{l.seller_name || "Seller"}</Td>
                        <Td>{l.category?.name || "-"}</Td>
                        <Td><span className="tabular-nums">{Number(l.quantity_sold ?? 0)}/{Number(l.quantity ?? 1)}</span></Td>
                        <Td>
                          <span className="tabular-nums font-heading font-bold">{formatNaira(l.final_price_naira)}</span>
                          {l.admin_discount_naira > 0 && l.price_before_discount_naira != null && (
                            <span className="tabular-nums" style={{ marginLeft: 6, fontSize: 11, color: "#8A7A72", textDecoration: "line-through" }}>{formatNaira(l.price_before_discount_naira)}</span>
                          )}
                        </Td>
                        <Td><StatusPill tone={STATUS_TONE[l.status] || "neutral"} label={STATUS_LABEL[l.status] || l.status} /></Td>
                        <Td>{l.status === "delisted" ? (l.delisted_by === "admin" ? "BundledMum" : l.delisted_by === "seller" ? "Seller" : "-") : "-"}</Td>
                        <Td>
                          {l.status === "splitting" ? (
                            <button onClick={() => navigate(`/admin/marketplace/listings/${l.id}/split-review`)} className="font-heading font-extrabold text-xs" style={{ color: "#D4613C" }}>Resume review</button>
                          ) : l.status === "draft" ? (
                            <button onClick={() => (editingDraftId === l.id ? setEditingDraftId(null) : startEditDraft(l))} className="font-heading font-extrabold text-xs" style={{ color: "#2D6A4F" }}>
                              {editingDraftId === l.id ? "Close" : "Edit draft"}
                            </button>
                          ) : (
                            <div className="flex items-center gap-3">
                              <button onClick={() => navigate(`/admin/marketplace/listings/${l.id}/edit`)} className="font-heading font-extrabold text-xs" style={{ color: "#2D6A4F" }}>Edit</button>
                              {l.status === "live" && <button onClick={() => { setError(null); setDelistTarget(l); }} className="font-heading font-extrabold text-xs" style={{ color: "#C0392B" }}>Delist</button>}
                              {l.status === "delisted" && <button onClick={() => { setError(null); setRelistTarget(l); }} className="font-heading font-extrabold text-xs" style={{ color: "#2D6A4F" }}>Relist</button>}
                              {l.status === "live" && photoCount(l) > 1 && <button onClick={() => { setError(null); setSplitTarget(l); }} className="font-heading font-extrabold text-xs" style={{ color: "#6B5B54" }}>Split</button>}
                              {/* Super admin only — someone without the role
                                  should never even see this control, not see
                                  it and have it fail. */}
                              {isSuperAdmin && (l.status === "live" || l.status === "sold") && (
                                <button onClick={() => openDiscountEditor(l)} className="font-heading font-extrabold text-xs" style={{ color: "#D4613C" }}>
                                  {discountEditId === l.id ? "Close" : l.admin_discount_naira > 0 ? "Edit discount" : "Discount"}
                                </button>
                              )}
                            </div>
                          )}
                        </Td>
                      </tr>

                      {/* Super admin's own price cut. What our markup on this
                          item currently is, an absolute discount amount
                          (typing 0 and saving clears it), and the resulting
                          buyer price computed live, before they confirm —
                          all client-side from data already on the row, no
                          extra round trip needed just to preview. */}
                      {isSuperAdmin && discountEditId === l.id && (() => {
                        const baseline = l.price_before_discount_naira ?? l.final_price_naira;
                        const markup = baseline - l.price_naira;
                        const parsed = Number(discountInput.replace(/[^\d]/g, "")) || 0;
                        const preview = Math.max(0, baseline - parsed);
                        return (
                          <tr className="border-t" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
                            <td colSpan={8} className="px-3 py-3.5">
                              <div className="flex flex-col gap-2.5 max-w-md">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Our markup on this item</div>
                                    <div className="font-heading font-black text-base tabular-nums text-foreground">{formatNaira(markup)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Buyer will pay</div>
                                    <div className="font-heading font-black text-base tabular-nums" style={{ color: "#D4613C" }}>{formatNaira(preview)}</div>
                                  </div>
                                </div>
                                <label className="block">
                                  <span className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Discount, in naira (0 clears it)</span>
                                  <input
                                    inputMode="numeric"
                                    className="mt-0.5 w-full rounded-lg border px-2.5 py-1.5 text-sm font-heading font-bold tabular-nums"
                                    style={{ borderColor: "#F0DDD2" }}
                                    value={discountInput}
                                    onChange={(e) => setDiscountInput(e.target.value)}
                                    placeholder="0"
                                  />
                                </label>
                                {discountError[l.id] && <div className="text-xs" style={{ color: "#C0392B" }}>{discountError[l.id]}</div>}
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <button
                                    onClick={() => saveDiscount(l, parsed)}
                                    disabled={discountSaving === l.id}
                                    className="font-heading font-extrabold text-xs rounded-lg px-3 py-2 disabled:opacity-40"
                                    style={{ background: "#F4845F", color: "#1A1A1A" }}
                                  >
                                    {discountSaving === l.id ? "Saving..." : "Save discount"}
                                  </button>
                                  {l.admin_discount_naira > 0 && (
                                    <button
                                      onClick={() => saveDiscount(l, 0)}
                                      disabled={discountSaving === l.id}
                                      className="font-heading font-extrabold text-xs disabled:opacity-40"
                                      style={{ color: "#6B5B54" }}
                                    >
                                      Clear discount
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })()}

                      {/* Editable in place, exactly like the split-review screen's own
                          draft cards — a draft may end up needing attention here, from
                          a cancelled tab or a review closed mid-way, and the photo stays
                          fixed either way, it defines the split. */}
                      {l.status === "draft" && editingDraftId === l.id && draftEdit && (
                        <tr className="border-t" style={{ borderColor: "#F0DDD2", background: "#FFF8F4" }}>
                          <td colSpan={8} className="px-3 py-3.5">
                            <div className="flex gap-3 max-w-2xl">
                              <div className="flex-none w-16 h-16 rounded-lg overflow-hidden border bg-white" style={{ borderColor: "#F0DDD2" }}>
                                {l.image_url ? <img src={l.image_url} alt="" className="w-full h-full object-cover" /> : null}
                              </div>
                              <div className="flex-1 min-w-0 flex flex-col gap-2">
                                <label className="block">
                                  <span className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Title</span>
                                  <input
                                    className="mt-0.5 w-full rounded-lg border px-2.5 py-1.5 text-sm font-heading font-bold"
                                    style={{ borderColor: "#F0DDD2" }}
                                    value={draftEdit.title}
                                    onChange={(e) => setDraftField(l.id, { title: e.target.value })}
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Description</span>
                                  <textarea
                                    className="mt-0.5 w-full rounded-lg border px-2.5 py-2 text-sm min-h-[64px] resize-y"
                                    style={{ borderColor: "#F0DDD2" }}
                                    value={draftEdit.description}
                                    onChange={(e) => setDraftField(l.id, { description: e.target.value })}
                                  />
                                </label>
                                {draftSaveError[l.id] && <div className="text-xs" style={{ color: "#C0392B" }}>{draftSaveError[l.id]}</div>}
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <button
                                    onClick={() => saveDraftEdit(l.id)}
                                    disabled={!draftDirty || draftSaving === l.id}
                                    className="font-heading font-extrabold text-xs rounded-lg px-3 py-2 disabled:opacity-40"
                                    style={{ background: "#2D6A4F", color: "#FFF8F4" }}
                                  >
                                    {draftSaving === l.id ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    onClick={() => { setMergeError(null); setMergeDraftId(mergeDraftId === l.id ? null : l.id); }}
                                    className="font-heading font-extrabold text-xs"
                                    style={{ color: "#6B5B54" }}
                                  >
                                    {mergeDraftId === l.id ? "Close merge" : "Merge into another"}
                                  </button>
                                </div>

                                {mergeDraftId === l.id && (
                                  <div className="mt-1 rounded-xl border p-2.5 bg-white" style={{ borderColor: "#F0DDD2" }}>
                                    <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med mb-2">Merge this photo into</div>
                                    {mergeTargetsQ.isLoading ? (
                                      <div className="text-xs text-text-med">Loading...</div>
                                    ) : (mergeTargetsQ.data ?? []).length === 0 ? (
                                      <div className="text-xs text-text-med">Nothing to merge into right now.</div>
                                    ) : (
                                      <div className="flex flex-col gap-1.5">
                                        {(mergeTargetsQ.data ?? []).map((t) => (
                                          <button
                                            key={t.listing_id}
                                            onClick={() => { setMergeError(null); setMergeConfirm({ draftId: l.id, draftTitle: draftEdit.title, target: t }); }}
                                            className="flex items-center gap-2.5 rounded-lg border p-2 text-left"
                                            style={{ borderColor: "#F0DDD2" }}
                                          >
                                            <div className="flex-none w-9 h-9 rounded-md overflow-hidden border bg-white" style={{ borderColor: "#F0DDD2" }}>
                                              {t.image_url ? <img src={t.image_url} alt="" className="w-full h-full object-cover" /> : null}
                                            </div>
                                            <span className="text-xs font-heading font-bold text-foreground truncate">{t.title || "Untitled"}</span>
                                            <StatusPill tone={STATUS_TONE[t.status] || "neutral"} label={STATUS_LABEL[t.status] || t.status} />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {mergeError && <div className="text-xs mt-1.5" style={{ color: "#C0392B" }}>{mergeError}</div>}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={delistTarget !== null}
        title="Delist this listing?"
        body="It comes off the marketplace straight away. The seller can fix and resubmit it. This does not affect any order already placed."
        kv={delistTarget ? [{ label: "Item", value: delistTarget.title }, { label: "Seller", value: delistTarget.seller_name || "Seller" }] : []}
        confirmLabel="Delist now" danger busy={busy} error={error}
        onConfirm={confirmDelist} onCancel={() => !busy && setDelistTarget(null)}
      />

      <ConfirmDialog
        open={relistTarget !== null}
        title="Relist this listing?"
        body="It re-enters the review queue with a back-from-delisted tag, then returns to browse once approved. Admin relist works whether the seller or BundledMum took it down."
        kv={relistTarget ? [
          { label: "Item", value: relistTarget.title },
          { label: "Seller", value: relistTarget.seller_name || "Seller" },
          { label: "Taken down by", value: relistTarget.delisted_by === "admin" ? "BundledMum" : relistTarget.delisted_by === "seller" ? "Seller" : "-" },
        ] : []}
        confirmLabel="Relist" busy={busy} error={error}
        onConfirm={confirmRelist} onCancel={() => !busy && setRelistTarget(null)}
      />

      <ConfirmDialog
        open={splitTarget !== null}
        title="Split into separate listings?"
        body={splitTarget ? `This will create ${photoCount(splitTarget)} draft listings, one per photo, for you to review, edit and publish, or cancel. Nothing goes live yet, and the original stays held until you decide.` : ""}
        kv={splitTarget ? [{ label: "Item", value: splitTarget.title }, { label: "Photos", value: String(photoCount(splitTarget)) }] : []}
        confirmLabel="Split now" busy={busy} error={error}
        onConfirm={confirmSplit} onCancel={() => !busy && setSplitTarget(null)}
      />

      <ConfirmDialog
        open={mergeConfirm !== null}
        title="Merge these photos?"
        body="This photo joins the other listing's gallery, right after its main photo. This draft is then deleted, it cannot be undone."
        kv={mergeConfirm ? [{ label: "Merging", value: mergeConfirm.draftTitle || "Untitled draft" }, { label: "Into", value: mergeConfirm.target.title || "Untitled" }] : []}
        confirmLabel="Merge now" danger busy={mergeBusy} error={mergeError}
        onConfirm={confirmMerge} onCancel={() => !mergeBusy && setMergeConfirm(null)}
      />
    </div>
  );
}

function Tab({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="font-heading font-extrabold text-xs px-3 py-1.5 rounded-lg" style={on ? { background: "#2D6A4F", color: "#FFF8F4" } : { background: "#EDE6E1", color: "#6B5B54" }}>
      {label} {count > 0 && <span style={{ opacity: 0.8 }}>{count}</span>}
    </button>
  );
}
const Th = ({ children }: { children: React.ReactNode }) => <th className="px-3 py-2.5 text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med whitespace-nowrap">{children}</th>;
const Td = ({ children }: { children: React.ReactNode }) => <td className="px-3 py-2.5 align-middle whitespace-nowrap text-foreground">{children}</td>;
