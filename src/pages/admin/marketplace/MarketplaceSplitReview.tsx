import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import BMLoadingAnimation from "@/components/BMLoadingAnimation";
import { adb } from "./opsData";
import { OpsHeader, OpsEmpty, OpsCard, ConfirmDialog } from "./opsUi";

interface SourceListing { id: string; title: string; status: string }
interface DraftListing { id: string; title: string; description: string | null; image_url: string | null }

/**
 * Review step after splitting a listing by photo (admin_split_listing_by_image),
 * at /admin/marketplace/listings/:id/split-review, :id is the SOURCE listing
 * (held at status 'splitting' while this is in progress). Every child photo
 * becomes its own draft here (status 'draft'), invisible to buyers either way
 * (RLS only reads status='live'), because every child previously inherited the
 * combined listing's own title and description verbatim — the entire point of
 * this screen is for an operator to give each draft its own real description
 * before anything goes live, not to publish the split blind.
 *
 * The photo is deliberately fixed per draft (it is what defines the split,
 * see admin_split_listing_by_image) — only title and description are editable
 * here, via admin_update_split_draft. Publish (admin_publish_split) and
 * Cancel (admin_cancel_split) are the two ways this ever resolves; closing the
 * tab mid-review just leaves the source at 'splitting' with its drafts
 * attached, recoverable by returning to this exact URL — surfaced on
 * MarketplaceListings.tsx via a "Splitting" filter tab and a "Resume review"
 * row action, so nothing is silently stranded.
 */
export default function MarketplaceSplitReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [edits, setEdits] = useState<Record<string, { title: string; description: string }>>({});
  const hydratedRef = useRef<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<DraftListing | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const sourceQ = useQuery({
    queryKey: ["mkt-split-source", id],
    enabled: !!id,
    queryFn: async (): Promise<SourceListing | null> => {
      const { data } = await adb.from("marketplace_listings").select("id, title, status").eq("id", id as string).maybeSingle();
      return (data ?? null) as SourceListing | null;
    },
  });

  const draftsQ = useQuery({
    queryKey: ["mkt-split-drafts", id],
    enabled: !!id,
    queryFn: async (): Promise<DraftListing[]> => {
      const { data } = await adb.from("marketplace_listings")
        .select("id, title, description, image_url")
        .eq("split_from_listing_id", id as string)
        .eq("status", "draft")
        .order("created_at", { ascending: true });
      return (data ?? []) as DraftListing[];
    },
  });

  const drafts = draftsQ.data ?? [];

  // Hydrate each draft's edit state once from what actually loaded, never
  // overwriting anything the operator has since typed if the list refetches.
  useEffect(() => {
    for (const d of drafts) {
      if (hydratedRef.current.has(d.id)) continue;
      hydratedRef.current.add(d.id);
      setEdits((e) => ({ ...e, [d.id]: { title: d.title, description: d.description ?? "" } }));
    }
  }, [drafts]);

  function setField(draftId: string, patch: Partial<{ title: string; description: string }>) {
    setEdits((e) => ({ ...e, [draftId]: { ...e[draftId], ...patch } }));
    setSaveError((s) => { if (!s[draftId]) return s; const n = { ...s }; delete n[draftId]; return n; });
  }

  async function saveDraft(draftId: string) {
    const edit = edits[draftId];
    if (!edit) return;
    setSavingId(draftId);
    setSaveError((s) => { const n = { ...s }; delete n[draftId]; return n; });
    const { data, error } = await adb.rpc("admin_update_split_draft", {
      p_listing_id: draftId,
      p_title: edit.title.trim(),
      p_description: edit.description.trim(),
    });
    setSavingId(null);
    if (error) { setSaveError((s) => ({ ...s, [draftId]: error.message })); return; }
    if (data !== true) { setSaveError((s) => ({ ...s, [draftId]: "This could not be saved. Refresh and try again." })); return; }
    draftsQ.refetch();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true); setDeleteError(null);
    const { data, error } = await adb.rpc("admin_delete_split_draft", { p_listing_id: deleteTarget.id });
    setDeleteBusy(false);
    if (error) { setDeleteError(error.message); return; }
    if (data !== true) { setDeleteError("This could not be deleted. Refresh and try again."); return; }
    setDeleteTarget(null);
    draftsQ.refetch();
  }

  async function confirmPublish() {
    if (!id) return;
    setPublishBusy(true); setPublishError(null);
    const { data, error } = await adb.rpc("admin_publish_split", { p_source_listing_id: id });
    setPublishBusy(false);
    if (error) { setPublishError(error.message); return; }
    navigate("/admin/marketplace/listings", { state: { splitPublished: Number(data) || 0 } });
  }

  async function confirmCancel() {
    if (!id) return;
    setCancelBusy(true); setCancelError(null);
    const { data, error } = await adb.rpc("admin_cancel_split", { p_source_listing_id: id });
    setCancelBusy(false);
    if (error) { setCancelError(error.message); return; }
    if (data !== true) { setCancelError("This could not be cancelled. Refresh and try again."); return; }
    navigate("/admin/marketplace/review");
  }

  if (sourceQ.isLoading || draftsQ.isLoading) return <div className="flex justify-center py-20"><BMLoadingAnimation size={140} /></div>;

  const source = sourceQ.data;
  if (!source || source.status !== "splitting") {
    return (
      <div>
        <OpsHeader title="Split review" />
        <OpsEmpty
          title="Nothing to review here"
          body={!source ? "This listing no longer exists." : `This listing is now "${source.status}", its split was already published or cancelled.`}
        />
        <button className="mt-4 font-heading font-extrabold text-sm" style={{ color: "#2D6A4F" }} onClick={() => navigate("/admin/marketplace/listings")}>Back to listings</button>
      </div>
    );
  }

  return (
    <div>
      <OpsHeader
        title="Review the split"
        subtitle={`"${source.title}" is held while you review, edit or drop each photo below. Nothing here is public yet.`}
      />

      {drafts.length === 0 ? (
        <OpsEmpty title="No drafts left" body="Every photo has been deleted from this split. Cancel to restore the original listing, there is nothing left to publish." />
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {drafts.map((d) => {
            const edit = edits[d.id] ?? { title: d.title, description: d.description ?? "" };
            const dirty = edit.title !== d.title || edit.description !== (d.description ?? "");
            return (
              <OpsCard key={d.id}>
                <div className="flex gap-3">
                  <div className="flex-none w-20 h-20 rounded-xl overflow-hidden border bg-white" style={{ borderColor: "#F0DDD2" }}>
                    {d.image_url ? <img src={d.image_url} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <label className="block">
                      <span className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Title</span>
                      <input
                        className="mt-0.5 w-full rounded-lg border px-2.5 py-1.5 text-sm font-heading font-bold"
                        style={{ borderColor: "#F0DDD2" }}
                        value={edit.title}
                        onChange={(e) => setField(d.id, { title: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
                <label className="block mt-2.5">
                  <span className="text-[10px] font-heading font-extrabold uppercase tracking-wider text-text-med">Description</span>
                  <textarea
                    className="mt-0.5 w-full rounded-lg border px-2.5 py-2 text-sm min-h-[70px] resize-y"
                    style={{ borderColor: "#F0DDD2" }}
                    value={edit.description}
                    onChange={(e) => setField(d.id, { description: e.target.value })}
                    placeholder="What this specific photo actually shows, not the whole bundle."
                  />
                </label>
                {saveError[d.id] && <div className="text-xs mt-1.5" style={{ color: "#C0392B" }}>{saveError[d.id]}</div>}
                <div className="flex items-center gap-2.5 mt-2.5">
                  <button
                    onClick={() => saveDraft(d.id)}
                    disabled={!dirty || savingId === d.id}
                    className="font-heading font-extrabold text-xs rounded-lg px-3 py-2 disabled:opacity-40"
                    style={{ background: "#2D6A4F", color: "#FFF8F4" }}
                  >
                    {savingId === d.id ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => { setDeleteError(null); setDeleteTarget(d); }}
                    className="font-heading font-extrabold text-xs"
                    style={{ color: "#C0392B" }}
                  >
                    Delete this one
                  </button>
                </div>
              </OpsCard>
            );
          })}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2.5 mt-6">
        <button
          onClick={() => { setCancelError(null); setCancelOpen(true); }}
          className="sm:flex-1 font-heading font-extrabold text-sm rounded-xl py-3 border"
          style={{ borderColor: "#C0392B", color: "#C0392B", background: "#fff" }}
        >
          Cancel split, restore original
        </button>
        <button
          onClick={() => { setPublishError(null); setPublishOpen(true); }}
          disabled={drafts.length === 0}
          className="sm:flex-[1.4] font-heading font-extrabold text-sm rounded-xl py-3 disabled:opacity-40"
          style={{ background: "#F4845F", color: "#1A1A1A" }}
        >
          Publish all
        </button>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this draft?"
        body="This photo will not become its own listing. This cannot be undone, but the rest of the split is unaffected."
        kv={deleteTarget ? [{ label: "Draft", value: deleteTarget.title }] : []}
        confirmLabel="Delete it" danger busy={deleteBusy} error={deleteError}
        onConfirm={confirmDelete} onCancel={() => !deleteBusy && setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={publishOpen}
        title="Publish these listings?"
        body={`This will publish ${drafts.length} ${drafts.length === 1 ? "listing" : "listings"} live and retire the original combined listing. This goes public immediately.`}
        kv={[{ label: "Listings going live", value: String(drafts.length) }]}
        confirmLabel="Publish all" busy={publishBusy} error={publishError}
        onConfirm={confirmPublish} onCancel={() => !publishBusy && setPublishOpen(false)}
      />

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this split?"
        body="Every draft here is discarded and the original combined listing goes back to pending review, exactly as it was before you split it. Nothing is lost from the original."
        confirmLabel="Cancel the split" danger busy={cancelBusy} error={cancelError}
        onConfirm={confirmCancel} onCancel={() => !cancelBusy && setCancelOpen(false)}
      />
    </div>
  );
}
