import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira } from "./opsData";
import { OpsHeader, OpsEmpty, StatusPill, ConfirmDialog } from "./opsUi";
import type { PillTone } from "./opsData";

interface ListingRow {
  id: string;
  title: string;
  status: string;
  final_price_naira: number;
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
  const [tab, setTab] = useState<string>("all");
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [delistTarget, setDelistTarget] = useState<ListingRow | null>(null);
  const [relistTarget, setRelistTarget] = useState<ListingRow | null>(null);
  const [splitTarget, setSplitTarget] = useState<ListingRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitSuccess, setSplitSuccess] = useState<string | null>(null);

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
        .select("id, title, status, final_price_naira, location_state, location_city, seller_id, quantity, quantity_sold, delisted_by, image_url, gallery_urls, category:marketplace_categories!marketplace_listings_category_id_fkey(name)")
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
                {filtered.map((l) => (
                  <tr key={l.id} className="border-t" style={{ borderColor: "#F0DDD2" }}>
                    <Td><span className="font-heading font-bold text-foreground">{l.title}</span></Td>
                    <Td>{l.seller_name || "Seller"}</Td>
                    <Td>{l.category?.name || "-"}</Td>
                    <Td><span className="tabular-nums">{Number(l.quantity_sold ?? 0)}/{Number(l.quantity ?? 1)}</span></Td>
                    <Td><span className="tabular-nums font-heading font-bold">{formatNaira(l.final_price_naira)}</span></Td>
                    <Td><StatusPill tone={STATUS_TONE[l.status] || "neutral"} label={STATUS_LABEL[l.status] || l.status} /></Td>
                    <Td>{l.status === "delisted" ? (l.delisted_by === "admin" ? "BundledMum" : l.delisted_by === "seller" ? "Seller" : "-") : "-"}</Td>
                    <Td>
                      {l.status === "splitting" ? (
                        <button onClick={() => navigate(`/admin/marketplace/listings/${l.id}/split-review`)} className="font-heading font-extrabold text-xs" style={{ color: "#D4613C" }}>Resume review</button>
                      ) : l.status === "draft" ? (
                        <span className="text-xs text-text-med">Part of a split, still under review</span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button onClick={() => navigate(`/admin/marketplace/listings/${l.id}/edit`)} className="font-heading font-extrabold text-xs" style={{ color: "#2D6A4F" }}>Edit</button>
                          {l.status === "live" && <button onClick={() => { setError(null); setDelistTarget(l); }} className="font-heading font-extrabold text-xs" style={{ color: "#C0392B" }}>Delist</button>}
                          {l.status === "delisted" && <button onClick={() => { setError(null); setRelistTarget(l); }} className="font-heading font-extrabold text-xs" style={{ color: "#2D6A4F" }}>Relist</button>}
                          {l.status === "live" && photoCount(l) > 1 && <button onClick={() => { setError(null); setSplitTarget(l); }} className="font-heading font-extrabold text-xs" style={{ color: "#6B5B54" }}>Split</button>}
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
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
