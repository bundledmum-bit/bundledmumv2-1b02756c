import { useEffect, useMemo, useState } from "react";
import { writeRows } from "@/lib/tableWrite";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb, formatNaira } from "./opsData";
import { OpsHeader, OpsCard, StatusPill, ConfirmDialog } from "./opsUi";

/**
 * Admin listing edit (design 13a E1-E4). A correction tool so a fixable listing
 * gets fixed instead of rejected. Admin writes go straight to marketplace_listings
 * under the existing "Admin manage listings" RLS. final_price_naira and
 * markup_percent are trigger owned and NEVER written here, only previewed. Relist
 * is its own action (admin_relist_listing), not a status write. The edit history
 * is trigger written; this only reads it.
 */

const COND_OPTS: Array<{ value: string; label: string }> = [
  { value: "", label: "Not set" },
  { value: "almost_new", label: "Almost new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
];
const STATUS_OPTS = ["pending_review", "live", "sold", "rejected", "delisted"] as const;
const STATUS_LABEL: Record<string, string> = { pending_review: "Pending review", live: "Live", sold: "Sold", rejected: "Rejected", delisted: "Delisted" };
// Statuses whose change fires the seller-notification email.
const EMAILING = new Set(["rejected", "live", "delisted"]);

interface Listing {
  id: string; title: string; description: string; condition_notes: string | null; condition: string | null;
  category_id: string; location_state: string | null; location_city: string | null; price_naira: number;
  final_price_naira: number; quantity: number; quantity_sold: number; status: string; rejection_reason: string | null;
  image_url: string | null; gallery_urls: string[] | null; seller_id: string; delisted_by: string | null;
  split_from_listing_id: string | null;
}

export default function MarketplaceListingEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const listingQ = useQuery({
    queryKey: ["admin-listing", id],
    enabled: !!id,
    queryFn: async (): Promise<Listing | null> => {
      const { data } = await adb.from("marketplace_listings")
        .select("id, title, description, condition_notes, condition, category_id, location_state, location_city, price_naira, final_price_naira, quantity, quantity_sold, status, rejection_reason, image_url, gallery_urls, seller_id, delisted_by, split_from_listing_id")
        .eq("id", id as string).maybeSingle();
      return (data ?? null) as Listing | null;
    },
  });

  const { data: markupPct = 10 } = useQuery({
    queryKey: ["admin-markup"],
    queryFn: async () => { const { data } = await adb.from("site_settings").select("value").eq("key", "marketplace_markup_percent").maybeSingle(); const v = Number((data as { value: unknown } | null)?.value); return isFinite(v) ? v : 10; },
    staleTime: 60000,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["admin-allowed-cats"],
    queryFn: async () => { const { data } = await adb.from("marketplace_categories").select("id, name").eq("is_allowed", true).order("name"); return (data ?? []) as Array<{ id: string; name: string }>; },
    staleTime: 60000,
  });
  const { data: states = [] } = useQuery({
    queryKey: ["admin-allowed-states"],
    queryFn: async () => { const { data } = await adb.from("marketplace_states").select("id, name").eq("is_allowed", true).order("sort_order"); return (data ?? []) as Array<{ id: string; name: string }>; },
    staleTime: 60000,
  });

  // Editable form state, hydrated once the listing loads.
  const [form, setForm] = useState<Listing | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [relistOpen, setRelistOpen] = useState(false);

  useEffect(() => {
    if (listingQ.data) {
      setForm(listingQ.data);
      setPhotos([listingQ.data.image_url, ...(listingQ.data.gallery_urls ?? [])].filter(Boolean) as string[]);
    }
  }, [listingQ.data]);

  const stateId = useMemo(() => states.find((s) => s.name === form?.location_state)?.id ?? "", [states, form?.location_state]);
  const { data: areas = [] } = useQuery({
    queryKey: ["admin-areas", stateId],
    enabled: !!stateId,
    queryFn: async () => { const { data } = await adb.from("marketplace_areas").select("name").eq("is_allowed", true).eq("state_id", stateId).order("name"); return ((data ?? []) as Array<{ name: string }>).map((a) => a.name); },
    staleTime: 60000,
  });

  const sellerQ = useQuery({
    queryKey: ["admin-listing-seller", form?.seller_id],
    enabled: !!form?.seller_id,
    queryFn: async () => { const { data } = await adb.from("marketplace_sellers_public").select("display_name").eq("id", form!.seller_id).maybeSingle(); return (data as { display_name: string | null } | null)?.display_name ?? null; },
  });

  // Only set when this listing was created by admin_split_listing_by_image
  // splitting a multi-photo listing into one listing per photo.
  const splitSourceQ = useQuery({
    queryKey: ["admin-listing-split-source", form?.split_from_listing_id],
    enabled: !!form?.split_from_listing_id,
    queryFn: async () => {
      const { data } = await adb.from("marketplace_listings").select("id, title").eq("id", form!.split_from_listing_id as string).maybeSingle();
      return (data ?? null) as { id: string; title: string } | null;
    },
  });

  // Non-cancelled orders attached to this listing, for the edit warning.
  const ordersQ = useQuery({
    queryKey: ["admin-listing-orders", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await adb.from("marketplace_orders").select("paystack_transaction_reference, order_status, payment_status").eq("listing_id", id as string);
      return ((data ?? []) as Array<{ paystack_transaction_reference: string | null; order_status: string; payment_status: string }>)
        .filter((o) => o.order_status !== "cancelled" && o.payment_status === "paid");
    },
  });

  const editsQ = useQuery({
    queryKey: ["admin-listing-edits", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await adb.from("marketplace_listing_edits").select("id, edited_by, field, old_value, new_value, created_at").eq("listing_id", id as string).order("created_at", { ascending: false }).limit(50);
      const rows = (data ?? []) as Array<{ id: string; edited_by: string | null; field: string; old_value: string | null; new_value: string | null; created_at: string }>;
      const ids = Array.from(new Set(rows.map((r) => r.edited_by).filter(Boolean))) as string[];
      let names = new Map<string, string>();
      if (ids.length) {
        const { data: admins } = await adb.from("admin_users").select("id, email").in("id", ids);
        names = new Map(((admins ?? []) as Array<{ id: string; email: string }>).map((a) => [a.id, a.email]));
      }
      return rows.map((r) => ({ ...r, editor: (r.edited_by && names.get(r.edited_by)) || "Admin" }));
    },
  });

  if (listingQ.isLoading || !form) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;
  if (!listingQ.data) {
    return <div className="py-16 text-center"><div className="font-heading font-black text-lg">Listing not found</div><button className="mt-4 font-heading font-extrabold text-sm" style={{ color: "#2D6A4F" }} onClick={() => navigate("/admin/marketplace/listings")}>Back to listings</button></div>;
  }

  const set = (patch: Partial<Listing>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const buyerPreview = Math.round(Number(form.price_naira || 0) * (1 + Number(markupPct) / 100));
  const paidOrders = ordersQ.data ?? [];
  const hasOrders = paidOrders.length > 0;
  const isSold = form.status === "sold";
  const statusChanged = form.status !== listingQ.data.status;
  const willEmail = statusChanged && EMAILING.has(form.status);
  const canRelist = form.status === "delisted" && (form.quantity - form.quantity_sold) > 0;

  function move(i: number, dir: -1 | 1) {
    setPhotos((p) => { const n = [...p]; const j = i + dir; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  }
  const makeMain = (i: number) => setPhotos((p) => { const n = [...p]; const [x] = n.splice(i, 1); return [x, ...n]; });
  const removePhoto = (i: number) => setPhotos((p) => p.filter((_, idx) => idx !== i));

  async function save() {
    if (!form) return;
    setError(null);
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (!form.category_id) { setError("Choose a category."); return; }
    if (!isFinite(Number(form.price_naira)) || Number(form.price_naira) <= 0) { setError("Enter a valid price."); return; }
    if (form.status === "rejected" && !(form.rejection_reason || "").trim()) { setError("A rejection reason is required, the seller is emailed your exact words."); return; }
    setBusy(true);
    const patch: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description,
      condition_notes: form.condition_notes,
      condition: form.condition || null,
      category_id: form.category_id,
      location_state: form.location_state || null,
      location_city: form.location_city || null,
      price_naira: Math.round(Number(form.price_naira)),
      quantity: Math.max(1, Math.round(Number(form.quantity))),
      status: form.status,
      rejection_reason: form.status === "rejected" ? (form.rejection_reason || "").trim() : form.rejection_reason,
      image_url: photos[0] ?? null,
      gallery_urls: photos.slice(1),
    };
    const res = await writeRows(adb.from("marketplace_listings").update(patch).eq("id", form.id).select("id"));
    setBusy(false);
    if (!res.ok) { setError(res.message ?? ""); return; }
    setSaved(true);
    listingQ.refetch(); editsQ.refetch(); ordersQ.refetch();
    setTimeout(() => setSaved(false), 2500);
  }

  async function confirmRelist() {
    if (!form) return;
    setBusy(true); setError(null);
    const { data, error: err } = await adb.rpc("admin_relist_listing", { p_listing_id: form.id });
    setBusy(false);
    if (err) { setError(err.message); return; }
    if (data !== true) { setError("This listing could not be relisted. Refresh and check its state."); return; }
    setRelistOpen(false); listingQ.refetch();
  }

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate("/admin/marketplace/listings")} className="text-sm text-text-med hover:text-forest mb-3">‹ Listings</button>
      <OpsHeader
        title={`Edit ${form.title || "listing"}`}
        subtitle={<>Seller <button className="font-heading font-bold underline" style={{ color: "#2D6A4F" }} onClick={() => navigate("/admin/marketplace/sellers")}>{sellerQ.data || "Seller"}</button></> as unknown as string}
        right={<StatusPill tone={form.status === "live" ? "good" : form.status === "rejected" ? "negative" : "neutral"} label={STATUS_LABEL[form.status] || form.status} />}
      />

      {/* Sold / attached-order warning */}
      {(isSold || hasOrders) && (
        <div className="mt-4 rounded-xl p-3.5 flex gap-2.5 items-start" style={{ background: "#FDE8DF", color: "#C0392B" }}>
          <span className="flex-none w-5 h-5 rounded-full flex items-center justify-center font-heading font-black text-xs" style={{ background: "#C0392B", color: "#fff" }}>!</span>
          <div className="text-[13px] leading-snug">
            {isSold ? "This listing has sold. " : "This listing has a paid order attached. "}
            The buyer sees this listing on their order, so editing the title, photos or notes rewrites what they were shown when they paid. Only correct genuine errors.
            {paidOrders[0]?.paystack_transaction_reference && <> Order {paidOrders[0].paystack_transaction_reference}. <button className="underline font-bold" onClick={() => navigate("/admin/marketplace/orders")}>Open orders</button></>}
          </div>
        </div>
      )}

      {form.split_from_listing_id && (
        <div className="mt-4 rounded-xl p-3.5 flex gap-2.5 items-start" style={{ background: "#EDE6E1", color: "#6B5B54" }}>
          <span className="flex-none w-5 h-5 rounded-full flex items-center justify-center font-heading font-black text-xs" style={{ background: "#6B5B54", color: "#fff" }}>i</span>
          <div className="text-[13px] leading-snug">
            This listing was created by splitting a combined listing into one per photo.
            {" "}
            <button className="underline font-bold" onClick={() => navigate(`/admin/marketplace/listings/${form.split_from_listing_id}/edit`)}>
              {splitSourceQ.data?.title ? `View source listing "${splitSourceQ.data.title}"` : "View source listing"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {/* Photos */}
        <OpsCard label={`Photos, ${photos.length}`}>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((u, i) => (
              <div key={u} className="flex-none w-24">
                <div className="rounded-lg overflow-hidden border aspect-square relative" style={{ borderColor: i === 0 ? "#2D6A4F" : "#F0DDD2", borderWidth: i === 0 ? 2 : 1 }}>
                  <img src={u} alt="" className="w-full h-full object-cover" />
                  {i === 0 && <span className="absolute top-1 left-1 text-[9px] font-heading font-extrabold px-1.5 py-0.5 rounded" style={{ background: "#2D6A4F", color: "#fff" }}>MAIN</span>}
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px]">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1 disabled:opacity-30" aria-label="Move left">‹</button>
                  {i !== 0 && <button onClick={() => makeMain(i)} className="font-heading font-bold" style={{ color: "#2D6A4F" }}>Main</button>}
                  <button onClick={() => removePhoto(i)} className="font-heading font-bold" style={{ color: "#C0392B" }}>Remove</button>
                  <button onClick={() => move(i, 1)} disabled={i === photos.length - 1} className="px-1 disabled:opacity-30" aria-label="Move right">›</button>
                </div>
              </div>
            ))}
          </div>
        </OpsCard>

        <OpsCard>
          <Field label="Title"><input className="adm-in" value={form.title} onChange={(e) => set({ title: e.target.value })} /></Field>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <Field label="Category">
              <select className="adm-in" value={form.category_id} onChange={(e) => set({ category_id: e.target.value })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Condition">
              <select className="adm-in" value={form.condition ?? ""} onChange={(e) => set({ condition: e.target.value || null })}>
                {COND_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="State">
              <select className="adm-in" value={form.location_state ?? ""} onChange={(e) => set({ location_state: e.target.value || null, location_city: "" })}>
                <option value="">Not set</option>
                {states.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Area">
              <input className="adm-in" list="admin-areas" value={form.location_city ?? ""} onChange={(e) => set({ location_city: e.target.value })} placeholder={stateId ? "Search area" : "Choose a state first"} disabled={!stateId} />
              <datalist id="admin-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
            </Field>
          </div>
          <Field label="Description" className="mt-3"><textarea className="adm-in min-h-[80px]" value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Condition notes" className="mt-3"><textarea className="adm-in min-h-[70px]" value={form.condition_notes ?? ""} onChange={(e) => set({ condition_notes: e.target.value })} /></Field>
        </OpsCard>

        {/* Price + quantity + buyer preview */}
        <OpsCard>
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <Field label="Seller asking (₦)"><input className="adm-in tabular-nums" inputMode="numeric" value={form.price_naira} onChange={(e) => set({ price_naira: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} /></Field>
            <Field label="Quantity">
              <div className="flex items-center gap-2">
                <button className="adm-step" onClick={() => set({ quantity: Math.max(1, Number(form.quantity) - 1) })}>−</button>
                <span className="font-heading font-black tabular-nums w-8 text-center">{form.quantity}</span>
                <button className="adm-step" onClick={() => set({ quantity: Math.min(99, Number(form.quantity) + 1) })}>+</button>
              </div>
            </Field>
            <div>
              <div className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Buyers will see, {markupPct}% markup</div>
              <div className="font-heading font-black text-xl tabular-nums" style={{ color: "#1A4A33" }}>{formatNaira(buyerPreview)}</div>
              <div className="text-[10px] text-text-light">Updates as you type. You never set this directly.</div>
            </div>
          </div>
        </OpsCard>

        {/* Status */}
        <OpsCard>
          <Field label="Status">
            <select className="adm-in" value={form.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUS_OPTS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          {willEmail && (
            <div className="mt-2 rounded-xl p-3 flex gap-2.5 items-start" style={{ background: "#FDE8DF", color: "#C0392B" }}>
              <span className="flex-none w-4 h-4 rounded-full flex items-center justify-center font-heading font-black text-[11px]" style={{ background: "#C0392B", color: "#fff" }}>!</span>
              <span className="text-[12.5px] leading-snug">Changing status to {STATUS_LABEL[form.status]} emails the seller. {form.status === "rejected" ? "She sees your exact reason below, so keep it plain and say what to fix." : "She will be notified of this change."}</span>
            </div>
          )}
          {form.status === "rejected" && (
            <Field label="Rejection reason (emailed to the seller)" className="mt-3">
              <textarea className="adm-in min-h-[70px]" value={form.rejection_reason ?? ""} onChange={(e) => set({ rejection_reason: e.target.value })} placeholder="Plain words the seller will read, and what to fix." />
            </Field>
          )}
        </OpsCard>

        {/* Relist, separate action */}
        {form.status === "delisted" && (
          <OpsCard label="Relist">
            <div className="text-[13px] text-text-med">Puts the listing back into review with its stock intact, and logs who relisted it. Separate from the status field on purpose. Stock left {form.quantity - form.quantity_sold} of {form.quantity}.</div>
            <button disabled={!canRelist} onClick={() => { setError(null); setRelistOpen(true); }} className="mt-2 font-heading font-extrabold text-sm rounded-xl py-2.5 px-4 text-white disabled:opacity-40" style={{ background: "#2D6A4F" }}>Relist this item</button>
            {!canRelist && <div className="text-[11px] text-text-light mt-1">No stock remaining to relist.</div>}
          </OpsCard>
        )}

        {error && <div className="rounded-xl p-3 text-sm" style={{ background: "#FDE8DF", color: "#C0392B" }}>{error}</div>}

        <div className="flex gap-2.5">
          <button onClick={() => navigate("/admin/marketplace/listings")} disabled={busy} className="flex-1 font-heading font-extrabold text-sm rounded-xl py-3 border" style={{ borderColor: "#F0DDD2", background: "#fff" }}>Cancel</button>
          <button onClick={save} disabled={busy} className="flex-[1.5] font-heading font-extrabold text-sm rounded-xl py-3" style={{ background: "#F4845F", color: "#1A1A1A" }}>{busy ? "Saving…" : saved ? "Saved ✓" : "Save changes"}</button>
        </div>

        {/* Edit history */}
        <OpsCard label={`Edit history, ${editsQ.data?.length ?? 0} ${(editsQ.data?.length ?? 0) === 1 ? "change" : "changes"}`}>
          {(editsQ.data?.length ?? 0) === 0 ? (
            <div className="text-[13px] text-text-light">No edits recorded yet. Every change here is logged against your name and kept forever.</div>
          ) : (
            <div className="flex flex-col divide-y" style={{ borderColor: "#F0DDD2" }}>
              {editsQ.data!.map((e) => (
                <div key={e.id} className="py-2.5">
                  <div className="text-[13px] text-foreground"><b className="font-heading">{e.field}</b> {e.old_value ? <><span className="text-text-light">“{e.old_value}”</span> → </> : ""}<span>“{e.new_value ?? ""}”</span></div>
                  <div className="text-[11px] text-text-light">{e.editor} · {new Date(e.created_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              ))}
            </div>
          )}
        </OpsCard>
      </div>

      <ConfirmDialog
        open={relistOpen}
        title="Put this back in review?"
        body="It returns to the review queue tagged back-from-delisted, with its stock intact, so the reviewer sees it has been through before."
        kv={[{ label: "Item", value: form.title }, { label: "Stock", value: `${form.quantity - form.quantity_sold} of ${form.quantity}` }]}
        confirmLabel="Relist it" busy={busy} error={error}
        onConfirm={confirmRelist} onCancel={() => !busy && setRelistOpen(false)}
      />
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med block mb-1">{label}</span>
      {children}
    </label>
  );
}
