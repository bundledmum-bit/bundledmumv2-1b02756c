import { useQuery } from "@tanstack/react-query";
import { mdb } from "./data/mdb";
import { sdb } from "./sell/sellData";
import { uploadWithProgress } from "./lib/uploadWithProgress";

/**
 * ONE video per listing, hosted on YouTube.
 *
 * This replaces the client-side compression pipeline that killed the first
 * attempt (handoff 87 to 92): iPhones cannot compress in the browser at all,
 * since WebKit has never implemented captureStream(). YouTube removes both
 * problems at once, because the seller uploads the raw file, YouTube
 * transcodes it, and it streams from YouTube rather than our bandwidth.
 *
 * NOTHING HERE READS THE FILE. No compression, no duration, no <video>
 * element for inspection, no canvas. `file.size` against the cap is the
 * only thing looked at, because reading a video hangs indefinitely on
 * iPhone and that is precisely what broke this before.
 */

export const LISTING_VIDEO_STAGING_BUCKET = "listing-video-staging";

/** Fallback only. The real value is read live from site_settings by
 * useListingVideoMaxMb, matching the request path, so it can change
 * without a rebuild. */
export const LISTING_VIDEO_MAX_MB = 200;

/** Live from site_settings' marketplace_listing_video_max_mb. */
export function useListingVideoMaxMb(): number {
  const { data } = useQuery({
    queryKey: ["mkt-listing-video-max-mb"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number> => {
      const { data } = await mdb.from("site_settings").select("value")
        .eq("key", "marketplace_listing_video_max_mb").maybeSingle();
      const n = Number((data as { value?: unknown } | null)?.value);
      return isFinite(n) && n > 0 ? n : LISTING_VIDEO_MAX_MB;
    },
  });
  return data ?? LISTING_VIDEO_MAX_MB;
}

/** The general guidance, live from site_settings. Shown boldly wherever a
 * seller adds a video. */
export function useListingVideoGuidance(): string {
  const { data } = useQuery({
    queryKey: ["mkt-listing-video-guidance"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string> => {
      const { data } = await mdb.from("site_settings").select("value")
        .eq("key", "marketplace_listing_video_guidance").maybeSingle();
      const v = (data as { value?: unknown } | null)?.value;
      return typeof v === "string" && v.trim() ? v : "About 15 seconds is plenty. A longer video is fine, it just takes longer to send.";
    },
  });
  return data ?? "";
}

/**
 * Every listing this seller can still add a video to, live ones included.
 * Required categories first, then most viewed.
 */
export interface ListingWithoutVideo {
  listing_id: string;
  title: string | null;
  image_url: string | null;
  status: string;
  view_count: number | null;
  video_required: boolean;
  video_guidance: string | null;
}

export function useMyListingsWithoutVideo(enabled: boolean) {
  return useQuery({
    queryKey: ["mkt-my-listings-without-video"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ListingWithoutVideo[]> => {
      const { data, error } = await mdb.rpc("my_listings_without_video");
      if (error) return [];
      return (data ?? []) as ListingWithoutVideo[];
    },
  });
}

/**
 * Attaches a staged video to a listing that is LIVE, without delisting it.
 *
 * Safe precisely because a video is ADDITIVE: it changes no price, no title
 * and nothing a buyer already decided on. Delisting exists so terms cannot
 * change underneath a buyer, and that reason does not apply here. The RPC's
 * own UPDATE touches youtube_status, staged_video_path and the review flags
 * and does NOT include `status` in its SET list, so the listing keeps
 * selling throughout.
 */
export async function addVideoToLiveListing(input: {
  listingId: string; storagePath: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await sdb.rpc("seller_add_video_to_live_listing", {
    p_listing_id: input.listingId, p_storage_path: input.storagePath,
  });
  if (error) return { ok: false, message: error.message || "That could not be saved. Please try again." };
  return { ok: true };
}

/** Uploads to staging, then attaches without delisting. Nothing is read
 * from the file beyond the name for its extension. */
export async function uploadVideoForLiveListing(input: {
  listingId: string; sellerAuthUid: string; file: File; onProgress: (pct: number) => void;
}): Promise<{ ok: boolean; message?: string }> {
  const ext = (input.file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `${input.sellerAuthUid}/live-${input.listingId}-${Date.now()}.${ext}`;
  try {
    await uploadWithProgress(sdb, LISTING_VIDEO_STAGING_BUCKET, path, input.file, input.onProgress);
  } catch {
    return { ok: false, message: "The upload did not finish. Check your connection and try again." };
  }
  return addVideoToLiveListing({ listingId: input.listingId, storagePath: path });
}

export interface CategoryVideoRule {
  video_required: boolean;
  video_guidance: string | null;
  /** The whole sentence a blocked seller reads, written per category and
   * used VERBATIM. Never assembled from category_name: a category name is a
   * label, not a noun that fits a sentence, and building one produced
   * "strollers and prams still works" across all fifteen. */
  video_block_reason: string | null;
  category_name: string | null;
}

/**
 * Whether this category needs a video, and what to film for THIS item.
 *
 * Generic advice produces generic videos, so a seller listing a pram reads
 * "Fold it down and open it again, spin each wheel, and press the brake on
 * and off" rather than anything about videos in general. Every one of the
 * 50 categories has its own guidance; only the requirement varies.
 */
export function useCategoryVideoRule(categoryId: string | undefined) {
  return useQuery({
    queryKey: ["mkt-category-video-rule", categoryId],
    enabled: !!categoryId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CategoryVideoRule | null> => {
      const { data, error } = await mdb.rpc("category_video_rule", { p_category_id: categoryId });
      if (error) return null;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as CategoryVideoRule) ?? null;
    },
  });
}

/**
 * A short-lived link to a staged video, for the gap before YouTube has it.
 *
 * YouTube caps the channel at roughly 12 uploads a day and sellers are
 * uploading faster, so a video can wait a day or more. A buyer looking at
 * that listing today saw nothing, which is exactly the doubt the whole
 * feature exists to remove.
 *
 * Same convention as getRequestVideoSignedUrl: the bucket is private, and a
 * fresh link is minted only when the video is actually about to play, never
 * cached or stored. Reading it is allowed by the "Buyers read staged video
 * for a live listing" policy, which covers anon as well as authenticated.
 */
export async function getStopgapVideoSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await mdb.storage
    .from(LISTING_VIDEO_STAGING_BUCKET)
    .createSignedUrl(path, 600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export interface ListingVideo {
  /** Set only when status is 'ready'. */
  youtube_video_id: string | null;
  status: "ready" | "stopgap";
  /** Set only when status is 'stopgap': a path in listing-video-staging. */
  stopgap_path: string | null;
}

/**
 * The listing's video, and ONLY once YouTube actually has it. The RPC
 * filters on `youtube_status = 'ready'` server side, so a buyer cannot see
 * anything at all while a video is still transcoding, whatever this client
 * does.
 */
/**
 * The four states of a listing's video, for the SELLER who owns it.
 *
 * `listing_video` deliberately returns nothing until YouTube actually has
 * the file, which is right for buyers and wrong for the owner: it makes a
 * QUEUED video indistinguishable from no video at all. So after a reload
 * the seller saw "Record or upload a video" again and concluded theirs had
 * failed, which is how duplicate uploads happen on mobile data.
 *
 * Queueing is now a normal outcome, not an error: YouTube caps how many
 * videos a channel may upload in a rolling 24 hours, so the worker paces
 * itself against marketplace_youtube_daily_cap and puts anything refused
 * for that reason back to 'pending' to retry by itself.
 *
 * Reads `youtube_status` straight off the listing, which the "Seller reads
 * own listings" policy already allows, so no new RPC is needed. Returns
 * null for a listing with no video at all.
 */
export type ListingVideoState = "pending" | "ready" | "failed" | null;

export function useMyListingVideoState(listingId: string | undefined) {
  return useQuery({
    queryKey: ["mkt-my-listing-video-state", listingId],
    enabled: !!listingId,
    // Short, because a queued video becomes ready without the seller doing
    // anything, and the screen should catch up on its own.
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ListingVideoState> => {
      const { data, error } = await sdb
        .from("marketplace_listings")
        .select("youtube_status, youtube_video_id, staged_video_path")
        .eq("id", listingId)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as { youtube_status: string | null; youtube_video_id: string | null; staged_video_path: string | null };
      if (row.youtube_status === "ready" && row.youtube_video_id) return "ready";
      if (row.youtube_status === "failed") return "failed";
      // 'pending', 'uploading', or a staged file the worker has not picked
      // up yet: all of them mean the seller's job is done and ours is not.
      if (row.youtube_status || row.staged_video_path) return "pending";
      return null;
    },
  });
}

/** Said the same way everywhere: from the seller's side the job is
 * finished, so this is worded as DONE rather than as a delay. */
export const VIDEO_QUEUED_LINE = "Done, your video will be added shortly.";

export function useListingVideo(listingId: string | undefined) {
  return useQuery({
    queryKey: ["mkt-listing-video", listingId],
    enabled: !!listingId,
    // Short, and revalidated on every mount, because a stopgap must not
    // outlive the YouTube copy: once the worker gets through the queue this
    // RPC starts returning 'ready', and serving the raw file after that
    // costs our bandwidth for a video YouTube is already hosting. The
    // marketplace QueryClient has no persister, so a reload always refetches
    // anyway; this covers navigating back to a listing within one session.
    staleTime: 30_000,
    refetchOnMount: "always",
    queryFn: async (): Promise<ListingVideo | null> => {
      const { data, error } = await mdb.rpc("listing_video", { p_listing_id: listingId });
      if (error) return null;
      const row = (Array.isArray(data) ? data[0] : data) as ListingVideo | undefined;
      // Keyed on STATUS, not on youtube_video_id. A stopgap row carries no
      // YouTube id, so testing for one would have thrown every stopgap away
      // and rendered nothing, which is the bug this feature exists to fix.
      if (row?.status === "ready" && row.youtube_video_id) return row;
      if (row?.status === "stopgap" && row.stopgap_path) return row;
      return null;
    },
  });
}

/** What the seller is TOLD, not asked, at the moment they add a video.
 * Live from site_settings so the wording can change without a rebuild. */
export function useListingVideoNotice(): string {
  const { data } = useQuery({
    queryKey: ["mkt-listing-video-notice"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string> => {
      const { data } = await mdb.from("site_settings").select("value")
        .eq("key", "marketplace_listing_video_notice").maybeSingle();
      const v = (data as { value?: unknown } | null)?.value;
      return typeof v === "string" && v.trim()
        ? v
        : "Your video will show on your listing, and we may also share it on BundledMum's Instagram and YouTube to help your item sell.";
    },
  });
  return data ?? "";
}

/**
 * Upload the raw file to staging, then hand the path to the RPC. A worker
 * pushes it to YouTube as unlisted every 3 minutes and deletes the staged
 * copy.
 *
 * The file goes up EXACTLY as picked. The only thing read from it is
 * `file.size`, checked by the caller before this is reached, and
 * `file.name` for an extension. The storage policy requires the seller's
 * own auth uid as the first path segment.
 */
/** Records an already-staged path against the listing. Split out of
 * stageListingVideo so the resumable path (listingVideoUploads.ts), which
 * does its own transfer via TUS, can share the exact same RPC call and its
 * exact same success test. */
export async function attachStagedListingVideo(input: {
  listingId: string; storagePath: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await sdb.rpc("seller_stage_listing_video", {
    p_listing_id: input.listingId, p_storage_path: input.storagePath,
  });
  if (error) return { ok: false, message: error.message || "That could not be saved. Please try again." };
  return { ok: true };
}

/**
 * The same attach, when an ADMIN is listing for a seller.
 *
 * seller_stage_listing_video resolves the seller from auth.uid() and raises
 * "Not authenticated as a seller" for anyone else, so an admin listing on
 * someone's behalf cannot use it. admin_add_listing_video exists for exactly
 * this, takes the note every on-behalf action takes, and records who did it.
 *
 * Without this branch the video requirement would appear to work and then
 * fail at the last step, on the one flow built to get items listed.
 */
export async function attachStagedListingVideoAsAdmin(input: {
  listingId: string; storagePath: string; note: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await sdb.rpc("admin_add_listing_video", {
    p_listing_id: input.listingId, p_storage_path: input.storagePath, p_note: input.note,
  });
  if (error) return { ok: false, message: error.message || "That could not be saved. Please try again." };
  return { ok: true };
}

export async function stageListingVideo(input: {
  listingId: string;
  sellerAuthUid: string;
  file: File;
  onProgress: (pct: number) => void;
}): Promise<{ ok: boolean; message?: string }> {
  const ext = (input.file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `${input.sellerAuthUid}/${input.listingId}-${Date.now()}.${ext}`;
  try {
    await uploadWithProgress(sdb, LISTING_VIDEO_STAGING_BUCKET, path, input.file, input.onProgress);
  } catch {
    return { ok: false, message: "The upload did not finish. Check your connection and try again." };
  }
  const { error } = await sdb.rpc("seller_stage_listing_video", {
    p_listing_id: input.listingId, p_storage_path: path,
  });
  // The RPC raises on failure and returns a plain payload on success; it
  // has no `ok` flag. Checking for one made every successful upload report
  // "that could not be saved", which invites a second upload of the same
  // file. The absence of an error is the whole test.
  if (error) return { ok: false, message: error.message || "That could not be saved. Please try again." };
  return { ok: true };
}

/** Megabytes, for the upload progress line. Reads file.size and nothing
 * else — the same single property the cap check uses. Showing megabytes
 * alongside the percentage matters on a slow connection: the percentage can
 * sit on one number for a while, and the megabytes visibly moving is what
 * tells a seller it has not frozen. */
export function mbTotal(file: File | null): string {
  if (!file) return "0MB";
  return `${(file.size / (1024 * 1024)).toFixed(1)}MB`;
}

export function mbSent(file: File | null, pct: number): string {
  if (!file) return "0MB";
  const done = (file.size * Math.max(0, Math.min(100, pct))) / 100;
  return `${(done / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * A video a seller films BECAUSE A BUYER ASKED now goes on the listing, and
 * closes the request in the same call.
 *
 * Staging alone would leave the request open with video_path null, so the
 * outreach queue would nag the seller forever for a video they had already
 * sent. These two RPCs set fulfilled_by_listing_video and deliberately
 * leave video_path NULL, so nothing tries to serve a private file that does
 * not exist.
 *
 * The four legacy private_only videos are never routed here. They already
 * have uploaded_at set, and both RPCs refuse a request that has one, so
 * even a mistaken call could not publish one of them.
 */
export async function fulfilRequestWithListingVideo(input: {
  requestId: string;
  sellerAuthUid: string;
  file: File;
  onProgress: (pct: number) => void;
}): Promise<{ ok: boolean; message?: string }> {
  const staged = await uploadToStaging(input.sellerAuthUid, input.requestId, input.file, input.onProgress);
  if (!staged.ok) return staged;
  const { error } = await sdb.rpc("seller_fulfil_request_with_listing_video", {
    p_request_id: input.requestId, p_storage_path: staged.path,
  });
  if (error) return { ok: false, message: error.message || "That could not be saved. Please try again." };
  return { ok: true };
}

/** Shared staging upload. The storage policy requires the uploader's own
 * auth uid as the first path segment. */
export async function uploadToStaging(
  authUid: string, subjectId: string, file: File, onProgress: (pct: number) => void,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const path = `${authUid}/${subjectId}-${Date.now()}.${ext}`;
  try {
    await uploadWithProgress(sdb, LISTING_VIDEO_STAGING_BUCKET, path, file, onProgress);
  } catch {
    return { ok: false, message: "The upload did not finish. Check your connection and try again." };
  }
  return { ok: true, path };
}
