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

export interface ListingVideo {
  youtube_video_id: string;
  status: string;
}

/**
 * The listing's video, and ONLY once YouTube actually has it. The RPC
 * filters on `youtube_status = 'ready'` server side, so a buyer cannot see
 * anything at all while a video is still transcoding, whatever this client
 * does.
 */
export function useListingVideo(listingId: string | undefined) {
  return useQuery({
    queryKey: ["mkt-listing-video", listingId],
    enabled: !!listingId,
    staleTime: 60_000,
    queryFn: async (): Promise<ListingVideo | null> => {
      const { data, error } = await mdb.rpc("listing_video", { p_listing_id: listingId });
      if (error) return null;
      const row = (Array.isArray(data) ? data[0] : data) as ListingVideo | undefined;
      return row?.youtube_video_id ? row : null;
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
